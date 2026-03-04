import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = process.env.LEGAL_GEMINI_MODEL_NAME
    || process.env.GEMINI_MODEL_NAME
    || process.env.VITE_GEMINI_MODEL_NAME
    || 'gemini-2.5-flash';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const YARGITAY_BASE_URL = 'https://karararama.yargitay.gov.tr';
const YARGITAY_DEFAULT_PAGE_SIZE = 10;

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

const decodeHtmlEntities = (value = '') => {
    const namedEntities = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: '\'',
        nbsp: ' ',
        rsquo: '\'',
        lsquo: '\'',
        rdquo: '"',
        ldquo: '"',
    };

    return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, token) => {
        const raw = String(token || '');
        if (!raw) return full;

        if (raw[0] === '#') {
            const isHex = raw[1]?.toLowerCase() === 'x';
            const numeric = Number.parseInt(raw.slice(isHex ? 2 : 1), isHex ? 16 : 10);
            if (Number.isFinite(numeric)) {
                try {
                    return String.fromCodePoint(numeric);
                } catch {
                    return full;
                }
            }
            return full;
        }

        const named = namedEntities[raw.toLowerCase()];
        return named !== undefined ? named : full;
    });
};

const fixPossibleMojibake = (value = '') => {
    const text = String(value || '');
    if (!/[ÃÅÄÐ]/.test(text)) return text;
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch {
        return text;
    }
};

const normalizeYargitayText = (value = '') => fixPossibleMojibake(decodeHtmlEntities(String(value || ''))).trim();

const stripHtmlToText = (html = '') => {
    const normalizedHtml = String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/li>/gi, '')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, ' ');

    const withoutTags = normalizedHtml.replace(/<[^>]+>/g, ' ');
    return normalizeYargitayText(withoutTags)
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
};

const fetchWithTimeout = async (url, init = {}, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const parseDecisionMetaFromText = (text = '') => {
    const safe = normalizeYargitayText(text);
    const matchEsas = safe.match(/(?:E\.?|Esas)\s*[:.]?\s*([0-9]{4}\/[0-9]+)/i);
    const matchKarar = safe.match(/(?:K\.?|Karar)\s*[:.]?\s*([0-9]{4}\/[0-9]+)/i);
    const matchTarih = safe.match(/(?:T\.?|Tarih(?:i)?)\s*[:.]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i);

    return {
        esasNo: matchEsas?.[1] || '',
        kararNo: matchKarar?.[1] || '',
        tarih: matchTarih?.[1] || '',
    };
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
        'timeout',
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
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 18000;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            const response = await Promise.race([
                ai.models.generateContent(requestPayload),
                new Promise((_, reject) => {
                    setTimeout(() => {
                        const timeoutError = new Error(`AI request timeout after ${requestTimeoutMs}ms`);
                        timeoutError.code = 'AI_TIMEOUT';
                        reject(timeoutError);
                    }, requestTimeoutMs);
                }),
            ]);
            return response;
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

async function searchYargitayOfficial(keyword, options = {}) {
    const pageSize = Number.isFinite(options.pageSize) ? options.pageSize : YARGITAY_DEFAULT_PAGE_SIZE;
    const pageNumber = Number.isFinite(options.pageNumber) ? options.pageNumber : 1;

    const requestBody = JSON.stringify({
        data: {
            arananKelime: keyword,
            pageSize,
            pageNumber,
        }
    });

    const response = await fetchWithTimeout(`${YARGITAY_BASE_URL}/aramalist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: requestBody,
    }, 12000);

    if (!response.ok) {
        throw new Error(`Yargitay search HTTP ${response.status}`);
    }

    const text = await response.text();
    const parsed = maybeExtractJson(text);
    const rows = Array.isArray(parsed?.data?.data) ? parsed.data.data : [];

    if (rows.length === 0) return [];

    return rows
        .map((row, index) => {
            const rawId = String(row?.id || '').trim();
            if (!rawId) return null;

            const daire = normalizeYargitayText(row?.daire || '');
            const esasNo = normalizeYargitayText(row?.esasNo || row?.esas_no || '');
            const kararNo = normalizeYargitayText(row?.kararNo || row?.karar_no || '');
            const tarih = normalizeYargitayText(row?.kararTarihi || row?.tarih || row?.date || '');
            const decisionQuery = normalizeYargitayText(row?.arananKelime || keyword);

            const titleParts = [daire];
            if (esasNo) titleParts.push(`E. ${esasNo}`);
            if (kararNo) titleParts.push(`K. ${kararNo}`);
            if (tarih) titleParts.push(`T. ${tarih}`);

            const title = titleParts.filter(Boolean).join(' - ') || `Yargitay Karari #${index + 1}`;
            const sourceUrl = `${YARGITAY_BASE_URL}/getDokuman?id=${encodeURIComponent(rawId)}`;
            const summary = [
                `${daire || 'Yargitay'} karar kaydi.`,
                esasNo ? `Esas No: ${esasNo}.` : '',
                kararNo ? `Karar No: ${kararNo}.` : '',
                tarih ? `Karar Tarihi: ${tarih}.` : '',
                decisionQuery ? `Arama: ${decisionQuery}.` : '',
                'Karar metni icin detayi acin.',
            ].filter(Boolean).join(' ');

            return {
                id: rawId,
                documentId: rawId,
                title,
                esasNo,
                kararNo,
                tarih,
                daire,
                ozet: summary,
                sourceUrl,
                documentUrl: sourceUrl,
                relevanceScore: Math.max(0, 100 - (index * 5)),
            };
        })
        .filter(Boolean);
}

async function getYargitayDocumentText({ documentId = '', documentUrl = '' }) {
    let targetUrl = String(documentUrl || '').trim();

    if (!targetUrl && documentId) {
        targetUrl = `${YARGITAY_BASE_URL}/getDokuman?id=${encodeURIComponent(String(documentId).trim())}`;
    }

    if (!targetUrl) return '';

    const response = await fetchWithTimeout(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
    }, 12000);

    if (!response.ok) {
        throw new Error(`Yargitay getDokuman HTTP ${response.status}`);
    }

    const rawText = await response.text();
    const parsed = maybeExtractJson(rawText);
    const htmlContent = typeof parsed?.data === 'string'
        ? parsed.data
        : (typeof rawText === 'string' ? rawText : '');

    const plainText = stripHtmlToText(htmlContent);
    return plainText || '';
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
    const normalizedSource = String(source || 'all').trim().toLowerCase();
    const shouldUseYargitayOfficial = !normalizedSource || normalizedSource === 'all' || normalizedSource === 'yargitay';

    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    if (shouldUseYargitayOfficial) {
        try {
            const yargitayResults = await searchYargitayOfficial(keyword, { pageSize: YARGITAY_DEFAULT_PAGE_SIZE, pageNumber: 1 });
            if (yargitayResults.length > 0) {
                return res.json({
                    success: true,
                    source: 'yargitay',
                    provider: 'yargitay-official',
                    keyword,
                    results: yargitayResults,
                });
            }
        } catch (error) {
            console.error('Yargitay official search error:', error);
        }
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
        }, { maxRetries: 1, initialDelayMs: 500, requestTimeoutMs: 14000 });

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
            documentUrl: r.documentUrl || r.sourceUrl || r.url || '',
            relevanceScore: Number(r.relevanceScore) || Math.max(0, 100 - (i * 8)),
        })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        : [{
            id: 'ai-summary',
            documentId: 'ai-summary',
            title: 'AI Arama Sonucu',
            ozet: text.substring(0, 500),
        }];

    const finalWarning = warning || (shouldUseYargitayOfficial
        ? 'Resmi Yargitay servisi su an cevap vermedi, AI fallback sonucu gosteriliyor.'
        : '');

    res.json({
        success: true,
        source: source || 'all',
        provider: 'ai-fallback',
        keyword,
        results,
        ...(finalWarning ? { warning: finalWarning } : {}),
    });
}

