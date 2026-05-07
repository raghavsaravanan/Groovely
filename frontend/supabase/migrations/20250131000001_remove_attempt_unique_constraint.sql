-- Remove UNIQUE constraint from attempts table to allow multiple attempts per user/routine
-- This allows users to attempt the same routine multiple times and keep all attempts

-- Drop the unique constraint if it exists
ALTER TABLE attempts 
DROP CONSTRAINT IF EXISTS attempts_routine_id_user_id_key;

-- Also drop any other unique constraint that might exist with different naming
DO $$ 
BEGIN
  -- Try to drop constraint if it exists with a different name
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%routine_id%user_id%' 
    AND conrelid = 'attempts'::regclass
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE attempts DROP CONSTRAINT ' || conname
      FROM pg_constraint 
      WHERE conname LIKE '%routine_id%user_id%' 
      AND conrelid = 'attempts'::regclass
      LIMIT 1
    );
  END IF;
END $$;

-- Add a comment explaining the change
COMMENT ON TABLE attempts IS 'Users can have multiple attempts per routine. All attempts are preserved.';git 