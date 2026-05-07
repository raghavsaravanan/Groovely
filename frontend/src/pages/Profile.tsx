import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, Trophy, Video, Bookmark, Heart, Repeat2, Edit, Plus, Sparkles, MessageCircle, Users, UserPlus, UserMinus, Trash2, BarChart2, FileText, TrendingUp, Calendar, MoreVertical, ExternalLink, Share2, User, Crown, Medal, Bell, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, DanceStyle, Video as V, Crew, Routine, Profile as ProfileType, checkAchievementsSilently, type Profile } from '../lib/supabase';
import { getPrivilegesForRank, RankPrivilege } from '../lib/privileges';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, LoadingSpinner, PageHeader } from '../components/ios';
import { ActionSheet } from '../components/ios/ActionSheet';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ViewCount } from '../components/ViewCount';

type ExtendedVideo = V & {
  status?: 'draft' | 'published';
  routine_id?: string;
  routine_title?: string;
};

export function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userStyles, setUserStyles] = useState<DanceStyle[]>([]);
  const [tab, setTab] = useState<'attempts' | 'routines' | 'drafts' | 'reposts' | 'favorites' | 'likes' | 'crews'>('attempts');
  const [videos, setVideos] = useState<ExtendedVideo[]>([]);
  const [_routines, setRoutines] = useState<Routine[]>([]);
  const [crews, setCrews] = useState<(Crew & { isCreator?: boolean; memberCount?: number; rank?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<ExtendedVideo | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Notifications state
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'follow' | 'like' | 'comment' | 'message' | 'achievement' | 'score';
    message: string;
    userId?: string;
    videoId?: string;
    read: boolean;
    created_at: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  
  // Crew Activities state
  const [notificationTab, setNotificationTab] = useState<'notifications' | 'crew-activities'>('notifications');
  const [crewActivities, setCrewActivities] = useState<Array<{
    type: string;
    timestamp: string;
    user?: ProfileType;
    newValue?: string;
    video?: any;
  }>>([]);
  const [loadingCrewActivities, setLoadingCrewActivities] = useState(false);
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState({
    attempts: { total: 0, drafts: 0, published: 0, avgScore: 0, bestScore: 0 },
    routines: { total: 0 },
    drafts: { total: 0 },
    videos: { total: 0, likes: 0, favorites: 0 },
  });
  const [rankPrivileges, setRankPrivileges] = useState<RankPrivilege[]>([]);

  // Synchronized page mount - matches Explore.tsx and Leaderboard.tsx timing
  useEffect(() => {
    // Reset scroll position
    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }

    // Synchronized mount timing
    const animationFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsMounted(true);
        }, 50);
      });
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!profile?.rank) return;
    getPrivilegesForRank(profile.rank).then(setRankPrivileges);
  }, [profile?.rank]);

  // Initialize tab from query parameter (?tab=drafts etc.)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'drafts' || tabParam === 'attempts' || tabParam === 'routines' || tabParam === 'reposts' || tabParam === 'favorites' || tabParam === 'likes' || tabParam === 'crews') {
      setTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (!profile) {
      navigate('/login');
      return;
    }

    (async () => {
      const { data: styles } = await supabase
        .from('user_dance_styles')
        .select('dance_style_id, dance_styles(*)')
        .eq('user_id', profile.id);

      setUserStyles(
        (styles || [])
          .map((item: any) => item.dance_styles)
          .filter(Boolean) as DanceStyle[]
      );
    })();
  }, [profile, navigate]);

  // Function to refresh dashboard stats manually
  // Use profile.id directly instead of profile object to avoid recreating on every profile update
  const refreshDashboardStats = useCallback(async (userId?: string) => {
    const targetUserId = userId || profile?.id;
    if (!targetUserId) return;


    // Fetch attempts stats - fetch fresh data from database
    // Add timestamp to query to avoid any potential caching
    const { data: attemptsData, error: attemptsError } = await supabase
      .from('attempts')
      .select('id, ai_score, status, video_url, routine_id')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false }); // Order to ensure consistent results

    if (attemptsError) {
      console.error(' Error fetching attempts:', attemptsError);
      // Return early if we can't fetch attempts - stats will be incorrect
      return;
    }

    let attempts = attemptsData || [];
    
    // Clean up orphaned attempts (attempts where the video no longer exists)
    // This handles cases where videos were deleted but attempt records remain
    if (attempts.length > 0) {
      const videoUrls = attempts.map(a => a.video_url).filter(Boolean);
      if (videoUrls.length > 0) {
        const { data: existingVideos } = await supabase
          .from('videos')
          .select('video_url')
          .eq('user_id', targetUserId)
          .in('video_url', videoUrls);
        
        const existingVideoUrls = new Set((existingVideos || []).map(v => v.video_url));
        
        // Find orphaned attempts (attempts without matching videos)
        const orphanedAttempts = attempts.filter(a => a.video_url && !existingVideoUrls.has(a.video_url));
        
        if (orphanedAttempts.length > 0) {
          const { error: deleteOrphanError } = await supabase
            .from('attempts')
            .delete()
            .in('id', orphanIds);
          
          if (deleteOrphanError) {
            console.error(' Error deleting orphaned attempts:', deleteOrphanError);
            // Don't throw here - we'll continue with stats calculation
            // but log the error so we know RLS might be blocking
          } else {
          }
          
          // Re-fetch attempts after cleanup
          const { data: refreshedAttempts, error: refetchError } = await supabase
            .from('attempts')
            .select('id, ai_score, status, video_url, routine_id')
            .eq('user_id', targetUserId);
          
          if (refetchError) {
            console.error(' Error refetching attempts after cleanup:', refetchError);
          } else {
            attempts = (refreshedAttempts || []) as typeof attempts;
          }
        }
      }
    }
    
    
    // Fetch current profile to check score (don't use profile from closure to avoid stale data)
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('score')
      .eq('id', targetUserId)
      .maybeSingle();
    
    // Also verify that the profile score matches the actual published attempts score
    // This ensures consistency across all components
    const publishedAttempts = attempts.filter(a => a.status === 'published');
    const publishedAttemptsWithScore = publishedAttempts.filter(a => a.ai_score !== null && !Number.isNaN(a.ai_score));
    const calculatedScore = publishedAttemptsWithScore.reduce((sum, a) => sum + (a.ai_score || 0), 0);
    
    // If the profile score doesn't match, update it
    // Refresh profile after updating to sync score across all components
    // Safe to call refreshProfile() here because useEffect only depends on profile?.id, not profile.score
    const scoreUpdates: Record<string, number> = {};
    if (currentProfile && currentProfile.score !== calculatedScore) {
      scoreUpdates.score = calculatedScore;
    }
    
    if (Object.keys(scoreUpdates).length > 0) {
      await supabase
        .from('profiles')
        .update(scoreUpdates)
        .eq('id', targetUserId);
      
      // Refresh profile to sync score in AuthContext (safe because profile.id doesn't change)
      await refreshProfile();
    }

    // Fetch routines stats
    const { data: routinesData } = await supabase
      .from('routines')
      .select('id')
      .eq('creator_id', targetUserId);

    // Fetch drafts stats - includes both regular draft videos AND draft attempts
    // Regular draft videos (videos without AI score or kind=other)
    const { data: regularDraftVideos } = await supabase
      .from('videos')
      .select('id')
      .eq('user_id', targetUserId)
      .or('kind.is.null,kind.eq.other')
      .is('ai_score', null);
    
    // Draft attempts (attempts with status='draft')
    const draftAttemptsCount = attempts.filter(a => a.status === 'draft').length;
    
    // Total drafts = regular draft videos + draft attempt videos
    // Note: draft attempt videos are counted separately since they're in the attempts table
    const totalDrafts = (regularDraftVideos?.length || 0) + draftAttemptsCount;

    // Fetch videos stats
    const { data: videosData } = await supabase
      .from('videos')
      .select('likes, favorites')
      .eq('user_id', targetUserId);

    const totalLikes = videosData?.reduce((sum, v) => sum + (v.likes || 0), 0) || 0;
    const totalFavorites = videosData?.reduce((sum, v) => sum + (v.favorites || 0), 0) || 0;

    // Calculate stats for published attempts only
    const publishedAvgScore = publishedAttemptsWithScore.length > 0
      ? publishedAttemptsWithScore.reduce((sum, a) => sum + (a.ai_score || 0), 0) / publishedAttemptsWithScore.length
      : 0;
    const publishedBestScore = publishedAttemptsWithScore.length > 0
      ? Math.max(...publishedAttemptsWithScore.map(a => a.ai_score || 0))
      : 0;

    const newStats = {
      attempts: {
        total: publishedAttempts.length, // Only count published attempts
        drafts: attempts.filter(a => a.status === 'draft').length,
        published: publishedAttempts.length,
        avgScore: publishedAvgScore, // Only average published attempts
        bestScore: publishedBestScore, // Only best from published attempts
      },
      routines: { total: routinesData?.length || 0 },
      drafts: { total: totalDrafts }, // Includes both regular drafts and draft attempts
      videos: { total: videosData?.length || 0, likes: totalLikes, favorites: totalFavorites },
    };
    
  }, [profile?.id, refreshProfile]); // Include refreshProfile in dependencies

  // Fetch dashboard stats on mount and when profile.id changes
  useEffect(() => {
    if (!profile?.id) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]); // Only depend on profile.id to avoid recreating on every profile update

  // Get read notifications from localStorage
  const getReadNotifications = (userId: string): Set<string> => {
    try {
      const stored = localStorage.getItem(`read-notifications-${userId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  // Load notification preferences from localStorage (matching Settings.tsx)
  const loadNotificationPreference = (key: string, defaultValue: boolean): boolean => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // Check if a notification type should be shown based on user preferences
  const shouldShowNotification = (type: 'follow' | 'like' | 'comment' | 'message' | 'achievement' | 'score'): boolean => {
    // Check master toggle first
    const notificationsEnabled = loadNotificationPreference('groovely_notifications_enabled', true);
    if (!notificationsEnabled) {
      return false;
    }

    // Check individual toggles
    switch (type) {
      case 'follow':
        return loadNotificationPreference('groovely_push_followers', true);
      case 'like':
      case 'comment':
        return loadNotificationPreference('groovely_push_likes', true);
      case 'message':
        return loadNotificationPreference('groovely_push_messages', true);
      case 'achievement':
        // Achievements are always shown if notifications are enabled
        return true;
      default:
        return true;
    }
  };

  // Mark notification as read in localStorage
  const markNotificationAsRead = (notificationId: string, userId: string) => {
    try {
      const readSet = getReadNotifications(userId);
      readSet.add(notificationId);
      localStorage.setItem(`read-notifications-${userId}`, JSON.stringify(Array.from(readSet)));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Fetch notifications
  useEffect(() => {
    if (!profile?.id) return;
    
    const fetchNotifications = async () => {
      setLoadingNotifications(true);
      try {
        // Get read notifications from localStorage
        const readNotifications = getReadNotifications(profile.id);
        
        // Fetch recent follows (users who followed you)
        const { data: recentFollows } = await supabase
          .from('follows')
          .select('follower_id, created_at, profiles!follows_follower_id_fkey(username, display_name)')
          .eq('following_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Fetch recent likes on your videos
        const { data: recentLikes } = await supabase
          .from('video_likes')
          .select('user_id, created_at, videos!video_likes_video_id_fkey(id, title, user_id), profiles!video_likes_user_id_fkey(username, display_name)')
          .eq('videos.user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Fetch recently scored attempts (drafts that got scored)
        // Order by created_at since attempts table may not have updated_at
        const { data: recentScoredAttempts } = await supabase
          .from('attempts')
          .select('id, ai_score, created_at, video_url, routine_id, routines!attempts_routine_id_fkey(title)')
          .eq('user_id', profile.id)
          .not('ai_score', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);

        // Get video IDs for scored attempts to link notifications
        const scoredVideoIds = new Map<string, string>();
        if (recentScoredAttempts && recentScoredAttempts.length > 0) {
          const videoUrls = recentScoredAttempts.map(a => a.video_url).filter(Boolean);
          if (videoUrls.length > 0) {
            const { data: scoredVideos } = await supabase
              .from('videos')
              .select('id, video_url')
              .eq('user_id', profile.id)
              .eq('kind', 'attempt')
              .in('video_url', videoUrls);
            
            scoredVideos?.forEach(v => {
              if (v.video_url) scoredVideoIds.set(v.video_url, v.id);
            });
          }
        }

        // Transform to notification format and filter based on user preferences
        const notificationList: typeof notifications = [];
        
        recentFollows?.forEach((follow: any) => {
          // Only add if user has enabled follower notifications
          if (!shouldShowNotification('follow')) return;
          
          const follower = follow.profiles;
          const notificationId = `follow-${follow.follower_id}-${follow.created_at}`;
          notificationList.push({
            id: notificationId,
            type: 'follow',
            message: `${follower?.display_name || follower?.username || 'Someone'} started following you`,
            userId: follow.follower_id,
            read: readNotifications.has(notificationId),
            created_at: follow.created_at,
          });
        });

        recentLikes?.forEach((like: any) => {
          // Only add if user has enabled likes notifications
          if (!shouldShowNotification('like')) return;
          
          const liker = like.profiles;
          const video = like.videos;
          if (video && liker) {
            const notificationId = `like-${like.user_id}-${video.id}-${like.created_at}`;
            notificationList.push({
              id: notificationId,
              type: 'like',
              message: `${liker.display_name || liker.username || 'Someone'} liked your video "${video.title}"`,
              userId: like.user_id,
              videoId: video.id,
              read: readNotifications.has(notificationId),
              created_at: like.created_at,
            });
          }
        });

        // Add score notifications for recently scored attempts
        recentScoredAttempts?.forEach((attempt: any) => {
          // Always show score notifications (they're important!)
          const routineTitle = attempt.routines?.title || 'Routine';
          const videoId = scoredVideoIds.get(attempt.video_url);
          const notificationId = `score-${attempt.id}-${attempt.created_at}`;
          
          // Only add if not already read and score exists
          if (!readNotifications.has(notificationId) && attempt.ai_score !== null) {
            notificationList.push({
              id: notificationId,
              type: 'score',
              message: `Your attempt for "${routineTitle}" scored ${Math.round(attempt.ai_score)}/100!`,
              videoId: videoId,
              read: false,
              created_at: attempt.created_at,
            });
          }
        });

        // Sort by created_at descending
        notificationList.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setNotifications(notificationList.slice(0, 20));
        setUnreadCount(notificationList.filter(n => !n.read).length);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setLoadingNotifications(false);
      }
    };

    fetchNotifications();
    
    // Set up real-time subscription for new follows
    const followSubscription = supabase
      .channel('follow-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'follows',
        filter: `following_id=eq.${profile.id}`
      }, (payload) => {
        // Only add notification if user has enabled follower notifications
        if (!shouldShowNotification('follow')) return;
        
        // Fetch the follower's profile
        supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', payload.new.follower_id)
          .maybeSingle()
          .then(({ data: follower }) => {
            if (follower) {
              const newNotification = {
                id: `follow-${payload.new.follower_id}-${Date.now()}`,
                type: 'follow' as const,
                message: `${follower.display_name || follower.username || 'Someone'} started following you`,
                userId: payload.new.follower_id,
                read: false,
                created_at: new Date().toISOString(),
              };
              setNotifications(prev => [newNotification, ...prev].slice(0, 20));
              setUnreadCount(prev => prev + 1);
            }
          });
      })
      .subscribe();

    return () => {
      followSubscription.unsubscribe();
    };
  }, [profile?.id]);

  // Fetch crew activities
  useEffect(() => {
    if (!profile?.clan_id) {
      setCrewActivities([]);
      return;
    }

    const fetchCrewActivities = async () => {
      setLoadingCrewActivities(true);
      try {
        const crewId = profile.clan_id;
        const activitiesList: typeof crewActivities = [];

        // Fetch crew info
        const { data: crewData } = await supabase
          .from('clans')
          .select('id, name, created_at, creator_id')
          .eq('id', crewId)
          .maybeSingle();

        if (!crewData) {
          setCrewActivities([]);
          return;
        }

        // Fetch all members
        const { data: membersData } = await supabase
          .from('profiles')
          .select('*')
          .eq('clan_id', crewId);

        const members = (membersData || []) as ProfileType[];

        // Add crew creation activity
        if (crewData.created_at) {
          const creator = members.find(m => m.id === crewData.creator_id) || 
                         (profile.id === crewData.creator_id ? profile : null);
          if (creator) {
            activitiesList.push({
              type: 'created',
              timestamp: crewData.created_at,
              user: creator,
            });
          }
        }

        // Fetch recent clan messages (as activities)
        const { data: recentMessages } = await supabase
          .from('clan_messages')
          .select('*, profiles!clan_messages_user_id_fkey(display_name, username, avatar_url)')
          .eq('clan_id', crewId)
          .order('created_at', { ascending: false })
          .limit(20);

        recentMessages?.forEach((msg: any) => {
          const sender = msg.profiles;
          if (sender) {
            activitiesList.push({
              type: 'message',
              timestamp: msg.created_at,
              user: {
                id: msg.user_id,
                display_name: sender.display_name,
                username: sender.username,
                avatar_url: sender.avatar_url,
              } as ProfileType,
            });
          }
        });

        // Fetch recent member joins (approximate - using updated_at)
        members.forEach((member) => {
          if (member.id !== crewData.creator_id && member.updated_at) {
            const memberUpdateTime = new Date(member.updated_at).getTime();
            const crewCreateTime = new Date(crewData.created_at).getTime();
            if (memberUpdateTime > crewCreateTime) {
              activitiesList.push({
                type: 'joined',
                timestamp: member.updated_at,
                user: member,
              });
            }
          }
        });

        // Sort by timestamp descending
        activitiesList.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setCrewActivities(activitiesList.slice(0, 50));
      } catch (error) {
        console.error('Error fetching crew activities:', error);
      } finally {
        setLoadingCrewActivities(false);
      }
    };

    fetchCrewActivities();

    // Set up real-time subscription for crew messages
    if (profile.clan_id) {
      const crewMessagesSubscription = supabase
        .channel(`crew-activities-${profile.clan_id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'clan_messages',
          filter: `clan_id=eq.${profile.clan_id}`
        }, async (payload) => {
          const newMessage = payload.new as any;
          // Fetch sender profile
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', newMessage.user_id)
            .maybeSingle();

          if (senderProfile) {
            setCrewActivities(prev => [{
              type: 'message',
              timestamp: newMessage.created_at,
              user: {
                id: newMessage.user_id,
                display_name: senderProfile.display_name,
                username: senderProfile.username,
                avatar_url: senderProfile.avatar_url,
              } as ProfileType,
            }, ...prev].slice(0, 50));
          }
        })
        .subscribe();

      return () => {
        crewMessagesSubscription.unsubscribe();
      };
    }
  }, [profile?.clan_id, profile?.id]);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    setLoading(true);
    (async () => {
      try {
        let vids: ExtendedVideo[] = [];
        let routinesList: Routine[] = [];

      if (tab === 'likes') {
        const { data } = await supabase
          .from('video_likes')
          .select('video:video_id(*)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30);
        vids = (data || [])
          .map((row: any) => row.video)
          .filter(Boolean) as ExtendedVideo[];
      } else if (tab === 'favorites') {
        const { data } = await supabase
          .from('video_favorites')
          .select('video:video_id(*)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30);
        vids = (data || [])
          .map((row: any) => row.video)
          .filter(Boolean) as ExtendedVideo[];
      } else if (tab === 'reposts') {
        const { data } = await supabase
          .from('video_reposts')
          .select('video:video_id(*)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30);
        vids = (data || [])
          .map((row: any) => row.video)
          .filter(Boolean) as ExtendedVideo[];
      } else if (tab === 'attempts') {
        // Fetch only published attempts from attempts table (exclude drafts)
        const { data: attemptsData } = await supabase
          .from('attempts')
          .select('*, routines(title)')
          .eq('user_id', profile.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false });

        const attempts = (attemptsData || []) as any[];
        
        // Fetch published attempts from videos table to get proper titles and IDs
        const routineIds = attempts.map(a => a.routine_id).filter(Boolean);
        const { data: publishedVideos } = await supabase
          .from('videos')
          .select('id, title, routine_id, video_url')
          .eq('user_id', profile.id)
          .eq('kind', 'attempt')
          .in('routine_id', routineIds.length > 0 ? routineIds : ['00000000-0000-0000-0000-000000000000']);

        // Helper function to normalize URLs for comparison (remove query params, normalize paths)
        const normalizeUrl = (url: string | null | undefined): string => {
          if (!url) return '';
          try {
            // Remove query parameters and fragments for comparison
            const urlObj = new URL(url);
            return `${urlObj.origin}${urlObj.pathname}`;
          } catch {
            // If URL parsing fails, return as-is
            return url;
          }
        };

        // Create a map of (routine_id + normalized_video_url) -> video title for published attempts
        const videoTitleMap = new Map<string, string>();
        const videoIdMap = new Map<string, string>(); // Map for video IDs
        publishedVideos?.forEach((video: any) => {
          const normalizedUrl = normalizeUrl(video.video_url);
          const key = `${video.routine_id}:${normalizedUrl}`;
          videoTitleMap.set(key, video.title);
          videoIdMap.set(key, video.id);
        });

        // Show ALL published attempts, even if video doesn't exist in videos table
        // The attempt record is the source of truth for published attempts
        vids = attempts
          .filter((row) => {
            // Only filter out attempts without video_url
            return !!row.video_url;
          })
          .map((row) => {
            // Try to find matching video using normalized URL comparison
            const normalizedAttemptUrl = normalizeUrl(row.video_url);
            const videoKey = `${row.routine_id}:${normalizedAttemptUrl}`;
            const publishedTitle = videoTitleMap.get(videoKey);
            const matchingVideoId = videoIdMap.get(videoKey);
            
            // Also try exact match as fallback
            const exactMatchVideo = publishedVideos?.find((v: any) => 
              v.routine_id === row.routine_id && 
              (v.video_url === row.video_url || normalizeUrl(v.video_url) === normalizedAttemptUrl)
            );
            
            const title = publishedTitle || 
              (row.routines?.title
                ? `${row.routines.title} – Attempt${row.status === 'draft' ? ' (Draft)' : ''}`
                : `Attempt${row.status === 'draft' ? ' (Draft)' : ''}`);
            
            return {
              id: matchingVideoId || exactMatchVideo?.id || row.id, // Use video ID if available, fallback to attempt ID
              user_id: profile.id,
              title,
              description: row.status === 'draft' 
                ? 'Draft attempt from Try This Dance' 
                : 'Attempt from Try This Dance',
              video_url: row.video_url,
              thumbnail_url: null,
              dance_style_id: null,
              ai_score: row.ai_score,
              ai_feedback: row.ai_feedback,
              views: 0,
              likes: 0,
              favorites: 0,
              reposts: 0,
              comments: 0,
              routine_id: row.routine_id,
              routine_title: row.routines?.title,
              kind: 'attempt',
              status: row.status || 'published',
              created_at: row.created_at,
            };
          }) as ExtendedVideo[];
      } else if (tab === 'routines') {
        // Fetch routines from routines table
        const { data: routinesData } = await supabase
          .from('routines')
          .select('*')
          .eq('creator_id', profile.id)
          .order('created_at', { ascending: false });

        routinesList = (routinesData || []) as Routine[];

        // Fetch reference videos for these routines
        const routineIds = routinesList.map(r => r.id);
        const { data: videosData } = await supabase
          .from('videos')
          .select('*')
          .eq('user_id', profile.id)
          .eq('kind', 'reference')
          .in('routine_id', routineIds.length > 0 ? routineIds : ['00000000-0000-0000-0000-000000000000'])
          .order('created_at', { ascending: false });

        // Create ExtendedVideo entries for routines with videos
        const videosMap = new Map((videosData || []).map(v => [v.routine_id, v]));
        
        // Map routines to videos, or create placeholder entries for routines without videos
        vids = routinesList.map((routine) => {
          const video = videosMap.get(routine.id);
          if (video) {
            return {
              ...video,
              routine_title: routine.title,
            } as ExtendedVideo;
          } else {
            // Create a placeholder entry for routines without videos
            return {
              id: routine.id,
              user_id: profile.id,
              title: routine.title,
              description: 'Routine without video',
              video_url: routine.cover_url || '',
              thumbnail_url: routine.cover_url,
              dance_style_id: routine.style_id,
              ai_score: null,
              ai_feedback: null,
              views: 0,
              likes: 0,
              favorites: 0,
              reposts: 0,
              comments: 0,
              routine_id: routine.id,
              routine_title: routine.title,
              kind: 'reference',
              created_at: routine.created_at,
            } as ExtendedVideo;
          }
        });
      } else if (tab === 'drafts') {
        // Fetch regular draft videos (videos without AI score or kind=other)
        const { data: draftVideos } = await supabase
          .from('videos')
          .select('*')
          .eq('user_id', profile.id)
          .or('kind.is.null,kind.eq.other')
          .is('ai_score', null)
          .order('created_at', { ascending: false });

        // Fetch all attempt videos (kind='attempt')
        const { data: allAttemptVideos } = await supabase
          .from('videos')
          .select('*, routines(title)')
          .eq('user_id', profile.id)
          .eq('kind', 'attempt')
          .order('created_at', { ascending: false });

        // Get routine IDs and video URLs from attempt videos
        const attemptRoutineIds = [...new Set((allAttemptVideos || [])
          .map((v: any) => v.routine_id)
          .filter(Boolean))];
        const attemptVideoUrls = (allAttemptVideos || [])
          .map((v: any) => v.video_url)
          .filter(Boolean);

        // Fetch all attempts for these routines to check their status
        const attemptStatusMap = new Map<string, 'draft' | 'published'>();
        if (attemptRoutineIds.length > 0 && attemptVideoUrls.length > 0) {
          const { data: allAttempts } = await supabase
            .from('attempts')
            .select('routine_id, video_url, status')
            .eq('user_id', profile.id)
            .in('routine_id', attemptRoutineIds)
            .in('video_url', attemptVideoUrls);

          // Create a map of (routine_id:video_url) -> status
          (allAttempts || []).forEach((a: any) => {
            if (a.routine_id && a.video_url) {
              const key = `${a.routine_id}:${a.video_url}`;
              attemptStatusMap.set(key, a.status || 'published');
            }
          });
        }

        // Filter to only draft attempt videos (those with status='draft' or no attempt record)
        const draftAttemptVideos = (allAttemptVideos || [])
          .filter((video: any) => {
            if (!video.routine_id || !video.video_url) {
              // Include videos without routine_id or video_url as drafts
              return true;
            }
            const key = `${video.routine_id}:${video.video_url}`;
            const status = attemptStatusMap.get(key);
            // Include if status is 'draft' or if no attempt record exists (treat as draft)
            return !status || status === 'draft';
          })
          .map((video: any) => ({
            ...video,
            routine_title: video.routines?.title,
            status: 'draft' as const,
          })) as ExtendedVideo[];

        // Combine all drafts
        vids = [
          ...((draftVideos || []) as ExtendedVideo[]),
          ...draftAttemptVideos,
        ].sort((a, b) => {
          // Sort by created_at descending
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });
      } else if (tab === 'crews') {
        // Fetch crews where user is a member (via clan_id in profile) or creator
        const userCrewId = profile.clan_id;
        const crewsList: (Crew & { isCreator?: boolean; memberCount?: number; rank?: number })[] = [];
        
        // Fetch crew user is a member of
        if (userCrewId) {
          const { data: memberCrew } = await supabase
            .from('clans')
            .select('*')
            .eq('id', userCrewId)
            .maybeSingle();
          
          if (memberCrew) {
            // Check if user is creator or co-founder
            const creatorId = (memberCrew as any).creator_id;
            const coFounders = (memberCrew as any).co_founders || [];
            const isCreator = creatorId && String(creatorId) === String(profile.id);
            const isCoFounder = Array.isArray(coFounders) && coFounders.some((cf: string) => String(cf) === String(profile.id));
            
            // Get all members and calculate total score (sum of member scores)
            const { data: memberProfiles } = await supabase
              .from('profiles')
              .select('id, score')
              .eq('clan_id', memberCrew.id);
            
            const memberCount = memberProfiles?.length || 0;
            const calculatedTotalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
            
            // Update crew total_score in database if it doesn't match (background update)
            if (memberCrew.total_score !== calculatedTotalScore) {
              supabase
                .from('clans')
                .update({ total_score: calculatedTotalScore })
                .eq('id', memberCrew.id)
                .then(({ error }) => {
                  if (error) {
                  }
                });
            }
            
            // Get rank based on calculated scores
            const { data: allCrews } = await supabase
              .from('clans')
              .select('id, total_score')
              .order('total_score', { ascending: false });
            
            // Calculate rank using calculated score for this crew
            const sortedCrews = allCrews ? [...allCrews].sort((a, b) => {
              const scoreA = a.id === memberCrew.id ? calculatedTotalScore : (a.total_score || 0);
              const scoreB = b.id === memberCrew.id ? calculatedTotalScore : (b.total_score || 0);
              return scoreB - scoreA;
            }) : [];
            const rank = sortedCrews.findIndex(c => c.id === memberCrew.id) + 1;
            
            crewsList.push({
              ...memberCrew,
              total_score: calculatedTotalScore, // Use calculated score
              isCreator: isCreator || isCoFounder, // Treat co-founders as creators for UI
              memberCount,
              rank: rank || undefined,
            });
          }
        }
        
        // Fetch crews user created (if not already in list)
        const { data: createdCrews } = await supabase
          .from('clans')
          .select('*')
          .eq('creator_id', profile.id);
        
        if (createdCrews) {
          for (const crew of createdCrews) {
            // Skip if already in list
            if (crewsList.find(c => c.id === crew.id)) continue;
            
            // Get all members and calculate total score (sum of member scores)
            const { data: memberProfiles } = await supabase
              .from('profiles')
              .select('id, score')
              .eq('clan_id', crew.id);
            
            const memberCount = memberProfiles?.length || 0;
            const calculatedTotalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
            
            // Update crew total_score in database if it doesn't match (background update)
            if (crew.total_score !== calculatedTotalScore) {
              supabase
                .from('clans')
                .update({ total_score: calculatedTotalScore })
                .eq('id', crew.id)
                .then(({ error }) => {
                  if (error) {
                  }
                });
            }
            
            // Get rank based on calculated scores
            const { data: allCrews } = await supabase
              .from('clans')
              .select('id, total_score')
              .order('total_score', { ascending: false });
            
            // Calculate rank using calculated score for this crew
            const sortedCrews = allCrews ? [...allCrews].sort((a, b) => {
              const scoreA = a.id === crew.id ? calculatedTotalScore : (a.total_score || 0);
              const scoreB = b.id === crew.id ? calculatedTotalScore : (b.total_score || 0);
              return scoreB - scoreA;
            }) : [];
            const rank = sortedCrews.findIndex(c => c.id === crew.id) + 1;
            
            crewsList.push({
              ...crew,
              total_score: calculatedTotalScore, // Use calculated score
              isCreator: true,
              memberCount,
              rank: rank || undefined,
            });
          }
        }
        
        setCrews(crewsList);
      }

      const [followersRes, followingsRes] = await Promise.all([
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
      ]);

      if (!cancelled) {
        setVideos(vids);
        setRoutines(routinesList); // Used in delete handlers
        setFollowerCount(followersRes.count || 0);
        setFollowingCount(followingsRes.count || 0);

        // Calculate enhanced Social Score: followers, following, likes received, comments, favorites, reposts
        const { data: userVideos } = await supabase
          .from('videos')
          .select('likes, favorites, reposts, comments')
          .eq('user_id', profile.id);
        
        const totalLikesReceived = userVideos?.reduce((sum, v) => sum + (v.likes || 0), 0) || 0;
        const totalCommentsReceived = userVideos?.reduce((sum, v) => sum + (v.comments || 0), 0) || 0;
        if (tab !== 'crews') {
          await checkAchievementsSilently(profile.id);
        }
        
        // Always set loading to false, regardless of tab
        setLoading(false);
      }
      } catch (error) {
        console.error('Error loading profile data:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, tab]);

  const handleSignOut = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }
    await signOut();
    navigate('/');
  };

  // Helper function to recalculate and update user's total score
  const recalculateUserScore = async (userId: string) => {
    try {
      // Calculate total score from all published attempts
      const { data: publishedAttempts, error } = await supabase
        .from('attempts')
        .select('ai_score')
        .eq('user_id', userId)
        .eq('status', 'published')
        .not('ai_score', 'is', null);

      if (error) {
        console.error('Error fetching published attempts for score recalculation:', error);
        return;
      }

      // Sum all published attempt scores
      const totalScore = publishedAttempts?.reduce((sum, attempt) => {
        return sum + (attempt.ai_score || 0);
      }, 0) || 0;

      // Update profile score
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ score: totalScore })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating profile score:', updateError);
        return;
      }

      
      // Refresh the profile in AuthContext to update the displayed score
      await refreshProfile();
    } catch (err) {
      console.error('Failed to recalculate user score:', err);
    }
  };

  const handleTabChange = async (newTab: typeof tab) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setTab(newTab);
  };

  const handleLeaveCrew = async (crewId: string) => {
    if (!profile || !user) return;
    const confirmed = window.confirm('Leave this crew? You can rejoin later.');
    if (!confirmed) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
      await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
      
      // Refresh crews list
      setCrews(prev => prev.filter(c => c.id !== crewId));
      
      // Refresh profile to update clan_id
      await refreshProfile();
    } catch (error) {
      console.error('Error leaving crew:', error);
      alert('Failed to leave crew. Please try again.');
    }
  };

  const handleDelete = async (item: ExtendedVideo | Routine) => {
    if (!profile) return;
    // Check if it's a Routine (has creator_id but no video_url) vs ExtendedVideo (has video_url)
    const isRoutine = 'creator_id' in item && !('video_url' in item);
    // For routines tab, check if it's a routine without video (has routine_id but no video_url or empty video_url)
    const isRoutineWithoutVideo = tab === 'routines' && 'routine_id' in item && (!('video_url' in item) || !item.video_url || item.video_url === '');
    const itemType = isRoutine || isRoutineWithoutVideo ? 'routine' : 'video';
    const confirmed = window.confirm(`Delete this ${itemType}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(item.id);
    try {
      if (tab === 'attempts') {
        // In attempts tab, item.id might be video ID or attempt ID
        // We need to find the attempt record by matching video_url and routine_id
        const video = item as ExtendedVideo;
        
        // Find the attempt record by matching routine_id, user_id, and video_url
        let attemptId: string | null = null;
        if (video.routine_id && video.video_url) {
          const { data: attemptData } = await supabase
            .from('attempts')
            .select('id, status, ai_score')
            .eq('routine_id', video.routine_id)
            .eq('user_id', profile.id)
            .eq('video_url', video.video_url)
            .maybeSingle();
          
          attemptId = attemptData?.id || null;
          const wasPublished = attemptData?.status === 'published';
          
          // Delete attempt record if found
          if (attemptId) {
            const { error: deleteError, data: deleteData } = await supabase
              .from('attempts')
              .delete()
              .eq('id', attemptId)
              .select(); // Select to verify deletion
            
            if (deleteError) {
              console.error(' Error deleting attempt:', deleteError);
              console.error(' This might be due to missing RLS DELETE policy. Check migrations.');
              // Throw error so user knows deletion failed
              throw new Error(`Failed to delete attempt: ${deleteError.message}`);
            } else {
            }
            
            // Recalculate user's total score if this was a published attempt
            if (wasPublished && profile) {
              await recalculateUserScore(profile.id);
            }
          } else {
          }
        }
        
        // Delete the video from videos table (using video ID from the item)
        // The item.id in attempts tab should be the video ID
        if (video.id) {
          const { error: deleteVideoError } = await supabase
            .from('videos')
            .delete()
            .eq('id', video.id)
            .eq('user_id', profile.id);
          
          if (deleteVideoError) {
            console.error('Error deleting video:', deleteVideoError);
          } else {
          }
        }

        // Remove from videos state
        setVideos(prev => prev.filter(v => v.id !== item.id));
        
        // Refresh dashboard stats to update counts
      } else if (tab === 'routines') {
        if (isRoutine) {
          // It's a Routine object - delete the routine and its associated videos
          const routine = item as Routine;
          await supabase.from('routines').delete().eq('id', routine.id).eq('creator_id', profile.id);
          // Also delete associated reference videos
          await supabase
            .from('videos')
            .delete()
            .eq('routine_id', routine.id)
            .eq('kind', 'reference');
          // Remove from routines state
          setRoutines((prev: Routine[]) => prev.filter((r: Routine) => r.id !== routine.id));
        } else if (isRoutineWithoutVideo) {
          // It's a routine without video (ExtendedVideo placeholder)
          const video = item as ExtendedVideo;
          const routineId = video.routine_id || video.id; // Use routine_id or fallback to id
          // Delete the routine itself
          await supabase.from('routines').delete().eq('id', routineId).eq('creator_id', profile.id);
          // Remove from routines state
          setRoutines((prev: Routine[]) => prev.filter((r: Routine) => r.id !== routineId));
        } else {
          // It's a video with routine_id
          const video = item as ExtendedVideo;
          if (video.routine_id) {
            // Delete the routine itself
            await supabase.from('routines').delete().eq('id', video.routine_id).eq('creator_id', profile.id);
            // Remove from routines state
            setRoutines((prev: Routine[]) => prev.filter((r: Routine) => r.id !== video.routine_id));
          }
          // Delete the video
          await supabase.from('videos').delete().eq('id', video.id).eq('user_id', profile.id);
        }
        // Remove from videos state
        setVideos(prev => prev.filter(v => v.id !== item.id));
        
        // Refresh dashboard stats to update counts
        await refreshDashboardStats(profile.id);
      } else if (tab === 'drafts') {
        // Check if this is a draft attempt (has status='draft' and kind='attempt')
        const isDraftAttempt = 'status' in item && item.status === 'draft' && 'kind' in item && item.kind === 'attempt';
        
        if (isDraftAttempt) {
          // For draft attempts, item.id is the video ID from videos table
          // We need to find and delete the corresponding attempt record
          const video = item as ExtendedVideo;
          
          // Delete from videos table first (using video ID)
          await supabase.from('videos').delete().eq('id', video.id).eq('user_id', profile.id);
          
          // Delete from attempts table by matching routine_id, user_id, and video_url
          if (video.routine_id && video.video_url) {
            const { error: deleteAttemptError, data: deleteData } = await supabase
              .from('attempts')
              .delete()
              .eq('routine_id', video.routine_id)
              .eq('user_id', profile.id)
              .eq('video_url', video.video_url)
              .select(); // Select to verify deletion
            
            if (deleteAttemptError) {
              console.error(' Error deleting draft attempt:', deleteAttemptError);
              console.error(' This might be due to missing RLS DELETE policy. Check migrations.');
              // Throw error so user knows deletion failed
              throw new Error(`Failed to delete draft attempt: ${deleteAttemptError.message}`);
            } else {
            }
          }
        } else {
          // Delete regular draft video
          const { error: deleteVideoError } = await supabase.from('videos').delete().eq('id', item.id).eq('user_id', profile.id);
          if (deleteVideoError) {
            console.error('Error deleting draft video:', deleteVideoError);
          } else {
          }
        }
        setVideos(prev => prev.filter(v => v.id !== item.id));
        
        // Small delay to ensure database deletion is complete before refreshing stats
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh dashboard stats to update counts
      } else if (tab === 'likes' || tab === 'favorites' || tab === 'reposts') {
        // Delete the video
        await supabase.from('videos').delete().eq('id', item.id).eq('user_id', profile.id);
        setVideos(prev => prev.filter(v => v.id !== item.id));
        
        // Small delay to ensure database deletion is complete before refreshing stats
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh dashboard stats to update counts
      }
    } catch (e) {
      console.error('Failed to delete', e);
      alert('Failed to delete item. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const currentCount = videos.length;
  const attemptsWithScore = tab === 'attempts'
    ? videos.filter((v) => typeof v.ai_score === 'number' && !Number.isNaN(v.ai_score as number))
    : [];
  const avgScore =
    attemptsWithScore.length > 0
      ? attemptsWithScore.reduce((sum, v) => sum + (v.ai_score as number), 0) /
        attemptsWithScore.length
      : null;
  const bestScore =
    attemptsWithScore.length > 0
      ? Math.max(...attemptsWithScore.map((v) => v.ai_score as number))
      : null;

  if (!profile) return null;

  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg pb-24"
      initial={{ opacity: 0 }}
      animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
      transition={{ 
        duration: 0.4, 
        ease: [0.16, 1, 0.3, 1],
        delay: 0.05
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={isMounted ? { y: 0, opacity: 1 } : { y: -20, opacity: 0 }}
        transition={{ 
          duration: 0.5, 
          ease: [0.16, 1, 0.3, 1],
          delay: isMounted ? 0.1 : 0
        }}
      >
        <PageHeader
          title="Profile"
          subtitle="YOUR DANCE JOURNEY"
          icon={<User size={32} className="text-white/90" />}
          bottomPadding="xl"
          maxWidth="4xl"
          action={
            <motion.button
              onClick={() => navigate('/settings')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
            >
              <Settings size={24} className="text-white" />
            </motion.button>
          }
        />
      </motion.div>

      <motion.div 
        className="max-w-4xl mx-auto px-6 pt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ 
          duration: 0.5, 
          delay: isMounted ? 0.15 : 0, 
          ease: [0.16, 1, 0.3, 1] 
        }}
      >
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.2 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
        >
          <Card variant="glass" className="mb-6 backdrop-blur-xl">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  <div className={`w-20 h-20 rounded-full overflow-hidden flex-shrink-0 shadow-lg shadow-groovely-pink-500/30 ${
                    !profile.avatar_url ? 'bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500' : 'bg-groovely-dark-surface'
                  }`}>
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                        {profile.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => navigate('/profile/edit')}
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-all duration-300"
                  >
                    <Edit size={14} className="text-groovely-peach-500" />
                  </button>
                </motion.div>

                {/* User Info */}
                <div>
                  <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white font-heading">
                    {profile.display_name || profile.username}
                  </h2>
                    <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-groovely-peach-500/20 to-groovely-pink-500/20 border border-groovely-peach-500/30 rounded-lg">
                      <Trophy size={14} className="text-groovely-peach-400" />
                      <span className="text-sm font-semibold text-white">{profile.score.toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="text-base text-groovely-dark-text-secondary">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-sm text-groovely-dark-text-tertiary mt-2 max-w-md">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Sign Out Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleSignOut}
                className="p-2 hover:bg-red-500/10 rounded-lg transition-all duration-300"
              >
                <LogOut size={20} className="text-red-500" />
              </motion.button>
            </div>

            {/* Enhanced Stats Grid */}
            <motion.div
              variants={staggerContainerVariants}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"
            >
              {[
                { icon: Settings, value: profile.rank, label: 'Rank', description: 'Competitive tier', color: 'from-groovely-pink-500 to-groovely-purple-500', onClick: undefined },
                { icon: Video, value: dashboardStats.videos.total, label: 'Videos', description: 'Total videos', color: 'from-groovely-pink-500 to-groovely-purple-500', onClick: undefined },
                { icon: Users, value: followerCount, label: 'Followers', description: 'Community size', color: 'from-groovely-purple-500 to-groovely-peach-500', onClick: () => navigate('/profile/follows?tab=followers') },
                { icon: UserPlus, value: followingCount, label: 'Following', description: 'Following count', color: 'from-groovely-peach-500 to-groovely-pink-500', onClick: () => navigate('/profile/follows?tab=following') },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div key={stat.label} variants={staggerItemVariants}>
                    <Card 
                      variant="elevated" 
                      hoverable 
                      padding="sm" 
                      className={`text-center ${stat.onClick ? 'cursor-pointer' : ''}`}
                      onClick={stat.onClick}
                    >
                      <motion.div
                        className={`w-8 h-8 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center mx-auto mb-2 shadow-md`}
                        whileHover={{ rotate: 5, scale: 1.1 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                      >
                        <Icon className="text-white" size={16} />
                      </motion.div>
                      <motion.div
                        className="text-xl font-bold text-white font-heading"
                        key={`${stat.label}-${stat.value}`}
                        initial={{ scale: 1.2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        {stat.value}
                      </motion.div>
                      <div className="text-xs font-semibold text-white/90">{stat.label}</div>
                      {stat.description && (
                        <div className="text-[10px] text-groovely-dark-text-tertiary mt-0.5">{stat.description}</div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Privileges section - hidden but code kept for future reactivation */}
            {false && rankPrivileges.length > 0 && (
              <Card variant="elevated" className="mb-4 bg-gradient-to-r from-groovely-pink-500/10 to-groovely-purple-500/10 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Crown size={16} className="text-groovely-peach-300" />
                  <span className="text-xs font-semibold text-groovely-peach-200 uppercase tracking-[0.3em]">
                    {profile.rank} Privileges
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rankPrivileges.map((privilege) => (
                    <span
                      key={privilege.id}
                      className="px-3 py-1 rounded-full bg-white/10 text-xs text-white/80 border border-white/20 backdrop-blur-md"
                    >
                      {privilege.description || privilege.privilege_type.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Dashboard Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card variant="elevated" padding="sm" className="bg-gradient-to-br from-groovely-peach-500/20 to-groovely-pink-500/20 border border-groovely-peach-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Video size={16} className="text-groovely-peach-400" />
                  <span className="text-xs font-semibold text-groovely-peach-300 uppercase">Attempts</span>
                </div>
                <div className="text-2xl font-bold text-white font-heading">{dashboardStats.attempts.total}</div>
                <div className="text-xs text-groovely-dark-text-tertiary mt-1">
                  Published attempts
                </div>
                {dashboardStats.attempts.avgScore > 0 && (
                  <div className="text-xs text-groovely-peach-300 mt-1">
                    Avg: {dashboardStats.attempts.avgScore.toFixed(1)} · Best: {dashboardStats.attempts.bestScore.toFixed(1)}
                  </div>
                )}
              </Card>

              <Card variant="elevated" padding="sm" className="bg-gradient-to-br from-groovely-pink-500/20 to-groovely-purple-500/20 border border-groovely-pink-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-groovely-pink-400" />
                  <span className="text-xs font-semibold text-groovely-pink-300 uppercase">Routines</span>
                </div>
                <div className="text-2xl font-bold text-white font-heading">{dashboardStats.routines.total}</div>
                <div className="text-xs text-groovely-dark-text-tertiary mt-1">Created routines</div>
              </Card>

              <Card variant="elevated" padding="sm" className="bg-gradient-to-br from-groovely-purple-500/20 to-groovely-peach-500/20 border border-groovely-purple-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Edit size={16} className="text-groovely-purple-400" />
                  <span className="text-xs font-semibold text-groovely-purple-300 uppercase">Drafts</span>
                </div>
                <div className="text-2xl font-bold text-white font-heading">{dashboardStats.drafts.total}</div>
                <div className="text-xs text-groovely-dark-text-tertiary mt-1">
                  {dashboardStats.attempts.drafts > 0 && dashboardStats.drafts.total > dashboardStats.attempts.drafts
                    ? `${dashboardStats.attempts.drafts} attempts · ${dashboardStats.drafts.total - dashboardStats.attempts.drafts} videos`
                    : dashboardStats.attempts.drafts > 0
                    ? `${dashboardStats.attempts.drafts} draft attempts`
                    : 'Unpublished videos'}
                </div>
              </Card>

              <Card variant="elevated" padding="sm" className="bg-gradient-to-br from-groovely-peach-500/20 to-groovely-purple-500/20 border border-groovely-peach-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-groovely-peach-400" />
                  <span className="text-xs font-semibold text-groovely-peach-300 uppercase">Engagement</span>
                </div>
                <div className="text-2xl font-bold text-white font-heading">{dashboardStats.videos.likes + dashboardStats.videos.favorites}</div>
                <div className="text-xs text-groovely-dark-text-tertiary mt-1">
                  {dashboardStats.videos.likes} likes · {dashboardStats.videos.favorites} favorites
                </div>
              </Card>
            </div>
          </Card>
        </motion.div>

        {/* Dance Styles */}
        {userStyles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ 
              duration: 0.5, 
              delay: isMounted ? 0.25 : 0, 
              ease: [0.16, 1, 0.3, 1] 
            }}
          >
            <Card variant="elevated" className="mb-6">
              <h3 className="text-xl font-bold text-white font-heading mb-4">
                My Dance Styles
              </h3>
              <div className="flex flex-wrap gap-2">
                {userStyles.map((style) => (
                  <motion.span
                    key={style.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-4 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white rounded-full text-xs font-semibold uppercase shadow-md transition-all duration-300"
                  >
                    {style.name}
                  </motion.span>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.27 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="mb-6"
        >
          <Card variant="elevated" className="backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 flex items-center justify-center shadow-lg shadow-groovely-peach-500/30">
                  <Bell size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-heading">Notifications</h3>
                  <p className="text-sm text-groovely-dark-text-secondary">
                    {notificationTab === 'notifications' 
                      ? (unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!')
                      : 'Crew activities'}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate('/settings')}
                size="sm"
                variant="ghost"
                className="!text-groovely-peach-400 hover:!bg-groovely-peach-500/10"
              >
                Manage
              </Button>
            </div>

            {/* Tabs */}
            {profile?.clan_id && (
              <div className="flex gap-2 mb-4 border-b border-groovely-dark-border">
                <button
                  onClick={() => setNotificationTab('notifications')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    notificationTab === 'notifications'
                      ? 'text-white border-b-2 border-groovely-peach-500'
                      : 'text-groovely-dark-text-secondary hover:text-white'
                  }`}
                >
                  Notifications
                </button>
                <button
                  onClick={() => setNotificationTab('crew-activities')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    notificationTab === 'crew-activities'
                      ? 'text-white border-b-2 border-groovely-peach-500'
                      : 'text-groovely-dark-text-secondary hover:text-white'
                  }`}
                >
                  Crew Activities
                </button>
              </div>
            )}
            
            {notificationTab === 'notifications' ? (
              loadingNotifications ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary opacity-50" />
                <p className="text-groovely-dark-text-secondary">No notifications yet</p>
                <p className="text-sm text-groovely-dark-text-tertiary mt-2">
                  Your activity updates will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notifications.slice(0, 5).map((notification) => {
                  const getIcon = () => {
                    switch (notification.type) {
                      case 'follow':
                        return <UserPlus size={16} className="text-groovely-peach-400" />;
                      case 'like':
                        return <Heart size={16} className="text-groovely-pink-400" />;
                      case 'comment':
                        return <MessageCircle size={16} className="text-groovely-purple-400" />;
                      case 'message':
                        return <Mail size={16} className="text-groovely-purple-400" />;
                      case 'achievement':
                        return <Trophy size={16} className="text-yellow-400" />;
                      case 'score':
                        return <Sparkles size={16} className="text-yellow-400" />;
                      default:
                        return <Bell size={16} className="text-white/60" />;
                    }
                  };

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ x: 4 }}
                      onClick={async () => {
                        // Mark notification as read
                        if (!notification.read && profile?.id) {
                          markNotificationAsRead(notification.id, profile.id);
                          // Update local state immediately
                          setNotifications(prev => 
                            prev.map(n => 
                              n.id === notification.id ? { ...n, read: true } : n
                            )
                          );
                          // Update unread count
                          setUnreadCount(prev => Math.max(0, prev - 1));
                        }
                        
                        // Navigate
                        if (notification.userId) {
                          navigate(`/user/${notification.userId}`);
                        } else if (notification.videoId) {
                          navigate(`/video/${notification.videoId}`);
                        }
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        notification.read 
                          ? 'bg-groovely-dark-surface/30 hover:bg-groovely-dark-surface/50' 
                          : 'bg-groovely-peach-500/10 hover:bg-groovely-peach-500/20 border-l-2 border-groovely-peach-500'
                      }`}
                    >
                      <div className="mt-0.5">{getIcon()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{notification.message}</p>
                        <p className="text-xs text-groovely-dark-text-tertiary mt-1">
                          {new Date(notification.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-groovely-peach-500 mt-2 flex-shrink-0" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )
            ) : (
              // Crew Activities Tab
              loadingCrewActivities ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="md" />
                </div>
              ) : crewActivities.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary opacity-50" />
                  <p className="text-groovely-dark-text-secondary">No crew activities yet</p>
                  <p className="text-sm text-groovely-dark-text-tertiary mt-2">
                    Your crew's activities will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {crewActivities.slice(0, 10).map((activity, index) => {
                    const activityUser = activity.user;
                    const userName = activityUser?.display_name || activityUser?.username || 'Unknown';
                    const userAvatar = activityUser?.avatar_url;

                    const getActivityIcon = () => {
                      switch (activity.type) {
                        case 'created':
                          return <Sparkles size={16} className="text-groovely-peach-400" />;
                        case 'joined':
                          return <UserPlus size={16} className="text-groovely-peach-400" />;
                        case 'left':
                          return <UserMinus size={16} className="text-red-400" />;
                        case 'message':
                          return <MessageCircle size={16} className="text-groovely-purple-400" />;
                        default:
                          return <Users size={16} className="text-groovely-peach-400" />;
                      }
                    };

                    const getActivityText = () => {
                      switch (activity.type) {
                        case 'created':
                          return (
                            <>
                              <span className="font-semibold text-groovely-peach-400">{userName}</span>
                              {' '}created the crew
                            </>
                          );
                        case 'joined':
                          return (
                            <>
                              <span className="font-semibold text-groovely-peach-400">{userName}</span>
                              {' '}joined the crew
                            </>
                          );
                        case 'left':
                          return (
                            <>
                              <span className="font-semibold text-red-400">{userName}</span>
                              {' '}left the crew
                            </>
                          );
                        case 'message':
                          return (
                            <>
                              <span className="font-semibold text-groovely-purple-400">{userName}</span>
                              {' '}sent a message
                            </>
                          );
                        default:
                          return `${userName} performed an action`;
                      }
                    };

                    return (
                      <motion.div
                        key={`${activity.type}-${activity.timestamp}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ x: 4 }}
                        onClick={() => {
                          if (activityUser?.id && activityUser.id !== profile.id) {
                            navigate(`/user/${activityUser.id}`);
                          } else if (profile?.clan_id) {
                            navigate(`/crew/${profile.clan_id}`);
                          }
                        }}
                        className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors bg-groovely-dark-surface/30 hover:bg-groovely-dark-surface/50"
                      >
                        {userAvatar ? (
                          <img 
                            src={userAvatar} 
                            alt={userName}
                            className="w-8 h-8 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">
                              {userName[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {getActivityIcon()}
                            <p className="text-sm text-white font-medium">{getActivityText()}</p>
                          </div>
                          <p className="text-xs text-groovely-dark-text-tertiary mt-1">
                            {new Date(activity.timestamp).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )
            )}
            
            {notificationTab === 'notifications' && notifications.length > 5 && (
              <div className="mt-4 pt-4 border-t border-groovely-dark-border">
                <Button
                  onClick={() => navigate('/settings')}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="!text-groovely-peach-400 hover:!bg-groovely-peach-500/10"
                >
                  View All Notifications
                </Button>
              </div>
            )}
            {notificationTab === 'crew-activities' && profile?.clan_id && (
              <div className="mt-4 pt-4 border-t border-groovely-dark-border">
                <Button
                  onClick={() => navigate(`/crew/${profile.clan_id}`)}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="!text-groovely-peach-400 hover:!bg-groovely-peach-500/10"
                >
                  View Crew Details
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Enhanced Overview Metrics */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`overview-${tab}`}
            initial={{ opacity: 0, y: 12 }}
            animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ 
              duration: 0.4, 
              ease: [0.16, 1, 0.3, 1],
              delay: isMounted ? 0.3 : 0
            }}
            className="mb-6"
          >
            <Card variant="elevated" className="bg-groovely-dark-surface/60 border border-groovely-dark-border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 flex items-center justify-center shadow-lg">
                  <BarChart2 size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-subtext text-groovely-dark-text-tertiary uppercase">
                    {tab === 'attempts'
                      ? 'ATTEMPTS OVERVIEW'
                      : tab === 'routines'
                      ? 'ROUTINES OVERVIEW'
                      : tab === 'drafts'
                      ? 'DRAFTS OVERVIEW'
                      : tab === 'crews'
                      ? 'CREWS OVERVIEW'
                      : tab === 'likes'
                      ? 'LIKES OVERVIEW'
                      : tab === 'favorites'
                      ? 'FAVORITES OVERVIEW'
                      : 'REPOSTS OVERVIEW'}
                  </p>
                  <p className="text-lg font-heading text-white">
                    {tab === 'crews' ? crews.length : currentCount}{' '}
                    <span className="text-sm font-subtext text-groovely-dark-text-secondary">
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </span>
                  </p>
                  {tab === 'attempts' && avgScore !== null && (
                    <p className="text-xs text-groovely-dark-text-tertiary mt-1">
                      Avg score{' '}
                      <span className="font-semibold text-groovely-peach-300">
                        {avgScore.toFixed(1)}
                      </span>{' '}
                      {bestScore !== null && (
                        <>
                          · Best{' '}
                          <span className="font-semibold text-groovely-pink-300">
                            {bestScore.toFixed(1)}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Enhanced bar chart */}
              <div className="flex-1">
                <div className="h-20 flex items-end gap-1 overflow-hidden">
                  {(tab === 'attempts'
                    ? attemptsWithScore.slice(0, 16)
                    : videos.slice(0, 16)
                  ).map((v, idx) => {
                    const base = tab === 'attempts' ? (v.ai_score as number) || 0 : (v.likes ?? 0);
                    const normalized = tab === 'attempts'
                      ? Math.max(8, (base / 100) * 100)
                      : Math.min(100, base * 8);
                    return (
                      <motion.div
                        key={`${v.id}-${idx}`}
                        initial={{ height: 0 }}
                        animate={{ height: `${normalized}%` }}
                        transition={{ delay: idx * 0.05, duration: 0.3 }}
                        className="flex-1 rounded-t-full bg-gradient-to-t from-groovely-dark-surface to-groovely-peach-500/80"
                      />
                    );
                  })}
                  {(tab === 'crews' ? crews.length === 0 : videos.length === 0) && (
                    <div className="text-xs text-groovely-dark-text-tertiary">
                      No data yet — your graph will appear once you start posting.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          </motion.div>
        </AnimatePresence>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.35 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="mb-6"
        >
          <Card variant="elevated" padding="sm">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {[
                { id: 'attempts' as const, label: 'Attempts', icon: Video },
                { id: 'routines' as const, label: 'Routines', icon: FileText },
                { id: 'drafts' as const, label: 'Drafts', icon: Edit },
                { id: 'crews' as const, label: 'Crews', icon: Users },
                { id: 'reposts' as const, label: 'Reposts', icon: Repeat2 },
                { id: 'favorites' as const, label: 'Favorites', icon: Bookmark },
                { id: 'likes' as const, label: 'Likes', icon: Heart },
              ].map((tabItem) => {
                const Icon = tabItem.icon;
                const isActive = tab === tabItem.id;
                return (
                  <motion.button
                    key={tabItem.id}
                    onClick={() => handleTabChange(tabItem.id)}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.01 }}
                    transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    className={`relative flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-base whitespace-nowrap transition-all duration-300 ${
                      isActive
                        ? 'text-white'
                        : 'text-groovely-dark-text-secondary hover:bg-groovely-dark-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-lg z-0"
                        initial={false}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 500, 
                          damping: 40,
                          mass: 0.8
                        }}
                      />
                    )}
                    <Icon size={16} className="relative z-10" />
                    <span className="relative z-10">{tabItem.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Content Grid */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isMounted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.4 : 0
              }}
              className="flex justify-center py-12"
            >
              <LoadingSpinner size="lg" />
            </motion.div>
          ) : tab === 'crews' ? (
            <motion.div
              key="crews"
              variants={staggerContainerVariants}
              initial="initial"
              animate={isMounted ? "animate" : "initial"}
              exit="exit"
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.4 : 0
              }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {crews.length > 0 ? (
                crews.map((crew, index) => {
                  const rank = crew.rank || (index + 1);
                  
                  return (
                    <motion.div
                      key={crew.id}
                      variants={staggerItemVariants}
                    >
                      <Card
                        variant="elevated"
                        hoverable
                        className="text-center relative cursor-pointer"
                        onClick={() => navigate(`/crew/${crew.id}`)}
                      >
                        {/* Badges - Top Right */}
                        <div className="absolute top-4 right-4 flex gap-2 z-10">
                          {/* Rank Badge - Only show top 3, but not if user is creator (to avoid duplicate crown) */}
                          {rank <= 3 && !crew.isCreator && (
                            <motion.div
                              initial={{ scale: 0, rotate: -180 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              className={`p-1.5 rounded-full shadow-lg ${
                                rank === 1 
                                  ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-[0_0_20px_rgba(250,204,21,0.5)]' 
                                  : rank === 2 
                                  ? 'bg-gradient-to-br from-gray-300 to-gray-500 shadow-[0_0_15px_rgba(156,163,175,0.5)]'
                                  : 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-[0_0_15px_rgba(251,146,60,0.5)]'
                              }`}
                              title={`Rank ${rank}`}
                            >
                              {rank === 1 ? (
                                <Crown size={16} className="text-white" />
                              ) : (
                                <Medal size={16} className="text-white" />
                              )}
                            </motion.div>
                          )}
                          {/* Role Badges */}
                          {crew.isCreator ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-2 py-1 rounded-full text-xs font-semibold shadow-lg shadow-yellow-500/30 flex items-center gap-1"
                              title="Creator"
                            >
                              <Crown size={12} />
                            </motion.div>
                          ) : (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-gradient-to-r from-groovely-purple-500/80 to-groovely-peach-500/80 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg"
                              title="Joined"
                            >
                              <CheckCircle size={12} />
                            </motion.div>
                          )}
                        </div>

                        {/* Crew Avatar - Centered */}
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-groovely-purple-500/30 overflow-hidden border-2 border-groovely-purple-500/30"
                        >
                          {crew.avatar_url && crew.avatar_url.trim() !== '' ? (
                            <img 
                              src={crew.avatar_url} 
                              alt={crew.name} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector('.fallback-icon')) {
                                  const fallback = document.createElement('div');
                                  fallback.className = 'fallback-icon w-full h-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center';
                                  fallback.innerHTML = `<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <Users size={32} className="text-white" />
                          )}
                        </motion.div>

                        {/* Crew Info */}
                        <h3 className="text-xl font-bold text-white mb-1 truncate flex items-center justify-center gap-1 font-heading">
                          {crew.name}
                        </h3>
                        {crew.description && (
                          <p className="text-sm text-white/60 mb-4 px-4 line-clamp-2 min-h-[2.5rem]">
                            {crew.description}
                          </p>
                        )}

                        {/* Stats */}
                        <div className="flex justify-center gap-6 mb-4 pb-4 border-b border-white/10">
                          <div>
                            <div className="text-lg font-bold bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {crew.total_score?.toLocaleString() || 0}
                            </div>
                            <div className="text-xs text-white/50">Score</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-white font-heading">{crew.memberCount || 0}</div>
                            <div className="text-xs text-white/50">Members</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-white font-heading">{rank}</div>
                            <div className="text-xs text-white/50">Rank</div>
                          </div>
                        </div>

                        {/* Action Button - Show Join/Leave for members, View Crew for admins */}
                        {!crew.isCreator ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            role="presentation"
                          >
                            <Button
                              onClick={() => handleLeaveCrew(crew.id)}
                              size="sm"
                              fullWidth
                              variant="secondary"
                              className="!bg-white/10 !text-red-400 hover:!bg-red-500/10 !border-red-500/50 hover:!border-red-500"
                            >
                              <UserMinus size={16} className="mr-2" />
                              Leave
                            </Button>
                          </div>
                        ) : (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            role="presentation"
                          >
                            <Button
                              onClick={() => navigate(`/crew/${crew.id}`)}
                              size="sm"
                              fullWidth
                              variant="secondary"
                              className="!bg-gradient-to-r !from-groovely-peach-500/20 !to-groovely-purple-500/20 !text-white !border !border-groovely-peach-500/30 hover:!bg-gradient-to-r hover:!from-groovely-peach-500/30 hover:!to-groovely-purple-500/30"
                            >
                              <Crown size={16} className="mr-2" />
                              Manage Crew
                            </Button>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full"
                >
                  <Card variant="elevated" className="text-center py-12">
                    <Users size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-xl font-bold text-white mb-2 font-heading">No crews yet</h3>
                    <p className="text-base text-groovely-dark-text-secondary mb-6">
                      Join or create a crew to start building your dance crew!
                    </p>
                    <Button onClick={() => navigate('/explore')} className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500">
                      <Crown size={18} className="mr-2" />
                      Explore Crews
                    </Button>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          ) : videos.length > 0 ? (
            <motion.div
              key={`content-${tab}`}
              variants={staggerContainerVariants}
              initial="initial"
              animate={isMounted ? "animate" : "initial"}
              exit="exit"
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.4 : 0
              }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
            {videos.map((v) => {
              const handleCardClick = () => {
                // Navigate to video detail page for all videos
                if (v.id) {
                  navigate(`/video/${v.id}`);
                }
              };

              return (
              <motion.div key={v.id} variants={staggerItemVariants}>
                <Card 
                  variant="elevated" 
                  padding="none" 
                  hoverable 
                  className="overflow-hidden relative group cursor-pointer"
                  onClick={handleCardClick}
                >
                  {/* Menu Button */}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 z-20 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full shadow-lg backdrop-blur-sm transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVideo(v);
                      setActionSheetOpen(true);
                    }}
                    title="More options"
                  >
                    <MoreVertical size={16} />
                  </motion.button>

                  <div className="relative">
                    {v.video_url ? (
                      <video 
                        src={v.video_url} 
                        className="w-full aspect-video bg-black object-cover" 
                        controls
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="w-full aspect-video bg-gradient-to-br from-groovely-peach-500/20 to-groovely-purple-500/20 flex items-center justify-center border-2 border-dashed border-groovely-dark-border">
                        <div className="text-center">
                          <FileText size={48} className="mx-auto mb-2 text-groovely-dark-text-tertiary" />
                          <p className="text-sm text-groovely-dark-text-secondary">No video</p>
                        </div>
                      </div>
                    )}
                    {/* Status Badge */}
                    {v.status === 'draft' && (
                      <div className="absolute top-2 left-2 bg-yellow-500/90 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-semibold">
                        Draft
                      </div>
                    )}
                    {/* Routine Badge */}
                    {tab === 'routines' && !v.video_url && (
                      <div className="absolute top-2 left-2 bg-blue-500/90 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-semibold">
                        No Video
                      </div>
                    )}
                    {/* Score Badge */}
                    {v.ai_score !== null && v.ai_score !== undefined && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-lg px-2 py-1 z-10">
                        <div className="flex items-center gap-1 text-white text-xs">
                          <Sparkles size={12} className="text-yellow-400" />
                          <span className="font-bold">{v.ai_score.toFixed(0)}/100</span>
                        </div>
                      </div>
                    )}
                    {v.ai_feedback && v.ai_feedback.overall && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-lg px-2 py-1 z-10">
                        <div className="flex items-center gap-1 text-white text-xs">
                          <Sparkles size={12} className="text-yellow-400" />
                          <span className="font-bold">{v.ai_feedback.overall.toFixed(1)}/10</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-semibold text-white truncate flex-1">{v.title}</h4>
                      <span className="text-xs text-groovely-dark-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to {tab === 'attempts' ? 'view' : tab === 'routines' ? 'try' : 'open'} →
                      </span>
                    </div>
                    {v.routine_title && (
                      <p className="text-xs text-groovely-peach-400 mt-1">Routine: {v.routine_title}</p>
                    )}
                    {v.description && (
                      <p className="text-sm text-groovely-dark-text-secondary line-clamp-1 mt-1">{v.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-groovely-dark-text-tertiary">
                      <ViewCount count={v.views || 0} size="sm" className="text-groovely-dark-text-tertiary" />
                      <span className="flex items-center gap-1">
                        <Heart size={12} />
                        {v.likes ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bookmark size={12} />
                        {v.favorites ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat2 size={12} />
                        {v.reposts ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={12} />
                        {v.comments ?? 0}
                      </span>
                    </div>
                    {v.created_at && (
                      <div className="mt-2 text-xs text-groovely-dark-text-tertiary flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
            })}
            </motion.div>
          ) : (
            <motion.div
              key={`empty-${tab}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isMounted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.4 : 0
              }}
            >
              <Card variant="elevated" className="text-center py-12">
                <Video size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                <h3 className="text-xl font-bold text-white mb-2 font-heading">No {tab} yet</h3>
                <p className="text-base text-groovely-dark-text-secondary mb-4">
                  {tab === 'attempts' && 'Start practicing routines to see your attempts here'}
                  {tab === 'routines' && 'Create routines to see them here'}
                  {tab === 'drafts' && 'Upload videos to see your drafts here'}
                  {(tab as string) === 'crews' && 'Join or create a crew to see it here'}
                  {tab === 'likes' && 'Like videos to see them here'}
                  {tab === 'favorites' && 'Favorite videos to see them here'}
                  {tab === 'reposts' && 'Repost videos to see them here'}
                </p>
                {(tab === 'attempts' || tab === 'routines' || tab === 'drafts' || (tab as string) === 'crews') && (
                  <Button onClick={() => navigate(tab === 'attempts' ? '/explore' : tab === 'routines' ? '/create-routine' : tab === 'drafts' ? '/create-video' : '/explore')}>
                    <Plus size={18} className="mr-2" />
                    {tab === 'attempts' ? 'Try a Routine' : tab === 'routines' ? 'Create Routine' : tab === 'drafts' ? 'Upload Video' : 'Explore Crews'}
                  </Button>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Action Sheet */}
      <ActionSheet
        isOpen={actionSheetOpen}
        onClose={() => {
          setActionSheetOpen(false);
          setSelectedVideo(null);
        }}
        title={selectedVideo?.title || 'Video Options'}
        items={[
          {
            label: 'View Details',
            icon: <ExternalLink size={20} />,
            onClick: () => {
              if (selectedVideo?.id) {
                navigate(`/video/${selectedVideo.id}`);
              }
            },
          },
          ...(selectedVideo?.routine_id
            ? [
                {
                  label: 'Try This Routine',
                  icon: <Video size={20} />,
                  onClick: () => {
                    if (selectedVideo.routine_id) {
                      navigate(`/try/${selectedVideo.routine_id}`);
                    }
                  },
                } as const,
              ]
            : []),
          ...(selectedVideo?.video_url
            ? [
                {
                  label: 'Share Video',
                  icon: <Share2 size={20} />,
                  onClick: async () => {
                    if (selectedVideo.video_url) {
                      try {
                        if (navigator.share) {
                          await navigator.share({
                            title: selectedVideo.title || 'Check out this video',
                            url: selectedVideo.video_url,
                          });
                        } else {
                          // Fallback: copy to clipboard
                          await navigator.clipboard.writeText(selectedVideo.video_url);
                          alert('Video URL copied to clipboard!');
                        }
                      } catch (err) {
                        console.error('Error sharing:', err);
                      }
                    }
                  },
                } as const,
              ]
            : []),
          {
            label: 'Delete',
            icon: <Trash2 size={20} />,
            onClick: () => {
              if (selectedVideo) {
                handleDelete(selectedVideo);
              }
            },
            destructive: true,
            disabled: deletingId === selectedVideo?.id,
          },
        ]}
      />
    </motion.div>
  );
}
