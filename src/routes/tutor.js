import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Fetch lesson content from DB
async function getLesson(subject, topic) {
  const { data } = await supabase
    .from('lessons')
    .select('*')
    .eq('subject', subject)
    .ilike('topic', `%${topic}%`)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

// Fetch past year or seeded questions for practice
async function getPracticeQuestions(subject, topic, limit = 3) {
  const { data } = await supabase
    .from('quiz_questions')
    .select('id, question, options, correct_answer, explanation, quizzes!inner(subject, topic)')
    .eq('quizzes.subject', subject)
    .ilike('quizzes.topic', `%${topic}%`)
    .not('correct_answer', 'is', null)
    .limit(limit);
  return data || [];
}

/**
 * POST /api/tutor/session
 * 
 * Body: {
 *   subject: "Mathematics",
 *   topic: "Quadratic Functions",
 *   message: "student message or 'start'",
 *   history: [{role, content}],
 *   phase: "intro|concept|example|practice|question"
 * }
 */
router.post('/session', async (req, res) => {
  try {
    const { subject = 'Mathematics', topic, message = 'start', history = [], phase = 'intro' } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    // Get lesson content
    const lesson = await getLesson(subject, topic);
    const lessonContext = lesson ? `
LESSON TITLE: ${lesson.title}
INTRODUCTION: ${lesson.introduction}
CONTENT: ${lesson.content}
WORKED EXAMPLES: ${lesson.worked_examples}
COMMON MISTAKES: ${lesson.common_mistakes}
SUMMARY: ${lesson.summary}
` : `You are teaching SPM Form 4/5 ${subject} topic: ${topic}. Use your knowledge of the Malaysian SPM curriculum.`;

    // Get practice questions for later use
    const practiceQuestions = await getPracticeQuestions(subject, topic);
    const questionsContext = practiceQuestions.length > 0 ? 
      practiceQuestions.map((q, i) => `Q${i+1}: ${q.question}\nOptions: ${JSON.stringify(q.options)}\nAnswer: ${q.correct_answer}`).join('\n\n') : '';

    const systemPrompt = `You are Learnova AI Tutor — a warm, encouraging Malaysian SPM ${subject} tutor teaching the topic: "${topic}".

Your teaching style:
- Teach like a real tuition teacher, NOT like a textbook
- Break content into small digestible steps
- Use simple, conversational language (mix of English and occasional Malay terms like "faham?", "okay?")
- After every 2-3 concepts, pause and check understanding
- When checking understanding, ask ONE specific question like "Can you tell me what [concept] means?" or "Do you understand how we got [answer]? Any questions?"
- If student says they understand, praise briefly and move to next concept
- If student has questions, answer clearly using textbook content
- At the end of a topic, offer practice questions from the question bank
- Never dump all content at once — teach in segments
- Keep each response focused and under 300 words
- Use emojis sparingly to keep it friendly 😊

LESSON CONTENT TO TEACH FROM:
${lessonContext}

PRACTICE QUESTIONS AVAILABLE (use at end of session or when student asks for examples):
${questionsContext}

TEACHING PHASES:
- intro: Introduce the topic, explain what it is and why it matters (1-2 paragraphs)
- concept: Teach one concept at a time, then check understanding
- example: Walk through a worked example step by step
- practice: Give student a practice question and guide them
- question: Student asked something — answer it using lesson content

Current phase: ${phase}
Previous conversation history is provided below.`;

    // Build messages array
    const messages = [
      ...history,
      { role: 'user', content: message === 'start' ? `Please start teaching me about ${topic}` : message }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: systemPrompt,
      messages
    });

    const reply = response.content[0].text.trim();

    // Detect next phase based on reply content
    let nextPhase = phase;
    const replyLower = reply.toLowerCase();
    if (replyLower.includes('let\'s practice') || replyLower.includes('try a question') || replyLower.includes('practice question')) {
      nextPhase = 'practice';
    } else if (replyLower.includes('let\'s look at an example') || replyLower.includes('worked example') || replyLower.includes('let me show you')) {
      nextPhase = 'example';
    } else if (replyLower.includes('do you understand') || replyLower.includes('any questions') || replyLower.includes('faham') || replyLower.includes('make sense')) {
      nextPhase = 'concept';
    }

    // Detect if tutor is asking a check-in question
    const isCheckIn = replyLower.includes('do you understand') || 
                      replyLower.includes('any questions') || 
                      replyLower.includes('shall we') ||
                      replyLower.includes('ready to') ||
                      replyLower.includes('faham') ||
                      replyLower.includes('make sense');

    // Detect if practice question is included
    const hasPracticeQuestion = practiceQuestions.length > 0 && 
                                (replyLower.includes('question') && replyLower.includes('answer'));

    res.json({
      reply,
      phase: nextPhase,
      isCheckIn,
      hasPracticeQuestion,
      topic,
      subject,
      suggestedResponses: isCheckIn ? [
        'Yes, I understand! Continue please.',
        'I have a question...',
        'Can you explain that again?',
        'Give me a practice question!'
      ] : []
    });

  } catch (err) {
    console.error('Tutor session error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tutor/topics?subject=Mathematics
 * Returns available topics with lessons
 */
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
