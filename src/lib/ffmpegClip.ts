import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─── Utility Helpers ──────────────────────────────────────────────────────────
export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function parseDuration(dur: string): number {
  return parseInt(dur.replace('s', '')) || 15;
}

// ─── Format Types ─────────────────────────────────────────────────────────────
export type ClipFormat = 
  | 'original' 
  | 'vertical_crop' 
  | 'vertical_crop_left' 
  | 'vertical_crop_right' 
  | 'vertical_blur' 
  | 'vertical_pad' 
  | 'square';

export interface ClipFormatOption {
  id: ClipFormat;
  label: string;
  icon: string;
  description: string;
  dims: string;
}

export const CLIP_FORMATS: ClipFormatOption[] = [
  {
    id: 'original',
    label: 'Original',
    icon: '🎞️',
    description: 'Keep source dimensions',
    dims: 'Source',
  },
  {
    id: 'vertical_crop',
    label: 'Vertical — Center Crop',
    icon: '📱',
    description: 'Fills screen by cropping sides (Best for centered speakers)',
    dims: '1080×1920',
  },
  {
    id: 'vertical_blur',
    label: 'Vertical — Monstah Blur',
    icon: '🌫️',
    description: 'Blurred background instead of black bars (The Pro Look)',
    dims: '1080×1920',
  },
  {
    id: 'vertical_crop_left',
    label: 'Vertical — Left Crop',
    icon: '👈',
    description: 'Crop to focus on the left side',
    dims: '1080×1920',
  },
  {
    id: 'vertical_crop_right',
    label: 'Vertical — Right Crop',
    icon: '👉',
    description: 'Crop to focus on the right side',
    dims: '1080×1920',
  },
  {
    id: 'vertical_pad',
    label: 'Vertical — Pillarbox',
    icon: '⬛',
    description: 'Black bars to fit 9:16 (no cropping)',
    dims: '1080×1920',
  },
  {
    id: 'square',
    label: 'Square',
    icon: '🟫',
    description: 'Center-crop to 1:1 (Instagram feed)',
    dims: '1080×1080',
  },
];

// ─── FFmpeg Singleton ──────────────────────────────────────────────────────────
let ffmpeg: FFmpeg | null = null;
let loaded = false;
let loading = false;

/** Force-destroy the singleton so the next call rebuilds it cleanly. */
export function resetFFmpeg() {
  try { (ffmpeg as any)?.terminate?.(); } catch {}
  ffmpeg = null;
  loaded = false;
  loading = false;
}

