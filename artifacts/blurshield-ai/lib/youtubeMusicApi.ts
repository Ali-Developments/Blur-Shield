/**
 * Client for the YouTube music removal API.
 * Endpoint: /api/audio/youtube-jobs (served by api-server via Replit proxy)
 *
 * React Native / Expo NEVER runs Python. All heavy work is delegated to the
 * backend. Callers must treat network / backend failures as non-fatal.
 */

import { getApiOrigin } from '@/lib/apiBase';

export type YtJobStatus = 'queued' | 'initializing' | 'model_ready' | 'processing' | 'encoding' | 'ready' | 'completed' | 'failed' | 'error';

export interface YtJobInfo {
  id:            string;
  status:        YtJobStatus;
  stage:         string;
  progress:      number;   // 0–100
  message:       string;
  streamingReady?: boolean;
  error?:        string;
}

export function isYtJobActive(status: YtJobStatus | string): boolean {
  return ['queued', 'initializing', 'model_ready', 'processing', 'encoding', 'ready'].includes(status);
}

function apiBase(): string {
  // Resolve on every call so local ↔ Replit / Expo host changes are picked up.
  return `${getApiOrigin()}/api/audio`;
}

function friendlyApiError(status: number, body: string): string {
  const lower = (body || '').toLowerCase();
  if (status === 0 || status >= 500) {
    return 'Music removal service is unavailable right now. Please try again later.';
  }
  if (lower.includes('no python') || lower.includes('python executable')) {
    return 'Music removal backend is not configured (Python worker unavailable). Browsing continues normally.';
  }
  if (body && body.length < 280) return body;
  return `Music removal failed (${status}). Browsing continues normally.`;
}

/** Submit a YouTube URL for music removal. Returns the new job ID. */
export async function submitYoutubeJob(
  videoUrl: string,
): Promise<string> {
  let res: Response;
  try {
    console.log('[youtubeMusicApi] API Connected', apiBase());
    res = await fetch(`${apiBase()}/youtube-jobs`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ videoUrl }),
    });
  } catch (err) {
    console.error('[youtubeMusicApi] API Failed', err);
    throw new Error('Music removal service is unavailable right now. Please try again later.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[youtubeMusicApi] API Failed', res.status, body);
    throw new Error(friendlyApiError(res.status, body));
  }
  const data: { jobId: string } = await res.json();
  if (!data.jobId) throw new Error('Server returned no job ID');
  return data.jobId;
}

/** Poll a job's current status. */
export async function pollYoutubeJob(jobId: string): Promise<YtJobInfo> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/youtube-jobs/${jobId}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    console.error('[youtubeMusicApi] API Failed', err);
    throw new Error('Music removal service is unavailable right now. Please try again later.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[youtubeMusicApi] API Failed', res.status, body);
    throw new Error(friendlyApiError(res.status, body));
  }
  return res.json();
}

/** Returns the URL for the processed audio stream (MP3, supports range requests). */
export function youtubeResultUrl(jobId: string): string {
  const url = `${apiBase()}/youtube-jobs/${jobId}/result`;
  console.log('[youtubeMusicApi] frontend download URL', { jobId, url });
  return url;
}

/** Extract an 11-character YouTube video ID from a URL, or null if not a watch page. */
export function extractVideoId(url: string): string | null {
  const m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
            url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}
