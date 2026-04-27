# 04_backend_files.ps1
# Writes: src/lib/mistake_taxonomy.js, src/lib/mistake_intelligence.js
#         src/routes/tutor.js, src/routes/workspace.js
# Run from: C:\Users\Yong\OneDrive\learnova\learnova-backend\learnova-backend\

$libDir    = "src\lib"
$routesDir = "src\routes"

if (!(Test-Path $libDir))    { New-Item -ItemType Directory -Path $libDir    | Out-Null }
if (!(Test-Path $routesDir)) { New-Item -ItemType Directory -Path $routesDir | Out-Null }

# ─── mistake_taxonomy.js ─────────────────────────────────────────────────────
@'
// src/lib/mistake_taxonomy.js
const MISTAKE_TAXONOMY = {
  Mathematics: [
    { code: 'WRONG_OPERATION',     label: 'Wrong operation used',
      why_it_happens: 'Operation words (total, product, difference) were confused.',
      fix_strategy:   'Underline the operation keyword in the question before solving.' },
    { code: 'SIGN_ERROR',          label: 'Sign error (positive/negative)',
      why_it_happens: 'Negative signs get dropped when expanding brackets or moving terms across equals.',
      fix_strategy:   'Circle every negative sign before starting. Say aloud "changing sign" when moving terms.' },
    { code: 'FORMULA_WRONG',       label: 'Wrong formula applied',
      why_it_happens: 'A similar-looking formula from another topic was applied instead.',
      fix_strategy:   'Write the correct formula at the top before substituting any numbers.' },
    { code: 'SUBSTITUTION_ERROR',  label: 'Incorrect substitution',
      why_it_happens: 'Right formula chosen, but values plugged into wrong positions.',
      fix_strategy:   'Label each variable (a=2, b=5) before substituting. Never substitute from memory.' },
    { code: 'ARITHMETIC_SLIP',     label: 'Arithmetic slip',
      why_it_happens: 'Method was correct but a mental calculation mistake crept in.',
      fix_strategy:   'Estimate what the answer should roughly be, then verify your calculation matches.' },
    { code: 'INCOMPLETE_WORKING',  label: 'Incomplete working shown',
      why_it_happens: 'Steps were skipped mentally, losing method marks even if final answer is correct.',
      fix_strategy:   'For every line ask: would a stranger understand how I got here from the previous line?' },
    { code: 'UNITS_MISSING',       label: 'Units missing or wrong',
      why_it_happens: 'Focus on the number caused the unit to be forgotten.',
      fix_strategy:   'Write the unit at the end of every calculation line, not just the final answer.' },
    { code: 'SETUP_ERROR',         label: 'Problem setup error',
      why_it_happens: 'Question was misread and the equation set up incorrectly from the start.',
      fix_strategy:   'Before writing anything, ask: what is the question actually asking me to FIND?' },
    { code: 'CONCEPTUAL_ERROR',    label: 'Conceptual misunderstanding',
      why_it_happens: 'The underlying concept has a gap — the student does not fully understand the topic.',
      fix_strategy:   'Re-read the concept section. Try the simplest possible version of this question type first.' },
    { code: 'ROUNDING_ERROR',      label: 'Rounding too early',
      why_it_happens: 'An intermediate value was rounded, causing the final answer to drift.',
      fix_strategy:   'Keep full decimal precision until the last step. Only round the final answer.' },
  ],
  'Add Maths': [
    { code: 'DIFFERENTIATION_INTEGRATION_CONFUSION', label: 'Differentiation vs Integration confusion',
      why_it_happens: 'Both involve polynomials and rules look similar.',
      fix_strategy:   'dy/dx / gradient / rate of change = differentiation. Area / integral sign = integration.' },
    { code: 'CHAIN_RULE_MISSED',   label: 'Chain rule not applied',
      why_it_happens: 'Outer function differentiated but inner function derivative was not multiplied.',
      fix_strategy:   'Whenever you see a function inside a function, ask: does the inside also need differentiating?' },
    { code: 'LOG_RULES_ERROR',     label: 'Logarithm laws misapplied',
      why_it_happens: 'log(A+B) confused with log(A)+log(B), or change of base formula misremembered.',
      fix_strategy:   'Write all log laws on an index card. Review before tackling any log question.' },
    { code: 'SIGN_ERROR',          label: 'Sign error',
      why_it_happens: 'In Add Maths, one early sign error compounds across multiple steps.',
      fix_strategy:   'After each step verify: should this term be positive or negative?' },
    { code: 'FORMULA_WRONG',       label: 'Wrong formula applied',
      why_it_happens: 'Add Maths has many similar-looking formulas across chapters.',
      fix_strategy:   'Identify the chapter first, then recall the specific formula for that chapter.' },
    { code: 'CONCEPTUAL_ERROR',    label: 'Conceptual misunderstanding',
      why_it_happens: 'A gap in the underlying concept causes systematic errors.',
      fix_strategy:   'Review the concept. Try one easier question to rebuild confidence.' },
  ],
  Physics: [
    { code: 'FORMULA_WRONG',       label: 'Wrong formula applied',
      why_it_happens: 'Many similar-looking formulas across topics get mixed up.',
      fix_strategy:   'Write the formula with its topic name at the top. Never start calculating without naming it.' },
    { code: 'UNITS_WRONG',         label: 'Wrong or missing units',
      why_it_happens: 'SI units mixed with derived units, or forgotten to convert (km to m, g to kg).',
      fix_strategy:   'First line of every Physics solution: convert all given values to SI units. Then substitute.' },
    { code: 'SUBSTITUTION_ERROR',  label: 'Incorrect substitution',
      why_it_happens: 'Right formula identified but values assigned to wrong variables.',
      fix_strategy:   'Before substituting write: u=__, v=__, a=__, t=__ and match to formula.' },
    { code: 'DIRECTION_ERROR',     label: 'Direction/vector sign error',
      why_it_happens: 'Direction ignored in vector quantities.',
      fix_strategy:   'At the start define which direction is positive. Write it down. Apply consistently.' },
    { code: 'CONCEPTUAL_ERROR',    label: 'Conceptual misunderstanding',
      why_it_happens: 'A fundamental concept is not solidified.',
      fix_strategy:   'Re-read the concept, then think of a real-world example where you can observe it.' },
  ],
  Chemistry: [
    { code: 'EQUATION_NOT_BALANCED', label: 'Chemical equation not balanced',
      why_it_happens: 'Correct compounds written but atoms not balanced on both sides.',
      fix_strategy:   'After writing any equation, count each element on both sides using a tally.' },
    { code: 'MOLE_CONCEPT_ERROR',  label: 'Mole calculation error',
      why_it_happens: 'Multiple conversions (mass, moles, particles) get mixed up.',
      fix_strategy:   'Draw the mole triangle: mass / (molar mass x moles). Cover what you want to find.' },
    { code: 'WRONG_FORMULA',       label: 'Wrong chemical formula',
      why_it_happens: 'Formula of different compound used, or valency wrong.',
      fix_strategy:   'Look up the valency of each element in the periodic table before writing formula.' },
    { code: 'CONCEPTUAL_ERROR',    label: 'Conceptual error',
      why_it_happens: 'A chemistry concept is misunderstood.',
      fix_strategy:   'Review the concept focusing on understanding the "why", not just the steps.' },
  ],
  Biology: [
    { code: 'PROCESS_CONFUSED',    label: 'Biological process confused with another',
      why_it_happens: 'Photosynthesis/respiration, mitosis/meiosis — similar processes get swapped.',
      fix_strategy:   'Create a comparison table for easily-confused processes.' },
    { code: 'MISSING_KEYWORDS',    label: 'Missing SPM keywords',
      why_it_happens: 'Everyday language used instead of required biological terms.',
      fix_strategy:   'Check: have I used the correct biological term for every process/structure mentioned?' },
    { code: 'INCOMPLETE_EXPLANATION', label: 'Explanation missing cause-effect link',
      why_it_happens: 'Student states the fact but does not complete the chain of reasoning.',
      fix_strategy:   'Use: [Observation] -> [Because...] -> [Therefore/Result].' },
    { code: 'CONCEPTUAL_ERROR',    label: 'Conceptual error',
      why_it_happens: 'A biology concept is misunderstood.',
      fix_strategy:   'Re-read the concept. Explain it back in your own words to check understanding.' },
  ],
  English: [
    { code: 'TENSE_ERROR',         label: 'Tense error',
      why_it_happens: 'Tenses mixed within a passage or wrong tense chosen for context.',
      fix_strategy:   'Before writing decide: is this now, past, or future? Circle it. Commit to it.' },
    { code: 'GRAMMAR_STRUCTURE',   label: 'Grammar structure error',
      why_it_happens: 'A specific grammar rule applied incorrectly.',
      fix_strategy:   'Look up the rule and find 3 correct examples. Then write your own 3.' },
    { code: 'VOCABULARY_WRONG',    label: 'Wrong word choice',
      why_it_happens: 'Meaning roughly right but word does not fit context or register.',
      fix_strategy:   'Ask: does this fit the formal/informal level? Is this the exact meaning needed?' },
    { code: 'SUBJECT_VERB_AGREEMENT', label: 'Subject-verb agreement error',
      why_it_happens: 'Singular/plural lost track of in long sentences.',
      fix_strategy:   'Find the subject (who/what does the action?). Match verb to it. Ignore words in between.' },
    { code: 'INCOMPLETE_ANSWER',   label: 'Incomplete answer',
      why_it_happens: 'Part of the question answered but not all parts addressed.',
      fix_strategy:   'Before answering: number each thing the question asks for. Write one answer per number.' },
  ],
  'Bahasa Melayu': [
    { code: 'IMBUHAN_WRONG',       label: 'Wrong imbuhan (prefix/suffix)',
      why_it_happens: 'Rules for imbuhan change based on root word first letter, with exceptions.',
      fix_strategy:   'Learn imbuhan rules grouped by root word first letter. Use a reference table until memorised.' },
    { code: 'AYAT_STRUCTURE',      label: 'Incorrect ayat structure',
      why_it_happens: 'Word order in Malay differs from English and rules get confused.',
      fix_strategy:   'For each sentence identify: Subjek -> Predikat. Ensure order follows BM rules.' },
    { code: 'PERIBAHASA_WRONG',    label: 'Wrong peribahasa or wrong context',
      why_it_happens: 'Student knows the peribahasa but applied it in wrong context.',
      fix_strategy:   'For each peribahasa memorise the exact context it is used in — the pairing is what matters.' },
    { code: 'KARANGAN_STRUCTURE',  label: 'Essay structure issue',
      why_it_happens: 'Pendahuluan, isi, or penutup sections weak or missing SPM conventions.',
      fix_strategy:   'Formula: Pendahuluan (2-3 sentences) -> 3-4 Isi (huraian + contoh each) -> Penutup (rumusan + harapan).' },
    { code: 'TATABAHASA_ERROR',    label: 'Tatabahasa error',
      why_it_happens: 'A specific BM grammar rule applied incorrectly.',
      fix_strategy:   'Rujuk buku tatabahasa BM. Praktikkan dengan menulis 5 ayat menggunakan peraturan tersebut.' },
  ],
};

