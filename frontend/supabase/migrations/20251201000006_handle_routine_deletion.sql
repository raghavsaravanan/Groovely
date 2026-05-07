-- Migration: Handle routine deletion - delete attempts, videos, and recalculate scores
-- When a routine is deleted, all attempts are cascade deleted
-- This trigger handles cleanup when attempts are deleted

-- Function to recalculate user score from remaining published attempts
CREATE OR REPLACE FUNCTION recalculate_user_score(p_user_id uuid)
RETURNS void AS $$
DECLARE
  total_score integer;
BEGIN
  -- Calculate total score from all published attempts
  SELECT COALESCE(SUM(ai_score), 0)
  INTO total_score
  FROM attempts
  WHERE user_id = p_user_id
    AND status = 'published'
    AND ai_score IS NOT NULL;
  
  -- Update profile score
  UPDATE profiles
  SET score = total_score
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle attempt deletion
-- This fires when attempts are deleted (including cascade from routine deletion)
CREATE OR REPLACE FUNCTION handle_attempt_deletion()
RETURNS TRIGGER AS $$
DECLARE
  deleted_user_id uuid;
  deleted_video_url text;
  deleted_routine_id uuid;
BEGIN
  -- Store the deleted attempt's user_id, video_url, and routine_id
  deleted_user_id := OLD.user_id;
  deleted_video_url := OLD.video_url;
  deleted_routine_id := OLD.routine_id;
  
  -- Delete associated videos where kind='attempt', video_url matches, and routine_id matches
  -- This ensures we only delete the correct video for this specific attempt
  DELETE FROM videos
  WHERE video_url = deleted_video_url
    AND kind = 'attempt'
    AND user_id = deleted_user_id
    AND routine_id = deleted_routine_id;
  
  -- Recalculate user score after attempt deletion
  PERFORM recalculate_user_score(deleted_user_id);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires AFTER attempts are deleted
CREATE TRIGGER attempt_deletion_cleanup
  AFTER DELETE ON attempts
  FOR EACH ROW
  EXECUTE FUNCTION handle_attempt_deletion();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION recalculate_user_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_attempt_deletion() TO authenticated;

