// src/lib/ffmpegClip.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loaded = false;
let loading = false;

async function loadFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && loaded) {
    return ffmpeg;
  }

  if (loading) {
    // Wait for existing load to complete
    while (loading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpeg && loaded) return ffmpeg;
  }

  loading = true;
  ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.round(progress * 100);
    onProgress?.(`Processing: ${percent}%`);
  });

  onProgress?.('Loading FFmpeg (this may take a moment)...');
  
  try {
    // Use single-threaded version that doesn't need SharedArrayBuffer
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });
    
    loaded = true;
    loading = false;
    onProgress?.('FFmpeg ready!');
    console.log('✅ FFmpeg loaded successfully');
    return ffmpeg;
  } catch (error) {
    console.error('❌ Failed to load FFmpeg MT, trying single-thread:', error);
    
    // Fallback to single-threaded version
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      loaded = true;
      loading = false;
      onProgress?.('FFmpeg ready!');
      console.log('✅ FFmpeg (single-thread) loaded successfully');
      return ffmpeg;
    } catch (fallbackError) {
      loading = false;
      console.error('❌ FFmpeg fallback also failed:', fallbackError);
      throw new Error('Failed to load FFmpeg. Please refresh and try again.');
    }
  }
}

export async function createMP4Clip(
  videoFile: File,
  startTime: number,
  endTime: number,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const ff = await loadFFmpeg(onProgress);
  
  const duration = endTime - startTime;
  console.log(`🎬 Creating clip: ${startTime}s to ${endTime}s (${duration}s)`);
  
  onProgress?.('Reading video file...');
  
  // Get file extension
  const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `input.${ext}`;
  
  // Write input file to FFmpeg virtual filesystem
  const inputData = await fetchFile(videoFile);
  await ff.writeFile(inputName, inputData);
  
  onProgress?.('Cutting video with audio...');
  
  try {
    // FFmpeg command to cut video with audio
    await ff.exec([
      '-ss', startTime.toString(),
      '-i', inputName,
      '-t', duration.toString(),
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    
    onProgress?.('Reading output...');
    
    // Read the output file
    const outputData = await ff.readFile('output.mp4');
    
    // Clean up
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile('output.mp4');
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Convert to Blob
    const blob = new Blob([outputData], { type: 'video/mp4' });
    
    console.log(`✅ Clip created: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    onProgress?.('Done!');
    
    return blob;
  } catch (error: any) {
    console.error('FFmpeg exec error:', error);
    
    // Try with re-encoding as fallback
    onProgress?.('Trying alternative encoding...');
    
    await ff.exec([
      '-ss', startTime.toString(),
      '-i', inputName,
      '-t', duration.toString(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    
    const outputData = await ff.readFile('output.mp4');
    
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile('output.mp4');
    } catch (e) {}
    
    const blob = new Blob([outputData], { type: 'video/mp4' });
    console.log(`✅ Clip created (re-encoded): ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    onProgress?.('Done!');
    
    return blob;
  }
}

export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1]) : 5;
}