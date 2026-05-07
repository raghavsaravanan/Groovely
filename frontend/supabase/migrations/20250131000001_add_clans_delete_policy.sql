-- Add DELETE policy for clans table
-- This allows clan creators to delete their own clans

CREATE POLICY "Creators can delete own clans"
  ON clans FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- Also allow deletion if no creator_id is set (for legacy clans)
-- This is a fallback for clans created before creator_id was added
CREATE POLICY "Users can delete clans without creator"
  ON clans FOR DELETE
  TO authenticated
  USING (creator_id IS NULL);

