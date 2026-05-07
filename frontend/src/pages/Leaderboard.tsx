import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Music2, Users, Crown, Medal, Star } from 'lucide-react';
import { supabase, Profile, Routine } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, LoadingSpinner, PageHeader } from '../components/ios';
import { staggerContainerVariants, staggerItemVariants } from '../animations';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type Tab = 'songs' | 'solo' | 'clans';
type Window = 'week' | 'month' | 'all';

export function Leaderboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('solo');
  const [win, setWin] = useState<Window>('all');
  const [isMounted, setIsMounted] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    // Load from cache on mount for instant display
    try {
      const cached = sessionStorage.getItem('leaderboard_profiles');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [routines, setRoutines] = useState<Routine[]>(() => {
    try {
      const cached = sessionStorage.getItem('leaderboard_routines');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [clans, setClans] = useState<any[]>(() => {
    try {
      const cached = sessionStorage.getItem('leaderboard_clans');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);

  // Synchronized page mount - matches Explore.tsx timing
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
    let cancel = false;
    (async () => {
      // Check if we have cached data for current tab (using current state values)
      // We intentionally don't include profiles/routines/crews in deps to avoid re-fetching
      // when data updates - we only want to check on mount/tab change
      const hasCachedData = 
        (tab === 'solo' && profiles.length > 0) ||
        (tab === 'songs' && routines.length > 0) ||
        (tab === 'clans' && clans.length > 0);
      
      // Only show loading if we don't have cached data to display
      if (!hasCachedData) {
        setLoading(true);
      }

      try {
        if (tab === 'solo') {
            const q = supabase.from('profiles').select('*').order('score', { ascending: false }).limit(50);
            const { data, error } = await q;
            if (!cancel) {
              if (error) {
                console.error('Failed to load profiles:', error);
                setLoading(false);
              } else if (data) {
                setProfiles(data);
                // Cache the data
                try {
                  sessionStorage.setItem('leaderboard_profiles', JSON.stringify(data));
                } catch (e) {
                  // Storage might be full or unavailable
                }
                setLoading(false);
              } else {
                setLoading(false);
            }
          }
        } else if (tab === 'songs') {
          const q = supabase
            .from('routines')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
          const { data, error } = await q;
          if (!cancel) {
            if (error) {
              console.error('Failed to load routines:', error);
              setLoading(false);
            } else if (data) {
              setRoutines(data);
              try {
                sessionStorage.setItem('leaderboard_routines', JSON.stringify(data));
              } catch (e) {
                // Storage might be full or unavailable
              }
              setLoading(false);
            } else {
              setLoading(false);
            }
          }
        } else {
          // Fetch crews and calculate accurate total scores
          const { data, error } = await supabase
            .from('clans')
            .select('*')
            .order('total_score', { ascending: false })
            .limit(50);
          
          if (!cancel) {
            if (error) {
              console.error('Failed to load clans:', error);
              setLoading(false);
            } else if (data) {
              // Calculate accurate total scores for each crew (sum of all member scores)
              const crewsWithAccurateScores = await Promise.all(
                data.map(async (crew) => {
                  try {
                    // Get all members of this crew
                    const { data: memberProfiles } = await supabase
                      .from('profiles')
                      .select('score')
                      .eq('clan_id', crew.id);
                    
                    // Calculate total score as sum of all member scores
                    const calculatedTotalScore = memberProfiles?.reduce((sum, p) => sum + (p.score || 0), 0) || 0;
                    
                    // Update database if score doesn't match (background update)
                    if (crew.total_score !== calculatedTotalScore) {
                      supabase
                        .from('clans')
                        .update({ total_score: calculatedTotalScore })
                        .eq('id', crew.id)
                        .then(({ error: updateError }) => {
                          if (updateError) {
                          }
                        });
                    }
                    
                    // Return crew with calculated score
                    return {
                      ...crew,
                      total_score: calculatedTotalScore
                    };
                  } catch (err) {
                    // Return crew with existing score if calculation fails
                    return crew;
                  }
                })
              );
              
              // Sort by calculated total_score (descending)
              const sortedCrews = crewsWithAccurateScores.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
              
              setClans(sortedCrews);
              try {
                sessionStorage.setItem('leaderboard_clans', JSON.stringify(sortedCrews));
              } catch (e) {
                // Storage might be full or unavailable
              }
              setLoading(false);
            } else {
              setLoading(false);
            }
          }
        }
      } catch (err) {
        if (!cancel) {
          console.error('Unexpected error loading leaderboard data:', err);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [tab]); // Re-fetch when tab changes

  const handleWindowChange = async (newWin: Window) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setWin(newWin);
  };

  const handleTabChange = async (newTab: Tab) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    setTab(newTab);
  };

  // Rank badge function - matches CrewDetail.tsx exactly for consistency
  const getRankBadge = (rank: number) => {
    if (rank === 1) return { icon: Crown, color: 'from-yellow-400 to-yellow-600', glow: 'shadow-[0_0_20px_rgba(250,204,21,0.5)]' };
    if (rank === 2) return { icon: Medal, color: 'from-gray-300 to-gray-500', glow: 'shadow-[0_0_15px_rgba(156,163,175,0.5)]' };
    if (rank === 3) return { icon: Medal, color: 'from-orange-400 to-orange-600', glow: 'shadow-[0_0_15px_rgba(251,146,60,0.5)]' };
    return { icon: Star, color: 'from-groovely-purple-500 to-groovely-peach-500', glow: '' };
  };

  const handleUserClick = async (userId: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }
    navigate(`/user/${userId}`);
  };

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
          title="Leaderboard"
          subtitle="SEE WHERE YOU RANK"
          icon={<Trophy size={32} className="text-white/90" />}
          bottomPadding="md"
          maxWidth="4xl"
        >
        <div className="flex gap-2">
          {/* Time Window Selector */}
            {(['week', 'month', 'all'] as Window[]).map((w) => (
              <motion.button
                key={w}
                onClick={() => handleWindowChange(w)}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={`relative px-4 py-2 rounded-full font-medium text-base transition-all duration-300 ${
                  win === w
                    ? 'bg-white text-groovely-peach-600 shadow-lg font-semibold z-10'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                <span className="relative z-10">{w === 'all' ? 'All-time' : w[0].toUpperCase() + w.slice(1)}</span>
              </motion.button>
            ))}
        </div>
      </PageHeader>
      </motion.div>

      <motion.div 
        className="max-w-4xl mx-auto px-6 pt-6 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={isMounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ 
          duration: 0.5, 
          delay: isMounted ? 0.15 : 0, 
          ease: [0.16, 1, 0.3, 1] 
        }}
      >
        {/* Tab Selector */}
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
          <Card variant="elevated" padding="sm">
            <div className="flex gap-2">
              {[
                { id: 'solo' as const, label: 'Solo', icon: Crown },
                { id: 'songs' as const, label: 'Songs', icon: Music2 },
                { id: 'clans' as const, label: 'Dance Crews', icon: Users },
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
                    className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                      isActive ? 'text-white' : 'text-groovely-dark-text-secondary hover:bg-groovely-dark-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeLeaderboardTab"
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
                    <Icon size={18} className="relative z-10" />
                    <span className="relative z-10">{tabItem.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Content */}
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex justify-center py-20"
          >
            <LoadingSpinner size="lg" />
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {tab === 'solo' ? (
              <motion.div
                key="solo"
                variants={staggerContainerVariants}
                initial="initial"
                animate={isMounted ? "animate" : "initial"}
                exit="exit"
                transition={{ 
                  delayChildren: isMounted ? 0.95 : 0,
                  staggerChildren: 0.05
                }}
                className="w-full relative z-10"
                style={{ willChange: 'transform, opacity' }}
              >
                <Card variant="elevated" padding="none">
                  {profiles.map((p, i) => {
                    const badge = getRankBadge(i);
                    const Icon = badge.icon;
                    return (
                      <motion.div
                        key={p.id}
                        variants={{
                          ...staggerItemVariants,
                          initial: {
                            opacity: 0,
                            y: 10,
                            scale: 0.98,
                          },
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        onClick={() => handleUserClick(p.id)}
                        className="flex items-center justify-between p-4 border-b border-groovely-dark-border last:border-b-0 hover:bg-groovely-dark-surface transition-colors duration-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          {/* Rank Badge */}
                          <motion.div
                            whileHover={i < 3 ? { scale: 1.1, rotate: 5 } : {}}
                            className={`w-10 h-10 bg-gradient-to-br ${badge.color} rounded-lg flex items-center justify-center ${badge.glow} transition-all duration-300`}
                          >
                            {i < 3 ? (
                              <Icon size={20} className="text-white" />
                            ) : (
                              <span className="text-base font-bold text-white">{i + 1}</span>
                            )}
                          </motion.div>

                          {/* Avatar */}
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0 shadow-md bg-groovely-dark-surface"
                          >
                            <img
                              src={p.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p.username}`}
                              className="w-full h-full object-cover"
                              alt={p.username}
                              loading="lazy"
                            />
                          </motion.div>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-semibold text-white truncate font-heading">
                              {p.display_name || p.username}
                            </div>
                            <div className="text-sm text-groovely-dark-text-tertiary">@{p.username}</div>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right ml-4">
                          <div className="text-xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                            {p.score?.toLocaleString() || 0}
                          </div>
                          <div className="text-xs text-groovely-dark-text-tertiary">{p.rank || 'N/A'}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </Card>
              </motion.div>
            ) : tab === 'songs' ? (
              <motion.div
                key="songs"
                variants={staggerContainerVariants}
                initial="initial"
                animate={isMounted ? "animate" : "initial"}
                exit="exit"
                transition={{ 
                  delayChildren: isMounted ? 0.95 : 0,
                  staggerChildren: 0.05
                }}
                className="grid sm:grid-cols-2 gap-4 relative z-10"
                style={{ willChange: 'transform, opacity' }}
              >
                {routines.map((r) => (
                  <motion.div 
                    key={r.id} 
                    variants={{
                      ...staggerItemVariants,
                      initial: {
                        opacity: 0,
                        y: 10,
                        scale: 0.98,
                      },
                    }}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Card variant="elevated" hoverable>
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-bold text-white font-heading">{r.title}</h3>
                        <Music2 size={20} className="text-groovely-purple-500 flex-shrink-0" />
                      </div>
                      <p className="text-sm text-groovely-dark-text-tertiary mb-4">
                        Routine ID: {r.id}
                      </p>
                      <div className="flex items-center gap-2 text-base text-groovely-dark-text-secondary">
                        <Trophy className="text-groovely-peach-500" size={16} />
                        <span>Top scores tracked</span>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="clans"
                variants={staggerContainerVariants}
                initial="initial"
                animate={isMounted ? "animate" : "initial"}
                exit="exit"
                transition={{ 
                  delayChildren: isMounted ? 0.95 : 0,
                  staggerChildren: 0.05
                }}
                className="w-full relative z-10"
                style={{ willChange: 'transform, opacity' }}
              >
                <Card variant="elevated" padding="none">
                  {clans.map((c, i) => {
                    const rank = i + 1; // Rank is 1-indexed
                    const badge = getRankBadge(rank);
                    const Icon = badge.icon;
                    return (
                      <motion.div
                        key={c.id}
                        variants={{
                          ...staggerItemVariants,
                          initial: {
                            opacity: 0,
                            y: 10,
                            scale: 0.98,
                          },
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex items-center justify-between p-4 border-b border-groovely-dark-border last:border-b-0 hover:bg-groovely-dark-surface transition-colors duration-200 cursor-pointer"
                        onClick={() => navigate(`/crew/${c.id}`)}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          {/* Rank Badge - matches CrewDetail.tsx styling exactly */}
                          <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ 
                              type: 'spring', 
                              stiffness: 300, 
                              damping: 20,
                              delay: i * 0.05
                            }}
                            whileHover={rank <= 3 ? { scale: 1.1, rotate: 5 } : {}}
                            className={`w-10 h-10 bg-gradient-to-br ${badge.color} rounded-lg flex items-center justify-center ${badge.glow} transition-all duration-300`}
                          >
                            {rank <= 3 ? (
                              <Icon size={20} className="text-white" />
                            ) : (
                              <span className="text-base font-bold text-white">{rank}</span>
                            )}
                          </motion.div>

                          {/* Crew Avatar - matches Explore.tsx styling */}
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            className="h-12 w-12 rounded-2xl overflow-hidden flex-shrink-0 shadow-md bg-groovely-dark-surface border-2 border-groovely-dark-border"
                          >
                            {c.avatar_url && c.avatar_url.trim() !== '' ? (
                              <img
                                src={c.avatar_url}
                                className="w-full h-full object-cover"
                                alt={c.name}
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent && !parent.querySelector('.fallback-icon')) {
                                    const fallback = document.createElement('div');
                                    fallback.className = 'fallback-icon w-full h-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center';
                                    fallback.innerHTML = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;
                                    parent.appendChild(fallback);
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center">
                                <Users size={20} className="text-white" />
                              </div>
                            )}
                          </motion.div>

                          {/* Crew Name */}
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-semibold text-white truncate font-heading">
                              {c.name}
                            </div>
                            <div className="text-sm text-groovely-dark-text-tertiary">Dance Crew</div>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right ml-4">
                          <div className="text-xl font-bold bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 bg-clip-text text-transparent font-heading">
                            {c.total_score?.toLocaleString() || 0}
                          </div>
                          <div className="text-xs text-groovely-dark-text-tertiary">Total Score</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}
