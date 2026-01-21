import { MonstahShot } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const analyzeVideoForShots = async (base64Video: string, mimeType: string): Promise<MonstahShot[]> => {
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ No Gemini API key found. Using mock data.');
    return generateMockShots();
  }

  try {
    console.log('🎬 Analyzing video with Gemini AI...');
    console.log('Video size:', (base64Video.length / 1024 / 1024).toFixed(2), 'MB (base64)');

    const prompt = `Analyze this video and identify 4-6 potential viral short-form clips suitable for TikTok, Instagram Reels, or YouTube Shorts.

For each viral moment, provide:
1. **Timestamp** (MM:SS format, e.g., "00:15")
2. **Duration** (8-15 seconds optimal, can go up to 20s for exceptional moments)
3. **Description** (engaging description of what makes this moment viral-worthy)
4. **Viral Score** (0-100, how likely this will go viral)
5. **Hashtags** (5-7 trending hashtags relevant to the moment)

Focus on moments that have:
- Strong hook in the first 2 seconds (action, surprise, or intrigue)
- Clear narrative arc that completes within 8-15 seconds
- High energy or emotional peaks
- Satisfying or relatable payoff
- Rewatchability factor

DURATION GUIDELINES:
- 8-10s: Quick reactions, satisfying loops, rapid reveals
- 11-15s: Mini-stories, before/after, skill demonstrations  
- 16-20s: Complex narratives (use sparingly, only if truly engaging)

Return your response as a JSON array of objects with this exact structure:
[
  {
    "timestamp": "00:15",
    "duration": "12s",
    "description": "...",
    "score": 92,
    "tags": ["#tag1", "#tag2", "#tag3"]
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