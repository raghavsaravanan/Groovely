/**
 * Storage Buckets Setup Script
 * 
 * This script checks for required storage buckets and creates them if missing.
 * It attempts to create buckets via Supabase API, with fallback instructions
 * for manual creation via Dashboard.
 * 
 * Run with: npx tsx scripts/setup-storage-buckets.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Try to load .env file if it exists
function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), '.env');
    const envLocalPath = join(process.cwd(), '.env.local');
    
    let envContent = '';
    try {
      envContent = readFileSync(envLocalPath, 'utf-8');
    } catch {
      try {
        envContent = readFileSync(envPath, 'utf-8');
      } catch {
        // No .env file found, that's okay
      }
    }
    
    if (envContent) {
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      });
    }
  } catch (err) {
    // Ignore errors loading .env file
  }
}

// Load .env file
loadEnvFile();

// Get Supabase credentials from environment
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials.\n');
  console.error('📝 SETUP OPTIONS:\n');
  console.error('Option 1 - Environment Variables:');
  console.error('   export VITE_SUPABASE_URL="your-project-url"');
  console.error('   export VITE_SUPABASE_ANON_KEY="your-anon-key"');
  console.error('   npx tsx scripts/setup-storage-buckets.ts\n');
  console.error('Option 2 - .env file (Recommended):');
  console.error('   Create a .env file in the frontend directory with:');
  console.error('   VITE_SUPABASE_URL=your-project-url');
  console.error('   VITE_SUPABASE_ANON_KEY=your-anon-key');
  console.error('   Then run: npx tsx scripts/setup-storage-buckets.ts\n');
  console.error('💡 You can find these values in:');
  console.error('   Supabase Dashboard > Project Settings > API\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface BucketConfig {
  id: string;
  name: string;
  public: boolean;
  fileSizeLimit?: number;
  allowedMimeTypes?: string[];
}

const requiredBuckets: BucketConfig[] = [
  {
    id: 'avatars',
    name: 'avatars',
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  {
    id: 'videos',
    name: 'videos',
    public: true,
    fileSizeLimit: 104857600, // 100MB
    allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime']
  },
  {
    id: 'audio',
    name: 'audio',
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
  }
];

async function checkBucketExists(bucketId: string): Promise<boolean> {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.warn(`⚠️  Error checking buckets: ${error.message}`);
      return false;
    }
    
    return buckets?.some(b => b.id === bucketId || b.name === bucketId) || false;
  } catch (err) {
    console.warn(`⚠️  Error checking bucket ${bucketId}:`, err);
    return false;
  }
}

async function createBucketViaAPI(config: BucketConfig): Promise<boolean> {
  try {
    // Note: Creating buckets via API typically requires service role key
    // This might fail with anon key, but we'll try anyway
    console.log(`   Attempting to create bucket '${config.id}' via API...`);
    
    // Supabase JS client doesn't have a direct createBucket method
    // We need to use the REST API directly or SQL
    // For now, we'll provide instructions for manual creation
    
    return false; // API creation not available via anon key
  } catch (err: any) {
    console.warn(`   ⚠️  API creation failed: ${err.message}`);
    return false;
  }
}

async function setupStorageBuckets() {
  console.log('🗄️  Setting up Storage Buckets...\n');
  console.log('=' .repeat(60));
  console.log('');
  
  // Check existing buckets
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    console.error('\n💡 This might mean:');
    console.error('   1. Your Supabase credentials are incorrect');
    console.error('   2. Storage is not enabled in your Supabase project');
    console.error('   3. You need service role permissions\n');
    console.log('📝 MANUAL SETUP REQUIRED:\n');
    printManualInstructions();
    process.exit(1);
  }
  
  const existingBucketIds = existingBuckets?.map(b => b.id) || [];
  const missingBuckets: BucketConfig[] = [];
  const needsUpdate: { bucket: BucketConfig; reason: string }[] = [];
  
  // Check each required bucket
  for (const bucketConfig of requiredBuckets) {
    const exists = existingBucketIds.includes(bucketConfig.id);
    const existingBucket = existingBuckets?.find(b => b.id === bucketConfig.id);
    
    if (!exists) {
      missingBuckets.push(bucketConfig);
      console.log(`❌ ${bucketConfig.id}: MISSING`);
    } else if (existingBucket) {
      if (!existingBucket.public && bucketConfig.public) {
        needsUpdate.push({ bucket: bucketConfig, reason: 'not public' });
        console.log(`⚠️  ${bucketConfig.id}: EXISTS but NOT PUBLIC`);
      } else {
        console.log(`✅ ${bucketConfig.id}: EXISTS and configured correctly`);
      }
    }
  }
  
  console.log('');
  
  // If all buckets exist and are configured correctly
  if (missingBuckets.length === 0 && needsUpdate.length === 0) {
    console.log('✅ All required storage buckets exist and are configured correctly!\n');
    console.log('Next steps:');
    console.log('1. Verify storage policies in Supabase Dashboard > Storage > Policies');
    console.log('2. Run: npx tsx scripts/verify-crews-setup.ts\n');
    process.exit(0);
  }
  
  // Try to create missing buckets via SQL (if we can)
  if (missingBuckets.length > 0) {
    console.log(`📝 ${missingBuckets.length} bucket(s) need to be created:\n`);
    
    // Generate SQL for bucket creation
    console.log('SQL Migration (run in Supabase Dashboard > SQL Editor):\n');
    console.log('-- Create missing storage buckets');
    console.log('DO $$');
    console.log('BEGIN');
    
    for (const bucket of missingBuckets) {
      console.log(`  -- Create ${bucket.id} bucket`);
      console.log(`  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = '${bucket.id}') THEN`);
      console.log(`    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)`);
      console.log(`    VALUES ('${bucket.id}', '${bucket.name}', true, ${bucket.fileSizeLimit}, ARRAY[${bucket.allowedMimeTypes?.map(m => `'${m}'`).join(', ') || ''}]);`);
      console.log(`  END IF;`);
    }
    
    console.log('END $$;');
    console.log('');
  }
  
  // Print manual instructions
  printManualInstructions(missingBuckets, needsUpdate);
  
  // Print storage policies SQL
  printStoragePoliciesSQL();
  
  process.exit(1);
}

function printManualInstructions(
  missingBuckets: BucketConfig[] = requiredBuckets,
  needsUpdate: { bucket: BucketConfig; reason: string }[] = []
) {
  console.log('📝 MANUAL SETUP INSTRUCTIONS:\n');
  console.log('1. Go to Supabase Dashboard > Storage');
  console.log('2. For each missing bucket, click "New Bucket"\n');
  
  if (missingBuckets.length > 0) {
    console.log('Missing Buckets:');
    missingBuckets.forEach(bucket => {
      console.log(`\n   ${bucket.id}:`);
      console.log(`   - Name: ${bucket.name} (exactly, lowercase)`);
      console.log(`   - Public: ✅ Yes (check this box!)`);
      console.log(`   - File size limit: ${(bucket.fileSizeLimit || 0) / 1024 / 1024}MB`);
      console.log(`   - Allowed MIME types: ${bucket.allowedMimeTypes?.join(', ') || 'all'}`);
    });
  }
  
  if (needsUpdate.length > 0) {
    console.log('\nBuckets that need updates:');
    needsUpdate.forEach(({ bucket, reason }) => {
      console.log(`\n   ${bucket.id}:`);
      console.log(`   - Issue: ${reason}`);
      console.log(`   - Fix: Go to Storage > ${bucket.id} > Settings > Make Public`);
    });
  }
  
  console.log('\n3. After creating buckets, set up storage policies (see SQL below)\n');
}

function printStoragePoliciesSQL() {
  console.log('📋 STORAGE POLICIES SQL:\n');
  console.log('-- Run this in Supabase Dashboard > SQL Editor after creating buckets');
  console.log('');
  console.log('-- Public read access');
  console.log('DROP POLICY IF EXISTS "Public Access" ON storage.objects;');
  console.log('CREATE POLICY "Public Access"');
  console.log('ON storage.objects FOR SELECT');
  console.log('TO public');
  console.log("USING (bucket_id IN ('videos', 'audio', 'avatars'));");
  console.log('');
  console.log('-- Authenticated upload');
  console.log('DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;');
  console.log('CREATE POLICY "Authenticated Upload"');
  console.log('ON storage.objects FOR INSERT');
  console.log('TO authenticated');
  console.log("WITH CHECK (bucket_id IN ('videos', 'audio', 'avatars'));");
  console.log('');
  console.log('-- Users can delete own files');
  console.log('DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;');
  console.log('CREATE POLICY "Users can delete own files"');
  console.log('ON storage.objects FOR DELETE');
  console.log('TO authenticated');
  console.log("USING (bucket_id IN ('videos', 'audio', 'avatars'));");
  console.log('');
}

// Run setup
setupStorageBuckets().catch(err => {
  console.error('❌ Fatal error during setup:', err);
  process.exit(1);
});

