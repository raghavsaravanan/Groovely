/*
  # Achievements and Badges System

  This migration adds achievements/badges system for users
*/

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  condition_type text NOT NULL, -- 'score', 'followers', 'videos', 'routines', 'streak', 'clan_created', etc.
  condition_value integer NOT NULL,
  reward_score integer DEFAULT 0, -- Points awarded when unlocked
  created_at timestamptz DEFAULT now()
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements"
  ON achievements FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create user_achievements junction table
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user achievements"
  ON user_achievements FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can unlock achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Insert default achievements
INSERT INTO achievements (name, description, icon, condition_type, condition_value, reward_score) VALUES
  ('First Steps', 'Complete your first routine', '🎯', 'routines', 1, 50),
  ('Rising Star', 'Reach 1000 points', '⭐', 'score', 1000, 100),
  ('Perfect Score', 'Score 100 on any routine', '💯', 'ai_score', 100, 200),
  ('Social Butterfly', 'Follow 50 dancers', '🦋', 'followers', 50, 150),
  ('Influencer', 'Get 100 followers', '🔥', 'followers', 100, 300),
  ('Arena Master', 'Reach Main Stage', '👑', 'score', 600, 250),
  ('Clan Leader', 'Create a clan', '🏆', 'clan_created', 1, 200),
  ('30 Day Streak', 'Practice for 30 days straight', '🔥', 'streak', 30, 500),
  ('Video Star', 'Upload 10 videos', '📹', 'videos', 10, 150),
  ('Battle Champion', 'Win 10 battles', '⚔️', 'battles_won', 10, 400),
  ('Top Performer', 'Score above 90 on 5 routines', '🌟', 'high_scores', 5, 350),
  ('Community Builder', 'Join 5 clans', '👥', 'clans_joined', 5, 200)
ON CONFLICT DO NOTHING;

-- Create function to check and award achievements
CREATE OR REPLACE FUNCTION check_achievements(p_user_id uuid)
RETURNS void AS $$
DECLARE
  achievement_record RECORD;
  user_stat integer;
  already_unlocked boolean;
BEGIN
  -- Loop through all achievements
  FOR achievement_record IN SELECT * FROM achievements LOOP
    -- Check if already unlocked
    SELECT EXISTS(SELECT 1 FROM user_achievements 
                  WHERE user_id = p_user_id AND achievement_id = achievement_record.id)
    INTO already_unlocked;
    
    IF NOT already_unlocked THEN
      -- Check condition based on type
      CASE achievement_record.condition_type
        WHEN 'score' THEN
          SELECT score INTO user_stat FROM profiles WHERE id = p_user_id;
        WHEN 'followers' THEN
          SELECT COUNT(*) INTO user_stat FROM follows WHERE following_id = p_user_id;
        WHEN 'videos' THEN
          SELECT COUNT(*) INTO user_stat FROM videos WHERE user_id = p_user_id;
        WHEN 'routines' THEN
          SELECT COUNT(*) INTO user_stat FROM routines WHERE creator_id = p_user_id;
        WHEN 'clan_created' THEN
          SELECT COUNT(*) INTO user_stat FROM profiles 
          WHERE id = p_user_id AND clan_id IS NOT NULL;
        WHEN 'ai_score' THEN
          SELECT COUNT(*) INTO user_stat FROM videos 
          WHERE user_id = p_user_id AND ai_score >= achievement_record.condition_value;
        WHEN 'high_scores' THEN
          SELECT COUNT(*) INTO user_stat FROM videos 
          WHERE user_id = p_user_id AND ai_score >= 90;
        WHEN 'battles_won' THEN
          SELECT COUNT(*) INTO user_stat FROM battles 
          WHERE (challenger_id = p_user_id OR opponent_id = p_user_id) 
          AND status = 'completed'
          AND ((challenger_id = p_user_id AND challenger_votes > opponent_votes) OR
               (opponent_id = p_user_id AND opponent_votes > challenger_votes));
        WHEN 'clans_joined' THEN
          SELECT COUNT(*) INTO user_stat FROM profiles 
          WHERE id = p_user_id AND clan_id IS NOT NULL;
        ELSE
          user_stat := 0;
      END CASE;
      
      -- Award achievement if condition met
      IF user_stat >= achievement_record.condition_value THEN
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (p_user_id, achievement_record.id)
        ON CONFLICT DO NOTHING;
        
        -- Award score if reward exists
        IF achievement_record.reward_score > 0 THEN
          UPDATE profiles 
          SET score = score + achievement_record.reward_score
          WHERE id = p_user_id;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_achievements_condition_type ON achievements(condition_type);

