const AdmZip = require('adm-zip');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SUBJECT_MAP = {
  'Matematik_BY-E-SQUARE_TP.zip':          'Mathematics',
  'Matematik-Tambahan_BY-E-SQUARE_TP.zip': 'Add Maths',
  'Biologi_BY-E-SQUARE_TP.zip':            'Biology',
  'Fizik_BY-E-SQUARE_TP.zip':              'Physics',
  'Kimia_BY-E-SQUARE_TP.zip':              'Chemistry',
  'Bahasa-Inggeris_BY-E-SQUARE_TP.zip':    'English',
  'Bahasa-Melayu_BY-E-SQUARE_TP.zip':      'Bahasa Malaysia',
};

async function extractText(pdfBuffer) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const doc = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  } catch(e) { return ''; }
}

async function extractQuestionsFromText(text, subject, filename) {
  try {
    if (text.trim().length < 200) return [];
    const truncated = text.substring(0, 8000);
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Extract ALL multiple choice questions (soalan objektif/MCQ) from this Malaysian SPM ${subject} trial paper.

For each question extract:
- The full question text
- All 4 options A, B, C, D
- Correct answer if visible in answer scheme
- Topic (guess from content)

Return ONLY valid JSON array, no markdown:
[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A","topic":"Functions","source":"${filename}"}]

If no MCQ questions found, return: []

Paper text:
${truncated}`
      }]
    });
    const raw = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(raw);
    return Array.isArray(result) ? result : [];
  } catch(e) {
    console.error('  Claude error:', e.message);
    return [];
  }
}

async function saveQuestionsToDb(questions, subject) {
  if (questions.length === 0) return 0;

  // Group by topic
  const byTopic = {};
  for (const q of questions) {
    const topic = q.topic || 'General';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(q);
  }

  let saved = 0;
  for (const [topic, qs] of Object.entries(byTopic)) {
    const year = (qs[0].source || '').match(/\d{4}/)?.[0] || 'Trial';
    const quizTitle = `${topic} - SPM ${year} Trial`;

    // Find or create quiz
    let { data: quiz } = await supabase.from('quizzes').select('id').eq('title', quizTitle).eq('subject', subject).maybeSingle();
    
    if (!quiz) {
      const { data: newQuiz, error } = await supabase.from('quizzes').insert([{
        title: quizTitle, topic, subject,
        question_count: qs.length, total_questions: qs.length,
        difficulty: 'mixed', is_published: true,
      }]).select().single();
      if (error) { console.error('  Quiz create error:', error.message); continue; }
      quiz = newQuiz;
    }

    const rows = qs.map(q => ({
      quiz_id: quiz.id, question: q.question,
      type: 'mcq', question_type: 'mcq',
      options: q.options, correct_answer: q.correct_answer || 'A',
      explanation: `SPM Trial - ${q.source || 'Past Year'}`,
    }));

    const { error } = await supabase.from('quiz_questions').insert(rows);
    if (error) { console.error('  Questions insert error:', error.message); continue; }
    saved += qs.length;
  }
  return saved;
}

async function processZip(zipPath, subject, maxPapers) {
  console.log(`\n[EXTRACT] ${path.basename(zipPath)} (${subject})`);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(e =>
    e.entryName.match(/K1/i) &&
    e.entryName.endsWith('.pdf') &&
    e.header.size > 10000 &&
    !e.entryName.match(/[Jj]awapan|[Ss]kema|[Aa]nswer/)
  );
  console.log(`[EXTRACT] Found ${entries.length} question papers (excluding answer keys)`);

  let totalSaved = 0;
  const limit = maxPapers || entries.length;

  for (const entry of entries.slice(0, limit)) {
    const filename = path.basename(entry.entryName);
    console.log(`  Processing: ${filename}`);
    const text = await extractText(entry.getData());
    if (text.length < 200) { console.log('  Skipping - insufficient text'); continue; }

    const questions = await extractQuestionsFromText(text, subject, filename);
    console.log(`  Extracted: ${questions.length} questions`);

    if (questions.length > 0) {
      const saved = await saveQuestionsToDb(questions, subject);
      console.log(`  Saved: ${saved} questions`);
      totalSaved += saved;
    }

    await new Promise(r => setTimeout(r, 1000)); // rate limit
  }

  console.log(`[EXTRACT] Done: ${subject} — ${totalSaved} total questions saved`);
  return totalSaved;
}

async function main() {
  const PAST_DIR = 'C:/Users/Yong/OneDrive/learnova/learnova-backend/past questions';
  const filterZip = process.argv[2];
  const maxPapers = parseInt(process.argv[3]) || 0;

  if (filterZip) {
    const subject = SUBJECT_MAP[path.basename(filterZip)] || 'Mathematics';
    await processZip(filterZip, subject, maxPapers);
  } else {
    let grand = 0;
    for (const [filename, subject] of Object.entries(SUBJECT_MAP)) {
      const zipPath = `${PAST_DIR}/${filename}`;
      try {
        const count = await processZip(zipPath, subject, maxPapers || 5);
        grand += count;
      } catch(e) { console.error(`[SKIP] ${filename}:`, e.message); }
    }
    console.log(`\n[DONE] Grand total: ${grand} questions`);
  }
}

main().catch(console.error);


