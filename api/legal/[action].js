import {
    getLegalDocumentViaMcp,
    getLegalSources,
    searchLegalDecisionsViaMcp,
} from '../../lib/legal/mcpLegalSearch.js';

export const config = {
    maxDuration: 60,
};

const normalizeAction = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+|\/+$/g, '');

async function handleSources(_req, res) {
    res.json(getLegalSources());
}

async function handleSearchDecisions(req, res) {
    const { keyword } = req.body || {};

    if (!String(keyword || '').trim()) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    const payload = await searchLegalDecisionsViaMcp(req.body || {});
    return res.json(payload);
}

async function handleGetDocument(req, res) {
    const { documentId, documentUrl } = req.body || {};

    if (!String(documentId || '').trim() && !String(documentUrl || '').trim()) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    const payload = await getLegalDocumentViaMcp(req.body || {});
    return res.json(payload);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const action = normalizeAction(req?.query?.action || req?.body?.action);

        switch (action) {
            case 'sources':
                return handleSources(req, res);
            case 'search-decisions':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method not allowed' });
                }
                return handleSearchDecisions(req, res);
            case 'get-document':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method not allowed' });
                }
                return handleGetDocument(req, res);
            default:
                if (req.method === 'GET') {
                    return handleSources(req, res);
                }
                return res.status(400).json({
                    error: 'action parametresi gerekli: sources, search-decisions, get-document',
                });
        }
    } catch (error) {
        const statusCode = Number(error?.status) || 500;
        console.error('Legal API Error:', error);
        return res.status(statusCode).json({
            error:
                process.env.NODE_ENV === 'production'
                    ? 'Bir hata olustu.'
                    : error?.message || 'Bir hata olustu.',
        });
    }
}
