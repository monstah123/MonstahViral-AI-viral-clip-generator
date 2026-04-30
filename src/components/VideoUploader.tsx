import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileVideo, Plus } from 'lucide-react';

interface VideoUploaderProps {
  onUpload: (file: File, focusMode: string) => void;
  isLoading: boolean;
}

// Synthesize a quick "whoosh" hover sound using Web Audio API
const playHoverSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dist = ctx.createWaveShaper();

    // Slight distortion for texture
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (Math.PI + 100) * x / (Math.PI + 100 * Math.abs(x));
    }
    dist.curve = curve;

    osc.connect(dist);
    dist.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);

    osc.onended = () => ctx.close();
  } catch (_) {
    // Silently fail if audio is blocked
  }
};

const GB = 1024 * 1024 * 1024;

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUpload, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const [largFileWarning, setLargeFileWarning] = useState(false);
  const [focusMode, setFocusMode] = useState('Default (Viral Moments)');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const FOCUS_MODES = [
    'Default (Viral Moments)',
    'Educational & Tutorial',
    'Funny & Comedy',
    'Action & Highlights',
    'Drama & Storytelling'
  ];

  const processFile = (file: File) => {
    if (file.size > 2 * GB) {
      alert('❌ File is too large!\n\nMax size is 2 GB (≈ 15–20 min 1080p).\n\nTip: Compress with HandBrake or trim in iMovie first.');
      return;
    }
    // Advisory only — warn but allow
    if (file.size > 1 * GB) {
      setLargeFileWarning(true);
    } else {
      setLargeFileWarning(false);
    }
    onUpload(file, focusMode);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) {
      playHoverSound();
    }
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-zinc-900/40 border-2 border-dashed border-zinc-800 rounded-3xl p-24 text-center backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-orange-500/10 animate-pulse"></div>
          <div className="flex flex-col items-center gap-6 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
              <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            </div>
            <div className="space-y-2">
              <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-orange-400 bg-clip-text text-transparent">
                FEEDING THE MONSTAH...
              </p>
              <p className="text-gray-500 font-mono text-sm tracking-widest animate-pulse">
                UPLOADING TO S3 & ANALYZING
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isDragging && handleBrowseClick()}
        onMouseEnter={() => {
          playHoverSound();
        }}
        className={`
          relative group cursor-pointer transition-all duration-500
          rounded-[2rem] border-2 border-dashed overflow-hidden
          ${isDragging 
            ? 'bg-blue-500/10 border-blue-400 shadow-[0_0_50px_rgba(59,130,246,0.3)]' 
            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 shadow-2xl'}
        `}
      >
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
           <div className="absolute top-0 -left-1/4 w-1/2 h-full bg-purple-500/10 blur-[100px] animate-pulse"></div>
           <div className="absolute bottom-0 -right-1/4 w-1/2 h-full bg-orange-500/10 blur-[100px] animate-pulse delay-700"></div>
        </div>

        <div className="p-8 md:p-12 relative z-10">
          <div className="flex flex-col items-center gap-5 md:gap-6">
            
            {/* AI Focus Mode Selector */}
            <div className="relative group/select z-50 w-full max-w-xs mb-2 md:mb-4" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-black text-purple-400 mb-2 uppercase tracking-widest text-center">
                AI Focus Mode
              </label>
              <select
                value={focusMode}
                onChange={(e) => setFocusMode(e.target.value)}
                className="w-full appearance-none bg-zinc-950 border border-zinc-800 hover:border-purple-500 text-white text-sm font-bold py-3 px-4 rounded-xl cursor-pointer outline-none transition-colors shadow-2xl focus:ring-2 focus:ring-purple-500/50 text-center"
              >
                {FOCUS_MODES.map((mode) => (
                  <option key={mode} value={mode} className="bg-zinc-900 text-white">
                    {mode}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 bottom-3.5 pointer-events-none">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            
            {/* Main Icon Area */}
            <div className="relative">
              <div className={`
                w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center transition-all duration-500
                ${isDragging ? 'bg-blue-500 scale-110 rotate-12' : 'bg-zinc-800 group-hover:bg-zinc-700'}
              `}>
                {isDragging ? (
                  <Upload className="w-10 h-10 md:w-12 md:h-12 text-white animate-bounce" />
                ) : (
                  <FileVideo className="w-10 h-10 md:w-12 md:h-12 text-blue-400 group-hover:text-blue-300" />
                )}
              </div>
              
              {/* Floating Plus */}
              <div className="absolute -bottom-2 -right-2 w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
            </div>

            {/* Text & Headlines */}
            <div className="text-center space-y-2 md:space-y-3">
              <h3 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                {isDragging ? 'DROP IT HERE!' : 'DRAG YOUR VIDEO'}
              </h3>
              <p className="text-gray-400 text-base md:text-lg max-w-sm mx-auto">
                Drop your video and let the <span className="text-orange-500 font-bold italic">Monstah</span> find your next viral hit
              </p>
            </div>

            {/* Browse Button - Cyberpunk Style */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseClick();
              }}
              className="relative px-8 py-3 md:px-10 md:py-4 font-bold text-white group/btn overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-blue-500 rounded-full"></div>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
              <span className="relative z-10 flex items-center gap-2">
                BROWSE FILES
              </span>
            </button>

            {/* Formats info */}
            <p className="text-zinc-600 text-xs md:text-sm font-mono tracking-widest flex flex-wrap justify-center gap-2 uppercase">
              MP4 • MOV • AVI • MKV • UP TO 2 GB
            </p>

            {/* VPN Advisory */}
            <p className="text-xs text-zinc-500 max-w-sm text-center px-4 leading-relaxed mt-[-0.5rem] md:mt-[-1rem]">
              <span className="text-purple-400 font-bold">Notice:</span> If you are in a country where Google Gemini is restricted, please enable a VPN (US/UK) to use this tool.
            </p>

            {/* Large file advisory */}
            {largFileWarning && (
              <div className="flex items-start gap-2 max-w-sm px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-left">
                <span className="text-yellow-400 text-lg flex-shrink-0">⚠️</span>
                <p className="text-yellow-300 text-xs leading-relaxed">
                  <span className="font-bold">Large file detected.</span> Rendering will still work, but may take longer and requires at least 4 GB of free RAM. Make sure no other heavy apps are open.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="video/*,.mp4,.mov,.avi,.mkv"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

export default VideoUploader;