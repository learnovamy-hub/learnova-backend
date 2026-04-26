import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';
const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function detectEngagement(message) {
  const msg = message.toLowerCase().trim();
  const validLearning = ['help','confused','dont understand','explain','easier','example','tired','anxious','hard','difficult','susah','tak faham'];
  if (validLearning.some(w => msg.includes(w))) return 'normal';
  const celebrity = ['richest','famous','celebrity','singer','actor','footballer','youtuber','influencer','billionaire','taylor swift','ronaldo'];
  if (celebrity.some(w => msg.includes(w))) return 'celebrity';
  const offTopic = ['game','food','movie','tiktok','instagram','youtube','boyfriend','girlfriend','shopping','keluar','lapar','makan','kawan','friend'];
  if (offTopic.some(w => msg.includes(w))) return 'offtopic';
  const giveup = ['give up','cannot','cant do','impossible','too hard','fail','malas','quit','stop','hate this','hate math'];
  if (giveup.some(w => msg.includes(w))) return 'giveup';
  const tired = ['tired','sleepy','ngantuk','penat','exhausted','bored','boring','bosan'];
  if (tired.some(w => msg.includes(w))) return 'tired';
  const avoid = ['later','tomorrow','next time','not now','esok','tak nak','whatevs'];
  if (avoid.some(w => msg.includes(w))) return 'avoid';
  const nonsense = ['banana','monkey','chicken','random','blah','whatever','idk','dunno','ntah'];
  if (nonsense.some(w => msg.includes(w))) return 'nonsense';
  if (nonsense.some(w => msg.includes(w))) return 'nonsense';
  return 'normal';
}

