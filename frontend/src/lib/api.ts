import { supabase, Profile } from './supabase';

export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env && typeof env === 'string' && env.trim().length > 0) {
    return env.trim().replace(/\/$/, '');
  }
  // Local dev only — VITE_API_URL must be set in all deployed environments
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:5000`;
    }
    throw new Error(
      'VITE_API_URL is not configured. Set this environment variable to your backend URL ' +
      '(e.g. https://api.groovely.app) in your deployment environment settings.'
    );
  }
  return 'http://localhost:5000';
}

/**
 * Wakes the backend if it is sleeping (e.g. Render free-tier cold start).
 * Pings /api/health with exponential backoff up to maxAttempts times.
 * Calls onWaiting() on the first retry so the UI can show a "warming up" state.
 * Returns true when the backend is healthy, false if all attempts fail.
 */
export async function wakeUpBackend(
  onWaiting?: () => void,
  maxAttempts = 4
): Promise<boolean> {
  const delays = [0, 5000, 8000, 12000];
  for (let i = 0; i < maxAttempts; i++) {
    if (delays[i] > 0) {
      if (i === 1 && onWaiting) onWaiting();
      await new Promise((r) => setTimeout(r, delays[i]));
    }
    try {
      const res = await fetch(apiUrl('/api/health'), {
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) return true;
    } catch {
      // swallow and retry
    }
  }
  return false;
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // For video processing endpoints, use longer timeout (10 minutes for 58+ second videos)
  const isVideoProcessing = path.includes('/api/tries');
  
  if (isVideoProcessing && !init?.signal) {
    const controller = new AbortController();
    const timeout = 600000; // 10 minutes in milliseconds
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(apiUrl(path), { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. Video processing is taking longer than expected. Please try again.');
      }
      throw error;
    }
  }
  
  return fetch(apiUrl(path), init);
}

type JsonRecord = Record<string, unknown>;
