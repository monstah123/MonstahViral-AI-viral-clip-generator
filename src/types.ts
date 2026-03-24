// types.ts - COMPLETE 2026 VERSION
export interface MonstahShot {
  id: string;
  timestamp: string;
  duration: string;
  trigger?: string;      // 3.0 AI Field
  description?: string; // Legacy/Fallback
  score: number;
  tags: string[];
}

export interface VideoClip {
  id: string;
  originalShotId: string;
  timestamp: string;
  duration: string;
  s3Url: string;
  metadata?: {
    shotId: string;
    timestamp: string;
    startTime: number;
    duration: number;
    description?: string;
    trigger?: string;
    score: number;
    tags: string[];
    originalVideo: string;
    createdAt: string;
    projectId: string;
    originalVideoUrl: string;
    viralScore: number;
    suggestedHashtags: string[];
  };
  createdAt: string;
}

export interface VideoProject {
  id: string;
  title: string;
  originalVideoUrl: string;
  s3Url?: string;
  thumbnailUrl?: string; // New Thumb Field
  status: 'idle' | 'analyzing' | 'ready' | 'generating' | 'complete';
  shots: MonstahShot[];
  clips?: VideoClip[];
}