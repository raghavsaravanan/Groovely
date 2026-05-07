/*
  # Add creator_id column to clans table
  
  This migration ensures the creator_id column exists in the clans table.
  This is required for the redesigned crews feature.
*/

-- Add creator_id column if it doesn't exist
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
    
    RAISE NOTICE 'Added creator_id column to clans table';
  ELSE
    RAISE NOTICE 'creator_id column already exists in clans table';
  END IF;
END $$;

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    RAISE NOTICE '✅ creator_id column verified in clans table';
  ELSE
    RAISE EXCEPTION '❌ Failed to add creator_id column to clans table';
  END IF;
END $$;

