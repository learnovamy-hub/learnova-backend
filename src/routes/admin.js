import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function generateQuestions(subject, formLevel, topicName, subtopicName) {
  const prompt = `You are an expert Malaysian SPM ${subject} teacher for Form ${formLevel}.\n\nGenerate 5 multiple choice questions for the topic: "${topicName}" - subtopic: "${subtopicName}".\n\nRules:\n- Questions must be appropriate for SPM Form ${formLevel} level\n- Each question must have exactly 4 options (A, B, C, D)\n- Questions should test understanding, not just memorization\n- Mix difficulty: 2 easy, 2 medium, 1 hard\n- Do NOT copy directly from textbooks\n\nRespond ONLY with a valid JSON array, no preamble or markdown:\n[\n  {\n    "question": "Question text here?",\n    "options": {"A": "First option", "B": "Second option", "C": "Third option", "D": "Fourth option"},\n    "correct_answer": "A",\n    "explanation": "Brief explanation of why this is correct",\n    "difficulty": "easy"\n  }\n]`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim().replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

router.post('/seed-quizzes', async (req, res) => {
  const { subject: filterSubject, form: filterForm, limit = 3 } = req.query;
  res.json({ message: 'Quiz seeding started in background. Check Railway logs for progress.', status: 'running' });

  try {
    let subjectQuery = supabase.from('subjects').select('id, name');
    if (filterSubject) subjectQuery = subjectQuery.eq('name', filterSubject);
    const { data: subjects, error: subjectError } = await subjectQuery;
    if (subjectError) { console.error('[SEED] Subject fetch error:', subjectError); return; }

    for (const subject of subjects) {
      let topicQuery = supabase.from('topics').select('id, name, form_level, subtopics(id, name)').eq('subject_id', subject.id).order('order_index', { ascending: true }).limit(parseInt(limit));
      if (filterForm) topicQuery = topicQuery.eq('form_level', parseInt(filterForm));
      const { data: topics, error: topicError } = await topicQuery;
      if (topicError) { console.error(`[SEED] Topic fetch error for ${subject.name}:`, topicError); continue; }

      console.log(`[SEED] Processing ${subject.name}: ${topics.length} topics`);

      for (const topic of topics) {
        const subtopics = topic.subtopics?.slice(0, 2) || [];
        const toSeed = subtopics.length > 0 ? subtopics : [{ name: topic.name }];

        for (const subtopic of toSeed) {
          try {
            const { data: existing } = await supabase.from('quizzes').select('id').eq('topic', topic.name).eq('subject', subject.name).eq('form_level', topic.form_level).eq('title', `${topic.name} - ${subtopic.name}`).maybeSingle();
            if (existing) { console.log(`[SEED] Skip (exists): ${topic.name} - ${subtopic.name}`); continue; }

            console.log(`[SEED] Generating: ${subject.name} F${topic.form_level} - ${topic.name} - ${subtopic.name}`);
            const questions = await generateQuestions(subject.name, topic.form_level, topic.name, subtopic.name);

            const { data: quiz, error: quizError } = await supabase.from('quizzes').insert([{
              title: `${topic.name} - ${subtopic.name}`,
              topic: topic.name,
              subject: subject.name,
              form_level: topic.form_level,
              question_count: questions.length,
              total_questions: questions.length,
              difficulty: 'mixed',
              is_published: true,
            }]).select().single();

            if (quizError) { console.error(`[SEED] Quiz insert error:`, quizError); continue; }

            const questionRows = questions.map((q) => ({
              quiz_id: quiz.id,
              question: q.question,
              type: 'mcq',
              question_type: 'mcq',
              options: q.options,
              correct_answer: q.correct_answer,
              explanation: q.explanation,
            }));

            const { error: qError } = await supabase.from('quiz_questions').insert(questionRows);
            if (qError) { console.error(`[SEED] Questions insert error:`, qError); continue; }

            console.log(`[SEED] Done: ${quiz.title} (${questions.length} questions)`);
            await new Promise(r => setTimeout(r, 800));
          } catch (err) {
            console.error(`[SEED] Error: ${topic.name} - ${subtopic.name}:`, err.message);
          }
        }
      }
    }
    console.log('[SEED] All done!');
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
  }
});

router.get('/seed-quizzes/status', async (req, res) => {
  try {
    const { count: quizCount } = await supabase.from('quizzes').select('*', { count: 'exact', head: true });
    const { count: questionCount } = await supabase.from('quiz_questions').select('*', { count: 'exact', head: true });
    const { data: bySubject } = await supabase.from('quizzes').select('subject');
    const subjectCounts = {};
    (bySubject || []).forEach(q => { subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1; });
    res.json({ total_quizzes: quizCount, total_questions: questionCount, by_subject: subjectCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
