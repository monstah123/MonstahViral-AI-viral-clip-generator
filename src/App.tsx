import React, { useState, useEffect, useRef } from 'react';
import { analyzeVideoForShots } from './utils/geminiService';
import { VideoProject, MonstahShot, VideoClip } from './types';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import ShotCard from './components/ShotCard';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import { uploadToS3, listItemsFromS3, deleteFromS3 } from './lib/aws';
import { createMp4Clip, downloadClip, listClips, testOriginalVideo } from './utils/videoStorage';
import { Sparkles, History, Trash2, ExternalLink, ArrowLeft, Edit3, Check, X, Camera, LogOut } from 'lucide-react';
import { captureThumbnail } from './utils/thumbnailUtils';
import { playDuolingoHoverSound } from './utils/soundUtils';
import { useAuth } from './contexts/AuthContext';
import { db } from './lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';

const App: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const [showLanding, setShowLanding] = useState(true);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [selectedShot, setSelectedShot] = useState<MonstahShot | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [generatedClips, setGeneratedClips] = useState<VideoClip[]>([]);
  const [isClipping, setIsClipping] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('Initializing...');
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load history on mount
  useEffect(() => {
    if (!showLanding && user) {
      loadHistory();
    }
  }, [showLanding, user]);

  const loadHistory = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', user.uid),
        orderBy('saveDate', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const userProjects = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setRecentProjects(userProjects);
    } catch (err) {
      console.error('Failed to load history from Firestore:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 Initializing MONSTAHVIRAL...');
      const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
      setHasApiKey(!!apiKey);
    };
    initializeApp();
  }, []);

  const seekToTimestamp = (timestamp: string) => {
    if (!videoRef.current) return;
    const [minutes, seconds] = timestamp.split(':').map(Number);
    const timeInSeconds = (minutes * 60) + seconds;
    videoRef.current.currentTime = timeInSeconds;
    videoRef.current.play();
    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleFileUpload = async (file: File, focusMode: string) => {
    if (!hasApiKey) {
      alert("Please set up your Google API key first");
      return;
    }
    
    setIsProcessing(true);
    setAnalysisProgress(5); // Start
    setVideoFile(file);
    
    try {
      // 1. UPLOAD TO AWS (0% - 70%)
      const awsUrl = await uploadToS3(`uploads/${Date.now()}_${file.name}`, file, file.type, (p) => {
        setAnalysisProgress(Math.floor(p * 0.7)); // Scale 0-100 to 0-70
      });
      
      // 2. CAPTURE THUMBNAIL (70% - 80%)
      setAnalysisProgress(75);
      let thumbUrl = '';
      try {
        const thumbBlob = await captureThumbnail(file, 2);
        const thumbPath = `thumbnails/${Date.now()}_thumb.jpg`;
        thumbUrl = await uploadToS3(thumbPath, thumbBlob, 'image/jpeg');
      } catch (e) {
        console.warn('Thumbnail capture failed, skipping...', e);
      }
      
      // 3. AI ANALYSIS (80% - 100%)
      setAnalysisProgress(82);
      setAnalysisStage('📡 Uploading to Gemini AI...');

      const shots = await analyzeVideoForShots(file, focusMode, (stage, pct) => {
        // pct is 0-100 within the AI phase; map to 82-100 overall
        setAnalysisProgress(82 + Math.round(pct * 0.18));
        setAnalysisStage(stage);
      });
      setAnalysisProgress(100);
      setAnalysisStage('✅ Done!');
      const videoUrl = URL.createObjectURL(file);
      
      const newProject: VideoProject = {
        id: Math.random().toString(36).substr(2, 9),
        title: file.name,
        originalVideoUrl: videoUrl,
        s3Url: awsUrl,
        thumbnailUrl: thumbUrl,
        status: 'ready',
        shots,
        clips: []
      };

      setProject(newProject);
      
      // Save metadata to Firestore automatically
      await saveProjectToFirestore(newProject, awsUrl);
      loadHistory(); // Refresh history
      
      if (shots && shots.length > 0) {
        setSelectedShot(shots[0]);
        setTimeout(() => seekToTimestamp(shots[0].timestamp), 500);
      }
      
      setUploadedVideoUrl(awsUrl);
      
    } catch (err: any) {
      console.error('Upload/Analysis error:', err);
      // Show the REAL error — don't mask Gemini errors as AWS errors
      const msg = err?.message || 'Unknown error';
      if (msg.includes('AWS') || msg.includes('S3') || msg.includes('CORS')) {
        alert(`👹 AWS ERROR:\n\n${msg}`);
      } else if (msg.includes('AI ARCHITECT')) {
        alert(`❌ ${msg}`);
      } else {
        alert(`❌ Upload/Analysis Failed:\n\n${msg}\n\nCheck the browser Console (F12 > Console) for full details.`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenameProject = async (projectId: string, newTitle: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        title: newTitle
      });
      
      setEditingProjectId(null);
      loadHistory();
      
      if (project?.id === projectId) {
        setProject({ ...project, title: newTitle });
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  const saveProjectToFirestore = async (proj: VideoProject, videoS3Url: string) => {
    if (!user) return;
    try {
      const metadata = {
        ...proj,
        s3Url: videoS3Url, // Use the real S3 URL for persistence
        userId: user.uid,
        saveDate: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'projects', proj.id), metadata);
    } catch (err) {
      console.error('Failed to save project metadata to Firestore:', err);
    }
  };

  const loadProject = async (proj: any) => {
    setIsProcessing(true);
    try {
      // Set the project (originalVideoUrl will be the S3 URL now)
      setProject({
        ...proj,
        originalVideoUrl: proj.s3Url // Load directly from S3
      });
      setUploadedVideoUrl(proj.s3Url);
      
      if (proj.shots && proj.shots.length > 0) {
        setSelectedShot(proj.shots[0]);
      }
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProject = async (proj: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPendingDeleteKey(null); // Close the confirm UI

    try {
      // 1. Delete Metadata from Firestore
      await deleteDoc(doc(db, 'projects', proj.id));

      // 2. Delete Video file from S3 if it exists
      if (proj.s3Url) {
         const videoKey = proj.s3Url.split('.amazonaws.com/')[1];
         if (videoKey) await deleteFromS3(videoKey);
      }
      
      // Delete thumbnail from S3 if it exists
      if (proj.thumbnailUrl) {
         const thumbKey = proj.thumbnailUrl.split('.amazonaws.com/')[1];
         if (thumbKey) await deleteFromS3(thumbKey);
      }

      // 3. Force reset if current project
      if (project?.id === proj.id) {
        setProject(null);
      }

      // 4. Show success
      alert('Project deleted successfully.');
      loadHistory();
    } catch (err: any) {
      console.error('Delete failed:', err);
      alert(`❌ Delete failed: ${err?.message || 'Unknown error'}`);
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
    if (!project) return null;
    setIsClipping(true);

    try {
      const { createMP4Clip, parseTimestamp, parseDuration } = await import('./lib/ffmpegClip');

      const startTime = parseTimestamp(shot.timestamp);
      const durSec = parseDuration(shot.duration || '15s');
      const endTime = startTime + durSec;

      const source: File | string = videoFile || project.originalVideoUrl || '';

      const clipBlob = await createMP4Clip(
        source,
        startTime,
        endTime,
        undefined,
        'vertical_blur' // Default: Monstah Blur for sidebar clips
      );

      // Download locally
      const url = URL.createObjectURL(clipBlob);
      const filename = `monstah_${shot.timestamp.replace(/:/g, '-')}_${durSec}s.mp4`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      alert(`✅ Clip Downloaded!\n\nTimestamp: ${shot.timestamp}\nDuration: ${durSec}s\nFormat: Monstah Blur (1080×1920)`);

      const newClip: VideoClip = {
        id: `clip_${Date.now()}`,
        originalShotId: shot.id,
        timestamp: shot.timestamp,
        duration: shot.duration,
        s3Url: '',
        metadata: {
          shotId: shot.id,
          timestamp: shot.timestamp,
          startTime,
          duration: durSec,
          trigger: shot.trigger,
          description: shot.description,
          score: shot.score,
          tags: shot.tags,
          originalVideo: project.title,
          createdAt: new Date().toISOString(),
          projectId: project.id,
          originalVideoUrl: project.originalVideoUrl,
          viralScore: shot.score,
          suggestedHashtags: shot.tags
        },
        createdAt: new Date().toISOString()
      };

      setGeneratedClips(prev => [...prev, newClip]);
      setProject({ ...project, clips: [...(project.clips || []), newClip] });

      return newClip;
    } catch (err: any) {
      console.error('Clip error:', err);
      alert(`👹 MONSTAH ERROR: ${err.message || 'Unknown clipping failure'}\n\nCheck the console (Inspect > Console) for the full breakdown.`);
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

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto" />
          <p className="mt-4 text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (showLanding) {
    return <LandingPage onStart={() => setShowLanding(false)} />;
  }

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

      {/* 🫧 Home Bubble */}
      <button
        onClick={() => setShowLanding(true)}
        title="Back to Home"
        className="fixed top-20 right-4 sm:right-6 z-50 group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 hover:border-blue-500/60 hover:bg-zinc-800 transition-all duration-300 shadow-2xl hover:shadow-blue-500/20 hover:scale-105 active:scale-95"
      >
        <span className="text-lg sm:text-xl">🏠</span>
        <span className="text-xs sm:text-sm font-bold text-gray-400 group-hover:text-white transition-colors">HOME</span>
      </button>

      {/* 👤 User Avatar + Logout */}
      <div className="fixed top-20 left-4 sm:left-6 z-50 flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 shadow-2xl">
          {user.photoURL ? (
            <img src={user.photoURL} alt="avatar" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-xs font-black text-white">
              {(user.displayName || user.email || 'U')[0].toUpperCase()}
            </div>
          )}
          <span className="text-xs font-bold text-zinc-400 hidden sm:block max-w-[120px] truncate">
            {user.displayName || user.email}
          </span>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="p-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40 transition-all shadow-2xl"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!project ? (
          <div className="flex flex-col items-center justify-center space-y-8 py-12">
            
            {/* 🌈 CYBERPUNK HEADLINE */}
            {!isProcessing && (
              <div className="text-center mb-8 px-2">
                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-4 cyber-headline">
                  <span className="text-purple-500">FEED</span>{' '}
                  <span className="text-blue-500">THE</span>{' '}
                  <span className="text-orange-500">MONSTAH</span>
                </h1>
                <p className="text-gray-400 text-base sm:text-lg">
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
                  {/* Live stage label */}
                  <p className="text-gray-400 text-xs font-mono max-w-sm mx-auto px-4 truncate" title={analysisStage}>
                    {analysisStage}
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
              /* UPLOAD AREA + VAULT */
              <div className="w-full space-y-16">
                <VideoUploader onUpload={handleFileUpload} isLoading={isProcessing} />

                {/* 🏰 THE MONSTAH VAULT: RECENT PROJECTS SECTION */}
                {recentProjects.length > 0 && (
                  <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-3 mb-8 px-4">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <History className="w-6 h-6 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-black text-white tracking-tight">RECENT VENTURES</h2>
                      <div className="h-px flex-grow bg-gradient-to-r from-zinc-800 to-transparent ml-4"></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-2">
                      {recentProjects.map((item: any) => {
                        const projectId = item.id;
                        const date = new Date(item.saveDate || Date.now()).toLocaleDateString();
                        const isEditing = editingProjectId === projectId;
                        
                        return (
                          <div 
                            key={projectId}
                            className="group relative bg-zinc-900/60 border border-zinc-800 hover:border-blue-500/40 rounded-2xl overflow-hidden transition-all hover:scale-[1.03] shadow-2xl"
                          >
                            {/* THUMBNAIL PREVIEW */}
                            <div 
                              className="aspect-video w-full bg-zinc-800 relative overflow-hidden cursor-pointer"
                              onClick={() => loadProject(item)}
                            >
                              {item.thumbnailUrl ? (
                                <img 
                                  src={item.thumbnailUrl} 
                                  crossOrigin="anonymous"
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                  alt="Preview"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                  <Camera className="w-8 h-8 text-zinc-800" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                              <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                                 <span className="text-[9px] font-black text-white bg-blue-600 px-2 py-0.5 rounded uppercase tracking-tighter">PROJECT</span>
                              </div>
                            </div>

                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-grow min-w-0">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <input 
                                        autoFocus
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        className="bg-black border border-blue-500 text-white p-1 rounded w-full text-sm font-bold"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameProject(projectId, editingTitle);
                                          if (e.key === 'Escape') setEditingProjectId(null);
                                        }}
                                      />
                                      <button onClick={() => handleRenameProject(projectId, editingTitle)} className="p-1 text-green-500"><Check className="w-4 h-4" /></button>
                                      <button onClick={() => setEditingProjectId(null)} className="p-1 text-red-500"><X className="w-4 h-4" /></button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2 group/title">
                                        <h3 className="text-sm font-black text-white truncate uppercase tracking-tight">
                                          {item.title}
                                        </h3>
                                        <button 
                                          onClick={() => { setEditingProjectId(projectId); setEditingTitle(item.title); }}
                                          className="opacity-0 group-hover/title:opacity-100 p-1 text-zinc-500 hover:text-white transition-opacity"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <p className="text-[10px] text-zinc-500 font-mono mt-1">{date} • {item.shots?.length || 0} SHOTS</p>
                                    </>
                                  )}
                                </div>
                                
                                {pendingDeleteKey === projectId ? (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(item, e); }}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[9px] font-black rounded-lg transition-all"
                                    >YES</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setPendingDeleteKey(null); }}
                                      className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-[9px] font-black rounded-lg transition-all"
                                    >NO</button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setPendingDeleteKey(projectId); }}
                                    className="p-2 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all flex-shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              
                              <button 
                                onClick={() => loadProject(item)}
                                className="w-full mt-4 py-2 bg-zinc-800 hover:bg-blue-600 text-[10px] font-black text-zinc-400 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 tracking-widest uppercase"
                              >
                                <ExternalLink className="w-3 h-3" />
                                OPEN PROJECT
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isLoadingHistory && (
                  <div className="mt-8 flex flex-col items-center gap-3 text-zinc-600 animate-pulse">
                    <div className="w-6 h-6 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-black tracking-widest uppercase">Opening Vault...</span>
                  </div>
                )}
              </div>
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
                    s3VideoUrl={project.s3Url || null}
                    originalVideoUrl={project.originalVideoUrl}
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
                  <video 
                    ref={videoRef} 
                    key={project.originalVideoUrl} 
                    src={project.originalVideoUrl} 
                    crossOrigin="anonymous"
                    controls 
                    className="w-full rounded-xl aspect-video bg-black" 
                  />
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
                      <div key={clip.id} onMouseEnter={playDuolingoHoverSound} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg transition-colors hover:bg-zinc-800 hover:border-blue-500/30 border border-transparent cursor-pointer">
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
                      <div className="text-sm font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded inline-block mb-2">Neurological Trigger</div>
                      <p className="text-gray-300 italic">"{selectedShot.trigger || selectedShot.description}"</p>
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
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-black/80 backdrop-blur-md border-t border-zinc-800 z-50">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="hidden md:block">
              <p className="text-sm text-zinc-400">
                Project: <span className="text-white font-bold">{project?.title}</span>
                {selectedShot && <span className="ml-4">Selected: <span className="text-green-400">{selectedShot?.timestamp}</span></span>}
                {generatedClips?.length > 0 && <span className="ml-4">Clips: <span className="text-purple-400">{generatedClips.length}</span></span>}
              </p>
            </div>
            <div className="flex gap-2 sm:gap-4 w-full sm:w-auto justify-center">
              <button onClick={() => { if (selectedShot) seekToTimestamp(selectedShot.timestamp); else alert("Select a shot first!"); }} className="px-3 py-2 sm:px-6 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-xs sm:text-sm font-bold transition-all">Jump to Shot</button>
              <button onClick={handleExport} className="px-3 py-2 sm:px-6 sm:py-2 bg-green-500 hover:bg-green-400 text-black rounded-full text-xs sm:text-sm font-bold transition-all">Export Details</button>
              <button onClick={handleCreateClip} disabled={isClipping || !selectedShot} className={`px-3 py-2 sm:px-6 sm:py-2 rounded-full text-xs sm:text-sm font-bold ${isClipping || !selectedShot ? 'bg-purple-800' : 'bg-purple-500 hover:bg-purple-400'} text-white`}>{isClipping ? 'Creating...' : 'Create Clip'}</button>
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