async function getDocumentViaAIFallback(
    { keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' },
    options = {}
) {
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
    }, options);

    return (response.text || '').replace(/https?:\/\/\S+/gi, '').trim();
}

// POST /api/legal?action=get-document
async function handleGetDocument(req, res) {
    const { source, documentId, documentUrl, title, esasNo, kararNo, tarih, daire, ozet, snippet } = req.body || {};

    if (!documentId && !documentUrl) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    const safeDocumentId = String(documentId || '');
    const hasSyntheticDocumentId = /^(search-|legal-|ai-summary)/i.test(safeDocumentId);
    const summaryFallback = [ozet, snippet].map(value => String(value || '').trim()).filter(Boolean).join('\n\n');

    if (!documentUrl && hasSyntheticDocumentId) {
        return res.json({
            success: true,
            source,
            provider: 'summary-fallback',
            document: {
                content: summaryFallback || 'Karar metni kaynagi bulunamadi. Ozet goruntuleniyor.',
                mimeType: 'text/plain',
                documentId: safeDocumentId,
                documentUrl: '',
            }
        });
    }

    const normalizedSource = String(source || '').trim().toLowerCase();
    const isYargitaySource = normalizedSource === 'yargitay' || /karararama\.yargitay\.gov\.tr/i.test(String(documentUrl || ''));
    const hasNumericDocumentId = /^\d{6,}$/.test(safeDocumentId);

    if (isYargitaySource || hasNumericDocumentId) {
        try {
            const officialContent = await getYargitayDocumentText({ documentId: safeDocumentId, documentUrl });
            if (officialContent) {
                const inferredMeta = parseDecisionMetaFromText(officialContent);
                return res.json({
                    success: true,
                    source: source || 'yargitay',
                    provider: 'yargitay-official',
                    document: {
                        content: officialContent,
                        mimeType: 'text/plain',
                        documentId: safeDocumentId,
                        documentUrl: documentUrl || `${YARGITAY_BASE_URL}/getDokuman?id=${encodeURIComponent(safeDocumentId)}`,
                        esasNo: esasNo || inferredMeta.esasNo,
                        kararNo: kararNo || inferredMeta.kararNo,
                        tarih: tarih || inferredMeta.tarih,
                    }
                });
            }
        } catch (error) {
            console.error('Yargitay official get-document error:', error);
            if (summaryFallback) {
                return res.json({
                    success: true,
                    source: source || 'yargitay',
                    provider: 'summary-fallback',
                    document: {
                        content: summaryFallback,
                        mimeType: 'text/plain',
                        documentId: safeDocumentId,
                        documentUrl: documentUrl || '',
                    }
                });
            }
        }
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
        }, { maxRetries: 1, initialDelayMs: 400, requestTimeoutMs: 12000 });
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
