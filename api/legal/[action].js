import { GoogleGenAI } from '@google/genai';

export const config = {
    maxDuration: 60,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';
const LEGAL_AI_TIMEOUT_MS = Number(process.env.LEGAL_AI_TIMEOUT_MS || 35000);
const BEDESTEN_TIMEOUT_MS = Number(process.env.BEDESTEN_TIMEOUT_MS || 15000);
const LEGAL_ROUTER_TIMEOUT_MS = Number(process.env.LEGAL_ROUTER_TIMEOUT_MS || 8000);

const BEDESTEN_BASE_URL = 'https://bedesten.adalet.gov.tr';
const BEDESTEN_SEARCH_URL = `${BEDESTEN_BASE_URL}/emsal-karar/searchDocuments`;
const BEDESTEN_DOCUMENT_URL = `${BEDESTEN_BASE_URL}/emsal-karar/getDocumentContent`;

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

const normalizeAction = (value) => {
    if (Array.isArray(value)) return String(value[0] || '').trim().toLowerCase();
    return String(value || '').trim().toLowerCase();
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = BEDESTEN_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(`Timeout after ${timeoutMs}ms`);
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
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

const stripHtmlToText = (html = '') => {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
};

const getBedestenHeaders = () => ({
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'tr,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Content-Type': 'application/json',
    Origin: 'https://emsal.yargitay.gov.tr',
    Pragma: 'no-cache',
    Referer: 'https://emsal.yargitay.gov.tr/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
});

const getBedestenItemTypeList = (source) => {
    const normalized = String(source || '').toLowerCase();
    switch (normalized) {
        case 'yargitay':
            return ['YARGITAYKARARI'];
        case 'danistay':
            return ['DANISTAYKARAR'];
        case 'uyap':
            return ['YERELHUKUK', 'YERELCEZA', 'BOLGEIDARE', 'BOLGEADLIYE'];
        case 'anayasa':
            return ['ANAYASAMAHKEMESI'];
        default:
            return ['YARGITAYKARARI', 'DANISTAYKARAR', 'YERELHUKUK', 'YERELCEZA', 'BOLGEIDARE', 'BOLGEADLIYE', 'ANAYASAMAHKEMESI'];
    }
};

const LEGAL_SOURCE_SET = new Set(['all', 'yargitay', 'danistay', 'uyap', 'anayasa', 'kik']);

const normalizeForRouting = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSourceValue = (value, fallback = 'all') => {
    const normalized = normalizeForRouting(value);
    if (LEGAL_SOURCE_SET.has(normalized)) return normalized;
    return fallback;
};

const compactLegalKeywordQuery = (keyword, maxLen = 180) => {
    const raw = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= maxLen) return raw;

    const normalized = normalizeForRouting(raw);
    const mustKeep = [];

    const lawMatch = raw.match(/\b\d{3,4}\s*say[iı]l[iı]\s*[^.,;:\n]*?kanun[ua]\b/i);
    if (lawMatch) mustKeep.push(lawMatch[0].trim());

    const articleMatches = raw.match(/\b\d{1,3}\.?\s*maddesi?\b/gi) || [];
    for (const article of articleMatches) {
        if (mustKeep.length >= 3) break;
        mustKeep.push(article.trim());
    }

    const phraseProbes = [
        'imar kanunu',
        'kacak yapi',
        'ruhsatsiz insaat',
        'imar mevzuatina aykirilik',
        'yikim karari',
        'idari para cezasi',
        'yapi tatil tutanagi',
        'proje tadilatina aykiri yapi',
        'encumen karari',
    ];

    for (const probe of phraseProbes) {
        if (!normalized.includes(probe)) continue;
        if (mustKeep.length >= 6) break;
        mustKeep.push(probe);
    }

    const stopWords = new Set(['ve', 'veya', 'ile', 'icin', 'gibi', 'olan', 'olarak', 'dair', 'kararlari', 'karar']);
    const tokenFallback = normalized
        .split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token))
        .slice(0, 18);

    const merged = [...mustKeep, ...tokenFallback]
        .map(item => String(item || '').trim())
        .filter(Boolean);

    const uniq = [];
    const seen = new Set();
    for (const item of merged) {
        const key = normalizeForRouting(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniq.push(item);
    }

    let compacted = uniq.join(' ');
    if (compacted.length > maxLen) {
        compacted = compacted.slice(0, maxLen).trim();
    }
    return compacted || raw.slice(0, maxLen).trim();
};

