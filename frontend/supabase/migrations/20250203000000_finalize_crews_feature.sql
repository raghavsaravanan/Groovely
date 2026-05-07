/*
  # Finalize Crews Feature - Complete Migration
  
  This migration combines all crew-related database changes into one atomic operation.
  It is idempotent and safe to run multiple times.
  
  What this migration does:
  1. Adds creator_id column to clans table (if missing)
  2. Adds co_founders column to clans table (if missing)
  3. Creates indexes for performance
  4. Sets up RLS policies for creators and co-founders
  5. Creates helper function is_crew_admin()
  
  Run this in Supabase Dashboard > SQL Editor
*/

-- ============================================================================
-- STEP 1: Add creator_id column (if it doesn't exist)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE clans ADD COLUMN creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
    
    -- Add comment for documentation
    COMMENT ON COLUMN clans.creator_id IS 'The user who created this crew. NULL for legacy crews created before this column was added.';
    
    -- Create index for better query performance
    CREATE INDEX IF NOT EXISTS idx_clans_creator_id ON clans(creator_id);
    
    RAISE NOTICE '✅ Added creator_id column to clans table';
  ELSE
    RAISE NOTICE 'ℹ️  creator_id column already exists in clans table';
  END IF;
END $$;

-- Verify creator_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    RAISE NOTICE '✅ creator_id column verified';
  ELSE
    RAISE EXCEPTION '❌ Failed to add creator_id column';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Add co_founders column (if it doesn't exist)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'co_founders'
  ) THEN
    ALTER TABLE clans ADD COLUMN co_founders uuid[] DEFAULT '{}'::uuid[];
    
    -- Add comment for documentation
    COMMENT ON COLUMN clans.co_founders IS 'Array of user IDs who are co-founders of this crew. Co-founders have the same administrative powers as creators, except they cannot transfer ownership.';
    
    RAISE NOTICE '✅ Added co_founders column to clans table';
  ELSE
    RAISE NOTICE 'ℹ️  co_founders column already exists in clans table';
  END IF;
END $$;

-- Create index for co_founders array queries (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_clans_co_founders ON clans USING GIN(co_founders);

-- Verify co_founders column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'co_founders'
  ) THEN
    RAISE NOTICE '✅ co_founders column verified';
  ELSE
    RAISE EXCEPTION '❌ Failed to add co_founders column';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Update RLS Policies for Creators and Co-Founders
-- ============================================================================
DO $$
BEGIN
  -- Drop old policies if they exist (to avoid conflicts)
  DROP POLICY IF EXISTS "Creators can update own clans" ON clans;
  DROP POLICY IF EXISTS "Creators can delete own clans" ON clans;
  DROP POLICY IF EXISTS "Co-founders can update clans" ON clans;
  DROP POLICY IF EXISTS "Co-founders can delete clans" ON clans;
  DROP POLICY IF EXISTS "Creators and co-founders can update clans" ON clans;
  DROP POLICY IF EXISTS "Creators and co-founders can delete clans" ON clans;
  
  -- Create unified policy for creators and co-founders to update clans
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
  
  RAISE NOTICE '✅ Created RLS policy: Creators and co-founders can update clans';
  
  -- Create unified policy for creators and co-founders to delete clans
  CREATE POLICY "Creators and co-founders can delete clans"
    ON clans FOR DELETE
    TO authenticated
    USING (
      creator_id = auth.uid() 
      OR auth.uid() = ANY(co_founders)
    );
  
  RAISE NOTICE '✅ Created RLS policy: Creators and co-founders can delete clans';
  
  -- Keep existing policy for legacy clans without creator_id (backward compatibility)
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
    
    RAISE NOTICE '✅ Created RLS policy: Users can delete clans without creator (legacy support)';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Create Helper Function for Admin Check
-- ============================================================================
CREATE OR REPLACE FUNCTION is_crew_admin(crew_id uuid, user_id uuid)
RETURNS boolean AS $$
DECLARE
  crew_record clans%ROWTYPE;
BEGIN
  SELECT * INTO crew_record FROM clans WHERE id = crew_id;
  
  -- Check if user is creator
  IF crew_record.creator_id = user_id THEN
    RETURN true;
  END IF;
  
  -- Check if user is co-founder
  IF user_id = ANY(crew_record.co_founders) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION: Final Check
-- ============================================================================
DO $$
DECLARE
  creator_id_exists boolean;
  co_founders_exists boolean;
  policies_exist boolean;
BEGIN
  -- Check columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) INTO creator_id_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'co_founders'
  ) INTO co_founders_exists;
  
  -- Check policies
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'clans' 
    AND policyname = 'Creators and co-founders can update clans'
  ) INTO policies_exist;
  
  -- Report results
  IF creator_id_exists AND co_founders_exists AND policies_exist THEN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ CREWS FEATURE MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '✅ creator_id column: EXISTS';
    RAISE NOTICE '✅ co_founders column: EXISTS';
    RAISE NOTICE '✅ RLS policies: CREATED';
    RAISE NOTICE '✅ Helper function: CREATED';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify storage buckets exist (avatars, videos, audio)';
    RAISE NOTICE '2. Run: npx tsx scripts/verify-crews-setup.ts';
    RAISE NOTICE '3. Test crew creation and co-founder features';
    RAISE NOTICE '';
  ELSE
    RAISE WARNING '⚠️  Some checks failed. Please review the migration output above.';
  END IF;
END $$;

