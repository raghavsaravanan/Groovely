import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, UserCheck, UserMinus, Users as UsersIcon, Crown, CheckCircle, Compass, Medal, Video as VideoIcon, Sparkles } from 'lucide-react';
import { supabase, Profile, Crew, Video, checkAchievementsSilently } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonCard, Button, Card, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { CreateCrewWizard } from '../components/CreateCrewWizard';
import { ConfirmModal } from '../components/ConfirmModal';
import { VideoFeedItem } from '../components/VideoFeedItem';

type Tab = 'videos' | 'users' | 'crews';

export function Explore() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Map<string, number>>(new Map());
  const [followingCounts, setFollowingCounts] = useState<Map<string, number>>(new Map());
  const [joinedCrews, setJoinedCrews] = useState<Set<string>>(new Set());
  const [crewMembers, setCrewMembers] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateCrew, setShowCreateCrew] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalProps, setConfirmModalProps] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const isFirstRender = useRef(true);

  const arenaName = useMemo(() => profile?.rank ?? 'Studio 1', [profile]);

  // Initialize page on mount - synchronized with global timing
  useEffect(() => {
    // Reset scroll position immediately for seamless transitions
    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }

    // Synchronized mount timing - matches pageVariants delay
    // Use double RAF for perfect timing alignment with page transition
    const animationFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Small delay to sync with page transition completion
        setTimeout(() => {
          setIsMounted(true);
          // Mark first render as complete after a short delay
          setTimeout(() => {
            isFirstRender.current = false;
          }, 600);
        }, 50); // Aligns with PAGE_MOUNT_DELAY (0.1s = 100ms, but we start earlier)
      });
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      setIsMounted(false); // Reset on unmount
    };
  }, []);

  // Fetch real follow counts
  const fetchFollowCounts = async (userId: string) => {
    const [followersRes, followingRes] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
      supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId),
    ]);
    
    return {
      followers: followersRes.count || 0,
      following: followingRes.count || 0,
    };
  };

  // Mock verified users (top 10% by score)
  const isVerified = (userScore: number) => userScore > 8000;

  // Fetch data based on active tab
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only show loading if we don't have data yet
      const hasData = activeTab === 'videos' ? videos.length > 0 : activeTab === 'users' ? users.length > 0 : crews.length > 0;
      if (!hasData) {
        setLoading(true);
      }

      if (activeTab === 'videos') {
        // Fetch all videos
        const { data: allVideos } = await supabase
          .from('videos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!cancelled && allVideos) {
          // Filter out draft videos - only show published videos
          // For attempt videos (kind='attempt'), check the attempts table for status='published'
          const attemptVideos = allVideos.filter(v => v.kind === 'attempt');
          const nonAttemptVideos = allVideos.filter(v => v.kind !== 'attempt');
          
          // Filter out regular draft videos (videos without AI score and kind=other or null)
          // These are considered drafts and should not be visible to other users
          // Also explicitly exclude the current user's drafts
          const publishedNonAttemptVideos = nonAttemptVideos.filter(v => {
            // Reference videos are always published
            if (v.kind === 'reference') return true;
            
            // Videos with AI score are published (they've been through the scoring process)
            if (v.ai_score !== null) return true;
            
            // Videos without AI score and (kind=other or kind=null) are drafts - exclude them
            // Exclude all drafts, including the current user's drafts
            return false;
          }).filter(v => {
            // Explicitly filter out current user's drafts (double-check)
            // A draft is a video without AI score and (kind=other or kind=null)
            if (v.user_id === user?.id && v.ai_score === null && (v.kind === 'other' || v.kind === null)) {
              return false;
            }
            return true;
          });
          
          // For attempt videos, check if they're published in the attempts table
          let publishedAttemptVideos: Video[] = [];
          if (attemptVideos.length > 0) {
            const attemptRoutineIds = [...new Set(attemptVideos.map(v => v.routine_id).filter(Boolean))];
            const attemptVideoUrls = attemptVideos.map(v => v.video_url).filter(Boolean);
            
            if (attemptRoutineIds.length > 0 && attemptVideoUrls.length > 0) {
              // Only fetch published attempts - exclude drafts
              const { data: publishedAttempts } = await supabase
                .from('attempts')
                .select('routine_id, user_id, video_url, status')
                .eq('status', 'published')
                .in('routine_id', attemptRoutineIds)
                .in('video_url', attemptVideoUrls);
              
              // Create a set of (routine_id + user_id + video_url) combinations for published attempts
              const publishedKeys = new Set<string>();
              publishedAttempts?.forEach((a: any) => {
                if (a.routine_id && a.user_id && a.video_url) {
                  publishedKeys.add(`${a.routine_id}:${a.user_id}:${a.video_url}`);
                }
              });
              
              // Filter attempt videos to only include published ones
              // Also explicitly exclude the current user's drafts
              publishedAttemptVideos = attemptVideos.filter(v => {
                if (!v.routine_id || !v.user_id || !v.video_url) return false;
                const key = `${v.routine_id}:${v.user_id}:${v.video_url}`;
                const isPublished = publishedKeys.has(key);
                
                // Double-check: exclude current user's drafts even if they somehow passed the published check
                if (v.user_id === user?.id && !isPublished) {
                  return false;
                }
                
                return isPublished;
              });
            }
          }
          
          // Combine published non-attempt videos with published attempt videos
          // Final filter to ensure no user drafts are visible in Explore
          const filteredVideos = [...publishedNonAttemptVideos, ...publishedAttemptVideos]
            .filter(v => {
              // Explicitly exclude current user's drafts from Explore page
              if (v.user_id === user?.id) {
                // Exclude drafts: videos without AI score and (kind=other or kind=null)
                if (v.ai_score === null && (v.kind === 'other' || v.kind === null)) {
                  return false;
                }
              }
              return true;
            })
            .sort((a, b) => {
              const dateA = new Date(a.created_at || 0).getTime();
              const dateB = new Date(b.created_at || 0).getTime();
              return dateB - dateA;
            });
          
          setVideos(filteredVideos);
        } else if (!cancelled) {
          setVideos([]);
        }
      } else if (activeTab === 'users') {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .order('score', { ascending: false })
          .limit(100);
        
        if (!cancelled && data) {
          setUsers(data);
          
          // Fetch real follow counts for each user
          const followersMap = new Map();
          const followingMap = new Map();
          
          for (const u of data) {
            const counts = await fetchFollowCounts(u.id);
            followersMap.set(u.id, counts.followers);
            followingMap.set(u.id, counts.following);
          }
          
          setFollowerCounts(followersMap);
          setFollowingCounts(followingMap);
        }
        
        // Fetch real following relationships
        if (!cancelled && user) {
          const { data: followingData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          
          if (followingData) {
            const followingSet = new Set(followingData.map(f => f.following_id));
            setFollowing(followingSet);
          }
        }
      } else if (activeTab === 'crews') {
        // Fetch all crews - use select('*') to get all fields including creator_id
        const { data, error } = await supabase
          .from('clans')
          .select('*')
          .order('total_score', { ascending: false })
          .limit(50);
        
        if (error) {
          console.error(' Error fetching crews:', error);
          // Still set empty array to prevent loading state
          if (!cancelled) {
            setCrews([]);
            setCrewMembers(new Map());
          }
        } else if (!cancelled && data) {
          setCrews(data);
          
          // Fetch real member counts and calculate total scores for each crew
          const members = new Map<string, number>();
          const crewScores = new Map<string, number>();
          
          // Get all crew IDs
          const crewIds = data.map(c => c.id).filter(Boolean);
          
          if (crewIds.length > 0) {
            // For each crew, get members and calculate total score
            for (const crewId of crewIds) {
              try {
                // Get all members of this crew
                const { data: memberProfiles } = await supabase
                  .from('profiles')
                  .select('id, score')
                  .eq('clan_id', crewId);
                
                const memberCount = memberProfiles?.length || 0;
                members.set(crewId, memberCount);
                
                // Calculate total score as sum of all member scores
                const totalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
                crewScores.set(crewId, totalScore);
                
                // Update crew total_score in database if it doesn't match
                const crew = data.find(c => c.id === crewId);
                if (crew && crew.total_score !== totalScore) {
                  // Update in background (don't await to avoid blocking UI)
                  supabase
                    .from('clans')
                    .update({ total_score: totalScore })
                    .eq('id', crewId)
                    .then(({ error }) => {
                      if (error) {
                      }
                    });
                }
              } catch (err) {
                crewScores.set(crewId, 0);
              }
            }
          }
          
          setCrewMembers(members);
          
          // Update crews with calculated scores
          setCrews(prevCrews => prevCrews.map(crew => ({
            ...crew,
            total_score: crewScores.get(crew.id) || crew.total_score || 0
          })));
        } else if (!cancelled) {
          // No data returned but no error
          setCrewMembers(new Map());
        }
        
        // Set current crew
        if (profile?.clan_id) {
          setJoinedCrews(new Set([profile.clan_id as string]));
        }
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, profile?.id, user?.id]); // Use stable IDs instead of objects

  const handleTabChange = async (tab: Tab) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setActiveTab(tab);
    setSearchQuery('');
    // Scroll to top when switching tabs
    window.scrollTo(0, 0);
  };

  const handleFollow = async (userId: string) => {
    if (!user) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    const isFollowing = following.has(userId);
    
    if (isFollowing) {
      // Unfollow
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      if (!error) {
        setFollowing(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        
        // Update follower count
        setFollowerCounts(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(userId) || 0;
          newMap.set(userId, Math.max(0, current - 1));
          return newMap;
        });
      }
    } else {
      // Follow
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: user.id,
          following_id: userId,
        });

      if (!error) {
        setFollowing(prev => {
          const newSet = new Set(prev);
          newSet.add(userId);
          return newSet;
        });
        
        // Update follower count
        setFollowerCounts(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(userId) || 0;
          newMap.set(userId, current + 1);
          return newMap;
        });
        
        // Check for achievements (social butterfly, influencer)
        await checkAchievementsSilently(user.id);
      }
    }
  };

  const handleJoinCrew = async (crewId: string) => {
    if (!user) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    const isJoined = joinedCrews.has(crewId);
    
    if (isJoined) {
      // Leave crew
      await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
      setJoinedCrews(new Set());
      
      // Fetch updated member count - use a small delay to ensure DB is updated
      setTimeout(async () => {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('clan_id', crewId);
        
        setCrewMembers(prev => {
          const newMap = new Map(prev);
          newMap.set(crewId, count || 0);
          return newMap;
        });
      }, 500);
    } else {
      // Check if user is already in a different crew
      if (profile?.clan_id && profile.clan_id !== crewId) {
        // Find the current crew name
        const currentCrew = crews.find(c => c.id === profile.clan_id);
        const targetCrew = crews.find(c => c.id === crewId);
        
        // Show modern confirm modal
        setConfirmModalProps({
          title: 'Leave Current Crew?',
          message: `You are already in "${currentCrew?.name || 'another crew'}". You must leave it before joining "${targetCrew?.name || 'this crew'}". Would you like to leave your current crew and join this one?`,
          onConfirm: async () => {
            // Leave current crew first
            const { error: leaveError } = await supabase
              .from('profiles')
              .update({ clan_id: null })
              .eq('id', user.id);
            
            if (leaveError) {
              alert(`Failed to leave current crew: ${leaveError.message}`);
              return;
            }
            
            // Update member count for old crew
            const oldCrew = profile.clan_id;
            const { count: oldCount } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('clan_id', oldCrew);
            
            setCrewMembers(prev => {
              const newMap = new Map(prev);
              if (oldCrew) {
                newMap.set(oldCrew, oldCount || 0);
              }
              return newMap;
            });
            
            // Continue with joining new crew
            await joinNewCrew(crewId);
          },
        });
        setShowConfirmModal(true);
        return;
      }
      
      await joinNewCrew(crewId);
    }
  };

  const joinNewCrew = async (crewId: string) => {
    if (!user) return;
      
      // Join crew (can only be in one crew at a time)
      const { error: joinError } = await supabase
        .from('profiles')
        .update({ clan_id: crewId })
        .eq('id', user.id);
      
      if (joinError) {
        alert(`Failed to join crew: ${joinError.message}`);
        return;
      }
      
      setJoinedCrews(new Set([crewId]));
      
      // Fetch updated member count for the crew being joined - use a small delay to ensure DB is updated
      setTimeout(async () => {
        const { count: newCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('clan_id', crewId);
        
        setCrewMembers(prev => {
          const newMap = new Map(prev);
          newMap.set(crewId, newCount || 0);
          return newMap;
        });
      }, 500);

      // Success haptic
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
  };



  // Filter videos
  const filteredVideos = useMemo(() => {
    let filtered = videos;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        (v.title?.toLowerCase().includes(query)) ||
        (v.description?.toLowerCase().includes(query))
      );
    }
    return filtered;
  }, [videos, searchQuery]);

  // Filter users

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  // Filter crews
  const filteredCrews = crews.filter((c) =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg text-white pb-24"
      initial={{ opacity: 0 }}
      animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
      transition={{ 
        duration: 0.4, 
        ease: [0.16, 1, 0.3, 1],
        delay: 0.05 // Slight delay to sync with page transition
      }}
    >
      <PageHeader
        title="Explore"
        subtitle="DISCOVER • CONNECT • COMPETE"
        icon={<Compass size={32} className="text-white/90" />}
        bottomPadding="xl"
        maxWidth="6xl"
        action={
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
            className="bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white px-4 py-2 rounded-full shadow-[0_0_20px_rgba(236,72,153,0.35)] font-semibold"
          >
            <Crown size={16} className="inline mr-1" />
            <span className="text-xs font-subtext">{arenaName}</span>
          </motion.div>
        }
      >
          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-ios-4"
          >
            <div className="flex gap-ios-2">
              <div className="relative flex-1">
                <Search className="absolute left-ios-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'videos' ? 'Search videos...'
                    : activeTab === 'users' ? 'Search users...' 
                    : 'Search crews...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-ios-12 pr-4 py-3 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-base text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            </motion.div>

          {/* Tabs */}
          <div className="flex gap-ios-2">
            {[
              { id: 'videos' as const, label: 'Videos', icon: VideoIcon },
              { id: 'users' as const, label: 'Users', icon: UserPlus },
              { id: 'crews' as const, label: 'Dance Crews', icon: UsersIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.01 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-base transition-all ${
                    isActive ? 'text-white' : 'text-white/60 hover:bg-white/10'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeExploreTab"
                      className="absolute inset-0 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-xl shadow-[0_0_25px_rgba(236,72,153,0.35)]"
                      initial={false}
                      transition={{ 
                        type: 'spring', 
                        stiffness: 500, 
                        damping: 40,
                        mass: 0.8
                      }}
                    />
                  )}
                  <Icon size={18} className="relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </motion.button>
              );
            })}
          </div>
      </PageHeader>

      {/* Content */}
      <motion.div 
        className="max-w-6xl mx-auto px-ios-4 py-ios-6"
        layout
        transition={{ 
          duration: 0.3, 
          ease: [0.16, 1, 0.3, 1] 
        }}
      >
        <AnimatePresence mode="wait" initial={true}>
        {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
              }}
              variants={staggerContainerVariants}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-ios-4"
            >
              {[...Array(6)].map((_, i) => (
                <motion.div key={i} variants={staggerItemVariants}>
                  <SkeletonCard />
                </motion.div>
              ))}
            </motion.div>
          ) : activeTab === 'videos' ? (
            <motion.div
              key="videos"
              initial={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(10px)' }}
              transition={{ 
                duration: 0.5, 
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              {filteredVideos.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center min-h-[60vh]"
                >
                  <Card variant="elevated" className="text-center py-12 px-8 max-w-md">
                    <VideoIcon size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-2xl font-bold text-white mb-2 font-heading">
                      {searchQuery ? 'No videos found' : 'No videos yet'}
                    </h3>
                    <p className="text-base text-groovely-dark-text-secondary mb-6">
                      {searchQuery 
                        ? 'Try adjusting your search terms' 
                        : 'Be the first to share your moves!'}
                    </p>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  variants={staggerContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-ios-4"
                >
                  {filteredVideos.map((video) => (
                    <motion.div key={video.id} variants={staggerItemVariants}>
                      <Card
                        variant="elevated"
                        hoverable
                        className="relative cursor-pointer overflow-hidden"
                        onClick={() => navigate(`/video/${video.id}`)}
                      >
                        {/* Thumbnail */}
                        <div className="relative aspect-video bg-groovely-dark-surface overflow-hidden">
                          {video.thumbnail_url ? (
                            <img 
                              src={video.thumbnail_url} 
                              alt={video.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-groovely-purple-500/20 to-groovely-peach-500/20">
                              <VideoIcon size={48} className="text-white/40" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute bottom-ios-2 left-ios-2 right-ios-2">
                            <h3 className="text-white font-semibold text-sm line-clamp-2 mb-ios-1">
                              {video.title}
                            </h3>
                            <p className="text-white/70 text-xs line-clamp-1">
                              {video.description}
                            </p>
                          </div>
                        </div>
                        {/* Video Info */}
                        <div className="p-ios-4">
                          <div className="flex items-center justify-between text-xs text-white/50">
                            <span>{video.views || 0} views</span>
                            <span>{video.likes || 0} likes</span>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          ) : activeTab === 'users' ? (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(10px)' }}
              transition={{ 
                duration: 0.5, 
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              {/* User Cards Grid */}
              <motion.div
                variants={staggerContainerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-ios-4"
                style={{ gridAutoRows: '1fr' }}
              >
                {filteredUsers.map((usr) => {
                  const isFollowing = following.has(usr.id);
                  const verified = isVerified(usr.score || 0);
                  const followers = followerCounts.get(usr.id) || 0;
                  const followingCount = followingCounts.get(usr.id) || 0;
                  const isOwnProfile = user && usr.id === user.id;
                  
                  return (
                    <motion.div key={usr.id} variants={staggerItemVariants} className="h-full">
                      <Card
                        variant="elevated"
                        hoverable
                        className="text-center relative cursor-pointer h-full flex flex-col"
                        onClick={() => navigate(`/user/${usr.id}`)}
                      >
                        {/* Badges */}
                        <div className="absolute top-ios-4 right-ios-4 flex gap-ios-2 z-10">
                          {verified && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-ios-blue-500 text-white p-1 rounded-full shadow-ios-glow-blue"
                              title="Verified"
                            >
                              <CheckCircle size={16} />
                            </motion.div>
                          )}
                        </div>

                        {/* Avatar */}
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          className="w-20 h-20 mx-auto mb-ios-4 bg-gradient-to-br from-ios-blue-500 to-ios-purple-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-ios-glow-blue flex-shrink-0"
                        >
                          {usr.avatar_url ? (
                            <img src={usr.avatar_url} alt={usr.username} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            usr.username?.[0]?.toUpperCase() || '?'
                          )}
                        </motion.div>

                        {/* User Info */}
                        <h3 className="text-ios-headline font-bold text-white mb-ios-1 truncate flex items-center justify-center gap-ios-1">
                          {usr.display_name || usr.username}
                        </h3>
                        <p className="text-ios-caption-1 text-white/50 mb-ios-3">@{usr.username}</p>
                        
                        {/* Bio - Fixed height container to ensure consistent card sizes */}
                        <div className="min-h-[3rem] mb-ios-4">
                          {usr.bio ? (
                            <p className="text-ios-caption-2 text-white/60 px-ios-4 line-clamp-2">
                              {usr.bio}
                            </p>
                          ) : (
                            <div className="h-[3rem]"></div>
                          )}
                        </div>

                        {/* Follower Stats */}
                        <div className="flex justify-center gap-ios-6 mb-ios-4 pb-ios-4 border-b border-white/10 flex-shrink-0">
                          <div>
                            <div className="text-ios-body font-bold text-white">{followers}</div>
                            <div className="text-ios-caption-2 text-white/50">Followers</div>
                          </div>
                          <div>
                            <div className="text-ios-body font-bold text-white">{followingCount}</div>
                            <div className="text-ios-caption-2 text-white/50">Following</div>
                          </div>
                          <div>
                            <div className="text-ios-body font-bold text-white">
                              {usr.score || 0}
                            </div>
                            <div className="text-ios-caption-2 text-white/50">Score</div>
                          </div>
                        </div>

                        {/* Follow Button - Only show if not own profile */}
                        {!isOwnProfile && (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            role="presentation"
                            className="mt-auto"
                          >
                            <Button
                              onClick={() => handleFollow(usr.id)}
                              size="sm"
                              fullWidth
                              variant={isFollowing ? 'secondary' : 'primary'}
                              className={isFollowing ? '!bg-ios-gray-100 !text-ios-gray-700' : '!bg-gradient-to-r !from-ios-blue-500 !to-ios-purple-500'}
                            >
                              {isFollowing ? (
                                <>
                                  <UserCheck size={16} className="mr-2" />
                                  Following
                                </>
                              ) : (
                                <>
                                  <UserPlus size={16} className="mr-2" />
                                  Follow
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                        {isOwnProfile && (
                          <div className="mt-auto pt-ios-2">
                            <Button
                              onClick={() => navigate(`/user/${usr.id}`)}
                              size="sm"
                              fullWidth
                              variant="secondary"
                              className="!bg-white/10 !text-white hover:!bg-white/20"
                            >
                              View Profile
                            </Button>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="crews"
              initial={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(10px)' }}
              transition={{ 
                duration: 0.5, 
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              {/* Create Crew Wizard */}
              <CreateCrewWizard
                isOpen={showCreateCrew}
                onClose={() => {
                  setShowCreateCrew(false);
                }}
                onSuccess={async (crew) => {
                  
                  // Verify creator_id is set
                  if (!(crew as any).creator_id || (crew as any).creator_id !== user?.id) {
                    // Fetch fresh crew data to ensure creator_id is correct
                    const { data: freshCrew } = await supabase
                      .from('clans')
                      .select('*')
                      .eq('id', crew.id)
                      .maybeSingle();
                    
                    if (freshCrew) {
                      crew = freshCrew;
                    }
                  }
                  
                  setCrews((prev) => [crew, ...prev]);
                  
                  // Fetch real member count for the new crew
                  const { count } = await supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('clan_id', crew.id);
                  
                  setCrewMembers(prev => new Map(prev).set(crew.id, count || 0));
                  setJoinedCrews(prev => new Set([...prev, crew.id]));
                  setShowCreateCrew(false);
                  
                  // Small delay to ensure database is updated, then navigate
                  setTimeout(() => {
                  }, 500);
                }}
              />
              
              {/* Create Crew Button */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <Button
                  onClick={() => setShowCreateCrew(true)}
                  className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30"
                >
                  <Crown size={18} className="mr-2" />
                  Build Your Crew
                </Button>
              </motion.div>

              {/* Crew Cards Grid */}
              {filteredCrews.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center min-h-[60vh]"
                >
                  <Card variant="elevated" className="text-center py-12 px-8 max-w-md">
                    <UsersIcon size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-2xl font-bold text-white mb-2 font-heading">
                      {searchQuery ? 'No crews found' : 'No crews yet'}
                    </h3>
                    <p className="text-base text-groovely-dark-text-secondary mb-6">
                      {searchQuery 
                        ? 'Try adjusting your search terms' 
                        : 'Be the first to create a crew and start building your dance crew!'}
                    </p>
                    {!searchQuery && (
                      <Button
                        onClick={() => setShowCreateCrew(true)}
                        className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                      >
                        <Crown size={18} className="mr-2" /> Create First Crew
                      </Button>
                    )}
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  variants={staggerContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {filteredCrews.map((crew) => {
                  const isJoined = joinedCrews.has(crew.id);
                  const members = crewMembers.get(crew.id) || 0;
                  // Calculate rank based on total_score (re-sort crews by score)
                  const sortedByScore = [...filteredCrews].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
                  const rank = sortedByScore.findIndex(c => c.id === crew.id) + 1;
                  // Check if user is the creator or co-founder of this crew
                  const creatorId = (crew as any).creator_id;
                  const coFounders = (crew as any).co_founders || [];
                  const isCreator = user && creatorId && String(creatorId) === String(user.id);
                  const isCoFounder = user && Array.isArray(coFounders) && coFounders.some((cf: string) => String(cf) === String(user.id));
                  const isAdmin = isCreator || isCoFounder;
                  
                  
                  return (
                    <motion.div 
                      key={crew.id} 
                      variants={staggerItemVariants}
                    >
                      <Card
                        variant="elevated"
                        hoverable
                        className="text-center relative cursor-pointer"
                        onClick={() => {
                          if (!crew.id) {
                            console.error('Cannot navigate: crew.id is missing', crew);
                            return;
                          }
                          navigate(`/crew/${crew.id}`);
                        }}
                      >
                        {/* Badges - Top Right */}
                        <div className="absolute top-ios-4 right-ios-4 flex gap-ios-2 z-10">
                          {/* Rank Badge - Only show top 3, but not if user is creator (to avoid duplicate crown) */}
                          {rank <= 3 && !isCreator && (
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
                          {isCreator ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-2 py-1 rounded-full text-xs font-semibold shadow-lg shadow-yellow-500/30 flex items-center gap-1"
                              title="Creator"
                            >
                              <Crown size={12} />
                            </motion.div>
                          ) : isCoFounder ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-gradient-to-r from-groovely-purple-500 to-groovely-pink-500 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg shadow-groovely-purple-500/30 flex items-center gap-1"
                              title="Co-Founder"
                            >
                              <UsersIcon size={12} />
                            </motion.div>
                          ) : isJoined ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-gradient-to-r from-groovely-purple-500/80 to-groovely-peach-500/80 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg"
                              title="Joined"
                            >
                              <CheckCircle size={12} />
                            </motion.div>
                          ) : null}
                        </div>

                        {/* Crew Avatar - Centered */}
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          className="w-20 h-20 mx-auto mb-ios-4 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-groovely-purple-500/30 overflow-hidden border-2 border-groovely-purple-500/30"
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
                            <UsersIcon size={32} className="text-white" />
                          )}
                        </motion.div>

                        {/* Crew Info */}
                        <h3 className="text-ios-headline font-bold text-white mb-ios-1 truncate flex items-center justify-center gap-ios-1 font-heading">
                          {crew.name}
                        </h3>
                        {crew.description && (
                          <p className="text-ios-caption-2 text-white/60 mb-ios-4 px-ios-4 line-clamp-2 min-h-[2.5rem]">
                            {crew.description}
                          </p>
                        )}

                        {/* Stats */}
                        <div className="flex justify-center gap-ios-6 mb-ios-4 pb-ios-4 border-b border-white/10">
                          <div>
                            <div className="text-ios-body font-bold bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                              {crew.total_score?.toLocaleString() || 0}
                            </div>
                            <div className="text-ios-caption-2 text-white/50">Score</div>
                          </div>
                          <div>
                            <div className="text-ios-body font-bold text-white font-heading">{members}</div>
                            <div className="text-ios-caption-2 text-white/50">Members</div>
                          </div>
                          <div>
                            <div className="text-ios-body font-bold text-white font-heading">{rank}</div>
                            <div className="text-ios-caption-2 text-white/50">Rank</div>
                          </div>
                        </div>

                        {/* Action Button - Show Join/Leave for members, View Crew for admins */}
                        {!isAdmin ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            role="presentation"
                          >
                            <Button
                              onClick={() => handleJoinCrew(crew.id)}
                              size="sm"
                              fullWidth
                              variant={isJoined ? 'secondary' : 'primary'}
                              className={
                                isJoined 
                                  ? '!bg-white/10 !text-red-400 hover:!bg-red-500/10 !border-red-500/50 hover:!border-red-500' 
                                  : '!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30'
                              }
                            >
                              {isJoined ? (
                                <>
                                  <UserMinus size={16} className="mr-2" />
                                  Leave
                                </>
                              ) : (
                                <>
                                  <UserPlus size={16} className="mr-2" />
                                  Join
                                </>
                              )}
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
                              {isCreator ? (
                                <>
                                  <Crown size={16} className="mr-2" />
                                  Manage Crew
                                </>
                              ) : (
                                <>
                                  <UsersIcon size={16} className="mr-2" />
                                  View Crew
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Floating action button removed per request to avoid UI interference */}
      
      {/* Confirm Modal */}
      {confirmModalProps && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => {
            setShowConfirmModal(false);
            setConfirmModalProps(null);
          }}
          onConfirm={confirmModalProps.onConfirm}
          title={confirmModalProps.title}
          message={confirmModalProps.message}
          confirmText="Leave & Join"
          cancelText="Cancel"
        />
      )}
    </motion.div>
  );
}
