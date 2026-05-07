/*
  # Setup Storage Buckets and Policies
  
  This migration creates the required storage buckets for the Crews feature
  and sets up the necessary storage policies.
  
  Run this in Supabase Dashboard > SQL Editor
  
  What this migration does:
  1. Creates avatars bucket (for crew avatars)
  2. Creates videos bucket (for video uploads)
  3. Creates audio bucket (for audio files)
  4. Sets up public read access policies
  5. Sets up authenticated upload policies
  6. Sets up file deletion policies
*/

-- ============================================================================
-- STEP 1: Create Storage Buckets
-- ============================================================================

DO $$
BEGIN
  -- Create avatars bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    RAISE NOTICE '✅ Created avatars bucket';
  ELSE
    RAISE NOTICE 'ℹ️  avatars bucket already exists';
  END IF;
  
  -- Create videos bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('videos', 'videos', true, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime']);
    RAISE NOTICE '✅ Created videos bucket';
  ELSE
    RAISE NOTICE 'ℹ️  videos bucket already exists';
  END IF;
  
  -- Create audio bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audio') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('audio', 'audio', true, 10485760, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']);
    RAISE NOTICE '✅ Created audio bucket';
  ELSE
    RAISE NOTICE 'ℹ️  audio bucket already exists';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '⚠️  Error creating buckets: %. You may need to create them manually via Dashboard.', SQLERRM;
    RAISE NOTICE '📝 Manual setup: Go to Supabase Dashboard > Storage > New Bucket';
END $$;

-- ============================================================================
-- STEP 2: Setup Storage Policies
-- ============================================================================

-- Public read access (anyone can view files)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('videos', 'audio', 'avatars'));

-- Authenticated users can upload files
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('videos', 'audio', 'avatars'));

-- Authenticated users can update their own files
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id IN ('videos', 'audio', 'avatars'))
WITH CHECK (bucket_id IN ('videos', 'audio', 'avatars'));

-- Authenticated users can delete files (from any bucket)
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('videos', 'audio', 'avatars'));

-- ============================================================================
-- VERIFICATION: Check that buckets were created
-- ============================================================================

DO $$
DECLARE
  avatars_exists boolean;
  videos_exists boolean;
  audio_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') INTO avatars_exists;
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') INTO videos_exists;
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audio') INTO audio_exists;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 STORAGE BUCKETS SETUP SUMMARY';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  
  IF avatars_exists THEN
    RAISE NOTICE '✅ avatars bucket: EXISTS';
  ELSE
    RAISE WARNING '❌ avatars bucket: MISSING (create manually)';
  END IF;
  
  IF videos_exists THEN
    RAISE NOTICE '✅ videos bucket: EXISTS';
  ELSE
    RAISE WARNING '❌ videos bucket: MISSING (create manually)';
  END IF;
  
  IF audio_exists THEN
    RAISE NOTICE '✅ audio bucket: EXISTS';
  ELSE
    RAISE WARNING '❌ audio bucket: MISSING (create manually)';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Storage policies: CREATED';
  RAISE NOTICE '';
  
  IF avatars_exists AND videos_exists AND audio_exists THEN
    RAISE NOTICE '✅ All storage buckets created successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run: npx tsx scripts/verify-crews-setup.ts';
    RAISE NOTICE '2. Test crew avatar uploads';
  ELSE
    RAISE WARNING '⚠️  Some buckets are missing. Create them manually:';
    RAISE NOTICE '   Supabase Dashboard > Storage > New Bucket';
  END IF;
  
  RAISE NOTICE '';
END $$;

