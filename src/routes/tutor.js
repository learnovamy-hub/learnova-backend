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

// ─── DB helpers ───────────────────────────────────────────────────────────────

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

async function getLearningStandards(subject, topic) {
  const { data: direct } = await supabase
    .from('learning_standards')
    .select('code, description, subtopic_num')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .order('code', { ascending: true });
  if (direct && direct.length > 0) return direct;

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

function getStandardForSegment(standards, segment) {
  if (!standards || standards.length === 0) return null;
  const idx = Math.min(segment, standards.length - 1);
  return standards[idx];
}

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

// ─── Main session handler ─────────────────────────────────────────────────────

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

    // ── Topic switch detection ────────────────────────────────────────────────
    if (message !== 'start' && phase !== 'quiz_answer') {
      const switchTarget = await detectTopicSwitch(message, topic, subject);
      if (switchTarget) {
        return res.json({
          reply: 'I see you want to study ' + switchTarget.topic + ' - great initiative! Shall we switch to that topic now?',
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

    const standardsProgress = currentStandard
      ? 'Standard ' + currentStandard.code + ' (' + (segment + 1) + ' of ' + totalStandards + ')'
      : null;

    // ── INTRO: one conversational question, no content dump ───────────────────
    if (message === 'start' || phase === 'intro') {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 100,
        system: 'You are a warm, friendly SPM ' + subject + ' tutor.\n\n' + PEDAGOGY_RULES + '\n\n' + langConfig.suffix,
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

    // ── QUIZ ANSWER ───────────────────────────────────────────────────────────
    if (phase === 'quiz_answer' && activeQuestion) {
      const q = activeQuestion;
      const studentAns = message.trim().toUpperCase().charAt(0);
      const correct = studentAns === (q.correct_answer || '').toUpperCase();
      const nextStandard = getStandardForSegment(standards, segment + 1);

      if (correct) {
        const nextMsg = nextStandard
          ? ' Next up is Standard ' + nextStandard.code + ': ' + nextStandard.description.substring(0, 60) + '...'
          : " You have covered all the standards for this topic!";
        return res.json({
          reply: 'Correct! Well done! ' + (q.explanation || 'Great work!') + nextMsg,
          phase: 'concept', segment: segment + 1, isCheckIn: false, activeQuestion: null,
          topicSwitchSuggested: false,
          standardCode: nextStandard ? nextStandard.code : null,
          standardDesc: nextStandard ? nextStandard.description : null,
          standardsProgress: nextStandard
            ? 'Standard ' + nextStandard.code + ' (' + (segment + 2) + ' of ' + totalStandards + ')'
            : 'Topic Complete!',
          suggestedResponses: ['Continue!', 'I have a question...', 'Give me another question!']
        });
      }

      return res.json({
        reply: 'Not quite - the correct answer is ' + q.correct_answer + '. ' + (q.explanation || 'Review this concept.') + ' Shall we continue?',
        phase: 'concept', segment: segment + 1, isCheckIn: false, activeQuestion: null,
        topicSwitchSuggested: false,
        standardCode: currentStandard ? currentStandard.code : null,
        standardDesc: currentStandard ? currentStandard.description : null,
        standardsProgress: standardsProgress,
        suggestedResponses: ['I understand, continue', 'Explain why please', 'Give me another question']
      });
    }

    // ── PRACTICE REQUEST ──────────────────────────────────────────────────────
    const msgLower = message.toLowerCase();
    const wantsQuestion = msgLower.includes('practice') || msgLower.includes('give me a question') ||
      msgLower.includes('quiz') || msgLower.includes('soalan') || msgLower.includes('test me') ||
      msgLower.includes('practice question');

    if (wantsQuestion) {
      if (practiceQuestions.length > 0) {
        const idx = Math.min(segment, practiceQuestions.length - 1);
        const q = practiceQuestions[idx];
        let opts = '';
        if (q.options && typeof q.options === 'object') {
          opts = Object.entries(q.options).map(function(e) { return e[0] + '. ' + e[1]; }).join('\n');
        }
        const standardTag = currentStandard ? '\n\nTesting: Standard ' + currentStandard.code : '';
        return res.json({
          reply: 'Practice Question:\n\n' + q.question + '\n\n' + opts + '\n\nType A, B, C or D - or use the workspace!' + standardTag,
          phase: 'quiz_answer', segment: segment, isCheckIn: false, activeQuestion: q,
          topicSwitchSuggested: false,
          standardCode: currentStandard ? currentStandard.code : null,
          standardDesc: currentStandard ? currentStandard.description : null,
          standardsProgress: standardsProgress,
          suggestedResponses: ['A', 'B', 'C', 'D'], openWorkspace: true
        });
      }
      return res.json({
        reply: "No practice questions yet for this topic - let us continue the lesson!",
        phase: 'concept', segment: segment, isCheckIn: false, activeQuestion: null,
        topicSwitchSuggested: false, standardCode: null, standardDesc: null, standardsProgress: standardsProgress,
        suggestedResponses: ['Continue the lesson', 'I have a question...']
      });
    }

    // ── CONCEPT ───────────────────────────────────────────────────────────────
    const standardContext = currentStandard
      ? '\nYou are teaching Standard ' + currentStandard.code + ': ' + currentStandard.description + '\nThis is standard ' + (segment + 1) + ' of ' + totalStandards + ' for this topic.'
      : '';

    const system = 'You are a warm, friendly SPM ' + subject + ' tutor guiding a student through "' + topic + '".'
      + standardContext + '\n\n'
      + PEDAGOGY_RULES + '\n\n'
      + 'CONTEXT: The student already sees a VISUAL ANIMATION on their screen. DO NOT re-explain what the animation shows. Your role is conversation guide only: ask questions, check understanding, give encouragement.\n'
      + (currentStandard ? 'Current standard: ' + currentStandard.code + ' - ' + currentStandard.description + '\n' : '')
      + langConfig.suffix;

    const userMsg = currentStandard
      ? 'The student can see the visual animation for Standard ' + currentStandard.code + ': "' + currentStandard.description + '". Student said: ' + message + '\n\nRespond conversationally in 2-3 sentences max. End with one question.'
      : 'Student said: ' + message + '\n\nRespond conversationally in 2-3 sentences max. End with one question.';

    // Sanitize history for Anthropic: must start with 'user', no consecutive same roles,
    // and remove trailing user message (current student input is sent separately as userMsg).
    let safeHistory = history.slice(-6);
    // Drop trailing user message — we send student input via userMsg below
    if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role === 'user') {
      safeHistory = safeHistory.slice(0, -1);
    }
    // Drop leading assistant messages — Anthropic requires first message to be 'user'
    while (safeHistory.length > 0 && safeHistory[0].role !== 'user') {
      safeHistory.shift();
    }
    const msgs = safeHistory.concat([{ role: 'user', content: userMsg }]);
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 280, system: system, messages: msgs
    });

    const reply = r.content[0].text
      .trim()
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const rl = reply.toLowerCase();
    const isCheckIn = rl.includes('faham') || rl.includes('make sense') ||
      rl.includes('any questions') || rl.includes('understand') ||
      rl.includes('okay?') || rl.includes('ready') || rl.includes('shall we');

    return res.json({
      reply: reply,
      phase: 'concept',
      segment: isCheckIn ? segment : segment + 1,
      isCheckIn: isCheckIn,
      activeQuestion: null,
      topicSwitchSuggested: false,
      standardCode: currentStandard ? currentStandard.code : null,
      standardDesc: currentStandard ? currentStandard.description : null,
      standardsProgress: standardsProgress,
      totalStandards: totalStandards,
      suggestedResponses: isCheckIn
        ? ['Yes, I understand! Continue', 'I have a question...', 'Explain again please', 'Give me a practice question!']
        : ['Continue please!', 'I have a question...', 'Give me a practice question!']
    });

  } catch (err) {
    console.error('Tutor error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tutor/topics ────────────────────────────────────────────────────

router.get('/topics', async (req, res) => {
  try {
    const { subject = 'Mathematics' } = req.query;
    const { data, error } = await supabase
      .from('lessons')
      .select('id, title, topic, form_level, learning_objectives')
      .eq('subject', subject)
      .eq('status', 'published')
      .order('chapter_number', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/tutor/standards ─────────────────────────────────────────────────

router.get('/standards', async (req, res) => {
  try {
    const { subject, topic, student_id } = req.query;
    let query = supabase.from('learning_standards').select('*');
    if (subject) query = query.eq('subject', subject);
    if (topic)   query = query.ilike('topic', '%' + topic + '%');
    query = query.order('code', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;

    let completed = [];
    if (student_id) {
      const { data: ws } = await supabase
        .from('workspace_submissions')
        .select('standard_code')
        .eq('student_id', student_id)
        .not('standard_code', 'is', null);
      completed = (ws || []).map(function(w) { return w.standard_code; });
    }

    const standards = (data || []).map(function(s) {
      return Object.assign({}, s, { completed: completed.includes(s.code) });
    });

    res.json({ standards: standards, total: standards.length, completed_count: completed.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
