import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

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

    const lesson = await getLesson(subject, topic);
    const practiceQuestions = await getPracticeQuestions(subject, topic);

    // ── INTRO ─────────────────────────────────────────────────────────────────
    if (message === 'start' || phase === 'intro') {
      const intro = lesson
        ? (lesson.introduction || (lesson.content || '').substring(0, 600))
        : null;
      const prompt = intro
        ? 'Deliver this introduction warmly in 2-3 short paragraphs. End by asking if they are ready for the first concept. Do NOT teach concepts yet.\n\n' + intro
        : 'Give a brief 2-paragraph introduction to ' + topic + ' in SPM ' + subject + '. End by asking if the student is ready to begin.';

      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        system: 'You are a warm encouraging SPM ' + subject + ' tutor. Be friendly and conversational.',
        messages: [{ role: 'user', content: prompt }]
      });

      return res.json({
        reply: r.content[0].text.trim(),
        phase: 'concept',
        segment: 0,
        isCheckIn: false,
        activeQuestion: null,
        suggestedResponses: ["Yes, I'm ready! Let's start 🚀", 'Tell me more about this topic first', 'I have a question...']
      });
    }

    // ── QUIZ ANSWER — student answering an active MCQ ─────────────────────────
    if (phase === 'quiz_answer' && activeQuestion) {
      const q = activeQuestion;
      const studentAns = message.trim().toUpperCase().charAt(0);
      const correct = studentAns === (q.correct_answer || '').toUpperCase();

      if (correct) {
        return res.json({
          reply: '✅ Correct! Well done!\n\n' + (q.explanation || 'Great work — you understood that concept well.') + '\n\nReady to continue?',
          phase: 'concept',
          segment: segment + 1,
          isCheckIn: false,
          activeQuestion: null,
          suggestedResponses: ['Continue to next concept! 👍', 'I have a question...', 'Give me another question!']
        });
      }

      return res.json({
        reply: 'Not quite — the correct answer is **' + q.correct_answer + '**\n\n' + (q.explanation || 'Review the concept and try to understand why ' + q.correct_answer + ' is correct.') + '\n\nShall we continue with the lesson?',
        phase: 'concept',
        segment: segment + 1,
        isCheckIn: false,
        activeQuestion: null,
        suggestedResponses: ['I understand now, continue', 'Can you explain why?', 'Give me another question']
      });
    }

    // ── PRACTICE REQUEST — student wants a question ───────────────────────────
    const msgLower = message.toLowerCase();
    const wantsQuestion = msgLower.includes('practice') || msgLower.includes('question') ||
      msgLower.includes('quiz') || msgLower.includes('soalan') || msgLower.includes('test me');

    if (wantsQuestion) {
      if (practiceQuestions.length > 0) {
        const idx = Math.min(segment, practiceQuestions.length - 1);
        const q = practiceQuestions[idx];
        let opts = '';
        if (q.options && typeof q.options === 'object') {
          opts = Object.entries(q.options).map(function(entry) { return entry[0] + '. ' + entry[1]; }).join('\n');
        }
        return res.json({
          reply: '📝 **Practice Question:**\n\n' + q.question + '\n\n' + opts + '\n\nType A, B, C or D — or use the workspace to show your working!',
          phase: 'quiz_answer',
          segment: segment,
          isCheckIn: false,
          activeQuestion: q,
          suggestedResponses: ['A', 'B', 'C', 'D'],
          openWorkspace: true
        });
      }
      return res.json({
        reply: "No practice questions available for this topic yet — let's continue the lesson!",
        phase: 'concept',
        segment: segment,
        isCheckIn: false,
        activeQuestion: null,
        suggestedResponses: ['Continue the lesson', 'I have a question...']
      });
    }

    // ── CONCEPT — teach one concept at a time then check-in ──────────────────
    const lessonContent = lesson ? (lesson.content || lesson.worked_examples || '') : '';
    const chunks = lessonContent.split('\n\n').filter(function(c) { return c.trim().length > 50; });
    const currentChunk = chunks[segment] || null;

    const system = 'You are a warm SPM ' + subject + ' tutor teaching "' + topic + '".\n'
      + 'STRICT RULES:\n'
      + '- Teach ONLY ONE concept or step in this response\n'
      + '- Maximum 200 words\n'
      + '- End with exactly ONE check-in question e.g. "Does that make sense?" or "Faham?" or "Any questions before we move on?"\n'
      + '- Do NOT give practice questions\n'
      + '- Do NOT list multiple concepts at once\n'
      + '- Be conversational and encouraging';

    const userMsg = currentChunk
      ? 'Teach this concept to the student in your own words:\n' + currentChunk + '\n\nStudent said: ' + message
      : 'Student said: ' + message + '\n\nContinue teaching ' + topic + ' in ' + subject + '. We are on segment ' + segment + '.';

    const msgs = history.slice(-4).concat([{ role: 'user', content: userMsg }]);

    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: system,
      messages: msgs
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
      suggestedResponses: isCheckIn
        ? ['Yes, I understand! Continue 👍', 'I have a question...', 'Explain again please', 'Give me a practice question! 📝']
        : ['Continue please!', 'I have a question...', 'Give me a practice question! 📝']
    });

  } catch (err) {
    console.error('Tutor error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
