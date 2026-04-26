import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';
const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function fuzzyMatch(q, faq) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matches = words.filter(w => faq.toLowerCase().includes(w));
  return matches.length / Math.max(words.length, 1);
}

async function checkFAQ(question, subject) {
  const { data: faqs } = await supabase.from('faq_cache').select('question, answer, topic').eq('subject', subject).limit(300);
  let best = null, bestScore = 0;
  for (const faq of (faqs || [])) {
    const score = fuzzyMatch(question, faq.question);
    if (score > bestScore && score > 0.45) { bestScore = score; best = faq; }
  }
  return best;
}

async function getLesson(subject, topic) {
  const { data } = await supabase.from('lessons').select('*').eq('subject', subject).ilike('topic', '%' + topic + '%').eq('status', 'published').maybeSingle();
  return data;
}

async function getPracticeQuestions(subject, topic, limit = 2) {
  const { data } = await supabase.from('quiz_questions').select('id, question, options, correct_answer, explanation, quizzes!inner(subject, topic)').eq('quizzes.subject', subject).ilike('quizzes.topic', '%' + topic + '%').not('correct_answer', 'is', null).limit(limit);
  return data || [];
}

function formatQuestion(q) {
  if (!q) return null;
  const opts = q.options ? Object.entries(q.options).map(([k,v]) => k + '. ' + v).join('\n') : '';
  return '**Question:**\n' + q.question + '\n\n' + opts;
}

router.post('/session', async (req, res) => {
  try {
    const { subject = 'Mathematics', topic, message = 'start', history = [], phase = 'intro', segment = 0 } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const lesson = await getLesson(subject, topic);
    const msgLower = message.toLowerCase();
    const isContinue = ['yes','ok','okay','understand','continue','next','got it','faham','understood','sure'].some(w => msgLower.includes(w));
    const wantsPractice = ['practice','example','question','more','soalan'].some(w => msgLower.includes(w));
    const isStart = message === 'start';
    const isStudentQuestion = !isStart && !isContinue && !wantsPractice;

    // TIER 1: Deliver lesson from DB
    if (lesson) {
      if (isStart || phase === 'intro') {
        const reply = '👋 Hello! Today we are learning **' + topic + '**.\n\n' + lesson.introduction + '\n\n---\n*Ready to start? Just say "continue" or ask me anything!*';
        return res.json({ reply, phase: 'concept', segment: 0, source: 'lesson_db', isCheckIn: true, suggestedResponses: ['Continue please!', 'I have a question...', 'What will I learn today?'] });
      }

      if (isContinue && !wantsPractice) {
        const lines = (lesson.content || '').split('\n').filter(l => l.trim());
        const chunk = lines.slice(segment * 5, segment * 5 + 5).join('\n');
        const isLast = (segment + 1) * 5 >= lines.length;
        if (chunk) {
          const checkIn = isLast ? '\n\n---\n✅ That covers the main concepts! Shall we look at **worked examples** next?' : '\n\n---\n*Got that? Any questions, or continue to the next part?*';
          return res.json({ reply: chunk + checkIn, phase: isLast ? 'example' : 'concept', segment: segment + 1, source: 'lesson_db', isCheckIn: true, suggestedResponses: isLast ? ['Show me examples!', 'I have a question...', 'Practice questions!'] : ['Continue!', 'I have a question...', 'Explain again?'] });
        }
      }

      if (phase === 'example' && isContinue) {
        const reply = '📝 **Worked Examples:**\n\n' + (lesson.worked_examples || '').substring(0, 1000) + '\n\n---\n*Want to try some practice questions from past SPM papers?*';
        return res.json({ reply, phase: 'practice', segment, source: 'lesson_db', isCheckIn: true, suggestedResponses: ['Yes! Practice questions!', 'I have a question...', 'Show me summary'] });
      }

      if (wantsPractice || phase === 'practice') {
        const questions = await getPracticeQuestions(subject, topic);
        if (questions.length > 0) {
          const q = questions[Math.floor(Math.random() * questions.length)];
          const reply = '🎯 **Practice Question from SPM Question Bank:**\n\n' + formatQuestion(q) + '\n\n---\n*Take your time! Tell me your answer and I will explain the working.*';
          return res.json({ reply, phase: 'practice', segment, source: 'quiz_bank', isCheckIn: false, questionId: q.id, correctAnswer: q.correct_answer, suggestedResponses: ['A', 'B', 'C', 'D', 'Show me the answer'] });
        }
      }
    }

    // TIER 2: FAQ Cache
    if (isStudentQuestion) {
      const faq = await checkFAQ(message, subject);
      if (faq) {
        const reply = '📚 Good question!\n\n' + faq.answer + '\n\n---\n*Does that help? Shall we continue the lesson?*';
        return res.json({ reply, phase, segment, source: 'faq_cache', isCheckIn: true, suggestedResponses: ['Yes continue!', 'Another question...', 'Practice questions!'] });
      }
    }

    // TIER 3: Claude (last resort)
    const lessonCtx = lesson ? 'Lesson content: ' + lesson.introduction + ' ' + (lesson.content || '').substring(0, 800) : '';
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 350,
      system: 'You are a friendly Malaysian SPM ' + subject + ' tutor teaching ' + topic + '. ' + lessonCtx + ' Answer briefly and clearly. End with a check-in question.',
      messages: [...history, { role: 'user', content: message }]
    });
    return res.json({ reply: r.content[0].text.trim(), phase, segment, source: 'claude', isCheckIn: true, suggestedResponses: ['Continue lesson!', 'Another question...', 'Practice questions!'] });

  } catch (err) {
    console.error('Tutor error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/topics', async (req, res) => {
  try {
    const { subject = 'Mathematics' } = req.query;
    const { data, error } = await supabase.from('lessons').select('id, title, topic, form_level, learning_objectives').eq('subject', subject).eq('status', 'published').order('chapter_number', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
