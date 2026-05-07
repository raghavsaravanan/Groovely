import { useRef, useState, useEffect } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Bookmark,
  Play,
  Pause,
  Sparkles,
  Maximize2,
  X,
  User,
  Copy,
  Check,
  Download,
  Search,
  Send,
} from 'lucide-react';
import { supabase, Video, VideoComment, Profile, ensureSupabaseVideoUrl } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoTypeBadge } from './VideoTypeBadge';
import { ViewCount } from './ViewCount';
import { useAuth } from '../contexts/AuthContext';
import { CommentComposer } from './CommentComposer';

type Props = {
  video: Video & { routine_id?: string | null }; // optional mapping
  onLiked?: (id: string, liked: boolean) => void;
  isFullScreen?: boolean;
};


export function VideoFeedItem({ video, onLiked, isFullScreen = false }: Props) {
  const navigate = useNavigate();
  const { user: authUser, profile: authProfile } = useAuth();
  const ref = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes || 0);
  const [favoriteCount, setFavoriteCount] = useState(video.favorites ?? 0);
  const [repostCount, setRepostCount] = useState(video.reposts ?? 0);
  const [commentCount, setCommentCount] = useState(video.comments ?? 0);
  const [viewCount, setViewCount] = useState(video.views || 0);
  const hasTrackedViewRef = useRef(false); // Use ref to persist across re-renders
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [hasFavorited, setHasFavorited] = useState(false);
  const [hasReposted, setHasReposted] = useState(false);
  const [openComments, setOpenComments] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(authUser?.id ?? null);
  const [postingComment, setPostingComment] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<Profile | null>(null);
  const lastVideoIdRef = useRef<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const lastTapRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<number | null>(null);
  
  // Determine if this is a model/reference video or an attempt
  const isModelVideo = video.kind === 'reference';
  const isAttemptVideo = video.kind === 'attempt';
  const videoScore = video.ai_score;
  
  // Ensure video URL is from Supabase, not local
  const videoUrl = ensureSupabaseVideoUrl(video.video_url);

  useEffect(() => {
    setCurrentUserId(authUser?.id ?? null);
  }, [authUser?.id]);

  useEffect(() => {
    const isNewVideo = lastVideoIdRef.current !== video.id;
    
    // Only reset tracking state if this is a different video
    if (isNewVideo) {
      lastVideoIdRef.current = video.id;
      hasTrackedViewRef.current = false;
      setHasTrackedView(false);
    }
    
    setLikeCount(video.likes || 0);
    setFavoriteCount(video.favorites ?? 0);
    setRepostCount(video.reposts ?? 0);
    setCommentCount(video.comments ?? 0);
    
    // Only update viewCount from prop if:
    // 1. It's a different video, OR
    // 2. The prop value is higher than current (to handle external updates)
    // This prevents resetting the count when we've already incremented it locally
    setViewCount(prev => {
      const propViews = video.views || 0;
      // If it's a new video, use prop value
      if (isNewVideo) {
        return propViews;
      }
      // Otherwise, use the higher value (either prop or current state)
      // This ensures we don't reset to a lower value if the prop hasn't updated yet
      return Math.max(prev, propViews);
    });
  }, [video.id, video.likes, video.favorites, video.reposts, video.comments, video.views]);

  // Auto-play when in viewport (for fullscreen mode)
  useEffect(() => {
    if (!isFullScreen || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            ref.current?.play().catch(() => undefined);
            setPlaying(true);
            trackView(); // Track view when video auto-plays
          } else {
            ref.current?.pause();
            setPlaying(false);
          }
        });
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [isFullScreen]);

  // Fetch creator profile
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!video.user_id) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', video.user_id)
        .maybeSingle();

      if (!cancelled && profileData) {
        setCreatorProfile(profileData);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video.user_id]);

  // preload engagement state
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      let likeStatus: any = null;
      let favoriteStatus: any = null;
      let repostStatus: any = null;
      let likeCountRes: any = null;
      let favoriteCountRes: any = null;
      let repostCountRes: any = null;

      if (user) {
        setCurrentUserId(user.id);
        [
          likeStatus,
          favoriteStatus,
          repostStatus,
          likeCountRes,
          favoriteCountRes,
          repostCountRes,
        ] = await Promise.all([
          supabase
            .from('video_likes')
            .select('id')
            .eq('video_id', video.id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('video_favorites')
            .select('id')
            .eq('video_id', video.id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('video_reposts')
            .select('id')
            .eq('video_id', video.id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('video_likes')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
          supabase
            .from('video_favorites')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
          supabase
            .from('video_reposts')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
        ]);

        if (!cancelled) {
          setLiked(!!likeStatus?.data);
          setHasFavorited(!!favoriteStatus?.data);
          setHasReposted(!!repostStatus?.data);
        }
      } else {
        setCurrentUserId(null);
        [likeCountRes, favoriteCountRes, repostCountRes] = await Promise.all([
          supabase
            .from('video_likes')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
          supabase
            .from('video_favorites')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
          supabase
            .from('video_reposts')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id),
        ]);
      }

      const commentRes = await supabase
        .from('video_comments')
        .select(
          'id, video_id, user_id, content, created_at, profiles!video_comments_user_id_fkey(username, avatar_url, display_name)',
          { count: 'exact', head: false }
        )
        .eq('video_id', video.id)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!cancelled) {
        setLikeCount(likeCountRes?.count ?? video.likes ?? 0);
        setFavoriteCount(favoriteCountRes?.count ?? video.favorites ?? 0);
        setRepostCount(repostCountRes?.count ?? video.reposts ?? 0);

        const normalized = (commentRes.data || []).map(normalizeComment);
        setComments(normalized);
        setCommentCount(commentRes.count ?? normalized.length ?? 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video.id, video.likes, video.favorites, video.reposts]);

  // Track view when video starts playing
  const trackView = async () => {
    if (hasTrackedViewRef.current || !video.id) return;
    hasTrackedViewRef.current = true; // Mark as tracked immediately to prevent duplicates
    
    try {
      // Try RPC first, but if it fails, use direct update
      const { error: rpcError, data: rpcData } = await supabase.rpc('increment_video_view', { video_id: video.id });
      
      if (rpcError) {
        console.log('RPC call failed, using direct update:', rpcError);
        // Fallback: direct update if RPC doesn't exist or fails
        const { error: updateError } = await supabase
          .from('videos')
          .update({ views: (video.views || 0) + 1 })
          .eq('id', video.id);
        
        if (!updateError) {
          setViewCount(prev => prev + 1);
          setHasTrackedView(true);
        } else {
          console.error('Error tracking view via direct update:', updateError);
          // Reset tracking flag on error so user can try again
          hasTrackedViewRef.current = false;
        }
      } else {
        // RPC succeeded, increment local state
        setViewCount(prev => prev + 1);
        setHasTrackedView(true);
      }
    } catch (err) {
      console.error('Error tracking view:', err);
      // Reset tracking flag on error
      hasTrackedViewRef.current = false;
    }
  };

  const togglePlay = () => {
    if (!ref.current) return;
    if (playing) {
      ref.current.pause();
    } else {
      ref.current.play();
      trackView(); // Track view when user manually plays
    }
    setPlaying(!playing);
  };

  // Handle double-tap to like
  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double tap detected - like the video
      e.preventDefault();
      e.stopPropagation();
      
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      
      if (!liked && !liking) {
        handleLike();
      }
      
      lastTapRef.current = 0;
    } else {
      // Single tap - toggle play
      lastTapRef.current = now;
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = window.setTimeout(() => {
        togglePlay();
      }, 300);
    }
  };

  const setPlayback = (v: number) => {
    setSpeed(v);
    if (ref.current) ref.current.playbackRate = v;
  };

  const ensureAuthenticated = async () => {
    if (currentUserId) return currentUserId;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert('Sign in to interact with videos.');
      return null;
    }
    setCurrentUserId(user.id);
    return user.id;
  };

  const normalizeComment = (entry: any): VideoComment => ({
    id: entry.id,
    video_id: entry.video_id,
    user_id: entry.user_id,
    content: entry.content,
    created_at: entry.created_at,
    profiles: Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles,
  });

  const handleLike = async () => {
    if (liking) return;
    const userId = await ensureAuthenticated();
    if (!userId) return;

    setLiking(true);
    try {
      if (liked) {
        // Unlike
        const { error } = await supabase
          .from('video_likes')
          .delete()
          .eq('video_id', video.id)
          .eq('user_id', userId);

        if (!error) {
          setLiked(false);
          setLikeCount(prev => Math.max(0, prev - 1));
          onLiked?.(video.id, false);
        }
      } else {
        // Like
        const { error } = await supabase
          .from('video_likes')
          .insert({
            video_id: video.id,
            user_id: userId,
          });

        if (!error) {
          setLiked(true);
          setLikeCount(prev => prev + 1);
          onLiked?.(video.id, true);
        }
      }
    } catch (err) {
      console.error('Error toggling like:', err);
    } finally {
      setLiking(false);
    }
  };

  const handleFavorite = async () => {
    const userId = await ensureAuthenticated();
    if (!userId) return;

    if (hasFavorited) {
      const { error } = await supabase
        .from('video_favorites')
        .delete()
        .eq('video_id', video.id)
        .eq('user_id', userId);

      if (!error) {
        setHasFavorited(false);
        setFavoriteCount(prev => Math.max(0, prev - 1));
      }
    } else {
      const { error } = await supabase
        .from('video_favorites')
        .insert({
          video_id: video.id,
          user_id: userId,
        });

      if (!error) {
        setHasFavorited(true);
        setFavoriteCount(prev => prev + 1);
      }
    }
  };

  const handleRepost = async () => {
    const userId = await ensureAuthenticated();
    if (!userId) return;

    if (hasReposted) {
      const { error } = await supabase
        .from('video_reposts')
        .delete()
        .eq('video_id', video.id)
        .eq('user_id', userId);

      if (!error) {
        setHasReposted(false);
        setRepostCount(prev => Math.max(0, prev - 1));
      } else {
        console.error('Error removing repost:', error);
        alert('Could not remove repost. Please try again.');
      }
    } else {
      const { error } = await supabase
        .from('video_reposts')
        .insert({
          video_id: video.id,
          user_id: userId,
        });

      if (!error) {
        setHasReposted(true);
        setRepostCount(prev => prev + 1);
      } else {
        console.error('Error adding repost:', error);
        alert('Could not repost this video. Please check your connection and try again.');
      }
    }
  };

  const handleComment = async () => {
    if (!comment.trim() || postingComment) return;
    const userId = await ensureAuthenticated();
    if (!userId) return;
    setPostingComment(true);
    try {
      const { data, error } = await supabase
        .from('video_comments')
        .insert({
          user_id: userId,
          video_id: video.id,
          content: comment.trim(),
        })
        .select(
          'id, video_id, user_id, content, created_at, profiles!video_comments_user_id_fkey(username, avatar_url, display_name)'
        )
        .maybeSingle();

      if (!error && data) {
        const normalized = normalizeComment(data);
        setComments(prev => [normalized, ...prev]);
        setCommentCount(prev => prev + 1);
        setComment('');
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const playbackOptions = [0.25, 0.5, 1, 1.5];
  const handleFullscreen = () => {
    const element = ref.current;
    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
    } else {
      element.requestFullscreen?.().catch(() => {
        /* ignore */
      });
    }
  };

  // Handler for "Try This Dance" button
  const handleTryDance = async () => {
    try {
      // For model/reference videos, use routine_id directly
      if (isModelVideo && video.routine_id) {
        navigate(`/try/${video.routine_id}`);
        return;
      }
      
      // For attempt videos, find the reference video's routine_id
      if (isAttemptVideo && video.routine_id) {
        // The routine_id on an attempt video points to the reference routine
        navigate(`/try/${video.routine_id}`);
        return;
      }
      
      // Fallback: query the video record fresh from DB
      const { data: videoRecord, error: videoError } = await supabase
        .from('videos')
        .select('routine_id, kind')
        .eq('id', video.id)
        .maybeSingle();
      
      if (videoError) {
        console.error('Error fetching video:', videoError);
      }
      
      // If video has routine_id, use it directly
      if (videoRecord?.routine_id) {
        navigate(`/try/${videoRecord.routine_id}`);
        return;
      }
      
      // If this is a reference video but missing routine_id, try to find it
      if (videoRecord?.kind === 'reference') {
        const { data: allRoutines } = await supabase
          .from('routines')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (allRoutines && allRoutines.length > 0) {
          const routineIds = allRoutines.map(r => r.id);
          const { data: refVideos } = await supabase
            .from('videos')
            .select('routine_id')
            .in('routine_id', routineIds)
            .eq('kind', 'reference')
            .eq('id', video.id)
            .maybeSingle();
          
          if (refVideos?.routine_id) {
            navigate(`/try/${refVideos.routine_id}`);
            return;
          }
        }
      }
      
      // If still no routine found, show helpful message
      alert('No routine found for this video. To use "Try This Dance", the video must be linked to a routine. You can create a routine from this video in the Create page.');
    } catch (err) {
      console.error('Error finding routine:', err);
      alert('Unable to find routine for this video. Please try again or create a routine first.');
    }
  };

  if (isFullScreen) {
    // Calculate gradient for attempt videos (green at 100, yellow at 50, red at 0)
    const getGradientStyle = (score: number | null): React.CSSProperties => {
      if (score === null || score === undefined) {
        return { border: '4px solid rgb(107, 114, 128)' };
      }
      
      const normalizedScore = Math.max(0, Math.min(100, score));
      
    // Create gradient: green (100) -> yellow (50) -> red (0)
    // green-500: rgb(34, 197, 94)
    // yellow-500: rgb(234, 179, 8)
    // red-500: rgb(239, 68, 68)
    let gradientColors: string;
    if (normalizedScore >= 50) {
      // Green to yellow (50-100)
      const ratio = (normalizedScore - 50) / 50; // 0 to 1
      const r = Math.round(34 + (234 - 34) * (1 - ratio));
      const g = Math.round(197 + (179 - 197) * (1 - ratio));
      const b = Math.round(94 + (8 - 94) * (1 - ratio));
      gradientColors = `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to red (0-50)
      const ratio = normalizedScore / 50; // 0 to 1
      const r = Math.round(234 + (239 - 234) * (1 - ratio));
      const g = Math.round(179 + (68 - 179) * (1 - ratio));
      const b = Math.round(8 + (68 - 8) * (1 - ratio));
      gradientColors = `rgb(${r}, ${g}, ${b})`;
    }
      
      return {
        border: `4px solid ${gradientColors}`,
        borderRadius: '0',
        boxShadow: `0 0 20px ${gradientColors}, 0 0 40px ${gradientColors}40`,
      };
    };
    
    return (
      <div 
        ref={containerRef} 
        className="relative bg-black flex items-center justify-center"
        style={{
          height: '100vh',
          width: '100vw',
          minHeight: '100vh',
          minWidth: '100vw',
        }}
      >
        {/* Gradient border effect for attempt videos */}
        {isAttemptVideo && videoScore !== null && (
          <div 
            className="absolute inset-0 pointer-events-none z-30"
            style={getGradientStyle(videoScore)}
          />
        )}
        
        {videoUrl ? (
          <video
            ref={ref}
            src={videoUrl}
            className="object-contain bg-black relative z-10"
            style={{
              height: '100vh',
              width: '100vw',
              maxHeight: '100vh',
              maxWidth: '100vw',
            }}
            onClick={handleVideoClick}
            loop
            playsInline
            muted={false}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-black text-white">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Video unavailable</p>
              <p className="text-sm text-white/60">This video is not available from storage.</p>
            </div>
          </div>
        )}
        
        {/* Creator Profile Button - top left */}
        {creatorProfile && (
          <motion.button
            onClick={() => navigate(`/user/${video.user_id}`)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="absolute top-4 left-4 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl backdrop-blur-xl bg-black/40 border border-white/20 shadow-xl hover:bg-black/60 transition-all group"
          >
            {creatorProfile.avatar_url ? (
              <img 
                src={creatorProfile.avatar_url} 
                alt={creatorProfile.username}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/30 group-hover:border-white/50 transition-colors"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 flex items-center justify-center border-2 border-white/30 group-hover:border-white/50 transition-colors">
                <User size={20} className="text-white" />
              </div>
            )}
            <div className="flex flex-col items-start">
              <span className="text-white font-heading font-semibold text-sm leading-tight">
                {creatorProfile.display_name || creatorProfile.username}
              </span>
              <span className="text-white/60 text-xs font-subtext">
                @{creatorProfile.username}
              </span>
            </div>
          </motion.button>
        )}

        {/* Score badge - top right corner (only for attempt videos) - positioned to avoid overlap with buttons */}
        {isAttemptVideo && videoScore !== null && (
          <div className="absolute top-4 right-4 z-40 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative backdrop-blur-xl px-4 py-2.5 rounded-xl border border-white/30 shadow-xl"
              style={{
                background: videoScore >= 80 
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.85) 0%, rgba(16, 185, 129, 0.85) 100%)'
                  : videoScore >= 60
                  ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.85) 0%, rgba(251, 191, 36, 0.85) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.85) 0%, rgba(220, 38, 38, 0.85) 100%)',
                boxShadow: videoScore >= 80
                  ? '0 4px 20px rgba(34, 197, 94, 0.4), 0 0 30px rgba(16, 185, 129, 0.3)'
                  : videoScore >= 60
                  ? '0 4px 20px rgba(234, 179, 8, 0.4), 0 0 30px rgba(251, 191, 36, 0.3)'
                  : '0 4px 20px rgba(239, 68, 68, 0.4), 0 0 30px rgba(220, 38, 38, 0.3)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-white font-heading font-bold text-2xl drop-shadow-lg">
                  {Math.round(videoScore)}
                </span>
                <div className="flex flex-col gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        i < Math.round((videoScore / 100) * 5)
                          ? 'bg-white'
                          : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {!playing && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto h-20 w-20 flex items-center justify-center rounded-full bg-white/20 backdrop-blur text-white z-10"
            aria-label="Play"
          >
            <Play size={36} />
          </button>
        )}

        {/* Right side action buttons - Redesigned with Groovely colors - positioned to avoid overlap with score */}
        <div className={`absolute right-3 flex flex-col gap-3 z-50 ${isAttemptVideo && videoScore !== null ? 'bottom-40' : 'bottom-32'}`} style={{ pointerEvents: 'auto' }}>
          {/* Like Button */}
          <motion.button
            onClick={handleLike}
            disabled={liking}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1"
            aria-label="Like"
          >
            <motion.div 
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              animate={{
                background: liked 
                  ? 'linear-gradient(135deg, #EC4899 0%, #FF8C5A 100%)' 
                  : 'rgba(255, 255, 255, 0.15)',
                borderColor: liked ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                borderWidth: liked ? 0 : 1,
                boxShadow: liked 
                  ? '0 0 20px rgba(236, 72, 153, 0.5), 0 0 40px rgba(236, 72, 153, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2)',
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.div
                animate={liked ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, -10, 10, 0],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Heart 
                  size={20} 
                  fill={liked ? 'white' : 'none'} 
                  className={liked ? 'text-white' : 'text-white/80'}
                  strokeWidth={liked ? 0 : 2}
                />
              </motion.div>
            </motion.div>
            <motion.span 
              className="text-[11px] font-heading font-semibold text-white drop-shadow-lg leading-tight"
              animate={{ opacity: likeCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {likeCount > 0 ? likeCount.toLocaleString() : ''}
            </motion.span>
          </motion.button>

          {/* Comment Button */}
          <motion.button
            onClick={() => setOpenComments(p => !p)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1"
            aria-label="Comments"
          >
            <motion.div 
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              animate={{
                background: openComments 
                  ? 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)' 
                  : 'rgba(255, 255, 255, 0.15)',
                borderColor: openComments ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                borderWidth: openComments ? 0 : 1,
                boxShadow: openComments 
                  ? '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2)',
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.div
                animate={openComments ? {
                  scale: [1, 1.2, 1],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <MessageCircle 
                  size={20} 
                  className={openComments ? 'text-white' : 'text-white/80'} 
                  fill={openComments ? 'white' : 'none'} 
                  strokeWidth={openComments ? 0 : 2} 
                />
              </motion.div>
            </motion.div>
            <motion.span 
              className="text-[11px] font-heading font-semibold text-white drop-shadow-lg leading-tight"
              animate={{ opacity: commentCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {commentCount > 0 ? commentCount.toLocaleString() : ''}
            </motion.span>
          </motion.button>

          {/* Favorite Button */}
          <motion.button
            onClick={handleFavorite}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1"
            aria-label="Favorite"
          >
            <motion.div 
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              animate={{
                background: hasFavorited 
                  ? 'linear-gradient(135deg, #FF8C5A 0%, #EC4899 100%)' 
                  : 'rgba(255, 255, 255, 0.15)',
                borderColor: hasFavorited ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                borderWidth: hasFavorited ? 0 : 1,
                boxShadow: hasFavorited 
                  ? '0 0 20px rgba(255, 140, 90, 0.5), 0 0 40px rgba(255, 140, 90, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2)',
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.div
                animate={hasFavorited ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, -5, 5, 0],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Bookmark 
                  size={20} 
                  fill={hasFavorited ? 'white' : 'none'} 
                  className={hasFavorited ? 'text-white' : 'text-white/80'}
                  strokeWidth={hasFavorited ? 0 : 2}
                />
              </motion.div>
            </motion.div>
            <motion.span 
              className="text-[11px] font-heading font-semibold text-white drop-shadow-lg leading-tight"
              animate={{ opacity: favoriteCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {favoriteCount > 0 ? favoriteCount.toLocaleString() : ''}
            </motion.span>
          </motion.button>

          {/* Repost Button */}
          <motion.button
            onClick={handleRepost}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-1"
            aria-label="Repost"
          >
            <motion.div 
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              animate={{
                background: hasReposted 
                  ? 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)' 
                  : 'rgba(255, 255, 255, 0.15)',
                borderColor: hasReposted ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                borderWidth: hasReposted ? 0 : 1,
                boxShadow: hasReposted 
                  ? '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2)',
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.div
                animate={hasReposted ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360],
                } : {}}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Repeat2 size={20} className={hasReposted ? 'text-white' : 'text-white/80'} />
              </motion.div>
            </motion.div>
            <motion.span 
              className="text-[11px] font-heading font-semibold text-white drop-shadow-lg leading-tight"
              animate={{ opacity: repostCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {repostCount > 0 ? repostCount.toLocaleString() : ''}
            </motion.span>
          </motion.button>

          {/* Share Button */}
          <motion.button 
            onClick={(e) => {
              e.stopPropagation();
              setShowShareModal(true);
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="h-12 w-12 rounded-full bg-white/15 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg text-white/80 hover:bg-white/20 transition-colors cursor-pointer relative z-50" 
            style={{ pointerEvents: 'auto' }}
            aria-label="Share"
          >
            <Share2 size={20} />
          </motion.button>

          {/* View Count */}
          <div className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-full bg-white/15 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
              <ViewCount count={viewCount} size="sm" className="text-white" />
            </div>
          </div>
        </div>

        {/* Bottom info overlay - Redesigned for better UX */}
        <div className="absolute bottom-0 left-0 right-0 pr-20 p-5 pb-24 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white z-10">
          <div className="max-w-2xl">
            {/* Badge above title */}
            {(isModelVideo || isAttemptVideo) && (
              <VideoTypeBadge type={isModelVideo ? 'model' : 'attempt'} />
            )}
            
            {/* Title */}
            <h3 className="font-heading font-bold text-lg mb-2 line-clamp-2 leading-tight">{video.title}</h3>
            
            {video.description && (
              <p className="text-sm text-white/70 mb-4 line-clamp-2 font-body">{video.description}</p>
            )}
            
            {/* Enhanced "Try This Dance" button - matching Home.tsx style */}
            {(isModelVideo || isAttemptVideo || video.routine_id) && (
              <motion.button
                onClick={handleTryDance}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl btn-gradient-smooth btn-pulse text-white font-heading font-bold text-base tracking-wide overflow-hidden shadow-2xl shadow-groovely-pink-500/40 cursor-pointer"
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
                  >
                    <Play size={20} className="group-hover:scale-110 transition-transform duration-300" />
                  </motion.div>
                  <span>Try This Dance</span>
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </motion.button>
            )}
          </div>
        </div>

        {/* Comments overlay - Redesigned with Groovely UI */}
        <AnimatePresence>
          {openComments && (
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute bottom-0 left-0 right-0 max-h-[78%] bg-groovely-dark-surface/98 backdrop-blur-2xl rounded-t-3xl border-t border-groovely-dark-border z-30 overflow-hidden flex flex-col"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-groovely-dark-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 flex items-center justify-center">
                    <MessageCircle size={20} className="text-white" fill="white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-heading font-bold text-white">Comments</h3>
                    <p className="text-xs text-white/60 font-subtext">{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</p>
                  </div>
                </div>
                <motion.button
                  onClick={() => setOpenComments(false)}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <X size={20} />
                </motion.button>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {comments.length > 0 ? (
                  comments.map((c, index) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="flex gap-3"
                    >
                      <motion.div 
                        className="w-12 h-12 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 overflow-hidden flex-shrink-0 flex items-center justify-center"
                        whileHover={{ scale: 1.1 }}
                      >
                        {c.profiles?.avatar_url ? (
                          <img src={c.profiles.avatar_url} alt={c.profiles.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-heading font-bold text-lg">
                            {(c.profiles?.username || '?')[0]?.toUpperCase()}
                          </span>
                        )}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-heading font-semibold text-white">
                            {c.profiles?.display_name || c.profiles?.username || 'Dancer'}
                          </span>
                          <span className="text-xs text-white/50 font-subtext">
                            {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm text-white/80 font-body leading-relaxed break-words">{c.content}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <MessageCircle size={48} className="text-white/20 mb-4" />
                    <p className="text-base text-white/60 font-body">Be the first to comment on this video.</p>
                  </div>
                )}
              </div>

              {/* Comment Input */}
              <div className="p-6 border-t border-groovely-dark-border bg-groovely-dark-card/50">
                <CommentComposer
                  value={comment}
                  onChange={setComment}
                  onSubmit={handleComment}
                  placeholder="Leave a comment…"
                  disabled={!currentUserId}
                  isSubmitting={postingComment}
                  userAvatarUrl={authProfile?.avatar_url ?? authUser?.user_metadata?.avatar_url ?? null}
                  userInitial={authProfile?.display_name || authProfile?.username || authUser?.email || undefined}
                  authMessage={currentUserId ? undefined : 'Sign in to comment'}
                  onAuthAction={() => navigate('/login')}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Calculate gradient for attempt videos (non-fullscreen) - green at 100, yellow at 50, red at 0
  const getGradientStyle = (score: number | null): React.CSSProperties => {
    if (score === null || score === undefined) {
      return { border: '4px solid rgb(107, 114, 128)' };
    }
    
    const normalizedScore = Math.max(0, Math.min(100, score));
    
    // Create gradient: green (100) -> yellow (50) -> red (0)
    // green-500: rgb(34, 197, 94)
    // yellow-500: rgb(234, 179, 8)
    // red-500: rgb(239, 68, 68)
    let gradientColors: string;
    if (normalizedScore >= 50) {
      // Green to yellow (50-100)
      const ratio = (normalizedScore - 50) / 50; // 0 to 1
      const r = Math.round(34 + (234 - 34) * (1 - ratio));
      const g = Math.round(197 + (179 - 197) * (1 - ratio));
      const b = Math.round(94 + (8 - 94) * (1 - ratio));
      gradientColors = `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to red (0-50)
      const ratio = normalizedScore / 50; // 0 to 1
      const r = Math.round(234 + (239 - 234) * (1 - ratio));
      const g = Math.round(179 + (68 - 179) * (1 - ratio));
      const b = Math.round(8 + (68 - 8) * (1 - ratio));
      gradientColors = `rgb(${r}, ${g}, ${b})`;
    }
    
    return {
      border: `4px solid ${gradientColors}`,
      borderRadius: '0.5rem',
      boxShadow: `0 0 20px ${gradientColors}, 0 0 40px ${gradientColors}40`,
    };
  };

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-black mb-10 shadow-2xl border border-gray-800 relative">
      {/* Gradient border effect for attempt videos (non-fullscreen) */}
      {isAttemptVideo && videoScore !== null && (
        <div 
          className="absolute inset-0 pointer-events-none z-30 rounded-2xl"
          style={getGradientStyle(videoScore)}
        />
      )}
      
      <div className="relative h-[80vh] bg-black">
        {videoUrl ? (
          <video
            ref={ref}
            src={videoUrl}
            className="h-full w-full object-contain bg-black relative z-10"
            onClick={handleVideoClick}
            loop
            playsInline
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-black text-white">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Video unavailable</p>
              <p className="text-sm text-white/60">This video is not available from storage.</p>
            </div>
          </div>
        )}
        
        {/* Score badge - top right corner (non-fullscreen, only for attempt videos) */}
        {isAttemptVideo && videoScore !== null && (
          <div className="absolute top-4 right-4 z-40 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative backdrop-blur-xl px-3 py-2 rounded-lg border border-white/30 shadow-lg"
              style={{
                background: videoScore >= 80 
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.85) 0%, rgba(16, 185, 129, 0.85) 100%)'
                  : videoScore >= 60
                  ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.85) 0%, rgba(251, 191, 36, 0.85) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.85) 0%, rgba(220, 38, 38, 0.85) 100%)',
                boxShadow: videoScore >= 80
                  ? '0 4px 16px rgba(34, 197, 94, 0.4), 0 0 24px rgba(16, 185, 129, 0.3)'
                  : videoScore >= 60
                  ? '0 4px 16px rgba(234, 179, 8, 0.4), 0 0 24px rgba(251, 191, 36, 0.3)'
                  : '0 4px 16px rgba(239, 68, 68, 0.4), 0 0 24px rgba(220, 38, 38, 0.3)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-white font-heading font-bold text-xl drop-shadow-lg">
                  {Math.round(videoScore)}
                </span>
                <div className="flex flex-col gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        i < Math.round((videoScore / 100) * 5)
                          ? 'bg-white'
                          : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {!playing && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto h-20 w-20 flex items-center justify-center rounded-full bg-white/20 backdrop-blur text-white"
            aria-label="Play"
          >
            <Play size={36} />
          </button>
        )}
      </div>

      <div className="p-6 bg-gradient-to-b from-gray-950 via-black to-black text-white space-y-5">
        {/* Actions Row - Redesigned with Groovely colors */}
        <div className="flex flex-wrap items-center gap-4">
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <motion.button
              onClick={handleLike}
              disabled={liking}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              aria-label="Like"
            >
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: liked 
                    ? 'linear-gradient(135deg, #EC4899 0%, #FF8C5A 100%)' 
                    : 'rgba(255, 255, 255, 0.15)',
                  borderColor: liked ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                  borderWidth: liked ? 0 : 1,
                  boxShadow: liked 
                    ? '0 0 20px rgba(236, 72, 153, 0.5), 0 0 40px rgba(236, 72, 153, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              />
              <motion.div
                className="relative z-10"
                animate={liked ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, -10, 10, 0],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Heart 
                  size={20} 
                  fill={liked ? 'white' : 'none'} 
                  className={liked ? 'text-white' : 'text-white/80'}
                  strokeWidth={liked ? 0 : 2}
                />
              </motion.div>
            </motion.button>
            <motion.span 
              className="text-sm font-heading font-semibold text-white"
              animate={{ opacity: likeCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {likeCount > 0 ? likeCount.toLocaleString() : ''}
            </motion.span>
          </motion.div>

          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <motion.button
              onClick={() => setOpenComments(p => !p)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              aria-label="Comments"
            >
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: openComments 
                    ? 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)' 
                    : 'rgba(255, 255, 255, 0.15)',
                  borderColor: openComments ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                  borderWidth: openComments ? 0 : 1,
                  boxShadow: openComments 
                    ? '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              />
              <motion.div
                className="relative z-10"
                animate={openComments ? {
                  scale: [1, 1.2, 1],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <MessageCircle 
                  size={20} 
                  className={openComments ? 'text-white' : 'text-white/80'} 
                  fill={openComments ? 'white' : 'none'} 
                  strokeWidth={openComments ? 0 : 2}
                />
              </motion.div>
            </motion.button>
            <motion.span 
              className="text-sm font-heading font-semibold text-white"
              animate={{ opacity: commentCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {commentCount > 0 ? commentCount.toLocaleString() : ''}
            </motion.span>
          </motion.div>

          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <motion.button
              onClick={handleFavorite}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              aria-label="Favorite"
            >
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: hasFavorited 
                    ? 'linear-gradient(135deg, #FF8C5A 0%, #EC4899 100%)' 
                    : 'rgba(255, 255, 255, 0.15)',
                  borderColor: hasFavorited ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                  borderWidth: hasFavorited ? 0 : 1,
                  boxShadow: hasFavorited 
                    ? '0 0 20px rgba(255, 140, 90, 0.5), 0 0 40px rgba(255, 140, 90, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              />
              <motion.div
                className="relative z-10"
                animate={hasFavorited ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, -5, 5, 0],
                } : {}}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Bookmark 
                  size={20} 
                  fill={hasFavorited ? 'white' : 'none'} 
                  className={hasFavorited ? 'text-white' : 'text-white/80'}
                  strokeWidth={hasFavorited ? 0 : 2}
                />
              </motion.div>
            </motion.button>
            <motion.span 
              className="text-sm font-heading font-semibold text-white"
              animate={{ opacity: favoriteCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {favoriteCount > 0 ? favoriteCount.toLocaleString() : ''}
            </motion.span>
          </motion.div>

          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <motion.button
              onClick={handleRepost}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md relative overflow-hidden"
              aria-label="Repost"
            >
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: hasReposted 
                    ? 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)' 
                    : 'rgba(255, 255, 255, 0.15)',
                  borderColor: hasReposted ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
                  borderWidth: hasReposted ? 0 : 1,
                  boxShadow: hasReposted 
                    ? '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              />
              <motion.div
                className="relative z-10"
                animate={hasReposted ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360],
                } : {}}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Repeat2 size={20} className={hasReposted ? 'text-white' : 'text-white/80'} />
              </motion.div>
            </motion.button>
            <motion.span 
              className="text-sm font-heading font-semibold text-white"
              animate={{ opacity: repostCount > 0 ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {repostCount > 0 ? repostCount.toLocaleString() : ''}
            </motion.span>
          </motion.div>

          <motion.button 
            onClick={(e) => {
              e.stopPropagation();
              setShowShareModal(true);
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="h-12 w-12 rounded-full bg-white/15 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg text-white/80 hover:bg-white/20 transition-colors cursor-pointer relative z-50" 
            style={{ pointerEvents: 'auto' }}
            aria-label="Share"
          >
            <Share2 size={20} />
          </motion.button>

          {/* View Count */}
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
          >
            <div className="h-12 w-12 rounded-full bg-white/15 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
              <ViewCount count={viewCount} size="sm" className="text-white" />
            </div>
          </motion.div>

          <div className="ml-auto flex items-center gap-2">
            {playbackOptions.map((s) => (
              <button
                key={s}
                onClick={() => setPlayback(s)}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  speed === s
                    ? 'bg-white text-black border-white'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                {s}x
              </button>
            ))}
            <button
              onClick={togglePlay}
              className="h-9 w-9 rounded-full bg-white text-black flex items-center justify-center"
              aria-label="Play/Pause"
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={handleFullscreen}
              className="h-9 w-9 rounded-full bg-white text-black flex items-center justify-center"
              aria-label="Fullscreen"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>

        {/* AI Scores */}
        {video.ai_feedback && video.ai_feedback.timing && (
          <div className="bg-black/40 backdrop-blur-md rounded-lg p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={18} className="text-yellow-400" />
              <span className="text-sm font-semibold">AI Analysis</span>
              {video.ai_feedback.overall && (
                <span className="text-sm font-bold text-yellow-400 ml-auto">
                  {video.ai_feedback.overall.toFixed(1)}/10
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-white/70">Timing</div>
                <div className="font-semibold">{video.ai_feedback.timing}/10</div>
              </div>
              <div>
                <div className="text-white/70">Energy</div>
                <div className="font-semibold">{video.ai_feedback.energy}/10</div>
              </div>
              <div>
                <div className="text-white/70">Technique</div>
                <div className="font-semibold">{video.ai_feedback.technique}/10</div>
              </div>
            </div>
          </div>
        )}

        {/* Meta & CTA - Redesigned */}
        <div className="flex flex-col gap-4">
          <div>
            {/* Badge above title */}
            {(isModelVideo || isAttemptVideo) && (
              <VideoTypeBadge type={isModelVideo ? 'model' : 'attempt'} />
            )}
            
            {/* Title */}
            <h3 className="font-heading font-semibold text-xl mb-2">{video.title}</h3>
            {video.description && (
              <p className="text-sm text-white/70 font-body">{video.description}</p>
            )}
          </div>

          <div>
            {/* Enhanced "Try This Dance" button (non-fullscreen) - matching Home.tsx style */}
            {(isModelVideo || isAttemptVideo || video.routine_id) && (
              <motion.button
                onClick={handleTryDance}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl btn-gradient-smooth btn-pulse text-white font-heading font-bold text-base tracking-wide overflow-hidden shadow-2xl shadow-groovely-pink-500/40 cursor-pointer mb-3"
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
                  >
                    <Play size={20} className="group-hover:scale-110 transition-transform duration-300" />
                  </motion.div>
                  <span>Try This Dance</span>
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </motion.button>
            )}
            {video.kind === 'reference' && video.routine_id && (
              <Link
                to={`/routine/${video.routine_id}/attempts`}
                className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mt-3 transition-colors"
              >
                <Repeat2 size={16} />
                View Attempts
              </Link>
            )}
          </div>
        </div>

        {/* Comments - Non-fullscreen - Redesigned with Groovely UI */}
        <AnimatePresence>
          {openComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="bg-groovely-dark-card border border-groovely-dark-border rounded-2xl p-6 shadow-2xl space-y-4 overflow-hidden"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 flex items-center justify-center">
                    <MessageCircle size={20} className="text-white" fill="white" />
                  </div>
                  <div>
                    <h3 className="text-base font-heading font-bold text-white">Comments</h3>
                    <p className="text-xs text-white/60 font-subtext">{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</p>
                  </div>
                </div>
                <motion.button
                  onClick={() => setOpenComments(false)}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <CommentComposer
                value={comment}
                onChange={setComment}
                onSubmit={handleComment}
                placeholder="Leave a comment…"
                disabled={!currentUserId}
                isSubmitting={postingComment}
                userAvatarUrl={authProfile?.avatar_url ?? authUser?.user_metadata?.avatar_url ?? null}
                userInitial={authProfile?.display_name || authProfile?.username || authUser?.email || undefined}
                authMessage={currentUserId ? undefined : 'Sign in to comment'}
                onAuthAction={() => navigate('/login')}
                className="mb-4"
              />
              
              {comments.length > 0 ? (
                <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                  {comments.map((c, index) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="flex gap-3"
                    >
                      <motion.div 
                        className="w-12 h-12 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 overflow-hidden flex-shrink-0 flex items-center justify-center"
                        whileHover={{ scale: 1.1 }}
                      >
                        {c.profiles?.avatar_url ? (
                          <img src={c.profiles.avatar_url} alt={c.profiles.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-heading font-bold text-lg">
                            {(c.profiles?.username || '?')[0]?.toUpperCase()}
                          </span>
                        )}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-heading font-semibold text-white">
                            {c.profiles?.display_name || c.profiles?.username || 'Dancer'}
                          </span>
                          <span className="text-xs text-white/50 font-subtext">
                            {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm text-white/80 font-body leading-relaxed break-words">{c.content}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageCircle size={40} className="text-white/20 mb-3" />
                  <p className="text-sm text-white/60 font-body">Be the first to comment on this video.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-groovely-dark-surface border border-groovely-dark-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Share Video</h3>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <ShareModalContent video={video} onClose={() => setShowShareModal(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ShareModalContent({ video, onClose }: { video: Video; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const videoUrl = `${window.location.origin}/video/${video.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = async () => {
    if (!video.video_url) {
      console.error('Video URL not available');
      return;
    }

    setDownloading(true);
    try {
      // Get the video URL - use ensureSupabaseVideoUrl to get the full URL
      const videoFileUrl = ensureSupabaseVideoUrl(video.video_url) || video.video_url;
      
      // Fetch the video file
      const response = await fetch(videoFileUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch video');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      // Get file extension from URL or default to mp4
      const extension = videoFileUrl.split('.').pop()?.split('?')[0] || 'mp4';
      a.download = `${video.title || 'groovely-video'}-${video.id}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Haptic feedback
      try {
        const { Haptics, NotificationType } = await import('@capacitor/haptics');
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
    } catch (err) {
      console.error('Failed to download video:', err);
      alert('Failed to download video. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: video.title || 'Check out this video',
          text: video.description || '',
          url: videoUrl,
        });
        onClose();
      } catch (err) {
        // User cancelled or error
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      // Fallback to copy
      handleCopyLink();
    }
  };

    return (
      <div className="space-y-4">
      {/* Native Share (for TikTok, Snapchat, Instagram, etc.) */}
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          onClick={handleNativeShare}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-groovely-peach-500 to-groovely-orange-500 rounded-xl hover:opacity-90 transition-opacity text-white font-semibold"
        >
          <Share2 size={20} />
          <span>Share to Social Media</span>
        </button>
      )}

      {/* Copy Link Button */}
      <button
        onClick={handleCopyLink}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-groovely-dark-card border border-groovely-dark-border rounded-xl hover:bg-groovely-dark-card/80 transition-colors text-white"
      >
        {copied ? (
          <>
            <Check size={20} className="text-green-400" />
            <span>Link Copied!</span>
          </>
        ) : (
          <>
            <Copy size={20} />
            <span>Copy Link</span>
          </>
        )}
      </button>

      {/* Save to Device Button */}
      <button
        onClick={handleDownload}
        disabled={downloading || !video.video_url}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-groovely-dark-card border border-groovely-dark-border rounded-xl hover:bg-groovely-dark-card/80 transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? (
          <>
            <Sparkles size={20} className="animate-spin" />
            <span>Downloading...</span>
          </>
        ) : (
          <>
            <Download size={20} />
            <span>Save to Device</span>
          </>
        )}
      </button>
    </div>
  );
}