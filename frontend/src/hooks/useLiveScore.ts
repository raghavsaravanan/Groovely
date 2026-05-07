import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

// This hook runs entirely on the client and never touches the backend.
// To avoid bundler / WASM loader issues, we load MediaPipe Pose from the CDN
// as a classic script and use the global `window.Pose` constructor.

declare global {
  interface Window {
    Pose?: any;
  }
}

type LiveScoreOptions = {
  routineVideoRef: RefObject<HTMLVideoElement | null>;
  cameraVideoRef: RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
};

type PoseLandmark = { x: number; y: number; z: number; visibility?: number };

export function useLiveScore({
  routineVideoRef,
  cameraVideoRef,
  isRecording,
}: LiveScoreOptions) {
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const userLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const refLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const scoreRef = useRef(100); // starts at 100
  const runningRef = useRef(false);
  const poseUserRef = useRef<any>(null);
  const poseRefRef = useRef<any>(null);
  const scoringIntervalRef = useRef<number | null>(null);

  // Helper: compute average normalized distance between two landmark sets.
  const computePoseError = (a: PoseLandmark[], b: PoseLandmark[]): number => {
    if (!a.length || !b.length || a.length !== b.length) return 1.0;

    // Normalize by torso size from reference to make distances scale-invariant.
    const leftShoulder = a[11];
    const rightShoulder = a[12];
    const leftHip = a[23];
    const rightHip = a[24];
    const torsoSize =
      leftShoulder && rightShoulder && leftHip && rightHip
        ? Math.hypot(
            (leftShoulder.x + rightShoulder.x) / 2 -
              (leftHip.x + rightHip.x) / 2,
            (leftShoulder.y + rightShoulder.y) / 2 -
              (leftHip.y + rightHip.y) / 2,
          )
        : 0.4; // fallback scale

    const norm = torsoSize > 0 ? torsoSize : 0.4;

    let total = 0;
    let count = 0;
    for (let i = 0; i < a.length; i++) {
      const pa = a[i];
      const pb = b[i];
      if (!pa || !pb) continue;
      const dx = (pa.x - pb.x) / norm;
      const dy = (pa.y - pb.y) / norm;
      const dz = (pa.z - pb.z) / norm;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      total += d;
      count++;
    }
    if (!count) return 1.0;
    // Typical well-matched poses should have error << 1.0
    return total / count;
  };

  // Helper: basic timing penalty based on relative playback positions.
  const computeTimingPenalty = () => {
    const refVideo = routineVideoRef.current;
    const userVideo = cameraVideoRef.current;
    if (!refVideo || !userVideo || !refVideo.duration || !userVideo.duration) {
      return 0;
    }
    const refProgress = refVideo.currentTime / refVideo.duration;
    const userProgress = userVideo.currentTime / userVideo.duration;
    const diff = Math.abs(refProgress - userProgress);
    // Up to ~1 beat off (~0.15) is mild, more is harsher.
    if (diff < 0.05) return 0;
    if (diff < 0.10) return 0.2;
    if (diff < 0.20) return 0.5;
    if (diff < 0.35) return 1.0;
    return 2.0;
  };

  useEffect(() => {
    let cancelled = false;

    const initWithGlobalPose = () => {
      const PoseCtor = window.Pose;
      if (!PoseCtor) return;

      const baseOptions = {
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
      };

      const poseUser = new PoseCtor(baseOptions);
      poseUser.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      const poseRef = new PoseCtor(baseOptions);
      poseRef.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      poseUser.onResults((res: any) => {
        if (res?.poseLandmarks) {
          userLandmarksRef.current = res.poseLandmarks as PoseLandmark[];
        }
      });

      poseRef.onResults((res: any) => {
        if (res?.poseLandmarks) {
          refLandmarksRef.current = res.poseLandmarks as PoseLandmark[];
        }
      });

      poseUserRef.current = poseUser;
      poseRefRef.current = poseRef;
      if (!cancelled) {
        setIsReady(true);
      }
    };

    const ensurePoseScript = () =>
      new Promise<void>((resolve, reject) => {
        if (window.Pose) {
          resolve();
          return;
        }

        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-mediapipe-pose="true"]',
        );
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Failed to load MediaPipe Pose script')), {
            once: true,
          });
          return;
        }

        const script = document.createElement('script');
        script.src =
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
        script.async = true;
        script.dataset.mediapipePose = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load MediaPipe Pose script'));
        document.body.appendChild(script);
      });

    const initPoseEngines = async () => {
      if (typeof window === 'undefined') return;
      try {
        await ensurePoseScript();
        if (cancelled) return;
        initWithGlobalPose();
      } catch (err) {
        console.error('Failed to initialize MediaPipe Pose for live scoring:', err);
      }
    };

    initPoseEngines();

    return () => {
      cancelled = true;
      // MediaPipe Pose instances don't have a clear() API, but gc will reclaim them.
    };
  }, []);

  // Drive pose inference loops for user and reference videos during recording.
  useEffect(() => {
    if (!isReady) return;

    const runUserLoop = async () => {
      const poseUser = poseUserRef.current;
      const videoEl = cameraVideoRef.current;
      if (!poseUser || !videoEl) return;

      const loop = async () => {
        if (!runningRef.current) return;
        try {
          await poseUser.send({ image: videoEl });
        } catch {
          // ignore occasional inference errors
        }
        if (runningRef.current) {
          requestAnimationFrame(loop);
        }
      };
      requestAnimationFrame(loop);
    };

    const runRefLoop = async () => {
      const poseRef = poseRefRef.current;
      const videoEl = routineVideoRef.current;
      if (!poseRef || !videoEl) return;

      const loop = async () => {
        if (!runningRef.current) return;
        try {
          await poseRef.send({ image: videoEl });
        } catch {
          // ignore
        }
        if (runningRef.current) {
          requestAnimationFrame(loop);
        }
      };
      requestAnimationFrame(loop);
    };

    if (isRecording) {
      // Start fresh.
      runningRef.current = true;
      scoreRef.current = 100;
      setLiveScore(100);
      setFinalScore(null);

      runUserLoop();
      runRefLoop();

      // Scoring loop ~10x per second
      scoringIntervalRef.current = window.setInterval(() => {
        const userLm = userLandmarksRef.current;
        const refLm = refLandmarksRef.current;
        if (!userLm || !refLm) return;

        const poseError = computePoseError(refLm, userLm);
        const timingPenalty = computeTimingPenalty();

        // For debugging: see how much pose error we're getting in the console.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[LiveScore] poseError=', poseError.toFixed(3), 'timingPenalty=', timingPenalty);
        }

        // Map errors to a per-tick penalty.
        // Small errors shave off tiny amounts; large errors bigger chunks.
        let penalty = 0;
        if (poseError < 0.10) {
          // Very close to reference – still allow tiny decay so long recordings don't stay exactly 100.
          penalty += 0.05;
        } else if (poseError < 0.25) {
          penalty += 0.3;
        } else if (poseError < 0.45) {
          penalty += 0.9;
        } else if (poseError < 0.8) {
          penalty += 1.8;
        } else {
          penalty += 3.0;
        }

        // Timing penalty always adds on top (can be 0).
        penalty += timingPenalty || 0;

        // Apply penalty monotonically; never allow score to go up.
        const current = scoreRef.current;
        const next = Math.max(0, current - penalty);
        scoreRef.current = next;
        setLiveScore((prev) => {
          // guard against any race that might try to increase it
          const base = typeof prev === 'number' ? Math.min(prev, current) : current;
          return Math.max(0, Math.min(base, next));
        });
      }, 100);
    } else {
      // Recording stopped or not started.
      runningRef.current = false;
      if (scoringIntervalRef.current !== null) {
        clearInterval(scoringIntervalRef.current);
        scoringIntervalRef.current = null;
      }

      // Lock in final score when recording transitions from true -> false.
      if (liveScore !== null && finalScore === null) {
        setFinalScore(liveScore);
      }
    }

    return () => {
      // Cleanup on unmount / dependency change.
      if (!runningRef.current && scoringIntervalRef.current !== null) {
        clearInterval(scoringIntervalRef.current);
        scoringIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isReady]);

  return {
    liveScore,
    finalScore,
    isReady,
  };
}


