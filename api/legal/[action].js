import { GoogleGenAI } from '@google/genai';

export const config = {
    maxDuration: 60,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';
const LEGAL_AI_TIMEOUT_MS = Number(process.env.LEGAL_AI_TIMEOUT_MS || 18000);

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
    let timer = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const isRetryableAiError = (error) => {
    const message = [
        error?.message || '',
        error?.cause?.message || '',
        error?.stack || '',
    ].join(' ').toLowerCase();

    return [
        'fetch failed',
        'etimedout',
        'timed out',
        'econnreset',
        'socket hang up',
        'temporary failure',
        'network error',
        '503',
        '429',
    ].some(token => message.includes(token));
};

async function generateContentWithRetry(requestPayload, options = {}) {
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 0;
    const initialDelayMs = Number.isFinite(options.initialDelayMs) ? options.initialDelayMs : 500;

    let lastError = null;
    const ai = getAiClient();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await withTimeout(
                ai.models.generateContent(requestPayload),
                LEGAL_AI_TIMEOUT_MS,
                'Legal AI request timed out'
            );
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
        }, {
            maxRetries: 0,
        });

        text = response.text || '';
        const parsed = maybeExtractJson(text);
        rows = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('AI search-decisions fallback error:', error);
        warning = 'Emsal arama servislerine gecici olarak ulasilamiyor. Lutfen kisa bir sure sonra tekrar deneyin.';
        rows = [];
        try {
            const fallback = await generateContentWithRetry({
                model: MODEL_NAME,
                contents: `Turkiye hukukunda "${keyword}" konusuyla ilgili genel emsal alanlarini ve arama odakli kisa bir rehber ver. Uydurma esas/karar numarasi yazma.`,
                config: { temperature: 0.1 }
            }, {
                maxRetries: 0,
            });
            text = fallback.text || '';
        } catch {
            text = '';
        }
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
    }, {
        maxRetries: 0,
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const action = req.query.action || req.body?.action;

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
        res.status(500).json({ error: 'Bir hata olustu.', details: error.message });
    }
}
