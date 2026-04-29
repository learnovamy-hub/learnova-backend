// src/routes/welcome.js
// Hybrid AI welcome conversation
// Phase 1: Check welcome_cache → instant free response
// Phase 2: Claude generates → caches for future use

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ── Seed common patterns on first run ────────────────────────────────────────
const SEED_CACHE = [
  // Phase: greeting_response
  { phase: 'greeting_response', pattern: 'great ready', tutor_reply: "Love that energy! That's exactly what I want to hear. Let's make today count!", quick_replies: ['Let\'s go!', 'What are we doing today?'], proceed: false },
  { phase: 'greeting_response', pattern: 'good thanks', tutor_reply: "Glad to hear it! Consistency is the secret to acing SPM. Ready to keep that momentum going?", quick_replies: ['Yes, let\'s start!', 'Sure, what\'s first?'], proceed: false },
  { phase: 'greeting_response', pattern: 'tired but here', tutor_reply: "Hey, the fact that you showed up even when tired? That's real dedication. We'll take it easy to start — just one concept at a time. Deal?", quick_replies: ['Deal, let\'s try', 'Okay, just a bit'], proceed: false },
  { phase: 'greeting_response', pattern: 'not feeling', tutor_reply: "I hear you. You know what though? You opened the app — part of you wants to learn today. Let's just do 10 minutes. If you still don't feel it after that, we stop. Fair?", quick_replies: ['Okay, 10 minutes', 'Fine, you win'], proceed: false },
  { phase: 'greeting_response', pattern: 'exam tomorrow', tutor_reply: "Ooh, exam tomorrow! Okay we need to focus. Tell me the subject and let's do a quick targeted revision session right now — no time to waste!", quick_replies: ['Mathematics', 'Physics', 'Chemistry', 'Add Maths'], proceed: false },
  { phase: 'greeting_response', pattern: 'just start', tutor_reply: "Ha! I like your style — straight to business. Let's go!", quick_replies: [], proceed: true },
  { phase: 'greeting_response', pattern: 'lets go', tutor_reply: "That's the spirit! Let's do this!", quick_replies: [], proceed: true },
  { phase: 'greeting_response', pattern: 'skip', tutor_reply: "No worries, jumping right in!", quick_replies: [], proceed: true },

  // Phase: banter_response  
  { phase: 'banter_response', pattern: 'yes ready', tutor_reply: "Perfect! Your lessons are all set. Let's make this session productive!", quick_replies: [], proceed: true },
  { phase: 'banter_response', pattern: 'okay fine', tutor_reply: "That's what I like to hear! Small steps every day — that's how SPM gets conquered.", quick_replies: [], proceed: true },
  { phase: 'banter_response', pattern: 'not today', tutor_reply: "Come on, just open one lesson. Five minutes — if you still don't feel it after that, I'll let you go. Promise!", quick_replies: ['Fine, 5 minutes', 'Okay deal'], proceed: false },
  { phase: 'banter_response', pattern: 'give me minute', tutor_reply: "Of course! Take your time. Whenever you're ready, just say the word.", quick_replies: ['Ready now!', 'Okay let\'s go'], proceed: false },
  { phase: 'banter_response', pattern: 'surprise me', tutor_reply: "Ooh I love the adventurous spirit! Let's go with something challenging today — ready to push your limits?", quick_replies: ['Let\'s do it!', 'Okay!'], proceed: false },
];

async function seedCacheIfEmpty() {
  const { count } = await supabase.from('welcome_cache').select('*', { count: 'exact', head: true });
  if (count === 0) {
    await supabase.from('welcome_cache').insert(SEED_CACHE.map(s => ({
      student_input_pattern: s.pattern,
      tutor_reply: s.tutor_reply,
      quick_replies: s.quick_replies,
      phase: s.phase,
      proceed: s.proceed,
    })));
    console.log('Welcome cache seeded with', SEED_CACHE.length, 'patterns');
  }
}
seedCacheIfEmpty().catch(console.error);

