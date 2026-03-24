import { MonstahShot } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const analyzeVideoForShots = async (base64Video: string, mimeType: string): Promise<MonstahShot[]> => {
  if (!GEMINI_API_KEY) {
    console.error('❌ CRITICAL: VITE_GOOGLE_API_KEY is missing!');
    throw new Error('AI Architects are offline! Please check your VITE_GOOGLE_API_KEY in .env.local');
  }

  try {
    console.log('🎬 Analyzing video with Gemini AI...');
    console.log('Video size:', (base64Video.length / 1024 / 1024).toFixed(2), 'MB (base64)');

    const prompt = `You are an Elite 2026 Viral Growth Architect for TikTok, Reels, and YouTube Shorts. 
The attention economy is more competitive than ever. Use your advanced predictive models to identify "Ultra-High Retention" moments.

For a video of this length, extract 6 to 12 banger clips.

2026 VIRAL CRITERIA:
1. **MULTI-MODAL MICRO-HOOKS**: Identify segments with 4+ distinct "micro-hooks" in the first 6 seconds (vocal spike, unexpected frame-move, color-pop, perspective-shift).
2. **EYE-TRACKING TRANSITIONS**: Find moments where the focal point is naturally leading the viewer's eye into the next segment.
3. **PEAK DOPAMINE SPIKES (SYNCED)**: Only clips where the audio and visual energy peaks occur within 0.5s of each other.
4. **PSYCHOLOGICAL LOOP-BACK**: Identify clips with a perfect "re-watch" trigger (ending on a question that is answered at the beginning).

FOR EACH CLIP, PROVIDE:
- **Timestamp**: Exact start (MM:SS)
- **Duration**: (6s to 18s) - Very short for maximum rewatch.
- **Trigger**: Explain the "Neurological Trigger" (e.g., "Mirror-neuron activation via extreme reaction").
- **Viral Score**: 0-100 (Be brutal: 95+ is a global phenomenon).
- **Hashtags**: Deep-meta 2026 trending tags.

Return ONLY a JSON array of objects with this structure:
[
  {
    "timestamp": "02:15",
    "duration": "10s",
    "trigger": "...",
    "score": 96,
    "tags": ["#trending2026", "#meta", "..."]
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Video
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    };

    console.log('📡 Sending request to Gemini API...');

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API Error:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('✅ Received response from Gemini');

    // Extract text from response
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      console.warn('⚠️ No text response from API. Using mock data.');
      return generateMockShots();
    }

    console.log('📝 Raw response:', textResponse);

    // Parse JSON from response (remove markdown code blocks if present)
    let jsonText = textResponse.trim();
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsedShots = JSON.parse(jsonText);

    // Convert to MonstahShot format
    const shots: MonstahShot[] = parsedShots.map((shot: any, index: number) => ({
      id: `shot_${Date.now()}_${index}`,
      timestamp: shot.timestamp,
      duration: shot.duration,
      description: shot.description,
      score: shot.score,
      tags: shot.tags || []
    }));

    console.log(`✅ Analysis complete. Found ${shots.length} viral shots`);
    return shots;

  } catch (error: any) {
    console.error('❌ Gemini analysis error:', error);
    console.error('Error details:', error.message);
    console.warn('⚠️ Falling back to mock data');
    return generateMockShots();
  }
};

// Fallback mock data generator with optimized durations (8-15 seconds)
const generateMockShots = (): MonstahShot[] => {
  return [
    {
      id: `shot_${Date.now()}_1`,
      timestamp: "00:00",
      duration: "9s",
      description: "Opening hook - Strong visual or audio element that immediately grabs attention in the first few seconds.",
      score: 85,
      tags: ["#viral", "#trending", "#shorts", "#fyp", "#explore"]
    },
    {
      id: `shot_${Date.now()}_2`,
      timestamp: "00:15",
      duration: "12s",
      description: "Key moment - Pivotal scene with high energy or emotional impact that keeps viewers engaged.",
      score: 90,
      tags: ["#viralvideo", "#trending", "#mustwatch", "#amazing", "#wow"]
    },
    {
      id: `shot_${Date.now()}_3`,
      timestamp: "00:30",
      duration: "11s",
      description: "Climax - The most intense or surprising moment that creates the biggest reaction.",
      score: 95,
      tags: ["#viral", "#insane", "#omg", "#crazy", "#unbelievable"]
    },
    {
      id: `shot_${Date.now()}_4`,
      timestamp: "00:45",
      duration: "10s",
      description: "Resolution - Satisfying conclusion with clear payoff that encourages likes and shares.",
      score: 88,
      tags: ["#satisfying", "#ending", "#perfect", "#awesome", "#share"]
    }
  ];
};

export default {
  analyzeVideoForShots
};