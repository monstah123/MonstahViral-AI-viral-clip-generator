import { MonstahShot } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const MODELS_TO_TRY = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash'
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
 * Upload a file to Gemini using the resumable upload protocol.
 * This gives real progress feedback and handles large files (900MB+) reliably.
 * onProgress receives a value 0–100.
 */
async function uploadToGemini(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ uri: string; name: string }> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;

  // ── Phase 1: Initiate resumable session ──────────────────────────────────
  onProgress?.(0);
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

  // ── Phase 2: Upload the file body with an AbortController timeout ─────────
  // Allow up to 15 minutes for very large files on slow connections
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);

  onProgress?.(5); // started uploading
  let uploadRes: Response;
  try {
    uploadRes = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Length': file.size.toString(),
        'Content-Type': file.type || 'video/mp4',
      },
      body: file,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error(
        'Upload to Gemini timed out after 15 min. Your internet may be too slow for this file size. Try compressing the video first.'
      );
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini upload failed: ${uploadRes.status} ${errText}`);
  }

  const result = await uploadRes.json();
  if (!result?.file?.uri || !result?.file?.name) {
    throw new Error('Gemini upload response missing file URI or name');
  }

  onProgress?.(100);
  console.log('✅ Gemini upload complete. URI:', result.file.uri);
  return { uri: result.file.uri, name: result.file.name };
}

export const analyzeVideoForShots = async (
  videoFile: File,
  onProgress?: (stage: string, pct: number) => void
): Promise<MonstahShot[]> => {
  if (!GEMINI_API_KEY) {
    console.error('❌ CRITICAL: VITE_GOOGLE_API_KEY is missing!');
    throw new Error('AI Architects are offline! Please check your VITE_GOOGLE_API_KEY in .env.local');
  }

  const videoSizeMB = videoFile.size / 1024 / 1024;
  console.log('🚀 Initializing MONSTAHVIRAL ARCHITECT 3.0...');
  console.log('Video size:', videoSizeMB.toFixed(2), 'MB');

  if (videoSizeMB > 2000) {
    throw new Error('Video is larger than 2GB, which exceeds the maximum limit supported by Gemini.');
  }

  // ── Step 1: Upload to Gemini ──────────────────────────────────────────────
  onProgress?.('Uploading to Gemini AI...', 0);
  let fileRef: { uri: string; name: string };
  try {
    fileRef = await uploadToGemini(videoFile, (pct) => {
      // Map 0-100 upload pct → 0-60 of the overall AI stage
      onProgress?.(`📡 Uploading to Gemini... ${pct}%`, Math.round(pct * 0.6));
    });
  } catch (error: any) {
    console.error('❌ Upload to Gemini failed:', error.message);
    throw new Error(`Failed to upload video to Gemini: ${error.message}`);
  }

  // ── Step 2: Poll until Gemini finishes processing the video ──────────────
  // Large files (900MB+) can take 5-10 min to process — allow up to 15 min
  const MAX_POLL = 180; // 180 × 5s = 15 min
  let isReady = false;
  let pollAttempts = 0;

  while (!isReady && pollAttempts < MAX_POLL) {
    pollAttempts++;
    const elapsed = Math.round((pollAttempts * 5) / 60);
    onProgress?.(
      `⏳ Gemini is analyzing your video... (${elapsed} min elapsed)`,
      60 + Math.min(20, Math.floor((pollAttempts / MAX_POLL) * 20))
    );
    console.log(`⏳ Polling Gemini (attempt ${pollAttempts}/${MAX_POLL})...`);

    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileRef.name}?key=${GEMINI_API_KEY}`
    );
    const checkData = await checkRes.json();

    if (checkData?.state === 'ACTIVE') {
      isReady = true;
      console.log('✅ Gemini video processing complete!');
    } else if (checkData?.state === 'FAILED') {
      throw new Error('Gemini failed to process the video. It might be unsupported or corrupted.');
    } else {
      console.log(`State: ${checkData?.state || 'UNKNOWN'} — waiting 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (!isReady) {
    throw new Error(
      'Gemini video processing timed out after 15 minutes. The video may be too long or complex. ' +
      'Try splitting it into shorter segments (under 10 min each).'
    );
  }

  // ── Step 3: Request AI shot analysis ──────────────────────────────────────
  onProgress?.('🧠 AI is identifying viral moments...', 82);

  let lastErrorMessage = 'No models responded successfully.';

  for (const model of MODELS_TO_TRY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      console.log(`📡 Trying model: ${model}...`);

      const response = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this video for potential viral social media clips (TikTok, Reels, Shorts). 
                    The attention economy is competitive. Identify 6 to 10 "Ultra-High Retention" moments.
                    
                    CRITICAL: Each clip MUST be between 15 and 60 seconds long. Short clips under 15 seconds perform poorly.
                    Choose startTime and endTime to capture the FULL arc of each viral moment (setup + payoff).
                    
                    Return only a JSON array of objects with these fields:
                    - startTime (string format "MM:SS")
                    - endTime (string format "MM:SS") — must be at least 15 seconds after startTime
                    - title (catchy viral title)
                    - description (the neurological trigger why this is viral)
                    - score (viral potential score, MUST be between 80 and 95 — only include moments with genuine high-retention potential)
                    - tags (array of 3 trending hashtags)

                    RETURN ONLY THE RAW JSON ARRAY, NO MARKDOWN TAGS.`
                },
                {
                  fileData: {
                    mimeType: videoFile.type || 'video/mp4',
                    fileUri: fileRef.uri
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.warn(`⚠️ ${model} failed (${response.status}):`, errorMessage);
        lastErrorMessage = errorMessage;

        if (errorMessage.toLowerCase().includes('expired') ||
            errorMessage.toLowerCase().includes('permission') ||
            errorMessage.toLowerCase().includes('api key')) {
          throw new Error(errorMessage);
        }
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn(`⚠️ No text response from ${model}.`);
        lastErrorMessage = `Model ${model} returned empty content.`;
        continue;
      }

      console.log(`✅ SUCCESS with ${model}! Preview:`, text.substring(0, 300));
      const cleanedJson = text.replace(/```json\n?|\n?```/g, '').trim();

      let parsedShots;
      try {
        parsedShots = JSON.parse(cleanedJson);
      } catch {
        console.warn('⚠️ JSON truncated, attempting recovery...');
        try {
          const objectMatches = cleanedJson.match(/\{[^{}]*\}/g);
          if (objectMatches && objectMatches.length > 0) {
            parsedShots = objectMatches.map((s: string) => JSON.parse(s)).filter(Boolean);
            console.log(`♻️ Recovered ${parsedShots.length} shots from truncated response`);
          } else {
            throw new Error('No recoverable shots in truncated response');
          }
        } catch {
          console.error('❌ JSON parse failed. Raw text was:', text);
          lastErrorMessage = `Gemini returned invalid JSON. Raw: ${text.substring(0, 200)}`;
          continue;
        }
      }

      if (!Array.isArray(parsedShots) || parsedShots.length === 0) {
        console.warn('⚠️ Gemini returned empty or non-array response:', parsedShots);
        lastErrorMessage = 'Gemini returned no shots. Try a different video.';
        continue;
      }

      const shots: MonstahShot[] = parsedShots
        .filter((s: any) => s && typeof s === 'object')
        .map((shot: any, index: number) => {
          const startStr = shot.startTime || '00:00';
          const endStr = shot.endTime || '00:15';
          const startSec = timestampToSeconds(startStr);
          const endSec = timestampToSeconds(endStr);
          const durationSec = Math.max(15, endSec - startSec);

          return {
            id: `shot_${Date.now()}_${index}`,
            timestamp: startStr,
            duration: `${durationSec}s`,
            trigger: shot.description || shot.title || 'Viral Hook Identified',
            score: Math.min(95, Math.max(80, shot.score || 85)),
            tags: Array.isArray(shot.tags) ? shot.tags : ['#viral', '#trending', '#2026']
          };
        });

      onProgress?.('✅ Analysis complete!', 100);
      console.log(`✅ Analysis complete. Found ${shots.length} banger clips!`);
      return shots;

    } catch (error: any) {
      lastErrorMessage = error.message;
      console.error(`❌ Error with ${model}:`, error.message);

      if (error.message.toLowerCase().includes('expired') ||
          error.message.toLowerCase().includes('api key') ||
          error.message.toLowerCase().includes('unsupported location')) {
        throw error;
      }
    }
  }

  throw new Error(
    `AI ARCHITECT ERROR: All models failed. Last error: ${lastErrorMessage}\n\n` +
    `💡 TIP: If you see "Expired", go to aistudio.google.com and create a NEW project for a fresh key!`
  );
};

export default { analyzeVideoForShots };