// ── Match student input to cached pattern ─────────────────────────────────────
async function findCachedResponse(studentInput, phase) {
  const inputLower = studentInput.toLowerCase();
  const words = inputLower.split(/\s+/).filter(w => w.length > 2);

  const { data } = await supabase
    .from('welcome_cache')
    .select('*')
    .eq('phase', phase);

  if (!data || data.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const row of data) {
    const patternWords = row.student_input_pattern.split(/\s+/);
    const matchCount = patternWords.filter(pw => inputLower.includes(pw)).length;
    const score = matchCount / patternWords.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = row;
    }
  }

  if (bestMatch) {
    // Increment use count
    await supabase.from('welcome_cache').update({ use_count: bestMatch.use_count + 1 }).eq('id', bestMatch.id);
  }

  return bestMatch;
}

// ── Generate with Claude + cache ──────────────────────────────────────────────
async function generateAndCache(studentInput, phase, studentName, lastTopic, conversationHistory) {
  const firstName = studentName.split(' ')[0];

  const systemPrompt = `You are a warm, friendly Malaysian SPM tutor having a brief casual conversation with a student named ${firstName} before their study session. 

Your personality:
- Warm and encouraging, like a favourite teacher
- Uses light humour occasionally  
- Never gives up on a student
- Speaks naturally, not formally
- Knows SPM subjects: Mathematics, Add Maths, Physics, Chemistry, Biology, Bahasa Melayu, English, Sejarah

Current phase: ${phase}
Last topic studied: ${lastTopic || 'none yet'}

Rules:
- Keep response to 1-3 sentences MAX
- End with either a question or encouragement to start
- If student wants to skip small talk, warmly accept and proceed
- Respond in JSON only: { "reply": "...", "quick_replies": ["option1", "option2"], "proceed": false }
- "proceed": true only if conversation should end and student should go to home screen`;

  const messages = [
    ...conversationHistory.map(m => ({ role: m.role === 'tutor' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: studentInput }
  ];

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: systemPrompt,
    messages,
  });

  let result = { reply: "Let's get started!", quick_replies: ['Let\'s go!'], proceed: false };
  try {
    const text = r.content[0].text.replace(/```json|```/g, '').trim();
    result = JSON.parse(text);
  } catch (_) {}

  // Cache this new pattern
  const patternWords = studentInput.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 4).join(' ');
  if (patternWords.length > 0) {
    await supabase.from('welcome_cache').upsert({
      student_input_pattern: patternWords,
      tutor_reply: result.reply,
      quick_replies: result.quick_replies || [],
      phase,
      proceed: result.proceed || false,
    }, { onConflict: 'student_input_pattern,phase', ignoreDuplicates: false });
  }

  return result;
}

// ── POST /api/tutor/welcome ───────────────────────────────────────────────────
router.post('/respond', async (req, res) => {
  try {
    const {
      student_input,
      phase = 'greeting_response',
      student_name = 'Student',
      last_topic = '',
      conversation_history = [],
    } = req.body;

    if (!student_input) {
      return res.status(400).json({ error: 'student_input required' });
    }

    // Check for skip keywords first
    const lower = student_input.toLowerCase();
    const skipWords = ['just start', 'start now', 'lets go', "let's go", 'skip', 'begin', 'just begin'];
    if (skipWords.some(w => lower.includes(w))) {
      return res.json({
        reply: "No worries — straight to business! That's the spirit. Let's go!",
        quick_replies: [],
        proceed: true,
        source: 'hardcoded',
      });
    }

    // Phase 1: Check cache
    const cached = await findCachedResponse(student_input, phase);
    if (cached) {
      return res.json({
        reply: cached.tutor_reply,
        quick_replies: cached.quick_replies || [],
        proceed: cached.proceed,
        source: 'cache',
      });
    }

    // Phase 2: Claude generates + caches
    const generated = await generateAndCache(student_input, phase, student_name, last_topic, conversation_history);
    return res.json({
      ...generated,
      source: 'claude',
    });

  } catch (err) {
    console.error('Welcome route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tutor/welcome/stats ──────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { data } = await supabase
      .from('welcome_cache')
      .select('phase, use_count, student_input_pattern')
      .order('use_count', { ascending: false })
      .limit(20);
    res.json({ patterns: data, total: data?.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
