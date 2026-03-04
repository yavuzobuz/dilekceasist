import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const normalizeOrigin = (origin = '') => String(origin || '').trim().replace(/\/+$/, '').toLowerCase();

const parseOriginList = (...values) => values
    .filter(Boolean)
    .flatMap(value => String(value).split(','))
    .map(normalizeOrigin)
    .filter(Boolean);

const isLocalDevOrigin = (origin) => {
    try {
        const parsed = new URL(origin);
        const host = (parsed.hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
        return false;
    }
};

const allowedOriginSet = new Set(parseOriginList(
    process.env.APP_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
));

const applyCors = (req, res) => {
    const requestOrigin = req.headers?.origin;
    if (requestOrigin) {
        const normalized = normalizeOrigin(requestOrigin);
        const isAllowed = allowedOriginSet.has(normalized)
            || (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(requestOrigin));
        if (!isAllowed) return false;

        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return true;
};

const getBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') return null;
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
};

const requireAuthenticatedUser = async (req) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        const error = new Error('Supabase auth config missing on server');
        error.status = 500;
        throw error;
    }

    const token = getBearerToken(req.headers?.authorization);
    if (!token) {
        const error = new Error('Unauthorized: Bearer token required');
        error.status = 401;
        throw error;
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        const authError = new Error('Unauthorized: Invalid token');
        authError.status = 401;
        throw authError;
    }

    return user;
};

const getSafeErrorMessage = (error, fallback) => {
    if (process.env.NODE_ENV !== 'production') {
        return error?.message || fallback;
    }

    const status = Number(error?.status || 500);
    if (status >= 400 && status < 500) {
        return error?.message || fallback;
    }

    return fallback;
};

const maybeExtractJson = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        // ignore
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch {
            // ignore
        }
    }

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            // ignore
        }
    }

    return null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableAiError = (error) => {
    const message = [
        error?.message || '',
        error?.cause?.message || '',
        error?.stack || '',
    ].join(' ').toLowerCase();

    return [
        'fetch failed',
        'etimedout',
        'econnreset',
        'socket hang up',
        'temporary failure',
        'network error',
        '503',
        '429',
    ].some(token => message.includes(token));
};

async function generateContentWithRetry(requestPayload, options = {}) {
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 3;
    const initialDelayMs = Number.isFinite(options.initialDelayMs) ? options.initialDelayMs : 1000;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await ai.models.generateContent(requestPayload);
        } catch (error) {
            lastError = error;
            const canRetry = attempt < maxRetries && isRetryableAiError(error);
            if (!canRetry) {
                throw error;
            }

            const backoffDelay = initialDelayMs * (2 ** attempt);
            const jitter = Math.floor(Math.random() * 200);
            await sleep(backoffDelay + jitter);
        }
    }

    throw lastError || new Error('AI request failed');
}

// GET /api/legal?action=sources
async function handleSources(req, res) {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargitay', description: 'Yargitay Kararlari' },
            { id: 'danistay', name: 'Danistay', description: 'Danistay Kararlari' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararlari' },
            { id: 'kik', name: 'KIK', description: 'Kamu Ihale Kurulu Kararlari' },
        ]
    });
}

