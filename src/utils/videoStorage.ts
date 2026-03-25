import { uploadToS3, listItemsFromS3, testS3File } from '../lib/aws';
import { createMP4Clip, parseTimestamp, parseDuration, ClipFormat } from '../lib/ffmpegClip';

export interface VideoClipMetadata {
  shotId: string;
  timestamp: string;
  startTime: number;
  duration: number;
  trigger?: string;
  description?: string;
  score: number;
  tags: string[];
  originalVideo: string;
  createdAt: string;
  projectId: string;
  originalVideoUrl: string;
  viralScore: number;
  suggestedHashtags: string[];
}

export const createMp4Clip = async (
  videoFile: File | string, // Can be a file or URL
  timestamp: string,
  duration: string,
  trigger: string,
  format: ClipFormat = 'original',
  onProgress?: (msg: string) => void
): Promise<string | null> => {
  const startTime = Date.now();
  
  try {
    console.log(`🎬 Creating MP4 clip (${format.toUpperCase()})...`);
    
    // Use the unified Deluxe logic
    let fileToProcess: File;
    if (typeof videoFile === 'string') {
      onProgress?.('Fetching source video...');
      const response = await fetch(videoFile);
      const blob = await response.blob();
      fileToProcess = new File([blob], 'input.mp4', { type: 'video/mp4' });
    } else {
      fileToProcess = videoFile;
    }

    const startSec = parseTimestamp(timestamp);
    const durSec = parseDuration(duration);
    
    const mp4Blob = await createMP4Clip(
      fileToProcess,
      startSec,
      startSec + durSec,
      onProgress,
      format
    );
    
    console.log(`✅ MP4 created: ${(mp4Blob.size / (1024 * 1024)).toFixed(2)}MB`);

    // Download — use iOS-safe method
    const localFileName = `clip_${timestamp.replace(/:/g, '-')}_${durSec}s.mp4`;
    const downloadUrl = URL.createObjectURL(mp4Blob);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    if (isIOS) {
      // iOS Safari: open in new tab (auto-download not supported)
      window.open(downloadUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    } else {
      // All other browsers: direct download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = localFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    }

    // Upload to S3
    const s3FileName = `clip_${timestamp.replace(/:/g, '-')}_${durSec}s_${Date.now()}.mp4`;
    const publicUrl = await uploadToS3(`clips/${s3FileName}`, mp4Blob, 'video/mp4');

    console.log(`✅ COMPLETE! Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return publicUrl;

  } catch (error) {
    console.error('❌ Clip creation failed:', error);
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