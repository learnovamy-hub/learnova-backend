-- ============================================================
-- Learnova Adaptive Pedagogy Engine — Database Tables
-- Run this in Supabase SQL Editor (one time)
-- ============================================================

-- 1. PEDAGOGY LIBRARY
-- Stores structured teaching intelligence per subject/topic.
-- This is the core of the pedagogy engine — replaces raw transcripts.
CREATE TABLE IF NOT EXISTS pedagogy_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         text NOT NULL,
  form            text NOT NULL,        -- 'Form 4', 'Form 5', 'All'
  topic           text NOT NULL,
  subtopic        text,
  pedagogy_json   jsonb NOT NULL,       -- full structured pedagogy object
  pedagogy_type   text[] DEFAULT '{}',  -- e.g. ['visual-interactive', 'guided-discovery']
  visual_required boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(subject, form, topic)
);

-- 2. MISCONCEPTION LIBRARY
-- Common student mistakes per topic with targeted corrections.
-- Tutor proactively watches for these and corrects before they happen.
CREATE TABLE IF NOT EXISTS misconception_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         text NOT NULL,
  topic           text,
  subtopic        text,
  mistake         text NOT NULL,
  correction      text NOT NULL,
  visual_required boolean DEFAULT false,
  severity        text DEFAULT 'medium',  -- 'low', 'medium', 'high'
  created_at      timestamptz DEFAULT now()
);

-- 3. TUTOR PERSONALITY PROFILES
-- Controls HOW the tutor behaves: tone, pace, strictness, interaction style.
-- Students or topics can select different personalities.
CREATE TABLE IF NOT EXISTS tutor_personality_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,     -- internal key, e.g. 'encouraging'
  display_name      text NOT NULL,            -- shown to student
  tone              text NOT NULL,            -- 'encouraging', 'strict', 'conversational', 'analytical'
  pace              text NOT NULL,            -- 'slow', 'moderate', 'fast'
  strictness        text DEFAULT 'medium',    -- 'low', 'medium', 'high'
  interaction_style text DEFAULT 'socratic',  -- 'socratic', 'direct', 'drill', 'roleplay'
  rules             jsonb DEFAULT '{}',       -- custom instruction overrides
  is_default        boolean DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

-- 4. MEMORY ANCHOR LIBRARY
-- Mnemonics, analogies, recurring explanation hooks per topic.
-- Injected into every session for that topic to reinforce retention.
CREATE TABLE IF NOT EXISTS memory_anchor_library (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          text NOT NULL,
  topic            text NOT NULL,
  anchor           text NOT NULL,         -- the mnemonic/phrase/analogy itself
  purpose          text NOT NULL,         -- what concept it helps remember
  mnemonic_type    text DEFAULT 'acronym', -- 'acronym', 'analogy', 'story', 'formula', 'visual'
  student_variants text[] DEFAULT '{}',   -- student-contributed alternatives
  created_at       timestamptz DEFAULT now()
);

-- Indexes for fast lookup by subject+topic
CREATE INDEX IF NOT EXISTS idx_pedagogy_library_subject_topic ON pedagogy_library(subject, topic);
CREATE INDEX IF NOT EXISTS idx_misconception_library_subject_topic ON misconception_library(subject, topic);
CREATE INDEX IF NOT EXISTS idx_memory_anchor_subject_topic ON memory_anchor_library(subject, topic);
