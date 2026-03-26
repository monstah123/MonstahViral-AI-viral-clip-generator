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

async function loadFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;

  if (loading) {
    while (loading) await new Promise(r => setTimeout(r, 100));
    if (ffmpeg && loaded) return ffmpeg;
  }

  loading = true;
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
  ffmpeg.on('progress', ({ progress }) =>
    onProgress?.(`Processing: ${Math.round(progress * 100)}%`)
  );

  onProgress?.('Loading FFmpeg...');

  try {
    const base = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript'),
    });
  } catch {
    try {
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    } catch {
      loading = false;
      throw new Error('Failed to load FFmpeg. Please refresh and try again.');
    }
  }

  loaded = true;
  loading = false;
  return ffmpeg;
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

  onProgress?.('📥 Step 1/3 — Reading video...');
  const ext = typeof videoFile === 'string' ? 'mp4' : (videoFile.name.split('.').pop()?.toLowerCase() || 'mp4');
  const inputName = `input.${ext}`;

  try {
    const fileContent = await fetchFile(videoFile);
    await ff.writeFile(inputName, fileContent);
  } catch (err) {
    console.error('Fetch error:', err);
    throw new Error('Failed to load video source. Check S3 CORS settings!');
  }

  const vf = buildVideoFilter(format);
  const isComplexFilter = vf && vf.includes('[');

  const cleanup = async () => {
    try { await ff!.deleteFile(inputName); } catch {}
    try { await ff!.deleteFile('trimmed.mp4'); } catch {}
    try { await ff!.deleteFile('output.mp4'); } catch {}
  };

  // Per-step watchdog — rejects the promise if FFmpeg stalls
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  const makeWatchdog = (minutes: number) =>
    new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(
        () => reject(new Error(`Step timed out after ${minutes} min. Try a shorter clip.`)),
        minutes * 60 * 1000
      );
    });
  const clearWatchdog = () => {
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
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
      // ── SINGLE-PASS for simple/no filters ────────────────────────────────
      const label = CLIP_FORMATS.find(f => f.id === format)?.label || format;
      onProgress?.(
        format === 'original'
          ? '⚙️ Step 2/2 — Encoding clip...'
          : `⚙️ Step 2/2 — Converting to ${label}...`
      );
      await Promise.race([
        ff.exec([
          '-ss', startTime.toString(),
          '-i', inputName,
          '-t', duration.toString(),
          ...(vf ? ['-vf', vf] : []),
          '-c:v', 'libx264',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          // Only force output size when a format filter is applied. 'original' keeps source dims.
          ...(vf ? ['-s', '1080x1920'] : []),
          '-movflags', 'faststart',
          'output.mp4',
        ]),
        makeWatchdog(4),
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
    console.error('Clipping failed:', err);
    throw err;
  }
}