import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, UserCheck, MessageCircle, Trophy, Target, Crown, Repeat2, Video as VideoIcon, Sparkles, User, Share2, Settings } from 'lucide-react';
import { supabase, Profile, Video, DanceStyle, ensureSupabaseVideoUrl, checkAchievementsSilently } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, LoadingSpinner, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { ViewCount } from '../components/ViewCount';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [reposts, setReposts] = useState<Video[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'videos' | 'reposts'>('videos');
  const [userStyles, setUserStyles] = useState<DanceStyle[]>([]);
  
  useEffect(() => {
    if (!userId) return;
    
    (async () => {
      setLoading(true);
      
      // Fetch user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (profileData) {
        setProfile(profileData);
        
        // Fetch real follow stats
        const [followersRes, followingRes] = await Promise.all([
          supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
          supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId),
        ]);
        
        setFollowerCount(followersRes.count || 0);
        setFollowingCount(followingRes.count || 0);
        
        // Check if current user is following this user
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: followData } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId)
            .maybeSingle();
          
          setIsFollowing(!!followData);
        }
      }
      
      // Fetch user videos (exclude draft attempts)
      const { data: allVideos } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (allVideos) {
        // Filter out draft attempts - only show published attempts
        const attemptVideos = allVideos.filter(v => v.kind === 'attempt');
        const nonAttemptVideos = allVideos.filter(v => v.kind !== 'attempt');
        
        if (attemptVideos.length > 0) {
          const attemptRoutineIds = [...new Set(attemptVideos.map(v => v.routine_id).filter(Boolean))];
          
          // Get published attempts
          const { data: publishedAttempts } = await supabase
            .from('attempts')
            .select('routine_id, video_url')
            .eq('user_id', userId)
            .eq('status', 'published')
            .in('routine_id', attemptRoutineIds);
          
          // Create set of published attempt keys
          const publishedKeys = new Set<string>();
          publishedAttempts?.forEach((a: any) => {
            if (a.routine_id && a.video_url) {
              publishedKeys.add(`${a.routine_id}:${a.video_url}`);
            }
          });
          
          // Filter to only published attempt videos
          const publishedAttemptVideos = attemptVideos.filter(v => {
            if (!v.routine_id || !v.video_url) return false;
            const key = `${v.routine_id}:${v.video_url}`;
            return publishedKeys.has(key);
          });
          
          // Combine non-attempt videos with published attempt videos
          const filteredVideos = [...nonAttemptVideos, ...publishedAttemptVideos]
            .sort((a, b) => {
              const dateA = new Date(a.created_at || 0).getTime();
              const dateB = new Date(b.created_at || 0).getTime();
              return dateB - dateA;
            });
          
          setVideos(filteredVideos);
        } else {
          setVideos(allVideos);
        }
      }

        const { data: repostData } = await supabase
          .from('video_reposts')
          .select('video:video_id(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (repostData) {
          setReposts(
            (repostData as any[])
              .map((row) => row.video)
              .filter(Boolean) as Video[]
          );
        }

        const { data: styles } = await supabase
          .from('user_dance_styles')
          .select('dance_styles(*)')
          .eq('user_id', userId);

        if (styles) {
          setUserStyles(
            (styles as any[])
              .map((row) => row.dance_styles)
              .filter(Boolean) as DanceStyle[]
          );
      }
      
      // Refresh follow counts after loading
      if (profileData) {
        const [followersRes, followingRes] = await Promise.all([
          supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
          supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId),
        ]);
        
        setFollowerCount(followersRes.count || 0);
        setFollowingCount(followingRes.count || 0);
      }
      
      setLoading(false);
    })();
  }, [userId]);

  const handleFollow = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || !userId) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    if (isFollowing) {
      // Unfollow
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', userId);

      if (!error) {
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
      }
    } else {
      // Follow
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: currentUser.id,
          following_id: userId,
        });

      if (!error) {
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        
        // Check for achievements
        await checkAchievementsSilently(currentUser.id);

        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (e) {
          // Haptics not available
        }
      }
    }
  };



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-groovely-dark-bg">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-groovely-dark-bg px-6">
        <Card variant="glass" className="text-center py-12 backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-white mb-2 font-heading">User Not Found</h2>
          <p className="text-base text-groovely-dark-text-secondary mb-6">This dancer doesn't exist or has been removed.</p>
          <Button onClick={() => navigate(-1)} className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500">Go Back</Button>
        </Card>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      {/* Header */}
      <PageHeader
        title={profile.display_name || profile.username}
        subtitle={`@${profile.username}`}
        icon={<User size={32} className="text-white/90" />}
        bottomPadding="xl"
        maxWidth="4xl"
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

      <div className="max-w-4xl mx-auto px-6 pt-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          variants={staggerContainerVariants}
        >
          <Card variant="glass" className="mb-6 backdrop-blur-xl">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-6">
              {/* Avatar */}
              <motion.div
                className="relative"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <div className={`w-24 h-24 rounded-full overflow-hidden flex-shrink-0 shadow-lg shadow-groovely-pink-500/30 ${
                  !profile.avatar_url ? 'bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500' : 'bg-groovely-dark-surface'
                }`}>
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-3xl">
                      {profile.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* User Info */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold text-white font-heading mb-1">
                  {profile.display_name || profile.username}
                </h2>
                <p className="text-base text-groovely-dark-text-secondary mb-2">@{profile.username}</p>
                {profile.bio && (
                  <p className="text-sm text-groovely-dark-text-tertiary max-w-md mx-auto md:mx-0">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { 
                  icon: Trophy, 
                  value: (profile.score || 0).toLocaleString(), 
                  label: 'Total Score', 
                  description: 'Sum of attempts', 
                  gradient: 'from-groovely-peach-500 to-groovely-pink-500',
                  bgGradient: 'from-groovely-peach-500/10 to-groovely-pink-500/10',
                  borderColor: 'border-groovely-peach-500/20',
                  shadowColor: 'hover:shadow-groovely-peach-500/20',
                  onClick: undefined 
                },
                { 
                  icon: Settings, 
                  value: profile.rank || 'Bronze', 
                  label: 'Rank', 
                  description: 'Competitive tier', 
                  gradient: 'from-groovely-pink-500 to-groovely-purple-500',
                  bgGradient: 'from-groovely-pink-500/10 to-groovely-purple-500/10',
                  borderColor: 'border-groovely-pink-500/20',
                  shadowColor: 'hover:shadow-groovely-pink-500/20',
                  onClick: undefined 
                },
                {
                  icon: UserPlus,
                  value: followerCount,
                  label: 'Followers',
                  description: 'Community',
                  gradient: 'from-groovely-purple-500 to-groovely-peach-500',
                  bgGradient: 'from-groovely-purple-500/10 to-groovely-peach-500/10',
                  borderColor: 'border-groovely-purple-500/20',
                  shadowColor: 'hover:shadow-groovely-purple-500/20',
                  onClick: () => navigate(`/profile/follows?tab=followers&userId=${userId}`),
                },
              ].map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={staggerItemVariants}
                    custom={index}
                    initial="initial"
                    animate="animate"
                  >
                    <motion.div
                      className={`relative p-5 rounded-2xl bg-gradient-to-br ${stat.bgGradient} border ${stat.borderColor} backdrop-blur-sm ${stat.onClick ? 'cursor-pointer' : ''} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${stat.shadowColor}`}
                      onClick={stat.onClick}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <motion.div
                          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg`}
                          whileHover={{ rotate: 5, scale: 1.1 }}
                          transition={{ type: 'spring', stiffness: 400 }}
                        >
                          <Icon className="text-white" size={20} />
                        </motion.div>
                      </div>
                      <motion.div
                        className="text-2xl font-bold text-white font-heading mb-1"
                        key={`${stat.label}-${stat.value}`}
                        initial={{ scale: 1.1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', delay: index * 0.1 }}
                      >
                        {stat.value}
                      </motion.div>
                      <div className="text-sm font-semibold text-white/90 mb-1">{stat.label}</div>
                      {stat.description && (
                        <div className="text-xs text-white/60">{stat.description}</div>
                      )}
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>

            {/* Action Buttons */}
            {!isOwnProfile && (
              <div className="flex gap-3 justify-center flex-wrap">
                <Button
                  onClick={handleFollow}
                  variant={isFollowing ? 'secondary' : 'primary'}
                  className={isFollowing 
                    ? '!bg-groovely-dark-surface/60 !text-groovely-dark-text-secondary hover:!bg-groovely-dark-surface/80 border border-groovely-dark-border' 
                    : '!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30'
                  }
                >
                  {isFollowing ? <UserCheck size={18} className="mr-2" /> : <UserPlus size={18} className="mr-2" />}
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Arena & Dance Styles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card variant="glass" className="mb-6 backdrop-blur-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-3 p-4 bg-groovely-dark-surface/40 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 flex items-center justify-center shadow-md">
                  <Crown size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-xs text-groovely-dark-text-tertiary uppercase">Current Arena</div>
                  <div className="text-lg font-bold text-white font-heading">{profile.rank || 'Studio 1'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-groovely-dark-surface/40 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center shadow-md">
                  <Target size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-xs text-groovely-dark-text-tertiary uppercase">Total Attempts</div>
                  <div className="text-lg font-bold text-white font-heading">{videos.length}</div>
                </div>
              </div>
            </div>

            {/* Dance Styles */}
            {userStyles.length > 0 && (
              <div>
                <div className="text-sm font-medium text-groovely-dark-text-secondary mb-3">Dance Styles</div>
                <div className="flex flex-wrap gap-2">
                  {userStyles.map((style) => (
                    <motion.span
                      key={style.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-4 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white rounded-full text-xs font-semibold uppercase shadow-md"
                    >
                      {style.name}
                    </motion.span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <Card variant="glass" padding="sm" className="backdrop-blur-xl">
            <div className="flex gap-2">
              {[
                { id: 'videos' as const, label: 'Videos', icon: VideoIcon },
                { id: 'reposts' as const, label: 'Reposts', icon: Repeat2 },
              ].map((tabItem) => {
                const Icon = tabItem.icon;
                const isActive = activeTab === tabItem.id;
                return (
                  <motion.button
                    key={tabItem.id}
                    onClick={async () => {
                      try {
                        await Haptics.impact({ style: ImpactStyle.Light });
                      } catch (e) {
                        // Haptics not available
                      }
                      setActiveTab(tabItem.id);
                    }}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.01 }}
                    transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                      isActive ? 'text-white' : 'text-groovely-dark-text-secondary hover:bg-groovely-dark-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="userProfileTab"
                        className="absolute inset-0 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 rounded-lg z-0 shadow-md shadow-groovely-peach-500/30"
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
                    <span className="relative z-10">{tabItem.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'videos' ? (
            <motion.div
              key="videos"
              variants={staggerContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {videos.length === 0 ? (
                <div className="col-span-full">
                  <Card variant="glass" className="text-center py-12 backdrop-blur-xl">
                    <VideoIcon size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-xl font-bold text-white mb-2 font-heading">No videos yet</h3>
                    <p className="text-base text-groovely-dark-text-secondary">This dancer hasn't shared any videos</p>
                  </Card>
                </div>
              ) : (
                videos.map((video) => (
                  <motion.div key={video.id} variants={staggerItemVariants}>
                    <Card 
                      variant="glass" 
                      padding="none" 
                      hoverable
                      className="overflow-hidden cursor-pointer backdrop-blur-xl"
                      onClick={() => navigate(`/video/${video.id}`)}
                    >
                      <div className="relative">
                        {ensureSupabaseVideoUrl(video.video_url) ? (
                          <video
                            src={ensureSupabaseVideoUrl(video.video_url) || ''}
                            className="w-full aspect-video bg-black object-cover"
                            controls
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="w-full aspect-video bg-black flex items-center justify-center text-white text-sm">
                            Video unavailable
                          </div>
                        )}
                        {video.ai_score !== null && video.ai_score !== undefined && (
                          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-lg px-2 py-1 z-10">
                            <div className="flex items-center gap-1 text-white text-xs">
                              <Sparkles size={12} className="text-yellow-400" />
                              <span className="font-bold">{video.ai_score.toFixed(0)}/100</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h4 className="text-base font-semibold text-white truncate mb-1">
                          {video.title}
                        </h4>
                        {video.description && (
                          <p className="text-sm text-groovely-dark-text-secondary line-clamp-2 mb-2">
                            {video.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-groovely-dark-text-tertiary">
                            Posted {new Date(video.created_at).toLocaleDateString()}
                          </div>
                          <ViewCount count={video.views || 0} size="sm" className="text-groovely-dark-text-tertiary" />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key="reposts"
              variants={staggerContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {reposts.length === 0 ? (
                <div className="col-span-full">
                  <Card variant="glass" className="text-center py-12 backdrop-blur-xl">
                    <Repeat2 size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                    <h3 className="text-xl font-bold text-white mb-2 font-heading">No reposts yet</h3>
                    <p className="text-base text-groovely-dark-text-secondary">This dancer hasn't reposted any videos</p>
                  </Card>
                </div>
              ) : (
                reposts.map((video) => (
                  <motion.div key={video.id} variants={staggerItemVariants}>
                    <Card 
                      variant="glass" 
                      padding="none" 
                      hoverable
                      className="overflow-hidden cursor-pointer backdrop-blur-xl"
                      onClick={() => navigate(`/video/${video.id}`)}
                    >
                      {ensureSupabaseVideoUrl(video.video_url) ? (
                        <video
                          src={ensureSupabaseVideoUrl(video.video_url) || ''}
                          className="w-full aspect-video bg-black object-cover"
                          controls
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="w-full aspect-video bg-black flex items-center justify-center text-white text-sm">
                          Video unavailable
                        </div>
                      )}
                      <div className="p-3">
                        <h4 className="text-base font-semibold text-white truncate mb-1">
                          {video.title}
                        </h4>
                        {video.description && (
                          <p className="text-sm text-groovely-dark-text-secondary line-clamp-2 mb-2">
                            {video.description}
                          </p>
                        )}
                        <div className="text-xs text-groovely-dark-text-tertiary">
                          Reposted {new Date(video.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

