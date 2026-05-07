-- Rank System Migration
-- This migration adds automatic rank calculation based on score

-- Function to calculate rank based on score
CREATE OR REPLACE FUNCTION calculate_rank(score INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF score >= 2000 THEN
    RETURN 'Grandmaster';
  ELSIF score >= 1000 THEN
    RETURN 'Master';
  ELSIF score >= 600 THEN
    RETURN 'Expert';
  ELSIF score >= 300 THEN
    RETURN 'Advanced';
  ELSIF score >= 100 THEN
    RETURN 'Intermediate';
  ELSE
    RETURN 'Beginner';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update rank when score changes
CREATE OR REPLACE FUNCTION update_profile_rank()
RETURNS TRIGGER AS $$
BEGIN
  -- Update rank based on new score
  NEW.rank := calculate_rank(NEW.score);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update rank when score changes
DROP TRIGGER IF EXISTS profile_score_rank_update ON profiles;
CREATE TRIGGER profile_score_rank_update
  BEFORE INSERT OR UPDATE OF score ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_rank();

-- Update all existing profiles to have correct ranks
UPDATE profiles
SET rank = calculate_rank(score);

-- Function to reset all scores (for admin use)
CREATE OR REPLACE FUNCTION reset_all_scores()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET score = 0,
      rank = 'Beginner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (you may want to restrict this to admins only)
-- For MVP, we'll allow authenticated users to call this
GRANT EXECUTE ON FUNCTION reset_all_scores() TO authenticated;

-- Function to update all ranks (useful after bulk score updates)
CREATE OR REPLACE FUNCTION update_all_ranks()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET rank = calculate_rank(score);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_all_ranks() TO authenticated;


