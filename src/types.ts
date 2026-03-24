// types.ts - COMPLETE VERSION
export interface MonstahShot {
  id: string;
  timestamp: string;
  duration: string;
  description: string;
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
    description: string;
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
  status: 'idle' | 'analyzing' | 'ready' | 'generating' | 'complete';
  shots: MonstahShot[];
  clips?: VideoClip[];
}