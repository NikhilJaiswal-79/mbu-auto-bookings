import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("Missing NEXT_PUBLIC_GEMINI_API_KEY in .env.local");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");

// DEBUG: Verify Key Loading
console.log("Gemini API Key Loaded:", API_KEY ? `Starts with ${API_KEY.substring(0, 4)}...` : "NOT LOADED");

// Use the standard model alias.
// List of models to try in order of preference
const MODEL_CANDIDATES = [
  "gemini-2.5-flash"
];

// Helper to get a working model (conceptually, we just pick the first one for now, 
// as true dynamic checking requires async init which is hard in module scope.
// We will default to the most stable one 'gemini-1.5-flash' but handle errors gracefully).
const getModel = (modelName: string) => genAI.getGenerativeModel({ model: modelName });

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

export const generateQuizQuestion = async (
  language: string,
  context: string,
  difficulty: string
): Promise<QuizQuestion> => {
  if (!API_KEY) {
    return {
      question: "Gemini API Key Missing.",
      options: ["Error", "Error", "Error", "Error"],
      correctIndex: 0,
      explanation: "Please check .env.local"
    };
  }

  const prompt = `Generate a single multiple-choice question (MCQ) about ${language} programming, specifically focusing on ${context}, at a ${difficulty} difficulty level.
  Return strictly valid JSON: { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }. No markdown.`;

  // Try models sequentially
  for (const modelName of MODEL_CANDIDATES) {
    try {
      console.log(`Attempting quiz generation with model: ${modelName}`);
      const model = getModel(modelName);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text) as QuizQuestion;
    } catch (error: any) {
      console.warn(`Model ${modelName} failed:`, error.message);
      // If it's the last model, throw or return error
      if (modelName === MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1]) {
        console.error("All models failed.");
        return {
          question: "AI Service Unavailable (Check API Key/Region)",
          options: ["Retry", "Retry", "Retry", "Retry"],
          correctIndex: 0,
          explanation: `Error: ${error.message}`
        };
      }
      // Otherwise continue to next model
    }
  }

  return {
    question: "Unknown Error",
    options: ["Error", "Error", "Error", "Error"],
    correctIndex: 0,
    explanation: "An unknown error occurred."
  };
};

// Vision: Extract Timetable
export const extractTimetable = async (file: File) => {
  if (!API_KEY) throw new Error("Key Missing");

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

  // Try models sequentially
  for (const modelName of MODEL_CANDIDATES) {
    try {
      console.log(`Attempting vision extraction with model: ${modelName}`);
      const model = getModel(modelName);
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;

      // Check for empty response or safety blocks
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("No candidates returned from Gemini");
      }

      const text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      if (!text) throw new Error("Empty response text (possible safety block)");

      try {
        return JSON.parse(text);
      } catch (jsonError) {
        console.error("JSON Parse Error:", jsonError, "Raw Text:", text);
        throw new Error("Failed to parse Gemini response as JSON");
      }
    } catch (error: any) {
      console.warn(`Vision Model ${modelName} failed:`, error.message);
      if (modelName === MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1]) throw error;
    }
  }
};

// Vision: Extract Holidays
export const extractHolidays = async (file: File) => {
  if (!API_KEY) throw new Error("Key Missing");

  const imagePart = await fileToGenerativePart(file);
  const prompt = `Extract holiday dates from this calendar image.
    Return JSON array: [{ "date": "YYYY-MM-DD", "name": "Holiday Name" }]. 
    No markdown.`;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = getModel(modelName);
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(text);
    } catch (error: any) {
      console.warn(`Vision Model ${modelName} failed:`, error.message);
      if (modelName === MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1]) throw error;
    }
  }
};
