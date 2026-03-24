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
      // Complex filter for blurred padding: 
      // 1. Scale background to 1080x1920 (ignoring aspect) & blur it
      // 2. Scale foreground to fit 1080 width & center it
      // 3. Overlay the foreground on the background
      return '[0:v]scale=1080:1920,boxblur=20:10[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=y=(H-h)/2';
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
  videoFile: File,
  startTime: number,
  endTime: number,
  onProgress?: (msg: string) => void,
  format: ClipFormat = 'original'
): Promise<Blob> {
  const ff = await loadFFmpeg(onProgress);
  const duration = endTime - startTime;

  onProgress?.('Reading video file...');
  const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `input.${ext}`;
  await ff.writeFile(inputName, await fetchFile(videoFile));

  const vf = buildVideoFilter(format);
  onProgress?.(format === 'original' ? 'Processing video...' : `Converting to ${CLIP_FORMATS.find(f => f.id === format)?.label}...`);

  const cleanup = async () => {
    try { await ff!.deleteFile(inputName); } catch {}
    try { await ff!.deleteFile('output.mp4'); } catch {}
  };

  try {
    // ─── THE "UNIVERSAL COMPATIBILITY" COMMAND ───
    const args = [
      '-i', inputName,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      ...(vf ? ['-vf', vf] : []),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'faststart',
      'output.mp4'
    ];

    await ff.exec(args);
    const data = await ff.readFile('output.mp4');
    await cleanup();
    return new Blob([data instanceof Uint8Array ? data : new Uint8Array(data as any)], { type: 'video/mp4' });
  } catch (err) {
    await cleanup();
    console.error('Clipping failed:', err);
    throw err;
  }
}