const FREQUENCY_LABELS = {
  1: { label: 'First time',  emoji: '📝', advice: 'New mistake — understand it now before it becomes a habit.' },
  2: { label: 'Seen before', emoji: '⚠️',  advice: 'Same mistake type before. Let\'s stop this becoming a pattern.' },
  3: { label: 'Recurring',   emoji: '🔴', advice: 'Third time this type appeared. The underlying concept needs focused attention.' },
};

function getFrequencyLabel(count) {
  if (count >= 3) return FREQUENCY_LABELS[3];
  return FREQUENCY_LABELS[count] || FREQUENCY_LABELS[1];
}

function getMistakeTypes(subject) {
  for (const key of Object.keys(MISTAKE_TAXONOMY)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return MISTAKE_TAXONOMY[key];
  }
  return MISTAKE_TAXONOMY['Mathematics'].filter(m => ['CONCEPTUAL_ERROR','WRONG_OPERATION','INCOMPLETE_WORKING'].includes(m.code));
}

module.exports = { MISTAKE_TAXONOMY, getMistakeTypes, getFrequencyLabel };
'@ | Out-File -FilePath "$libDir\mistake_taxonomy.js" -Encoding UTF8
Write-Host "  [OK] src/lib/mistake_taxonomy.js"

# ─── mistake_intelligence.js ─────────────────────────────────────────────────
@'
// src/lib/mistake_intelligence.js
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { getMistakeTypes, getFrequencyLabel } = require('./mistake_taxonomy');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function classifyMistake({ subject, topic, question, studentAnswer, correctAnswer, studentWorking }) {
  const mistakeTypes = getMistakeTypes(subject);
  const typesList = mistakeTypes.map(m => `${m.code}: ${m.label}`).join('\n');

  const prompt = `You are an expert SPM ${subject} examiner diagnosing a student mistake.
Question: ${question}
Correct answer: ${correctAnswer || '(see working)'}
Student answer: ${studentAnswer}
${studentWorking ? `Student working:\n${studentWorking}` : ''}

Mistake categories available:
${typesList}

Return JSON only:
{
  "mistake_code": "<one code from above>",
  "confidence": <0.0-1.0>,
  "what_student_did": "<exactly what they did wrong, 1-2 sentences>",
  "what_was_correct": "<what part was right, if any>",
  "specific_details": { "wrong_step": "...", "student_wrote": "...", "should_be": "..." }
}`;

  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    let text = r.content[0].text.trim();
    if (text.includes('```')) text = text.split('```')[1].replace(/^json\n?/, '').trim();
    const c = JSON.parse(text);
    const mt = mistakeTypes.find(m => m.code === c.mistake_code) || mistakeTypes.find(m => m.code === 'CONCEPTUAL_ERROR') || mistakeTypes[0];
    return { code: c.mistake_code, label: mt.label, confidence: c.confidence,
      what_did: c.what_student_did, what_correct: c.what_was_correct, details: c.specific_details,
      why_it_happens: mt.why_it_happens, fix_strategy: mt.fix_strategy };
  } catch (e) {
    return { code: 'CONCEPTUAL_ERROR', label: 'Understanding gap', confidence: 0.5,
      what_did: 'The answer was incorrect.', what_correct: null, details: {},
      why_it_happens: 'The underlying concept may need more review.',
      fix_strategy: 'Re-read the concept section and try a simpler question first.' };
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
      question: question?.substring(0, 500),
      student_answer: studentAnswer?.substring(0, 500),
      mistake_code: mistakeCode, mistake_label: mistakeLabel, details: details || {},
    });
  } catch (e) { console.error('Mistake log error:', e.message); }
}

