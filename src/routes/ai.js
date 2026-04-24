import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Detect if student wants an example or practice question
function wantsExample(question) {
  const q = question.toLowerCase();
  const keywords = ['example', 'show me', 'give me', 'practice', 'solve', 'explain further', 'how to solve', 'sample', 'question', 'soalan', 'contoh', 'tunjuk', 'cara'];
  return keywords.some(k => q.includes(k));
}

// Simple fuzzy match
function fuzzyMatch(question, faqQuestion) {
  const q = question.toLowerCase();
  const faq = faqQuestion.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 3);
  const matches = words.filter(w => faq.includes(w));
  return matches.length / Math.max(words.length, 1);
}

// Extract topic from question using keywords
function guessTopic(question) {
  const topicMap = {
    'quadratic': 'Quadratic Functions',
    'function': 'Functions',
    'indices': 'Indices Surds Logarithms',
    'logarithm': 'Indices Surds Logarithms',
    'surd': 'Indices Surds Logarithms',
    'progression': 'Progressions',
    'vector': 'Vectors',
    'trigonometric': 'Trigonometric Functions',
    'soh cah toa': 'Trigonometric Functions',
    'soh': 'Trigonometric Functions',
    'sine': 'Trigonometric Functions',
    'cosine': 'Trigonometric Functions',
    'tangent': 'Trigonometric Functions',
    'sin': 'Trigonometric Functions',
    'cos': 'Trigonometric Functions',
    'tan': 'Trigonometric Functions',
    'probability': 'Probability',
    'integration': 'Integration',
    'differentiation': 'Differentiation',
    'matrix': 'Matrices',
    'linear': 'Linear Equations',
    'coordinate': 'Coordinate Geometry',
    'statistics': 'Statistics',
    'geometry': 'Coordinate Geometry',
    'factori': 'Algebraic Factorization',
    'algebra': 'Algebraic Factorization',
  };
  const q = question.toLowerCase();
  for (const [key, topic] of Object.entries(topicMap)) {
    if (q.includes(key)) return topic;
  }
  return null;
}

/**
 * GET /api/ai/faq?subject=Mathematics
 */
router.get('/faq', async (req, res) => {
  try {
    const { subject = 'Mathematics' } = req.query;
    const { data, error } = await supabase
      .from('faq_cache')
      .select('topic, question, answer')
      .eq('subject', subject)
      .limit(200);
    if (error) throw error;
    const topics = {};
    for (const row of (data || [])) {
      if (!topics[row.topic]) topics[row.topic] = [];
      topics[row.topic].push({ question: row.question, answer: row.answer });
    }
    res.json({ subject, topics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ai/subjects
 */
router.get('/subjects', async (req, res) => {
  try {
    const { data, error } = await supabase.from('faq_cache').select('subject');
    if (error) throw error;
    const counts = {};
    for (const row of (data || [])) {
      counts[row.subject] = (counts[row.subject] || 0) + 1;
    }
    res.json({ subjects: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/ask
 * 3-tier: FAQ cache → Quiz bank examples → Claude API
 */
router.post('/ask', async (req, res) => {
  try {
    const { question, subject = 'Mathematics' } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    // TIER 1: Check faq_cache
    const { data: faqs } = await supabase
      .from('faq_cache')
      .select('question, answer, topic, related_questions')
      .eq('subject', subject)
      .limit(500);

    let bestMatch = null;
    let bestScore = 0;
    for (const faq of (faqs || [])) {
      const score = fuzzyMatch(question, faq.question);
      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestMatch = faq;
      }
    }

    if (bestMatch && bestScore > 0.5) {
      return res.json({
        answer: bestMatch.answer,
        topic: bestMatch.topic,
        source: 'faq_cache',
        related_questions: bestMatch.related_questions || [],
        example: null,
        wrong_subject_note: null,
      });
    }

    // TIER 2: If student wants example/practice, pull from quiz bank
    if (wantsExample(question)) {
      const topic = guessTopic(question);
      let quizQuery = supabase
        .from('quiz_questions')
        .select('id, question, options, correct_answer, explanation, quizzes!inner(subject, topic)')
        .eq('quizzes.subject', subject)
        .limit(3);

      if (topic) quizQuery = quizQuery.ilike('quizzes.topic', `%${topic}%`);

      const { data: bankQuestions } = await quizQuery;

      if (bankQuestions && bankQuestions.length > 0) {
        const q = bankQuestions[Math.floor(Math.random() * bankQuestions.length)];
        const opts = q.options ? Object.entries(q.options).map(([k,v]) => `${k}. ${v}`).join('\n') : '';

        // Ask Claude to generate working for this real question
        const workingResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are a Malaysian SPM ${subject} tutor. A student asked: "${question}"\n\nHere is a real SPM trial question on this topic:\n\nQuestion: ${q.question}\n${opts}\nAnswer: ${q.correct_answer}\n\nProvide a clear step-by-step working/explanation for this question in a friendly tutoring style. Keep it concise.`
          }]
        });

        const working = workingResponse.content[0].text.trim();
        const topicName = q.quizzes?.topic || topic || subject;

        return res.json({
          answer: `Here's a real SPM trial question on **${topicName}**:\n\n**Q: ${q.question}**\n\n${opts}\n\n**Answer: ${q.correct_answer}**\n\n**Working:**\n${working}`,
          topic: topicName,
          source: 'quiz_bank',
          related_questions: [],
          example: null,
          wrong_subject_note: null,
        });
      }
    }

    // TIER 3: Claude API fallback
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are a friendly Malaysian SPM ${subject} tutor. Answer this student question clearly.\n\nQuestion: ${question}\n\nRespond in JSON: {"answer":"...","example":"worked example or null","topic":"topic name","related_questions":["q1?","q2?"]}`
      }]
    });

    const raw = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const data = JSON.parse(raw);

    res.json({
      answer: data.answer,
      topic: data.topic,
      source: 'claude',
      example: data.example,
      related_questions: data.related_questions || [],
      wrong_subject_note: null,
    });

  } catch (err) {
    console.error('AI ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

