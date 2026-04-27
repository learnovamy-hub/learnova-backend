import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

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

// Fetch learning standards for a topic
async function getLearningStandards(subject, topic) {
  const { data } = await supabase
    .from('learning_standards')
    .select('code, description, subtopic_num')
    .eq('subject', subject)
    .ilike('topic', '%' + topic + '%')
    .order('code', { ascending: true });
  return data || [];
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
      activeQuestion = null
    } = req.body;

    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    // ── Topic switch detection ────────────────────────────────────────────────
    if (message !== 'start' && phase !== 'quiz_answer') {
      const switchTarget = await detectTopicSwitch(message, topic, subject);
      if (switchTarget) {
        return res.json({
          reply: 'I see you want to study **' + switchTarget.topic + '** — great initiative! Your teacher taught this today? 👍\n\nShall we switch to that topic now?',
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

    // ── INTRO ─────────────────────────────────────────────────────────────────
    if (message === 'start' || phase === 'intro') {
      const intro = lesson
        ? (lesson.introduction || (lesson.content || '').substring(0, 600))
        : null;

      const standardsList = standards.length > 0
        ? '\n\nIn this topic you will master ' + totalStandards + ' learning standards:\n' +
          standards.slice(0, 5).map(function(s) { return '• ' + s.code + ': ' + s.description.substring(0, 60) + '...'; }).join('\n') +
          (standards.length > 5 ? '\n...and ' + (standards.length - 5) + ' more.' : '')
        : '';

      const prompt = intro
        ? 'Deliver this introduction warmly in 2-3 short paragraphs. End by asking if they are ready for the first concept. Do NOT teach concepts yet.\n\n' + intro + standardsList
        : 'Give a brief 2-paragraph introduction to ' + topic + ' in SPM ' + subject + '. Mention there are ' + totalStandards + ' learning standards to cover. End by asking if ready.';

      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 400,
        system: 'You are a warm encouraging SPM ' + subject + ' tutor. Be friendly and conversational.',
        messages: [{ role: 'user', content: prompt }]
      });

      return res.json({
        reply: r.content[0].text.trim(),
        phase: 'concept', segment: 0, isCheckIn: false, activeQuestion: null,
        topicSwitchSuggested: false,
        standardCode: standards.length > 0 ? standards[0].code : null,
        standardDesc: standards.length > 0 ? standards[0].description : null,
        standardsProgress: standards.length > 0 ? 'Standard ' + standards[0].code + ' (1 of ' + totalStandards + ')' : null,
        totalStandards: totalStandards,
        suggestedResponses: ["Yes, I'm ready! Let's start 🚀", 'Tell me more first', 'I have a question...']
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
          ? '\n\nNext up: **Standard ' + nextStandard.code + '** — ' + nextStandard.description.substring(0, 60) + '...'
          : '\n\nYou\'ve covered all the standards for this topic! 🎉';
        return res.json({
          reply: '✅ Correct! Well done!\n\n' + (q.explanation || 'Great work!') + nextMsg,
          phase: 'concept', segment: segment + 1, isCheckIn: false, activeQuestion: null,
          topicSwitchSuggested: false,
          standardCode: nextStandard ? nextStandard.code : null,
          standardDesc: nextStandard ? nextStandard.description : null,
          standardsProgress: nextStandard ? 'Standard ' + nextStandard.code + ' (' + (segment + 2) + ' of ' + totalStandards + ')' : 'Topic Complete!',
          suggestedResponses: ['Continue! 👍', 'I have a question...', 'Give me another question!']
        });
      }

      return res.json({
        reply: 'Not quite — the correct answer is **' + q.correct_answer + '**\n\n' + (q.explanation || 'Review this concept.') + '\n\nShall we continue?',
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
        const standardTag = currentStandard ? '\n\n_Testing: Standard ' + currentStandard.code + '_' : '';
        return res.json({
          reply: '📝 **Practice Question:**\n\n' + q.question + '\n\n' + opts + '\n\nType A, B, C or D — or use the workspace!' + standardTag,
          phase: 'quiz_answer', segment: segment, isCheckIn: false, activeQuestion: q,
          topicSwitchSuggested: false,
          standardCode: currentStandard ? currentStandard.code : null,
          standardDesc: currentStandard ? currentStandard.description : null,
          standardsProgress: standardsProgress,
          suggestedResponses: ['A', 'B', 'C', 'D'], openWorkspace: true
        });
      }
      return res.json({
        reply: "No practice questions yet for this topic — let's continue the lesson!",
        phase: 'concept', segment: segment, isCheckIn: false, activeQuestion: null,
        topicSwitchSuggested: false, standardCode: null, standardDesc: null, standardsProgress: standardsProgress,
        suggestedResponses: ['Continue the lesson', 'I have a question...']
      });
    }

    // ── CONCEPT ───────────────────────────────────────────────────────────────
    const lessonContent = lesson ? (lesson.content || lesson.worked_examples || '') : '';
    const chunks = lessonContent.split('\n\n').filter(function(c) { return c.trim().length > 50; });
    const currentChunk = chunks[segment] || null;

    const standardContext = currentStandard
      ? '\nYou are teaching Standard ' + currentStandard.code + ': ' + currentStandard.description + '\nThis is standard ' + (segment + 1) + ' of ' + totalStandards + ' for this topic.'
      : '';

    const system = 'You are a warm SPM ' + subject + ' tutor teaching "' + topic + '".\n'
      + standardContext
      + '\nSTRICT RULES:\n'
      + '- Teach ONLY ONE concept per response (the standard above)\n'
      + '- Maximum 200 words\n'
      + '- End with exactly ONE check-in question e.g. "Does that make sense?" or "Faham?" or "Any questions?"\n'
      + '- Do NOT give practice questions\n'
      + '- Do NOT list multiple concepts\n'
      + '- Be conversational and encouraging\n'
      + '- If teaching a standard, start with: "📌 Standard ' + (currentStandard ? currentStandard.code : '') + '"';

    const userMsg = currentChunk
      ? 'Teach this concept to the student:\n' + currentChunk + '\n\nStudent said: ' + message
      : 'Student said: ' + message + '\n\nContinue teaching ' + topic + ' in ' + subject + '. Segment ' + segment + '.';

    const msgs = history.slice(-4).concat([{ role: 'user', content: userMsg }]);
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 400, system: system, messages: msgs
    });

    const reply = r.content[0].text.trim();
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
        ? ['Yes, I understand! Continue 👍', 'I have a question...', 'Explain again please', 'Give me a practice question! 📝']
        : ['Continue please!', 'I have a question...', 'Give me a practice question! 📝']
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

    // If student_id, also get their completed standards
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
