-- Add routine linkage metadata to videos and attempts

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS routine_id uuid REFERENCES public.routines(id) ON DELETE SET NULL;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS kind text
  CHECK (kind IN ('reference', 'attempt', 'other'))
  DEFAULT 'other';

CREATE INDEX IF NOT EXISTS videos_routine_kind_idx ON public.videos (routine_id, kind);

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS comparison_url text;

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS critique_url text;

