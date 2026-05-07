-- Migration: Add user feedback table for feedback forms and star ratings
-- This table stores both star ratings (1-5) and detailed feedback form submissions

-- Create user_feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Star rating (1-5, nullable - only present if user submitted rating)
  rating integer CHECK (rating >= 1 AND rating <= 5),
  
  -- Feedback form fields (from feedback page)
  would_use_again text CHECK (would_use_again IN ('yes', 'maybe', 'no')),
  score_expectation text,
  frustrating text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least rating or feedback form fields are provided
  CONSTRAINT at_least_one_field CHECK (
    rating IS NOT NULL OR 
    would_use_again IS NOT NULL OR 
    score_expectation IS NOT NULL OR 
    frustrating IS NOT NULL
  )
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at DESC);

-- Create index on rating for analytics
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON user_feedback(rating) WHERE rating IS NOT NULL;

-- Create index on would_use_again for feedback analysis
CREATE INDEX IF NOT EXISTS idx_user_feedback_would_use_again ON user_feedback(would_use_again) WHERE would_use_again IS NOT NULL;

-- Enable RLS (Row Level Security)
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
  ON user_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Admins/service role can view all feedback (for analytics)
-- Note: This requires service_role key, not anon key
CREATE POLICY "Service role can view all feedback"
  ON user_feedback
  FOR SELECT
  TO service_role
  USING (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_user_feedback_updated_at
  BEFORE UPDATE ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_user_feedback_updated_at();

-- Grant permissions
GRANT SELECT, INSERT ON user_feedback TO authenticated;
GRANT SELECT ON user_feedback TO service_role;

COMMENT ON TABLE user_feedback IS 'Stores user feedback including star ratings (1-5) and detailed feedback form submissions';
COMMENT ON COLUMN user_feedback.rating IS 'Star rating from 1-5 (only present for rating popup submissions)';
COMMENT ON COLUMN user_feedback.would_use_again IS 'Answer to "Would you use Groovely again?" - yes/maybe/no (only present for feedback form)';
COMMENT ON COLUMN user_feedback.score_expectation IS 'Answer to "What did you expect this score to tell you?" (only present for feedback form)';
COMMENT ON COLUMN user_feedback.frustrating IS 'Answer to "What was frustrating or confusing?" (only present for feedback form)';
