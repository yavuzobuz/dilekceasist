// Centralized configuration for the application
// Change values here to update them across all files

export const AI_CONFIG = {
    // Gemini Model Configuration
    MODEL_NAME: 'gemini-3-pro-preview',

    // Alternative models (for easy switching)
    // MODEL_NAME: 'gemini-1.5-pro',
    // MODEL_NAME: 'gemini-1.5-flash',

    // API Settings
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY_MS: 1000,
};

export const SERVER_CONFIG = {
    PORT: 3001,
    JSON_LIMIT: '50mb',
};

export const CORS_CONFIG = {
    ALLOWED_ORIGINS: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ],
};
