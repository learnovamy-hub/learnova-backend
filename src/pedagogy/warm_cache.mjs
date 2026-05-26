/**
 * warm_cache.mjs  —  Pre-generate tutor_cache entries for all seeded topics.
 *
 * Run ONCE (or after adding new topics) to fill the cache with common responses.
 * After this, ~70% of student messages will be served at zero Claude cost.
 *
 * Usage:
 *   node src/pedagogy/warm_cache.mjs                    # all subjects, English only
 *   node src/pedagogy/warm_cache.mjs --subject=Mathematics
 *   node src/pedagogy/warm_cache.mjs --language=ms
 *   node src/pedagogy/warm_cache.mjs --dry-run          # show what would be generated
 *
 * Cost estimate: ~100 tokens × 4 intents × N topics × N phases × languages
 * For 20 topics × 5 phases × 2 languages = 800 Haiku calls ≈ $0.10 total.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const SUBJECT    = (args.find(a => a.startsWith('--subject=')) || '').replace('--subject=', '') || null;
const LANGUAGE   = (args.find(a => a.startsWith('--language=')) || '').replace('--language=', '') || 'en';

// ── Config ────────────────────────────────────────────────────────────────────

const LANGUAGES = LANGUAGE === 'all' ? ['en', 'ms', 'zh'] : [LANGUAGE];

const INTENT_PROMPTS = {
  affirmative: 'The student said "Yes, I understand" or "Ok continue". Continue teaching the next concept.',
  confused:    'The student said "I am confused" or "I don\'t understand". Use a fresh angle or analogy.',
  continue:    'The student said "Continue" or "Next". Move forward to the next part of the lesson.',
  wants_example: 'The student asked "Can you give me an example?". Provide a concrete example.',
};

const LANGUAGE_CONFIG = {
  en: { tts_lang: 'en-US', suffix: 'Always respond in English.' },
  ms: { tts_lang: 'ms-MY', suffix: 'Sentiasa balas dalam Bahasa Malaysia yang mudah dan jelas.' },
  zh: { tts_lang: 'zh-CN', suffix: '始终用简体中文回答。' },
};

const PEDAGOGY_RULES = `
TEACHING STYLE:
- Maximum 2-3 short sentences per reply. Never more.
- Always end with exactly ONE question to the student.
- NEVER use bullet points, numbered lists, headers, bold text, or markdown.
- NEVER use emojis or special symbols.
- Plain conversational sentences only.
- Be warm, encouraging, and patient.
`.trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAllTopics(subject) {
  const q = supabase.from('lessons')
    .select('subject, topic')
    .eq('status', 'published');
  if (subject) q.eq('subject', subject);
  const { data } = await q;
  // Deduplicate by subject+topic
  const seen = new Set();
  return (data || []).filter(r => {
    const k = r.subject + '|' + r.topic;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function countStandards(subject, topic) {
  const { count } = await supabase
    .from('learning_standards')
    .select('*', { count: 'exact', head: true })
    .eq('subject', subject)
    .ilike('topic', '%' + topic.split(' ').filter(w => w.length > 4)[0] + '%');
  return Math.max(count || 0, 3); // at least 3 phases
}

async function loadPedagogyJson(subject, topic) {
  const { data } = await supabase
    .from('pedagogy_library')
    .select('pedagogy_json, pedagogy_type')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .maybeSingle();
  return data || null;
}

async function cacheExists(subject, topic, phase, intent, language) {
  const { data } = await supabase
    .from('tutor_cache')
    .select('id')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .eq('phase', phase)
    .eq('intent', intent)
    .eq('language', language)
    .maybeSingle();
  return !!data;
}

async function generateCacheEntry(subject, topic, phase, totalPhases, intent, language, pedagogyJson) {
  const langConfig = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.en;
  const intentPrompt = INTENT_PROMPTS[intent];

  const pj = pedagogyJson?.pedagogy_json;
  let pedagogyContext = '';
  if (pj?.teaching_phases?.[phase]) {
    const p = pj.teaching_phases[phase];
    pedagogyContext = `\nCurrent teaching phase: "${p.name}"\nCheck-in question to use: "${p.check_in}"`;
  } else if (pj?.lesson_flow?.[phase]) {
    pedagogyContext = `\nCurrent lesson flow step: "${pj.lesson_flow[phase]}"`;
  }

  const system = `You are a warm, friendly SPM ${subject} tutor teaching "${topic}".
${PEDAGOGY_RULES}${pedagogyContext}
Teaching phase ${phase + 1} of ${totalPhases}.
${langConfig.suffix}`;

  const userMsg = `${intentPrompt}\n\nPhase ${phase + 1}/${totalPhases} of "${topic}". Respond in 2-3 sentences, end with one question.`;

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  const reply = r.content[0].text.trim()
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .trim();

  const rl = reply.toLowerCase();
  const isCheckIn = rl.includes('make sense') || rl.includes('understand') ||
    rl.includes('any questions') || rl.includes('shall we') || rl.includes('okay?') ||
    rl.includes('faham') || rl.includes('ready');

  const suggestedResponses = isCheckIn
    ? ['Yes, I understand! Continue', 'I have a question...', 'Explain again please']
    : ['Continue please!', 'I have a question...', 'Still confused, explain differently'];

  return { reply, isCheckIn, suggestedResponses };
}

async function saveEntry(subject, topic, phase, intent, language, reply, suggestedResponses, isCheckIn) {
  await supabase.from('tutor_cache').upsert({
    subject,
    topic,
    phase,
    intent,
    language,
    reply,
    visual: null,
    suggested_responses: suggestedResponses,
    is_check_in: isCheckIn,
    hit_count: 0,
  }, { onConflict: 'subject,topic,phase,intent,language', ignoreDuplicates: false });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔥 Learnova Cache Warmer');
  console.log(`   Languages: ${LANGUAGES.join(', ')}`);
  console.log(`   Subject filter: ${SUBJECT || 'all'}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no API calls)' : 'LIVE'}\n`);

  const topics = await getAllTopics(SUBJECT);
  console.log(`   Found ${topics.length} topic(s) to process.\n`);

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const { subject, topic } of topics) {
    const totalPhases = await countStandards(subject, topic);
    const pedagogy = await loadPedagogyJson(subject, topic);

    for (const language of LANGUAGES) {
      for (let phase = 0; phase < Math.min(totalPhases, 8); phase++) {
        for (const intent of Object.keys(INTENT_PROMPTS)) {

          const exists = await cacheExists(subject, topic, phase, intent, language);
          if (exists) {
            totalSkipped++;
            continue;
          }

          const label = `${subject} | ${topic.substring(0, 40)} | ph${phase} | ${intent} | ${language}`;

          if (DRY_RUN) {
            console.log(`  [DRY] Would generate: ${label}`);
            totalGenerated++;
            continue;
          }

          try {
            const { reply, isCheckIn, suggestedResponses } =
              await generateCacheEntry(subject, topic, phase, totalPhases, intent, language, pedagogy);

            await saveEntry(subject, topic, phase, intent, language, reply, suggestedResponses, isCheckIn);
            console.log(`  ✓ ${label}`);
            totalGenerated++;

            // Small delay to be polite to the API
            await new Promise(r => setTimeout(r, 200));
          } catch (e) {
            console.error(`  ✗ ${label}: ${e.message}`);
            totalErrors++;
          }
        }
      }
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  Generated : ${totalGenerated}`);
  console.log(`  Skipped   : ${totalSkipped} (already cached)`);
  console.log(`  Errors    : ${totalErrors}`);
  console.log('═══════════════════════════════════════\n');

  if (!DRY_RUN && totalGenerated > 0) {
    console.log('  Cache warm-up complete! Future students will benefit from zero-cost responses.');
    console.log('  Re-run any time after adding new topics or subjects.\n');
  }
}

main().catch(console.error);
