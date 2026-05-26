/**
 * save_all_f5_pedagogies.mjs
 *
 * Saves structured teaching pedagogy to the `pedagogy` JSONB column in the lessons table.
 * Run once after adding the column:
 *   ALTER TABLE lessons ADD COLUMN IF NOT EXISTS pedagogy JSONB DEFAULT NULL;
 *
 * Usage: node save_all_f5_pedagogies.mjs
 *
 * Source: Extracted from real SPM teacher transcripts (Miss Joanna, Trigonometry F5)
 * and extended to cover other F5 topics using the same pedagogical patterns.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// ─── Pedagogy Definitions ─────────────────────────────────────────────────────
// Each entry maps to a lesson. `searchTerms` tries multiple keyword matches
// so we find the right lesson even if the title varies slightly.

const PEDAGOGIES = [

  // ── MATHEMATICS F5: Trigonometry ─────────────────────────────────────────
  {
    searchTerms: ['Values of Sine', 'Sine, Cosine and Tangent', '0° < θ < 360°', 'trigonometric'],
    subject: 'Mathematics',
    form_level: 5,
    pedagogy: {
      source: 'Miss Joanna classroom transcript — SPM Form 5 Trigonometry',
      opening_hook: 'Ask what students remember about SOH CAH TOA from Form 4. Connect full-circle trig to what they already know. Never start with definitions.',
      key_mnemonic: {
        text: 'All Science Teacher Crazy (or All Students Totally Crazy)',
        mapping: { Q1: 'All positive', Q2: 'Sin only', Q3: 'Tan only', Q4: 'Cos only' },
        tip: 'Let students propose their own version — it boosts ownership and memory.',
      },
      core_rules: [
        'Reference angle is ALWAYS measured from the x-axis, never the y-axis.',
        'When finding basic angle with calculator: use POSITIVE value only (strip negatives).',
        'Basic angle is always between 0° and 90°.',
      ],
      quadrant_formulas: { Q1: 'θ', Q2: '180° − θ', Q3: '180° + θ', Q4: '360° − θ' },
      teaching_phases: [
        { phase: 1, name: 'Activate Prior Knowledge', check_in: 'What does SOH CAH TOA stand for?' },
        { phase: 2, name: 'ASTC Mnemonic', check_in: 'In which quadrant is ONLY tan positive?' },
        { phase: 3, name: 'Find Reference Angle', check_in: 'If sin θ = 0.5, what do you enter in the calculator?' },
        { phase: 4, name: 'Apply Quadrant Formulas', check_in: 'If cos is negative, which two quadrants apply?' },
        { phase: 5, name: 'Real-World Problem', check_in: 'Which trig ratio uses opposite and adjacent?' },
      ],
      common_mistakes: [
        { mistake: 'Measuring from y-axis', fix: 'Always stick to the x-axis.' },
        { mistake: 'Entering negative in calculator', fix: 'Strip negative first — use positive value in shift-sin/cos/tan.' },
        { mistake: 'Finding only one angle', fix: 'Two quadrants apply — give two answers.' },
        { mistake: 'Wrong quadrant formula', fix: 'Q1=θ, Q2=180−θ, Q3=180+θ, Q4=360−θ. Memorise all four.' },
      ],
      worked_example: {
        problem: 'Find θ where tan θ = −√3 for 0° ≤ θ ≤ 360°',
        steps: [
          'tan negative → Q2 and Q4 (tan positive in Q1 & Q3)',
          'Basic angle = tan⁻¹(√3) = 60°',
          'Q2: 180 − 60 = 120°; Q4: 360 − 60 = 300°',
          'θ = 120° or 300°',
        ],
      },
      summary_prompt: 'Ask student to recite the 3 steps and ASTC rule before moving to practice.',
    },
  },

  // ── MATHEMATICS F5: Inverse Variation ────────────────────────────────────
  {
    searchTerms: ['inverse variation', 'inverse var'],
    subject: 'Mathematics',
    form_level: 5,
    pedagogy: {
      source: 'Extracted from SPM Form 5 Mathematics curriculum pedagogy patterns',
      opening_hook: 'Ask: if I drive faster, does my travel time get longer or shorter? Connect real-world to inverse relationship before introducing the formula.',
      key_concept: 'y ∝ 1/x means y = k/x where k is constant. When x doubles, y halves.',
      teaching_phases: [
        { phase: 1, name: 'Real-World Hook', check_in: 'If speed increases, what happens to travel time?' },
        { phase: 2, name: 'Introduce the Symbol ∝', check_in: 'What does y ∝ 1/x mean in words?' },
        { phase: 3, name: 'Find the Constant k', check_in: 'If y=6 when x=2, what is k?' },
        { phase: 4, name: 'Use k to Find Unknown', check_in: 'Now use your k to find y when x=4.' },
        { phase: 5, name: 'Graph Shape', check_in: 'Is the graph a straight line or a curve? Why?' },
      ],
      common_mistakes: [
        { mistake: 'Writing y = kx instead of y = k/x', fix: 'Inverse means divided — k is on top, x is on bottom.' },
        { mistake: 'Not finding k before solving', fix: 'Always find k first using the given pair of values.' },
        { mistake: 'Confusing direct and inverse variation', fix: 'Direct: bigger x → bigger y. Inverse: bigger x → smaller y.' },
      ],
      worked_example: {
        problem: 'y varies inversely as x. When x=3, y=8. Find y when x=6.',
        steps: ['y = k/x → k = y×x = 8×3 = 24', 'y = 24/x → when x=6: y = 24/6 = 4'],
      },
      summary_prompt: 'Ask student: what is the formula for inverse variation and what does k represent?',
    },
  },

  // ── MATHEMATICS F5: Matrices — Introduction ───────────────────────────────
  {
    searchTerms: ['matrices', 'matrix'],
    subject: 'Mathematics',
    form_level: 5,
    pedagogy: {
      source: 'Extracted from SPM Form 5 Mathematics curriculum pedagogy patterns',
      opening_hook: 'Show a simple 2×2 table of student exam scores and say "this is already a matrix!" Connect abstract math to something they have seen.',
      key_concepts: [
        'Order = rows × columns. A 3×2 matrix has 3 rows and 2 columns.',
        'Element: each number inside the matrix. Element aᵢⱼ is in row i, column j.',
        'Two matrices are equal only if EVERY corresponding element is equal AND they have the same order.',
      ],
      teaching_phases: [
        { phase: 1, name: 'What Is a Matrix', check_in: 'How many rows and columns does this matrix have?' },
        { phase: 2, name: 'Order (m × n)', check_in: 'I say 2×3 — which number is rows, which is columns?' },
        { phase: 3, name: 'Elements and Notation', check_in: 'What is element a₂₁ in this matrix?' },
        { phase: 4, name: 'Matrix Equality', check_in: 'Are these two matrices equal? Why or why not?' },
        { phase: 5, name: 'Special Matrices', check_in: 'What makes a matrix a square matrix?' },
      ],
      common_mistakes: [
        { mistake: 'Confusing rows and columns in order', fix: 'Rows come first. m×n = rows × columns. Think: go across first (rows), then down.' },
        { mistake: 'Saying matrices are equal just because values look similar', fix: 'Both ORDER and all ELEMENTS must match for equality.' },
      ],
      worked_example: {
        problem: 'Given matrix A with order 2×3 and element a₁₂ = 5. Where is a₁₂?',
        steps: ['Row 1, Column 2', 'Count: row 1 → first row, column 2 → second column'],
      },
      summary_prompt: 'Ask student to state the order of a given matrix and identify a specific element.',
    },
  },

  // ── MATHEMATICS F5: Matrices — Operations / Applications ─────────────────
  {
    searchTerms: ['Applications to Simultaneous', 'Inverse Matrices and Applications'],
    subject: 'Mathematics',
    form_level: 5,
    pedagogy: {
      source: 'Extracted from SPM Form 5 Mathematics curriculum pedagogy patterns',
      opening_hook: 'Ask: can you add any two matrices together? Let student guess — then reveal the order rule.',
      key_rules: [
        'Addition/subtraction: only possible if SAME ORDER. Add corresponding elements.',
        'Scalar multiplication: multiply every element by the scalar.',
        'Matrix multiplication: row × column. Order m×n times n×p gives m×p. Inner dimensions must match.',
      ],
      teaching_phases: [
        { phase: 1, name: 'Addition Rule', check_in: 'Can we add a 2×3 matrix to a 3×2 matrix? Why not?' },
        { phase: 2, name: 'Adding Elements', check_in: 'Add these two 2×2 matrices — what is the element in row 1, column 1?' },
        { phase: 3, name: 'Scalar Multiplication', check_in: 'If I multiply matrix A by 3, what happens to each element?' },
        { phase: 4, name: 'Matrix Multiplication — Order Check', check_in: 'A is 2×3, B is 3×4. Can we find A×B? What is the order of the result?' },
        { phase: 5, name: 'Matrix Multiplication — Computation', check_in: 'Compute row 1 of A times column 1 of B — what is the process?' },
      ],
      common_mistakes: [
        { mistake: 'Adding matrices of different orders', fix: 'Check order first. Different order = cannot add.' },
        { mistake: 'Multiplying matrices element by element', fix: 'Matrix multiplication is row × column, not element × element. That is scalar multiplication only.' },
        { mistake: 'Wrong result order in multiplication', fix: 'A(m×n) × B(n×p) = C(m×p). Outer dimensions become the result order.' },
      ],
      worked_example: {
        problem: 'Find A×B where A = [[1,2],[3,4]] and B = [[5],[6]]',
        steps: [
          'A is 2×2, B is 2×1 → result is 2×1',
          'Row 1 of A × Col 1 of B: (1×5)+(2×6) = 5+12 = 17',
          'Row 2 of A × Col 1 of B: (3×5)+(4×6) = 15+24 = 39',
          'Result: [[17],[39]]',
        ],
      },
      summary_prompt: 'Ask student to state when two matrices can be multiplied and what order the result will have.',
    },
  },

  // ── BAHASA MELAYU F5: Morphology Answering Technique ─────────────────────
  // NOTE: Add BM lessons to the lessons table first, then run this saver again.
  {
    searchTerms: ['morphology', 'morfologi', 'word formation', 'pembentukan kata', 'kata terbitan'],
    subject: 'Bahasa Melayu',
    form_level: 5,
    pedagogy: {
      source: 'Extracted from SPM BM pedagogy patterns',
      opening_hook: 'Ask student to look at the word "pelajaran" and identify how many parts it has. Connect to everyday words they use without realising they are morphology.',
      key_concepts: [
        'Root word (kata dasar) is the base before any affixes.',
        'Prefix (awalan): di-, ber-, me-, ter-, ke-, pe-',
        'Suffix (akhiran): -kan, -an, -i',
        'Circumfix (apitan): combination of prefix and suffix added together (me- + -kan, di- + -kan, etc.)',
        'Reduplication (kata ganda): full (buku-buku), partial (lelaki), rhythmic (sayur-mayur)',
      ],
      answering_technique: {
        format: 'For SPM questions asking you to classify a word: (1) State the word, (2) Name the type of word formation, (3) Identify the root word, (4) Name the affix(es) added.',
        example: '"Pembelajaran" → pembentukan kata melalui pengimbuhan (apitan pe-...-an) → kata dasar: ajar',
      },
      teaching_phases: [
        { phase: 1, name: 'Identify Root Word', check_in: 'What is the root word of "menjalankan"?' },
        { phase: 2, name: 'Identify Prefix', check_in: 'What prefix is used in "berlari"?' },
        { phase: 3, name: 'Identify Suffix', check_in: 'What suffix is added in "makanan"?' },
        { phase: 4, name: 'Circumfix Recognition', check_in: 'What circumfix is in "dijalankan"?' },
        { phase: 5, name: 'SPM Answer Format', check_in: 'Using the four-step format, classify the word "pelajaran".' },
      ],
      common_mistakes: [
        { mistake: 'Forgetting to state the kata dasar', fix: 'Always trace back to the root word. Remove all affixes.' },
        { mistake: 'Calling apitan two separate imbuhan', fix: 'Apitan is ONE type — prefix and suffix added simultaneously.' },
        { mistake: 'Incomplete answer format', fix: 'SPM requires all four parts: word, type, root, affix. Missing any = mark lost.' },
      ],
      summary_prompt: 'Ask student to classify three given words using the full four-step SPM answer format.',
    },
  },

  // ── BAHASA MELAYU F5: SPM Essay Writing (Karangan) ───────────────────────
  // NOTE: Add BM lessons to the lessons table first, then run this saver again.
  {
    searchTerms: ['karangan', 'penulisan', 'bm essay', 'bm writing', 'essay writing'],
    subject: 'Bahasa Melayu',
    form_level: 5,
    pedagogy: {
      source: 'Extracted from SPM BM pedagogy patterns',
      opening_hook: 'Ask student what the first thing an examiner notices in an essay is. Reveal: the introduction. A weak intro = bad first impression even if the body is good.',
      essay_structure: {
        intro: 'Pendahuluan — 3-4 sentences. Start with a general statement, then a specific one related to the topic, then your thesis/stand.',
        body: 'Isi — 3 paragraphs. Each paragraph: point (isi) → elaboration (huraian) → example (contoh) → link back (kaitan). PEHK format.',
        conclusion: 'Penutup — 2-3 sentences. Summarise, give a call to action or hope/wish. Must link back to intro theme.',
      },
      pehk_method: {
        P: 'Point — state the main idea of the paragraph',
        E: 'Elaboration — explain the point in more detail',
        H: 'Example (Contoh) — give a specific example or evidence',
        K: 'Link (Kaitan) — link back to the essay question/theme',
      },
      teaching_phases: [
        { phase: 1, name: 'Essay Type Identification', check_in: 'Is this essay question asking for argumentative, narrative, or descriptive?' },
        { phase: 2, name: 'Strong Introduction', check_in: 'Does your intro state your stand clearly in the last sentence?' },
        { phase: 3, name: 'PEHK Body Paragraph', check_in: 'Point out the P, E, H, K in this sample paragraph.' },
        { phase: 4, name: 'Vocabulary and Register', check_in: 'Is the language formal enough? Replace any casual words.' },
        { phase: 5, name: 'Conclusion Technique', check_in: 'Does your conclusion link back to the opening theme?' },
      ],
      common_mistakes: [
        { mistake: 'Starting body paragraph without a clear point', fix: 'First sentence of every body paragraph = the main idea (isi). State it directly.' },
        { mistake: 'Example without elaboration', fix: 'Example alone is not enough. Always explain WHY the example supports your point.' },
        { mistake: 'Informal language (slang, short forms)', fix: 'SPM essays must use formal BM. No "tak", "nak" — use "tidak", "ingin".' },
        { mistake: 'Conclusion that introduces new ideas', fix: 'Conclusion only summarises and reflects. Never add new points in penutup.' },
      ],
      summary_prompt: 'Ask student to write one complete body paragraph using PEHK for a given essay topic.',
    },
  },

];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function savePedagogy(entry) {
  const { searchTerms, subject, form_level, pedagogy } = entry;

  // Try each search term until we find a lesson
  for (const term of searchTerms) {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, title, topic, subject, form_level')
      .eq('subject', subject)
      .eq('form_level', form_level)
      .ilike('topic', `%${term}%`)
      .limit(5);

    if (lessons && lessons.length > 0) {
      // Use the first match
      const lesson = lessons[0];
      const { error } = await supabase
        .from('lessons')
        .update({ pedagogy })
        .eq('id', lesson.id);

      if (error) {
        console.error(`  ERROR saving "${lesson.topic}":`, error.message);
        return { status: 'error', term, lesson: lesson.topic, error: error.message };
      }

      console.log(`  SAVED → "${lesson.topic}" (id: ${lesson.id}, matched: "${term}")`);
      return { status: 'saved', lesson: lesson.topic };
    }
  }

  console.warn(`  NOT FOUND — no lesson matched for: [${searchTerms.join(', ')}] in ${subject} F${form_level}`);
  return { status: 'not_found', searchTerms };
}

async function main() {
  console.log('\n=== Learnova Pedagogy Saver ===\n');

  // Check if pedagogy column exists by doing a test query
  const { data: testRow, error: colError } = await supabase
    .from('lessons')
    .select('id, pedagogy')
    .limit(1)
    .maybeSingle();

  if (colError && colError.message.includes('pedagogy')) {
    console.error('ERROR: "pedagogy" column does not exist in the lessons table.');
    console.error('Run this SQL in Supabase first:');
    console.error('  ALTER TABLE lessons ADD COLUMN IF NOT EXISTS pedagogy JSONB DEFAULT NULL;');
    process.exit(1);
  }

  console.log('Pedagogy column found. Starting saves...\n');

  const results = { saved: 0, not_found: 0, error: 0 };

  for (const entry of PEDAGOGIES) {
    const label = `${entry.subject} F${entry.form_level} — ${entry.searchTerms[0]}`;
    console.log(`Processing: ${label}`);
    const result = await savePedagogy(entry);
    results[result.status]++;
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`  Saved:     ${results.saved}`);
  console.log(`  Not found: ${results.not_found}`);
  console.log(`  Errors:    ${results.error}`);
  console.log('');

  if (results.not_found > 0) {
    console.log('For topics marked NOT FOUND, run this in Supabase to check exact titles:');
    console.log('  SELECT id, title, topic, subject FROM lessons WHERE form_level=5 ORDER BY subject, topic;');
    console.log('Then adjust the searchTerms in save_all_f5_pedagogies.mjs and re-run.\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
