import express from 'express';
import { getConversationLimit } from '../utils/conversation_limiter.js';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const LANGUAGE_CONFIG = {
  en: { tts_lang: 'en-US', suffix: 'Always respond in English.' },
  ms: { tts_lang: 'ms-MY', suffix: 'Sentiasa balas dalam Bahasa Malaysia yang mudah dan jelas.' },
  bm: { tts_lang: 'ms-MY', suffix: 'Sentiasa balas dalam Bahasa Malaysia yang mudah dan jelas.' },
  zh: { tts_lang: 'zh-CN', suffix: '始终用简体中文回答。使用清晰、简单的语言。' },
  ta: { tts_lang: 'ta-IN', suffix: 'எப்போதும் தமிழில் பதில் சொல்லுங்கள்.' },
};
function getLangConfig(lang) { return LANGUAGE_CONFIG[lang] || LANGUAGE_CONFIG.en; }

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ── HARDCODED PEDAGOGY RULES ── applied to every system prompt, always ──────
// These never change regardless of topic, subject, or phase.
const PEDAGOGY_RULES = `
TEACHING STYLE - THESE RULES ARE ABSOLUTE AND CANNOT BE OVERRIDDEN:
- Maximum 2-3 short sentences per reply. Never more. Never.
- Always end with exactly ONE question to the student. One question only.
- NEVER lecture or dump information. Guide through questions and discovery.
- NEVER use bullet points, numbered lists, headers, bold text, or markdown.
- NEVER use emojis or special symbols of any kind.
- Plain conversational sentences only - write exactly as a tutor speaks out loud.
- If a student is confused, ask a simpler question, do not re-explain everything.
- Celebrate correct answers warmly in one sentence, then move on with a question.
- Check understanding frequently - do not proceed until student confirms they get it.
- Be warm, encouraging, and patient like a favourite teacher sitting next to the student.
`.trim();

// â”€â”€â”€ DB helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getLesson(subject, topic) {
  const { data } = await supabase
    .from('lessons').select('*')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

async function getPracticeQuestions(subject, topic, limit) {
  if (!limit) limit = 3;
  const { data } = await supabase
    .from('quiz_questions')
    .select('id, question, options, correct_answer, explanation, quizzes!inner(subject, topic)')
    .eq('quizzes.subject', subject)
    .ilike('quizzes.topic', '%' + topic + '%')
    .not('correct_answer', 'is', null)
    .limit(limit);
  return data || [];
}

async function getAllTopicsForSubject(subject) {
  const { data } = await supabase
    .from('lessons')
    .select('id, topic, chapter_number')
    .eq('subject', subject)
    .eq('status', 'published')
    .order('chapter_number', { ascending: true });
  return data || [];
}

// Fetch learning standards for a topic
async function getLearningStandards(subject, topic) {
  // First try: full topic string as substring
  const { data: direct } = await supabase
    .from('learning_standards')
    .select('code, description, subtopic_num')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .order('code', { ascending: true });
  if (direct && direct.length > 0) return direct;

  // Fallback: DB topic is a substring of the lesson topic (reverse match)
  // e.g. lesson="Applications of Quadratic Functions", DB topic="Quadratic Functions"
  // Try each 2-word window from the topic
  const words = topic.split(/\s+/).filter(w => w.length >= 4);
  const stopWords = new Set(['with','that','this','from','into','also','some','have','been','will','which']);
  const keywords = words.filter(w => !stopWords.has(w.toLowerCase()));

  for (let i = 0; i < keywords.length - 1; i++) {
    const pair = keywords[i] + ' ' + keywords[i + 1];
    const { data: byPair } = await supabase
      .from('learning_standards')
      .select('code, description, subtopic_num')
      .eq('subject', subject)
      .ilike('topic', '%' + pair + '%')
      .order('code', { ascending: true });
    if (byPair && byPair.length > 0) return byPair;
  }

  // Last resort: single most distinctive keyword (longest word)
  const longest = keywords.sort((a, b) => b.length - a.length)[0];
  if (longest) {
    const { data: byWord } = await supabase
      .from('learning_standards')
      .select('code, description, subtopic_num')
      .eq('subject', subject)
      .ilike('topic', '%' + longest + '%')
      .order('code', { ascending: true });
    if (byWord && byWord.length > 0) return byWord;
  }

  return [];
}

