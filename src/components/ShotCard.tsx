import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CLIP_FORMATS, ClipFormat } from '../lib/ffmpegClip';
import { renderClip } from '../lib/renderClip';
import { MonstahShot } from '../types';
import { playDuolingoHoverSound } from '../utils/soundUtils';

interface ShotCardProps {
  shot: MonstahShot;
  index: number;
  isSelected: boolean;
  onSelect: (shot: MonstahShot) => void;
  videoFile: File | null;
  s3VideoUrl?: string | null;
  originalVideoUrl?: string;
}

const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  index,
  isSelected,
  onSelect,
  videoFile,
  s3VideoUrl,
  originalVideoUrl,
}) => {
  const [isCreatingClip, setIsCreatingClip] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<ClipFormat>('original');
  const [formatOpen, setFormatOpen] = useState(false);

  const handleClick = () => onSelect(shot);

  const viralScore = shot.score || 0;
  const hashtags = shot.tags || [];
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
    const hasSource = !!(videoFile || s3VideoUrl || originalVideoUrl);
    if (!hasSource) {
      toast.error('No source video found! Please try re-uploading.');
      return;
    }

    setIsCreatingClip(true);
    const isCloud = !!s3VideoUrl;
    setProgressMessage(isCloud ? '☁️ Sending to server...' : '📥 Step 1/3 — Loading...');

    try {
      const clipBlob = await renderClip({
        shot,
        format: selectedFormat,
        videoFile,
        s3VideoUrl,
        originalVideoUrl,
        onProgress: (msg) => setProgressMessage(msg),
      });

      const url = URL.createObjectURL(clipBlob);
      const fmt = CLIP_FORMATS.find((f) => f.id === selectedFormat);
      const filename = `monstah_${fmt?.id}_${shot.timestamp.replace(/:/g, '-')}.mp4`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast.success(`✅ Downloaded: ${filename}`);
    } catch (error: any) {
      console.error('❌ Clip creation failed:', error);
      toast.error(`Failed to create clip: ${error.message}`);
    } finally {
      setIsCreatingClip(false);
      setProgressMessage('');
    }
  };

  // ── Progress step resolve ──────────────────────────────────────────────────
  const resolveStep = (msg: string): number => {
    if (msg.includes('Finalizing') || msg.includes('✅')) return 3;
    if (msg.includes('3/3') || msg.includes('Monstah Blur') || msg.includes('Applying')) return 2;
    if (msg.includes('2/3') || msg.includes('2/2') || msg.includes('Trimming') || msg.includes('Encoding') || msg.includes('Converting')) return 1;
    return 0;
  };

  const STEPS = ['Read', 'Trim', 'Apply', 'Done'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => onSelect(shot)}
      onMouseEnter={playDuolingoHoverSound}
      className={`relative bg-zinc-900/40 p-5 rounded-2xl border backdrop-blur-sm transition-all duration-300 group cursor-pointer ${
        isSelected
          ? 'border-blue-500 ring-1 ring-blue-500 shadow-2xl shadow-blue-500/10'
          : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/60'
      }`}
    >
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm p-4">

        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="text-2xl font-bold text-white font-mono">{shot.timestamp}</div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${getViralBg(viralScore)} ${getViralColor(viralScore)} border`}>
            {viralScore}% VIRAL
          </div>
        </div>

        {/* Trigger */}
        <p className="text-gray-300 text-sm mb-3 line-clamp-3 italic">
          "{shot.trigger || shot.description}"
        </p>

        {/* Hashtags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {hashtags.slice(0, 4).map((tag: string, i: number) => (
            <span key={i} className="px-2 py-0.5 bg-gray-700/50 text-gray-300 text-xs rounded-full">
              {tag}
            </span>
          ))}
          {hashtags.length > 4 && (
            <span className="px-2 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded-full">
              +{hashtags.length - 4}
            </span>
          )}
        </div>

        {/* ── Format Dropdown ── */}
        <div className="mb-3 relative">
          <button
            onClick={(e) => { e.stopPropagation(); setFormatOpen((o) => !o); }}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 hover:border-zinc-500 rounded-xl text-sm transition-all"
          >
            <div className="flex items-center gap-2">
              <span>{CLIP_FORMATS.find((f) => f.id === selectedFormat)?.icon}</span>
              <span className="font-semibold text-white">{CLIP_FORMATS.find((f) => f.id === selectedFormat)?.label}</span>
              <span className="text-gray-500 text-xs">{CLIP_FORMATS.find((f) => f.id === selectedFormat)?.dims}</span>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${formatOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {formatOpen && (
            <div className="absolute bottom-full mb-2 left-0 right-0 z-[100] bg-zinc-900 border border-zinc-700 rounded-xl overflow-y-auto max-h-72 shadow-2xl shadow-black/50 custom-scrollbar">
              {CLIP_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedFormat(fmt.id); setFormatOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0 ${
                    selectedFormat === fmt.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{fmt.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{fmt.label}</span>
                      <span className="text-xs text-gray-500 font-mono">{fmt.dims}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt.description}</p>
                  </div>
                  {selectedFormat === fmt.id && (
                    <svg className="w-4 h-4 text-blue-400 ml-auto flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Download Button / Live Progress ── */}
        {isCreatingClip ? (
          <div className="w-full rounded-xl bg-zinc-800/80 border border-zinc-700 p-3 space-y-2">
            {/* Step track */}
            <div className="flex items-start justify-between gap-1">
              {STEPS.map((label, i) => {
                const activeIdx = resolveStep(progressMessage);
                const isPast = i < activeIdx;
                const isCurrent = i === activeIdx;
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-1 rounded-full transition-all duration-500 ${
                      isPast ? 'bg-green-400' : isCurrent ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-700'
                    }`} />
                    <span className={`text-[9px] text-center leading-tight ${
                      isPast ? 'text-green-400' : isCurrent ? 'text-yellow-300 font-semibold' : 'text-zinc-600'
                    }`}>
                      {isPast ? '✓ ' : ''}{label}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Current message */}
            <div className="flex items-center gap-2 text-xs text-yellow-300">
              <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="truncate">{progressMessage || 'Starting...'}</span>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleDownloadClip(); }}
            disabled={!videoFile && !s3VideoUrl && !originalVideoUrl}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              !videoFile && !s3VideoUrl && !originalVideoUrl
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] hover:from-[#FF5252] hover:to-[#FF7043] text-white shadow-lg hover:shadow-xl'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {s3VideoUrl ? '⚡ RENDER & DOWNLOAD' : videoFile ? 'DOWNLOAD MP4 CLIP' : '☁️ RENDER FROM CLOUD'}
          </button>
        )}

        {/* View Shot Button — always visible */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          className={`w-full mt-2 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            isSelected
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
              : 'bg-gradient-to-r from-[#00E7FF] to-[#0080FF] hover:from-[#00D4E7] hover:to-[#0070E0] text-white'
          }`}
        >
          <span className="text-lg">👀</span>
          {isSelected ? 'VIEWING NOW' : 'VIEW THIS SHOT'}
        </button>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-2 left-2">
          <div className="w-3 h-3 bg-[#00E7FF] rounded-full animate-pulse" />
        </div>
      )}
    </motion.div>
  );
};

export default ShotCard;