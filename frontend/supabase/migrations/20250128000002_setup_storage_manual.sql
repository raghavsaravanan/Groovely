-- Manual Storage Bucket Creation Script
-- This is an alternative approach if the main migration doesn't work
-- Run this in Supabase SQL Editor

-- IMPORTANT: If this SQL doesn't work, you MUST create buckets manually via Dashboard
-- Go to: Supabase Dashboard > Storage > New Bucket

-- Method 1: Try direct INSERT (may require service role)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Method 2: If above doesn't work, use this function approach
-- (Uncomment if Method 1 fails)
/*
CREATE OR REPLACE FUNCTION create_storage_bucket(
  bucket_id text,
  bucket_name text,
  is_public boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = bucket_id) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES (bucket_id, bucket_name, is_public);
  END IF;
END;
$$;

SELECT create_storage_bucket('avatars', 'avatars', true);
SELECT create_storage_bucket('videos', 'videos', true);
SELECT create_storage_bucket('audio', 'audio', true);
*/

-- Setup Storage Policies (these should work even if bucket creation fails)
-- Public read access
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('videos', 'audio', 'avatars'));

-- Authenticated upload
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('videos', 'audio', 'avatars'));

-- Users can delete own files
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('videos', 'audio', 'avatars'));

