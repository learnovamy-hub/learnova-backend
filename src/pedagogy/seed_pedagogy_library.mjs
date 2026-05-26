/**
 * seed_pedagogy_library.mjs
 *
 * Seeds all 4 pedagogy tables with structured intelligence:
 *   - pedagogy_library       → teaching strategies per topic
 *   - misconception_library  → common student mistakes
 *   - tutor_personality_profiles → tone/pace/interaction profiles
 *   - memory_anchor_library  → mnemonics and analogies
 *
 * Usage: node seed_pedagogy_library.mjs
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

// ══════════════════════════════════════════════════════════
// 1. PERSONALITY PROFILES
// ══════════════════════════════════════════════════════════

const PERSONALITY_PROFILES = [
  {
    name: 'encouraging',
    display_name: 'Friendly Tutor',
    tone: 'encouraging',
    pace: 'moderate',
    strictness: 'low',
    interaction_style: 'socratic',
    is_default: true,
    rules: {
      celebrate_correct: true,
      normalize_mistakes: true,
      use_local_warmth: true,
      prompt_style: 'Ask ONE question at a time. Celebrate every correct answer warmly before moving on. When wrong, say "Almost! Let me try a different angle." Never say "wrong" or "incorrect."',
    },
  },
  {
    name: 'exam_coach',
    display_name: 'SPM Exam Coach',
    tone: 'strict',
    pace: 'fast',
    strictness: 'high',
    interaction_style: 'direct',
    is_default: false,
    rules: {
      exam_format_priority: true,
      marking_scheme_aware: true,
      time_pressure: true,
      prompt_style: 'Every response must reference the marking scheme. Correct mistakes immediately with the exact SPM format. Focus on scoring, not just understanding.',
    },
  },
  {
    name: 'visual_tutor',
    display_name: 'Visual Tutor',
    tone: 'analytical',
    pace: 'slow',
    strictness: 'medium',
    interaction_style: 'socratic',
    is_default: false,
    rules: {
      visual_first: true,
      spatial_language: true,
      draw_before_calculate: true,
      prompt_style: 'Always ask the student to visualize or describe the shape/graph/pattern before calculating. Use spatial language: "imagine", "picture this", "what shape do you see?"',
    },
  },
  {
    name: 'conversational',
    display_name: 'Conversation Partner',
    tone: 'conversational',
    pace: 'moderate',
    strictness: 'low',
    interaction_style: 'roleplay',
    is_default: false,
    rules: {
      casual_tone: true,
      roleplay_allowed: true,
      social_context: true,
      prompt_style: 'Respond as if having a casual conversation. Use the topic as a springboard for real-life discussion. Great for language subjects and communication skills.',
    },
  },
];

// ══════════════════════════════════════════════════════════
// 2. MEMORY ANCHORS
// ══════════════════════════════════════════════════════════

const MEMORY_ANCHORS = [
  {
    subject: 'Mathematics',
    topic: 'Trigonometry',
    anchor: 'All Science Teacher Crazy',
    purpose: 'Quadrant sign rule: All positive (Q1), Sin positive (Q2), Tan positive (Q3), Cos positive (Q4)',
    mnemonic_type: 'acronym',
    student_variants: ['All Students Totally Crazy', 'Add Sugar To Coffee'],
  },
  {
    subject: 'Mathematics',
    topic: 'Trigonometry',
    anchor: 'SOH CAH TOA',
    purpose: 'Sin=Opposite/Hypotenuse, Cos=Adjacent/Hypotenuse, Tan=Opposite/Adjacent',
    mnemonic_type: 'acronym',
    student_variants: [],
  },
  {
    subject: 'Mathematics',
    topic: 'Trigonometry',
    anchor: 'Always stick to the x-axis',
    purpose: 'Reference angle is measured from x-axis, never y-axis',
    mnemonic_type: 'rule',
    student_variants: [],
  },
  {
    subject: 'Mathematics',
    topic: 'Variation',
    anchor: 'Direct: both go same direction. Inverse: they go opposite directions.',
    purpose: 'Distinguish direct variation (y=kx) from inverse variation (y=k/x)',
    mnemonic_type: 'analogy',
    student_variants: ['Speed and time — go faster, less time needed'],
  },
  {
    subject: 'Mathematics',
    topic: 'Matrices',
    anchor: 'Rows come first, columns come second — RC Cola',
    purpose: 'Matrix order is always rows × columns, never columns × rows',
    mnemonic_type: 'acronym',
    student_variants: [],
  },
  {
    subject: 'Bahasa Melayu',
    topic: 'Karangan',
    anchor: 'IMBAKUP',
    purpose: 'Idea expansion framework: Isi, Maksud, Bukti, Akibat, Kesan, Ulasan, Penutup',
    mnemonic_type: 'acronym',
    student_variants: [],
  },
  {
    subject: 'Bahasa Melayu',
    topic: 'Karangan',
    anchor: 'PEHK',
    purpose: 'Paragraph structure: Point, Elaboration, Huraian (example), Kaitan (link back)',
    mnemonic_type: 'acronym',
    student_variants: [],
  },
  {
    subject: 'Bahasa Melayu',
    topic: 'Morfologi',
    anchor: 'Cari kata dasar dulu — buang semua imbuhan',
    purpose: 'Always identify the root word first before classifying morphology type',
    mnemonic_type: 'rule',
    student_variants: [],
  },
];

// ══════════════════════════════════════════════════════════
// 3. MISCONCEPTION LIBRARY
// ══════════════════════════════════════════════════════════

const MISCONCEPTIONS = [
  // Trigonometry
  { subject: 'Mathematics', topic: 'Trigonometry', severity: 'high',
    mistake: 'Measuring reference angle from y-axis instead of x-axis',
    correction: 'Always measure reference angle from the x-axis. The reference angle is between the terminal side and the x-axis.' },
  { subject: 'Mathematics', topic: 'Trigonometry', severity: 'high',
    mistake: 'Entering negative value in calculator when finding reference angle',
    correction: 'Strip the negative sign first. Use shift-sin(positive value). The basic angle is always positive, between 0° and 90°.' },
  { subject: 'Mathematics', topic: 'Trigonometry', severity: 'medium',
    mistake: 'Only giving one angle when two are required',
    correction: 'Two quadrants apply for each trig function sign. Always check both quadrants and give both angles.' },
  { subject: 'Mathematics', topic: 'Trigonometry', severity: 'medium',
    mistake: 'Using wrong quadrant formula (e.g., 360−θ for Q2 instead of 180−θ)',
    correction: 'Q1=θ, Q2=180°−θ, Q3=180°+θ, Q4=360°−θ. Memorise all four.' },

  // Variation
  { subject: 'Mathematics', topic: 'Variation', severity: 'high',
    mistake: 'Writing y = kx for inverse variation instead of y = k/x',
    correction: 'Inverse variation means y is divided by x: y = k/x. Direct variation is y = kx.' },
  { subject: 'Mathematics', topic: 'Variation', severity: 'high',
    mistake: 'Solving without finding k first',
    correction: 'Always find the constant k using the given pair of values before solving for the unknown.' },
  { subject: 'Mathematics', topic: 'Variation', severity: 'medium',
    mistake: 'Confusing direct and inverse variation from context',
    correction: 'If one goes up and the other goes down — inverse. If both go up together — direct.' },

  // Matrices
  { subject: 'Mathematics', topic: 'Matrices', severity: 'high',
    mistake: 'Confusing row and column in matrix order notation',
    correction: 'Order is ALWAYS rows × columns. A 3×2 matrix has 3 rows and 2 columns.' },
  { subject: 'Mathematics', topic: 'Matrices', severity: 'high',
    mistake: 'Multiplying matrices element by element',
    correction: 'Matrix multiplication is row × column (dot product), not element × element.' },
  { subject: 'Mathematics', topic: 'Matrices', severity: 'medium',
    mistake: 'Adding matrices of different orders',
    correction: 'You can only add matrices with the SAME order. Check orders match before adding.' },

  // BM Morfologi
  { subject: 'Bahasa Melayu', topic: 'Morfologi', severity: 'high',
    mistake: 'Forgetting to identify kata dasar (root word)',
    correction: 'Always find the root word first — remove all imbuhan. Kata dasar must be stated in SPM answers.' },
  { subject: 'Bahasa Melayu', topic: 'Morfologi', severity: 'high',
    mistake: 'Calling apitan (circumfix) two separate imbuhan',
    correction: 'Apitan is ONE imbuhan type where prefix and suffix are added simultaneously, e.g., me-...-kan.' },
  { subject: 'Bahasa Melayu', topic: 'Morfologi', severity: 'medium',
    mistake: 'Incomplete SPM answer — missing affix name or root word',
    correction: 'SPM requires: (1) word, (2) type of word formation, (3) kata dasar, (4) imbuhan used. All four needed.' },

  // BM Karangan
  { subject: 'Bahasa Melayu', topic: 'Karangan', severity: 'high',
    mistake: 'Body paragraph without a clear isi (main point) in the first sentence',
    correction: 'First sentence of every body paragraph MUST state the main isi directly. Do not bury it.' },
  { subject: 'Bahasa Melayu', topic: 'Karangan', severity: 'high',
    mistake: 'Example given without huraian (elaboration)',
    correction: 'Example alone does not score. Always explain WHY the example supports the isi (huraian).' },
  { subject: 'Bahasa Melayu', topic: 'Karangan', severity: 'medium',
    mistake: 'Using informal BM (slang, short forms)',
    correction: 'SPM essays must use formal BM. "tidak" not "tak", "ingin" not "nak", "mereka" not "dorang".' },
];

// ══════════════════════════════════════════════════════════
// 4. PEDAGOGY LIBRARY
// ══════════════════════════════════════════════════════════

const PEDAGOGY_LIBRARY = [

  // ── Mathematics F5: Trigonometry ──────────────────────────────────────────
  {
    subject: 'Mathematics', form: 'Form 5',
    topic: 'Values of Sine, Cosine and Tangent for Angles θ, 0° < θ < 360°',
    pedagogy_type: ['visual-interactive', 'guided-discovery', 'drill-mastery'],
    visual_required: true,
    pedagogy_json: {
      source: 'Miss Joanna SPM classroom transcript',
      pedagogy_type: ['visual-interactive', 'guided-discovery', 'drill-mastery'],
      teacher_style: { tone: 'encouraging', pace: 'moderate', interaction_level: 'high' },
      opening_hook: 'Ask what students remember about SOH CAH TOA from Form 4. Connect right-angle triangles to the full unit circle. Never open with definitions.',
      lesson_flow: [
        'Activate SOH CAH TOA from Form 4',
        'Introduce 4 quadrants on coordinate plane',
        'Teach ASTC mnemonic (All Science Teacher Crazy)',
        'Demonstrate finding reference angle — always from x-axis, positive value in calculator',
        'Apply quadrant formulas (Q1=θ, Q2=180−θ, Q3=180+θ, Q4=360−θ)',
        'Drill with positive value, then negative value examples',
        'Real-world application: coconut tree / geometry problem',
        'Close: student recites 3 steps and ASTC from memory',
      ],
      memory_anchors: ['All Science Teacher Crazy', 'SOH CAH TOA', 'Always stick to the x-axis'],
      teaching_phases: [
        { phase: 1, name: 'Prior Knowledge Activation', check_in: 'What does SOH CAH TOA stand for?' },
        { phase: 2, name: 'Quadrant Introduction', check_in: 'Which quadrant is at top-right? Bottom-left?' },
        { phase: 3, name: 'ASTC Mnemonic', check_in: 'In which quadrant is ONLY tan positive?' },
        { phase: 4, name: 'Reference Angle (positive case)', check_in: 'If sin θ = 0.5, what do you enter in the calculator?' },
        { phase: 5, name: 'Reference Angle (negative case)', check_in: 'If tan is negative, which two quadrants do we use?' },
      ],
      common_misconceptions: [
        'Measuring reference angle from y-axis instead of x-axis',
        'Entering negative value in calculator',
        'Only giving one angle instead of two',
        'Using wrong quadrant formula',
      ],
      visual_requirements: ['unit circle with 4 quadrants labelled', 'angle arc showing reference angle', 'ASTC quadrant diagram'],
      worked_example: {
        problem: 'Find all θ where 0° ≤ θ ≤ 360° such that tan θ = −√3',
        steps: [
          'tan is negative → quadrants where tan is negative → Q2 and Q4',
          'Basic angle = tan⁻¹(√3) = 60° (use POSITIVE value)',
          'Q2: 180° − 60° = 120°',
          'Q4: 360° − 60° = 300°',
          'Answer: θ = 120° or 300°',
        ],
      },
      difficulty_progression: ['positive sin/cos/tan (single quadrant)', 'positive value (two quadrants)', 'negative value (identify correct quadrants first)', 'exact values (√3, ½, etc.)'],
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        visual_first: true,
        expand_ideas_progressively: true,
        check_exam_format: true,
        drill_reference_angle_repeatedly: true,
      },
      summary_prompt: 'Before ending: ask student to recite the 3 steps AND the ASTC rule without looking.',
    },
  },

  // ── Mathematics F5: Inverse Variation ────────────────────────────────────
  {
    subject: 'Mathematics', form: 'Form 5',
    topic: 'Inverse Variation',
    pedagogy_type: ['analogy-driven', 'guided-discovery'],
    visual_required: false,
    pedagogy_json: {
      source: 'SPM Form 5 Mathematics curriculum patterns',
      pedagogy_type: ['analogy-driven', 'guided-discovery'],
      teacher_style: { tone: 'encouraging', pace: 'moderate', interaction_level: 'high' },
      opening_hook: 'Ask: if you drive faster, does travel time increase or decrease? Connect the real-world inverse relationship to the formula before touching algebra.',
      lesson_flow: [
        'Real-world hook: speed vs time',
        'Introduce ∝ symbol and what y ∝ 1/x means in words',
        'Derive y = k/x and find constant k from given values',
        'Use k to solve for unknowns',
        'Contrast with direct variation graph shape',
        'SPM-style question practice',
      ],
      memory_anchors: ['Direct: both go same direction. Inverse: they go opposite directions.'],
      teaching_phases: [
        { phase: 1, name: 'Real-World Hook', check_in: 'If speed doubles, what happens to travel time?' },
        { phase: 2, name: 'Symbol Introduction', check_in: 'What does y ∝ 1/x mean in plain English?' },
        { phase: 3, name: 'Finding Constant k', check_in: 'If y=6 when x=2, what is k?' },
        { phase: 4, name: 'Using k to Solve', check_in: 'Now use your k to find y when x=4.' },
        { phase: 5, name: 'Graph Shape', check_in: 'Is the inverse variation graph a straight line or a curve? Why?' },
      ],
      common_misconceptions: [
        'Writing y = kx instead of y = k/x for inverse variation',
        'Solving without finding k first',
        'Confusing direct and inverse from context',
      ],
      visual_requirements: ['comparison graph: direct (straight line) vs inverse (hyperbola)'],
      worked_example: {
        problem: 'y varies inversely as x. When x=3, y=8. Find y when x=6.',
        steps: ['y = k/x → k = y × x = 8 × 3 = 24', 'y = 24/x', 'When x=6: y = 24/6 = 4'],
      },
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        analogy_first: true,
        expand_ideas_progressively: true,
        check_exam_format: true,
      },
      summary_prompt: 'Ask student: what is the formula, what does k represent, and how do you find k?',
    },
  },

  // ── Mathematics F5: Matrices (Inverse + Simultaneous Equations) ───────────
  {
    subject: 'Mathematics', form: 'Form 5',
    topic: 'Inverse Matrices and Solving Simultaneous Linear Equations Using Matrices',
    pedagogy_type: ['spatial-procedural', 'drill-mastery'],
    visual_required: true,
    pedagogy_json: {
      source: 'SPM Form 5 Mathematics curriculum patterns',
      pedagogy_type: ['spatial-procedural', 'drill-mastery'],
      teacher_style: { tone: 'analytical', pace: 'slow', interaction_level: 'medium' },
      opening_hook: 'Show a simple 2×2 table of numbers and say "this is a matrix." Connect to something they have seen before (a table of values, a score grid).',
      lesson_flow: [
        'Review matrix order (rows × columns)',
        'Introduce determinant: ad − bc',
        'Find inverse matrix using the formula: (1/det) × [[d,−b],[−c,a]]',
        'Show when inverse does NOT exist (det = 0)',
        'Set up simultaneous equations as AX = B',
        'Solve: X = A⁻¹B',
        'SPM-style practice: find inverse, then solve system',
      ],
      memory_anchors: ['Rows come first, columns come second — RC Cola', 'det = ad − bc', 'Swap a and d, negate b and c'],
      teaching_phases: [
        { phase: 1, name: 'Matrix Order Review', check_in: 'A 3×2 matrix — how many rows? How many columns?' },
        { phase: 2, name: 'Determinant', check_in: 'For matrix [[2,1],[3,4]], what is ad − bc?' },
        { phase: 3, name: 'Inverse Formula', check_in: 'Now divide by det and swap/negate — what do you get?' },
        { phase: 4, name: 'No Inverse Case', check_in: 'If det = 0, what does that mean?' },
        { phase: 5, name: 'Solving Simultaneous Equations', check_in: 'If AX = B, how do we isolate X?' },
      ],
      common_misconceptions: [
        'Confusing row and column in matrix order notation',
        'Forgetting to divide by the determinant when finding inverse',
        'Forgetting det = 0 means no inverse exists',
        'Multiplying matrices element by element',
      ],
      visual_requirements: ['2×2 matrix labelled with positions a,b,c,d', 'inverse formula displayed', 'AX=B setup diagram'],
      worked_example: {
        problem: 'Solve: 2x + y = 5, 3x + 4y = 6 using matrices',
        steps: [
          'Write as AX = B: [[2,1],[3,4]] × [[x],[y]] = [[5],[6]]',
          'det(A) = (2×4) − (1×3) = 8 − 3 = 5',
          'A⁻¹ = (1/5) × [[4,−1],[−3,2]]',
          'X = A⁻¹B = (1/5) × [[4,−1],[−3,2]] × [[5],[6]]',
          'x = (20−6)/5 = 14/5, y = (−15+12)/5 = −3/5',
        ],
      },
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        spatial_language: true,
        expand_ideas_progressively: false,
        check_exam_format: true,
        drill_determinant_and_inverse: true,
      },
      summary_prompt: 'Ask student to find the inverse of a 2×2 matrix from memory without the formula sheet.',
    },
  },

  // ── Mathematics F5: Matrices (Applications) ──────────────────────────────
  {
    subject: 'Mathematics', form: 'Form 5',
    topic: 'Inverse Matrices and Applications to Simultaneous Linear Equations',
    pedagogy_type: ['spatial-procedural', 'procedural-exam'],
    visual_required: true,
    pedagogy_json: {
      source: 'SPM Form 5 Mathematics curriculum patterns',
      pedagogy_type: ['spatial-procedural', 'procedural-exam'],
      teacher_style: { tone: 'strict', pace: 'moderate', interaction_level: 'medium' },
      opening_hook: 'Show the SPM marking scheme for a matrices question. Count the marks: inverse = 2 marks, multiply correctly = 2 marks, correct answer = 1 mark. Teach to the marks.',
      lesson_flow: [
        'Write equations in matrix form AX = B',
        'Find det(A)',
        'Find A⁻¹ using formula (1/det)[[d,−b],[−c,a]]',
        'Multiply A⁻¹ × B to get X',
        'State x and y clearly for full marks',
        'Check: substitute back into original equations',
      ],
      memory_anchors: ['Swap a and d, negate b and c, divide by det', 'X = A⁻¹B'],
      teaching_phases: [
        { phase: 1, name: 'Matrix Form Setup', check_in: 'Write 3x + 2y = 8 and x − y = 1 in matrix form.' },
        { phase: 2, name: 'Determinant Calculation', check_in: 'Find det for your matrix A.' },
        { phase: 3, name: 'Inverse Matrix', check_in: 'Apply the inverse formula — what is A⁻¹?' },
        { phase: 4, name: 'Matrix Multiplication', check_in: 'Multiply A⁻¹ × B — show all working.' },
        { phase: 5, name: 'State Answer', check_in: 'Write your final x and y values clearly. Would the examiner accept this?' },
      ],
      common_misconceptions: [
        'Setting up AX = B with wrong coefficient positions',
        'Forgetting to divide every element by det',
        'Not showing working — loses method marks in SPM',
      ],
      visual_requirements: ['SPM format answer layout', 'matrix multiplication grid'],
      worked_example: {
        problem: 'Using matrices, solve: 3x + 2y = 8 and x − y = 1',
        steps: [
          'Matrix form: [[3,2],[1,−1]] × [[x],[y]] = [[8],[1]]',
          'det = (3×−1) − (2×1) = −3 − 2 = −5',
          'A⁻¹ = (1/−5) × [[−1,−2],[−1,3]]',
          'X = A⁻¹B = (1/−5) × [[−1,−2],[−1,3]] × [[8],[1]]',
          'x = (−8−2)/(−5) = 2; y = (−8+3)/(−5) = 1',
        ],
      },
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        exam_format_focus: true,
        expand_ideas_progressively: false,
        check_exam_format: true,
      },
      summary_prompt: 'Ask student to explain which step earns which marks in the SPM marking scheme.',
    },
  },

  // ── Bahasa Melayu: Morfologi ──────────────────────────────────────────────
  {
    subject: 'Bahasa Melayu', form: 'Form 5',
    topic: 'Morfologi',
    pedagogy_type: ['procedural-exam', 'drill-mastery'],
    visual_required: false,
    pedagogy_json: {
      source: 'SPM BM pedagogy patterns — Morfologi',
      pedagogy_type: ['procedural-exam', 'drill-mastery'],
      teacher_style: { tone: 'strict', pace: 'fast', interaction_level: 'high' },
      opening_hook: 'Show the word "pembelajaran" and ask student to count how many parts it has. Then ask: what is the root word? Reveal the answer process before teaching the theory.',
      lesson_flow: [
        'Identify kata dasar (root word) — always first',
        'Classify imbuhan type: awalan, akhiran, apitan, sisipan',
        'State the specific imbuhan used (e.g., me-, -kan, me-...-kan)',
        'Identify word class change (if any)',
        'Practice SPM 4-step answer format',
      ],
      memory_anchors: ['Cari kata dasar dulu — buang semua imbuhan'],
      teaching_phases: [
        { phase: 1, name: 'Root Word Identification', check_in: 'What is the kata dasar of "menjalankan"?' },
        { phase: 2, name: 'Imbuhan Classification', check_in: 'Is "berlari" using awalan, akhiran, or apitan?' },
        { phase: 3, name: 'Apitan Recognition', check_in: 'What is special about "me-...-kan"? How is it different from two separate imbuhan?' },
        { phase: 4, name: 'SPM Answer Format', check_in: 'Using the 4-step format, classify "pelajaran" — kata dasar + jenis pembentukan kata + imbuhan + contoh.' },
        { phase: 5, name: 'Drill Practice', check_in: 'Classify: "keberhasilan", "permainan", "diajarkan".' },
      ],
      common_misconceptions: [
        'Forgetting to identify kata dasar',
        'Calling apitan two separate imbuhan',
        'Incomplete SPM answer missing affix name or root word',
      ],
      visual_requirements: ['imbuhan tree diagram', 'apitan vs awalan+akhiran comparison'],
      answering_technique: {
        format: 'SPM 4-step format: (1) State the word, (2) Name the type of word formation (e.g., pengimbuhan apitan), (3) Identify kata dasar, (4) Name the imbuhan added.',
        example: '"Pembelajaran" → pembentukan kata melalui pengimbuhan apitan (pe-...-an) → kata dasar: ajar',
      },
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        exam_format_focus: true,
        drill_answer_format: true,
        check_exam_format: true,
      },
      summary_prompt: 'Ask student to classify 3 words using the full 4-step SPM format from memory.',
    },
  },

  // ── Bahasa Melayu: Karangan ───────────────────────────────────────────────
  {
    subject: 'Bahasa Melayu', form: 'Form 5',
    topic: 'Karangan',
    pedagogy_type: ['structured-writing', 'procedural-exam'],
    visual_required: true,
    pedagogy_json: {
      source: 'SPM BM pedagogy patterns — Karangan (Essay Writing)',
      pedagogy_type: ['structured-writing', 'procedural-exam'],
      teacher_style: { tone: 'encouraging', pace: 'moderate', interaction_level: 'medium' },
      opening_hook: 'Ask: what is the first thing an examiner notices in your essay? Reveal: the introduction. A weak intro = bad first impression even if the body is good.',
      lesson_flow: [
        'Identify essay type (argumentative, narrative, descriptive)',
        'Analyse kehendak soalan — what exactly is being asked?',
        'Plan 3 main isi (points)',
        'Expand each isi using IMBAKUP or PEHK',
        'Write pendahuluan with clear thesis/stand',
        'Write 3 body paragraphs (PEHK each)',
        'Write penutup linking back to intro theme',
        'Insert peribahasa and penanda wacana',
      ],
      memory_anchors: ['IMBAKUP', 'PEHK'],
      teaching_phases: [
        { phase: 1, name: 'Essay Type and Question Analysis', check_in: 'Is this question asking for argumentative, narrative, or descriptive?' },
        { phase: 2, name: 'Strong Pendahuluan', check_in: 'Does your intro state your stand clearly in the final sentence?' },
        { phase: 3, name: 'PEHK Body Paragraph', check_in: 'Identify the P, E, H, K in this sample paragraph.' },
        { phase: 4, name: 'Peribahasa and Penanda Wacana', check_in: 'Where is the best place to insert a peribahasa in this paragraph?' },
        { phase: 5, name: 'Penutup Technique', check_in: 'Does your penutup link back to the opening theme? Does it introduce any new ideas?' },
      ],
      common_misconceptions: [
        'Body paragraph without clear isi in the first sentence',
        'Example given without huraian',
        'Informal BM language',
        'Penutup introducing new ideas',
      ],
      visual_requirements: ['essay structure flowchart (pendahuluan → 3 isi → penutup)', 'PEHK paragraph breakdown'],
      pehk_method: { P: 'Isi — state the main point', E: 'Elaboration — explain in detail', H: 'Huraian/Bukti — give example or evidence', K: 'Kaitan — link back to essay question' },
      imbakup_framework: { I: 'Idea', M: 'Maksud', B: 'Bukti', A: 'Akibat', K: 'Kesan', U: 'Ulasan', P: 'Penegasan' },
      recommended_ai_behaviour: {
        guide_step_by_step: true,
        expand_ideas_progressively: true,
        check_exam_format: true,
        suggest_peribahasa: true,
      },
      summary_prompt: 'Ask student to write one complete PEHK paragraph for a given topic before ending the session.',
    },
  },

  // ── Bahasa Melayu: Ayat Perintah (Communication Grammar) ─────────────────
  {
    subject: 'Bahasa Melayu', form: 'Form 4',
    topic: 'Ayat Perintah',
    pedagogy_type: ['conversational-language', 'guided-discovery'],
    visual_required: false,
    pedagogy_json: {
      source: 'SPM BM Communication Grammar pedagogy patterns',
      pedagogy_type: ['conversational-language', 'guided-discovery'],
      teacher_style: { tone: 'conversational', pace: 'moderate', interaction_level: 'high' },
      opening_hook: 'Start with a roleplay: "I am a teacher. You are a student. I want you to open your book." Ask: how would a teacher say that in formal BM? How about a friend?',
      lesson_flow: [
        'Understand the social context of each ayat type',
        'Ayat Perintah: direct command (imperative)',
        'Ayat Silaan: polite invitation (sila, tolong, jemput)',
        'Ayat Permintaan: request with please/mohon',
        'Ayat Larangan: prohibition (jangan, dilarang)',
        'Match tone to social relationship (teacher/student, friend/friend)',
        'Practice in dialogue form',
      ],
      memory_anchors: [],
      teaching_phases: [
        { phase: 1, name: 'Social Context Awareness', check_in: 'Would you use Ayat Perintah with your teacher or your friend? Why?' },
        { phase: 2, name: 'Ayat Silaan vs Ayat Perintah', check_in: 'What word makes "Buka buku" become polite?' },
        { phase: 3, name: 'Ayat Permintaan', check_in: 'Rewrite this command as a polite request using "mohon" or "minta".' },
        { phase: 4, name: 'Ayat Larangan', check_in: 'What is the difference between "Jangan bising" and "Dilarang bising"?' },
        { phase: 5, name: 'Roleplay Dialogue', check_in: 'Create a 4-line dialogue where one character uses all four ayat types.' },
      ],
      common_misconceptions: [
        'Using Ayat Perintah in formal/polite contexts where Ayat Silaan is appropriate',
        'Missing politeness marker when writing Ayat Silaan',
        'Confusing Ayat Larangan strength (jangan vs dilarang — dilarang is stronger, more official)',
      ],
      visual_requirements: [],
      recommended_ai_behaviour: {
        guide_step_by_step: false,
        roleplay_encouraged: true,
        conversational_tone: true,
        expand_ideas_progressively: true,
        check_exam_format: false,
      },
      summary_prompt: 'Ask student to produce one example of each of the four ayat types in a realistic social context.',
    },
  },
];

// ══════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ══════════════════════════════════════════════════════════

async function seedPersonalities() {
  console.log('\n── Seeding tutor_personality_profiles...');
  for (const p of PERSONALITY_PROFILES) {
    const { error } = await supabase.from('tutor_personality_profiles').upsert(p, { onConflict: 'name' });
    if (error) console.error('  ERROR:', p.name, error.message);
    else console.log('  ✓', p.display_name, p.is_default ? '(default)' : '');
  }
}

async function seedMemoryAnchors() {
  console.log('\n── Seeding memory_anchor_library...');
  // Clear existing for a clean re-seed
  await supabase.from('memory_anchor_library').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  for (const a of MEMORY_ANCHORS) {
    const { error } = await supabase.from('memory_anchor_library').insert(a);
    if (error) console.error('  ERROR:', a.anchor, error.message);
    else console.log('  ✓', a.subject, '—', a.anchor.substring(0, 50));
  }
}

async function seedMisconceptions() {
  console.log('\n── Seeding misconception_library...');
  // Clear and re-seed
  await supabase.from('misconception_library').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  for (const m of MISCONCEPTIONS) {
    const { error } = await supabase.from('misconception_library').insert(m);
    if (error) console.error('  ERROR:', m.mistake.substring(0, 40), error.message);
    else console.log('  ✓ [' + m.severity + ']', m.subject, '/', m.topic, '—', m.mistake.substring(0, 50));
  }
}

async function seedPedagogyLibrary() {
  console.log('\n── Seeding pedagogy_library...');
  for (const p of PEDAGOGY_LIBRARY) {
    const { error } = await supabase.from('pedagogy_library').upsert({
      subject: p.subject,
      form: p.form,
      topic: p.topic,
      subtopic: p.subtopic || null,
      pedagogy_json: p.pedagogy_json,
      pedagogy_type: p.pedagogy_type,
      visual_required: p.visual_required,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subject,form,topic' });

    if (error) console.error('  ERROR:', p.topic, error.message);
    else console.log('  ✓', p.subject, 'F' + p.form.replace('Form ', ''), '—', p.topic.substring(0, 60));
  }
}

async function main() {
  console.log('\n=== Learnova Adaptive Pedagogy Engine — Seeder ===');

  // Quick check that tables exist
  const checks = ['pedagogy_library', 'misconception_library', 'tutor_personality_profiles', 'memory_anchor_library'];
  for (const table of checks) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      console.error(`\nERROR: Table "${table}" does not exist.`);
      console.error('Run create_pedagogy_tables.sql in Supabase SQL Editor first.\n');
      process.exit(1);
    }
  }
  console.log('All 4 tables found.');

  await seedPersonalities();
  await seedMemoryAnchors();
  await seedMisconceptions();
  await seedPedagogyLibrary();

  console.log('\n=== Done! Summary:');
  console.log('  Personality profiles: ' + PERSONALITY_PROFILES.length);
  console.log('  Memory anchors:       ' + MEMORY_ANCHORS.length);
  console.log('  Misconceptions:       ' + MISCONCEPTIONS.length);
  console.log('  Pedagogy entries:     ' + PEDAGOGY_LIBRARY.length);
  console.log('\nThe AI tutor will now use adaptive pedagogy for all seeded topics.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