function getRedirectMessage(type, topic, count, name) {
  const n = name ? ' ' + name : '';
  const t = topic || 'this topic';
  if (count >= 3) return 'It seems your mind may not be fully on the lesson right now' + n + '. Would you like to continue later? Resting actually helps you learn better ??';
  if (count >= 2) return 'We\'ve drifted away from **' + t + '** a couple of times now. Let\'s refocus — just a few more minutes and we\'ll finish this section ??';
  const msgs = {
    celebrity: ['Interesting question ?? but let\'s bring our focus back to **' + t + '** so you keep progressing!', 'That\'s outside today\'s lesson' + n + ' — let\'s return to **' + t + '**. This topic WILL appear in SPM! ??'],
    offtopic: ['I hear you ?? but let\'s bring our focus back to **' + t + '** — just a little more and we\'re done!', 'Good energy ?? now let\'s use it on **' + t + '**. SPM is coming and this topic will definitely appear!'],
    giveup: ['Hey, I believe in you' + n + '! ?? Let\'s break **' + t + '** into tiny steps — it\'ll get easier!', 'Don\'t give up! Every top SPM scorer once felt exactly like you do now. Let\'s do just ONE more concept together! ??'],
    tired: ['You sound a little tired' + n + '. Let\'s slow down and do just one small step at a time — no rush ??', 'It\'s okay to feel tired! Let\'s focus for just a few more minutes on **' + t + '**, then you can take a break.'],
    avoid: ['How about this — let\'s do just 2 more steps of **' + t + '**, then take a break. Sound fair? ??', 'Let\'s finish just this one section first — you\'re actually very close to finishing! ??'],
    nonsense: ['Haha ?? creative! Now let\'s switch back into study mode and continue with **' + t + '**.', 'Fun answer ?? but let\'s focus on your progress now. Back to **' + t + '**!'],
  };
  const list = msgs[type] || msgs.offtopic;
  return list[Math.floor(Math.random() * list.length)];
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
async function getPracticeQuestions(subject, topic, limit = 2) {
  const { data } = await supabase.from('quiz_questions').select('id, question, options, correct_answer, quizzes!inner(subject, topic)').eq('quizzes.subject', subject).ilike('quizzes.topic', '%' + topic + '%').not('correct_answer', 'is', null).limit(limit);
  return data || [];
}
function formatQuestion(q) {
  const opts = q.options ? Object.entries(q.options).map(([k,v]) => k + '. ' + v).join('\n') : '';
  return '**Question:**\n' + q.question + '\n\n' + opts;
}

router.post('/session', async (req, res) => {
  try {
    const { subject = 'Mathematics', topic, message = 'start', history = [], phase = 'intro', segment = 0, offTopicCount = 0, studentName } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });
    const msgLower = message.toLowerCase();
    const isStart = message === 'start';
    const isContinue = !isStart && ['yes','ok','okay','understand','continue','next','got it','faham','sure','go on'].some(w => msgLower.includes(w));
    const wantsPractice = ['practice','example','question','more','soalan','try'].some(w => msgLower.includes(w));
    const wantsStop = !isStart && ['stop','pause','break','rest','esok','tomorrow','bye'].some(w => msgLower.includes(w));
    const isStudentQuestion = !isStart && !isContinue && !wantsPractice;

    if (wantsStop) {
      const stopMsgs = ['No problem ?? Rest well and return when ready. We will continue **' + topic + '** from where you stopped!','Good choice' + (studentName ? ' ' + studentName : '') + '. A rested mind learns faster! See you soon ??'];
      return res.json({ reply: stopMsgs[Math.floor(Math.random() * stopMsgs.length)], phase, segment, source: 'reengagement', isCheckIn: false, offTopicCount: 0, suggestedResponses: [] });
    }

    if (!isStart) {
      const engagement = detectEngagement(message);
      if (engagement !== 'normal') {
        const newCount = offTopicCount + 1;
        const redirectMsg = getRedirectMessage(engagement, topic, newCount, studentName);
        const suggestions = newCount >= 4 ? ['I need a break', 'Let\'s continue!', 'Go slower please'] : ['Okay, let\'s continue!', 'Can you explain differently?', 'I need help with this part...'];
        return res.json({ reply: redirectMsg, phase, segment, source: 'reengagement', isCheckIn: true, offTopicCount: newCount, suggestedResponses: suggestions });
      }
    }

    const lesson = await getLesson(subject, topic);
    if (lesson) {
      if (isStart || phase === 'intro') {
        const name = studentName ? ' ' + studentName : '';
        return res.json({ reply: '?? Hello' + name + '! Today we are learning **' + topic + '**.\n\n' + lesson.introduction + '\n\n---\n*Ready to start? Just say "continue" or ask me anything!*', phase: 'concept', segment: 0, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Continue please! ??', 'I have a question...', 'What will I learn today?'] });
      }
      if (isContinue && phase === 'concept') {
        const lines = (lesson.content || '').split('\n').filter(l => l.trim());
        const chunk = lines.slice(segment * 5, segment * 5 + 5).join('\n');
        const isLast = (segment + 1) * 5 >= lines.length;
        if (chunk) return res.json({ reply: chunk + (isLast ? '\n\n---\n? That covers the main concepts! Shall we look at some **worked examples**?' : '\n\n---\n*Got that? Any questions, or shall we continue?*'), phase: isLast ? 'example' : 'concept', segment: segment + 1, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: isLast ? ['Show me examples! ??', 'I have a question...', 'Practice questions! ??'] : ['Continue! ??', 'I have a question...', 'Explain again?'] });
      }
      if (isContinue && phase === 'example') {
        return res.json({ reply: '?? **Worked Examples:**\n\n' + (lesson.worked_examples || '').substring(0, 1200) + '\n\n---\n*Any questions? Or shall we try some SPM practice questions?*', phase: 'practice', segment, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Practice questions! ??', 'I have a question...', 'Show summary ??'] });
      }
      if (isContinue && phase === 'practice') {
        return res.json({ reply: '?? **Summary:**\n\n' + (lesson.summary || '') + '\n\n?? **Common Mistakes:**\n' + (lesson.common_mistakes || '') + '\n\n---\n*Great work! Want to test yourself with SPM questions?*', phase: 'done', segment, source: 'lesson_db', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Yes! Practice questions! ??', 'Start lesson again', 'I have a question...'] });
      }
      if (wantsPractice || phase === 'done') {
        const questions = await getPracticeQuestions(subject, topic);
        if (questions.length > 0) {
          const q = questions[Math.floor(Math.random() * questions.length)];
          return res.json({ reply: '?? **Practice Question from SPM Question Bank:**\n\n' + formatQuestion(q) + '\n\n---\n*Tell me your answer (A, B, C, or D) and I will explain the full working!*', phase: 'practice', segment, source: 'quiz_bank', isCheckIn: false, offTopicCount: 0, questionId: q.id, correctAnswer: q.correct_answer, suggestedResponses: ['A', 'B', 'C', 'D', 'Show me the answer'] });
        }
      }
    }

    if (isStudentQuestion) {
      const faq = await checkFAQ(message, subject);
      if (faq) return res.json({ reply: '?? Good question!\n\n' + faq.answer + '\n\n---\n*Does that help? Shall we continue the lesson?*', phase, segment, source: 'faq_cache', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Yes, continue! ??', 'Another question...', 'Practice questions! ??'] });
    }

    const lessonCtx = lesson ? 'Lesson: ' + lesson.introduction + ' ' + (lesson.content || '').substring(0, 500) : '';
    const r = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 350, system: 'You are a friendly Malaysian SPM ' + subject + ' tutor teaching ' + topic + '. ' + lessonCtx + ' Answer briefly. End with a check-in.', messages: [...history.slice(-6), { role: 'user', content: message }] });
    return res.json({ reply: r.content[0].text.trim(), phase, segment, source: 'claude', isCheckIn: true, offTopicCount: 0, suggestedResponses: ['Continue lesson! ??', 'Another question...', 'Practice questions! ??'] });

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


