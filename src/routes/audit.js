import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Single verification pass - re-solve question independently
async function verifyQuestion(question, subject) {
  const opts = question.options ? 
    Object.entries(question.options).map(([k,v]) => `${k}. ${v}`).join('\n') : '';
  
  const prompt = `You are an expert Malaysian SPM ${subject} examiner. 
  
Independently solve this multiple choice question and determine the correct answer.

Question: ${question.question}
${opts}

Respond ONLY with JSON:
{
  "derived_answer": "A/B/C/D",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "is_ambiguous": true/false,
  "clarity_issues": "any issues with wording or null",
  "difficulty": "easy/medium/hard"
}`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });
  
  return JSON.parse(r.content[0].text.trim().replace(/```json|```/g, '').trim());
}

// 3-pass majority voting
async function verifyWithMajority(question, subject) {
  const passes = await Promise.all([
    verifyQuestion(question, subject),
    verifyQuestion(question, subject),
    verifyQuestion(question, subject),
  ]);
  
  // Count votes
  const votes = {};
  passes.forEach(p => { votes[p.derived_answer] = (votes[p.derived_answer] || 0) + 1; });
  const majorityAnswer = Object.entries(votes).sort((a,b) => b[1]-a[1])[0][0];
  const majorityCount = votes[majorityAnswer];
  const avgConfidence = passes.reduce((s,p) => s + p.confidence, 0) / 3;
  const anyAmbiguous = passes.some(p => p.is_ambiguous);
  const clarityIssues = passes.find(p => p.clarity_issues)?.clarity_issues || null;
  
  return {
    derived_answer: majorityAnswer,
    agreement: majorityCount, // out of 3
    confidence: avgConfidence,
    is_ambiguous: anyAmbiguous,
    clarity_issues: clarityIssues,
    all_passes: passes.map(p => p.derived_answer),
  };
}

/**
 * POST /api/audit/run
 * Run audit on questions
 * Query: ?subject=Mathematics&limit=50&stage=1 (stage 1=single pass, stage 2=3-pass)
 */
router.post('/run', async (req, res) => {
  const { subject, limit = 20, stage = 1, topic } = req.query;
  res.json({ message: `Stage ${stage} audit started`, status: 'running' });

  try {
    // Fetch questions
    let query = supabase
      .from('quiz_questions')
      .select('id, question, options, correct_answer, explanation, quizzes!inner(subject, topic)')
      .not('correct_answer', 'is', null)
      .limit(parseInt(limit));

    if (subject) query = query.eq('quizzes.subject', subject);
    if (topic) query = query.ilike('quizzes.topic', `%${topic}%`);

    const { data: questions, error } = await query;
    if (error) { console.error('[AUDIT] Fetch error:', error); return; }

    console.log(`[AUDIT] Stage ${stage} - Auditing ${questions.length} questions`);
    
    let passed = 0, failed = 0, review = 0;

    for (const q of questions) {
      try {
        const subjectName = q.quizzes?.subject || subject || 'Mathematics';
        
        // Skip if already audited recently
        const { data: existing } = await supabase
          .from('audit_results')
          .select('id')
          .eq('question_id', q.id)
          .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString())
          .maybeSingle();
        
        if (existing) { console.log('[AUDIT] Skip (recent):', q.id); continue; }

        // Run verification
        const result = parseInt(stage) === 2 
          ? await verifyWithMajority(q, subjectName)
          : await verifyQuestion(q, subjectName);

        const derivedAnswer = result.derived_answer;
        const storedAnswer = q.correct_answer;
        const answerMatch = derivedAnswer === storedAnswer;
        const agreement = result.agreement || (answerMatch ? 3 : 0);
        
        let status = 'PASS';
        const issues = [];

        if (!answerMatch) {
          status = 'FAIL';
          issues.push('incorrect_answer');
          failed++;
        } else if (result.is_ambiguous) {
          status = 'REVIEW';
          issues.push('ambiguous_question');
          review++;
        } else if (result.clarity_issues) {
          status = 'REVIEW';
          issues.push('clarity_issues');
          review++;
        } else {
          passed++;
        }

        // Store audit result
        await supabase.from('audit_results').upsert([{
          question_id: q.id,
          subject: subjectName,
          topic: q.quizzes?.topic,
          status,
          stored_answer: storedAnswer,
          derived_answer: derivedAnswer,
          agreement_passes: agreement,
          confidence: result.confidence,
          issues,
          clarity_issues: result.clarity_issues,
          suggested_fix: !answerMatch ? `Answer should be ${derivedAnswer} not ${storedAnswer}` : null,
          stage: parseInt(stage),
          all_passes: result.all_passes || [derivedAnswer],
        }], { onConflict: 'question_id' });

        // Auto-fix obvious wrong answers with high confidence (stage 2 only, 3/3 agreement)
        if (parseInt(stage) === 2 && !answerMatch && agreement === 3 && result.confidence > 0.9) {
          await supabase
            .from('quiz_questions')
            .update({ correct_answer: derivedAnswer })
            .eq('id', q.id);
          console.log(`[AUDIT] AUTO-FIXED: ${q.id} ${storedAnswer} → ${derivedAnswer}`);
        }

        console.log(`[AUDIT] ${status}: ${q.question?.substring(0,60)} | Stored:${storedAnswer} Derived:${derivedAnswer}`);
        await new Promise(r => setTimeout(r, 500));

      } catch(e) {
        console.error('[AUDIT] Question error:', e.message);
      }
    }

    console.log(`[AUDIT] Done! Pass:${passed} Fail:${failed} Review:${review}`);
  } catch(e) {
    console.error('[AUDIT] Fatal:', e);
  }
});

/**
 * GET /api/audit/results
 * Get audit results summary
 */
router.get('/results', async (req, res) => {
  try {
    const { subject, status } = req.query;

    let query = supabase
      .from('audit_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (subject) query = query.eq('subject', subject);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const summary = {
      total: data.length,
      passed: data.filter(r => r.status === 'PASS').length,
      failed: data.filter(r => r.status === 'FAIL').length,
      review: data.filter(r => r.status === 'REVIEW').length,
      auto_fixed: data.filter(r => r.suggested_fix && r.agreement_passes === 3).length,
    };

    res.json({ summary, results: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/flagged
 * Get failed/review questions for human review
 */
router.get('/flagged', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audit_results')
      .select('*, quiz_questions!inner(question, options, correct_answer)')
      .in('status', ['FAIL', 'REVIEW'])
      .order('confidence', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit/approve/:questionId
 * Human approves a flagged question fix
 */
router.post('/approve/:questionId', async (req, res) => {
  try {
    const { correct_answer, approved_by = 'admin' } = req.body;
    
    // Update the question
    await supabase
      .from('quiz_questions')
      .update({ correct_answer })
      .eq('id', req.params.questionId);

    // Mark audit as resolved
    await supabase
      .from('audit_results')
      .update({ status: 'FIXED', approved_by })
      .eq('question_id', req.params.questionId);

    res.json({ message: 'Question approved and fixed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
