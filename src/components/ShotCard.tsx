// src/components/ShotCard.tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { createMP4Clip, parseTimestamp, parseDuration } from '../lib/ffmpegClip';

interface ShotCardProps {
  shot: any;
  index?: number;
  isSelected?: boolean;
  isActive?: boolean;
  onSelect?: (shot: any) => void;
  onClick?: () => void;
  videoFile?: File | null;
}

export default function ShotCard({ 
  shot, 
  index = 0, 
  isSelected, 
  isActive,
  onSelect, 
  onClick,
  videoFile 
}: ShotCardProps) {
  const [isCreatingClip, setIsCreatingClip] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  // Handle both prop names
  const selected = isSelected ?? isActive ?? false;
  const handleClick = () => {
    if (onClick) onClick();
    if (onSelect) onSelect(shot);
  };

  // Handle both score formats
  const viralScore = shot.viralScore ?? shot.score ?? 0;
  const hashtags = shot.hashtags ?? shot.tags ?? [];
  const duration = shot.duration || '5s';

  const getViralColor = (score: number) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 75) return 'text-yellow-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const getViralBg = (score: number) => {
    if (score >= 90) return 'bg-green-500/20 border-green-500/50';
    if (score >= 75) return 'bg-yellow-500/20 border-yellow-500/50';
    if (score >= 60) return 'bg-orange-500/20 border-orange-500/50';
    return 'bg-red-500/20 border-red-500/50';
  };

  const handleDownloadClip = async () => {
    if (!videoFile) {
      toast.error('No video file available. Please re-upload your video.');
      return;
    }

    setIsCreatingClip(true);
    setProgressMessage('Starting...');

    try {
      const startTime = parseTimestamp(shot.timestamp);
      const clipDuration = parseDuration(duration);
      const endTime = startTime + clipDuration;

      console.log(`📹 Creating MP4 clip: ${shot.timestamp} (${startTime}s - ${endTime}s)`);

      const clipBlob = await createMP4Clip(
        videoFile,
        startTime,
        endTime,
        (msg) => setProgressMessage(msg)
      );

      // Download the clip
      const url = URL.createObjectURL(clipBlob);
      const filename = `monstah_clip_${shot.timestamp.replace(/:/g, '-')}_${clipDuration}s.mp4`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast.success(`✅ MP4 clip downloaded: ${filename}`);
      
    } catch (error: any) {
      console.error('❌ Clip creation failed:', error);
      toast.error(`Failed to create clip: ${error.message}`);
    } finally {
      setIsCreatingClip(false);
      setProgressMessage('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${
        selected 
          ? 'ring-2 ring-[#00E7FF] shadow-lg shadow-[#00E7FF]/20' 
          : 'hover:ring-1 hover:ring-white/30'
      }`}
      onClick={handleClick}
    >
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm p-4">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="text-2xl font-bold text-white font-mono">
            {shot.timestamp}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${getViralBg(viralScore)} ${getViralColor(viralScore)} border`}>
            {viralScore}% VIRAL
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-300 text-sm mb-3 line-clamp-3">
          {shot.description}
        </p>

        {/* Hashtags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {hashtags.slice(0, 4).map((tag: string, i: number) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-gray-700/50 text-gray-300 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
          {hashtags.length > 4 && (
            <span className="px-2 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded-full">
              +{hashtags.length - 4}
            </span>
          )}
        </div>

        {/* Download Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownloadClip();
          }}
          disabled={isCreatingClip || !videoFile}
          className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            isCreatingClip
              ? 'bg-yellow-600 text-white cursor-wait'
              : !videoFile
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] hover:from-[#FF5252] hover:to-[#FF7043] text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {isCreatingClip ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {progressMessage || 'Processing...'}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              DOWNLOAD MP4 CLIP
            </>
          )}
        </button>

        {/* View Shot Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className={`w-full mt-2 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            selected
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
              : 'bg-gradient-to-r from-[#00E7FF] to-[#0080FF] hover:from-[#00D4E7] hover:to-[#0070E0] text-white'
          }`}
        >
          <span className="text-lg">👀</span>
          {selected ? 'VIEWING NOW' : 'VIEW THIS SHOT'}
        </button>
      </div>

      {/* Selection Indicator */}
      {selected && (
        <div className="absolute top-2 left-2">
          <div className="w-3 h-3 bg-[#00E7FF] rounded-full animate-pulse" />
        </div>
      )}
    </motion.div>
  );
}