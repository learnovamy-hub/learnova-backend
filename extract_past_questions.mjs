import fs from 'fs';
import path from 'path';

import AdmZip from 'adm-zip';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const pdfParse = (await import('pdf-parse')).default;

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SUBJECT_MAP = {
  'Matematik_BY-E-SQUARE_TP.zip':           { subject: 'Mathematics',       form: 4 },
  'Matematik-Tambahan_BY-E-SQUARE_TP.zip':  { subject: 'Add Maths',         form: 4 },
  'Biologi_BY-E-SQUARE_TP.zip':             { subject: 'Biology',           form: 4 },
  'Fizik_BY-E-SQUARE_TP.zip':               { subject: 'Physics',           form: 4 },
  'Kimia_BY-E-SQUARE_TP.zip':               { subject: 'Chemistry',         form: 4 },
  'Bahasa-Inggeris_BY-E-SQUARE_TP.zip':     { subject: 'English',           form: 4 },
  'Bahasa-Melayu_BY-E-SQUARE_TP.zip':       { subject: 'Bahasa Malaysia',   form: 4 },
};

const PAST_QUESTIONS_DIR = 'C:/Users/Yong/OneDrive/learnova/learnova-backend/past questions';
const EXTRACT_DIR = 'C:/Users/Yong/OneDrive/learnova/learnova-backend/past_questions_extracted';

async function extractQuestionsFromPDF(pdfBuffer, subject, filename) {
  try {
    const { default: pdfParse } = await import('pdf-parse');
    const pdfData = await pdfParse(pdfBuffer);
    const text = pdfData.text.substring(0, 8000); // limit tokens

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are extracting MCQ questions from a Malaysian SPM ${subject} past year trial paper.

Here is the extracted text from the PDF:
${text}

Extract ALL multiple choice questions (soalan objektif). For each question:
- Extract the question text
- Extract all 4 options (A, B, C, D)
- If answer key is visible, include the correct answer
- Identify the topic if possible

Return ONLY a valid JSON array, no markdown:
[
  {
    "question": "Question text here",
    "options": {"A": "option a", "B": "option b", "C": "option c", "D": "option d"},
    "correct_answer": "A",
    "topic": "topic name or null",
    "source": "${filename}"
  }
]

If no MCQ questions found, return empty array: []`
      }]
    });

    const text2 = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const questions = JSON.parse(text2);
    return Array.isArray(questions) ? questions : [];
  } catch (err) {
    console.error(`  Error extracting from ${filename}:`, err.message);
    return [];
  }
}

async function processZip(zipPath, subject) {
  console.log(`\n[EXTRACT] Processing: ${path.basename(zipPath)} (${subject})`);
  
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(e => 
    e.entryName.match(/K1/i) && 
    e.entryName.endsWith('.pdf') && 
    e.header.size > 0
  );

  console.log(`[EXTRACT] Found ${entries.length} K1 papers`);
  
  let totalQuestions = 0;

  for (const entry of entries) {
    const filename = path.basename(entry.entryName);
    console.log(`  Processing: ${filename}`);

    try {
      const pdfBuffer = entry.getData();
      const questions = await extractQuestionsFromPDF(pdfBuffer, subject, filename);
      
      if (questions.length === 0) {
        console.log(`  No questions extracted from ${filename}`);
        continue;
      }

      console.log(`  Extracted ${questions.length} questions`);

      // Group by topic and create quizzes
      const byTopic = {};
      for (const q of questions) {
        const topic = q.topic || 'General';
        if (!byTopic[topic]) byTopic[topic] = [];
        byTopic[topic].push(q);
      }

      for (const [topic, topicQuestions] of Object.entries(byTopic)) {
        // Find or create quiz for this topic
        const quizTitle = `${topic} - SPM Trial ${filename.match(/\d{4}/)?.[0] || 'Past Year'}`;
        
        const { data: existing } = await supabase
          .from('quizzes')
          .select('id')
          .eq('title', quizTitle)
          .eq('subject', subject)
          .maybeSingle();

        let quizId;
        if (existing) {
          quizId = existing.id;
        } else {
          const { data: quiz, error: qe } = await supabase
            .from('quizzes')
            .insert([{
              title: quizTitle,
              topic: topic,
              subject: subject,
              question_count: topicQuestions.length,
              total_questions: topicQuestions.length,
              difficulty: 'mixed',
              is_published: true,
            }])
            .select()
            .single();

          if (qe) { console.error('  Quiz insert error:', qe.message); continue; }
          quizId = quiz.id;
        }

        // Insert questions
        const questionRows = topicQuestions.map(q => ({
          quiz_id: quizId,
          question: q.question,
          type: 'mcq',
          question_type: 'mcq',
          options: q.options,
          correct_answer: q.correct_answer || null,
          explanation: `Source: ${q.source}`,
        }));

        const { error: qerr } = await supabase.from('quiz_questions').insert(questionRows);
        if (qerr) { console.error('  Questions insert error:', qerr.message); continue; }
        
        totalQuestions += topicQuestions.length;
      }

      // Rate limit delay
      await new Promise(r => setTimeout(r, 1500));

    } catch (err) {
      console.error(`  Error processing ${filename}:`, err.message);
    }
  }

  console.log(`[EXTRACT] Done: ${subject} — ${totalQuestions} questions added`);
  return totalQuestions;
}

async function main() {
  const zipFile = process.argv[2];
  
  if (zipFile) {
    // Process single zip
    const info = SUBJECT_MAP[path.basename(zipFile)];
    if (!info) { console.error('Unknown zip file'); process.exit(1); }
    await processZip(zipFile, info.subject);
  } else {
    // Process all zips
    let grandTotal = 0;
    for (const [filename, info] of Object.entries(SUBJECT_MAP)) {
      const zipPath = path.join(PAST_QUESTIONS_DIR, filename);
      if (fs.existsSync(zipPath)) {
        const count = await processZip(zipPath, info.subject);
        grandTotal += count;
      } else {
        console.log(`[SKIP] Not found: ${filename}`);
      }
    }
    console.log(`\n[DONE] Grand total: ${grandTotal} questions extracted`);
  }
}

main().catch(console.error);


