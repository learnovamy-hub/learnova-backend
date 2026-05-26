-- ============================================================
-- Learnova Tutor Cache — run once in Supabase SQL Editor
-- ============================================================
-- Stores pre-generated tutor responses per topic/phase/intent.
-- Cache hit = zero Claude API cost.
-- Populated by warm_cache.mjs, also auto-filled as students use the app.

CREATE TABLE IF NOT EXISTS tutor_cache (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject             text NOT NULL,
  topic               text NOT NULL,
  phase               int  NOT NULL DEFAULT 0,   -- teaching segment index
  intent              text NOT NULL,             -- 'affirmative','confused','continue','wants_example'
  language            text NOT NULL DEFAULT 'en',
  reply               text NOT NULL,
  visual              jsonb,
  suggested_responses text[] DEFAULT '{}',
  is_check_in         boolean DEFAULT false,
  hit_count           int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(subject, topic, phase, intent, language)
);

-- Fast lookup index — this runs on every single tutor message
CREATE INDEX IF NOT EXISTS idx_tutor_cache_lookup
  ON tutor_cache(subject, topic, phase, intent, language);

-- Increment hit_count function (used by tutor.js on cache hit)
CREATE OR REPLACE FUNCTION increment_cache_hit(cache_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE tutor_cache SET hit_count = hit_count + 1, updated_at = now() WHERE id = cache_id;
$$;
