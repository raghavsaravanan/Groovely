import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env file
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
      } catch {}
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
  } catch (err) {}
}

loadEnvFile();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kgoxdiojhxefylulciui.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnb3hkaW9qaHhlZnlsdWxjaXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ5NDQsImV4cCI6MjA3NzE2MDk0NH0.xj_y9OWATflrlpEktirI1GcdpcFCWVC7o-NKeCaHybw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBuckets() {
  console.log('🔍 Checking storage buckets...\n');
  
  const { data: buckets, error } = await supabase.storage.listBuckets();
  
  if (error) {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.statusCode);
    return;
  }
  
  if (!buckets || buckets.length === 0) {
    console.log('⚠️  No buckets found');
    return;
  }
  
  console.log(`✅ Found ${buckets.length} bucket(s):\n`);
  
  buckets.forEach(bucket => {
    console.log(`   ${bucket.public ? '✅' : '⚠️ '} ${bucket.id} (name: ${bucket.name}, public: ${bucket.public})`);
  });
  
  console.log('\n📋 Required buckets: avatars, videos, audio\n');
  
  const bucketIds = buckets.map(b => b.id);
  const bucketNames = buckets.map(b => b.name);
  
  const required = ['avatars', 'videos', 'audio'];
  required.forEach(req => {
    const exists = bucketIds.includes(req) || bucketNames.includes(req);
    console.log(`   ${exists ? '✅' : '❌'} ${req}: ${exists ? 'EXISTS' : 'MISSING'}`);
  });
}

checkBuckets();

