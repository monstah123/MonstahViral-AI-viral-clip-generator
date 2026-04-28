/**
 * renderClip.ts
 *
 * Unified clip renderer.
 * 1. Tries the Vercel /api/render-clip server-side route (native FFmpeg — fast, reliable)
 * 2. Falls back to browser FFmpeg WASM if the API is unavailable or times out
 */

import { createMP4Clip, parseTimestamp, parseDuration, ClipFormat } from './ffmpegClip';
import { MonstahShot } from '../types';

export interface RenderOptions {
  shot: MonstahShot;
  format: ClipFormat;
  /** Local File object (used as browser WASM fallback source) */
  videoFile: File | null;
  /** S3 URL of the source video — used for server-side rendering */
  s3VideoUrl?: string | null;
  /** Blob URL / any other URL (secondary fallback) */
  originalVideoUrl?: string | null;
  /** Progress callback — called with human-readable status strings */
  onProgress: (msg: string) => void;
}

export async function renderClip(opts: RenderOptions): Promise<Blob> {
  const { shot, format, videoFile, s3VideoUrl, originalVideoUrl, onProgress } = opts;

  const startTime   = parseTimestamp(shot.timestamp);
  const clipDuration = parseDuration(shot.duration || '30s');

  // ── Attempt 1: Server-side native FFmpeg via Vercel API route ─────────────
  if (s3VideoUrl) {
    try {
      // Extract the S3 key from the full URL
      const s3Key = s3VideoUrl.split('.amazonaws.com/')[1];
      if (!s3Key) throw new Error('Cannot parse S3 key from URL');

      onProgress('☁️ Step 1/2 — Sending to server...');
      console.log('[renderClip] Using server-side render for key:', s3Key);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000); // 90 s client timeout

      const response = await fetch('/api/render-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          s3Key,
          startTime,
          duration: clipDuration,
          format,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errData.error ?? `Server returned ${response.status}`);
      }

      const { clipUrl } = await response.json();
      if (!clipUrl) throw new Error('Server returned no clip URL');

      onProgress('📥 Step 2/2 — Downloading rendered clip...');
      const clipRes = await fetch(clipUrl);
      if (!clipRes.ok) throw new Error('Failed to fetch rendered clip from S3');

      onProgress('✅ Finalizing download...');
      return await clipRes.blob();

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn('[renderClip] Server render timed out — falling back to browser WASM');
        onProgress('⚠️ Server timed out — switching to browser render (may be slow)...');
      } else {
        console.warn('[renderClip] Server render failed:', err.message, '— falling back to browser WASM');
        onProgress(`⚠️ Server unavailable — switching to browser render...`);
      }
      // Fall through to browser WASM
    }
  }

  // ── Attempt 2: Browser WASM (fallback for local files / dev / API failure) ─
  const source: File | string = videoFile || s3VideoUrl || originalVideoUrl || '';
  if (!source) throw new Error('No video source available');

  console.log('[renderClip] Using browser WASM render');
  return createMP4Clip(
    source,
    startTime,
    startTime + clipDuration,
    onProgress,
    format
  );
}
