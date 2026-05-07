import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Calendar, Heart, Bookmark, Repeat2, MessageCircle, Sparkles, Video as VideoIcon, FileText, Upload, TrendingUp, Clock, Zap, Play, X, Edit, Save, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Video } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, LoadingSpinner, PageHeader } from '../components/ios';
import { CommentComposer } from '../components/CommentComposer';
import { ViewCount } from '../components/ViewCount';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { getApiBaseUrl } from '../lib/api';
import { staggerContainerVariants, staggerItemVariants } from '../animations';

const API_URL = getApiBaseUrl();

const resolveStaticUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalised}`;
};

export function VideoDetail() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [critiqueContent, setCritiqueContent] = useState<string | null>(null);
  const [loadingCritique, setLoadingCritique] = useState(false);
  const [routineTitle, setRoutineTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Engagement state
  const [liked, setLiked] = useState(false);
  const [hasFavorited, setHasFavorited] = useState(false);
  const [hasReposted, setHasReposted] = useState(false);
  const [liking, setLiking] = useState(false);
  const [updatingFavorite, setUpdatingFavorite] = useState(false);
  const [updatingRepost, setUpdatingRepost] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [repostCount, setRepostCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const hasTrackedViewRef = useRef(false); // Use ref to persist across re-renders
  const lastVideoIdRef = useRef<string | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (!videoId) {
      setError('Missing video ID');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('videos')
          .select('*')
          .eq('id', videoId)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          setError('Video not found');
          setLoading(false);
          return;
        }

        const videoData = data as Video;
        setVideo(videoData);
        setEditedTitle(videoData.title || '');

        // Initialize engagement counts from video row
        setLikeCount(videoData.likes ?? 0);
        setFavoriteCount(videoData.favorites ?? 0);
        setRepostCount(videoData.reposts ?? 0);
        setCommentCount(videoData.comments ?? 0);
        
        // Only update viewCount if it's a different video OR if prop value is higher
        // This prevents resetting the count when we've already incremented it locally
        setViewCount(prev => {
          const propViews = videoData.views || 0;
          // If it's a new video, reset tracking and use prop value
          if (lastVideoIdRef.current !== videoId) {
            lastVideoIdRef.current = videoId;
            hasTrackedViewRef.current = false;
            return propViews;
          }
          // Otherwise, use the higher value (either prop or current state)
          return Math.max(prev, propViews);
        });
        
        // Fetch routine title if it's an attempt
        if (videoData.routine_id) {
          const { data: routineData } = await supabase
            .from('routines')
            .select('title')
            .eq('id', videoData.routine_id)
            .maybeSingle();
          
          if (routineData) {
            setRoutineTitle(routineData.title);
          }
        }
        
        // Check if this is a draft attempt and fetch score from attempts table if needed
        if (videoData.kind === 'attempt' && videoData.routine_id && videoData.video_url && user) {
          const { data: attempt } = await supabase
            .from('attempts')
            .select('status, ai_score')
            .eq('routine_id', videoData.routine_id)
            .eq('user_id', user.id)
            .eq('video_url', videoData.video_url)
            .maybeSingle();
          
          const isDraftAttempt = !attempt || attempt.status === 'draft';
          setIsDraft(isDraftAttempt);
          
          // If video doesn't have ai_score but attempt does, update the video data
          if ((videoData.ai_score === null || videoData.ai_score === undefined) && attempt?.ai_score !== null && attempt?.ai_score !== undefined) {
            videoData.ai_score = attempt.ai_score;
            setVideo({ ...videoData });
          }
        } else {
          setIsDraft(false);
        }

        // Fetch critique content if available
        if (videoData.ai_feedback?.critique_url) {
          setLoadingCritique(true);
          try {
            const critiqueUrl = resolveStaticUrl(videoData.ai_feedback.critique_url);
            const critiqueResponse = await fetch(critiqueUrl);
            if (critiqueResponse.ok) {
              const critiqueText = await critiqueResponse.text();
              setCritiqueContent(critiqueText);
            }
          } catch (e) {
          } finally {
            setLoadingCritique(false);
          }
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching video:', err);
        setError(err instanceof Error ? err.message : 'Failed to load video');
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId, user]);

  // Normalize comment row
  const normalizeComment = (entry: any) => ({
    id: entry.id,
    video_id: entry.video_id,
    user_id: entry.user_id,
    content: entry.content,
    created_at: entry.created_at,
    profiles: Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles,
  });

  // Load engagement state once video is available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!video) return;

      // Preload likes/favorites/reposts and initial comment list
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      let likeStatus: any = null;
      let favoriteStatus: any = null;
      let repostStatus: any = null;
      let likeCountRes: any = null;
      let favoriteCountRes: any = null;
      let repostCountRes: any = null;

      if (currentUser) {
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
            .eq('user_id', currentUser.id)
            .maybeSingle(),
          supabase
            .from('video_favorites')
            .select('id')
            .eq('video_id', video.id)
            .eq('user_id', currentUser.id)
            .maybeSingle(),
          supabase
            .from('video_reposts')
            .select('id')
            .eq('video_id', video.id)
            .eq('user_id', currentUser.id)
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
          { count: 'exact', head: false },
        )
        .eq('video_id', video.id)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!cancelled) {
        setLikeCount(likeCountRes?.count ?? video.likes ?? 0);
        setFavoriteCount(favoriteCountRes?.count ?? video.favorites ?? 0);
        setRepostCount(repostCountRes?.count ?? video.reposts ?? 0);
        // Only update viewCount from prop if:
        // 1. It's a different video, OR
        // 2. The prop value is higher than current (to handle external updates)
        setViewCount(prev => {
          const propViews = video.views || 0;
          // If it's a new video, reset tracking and use prop value
          if (lastVideoIdRef.current !== video.id) {
            lastVideoIdRef.current = video.id;
            hasTrackedViewRef.current = false;
            return propViews;
          }
          // Otherwise, use the higher value (either prop or current state)
          return Math.max(prev, propViews);
        });

        const normalized = (commentRes.data || []).map(normalizeComment);
        setComments(normalized);
        setCommentCount(commentRes.count ?? normalized.length ?? 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video?.id]);

  // Track view when video is viewed
  const trackView = useCallback(async () => {
    if (!videoId || hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true; // Mark as tracked immediately to prevent duplicates
    
    try {
      // Try RPC first, but if it fails, use direct update
      const { error: rpcError } = await supabase.rpc('increment_video_view', { video_id: videoId });
      
      if (rpcError) {
        // Fallback: direct update if RPC doesn't exist or fails
        const { error: updateError } = await supabase
          .from('videos')
          .update({ views: (video?.views || 0) + 1 })
          .eq('id', videoId);
        
        if (!updateError) {
          setViewCount(prev => prev + 1);
        } else {
          console.error('Error tracking view via direct update:', updateError);
          // Reset tracking flag on error so user can try again
          hasTrackedViewRef.current = false;
        }
      } else {
        // RPC succeeded, increment local state
        setViewCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error tracking view:', err);
      // Reset tracking flag on error
      hasTrackedViewRef.current = false;
    }
  }, [videoId, video?.views]);

  const ensureAuthenticated = async () => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      alert('Sign in to interact with videos.');
      return null;
    }
    return currentUser.id;
  };

  const handleLike = async () => {
    if (!video || liking) return;
    const userId = await ensureAuthenticated();
    if (!userId) return;

    setLiking(true);
    try {
      if (liked) {
        const { error } = await supabase
          .from('video_likes')
          .delete()
          .eq('video_id', video.id)
          .eq('user_id', userId);

        if (!error) {
          setLiked(false);
          setLikeCount((prev) => Math.max(0, prev - 1));
        }
      } else {
        const { error } = await supabase
          .from('video_likes')
          .insert({
            video_id: video.id,
            user_id: userId,
          });

        if (!error) {
          setLiked(true);
          setLikeCount((prev) => prev + 1);
        }
      }
    } catch (err) {
      console.error('Error toggling like:', err);
    } finally {
      setLiking(false);
    }
  };

  const handleFavorite = async () => {
    if (!video || updatingFavorite) return;
    const userId = await ensureAuthenticated();
    if (!userId) return;

    setUpdatingFavorite(true);
    try {
      if (hasFavorited) {
        const { error } = await supabase
          .from('video_favorites')
          .delete()
          .eq('video_id', video.id)
          .eq('user_id', userId);

        if (!error) {
          setHasFavorited(false);
          setFavoriteCount((prev) => Math.max(0, prev - 1));
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
          setFavoriteCount((prev) => prev + 1);
        }
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setUpdatingFavorite(false);
    }
  };

  const handleRepost = async () => {
    if (!video || updatingRepost) return;
    const userId = await ensureAuthenticated();
    if (!userId) return;

    setUpdatingRepost(true);
    try {
      if (hasReposted) {
        const { error } = await supabase
          .from('video_reposts')
          .delete()
          .eq('video_id', video.id)
          .eq('user_id', userId);

        if (!error) {
          setHasReposted(false);
          setRepostCount((prev) => Math.max(0, prev - 1));
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
          setRepostCount((prev) => prev + 1);
        }
      }
    } catch (err) {
      console.error('Error toggling repost:', err);
    } finally {
      setUpdatingRepost(false);
    }
  };

  const handleComment = async () => {
    if (!video || !comment.trim() || postingComment) return;
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
          'id, video_id, user_id, content, created_at, profiles!video_comments_user_id_fkey(username, avatar_url, display_name)',
        )
        .maybeSingle();

      if (!error && data) {
        const normalized = normalizeComment(data);
        setComments((prev) => [normalized, ...prev]);
        setCommentCount((prev) => prev + 1);
        setComment('');
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const handlePublishToFeed = async () => {
    if (!video || !user || !video.routine_id) return;
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    setPublishing(true);
    setError(null);
    try {
      // Find the draft attempt by matching video_url
      const { data: existingAttempts } = await supabase
        .from('attempts')
        .select('id, ai_score, ai_feedback, comparison_url, critique_url, status')
        .eq('routine_id', video.routine_id)
        .eq('user_id', user.id)
        .eq('video_url', video.video_url)
        .maybeSingle();

      if (existingAttempts) {
        // Update attempt status to published
        const { error: updateError } = await supabase
          .from('attempts')
          .update({ 
            status: 'published',
            video_url: video.video_url,
          })
          .eq('id', existingAttempts.id);

        if (updateError) {
          console.error('Error updating attempt status:', updateError);
          throw new Error(`Failed to update attempt: ${updateError.message}`);
        }
      } else {
        // Create new published attempt
        const { error: createError } = await supabase
          .from('attempts')
          .insert({
            routine_id: video.routine_id,
            user_id: user.id,
            video_url: video.video_url,
            ai_score: video.ai_score,
            ai_feedback: video.ai_feedback,
            comparison_url: video.ai_feedback?.comparison_url,
            critique_url: video.ai_feedback?.critique_url,
            status: 'published',
          });

        if (createError) {
          console.error('Error creating attempt record:', createError);
          throw new Error(`Failed to create attempt record: ${createError.message}`);
        }
      }

      // Update user's total score
      const { data: publishedAttempts } = await supabase
        .from('attempts')
        .select('ai_score')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .not('ai_score', 'is', null);

      const totalScore = publishedAttempts?.reduce((sum, attempt) => {
        return sum + (attempt.ai_score || 0);
      }, 0) || 0;

      const { error: scoreError } = await supabase
        .from('profiles')
        .update({ score: totalScore })
        .eq('id', user.id);

      if (scoreError) {
        console.error('Error updating user score:', scoreError);
      } else {
        await refreshProfile();
      }

      // Update local state
      setIsDraft(false);
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      // Navigate back to profile
      navigate('/profile');
    } catch (err) {
      console.error('Error publishing video:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to publish video. Please try again.';
      setError(errorMessage);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!video || !user) return;
    
    const confirmed = window.confirm('Delete this video? This cannot be undone.');
    if (!confirmed) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }

    setDeleting(true);
    try {
      // If it's an attempt, delete from attempts table first
      if (video.kind === 'attempt' && video.routine_id && video.video_url) {
        const { data: attempt } = await supabase
          .from('attempts')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('routine_id', video.routine_id)
          .eq('video_url', video.video_url)
          .maybeSingle();

        if (attempt) {
          const wasPublished = attempt.status === 'published';
          await supabase
            .from('attempts')
            .delete()
            .eq('id', attempt.id)
            .eq('user_id', user.id);

          // Recalculate score if it was published
          if (wasPublished) {
            const { data: publishedAttempts } = await supabase
              .from('attempts')
              .select('ai_score')
              .eq('user_id', user.id)
              .eq('status', 'published')
              .not('ai_score', 'is', null);

            const totalScore = publishedAttempts?.reduce((sum, a) => sum + (a.ai_score || 0), 0) || 0;
            await supabase
              .from('profiles')
              .update({ score: totalScore })
              .eq('id', user.id);
            await refreshProfile();
          }
        }
      }

      // Delete the video
      const { error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', video.id)
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }

      // If it's a reference video, also delete the routine
      if (video.kind === 'reference' && video.routine_id) {
        await supabase
          .from('routines')
          .delete()
          .eq('id', video.routine_id)
          .eq('creator_id', user.id);
      }

      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }

      // Navigate back to profile
      navigate('/profile');
    } catch (err) {
      console.error('Error deleting video:', err);
      alert('Failed to delete video. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!video || !user || !editedTitle.trim()) return;

    setSavingTitle(true);
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available
    }

    try {
      const { error: updateError } = await supabase
        .from('videos')
        .update({ title: editedTitle.trim() })
        .eq('id', video.id)
        .eq('user_id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setVideo({ ...video, title: editedTitle.trim() });
      setIsEditingTitle(false);

      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch (e) {
        // Haptics not available
      }
    } catch (err) {
      console.error('Error renaming video:', err);
      setError('Failed to rename video. Please try again.');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedTitle(video?.title || '');
    setIsEditingTitle(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-groovely-dark-bg flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-groovely-dark-bg">
        <PageHeader
          title="Video Not Found"
          subtitle="THIS VIDEO DOES NOT EXIST"
          icon={<VideoIcon size={32} className="text-white/90" />}
          bottomPadding="xl"
          maxWidth="4xl"
        />
        <div className="max-w-4xl mx-auto px-6">
          <Card variant="elevated" className="text-center py-12">
            <VideoIcon size={48} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
            <p className="text-base text-groovely-dark-text-secondary mb-6">{error || 'This video does not exist or has been deleted.'}</p>
            <Button variant="primary" onClick={() => navigate('/profile')}>
              <ArrowLeft size={18} className="mr-2" />
              Back to Profile
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const isOwner = user && video.user_id === user.id;
  const isAttempt = video.kind === 'attempt';
  const isReference = video.kind === 'reference';
  const comparisonUrl = video.ai_feedback?.comparison_url;

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      {/* Header with Enhanced Buttons */}
      <div className="bg-groovely-dark-surface border-b border-groovely-dark-border sticky top-0 z-20 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Back Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 px-4 py-2 bg-groovely-dark-card/80 hover:bg-groovely-dark-card border border-groovely-dark-border rounded-xl text-white transition-all duration-300 shadow-lg backdrop-blur-sm"
            >
              <ArrowLeft size={18} />
              <span className="font-medium">Back</span>
            </motion.button>

            {/* Title */}
            <div className="flex-1 flex items-center justify-center gap-3">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="text-white/90"
              >
                <VideoIcon size={24} />
              </motion.div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white font-heading">
                  {isDraft ? 'Draft Attempt' : isAttempt ? 'Your Attempt' : isReference ? 'Routine Reference' : 'Video'}
                </h1>
                <p className="text-xs text-groovely-dark-text-tertiary uppercase mt-1">
                  {isDraft ? 'Review Before Publishing' : isAttempt ? 'Your Performance' : isReference ? 'Reference Video' : 'Video Details'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            {isOwner && (
              <div className="flex items-center gap-2">
                {isDraft && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={handlePublishToFeed}
                    disabled={publishing}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 hover:from-groovely-peach-600 hover:to-groovely-purple-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-groovely-peach-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {publishing ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        <span>Publish</span>
                      </>
                    )}
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setIsEditingTitle(!isEditingTitle)}
                  className="flex items-center gap-2 px-4 py-2 bg-groovely-dark-card/80 hover:bg-groovely-dark-card border border-groovely-dark-border text-white font-semibold rounded-xl transition-all duration-300 shadow-lg backdrop-blur-sm"
                >
                  <Edit size={18} />
                  <span>Rename</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 font-semibold rounded-xl transition-all duration-300 shadow-lg backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      <span>Delete</span>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-6">
        <motion.div
          variants={staggerContainerVariants}
          initial="initial"
          animate="animate"
          className="space-y-6"
        >
          {/* Main Video Player */}
          <motion.div variants={staggerItemVariants}>
            <Card variant="elevated" padding="none" className="overflow-hidden">
              <div className="relative bg-black aspect-video group">
                {video.video_url ? (
                  <video
                    src={video.video_url}
                    controls
                    className="w-full h-full object-contain"
                    playsInline
                    onPlay={trackView}
                    onLoadedData={() => {
                      // Track view when video is loaded and ready to play
                      trackView();
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <FileText size={64} className="mx-auto mb-4 text-groovely-dark-text-tertiary" />
                      <p className="text-groovely-dark-text-secondary">No video available</p>
                    </div>
                  </div>
                )}
                
                {/* Score Badge */}
                {video.ai_score !== null && video.ai_score !== undefined && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className="absolute top-4 right-4 bg-black/80 backdrop-blur-xl rounded-xl px-4 py-2.5 z-10 border border-groovely-peach-500/30"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-yellow-400" />
                      <div>
                        <div className="text-2xl font-bold text-white font-heading leading-none">{video.ai_score.toFixed(0)}</div>
                        <div className="text-xs text-groovely-dark-text-tertiary">/100</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Draft Badge */}
                {isDraft && (
                  <div className="absolute top-4 left-4 bg-yellow-500/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-semibold uppercase">
                    Draft
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Video Info Card */}
          <motion.div variants={staggerItemVariants}>
            <Card variant="elevated" className="backdrop-blur-xl">
              <div className="space-y-6">
                {/* Title and Description */}
                <div>
                  {isEditingTitle ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRename();
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          maxLength={100}
                          autoFocus
                          className="flex-1 px-4 py-2 bg-groovely-dark-surface/60 border border-groovely-dark-border rounded-xl text-xl font-bold text-white font-heading placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all"
                          placeholder="Enter video title..."
                        />
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleRename}
                          disabled={savingTitle || !editedTitle.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 hover:from-groovely-peach-600 hover:to-groovely-purple-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingTitle ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <Save size={18} />
                              <span>Save</span>
                            </>
                          )}
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleCancelEdit}
                          disabled={savingTitle}
                          className="flex items-center gap-2 px-4 py-2 bg-groovely-dark-surface/60 hover:bg-groovely-dark-surface border border-groovely-dark-border text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X size={18} />
                          <span>Cancel</span>
                        </motion.button>
                      </div>
                      <p className="text-xs text-groovely-dark-text-tertiary">
                        Press Enter to save or Escape to cancel
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h1 className="text-3xl font-bold text-white font-heading mb-2">{video.title}</h1>
                          {routineTitle && (
                            <p className="text-sm text-groovely-peach-400 mb-2">Routine: {routineTitle}</p>
                          )}
                          {video.description && (
                            <p className="text-base text-groovely-dark-text-secondary leading-relaxed">{video.description}</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Score Display - Prominent for attempts */}
                {isAttempt && video.ai_score !== null && video.ai_score !== undefined && (
                  <div className="pt-4 border-t border-groovely-dark-border">
                    <div className="bg-gradient-to-r from-groovely-peach-500/20 to-groovely-purple-500/20 border border-groovely-peach-500/30 rounded-xl p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
                            <Sparkles size={24} className="text-white" />
                          </div>
                          <div>
                            <p className="text-sm text-groovely-dark-text-tertiary uppercase font-subtext mb-1">Your Score</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-bold text-white font-heading">{Math.round(video.ai_score)}</span>
                              <span className="text-xl text-groovely-dark-text-secondary">/ 100</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-groovely-dark-text-secondary">
                            {video.ai_score >= 80 ? '🌟 Excellent!' :
                             video.ai_score >= 60 ? '✨ Great job!' :
                             video.ai_score >= 40 ? '👍 Good effort!' :
                             '💪 Keep practicing!'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-groovely-dark-border">
                  <div className="flex items-center gap-2 text-sm text-groovely-dark-text-tertiary">
                    <Calendar size={16} />
                    <span>{new Date(video.created_at).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</span>
                  </div>
                  {video.kind && (
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                      video.kind === 'reference' 
                        ? 'bg-blue-500/20 text-blue-300' 
                        : video.kind === 'attempt'
                        ? 'bg-groovely-peach-500/20 text-groovely-peach-300'
                        : 'bg-groovely-purple-500/20 text-groovely-purple-300'
                    }`}>
                      {video.kind === 'reference' ? 'Reference' : video.kind === 'attempt' ? 'Attempt' : 'Video'}
                    </div>
                  )}
                </div>

                {/* Engagement Stats & Actions - Only show for published videos */}
                {!isDraft && (
                  <div className="space-y-4 pt-4 border-t border-groovely-dark-border">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      {/* Views */}
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="text-center p-3 bg-groovely-dark-surface/60 rounded-xl border border-groovely-dark-border"
                      >
                        <ViewCount count={viewCount} size="md" className="justify-center mb-2" />
                        <div className="text-xs text-groovely-dark-text-tertiary mt-1">Views</div>
                      </motion.div>
                      
                      {[
                        { icon: Heart, value: likeCount, label: 'Likes', color: 'text-red-400' },
                        { icon: Bookmark, value: favoriteCount, label: 'Favorites', color: 'text-yellow-400' },
                        { icon: Repeat2, value: repostCount, label: 'Reposts', color: 'text-blue-400' },
                        { icon: MessageCircle, value: commentCount, label: 'Comments', color: 'text-green-400' },
                      ].map((stat) => {
                        const Icon = stat.icon;
                        return (
                          <motion.div
                            key={stat.label}
                            whileHover={{ scale: 1.05 }}
                            className="text-center p-3 bg-groovely-dark-surface/60 rounded-xl border border-groovely-dark-border"
                          >
                            <Icon size={18} className={`mx-auto mb-2 ${stat.color}`} />
                            <div className="text-2xl font-bold text-white font-heading">{stat.value}</div>
                            <div className="text-xs text-groovely-dark-text-tertiary mt-1">{stat.label}</div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Button
                        variant={liked ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={handleLike}
                        disabled={liking}
                        className="flex items-center gap-2"
                      >
                        <Heart
                          size={16}
                          className={liked ? 'text-white' : 'text-red-400'}
                          fill={liked ? 'currentColor' : 'none'}
                        />
                        <span>{liked ? 'Liked' : 'Like'}</span>
                      </Button>
                      <Button
                        variant={hasFavorited ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={handleFavorite}
                        disabled={updatingFavorite}
                        className="flex items-center gap-2"
                      >
                        <Bookmark
                          size={16}
                          className={hasFavorited ? 'text-white' : 'text-yellow-400'}
                          fill={hasFavorited ? 'currentColor' : 'none'}
                        />
                        <span>{hasFavorited ? 'Saved' : 'Save'}</span>
                      </Button>
                      <Button
                        variant={hasReposted ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={handleRepost}
                        disabled={updatingRepost}
                        className="flex items-center gap-2"
                      >
                        <Repeat2 size={16} className={hasReposted ? 'text-white' : 'text-blue-400'} />
                        <span>{hasReposted ? 'Reposted' : 'Repost'}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Comments Section */}
          {!isDraft && (
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-groovely-purple-500 to-groovely-pink-500 rounded-lg flex items-center justify-center">
                      <MessageCircle size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white font-heading">Comments</h3>
                      <p className="text-xs text-groovely-dark-text-tertiary">
                        {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Comment input */}
                <CommentComposer
                  value={comment}
                  onChange={setComment}
                  onSubmit={handleComment}
                  placeholder="Leave a comment…"
                  disabled={!user}
                  isSubmitting={postingComment}
                  userAvatarUrl={profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null}
                  userInitial={profile?.display_name || profile?.username || user?.email || undefined}
                  authMessage={user ? undefined : 'Sign in to comment'}
                  onAuthAction={() => navigate('/login')}
                  className="mb-4"
                />

                {/* Comment list */}
                {comments.length > 0 ? (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {comments.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {c.profiles?.avatar_url ? (
                            <img
                              src={c.profiles.avatar_url}
                              alt={c.profiles.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserIcon size={16} className="text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-white">
                              {c.profiles?.display_name || c.profiles?.username || 'Dancer'}
                            </span>
                            <span className="text-xs text-groovely-dark-text-tertiary">
                              {new Date(c.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-groovely-dark-text-secondary break-words">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-groovely-dark-text-tertiary py-4 text-center">
                    Be the first to comment on this video.
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Comparison Video Section */}
          {comparisonUrl && (
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                      <VideoIcon size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white font-heading">Comparison Video</h3>
                      <p className="text-sm text-groovely-dark-text-secondary">Side-by-side analysis</p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowComparison(!showComparison)}
                  >
                    {showComparison ? (
                      <>
                        <X size={16} className="mr-2" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Play size={16} className="mr-2" />
                        Show
                      </>
                    )}
                  </Button>
                </div>

                <AnimatePresence>
                  {showComparison && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-black rounded-xl overflow-hidden aspect-video mt-4">
                        <video
                          src={resolveStaticUrl(comparisonUrl)}
                          controls
                          className="w-full h-full object-contain"
                          playsInline
                          preload="auto"
                          onError={(e) => {
                            console.error('Comparison video error:', e);
                            setError('Failed to load comparison video');
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          )}

          {/* ChoreoCoach Notes Section */}
          {critiqueContent && (
            <motion.div variants={staggerItemVariants}>
              <Card variant="elevated" className="backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-lg flex items-center justify-center">
                    <TrendingUp size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white font-heading">ChoreoCoach Notes</h3>
                    <p className="text-sm text-groovely-dark-text-secondary">Performance analysis & tips</p>
                  </div>
                </div>

                {loadingCritique ? (
                  <div className="text-center py-8">
                    <LoadingSpinner size="md" />
                    <p className="text-sm text-groovely-dark-text-secondary mt-4">Loading critique...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none">
                    {critiqueContent.split('\n').map((line, idx) => {
                      if (line.startsWith('# ')) {
                        return (
                          <h2 key={idx} className="text-xl font-bold text-white mt-6 mb-3 font-heading">
                            {line.replace('# ', '')}
                          </h2>
                        );
                      }
                      if (line.startsWith('## ')) {
                        return (
                          <h3 key={idx} className="text-lg font-semibold text-white mt-4 mb-2 font-heading">
                            {line.replace('## ', '')}
                          </h3>
                        );
                      }
                      if (line.startsWith('- **t=')) {
                        const match = line.match(/- \*\*t=([\d.]+)s\*\* — (.+)/);
                        if (match) {
                          const [, time, notes] = match;
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="flex items-start gap-3 mb-3 p-4 bg-groovely-dark-surface/60 rounded-xl border border-groovely-dark-border"
                            >
                              <Clock size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <span className="text-blue-400 font-semibold">{time}s</span>
                                <span className="text-groovely-dark-text-secondary ml-2">{notes}</span>
                              </div>
                            </motion.div>
                          );
                        }
                      }
                      if (line.startsWith('- ')) {
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-start gap-2 mb-2 text-groovely-dark-text-secondary"
                          >
                            <Zap size={14} className="text-yellow-400 mt-1 flex-shrink-0" />
                            <span>{line.replace('- ', '')}</span>
                          </motion.div>
                        );
                      }
                      if (line.trim() === '') {
                        return <br key={idx} />;
                      }
                      if (line.includes('**')) {
                        const parts = line.split('**');
                        return (
                          <p key={idx} className="text-groovely-dark-text-secondary mb-2">
                            {parts.map((part, i) =>
                              i % 2 === 1 ? (
                                <strong key={i} className="text-white">
                                  {part}
                                </strong>
                              ) : (
                                part
                              )
                            )}
                          </p>
                        );
                      }
                      return (
                        <p key={idx} className="text-groovely-dark-text-secondary mb-2">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Try Again Action - Only for published attempts and reference routines */}
          {isOwner && !isDraft && video.routine_id && (
            <motion.div variants={staggerItemVariants}>
              {isAttempt ? (
                <Card variant="elevated" className="bg-groovely-peach-500/10 border border-groovely-peach-500/30">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1 font-heading flex items-center gap-2">
                        <Play size={20} className="text-groovely-peach-400" />
                        Try This Routine Again
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary">
                        Practice this routine again to improve your score
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => navigate(`/try/${video.routine_id}`)}
                      className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500"
                    >
                      <Play size={18} className="mr-2" />
                      Try Dance
                    </Button>
                  </div>
                </Card>
              ) : isReference ? (
                <Card variant="elevated" className="bg-blue-500/10 border border-blue-500/30">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1 font-heading flex items-center gap-2">
                        <VideoIcon size={20} className="text-blue-400" />
                        Practice This Routine
                      </h3>
                      <p className="text-sm text-groovely-dark-text-secondary">
                        Try this routine and see how you compare
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => navigate(`/try/${video.routine_id}`)}
                      className="!bg-gradient-to-r !from-blue-500 !to-purple-500"
                    >
                      <Play size={18} className="mr-2" />
                      Try Dance
                    </Button>
                  </div>
                </Card>
              ) : null}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
