/**
 * Script to check if storage buckets exist
 * Run with: npx tsx scripts/check-storage-buckets.ts
 */

import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables or replace with your values
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBuckets() {
  console.log('🔍 Checking storage buckets...\n');

  const requiredBuckets = ['avatars', 'videos', 'audio'];
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ Error listing buckets:', error.message);
      console.error('\n💡 This might mean:');
      console.error('   1. Your Supabase credentials are incorrect');
      console.error('   2. Storage is not enabled in your Supabase project');
      console.error('   3. You need service role permissions');
      return;
    }

    if (!buckets || buckets.length === 0) {
      console.log('⚠️  No buckets found in your Supabase project.\n');
      console.log('📝 To create buckets:');
      console.log('   1. Go to Supabase Dashboard > Storage');
      console.log('   2. Click "New Bucket"');
      console.log('   3. Create each bucket with these settings:\n');
      
      requiredBuckets.forEach(bucket => {
        console.log(`   ${bucket}:`);
        console.log(`   - Name: ${bucket}`);
        console.log(`   - Public: Yes`);
        console.log('');
      });
      return;
    }

    console.log(`✅ Found ${buckets.length} bucket(s):\n`);
    
    const bucketNames = buckets.map(b => b.name);
    const missingBuckets: string[] = [];
    
    requiredBuckets.forEach(bucket => {
      const exists = bucketNames.includes(bucket);
      const bucketInfo = buckets.find(b => b.name === bucket);
      
      if (exists && bucketInfo) {
        const isPublic = bucketInfo.public ? '✅' : '❌';
        console.log(`   ${isPublic} ${bucket} (Public: ${bucketInfo.public ? 'Yes' : 'No'})`);
      } else {
        console.log(`   ❌ ${bucket} (MISSING)`);
        missingBuckets.push(bucket);
      }
    });

    if (missingBuckets.length > 0) {
      console.log(`\n⚠️  Missing ${missingBuckets.length} bucket(s): ${missingBuckets.join(', ')}\n`);
      console.log('📝 To create missing buckets:');
      console.log('   1. Go to Supabase Dashboard > Storage');
      console.log('   2. Click "New Bucket"');
      console.log('   3. For each missing bucket:');
      console.log('      - Name: [bucket name]');
      console.log('      - Public: Yes (check this box)');
      console.log('      - Click "Create Bucket"\n');
      
      console.log('💡 Or run the SQL migration:');
      console.log('   frontend/supabase/migrations/20250128000002_setup_storage.sql');
      console.log('   in Supabase SQL Editor\n');
    } else {
      console.log('\n✅ All required buckets exist!\n');
    }

  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
  }
}

checkBuckets();

