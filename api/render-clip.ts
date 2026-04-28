import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Native FFmpeg binary bundled via ffmpeg-static
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = require('ffmpeg-static');

export const config = { maxDuration: 60 }; // 60 s — upgrade Vercel plan for longer allowance

// ─── AWS ──────────────────────────────────────────────────────────────────────
const BUCKET = process.env.VITE_AWS_BUCKET_NAME!;
const REGION  = process.env.VITE_AWS_REGION!;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.VITE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY!,
  },
});

// ─── Video filters (mirrors ffmpegClip.ts) ────────────────────────────────────
type FilterResult = { vf: string } | { filterComplex: string } | null;

function buildFilter(format: string): FilterResult {
  switch (format) {
    case 'vertical_crop':
      return { vf: 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920' };
    case 'vertical_crop_left':
      return { vf: 'crop=ih*9/16:ih:0:0,scale=1080:1920' };
    case 'vertical_crop_right':
      return { vf: 'crop=ih*9/16:ih:iw-ih*9/16:0,scale=1080:1920' };
    case 'vertical_blur':
      return { filterComplex: '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=15:3[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2' };
    case 'vertical_pad':
      return { vf: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black' };
    case 'square':
      return { vf: 'crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=1080:1080' };
    default:
      return null;
  }
}

// ─── FFmpeg runner ────────────────────────────────────────────────────────────
function runFFmpeg(args: string[], timeoutMs = 55_000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg]', [ffmpegBin, ...args].join(' '));
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}. Stderr: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ─── Encode args builder ──────────────────────────────────────────────────────
const ENCODE_ARGS = [
  '-c:v', 'libx264',
  '-profile:v', 'baseline',
  '-level', '3.0',
  '-preset', 'ultrafast',
  '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', 'faststart',
];

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { s3Key, startTime, duration, format } = req.body ?? {};
  if (!s3Key || startTime == null || !duration) {
    return res.status(400).json({ error: 'Missing required fields: s3Key, startTime, duration' });
  }

  // Build source URL — FFmpeg reads directly via HTTP range requests (no full download!)
  const sourceUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;
  const clipKey   = `clips/${Date.now()}_${format || 'original'}.mp4`;
  const tmpOut    = path.join(os.tmpdir(), `${Date.now()}_out.mp4`);
  const tmpTrim   = path.join(os.tmpdir(), `${Date.now()}_trim.mp4`);

  const cleanup = () => {
    try { fs.unlinkSync(tmpOut); }  catch {}
    try { fs.unlinkSync(tmpTrim); } catch {}
  };

  try {
    const filter = format && format !== 'original' ? buildFilter(format) : null;

    if (!filter) {
      // ── Original: codec copy, no re-encode, instant ──────────────────────
      await runFFmpeg([
        '-ss', String(startTime),
        '-i', sourceUrl,
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', 'faststart',
        '-y', tmpOut,
      ]);
    } else {
      // ── Step 1: Fast trim via codec copy (HTTP seeking into S3, very fast) ─
      await runFFmpeg([
        '-ss', String(startTime),
        '-i', sourceUrl,
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y', tmpTrim,
      ]);

      // ── Step 2: Encode only the small trimmed clip ────────────────────────
      if ('filterComplex' in filter) {
        await runFFmpeg([
          '-i', tmpTrim,
          '-filter_complex', filter.filterComplex,
          '-map', '0:a?',
          ...ENCODE_ARGS,
          '-y', tmpOut,
        ]);
      } else {
        await runFFmpeg([
          '-i', tmpTrim,
          '-vf', filter.vf,
          ...ENCODE_ARGS,
          '-y', tmpOut,
        ]);
      }
    }

    // ── Upload rendered clip to S3 ──────────────────────────────────────────
    const body = fs.readFileSync(tmpOut);
    await s3.send(new PutObjectCommand({
      Bucket:             BUCKET,
      Key:                clipKey,
      Body:               body,
      ContentType:        'video/mp4',
      ContentDisposition: 'attachment',
      ACL:                'public-read',
    }));

    const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${clipKey}`;
    console.log('[render-clip] ✅ Done:', publicUrl);
    return res.status(200).json({ clipUrl: publicUrl, clipKey });

  } catch (err: any) {
    console.error('[render-clip] ❌', err);
    return res.status(500).json({ error: err.message ?? 'Render failed' });
  } finally {
    cleanup();
  }
}
