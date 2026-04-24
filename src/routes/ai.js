import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Simple fuzzy match - check if question contains key words from faq
function fuzzyMatch(question, faqQuestion) {
  const q = question.toLowerCase();
  const faq = faqQuestion.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 3);
  const matches = words.filter(w => faq.includes(w));
  return matches.length / words.length;
}

/**
 * GET /api/ai/faq?subject=Mathematics
 * Returns FAQ questions grouped by topic
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

    // Group by topic
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
 * Returns all subjects with FAQ counts
 */
router.get('/subjects', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faq_cache')
      .select('subject');

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
 * Ask AI tutor a question - FAQ first, then Claude fallback
 */
router.post('/ask', async (req, res) => {
  try {
    const { question, subject = 'Mathematics' } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    // Step 1: Check faq_cache for matching question
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

    // Step 2: Claude API fallback
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are a friendly Malaysian SPM ${subject} tutor. Answer this student question clearly and concisely.

Question: ${question}

Respond in this JSON format only:
{
  "answer": "clear explanation here",
  "example": "worked example if applicable, or null",
  "topic": "topic name",
  "related_questions": ["related question 1?", "related question 2?"]
}`
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
