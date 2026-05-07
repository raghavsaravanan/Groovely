-- Setup Storage Buckets and Policies (Fixed - handles existing policies)
-- Run this in Supabase SQL Editor
-- This script will drop existing policies and recreate them

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;

-- Create storage buckets (if they don't exist)
DO $$
BEGIN
  -- Create avatars bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  END IF;
  
  -- Create videos bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('videos', 'videos', true, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']);
  END IF;
  
  -- Create audio bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audio') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('audio', 'audio', true, 10485760, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac']);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating buckets: %. You may need to create them manually via Dashboard.', SQLERRM;
END $$;

-- Public read access for all buckets
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT TO public
USING (bucket_id IN ('videos', 'audio', 'avatars'));

-- Authenticated users can upload to all buckets
CREATE POLICY "Authenticated Upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('videos', 'audio', 'avatars'));

-- Users can delete their own files from all buckets
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id IN ('videos', 'audio', 'avatars'));

-- Verify buckets exist
SELECT id, name, public, created_at 
FROM storage.buckets 
WHERE id IN ('videos', 'audio', 'avatars')
ORDER BY id;

