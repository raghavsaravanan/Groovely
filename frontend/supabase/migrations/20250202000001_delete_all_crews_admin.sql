/*
  # Admin Script: Delete All Crews
  
  This is a one-time admin script to delete all crews.
  Run this directly in Supabase SQL Editor with service role permissions.
  
  WARNING: This will permanently delete ALL crews and remove all members from crews.
*/

-- Remove all members from crews first
UPDATE profiles SET clan_id = NULL;

-- Delete all crews (bypasses RLS when run with service role)
DELETE FROM clans;

-- Verify deletion
SELECT COUNT(*) as remaining_crews FROM clans;
SELECT COUNT(*) as profiles_with_crews FROM profiles WHERE clan_id IS NOT NULL;

