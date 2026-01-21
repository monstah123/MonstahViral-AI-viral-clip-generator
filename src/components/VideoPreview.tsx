
import React from 'react';
import { MonstahShot } from '../types';

interface Props {
  videoUrl: string | null;
  isLoading: boolean;
  shot: MonstahShot | null;
}

const VideoPreview: React.FC<Props> = ({ videoUrl, isLoading, shot }) => {
  return (
    <div className="relative group">
      {/* Phone Frame Mockup */}
      <div className="relative mx-auto w-[280px] h-[560px] bg-[#121212] rounded-[3rem] border-8 border-zinc-800 overflow-hidden shadow-2xl flex flex-col">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-800 rounded-b-2xl z-20"></div>
        
        <div className="flex-1 relative flex items-center justify-center bg-black">
          {isLoading ? (
            <div className="flex flex-col items-center px-6 text-center">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-blue-400 font-brand text-xs uppercase tracking-tighter animate-pulse">Generating Viral Hooks...</p>
              <p className="text-zinc-600 text-[10px] mt-4">Veo 3.1 is creating high-energy B-roll and transitions for this Monstah Shot.</p>
            </div>
          ) : videoUrl ? (
            <div className="relative w-full h-full">
               <video 
                src={videoUrl} 
                autoPlay 
                loop 
                muted 
                className="w-full h-full object-cover"
              />
              
              {/* Simulated UI Overlays */}
              <div className="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
                <div className="space-y-4">
                  <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-white mb-1">@CreatorHandle</p>
                    <p className="text-[10px] text-gray-300 leading-tight">
                      {shot?.description || "Monstah AI generated short content."}
                    </p>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-green-400 bg-black/40 p-2 rounded-lg">
                    <span>DYNAMIC ZOOM: ON</span>
                    <span>AUTO-CAPTIONS: READY</span>
                  </div>
                </div>
              </div>

              {/* TikTok like icons */}
              <div className="absolute right-2 bottom-20 flex flex-col space-y-4 text-white">
                <div className="flex flex-col items-center"><div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">❤️</div><span className="text-[10px]">12.4k</span></div>
                <div className="flex flex-col items-center"><div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">💬</div><span className="text-[10px]">342</span></div>
                <div className="flex flex-col items-center"><div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">⤴️</div><span className="text-[10px]">Share</span></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center px-8 text-center text-zinc-700">
              <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="font-brand text-[10px] uppercase">Select a shot to preview viral transformation</p>
            </div>
          )}
        </div>

        {/* Home Indicator */}
        <div className="h-10 bg-black flex items-center justify-center">
          <div className="w-20 h-1 bg-zinc-700 rounded-full"></div>
        </div>
      </div>

      {videoUrl && !isLoading && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-full text-center">
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Platform: TikTok / Reels / Shorts Optimized</p>
        </div>
      )}
    </div>
  );
};

export default VideoPreview;