async function generateTutorResponse({ subject, topic, question, studentAnswer, correctAnswer, classification, mistakeHistory, attempt }) {
  const isRecurring = mistakeHistory.length >= 2;
  const system = `You are a warm, encouraging SPM ${subject} tutor explaining a student mistake like a human teacher would.
Rules:
- Never just say "Wrong" — acknowledge what was right first
- Name the mistake clearly but kindly
- Explain WHY this usually happens
- Give a specific fix for THIS question
- If recurring, gently flag the pattern and suggest targeted practice
- Under 200 words. Use **bold** for key terms. End with one concrete next action.`;

  const recurring = isRecurring ? `This student has made this same type (${classification.label}) ${mistakeHistory.length} times in ${subject}. Gently flag the pattern.` : '';
  const user = `Question: ${question}\nStudent answer: ${studentAnswer}\nCorrect: ${correctAnswer || 'see worked solution'}\nMistake: ${classification.label}\nWhat they did: ${classification.what_did}\nWhat was correct: ${classification.what_correct || 'N/A'}\nWhy it happens: ${classification.why_it_happens}\nFix: ${classification.fix_strategy}\n${recurring}\nAttempt: ${attempt}\n\nWrite a human tutor response that: 1) Acknowledges correct parts 2) Names what went wrong specifically 3) Explains why this happens 4) Gives the specific fix 5) Ends with one concrete action.`;

  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251022', max_tokens: 400, system,
      messages: [{ role: 'user', content: user }],
    });
    return r.content[0].text.trim();
  } catch (e) {
    const right = classification.what_correct ? `✅ **What you got right:** ${classification.what_correct}\n\n` : '';
    return `${right}⚠️ **Mistake:** ${classification.label}\n\n${classification.what_did}\n\n**Why this happens:** ${classification.why_it_happens}\n\n${correctAnswer ? `**Correct answer:** ${correctAnswer}\n\n` : ''}**Fix:** ${classification.fix_strategy}`;
  }
}

