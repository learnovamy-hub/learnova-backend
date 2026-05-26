# Learnova Adaptive Pedagogy Engine

> "An adaptive Malaysian AI tuition ecosystem — not just another chatbot tutor."

This folder manages all 4 layers of the pedagogy engine. Every teacher transcript goes through this system before it reaches the AI tutor.

---

## Architecture

```
Teacher Transcript
        ↓
extract_pedagogy.mjs  (AI extraction via Claude)
        ↓
Structured Pedagogy JSON
        ↓
seed_pedagogy_library.mjs  (save to Supabase)
        ↓
4 Supabase Tables:
  ├── pedagogy_library          ← HOW to teach each topic
  ├── misconception_library     ← what mistakes to watch for
  ├── tutor_personality_profiles ← tone, pace, interaction style
  └── memory_anchor_library     ← mnemonics and analogies
        ↓
tutor.js (loads all 4 layers in parallel)
        ↓
buildLayeredSystemPrompt()
        ↓
Claude AI Tutor
```

---

## 4-Layer System

### Layer 1 — Base Rules (`PEDAGOGY_RULES` in tutor.js)
Universal teaching style: 2-3 sentences max, one question always, no markdown, no lists, Socratic method.
Applied to every session regardless of topic.

### Layer 2 — Teaching Strategy (`selectTeachingStrategy`)
Determined by `pedagogy_type` array in `pedagogy_library`. Different topics get different instructional approaches:

| Pedagogy Type | Best For | How It Changes the AI |
|---|---|---|
| `visual-interactive` | Trigonometry, Geometry, Graphs | Uses spatial language, "picture this", "imagine the circle" |
| `spatial-procedural` | Matrices | Cell-by-cell operations, grid metaphors |
| `analogy-driven` | Variation, Probability | Real-world analogy BEFORE formula |
| `procedural-exam` | BM Morfologi | SPM marking scheme format, "this step earns 1 mark" |
| `structured-writing` | BM Karangan | PEHK paragraph enforcement, elaboration required |
| `conversational-language` | Ayat Perintah, Spoken BM | Roleplay, social context, tone awareness |
| `drill-mastery` | Formula practice | Rapid short exchanges, repeat until automatic |
| `guided-discovery` | Higher-order thinking | Never gives answer, leads student to discover |

### Layer 3 — Personality (`tutor_personality_profiles`)
Controls tone and interaction style. Students or topics can request different personalities:
- **Friendly Tutor** (default) — warm, encouraging, Socratic
- **SPM Exam Coach** — strict, fast, marking-scheme focused
- **Visual Tutor** — slow, spatial-first, draw before calculate
- **Conversation Partner** — casual, roleplay-based, for language subjects

### Layer 4 — Topic Intelligence (`pedagogy_library`, `memory_anchor_library`, `misconception_library`)
The real teacher's teaching patterns per topic:
- Lesson flow and teaching phases with exact check-in questions
- Memory anchors (mnemonics the teacher used)
- Common mistakes — tutor proactively warns before student makes them
- Worked examples — exact problems the teacher used

---

## Folder Structure

```
src/pedagogy/
├── README.md
├── create_pedagogy_tables.sql       ← run once in Supabase SQL Editor
├── seed_pedagogy_library.mjs        ← seeds all 4 tables
├── extract_pedagogy.mjs             ← AI-powered transcript → JSON extractor
├── save_all_f5_pedagogies.mjs       ← legacy: saves to lessons.pedagogy (keep for reference)
├── transcripts/
│   └── trigonometry_miss_joanna.txt ← raw classroom transcripts
└── insights/
    └── trigonometry_insights.json   ← structured extractions (for reference)
```

---

## How to Add a New Teacher Transcript

```bash
# Step 1: Save the transcript
# Copy the transcript text to:
# src/pedagogy/transcripts/<topic>_<teacher>.txt

# Step 2: Extract pedagogy using AI
node extract_pedagogy.mjs transcripts/<file>.txt "Mathematics" "Form 5" "Topic Name" --save

# This will:
# - Send transcript to Claude for structured extraction
# - Save result to insights/<slug>_extracted.json
# - With --save: also save to Supabase pedagogy_library automatically

# Step 3: Add misconceptions and memory anchors
# Edit seed_pedagogy_library.mjs → MEMORY_ANCHORS and MISCONCEPTIONS arrays
# Re-run: node seed_pedagogy_library.mjs
```

---

## Supabase Setup (one time)

Run `create_pedagogy_tables.sql` in Supabase SQL Editor. This creates:
- `pedagogy_library`
- `misconception_library`
- `tutor_personality_profiles`
- `memory_anchor_library`

Then seed: `node seed_pedagogy_library.mjs`

---

## Pedagogy Coverage (as of last seed)

| Subject | Form | Topic | Pedagogy Type |
|---|---|---|---|
| Mathematics | F5 | Trigonometry (Sin/Cos/Tan 0°–360°) | visual-interactive, guided-discovery, drill-mastery |
| Mathematics | F5 | Inverse Variation | analogy-driven, guided-discovery |
| Mathematics | F5 | Inverse Matrices (Solving) | spatial-procedural, drill-mastery |
| Mathematics | F5 | Inverse Matrices (Applications) | spatial-procedural, procedural-exam |
| Bahasa Melayu | F5 | Morfologi | procedural-exam, drill-mastery |
| Bahasa Melayu | F5 | Karangan | structured-writing, procedural-exam |
| Bahasa Melayu | F4 | Ayat Perintah | conversational-language, guided-discovery |

---

## Memory Anchors in DB

| Anchor | Topic | Purpose |
|---|---|---|
| All Science Teacher Crazy | Trigonometry | ASTC quadrant signs |
| SOH CAH TOA | Trigonometry | Trig ratios |
| Always stick to the x-axis | Trigonometry | Reference angle rule |
| Direct: same direction. Inverse: opposite. | Variation | Direct vs inverse |
| Rows come first, columns come second — RC Cola | Matrices | Order notation |
| IMBAKUP | Karangan | Idea expansion framework |
| PEHK | Karangan | Paragraph structure |
| Cari kata dasar dulu | Morfologi | Root word first |
