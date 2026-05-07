import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Video as VideoIcon } from 'lucide-react';
import { supabase, Video } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { VideoFeedItem } from '../components/VideoFeedItem';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ios';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function VideoFeed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const isFirstRender = useRef(true);

  // Snap scrolling state/refs
  const snapContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<HTMLDivElement[]>([]);
  const isProgrammaticScroll = useRef(false);
  const animatingRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const lastKeyTsRef = useRef(0);
  const activeIndexRef = useRef(0);
  const headerRef = useRef<HTMLDivElement | null>(null);

  // Initialize page on mount
  useEffect(() => {
    // Reset scroll position immediately for seamless transitions
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
          setTimeout(() => {
            isFirstRender.current = false;
          }, 600);
        }, 50);
      });
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      setIsMounted(false);
    };
  }, []);

  // Fetch videos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only show loading if we don't have videos yet
      if (videos.length === 0) {
        setLoading(true);
      }

      // Fetch all videos
      const { data: allVideos } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!cancelled && allVideos) {
        // Get all attempt videos (kind='attempt')
        const attemptVideos = allVideos.filter(v => v.kind === 'attempt');
        
        // Get routine IDs and video URLs from attempt videos
        const attemptRoutineIds = [...new Set(attemptVideos.map(v => v.routine_id).filter(Boolean))];
        const attemptVideoUrls = attemptVideos.map(v => v.video_url).filter(Boolean);
        
        // Fetch published attempts to identify which videos should be shown
        if (attemptRoutineIds.length > 0 && attemptVideoUrls.length > 0) {
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
          const publishedAttemptVideos = attemptVideos.filter(v => {
            if (!v.routine_id || !v.user_id || !v.video_url) return false;
            const key = `${v.routine_id}:${v.user_id}:${v.video_url}`;
            return publishedKeys.has(key);
          });
          
          // Combine non-attempt videos with published attempt videos
          const nonAttemptVideos = allVideos.filter(v => v.kind !== 'attempt' || !v.kind);
          const filteredVideos = [...nonAttemptVideos, ...publishedAttemptVideos]
            .sort((a, b) => {
              const dateA = new Date(a.created_at || 0).getTime();
              const dateB = new Date(b.created_at || 0).getTime();
              return dateB - dateA;
            });
          
          setVideos(filteredVideos);
        } else {
          // No attempt videos, just set all videos (excluding draft attempts)
          const nonAttemptVideos = allVideos.filter(v => v.kind !== 'attempt' || !v.kind);
          setVideos(nonAttemptVideos);
        }
      }

      // Fetch following relationships
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

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // Use stable ID instead of user object

  // Poll for score updates on recently-uploaded attempt videos that don't have scores yet.
  // Uses exponential backoff (5 s → 10 s → 20 s → 40 s → 80 s) to keep request volume low
  // while still surfacing scores promptly once the backend finishes processing.
  useEffect(() => {
    const videosNeedingScores = videos.filter(
      (v) =>
        v.kind === 'attempt' &&
        (v.ai_score === null || v.ai_score === undefined) &&
        v.created_at &&
        Date.now() - new Date(v.created_at).getTime() < 10 * 60 * 1000 // within 10 minutes
    );

    if (videosNeedingScores.length === 0) return;

    let cancelled = false;
    // Backoff schedule: 5 s, 10 s, 20 s, 40 s, 80 s  — 5 checks, ~2.5 min total
    const backoffDelays = [5000, 10000, 20000, 40000, 80000];
    let step = 0;
    let pendingIds = new Set(videosNeedingScores.map((v) => v.id));
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || pendingIds.size === 0 || step >= backoffDelays.length) return;

      const { data: updatedVideos } = await supabase
        .from('videos')
        .select('id, ai_score')
        .in('id', Array.from(pendingIds));

      if (!cancelled && updatedVideos) {
        setVideos((prev) =>
          prev.map((v) => {
            const hit = updatedVideos.find((uv) => uv.id === v.id);
            if (hit && hit.ai_score !== null && hit.ai_score !== undefined) {
              pendingIds.delete(v.id); // no need to poll this video again
              return { ...v, ai_score: hit.ai_score };
            }
            return v;
          })
        );
      }

      step++;
      if (!cancelled && pendingIds.size > 0 && step < backoffDelays.length) {
        timeoutId = setTimeout(poll, backoffDelays[step]);
      }
    };

    timeoutId = setTimeout(poll, backoffDelays[0]);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [videos]);

  const onLiked = (id: string, liked: boolean) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, likes: Math.max(0, v.likes + (liked ? 1 : -1)) } : v
      )
    );
  };

  // No search filtering - search moved to Explore tab
  const filteredVideos = videos;

  // Snap-to-center behavior for videos (wheel, trackpad, arrow keys)
  useEffect(() => {
    const container = snapContainerRef.current;
    if (!container) return;

    const getCurrentIndex = () => {
      const viewportHeight = window.innerHeight || container.clientHeight || 1000;
      const idx = Math.round(container.scrollTop / viewportHeight);
      return Math.max(0, Math.min(itemRefs.current.length - 1, idx));
    };

    const scrollToIndex = (index: number) => {
      if (!container) return;
      const clamped = Math.max(0, Math.min(itemRefs.current.length - 1, index));
      const viewportHeight = window.innerHeight || container.clientHeight || 1000;
      const targetTop = clamped * viewportHeight;
      if (animatingRef.current) return;
      animatingRef.current = true;
      isProgrammaticScroll.current = true;
      activeIndexRef.current = clamped;
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
      window.setTimeout(() => {
        isProgrammaticScroll.current = false;
        animatingRef.current = false;
      }, 420);
    };

    const onWheel = (e: WheelEvent) => {
      if (isProgrammaticScroll.current || animatingRef.current) return;
      e.preventDefault();
      wheelAccumRef.current += e.deltaY;
      const threshold = 60;
      if (Math.abs(wheelAccumRef.current) >= threshold) {
        const dir = wheelAccumRef.current > 0 ? 1 : -1;
        wheelAccumRef.current = 0;
        const next = getCurrentIndex() + dir;
        scrollToIndex(next);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (isProgrammaticScroll.current || animatingRef.current) return;
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
      const now = Date.now();
      if (e.repeat && now - lastKeyTsRef.current < 150) return;

      if (['ArrowDown', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        lastKeyTsRef.current = now;
        scrollToIndex(getCurrentIndex() + 1);
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        lastKeyTsRef.current = now;
        scrollToIndex(getCurrentIndex() - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        lastKeyTsRef.current = now;
        scrollToIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        lastKeyTsRef.current = now;
        scrollToIndex(itemRefs.current.length - 1);
      }
    };

    container.style.scrollBehavior = 'smooth';
    container.style.overscrollBehavior = 'contain';
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (container as any).tabIndex = -1;
    try {
      container.focus({ preventScroll: true });
    } catch {}
    container.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey, { passive: false });
    const globalWheel = (e: WheelEvent) => {
      if (!snapContainerRef.current) return;
      if (!e.composedPath().includes(snapContainerRef.current)) {
        onWheel(e);
      }
    };
    document.addEventListener('wheel', globalWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel as any);
      document.removeEventListener('keydown', onKey as any);
      document.removeEventListener('wheel', globalWheel as any);
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [filteredVideos.length]);

  // Header toggle logic
  useEffect(() => {
    setShowHeader(true);

    const headerHeight = () => (headerRef.current?.getBoundingClientRect().height || 64) + 8;
    const inTopHotZone = (y: number) => y <= headerHeight();

    const lastPointerYRef = { current: window.innerHeight };

    const showIfTopOrHot = (scrolledTop: boolean) => {
      if (scrolledTop || inTopHotZone(lastPointerYRef.current)) {
        setShowHeader(true);
      } else {
        setShowHeader(false);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      lastPointerYRef.current = e.clientY;
      const scrollTop = snapContainerRef.current?.scrollTop || 0;
      const scrolledTop = scrollTop <= 0;
      showIfTopOrHot(scrolledTop);
    };

    const onScrollVideos = () => {
      const scrollTop = snapContainerRef.current?.scrollTop || 0;
      const scrolledTop = scrollTop <= 0;
      showIfTopOrHot(scrolledTop);
    };

    snapContainerRef.current?.addEventListener('scroll', onScrollVideos, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    return () => {
      snapContainerRef.current?.removeEventListener('scroll', onScrollVideos as any);
      window.removeEventListener('mousemove', onMouseMove as any);
    };
  }, []);


  return (
    <motion.div 
      className="min-h-screen bg-groovely-dark-bg text-white pb-24"
      initial={{ opacity: 0 }}
      animate={isMounted ? { opacity: 1 } : { opacity: 0 }}
      transition={{ 
        duration: 0.4, 
        ease: [0.16, 1, 0.3, 1],
        delay: 0.05
      }}
    >
      {/* Header removed - search moved to Explore tab */}

      {/* Video Feed Content */}
      <motion.div 
        className="fixed inset-0 top-0 bottom-0 z-0"
        initial={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ 
          duration: 0.5, 
          ease: [0.16, 1, 0.3, 1]
        }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 96px)', paddingTop: '96px' }}>
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-groovely-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white/60">Loading videos...</p>
            </div>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ minHeight: 'calc(100vh - 96px)', paddingTop: '96px' }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center px-ios-4"
            >
              <VideoIcon size={64} className="mx-auto mb-4 text-white/40" />
              <h3 className="text-2xl font-bold text-white mb-2 font-heading">
                No videos yet
              </h3>
              <p className="text-base text-white/60 mb-6">
                Be the first to share your moves!
              </p>
              <Button onClick={() => navigate('/create')}>
                <Plus size={18} className="mr-2" /> Create Video
              </Button>
            </motion.div>
          </div>
        ) : (
          <motion.div
            ref={snapContainerRef}
            className="overflow-y-scroll snap-y snap-mandatory"
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none', 
              WebkitOverflowScrolling: 'touch',
              height: '100vh',
              width: '100vw',
              position: 'fixed',
              top: 0,
              left: 0,
              scrollSnapType: 'y mandatory',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.4, 
              delay: 0.1,
              ease: [0.16, 1, 0.3, 1] 
            }}
          >
            <style>{`
              .snap-full::-webkit-scrollbar { display: none; }
              .video-snap-item {
                scroll-snap-align: start;
                scroll-snap-stop: always;
              }
            `}</style>
            <div className="snap-full">
              {filteredVideos.map((v, i) => (
                <div
                  key={v.id}
                  ref={(el) => { if (el) itemRefs.current[i] = el; }}
                  className="video-snap-item w-full flex items-center justify-center"
                  style={{ 
                    height: '100vh',
                    minHeight: '100vh',
                    width: '100vw',
                    flexShrink: 0,
                  }}
                >
                  <VideoFeedItem video={v} onLiked={onLiked} isFullScreen={true} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

