import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─── Format Types ─────────────────────────────────────────────────────────────
export type ClipFormat = 'original' | 'vertical_crop' | 'vertical_pad' | 'square';

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
    label: 'Vertical — Crop',
    icon: '📱',
    description: 'Center-crop to 9:16 (TikTok / Reels / Shorts)',
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
  onProgress?.('FFmpeg ready!');
  return ffmpeg;
}

// ─── Video Filter Builder ──────────────────────────────────────────────────────
function buildVideoFilter(format: ClipFormat): string | null {
  switch (format) {
    case 'vertical_crop':
      return 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920';
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
      '-crf', '22',
      '-pix_fmt', 'yuv420p', // Standard pixel format for all players (CRITICAL FOR WINDOWS)
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      'output.mp4'
    ];
    await ff.exec(args);
  } catch (err: any) {
    console.error('FFmpeg error:', err);
    await cleanup();
    throw new Error('Failed to create a compatible clip.');
  }

  onProgress?.('Finalizing...');
  const data = await ff.readFile('output.mp4') as Uint8Array;
  await cleanup();

  const blob = new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: 'video/mp4' });
  onProgress?.('Done!');
  return blob;
}

// ─── Timestamp / Duration Helpers ─────────────────────────────────────────────
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1]) : 5;
}