// Get a single standard by segment index
function getStandardForSegment(standards, segment) {
  if (!standards || standards.length === 0) return null;
  const idx = Math.min(segment, standards.length - 1);
  return standards[idx];
}

// Detect topic switch request
async function detectTopicSwitch(message, currentTopic, subject) {
  const msgLower = message.toLowerCase();
  const switchKeywords = [
    'want to learn', 'want to study', 'can we do', 'can we learn', 'can we study',
    'today we did', 'teacher taught', 'school taught', 'we learned', 'we studied',
    'switch to', 'change to', "let's do", 'lets do', 'i need help with',
    'can you teach me', 'teach me about'
  ];
  const hasSwitchIntent = switchKeywords.some(function(kw) { return msgLower.includes(kw); });
  if (!hasSwitchIntent) return null;

  const topics = await getAllTopicsForSubject(subject);
  if (!topics.length) return null;

  let bestMatch = null;
  let bestScore = 0;
  topics.forEach(function(t) {
    const topicWords = t.topic.toLowerCase().split(' ');
    const matchCount = topicWords.filter(function(w) { return w.length > 3 && msgLower.includes(w); }).length;
    if (matchCount > bestScore) { bestScore = matchCount; bestMatch = t; }
  });

  if (bestMatch && bestScore > 0 && bestMatch.topic !== currentTopic) return bestMatch;
  return null;
}

// â”€â”€â”€ Main session handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/session', async (req, res) => {
  try {
    const {
      subject = 'Mathematics',
      topic,
      message = 'start',
      history = [],
      phase = 'intro',
      segment = 0,
      activeQuestion = null,
      language = 'en'
    } = req.body;

    const langConfig = getLangConfig(language);
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    // â”€â”€ Topic switch detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (message !== 'start' && phase !== 'quiz_answer') {
      const switchTarget = await detectTopicSwitch(message, topic, subject);
      if (switchTarget) {
        return res.json({
          reply: 'I see you want to study **' + switchTarget.topic + '**  -  great initiative! Your teacher taught this today? \n\nShall we switch to that topic now?',
          phase: phase, segment: segment, isCheckIn: false, activeQuestion: null,
          topicSwitchSuggested: true, suggestedTopic: switchTarget.topic, suggestedTopicId: switchTarget.id,
          suggestedResponses: ['Yes, switch to ' + switchTarget.topic + '!', 'No, continue current topic'],
          standardCode: null, standardDesc: null, standardsProgress: null
        });
      }
    }

    const lesson = await getLesson(subject, topic);
    const practiceQuestions = await getPracticeQuestions(subject, topic);
    const standards = await getLearningStandards(subject, topic);
    const currentStandard = getStandardForSegment(standards, segment);
    const totalStandards = standards.length;

    // Standards progress string e.g. "Standard 2.1.1 (3 of 6)"
    const standardsProgress = currentStandard
      ? 'Standard ' + currentStandard.code + ' (' + (segment + 1) + ' of ' + totalStandards + ')'
      : null;

    // â”€â”€ INTRO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (message === 'start' || phase === 'intro') {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 100,
        system: 'You are a warm, friendly SPM ' + subject + ' tutor.

' + PEDAGOGY_RULES + '

' + langConfig.suffix,
        messages: [{ role: 'user', content: 'The student just chose "' + topic + '". Greet them in ONE warm sentence, then ask ONE question: what do they already know about this topic? No lists, no overviews, no content yet.' }]
      });
      return res.json({
        reply: r.content[0].text.trim(),
        phase: 'concept', segment: 0, isCheckIn: false, activeQuestion: null,
        topicSwitchSuggested: false,
        standardCode: standards.length > 0 ? standards[0].code : null,
        standardDesc: standards.length > 0 ? standards[0].description : null,
        standardsProgress: null,
        suggestedResponses: ['Starting fresh, never heard of it!', 'I know a little bit', 'I have studied this before']
      });
    }


