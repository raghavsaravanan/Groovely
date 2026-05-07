-- Add status field to attempts table for draft/published functionality
ALTER TABLE attempts 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' CHECK (status IN ('draft', 'published'));

-- Update existing attempts to be published (backward compatibility)
UPDATE attempts SET status = 'published' WHERE status IS NULL OR status = 'draft';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_user_status ON attempts(user_id, status);


