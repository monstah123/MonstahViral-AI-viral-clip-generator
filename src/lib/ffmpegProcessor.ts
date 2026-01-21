// src/lib/ffmpegProcessor.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    console.log(`[FFmpeg Progress] ${Math.round(progress * 100)}%`);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  loaded = true;
  console.log('[FFmpeg] Loaded successfully');
  return ffmpeg;
}

export async function createClipWithAudio(
  videoFile: File | Blob,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  
  const duration = endTime - startTime;
  console.log(`[FFmpeg] Creating clip: ${startTime}s to ${endTime}s (${duration}s duration)`);
  
  // Write input file
  const inputData = await fetchFile(videoFile);
  await ff.writeFile('input.mp4', inputData);
  console.log('[FFmpeg] Input file written');

  // FFmpeg command with audio
  await ff.exec([
    '-ss', startTime.toString(),
    '-i', 'input.mp4',
    '-t', duration.toString(),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-y',
    'output.mp4'
  ]);

  console.log('[FFmpeg] Clip created');

  // Read output
  const data = await ff.readFile('output.mp4');
  
  // Cleanup
  await ff.deleteFile('input.mp4');
  await ff.deleteFile('output.mp4');

  const blob = new Blob([data], { type: 'video/mp4' });
  console.log(`[FFmpeg] Output blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  
  return blob;
}