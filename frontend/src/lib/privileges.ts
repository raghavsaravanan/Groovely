import { supabase } from './supabase';

export type RankPrivilege = {
  id: string;
  rank_tier: string;
  privilege_type: string;
  privilege_value: string | null;
  description: string | null;
};

/**
 * Fetch all privileges available for a given rank tier.
 */
export async function getPrivilegesForRank(rank: string): Promise<RankPrivilege[]> {
  const { data, error } = await supabase
    .from('rank_privileges')
    .select('*')
    .eq('rank_tier', rank)
    .order('privilege_type', { ascending: true });

  if (error || !data) {
    console.error('Failed to load rank privileges:', error);
    return [];
  }

  return data as RankPrivilege[];
}

/**
 * Check whether a given user currently holds a privilege.
 */
export async function userHasPrivilege(userId: string, privilegeType: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_rank_privilege', {
      p_user_id: userId,
      p_privilege: privilegeType,
    });

    if (error) {
      console.error('Failed to check privilege:', error);
      return false;
    }

    // Supabase returns { has_rank_privilege: boolean } or boolean depending on RPC
    if (Array.isArray(data)) {
      return Boolean(data[0]);
    }

    return Boolean(data);
  } catch (err) {
    console.error('Failed to check privilege:', err);
    return false;
  }
}

/**
 * Convenience helper that fetches both the user's rank and privileges.
 */
export async function getUserPrivileges(userId: string): Promise<RankPrivilege[]> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('rank')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile?.rank) {
    console.error('Failed to load user rank for privilege lookup:', error);
    return [];
  }

  return getPrivilegesForRank(profile.rank);
}

