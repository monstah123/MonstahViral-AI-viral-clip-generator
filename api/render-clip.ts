import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const config = { maxDuration: 300 };

// ─── FFmpeg: download once, cache in /tmp ────────────────────────────────────
const FFMPEG_PATH = '/tmp/ffmpeg';
const FFMPEG_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64';

let downloadPromise: Promise<string> | null = null;
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function ensureFFmpegAsync(): Promise<string> {
  // If it's already downloaded and verified, return it instantly
  if (fs.existsSync(FFMPEG_PATH)) {
    const stats = fs.statSync(FFMPEG_PATH);
    if (stats.size > 10_000_000) {
      return FFMPEG_PATH;
    }
    console.log('[render-clip] Existing FFmpeg is too small (corrupted), deleting...');
    fs.unlinkSync(FFMPEG_PATH);
  }

  // If a download is currently in progress, wait for it instead of starting another
  if (downloadPromise) {
    console.log('[render-clip] Waiting for existing FFmpeg download to finish...');
    return downloadPromise;
  }

  // Start a new download and store the promise globally so concurrent requests can await it
  downloadPromise = new Promise(async (resolve, reject) => {
    console.log('[render-clip] Downloading FFmpeg binary...');
    const t = Date.now();
    const tempPath = `${FFMPEG_PATH}_temp_${Date.now()}`;
    
    try {
      // Use async exec to prevent blocking the Node.js event loop
      await execAsync(`curl -sL "${FFMPEG_URL}" -o "${tempPath}" && chmod +x "${tempPath}"`, {
        timeout: 120_000,
      });
      console.log(`[render-clip] FFmpeg downloaded in ${((Date.now() - t) / 1000).toFixed(1)}s`);

      if (!fs.existsSync(tempPath)) throw new Error('FFmpeg download failed (temp file missing)');
      
      const finalStats = fs.statSync(tempPath);
      if (finalStats.size < 10_000_000) {
        fs.unlinkSync(tempPath);
        throw new Error('Downloaded FFmpeg is too small, possibly an HTML error page');
      }
      
      // Atomic rename ensures no other request reads a partially written file
      fs.renameSync(tempPath, FFMPEG_PATH);
      resolve(FFMPEG_PATH);
    } catch (error) {
      downloadPromise = null; // Reset on failure so we can try again
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(error);
    }
  });

  return downloadPromise;
}

// ─── AWS (lazy) ──────────────────────────────────────────────────────────────
function getS3() {
  const bucket = process.env.VITE_AWS_BUCKET_NAME;
  const region = process.env.VITE_AWS_REGION;
  const accessKeyId = process.env.VITE_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VITE_AWS_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(`Missing env vars: ${[!bucket&&'BUCKET',!region&&'REGION',!accessKeyId&&'KEY',!secretAccessKey&&'SECRET'].filter(Boolean).join(', ')}`);
  }
  return { bucket, region, client: new S3Client({ region, credentials: { accessKeyId, secretAccessKey } }) };
}

// ─── Filters ─────────────────────────────────────────────────────────────────
type FR = { vf: string } | { fc: string } | null;
function buildFilter(f: string): FR {
  switch (f) {
    case 'vertical_crop':      return { vf: 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920' };
    case 'vertical_crop_left': return { vf: 'crop=ih*9/16:ih:0:0,scale=1080:1920' };
    case 'vertical_crop_right':return { vf: 'crop=ih*9/16:ih:iw-ih*9/16:0,scale=1080:1920' };
    case 'vertical_blur':      return { fc: '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=15:3[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2' };
    case 'vertical_pad':       return { vf: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black' };
    case 'square':             return { vf: 'crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=1080:1080' };
    default: return null;
  }
}

// ─── FFmpeg runner ───────────────────────────────────────────────────────────
function run(bin: string, args: string[], timeoutMs = 280_000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg]', args.join(' '));
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`FFmpeg timed out (${timeoutMs/1000}s)`)); }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`)); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

const ENC = ['-c:v','libx264','-profile:v','baseline','-level','3.0','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','faststart'];

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Ensure FFmpeg
  let bin: string;
  try {
    bin = await ensureFFmpegAsync();
  } catch (e: any) {
    return res.status(500).json({ error: `FFmpeg setup failed: ${e.message}` });
  }

  // 2. Validate AWS
  let aws: ReturnType<typeof getS3>;
  try { aws = getS3(); } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  // 3. Parse request
  const { s3Key, startTime, duration, format } = req.body ?? {};
  if (!s3Key || startTime == null || !duration) {
    return res.status(400).json({ error: 'Missing: s3Key, startTime, duration' });
  }

  const src = `https://${aws.bucket}.s3.${aws.region}.amazonaws.com/${s3Key}`;
  const clipKey = `clips/${Date.now()}_${format || 'original'}.mp4`;
  const tmpOut = path.join(os.tmpdir(), `${Date.now()}_out.mp4`);
  const tmpTrim = path.join(os.tmpdir(), `${Date.now()}_trim.mp4`);
  const cleanup = () => { try{fs.unlinkSync(tmpOut)}catch{} try{fs.unlinkSync(tmpTrim)}catch{} };

  console.log('[render-clip] Start:', { s3Key, startTime, duration, format });

  try {
    const filter = format && format !== 'original' ? buildFilter(format) : null;

    if (!filter) {
      await run(bin, ['-ss',String(startTime),'-i',src,'-t',String(duration),'-c','copy','-avoid_negative_ts','make_zero','-movflags','faststart','-y',tmpOut]);
    } else {
      // Step 1: fast trim
      await run(bin, ['-ss',String(startTime),'-i',src,'-t',String(duration),'-c','copy','-avoid_negative_ts','make_zero','-y',tmpTrim]);
      // Step 2: encode with filter
      if ('fc' in filter) {
        await run(bin, ['-i',tmpTrim,'-filter_complex',filter.fc,'-map','0:a?',...ENC,'-y',tmpOut]);
      } else {
        await run(bin, ['-i',tmpTrim,'-vf',filter.vf,...ENC,'-y',tmpOut]);
      }
    }

    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) {
      throw new Error('FFmpeg produced no output');
    }

    // Upload to S3
    await aws.client.send(new PutObjectCommand({
      Bucket: aws.bucket, Key: clipKey, Body: fs.readFileSync(tmpOut),
      ContentType: 'video/mp4', ContentDisposition: 'attachment', ACL: 'public-read',
    }));

    const url = `https://${aws.bucket}.s3.${aws.region}.amazonaws.com/${clipKey}`;
    console.log('[render-clip] ✅', url);
    return res.status(200).json({ clipUrl: url, clipKey });

  } catch (e: any) {
    console.error('[render-clip] ❌', e);
    return res.status(500).json({ error: e.message ?? 'Render failed' });
  } finally { cleanup(); }
}
