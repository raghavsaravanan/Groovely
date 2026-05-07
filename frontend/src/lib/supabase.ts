import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- Types matching your schema + minimal extensions ----
export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  score: number;
  rank: string;
  clan_id: string | null; // Database column name - kept as clan_id for compatibility
  total_seasons_participated?: number | null;
  current_season_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type DanceStyle = {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_at: string;
};

export type Video = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string | null;
  dance_style_id: string | null;
  ai_score: number | null;
  ai_feedback: any | null; // timeline JSON
  views: number;
  likes: number;
  favorites?: number;
  reposts?: number;
  comments?: number;
  routine_id?: string | null;
  kind?: 'reference' | 'attempt' | 'other' | null;
  created_at: string;
};

export type VideoComment = {
  id: string;
  video_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
};

export type Routine = {
  id: string;
  creator_id: string;
  title: string;
  song_url: string | null;
  cover_url: string | null;
  style_id: string | null;
  meta: any | null; // 8-counts, keypoints placeholders
  created_at: string;
};

export type Attempt = {
  id: string;
  routine_id: string;
  user_id: string;
  video_url: string;
  ai_score: number | null;
  ai_feedback: any | null;
  comparison_url?: string | null;
  critique_url?: string | null;
  created_at: string;
};

export type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
};

export type UserSeasonStats = {
  id: string;
  user_id: string;
  season_id: string;
  seasonal_score: number;
  seasonal_rank: string;
  legacy_points: number;
};

export type StyleRank = {
  id: string;
  user_id: string;
  dance_style_id: string;
  score: number;
  rank: string;
  mastery_level: number;
  updated_at: string;
};

export type Crew = {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  total_score: number;
  creator_id: string | null;
  co_founders: string[] | null;
  created_at: string;
};

export type Arena = {
  id: string;
  name: string;
  min_score: number;
  order_index: number;
};

export async function uploadToBucket(
  bucket: string,
  file: File,
  pathPrefix: string
): Promise<string> {
  try {
    const ext = file.name.split('.').pop() || 'dat';
    const fileName = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    
    console.log(`Uploading to bucket: ${bucket}, file: ${fileName}`);
    
    // Check if bucket exists, if not create it
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
    }
    
    const bucketExists = buckets?.some(b => b.name === bucket);
    if (!bucketExists) {
      console.warn(`Bucket ${bucket} does not exist. Attempting to create...`);
      // Note: Bucket creation requires service role key, so we'll just try to upload
      // and let the error be clear if it fails
    }
    
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      upsert: false,
      cacheControl: '3600',
    });
    
    if (error) {
      console.error('Upload error:', error);
      // Provide more helpful error message
      if (error.message.includes('Bucket not found') || error.message.includes('does not exist')) {
        throw new Error(`Storage bucket "${bucket}" does not exist. Please create it in Supabase Dashboard > Storage.`);
      }
      throw error;
    }
    
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    if (!data?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded file');
    }
    
    console.log(`Upload successful: ${data.publicUrl}`);
    return data.publicUrl;
  } catch (error) {
    console.error('Upload to bucket failed:', error);
    throw error;
  }
}

/**
 * Ensures a video URL is accessible, converting relative paths to Supabase URLs when possible
 * Accepts any valid HTTP/HTTPS URL, including Supabase storage URLs
 */
export function ensureSupabaseVideoUrl(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;
  
  // Reject local file paths (file://, blob:, data:)
  if (videoUrl.startsWith('file://') || videoUrl.startsWith('blob:') || videoUrl.startsWith('data:')) {
    console.warn('Rejected local file URL:', videoUrl);
    return null;
  }
  
  // If it's already a valid HTTP/HTTPS URL (including Supabase), return it
  if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }
  
  // If it's a relative path that looks like a storage path, try to convert it
  // Storage paths typically look like: videos/user_id/filename.mp4
  if (videoUrl.startsWith('videos/') || videoUrl.startsWith('/videos/')) {
    const path = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
    const { data } = supabase.storage.from('videos').getPublicUrl(path);
    return data?.publicUrl || null;
  }
  
  // If it's a relative path starting with /static/, it might be from the backend
  // Try to construct a full URL if we have a backend URL configured
  if (videoUrl.startsWith('/static/') || videoUrl.startsWith('static/')) {
    // For now, reject these as they're local backend paths
    // In production, these should be migrated to Supabase
    console.warn('Video URL is a local backend path (should be migrated to Supabase):', videoUrl);
    return null;
  }
  
  // For any other relative paths, try to treat them as storage paths
  // This handles cases like "routines/abc123/video.mp4" or "attempts/xyz/comparison.mp4"
  if (!videoUrl.includes('://') && !videoUrl.startsWith('/')) {
    // Try videos bucket first (most common)
    const { data: videosData } = supabase.storage.from('videos').getPublicUrl(videoUrl);
    if (videosData?.publicUrl) {
      return videosData.publicUrl;
    }
    
    // Try audio bucket
    const { data: audioData } = supabase.storage.from('audio').getPublicUrl(videoUrl);
    if (audioData?.publicUrl) {
      return audioData.publicUrl;
    }
  }
  
  // Reject any other unrecognized paths
  console.warn('Could not resolve video URL:', videoUrl);
  return null;
}

export function toTimeWindow(filter: 'week' | 'month' | 'all'): { from?: string } {
  if (filter === 'all') return {};
  const now = new Date();
  const from = new Date(
    filter === 'week' ? now.getTime() - 7 * 864e5 : now.getTime() - 30 * 864e5
  ).toISOString();
  return { from };
}

