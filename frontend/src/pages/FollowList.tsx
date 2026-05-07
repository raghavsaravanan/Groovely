import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, UserCheck, Search, Users } from 'lucide-react';
import { supabase, Profile, checkAchievementsSilently } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, LoadingSpinner, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export function FollowList() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'followers' | 'following') || 'followers';
  const targetUserIdFromQuery = searchParams.get('userId');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Map<string, number>>(new Map());
  const [followingCounts, setFollowingCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMounted, setIsMounted] = useState(false);

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

  // Fetch follow counts for each user
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

  useEffect(() => {
    const targetUserId = targetUserIdFromQuery || user?.id;
    if (!targetUserId) return;
    
    (async () => {
      setLoading(true);
      
      // Fetch followers (users who follow the target user)
      const { data: followersData } = await supabase
        .from('follows')
        .select('follower_id, profiles!follows_follower_id_fkey(*)')
        .eq('following_id', targetUserId);
      
      if (followersData) {
        const followerProfiles = followersData
          .map((f: any) => f.profiles)
          .filter(Boolean) as Profile[];
        setFollowers(followerProfiles);
        
        // Fetch follow counts for each follower
        const countsMap = new Map<string, number>();
        const followingMap = new Map<string, number>();
        for (const follower of followerProfiles) {
          const counts = await fetchFollowCounts(follower.id);
          countsMap.set(follower.id, counts.followers);
          followingMap.set(follower.id, counts.following);
        }
        setFollowerCounts(countsMap);
        setFollowingCounts(followingMap);
      }
      
      // Fetch following (users the target user follows)
      const { data: followingData } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(*)')
        .eq('follower_id', targetUserId);
      
      if (followingData) {
        const followingProfiles = followingData
          .map((f: any) => f.profiles)
          .filter(Boolean) as Profile[];
        setFollowing(followingProfiles);
        
        const followingIds = new Set(followingProfiles.map(p => p.id));
        setFollowingSet(followingIds);
        
        // Fetch follow counts for each following user
        const countsMap = new Map<string, number>();
        const followingMap = new Map<string, number>();
        for (const followingUser of followingProfiles) {
          const counts = await fetchFollowCounts(followingUser.id);
          countsMap.set(followingUser.id, counts.followers);
          followingMap.set(followingUser.id, counts.following);
        }
        setFollowerCounts(prev => {
          const newMap = new Map(prev);
          countsMap.forEach((v, k) => newMap.set(k, v));
          return newMap;
        });
        setFollowingCounts(prev => {
          const newMap = new Map(prev);
          followingMap.forEach((v, k) => newMap.set(k, v));
          return newMap;
        });
      }
      
      setLoading(false);
    })();
  }, [user]);

  const handleFollow = async (userId: string) => {
    if (!user) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    const isFollowing = followingSet.has(userId);
    
    if (isFollowing) {
      // Unfollow
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      if (!error) {
        setFollowingSet(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        setFollowing(prev => prev.filter(p => p.id !== userId));
        
        // Update follower count for the user we unfollowed
        setFollowerCounts(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(userId) || 0;
          newMap.set(userId, Math.max(0, current - 1));
          return newMap;
        });
        
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {
          // Haptics not available
        }
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
        setFollowingSet(prev => {
          const newSet = new Set(prev);
          newSet.add(userId);
          return newSet;
        });
        
        // Update follower count for the user we followed
        setFollowerCounts(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(userId) || 0;
          newMap.set(userId, current + 1);
          return newMap;
        });
        
        // Fetch the user profile to add to following list
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (profile) {
          setFollowing(prev => {
            if (prev.find(p => p.id === userId)) return prev;
            return [...prev, profile];
          });
          
          // Fetch follow counts for the new user
          const counts = await fetchFollowCounts(userId);
          setFollowerCounts(prev => new Map(prev).set(userId, counts.followers));
          setFollowingCounts(prev => new Map(prev).set(userId, counts.following));
        }
        
        // Check for achievements
        await checkAchievementsSilently(user.id);
        
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {
          // Haptics not available
        }
      }
    }
  };

  const handleTabChange = async (tab: 'followers' | 'following') => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setActiveTab(tab);
    setSearchQuery('');
  };

  const filteredUsers = (activeTab === 'followers' ? followers : following).filter((u) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          title="Connections"
          subtitle="YOUR DANCE COMMUNITY"
          icon={<Users size={32} className="text-white/90" />}
          bottomPadding="xl"
          action={
            <motion.button
              onClick={() => navigate(-1)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
            >
              <ArrowLeft size={24} className="text-white" />
            </motion.button>
          }
        />
      </motion.div>

      <motion.div 
        className="max-w-2xl mx-auto px-ios-4 pt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ 
          duration: 0.5, 
          delay: isMounted ? 0.15 : 0, 
          ease: [0.16, 1, 0.3, 1] 
        }}
      >
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.2 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="mb-6"
        >
          <Card variant="elevated" className="backdrop-blur-xl">
            <div className="flex items-center justify-around p-4">
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-pink-500 bg-clip-text text-transparent font-heading">
                  {followers.length}
                </div>
                <div className="text-sm text-groovely-dark-text-secondary mt-1">Followers</div>
              </div>
              <div className="h-12 w-px bg-groovely-dark-border" />
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-groovely-pink-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                  {following.length}
                </div>
                <div className="text-sm text-groovely-dark-text-secondary mt-1">Following</div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.25 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="relative mb-ios-4"
        >
          <Search className="absolute left-ios-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="Search dancers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-ios-12 pr-ios-4 py-3 bg-groovely-dark-card border border-groovely-dark-border rounded-full text-base text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
          />
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ 
            duration: 0.5, 
            delay: isMounted ? 0.3 : 0, 
            ease: [0.16, 1, 0.3, 1] 
          }}
          className="flex gap-ios-2 mb-ios-6"
        >
          {[
            { id: 'followers' as const, label: 'Followers', count: followers.length },
            { id: 'following' as const, label: 'Following', count: following.length },
          ].map((tab) => {
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
                    layoutId="followListTab"
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
                <span className="relative z-10">{tab.label}</span>
                <span className="relative z-10 opacity-70">({tab.count})</span>
              </motion.button>
            );
          })}
        </motion.div>

        {/* User List */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.35 : 0
              }}
              className="flex justify-center py-12"
            >
              <LoadingSpinner size="lg" />
            </motion.div>
          ) : filteredUsers.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                delay: isMounted ? 0.35 : 0
              }}
            >
              <Card variant="elevated" className="text-center py-12 backdrop-blur-xl">
                <Users size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                <h3 className="text-xl font-bold text-white mb-2 font-heading">
                  {searchQuery ? 'No dancers found' : `No ${activeTab} yet`}
                </h3>
                <p className="text-base text-groovely-dark-text-secondary mb-6">
                  {searchQuery 
                    ? 'Try a different search term' 
                    : activeTab === 'followers'
                    ? 'Share your dance moves to gain followers!'
                    : 'Start following dancers to see them here'}
                </p>
                {!searchQuery && activeTab === 'following' && (
                  <Button 
                    onClick={() => navigate('/explore?tab=users')} 
                    className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                  >
                    Explore Dancers
                  </Button>
                )}
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              variants={staggerContainerVariants}
              initial="initial"
              animate={isMounted ? "animate" : "initial"}
              className="space-y-ios-3"
            >
              {filteredUsers.map((usr) => {
                const isFollowing = followingSet.has(usr.id);
                const followers = followerCounts.get(usr.id) || 0;
                const following = followingCounts.get(usr.id) || 0;
                
                return (
                  <motion.div key={usr.id} variants={staggerItemVariants}>
                    <Card 
                      variant="elevated" 
                      hoverable 
                      className="flex items-center gap-ios-4 backdrop-blur-xl"
                    >
                      {/* Avatar */}
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        onClick={() => navigate(`/user/${usr.id}`)}
                        className="w-14 h-14 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-groovely-peach-500/30 cursor-pointer flex-shrink-0"
                      >
                        {usr.avatar_url ? (
                          <img src={usr.avatar_url} alt={usr.username} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          usr.username?.[0]?.toUpperCase() || '?'
                        )}
                      </motion.div>

                      {/* User Info */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/user/${usr.id}`)}
                      >
                        <h3 className="text-base font-bold text-white truncate font-heading">
                          {usr.display_name || usr.username}
                        </h3>
                        <p className="text-sm text-groovely-dark-text-secondary truncate">@{usr.username}</p>
                        {usr.bio && (
                          <p className="text-xs text-groovely-dark-text-tertiary truncate mt-1">{usr.bio}</p>
                        )}
                        {/* Stats */}
                        <div className="flex items-center gap-4 mt-2">
                          <div className="text-xs text-groovely-dark-text-tertiary">
                            <span className="font-semibold text-white">{followers}</span> followers
                          </div>
                          <div className="text-xs text-groovely-dark-text-tertiary">
                            <span className="font-semibold text-white">{following}</span> following
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex gap-ios-2 flex-shrink-0">
                        <Button
                          onClick={() => {
                            handleFollow(usr.id);
                          }}
                          size="sm"
                          variant={isFollowing ? 'secondary' : 'primary'}
                          className={
                            isFollowing 
                              ? '!bg-white/10 !text-white hover:!bg-white/20 !border-white/10' 
                              : '!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500'
                          }
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck size={16} className="mr-1.5" />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus size={16} className="mr-1.5" />
                              Follow
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
