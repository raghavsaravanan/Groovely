-- ============================================================
-- Groovely Backend State Tables
-- ============================================================
-- These tables replace the ephemeral JSON files (routines.json,
-- tries.json) that were wiped on every server restart.
-- Run this migration once in your Supabase SQL editor.
-- ============================================================

-- backend_routines: tracks routine upload + processing state
CREATE TABLE IF NOT EXISTS backend_routines (
  routine_id        text PRIMARY KEY,          -- uuid4().hex (32-char)
  title             text NOT NULL DEFAULT 'Untitled Routine',
  video_supabase_url text,
  audio_supabase_url text,
  processing        boolean NOT NULL DEFAULT true,
  status            text    NOT NULL DEFAULT 'uploaded',  -- uploaded | processing | completed | failed
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- backend_tries: tracks scoring job state
CREATE TABLE IF NOT EXISTS backend_tries (
  try_id                    text PRIMARY KEY,   -- uuid4().hex (32-char)
  routine_id                text NOT NULL,
  score                     float,
  user_video_supabase_url   text,
  comparison_supabase_url   text,
  critique_json_supabase_url text,
  critique_md_supabase_url  text,
  processing                boolean NOT NULL DEFAULT false,
  error                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backend_routines_status   ON backend_routines(status);
CREATE INDEX IF NOT EXISTS idx_backend_routines_created  ON backend_routines(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_tries_routine_id  ON backend_tries(routine_id);
CREATE INDEX IF NOT EXISTS idx_backend_tries_created     ON backend_tries(created_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backend_routines_updated_at ON backend_routines;
CREATE TRIGGER trg_backend_routines_updated_at
  BEFORE UPDATE ON backend_routines
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_backend_tries_updated_at ON backend_tries;
CREATE TRIGGER trg_backend_tries_updated_at
  BEFORE UPDATE ON backend_tries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: service-role key bypasses all policies, so we just disable RLS
-- (these tables are internal backend state, not user-facing)
ALTER TABLE backend_routines DISABLE ROW LEVEL SECURITY;
ALTER TABLE backend_tries    DISABLE ROW LEVEL SECURITY;