async function processMistake({ studentId, subject, topic, question, studentAnswer, correctAnswer, studentWorking, attempt }) {
  const classification = await classifyMistake({ subject, topic, question, studentAnswer, correctAnswer, studentWorking });
  const [mistakeHistory] = await Promise.all([getMistakeHistory(studentId, subject, classification.code)]);
  if (studentId) {
    await logMistake({ studentId, subject, topic, question, studentAnswer,
      mistakeCode: classification.code, mistakeLabel: classification.label, details: classification.details });
  }
  const tutorResponse = await generateTutorResponse({ subject, topic, question, studentAnswer, correctAnswer, classification, mistakeHistory, attempt });
  const freq = getFrequencyLabel(mistakeHistory.length + 1);
  return {
    mistake_code: classification.code, mistake_label: classification.label, confidence: classification.confidence,
    tutor_response: tutorResponse, is_recurring: mistakeHistory.length >= 2,
    occurrence_count: mistakeHistory.length + 1, frequency_label: freq.label, frequency_emoji: freq.emoji,
    fix_strategy: classification.fix_strategy, why_it_happens: classification.why_it_happens,
    pattern_alert: mistakeHistory.length >= 2 ? `Recurring ${classification.label} in ${subject} — ${mistakeHistory.length + 1} times` : null,
  };
}

