import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Music, Upload, Video, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Card, LoadingOverlay, PageHeader } from '../components/ios';
import { apiFetch, getApiBaseUrl } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const API_URL = getApiBaseUrl();

const resolveStaticUrl = (path: string | null | undefined) => {
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

export function CreateRoutine() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'upload' | 'record'>('upload'); // Toggle between upload and record
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [videoHasAudio, setVideoHasAudio] = useState<boolean | null>(null);
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const isSubmittingRef = useRef(false); // Prevent duplicate submissions
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Audio trimming state
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioStart, setAudioStart] = useState(0);
  const [audioEnd, setAudioEnd] = useState<number | null>(null);
  const [audioStartText, setAudioStartText] = useState('0:00');
  const [audioEndText, setAudioEndText] = useState<string | null>(null);
  const [isPlayingSegment, setIsPlayingSegment] = useState(false);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordedPreviewRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const segmentStartRef = useRef<number>(0);
  const segmentEndRef = useRef<number | null>(null);
  const segmentTimeoutRef = useRef<number | null>(null);

  const supportedMimeType = useMemo(getSupportedMimeType, []);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [audioUrl, videoUrl]);

  const formatTime = (seconds: number | null | undefined) => {
    if (seconds == null || !isFinite(seconds)) return '0:00';
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTime = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Support "mm:ss" or plain seconds
    if (trimmed.includes(':')) {
      const [mStr, sStr] = trimmed.split(':');
      const m = Number(mStr);
      const s = Number(sStr);
      if (!isFinite(m) || !isFinite(s) || m < 0 || s < 0) return null;
      return m * 60 + s;
    }
    const n = Number(trimmed);
    if (!isFinite(n) || n < 0) return null;
    return n;
  };

  const ensureCamera = async () => {
    if (mediaStreamRef.current) {
      return mediaStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true,
    });
    mediaStreamRef.current = stream;
    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = stream;
      await cameraPreviewRef.current.play().catch(() => undefined);
    }
    setCameraEnabled(true);
    return stream;
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
      setError('Unable to access camera. Please check permissions.');
    }
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
    if (!audioFile) {
      setError('Upload audio before recording so we can sync the countdown.');
      return;
    }

    try {
      const stream = await ensureCamera();
      if (!supportedMimeType) {
        setError('Recording format not supported in this browser.');
        return;
      }

      cancelRecordingRef.current = false;
      setIsRecording(true);
      const ready = await runCountdown();
      if (!ready || cancelRecordingRef.current) {
        setIsRecording(false);
        return;
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const fileName = `routine-recording.${recorder.mimeType.includes('webm') ? 'webm' : 'mp4'}`;
        const file = new File([blob], fileName, { type: recorder.mimeType });
        setRecordedFile(file);
        setVideoFile(file);
        const url = URL.createObjectURL(blob);
        setVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        if (videoPreviewRef.current) {
          videoPreviewRef.current.src = url;
          videoPreviewRef.current.load();
        }
        if (recordedPreviewRef.current) {
          recordedPreviewRef.current.src = url;
          recordedPreviewRef.current.load();
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        mediaRecorderRef.current = null;
        cancelRecordingRef.current = false;
        setIsRecording(false);
      };

      // Clear any previous timeout guard
      if (segmentTimeoutRef.current !== null) {
        window.clearTimeout(segmentTimeoutRef.current);
        segmentTimeoutRef.current = null;
      }

      // Start recording first so video is never behind audio
      recorder.start();

      if (audioRef.current && audioUrl) {
        const startAt = segmentStartRef.current ?? 0;
        const endAt = segmentEndRef.current;

        audioRef.current.currentTime = startAt;
        setIsPlayingSegment(true);
        audioRef.current.play().catch(() => undefined);

        // Use a precise timeout to stop recording when the segment length elapses
        if (endAt != null && endAt > startAt) {
          const segmentMs = Math.max(0, (endAt - startAt) * 1000);
          segmentTimeoutRef.current = window.setTimeout(() => {
            // Stop audio playback and reset position
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = startAt;
            }
            setIsPlayingSegment(false);
            segmentTimeoutRef.current = null;

            // If still recording, stop it
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              stopRecording();
            }
          }, segmentMs);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Could not start recording. Check camera and microphone permissions.');
      setIsRecording(false);
      setCountdown(null);
    }
  };

  const stopRecording = () => {
    cancelRecordingRef.current = true;
    setCountdown(null);
    setIsRecording(false);
    if (segmentTimeoutRef.current !== null) {
      window.clearTimeout(segmentTimeoutRef.current);
      segmentTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const checkVideoForAudio = async (videoElement: HTMLVideoElement): Promise<boolean> => {
    return new Promise((resolve) => {
      const checkAudio = () => {
        try {
          // Check if video has audio tracks using type assertions for browser-specific properties
          const video = videoElement as any;
          const hasAudioTrack = video.mozHasAudio || 
            (video.webkitAudioDecodedByteCount > 0) ||
            (video.audioTracks && video.audioTracks.length > 0);
          
          // Also check by trying to access audio context
          if (!hasAudioTrack) {
            // Try to detect audio by checking if video can play with audio
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const source = audioContext.createMediaElementSource(videoElement);
              const analyser = audioContext.createAnalyser();
              source.connect(analyser);
              analyser.fftSize = 256;
              
              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);
              
              // Play video briefly to check for audio
              const wasPlaying = !videoElement.paused;
              if (!wasPlaying) {
                videoElement.play().catch(() => {});
              }
              
              // Check after a short delay
              setTimeout(() => {
                analyser.getByteFrequencyData(dataArray);
                const hasAudio = dataArray.some(value => value > 0);
                if (!wasPlaying) {
                  videoElement.pause();
                }
                audioContext.close();
                resolve(hasAudio);
              }, 1000);
            } catch (audioContextError) {
              // If audio context fails, assume it might have audio (let backend handle it)
            }
          } else {
            resolve(true);
          }
        } catch (err) {
          // If we can't determine, assume it might have audio (let backend handle it)
          resolve(true);
        }
      };

      if (videoElement.readyState >= 2) {
        checkAudio();
      } else {
        videoElement.addEventListener('loadedmetadata', checkAudio, { once: true });
        // Fallback timeout
        setTimeout(() => {
          // If we can't determine, assume it might have audio (let backend handle it)
          resolve(true);
        }, 3000);
      }
    });
  };

  const handleVideoSelect = async (file: File | null) => {
    setRecordedFile(null);
    setVideoFile(file);
    setVideoHasAudio(null);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    if (file) {
      setCheckingAudio(true);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.src = url;
        videoPreviewRef.current.load();
        
        // Wait for video to load metadata
        await new Promise((resolve) => {
          if (videoPreviewRef.current) {
            if (videoPreviewRef.current.readyState >= 2) {
              resolve(undefined);
            } else {
              videoPreviewRef.current.addEventListener('loadedmetadata', () => resolve(undefined), { once: true });
            }
          } else {
            resolve(undefined);
          }
        });
        
        // Check if video has audio
        try {
          const hasAudio = await checkVideoForAudio(videoPreviewRef.current!);
          setVideoHasAudio(hasAudio);
          
          if (!hasAudio) {
            setError('This video has no audio track. Please upload a separate audio file.');
            // Clear any existing audio file since we need a new one
            setAudioFile(null);
            if (audioUrl) {
              URL.revokeObjectURL(audioUrl);
              setAudioUrl(null);
            }
          } else {
            // Video has audio - use the video file as audio source
            // The backend will extract the audio from it
            setError(null);
            try {
              // Use the video file as the audio file - backend will extract it
              // Create a new File object with a different name to avoid FormData issues
              // when the same file is sent twice
              const audioFileFromVideo = new File([file], `audio-from-${file.name}`, { type: file.type });
              setAudioFile(audioFileFromVideo);
              // Note: Audio element can't play video files directly, but that's okay
              // The user can preview the video to hear the audio, and backend will extract it
              setAudioUrl((prev) => {
                if (prev && prev !== url) URL.revokeObjectURL(prev);
                // Don't set video URL as audio URL - audio element can't play video
                // Just keep the audio ref empty or show a message
                return null;
              });
              if (audioRef.current) {
                // Clear audio element since it can't play video files
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
              }
            } catch (extractErr) {
              console.error('Error setting up audio:', extractErr);
              setError('Could not set up audio preview. The backend will extract it during upload.');
            }
          }
        } catch (err) {
          console.error('Error checking video audio:', err);
          // If we can't determine, assume it might have audio
          setVideoHasAudio(true);
        } finally {
          setCheckingAudio(false);
        }
      }
    } else if (videoPreviewRef.current) {
      videoPreviewRef.current.removeAttribute('src');
      videoPreviewRef.current.load();
      setVideoHasAudio(null);
    }
  };

  const handleAudioSelect = async (file: File | null) => {
    setAudioFile(file);
    setAudioDuration(null);
    setAudioStart(0);
    setAudioEnd(null);
    setAudioStartText('0:00');
    setAudioEndText(null);
    segmentStartRef.current = 0;
    segmentEndRef.current = null;
    setIsPlayingSegment(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (file) {
      // Check audio duration and limit to 1 minute
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      
      // Load audio to check duration
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.onloadedmetadata = () => {
          const duration = audioRef.current?.duration || 0;
          const MAX_DURATION = 60; // 1 minute in seconds
          
          if (duration > MAX_DURATION) {
            setError(`Audio file is ${Math.round(duration)} seconds long. Maximum allowed is 60 seconds (1 minute). Please select a shorter audio file or trim it.`);
            // Clear the file selection
            setAudioFile(null);
            setAudioUrl(null);
            if (audioRef.current) {
              audioRef.current.removeAttribute('src');
              audioRef.current.load();
            }
          } else {
            setAudioDuration(duration);
            // Auto-set end to duration (or 60 seconds max)
            const endTime = Math.min(duration, MAX_DURATION);
            setAudioEnd(endTime);
            segmentEndRef.current = endTime;
            setAudioEndText(formatTime(endTime));
          }
        };
        audioRef.current.load();
      }
    } else if (audioRef.current) {
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  };

  const handleSubmit = async () => {
    // Prevent duplicate submissions
    if (isSubmittingRef.current || submitting) {
      return;
    }

    // Validate title is required
    if (!title || !title.trim()) {
      setError('Please provide a title for your routine.');
      return;
    }

    if (!videoFile) {
      setError('Please upload a video before publishing.');
      return;
    }

    // Check if we have audio file (either extracted or uploaded separately)
    if (!audioFile) {
      if (videoHasAudio === false) {
        setError('This video has no audio. Please upload a separate audio file.');
      } else if (videoHasAudio === true) {
        setError('Audio extraction in progress. Please wait...');
      } else {
        setError('Please provide audio (either in the video or as a separate file) before publishing.');
      }
      return;
    }
    
    // Validate audio file
    if (!(audioFile instanceof File) || audioFile.size === 0) {
      setError('Audio file is invalid or empty. Please select a valid audio file.');
      return;
    }

    // Mark as submitting
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setProcessingStatus('Preparing upload...');

    try {
      const formData = new FormData();

      // Always use the audio file (either extracted from video or uploaded separately)
      // If audioFile is the same as videoFile (video has embedded audio), we still send it
      // The backend will extract the audio from the video file
      const audioFileName = audioFile.name || (audioFile === videoFile ? 'video-with-audio.mp4' : 'audio.webm');
      
      // Ensure we're appending a valid File object
      if (!(audioFile instanceof File) || audioFile.size === 0) {
        throw new Error('Invalid audio file: file is empty or not a valid File object');
      }
      
      formData.append('audio', audioFile, audioFileName);
      formData.append('video', videoFile, videoFile.name || 'actual.mp4');

      formData.append('title', title.trim());
      

      // If user picked a trimmed segment, send it along so backend can trim audio
      if (audioDuration != null && segmentEndRef.current != null) {
        const MAX_DURATION = 60; // 1 minute in seconds
        const start = segmentStartRef.current ?? 0;
        const end = segmentEndRef.current ?? audioDuration;
        const safeStart = Math.max(0, Math.min(start, MAX_DURATION));
        const safeEnd = Math.max(safeStart, Math.min(end, MAX_DURATION));
        formData.append('audio_start', String(safeStart));
        formData.append('audio_end', String(safeEnd));
      }

      // Add timeout to prevent hanging forever (10 minutes for large video processing)
      // Increased timeout for routine creation which involves video processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes

      setProcessingStatus('Uploading files to server...');
      let response;
      try {
        // Note: FormData upload progress isn't easily trackable with fetch API
        // The browser will show upload progress in network tab
        response = await apiFetch('/api/routines', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        isSubmittingRef.current = false;
        setSubmitting(false);
        setProcessingStatus(null);
        if (err.name === 'AbortError') {
          throw new Error('Upload timed out. The video may be too large or the server is taking too long. Please try with a smaller video or check your connection.');
        }
        throw err;
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        isSubmittingRef.current = false;
        setSubmitting(false);
        setProcessingStatus(null);
        const message = await response.text();
        throw new Error(message || 'Failed to create routine');
      }

      const result = await response.json();

      // TikTok-style: If processing in background, poll for completion
      if (result.processing) {
        setError(null);
        setProcessingStatus('Uploading files to server...');
        // Keep submitting state true to show processing indicator
        // We'll set it to false when done or on error
        
        
        // Update status after a moment to show processing
        setTimeout(() => {
          setProcessingStatus('Processing routine...');
        }, 2000);
        
        // Poll for routine completion
        const pollForCompletion = async () => {
          let pollCount = 0;
          const maxPolls = 120; // Poll for up to 10 minutes (120 * 5 seconds)
          let pollTimeoutId: NodeJS.Timeout | null = null;
          
          const poll = async () => {
            if (pollCount >= maxPolls) {
              console.error(' Polling timeout reached');
              isSubmittingRef.current = false;
              setProcessingStatus(null);
              setError('Routine processing is taking longer than expected. The routine may still be processing. Please check back later or refresh the page.');
              setSubmitting(false);
              return;
            }
            
            try {
;
              // Show elapsed time estimate (each poll is ~5 seconds)
              const elapsedSeconds = pollCount * 5;
              const elapsedText = elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : '';
              setProcessingStatus(`Processing routine${elapsedText}...`);
              const statusResponse = await apiFetch(`/api/routines/${result.routine_id}/status`);
              
              if (!statusResponse.ok) {
                throw new Error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
              }
              
              const status = await statusResponse.json();
              
              if (!status.processing && status.has_video && status.has_audio) {
                // Processing complete, sync to Supabase
                setProcessingStatus('Finalizing routine...');
                if (user) {
                  try {
                    const routineResponse = await apiFetch(`/api/routines/${result.routine_id}`);
                    
                    if (!routineResponse.ok) {
                      throw new Error(`Failed to fetch routine details: ${routineResponse.status}`);
                    }
                    
                    const routineDetails = await routineResponse.json();
                    
                    const referenceVideoUrl = resolveStaticUrl(routineDetails.video_url);
                    const audioStaticUrl = resolveStaticUrl(routineDetails.audio_url);

                    // Sync routine to Supabase
                    const { error: routineError } = await supabase.from('routines').upsert([
                      {
                        id: result.routine_id,
                        creator_id: user.id,
                        title: title.trim(),
                        song_url: audioStaticUrl || null,
                        meta: {
                          source: 'create-routine',
                          audio_url: audioStaticUrl || null,
                        },
                      },
                    ]);

                    if (routineError) {
                      console.error(' Failed to sync routine to Supabase:', routineError);
                    setProcessingStatus(null);
                      throw new Error(`Failed to save routine: ${routineError.message}`);
                    }

                    // Create reference video entry
                    if (referenceVideoUrl) {
                      const { data: existingReference } = await supabase
                        .from('videos')
                        .select('id')
                        .eq('routine_id', result.routine_id)
                        .eq('kind', 'reference')
                        .maybeSingle();

                      if (!existingReference) {
                        const { error: videoError } = await supabase.from('videos').insert({
                          user_id: user.id,
                          title: title.trim(),
                          description: 'Reference routine created via ChoreoCoach.',
                          video_url: referenceVideoUrl,
                          routine_id: result.routine_id,
                          kind: 'reference',
                          ai_score: null,
                          ai_feedback: null,
                        });
                        
                        if (videoError) {
                          console.error(' Failed to create reference video:', videoError);
                          // Don't throw - routine is still created, video entry is optional
                        } else {
                        }
                      }
                    }
                    
                    isSubmittingRef.current = false;
                    setProcessingStatus(null);
                    setSubmitting(false);
                    
                    // Small delay to ensure state updates complete before navigation
                    setTimeout(() => {
                    }, 100);
                    return; // Stop polling
                  } catch (syncErr: any) {
                    console.error(' Failed to sync routine metadata to Supabase:', syncErr);
                    isSubmittingRef.current = false;
                    setProcessingStatus(null);
                    setError(`Failed to publish routine: ${syncErr.message || 'Unknown error'}. The routine was created but may not appear in your list. Please refresh the page.`);
                    setSubmitting(false);
                    return; // Stop polling on error
                  }
                } else {
                  console.error(' No user found for sync');
                  isSubmittingRef.current = false;
                  setProcessingStatus(null);
                  setError('User session expired. Please log in again.');
                  setSubmitting(false);
                  return;
                }
              } else if (status.status === 'failed') {
                console.error(' Routine processing failed:', status.error);
                isSubmittingRef.current = false;
                setProcessingStatus(null);
                setError(status.error || 'Routine processing failed. Please try again.');
                setSubmitting(false);
                return; // Stop polling on failure
              } else {
                // Still processing, poll again
                pollCount++;
                pollTimeoutId = setTimeout(poll, 5000); // Poll every 5 seconds
              }
            } catch (pollErr: any) {
              console.error(' Error polling routine status:', pollErr);
              pollCount++;
              if (pollCount < maxPolls) {
                // Retry polling on error (network issues, etc.)
                pollTimeoutId = setTimeout(poll, 5000);
              } else {
                console.error(' Max polling attempts reached');
                isSubmittingRef.current = false;
                setProcessingStatus(null);
                setError(`Failed to check routine status after ${maxPolls} attempts: ${pollErr.message || 'Unknown error'}. Please refresh the page to check if the routine was created.`);
                setSubmitting(false);
              }
            }
          };
          
          // Start polling immediately (backend processes in background, status is available right away)
          // For local testing, processing might complete very fast, so check immediately
          poll();
          
          // Return cleanup function
          return () => {
            if (pollTimeoutId) {
              clearTimeout(pollTimeoutId);
            }
          };
        };
        
        pollForCompletion();
        return; // Don't navigate yet, wait for completion
      }

      // Synchronous flow (routine completed immediately, no background processing)
      
      if (user) {
        try {
          // Fetch routine details
          const routineResponse = await apiFetch(`/api/routines/${result.routine_id}`);
          
          if (!routineResponse.ok) {
            throw new Error(`Failed to fetch routine: ${routineResponse.status}`);
          }
          
          const routineDetails = await routineResponse.json();
          
          const referenceVideoUrl = resolveStaticUrl(routineDetails.video_url);
          const audioStaticUrl = resolveStaticUrl(routineDetails.audio_url);

          // Sync routine to Supabase
          const { error: routineError } = await supabase.from('routines').upsert([
            {
              id: result.routine_id,
              creator_id: user.id,
              title: title.trim(),
              song_url: audioStaticUrl || null,
              meta: {
                source: 'create-routine',
                audio_url: audioStaticUrl || null,
              },
            },
          ]);

          if (routineError) {
            console.error(' Failed to sync routine to Supabase:', routineError);
            throw new Error(`Failed to save routine: ${routineError.message}`);
          }

          // Create reference video entry
          if (referenceVideoUrl) {
            const { data: existingReference } = await supabase
              .from('videos')
              .select('id')
              .eq('routine_id', result.routine_id)
              .eq('kind', 'reference')
              .maybeSingle();

            if (!existingReference) {
              const { error: videoError } = await supabase.from('videos').insert({
                user_id: user.id,
                title: title.trim(),
                description: 'Reference routine created via ChoreoCoach.',
                video_url: referenceVideoUrl,
                routine_id: result.routine_id,
                kind: 'reference',
                ai_score: null,
                ai_feedback: null,
              });
              
              if (videoError) {
                console.error(' Failed to create reference video:', videoError);
                // Don't throw - routine is still created, video entry is optional
              }
            }
          }
          
          isSubmittingRef.current = false;
          setProcessingStatus(null);
          setSubmitting(false);
          
          // Small delay to ensure state updates complete before navigation
          setTimeout(() => {
          }, 100);
        } catch (syncErr: any) {
          console.error(' Failed to sync routine metadata to Supabase (sync flow):', syncErr);
          isSubmittingRef.current = false;
          setProcessingStatus(null);
          setError(`Failed to publish routine: ${syncErr.message || 'Unknown error'}. The routine was created but may not appear in your list. Please refresh the page.`);
          setSubmitting(false);
        }
      } else {
        console.error(' No user found for sync (sync flow)');
        isSubmittingRef.current = false;
        setProcessingStatus(null);
        setError('User session expired. Please log in again.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error(' Error in handleSubmit:', err);
      isSubmittingRef.current = false;
      setProcessingStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to create routine');
      setSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      disableCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-groovely-dark-bg pb-24">
      <style>{`
        audio {
          width: 100% !important;
          max-height: 48px;
        }
        audio::-webkit-media-controls-panel {
          background-color: #1f2937 !important;
        }
        audio::-webkit-media-controls-play-button {
          background-color: #ec4899 !important;
          border-radius: 50%;
        }
        audio::-webkit-media-controls-timeline {
          background-color: #374151 !important;
          border-radius: 2px;
        }
        audio::-webkit-media-controls-current-time-display,
        audio::-webkit-media-controls-time-remaining-display {
          color: #ffffff !important;
        }
      `}</style>
      <PageHeader
        title="Create Routine"
        subtitle="UPLOAD YOUR CHOREOGRAPHY OR CAPTURE A NEW ONE"
        icon={<Music size={32} className="text-white/90" />}
        sticky
        bottomPadding="sm"
        maxWidth="3xl"
      />

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card variant="elevated">
          <label className="block text-sm font-semibold text-white mb-2 font-body">
            Routine Title <span className="text-red-400">*</span>
          </label>
          <input
            className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-base text-white placeholder-white/40 focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error && error.includes('title')) {
                setError(null);
              }
            }}
            placeholder="Give this routine a name"
            required
          />
          {error && error.includes('title') && (
            <p className="text-sm text-red-400 mt-2">{error}</p>
          )}
        </Card>

        <Card variant="elevated" className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-groovely-dark-border/50">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-groovely-pink-500/20 to-groovely-purple-500/20 flex items-center justify-center border border-groovely-pink-500/30">
              <Music size={24} className="text-groovely-pink-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white font-heading">Routine Audio</h3>
              <p className="text-sm text-groovely-dark-text-secondary mt-0.5">
                {checkingAudio
                  ? 'Checking video for audio...'
                  : videoHasAudio === true && audioFile
                  ? 'Audio will be extracted from your video'
                  : videoHasAudio === true && !audioFile
                  ? 'Audio detected in video'
                  : videoHasAudio === false
                  ? 'No audio detected - upload required'
                  : 'Upload audio to enable recording'}
              </p>
            </div>
          </div>

          {/* Status Messages */}
          {checkingAudio && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-blue-300">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Checking video for audio...</span>
              </div>
            </div>
          )}

          {videoHasAudio === true && audioFile && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <Check size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-300 mb-1">Video Audio Ready</p>
                  <p className="text-xs text-green-400/80">Audio will be extracted during upload. Preview the video above to hear it.</p>
                </div>
              </div>
            </div>
          )}

          {videoHasAudio === false && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-lg">!</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-300 mb-1">No Audio Detected</p>
                  <p className="text-xs text-amber-400/80">Please upload a separate audio file below.</p>
                </div>
              </div>
            </div>
          )}

          {!audioUrl && !checkingAudio && videoHasAudio !== true && (
            <div className="mb-6 p-4 bg-groovely-dark-surface/50 border border-groovely-dark-border/50 rounded-xl">
              <p className="text-sm text-groovely-dark-text-secondary leading-relaxed">
                Upload the song that goes with your choreography (or use audio from your video if it contains audio).{' '}
                <span className="font-bold text-white">Recording is disabled until audio is loaded.</span>
              </p>
            </div>
          )}

          {!audioUrl && videoHasAudio === true && audioFile && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-lg">i</span>
                <p className="text-sm text-blue-300">Audio is embedded in the video. Preview the video above to hear it, or upload a separate audio file below.</p>
              </div>
            </div>
          )}

          {/* Audio Player & Segment Controls */}
          {audioUrl && (
            <div className="mb-6 space-y-6">
              {/* Audio Player */}
              <div className="bg-groovely-dark-surface/50 rounded-xl p-2.5 border border-groovely-dark-border/50">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full"
                  style={{
                    outline: 'none',
                    display: 'block'
                  }}
                  onLoadedMetadata={() => {
                    const el = audioRef.current;
                    if (!el) return;
                    const dur = el.duration;
                    if (isFinite(dur) && !isNaN(dur)) {
                      const MAX_DURATION = 60; // 1 minute in seconds
                      // Store full duration, but set initial segment to first minute
                      setAudioDuration(dur);
                      setAudioStart(0);
                      const initialEnd = Math.min(dur, MAX_DURATION);
                      setAudioEnd(initialEnd);
                      setAudioStartText('0:00');
                      setAudioEndText(formatTime(initialEnd));
                      segmentStartRef.current = 0;
                      segmentEndRef.current = initialEnd;
                      
                      // Warn if audio is longer than 1 minute
                      if (dur > MAX_DURATION) {
                        setError(`Audio file is ${Math.round(dur)} seconds long. You can select any 60-second segment.`);
                      }
                    }
                  }}
                  onTimeUpdate={() => {
                    if (!audioRef.current) return;
                    if (!isPlayingSegment) return;
                    if (audioEnd != null && audioRef.current.currentTime >= audioEnd) {
                      audioRef.current.pause();
                      audioRef.current.currentTime = audioStart;
                      setIsPlayingSegment(false);
                    }
                  }}
                  onEnded={() => {
                    setIsPlayingSegment(false);
                  }}
                />
              </div>

              {/* Segment Trimming Controls */}
              {audioDuration != null && audioEnd != null && (
                <div className="bg-groovely-dark-surface/30 rounded-xl p-5 border border-groovely-dark-border/30 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-groovely-dark-border/30">
                    <h4 className="text-sm font-semibold text-white font-heading">Trim Audio Segment</h4>
                    <div className="flex items-center gap-4 text-xs text-groovely-dark-text-secondary">
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-white">Start:</span> {formatTime(audioStart)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-white">End:</span> {formatTime(audioEnd)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-white">Length:</span> {formatTime(audioEnd - audioStart)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Start Time Control */}
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-groovely-dark-text-secondary uppercase tracking-wide">
                        Segment Start
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          className="flex-1 px-3 py-2 rounded-lg bg-groovely-dark-surface border border-groovely-dark-border text-sm text-white font-mono focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                          value={audioStartText}
                          onChange={(e) => setAudioStartText(e.target.value)}
                          onBlur={() => {
                            if (audioDuration == null || audioEnd == null) return;
                            const parsed = parseTime(audioStartText);
                            if (parsed == null) {
                              setAudioStartText(formatTime(audioStart));
                              return;
                            }
                            const MAX_DURATION = 60; // 1 minute
                            // Start can be from 0 to (audioEnd - 0.1) or (audioDuration - 0.1), whichever is smaller
                            const maxStart = Math.min(audioDuration - 0.1, audioEnd - 0.1);
                            let next = Math.max(0, Math.min(parsed, maxStart));
                            setAudioStart(next);
                            setAudioStartText(formatTime(next));
                            segmentStartRef.current = next;
                            
                            // Adjust end if needed to maintain max 60s segment
                            const maxAllowedEnd = Math.min(next + MAX_DURATION, audioDuration);
                            if (audioEnd > maxAllowedEnd) {
                              setAudioEnd(maxAllowedEnd);
                              setAudioEndText(formatTime(maxAllowedEnd));
                              segmentEndRef.current = maxAllowedEnd;
                            }
                          }}
                          placeholder="0:00"
                        />
                        <span className="text-xs text-groovely-dark-text-tertiary font-mono">
                          / {formatTime(audioDuration)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={audioDuration != null ? Math.min(audioDuration - 0.1, audioEnd - 0.1) : 60}
                        step={0.1}
                        value={audioStart}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          const MAX_DURATION = 60; // 1 minute
                          // Start can go from 0 to (audioDuration - 0.1) or (audioEnd - 0.1), whichever is smaller
                          const maxStart = Math.min(audioDuration - 0.1, audioEnd - 0.1);
                          const clamped = Math.min(value, maxStart);
                          const next = Math.max(0, clamped);
                          setAudioStart(next);
                          setAudioStartText(formatTime(next));
                          segmentStartRef.current = next;
                          
                          // If moving start slider right, adjust end slider to maintain max 60s segment
                          // But only if it would exceed the max allowed end
                          const maxAllowedEnd = Math.min(next + MAX_DURATION, audioDuration);
                          if (audioEnd > maxAllowedEnd) {
                            setAudioEnd(maxAllowedEnd);
                            setAudioEndText(formatTime(maxAllowedEnd));
                            segmentEndRef.current = maxAllowedEnd;
                          }
                        }}
                        className="w-full h-2 bg-groovely-dark-surface rounded-lg appearance-none cursor-pointer accent-groovely-pink-500"
                        style={{
                          background: `linear-gradient(to right, #ec4899 0%, #ec4899 ${(audioStart / audioDuration) * 100}%, #1f2937 ${(audioStart / audioDuration) * 100}%, #1f2937 100%)`
                        }}
                      />
                    </div>

                    {/* End Time Control */}
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-groovely-dark-text-secondary uppercase tracking-wide">
                        Segment End
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          className="flex-1 px-3 py-2 rounded-lg bg-groovely-dark-surface border border-groovely-dark-border text-sm text-white font-mono focus:ring-2 focus:ring-groovely-pink-500 focus:border-transparent transition-all"
                          value={audioEndText ?? formatTime(audioEnd)}
                          onChange={(e) => setAudioEndText(e.target.value)}
                          onBlur={() => {
                            if (audioDuration == null) return;
                            const parsed = parseTime(audioEndText ?? '');
                            if (parsed == null) {
                              setAudioEndText(formatTime(audioEnd));
                              return;
                            }
                            const MAX_DURATION = 60; // 1 minute
                            // End can be from (audioStart + 0.1) to (audioStart + 60) or audioDuration, whichever is smaller
                            const maxAllowedEnd = Math.min(audioStart + MAX_DURATION, audioDuration);
                            let next = Math.max(parsed, audioStart + 0.1);
                            next = Math.min(next, maxAllowedEnd);
                            setAudioEnd(next);
                            setAudioEndText(formatTime(next));
                            segmentEndRef.current = next;
                          }}
                          placeholder="0:00"
                        />
                        <span className="text-xs text-groovely-dark-text-tertiary font-mono">
                          / {formatTime(audioDuration)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={audioStart + 0.1}
                        max={Math.min(audioStart + 60, audioDuration)}
                        step={0.1}
                        value={audioEnd}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          const MAX_DURATION = 60; // 1 minute
                          // End can be from (audioStart + 0.1) to (audioStart + 60) or audioDuration, whichever is smaller
                          const maxAllowedEnd = Math.min(audioStart + MAX_DURATION, audioDuration);
                          const clamped = Math.max(value, audioStart + 0.1);
                          const next = Math.min(clamped, maxAllowedEnd);
                          setAudioEnd(next);
                          setAudioEndText(formatTime(next));
                          segmentEndRef.current = next;
                        }}
                        className="w-full h-2 bg-groovely-dark-surface rounded-lg appearance-none cursor-pointer accent-groovely-pink-500"
                        style={{
                          background: `linear-gradient(to right, #1f2937 0%, #1f2937 ${(audioEnd / audioDuration) * 100}%, #ec4899 ${(audioEnd / audioDuration) * 100}%, #ec4899 100%)`
                        }}
                      />
                    </div>
                  </div>

                  {/* Preview Button */}
                  <div className="flex justify-end pt-2 border-t border-groovely-dark-border/30">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        if (!audioRef.current) return;
                        audioRef.current.currentTime = audioStart;
                        setIsPlayingSegment(true);
                        audioRef.current.play().catch(() => undefined);
                      }}
                      className="bg-gradient-to-r from-groovely-pink-500/20 to-groovely-purple-500/20 border border-groovely-pink-500/30 hover:from-groovely-pink-500/30 hover:to-groovely-purple-500/30"
                    >
                      <Music size={16} className="mr-2" />
                      Preview Selected Segment
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Button */}
          <div className="pt-4 border-t border-groovely-dark-border/50">
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => handleAudioSelect(event.target.files?.[0] ?? null)}
            />
            <Button
              variant={videoHasAudio === true ? 'secondary' : 'primary'}
              size="md"
              className="w-full"
              onClick={() => audioInputRef.current?.click()}
            >
              <Upload size={18} className="mr-2" />
              {videoHasAudio === true ? 'Upload Different Audio (Optional)' : 'Select Audio File'}
            </Button>
          </div>
        </Card>

        <Card variant="elevated">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-white font-heading">
              <Video size={20} className="text-groovely-peach-500" />
              Choreography Video
            </div>
            <div className="flex gap-2 bg-groovely-dark-surface rounded-lg p-1">
              <Button
                variant={mode === 'upload' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setMode('upload');
                  if (cameraEnabled) disableCamera();
                  setRecordedFile(null);
                }}
                className="text-xs"
              >
                <Upload size={14} className="mr-1.5" />
                Upload
              </Button>
              <Button
                variant={mode === 'record' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setMode('record');
                  setVideoFile(null);
                  if (videoUrl) {
                    URL.revokeObjectURL(videoUrl);
                    setVideoUrl(null);
                  }
                }}
                className="text-xs"
              >
                <Camera size={14} className="mr-1.5" />
                Record
              </Button>
            </div>
          </div>

          {mode === 'upload' ? (
            <div>
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video mb-4">
                <video ref={videoPreviewRef} controls className="w-full h-full object-contain bg-black" playsInline />
                {!videoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                    <span>No video selected</span>
                  </div>
                )}
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => handleVideoSelect(event.target.files?.[0] ?? null)}
              />
              <motion.button
                onClick={async () => {
                  try {
                    await Haptics.impact({ style: ImpactStyle.Light });
                  } catch (e) {
                    // Haptics not available
                  }
                  videoInputRef.current?.click();
                }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="group relative w-full px-6 py-3 rounded-xl btn-gradient-smooth btn-pulse text-white font-heading font-semibold text-base tracking-wide overflow-hidden shadow-lg shadow-groovely-pink-500/30"
              >
                <span className="relative z-10 flex items-center justify-center">
                  <Upload size={16} className="mr-2" />
                  Upload Video
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </motion.button>
            </div>
          ) : (
            <div>
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video mb-4">
                <video
                  ref={cameraPreviewRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-contain bg-black"
                />
                {!cameraEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                    <span>Enable camera to preview</span>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    REC
                  </div>
                )}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <span className="text-white text-6xl font-bold">{countdown === 0 ? 'GO' : countdown}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button 
                  variant={cameraEnabled ? 'secondary' : 'primary'} 
                  size="md" 
                  onClick={cameraEnabled ? disableCamera : handleEnableCamera}
                  className="flex-1"
                >
                  {cameraEnabled ? (
                    <>
                      <X size={16} className="mr-2" />
                      Disable Camera
                    </>
                  ) : (
                    <>
                      <Camera size={16} className="mr-2" />
                      Enable Camera
                    </>
                  )}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={!cameraEnabled || isRecording || !audioFile}
                  onClick={startRecording}
                  className="flex-1"
                >
                  <Camera size={16} className="mr-2" />
                  Start Recording
                </Button>
                {isRecording && (
                  <Button variant="outline" size="md" onClick={stopRecording} className="w-full">
                    <X size={16} className="mr-2" />
                    Stop Recording
                  </Button>
                )}
                {recordedFile && (
                  <div className="w-full flex flex-col gap-3 mt-2">
                    <div className="flex items-center justify-center text-xs text-green-400">
                      <Check size={16} className="mr-2" />
                      Recorded take ready
                    </div>
                    <div className="bg-groovely-dark-surface border border-groovely-dark-border rounded-lg p-3">
                      <p className="text-xs text-groovely-dark-text-secondary mb-2">
                        Preview your recorded routine below. This is the video that will be published.
                      </p>
                      <div className="aspect-video bg-black rounded overflow-hidden">
                        <video
                          ref={recordedPreviewRef}
                          src={videoUrl ?? undefined}
                          controls
                          className="w-full h-full object-contain bg-black"
                          playsInline
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-groovely-dark-text-tertiary mt-4">
                Recording will start after a 3-2-1 countdown and play the uploaded audio for sync.
              </p>
            </div>
          )}
        </Card>

        {error && (
          <Card variant="outline" className="border-red-500/50 bg-red-500/10 text-red-400">
            {error}
          </Card>
        )}

        <div 
          className="relative group"
          style={(!title || !title.trim()) && !submitting && !checkingAudio ? { cursor: 'default' } : undefined}
        >
          <motion.button
            onClick={async () => {
              if (submitting || !title || !title.trim() || !videoFile || (!audioFile && videoHasAudio !== true) || checkingAudio) {
                return;
              }
              try {
                await Haptics.impact({ style: ImpactStyle.Light });
              } catch (e) {
                // Haptics not available
              }
              handleSubmit();
            }}
            disabled={submitting || !title || !title.trim() || !videoFile || (!audioFile && videoHasAudio !== true) || checkingAudio}
            whileHover={(!submitting && title && title.trim() && videoFile && (audioFile || videoHasAudio === true) && !checkingAudio) ? { scale: 1.05, y: -2 } : {}}
            whileTap={(!submitting && title && title.trim() && videoFile && (audioFile || videoHasAudio === true) && !checkingAudio) ? { scale: 0.98 } : {}}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="group relative w-full px-8 py-4 rounded-2xl btn-gradient-smooth btn-pulse text-white font-heading font-bold text-lg tracking-wide overflow-hidden shadow-2xl shadow-groovely-pink-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="relative z-10 flex items-center justify-center">
              {checkingAudio ? 'Checking video...' : submitting ? 'Uploading...' : 'Publish Routine'}
            </span>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-groovely-purple-500 via-groovely-pink-500 to-groovely-peach-500"
              initial={{ x: '-100%' }}
              whileHover={(!submitting && title && title.trim() && videoFile && (audioFile || videoHasAudio === true) && !checkingAudio) ? { x: '100%' } : { x: '-100%' }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            />
          </motion.button>
          {(!title || !title.trim()) && !submitting && !checkingAudio && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-groovely-dark-surface border border-groovely-dark-border rounded-lg text-sm text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 shadow-lg">
              Please name your routine.
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                <div className="w-2 h-2 bg-groovely-dark-surface border-r border-b border-groovely-dark-border transform rotate-45"></div>
              </div>
            </div>
          )}
        </div>
        
        {/* Persistent message during processing - visible below button as backup */}
        {submitting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <div className="bg-groovely-pink-500/30 border-2 border-groovely-pink-500/70 rounded-xl p-5 backdrop-blur-md shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 border-3 border-groovely-pink-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-white mb-2">
                    {processingStatus || "Processing your routine..."}
                  </p>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Your routine is being processed and uploaded. This may take up to a minute. 
                    <br />
                    <strong className="text-white font-bold">You'll be automatically redirected to the feed when it's ready.</strong> 
                    <br />
                    <span className="text-white/80">Please don't close this page.</span>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
          {submitting && (
            <LoadingOverlay 
              message={
                processingStatus 
                  ? `${processingStatus}\n\nYour routine is being processed and uploaded. This may take up to a minute.\n\nYou'll be automatically redirected to the feed when it's ready.\n\nPlease don't close this page.`
                  : "Processing your routine...\n\nYour routine is being processed and uploaded. This may take up to a minute.\n\nYou'll be automatically redirected to the feed when it's ready.\n\nPlease don't close this page."
              } 
            />
          )}
      </AnimatePresence>
    </div>
  );
}
