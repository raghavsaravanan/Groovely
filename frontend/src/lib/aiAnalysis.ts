/**
 * AI Video Analysis Service
 * Analyzes dance videos and returns 3 metrics on a scale of 1–10.
 * All scoring goes through the real backend — there is no simulated fallback.
 */

import { getApiBaseUrl } from './api';

export interface AIScore {
  timing: number;
  energy: number;
  technique: number;
  overall: number;
  feedback: string[];
  detection_rate?: number;
  total_frames?: number;
}

function getApiUrl(): string {
  return getApiBaseUrl();
}

/**
 * Analyzes a video file by sending it to the backend API.
 * Throws a descriptive error if the backend is unreachable or returns a non-OK status.
 */
export async function analyzeVideo(videoFile: File, _videoDuration?: number): Promise<AIScore> {
  const apiBaseUrl = getApiUrl();

  const formData = new FormData();
  formData.append('video', videoFile);

  const base = apiBaseUrl.replace(/\/$/, '');
  const endpoint = `${base}/api/analyze`;

  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: formData });
  } catch (err: any) {
    throw new Error(
      'Could not reach the scoring service. Please check your connection and try again.'
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      (errorData as any).detail ||
      (errorData as any).error ||
      `Scoring failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  const data = await response.json();
  return {
    timing: data.timing,
    energy: data.energy,
    technique: data.technique,
    overall: data.overall,
    feedback: data.feedback || [],
    detection_rate: data.detection_rate,
    total_frames: data.total_frames,
  };
}

/**
 * Analyzes video from URL (for already-uploaded videos).
 * Throws if the backend is unreachable — no simulated fallback.
 */
export async function analyzeVideoFromUrl(_videoUrl: string): Promise<AIScore> {
  throw new Error(
    'URL-based analysis is not supported. Please upload the video file directly.'
  );
}

/**
 * Dance Comparison Result
 */
export interface DanceComparisonResult {
  accuracy_score: number; // 0-100
  max_score: number;
  feedback: string[];
  comparison_video_path?: string;
}

/**
 * Compare user's dance video against a reference routine video.
 * Returns accuracy score and feedback.
 */
export async function compareDanceVideos(
  referenceVideo: File | string,
  userVideo: File
): Promise<DanceComparisonResult> {
  const apiBaseUrl = getApiUrl();
  const formData = new FormData();

  if (typeof referenceVideo === 'string') {
    let response: Response;
    try {
      response = await fetch(referenceVideo);
    } catch {
      throw new Error(
        'Could not load the reference video. Please check your connection and try again.'
      );
    }
    if (!response.ok) {
      throw new Error(
        `Reference video not found (${response.status}). The routine video may have been removed.`
      );
    }
    const blob = await response.blob();
    formData.append(
      'reference_video',
      new File([blob], 'reference-video.mp4', { type: blob.type || 'video/mp4' })
    );
  } else {
    formData.append('reference_video', referenceVideo);
  }

  formData.append('user_video', userVideo);

  const base = apiBaseUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/compare-dance`, { method: 'POST', body: formData });
  } catch {
    throw new Error(
      'Could not reach the scoring service. Please check your connection and try again.'
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      (errorData as any).detail ||
      (errorData as any).error ||
      `Comparison failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  const data = await response.json();
  return {
    accuracy_score: data.accuracy_score,
    max_score: data.max_score,
    feedback: data.feedback || [],
    comparison_video_path: data.comparison_video_path,
  };
}

