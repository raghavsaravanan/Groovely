/*
  # Dancely Platform Schema

  ## Overview
  Creates the foundational database schema for Dancely, a social dance platform with AI coaching and gamification.

  ## 1. New Tables
  
  ### `profiles`
  - `id` (uuid, primary key, references auth.users)
  - `username` (text, unique, not null)
  - `display_name` (text)
  - `bio` (text)
  - `avatar_url` (text)
  - `score` (integer, default 0)
  - `rank` (text, default 'Beginner')
  - `clan_id` (uuid, nullable, references clans)
  - `created_at` (timestamptz, default now)
  - `updated_at` (timestamptz, default now)

  ### `dance_styles`
  - `id` (uuid, primary key)
  - `name` (text, unique, not null)
  - `description` (text)
  - `icon` (text)
  - `created_at` (timestamptz, default now)

  ### `user_dance_styles`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `dance_style_id` (uuid, references dance_styles)
  - `created_at` (timestamptz, default now)
  - Unique constraint on (user_id, dance_style_id)

  ### `clans`
  - `id` (uuid, primary key)
  - `name` (text, unique, not null)
  - `description` (text)
  - `avatar_url` (text)
  - `total_score` (integer, default 0)
  - `created_at` (timestamptz, default now)

  ### `videos`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `title` (text, not null)
  - `description` (text)
  - `video_url` (text, not null)
  - `thumbnail_url` (text)
  - `dance_style_id` (uuid, references dance_styles)
  - `ai_score` (integer, nullable)
  - `ai_feedback` (jsonb, nullable)
  - `views` (integer, default 0)
  - `likes` (integer, default 0)
  - `created_at` (timestamptz, default now)

  ## 2. Security
  
  All tables have Row Level Security (RLS) enabled with appropriate policies:
  
  ### Profiles
  - Anyone can view profiles
  - Users can only update their own profile
  
  ### Dance Styles
  - Anyone can view dance styles
  - Only authenticated users can create (for future admin)
  
  ### User Dance Styles
  - Anyone can view user dance style associations
  - Users can only manage their own dance style preferences
  
  ### Clans
  - Anyone can view clans
  - Only authenticated users can create clans
  
  ### Videos
  - Anyone can view videos
  - Users can create their own videos
  - Users can only update/delete their own videos

  ## 3. Initial Data
  
  Seeds the database with common dance styles:
  - Hip Hop
  - Ballet
  - Contemporary
  - Salsa
  - Breakdancing
  - Jazz
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  bio text DEFAULT '',
  avatar_url text,
  score integer DEFAULT 0,
  rank text DEFAULT 'Beginner',
  clan_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create dance_styles table
CREATE TABLE IF NOT EXISTS dance_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dance_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dance styles"
  ON dance_styles FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can create dance styles"
  ON dance_styles FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create clans table
CREATE TABLE IF NOT EXISTS clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  avatar_url text,
  total_score integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clans"
  ON clans FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can create clans"
  ON clans FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add foreign key for clan_id in profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_clan_id_fkey'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_clan_id_fkey
    FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create user_dance_styles junction table
CREATE TABLE IF NOT EXISTS user_dance_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dance_style_id uuid NOT NULL REFERENCES dance_styles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, dance_style_id)
);

ALTER TABLE user_dance_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user dance styles"
  ON user_dance_styles FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can manage own dance styles"
  ON user_dance_styles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dance styles"
  ON user_dance_styles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  video_url text NOT NULL,
  thumbnail_url text,
  dance_style_id uuid REFERENCES dance_styles(id) ON DELETE SET NULL,
  ai_score integer,
  ai_feedback jsonb,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view videos"
  ON videos FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can create own videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert initial dance styles
INSERT INTO dance_styles (name, description, icon) VALUES
  ('Hip Hop', 'Urban street dance with energetic movements', '🎤'),
  ('Ballet', 'Classical dance with grace and precision', '🩰'),
  ('Contemporary', 'Expressive modern dance combining multiple styles', '💃'),
  ('Salsa', 'Latin dance with rhythmic partner movements', '🔥'),
  ('Breakdancing', 'Acrobatic street dance with power moves', '⚡'),
  ('Jazz', 'Upbeat dance with sharp, dynamic movements', '🎺')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_score ON profiles(score DESC);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_dance_styles_user_id ON user_dance_styles(user_id);
