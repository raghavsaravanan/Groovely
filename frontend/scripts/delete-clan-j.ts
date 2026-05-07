/**
 * Script to delete clan "J" from Supabase
 * 
 * Run this script using: npx tsx scripts/delete-clan-j.ts
 * Or use the SQL script directly in Supabase SQL Editor
 */

import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables or replace with your values
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function deleteClanJ() {
  console.log('🔍 Searching for clan "J"...');

  // Find the clan
  const { data: clans, error: findError } = await supabase
    .from('clans')
    .select('id, name, description, creator_id, total_score')
    .ilike('name', 'j');

  if (findError) {
    console.error('❌ Error finding clan:', findError);
    return;
  }

  if (!clans || clans.length === 0) {
    console.log('✅ No clan named "J" found. Nothing to delete.');
    return;
  }

  console.log(`📋 Found ${clans.length} clan(s) with name "J":`);
  clans.forEach((clan, index) => {
    console.log(`  ${index + 1}. ID: ${clan.id}, Name: ${clan.name}, Creator: ${clan.creator_id}`);
  });

  const clanToDelete = clans[0];
  console.log(`\n🗑️  Deleting clan "${clanToDelete.name}" (ID: ${clanToDelete.id})...`);

  // Step 1: Delete clan messages
  console.log('  Step 1: Deleting clan messages...');
  const { error: messagesError } = await supabase
    .from('clan_messages')
    .delete()
    .eq('clan_id', clanToDelete.id);

  if (messagesError) {
    console.warn('  ⚠️  Warning deleting messages (may be due to RLS):', messagesError.message);
  } else {
    console.log('  ✅ Clan messages deleted');
  }

  // Step 2: Update profiles to remove clan_id
  console.log('  Step 2: Removing clan_id from profiles...');
  const { error: profilesError } = await supabase
    .from('profiles')
    .update({ clan_id: null })
    .eq('clan_id', clanToDelete.id);

  if (profilesError) {
    console.error('  ❌ Error updating profiles:', profilesError);
    return;
  } else {
    console.log('  ✅ Profiles updated');
  }

  // Step 3: Delete the clan
  console.log('  Step 3: Deleting clan...');
  const { error: deleteError } = await supabase
    .from('clans')
    .delete()
    .eq('id', clanToDelete.id);

  if (deleteError) {
    console.error('  ❌ Error deleting clan:', deleteError);
    console.log('\n💡 Tip: If you see a permission error, you may need to:');
    console.log('   1. Run the SQL script directly in Supabase SQL Editor (as superuser)');
    console.log('   2. Or add a DELETE policy for clans');
    return;
  }

  console.log('  ✅ Clan deleted successfully!');
  console.log('\n✨ Cleanup complete! Clan "J" has been removed.');
}

deleteClanJ().catch(console.error);

