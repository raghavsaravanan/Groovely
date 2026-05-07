import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Upload, X, Sparkles, TrendingUp, Clock, Zap, Check, ArrowLeft, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Card, LoadingOverlay } from '../components/ios';
import { useAuth } from '../contexts/AuthContext';
import { supabase, DanceStyle } from '../lib/supabase';
import { apiFetch, apiUrl, getApiBaseUrl, wakeUpBackend } from '../lib/api';
import { Haptics, NotificationType } from '@capacitor/haptics';

const API_URL = getApiBaseUrl();

// Simple scoring status messages for the loading overlay.
// We no longer simulate fine-grained phases with fake timings.
const SCORING_PHASES = [
  { threshold: 100, label: 'Processing your attempt...' },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RoutineResponse = {
  routine_id: string;
  title?: string;
  video_url: string;
  audio_url: string;
};

type TryResponse = {
  try_id: string;
  score: number | null;
  critique_url: string | null;
  comparison_url: string | null;
  user_video_url?: string | null;
  routine_video_url?: string | null;
  processing?: boolean; // Indicates if scoring is still in progress
};

const resolveStaticUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalised}`;
};

const getSupportedMimeType = () => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

// normalize a route id into the canonical backend id (strip non-hex, lowercase)
function normalizeRoutineId(id?: string | null): string | null {
  if (!id) return null;
  const compact = id.replace(/[^0-9a-fA-F]/g, '');
  if (!compact) return null;
  return compact.toLowerCase();
}

export function TryDance() {
  const { routineId: routeRoutineId } = useParams();
  const navigate = useNavigate();
  const normalizedRoutineId = useMemo(() => normalizeRoutineId(routeRoutineId), [routeRoutineId]);
  const { user, refreshProfile } = useAuth();
  
  const [routine, setRoutine] = useState<RoutineResponse | null>(null);
  const [loadingRoutine, setLoadingRoutine] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attemptFile, setAttemptFile] = useState<File | null>(null);
  const [attemptUrl, setAttemptUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TryResponse | null>(null);
  const [critiqueContent, setCritiqueContent] = useState<string | null>(null);
  const [loadingCritique, setLoadingCritique] = useState(false);
  // Comparison video URL is returned by backend as part of TryResponse
  
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [routineAttempts, setRoutineAttempts] = useState<{ id: string; user_id: string; ai_score: number | null; video_url: string; created_at: string; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null }[]>([]);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  
  // Modal state for naming and categorizing attempts
  const [showNameModal, setShowNameModal] = useState(false);
  const [modalAction, setModalAction] = useState<'draft' | 'publish' | null>(null);
  const [attemptTitle, setAttemptTitle] = useState('');
  const [selectedDanceStyleId, setSelectedDanceStyleId] = useState<string | null>(null);
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [pendingResult, setPendingResult] = useState<TryResponse | null>(null);
  const [scoringProgress, setScoringProgress] = useState(0);
  const [scoringStatus, setScoringStatus] = useState(SCORING_PHASES[0].label);

  const routineVideoRef = useRef<HTMLVideoElement | null>(null);
  const routineAudioRef = useRef<HTMLAudioElement | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const attemptPreviewRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  
  const supportedMimeType = useMemo(getSupportedMimeType, []);

  // Check backend health once to help diagnose connectivity issues
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/health');
        if (!cancelled) setApiHealthy(res.ok);
      } catch {
        if (!cancelled) setApiHealthy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch dance styles for categorization
  useEffect(() => {
    const fetchDanceStyles = async () => {
      const { data } = await supabase
        .from('dance_styles')
        .select('*')
        .order('name');
      
      if (data) {
        setDanceStyles(data);
      }
    };
    
    fetchDanceStyles();
  }, []);

  const refreshRoutineAttempts = useCallback(async () => {
    if (!normalizedRoutineId) return;
    const { data } = await supabase
      .from('attempts')
      .select('id, user_id, ai_score, video_url, created_at, profiles:user_id(username, display_name, avatar_url)')
      .eq('routine_id', normalizedRoutineId)
      .eq('status', 'published')
      .not('ai_score', 'is', null)
      .order('ai_score', { ascending: false })
      .limit(5);
    if (data) setRoutineAttempts(data as any);
  }, [normalizedRoutineId]);

  // Poll for score updates when result is available but score is null (background processing)
  // This ensures scores are displayed even if they're computed after the user saves as draft
  useEffect(() => {
    const videoUrl = result?.user_video_url || pendingResult?.user_video_url;
    const currentScore = result?.score ?? pendingResult?.score;
    
    if (!videoUrl || (currentScore !== null && currentScore !== undefined)) {
      return;
    }

    // Poll for up to 5 minutes (60 * 5 seconds) to catch scores computed in background
    const maxPolls = 60;
    let pollCount = 0;
    let cancelled = false;

    const pollForScore = async () => {
      if (cancelled || pollCount >= maxPolls) return;

      try {
        // Check if video exists in database and has a score
        const { data: videoData } = await supabase
          .from('videos')
          .select('id, ai_score')
          .eq('video_url', videoUrl)
          .maybeSingle();

        if (!cancelled && videoData && videoData.ai_score !== null && videoData.ai_score !== undefined) {
          // Update both result and pendingResult if they match
          if (result?.user_video_url === videoUrl) {
            setResult(prev => prev ? { ...prev, score: videoData.ai_score } : prev);
          }
          if (pendingResult?.user_video_url === videoUrl) {
            setPendingResult(prev => prev ? { ...prev, score: videoData.ai_score } : prev);
          }
          return; // Stop polling once we have the score
        }
      } catch (err) {
        console.error('Error polling for score:', err);
      }

      pollCount++;
      if (pollCount < maxPolls) {
        setTimeout(pollForScore, 5000); // Poll every 5 seconds
      }
    };

    // Start polling after 3 seconds (give backend time to start processing)
    const timeoutId = setTimeout(pollForScore, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [result?.user_video_url, result?.score, pendingResult?.user_video_url, pendingResult?.score]);

  // Helper function to update user's total score based on all published attempts
  const updateUserScore = useCallback(async (userId: string) => {
    try {
      // Calculate total score from all published attempts
      const { data: publishedAttempts, error } = await supabase
        .from('attempts')
        .select('ai_score')
        .eq('user_id', userId)
        .eq('status', 'published')
        .not('ai_score', 'is', null);

      if (error) {
        console.error('Error fetching published attempts:', error);
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

      // Refresh profile in AuthContext to sync score across all components
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update user score:', err);
      // Don't throw - score update failure shouldn't break the save/publish flow
    }
  }, [refreshProfile]);

  const saveAsDraft = useCallback(
    async (payload: TryResponse, title?: string, danceStyleId?: string | null) => {
      // Allow saving even if score is null (processing in background)
      // Prefer the final live score from recording if available; otherwise use backend score.
      const effectiveScore = payload.score;
      const roundedScore =
        effectiveScore !== null && effectiveScore !== undefined
          ? Math.round(effectiveScore)
          : null;
      if (!user || !normalizedRoutineId) return;
      setPublishing(true);
      setError(null);
      try {
        const attemptVideoStatic = payload.user_video_url ? resolveStaticUrl(payload.user_video_url) : '';
        // Comparison and critique removed - not generated anymore
        const comparisonStatic: string | null = null;
        const critiqueStatic: string | null = null;
        
        // Validate video URL
        if (!attemptVideoStatic || attemptVideoStatic.trim() === '') {
          throw new Error('Video URL is missing. Cannot save draft.');
        }
        
        // Score may be null if processing is in background
        // Use already calculated roundedScore from above
        
        // Use provided title or fallback to default
        const attemptTitle = title?.trim() || `${routine?.title ?? 'Routine'} – Attempt (Draft)`;


        // CRITICAL: Create/update video entry in videos table FIRST
        // This ensures the draft appears in the Profile's Drafts tab
        // Match by routine_id, user_id, kind, and video_url to find the exact video
        const { data: existingVideo } = await supabase
          .from('videos')
          .select('id')
          .eq('user_id', user.id)
          .eq('routine_id', normalizedRoutineId)
          .eq('kind', 'attempt')
          .eq('video_url', attemptVideoStatic)
          .maybeSingle();

        if (existingVideo) {
          // Update existing video entry (keep it as draft - don't change kind)
          const { error: updateVideoError } = await supabase
            .from('videos')
            .update({
              title: attemptTitle,
              description: 'Draft attempt from Try mode',
              video_url: attemptVideoStatic,
              ai_score: roundedScore,
              dance_style_id: danceStyleId || null,
              ai_feedback: {
                comparison_url: comparisonStatic,
                critique_url: critiqueStatic,
              },
            })
            .eq('id', existingVideo.id);
          
          if (updateVideoError) {
            console.error('Error updating draft video:', updateVideoError);
            throw new Error(`Failed to update draft video: ${updateVideoError.message}`);
          }
        } else {
          // Create new video entry for draft
          const { error: insertVideoError } = await supabase.from('videos').insert({
            user_id: user.id,
            title: attemptTitle,
            description: 'Draft attempt from Try mode',
            video_url: attemptVideoStatic,
            routine_id: normalizedRoutineId,
            kind: 'attempt',
            ai_score: roundedScore,
            dance_style_id: danceStyleId || null,
            ai_feedback: {
              comparison_url: comparisonStatic,
              critique_url: critiqueStatic,
            },
          });
          
          if (insertVideoError) {
            console.error('Error creating draft video:', insertVideoError);
            throw new Error(`Failed to create draft video: ${insertVideoError.message}`);
          }
        }

        // Update existing draft attempt or create new one in attempts table
        const { data: existingAttempt } = await supabase
          .from('attempts')
          .select('id')
          .eq('routine_id', normalizedRoutineId)
          .eq('user_id', user.id)
          .eq('status', 'draft')
          .maybeSingle();

        if (existingAttempt) {
          // Update existing draft
          const { error: updateAttemptError } = await supabase
            .from('attempts')
            .update({
              video_url: attemptVideoStatic,
              ai_score: roundedScore,
              ai_feedback: {
                comparison_url: comparisonStatic,
                critique_url: critiqueStatic,
              },
              comparison_url: comparisonStatic,
              critique_url: critiqueStatic,
              status: 'draft',
            })
            .eq('id', existingAttempt.id);
          
          if (updateAttemptError) {
            console.error('Error updating draft attempt:', updateAttemptError);
            // Don't throw - video is already saved, this is just metadata
          }
        } else {
          // Create new draft attempt
          const { error: insertAttemptError } = await supabase.from('attempts').insert({
            routine_id: normalizedRoutineId,
            user_id: user.id,
            video_url: attemptVideoStatic,
            ai_score: roundedScore,
            ai_feedback: {
              comparison_url: comparisonStatic,
              critique_url: critiqueStatic,
            },
            comparison_url: comparisonStatic,
            critique_url: critiqueStatic,
            status: 'draft',
          });
          
          if (insertAttemptError) {
            console.error('Error creating draft attempt:', insertAttemptError);
            // Don't throw - video is already saved, this is just metadata
          }
        }

        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 3000); // Hide message after 3 seconds
      } catch (err) {
        console.error('Failed to save draft attempt', err);
        setError((err as Error)?.message || 'Failed to save draft.');
      } finally {
        setPublishing(false);
      }
    },
    [user, normalizedRoutineId, routine, refreshRoutineAttempts]
  );

  const publishResultToSupabase = useCallback(
    async (payload: TryResponse, title?: string, danceStyleId?: string | null) => {
      if (!user || !normalizedRoutineId) return;
      setPublishing(true);
      setError(null);
      try {
        const routineVideoStatic = resolveStaticUrl(payload.routine_video_url || routine?.video_url || '');
        const attemptVideoStatic = payload.user_video_url ? resolveStaticUrl(payload.user_video_url) : '';
        // Comparison and critique removed - not generated anymore
        const comparisonStatic: string | null = null;
        const critiqueStatic: string | null = null;

        const { data: routineRow } = await supabase
          .from('routines')
          .select('*')
          .eq('id', normalizedRoutineId)
          .maybeSingle();
        
        if (!routineRow) {
          await supabase
            .from('routines')
            .insert({
              id: normalizedRoutineId,
              creator_id: user.id,
              title: routine?.title ?? 'Routine',
              song_url: routine ? resolveStaticUrl(routine.audio_url) : null,
              meta: {
                source: 'choreo-coach',
                audio_url: routine ? resolveStaticUrl(routine.audio_url) : null,
              },
            })
            .select();
        }

        const ownerId = routineRow?.creator_id ?? user.id;

        if (routineVideoStatic) {
          const { data: existingRef } = await supabase
          .from('videos')
            .select('id')
            .eq('routine_id', normalizedRoutineId)
            .eq('kind', 'reference')
            .maybeSingle();

          if (!existingRef) {
            await supabase.from('videos').insert({
              user_id: ownerId,
              title: routine?.title ?? 'Routine Reference',
              description: `Reference video for ${routine?.title ?? 'this routine'}`,
              video_url: routineVideoStatic,
              routine_id: normalizedRoutineId,
              kind: 'reference',
              ai_score: null,
              ai_feedback: null,
            });
          }
        }

        if (attemptVideoStatic) {
          // Validate video URL
          if (!attemptVideoStatic || attemptVideoStatic.trim() === '') {
            throw new Error('Video URL is missing. Cannot publish to feed.');
          }
          
          // Round score to integer since database column is integer type.
          // Prefer the final live score if available; otherwise use backend score.
          const effectiveScore = payload.score;
          const roundedScore =
            effectiveScore !== null && effectiveScore !== undefined
              ? Math.round(effectiveScore)
              : null;
          
          // Use provided title or fallback to default
          const attemptTitle = title?.trim() || `${routine?.title ?? 'Routine'} – Attempt`;
          
          
          // Check if a video with this exact video_url already exists
          // If so, update it (user is republishing the same attempt)
          // Otherwise, create a new video entry (user is creating a new attempt)
          const { data: existingVideo } = await supabase
            .from('videos')
            .select('id')
            .eq('video_url', attemptVideoStatic)
            .eq('user_id', user.id)
            .eq('routine_id', normalizedRoutineId)
            .eq('kind', 'attempt')
            .maybeSingle();

          let videoData;
          if (existingVideo) {
            // Update existing video entry (same video_url - republishing same attempt)
            const { data: updatedVideo, error: updateError } = await supabase
              .from('videos')
              .update({
                title: attemptTitle,
                description: 'Attempt posted from Try mode',
                video_url: attemptVideoStatic,
                ai_score: roundedScore,
                dance_style_id: danceStyleId || null,
                ai_feedback: {
                  comparison_url: comparisonStatic,
                  critique_url: critiqueStatic,
                },
              })
              .eq('id', existingVideo.id)
              .select();
            
            if (updateError) {
              console.error('Error updating video in feed:', updateError);
              throw new Error(`Failed to update video in feed: ${updateError.message}`);
            }
            
            videoData = updatedVideo;
          } else {
            // Create new video entry (new attempt - different video_url)
            const { data: newVideo, error: videoError } = await supabase.from('videos').insert({
              user_id: user.id,
              title: attemptTitle,
              description: 'Attempt posted from Try mode',
              video_url: attemptVideoStatic,
              routine_id: normalizedRoutineId,
              kind: 'attempt',
              ai_score: roundedScore,
              dance_style_id: danceStyleId || null,
              ai_feedback: {
                comparison_url: comparisonStatic,
                critique_url: critiqueStatic,
              },
            }).select();
            
            if (videoError) {
              console.error('Error inserting video to feed:', videoError);
              console.error('Video data that failed:', {
                user_id: user.id,
                title: attemptTitle,
                video_url: attemptVideoStatic,
                routine_id: normalizedRoutineId,
                kind: 'attempt',
                ai_score: roundedScore,
              });
              throw new Error(`Failed to publish video to feed: ${videoError.message}`);
            }
            
            videoData = newVideo;
          }
          
          if (!videoData || videoData.length === 0) {
            console.error('No data returned from insert/update');
            throw new Error('Video operation succeeded but no data returned');
          }
          
          // CRITICAL: Always create a NEW attempt record when publishing
          // This allows users to have multiple attempts per routine - all attempts are preserved
          // We never update existing attempts, only create new ones
          const { data: newAttempt, error: insertAttemptError } = await supabase.from('attempts').insert({
            routine_id: normalizedRoutineId,
            user_id: user.id,
            video_url: attemptVideoStatic,
            ai_score: roundedScore,
            ai_feedback: {
              comparison_url: comparisonStatic,
              critique_url: critiqueStatic,
            },
            comparison_url: comparisonStatic,
            critique_url: critiqueStatic,
            status: 'published',
          }).select();
          
          if (insertAttemptError) {
            console.error('Error creating attempt record:', insertAttemptError);
            // Check if error is about unique constraint (shouldn't happen after migration)
            if (insertAttemptError.message?.includes('unique') || insertAttemptError.message?.includes('duplicate')) {
              throw new Error(
                `Database constraint error: Multiple attempts per routine are not allowed. ` +
                `Please run the migration: supabase/migrations/20250131000001_remove_attempt_unique_constraint.sql ` +
                `in your Supabase SQL Editor. Error: ${insertAttemptError.message}`
              );
            }
            // Check if error is about missing status column
            if (insertAttemptError.message?.includes('status') || insertAttemptError.message?.includes('schema cache')) {
              throw new Error(
                `Database migration required: The 'status' column is missing from the 'attempts' table. ` +
                `Please run the migration: supabase/migrations/20250129000000_add_attempt_status.sql ` +
                `in your Supabase SQL Editor. Error: ${insertAttemptError.message}`
              );
            }
            throw new Error(`Failed to create attempt record as published: ${insertAttemptError.message}`);
          } else {
          }


          // Update user's total score for leaderboard
          try {
            await updateUserScore(user.id);
          } catch (scoreError) {
            console.error('Failed to update user score (non-critical):', scoreError);
            // Don't throw - score update failure shouldn't break the publish flow
          }
        }

        await refreshRoutineAttempts();
      } catch (err) {
        console.error('Failed to publish attempt to Supabase', err);
        const errorMessage = (err as Error)?.message || 'Failed to sync attempt to feed.';
        setError(errorMessage);
        setPublished(false);
        throw err; // Re-throw so caller can handle it
      } finally {
        setPublishing(false);
      }
    },
    [user, normalizedRoutineId, routine, refreshRoutineAttempts, updateUserScore]
  );

  // keep route canonical (strip dashes/uppercase) via redirect below

  useEffect(() => {
    setError(null);
    const fetchRoutine = async () => {
    if (!normalizedRoutineId) {
        setError('Missing routine id.');
      setLoadingRoutine(false);
      return;
    }
      // if route id is not canonical, redirect once
      if (routeRoutineId && normalizedRoutineId && routeRoutineId !== normalizedRoutineId) {
        navigate(`/try/${normalizedRoutineId}`, { replace: true });
      }
      try {
        // First try backend API
        const res = await apiFetch(`/api/routines/${normalizedRoutineId}`);
        if (!res.ok) {
          const errorText = await res.text();
          // If not found in backend, try Supabase
          if (res.status === 404) {
            const { data: routineData, error: routineError } = await supabase
              .from('routines')
              .select('*')
              .eq('id', normalizedRoutineId)
              .maybeSingle();
            
            if (routineError) {
              console.error('Supabase routine query error:', routineError);
            }
            
            if (routineData) {
              // Find reference video for this routine
              const { data: referenceVideo, error: videoError } = await supabase
                .from('videos')
                .select('video_url')
                .eq('routine_id', normalizedRoutineId)
                .eq('kind', 'reference')
                .maybeSingle();
              
              if (videoError) {
                console.error('Supabase video query error:', videoError);
              }
              
              if (referenceVideo?.video_url) {
                setRoutine({
                  routine_id: normalizedRoutineId,
                  title: routineData.title,
                  video_url: referenceVideo.video_url,
                  audio_url: routineData.song_url || routineData.meta?.audio_url || '',
                });
                setLoadingRoutine(false);
                return;
              } else {
                // Try to find any video with this routine_id
                const { data: anyVideo } = await supabase
                  .from('videos')
                  .select('video_url')
                  .eq('routine_id', normalizedRoutineId)
                  .limit(1)
                  .maybeSingle();
                
                if (anyVideo?.video_url) {
                  setRoutine({
                    routine_id: normalizedRoutineId,
                    title: routineData.title,
                    video_url: anyVideo.video_url,
                    audio_url: routineData.song_url || routineData.meta?.audio_url || '',
                  });
                  setLoadingRoutine(false);
                  return;
                } else {
                  throw new Error('Routine found in Supabase but no video available. Please ensure a reference video is uploaded.');
                }
              }
            } else {
              throw new Error(`Routine not found in backend or Supabase. ID: ${normalizedRoutineId}`);
            }
          }
          throw new Error(errorText);
        }
        const data: RoutineResponse = await res.json();
        if (!data.video_url) {
          throw new Error('Routine loaded but video URL is missing.');
        }
        setRoutine(data);
        setError(null);
      } catch (err) {
        console.error('Error loading routine:', err);
        setError(err instanceof Error ? err.message : 'Failed to load routine');
        setRoutine(null);
      } finally {
        setLoadingRoutine(false);
      }
    };
    fetchRoutine();
  }, [routeRoutineId, normalizedRoutineId]);

  useEffect(() => {
    if (routineVideoRef.current && routine?.video_url) {
      const videoUrl = resolveStaticUrl(routine.video_url);
      if (routineVideoRef.current.src !== videoUrl) {
        routineVideoRef.current.src = videoUrl;
        routineVideoRef.current.load();
      }
      // Try to play after a short delay to ensure video is loaded
      const playTimer = setTimeout(() => {
        if (routineVideoRef.current) {
          routineVideoRef.current.play().catch(() => {
            // autoplay blocked by browser policy — user can press play manually
          });
        }
      }, 100);
      return () => clearTimeout(playTimer);
    }
  }, [routine]);

  useEffect(() => {
    refreshRoutineAttempts();
  }, [refreshRoutineAttempts]);

  useEffect(() => () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (attemptUrl) URL.revokeObjectURL(attemptUrl);
  }, [attemptUrl]);

  // Reset scoring overlay state when (not) submitting.
  useEffect(() => {
    if (submitting) {
      // Start from 0 with a generic "processing" message.
      setScoringProgress(0);
      setScoringStatus('Processing your attempt...');
    } else {
      setScoringProgress(0);
      setScoringStatus(SCORING_PHASES[0].label);
    }
  }, [submitting]);

  // Handle setting the camera stream when camera is enabled and video element is available
  useEffect(() => {
    if (cameraEnabled && mediaStreamRef.current && cameraPreviewRef.current) {
      const v = cameraPreviewRef.current as HTMLVideoElement;
      // Only set if not already set to avoid unnecessary updates
      if (v.srcObject !== mediaStreamRef.current) {
        v.srcObject = mediaStreamRef.current;
        v.muted = true;
        (v as any).playsInline = true;
        v.autoplay = true as any;
        v.style.display = 'block';
        v.style.opacity = '1';
        v.style.visibility = 'visible';
        v.play().then(() => {
        }).catch((err) => {
          setTimeout(() => {
            v.play().catch(() => undefined);
          }, 200);
        });
      }
    }
  }, [cameraEnabled]);

  const ensureCamera = async () => {
    if (mediaStreamRef.current) {
      // Check if stream is still active
      const activeTracks = mediaStreamRef.current.getTracks().filter(track => track.readyState === 'live');
      if (activeTracks.length > 0) {
        return mediaStreamRef.current;
      }
      // Clean up inactive stream
      try { mediaStreamRef.current.getTracks().forEach(track => track.stop()); } catch {}
      mediaStreamRef.current = null;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true,
      });
      
      mediaStreamRef.current = stream;
      
      // Set cameraEnabled first so the video element gets rendered
      setCameraEnabled(true);
      setError(null);
      return stream;
    } catch (err) {
      console.error('Error accessing camera:', err);
      setCameraEnabled(false);
      throw err;
    }
  };

  const disableCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = null;
    }
    setCameraEnabled(false);
  };

  const handleEnableCamera = async () => {
    try {
      await ensureCamera();
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const handleDisableCamera = () => {
    disableCamera();
  };

  const runCountdown = async () => {
    setCountdown(3);
    for (let i = 3; i > 0; i--) {
      if (cancelRecordingRef.current) {
        setCountdown(null);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (cancelRecordingRef.current) {
        setCountdown(null);
        return false;
      }
      setCountdown(i - 1);
    }
    setCountdown(null);
    return true;
  };

  const startRecording = async () => {
    setError(null);
    if (!routine) {
      setError('Routine not loaded yet.');
      return;
    }
    if (!routine.audio_url) {
      setError('This routine is missing audio. Recording is disabled.');
      return;
    }
    if (!supportedMimeType) {
      setError('Recording format is not supported in this browser.');
      return;
    }

    try {
      const cameraStream = await ensureCamera();
      cancelRecordingRef.current = false;
      setIsRecording(true);
      const ready = await runCountdown();
      if (!ready || cancelRecordingRef.current) {
        setIsRecording(false);
        return;
      }

      // Create a mixed audio stream with reference audio + microphone
      let mixedStream: MediaStream;
      
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Get audio from reference video/audio element
        let referenceAudioSource: MediaElementAudioSourceNode | null = null;
        
        // Try audio element first (preferred)
        if (routineAudioRef.current && routineAudioRef.current.src) {
          try {
            // Check if source was already created (can only create once per element)
            if (!(routineAudioRef.current as any)._audioSourceNode) {
              const audioSource = audioContext.createMediaElementSource(routineAudioRef.current);
              (routineAudioRef.current as any)._audioSourceNode = audioSource;
              referenceAudioSource = audioSource;
            } else {
              // Reuse existing source node
              referenceAudioSource = (routineAudioRef.current as any)._audioSourceNode;
            }
          } catch (err) {
            // Try video element if audio element doesn't work
            if (routineVideoRef.current && routineVideoRef.current.src) {
              try {
                if (!(routineVideoRef.current as any)._audioSourceNode) {
                  const videoSource = audioContext.createMediaElementSource(routineVideoRef.current);
                  (routineVideoRef.current as any)._audioSourceNode = videoSource;
                  referenceAudioSource = videoSource;
                } else {
                  referenceAudioSource = (routineVideoRef.current as any)._audioSourceNode;
                }
              } catch (videoErr) {
              }
            }
          }
        } else if (routineVideoRef.current && routineVideoRef.current.src) {
          // Fallback to video element if audio element not available
          try {
            if (!(routineVideoRef.current as any)._audioSourceNode) {
              const videoSource = audioContext.createMediaElementSource(routineVideoRef.current);
              (routineVideoRef.current as any)._audioSourceNode = videoSource;
              referenceAudioSource = videoSource;
            } else {
              referenceAudioSource = (routineVideoRef.current as any)._audioSourceNode;
            }
          } catch (videoErr) {
          }
        }
        
        // Get microphone audio from camera stream
        const microphoneTrack = cameraStream.getAudioTracks()[0];
        let microphoneSource: MediaStreamAudioSourceNode | null = null;
        if (microphoneTrack) {
          const micStream = new MediaStream([microphoneTrack]);
          microphoneSource = audioContext.createMediaStreamSource(micStream);
        }
        
        // Create destination for mixed audio
        const destination = audioContext.createMediaStreamDestination();
        
        // Mix audio sources
        if (referenceAudioSource) {
          // Connect to both the mixed destination (for recording) and speakers (for playback)
          referenceAudioSource.connect(destination);
          referenceAudioSource.connect(audioContext.destination);
        }
        if (microphoneSource) {
          // Only connect microphone to mixed destination (not speakers to avoid feedback)
          microphoneSource.connect(destination);
        }
        
        // Create combined stream with video from camera and mixed audio
        const videoTrack = cameraStream.getVideoTracks()[0];
        const audioTracks = destination.stream.getAudioTracks();
        
        mixedStream = new MediaStream();
        if (videoTrack) {
          mixedStream.addTrack(videoTrack);
        }
        audioTracks.forEach(track => {
          mixedStream.addTrack(track);
        });
        
        // Store audio context for cleanup
        (mixedStream as any)._audioContext = audioContext;
        
      } catch (audioMixError) {
        // Fallback to camera stream only if mixing fails
        mixedStream = cameraStream;
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(mixedStream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        // Clean up audio context if it was created
        if ((mixedStream as any)._audioContext) {
          try {
            ((mixedStream as any)._audioContext as AudioContext).close();
          } catch (err) {
          }
        }
        
        // Clean up event listeners and restore video state
        if (routineVideoRef.current) {
          const handler = (routineVideoRef.current as any)._recordingEndHandler;
          if (handler) {
            routineVideoRef.current.removeEventListener('ended', handler);
            delete (routineVideoRef.current as any)._recordingEndHandler;
          }
          // Restore video state: mute and enable loop again
          routineVideoRef.current.muted = true;
          routineVideoRef.current.loop = true;
          routineVideoRef.current.pause();
          routineVideoRef.current.currentTime = 0;
        }
        
        if (routineAudioRef.current) {
          const handler = (routineAudioRef.current as any)._recordingEndHandler;
          if (handler) {
            routineAudioRef.current.removeEventListener('ended', handler);
            delete (routineAudioRef.current as any)._recordingEndHandler;
          }
          routineAudioRef.current.pause();
          routineAudioRef.current.currentTime = 0;
        }
        
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const file = new File(
          [blob],
          recorder.mimeType.includes('webm') ? 'user-attempt.webm' : 'user-attempt.mp4',
          { type: recorder.mimeType },
        );
        setAttemptFile(file);
        setResult(null);
        const url = URL.createObjectURL(blob);
        setAttemptUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        if (attemptPreviewRef.current) {
          attemptPreviewRef.current.src = url;
          attemptPreviewRef.current.load();
        }
        if (cameraPreviewRef.current) {
          try { cameraPreviewRef.current.pause(); } catch {}
        }
        mediaRecorderRef.current = null;
        cancelRecordingRef.current = false;
        setIsRecording(false);
      };

      // Configure video for recording: unmute, disable loop, and add end handler
      if (routineVideoRef.current) {
        routineVideoRef.current.currentTime = 0;
        routineVideoRef.current.muted = false; // Unmute so audio plays
        routineVideoRef.current.loop = false; // Don't loop during recording
        // Add handler to stop recording when video ends
        const handleVideoEnd = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            stopRecording();
          }
        };
        routineVideoRef.current.addEventListener('ended', handleVideoEnd);
        // Store handler for cleanup
        (routineVideoRef.current as any)._recordingEndHandler = handleVideoEnd;
        routineVideoRef.current.play().catch(() => undefined);
      }
      
      // Configure audio for recording and add end handler
      if (routineAudioRef.current) {
        routineAudioRef.current.currentTime = 0;
        // Add handler to stop recording when audio ends (as backup)
        const handleAudioEnd = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            stopRecording();
          }
        };
        routineAudioRef.current.addEventListener('ended', handleAudioEnd);
        // Store handler for cleanup
        (routineAudioRef.current as any)._recordingEndHandler = handleAudioEnd;
        routineAudioRef.current.play().catch(() => undefined);
      }

      recorder.start();
      
      // Set up 1-minute timer to stop recording automatically
      const MAX_RECORDING_TIME = 60000; // 1 minute in milliseconds
      const recordingTimer = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        }
      }, MAX_RECORDING_TIME);
      
      // Store timer reference for cleanup
      (recorder as any)._recordingTimer = recordingTimer;
    } catch (err) {
      console.error(err);
      setError('Failed to start recording. Please check camera permissions.');
      setCountdown(null);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    cancelRecordingRef.current = true;
    setCountdown(null);
    setIsRecording(false);
    
    // Clear recording timer if it exists
    if (mediaRecorderRef.current && (mediaRecorderRef.current as any)._recordingTimer) {
      clearTimeout((mediaRecorderRef.current as any)._recordingTimer);
      delete (mediaRecorderRef.current as any)._recordingTimer;
    }
    
    // Clean up event listeners and restore video state if recording was started
    if (routineVideoRef.current) {
      const handler = (routineVideoRef.current as any)._recordingEndHandler;
      if (handler) {
        routineVideoRef.current.removeEventListener('ended', handler);
        delete (routineVideoRef.current as any)._recordingEndHandler;
      }
      // Restore video state: mute and enable loop again
      routineVideoRef.current.muted = true;
      routineVideoRef.current.loop = true;
    }
    
    if (routineAudioRef.current) {
      const handler = (routineAudioRef.current as any)._recordingEndHandler;
      if (handler) {
        routineAudioRef.current.removeEventListener('ended', handler);
        delete (routineAudioRef.current as any)._recordingEndHandler;
      }
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileChange = (file: File | null) => {
    setError(null);
    setResult(null);
    setAttemptFile(file);
    if (attemptUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(attemptUrl);
    }
    setAttemptUrl(null);
    if (file) {
      const url = URL.createObjectURL(file);
      setAttemptUrl(url);
      if (attemptPreviewRef.current) {
        attemptPreviewRef.current.src = url;
        attemptPreviewRef.current.load();
      }
    } else if (attemptPreviewRef.current) {
      attemptPreviewRef.current.removeAttribute('src');
      attemptPreviewRef.current.load();
    }
  };

  const triggerFilePicker = () => {
    setError(null);
    if (fileInputRef.current && !isRecording) {
      fileInputRef.current.click();
    }
  };

  // Poll for score updates and show notification when ready
  const startScorePolling = useCallback((tryId: string, videoUrl: string | null | undefined) => {
    if (!videoUrl) return;
    
    let pollCount = 0;
    const maxPolls = 60; // Poll for up to 5 minutes (60 * 5 seconds)
    let notificationShown = false;
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    const pollForScore = async () => {
      if (pollCount >= maxPolls) return;
      
      try {
        const { data: videoData } = await supabase
          .from('videos')
          .select('ai_score')
          .eq('video_url', videoUrl)
          .maybeSingle();
        
        if (videoData && videoData.ai_score !== null && videoData.ai_score !== undefined) {
          // Score is ready!
          setResult(prev => prev ? { ...prev, score: videoData.ai_score } : prev);
          setScoringStatus('Scoring complete!');
          setScoringProgress(100);
          
          // Show browser notification if permission granted
          if (!notificationShown && 'Notification' in window && Notification.permission === 'granted') {
            notificationShown = true;
            new Notification('Score Ready!', {
              body: `Your dance attempt scored ${Math.round(videoData.ai_score)}/100!`,
              icon: '/logo.png',
              badge: '/logo.png',
              tag: `score-${tryId}`,
            });
          }
          
          return; // Stop polling
        }
      } catch (err) {
        console.error('Error polling for score:', err);
      }
      
      pollCount++;
      if (pollCount < maxPolls) {
        setTimeout(pollForScore, 5000); // Poll every 5 seconds
      }
    };
    
    // Start polling after 10 seconds (give backend time to start processing)
    setTimeout(pollForScore, 10000);
  }, []);

  const submitAttempt = async () => {
    if (!normalizedRoutineId || !attemptFile) {
      setError('Please record or upload a video before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setScoringStatus('Connecting to scoring service...');

    try {
      // Wake the backend if it is on a cold-start host (e.g. Render free tier).
      // Shows a friendly status message on first retry so users know what's happening.
      const isReady = await wakeUpBackend(() => {
        setScoringStatus('Warming up scoring service — hang tight…');
      });
      if (!isReady) {
        throw new Error(
          'The scoring service is not responding right now. Please try again in a moment.'
        );
      }

      setScoringProgress(0);
      setScoringStatus('Processing your attempt...');

      const formData = new FormData();
      formData.append('routine_id', normalizedRoutineId);
      formData.append('user_video', attemptFile, attemptFile.name || 'user-attempt.mp4');


      const response = await apiFetch('/api/tries', {
        method: 'POST',
        body: formData,
      });


      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          // Extract detail message from FastAPI error format
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          }
        } catch (e) {
          // If JSON parsing fails, try text
          try {
            const errorText = await response.text();
            if (errorText) {
              // Try to parse as JSON if it looks like JSON
              if (errorText.trim().startsWith('{')) {
                try {
                  const errorJson = JSON.parse(errorText);
                  errorMessage = errorJson.detail || errorJson.error || errorText;
                } catch {
                  errorMessage = errorText;
                }
              } else {
                errorMessage = errorText;
              }
            }
          } catch (textErr) {
            console.error('Failed to parse error response:', textErr);
          }
        }
        console.error('Error response from /api/tries:', errorMessage);
        throw new Error(errorMessage);
      }

      const data: TryResponse = await response.json();
      
      // Backend call finished successfully: mark scoring as complete.
      setScoringProgress(100);
      setScoringStatus('Scoring complete!');
      
      // Ensure we have a score before proceeding
      if (data.score === null || data.score === undefined) {
        throw new Error('Score not available. Please try again.');
      }

      
      // Set result with score
      setResult(data);

      if (data.user_video_url) {
        const staticAttempt = resolveStaticUrl(data.user_video_url);
        if (attemptUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(attemptUrl);
        }
        setAttemptUrl(staticAttempt);
        if (attemptPreviewRef.current) {
          attemptPreviewRef.current.src = staticAttempt;
          attemptPreviewRef.current.load();
        }
      }

      // Fetch critique content if available
      if (data.critique_url) {
        setLoadingCritique(true);
        try {
          const critiqueUrl = resolveStaticUrl(data.critique_url);
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

      setAttemptFile(null);
      
      // Show success message briefly before hiding loading
      await sleep(800);
    } catch (err) {
      console.error('Error submitting attempt:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit attempt';
      
      // Provide more helpful error messages
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        setError('Routine not found. Please ensure the routine exists in the backend.');
      } else if (errorMessage.includes('500') || errorMessage.includes('processing')) {
        setError('Video processing failed. Please ensure your video is in a supported format (MP4, WebM, MOV) and try again.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Network error. Please check your connection and ensure the backend server is running.');
      } else {
        setError(errorMessage);
      }
      setScoringStatus('Something went wrong');
      setScoringProgress(0);
      await sleep(1000);
    } finally {
      setSubmitting(false);
    }
  };

    return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      <div className="bg-groovely-dark-surface border-b border-groovely-dark-border sticky top-0 z-20 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-white font-heading">Try This Dance</h1>
            <motion.button
              onClick={() => navigate('/explore')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm"
            >
              <ArrowLeft size={24} className="text-white" />
            </motion.button>
          </div>
          <p className="text-sm text-groovely-dark-text-secondary font-subtext mt-1">
            WATCH THE ROUTINE, RECORD YOUR ATTEMPT, THEN SUBMIT FOR SCORING
          </p>
          {apiHealthy === false && (
            <div className="mt-2 text-xs text-red-400">
              Backend API at {API_URL} is not reachable. Please ensure the server is running and accessible.
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <Card variant="outline" className="border-red-500/50 bg-red-500/10 text-red-400">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300"
              >
                <X size={18} />
              </button>
            </div>
          </Card>
        )}

        <Card variant="elevated" padding="none" className="overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-2 bg-groovely-dark-card">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-white">
                <div>
                  <p className="text-xs uppercase tracking-wide text-groovely-dark-text-tertiary font-subtext">Reference</p>
                  <h2 className="text-lg font-semibold text-white font-heading">Routine</h2>
            </div>
            </div>
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                {loadingRoutine ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white">Loading...</div>
                ) : routine && routine.video_url ? (
                  <video
                    ref={routineVideoRef}
                    src={resolveStaticUrl(routine.video_url)}
                    className="w-full h-full object-contain"
                    loop
                    playsInline
                    muted
                    controls
                    crossOrigin="anonymous"
                    autoPlay
                    onError={(e) => {
                      const el = e.currentTarget as HTMLVideoElement;
                      console.error('Video load error:', {
                        src: el.currentSrc || el.src,
                        networkState: el.networkState,
                        error: (el.error && (el.error as any).message) || el.error,
                      });
                      setError(`Failed to load reference video. ${apiHealthy === false ? 'Backend API not reachable.' : ''}`.trim());
                    }}
                    onLoadedData={() => {
                      if (routineVideoRef.current) {
                        routineVideoRef.current.play().catch(() => undefined);
                      }
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    {error || (apiHealthy === false ? 'Backend API not reachable' : 'No video available')}
                  </div>
                )}
              </div>
              {routine && routine.audio_url && (
                <audio
                  ref={routineAudioRef}
                  src={resolveStaticUrl(routine.audio_url)}
                  controls={false}
                  className="hidden"
                  onError={(e) => {
                    console.error('Audio load error:', e);
                  }}
                  onLoadedData={() => {
                  }}
                />
              )}
                                </div>

            <div className="p-4 space-y-3 bg-groovely-dark-surface">
              <div className="flex items-center justify-between text-white">
                <div>
                  <p className="text-xs uppercase tracking-wide text-groovely-dark-text-tertiary font-subtext">Your Attempt</p>
                  <h2 className="text-lg font-semibold text-white font-heading">Capture</h2>
                </div>
                <div>
                  {cameraEnabled ? (
                    <Button variant="secondary" size="sm" onClick={handleDisableCamera} disabled={isRecording}>
                      <X size={16} className="mr-2" /> Disable Camera
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={handleEnableCamera} disabled={isRecording}>
                      <Camera size={16} className="mr-2" /> Enable Camera
                    </Button>
                  )}
                </div>
              </div>
                    
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                {/* Camera preview - always visible when camera is enabled, even during recording */}
                {cameraEnabled && (
                  <video
                    ref={cameraPreviewRef}
                    playsInline
                    muted
                    autoPlay
                    className={`absolute inset-0 w-full h-full object-cover z-10 ${
                      attemptUrl && !isRecording ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{ display: cameraEnabled ? 'block' : 'none' }}
                    onLoadedMetadata={() => {
                    }}
                    onError={(e) => {
                      console.error('Camera preview error:', e);
                      setError('Failed to display camera preview. Please check permissions.');
                    }}
                    onCanPlay={() => {
                      try {
                        cameraPreviewRef.current?.play();
                      } catch {}
                    }}
                  />
                )}
                {/* Recorded attempt preview - only shown when not recording */}
                {attemptUrl && !isRecording && (
                  <video
                    ref={attemptPreviewRef}
                    src={attemptUrl}
                    controls
                    className="absolute inset-0 w-full h-full object-contain z-20 bg-black"
                    playsInline
                    onCanPlay={() => {
                      try { attemptPreviewRef.current?.play(); } catch {}
                    }}
                    onError={(e) => {
                      console.error('Attempt preview error:', e);
                    }}
                  />
                )}
                {/* Recording indicator (no live score overlay) */}
                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold z-30 shadow-lg">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> REC
                  </div>
                )}
                {/* Countdown overlay - semi-transparent so camera preview is still visible */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-40 backdrop-blur-sm">
                    <span className="text-white text-6xl font-bold font-heading drop-shadow-2xl">{countdown === 0 ? 'GO' : countdown}</span>
                  </div>
                )}
                {/* Empty state - only shown when camera is disabled and no attempt */}
                {!attemptUrl && !isRecording && !cameraEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center text-groovely-dark-text-secondary text-sm bg-black/60 z-10">
                    Upload a video or enable the camera to start
                  </div>
                )}
                {/* Ready state - shown when camera is enabled but not recording */}
                {!attemptUrl && !isRecording && cameraEnabled && countdown === null && (
                  <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs font-semibold backdrop-blur-sm">
                    Ready — press Start Recording
                  </div>
                )}
                  </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button 
                  variant="primary" 
                  size="md" 
                  disabled={isRecording || !cameraEnabled || !routine} 
                  onClick={startRecording}
                >
                  <Camera size={18} className="mr-2" /> {isRecording ? 'Recording...' : 'Start Recording'}
                </Button>
                {isRecording && (
                  <Button variant="outline" size="md" onClick={stopRecording}>
                    <X size={18} className="mr-2" /> Stop
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  disabled={isRecording}
                />
                <Button variant="secondary" size="md" disabled={isRecording} onClick={triggerFilePicker}>
                  <Upload size={18} className="mr-2" /> Upload Video
                </Button>
              </div>
              {attemptFile && (
                <p className="text-xs text-groovely-dark-text-tertiary">Selected file: {attemptFile.name}</p>
              )}
            </div>
          </div>
                  </Card>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-base text-groovely-dark-text-secondary">
            Submit your attempt to get your dance score. The score will appear before you can publish.
            {submitting && (
              <div className="mt-2 text-sm text-groovely-dark-text-tertiary italic">
                Processing your video and computing score... Please wait.
              </div>
            )}
          </div>
          {!result ? (
            <Button
              variant="primary"
              size="lg"
              disabled={submitting || !attemptFile}
              onClick={submitAttempt}
            >
              Critique
            </Button>
          ) : null}
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card variant="elevated" className="bg-groovely-dark-card border border-groovely-dark-border">
                {/* Score Display */}
                <div className="flex flex-col gap-6">
                  {result.score !== null && result.score !== undefined ? (
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold font-heading ${
                            result.score >= 80 ? 'bg-green-500/20 text-green-400' :
                            result.score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {result.score.toFixed(0)}
                          </div>
                          <div className="absolute -top-1 -right-1">
                            <Sparkles size={20} className={result.score >= 80 ? 'text-green-400' : result.score >= 60 ? 'text-yellow-400' : 'text-red-400'} />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-groovely-dark-text-tertiary uppercase font-subtext">Your Score</p>
                          <p className="text-3xl font-bold text-white font-heading">{result.score.toFixed(1)} / 100</p>
                          <p className="text-sm text-groovely-dark-text-secondary mt-1">
                            {result.score >= 80 ? 'Excellent! You nailed it!' :
                             result.score >= 60 ? 'Great job! Keep practicing!' :
                             result.score >= 40 ? 'Good effort! Room for improvement.' :
                             '💪 Keep going! Practice makes perfect.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold font-heading bg-blue-500/20 text-blue-400">
                        ...
                      </div>
                      <div>
                        <p className="text-xs text-groovely-dark-text-tertiary uppercase font-subtext">Your Score</p>
                        <p className="text-3xl font-bold text-white font-heading">Processing...</p>
                        <p className="text-sm text-groovely-dark-text-secondary mt-1">
                          Your video is being scored. The score will appear here when ready.
                        </p>
                      </div>
                    </div>
                  )}
                    <div className="flex flex-wrap gap-3">
                      {/* Download Video Button */}
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={async () => {
                          try {
                            // Try to use original file first (if still available)
                            if (attemptFile) {
                              const url = URL.createObjectURL(attemptFile);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = attemptFile.name || 'dance-attempt.webm';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              
                              try {
                                await Haptics.notification({ type: NotificationType.Success });
                              } catch (e) {
                                // Haptics not available
                              }
                            } else if (attemptUrl && !attemptUrl.startsWith('blob:')) {
                              // Fallback: download from URL
                              const response = await fetch(attemptUrl);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `dance-attempt-${result.try_id}.mp4`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              
                              try {
                                await Haptics.notification({ type: NotificationType.Success });
                              } catch (e) {
                                // Haptics not available
                              }
                            } else {
                              setError('Video file not available for download');
                            }
                          } catch (err) {
                            console.error('Failed to download video:', err);
                            setError('Failed to download video. Please try again.');
                          }
                        }}
                        className="!bg-groovely-dark-surface !text-groovely-dark-text-secondary hover:!bg-groovely-dark-border"
                      >
                        <Download size={16} className="mr-2" /> Save to Device
                      </Button>
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => {
                          setPendingResult(result);
                          setModalAction('draft');
                          setAttemptTitle(`${routine?.title ?? 'Routine'} – Attempt (Draft)`);
                          setSelectedDanceStyleId(null);
                          setShowNameModal(true);
                        }}
                        disabled={publishing || draftSaved || result.score === null || result.score === undefined}
                        className={`!bg-groovely-dark-surface !text-groovely-dark-text-secondary hover:!bg-groovely-dark-border ${draftSaved ? '!bg-green-500/20 !text-green-400' : ''}`}
                      >
                        {draftSaved ? '✓ Draft Saved' : 'Save as Draft'}
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => {
                          setPendingResult(result);
                          setModalAction('publish');
                          setAttemptTitle(`${routine?.title ?? 'Routine'} – Attempt`);
                          setSelectedDanceStyleId(null);
                          setShowNameModal(true);
                        }}
                        disabled={publishing || published || result.score === null || result.score === undefined}
                        className={published ? '!bg-green-500/20 !text-green-400' : ''}
                      >
                        {published ? '✓ Published to Feed' : 'Publish to Feed'}
                      </Button>
                    </div>
                </div>

                {/* Comparison Video (opens side-by-side overlay in new tab) */}
                {result?.comparison_url && (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        const url = resolveStaticUrl(result.comparison_url!);
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="!bg-groovely-dark-surface !text-groovely-dark-text-secondary hover:!bg-groovely-dark-border"
                    >
                      <TrendingUp size={16} className="mr-2 text-blue-400" />
                      View Comparison Video
                    </Button>
                  </div>
                )}

                {/* Critique Content */}
                  {critiqueContent && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="mt-4 p-4 bg-groovely-dark-surface rounded-xl border border-groovely-dark-border"
                    >
                      <h3 className="text-lg font-semibold text-white font-heading mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-400" />
                        Performance Analysis & Tips
                      </h3>
                      <div className="prose prose-invert max-w-none">
                        {critiqueContent.split('\n').map((line, idx) => {
                          if (line.startsWith('# ')) {
                            return <h2 key={idx} className="text-xl font-bold text-white mt-6 mb-3 font-heading">{line.replace('# ', '')}</h2>;
                          }
                          if (line.startsWith('## ')) {
                            return <h3 key={idx} className="text-lg font-semibold text-white mt-4 mb-2 font-heading">{line.replace('## ', '')}</h3>;
                          }
                          if (line.startsWith('- **t=')) {
                            const match = line.match(/- \*\*t=([\d.]+)s\*\* — (.+)/);
                            if (match) {
                              const [, time, notes] = match;
                              return (
                                <div key={idx} className="flex items-start gap-3 mb-3 p-3 bg-groovely-dark-card rounded-lg border border-groovely-dark-border">
                                  <Clock size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-blue-400 font-semibold">{time}s</span>
                                    <span className="text-groovely-dark-text-secondary ml-2">{notes}</span>
                                  </div>
                                </div>
                              );
                            }
                          }
                          if (line.startsWith('- ')) {
                            return (
                              <div key={idx} className="flex items-start gap-2 mb-2 text-groovely-dark-text-secondary">
                                <Zap size={14} className="text-yellow-400 mt-1 flex-shrink-0" />
                                <span>{line.replace('- ', '')}</span>
                              </div>
                            );
                          }
                          if (line.trim() === '') {
                            return <br key={idx} />;
                          }
                          if (line.includes('**')) {
                            const parts = line.split('**');
                            return (
                              <p key={idx} className="text-groovely-dark-text-secondary mb-2">
                                {parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-white">{part}</strong> : part)}
                              </p>
                            );
                          }
                          return <p key={idx} className="text-groovely-dark-text-secondary mb-2">{line}</p>;
                        })}
                      </div>
                    </motion.div>
                  )}
                  {loadingCritique && (
                    <div className="text-center py-4 text-groovely-dark-text-secondary">
                      Loading critique...
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

        {/* Top Attempts Leaderboard */}
        {routineAttempts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card variant="elevated" padding="md">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-groovely-peach-500" />
                <h3 className="text-base font-bold text-white font-heading uppercase tracking-wide">
                  Top Attempts
                </h3>
              </div>
              <div className="space-y-2">
                {routineAttempts.map((attempt, idx) => {
                  const profile = attempt.profiles;
                  const medal = ['🥇', '🥈', '🥉'][idx] ?? `#${idx + 1}`;
                  const isCurrentUser = attempt.user_id === user?.id;
                  return (
                    <div
                      key={attempt.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                        isCurrentUser
                          ? 'bg-groovely-peach-500/10 border border-groovely-peach-500/30'
                          : 'bg-groovely-dark-surface hover:bg-groovely-dark-border'
                      }`}
                    >
                      <span className="text-lg w-6 text-center shrink-0">{medal}</span>
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.username}
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-groovely-dark-border flex items-center justify-center shrink-0">
                          <span className="text-xs text-groovely-dark-text-secondary">
                            {(profile?.display_name ?? profile?.username ?? '?')[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="flex-1 text-sm text-white truncate font-body">
                        {profile?.display_name ?? profile?.username ?? 'Anonymous'}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-xs text-groovely-peach-500 font-semibold">You</span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-groovely-peach-500 shrink-0 tabular-nums">
                        {attempt.ai_score?.toFixed(0)} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {submitting && (
          <LoadingOverlay
            message="Scoring your attempt..."
            progress={scoringProgress}
            status={scoringStatus}
          />
        )}
        {!submitting && publishing && (
          <LoadingOverlay message="Syncing to feed..." />
        )}
      </AnimatePresence>

      {/* Name and Category Modal */}
      <AnimatePresence>
        {showNameModal && pendingResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowNameModal(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-groovely-dark-surface border border-groovely-dark-border rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white font-heading mb-2">
                {modalAction === 'draft' ? 'Save as Draft' : 'Publish to Feed'}
              </h3>
              <p className="text-sm text-groovely-dark-text-secondary mb-6">
                Give your attempt a name and select a dance style
              </p>

              <div className="space-y-6">
                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium text-groovely-dark-text-secondary mb-2">
                    Attempt Name
                  </label>
                  <input
                    type="text"
                    value={attemptTitle}
                    onChange={(e) => setAttemptTitle(e.target.value)}
                    placeholder="Enter attempt name..."
                    maxLength={100}
                    className="w-full px-4 py-3 bg-groovely-dark-card border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-groovely-peach-500 transition-all"
                    autoFocus
                  />
    </div>

                {/* Dance Style Selection */}
                <div>
                  <label className="block text-sm font-medium text-groovely-dark-text-secondary mb-3">
                    Dance Style (Optional)
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {danceStyles.map((style) => {
                      const isSelected = selectedDanceStyleId === style.id;
                      return (
                        <motion.button
                          key={style.id}
                          onClick={() => setSelectedDanceStyleId(isSelected ? null : style.id)}
                          whileTap={{ scale: 0.95 }}
                          className={`px-4 py-2 rounded-full text-xs font-semibold uppercase transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-gradient-to-r from-groovely-peach-500 to-groovely-purple-500 text-white shadow-md shadow-groovely-peach-500/30'
                              : 'bg-groovely-dark-card text-groovely-dark-text-secondary hover:bg-groovely-dark-border border border-groovely-dark-border'
                          }`}
                        >
                          {isSelected && <Check size={12} className="flex-shrink-0" />}
                          {style.name}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => {
                      setShowNameModal(false);
                      setPendingResult(null);
                      setModalAction(null);
                    }}
                    variant="outline"
                    size="md"
                    fullWidth
                    className="!border-groovely-dark-border !text-groovely-dark-text-secondary hover:!bg-groovely-dark-card"
                  >
                    <X size={16} className="mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!attemptTitle.trim()) {
                        setError('Please enter an attempt name');
                        return;
                      }

                      setShowNameModal(false);
                      
                      try {
                        if (modalAction === 'draft' && pendingResult) {
                          await saveAsDraft(pendingResult, attemptTitle.trim(), selectedDanceStyleId);
                          setDraftSaved(true);
                          setTimeout(() => setDraftSaved(false), 3000);
                          // After saving draft, go to Profile → Drafts tab
                          navigate('/profile?tab=drafts');
                        } else if (pendingResult) {
                          await publishResultToSupabase(pendingResult, attemptTitle.trim(), selectedDanceStyleId);
                          setPublished(true);
                          setTimeout(() => {
                            try {
                              Haptics.notification({ type: NotificationType.Success });
                            } catch (e) {
                              // Haptics not available
                            }
                          }, 100);
                        }
                      } catch (err) {
                        console.error(`${modalAction === 'draft' ? 'Save' : 'Publish'} failed:`, err);
                        // Error is already handled in the functions
                      } finally {
                        setPendingResult(null);
                        setModalAction(null);
                      }
                    }}
                    disabled={!attemptTitle.trim() || publishing}
                    variant="primary"
                    size="md"
                    fullWidth
                    className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50"
                  >
                    <Sparkles size={16} className="mr-2" />
                    {modalAction === 'draft' ? 'Save Draft' : 'Publish'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}