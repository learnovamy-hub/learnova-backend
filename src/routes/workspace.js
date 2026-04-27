import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';
import { processMistake, getMistakeSummary } from '../lib/mistake_intelligence.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const RUBRICS = {
  Mathematics:     { marks: 4, instruction: 'Mark as SPM Mathematics examiner. Award partial marks where working is shown.' },
  'Add Maths':     { marks: 5, instruction: 'Mark as SPM Additional Mathematics examiner.' },
  Physics:         { marks: 4, instruction: 'Mark as SPM Physics examiner. Units compulsory for full marks.' },
  Chemistry:       { marks: 4, instruction: 'Mark as SPM Chemistry examiner.' },
  Biology:         { marks: 3, instruction: 'Mark as SPM Biology examiner.' },
  English:         { marks: 4, instruction: 'Mark as SPM English examiner.' },
  'Bahasa Melayu': { marks: 4, instruction: 'Mark as SPM Bahasa Melayu examiner.' },
  default:         { marks: 4, instruction: 'Mark as an SPM examiner.' },
};

function getRubric(subject) {
  for (const key of Object.keys(RUBRICS)) {
    if (key !== 'default' && subject.toLowerCase().includes(key.toLowerCase())) return RUBRICS[key];
  }
  return RUBRICS.default;
}

router.post('/assess', async (req, res) => {
  try {
    const { student_id, session_id, subject, topic, question, correct_answer,
      input_mode, student_answer, image_base64, attempt = 1 } = req.body;

    if (!subject || !topic || !question) {
      return res.status(400).json({ error: 'subject, topic, question required' });
    }
    if (!student_answer && !image_base64) {
      return res.status(400).json({ error: 'student_answer or image_base64 required' });
    }

    const rubric = getRubric(subject);
    const systemPrompt = 'You are an SPM ' + subject + ' examiner. ' + rubric.instruction
      + '\nAssess the student answer and return ONLY this JSON:\n'
      + '{ "score": <0-' + rubric.marks + '>, "max_marks": ' + rubric.marks + ', "is_correct": <true|false>,'
      + ' "grade": "<Excellent|Good|Partial|Needs Work>", "strengths": ["..."], "mistakes": ["..."],'
      + ' "correct_working": "...", "student_working_extracted": "..." }';

    let messages;
    if (input_mode === 'drawn' && image_base64) {
      messages = [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image_base64 } },
        { type: 'text', text: 'Question: ' + question + '\nAssess this handwritten working.' },
      ]}];
    } else {
      messages = [{ role: 'user', content: 'Question: ' + question + '\nStudent answer:\n' + student_answer }];
    }

    const scoreResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251022', max_tokens: 800, system: systemPrompt, messages,
    });

    let text = scoreResponse.content[0].text.trim();
    if (text.includes('```')) text = text.split('```')[1].replace(/^json\n?/, '').trim();
    const scoreResult = JSON.parse(text);

    const studentWorking = input_mode === 'drawn' ? scoreResult.student_working_extracted : student_answer;

    let mistakeData = null;
    if (!scoreResult.is_correct && scoreResult.score < scoreResult.max_marks) {
      try {
        mistakeData = await processMistake({
          studentId: student_id, subject, topic, question,
          studentAnswer: student_answer || '[handwritten]',
          correctAnswer: correct_answer || scoreResult.correct_working,
          studentWorking, attempt,
        });
      } catch (e) { console.error('Mistake intelligence error:', e.message); }
    }

    if (student_id) {
      await supabase.from('workspace_submissions').insert({
        student_id, session_id, question, subject, topic,
        input_mode: input_mode || 'typed',
        student_answer: student_answer || null,
        score: scoreResult.score, max_marks: scoreResult.max_marks,
        feedback: { grade: scoreResult.grade, strengths: scoreResult.strengths,
          mistakes: scoreResult.mistakes, correct_working: scoreResult.correct_working,
          mistake_code: mistakeData ? mistakeData.mistake_code : null,
          mistake_label: mistakeData ? mistakeData.mistake_label : null },
      });
    }

    const pct = Math.round(scoreResult.score / scoreResult.max_marks * 100);
    const encouragement = scoreResult.is_correct
      ? (pct === 100 ? 'Perfect! Full marks!' : 'Correct! ' + scoreResult.score + '/' + scoreResult.max_marks + ' — great job!')
      : 'Good attempt! ' + scoreResult.score + '/' + scoreResult.max_marks + ' — let\'s look at what happened.';

    res.json({
      score: scoreResult.score, max_marks: scoreResult.max_marks,
      is_correct: scoreResult.is_correct, grade: scoreResult.grade,
      strengths: scoreResult.strengths, mistakes: scoreResult.mistakes,
      correct_working: scoreResult.correct_working, encouragement,
      mistake_intelligence: mistakeData ? {
        code: mistakeData.mistake_code, label: mistakeData.mistake_label,
        tutor_response: mistakeData.tutor_response, is_recurring: mistakeData.is_recurring,
        occurrence_count: mistakeData.occurrence_count, frequency_label: mistakeData.frequency_label,
        frequency_emoji: mistakeData.frequency_emoji, fix_strategy: mistakeData.fix_strategy,
        why_it_happens: mistakeData.why_it_happens, pattern_alert: mistakeData.pattern_alert,
      } : null,
    });
  } catch (err) {
    console.error('Workspace assess error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subject, limit = 20 } = req.query;
    let query = supabase.from('workspace_submissions')
      .select('id, subject, topic, question, score, max_marks, feedback, created_at')
      .eq('student_id', studentId).order('created_at', { ascending: false }).limit(parseInt(limit));
    if (subject) query = query.ilike('subject', '%' + subject + '%');
    const { data, error } = await query;
    if (error) throw error;
    res.json({ submissions: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/mistakes/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { days = 30 } = req.query;
    const summary = await getMistakeSummary(studentId, parseInt(days));
    res.json({ mistake_patterns: summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
