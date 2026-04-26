const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CHAPTERS = [
  { num: 1, topic: 'Quadratic Functions and Equations', pages: [1, 32] },
  { num: 2, topic: 'Number Bases', pages: [33, 53] },
  { num: 3, topic: 'Mathematical Logic', pages: [54, 93] },
  { num: 4, topic: 'Set Operations', pages: [94, 127] },
  { num: 5, topic: 'Network and Graphs', pages: [128, 153] },
  { num: 6, topic: 'Linear Inequalities in Two Variables', pages: [154, 175] },
  { num: 7, topic: 'Motion Graphs', pages: [176, 195] },
  { num: 8, topic: 'Data Dispersion', pages: [196, 220] },
  { num: 9, topic: 'Probability of Combined Events', pages: [221, 250] },
  { num: 10, topic: 'Consumer Mathematics', pages: [251, 321] },
];

async function extractText(pdfPath, startPage, endPage) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = startPage; i <= Math.min(endPage, doc.numPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

function safeParseJSON(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found');
  let jsonStr = text.substring(start, end + 1);
  // Replace real newlines inside JSON strings with escaped version
  jsonStr = jsonStr.replace(/(?<=: "[^"]*)\n(?=[^"]*")/g, ' ');
  jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\r/g, ' ');
  return JSON.parse(jsonStr);
}

async function main() {
  const pdfPath = process.argv[2];
  const chapterNum = parseInt(process.argv[3]) || 0;
  const chapters = chapterNum ? CHAPTERS.filter(c => c.num === chapterNum) : CHAPTERS;

  for (const ch of chapters) {
    console.log('[LESSON] Chapter', ch.num, ch.topic);

    const { data: ex } = await supabase.from('lessons').select('id')
      .eq('topic', ch.topic).eq('subject', 'Mathematics').maybeSingle();
    if (ex) { console.log('[LESSON] Exists, skip'); continue; }

    const text = await extractText(pdfPath, ch.pages[0], ch.pages[1]);
    console.log('[LESSON] Text length:', text.length);

    const prompt = `You are creating SPM Form 4 Mathematics lesson content for Malaysian students.

Textbook extract for Chapter ${ch.num}: ${ch.topic}

${text.substring(0, 5000)}

Create a lesson using this JSON structure. IMPORTANT: Use only double quotes, escape any quotes inside strings, no newlines inside string values.

Return ONLY this JSON with no markdown:
{"title":"Chapter ${ch.num}: ${ch.topic}","topic":"${ch.topic}","subject":"Mathematics","form_level":4,"introduction":"Write 2-3 sentences introducing this topic and why it matters for SPM students.","content":"Explain the key concepts, formulas and methods for this topic in plain text.","worked_examples":"Example 1: [question]. Solution: [step by step]. Example 2: [question]. Solution: [step by step].","common_mistakes":"1. [mistake and how to avoid]. 2. [mistake]. 3. [mistake].","summary":"Key points: 1. [point] 2. [point] 3. [point]","learning_objectives":["Understand ${ch.topic} concepts","Apply formulas correctly","Solve SPM exam questions","Identify common errors"]}`;

    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: 'You must return valid JSON only. Never use actual newline characters inside JSON string values. Use the literal text \\n instead of newlines inside strings.',
      messages: [{ role: 'user', content: prompt }]
    });

    let lesson;
    try {
      lesson = safeParseJSON(r.content[0].text);
    } catch(e) {
      console.error('[LESSON] Parse error:', e.message);
      fs.writeFileSync('./debug_lesson.txt', r.content[0].text);
      console.log('[LESSON] Raw response saved to debug_lesson.txt');
      continue;
    }

    const { error } = await supabase.from('lessons').insert([{
      title: lesson.title,
      topic: lesson.topic,
      subject: lesson.subject,
      form_level: lesson.form_level,
      introduction: lesson.introduction,
      content: lesson.content,
      worked_examples: lesson.worked_examples,
      common_mistakes: lesson.common_mistakes,
      summary: lesson.summary,
      learning_objectives: lesson.learning_objectives,
      status: 'published',
      source: 'textbook_kpm',
      chapter_number: ch.num,
    }]);

    if (error) { console.error('[LESSON] Save error:', error.message); continue; }
    console.log('[LESSON] Saved:', lesson.title);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('[LESSON] Done!');
}

main().catch(console.error);



