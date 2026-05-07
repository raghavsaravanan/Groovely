/**
 * Script to check video URLs in the database and identify videos that need migration to Supabase
 * Run with: npx tsx scripts/check-video-urls.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkVideoUrls() {
  console.log('🔍 Checking video URLs in database...\n');

  // Fetch all videos
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, title, video_url, user_id, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching videos:', error);
    return;
  }

  if (!videos || videos.length === 0) {
    console.log('⚠️  No videos found in database');
    return;
  }

  console.log(`📊 Found ${videos.length} videos\n`);

  const supabaseUrls: any[] = [];
  const localPaths: any[] = [];
  const httpUrls: any[] = [];
  const invalidUrls: any[] = [];

  videos.forEach((video) => {
    const url = video.video_url;
    
    if (!url) {
      invalidUrls.push({ ...video, reason: 'Missing URL' });
    } else if (url.includes('supabase.co/storage') || url.includes(supabaseUrl)) {
      supabaseUrls.push(video);
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      httpUrls.push(video);
    } else if (url.startsWith('/static/') || url.startsWith('static/') || url.startsWith('/') || !url.includes('://')) {
      localPaths.push({ ...video, reason: 'Local/relative path' });
    } else {
      invalidUrls.push({ ...video, reason: 'Invalid URL format' });
    }
  });

  console.log('✅ Supabase URLs:', supabaseUrls.length);
  if (supabaseUrls.length > 0 && supabaseUrls.length <= 5) {
    supabaseUrls.forEach(v => console.log(`   - "${v.title}" (${v.id})`));
  } else if (supabaseUrls.length > 5) {
    supabaseUrls.slice(0, 5).forEach(v => console.log(`   - "${v.title}" (${v.id})`));
    console.log(`   ... and ${supabaseUrls.length - 5} more`);
  }

  console.log('\n🌐 External HTTP URLs:', httpUrls.length);
  if (httpUrls.length > 0 && httpUrls.length <= 5) {
    httpUrls.forEach(v => console.log(`   - "${v.title}": ${v.video_url}`));
  } else if (httpUrls.length > 5) {
    httpUrls.slice(0, 5).forEach(v => console.log(`   - "${v.title}": ${v.video_url}`));
    console.log(`   ... and ${httpUrls.length - 5} more`);
  }

  console.log('\n⚠️  Local/Relative Paths (need migration):', localPaths.length);
  if (localPaths.length > 0) {
    localPaths.forEach(v => {
      console.log(`   - "${v.title}" (${v.id}): ${v.video_url}`);
      console.log(`     Reason: ${v.reason}`);
    });
  }

  console.log('\n❌ Invalid/Missing URLs:', invalidUrls.length);
  if (invalidUrls.length > 0) {
    invalidUrls.forEach(v => {
      console.log(`   - "${v.title}" (${v.id}): ${v.video_url || 'NULL'}`);
      console.log(`     Reason: ${v.reason}`);
    });
  }

  // Check for specific video
  const lugljkVideo = videos.find(v => v.title?.toLowerCase().includes('lugljk'));
  if (lugljkVideo) {
    console.log('\n🎯 Found "LUGLJK" video:');
    console.log(`   Title: "${lugljkVideo.title}"`);
    console.log(`   ID: ${lugljkVideo.id}`);
    console.log(`   URL: ${lugljkVideo.video_url}`);
    console.log(`   Status: ${
      lugljkVideo.video_url?.includes('supabase.co/storage') ? '✅ Supabase URL' :
      lugljkVideo.video_url?.startsWith('http') ? '🌐 External URL' :
      '⚠️  Local/Relative Path'
    }`);
  } else {
    console.log('\n⚠️  "LUGLJK" video not found in database');
  }

  console.log('\n📋 Summary:');
  console.log(`   Total videos: ${videos.length}`);
  console.log(`   ✅ Supabase URLs: ${supabaseUrls.length} (${((supabaseUrls.length / videos.length) * 100).toFixed(1)}%)`);
  console.log(`   🌐 External URLs: ${httpUrls.length} (${((httpUrls.length / videos.length) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Need migration: ${localPaths.length} (${((localPaths.length / videos.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Invalid: ${invalidUrls.length} (${((invalidUrls.length / videos.length) * 100).toFixed(1)}%)`);
}

checkVideoUrls().catch(console.error);

