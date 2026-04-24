import AdmZip from 'adm-zip';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SUBJECT_MAP = {
  'Matematik_BY-E-SQUARE_TP.zip': 'Mathematics',
  'Matematik-Tambahan_BY-E-SQUARE_TP.zip': 'Add Maths',
  'Biologi_BY-E-SQUARE_TP.zip': 'Biology',
  'Fizik_BY-E-SQUARE_TP.zip': 'Physics',
  'Kimia_BY-E-SQUARE_TP.zip': 'Chemistry',
  'Bahasa-Inggeris_BY-E-SQUARE_TP.zip': 'English',
  'Bahasa-Melayu_BY-E-SQUARE_TP.zip': 'Bahasa Malaysia',
};

async function extractQuestionsFromPDF(pdfBuffer, subject, filename) {
  try {
    const pdfData = await pdf(pdfBuffer);
    const text = pdfData.text.substring(0, 8000);
    if (text.trim().length < 100) return [];
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: 'Extract ALL MCQ questions from this Malaysian SPM ' + subject + ' paper. Return ONLY JSON array: [{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A or null","topic":"topic or General","source":"' + filename + '"}]. If none found return []. Text:\n' + text }]
    });
    const raw = response.content[0].text.trim().replace(/```json|```/g,'').trim();
    const result = JSON.parse(raw);
    return Array.isArray(result) ? result : [];
  } catch(e) { console.error('  Extract error:', e.message); return []; }
}

const zipPath = process.argv[2];
const subject = SUBJECT_MAP[zipPath.split(/[/\\]/).pop()] || 'Mathematics';
console.log('[EXTRACT] Processing:', zipPath, '(' + subject + ')');
const zip = new AdmZip(zipPath);
const entries = zip.getEntries().filter(e => e.entryName.match(/K1/i) && e.entryName.endsWith('.pdf') && e.header.size > 10000);
console.log('[EXTRACT] Found', entries.length, 'K1 papers');
let total = 0;
for (const entry of entries.slice(0,3)) {
  const filename = entry.entryName.split(/[/\\]/).pop();
  console.log(' Processing:', filename);
  const qs = await extractQuestionsFromPDF(entry.getData(), subject, filename);
  console.log('  Got', qs.length, 'questions');
  if (qs.length > 0) console.log('  Sample:', qs[0].question?.substring(0,80));
  total += qs.length;
}
console.log('[DONE] Total:', total);
