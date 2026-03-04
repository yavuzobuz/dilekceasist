import analyzeHandler from '../../backend/gemini/analyze.js';
import chatHandler from '../../backend/gemini/chat.js';
import generatePetitionHandler from '../../backend/gemini/generate-petition.js';
import keywordsHandler from '../../backend/gemini/keywords.js';
import reviewHandler from '../../backend/gemini/review.js';
import rewriteHandler from '../../backend/gemini/rewrite.js';
import webSearchHandler from '../../backend/gemini/web-search.js';

export const config = {
    api: {
        bodyParser: {
            // Vercel body limiti oncesinde kontrollu parse limiti
            sizeLimit: process.env.UPLOAD_JSON_BODY_LIMIT || '4mb',
        },
    },
};

const ACTION_HANDLERS = {
    analyze: analyzeHandler,
    chat: chatHandler,
    'generate-petition': generatePetitionHandler,
    keywords: keywordsHandler,
    review: reviewHandler,
    rewrite: rewriteHandler,
    'web-search': webSearchHandler,
};

const normalizeAction = (value) => {
    if (Array.isArray(value)) return String(value[0] || '').trim().toLowerCase();
    return String(value || '').trim().toLowerCase();
};

export default async function handler(req, res) {
    const action = normalizeAction(req?.query?.action);
    const selectedHandler = ACTION_HANDLERS[action];

    if (!selectedHandler) {
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
            return res.status(200).end();
        }
        return res.status(404).json({ error: 'Gemini endpoint not found' });
    }

    return selectedHandler(req, res);
}
