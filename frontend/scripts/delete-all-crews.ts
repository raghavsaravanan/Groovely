/**
 * Script to delete all existing crews from the database
 * Run this before implementing the redesigned crews feature
 * 
 * Usage: This is a one-time script to clean up existing crews
 */

import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables or replace with your values
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function deleteAllCrews() {
  console.log('🗑️  Starting deletion of all crews...');
  
  try {
    // First, get all crews
    const { data: crews, error: fetchError } = await supabase
      .from('clans')
      .select('id, name');
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!crews || crews.length === 0) {
      console.log('✅ No crews found to delete.');
      return;
    }
    
    console.log(`📋 Found ${crews.length} crew(s) to delete:`);
    crews.forEach(crew => {
      console.log(`   - ${crew.name} (${crew.id})`);
    });
    
    // Remove all members from crews first
    console.log('👥 Removing all members from crews...');
    const { error: membersError } = await supabase
      .from('profiles')
      .update({ clan_id: null });
    
    if (membersError) {
      console.warn('⚠️  Warning: Failed to remove members:', membersError);
    } else {
      console.log('✅ Successfully removed all members from crews');
    }
    
    // Delete all crews
    console.log('🗑️  Deleting crews...');
    const { error: deleteError } = await supabase
      .from('clans')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using neq with impossible ID)
    
    if (deleteError) {
      throw deleteError;
    }
    
    console.log(`✅ Successfully deleted ${crews.length} crew(s)!`);
    console.log('🎉 All crews have been removed. Ready for redesign!');
    
  } catch (error) {
    console.error('❌ Error deleting crews:', error);
    process.exit(1);
  }
}

// Run the script
deleteAllCrews();

