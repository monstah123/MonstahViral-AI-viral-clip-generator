import { MonstahShot } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const MODELS_TO_TRY = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp'
];

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
 * This is the "Gold Standard" for large files (900MB+).
 * It sends the file in 8MB pieces, which is much more stable than sending it all at once.
 */
async function uploadToGeminiChunked(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ uri: string; name: string }> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;

  // ── Step 1: Start the session ──────────────────────────────────────────
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

  // ── Step 2: Upload in 8MB chunks ────────────────────────────────────────
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    const isLast = end === file.size;

    console.log(`📡 Uploading chunk: ${offset} - ${end} of ${file.size}`);

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
    const pct = Math.round((offset / file.size) * 100);
    onProgress?.(pct);

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

  const videoSizeMB = videoFile.size / 1024 / 1024;
  console.log(`🚀 Analyzing ${videoSizeMB.toFixed(2)}MB video...`);

  // ── Step 1: Chunked Upload ─────────────────────────────────────────────
  onProgress?.('Uploading to Gemini AI (Chunked)...', 0);
  let fileRef: { uri: string; name: string };
  try {
    fileRef = await uploadToGeminiChunked(videoFile, (pct) => {
      onProgress?.(`📡 Uploading to Gemini... ${pct}%`, Math.round(pct * 0.7));
    });
  } catch (error: any) {
    console.error('❌ Chunked upload failed:', error.message);
    throw new Error(`Failed to upload video to Gemini: ${error.message}`);
  }

  // ── Step 2: Polling (Wait for indexing) ──────────────────────────────────
  onProgress?.('⏳ Gemini is analyzing your video...', 75);
  
  const MAX_POLL = 720; // 60 minutes
  let pollAttempts = 0;

  while (pollAttempts < MAX_POLL) {
    pollAttempts++;
    const elapsed = Math.round((pollAttempts * 5) / 60);
    
    // Heartbeat log so we know it's not frozen
    console.log(`[Gemini Poll] Attempt ${pollAttempts} (${elapsed} min elapsed)`);

    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileRef.name}?key=${GEMINI_API_KEY}`
    );
    const checkData = await checkRes.json();

    if (checkData?.state === 'ACTIVE') {
      console.log('✅ Gemini processing complete!');
      break; 
    } else if (checkData?.state === 'FAILED') {
      throw new Error(`Gemini processing failed: ${JSON.stringify(checkData.error)}`);
    }

    await new Promise(r => setTimeout(r, 5000));
    // Keep progress bar moving slightly so user knows it's alive
    const pollPct = Math.min(95, 75 + Math.floor((pollAttempts / MAX_POLL) * 20));
    onProgress?.(`⏳ Gemini is processing... (${elapsed} min)`, pollPct);
  }

  if (pollAttempts >= MAX_POLL) {
    throw new Error('Gemini processing timed out after 60 minutes.');
  }

  // ── Step 3: Prompting ────────────────────────────────────────────────────
  onProgress?.('🧠 AI is identifying viral moments...', 95);

  let lastError = '';
  for (const model of MODELS_TO_TRY) {
    try {
      console.log(`📡 Prompting model: ${model}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Analyze this video for 6 to 10 viral clips (15-60s). Return JSON array of objects with startTime (MM:SS), endTime (MM:SS), title, description, score (80-95), and tags." },
              { fileData: { mimeType: videoFile.type || 'video/mp4', fileUri: fileRef.uri } }
            ]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      });

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const cleanedJson = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsedShots = JSON.parse(cleanedJson);

      return parsedShots.map((shot: any, index: number) => {
        const startSec = timestampToSeconds(shot.startTime);
        const endSec = timestampToSeconds(shot.endTime);
        return {
          id: `shot_${Date.now()}_${index}`,
          timestamp: shot.startTime,
          duration: `${endSec - startSec}s`,
          trigger: shot.description || shot.title,
          score: shot.score || 85,
          tags: shot.tags || ['#viral']
        };
      });
    } catch (e: any) {
      lastError = e.message;
    }
  }

  throw new Error(`AI analysis failed after trying all models. Last error: ${lastError}`);
};