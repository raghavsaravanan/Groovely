/*
  # Delete Clan "J" and Clean Up Related Data

  This script deletes the clan named "J" and handles all related data.
  
  IMPORTANT: Run this in Supabase SQL Editor (Dashboard > SQL Editor)
  This runs as superuser and bypasses RLS policies.
  
  Related data cleanup:
  - clan_messages: Automatically deleted via CASCADE (foreign key)
  - profiles.clan_id: Automatically set to NULL via SET NULL (foreign key)
*/

-- Step 1: Check if the clan exists and see its details
-- Note: creator_id column may not exist in all schemas, so we exclude it
SELECT 
  id, 
  name, 
  description, 
  total_score, 
  created_at,
  (SELECT COUNT(*) FROM profiles WHERE clan_id = clans.id) as member_count,
  (SELECT COUNT(*) FROM clan_messages WHERE clan_id = clans.id) as message_count
FROM clans 
WHERE LOWER(TRIM(name)) = 'j';

-- Step 2: Delete clan messages (explicit deletion for clarity)
-- Note: This will also happen automatically via CASCADE, but doing it explicitly ensures cleanup
DELETE FROM clan_messages 
WHERE clan_id IN (
  SELECT id FROM clans WHERE LOWER(TRIM(name)) = 'j'
);

-- Step 3: Update all profiles to remove clan_id reference
-- Note: This will also happen automatically via SET NULL, but doing it explicitly ensures cleanup
UPDATE profiles 
SET clan_id = NULL 
WHERE clan_id IN (
  SELECT id FROM clans WHERE LOWER(TRIM(name)) = 'j'
);

-- Step 4: Delete the clan itself
DELETE FROM clans 
WHERE LOWER(TRIM(name)) = 'j';

-- Step 5: Verify deletion
SELECT 
  COUNT(*) as remaining_clans_with_j_name,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ Clan "J" successfully deleted!'
    ELSE '⚠️  Clan "J" still exists. Check for errors above.'
  END as status
FROM clans 
WHERE LOWER(TRIM(name)) = 'j';

-- Step 6: Show summary of cleanup
SELECT 
  'Cleanup Summary' as info,
  (SELECT COUNT(*) FROM profiles WHERE clan_id IS NULL) as profiles_without_clan,
  (SELECT COUNT(*) FROM clan_messages) as total_messages_remaining;

