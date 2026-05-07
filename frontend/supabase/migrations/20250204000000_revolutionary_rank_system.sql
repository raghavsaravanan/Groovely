/*
  # Revolutionary Rank System - Database Migration

  This migration introduces the new multi-dimensional, seasonal, crew-integrated
  rank system for Groovely.
*/

-- ============================================================
-- 1) Update calculate_rank() tiers
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_rank(score integer)
RETURNS text AS $$
BEGIN
  IF score >= 8000 THEN
    RETURN 'Grandmaster';
  ELSIF score >= 4000 THEN
    RETURN 'Master';
  ELSIF score >= 2000 THEN
    RETURN 'Diamond';
  ELSIF score >= 1000 THEN
    RETURN 'Platinum';
  ELSIF score >= 500 THEN
    RETURN 'Gold';
  ELSIF score >= 200 THEN
    RETURN 'Silver';
  ELSE
    RETURN 'Bronze';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Ensure trigger exists to keep profiles.rank in sync
CREATE OR REPLACE FUNCTION update_profile_rank()
RETURNS trigger AS $$
BEGIN
  NEW.rank := calculate_rank(NEW.score);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profile_score_rank_update ON profiles;
CREATE TRIGGER profile_score_rank_update
  BEFORE INSERT OR UPDATE OF score ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_rank();

-- ============================================================
-- 2) Core tables for seasons, style ranks, privileges, crew rank history
-- ============================================================

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  seasonal_score integer DEFAULT 0,
  seasonal_rank text DEFAULT 'Bronze',
  legacy_points integer DEFAULT 0,
  UNIQUE(user_id, season_id)
);

CREATE TABLE IF NOT EXISTS style_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dance_style_id uuid NOT NULL REFERENCES dance_styles(id) ON DELETE CASCADE,
  score integer DEFAULT 0,
  rank text DEFAULT 'Bronze',
  mastery_level integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, dance_style_id)
);

CREATE TABLE IF NOT EXISTS rank_privileges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_tier text NOT NULL,
  privilege_type text NOT NULL,
  privilege_value text,
  description text,
  UNIQUE(rank_tier, privilege_type)
);

CREATE TABLE IF NOT EXISTS crew_rank_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  average_rank text DEFAULT 'Bronze',
  crew_score integer DEFAULT 0,
  rank_position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, season_id)
);

-- ============================================================
-- 3) Profile extensions (social + technical scores, legacy fields)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'social_score'
  ) THEN
    ALTER TABLE profiles ADD COLUMN social_score integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'technical_score'
  ) THEN
    ALTER TABLE profiles ADD COLUMN technical_score integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'legacy_points'
  ) THEN
    ALTER TABLE profiles ADD COLUMN legacy_points integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'total_seasons_participated'
  ) THEN
    ALTER TABLE profiles ADD COLUMN total_seasons_participated integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'current_season_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN current_season_id uuid REFERENCES seasons(id);
  END IF;
END $$;

-- ============================================================
-- 4) Helper functions
-- ============================================================

-- Calculate multi-dimensional rank (overall score, social, technical, season)
CREATE OR REPLACE FUNCTION calculate_multi_dimensional_rank(
  base_score integer,
  social_score integer,
  technical_score integer,
  legacy_points integer
)
RETURNS integer AS $$
DECLARE
  weighted_score integer;
BEGIN
  weighted_score :=
    coalesce(base_score, 0) * 3 +
    coalesce(social_score, 0) * 2 +
    coalesce(technical_score, 0) * 4 +
    coalesce(legacy_points, 0);

  RETURN weighted_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update style-specific rank whenever a style score changes
CREATE OR REPLACE FUNCTION update_style_rank()
RETURNS trigger AS $$
BEGIN
  NEW.rank := calculate_rank(NEW.score);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS style_ranks_score_update ON style_ranks;
CREATE TRIGGER style_ranks_score_update
  BEFORE INSERT OR UPDATE OF score ON style_ranks
  FOR EACH ROW
  EXECUTE FUNCTION update_style_rank();

-- Calculate crew rank based on member scores + bonuses
CREATE OR REPLACE FUNCTION calculate_crew_rank(p_crew_id uuid)
RETURNS TABLE(avg_rank text, crew_score integer) AS $$
DECLARE
  total_score numeric;
  member_count integer;
BEGIN
  SELECT coalesce(sum(score), 0), count(*)
  INTO total_score, member_count
  FROM profiles
  WHERE clan_id = p_crew_id;

  IF member_count = 0 THEN
    RETURN QUERY SELECT 'Bronze'::text, 0;
    RETURN;
  END IF;

  crew_score := total_score::integer;
  avg_rank := calculate_rank((total_score / member_count)::integer);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Process seasonal reset (keeps 20% legacy points, awards badges, logs history)
