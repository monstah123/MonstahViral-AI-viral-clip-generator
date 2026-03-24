import { uploadToS3, listItemsFromS3, testS3File } from '../lib/aws';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface VideoClipMetadata {
  shotId: string;
  timestamp: string;
  startTime: number;
  duration: number;
  description: string;
  score: number;
  tags: string[];
  originalVideo: string;
  createdAt: string;
  projectId: string;
  originalVideoUrl: string;
  viralScore: number;
  suggestedHashtags: string[];
}

const parseTimestamp = (timestamp: string): number => {
  const [minutes, seconds] = timestamp.split(':').map(Number);
  return minutes * 60 + seconds;
};

// Initialize FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let isFFmpegLoading = false;

const loadFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegInstance) return ffmpegInstance;
  
  if (isFFmpegLoading) {
    while (isFFmpegLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpegInstance) return ffmpegInstance;
  }

  isFFmpegLoading = true;
  console.log('⏳ Loading FFmpeg...');

  const ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('FFmpeg:', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.round(progress * 100);
    console.log(`FFmpeg progress: ${percent}%`);
  });
  
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        'text/javascript'
      ),
      wasmURL: await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        'application/wasm'
      ),
    });

    ffmpegInstance = ffmpeg;
    console.log('✅ FFmpeg loaded');
  } catch (error) {
    console.error('❌ FFmpeg load failed:', error);
    throw error;
  } finally {
    isFFmpegLoading = false;
  }

  return ffmpeg;
};

export const createMp4Clip = async (
  videoUrl: string,
  timestamp: string,
  duration: string,
  description: string
): Promise<string | null> => {
  const startTime = Date.now();
  
  try {
    console.log('🎬 Creating MP4 clip (FAST METHOD)...');
    console.log('Video URL:', videoUrl);
    console.log('Timestamp:', timestamp);
    console.log('Duration:', duration);

    const startSeconds = parseTimestamp(timestamp);
    const durationMatch = duration.match(/(\d+)/);
    const durationSeconds = durationMatch ? parseInt(durationMatch[1]) : 15;

    console.log(`⏱️ Cutting from ${startSeconds}s for ${durationSeconds}s`);

    // Step 1: Load FFmpeg (only happens once)
    console.log('📦 Step 1/4: Loading FFmpeg...');
    const ffmpeg = await loadFFmpeg();
    console.log(`✅ FFmpeg ready (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // Step 2: Download original video
    console.log('⬇️ Step 2/4: Downloading video...');
    const videoData = await fetchFile(videoUrl);
    console.log(`✅ Video downloaded: ${(videoData.byteLength / (1024 * 1024)).toFixed(2)}MB (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // Step 3: Write to FFmpeg filesystem
    console.log('💾 Step 3/4: Writing to FFmpeg...');
    await ffmpeg.writeFile('input.mp4', videoData);
    console.log(`✅ File written (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // Step 4: Cut and convert with FFmpeg (FAST!)
    console.log('✂️ Step 4/4: Cutting clip with FFmpeg...');
    await ffmpeg.exec([
      '-ss', startSeconds.toString(),      // Start time
      '-i', 'input.mp4',                   // Input file
      '-t', durationSeconds.toString(),    // Duration
      '-c:v', 'libx264',                   // Video codec
      '-preset', 'ultrafast',              // Fast encoding
      '-crf', '23',                        // Quality
      '-c:a', 'aac',                       // Audio codec
      '-b:a', '128k',                      // Audio bitrate
      '-movflags', '+faststart',           // Web optimization
      '-avoid_negative_ts', 'make_zero',   // Fix timestamp issues
      'output.mp4'
    ]);
    
    console.log(`✅ FFmpeg cut complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // Read the output
    const mp4Data = await ffmpeg.readFile('output.mp4');
    const mp4Blob = new Blob([mp4Data as any], { type: 'video/mp4' });
    
    console.log(`✅ MP4 created: ${(mp4Blob.size / (1024 * 1024)).toFixed(2)}MB`);

    // Clean up
    try {
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }

    // Download to PC
    console.log('💾 Downloading to PC...');
    const fileName = `clip_${timestamp.replace(':', '-')}_${durationSeconds}s.mp4`;
    const downloadUrl = URL.createObjectURL(mp4Blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    console.log('✅ Downloaded to PC:', fileName);

    // Upload to AWS S3
    console.log('☁️ Uploading to AWS S3...');
    const s3FileName = `clip_${timestamp.replace(':', '-')}_${durationSeconds}s_${Date.now()}.mp4`;
    const filePath = `clips/${s3FileName}`;

    const publicUrl = await uploadToS3(filePath, mp4Blob, 'video/mp4');

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ COMPLETE! Total time: ${totalTime}s`);
    console.log('📦 AWS S3 URL:', publicUrl);
    
    return publicUrl;

  } catch (error) {
    console.error('❌ Clip creation failed:', error);
    console.error('Total time before failure:', ((Date.now() - startTime) / 1000).toFixed(1), 's');
    return null;
  }
};

export const downloadClip = async (timestamp: string, duration: string): Promise<void> => {
  const fileName = `clip_${timestamp.replace(':', '-')}_${duration}.mp4`;
  const clips = await listClips();
  const clip = clips.find(c => c.name.includes(timestamp.replace(':', '-')));
  
  if (clip) {
    const link = document.createElement('a');
    link.href = clip.url;
    link.download = fileName;
    link.click();
  } else {
    alert('Clip not found. Please create the clip first.');
  }
};

export const listClips = async (): Promise<Array<{ name: string; url: string }>> => {
  try {
    const items = await listItemsFromS3('clips/');
    
    const sorted = items.sort((a, b) => {
      const timeA = a.LastModified ? a.LastModified.getTime() : 0;
      const timeB = b.LastModified ? b.LastModified.getTime() : 0;
      return timeB - timeA;
    });

    const bucketName = import.meta.env.VITE_AWS_BUCKET_NAME || '';
    const region = import.meta.env.VITE_AWS_REGION || 'us-east-1';

    return sorted.map(file => ({
      name: file.Key || '',
      url: `https://${bucketName}.s3.${region}.amazonaws.com/${file.Key}`
    }));
  } catch (error) {
    console.error('Error listing clips:', error);
    return [];
  }
};

export const testOriginalVideo = async (url: string): Promise<boolean> => {
  return await testS3File(url);
};