-- Add DELETE policy for attempts table
-- This was missing from the original migration, causing deletion operations to fail silently

CREATE POLICY "Users can delete own attempts"
  ON attempts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