CREATE OR REPLACE FUNCTION process_seasonal_reset(p_season_id uuid)
RETURNS void AS $$
DECLARE
  next_season_id uuid;
BEGIN
  -- Create new season placeholder
  INSERT INTO seasons (name, start_date, end_date, is_active)
  VALUES (
    concat('Season ', to_char(now(), 'YYYY-MM')),
    now(),
    now() + interval '3 months',
    true
  )
  RETURNING id INTO next_season_id;

  -- Close previous season
  UPDATE seasons SET is_active = false WHERE id = p_season_id;

  -- Persist user stats and reset with 20% carryover
  INSERT INTO user_season_stats (user_id, season_id, seasonal_score, seasonal_rank, legacy_points)
  SELECT
    id,
    p_season_id,
    score,
    rank,
    (score * 0.2)::integer
  FROM profiles
  ON CONFLICT (user_id, season_id) DO NOTHING;

  UPDATE profiles
  SET legacy_points = legacy_points + (score * 0.2)::integer,
      score = (score * 0.2)::integer,
      social_score = (social_score * 0.2)::integer,
      technical_score = (technical_score * 0.2)::integer,
      rank = calculate_rank((score * 0.2)::integer),
      current_season_id = next_season_id,
      total_seasons_participated = total_seasons_participated + 1;

  -- Store crew rank snapshot
  INSERT INTO crew_rank_history (crew_id, season_id, average_rank, crew_score, rank_position)
  SELECT
    clans.id,
    p_season_id,
    (SELECT avg_rank FROM calculate_crew_rank(clans.id))::text,
    (SELECT crew_score FROM calculate_crew_rank(clans.id)),
    ROW_NUMBER() OVER (ORDER BY (SELECT crew_score FROM calculate_crew_rank(clans.id)) DESC)
  FROM clans;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a user has a given privilege
CREATE OR REPLACE FUNCTION has_rank_privilege(p_user_id uuid, p_privilege text)
RETURNS boolean AS $$
DECLARE
  user_rank text;
BEGIN
  SELECT rank INTO user_rank FROM profiles WHERE id = p_user_id;
  IF user_rank IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM rank_privileges
    WHERE rank_tier = user_rank AND privilege_type = p_privilege
  );
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION process_seasonal_reset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_crew_rank(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_rank_privilege(uuid, text) TO authenticated;

-- Increment style-specific score helper (used by API / client)
CREATE OR REPLACE FUNCTION increment_style_score(
  p_user_id uuid,
  p_style_id uuid,
  p_delta integer
)
RETURNS void AS $$
BEGIN
  INSERT INTO style_ranks (user_id, dance_style_id, score, mastery_level)
  VALUES (p_user_id, p_style_id, greatest(p_delta, 0), 0)
  ON CONFLICT (user_id, dance_style_id)
  DO UPDATE
  SET score = GREATEST(style_ranks.score + p_delta, 0),
      mastery_level = CASE
        WHEN style_ranks.score + p_delta >= 5000 THEN 5
        WHEN style_ranks.score + p_delta >= 2500 THEN 4
        WHEN style_ranks.score + p_delta >= 1000 THEN 3
        WHEN style_ranks.score + p_delta >= 500 THEN 2
        WHEN style_ranks.score + p_delta >= 250 THEN 1
        ELSE 0
      END,
      updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_style_score(uuid, uuid, integer) TO authenticated;

-- ============================================================
-- 5) Seed initial privilege mappings
-- ============================================================
INSERT INTO rank_privileges (rank_tier, privilege_type, privilege_value, description)
VALUES
  ('Bronze', 'crew_join', 'enabled', 'Can join existing crews'),
  ('Silver', 'crew_create', 'enabled', 'Can create new crews'),
  ('Gold', 'exclusive_routines', 'enabled', 'Access to premium routines'),
  ('Platinum', 'host_battles', 'enabled', 'Can host dance battles'),
  ('Diamond', 'featured_profile', 'enabled', 'Eligible for featured placement'),
  ('Master', 'moderation_tools', 'enabled', 'Access to community moderation tools'),
  ('Grandmaster', 'ambassador', 'enabled', 'Eligible for ambassador program')
ON CONFLICT (rank_tier, privilege_type) DO NOTHING;

-- ============================================================
-- 6) Backfill existing profile ranks to new tier system
-- ============================================================
UPDATE profiles
SET rank = calculate_rank(score);