async function getMistakeSummary(studentId, daysBack = 30) {
  try {
    const since = new Date(); since.setDate(since.getDate() - daysBack);
    const { data } = await supabase.from('mistake_log').select('subject, topic, mistake_code, mistake_label, created_at')
      .eq('student_id', studentId).gte('created_at', since.toISOString()).order('created_at', { ascending: false });
    const summary = {};
    (data || []).forEach(m => {
      if (!summary[m.subject]) summary[m.subject] = {};
      if (!summary[m.subject][m.mistake_code]) summary[m.subject][m.mistake_code] = { label: m.mistake_label, count: 0, topics: new Set() };
      summary[m.subject][m.mistake_code].count++;
      summary[m.subject][m.mistake_code].topics.add(m.topic);
    });
    const result = {};
    for (const [subj, mistakes] of Object.entries(summary)) {
      result[subj] = Object.entries(mistakes).map(([code, info]) => ({
        code, label: info.label, count: info.count, topics: [...info.topics],
        severity: info.count >= 3 ? 'high' : info.count >= 2 ? 'medium' : 'low',
      })).sort((a, b) => b.count - a.count).slice(0, 5);
    }
    return result;
  } catch (e) { return {}; }
}

module.exports = { processMistake, getMistakeSummary, classifyMistake };
'@ | Out-File -FilePath "$libDir\mistake_intelligence.js" -Encoding UTF8
Write-Host "  [OK] src/lib/mistake_intelligence.js"

Write-Host ""
Write-Host "Backend lib files written. Now writing routes..." -ForegroundColor Cyan
