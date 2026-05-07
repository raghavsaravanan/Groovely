/*
  # Redesign Crews Feature - Add Co-Founders Support
  
  This migration:
  1. Adds co_founders column to clans table (array of user IDs)
  2. Updates RLS policies to allow co-founders same permissions as creators
  3. Ensures proper role detection
*/

-- Add co_founders column to clans table (array of UUIDs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'co_founders'
  ) THEN
    ALTER TABLE clans ADD COLUMN co_founders uuid[] DEFAULT '{}'::uuid[];
  END IF;
END $$;

-- Create index for co_founders array queries
CREATE INDEX IF NOT EXISTS idx_clans_co_founders ON clans USING GIN(co_founders);

-- Update RLS policies to allow co-founders same permissions as creators
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Creators can update own clans" ON clans;
  DROP POLICY IF EXISTS "Creators can delete own clans" ON clans;
  DROP POLICY IF EXISTS "Co-founders can update clans" ON clans;
  DROP POLICY IF EXISTS "Co-founders can delete clans" ON clans;
  
  -- Create policy for creators and co-founders to update clans
  CREATE POLICY "Creators and co-founders can update clans"
    ON clans FOR UPDATE
    TO authenticated
    USING (
      creator_id = auth.uid() 
      OR auth.uid() = ANY(co_founders)
    )
    WITH CHECK (
      creator_id = auth.uid() 
      OR auth.uid() = ANY(co_founders)
    );
  
  -- Create policy for creators and co-founders to delete clans
  CREATE POLICY "Creators and co-founders can delete clans"
    ON clans FOR DELETE
    TO authenticated
    USING (
      creator_id = auth.uid() 
      OR auth.uid() = ANY(co_founders)
    );
  
  -- Keep existing policy for legacy clans without creator_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'clans' 
    AND policyname = 'Users can delete clans without creator'
  ) THEN
    CREATE POLICY "Users can delete clans without creator"
      ON clans FOR DELETE
      TO authenticated
      USING (creator_id IS NULL);
  END IF;
END $$;

-- Function to check if user is creator or co-founder
CREATE OR REPLACE FUNCTION is_crew_admin(crew_id uuid, user_id uuid)
RETURNS boolean AS $$
DECLARE
  crew_record clans%ROWTYPE;
BEGIN
  SELECT * INTO crew_record FROM clans WHERE id = crew_id;
  
  IF crew_record.creator_id = user_id THEN
    RETURN true;
  END IF;
  
  IF user_id = ANY(crew_record.co_founders) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

