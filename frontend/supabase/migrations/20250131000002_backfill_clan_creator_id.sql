/*
  # Backfill creator_id for existing clans

  This migration sets creator_id for existing clans that don't have it set.
  It uses the first member (by created_at) as the creator.
*/

-- Update clans without creator_id to use the first member as creator
UPDATE clans c
SET creator_id = (
  SELECT p.id
  FROM profiles p
  WHERE p.clan_id = c.id
  ORDER BY p.created_at ASC
  LIMIT 1
)
WHERE c.creator_id IS NULL
AND EXISTS (
  SELECT 1 FROM profiles p WHERE p.clan_id = c.id
);

-- Add RLS policy for updating clans (if creator_id exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    -- Drop existing update policy if it exists
    DROP POLICY IF EXISTS "Creators can update own clans" ON clans;
    
    -- Create new update policy that allows creators to update their clans
    CREATE POLICY "Creators can update own clans"
      ON clans FOR UPDATE
      TO authenticated
      USING (creator_id = auth.uid())
      WITH CHECK (creator_id = auth.uid());
  END IF;
END $$;

