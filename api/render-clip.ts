import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const config = { maxDuration: 300 }; // 300s (5 min) — Vercel Pro

// ─── Safe FFmpeg binary resolution ───────────────────────────────────────────
let ffmpegBin: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffmpegBin = require('ffmpeg-static');
} catch (e) {
  console.error('[render-clip] ffmpeg-static not found:', e);
}

// Fallback: check common system paths
if (!ffmpegBin || !fs.existsSync(ffmpegBin)) {
  const fallbacks = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/bin/ffmpeg'];
  for (const fb of fallbacks) {
    if (fs.existsSync(fb)) {
      ffmpegBin = fb;
      console.log('[render-clip] Using system ffmpeg at:', fb);
      break;
    }
  }
}

// ─── AWS (lazy init inside handler to catch missing env vars gracefully) ──────
function getS3() {
  const bucket = process.env.VITE_AWS_BUCKET_NAME;
  const region = process.env.VITE_AWS_REGION;
  const accessKeyId = process.env.VITE_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VITE_AWS_SECRET_ACCESS_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    const missing = [
      !bucket && 'VITE_AWS_BUCKET_NAME',
      !region && 'VITE_AWS_REGION',
      !accessKeyId && 'VITE_AWS_ACCESS_KEY_ID',
      !secretAccessKey && 'VITE_AWS_SECRET_ACCESS_KEY',
    ].filter(Boolean);
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

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
function runFFmpeg(bin: string, args: string[], timeoutMs = 280_000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg] Running:', bin, args.join(' '));
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}. Stderr: ${stderr.slice(-800)}`));
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

  // ── Preflight: check FFmpeg is available ──────────────────────────────────
  if (!ffmpegBin) {
    return res.status(500).json({
      error: 'FFmpeg binary not found. The ffmpeg-static package failed to load and no system FFmpeg is available.',
      diagnostic: 'FFMPEG_NOT_FOUND',
    });
  }

  if (!fs.existsSync(ffmpegBin)) {
    return res.status(500).json({
      error: `FFmpeg binary path exists (${ffmpegBin}) but the file is missing. The Vercel deployment may not have bundled it.`,
      diagnostic: 'FFMPEG_FILE_MISSING',
    });
  }

  // ── Preflight: check AWS env vars ─────────────────────────────────────────
  let aws: ReturnType<typeof getS3>;
  try {
    aws = getS3();
  } catch (err: any) {
    return res.status(500).json({ error: err.message, diagnostic: 'AWS_ENV_MISSING' });
  }

  const { s3Key, startTime, duration, format } = req.body ?? {};
  if (!s3Key || startTime == null || !duration) {
    return res.status(400).json({ error: 'Missing required fields: s3Key, startTime, duration' });
  }

  // Build source URL — FFmpeg reads directly via HTTP range requests (no full download!)
  const sourceUrl = `https://${aws.bucket}.s3.${aws.region}.amazonaws.com/${s3Key}`;
  const clipKey   = `clips/${Date.now()}_${format || 'original'}.mp4`;
  const tmpOut    = path.join(os.tmpdir(), `${Date.now()}_out.mp4`);
  const tmpTrim   = path.join(os.tmpdir(), `${Date.now()}_trim.mp4`);

  const cleanup = () => {
    try { fs.unlinkSync(tmpOut); }  catch {}
    try { fs.unlinkSync(tmpTrim); } catch {}
  };

  console.log('[render-clip] Starting:', { s3Key, startTime, duration, format, sourceUrl });

  try {
    const filter = format && format !== 'original' ? buildFilter(format) : null;

    if (!filter) {
      // ── Original: codec copy, no re-encode, instant ──────────────────────
      await runFFmpeg(ffmpegBin, [
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
      await runFFmpeg(ffmpegBin, [
        '-ss', String(startTime),
        '-i', sourceUrl,
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y', tmpTrim,
      ]);

      // ── Step 2: Encode only the small trimmed clip ────────────────────────
      if ('filterComplex' in filter) {
        await runFFmpeg(ffmpegBin, [
          '-i', tmpTrim,
          '-filter_complex', filter.filterComplex,
          '-map', '0:a?',
          ...ENCODE_ARGS,
          '-y', tmpOut,
        ]);
      } else {
        await runFFmpeg(ffmpegBin, [
          '-i', tmpTrim,
          '-vf', filter.vf,
          ...ENCODE_ARGS,
          '-y', tmpOut,
        ]);
      }
    }

    // ── Verify output exists ────────────────────────────────────────────────
    if (!fs.existsSync(tmpOut)) {
      throw new Error('FFmpeg completed but output file is missing');
    }

    const outStat = fs.statSync(tmpOut);
    if (outStat.size === 0) {
      throw new Error('FFmpeg produced an empty output file');
    }

    console.log('[render-clip] FFmpeg done, output size:', outStat.size);

    // ── Upload rendered clip to S3 ──────────────────────────────────────────
    const body = fs.readFileSync(tmpOut);
    await aws.client.send(new PutObjectCommand({
      Bucket:             aws.bucket,
      Key:                clipKey,
      Body:               body,
      ContentType:        'video/mp4',
      ContentDisposition: 'attachment',
      ACL:                'public-read',
    }));

    const publicUrl = `https://${aws.bucket}.s3.${aws.region}.amazonaws.com/${clipKey}`;
    console.log('[render-clip] ✅ Done:', publicUrl);
    return res.status(200).json({ clipUrl: publicUrl, clipKey });

  } catch (err: any) {
    console.error('[render-clip] ❌', err);
    return res.status(500).json({
      error: err.message ?? 'Render failed',
      diagnostic: err.message?.includes('FFmpeg') ? 'FFMPEG_ERROR' : 'UNKNOWN',
    });
  } finally {
    cleanup();
  }
}
