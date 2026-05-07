-- Enable real-time replication for clan_messages table
-- This allows instant message updates via Supabase Realtime subscriptions
-- Run this SQL in your Supabase SQL Editor

-- Add clan_messages to the supabase_realtime publication
-- This enables real-time subscriptions for INSERT, UPDATE, and DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE clan_messages;

-- Verify the table was added (optional check)
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'clan_messages';

