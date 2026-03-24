/**
 * Utility to capture a thumbnail from a video file at a specific time.
 */
export async function captureThumbnail(videoFile: File | Blob, timeInSeconds: number = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    // Create URL for the video file
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;
    
    video.onloadedmetadata = () => {
      // Seek to the target frame
      video.currentTime = timeInSeconds;
    };
    
    video.onseeked = () => {
      // Create a canvas to draw the frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Draw the frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Clean up the video URL
      URL.revokeObjectURL(videoUrl);
      
      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not create thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    };
    
    video.onerror = (e) => {
      URL.revokeObjectURL(videoUrl);
      reject(e);
    };
  });
}
