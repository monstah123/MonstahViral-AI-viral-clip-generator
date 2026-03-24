import React, { useState, useEffect, useRef } from 'react';
import { analyzeVideoForShots } from './utils/geminiService';
import { VideoProject, MonstahShot, VideoClip } from './types';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import ShotCard from './components/ShotCard';
import { uploadToS3 } from './lib/aws';
import { createMp4Clip, downloadClip, listClips, testOriginalVideo } from './utils/videoStorage';
import { Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [selectedShot, setSelectedShot] = useState<MonstahShot | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [generatedClips, setGeneratedClips] = useState<VideoClip[]>([]);
  const [isClipping, setIsClipping] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 Initializing MONSTAHVIRAL...');
      const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
      setHasApiKey(!!apiKey);
    };
    initializeApp();
  }, []);

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      setAnalysisProgress(0);
    }
  }, [isProcessing]);

  const seekToTimestamp = (timestamp: string) => {
    if (!videoRef.current) return;
    const [minutes, seconds] = timestamp.split(':').map(Number);
    const timeInSeconds = (minutes * 60) + seconds;
    videoRef.current.currentTime = timeInSeconds;
    videoRef.current.play();
    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleFileUpload = async (file: File) => {
    if (!hasApiKey) {
      alert("Please set up your Google API key first");
      return;
    }
    
    setIsProcessing(true);
    setVideoFile(file);
    
    try {
      const awsUrl = await uploadVideoToAWS(file);
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = (reader.result as string).split(',')[1];
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const shots = await analyzeVideoForShots(base64, file.type);
      const videoUrl = URL.createObjectURL(file);
      
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        title: file.name,
        originalVideoUrl: videoUrl,
        s3Url: awsUrl,
        status: 'ready',
        shots,
        clips: []
      });
      
      if (shots.length > 0) {
        setSelectedShot(shots[0]);
        setTimeout(() => seekToTimestamp(shots[0].timestamp), 500);
      }
      
      setUploadedVideoUrl(awsUrl);
      
    } catch (error: any) {
      console.error("❌ Upload/Analysis failed:", error);
      alert(error.message || 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectShot = (shot: MonstahShot) => {
    setSelectedShot(shot);
    seekToTimestamp(shot.timestamp);
  };

  const handleExport = () => {
    if (!selectedShot || !project) {
      alert("Select a shot first!");
      return;
    }
    
    const shotDetails = `
MONSTAHVIRAL - Viral Clip Details
===============================
Timestamp: ${selectedShot.timestamp}
Duration: ${selectedShot.duration}
Score: ${selectedShot.score}/100
Description: ${selectedShot.description}
Hashtags: ${selectedShot.tags.join(', ')}

Project: ${project.title}
Export Time: ${new Date().toLocaleString()}
    `;
    
    const blob = new Blob([shotDetails], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monstah-shot-${selectedShot.timestamp.replace(':', '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };


  const uploadVideoToAWS = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${cleanName}`;
    const filePath = `uploads/${fileName}`;
    
    return await uploadToS3(filePath, file, file.type || 'video/mp4');
  };

  const clipAndUploadShot = async (shot: MonstahShot): Promise<VideoClip | null> => {
    if (!project?.s3Url) {
      alert("No video loaded");
      return null;
    }
    
    setIsClipping(true);
    try {
      const duration = 15;
      const durationMatch = shot.duration.match(/(\d+)/);
      const clipDuration = durationMatch ? parseInt(durationMatch[1]) : duration;

      const clipUrl = await createMp4Clip(
        project.originalVideoUrl || project.s3Url,
        shot.timestamp,
        `${clipDuration}s`,
        shot.description
      );

      if (!clipUrl) {
        throw new Error('Failed to create clip');
      }
      
      const newClip: VideoClip = {
        id: `clip_${Date.now()}`,
        originalShotId: shot.id,
        timestamp: shot.timestamp,
        duration: `${clipDuration}s`,
        s3Url: clipUrl,
        metadata: {
          shotId: shot.id,
          timestamp: shot.timestamp,
          startTime: (() => {
            const [min, sec] = shot.timestamp.split(':').map(Number);
            return min * 60 + sec;
          })(),
          duration: clipDuration,
          description: shot.description,
          score: shot.score,
          tags: shot.tags,
          originalVideo: project.title,
          createdAt: new Date().toISOString(),
          projectId: project.id,
          originalVideoUrl: project.s3Url,
          viralScore: shot.score,
          suggestedHashtags: shot.tags
        },
        createdAt: new Date().toISOString()
      };
      
      setGeneratedClips(prev => [...prev, newClip]);
      if (project) {
        setProject({
          ...project,
          clips: [...(project.clips || []), newClip]
        });
      }
      
      alert(`✅ Clip Created!\n\nTimestamp: ${shot.timestamp}\nDuration: ${clipDuration}s\n\nYou can download it from the shot card!`);
      
      return newClip;
      
    } catch (error: any) {
      console.error("❌ Clip creation failed:", error);
      alert(`Clip creation failed: ${error.message}`);
      return null;
    } finally {
      setIsClipping(false);
    }
  };

  const handleCreateClip = async () => {
    if (!selectedShot) {
      alert("Select a shot first!");
      return;
    }
    await clipAndUploadShot(selectedShot);
  };



  const clearProject = () => {
    if (project?.originalVideoUrl) URL.revokeObjectURL(project.originalVideoUrl);
    setProject(null);
    setSelectedShot(null);
    setUploadedVideoUrl(null);
    setGeneratedClips([]);
    setVideoFile(null);
  };

  if (hasApiKey === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">MONSTAHVIRAL</h1>
          <p className="text-gray-400 mb-8">AI-Powered Viral Shorts Generator</p>
          <div className="bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 backdrop-blur-xl">
            <h2 className="text-2xl font-bold mb-4 text-green-400">API Key Required</h2>
            <p className="text-gray-300 mb-6">Add your Google Gemini API key to `.env.local` to start generating viral shots.</p>
            <div className="flex gap-4">
              <button onClick={() => setHasApiKey(true)} className="px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-full transition-all hover:scale-105">Continue Anyway</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!project ? (
          <div className="flex flex-col items-center justify-center space-y-8 py-12">
            
            {/* 🌈 CYBERPUNK HEADLINE */}
            {!isProcessing && (
              <div className="text-center mb-8">
                <h1 className="text-7xl font-black tracking-tight mb-4 cyber-headline">
                  <span className="text-purple-500">FEED</span>{' '}
                  <span className="text-blue-500">THE</span>{' '}
                  <span className="text-orange-500">MONSTAH</span>
                </h1>
                <p className="text-gray-400 text-lg">
                  Drop your video and let AI find your next viral hit
                </p>
              </div>
            )}

            {/* PROCESSING STATE - CYBERPUNK ANIMATION */}
            {isProcessing ? (
              <div className="text-center py-20 w-full">
                <div className="inline-block relative">
                  {/* Spinning Ring */}
                  <div className="cyber-spinner"></div>
                  
                  {/* Center Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-12 h-12 text-white animate-pulse" />
                  </div>
                </div>

                {/* BLADE RUNNER TEXT */}
                <div className="mt-8 space-y-2">
                  <p className="text-2xl font-bold cyber-text">
                    <span className="text-purple-500">ANALYZING</span>{' '}
                    <span className="text-blue-500">YOUR</span>{' '}
                    <span className="text-orange-500">VIDEO</span>
                  </p>
                  <p className="text-gray-500 text-sm font-mono">
                    {Math.round(analysisProgress)}% COMPLETE
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="mt-6 max-w-md mx-auto">
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full cyber-progress-bar transition-all duration-500"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* UPLOAD AREA */
              <>
              <div className="w-full">
                <VideoUploader onUpload={handleFileUpload} isLoading={isProcessing} />
              </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-green-400">MONSTAH SHOTS FOUND</h3>
                <button onClick={clearProject} className="text-gray-400 hover:text-white transition-colors">Clear Project</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {project.shots.map((shot, index) => (
                  <ShotCard 
                    key={shot.id} 
                    shot={shot}
                    index={index}
                    isSelected={selectedShot?.id === shot.id}
                    onSelect={handleSelectShot}
                    videoFile={videoFile}
                  />
                ))}
              </div>
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-bold">Original Video</h4>
                  {selectedShot && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">Currently viewing:</span>
                      <span className="font-bold bg-green-500/20 text-green-400 px-3 py-1 rounded-full">{selectedShot.timestamp}</span>
                    </div>
                  )}
                </div>
                {project.originalVideoUrl ? (
                  <video ref={videoRef} key={project.originalVideoUrl} src={project.originalVideoUrl} controls className="w-full rounded-xl aspect-video bg-black" />
                ) : (
                  <div className="w-full aspect-video bg-black rounded-xl flex items-center justify-center">
                    <p className="text-gray-500">Video not available</p>
                  </div>
                )}
              </div>
              {generatedClips.length > 0 && (
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                  <h4 className="text-lg font-bold mb-4">🎬 Generated Clips</h4>
                  <div className="space-y-3">
                    {generatedClips.map((clip) => (
                      <div key={clip.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                        <div>
                          <p className="font-medium">{clip.timestamp} - {clip.duration}</p>
                          <p className="text-sm text-gray-400">Created: {new Date(clip.createdAt).toLocaleTimeString()}</p>
                        </div>
                        <a href={clip.s3Url} download className="px-3 py-1 bg-blue-500 hover:bg-blue-400 rounded text-sm">Download</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-1">
              <div className="sticky top-8 space-y-6">
                <h3 className="text-2xl font-bold text-blue-400">SELECTED SHOT</h3>
                {selectedShot ? (
                  <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm text-gray-400">Timestamp</div>
                        <div className="text-2xl font-bold">{selectedShot.timestamp}</div>
                      </div>
                      <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-bold">{selectedShot.score}% VIRAL</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Duration</div>
                      <div className="font-bold">{selectedShot.duration}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Description</div>
                      <p className="text-gray-300">{selectedShot.description}</p>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Trending Hashtags</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedShot.tags.map((tag, idx) => (
                          <span key={idx} className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-zinc-800 space-y-3">
                      <button onClick={handleCreateClip} disabled={isClipping} className={`w-full px-4 py-3 rounded-lg font-bold ${isClipping ? 'bg-purple-800' : 'bg-purple-500 hover:bg-purple-400'} text-white`}>
                        {isClipping ? '🔄 Creating Clip...' : '🎬 Create 15s Clip'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 flex flex-col items-center justify-center">
                    <div className="text-5xl mb-4">🎬</div>
                    <h4 className="text-xl font-bold mb-2">No Shot Selected</h4>
                    <p className="text-gray-400 text-sm text-center">Click on any Monstah Shot to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      {project && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-md border-t border-zinc-800 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="hidden md:block">
              <p className="text-sm text-zinc-400">
                Project: <span className="text-white font-bold">{project?.title}</span>
                {selectedShot && <span className="ml-4">Selected: <span className="text-green-400">{selectedShot?.timestamp}</span></span>}
                {generatedClips?.length > 0 && <span className="ml-4">Clips: <span className="text-purple-400">{generatedClips.length}</span></span>}
              </p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { if (selectedShot) seekToTimestamp(selectedShot.timestamp); else alert("Select a shot first!"); }} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-bold transition-all">Jump to Shot</button>
              <button onClick={handleExport} className="px-6 py-2 bg-green-500 hover:bg-green-400 text-black rounded-full text-sm font-bold transition-all">Export Details</button>
              <button onClick={handleCreateClip} disabled={isClipping || !selectedShot} className={`px-6 py-2 rounded-full text-sm font-bold ${isClipping || !selectedShot ? 'bg-purple-800' : 'bg-purple-500 hover:bg-purple-400'} text-white`}>{isClipping ? 'Creating...' : 'Create Clip'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 CYBERPUNK STYLES */}
      <style>{`
        /* 3D EXTRUSION HEADLINE */
.cyber-headline {
  text-shadow: 
    1px 1px 0 rgba(168, 85, 247, 0.9),
    2px 2px 0 rgba(168, 85, 247, 0.8),
    3px 3px 0 rgba(168, 85, 247, 0.7),
    4px 4px 0 rgba(168, 85, 247, 0.6),
    5px 5px 0 rgba(168, 85, 247, 0.5),
    6px 6px 0 rgba(168, 85, 247, 0.4),
    7px 7px 0 rgba(168, 85, 247, 0.3),
    8px 8px 0 rgba(168, 85, 247, 0.2),
    9px 9px 20px rgba(0, 0, 0, 0.8);
  transform: perspective(500px) rotateX(15deg);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { 
    transform: perspective(500px) rotateX(15deg) translateY(0); 
  }
  50% { 
    transform: perspective(500px) rotateX(15deg) translateY(-10px); 
  }
}

/* Blade Runner Text Effect */
.cyber-text {
  text-shadow: 
    0 0 5px currentColor,
    0 0 10px currentColor;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.15em;
}
        /* Spinning Ring Animation */
        .cyber-spinner {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            #a855f7 0deg,
            #3b82f6 120deg,
            #f97316 240deg,
            #a855f7 360deg
          );
          animation: spin 2s linear infinite;
          mask: radial-gradient(farthest-side, transparent calc(100% - 8px), white 0);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), white 0);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Progress Bar Gradient */
        .cyber-progress-bar {
          background: linear-gradient(
            90deg,
            #a855f7 0%,
            #3b82f6 50%,
            #f97316 100%
          );
          box-shadow: 
            0 0 10px #a855f7,
            0 0 20px #3b82f6,
            0 0 30px #f97316;
        }

        /* Glitch Effect */
        @keyframes glitch {
          0%, 100% {
            transform: translate(0);
          }
          20% {
            transform: translate(-2px, 2px);
          }
          40% {
            transform: translate(-2px, -2px);
          }
          60% {
            transform: translate(2px, 2px);
          }
          80% {
            transform: translate(2px, -2px);
          }
        }
      `}</style>
    </div>
  );
};

export default App;