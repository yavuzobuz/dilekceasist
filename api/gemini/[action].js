import analyzeHandler from '../../backend/gemini/analyze.js';
import chatHandler from '../../backend/gemini/chat.js';
import generatePetitionHandler from '../../backend/gemini/generate-petition.js';
import keywordsHandler from '../../backend/gemini/keywords.js';
import legalSearchPlanHandler from '../../backend/gemini/legal-search-plan.js';
import reviewHandler from '../../backend/gemini/review.js';
import rewriteHandler from '../../backend/gemini/rewrite.js';
import webSearchHandler from '../../backend/gemini/web-search.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '15mb',
        },
    },
    maxDuration: 60,
};

const ACTION_HANDLERS = {
    analyze: analyzeHandler,
    chat: chatHandler,
    'generate-petition': generatePetitionHandler,
    keywords: keywordsHandler,
    'legal-search-plan': legalSearchPlanHandler,
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

    try {
        return await selectedHandler(req, res);
    } catch (error) {
        console.error(`Gemini API action error (${action}):`, error);
        if (action === 'web-search') {
            return res.status(200).json({
                text: 'Web aramasi su anda kullanilamiyor. Soru genel hukuki cercevede yanitlanmalidir.',
                groundingMetadata: null,
                degraded: true,
                warning: error?.message || 'Web search invocation failed',
            });
        }

        return res.status(500).json({
            error: process.env.NODE_ENV === 'production'
                ? 'Gemini API error'
                : (error?.message || 'Gemini API error'),
        });
    }
}
