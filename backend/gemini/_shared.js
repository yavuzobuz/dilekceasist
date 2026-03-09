import {
    GOOGLE_GENAI_API_KEY,
    getGoogleGenAIClient,
} from '../../lib/google/googleGenAiClient.js';

export const GEMINI_API_KEY = GOOGLE_GENAI_API_KEY;
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';
export const GEMINI_LEGAL_SUMMARIZER_MODEL_NAME =
    process.env.GEMINI_LEGAL_SUMMARIZER_MODEL_NAME ||
    process.env.VITE_GEMINI_LEGAL_SUMMARIZER_MODEL_NAME ||
    'gemini-2.5-flash';
export const GEMINI_FLASH_PREVIEW_MODEL_NAME =
    process.env.GEMINI_FLASH_PREVIEW_MODEL_NAME ||
    process.env.VITE_GEMINI_FLASH_PREVIEW_MODEL_NAME ||
    'gemini-3-flash-preview';

export const getGeminiClient = () => getGoogleGenAIClient();