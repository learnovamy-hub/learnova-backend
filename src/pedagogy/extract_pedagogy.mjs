/**
 * extract_pedagogy.mjs
 *
 * AI-powered pedagogy extraction tool.
 * Reads a raw teacher transcript and produces a structured pedagogy JSON
 * in the Learnova pedagogy_library schema using Claude.
 *
 * Usage:
 *   node extract_pedagogy.mjs <transcript_file> <subject> <form> <topic>
 *
 * Example:
 *   node extract_pedagogy.mjs transcripts/trigonometry_miss_joanna.txt Mathematics "Form 5" "Trigonometry"
 *
 * Output:
 *   insights/<topic_slug>.json   → structured pedagogy JSON
 *   (also prints to console and optionally saves to pedagogy_library if --save flag used)
 *
 * Flags:
 *   --save    Also save result directly to Supabase pedagogy_library table
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const PEDAGOGY_SCHEMA = `
{
  "subject": "string — e.g. Mathematics, Bahasa Melayu, Physics",
  "form": "string — e.g. Form 4, Form 5",
  "topic": "string — exact topic name",
  "pedagogy_type": ["array of strings — pick from: visual-interactive, spatial-procedural, analogy-driven, procedural-exam, structured-writing, conversational-language, drill-mastery, guided-discovery"],
  "teacher_style": {
    "tone": "encouraging | strict | conversational | analytical",
    "pace": "slow | moderate | fast",
    "interaction_level": "low | medium | high"
  },
  "opening_hook": "string — how teacher opened the lesson. What prior knowledge was activated?",
  "lesson_flow": ["array of strings — ordered teaching steps extracted from transcript"],
  "memory_anchors": ["array of strings — mnemonics, phrases, analogies the teacher used"],
  "teaching_phases": [
    { "phase": 1, "name": "string", "check_in": "the exact question teacher asked to check understanding" }
  ],
  "common_misconceptions": ["array of strings — mistakes teacher warned about or corrected"],
  "visual_requirements": ["array of strings — diagrams, animations, or visuals the teacher used or referenced"],
  "worked_example": {
    "problem": "string — exact problem used",
    "steps": ["array of strings — step-by-step solution as teacher presented it"]
  },
  "difficulty_progression": ["array of strings — from easy to hard, as teacher sequenced it"],
  "recommended_ai_behaviour": {
    "guide_step_by_step": "boolean",
    "visual_first": "boolean",
    "analogy_first": "boolean",
    "exam_format_focus": "boolean",
    "drill_repeatedly": "boolean",
    "expand_ideas_progressively": "boolean",
    "check_exam_format": "boolean"
  },
  "summary_prompt": "string — what should the AI ask the student at the end to confirm mastery?",
  "source": "string — description of the transcript source",
  "emotional_techniques": ["array of strings — how teacher built rapport, handled confusion, motivated students"],
  "exam_scoring_awareness": ["array of strings — any mention of marks, marking scheme, SPM format"]
}
`;

async function extractPedagogy(transcript, subject, form, topic) {
  console.log('\nExtracting pedagogy with Claude...\n');

  const prompt = `You are a Malaysian education pedagogy analyst specializing in SPM teaching methods.

Below is a real classroom transcript from a Malaysian teacher teaching "${topic}" (${subject}, ${form}).

Your job is to extract structured pedagogical intelligence from this transcript — NOT to summarize it, but to extract the TEACHING INTELLIGENCE that can be used to train an AI tutor to teach the same way.

Focus on:
1. HOW the teacher structured the lesson (not just what was said)
2. What memory anchors / mnemonics were used
3. What misconceptions were proactively addressed
4. How the teacher checked for understanding (exact questions)
5. The emotional and motivational techniques used
6. The difficulty progression
7. What visual aids were referenced

Output ONLY valid JSON matching this exact schema (no markdown, no preamble):
${PEDAGOGY_SCHEMA}

TRANSCRIPT:
${transcript}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Claude output as JSON:');
    console.error(clean.substring(0, 500));
    throw new Error('Claude returned invalid JSON: ' + e.message);
  }

  // Ensure required fields are set
  parsed.subject = parsed.subject || subject;
  parsed.form = parsed.form || form;
  parsed.topic = parsed.topic || topic;

  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldSave = args.includes('--save');
  const filteredArgs = args.filter(a => a !== '--save');

  if (filteredArgs.length < 4) {
    console.error('\nUsage: node extract_pedagogy.mjs <transcript_file> <subject> <form> <topic> [--save]');
    console.error('Example: node extract_pedagogy.mjs transcripts/trigonometry_miss_joanna.txt Mathematics "Form 5" "Trigonometry"');
    process.exit(1);
  }

  const [transcriptFile, subject, form, topic] = filteredArgs;
  const transcriptPath = join(__dirname, transcriptFile);

  if (!fs.existsSync(transcriptPath)) {
    console.error('File not found:', transcriptPath);
    process.exit(1);
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf-8');
  console.log(`\nLoaded transcript: ${transcriptFile} (${transcript.length} chars)`);

  const pedagogy = await extractPedagogy(transcript, subject, form, topic);

  // Determine pedagogy_type array for the table column
  const pedagogyType = pedagogy.pedagogy_type || [];
  const visualRequired = pedagogyType.includes('visual-interactive') ||
    (pedagogy.visual_requirements && pedagogy.visual_requirements.length > 0);

  // Save to insights folder
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const outPath = join(__dirname, 'insights', slug + '_extracted.json');
  fs.writeFileSync(outPath, JSON.stringify({ pedagogy_type: pedagogyType, visual_required: visualRequired, ...pedagogy }, null, 2));
  console.log('\nSaved to:', outPath);

  // Print summary
  console.log('\n── Extraction Summary ──');
  console.log('Topic:          ', pedagogy.topic);
  console.log('Pedagogy types: ', pedagogyType.join(', '));
  console.log('Teaching phases:', pedagogy.teaching_phases?.length || 0);
  console.log('Misconceptions: ', pedagogy.common_misconceptions?.length || 0);
  console.log('Memory anchors: ', pedagogy.memory_anchors?.length || 0);
  console.log('Visual required:', visualRequired);

  if (shouldSave) {
    console.log('\nSaving to pedagogy_library...');
    const { error } = await supabase.from('pedagogy_library').upsert({
      subject,
      form,
      topic,
      pedagogy_json: pedagogy,
      pedagogy_type: pedagogyType,
      visual_required: visualRequired,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subject,form,topic' });

    if (error) console.error('Supabase error:', error.message);
    else console.log('Saved to Supabase pedagogy_library!');
  } else {
    console.log('\nTo save to database, re-run with --save flag.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