const resolveSourceByRules = (keyword, requestedSource = 'all') => {
    const text = normalizeForRouting(keyword);
    const requested = normalizeSourceValue(requestedSource, 'all');
    if (!text) {
        return {
            source: requested,
            confidence: requested === 'all' ? 0.4 : 0.75,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const scores = {
        danistay: 0,
        yargitay: 0,
        anayasa: 0,
        uyap: 0,
    };

    const addSignals = (source, probes, weight) => {
        for (const probe of probes) {
            if (text.includes(probe)) scores[source] += weight;
        }
    };

    addSignals('danistay', ['danistay'], 5);
    addSignals('yargitay', ['yargitay'], 5);
    addSignals('anayasa', ['anayasa mahkemesi', 'aym', 'bireysel basvuru'], 4.5);
    addSignals('uyap', ['uyap', 'istinaf', 'bolge adliye', 'yerel mahkeme', 'bolge idare'], 3.5);

    addSignals('danistay', [
        'imar',
        '3194',
        'ruhsat',
        'ruhsatsiz',
        'kacak yapi',
        'kacak',
        'yikim',
        'encumen',
        'yapi tatil',
        'idari para cezasi',
        'idari yargi',
        'idare mahkemesi',
        'iptal davasi',
        'tam yargi',
        'belediye',
        'imar barisi',
    ], 1.35);

    addSignals('yargitay', [
        'tck',
        'cmk',
        'hmk',
        'tbk',
        'kambiyo',
        'icra',
        'ceza',
        'bosanma',
        'is davasi',
        'alacak davasi',
        'dolandiricilik',
        'hirsizlik',
        'yaralama',
    ], 1.1);

    const explicitDanistay = text.includes('danistay');
    const explicitYargitay = text.includes('yargitay');
    if (explicitDanistay && explicitYargitay) {
        return {
            source: 'all',
            confidence: 0.98,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topSource = 'all', topScore = 0] = sorted[0] || [];
    const [secondSource = null, secondScore = 0] = sorted[1] || [];

    if (!topSource || topScore <= 0) {
        return {
            source: requested,
            confidence: requested === 'all' ? 0.45 : 0.75,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const diff = Math.max(0, topScore - secondScore);
    let confidence = 0.55 + Math.min(0.3, topScore * 0.08) + Math.min(0.1, diff * 0.06);
    confidence = Math.max(0.52, Math.min(0.95, confidence));

    let source = topSource;
    if (requested !== 'all' && requested !== topSource && diff < 1.2) {
        source = requested;
        confidence = Math.max(0.72, confidence - 0.08);
    }

    return {
        source: normalizeSourceValue(source, requested),
        confidence,
        secondarySource: secondScore >= 1 ? secondSource : null,
        secondaryScore: secondScore,
        method: 'rules',
    };
};

const tryResolveSourceWithAI = async ({ keyword, requestedSource = 'all' }) => {
    if (!GEMINI_API_KEY) return null;

    const requested = normalizeSourceValue(requestedSource, 'all');
    const routingPrompt = [
        'Asagidaki ictihat arama sorgusu icin en uygun yargi kaynagini sec.',
        'Gecerli source: danistay, yargitay, anayasa, uyap, all',
        'Kurallar:',
        '- Imar/ruhsat/yikim/encumen/idari para cezasi/idari yargi konularinda danistay agirlikli sec.',
        '- Ceza ve ozel hukuk temyiz agirlikli konularda yargitay sec.',
        '- Emin degilsen all sec.',
        'Sadece JSON dondur:',
        '{"source":"...","confidence":0.0,"birimAdi":"ALL","compactQuery":"..."}',
        `requestedSource: ${requested}`,
        `query: ${keyword}`,
    ].join('\n');

    try {
        const response = await generateContentWithRetry({
            model: MODEL_NAME,
            contents: routingPrompt,
            config: { temperature: 0.1 },
        }, { maxRetries: 0, timeoutMs: LEGAL_ROUTER_TIMEOUT_MS });

        const parsed = maybeExtractJson(response.text || '');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;

        const source = normalizeSourceValue(parsed.source, 'all');
        const confidenceRaw = Number(parsed.confidence);
        const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : 0.5;
        const compactQuery = typeof parsed.compactQuery === 'string'
            ? parsed.compactQuery.trim()
            : '';
        const birimAdi = typeof parsed.birimAdi === 'string'
            ? parsed.birimAdi.trim()
            : '';

        return {
            source,
            confidence,
            compactQuery: compactQuery || keyword,
            birimAdi: birimAdi || 'ALL',
            method: 'ai',
        };
    } catch (error) {
        console.error('Legal source AI router error:', error);
        return null;
    }
};

const buildSearchRoutingPlan = async ({ keyword, requestedSource = 'all', filters = {} }) => {
    const requested = normalizeSourceValue(requestedSource, 'all');
    const compactKeyword = compactLegalKeywordQuery(keyword);
    const ruleDecision = resolveSourceByRules(compactKeyword, requested);
    const aiDecision = await tryResolveSourceWithAI({ keyword: compactKeyword, requestedSource: requested });

    let resolvedSource = ruleDecision.source;
    let confidence = ruleDecision.confidence;
    let router = ruleDecision.method;

    if (aiDecision && aiDecision.source) {
        const aiCanOverrideRule = aiDecision.confidence >= 0.64 && (
            ruleDecision.confidence < 0.84
            || aiDecision.source === requested
            || requested === 'all'
        );

        if (aiCanOverrideRule) {
            resolvedSource = aiDecision.source;
            confidence = Math.max(confidence, aiDecision.confidence);
            router = 'ai';
        }
    }

    if (requested !== 'all' && requested !== resolvedSource) {
        const strongOverride = confidence >= 0.86;
        if (!strongOverride) {
            resolvedSource = requested;
            confidence = Math.max(confidence, 0.75);
            router = 'requested';
        }
    }

    const fallbackSources = [];
    for (const candidate of [resolvedSource, ruleDecision.secondarySource, 'all']) {
        const normalized = normalizeSourceValue(candidate, '');
        if (!normalized || fallbackSources.includes(normalized)) continue;
        fallbackSources.push(normalized);
        if (fallbackSources.length >= 3) break;
    }

    const nextFilters = { ...(filters || {}) };
    if ((!nextFilters.birimAdi || nextFilters.birimAdi === 'ALL') && aiDecision?.birimAdi && aiDecision.birimAdi !== 'ALL') {
        nextFilters.birimAdi = aiDecision.birimAdi;
    }

    return {
        requestedSource: requested,
        resolvedSource,
        confidence,
        router,
        keyword: aiDecision?.compactQuery ? compactLegalKeywordQuery(aiDecision.compactQuery) : compactKeyword,
        originalKeyword: String(keyword || ''),
        fallbackSources,
        filters: nextFilters,
        compacted: compactKeyword !== String(keyword || '').trim(),
    };
};

const toBedestenFormattedDecision = (item, index) => {
    const safe = item || {};
    const esasNo = safe.esasNo || (safe.esasYili && safe.esasSiraNo ? `${safe.esasYili}/${safe.esasSiraNo}` : '');
    const kararNo = safe.kararNo || (safe.kararYili && safe.kararSiraNo ? `${safe.kararYili}/${safe.kararSiraNo}` : '');
    const daire = safe.birimAdi || safe.birim || '';
    const mahkeme = safe.itemType?.description || safe.mahkeme || '';
    const title = `${mahkeme} ${daire}`.trim() || safe.title || `Karar ${index + 1}`;
    const ozet = safe.ozet || safe.kararOzeti || safe.summary || '';
    const score = Number(safe.relevanceScore ?? safe.score);

    return {
        id: safe.documentId || safe.id || `bedesten-${index + 1}`,
        documentId: safe.documentId || safe.id || '',
        title,
        esasNo,
        kararNo,
        tarih: safe.kararTarihiStr || safe.kararTarihi || safe.tarih || '',
        daire,
        ozet,
        relevanceScore: Number.isFinite(score) ? score : undefined,
    };
};

async function searchBedestenAPI(keyword, source, filters = {}) {
    const pageNumber = Math.max(1, Number(filters.pageNumber) || 1);
    const pageSize = Math.min(40, Math.max(10, Number(filters.pageSize) || 20));

    const payload = {
        data: {
            pageSize,
            pageNumber,
            itemTypeList: getBedestenItemTypeList(source),
            phrase: keyword,
            birimAdi: (typeof filters.birimAdi === 'string' && filters.birimAdi.trim()) ? filters.birimAdi.trim() : 'ALL',
            kararTarihiStart: filters.kararTarihiStart || null,
            kararTarihiEnd: filters.kararTarihiEnd || null,
            sortFields: Array.isArray(filters.sortFields) && filters.sortFields.length > 0 ? filters.sortFields : ['KARAR_TARIHI'],
            sortDirection: (filters.sortDirection || 'DESC').toString().toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };

    const response = await fetchWithTimeout(BEDESTEN_SEARCH_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    }, BEDESTEN_TIMEOUT_MS);

    if (!response.ok) {
        const rawError = await response.text().catch(() => '');
        throw new Error(`Bedesten search failed (${response.status}) ${rawError}`);
    }

    const data = await response.json();
    const list = [
        data?.data?.emsalKararList,
        data?.emsalKararList,
        data?.results,
    ].find(Array.isArray) || [];

    return list.map((item, index) => toBedestenFormattedDecision(item, index));
}

async function getBedestenDocumentContent(documentId) {
    const payload = {
        data: { documentId },
        applicationName: 'UyapMevzuat',
    };

    const response = await fetchWithTimeout(BEDESTEN_DOCUMENT_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    }, BEDESTEN_TIMEOUT_MS);

    if (!response.ok) {
        const rawError = await response.text().catch(() => '');
        throw new Error(`Bedesten get-document failed (${response.status}) ${rawError}`);
    }

    const data = await response.json();
    const container = data?.data || data || {};
    const encodedContent = container.content || container.documentContent || container.base64Content || '';
    const mimeType = String(container.mimeType || container.contentType || 'text/html');

    if (!encodedContent || typeof encodedContent !== 'string') {
        return { content: '', mimeType };
    }

    try {
        if (mimeType.toLowerCase().includes('html')) {
            const decoded = Buffer.from(encodedContent, 'base64').toString('utf-8');
            return { content: stripHtmlToText(decoded), mimeType };
        }

        if (mimeType.toLowerCase().includes('text')) {
            const decoded = Buffer.from(encodedContent, 'base64').toString('utf-8');
            return { content: decoded.trim(), mimeType };
        }
    } catch (error) {
        console.error('Bedesten content decode error:', error);
    }

    return { content: '', mimeType };
}

async function generateContentWithRetry(requestPayload, options = {}) {
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 1;
    const initialDelayMs = Number.isFinite(options.initialDelayMs) ? options.initialDelayMs : 500;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : LEGAL_AI_TIMEOUT_MS;

    let lastError = null;
    const ai = getAiClient();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await withTimeout(
                ai.models.generateContent(requestPayload),
                timeoutMs,
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

async function searchEmsalFallback(keyword, sourceHint = 'all') {
    try {
        const normalizedSourceHint = normalizeSourceValue(sourceHint, 'all');
        const sourceDirective = normalizedSourceHint === 'all'
            ? 'Yargitay ve Danistay agirlikli'
            : `${normalizedSourceHint.toUpperCase()} agirlikli`;
        const response = await generateContentWithRetry({
            model: MODEL_NAME,
            contents: `Turkiye'de "${keyword}" konusunda ${sourceDirective} emsal kararlarini bul.

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
        }, { maxRetries: 0 });

        const text = response.text || '';
        const parsed = maybeExtractJson(text);
        const rows = Array.isArray(parsed) ? parsed : [];

        if (rows.length > 0) {
            return {
                success: true,
                results: rows.map((row, index) => ({
                    id: `search-${index}`,
                    documentId: `search-${index}`,
                    title: `${row.mahkeme || 'Yargitay'} ${row.daire || ''}`.trim(),
                    esasNo: row.esasNo || row.esas_no || '',
                    kararNo: row.kararNo || row.karar_no || '',
                    tarih: row.tarih || row.date || '',
                    daire: row.daire || '',
                    ozet: row.ozet || row.snippet || '',
                    sourceUrl: row.sourceUrl || row.url || '',
                    documentUrl: row.documentUrl || row.sourceUrl || row.url || '',
                    relevanceScore: Number(row.relevanceScore) || Math.max(0, 100 - (index * 8)),
                })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)),
            };
        }

        return {
            success: true,
            results: [{
                id: 'ai-summary',
                documentId: 'ai-summary',
                title: 'AI Arama Sonucu',
                ozet: String(text || '').slice(0, 500),
            }],
        };
    } catch (error) {
        console.error('AI search fallback error:', error);
        return { success: false, results: [] };
    }
}

async function getDocumentViaAIFallback({ keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' }) {
    const query = [
        keyword,
        title,
        daire,
        esasNo ? `E. ${esasNo}` : '',
        kararNo ? `K. ${kararNo}` : '',
        tarih ? `T. ${tarih}` : '',
        ozet,
        documentId,
        documentUrl,
    ].filter(Boolean).join(' ').trim();

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
    }, { maxRetries: 0 });

    return String(response.text || '').replace(/https?:\/\/\S+/gi, '').trim();
}

async function handleSources(req, res) {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargitay', description: 'Yargitay Kararlari (MCP/Bedesten)' },
            { id: 'danistay', name: 'Danistay', description: 'Danistay Kararlari (MCP/Bedesten)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (MCP/Bedesten)' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararlari (MCP/Bedesten)' },
            { id: 'kik', name: 'KIK', description: 'Kamu Ihale Kurulu Kararlari (MCP/Bedesten)' },
        ],
    });
}

async function handleSearchDecisions(req, res) {
    const { source, keyword, filters = {} } = req.body || {};
    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    const routingPlan = await buildSearchRoutingPlan({
        keyword,
        requestedSource: source,
        filters,
    });

    let provider = 'bedesten';
    const warningParts = [];
    let results = [];
    let usedSource = routingPlan.resolvedSource;
    const bedestenErrors = [];

    for (const candidateSource of routingPlan.fallbackSources) {
        usedSource = candidateSource;
        try {
            const bedestenResults = await searchBedestenAPI(
                routingPlan.keyword,
                candidateSource,
                routingPlan.filters
            );
            if (Array.isArray(bedestenResults) && bedestenResults.length > 0) {
                results = bedestenResults;
                break;
            }
        } catch (error) {
            bedestenErrors.push(`${candidateSource}:${error?.message || 'unknown-error'}`);
            if (error?.code === 'REQUEST_TIMEOUT') {
                warningParts.push('MCP/Bedesten aramasi zaman asimina ugradi, AI fallback kullaniliyor.');
                break;
            }
            console.error(`Bedesten search error (${candidateSource}):`, error);
        }
    }

    if (!Array.isArray(results) || results.length === 0) {
        provider = 'ai-fallback';
        const fallback = await searchEmsalFallback(routingPlan.keyword, usedSource);
        results = fallback.results || [];

        if (!fallback.success && results.length === 0) {
            return res.json({
                success: true,
                source: usedSource || routingPlan.resolvedSource || 'all',
                provider,
                keyword: routingPlan.keyword,
                results: [],
                warning: 'Emsal arama servislerine su an ulasilamiyor. Lutfen biraz sonra tekrar deneyin.',
                routing: {
                    requestedSource: routingPlan.requestedSource,
                    resolvedSource: routingPlan.resolvedSource,
                    usedSource,
                    fallbackSources: routingPlan.fallbackSources,
                    router: routingPlan.router,
                    confidence: routingPlan.confidence,
                    compacted: routingPlan.compacted,
                },
            });
        }
    }

    if (routingPlan.compacted) {
        warningParts.push('Uzun sorgu optimize edilerek arama yapildi.');
    }
    if (bedestenErrors.length > 0) {
        warningParts.push('Bazi Bedesten denemeleri basarisiz oldu.');
    }

    return res.json({
        success: true,
        source: usedSource || routingPlan.resolvedSource || 'all',
        provider,
        keyword: routingPlan.keyword,
        results,
        routing: {
            requestedSource: routingPlan.requestedSource,
            resolvedSource: routingPlan.resolvedSource,
            usedSource,
            fallbackSources: routingPlan.fallbackSources,
            router: routingPlan.router,
            confidence: routingPlan.confidence,
            compacted: routingPlan.compacted,
        },
        ...(warningParts.length > 0 ? { warning: warningParts.join(' ') } : {}),
    });
}

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
                content: summaryFallback || 'Karar metni kaynagi bulunamadi. Ozet gosteriliyor.',
                mimeType: 'text/plain',
                documentId: safeDocumentId,
                documentUrl: '',
            },
        });
    }

    let content = '';
    let provider = 'bedesten';
    let mimeType = 'text/plain';

    if (safeDocumentId && !hasSyntheticDocumentId) {
        try {
            const bedestenDoc = await getBedestenDocumentContent(safeDocumentId);
            content = bedestenDoc.content || '';
            mimeType = bedestenDoc.mimeType || mimeType;
        } catch (error) {
            provider = 'ai-fallback';
            console.error('Bedesten get-document error:', error);
        }
    } else {
        provider = 'ai-fallback';
    }

    if (!content || content.trim().length < 120) {
        provider = 'ai-fallback';
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
    }

    if (!content) {
        content = summaryFallback || 'Karar metni getirilemedi. Lutfen farkli bir karar secip tekrar deneyin.';
        provider = summaryFallback ? 'summary-fallback' : provider;
    }

    return res.json({
        success: true,
        source,
        provider,
        document: {
            content,
            mimeType,
            documentId: safeDocumentId,
            documentUrl: String(documentUrl || ''),
        },
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const action = normalizeAction(req?.query?.action || req?.body?.action);

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
        return res.status(500).json({
            error: process.env.NODE_ENV === 'production'
                ? 'Bir hata olustu.'
                : (error?.message || 'Bir hata olustu.'),
        });
    }
}
