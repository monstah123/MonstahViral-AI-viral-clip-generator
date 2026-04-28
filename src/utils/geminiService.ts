import { GoogleGenerativeAI } from '@google/genai';
import { MonstahShot } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Helper to convert MM:SS to seconds for duration calculation
 */
const timestampToSeconds = (ts: string): number => {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

/**
 * Upload a file to Gemini using the CHUNKED resumable upload protocol.
 */
async function uploadToGeminiChunked(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ uri: string; name: string }> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;

  const initRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': file.type || 'video/mp4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Gemini session init failed: ${initRes.status} ${errText}`);
  }

  const sessionUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!sessionUrl) throw new Error('Gemini did not return a resumable upload URL');

  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    const isLast = end === file.size;

    const res = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': offset.toString(),
      },
      body: chunk,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Chunk upload failed at ${offset}: ${res.status} ${errText}`);
    }

    offset = end;
    onProgress?.(Math.round((offset / file.size) * 100));

    if (isLast) {
      const finalResult = await res.json();
      return { uri: finalResult.file.uri, name: finalResult.file.name };
    }
  }

  throw new Error('Upload reached end without finalization');
}

export const analyzeVideoForShots = async (
  videoFile: File,
  onProgress?: (stage: string, pct: number) => void
): Promise<MonstahShot[]> => {
  if (!GEMINI_API_KEY) {
    throw new Error('AI Architects are offline! Please check your VITE_GOOGLE_API_KEY');
  }

  // ── Step 1: Chunked Upload ─────────────────────────────────────────────
  onProgress?.('Uploading to Gemini AI (Chunked)...', 0);
  let fileRef: { uri: string; name: string };
  try {
    fileRef = await uploadToGeminiChunked(videoFile, (pct) => {
      onProgress?.(`📡 Uploading to Gemini... ${pct}%`, Math.round(pct * 0.7));
    });
  } catch (error: any) {
    throw new Error(`Failed to upload video to Gemini: ${error.message}`);
  }

  // ── Step 2: Polling (Wait for indexing) ──────────────────────────────────
  onProgress?.('⏳ Gemini is analyzing your video...', 75);
  
  const MAX_POLL = 720; // 60 minutes
  let pollAttempts = 0;
  let isReady = false;

  while (pollAttempts < MAX_POLL) {
    pollAttempts++;
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileRef.name}?key=${GEMINI_API_KEY}`
    );
    const checkData = await checkRes.json();

    if (checkData?.state === 'ACTIVE') {
      isReady = true;
      break; 
    } else if (checkData?.state === 'FAILED') {
      throw new Error('Gemini processing failed.');
    }

    await new Promise(r => setTimeout(r, 5000));
    onProgress?.(`⏳ Gemini is processing... (${Math.round((pollAttempts * 5) / 60)} min)`, 
      Math.min(95, 75 + Math.floor((pollAttempts / MAX_POLL) * 20)));
  }

  if (!isReady) throw new Error('Gemini processing timed out.');

  // ── Step 3: AI Generation with Official SDK ─────────────────────────────
  onProgress?.('🧠 AI is identifying viral moments...', 95);

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent([
      {
        text: `Analyze this video for potential viral social media clips (TikTok, Reels, Shorts). 
               Identify 6 to 10 high-impact segments.
               Return only a JSON array of objects with:
               - startTime (format "MM:SS")
               - endTime (format "MM:SS")
               - title (catchy)
               - description (why it's viral)
               - score (80-95)
               - tags (array of 3 hashtags)
               RETURN ONLY THE RAW JSON ARRAY.`
      },
      {
        fileData: {
          mimeType: videoFile.type || 'video/mp4',
          fileUri: fileRef.uri
        }
      }
    ]);

    const text = result.response.text();
    const cleanedJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsedShots = JSON.parse(cleanedJson);

    return parsedShots.map((shot: any, index: number) => {
      const startSec = timestampToSeconds(shot.startTime);
      const endSec = timestampToSeconds(shot.endTime);
      return {
        id: `shot_${Date.now()}_${index}`,
        timestamp: shot.startTime,
        duration: `${Math.max(1, endSec - startSec)}s`,
        trigger: shot.description || shot.title,
        score: shot.score || 85,
        tags: shot.tags || ['#viral']
      };
    });
  } catch (error: any) {
    console.error('SDK Analysis failed:', error);
    throw new Error(`AI ARCHITECT ERROR: ${error.message}`);
  }
};