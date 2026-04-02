import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const firstNonEmptyEnv = (...values) =>
    values
        .map((value) => String(value || '').trim())
        .find(Boolean) || '';

export const GEMINI_API_KEY = firstNonEmptyEnv(
    process.env.GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY
);
export const GEMINI_LEGAL_QUERY_EXPANSION_API_KEY = firstNonEmptyEnv(
    process.env.GEMINI_LEGAL_QUERY_EXPANSION_API_KEY,
    process.env.VITE_GEMINI_LEGAL_QUERY_EXPANSION_API_KEY,
    GEMINI_API_KEY
);
export const GEMINI_EMBEDDING_API_KEY = firstNonEmptyEnv(
    process.env.GEMINI_EMBEDDING_API_KEY,
    process.env.VITE_GEMINI_EMBEDDING_API_KEY,
    GEMINI_API_KEY
);
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-3-flash-preview';
export const GEMINI_PETITION_MODEL_NAME =
    process.env.GEMINI_PETITION_MODEL_NAME ||
    process.env.VITE_GEMINI_PETITION_MODEL_NAME ||
    'gemini-3-pro-preview';
export const GEMINI_STABLE_FALLBACK_MODEL_NAME =
    process.env.GEMINI_STABLE_FALLBACK_MODEL_NAME ||
    process.env.VITE_GEMINI_STABLE_FALLBACK_MODEL_NAME ||
    'gemini-2.5-flash';
export const GEMINI_LEGAL_SUMMARIZER_MODEL_NAME =
    process.env.GEMINI_LEGAL_SUMMARIZER_MODEL_NAME ||
    process.env.VITE_GEMINI_LEGAL_SUMMARIZER_MODEL_NAME ||
    'gemini-3-flash-preview';
export const GEMINI_FLASH_PREVIEW_MODEL_NAME =
    process.env.GEMINI_FLASH_PREVIEW_MODEL_NAME ||
    process.env.VITE_GEMINI_FLASH_PREVIEW_MODEL_NAME ||
    'gemini-3-flash-preview';

export const getGeminiClient = ({ apiKey = GEMINI_API_KEY } = {}) => {
    const resolvedApiKey = firstNonEmptyEnv(apiKey);

    if (!resolvedApiKey) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.status = 500;
        throw error;
    }

    return new GoogleGenAI({ apiKey: resolvedApiKey });
};
