/**
 * Utility function to delete all existing crews
 * This should be run once before implementing the redesigned crews feature
 * 
 * Usage: Call deleteAllCrews() from browser console or admin page
 */

import { supabase } from '../lib/supabase';

export async function deleteAllCrews(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    console.log('Starting deletion of all crews...');
    
    // First, get all crews with creator_id to check permissions
    const { data: crews, error: fetchError } = await supabase
      .from('clans')
      .select('id, name, creator_id');
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!crews || crews.length === 0) {
      console.log('No crews found to delete.');
      return { success: true, deletedCount: 0 };
    }
    
    console.log(`Found ${crews.length} crew(s) to delete:`);
    crews.forEach(crew => {
      console.log(`   - ${crew.name} (${crew.id}) - Creator: ${(crew as any).creator_id || 'None'}`);
    });
    
    // Get current user to check permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to delete crews');
    }
    
    // Filter crews that user can delete (crews they created or crews without creator)
    const deletableCrews = crews.filter(crew => {
      const creatorId = (crew as any).creator_id;
      return !creatorId || creatorId === user.id;
    });
    
    const nonDeletableCrews = crews.filter(crew => {
      const creatorId = (crew as any).creator_id;
      return creatorId && creatorId !== user.id;
    });
    
    if (nonDeletableCrews.length > 0) {
      console.warn(`Cannot delete ${nonDeletableCrews.length} crew(s) - you are not the creator:`);
      nonDeletableCrews.forEach(crew => {
        console.warn(`   - ${crew.name} (created by ${(crew as any).creator_id})`);
      });
    }
    
    if (deletableCrews.length === 0) {
      return {
        success: false,
        deletedCount: 0,
        error: `You cannot delete any crews. You are not the creator of any crews. To delete all crews, run the SQL script in Supabase Dashboard: frontend/supabase/migrations/20250202000001_delete_all_crews_admin.sql`
      };
    }
    
    // Remove all members from deletable crews first
    console.log('Removing all members from crews...');
    const deletableCrewIds = deletableCrews.map(c => c.id);
    
    if (deletableCrewIds.length > 0) {
      // Remove members from deletable crews only
      const { error: membersError } = await supabase
        .from('profiles')
        .update({ clan_id: null })
        .in('clan_id', deletableCrewIds);
      
      if (membersError) {
        console.warn('Warning: Failed to remove members:', membersError);
      } else {
        console.log('Successfully removed all members from deletable crews');
      }
    }
    
    // Delete deletable crews by their IDs
    console.log(`Deleting ${deletableCrews.length} crew(s) that you can delete...`);
    let deletedCount = 0;
    let failedCount = 0;
    
    if (deletableCrewIds.length > 0) {
      // Delete crews one by one to ensure RLS policies work
      for (const crewId of deletableCrewIds) {
        const crewName = deletableCrews.find(c => c.id === crewId)?.name || crewId;
        const { error: deleteError } = await supabase
          .from('clans')
          .delete()
          .eq('id', crewId);
        
        if (deleteError) {
          console.error(`Failed to delete crew ${crewName} (${crewId}):`, deleteError);
          failedCount++;
          // Continue with other crews even if one fails
        } else {
          console.log(`Deleted crew: ${crewName}`);
          deletedCount++;
        }
      }
    }
    
    // Verify deletion by checking remaining crews
    const { data: remainingCrews, error: verifyError } = await supabase
      .from('clans')
      .select('id, name');
    
    if (verifyError) {
      console.warn('Could not verify deletion:', verifyError);
    } else if (remainingCrews && remainingCrews.length > 0) {
      console.warn(`Warning: ${remainingCrews.length} crew(s) still remain after deletion:`, remainingCrews.map(c => c.name));
      
      const message = nonDeletableCrews.length > 0
        ? `Deleted ${deletedCount} crew(s) you created. ${remainingCrews.length} crew(s) remain (you are not the creator). To delete all crews, run the SQL script in Supabase Dashboard.`
        : `Failed to delete all crews. ${remainingCrews.length} crew(s) still remain. This may be due to RLS policies.`;
      
      return {
        success: deletedCount > 0,
        deletedCount: deletedCount,
        error: message
      };
    }
    
    console.log(`Successfully deleted ${deletedCount} crew(s)!`);
    if (failedCount > 0) {
      console.warn(`${failedCount} crew(s) failed to delete`);
    }
    if (nonDeletableCrews.length > 0) {
      console.warn(`${nonDeletableCrews.length} crew(s) could not be deleted (you are not the creator)`);
    }
    
    const successMessage = nonDeletableCrews.length > 0
      ? `Deleted ${deletedCount} crew(s) you created. ${nonDeletableCrews.length} crew(s) remain (you are not the creator).`
      : 'All crews have been removed. Ready for redesign!';
    
    console.log(successMessage);
    
    return { 
      success: deletedCount > 0 && failedCount === 0, 
      deletedCount: deletedCount,
      error: failedCount > 0 
        ? `${failedCount} crew(s) failed to delete. Check console for details.`
        : nonDeletableCrews.length > 0
        ? `${nonDeletableCrews.length} crew(s) could not be deleted (you are not the creator). Run SQL script to delete all.`
        : undefined
    };
    
  } catch (error: any) {
    console.error('Error deleting crews:', error);
    return { 
      success: false, 
      deletedCount: 0, 
      error: error?.message || 'Unknown error occurred' 
    };
  }
}

