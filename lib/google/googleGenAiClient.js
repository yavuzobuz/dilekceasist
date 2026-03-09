import { GoogleGenAI } from '@google/genai';

const normalizeEnv = (value = '') => String(value || '').trim();

const isTruthyEnv = (value = '') => /^(1|true|yes|on)$/i.test(normalizeEnv(value));

export const GOOGLE_GENAI_API_KEY =
    normalizeEnv(process.env.GOOGLE_API_KEY) ||
    normalizeEnv(process.env.GEMINI_API_KEY) ||
    normalizeEnv(process.env.VITE_GEMINI_API_KEY);

export const GOOGLE_CLOUD_PROJECT =
    normalizeEnv(process.env.GOOGLE_CLOUD_PROJECT) ||
    normalizeEnv(process.env.GCLOUD_PROJECT) ||
    normalizeEnv(process.env.GCP_PROJECT);

export const GOOGLE_CLOUD_LOCATION =
    normalizeEnv(process.env.GOOGLE_CLOUD_LOCATION) ||
    normalizeEnv(process.env.VERTEX_AI_LOCATION) ||
    'global';

export const GOOGLE_GENAI_API_VERSION = normalizeEnv(process.env.GOOGLE_GENAI_API_VERSION);

const hasExplicitVertexFlag =
    isTruthyEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI) ||
    isTruthyEnv(process.env.GOOGLE_GENAI_USE_VERTEX);

export const GOOGLE_GENAI_USE_VERTEX =
    hasExplicitVertexFlag || (!GOOGLE_GENAI_API_KEY && Boolean(GOOGLE_CLOUD_PROJECT));

export const isGoogleGenAiConfigured = () =>
    GOOGLE_GENAI_USE_VERTEX ? Boolean(GOOGLE_CLOUD_PROJECT) : Boolean(GOOGLE_GENAI_API_KEY);

export const getGoogleGenAiRuntimeLabel = () =>
    GOOGLE_GENAI_USE_VERTEX
        ? `vertex:${GOOGLE_CLOUD_PROJECT || 'missing-project'}/${GOOGLE_CLOUD_LOCATION}`
        : 'developer-api';

export const getGoogleGenAiConfigError = () => {
    if (GOOGLE_GENAI_USE_VERTEX && !GOOGLE_CLOUD_PROJECT) {
        return 'Google Cloud modu acik ama GOOGLE_CLOUD_PROJECT tanimli degil.';
    }

    if (!GOOGLE_GENAI_USE_VERTEX && !GOOGLE_GENAI_API_KEY) {
        return 'GOOGLE_API_KEY veya GEMINI_API_KEY tanimli degil.';
    }

    return 'Google GenAI istemcisi icin gerekli ayarlar eksik.';
};

export const getGoogleGenAIClient = () => {
    if (!isGoogleGenAiConfigured()) {
        const error = new Error(getGoogleGenAiConfigError());
        error.status = 500;
        throw error;
    }

    const options = {};

    if (GOOGLE_GENAI_USE_VERTEX) {
        options.vertexai = true;
        options.project = GOOGLE_CLOUD_PROJECT;
        options.location = GOOGLE_CLOUD_LOCATION;
    } else {
        options.apiKey = GOOGLE_GENAI_API_KEY;
    }

    if (GOOGLE_GENAI_API_VERSION) {
        options.apiVersion = GOOGLE_GENAI_API_VERSION;
    }

    return new GoogleGenAI(options);
};