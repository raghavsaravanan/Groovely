-- Enable realtime for clan_messages table
-- This is required for Supabase Realtime to work properly
-- 
-- The issue: Supabase Realtime requires REPLICA IDENTITY FULL to be set on tables
-- to properly track all changes. Without this, postgres_changes subscriptions won't work.
--
-- Solution: Set REPLICA IDENTITY FULL and ensure the table is in the publication

-- Set REPLICA IDENTITY to FULL so all changes are captured
-- This ensures PostgreSQL tracks all column changes for replication
ALTER TABLE public.clan_messages REPLICA IDENTITY FULL;

-- Ensure the table is in the supabase_realtime publication
-- (This might already be done, but we'll add it if not)
-- Note: If you get an error saying the table is already in the publication, that's fine
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'clan_messages'
    AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_messages;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table already in publication, that's fine
    NULL;
END $$;