/** Attempt to load FFmpeg from a CDN base. Hard-rejects after timeoutMs. */
async function tryLoadFromCDN(
  ff: FFmpeg,
  base: string,
  mt: boolean,
  timeoutMs: number
): Promise<void> {
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`CDN timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );
  const loadArgs = mt
    ? {
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript'),
      }
    : {
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      };
  await Promise.race([ff.load(loadArgs), deadline]);
}

const CDNS = [
  { label: 'jsDelivr (multi-thread)', base: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/esm', mt: true },
  { label: 'jsDelivr (single-thread)', base: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm', mt: false },
  { label: 'unpkg (multi-thread)', base: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm', mt: true },
  { label: 'unpkg (single-thread)', base: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm', mt: false },
];

function makeFFmpegInstance(onProgress?: (msg: string) => void): FFmpeg {
  const ff = new FFmpeg();
  ff.on('log', ({ message }) => console.log('[FFmpeg]', message));
  ff.on('progress', ({ progress }) => onProgress?.(`Processing: ${Math.round(progress * 100)}%`));
  return ff;
}

async function loadFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;

  if (loading) {
    let waited = 0;
    while (loading && waited < 90000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    if (ffmpeg && loaded) return ffmpeg;
    resetFFmpeg();
  }

  loading = true;
  let lastErr = 'Unknown';

  for (const cdn of CDNS) {
    ffmpeg = makeFFmpegInstance(onProgress);
    try {
      onProgress?.(`⏳ Loading FFmpeg (${cdn.label})...`);
      console.log(`[FFmpeg] Trying ${cdn.label}...`);
      await tryLoadFromCDN(ffmpeg, cdn.base, cdn.mt, 90_000);
      loaded = true;
      loading = false;
      console.log(`[FFmpeg] ✅ Loaded via ${cdn.label}`);
      return ffmpeg;
    } catch (err: any) {
      lastErr = err?.message ?? String(err);
      console.warn(`[FFmpeg] ${cdn.label} failed: ${lastErr}`);
      try { (ffmpeg as any)?.terminate?.(); } catch {}
      ffmpeg = null;
    }
  }

  loading = false;
  throw new Error(
    `Failed to load FFmpeg from all sources (last error: ${lastErr}).\n` +
    `Please check your internet connection and try refreshing the page.`
  );
}

function buildVideoFilter(format: ClipFormat): string | null {
  switch (format) {
    case 'vertical_crop':
      return 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920';
    case 'vertical_crop_left':
      return 'crop=ih*9/16:ih:0:0,scale=1080:1920';
    case 'vertical_crop_right':
      return 'crop=ih*9/16:ih:iw-ih*9/16:0,scale=1080:1920';
    case 'vertical_blur':
      // Blurred background fills 9:16, foreground fits inside preserving aspect ratio.
      // Two-pass: trim first (fast), then apply this filter on the small clip.
      return '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=15:3[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2';
    case 'vertical_pad':
      return 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black';
    case 'square':
      return 'crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=1080:1080';
    default:
      return null;
  }
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export async function createMP4Clip(
  videoFile: File | string,
  startTime: number,
  endTime: number,
  onProgress?: (msg: string) => void,
  format: ClipFormat = 'original'
): Promise<Blob> {
  const ff = await loadFFmpeg(onProgress);
  const duration = endTime - startTime;

  const isS3 = typeof videoFile === 'string';
  onProgress?.(isS3 ? '🌐 Step 1/3 — Downloading from cloud (may take a moment)...' : '📥 Step 1/3 — Reading video...');
  const ext = isS3 ? 'mp4' : (videoFile.name.split('.').pop()?.toLowerCase() || 'mp4');
  const inputName = `input.${ext}`;

  // Per-step watchdog — rejects the promise if FFmpeg stalls
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  const makeWatchdog = (minutes: number) =>
    new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(
        () => reject(new Error(`Step timed out after ${minutes} min. Try a shorter clip or check your internet connection.`)),
        minutes * 60 * 1000
      );
    });
  const clearWatchdog = () => {
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  };

  try {
    // Give S3 fetches up to 5 min (large files over slow connections)
    await Promise.race([
      (async () => {
        const fileContent = await fetchFile(videoFile);
        await ff.writeFile(inputName, fileContent);
      })(),
      makeWatchdog(5),
    ]);
    clearWatchdog();
  } catch (err: any) {
    clearWatchdog();
    resetFFmpeg(); // bust the singleton so next attempt starts fresh
    console.error('Fetch/write error:', err);
    const msg = err?.message?.includes('timed out')
      ? err.message
      : 'Failed to load video source. Check your S3 CORS settings and internet connection.';
    throw new Error(msg);
  }

  const vf = buildVideoFilter(format);
  const isComplexFilter = vf && vf.includes('[');

  const cleanup = async () => {
    try { await ff!.deleteFile(inputName); } catch {}
    try { await ff!.deleteFile('trimmed.mp4'); } catch {}
    try { await ff!.deleteFile('output.mp4'); } catch {}
  };

  try {
    if (isComplexFilter) {
      // ── TWO-PASS for complex filters (e.g. vertical_blur) ─────────────────
      // Pass 1: Instant trim via codec copy — no re-encoding of the full file
      onProgress?.('✂️ Step 2/3 — Trimming clip...');
      await Promise.race([
        ff.exec([
          '-ss', startTime.toString(),
          '-i', inputName,
          '-t', duration.toString(),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          'trimmed.mp4',
        ]),
        makeWatchdog(2),
      ]);
      clearWatchdog();

      // Pass 2: Apply blur filter only on the tiny trimmed clip
      onProgress?.('🌫️ Step 3/3 — Applying Monstah Blur...');
      await Promise.race([
        ff.exec([
          '-i', 'trimmed.mp4',
          '-filter_complex', vf!,
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', 'faststart',
          'output.mp4',
        ]),
        makeWatchdog(4),
      ]);
      clearWatchdog();

    } else {
      // ── TWO-PASS for all simple/no filters ───────────────────────────────
      // Pass 1: Fast codec-copy trim — no re-encoding, just cuts the segment.
      //         Works instantly even on 900MB+ source files.
      onProgress?.('✂️ Step 2/3 — Trimming clip...');
      await Promise.race([
        ff.exec([
          '-ss', startTime.toString(),
          '-i', inputName,
          '-t', duration.toString(),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          'trimmed.mp4',
        ]),
        makeWatchdog(2),
      ]);
      clearWatchdog();

      // Pass 2: Encode ONLY the tiny trimmed clip — source is now small (15-60s).
      const label = CLIP_FORMATS.find(f => f.id === format)?.label || format;
      onProgress?.(
        format === 'original'
          ? '⚙️ Step 3/3 — Encoding clip...'
          : `⚙️ Step 3/3 — Converting to ${label}...`
      );
      await Promise.race([
        ff.exec([
          '-i', 'trimmed.mp4',
          ...(vf ? ['-vf', vf] : []),
          '-c:v', 'libx264',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', 'faststart',
          'output.mp4',
        ]),
        makeWatchdog(5), // 5 min max for the encode of a short clip
      ]);
      clearWatchdog();
    }

    onProgress?.('✅ Finalizing download...');
    const data = await ff.readFile('output.mp4');
    await cleanup();
    // Copy into a plain ArrayBuffer so TypeScript's strict Blob check passes (SharedArrayBuffer workaround)
    const rawBuffer: ArrayBuffer = data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      : new ArrayBuffer(0);
    return new Blob([rawBuffer], { type: 'video/mp4' });

  } catch (err) {
    clearWatchdog();
    await cleanup();
    // Reset the singleton so the next render attempt starts with a fresh FFmpeg instance
    resetFFmpeg();
    console.error('Clipping failed:', err);
    throw err;
  }
}