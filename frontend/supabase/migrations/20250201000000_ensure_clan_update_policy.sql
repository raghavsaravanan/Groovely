/*
  # Ensure Clan Update Policy Exists

  This migration ensures that clan creators can update their clans.
  It creates the UPDATE policy if it doesn't exist.
*/

-- Drop existing update policy if it exists (to recreate it)
DROP POLICY IF EXISTS "Creators can update own clans" ON clans;

-- Create update policy that allows creators to update their clans
-- Only check if creator_id column exists before creating policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    CREATE POLICY "Creators can update own clans"
      ON clans FOR UPDATE
      TO authenticated
      USING (creator_id = auth.uid())
      WITH CHECK (creator_id = auth.uid());
  ELSE
    -- If creator_id doesn't exist, allow any authenticated user to update
    -- (for backward compatibility with older clans)
    CREATE POLICY "Authenticated users can update clans"
      ON clans FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

