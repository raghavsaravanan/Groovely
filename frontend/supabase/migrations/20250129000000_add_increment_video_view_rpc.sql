-- Create RPC function to atomically increment video view count
-- This ensures views are incremented correctly without race conditions
-- Note: SECURITY DEFINER bypasses RLS, allowing anyone to increment views

CREATE OR REPLACE FUNCTION increment_video_view(video_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_views integer;
BEGIN
  UPDATE videos
  SET views = COALESCE(views, 0) + 1
  WHERE id = video_id
  RETURNING views INTO new_views;
  
  -- Return the new view count, or 0 if no rows were updated
  RETURN COALESCE(new_views, 0);
END;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION increment_video_view(uuid) TO authenticated, anon;

-- Note: This function uses SECURITY DEFINER to bypass RLS policies
-- This is safe because it only increments views, which should be publicly trackable