// POST /api/legal?action=search-decisions
async function handleSearchDecisions(req, res) {
    const { source, keyword } = req.body || {};

    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    let text = '';
    let rows = [];
    let warning = '';

    try {
        const response = await generateContentWithRetry({
            model: MODEL_NAME,
            contents: `Turkiye'de "${keyword}" konusunda emsal Yargitay ve Danistay kararlarini bul.

Her karar icin su alanlari uret:
- mahkeme
- daire
- esasNo
- kararNo
- tarih
- ozet (en fazla 2-3 cumle)
- sourceUrl (resmi karar arama linki varsa)
- relevanceScore (0-100)

Sadece JSON array dondur:
[{"mahkeme":"...","daire":"...","esasNo":"...","kararNo":"...","tarih":"...","ozet":"...","sourceUrl":"https://...","relevanceScore":85}]`,
            config: { tools: [{ googleSearch: {} }] }
        });

        text = response.text || '';
        const parsed = maybeExtractJson(text);
        rows = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('AI search-decisions fallback error:', error);
        warning = 'Emsal arama servislerine gecici olarak ulasilamiyor. Lutfen kisa bir sure sonra tekrar deneyin.';
        rows = [];
        text = '';
    }

    const results = rows.length > 0
        ? rows.map((r, i) => ({
            id: `search-${i}`,
            documentId: `search-${i}`,
            title: `${r.mahkeme || 'Yargitay'} ${r.daire || ''}`.trim(),
            esasNo: r.esasNo || r.esas_no || '',
            kararNo: r.kararNo || r.karar_no || '',
            tarih: r.tarih || r.date || '',
            daire: r.daire || '',
            ozet: r.ozet || r.snippet || '',
            sourceUrl: r.sourceUrl || r.url || '',
            relevanceScore: Number(r.relevanceScore) || Math.max(0, 100 - (i * 8)),
        })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        : [{
            id: 'ai-summary',
            documentId: 'ai-summary',
            title: 'AI Arama Sonucu',
            ozet: text.substring(0, 500),
        }];

    res.json({
        success: true,
        source: source || 'all',
        provider: 'ai-fallback',
        keyword,
        results,
        ...(warning ? { warning } : {}),
    });
}

async function getDocumentViaAIFallback({ keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' }) {
    const queryParts = [
        keyword,
        title,
        daire,
        esasNo ? `E. ${esasNo}` : '',
        kararNo ? `K. ${kararNo}` : '',
        tarih ? `T. ${tarih}` : '',
        ozet,
        documentId,
        documentUrl,
    ].filter(Boolean);

    const query = queryParts.join(' ').trim();
    if (!query) return '';

    const response = await generateContentWithRetry({
        model: MODEL_NAME,
        contents: `Asagidaki karar kunyesine ait karar METNINI resmi kaynaklardan bul:
${query}

Kurallar:
- Cevapta URL/link verme.
- Giris/yorum ekleme.
- Sadece karar metnini duz yazi olarak dondur.
- Tam metin bulunamazsa, bulunabilen en detayli metni dondur.`,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
        }
    });

    return (response.text || '').replace(/https?:\/\/\S+/gi, '').trim();
}

// POST /api/legal?action=get-document
async function handleGetDocument(req, res) {
    const { source, documentId, documentUrl, title, esasNo, kararNo, tarih, daire, ozet, snippet } = req.body || {};

    if (!documentId && !documentUrl) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    let content = '';
    try {
        content = await getDocumentViaAIFallback({
            keyword: [title, daire, esasNo, kararNo, tarih].filter(Boolean).join(' '),
            documentId,
            documentUrl,
            title,
            esasNo,
            kararNo,
            tarih,
            daire,
            ozet: [ozet, snippet].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('AI get-document fallback error:', error);
    }

    if (!content) {
        content = 'Karar metni getirilemedi. Lutfen farkli bir karar secip tekrar deneyin.';
    }

    res.json({
        success: true,
        source,
        provider: 'ai-fallback',
        document: {
            content,
            mimeType: 'text/plain',
            documentId: documentId || '',
            documentUrl: documentUrl || '',
        }
    });
}

export default async function handler(req, res) {
    if (!applyCors(req, res)) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const action = req.query.action || req.body?.action;
        const hasAuthorizationHeader = typeof req.headers?.authorization === 'string'
            && req.headers.authorization.trim().length > 0;

        // Auth is optional for legal search/get-document in Vercel serverless mode.
        // If an auth header is provided, validate it; otherwise continue as guest.
        if (hasAuthorizationHeader) {
            await requireAuthenticatedUser(req);
        }

        switch (action) {
            case 'sources':
                return handleSources(req, res);
            case 'search-decisions':
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                return handleSearchDecisions(req, res);
            case 'get-document':
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                return handleGetDocument(req, res);
            default:
                if (req.method === 'GET') return handleSources(req, res);
                return res.status(400).json({ error: 'action parametresi gerekli: sources, search-decisions, get-document' });
        }

    } catch (error) {
        console.error('Legal API Error:', error);
        res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Bir hata olustu.'),
        });
    }
}
