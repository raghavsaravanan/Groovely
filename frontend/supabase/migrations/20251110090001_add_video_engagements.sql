/*
  # Video Engagement Tables

  Adds persistent favorites, reposts, and comments for videos plus count columns.
*/

-- Add aggregate columns to videos (idempotent)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS favorites integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reposts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments integer DEFAULT 0;

-- Favorites table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, user_id)
);

ALTER TABLE video_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view video favorites"
  ON video_favorites FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can favorite videos"
  ON video_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own favorites"
  ON video_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reposts table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, user_id)
);

ALTER TABLE video_reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view video reposts"
  ON video_reposts FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can repost videos"
  ON video_reposts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reposts"
  ON video_reposts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Comments table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view video comments"
  ON video_comments FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can comment on videos"
  ON video_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON video_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger helpers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_video_favorites()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos
    SET favorites = (
      SELECT COUNT(*) FROM video_favorites WHERE video_id = NEW.video_id
    )
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos
    SET favorites = (
      SELECT COUNT(*) FROM video_favorites WHERE video_id = OLD.video_id
    )
    WHERE id = OLD.video_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_video_reposts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos
    SET reposts = (
      SELECT COUNT(*) FROM video_reposts WHERE video_id = NEW.video_id
    )
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos
    SET reposts = (
      SELECT COUNT(*) FROM video_reposts WHERE video_id = OLD.video_id
    )
    WHERE id = OLD.video_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_video_comments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos
    SET comments = (
      SELECT COUNT(*) FROM video_comments WHERE video_id = NEW.video_id
    )
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos
    SET comments = (
      SELECT COUNT(*) FROM video_comments WHERE video_id = OLD.video_id
    )
    WHERE id = OLD.video_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER video_favorites_update
  AFTER INSERT OR DELETE ON video_favorites
  FOR EACH ROW EXECUTE FUNCTION update_video_favorites();

CREATE TRIGGER video_reposts_update
  AFTER INSERT OR DELETE ON video_reposts
  FOR EACH ROW EXECUTE FUNCTION update_video_reposts();

CREATE TRIGGER video_comments_update
  AFTER INSERT OR DELETE ON video_comments
  FOR EACH ROW EXECUTE FUNCTION update_video_comments();

-- Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_video_favorites_video_id ON video_favorites(video_id);
CREATE INDEX IF NOT EXISTS idx_video_favorites_user_id ON video_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_video_reposts_video_id ON video_reposts(video_id);
CREATE INDEX IF NOT EXISTS idx_video_reposts_user_id ON video_reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_user_id ON video_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_created_at ON video_comments(created_at DESC);

