import { GoogleGenerativeAI } from '@google/generative-ai';
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
  focusMode: string,
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
    // Upgraded to Gemini 3 Flash (2026 standard) to fix 404 and ensure high-fidelity analysis
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
    
    let focusInstruction = "Identify 6 to 10 high-impact segments that possess maximum retention potential.";
    if (focusMode === 'Educational & Tutorial') {
      focusInstruction = "Focus heavily on moments where a specific concept is explained clearly, a problem is solved, or a high-value tip is shared. Look for educational 'aha' moments.";
    } else if (focusMode === 'Funny & Comedy') {
      focusInstruction = "Hunt specifically for punchlines, awkward silences, unexpected reactions, bloopers, or highly comedic timing. Prioritize humor over raw retention.";
    } else if (focusMode === 'Action & Highlights') {
      focusInstruction = "Look for high-energy movement, fast-paced talking, intense moments, big reveals, or physical action. Ignore slow build-ups.";
    } else if (focusMode === 'Drama & Storytelling') {
      focusInstruction = "Seek out emotional peaks, deep vulnerability, controversial statements, or dramatic narrative shifts. Look for the hook of a great story.";
    }

    const prompt = `You are a world-class Viral Architect and Social Media Strategist. 
Analyze this video for potential viral social media clips (TikTok, Reels, Shorts). 
${focusInstruction}

For each segment, provide:
- Catchy, high-CTR title (max 60 characters)
- Detailed "Neurological Trigger" analysis: explain EXACTLY what happens (audio/visual) that makes this moment viral. Use punchy, engaging language.
- Accurate startTime and endTime (format MM:SS)
- Virality Score (80-99)
- 5 trending, high-volume hashtags

Return ONLY a JSON array of objects with these keys:
startTime, endTime, title, description, score, tags.

DO NOT include any conversational text or markdown code blocks. RETURN ONLY THE RAW JSON ARRAY.`;

    const result = await model.generateContent([
      { text: prompt },
      {
        fileData: {
          mimeType: videoFile.type || 'video/mp4',
          fileUri: fileRef.uri
        }
      }
    ]);

    const text = result.response.text();
    
    // Robust JSON extraction to handle model inconsistencies and truncated outputs
    const extractJSON = (rawText: string) => {
      try {
        let textToParse = rawText.trim();
        // Remove markdown formatting if it still sneaks in
        textToParse = textToParse.replace(/```json\n?|\n?```/g, '').trim();
        
        // Auto-fix truncated arrays (if model runs out of tokens)
        if (textToParse.startsWith('[') && !textToParse.endsWith(']')) {
          const lastBrace = textToParse.lastIndexOf('}');
          if (lastBrace !== -1) {
            textToParse = textToParse.substring(0, lastBrace + 1) + ']';
          } else {
            textToParse = '[]'; // Full failure
          }
        }
        
        return JSON.parse(textToParse);
      } catch (e: any) {
        throw new Error(`JSON Parse error: ${e.message}. The AI response was malformed.`);
      }
    };

    const parsedShots = extractJSON(text);

    return parsedShots.map((shot: any, index: number) => {
      const startSec = timestampToSeconds(shot.startTime);
      const endSec = timestampToSeconds(shot.endTime);
      return {
        id: `shot_${Date.now()}_${index}`,
        timestamp: shot.startTime,
        duration: `${Math.max(1, endSec - startSec)}s`,
        trigger: shot.description || shot.title,
        score: shot.score || 85,
        tags: shot.tags || ['#viral', '#trending', '#monstah']
      };
    });
  } catch (error: any) {
    console.error('SDK Analysis failed:', error);
    // Specifically handle the 404 or other API errors
    if (error.message?.includes('404')) {
      throw new Error('AI ARCHITECT ERROR: Model endpoint mismatch. Please contact support to sync AI versions.');
    }
    throw new Error(`AI ARCHITECT ERROR: [GoogleGenerativeAI Error]: ${error.message}`);
  }
};