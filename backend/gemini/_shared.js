import { GoogleGenAI } from '@google/genai';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';

export const getGeminiClient = () => {
    if (!GEMINI_API_KEY) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.status = 500;
        throw error;
    }

    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};
