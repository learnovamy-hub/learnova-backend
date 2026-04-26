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

async function classify(message, topic, subject) {
  const msg = message.toLowerCase().trim();
  const skip = ['yes','no','ok','okay','continue','next','a','b','c','d','faham','sure','got it'];
  if (skip.includes(msg) || msg.length < 4) return 'normal';
  const lessonWords = ['understand','explain','how','what','why','formula','solve','calculate','find','confused','help','example','practice'];
  if (lessonWords.some(w => msg.includes(w))) return 'normal';
  try {
    const r = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'Student learning ' + subject + ': ' + topic + '. Says: "' + message + '"\nONE word only: normal, offtopic, celebrity, giveup, tired, avoid, nonsense' }] });
    const result = r.content[0].text.trim().toLowerCase().split(/\s+/)[0];
    return ['normal','offtopic','celebrity','giveup','tired','avoid','nonsense'].includes(result) ? result : 'normal';
  } catch(e) { return 'normal'; }
}

function fuzzyMatch(q, faq) {
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matches = words.filter(w => faq.toLowerCase().includes(w));
  return matches.length / Math.max(words.length, 1);
}

async function checkFAQ(question, subject) {
  const { data: faqs } = await supabase.from('faq_cache').select('question, answer, topic').eq('subject', subject).limit(300);
  let best = null, bestScore = 0;
  for (const faq of (faqs || [])) { const score = fuzzyMatch(question, faq.question); if (score > bestScore && score > 0.45) { bestScore = score; best = faq; } }
  return best;
}

async function getLesson(subject, topic) {
  const { data } = await supabase.from('lessons').select('*').eq('subject', subject).ilike('topic', '%' + topic + '%').eq('status', 'published').maybeSingle();
  return data;
}

async function getPracticeQuestions(subject, topic) {
  const { data } = await supabase.from('quiz_questions').select('id, question, options, correct_answer, quizzes!inner(subject, topic)').eq('quizzes.subject', subject).ilike('quizzes.topic', '%' + topic + '%').not('correct_answer', 'is', null).limit(2);
  return data || [];
}

function formatQ(q) {
  const opts = q.options ? Object.entries(q.options).map(([k,v]) => k + '. ' + v).join('\n') : '';
  return '**Question:**\n' + q.question + '\n\n' + opts;
}

router.post('/session', async (req, res) => {
  try {
    const { subject = 'Mathematics', topic, message = 'start', history = [], phase = 'intro', segment = 0, offTopicCount = 0, studentName } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });
    const msg = message.toLowerCase();
    const isStart = message === 'start';
    const isContinue = !isStart && ['yes','ok','okay','understand','continue','next','got it','faham','sure'].some(w => msg.includes(w));
    const wantsPractice = ['practice','example','question','more','soalan','try'].some(w => msg.includes(w));
    const wantsStop = !isStart && ['stop','pause','break','rest','esok','tomorrow','bye','later'].some(w => msg.includes(w));
    const isQuestion = !isStart && !isContinue && !wantsPractice;

    if (wantsStop) return res.json({ reply: pick(REDIRECT.stop, topic), phase, segment, source: 'local', isCheckIn: false, offTopicCount: 0, suggestedResponses: [] });

    if (!isStart) {
      const type = await classify(message, topic, subject);
      if (type !== 'normal') {
        const newCount = offTopicCount + 1;
        const reply = getRedirect(type, topic, newCount);
        const suggestions = newCount >= 4 ? ["I need a break", "Let's continue!", "Go slower please"] : ["Okay, let's continue!", "Can you explain differently?", "I need help with this..."];
        return res.json({ reply, phase, segment, source: 'local', isCheckIn: true, offTopicCount: newCount, engagementType: type, suggestedResponses: suggestions });
      }
    }

    const lesson = await getLesson(subject, topic);
    if (lesson) {
      if (isStart || phase === 'intro') {
        const name = studentName ? ' ' + studentName : '';
        return res.json({ reply: '👋 Hello' + name + '! Today we are learning **' + topic + '**.\n\n' + lesson.introduction + '\n\n---\n*Ready to start? Just say "continue" or ask me anything!*', phase: 'concept', segment: 0, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Continue please! 📖', 'I have a question...', 'What will I learn today?'] });
      }
      if (isContinue && phase === 'concept') {
        const lines = (lesson.content || '').split('\n').filter(l => l.trim());
        const chunk = lines.slice(segment * 5, segment * 5 + 5).join('\n');
        const isLast = (segment + 1) * 5 >= lines.length;
        if (chunk) return res.json({ reply: chunk + (isLast ? '\n\n---\n✅ Concepts done! Shall we look at **worked examples**?' : '\n\n---\n*Got that? Questions, or continue?*'), phase: isLast ? 'example' : 'concept', segment: segment + 1, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: isLast ? ['Show me examples! 📝', 'I have a question...', 'Practice questions! 🎯'] : ['Continue! ➡️', 'I have a question...', 'Explain again?'] });
      }
      if (isContinue && phase === 'example') {
        return res.json({ reply: '📝 **Worked Examples:**\n\n' + (lesson.worked_examples || '').substring(0, 1200) + '\n\n---\n*Any questions? Or try some SPM practice questions?*', phase: 'practice', segment, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Practice questions! 🎯', 'I have a question...', 'Show summary 📋'] });
      }
      if (isContinue && phase === 'practice') {
        return res.json({ reply: '📋 **Summary:**\n\n' + (lesson.summary || '') + '\n\n⚠️ **Common Mistakes:**\n' + (lesson.common_mistakes || '') + '\n\n---\n*Great work! Want to test yourself?*', phase: 'done', segment, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Yes! Practice questions! 🎯', 'Start lesson again', 'I have a question...'] });
      }
      if (wantsPractice || phase === 'done') {
        const qs = await getPracticeQuestions(subject, topic);
        if (qs.length > 0) {
          const q = qs[Math.floor(Math.random() * qs.length)];
          return res.json({ reply: '🎯 **SPM Practice Question:**\n\n' + formatQ(q) + '\n\n---\n*Tell me your answer (A/B/C/D) and I will explain the working!*', phase: 'practice', segment, source: 'quiz_bank', isCheckIn: false, offTopicCount: 0, questionId: q.id, correctAnswer: q.correct_answer, suggestedResponses: ['A', 'B', 'C', 'D', 'Show me the answer'] });
        }
      }
    }

    if (isQuestion) {
      const faq = await checkFAQ(message, subject);
      if (faq) return res.json({ reply: '📚 Good question!\n\n' + faq.answer + '\n\n---\n*Does that help? Shall we continue?*', phase, segment, source: 'faq_cache', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Yes, continue! ➡️', 'Another question...', 'Practice questions! 🎯'] });
    }

    const ctx = lesson ? 'Lesson: ' + lesson.introduction + ' ' + (lesson.content || '').substring(0, 500) : '';
    const r = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 350, system: 'You are a friendly Malaysian SPM ' + subject + ' tutor teaching ' + topic + '. ' + ctx + ' Answer briefly. End with a check-in.', messages: [...history.slice(-6), { role: 'user', content: message }] });
    return res.json({ reply: r.content[0].text.trim(), phase, segment, source: 'claude', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Continue! ➡️', 'Another question...', 'Practice! 🎯'] });

  } catch (err) { console.error('Tutor error:', err); res.status(500).json({ error: err.message }); }
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