export async function getUserArena(profile: Profile): Promise<Arena | null> {
  // Keep simple: compute by score thresholds (also backed by table if exists).
  const { data } = await supabase
    .from('arenas')
    .select('*')
    .order('order_index', { ascending: true });
  if (!data || data.length === 0) {
    // Fallback thresholds
    const tiers = [
      { name: 'Studio 1', min: 0 },
      { name: 'Studio 2', min: 200 },
      { name: 'Main Stage', min: 600 },
      { name: 'Pro League', min: 1200 },
    ];
    const tier =
      [...tiers].reverse().find((t) => profile.score >= t.min) || tiers[0];
    return { id: 'local', name: tier.name, min_score: tier.min, order_index: 0 };
  }
  const tier = [...data].reverse().find((a) => profile.score >= a.min_score) || data[0];
  return tier as Arena;
}

/**
 * Calculate the weighted score that powers the rank system.
 */
export function calculateCompositeScore(
  baseScore: number,
): number {
  return baseScore;
}

/**
 * New 7-tier rank system:
 * Bronze (0-199), Silver (200-499), Gold (500-999),
 * Platinum (1000-1999), Diamond (2000-3999),
 * Master (4000-7999), Grandmaster (8000+)
 */
export function calculateRank(
  score: number,
): string {
  const composite = calculateCompositeScore(score);
  if (composite >= 8000) return 'Grandmaster';
  if (composite >= 4000) return 'Master';
  if (composite >= 2000) return 'Diamond';
  if (composite >= 1000) return 'Platinum';
  if (composite >= 500) return 'Gold';
  if (composite >= 200) return 'Silver';
  return 'Bronze';
}

/**
 * Update rank for a specific user based on their multi-dimensional scores.
 */
export async function updateUserRank(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('score')
    .eq('id', userId)
    .maybeSingle();

  if (profile) {
    const newRank = calculateRank(profile.score);
    await supabase
      .from('profiles')
      .update({ rank: newRank })
      .eq('id', userId);
  }
}

/**
 * Reset all user scores to 0 and update ranks to Beginner
 * WARNING: This is a destructive operation
 */
export async function resetAllScores(): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset all scores to 0 and ranks to Bronze (new baseline)
    const { error } = await supabase
      .from('profiles')
      .update({
        score: 0,
        rank: 'Bronze',
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update ranks for all users based on their current scores
 * Uses database RPC function for better performance
 */
export async function updateAllRanks(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('update_all_ranks');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Reset all scores using database RPC function
 * WARNING: This is a destructive operation
 */
export async function resetAllScoresRPC(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('reset_all_scores');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Fetch the currently active season.
 */
export async function getActiveSeason(): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch active season:', error);
    return null;
  }
  return (data as Season) || null;
}

/**
 * Fetch a user's stats for the current or specific season.
 */
export async function getUserSeasonStats(
  userId: string,
  seasonId?: string,
): Promise<UserSeasonStats | null> {
  const query = supabase
    .from('user_season_stats')
    .select('*')
    .eq('user_id', userId)
    .order('season_id', { ascending: false })
    .limit(1);

  const finalQuery = seasonId ? query.eq('season_id', seasonId) : query;
  const { data, error } = await finalQuery.maybeSingle();

  if (error) {
    console.error('Failed to fetch user season stats:', error);
    return null;
  }
  return (data as UserSeasonStats) || null;
}

/**
 * Trigger a seasonal reset by calling the database function.
 */
export async function processSeasonalReset(seasonId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('process_seasonal_reset', { p_season_id: seasonId });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Fetch all seasons (for admin / seasonal history views).
 */
export async function listSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('start_date', { ascending: false });

  if (error || !data) {
    console.error('Failed to list seasons:', error);
    return [];
  }
  return data as Season[];
}

/**
 * Fetch all style ranks for a user.
 */
export async function getUserStyleRanks(userId: string): Promise<StyleRank[]> {
  const { data, error } = await supabase
    .from('style_ranks')
    .select('*')
    .eq('user_id', userId)
    .order('score', { ascending: false });

  if (error || !data) {
    console.error('Failed to load style ranks:', error);
    return [];
  }
  return data as StyleRank[];
}

/**
 * Increment a user's score for a specific style. The trigger in the database
 * will automatically recalculate the rank + mastery metadata.
 */
export async function addStyleScore(userId: string, danceStyleId: string, delta: number): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('increment_style_score', {
      p_user_id: userId,
      p_style_id: danceStyleId,
      p_delta: delta,
    });

    if (error) {
      console.error('Failed to increment style score:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to increment style score:', err);
    return false;
  }
}

/**
 * Silently check achievements for a user.
 * This function will not throw errors or log warnings if the RPC function doesn't exist.
 * Achievements are optional and should not block user actions.
 */
export async function checkAchievementsSilently(userId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('check_achievements', { p_user_id: userId });
    // Silently ignore errors - achievements are optional
    if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
      // Only log non-404 errors for debugging, but don't throw
      console.debug('Achievement check returned error (non-critical):', error);
    }
  } catch (err: any) {
    // Silently ignore all errors - achievements are optional
    // Don't log 404s or function not found errors
    if (err?.message && !err.message.includes('function') && !err.message.includes('404')) {
      console.debug('Achievement check failed (non-critical):', err);
    }
  }
}