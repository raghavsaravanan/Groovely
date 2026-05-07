/*
  # Add Missing Tables for Full Functionality

  This migration adds all the missing tables needed for the full functionality:
  - battles: Battle system between dancers
  - routines: Dance routines/choreography
  - attempts: User attempts at routines
  - follows: Follow relationships between users
  - battle_votes: Votes on battles
  - clan_messages: Messages in clan chats
  - arenas: Arena/ranking system
  - video_likes: Proper like tracking for videos
*/

-- Create routines table
CREATE TABLE IF NOT EXISTS routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  song_url text,
  cover_url text,
  style_id uuid REFERENCES dance_styles(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view routines"
  ON routines FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can create routines"
  ON routines FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- Create attempts table
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  ai_score integer,
  ai_feedback jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(routine_id, user_id)
);

ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view attempts"
  ON attempts FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can create own attempts"
  ON attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own attempts"
  ON attempts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows"
  ON follows FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- Create battles table
CREATE TABLE IF NOT EXISTS battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opponent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  challenger_video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  opponent_video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'voting', 'completed')),
  challenger_votes integer DEFAULT 0,
  opponent_votes integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CHECK (challenger_id != opponent_id)
);

ALTER TABLE battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view battles"
  ON battles FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can create battles"
  ON battles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Users can update battles they're involved in"
  ON battles FOR UPDATE
  TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id)
  WITH CHECK (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Create battle_votes table
CREATE TABLE IF NOT EXISTS battle_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_for text NOT NULL CHECK (vote_for IN ('challenger', 'opponent')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(battle_id, user_id)
);

ALTER TABLE battle_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view battle votes"
  ON battle_votes FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can vote on battles"
  ON battle_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON battle_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON battle_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add creator_id to clans if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clans' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE clans ADD COLUMN creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create clan_messages table
CREATE TABLE IF NOT EXISTS clan_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clan_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clan messages"
  ON clan_messages FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can send clan messages"
  ON clan_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON clan_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create arenas table
CREATE TABLE IF NOT EXISTS arenas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_score integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE arenas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view arenas"
  ON arenas FOR SELECT
  TO authenticated, anon
  USING (true);

-- Insert default arenas if they don't exist
INSERT INTO arenas (name, min_score, order_index) VALUES
  ('Studio 1', 0, 0),
  ('Studio 2', 200, 1),
  ('Main Stage', 600, 2),
  ('Pro League', 1200, 3)
ON CONFLICT (name) DO NOTHING;

-- Create video_likes table for proper like tracking
CREATE TABLE IF NOT EXISTS video_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, user_id)
);

ALTER TABLE video_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view video likes"
  ON video_likes FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can like videos"
  ON video_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike videos"
  ON video_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update battle vote counts
CREATE OR REPLACE FUNCTION update_battle_votes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE battles
    SET challenger_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = NEW.battle_id AND vote_for = 'challenger'
    ),
    opponent_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = NEW.battle_id AND vote_for = 'opponent'
    )
    WHERE id = NEW.battle_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE battles
    SET challenger_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = OLD.battle_id AND vote_for = 'challenger'
    ),
    opponent_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = OLD.battle_id AND vote_for = 'opponent'
    )
    WHERE id = OLD.battle_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE battles
    SET challenger_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = NEW.battle_id AND vote_for = 'challenger'
    ),
    opponent_votes = (
      SELECT COUNT(*) FROM battle_votes
      WHERE battle_id = NEW.battle_id AND vote_for = 'opponent'
    )
    WHERE id = NEW.battle_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER battle_votes_update
  AFTER INSERT OR UPDATE OR DELETE ON battle_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_battle_votes();

-- Create function to update video like counts
CREATE OR REPLACE FUNCTION update_video_likes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos
    SET likes = (
      SELECT COUNT(*) FROM video_likes
      WHERE video_id = NEW.video_id
    )
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos
    SET likes = (
      SELECT COUNT(*) FROM video_likes
      WHERE video_id = OLD.video_id
    )
    WHERE id = OLD.video_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER video_likes_update
  AFTER INSERT OR DELETE ON video_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_video_likes();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_routines_creator_id ON routines(creator_id);
CREATE INDEX IF NOT EXISTS idx_routines_created_at ON routines(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_routine_id ON attempts(routine_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_battles_challenger_id ON battles(challenger_id);
CREATE INDEX IF NOT EXISTS idx_battles_opponent_id ON battles(opponent_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_routine_id ON battles(routine_id);
CREATE INDEX IF NOT EXISTS idx_battle_votes_battle_id ON battle_votes(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_votes_user_id ON battle_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_clan_messages_clan_id ON clan_messages(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_messages_created_at ON clan_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON video_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_arenas_order_index ON arenas(order_index);

