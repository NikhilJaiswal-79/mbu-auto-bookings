import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Gather all available keys
const RAW_KEYS = [
  process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_2,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_3,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_4,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_5
].filter(Boolean) as string[];

// Deduplicate keys just in case
const API_KEYS = [...new Set(RAW_KEYS)];

if (API_KEYS.length === 0) {
  console.warn("Missing NEXT_PUBLIC_GEMINI_API_KEY in .env.local");
} else {
  console.log(`Loaded ${API_KEYS.length} Gemini API Keys for rotation.`);
}

// Track current key index (simple round-robin or failover)
let currentKeyIndex = 0;

// Use the standard model alias.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash"
];

// Helper to get a model instance with the CURRENT key
const getModel = (modelName: string) => {
  if (API_KEYS.length === 0) throw new Error("No API Keys available");
  const key = API_KEYS[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: modelName });
};

// Helper to rotate key
const rotateKey = () => {
  if (API_KEYS.length <= 1) return false; // No other keys to switch to
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`♻️ Switching to API Key #${currentKeyIndex + 1} (Ends with ...${API_KEYS[currentKeyIndex].slice(-4)})`);
  return true;
};

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// GENERIC RETRY WRAPPER
// Wraps any Gemini call with Key Rotation logic
async function withKeyRotation<T>(
  operationName: string,
  operation: (model: any) => Promise<T>
): Promise<T> {
  let lastError: any = null;

  // Try each key at least once (or more loops if needed, but let's prevent infinite loops)
  // We'll allow up to API_KEYS.length + 1 attempts to ensure we try the next ones.
  const maxAttempts = Math.max(1, API_KEYS.length) * 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const modelName = MODEL_CANDIDATES[0]; // Strict 2.5 flash

    try {
      const model = getModel(modelName);
      return await operation(model);
    } catch (error: any) {
      lastError = error;

      const isQuotaError = error.message?.includes("429") || error.message?.includes("Quota") || error.status === 429;

      if (isQuotaError) {
        console.warn(`⚠️ Quota hit on Key #${currentKeyIndex + 1} (${API_KEYS[currentKeyIndex]?.slice(-4)}). Attempting rotation...`);
        const switched = rotateKey();
        if (!switched) {
          console.error("❌ No other keys available to rotate.");
          throw error; // Propagate if we can't switch
        }
        // Wait a second before trying the new key to be safe
        await new Promise(resolve => setTimeout(resolve, 1000));
        // If switched, loop continues and tries new key
      } else {
        // If it's NOT a quota error (e.g. 404 Model Not Found, or 500), 
        // strictly speaking we might not want to rotate, but for robustness let's try ONE rotation just in case key is bad.
        // But if user requested STRICT rotation only on exhaustion, we focus on 429.
        // For now, let's throw on non-quota errors to fail fast (like Model Not Found).
        console.error(`❌ Non-Quota Error on Key #${currentKeyIndex + 1}: ${error.message}`);
        throw error;
      }
    }
  }

  throw lastError;
}

export const generateQuizQuestion = async (
  language: string,
  context: string,
  difficulty: string
): Promise<QuizQuestion> => {
  if (API_KEYS.length === 0) {
    return {
      question: "Gemini API Key Missing.",
      options: ["Error", "Error", "Error", "Error"],
      correctIndex: 0,
      explanation: "Please check .env.local"
    };
  }

  const prompt = `Generate a single multiple-choice question (MCQ) about ${language} programming, specifically focusing on ${context}, at a ${difficulty} difficulty level.
  Return strictly valid JSON: { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }. No markdown.`;

  try {
    return await withKeyRotation("Quiz Generation", async (model) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text) as QuizQuestion;
    });
  } catch (error: any) {
    console.error("All Retry Attempts Failed:", error);
    return {
      question: "AI Error: " + error.message,
      options: ["Retry", "Retry", "Retry", "Retry"],
      correctIndex: 0,
      explanation: `Debug Info: All ${API_KEYS.length} keys failed. Last Code: ${error.status || 'Unknown'}`
    };
  }
};

// Vision: Extract Timetable
export const extractTimetable = async (file: File) => {
  if (API_KEYS.length === 0) throw new Error("Key Missing");

  const imagePart = await fileToGenerativePart(file);
  const prompt = `Analyze this college timetable image. For each day of the week, determine the "College Start Time" (the time of the very first class) and the "College End Time" (the time the last class ends).
    
  Return strictly valid JSON in this specific format: 
  { 
      "Monday": { "start": "09:00 AM", "end": "04:15 PM" }, 
      "Tuesday": { "start": "09:00 AM", "end": "01:00 PM" },
      ...
  }
  
  Rules:
  1. Ignore lunch breaks or short breaks.
  2. If a day has NO classes (e.g. Sunday), omit it.
  3. No Markdown code blocks.`;

  try {
    return await withKeyRotation("Timetable Extraction", async (model) => {
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text);
    });
  } catch (error: any) {
    console.error("Timetable Extraction Failed:", error);
    throw error;
  }
};

// Vision: Extract Holidays
export const extractHolidays = async (file: File) => {
  if (API_KEYS.length === 0) throw new Error("Key Missing");

  const imagePart = await fileToGenerativePart(file);
  const prompt = `Extract holiday dates from this calendar image.
    Return JSON array: [{ "date": "YYYY-MM-DD", "name": "Holiday Name" }]. 
    No markdown.`;

  try {
    return await withKeyRotation("Holiday Extraction", async (model) => {
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text);
    });
  } catch (error: any) {
    console.error("Holiday Extraction Failed:", error);
    throw error;
  }
};
