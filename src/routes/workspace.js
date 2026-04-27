// src/routes/workspace.js
// Learnova Workspace — assess typed or handwritten student answers
// Add to server.js: app.use('/api/workspace', require('./routes/workspace'));

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ─── Scoring rubric by subject ────────────────────────────────────────────────

const RUBRICS = {
  Mathematics: {
    marks: 4,
    criteria: [
      'M1 — Correct method / approach shown',
      'A1 — Correct intermediate working steps',
      'A1 — Correct final answer',
      'P1 — Working clearly presented and logical',
    ],
    instruction: 'Mark strictly as an SPM Mathematics examiner. Award partial marks where working is shown but final answer is wrong.',
  },
  'Add Maths': {
    marks: 5,
    criteria: [
      'M1 — Correct method selected',
      'M1 — Correct application of method',
      'A1 — Correct intermediate values',
      'A1 — Correct final answer with units if applicable',
      'P1 — Workings clearly laid out',
    ],
    instruction: 'Mark as SPM Additional Mathematics examiner.',
  },
  Physics: {
    marks: 4,
    criteria: [
      'K1 — Correct formula or principle stated',
      'S1 — Correct substitution',
      'A1 — Correct calculation',
      'A1 — Correct answer with units',
    ],
    instruction: 'Mark as SPM Physics examiner. Units are compulsory for full marks.',
  },
  Chemistry: {
    marks: 4,
    criteria: [
      'K1 — Correct concept or formula',
      'S1 — Correct method applied',
      'A1 — Correct answer',
      'P1 — Correct chemical notation used',
    ],
    instruction: 'Mark as SPM Chemistry examiner.',
  },
  Biology: {
    marks: 3,
    criteria: [
      'K1 — Correct biological concept',
      'K1 — Correct explanation of process',
      'A1 — Accurate conclusion or answer',
    ],
    instruction: 'Mark as SPM Biology examiner.',
  },
  default: {
    marks: 4,
    criteria: [
      'K1 — Demonstrates understanding of concept',
      'K1 — Correct approach / reasoning shown',
      'A1 — Accurate answer',
      'P1 — Clear and organised presentation',
    ],
    instruction: 'Mark as an SPM examiner.',
  },
};

function getRubric(subject) {
  for (const key of Object.keys(RUBRICS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return RUBRICS[key];
  }
  return RUBRICS.default;
}

// ─── Build assessment prompt ───────────────────────────────────────────────────

function buildPrompt(subject, topic, question, correctAnswer, rubric) {
  return `You are an experienced SPM examiner for ${subject}.

Topic: ${topic}
Question: ${question}
${correctAnswer ? `Expected answer / marking key: ${correctAnswer}` : ''}

Marking scheme (${rubric.marks} marks total):
${rubric.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${rubric.instruction}

Assess the student's answer/working below and return ONLY this JSON:
{
  "score": <integer 0-${rubric.marks}>,
  "max_marks": ${rubric.marks},
  "grade": "<Excellent|Good|Partial|Needs Work>",
  "strengths": ["<what student did correctly>"],
  "mistakes": ["<specific error made, if any>"],
  "correct_working": "<full step-by-step model answer>",
  "encouragement": "<1 sentence motivational feedback personalised to their score>"
}`;
}

// ─── POST /api/workspace/assess ───────────────────────────────────────────────

router.post('/assess', async (req, res) => {
  try {
    const {
      student_id,
      session_id,
      subject,
      topic,
      question,
      correct_answer,   // optional — from quiz bank
      input_mode,       // 'typed' | 'drawn'
      student_answer,   // text (typed mode)
      image_base64,     // PNG base64 (drawn mode)
    } = req.body;

    if (!subject || !topic || !question) {
      return res.status(400).json({ error: 'subject, topic, question are required' });
    }
    if (!student_answer && !image_base64) {
      return res.status(400).json({ error: 'Either student_answer or image_base64 is required' });
    }

    const rubric = getRubric(subject);
    const systemPrompt = buildPrompt(subject, topic, question, correct_answer, rubric);

    let messages;

    if (input_mode === 'drawn' && image_base64) {
      // Vision assessment — handwritten workings
      messages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: image_base64,
            },
          },
          {
            type: 'text',
            text: 'This is the student\'s handwritten working. Please assess it according to the marking scheme.',
          },
        ],
      }];
    } else {
      // Text assessment — typed answer
      messages = [{
        role: 'user',
        content: `Student's answer:\n${student_answer}`,
      }];
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251022',   // Sonnet for reliable JSON + vision
      max_tokens: 800,
      system: systemPrompt,
      messages,
    });

    let text = response.content[0].text.trim();
    if (text.includes('```')) {
      text = text.split('```')[1].replace(/^json\n?/, '').trim();
    }
    const result = JSON.parse(text);

    // Save to DB
    if (student_id) {
      await supabase.from('workspace_submissions').insert({
        student_id,
        session_id,
        question,
        subject,
        topic,
        input_mode: input_mode || 'typed',
        student_answer: student_answer || null,
        image_base64: image_base64 ? '[stored]' : null,  // don't store raw image in DB
        score: result.score,
        max_marks: result.max_marks,
        feedback: {
          grade:           result.grade,
          strengths:       result.strengths,
          mistakes:        result.mistakes,
          correct_working: result.correct_working,
          encouragement:   result.encouragement,
        },
      });
    }

    res.json({
      score:           result.score,
      max_marks:       result.max_marks,
      grade:           result.grade,
      strengths:       result.strengths,
      mistakes:        result.mistakes,
      correct_working: result.correct_working,
      encouragement:   result.encouragement,
    });

  } catch (err) {
    console.error('Workspace assess error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/workspace/history/:studentId ────────────────────────────────────

router.get('/history/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subject, limit = 20 } = req.query;

    let query = supabase
      .from('workspace_submissions')
      .select('id, subject, topic, question, score, max_marks, feedback, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (subject) query = query.ilike('subject', `%${subject}%`);

    const { data, error } = await query;
    if (error) throw error;

    // Summarise for parent dashboard use
    const summary = {
      total_attempts: data.length,
      average_score: data.length
        ? Math.round(data.reduce((acc, r) => acc + (r.score / r.max_marks) * 100, 0) / data.length)
        : 0,
      by_subject: {},
    };

    data.forEach(r => {
      if (!summary.by_subject[r.subject]) {
        summary.by_subject[r.subject] = { attempts: 0, total_score: 0, max_score: 0 };
      }
      summary.by_subject[r.subject].attempts++;
      summary.by_subject[r.subject].total_score += r.score;
      summary.by_subject[r.subject].max_score   += r.max_marks;
    });

    res.json({ submissions: data, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
