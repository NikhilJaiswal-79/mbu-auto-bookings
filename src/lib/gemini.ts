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
  "gemini-2.5-flash",
  "gemini-1.5-flash"
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
// Wraps any Gemini call with Key Rotation logic AND Model Fallback
async function withKeyRotation<T>(
  operationName: string,
  operation: (model: any) => Promise<T>
): Promise<T> {
  let lastError: any = null;

  // Try each model
  for (const modelName of MODEL_CANDIDATES) {
    // Try each key logic (simplified: just try current key, if quota -> rotate)
    // We'll combine loops: External loop for Models, Internal logic for Keys/Retries.
    // Actually, let's just retry a few times.

    const maxAttempts = Math.max(1, API_KEYS.length) * 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const model = getModel(modelName);
        console.log(`🤖 Attempting ${operationName} with model: ${modelName} (Key #${currentKeyIndex + 1})`);
        return await operation(model);
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ Error with ${modelName} on Key #${currentKeyIndex + 1}:`, error.message);

        const isQuotaError = error.message?.includes("429") || error.message?.includes("Quota") || error.status === 429;
        const isOverloaded = error.message?.includes("503") || error.message?.includes("overloaded") || error.status === 503;

        if (isQuotaError) {
          console.warn(`⚠️ Quota hit. Rotating key...`);
          if (!rotateKey()) throw error; // No more keys
          continue; // Retry with new key
        }

        if (isOverloaded) {
          console.warn(`⚠️ Model ${modelName} overloaded. Falling back...`);
          break; // Break internal loop to try next model
        }

        // If other error, maybe break and try next model?
        // For now, assume 503 is the main reason to switch models. 
        // If it's another error (e.g. 400), it might be request invalid, so don't retry blindly?
        // But for safety, let's fallback on any 5xx.
        if (error.status >= 500) {
          break; // Try next model
        }

        throw error; // Throw text/parse errors directly
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

// Voice Command Parsing
export const parseVoiceCommand = async (transcript: string, savedAddresses: any[]) => {
  if (API_KEYS.length === 0) throw new Error("Key Missing");

  const now = new Date();
  const currentTime = now.toLocaleTimeString();

  // Prepare context about saved addresses
  // Prepare context about saved addresses
  const addressContext = savedAddresses.map(a =>
    `- "${a.name || a.type}": ${a.address} (${a.landmark || ""})`
  ).join("\n");

  const prompt = `
    Act as a Booking Assistant for an Auto Rickshaw app.
    Current Date/Time: ${now.toDateString()} ${currentTime}
    
    User Audio Transcript: "${transcript}"
    
    User's Saved Addresses:
    ${addressContext}
    
    Task: Extract booking details.
    1. Identify EXACT 'pickup' and 'drop' addresses. 
       - If user says "Home", "College", "Work", match with Saved Addresses labels.
       - Use the FULL address from Saved Addresses if a match is found (e.g. "My Home" -> "123 Street...").
       - If no match, use the raw text.
       - If user implies "Current Location" or "Here", set pickup to "CURRENT_LOCATION".
    2. Identify 'rideType': "instant" (default) or "scheduled" (if a future time is mentioned).
    3. If "scheduled", extract 'scheduledTime' (HH:MM AM/PM format).
    4. Identify 'paymentMode': 
       - **CRITICAL**: If transcript contains "credit", "credits", "wallet", "balance", return "credits".
       - If transcript contains "sub", "subscription", "pass", return "subscription".
       - If transcript contains "cash", "money", "pay later", return "cash".
       - Otherwise, return null (let app default apply).
    
    Return STRICT JSON:
    {
        "pickup": "...",
        "drop": "...",
        "rideType": "instant" | "scheduled",
        "scheduledTime": "..." | null,
        "paymentMode": "cash" | "credits" | "subscription" | null,
        "isAmbiguous": boolean
    }
    No markdown.
    `;

  try {
    return await withKeyRotation("Voice Parsing", async (model) => {
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text);
    });
  } catch (error: any) {
    console.error("Voice Parsing Failed:", error);
    throw error;
  }
};
