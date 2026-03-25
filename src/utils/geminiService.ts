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

export const analyzeVideoForShots = async (base64Video: string, mimeType: string): Promise<MonstahShot[]> => {
  if (!GEMINI_API_KEY) {
    console.error('❌ CRITICAL: VITE_GOOGLE_API_KEY is missing!');
    throw new Error('AI Architects are offline! Please check your VITE_GOOGLE_API_KEY in .env.local');
  }

  const videoSizeMB = (base64Video.length / 1024 / 1024);
  console.log('🚀 Initializing MONSTAHVIRAL ARCHITECT 3.0...');
  console.log('🎬 Analyzing video with Gemini AI...');
  console.log('📡 Key Verification (First 10):', (GEMINI_API_KEY || '').substring(0, 10), '...');
  console.log('Video size:', videoSizeMB.toFixed(2), 'MB (base64)');

  if (videoSizeMB > 18) {
    console.warn('⚠️ CRITICAL WARNING: Video payload is near or over 20MB. Standard API requests WILL fail. Try a smaller video clip (<10MB).');
  }

  let lastErrorMessage = 'No models responded successfully. This is usually due to an invalid project setup or regional restriction.';
  let lastStatus = 0;

  // Try each model on the confirmed-working v1beta endpoint
  for (const model of MODELS_TO_TRY) {
    for (const apiVersion of ['v1beta']) {
      try {
        const currentUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;
        console.log(`📡 Trying Gemini: ${model} (${apiVersion})...`);

        const response = await fetch(currentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
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
                    inlineData: {
                      mimeType: mimeType || 'video/mp4',
                      data: base64Video
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
          console.warn(`⚠️ Model ${model} (${apiVersion}) failed with status ${response.status}:`, errorMessage);
          
          lastErrorMessage = errorMessage;
          
          if (response.status === 404) continue;
          
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
          console.warn(`⚠️ No text response from ${model} (${apiVersion}).`);
          lastErrorMessage = `Model ${model} returned empty content.`;
          continue;
        }

        console.log(`✅ SUCCESS with model: ${model} (${apiVersion})! Raw response:`, text.substring(0, 300));
        const cleanedJson = text.replace(/```json\n?|\n?```/g, '').trim();
        
        let parsedShots;
        try {
          parsedShots = JSON.parse(cleanedJson);
        } catch (parseErr) {
          // Gemini truncated the JSON — try to recover complete objects from the partial response
          console.warn('⚠️ JSON truncated, attempting recovery...');
          try {
            const objectMatches = cleanedJson.match(/\{[^{}]*\}/g);
            if (objectMatches && objectMatches.length > 0) {
              parsedShots = objectMatches.map(s => JSON.parse(s)).filter(Boolean);
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

        const shots: MonstahShot[] = parsedShots.map((shot: any, index: number) => {
          const startSec = timestampToSeconds(shot.startTime);
          const endSec = timestampToSeconds(shot.endTime);
          const durationSec = Math.max(15, endSec - startSec); // Minimum 15s for viral clips

          return {
            id: `shot_${Date.now()}_${index}`,
            timestamp: shot.startTime,
            duration: `${durationSec}s`,
            trigger: shot.description || shot.title || "Viral Hook Identified",
            score: Math.min(95, Math.max(80, shot.score || 85)), // Clamp to 80-95 viral range
            tags: shot.tags || ["#viral", "#trending", "#2026"]
          };
        });

        console.log(`✅ Analysis complete. Found ${shots.length} banger clips!`);
        return shots;

      } catch (error: any) {
        lastErrorMessage = error.message;
        console.error(`❌ Process error with ${model} (${apiVersion}):`, error.message);
        
        if (error.message.toLowerCase().includes('expired') || 
            error.message.toLowerCase().includes('renounced') ||
            error.message.toLowerCase().includes('api key') ||
            error.message.toLowerCase().includes('unsupported location')) {
           throw error;
        }
      }
    }
  }

  throw new Error(`AI ARCHITECT ERROR: All models failed. Last error: ${lastErrorMessage}\n\n💡 TIP: If you see "Expired", go to aistudio.google.com and create a NEW project for a fresh key!`);
};

export default {
  analyzeVideoForShots
};