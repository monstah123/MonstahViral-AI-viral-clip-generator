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
      const timeout = setTimeout(() => controller.abort(), 300_000); // 300 s client timeout (5 min)

      let response;
      let retries = 3;
      let lastErr;

      while (retries > 0) {
        try {
          response = await fetch('/api/render-clip', {
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
          
          if (response.ok) break; // Success!

          // If not OK, read error but don't immediately throw if we can retry
          const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          lastErr = new Error(errData.error ?? `Server returned ${response.status}`);
          
          // Only retry on 502/504 gateway timeouts or cold start drops
          if (response.status !== 502 && response.status !== 504 && response.status !== 500) {
            retries = 0; // Don't retry 4xx errors
          }
        } catch (e: any) {
          lastErr = e;
          // Network errors (like ERR_SSL_PROTOCOL_ERROR) throw TypeError "Failed to fetch"
          if (e.name === 'AbortError') retries = 0; // Don't retry manual timeouts
        }
        
        retries--;
        if (retries > 0) {
          console.warn(`[renderClip] Render attempt failed: ${lastErr?.message}. Retrying in 2s...`);
          onProgress('☁️ Server warming up... retrying connection...');
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      clearTimeout(timeout);

      if (!response || !response.ok) {
        throw lastErr || new Error('Server render failed after retries.');
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
        console.warn('[renderClip] Server render timed out');
        // Don't silently fall back to browser WASM for cloud videos — it will hang for hours
        throw new Error(
          'Server render timed out (5 min limit). Your clip may be too long or the server is overloaded. ' +
          'Try a shorter clip or wait a moment and retry.'
        );
      } else {
        console.warn('[renderClip] Server render failed:', err.message);
        // If we have an S3 URL, the file is too large for browser WASM — don't fall back
        throw new Error(
          `Server render failed: ${err.message}. ` +
          'The cloud renderer could not process this clip. Try again or use a shorter segment.'
        );
      }
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
