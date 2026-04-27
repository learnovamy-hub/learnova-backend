import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';
import { getMistakeTypes, getFrequencyLabel } from './mistake_taxonomy.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function classifyMistake({ subject, topic, question, studentAnswer, correctAnswer, studentWorking }) {
  const mistakeTypes = getMistakeTypes(subject);
  const typesList = mistakeTypes.map(m => m.code + ': ' + m.label).join('\n');
  const prompt = 'You are an expert SPM ' + subject + ' examiner diagnosing a student mistake.\n'
    + 'Question: ' + question + '\n'
    + 'Correct answer: ' + (correctAnswer || '(see working)') + '\n'
    + 'Student answer: ' + studentAnswer + '\n'
    + (studentWorking ? 'Student working:\n' + studentWorking + '\n' : '')
    + 'Mistake categories:\n' + typesList + '\n'
    + 'Return JSON only with keys: mistake_code, confidence, what_student_did, what_was_correct, specific_details';
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    let text = r.content[0].text.trim();
    if (text.includes('```')) text = text.split('```')[1].replace(/^json\n?/, '').trim();
    const c = JSON.parse(text);
    const mt = mistakeTypes.find(m => m.code === c.mistake_code)
      || mistakeTypes.find(m => m.code === 'CONCEPTUAL_ERROR')
      || mistakeTypes[0];
    return {
      code: c.mistake_code, label: mt.label, confidence: c.confidence,
      what_did: c.what_student_did, what_correct: c.what_was_correct,
      details: c.specific_details, why_it_happens: mt.why_it_happens, fix_strategy: mt.fix_strategy,
    };
  } catch (e) {
    return {
      code: 'CONCEPTUAL_ERROR', label: 'Understanding gap', confidence: 0.5,
      what_did: 'The answer was incorrect.', what_correct: null, details: {},
      why_it_happens: 'The underlying concept may need more review.',
      fix_strategy: 'Re-read the concept section and try a simpler question first.',
    };
  }
}

async function getMistakeHistory(studentId, subject, mistakeCode) {
  try {
    const { data } = await supabase.from('mistake_log').select('id, created_at')
      .eq('student_id', studentId).eq('subject', subject).eq('mistake_code', mistakeCode)
      .order('created_at', { ascending: false }).limit(10);
    return data || [];
  } catch (e) { return []; }
}

async function logMistake({ studentId, subject, topic, question, studentAnswer, mistakeCode, mistakeLabel, details }) {
  try {
    await supabase.from('mistake_log').insert({
      student_id: studentId, subject, topic,
      question: question ? question.substring(0, 500) : null,
      student_answer: studentAnswer ? studentAnswer.substring(0, 500) : null,
      mistake_code: mistakeCode, mistake_label: mistakeLabel, details: details || {},
    });
  } catch (e) { console.error('Mistake log error:', e.message); }
}

async function generateTutorResponse({ subject, topic, question, studentAnswer, correctAnswer, classification, mistakeHistory, attempt }) {
  const isRecurring = mistakeHistory.length >= 2;
  const system = 'You are a warm encouraging SPM ' + subject + ' tutor explaining a mistake like a human teacher.\n'
    + 'Never just say Wrong. Acknowledge what was right. Name mistake kindly. Explain WHY it happens.\n'
    + 'Give specific fix. Under 200 words. Use **bold** for key terms. End with one concrete next action.';
  const recurring = isRecurring
    ? 'This student has made this same mistake (' + classification.label + ') ' + mistakeHistory.length + ' times. Gently flag the pattern.'
    : '';
  const user = 'Question: ' + question + '\nStudent answer: ' + studentAnswer
    + '\nCorrect: ' + (correctAnswer || 'see worked solution')
    + '\nMistake: ' + classification.label
    + '\nWhat they did: ' + classification.what_did
    + '\nWhy it happens: ' + classification.why_it_happens
    + '\nFix: ' + classification.fix_strategy
    + '\n' + recurring + '\nAttempt: ' + attempt;
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251022', max_tokens: 400, system,
      messages: [{ role: 'user', content: user }],
    });
    return r.content[0].text.trim();
  } catch (e) {
    const right = classification.what_correct ? '**What you got right:** ' + classification.what_correct + '\n\n' : '';
    return right + '**Mistake:** ' + classification.label + '\n\n'
      + classification.what_did + '\n\n**Why:** ' + classification.why_it_happens
      + '\n\n**Fix:** ' + classification.fix_strategy;
  }
}

export async function processMistake({ studentId, subject, topic, question, studentAnswer, correctAnswer, studentWorking, attempt }) {
  const classification = await classifyMistake({ subject, topic, question, studentAnswer, correctAnswer, studentWorking });
  const mistakeHistory = await getMistakeHistory(studentId, subject, classification.code);
  if (studentId) {
    await logMistake({ studentId, subject, topic, question, studentAnswer,
      mistakeCode: classification.code, mistakeLabel: classification.label, details: classification.details });
  }
  const tutorResponse = await generateTutorResponse({
    subject, topic, question, studentAnswer, correctAnswer, classification, mistakeHistory, attempt,
  });
  const freq = getFrequencyLabel(mistakeHistory.length + 1);
  return {
    mistake_code: classification.code, mistake_label: classification.label,
    tutor_response: tutorResponse, is_recurring: mistakeHistory.length >= 2,
    occurrence_count: mistakeHistory.length + 1, frequency_label: freq.label, frequency_emoji: freq.emoji,
    fix_strategy: classification.fix_strategy, why_it_happens: classification.why_it_happens,
    pattern_alert: mistakeHistory.length >= 2
      ? 'Recurring ' + classification.label + ' in ' + subject + ' — ' + (mistakeHistory.length + 1) + ' times' : null,
  };
}

export async function getMistakeSummary(studentId, daysBack) {
  if (!daysBack) daysBack = 30;
  try {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const { data } = await supabase.from('mistake_log')
      .select('subject, topic, mistake_code, mistake_label, created_at')
      .eq('student_id', studentId).gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });
    const summary = {};
    (data || []).forEach(function(m) {
      if (!summary[m.subject]) summary[m.subject] = {};
      if (!summary[m.subject][m.mistake_code]) {
        summary[m.subject][m.mistake_code] = { label: m.mistake_label, count: 0, topics: [] };
      }
      summary[m.subject][m.mistake_code].count++;
      if (!summary[m.subject][m.mistake_code].topics.includes(m.topic)) {
        summary[m.subject][m.mistake_code].topics.push(m.topic);
      }
    });
    const result = {};
    Object.keys(summary).forEach(function(subj) {
      result[subj] = Object.keys(summary[subj]).map(function(code) {
        const info = summary[subj][code];
        return { code: code, label: info.label, count: info.count, topics: info.topics,
          severity: info.count >= 3 ? 'high' : info.count >= 2 ? 'medium' : 'low' };
      }).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);
    });
    return result;
  } catch (e) { return {}; }
}
