-- Setup Storage Buckets and Policies
-- Run this in Supabase SQL Editor
-- NOTE: You may need to run this with service role permissions
-- If this doesn't work, create buckets manually via Dashboard > Storage > New Bucket

-- Create storage buckets (if they don't exist)
-- Try inserting each bucket individually to see which ones fail
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
    VALUES ('videos', 'videos', true, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime']);
  END IF;
  
  -- Create audio bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audio') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('audio', 'audio', true, 10485760, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating buckets: %. You may need to create them manually via Dashboard.', SQLERRM;
END $$;

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


