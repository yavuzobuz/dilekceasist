import { GoogleGenAI } from '@google/genai';

export const config = {
    maxDuration: 60,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME =
    process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';
const LEGAL_AI_TIMEOUT_MS = Number(process.env.LEGAL_AI_TIMEOUT_MS || 35000);
const BEDESTEN_TIMEOUT_MS = Number(process.env.BEDESTEN_TIMEOUT_MS || 15000);
const LEGAL_ROUTER_TIMEOUT_MS = Number(process.env.LEGAL_ROUTER_TIMEOUT_MS || 8000);
const LEGAL_RESULT_RETURN_LIMIT = Math.max(
    10,
    Math.min(100, Number(process.env.LEGAL_RESULT_RETURN_LIMIT || 50))
);
const LEGAL_CONTENT_RERANK_LIMIT = Math.max(
    LEGAL_RESULT_RETURN_LIMIT,
    Math.min(100, Number(process.env.LEGAL_CONTENT_RERANK_LIMIT || 50))
);
const LEGAL_QUERY_VARIANT_LIMIT = Math.max(
    6,
    Math.min(20, Number(process.env.LEGAL_QUERY_VARIANT_LIMIT || 10))
);
const LEGAL_VARIANT_RESULT_CAP = Math.max(
    LEGAL_RESULT_RETURN_LIMIT,
    Math.min(150, Number(process.env.LEGAL_VARIANT_RESULT_CAP || 50))
);
const USE_GEMINI_SEMANTIC_RERANK = process.env.LEGAL_USE_GEMINI_SEMANTIC !== '0';
const LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT = Math.max(
    LEGAL_RESULT_RETURN_LIMIT,
    Math.min(100, Number(process.env.LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT || 50))
);
const LEGAL_RELATED_RESULT_TARGET = Math.max(
    5,
    Math.min(
        LEGAL_RESULT_RETURN_LIMIT,
        Number(process.env.LEGAL_RELATED_RESULT_TARGET || LEGAL_RESULT_RETURN_LIMIT)
    )
);
const USE_MCP_SEMANTIC_SEARCH = process.env.LEGAL_USE_MCP_SEMANTIC !== '0';
const YARGI_MCP_SEMANTIC_TIMEOUT_MS = Number(process.env.YARGI_MCP_SEMANTIC_TIMEOUT_MS || 90000);

const BEDESTEN_BASE_URL = 'https://bedesten.adalet.gov.tr';
const BEDESTEN_SEARCH_URL = `${BEDESTEN_BASE_URL}/emsal-karar/searchDocuments`;
const BEDESTEN_DOCUMENT_URL = `${BEDESTEN_BASE_URL}/emsal-karar/getDocumentContent`;
const YARGI_MCP_URL = String(
    process.env.YARGI_MCP_URL || 'https://yargimcp.fastmcp.app/mcp/'
).trim();
const YARGI_MCP_PROTOCOL_VERSION = process.env.YARGI_MCP_PROTOCOL_VERSION || '2024-11-05';
const YARGI_MCP_TIMEOUT_MS = Number(process.env.YARGI_MCP_TIMEOUT_MS || 90000);
const USE_YARGI_MCP = process.env.LEGAL_USE_YARGI_MCP !== '0';
const STRICT_MCP_ONLY = process.env.LEGAL_STRICT_MCP !== '0';

// ─── Faz B: In-memory search results cache (60s TTL) ────────────────────
const SEARCH_CACHE_TTL_MS = 60_000; // 60 saniye
const searchCache = new Map(); // key -> { timestamp, data }
const getCachedResult = (cacheKey) => {
    const entry = searchCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL_MS) {
        searchCache.delete(cacheKey);
        return null;
    }
    return entry.data;
};
const setCachedResult = (cacheKey, data) => {
    // Basit eviction: 200'den fazla entry varsa en eskiyi sil
    if (searchCache.size > 200) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(cacheKey, { timestamp: Date.now(), data });
};

// ─── Document Content Cache (1h TTL, LRU max 500) ───────────────────────
// Karar tam metinleri immutable olduğundan uzun süreli cache güvenlidir.
const DOCUMENT_CACHE_TTL_MS = 3_600_000; // 1 saat
const DOCUMENT_CACHE_MAX = 500;
const documentContentCache = new Map(); // documentId -> { content, ts }
const getCachedDocumentContent = (documentId) => {
    const entry = documentContentCache.get(documentId);
    if (!entry) return null;
    if (Date.now() - entry.ts > DOCUMENT_CACHE_TTL_MS) {
        documentContentCache.delete(documentId);
        return null;
    }
    return entry.content;
};
const setCachedDocumentContent = (documentId, content) => {
    if (documentContentCache.size > DOCUMENT_CACHE_MAX) {
        const oldest = documentContentCache.keys().next().value;
        documentContentCache.delete(oldest);
    }
    documentContentCache.set(documentId, { content, ts: Date.now() });
};

// ─── MCP Session Pool (5 min TTL) ───────────────────────────────────────
const mcpSessionPool = { id: null, lastUsed: 0, creating: null };
const MCP_SESSION_TTL_MS = 300_000; // 5 dk
const getPooledSession = async () => {
    // Eğer zaten geçerli bir session varsa yeniden kullan
    if (
        mcpSessionPool.id &&
        Date.now() - mcpSessionPool.lastUsed < MCP_SESSION_TTL_MS
    ) {
        mcpSessionPool.lastUsed = Date.now();
        return mcpSessionPool.id;
    }
    // Eşzamanlı isteklerde birden fazla session oluşmasını önle
    if (mcpSessionPool.creating) {
        return mcpSessionPool.creating;
    }
    mcpSessionPool.creating = (async () => {
        try {
            // Eski session'ı kapat
            if (mcpSessionPool.id) {
                await closeYargiMcpSession(mcpSessionPool.id).catch(() => { });
            }
            const newId = await initYargiMcpSession();
            mcpSessionPool.id = newId;
            mcpSessionPool.lastUsed = Date.now();
            return newId;
        } finally {
            mcpSessionPool.creating = null;
        }
    })();
    return mcpSessionPool.creating;
};

const YARGI_MCP_COURT_TYPES_BY_SOURCE = {
    yargitay: ['YARGITAYKARARI'],
    danistay: ['DANISTAYKARAR'],
    uyap: ['YERELHUKUK', 'ISTINAFHUKUK', 'KYB'],
    anayasa: ['YARGITAYKARARI', 'DANISTAYKARAR', 'ISTINAFHUKUK'],
    all: ['YARGITAYKARARI', 'DANISTAYKARAR', 'ISTINAFHUKUK'],
};

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

const normalizeAction = (value) => {
    if (Array.isArray(value))
        return String(value[0] || '')
            .trim()
            .toLowerCase();
    return String(value || '')
        .trim()
        .toLowerCase();
};

const maybeExtractJson = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const normalizeYargiMcpUrl = () => {
    const raw = String(YARGI_MCP_URL || '').trim();
    if (!raw) {
        throw new Error('YARGI_MCP_URL tanimli degil.');
    }
    return raw.endsWith('/') ? raw : `${raw}/`;
};

const normalizeYargiMcpBirimAdi = (value = 'ALL') => {
    const raw = String(value || '')
        .trim()
        .toUpperCase();
    if (!raw || raw === 'ALL') return 'ALL';
    if (
        /^(H([1-9]|1\d|2[0-3])|C([1-9]|1\d|2[0-3])|D([1-9]|1[0-7])|HGK|CGK|BGK|HBK|CBK|DBGK|IDDK|VDDK|IBK|IIK|DBK|AYIM|AYIMDK|AYIMB|AYIM1|AYIM2|AYIM3)$/.test(
            raw
        )
    ) {
        return raw;
    }
    return 'ALL';
};

const parseMcpEventPayload = (rawText = '') => {
    const text = String(rawText || '').trim();
    if (!text) return null;

    const dataLines = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

    if (dataLines.length === 0) {
        return maybeExtractJson(text);
    }
    return maybeExtractJson(dataLines.join('\n'));
};

const postYargiMcp = async (payload, sessionId = '') => {
    const endpoint = normalizeYargiMcpUrl();
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
    };
    if (sessionId) {
        headers['mcp-session-id'] = sessionId;
    }

    const response = await fetchWithTimeout(
        endpoint,
        {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        },
        YARGI_MCP_TIMEOUT_MS
    );

    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
        throw new Error(`Yargi MCP HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }

    const eventPayload = parseMcpEventPayload(responseText);
    const nextSessionId = response.headers.get('mcp-session-id') || sessionId;

    if (eventPayload?.error) {
        throw new Error(`Yargi MCP error: ${eventPayload.error?.message || 'unknown-error'}`);
    }

    return { eventPayload, responseText, sessionId: nextSessionId };
};

const initYargiMcpSession = async () => {
    const initPayload = {
        jsonrpc: '2.0',
        id: `init-${Date.now()}`,
        method: 'initialize',
        params: {
            protocolVersion: YARGI_MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
                name: 'dilekceasist',
                version: '1.0.0',
            },
        },
    };

    const initResponse = await postYargiMcp(initPayload);
    const sessionId = initResponse.sessionId;
    if (!sessionId) {
        throw new Error('Yargi MCP session id alinamadi.');
    }

    await postYargiMcp(
        {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
        },
        sessionId
    );

    return sessionId;
};

const closeYargiMcpSession = async (sessionId = '') => {
    if (!sessionId) return;
    try {
        await fetchWithTimeout(
            normalizeYargiMcpUrl(),
            {
                method: 'DELETE',
                headers: { 'mcp-session-id': sessionId },
            },
            5000
        );
    } catch {
        // session cleanup best effort
    }
};

const callYargiMcpTool = async (name, args = {}) => {
    let sessionId = '';
    let isPooledSession = false;
    try {
        // Session pool'dan session al — HTTP roundtrip'leri ~%70 azaltır
        try {
            sessionId = await getPooledSession();
            isPooledSession = true;
        } catch {
            // Pool başarısız olursa fallback: yeni session oluştur
            sessionId = await initYargiMcpSession();
            isPooledSession = false;
        }
        const callPayload = {
            jsonrpc: '2.0',
            id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            method: 'tools/call',
            params: {
                name,
                arguments: args,
            },
        };
        const callResult = await postYargiMcp(callPayload, sessionId);
        const toolResult = callResult.eventPayload?.result || {};
        const textPayload = Array.isArray(toolResult.content)
            ? toolResult.content
                .filter((item) => item && item.type === 'text')
                .map((item) => String(item.text || ''))
                .join('\n')
                .trim()
            : '';

        if (toolResult.isError) {
            // Session bozuk olabilir — pool'u temizle
            if (isPooledSession) {
                mcpSessionPool.id = null;
                mcpSessionPool.lastUsed = 0;
            }
            throw new Error(textPayload || `Yargi MCP tool hatasi (${name})`);
        }

        return {
            text: textPayload,
            parsed: maybeExtractJson(textPayload),
        };
    } catch (error) {
        // Session hatalarında pool'u invalidate et ve tekrar dene
        if (
            isPooledSession &&
            (error?.message?.includes('session') ||
                error?.message?.includes('HTTP 4'))
        ) {
            mcpSessionPool.id = null;
            mcpSessionPool.lastUsed = 0;
            // Bir kez retry — yeni session ile
            return callYargiMcpTool(name, args);
        }
        throw error;
    } finally {
        // Pooled session'ları kapatMA, sadece non-pooled olanı kapat
        if (!isPooledSession && sessionId) {
            await closeYargiMcpSession(sessionId);
        }
    }
};

const getMcpCourtTypesBySource = (source = 'all') => {
    const normalized = normalizeSourceValue(source, 'all');
    return YARGI_MCP_COURT_TYPES_BY_SOURCE[normalized] || YARGI_MCP_COURT_TYPES_BY_SOURCE.all;
};

const isRetryableAiError = (error) => {
    const message = [error?.message || '', error?.cause?.message || '', error?.stack || '']
        .join(' ')
        .toLowerCase();

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
    ].some((token) => message.includes(token));
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
    Accept: '*/*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    AdaletApplicationName: 'UyapMevzuat',
    'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://mevzuat.adalet.gov.tr',
    Referer: 'https://mevzuat.adalet.gov.tr/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
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
            return [
                'YARGITAYKARARI',
                'DANISTAYKARAR',
                'YERELHUKUK',
                'YERELCEZA',
                'BOLGEIDARE',
                'BOLGEADLIYE',
                'ANAYASAMAHKEMESI',
            ];
    }
};

const LEGAL_SOURCE_SET = new Set(['all', 'yargitay', 'danistay', 'uyap', 'anayasa', 'kik']);

const normalizeForRouting = (value = '') =>
    String(value || '')
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
    const raw = String(keyword || '')
        .replace(/\s+/g, ' ')
        .trim();
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
        // Imar / yapi
        'imar kanunu',
        'kacak yapi',
        'ruhsatsiz insaat',
        'imar mevzuatina aykirilik',
        'yikim karari',
        'idari para cezasi',
        'yapi tatil tutanagi',
        'proje tadilatina aykiri yapi',
        'encumen karari',
        'imar barisi',
        'yapi kayit belgesi',
        // Elektrik / EPDK / enerji
        'kacak elektrik tuketimi',
        'kacak elektrik',
        'elektrik piyasasi kanunu',
        'epdk yonetmeligi',
        'tespit tutanagi',
        'kayip kacak bedeli',
        'dagitim sirketi',
        'elektrik aboneligi',
        // Icra / alacak - ozel hukuk
        'itirazin iptali',
        'borca itiraz',
        'menfi tespit',
        'icra takibi',
        'alacak davasi',
        'kambiyo senedi',
        // Is hukuku
        'kidem tazminati',
        'ihbar tazminati',
        'hizmet tespiti',
        'is akdi feshi',
        'is sozlesmesi',
        // Kamu ihale
        'kamu ihale kanunu',
        'kik karari',
        'ihale iptal',
        // Kira / tasınmaz
        'kira sozlesmesi',
        'tahliye davasi',
        'tapu tescil',
    ];

    for (const probe of phraseProbes) {
        if (!normalized.includes(probe)) continue;
        if (mustKeep.length >= 6) break;
        mustKeep.push(probe);
    }

    const stopWords = new Set([
        've',
        'veya',
        'ile',
        'icin',
        'gibi',
        'olan',
        'olarak',
        'dair',
        'kararlari',
        'karar',
    ]);
    const tokenFallback = normalized
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !stopWords.has(token))
        .slice(0, 18);

    const merged = [...mustKeep, ...tokenFallback]
        .map((item) => String(item || '').trim())
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

const LEGAL_QUERY_STOPWORDS = new Set([
    've',
    'veya',
    'ile',
    'icin',
    'gibi',
    'olan',
    'olarak',
    'dair',
    'karar',
    'kararlari',
    'karari',
    'davasi',
    'davasi',
    'maddesi',
    'madde',
    'sayili',
    'kanun',
    'kanunu',
    'hukuku',
]);

const LEGAL_QUERY_PHRASE_ANCHORS = [
    'itirazin iptali',
    'zaman asimi',
    'icra takibi',
    'borca itiraz',
    'menfi tespit',
    'konkordato',
    'iflasin ertelenmesi',
    'tasarrufun iptali',
    'kacak elektrik',
    'kacak elektrik tuketimi',
    'usulsuz elektrik kullanimi',
    'tespit tutanagi',
    'muhur fekki',
    'muhur kirma',
    'epdk',
    'enerji piyasasi',
    'elektrik piyasasi',
    'dagitim sirketi',
    'dagitim sirketi alacagi',
    'kayip kacak bedeli',
    'kayip kacak',
    'haksiz fiil sorumlulugu',
    'ispat yuku',
    'tuketici hizmetleri yonetmeligi',
    'idari islemin iptali',
    'tam yargi davasi',
    'yurutmenin durdurulmasi',
    'kamulastirma bedeli',
    'kamu ihale',
    'idari para cezasi',
    'imar kanunu',
    'imar barisi',
    'yapi kayit belgesi',
    'gecici 16',
    '7143',
    'ruhsatsiz yapi',
    'yapi tatil tutanagi',
    'kasten oldurme',
    'uyusturucu madde',
    'haksiz tahrik',
    'gorevi kotuye kullanma',
    'ise iade',
    'fazla mesai alacagi',
    'kidem tazminati',
    'ihbar tazminati',
    'is akdi feshi',
    'iscilik alacagi',
];

const buildStrictBedestenQuery = (keyword = '') => {
    const raw = String(keyword || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!raw) return '';

    const normalized = normalizeForRouting(raw);
    const requiredPhrases = LEGAL_QUERY_PHRASE_ANCHORS.filter((phrase) =>
        normalized.includes(phrase)
    ).slice(0, 5);

    const numericAnchors = (raw.match(/\b\d{2,4}\b/g) || []).slice(0, 3);
    const tokenAnchors = normalized
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !LEGAL_QUERY_STOPWORDS.has(token))
        .slice(0, 6);

    const parts = [...requiredPhrases, ...numericAnchors, ...tokenAnchors];
    const uniq = [];
    const seen = new Set();
    for (const part of parts) {
        const key = normalizeForRouting(part);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // UYAP uses +"phrase" for mandatory AND, not AND keyword
        uniq.push(part.includes(' ') ? `+"${part}"` : `+${part}`);
    }

    if (uniq.length < 2) return '';

    const strictQuery = uniq.join(' ').trim();
    return strictQuery.length > 220 ? strictQuery.slice(0, 220).trim() : strictQuery;
};

const buildBedestenQueryVariants = (keyword = '', originalKeyword = '') => {
    const routed = String(keyword || '')
        .replace(/\s+/g, ' ')
        .trim();
    const raw = String(originalKeyword || routed)
        .replace(/\s+/g, ' ')
        .trim();
    if (!raw) return [];

    const variants = [];
    const seen = new Set();
    const pushVariant = (value) => {
        const cleaned = String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned) return;
        const key = normalizeForRouting(cleaned);
        if (!key || seen.has(key)) return;
        seen.add(key);
        variants.push(cleaned);
    };

    pushVariant(raw);
    if (routed && routed !== raw) {
        pushVariant(routed);
    }
    pushVariant(buildStrictBedestenQuery(raw));
    pushVariant(compactLegalKeywordQuery(raw, 140));
    pushVariant(compactLegalKeywordQuery(raw, 95));

    const normalized = normalizeForRouting(raw);
    const matchedAnchors = LEGAL_QUERY_PHRASE_ANCHORS.filter((phrase) =>
        normalized.includes(phrase)
    ).slice(0, 6);
    const hasDenseAnchorIntent = matchedAnchors.length >= 3;
    if (matchedAnchors.length >= 2) {
        pushVariant(`+"${matchedAnchors[0]}" +"${matchedAnchors[1]}"`);
    }
    if (matchedAnchors.length >= 3) {
        pushVariant(`+"${matchedAnchors[0]}" +"${matchedAnchors[1]}" +"${matchedAnchors[2]}"`);
    }
    if (matchedAnchors.length >= 4) {
        pushVariant(
            `+"${matchedAnchors[0]}" +"${matchedAnchors[1]}" +"${matchedAnchors[2]}" +"${matchedAnchors[3]}"`
        );
    }
    if (hasDenseAnchorIntent) {
        const maxPairAnchors = Math.min(5, matchedAnchors.length);
        for (let idx = 0; idx < maxPairAnchors - 1; idx += 1) {
            pushVariant(`+"${matchedAnchors[idx]}" +"${matchedAnchors[idx + 1]}"`);
        }
    } else {
        for (const phrase of matchedAnchors) {
            pushVariant(phrase);
        }
    }

    const segmentedTokens = normalized
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !LEGAL_QUERY_STOPWORDS.has(token))
        .slice(0, 12);
    if (segmentedTokens.length >= 3) {
        pushVariant(`${segmentedTokens[0]} ${segmentedTokens[1]} ${segmentedTokens[2]}`);
    }
    if (hasDenseAnchorIntent) {
        if (segmentedTokens.length >= 4) {
            pushVariant(
                `${segmentedTokens[0]} ${segmentedTokens[1]} ${segmentedTokens[2]} ${segmentedTokens[3]}`
            );
        }
    } else {
        for (let idx = 0; idx < segmentedTokens.length; idx += 2) {
            const pair = segmentedTokens.slice(idx, idx + 2);
            if (pair.length >= 2) {
                pushVariant(pair.join(' '));
            }
        }
    }

    const focused = [];
    if (normalized.includes('3194')) focused.push('3194');
    if (normalized.includes('gecici 16')) focused.push('gecici 16');
    if (normalized.includes('imar')) focused.push('imar');
    if (normalized.includes('yapi kayit')) focused.push('yapi kayit belgesi');
    if (normalized.includes('sit')) focused.push('sit alani');
    if (normalized.includes('koruma')) focused.push('koruma alani');
    if (normalized.includes('idari para cezasi')) focused.push('idari para cezasi');
    // Elektrik / enerji domain focused queries
    if (normalized.includes('kacak elektrik')) focused.push('kacak elektrik');
    if (normalized.includes('usulsuz elektrik')) focused.push('usulsuz elektrik');
    if (normalized.includes('muhur kirma') || normalized.includes('muhur fekki'))
        focused.push('muhur kirma');
    if (normalized.includes('tespit tutanagi')) focused.push('tespit tutanagi');
    if (normalized.includes('dagitim sirketi')) focused.push('dagitim sirketi');
    if (normalized.includes('kayip kacak')) focused.push('kayip kacak bedeli');
    if (normalized.includes('epdk') || normalized.includes('enerji piyasasi')) focused.push('epdk');
    if (normalized.includes('itirazin iptali')) focused.push('itirazin iptali');
    if (normalized.includes('haksiz fiil')) focused.push('haksiz fiil sorumlulugu');
    if (normalized.includes('ispat yuku')) focused.push('ispat yuku');
    if (normalized.includes('tuketici hizmetleri')) focused.push('tuketici hizmetleri');
    if (focused.length >= 2) {
        pushVariant(
            focused.map((item) => (item.includes(' ') ? `+"${item}"` : `+${item}`)).join(' ')
        );
    }
    // For elektrik cases, also build targeted two-phrase queries
    if (focused.length >= 3) {
        for (let fi = 0; fi < Math.min(focused.length - 1, 4); fi++) {
            pushVariant(`+"${focused[fi]}" +"${focused[fi + 1]}"`);
        }
    }

    return variants.slice(0, LEGAL_QUERY_VARIANT_LIMIT);
};

const LEGAL_MATCH_PHRASES = [
    'itirazin iptali',
    'icra takibi',
    'borca itiraz',
    'menfi tespit',
    'konkordato',
    'iflasin ertelenmesi',
    'tasarrufun iptali',
    'hizmet tespiti',
    'hizmet tespit',
    'ise iade',
    'fazla mesai alacagi',
    'kidem tazminati',
    'ihbar tazminati',
    'is akdi feshi',
    'iscilik alacagi',
    'idari para cezasi',
    'idari islemin iptali',
    'tam yargi davasi',
    'yurutmenin durdurulmasi',
    'kamulastirma bedeli',
    'kamu ihale',
    'imar kanunu',
    'imar barisi',
    'gecici 16',
    '7143',
    'yapi kayit belgesi',
    'ruhsatsiz yapi',
    'yapi tatil tutanagi',
    'sit alani',
    'kacak elektrik',
    'kacak elektrik tuketimi',
    'usulsuz elektrik kullanimi',
    'usulsuz elektrik',
    'tespit tutanagi',
    'muhur kirma',
    'muhur fekki',
    'dagitim sirketi',
    'dagitim sirketi alacagi',
    'kayip kacak bedeli',
    'kayip kacak',
    'enerji piyasasi',
    'elektrik piyasasi',
    'tuketici hizmetleri yonetmeligi',
    'tuketici hizmetleri',
    'haksiz fiil sorumlulugu',
    'haksiz fiil',
    'ispat yuku',
    'alacakli lehine',
    'kasten oldurme',
    'uyusturucu madde',
    'haksiz tahrik',
    'gorevi kotuye kullanma',
    'epdk',
];

const LEGAL_CORE_PHRASE_SET = new Set([
    'itirazin iptali',
    'icra takibi',
    'borca itiraz',
    'menfi tespit',
    'konkordato',
    'iflasin ertelenmesi',
    'tasarrufun iptali',
    'hizmet tespiti',
    'hizmet tespit',
    'ise iade',
    'fazla mesai alacagi',
    'kidem tazminati',
    'ihbar tazminati',
    'is akdi feshi',
    'iscilik alacagi',
    'idari para cezasi',
    'idari islemin iptali',
    'tam yargi davasi',
    'yurutmenin durdurulmasi',
    'kamulastirma bedeli',
    'kamu ihale',
    'imar kanunu',
    'imar barisi',
    'gecici 16',
    '7143',
    'yapi kayit belgesi',
    'ruhsatsiz yapi',
    'yapi tatil tutanagi',
    'sit alani',
    'kacak elektrik',
    'kacak elektrik tuketimi',
    'usulsuz elektrik kullanimi',
    'usulsuz elektrik',
    'tespit tutanagi',
    'muhur kirma',
    'muhur fekki',
    'dagitim sirketi',
    'dagitim sirketi alacagi',
    'kayip kacak bedeli',
    'kayip kacak',
    'enerji piyasasi',
    'elektrik piyasasi',
    'tuketici hizmetleri yonetmeligi',
    'haksiz fiil sorumlulugu',
    'haksiz fiil',
    'ispat yuku',
    'alacakli lehine',
    'kasten oldurme',
    'uyusturucu madde',
    'haksiz tahrik',
    'gorevi kotuye kullanma',
    'epdk',
]);

const LEGAL_BROAD_PHRASE_SET = new Set(['idari para cezasi']);

const LEGAL_GENERIC_MATCH_TOKENS = new Set([
    'hukuki',
    'sonuclari',
    'uygulamasi',
    'gecerliligi',
    'gecerlilik',
    'davasi',
    'dava',
    'islemin',
    'iptali',
    'idari',
    'ceza',
    'cezasi',
    'para',
    'karar',
    'karari',
    'kararlari',
    'hakki',
    'kapsaminda',
    'kapsami',
    'itiraz',
    'itirazi',
    'tutanagi',
    'hukumleri',
]);

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));
const LEGAL_MIN_MATCH_SCORE = Math.max(
    35,
    Math.min(90, Number(process.env.LEGAL_MIN_MATCH_SCORE || 50))
);
const LEGAL_RELAXED_MATCH_SCORE = Math.max(
    30,
    Math.min(
        LEGAL_MIN_MATCH_SCORE,
        Number(
            process.env.LEGAL_RELAXED_MATCH_SCORE ||
            Math.max(35, LEGAL_MIN_MATCH_SCORE - 15)
        )
    )
);

// ─── Faz C: Query Parser — Hukuki Varlık Çıkarımı ──────────────────────────
// Sorgudan yapılandırılmış hukuki bilgi çıkarır: mahkeme, kanun, dava tipi, tarih, esas/karar no
const LEGAL_SYNONYM_MAP = {
    // C4: Eş anlamlı terim sözlüğü
    fesih: ['sozlesmenin sona ermesi', 'is akdinin feshi', 'feshin gecersizligi'],
    tahliye: ['kiralinanin bosaltilmasi', 'mecurun tahliyesi'],
    bosanma: ['evlilik birliginin sona ermesi', 'evliligin bitmesi'],
    tazminat: ['zarar tazmini', 'maddi tazminat', 'manevi tazminat'],
    'itirazin iptali': ['itirazin kaldirilmasi', 'borca itirazin iptali'],
    'ise iade': ['ise iade davasi', 'feshin gecersizligi'],
    'kidem tazminati': ['kidem ihbar tazminati', 'iscilik alacagi'],
    kamulaştirma: ['kamulaştirma bedeli', 'istimlak'],
    miras: ['miras taksimi', 'terekenin taksimi', 'veraset'],
    nafaka: ['yoksulluk nafakasi', 'istirak nafakasi', 'tedbir nafakasi'],
    uyusturucu: ['uyusturucu madde', 'uyusturucu ticareti', 'kullanmak amaciyla bulundurma'],
    hakaret: ['hakaret sucu', 'kisilik haklarina saldiri'],
    zimmet: ['zimmet sucu', 'gorevi kotuye kullanma'],
    imar: ['imar plani', 'imar barisi', 'yapi ruhsati'],
    'kacak yapi': ['ruhsatsiz yapi', 'imara aykiri yapi'],
    'idari islem': ['idari islemin iptali', 'idari yargi'],
};

const LEGAL_COURT_PATTERNS = [
    { pattern: /yarg[ıi]tay/i, type: 'yargitay', label: 'Yargıtay' },
    { pattern: /dan[ıi][sş]tay/i, type: 'danistay', label: 'Danıştay' },
    { pattern: /anayasa\s*mahkemesi/i, type: 'anayasa', label: 'Anayasa Mahkemesi' },
    { pattern: /b[oö]lge\s*adliye/i, type: 'istinaf', label: 'İstinaf (Bölge Adliye)' },
    { pattern: /b[oö]lge\s*idare/i, type: 'bolge-idare', label: 'Bölge İdare Mahkemesi' },
    { pattern: /asliye\s*hukuk/i, type: 'yerel-hukuk', label: 'Asliye Hukuk' },
    { pattern: /asliye\s*ceza/i, type: 'yerel-ceza', label: 'Asliye Ceza' },
    { pattern: /a[gğ][ıi]r\s*ceza/i, type: 'agir-ceza', label: 'Ağır Ceza' },
    { pattern: /[iİ]dare\s*mahkemesi/i, type: 'idare', label: 'İdare Mahkemesi' },
    { pattern: /i[sş]\s*mahkemesi/i, type: 'is-mahkemesi', label: 'İş Mahkemesi' },
    { pattern: /icra\s*hukuk/i, type: 'icra-hukuk', label: 'İcra Hukuk' },
    { pattern: /t[uü]ketici\s*mahkemesi/i, type: 'tuketici', label: 'Tüketici Mahkemesi' },
];

const LEGAL_CASE_TYPE_PATTERNS = [
    { pattern: /ise iade|i[sş]e iade/i, type: 'ise-iade', label: 'İşe İade' },
    { pattern: /itiraz[ıi]n iptali/i, type: 'itirazin-iptali', label: 'İtirazın İptali' },
    { pattern: /bosanma|bo[sş]anma/i, type: 'bosanma', label: 'Boşanma' },
    { pattern: /tahliye/i, type: 'tahliye', label: 'Tahliye' },
    { pattern: /kira.*tespit|tespit.*kira/i, type: 'kira-tespit', label: 'Kira Tespiti' },
    { pattern: /kamulaştırma|kamulastirma/i, type: 'kamulastirma', label: 'Kamulaştırma' },
    { pattern: /miras|veraset|tereke/i, type: 'miras', label: 'Miras' },
    { pattern: /uyusturucu|uyuşturucu/i, type: 'uyusturucu', label: 'Uyuşturucu' },
    { pattern: /dolandırıcılık|dolandiricilik/i, type: 'dolandiricilik', label: 'Dolandırıcılık' },
    { pattern: /tazminat/i, type: 'tazminat', label: 'Tazminat' },
    { pattern: /alacak/i, type: 'alacak', label: 'Alacak' },
    {
        pattern: /idari islem.*iptal|iptal.*idari/i,
        type: 'idari-iptal',
        label: 'İdari İşlem İptali',
    },
    { pattern: /kacak yapi|kaçak yapı|yikim|yıkım/i, type: 'imar-yikim', label: 'İmar/Yıkım' },
    { pattern: /nafaka/i, type: 'nafaka', label: 'Nafaka' },
    { pattern: /hakaret/i, type: 'hakaret', label: 'Hakaret' },
    { pattern: /hirsizlik|hırsızlık/i, type: 'hirsizlik', label: 'Hırsızlık' },
    { pattern: /yaralama/i, type: 'yaralama', label: 'Yaralama' },
    { pattern: /zimmet/i, type: 'zimmet', label: 'Zimmet' },
    { pattern: /icra.*takib|takib.*icra/i, type: 'icra-takip', label: 'İcra Takibi' },
    { pattern: /menfi tespit/i, type: 'menfi-tespit', label: 'Menfi Tespit' },
    { pattern: /istirdat/i, type: 'istirdat', label: 'İstirdat' },
    { pattern: /rekabet/i, type: 'rekabet', label: 'Rekabet' },
    { pattern: /is kazasi|iş kazası/i, type: 'is-kazasi', label: 'İş Kazası' },
];

// Kanun maddesi regex: "TCK 188", "TBK m.352", "İİK 67", "6098 sayılı kanun", "4857 s.K. m.20"
const KANUN_MADDESI_REGEX =
    /(?:TCK|TBK|TMK|HMK|CMK|İİK|IIK|BK|MK|AYM|KMK|TTK|İK|SVK|FSEK|KHK|KVKK)\s*(?:m(?:adde)?\.?\s*)?(\d+(?:\/\d+)?)/gi;
const KANUN_SAYILI_REGEX = /(\d{3,5})\s*say[ıi]l[ıi]\s*(?:kanun|yasa|k\.)/gi;
const ESAS_NO_REGEX = /(?:esas\s*(?:no|numaras[ıi])?\s*[:\s]*)?(\d{4})\s*[\/\-]\s*(\d+)/gi;
const KARAR_NO_REGEX = /karar\s*(?:no|numaras[ıi])?\s*[:\s]*(\d{4})\s*[\/\-]\s*(\d+)/gi;
const TARIH_REGEX = /(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/g;
const DAIRE_REGEX = /(\d{1,2})\.\s*(?:hukuk|ceza|idare|daire)/gi;

const parseLegalQuery = (query) => {
    const text = String(query || '');
    const normalized = normalizeForRouting(text);
    const result = {
        courts: [], // Tespit edilen mahkeme türleri
        caseTypes: [], // Tespit edilen dava tipleri
        kanunMaddeleri: [], // Kanun maddeleri (TCK 188, TBK m.352 vb.)
        kanunSayili: [], // Sayılı kanunlar (6098 sayılı kanun)
        esasNo: [], // Esas numaraları
        kararNo: [], // Karar numaraları
        tarihler: [], // Tarihler
        daireler: [], // Daire numaraları (1. Hukuk Dairesi vb.)
        synonymExpansions: [], // C4: Eş anlamlı genişletmeler
    };

    // Mahkeme türü tespiti
    for (const cp of LEGAL_COURT_PATTERNS) {
        if (cp.pattern.test(text)) {
            result.courts.push({ type: cp.type, label: cp.label });
        }
    }

    // Dava tipi tespiti
    for (const ct of LEGAL_CASE_TYPE_PATTERNS) {
        if (ct.pattern.test(text)) {
            result.caseTypes.push({ type: ct.type, label: ct.label });
        }
    }

    // Kanun maddeleri
    let match;
    while ((match = KANUN_MADDESI_REGEX.exec(text)) !== null) {
        result.kanunMaddeleri.push(match[0].trim());
    }
    while ((match = KANUN_SAYILI_REGEX.exec(text)) !== null) {
        result.kanunSayili.push(match[0].trim());
    }

    // Esas/Karar no
    while ((match = ESAS_NO_REGEX.exec(text)) !== null) {
        result.esasNo.push(`${match[1]}/${match[2]}`);
    }
    while ((match = KARAR_NO_REGEX.exec(text)) !== null) {
        result.kararNo.push(`${match[1]}/${match[2]}`);
    }

    // Tarihler
    while ((match = TARIH_REGEX.exec(text)) !== null) {
        result.tarihler.push(`${match[1]}.${match[2]}.${match[3]}`);
    }

    // Daireler
    while ((match = DAIRE_REGEX.exec(text)) !== null) {
        result.daireler.push(match[0].trim());
    }

    // C4: Eş anlamlı genişletme
    for (const [term, synonyms] of Object.entries(LEGAL_SYNONYM_MAP)) {
        if (normalized.includes(term)) {
            result.synonymExpansions.push({ term, synonyms });
        }
    }

    return result;
};

// ─── Faz C: Sonuç çeşitlendirme (diversification) ──────────────────────────
// Aynı daireden max N karar, farklı daire/mahkemelerden daha fazla temsil
const diversifyResults = (results, maxPerDaire = 3) => {
    if (!Array.isArray(results) || results.length <= maxPerDaire) return results;

    const daireCount = new Map(); // daire -> count
    const diversified = [];
    const deferred = [];

    for (const item of results) {
        const daire = String(item?.daire || item?.title || 'bilinmeyen')
            .trim()
            .toLowerCase();
        const count = daireCount.get(daire) || 0;

        if (count < maxPerDaire) {
            diversified.push(item);
            daireCount.set(daire, count + 1);
        } else {
            deferred.push(item);
        }
    }

    // Ertelenen sonuçları sona ekle (aynı daireden fazla olanlar)
    return [...diversified, ...deferred];
};

// ─── Faz C: Field-aware scoring ─────────────────────────────────────────────
// Başlık/daire eşleşmesi > tam metin eşleşmesi, kanun maddesi eşleşmesi güçlü sinyal
const computeFieldAwareBoost = (item, parsedQuery) => {
    let boost = 0;
    const daire = normalizeForRouting(item?.daire || '');
    const title = normalizeForRouting(item?.title || '');
    const esasNo = String(item?.esasNo || '');
    const kararNo = String(item?.kararNo || '');
    const ozet = normalizeForRouting(item?.ozet || item?.snippet || '');

    // Daire eşleşmesi: sorguda belirtilen daire ile sonucun dairesi uyuşuyorsa
    for (const d of parsedQuery.daireler) {
        const normalizedD = normalizeForRouting(d);
        if (daire.includes(normalizedD)) boost += 12;
    }

    // Mahkeme türü eşleşmesi
    for (const court of parsedQuery.courts) {
        const courtNorm = normalizeForRouting(court.label);
        if (daire.includes(courtNorm) || title.includes(courtNorm)) boost += 8;
    }

    // Kanun maddesi eşleşmesi — güçlü sinyal
    for (const kanun of parsedQuery.kanunMaddeleri) {
        const kanunNorm = normalizeForRouting(kanun);
        if (ozet.includes(kanunNorm) || title.includes(kanunNorm)) boost += 15;
    }
    for (const sayili of parsedQuery.kanunSayili) {
        const sayiliNorm = normalizeForRouting(sayili);
        if (ozet.includes(sayiliNorm)) boost += 10;
    }

    // Esas/Karar no tam eşleşmesi — çok güçlü sinyal
    for (const esas of parsedQuery.esasNo) {
        if (esasNo.includes(esas)) boost += 25;
    }
    for (const karar of parsedQuery.kararNo) {
        if (kararNo.includes(karar)) boost += 25;
    }

    // Dava tipi eşleşmesi: başlık veya özetle
    for (const ct of parsedQuery.caseTypes) {
        const ctNorm = normalizeForRouting(ct.label);
        if (title.includes(ctNorm)) boost += 10;
        else if (ozet.includes(ctNorm)) boost += 5;
    }

    return Math.min(30, boost); // Max 30 puan boost
};

// ─── Faz C: Açıklanabilir sonuç — matchReason ──────────────────────────────
const buildMatchReason = (item, parsedQuery, scoringSignals = {}) => {
    const reasons = [];
    const daire = normalizeForRouting(item?.daire || '');
    const title = normalizeForRouting(item?.title || '');
    const ozet = normalizeForRouting(item?.ozet || item?.snippet || '');

    // Hangi dava tipi eşleşti
    for (const ct of parsedQuery.caseTypes) {
        const ctNorm = normalizeForRouting(ct.label);
        if (title.includes(ctNorm) || ozet.includes(ctNorm)) {
            reasons.push(`Dava tipi: ${ct.label}`);
        }
    }

    // Hangi kanun maddesi eşleşti
    for (const kanun of parsedQuery.kanunMaddeleri) {
        if (
            ozet.includes(normalizeForRouting(kanun)) ||
            title.includes(normalizeForRouting(kanun))
        ) {
            reasons.push(`Kanun maddesi: ${kanun}`);
        }
    }

    // Hangi mahkeme eşleşti
    for (const court of parsedQuery.courts) {
        if (daire.includes(normalizeForRouting(court.label))) {
            reasons.push(`Mahkeme: ${court.label}`);
        }
    }

    // Eş anlamlı terim eşleşmesi
    for (const syn of parsedQuery.synonymExpansions) {
        for (const s of syn.synonyms) {
            if (ozet.includes(normalizeForRouting(s))) {
                reasons.push(`Eş anlamlı: "${syn.term}" → "${s}"`);
                break;
            }
        }
    }

    // Genel skor açıklaması
    const score = Number(item?.relevanceScore || 0);
    if (score >= 80) reasons.push('Yüksek uyum skoru');
    else if (score >= 60) reasons.push('Orta uyum skoru');

    return reasons.length > 0 ? reasons.join('; ') : 'Anahtar kelime eşleşmesi';
};
const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsWholeTerm = (haystack = '', term = '') => {
    const token = String(term || '').trim();
    if (!token) return false;
    return new RegExp(`(?:^|\\s)${escapeRegex(token)}(?=\\s|$)`).test(String(haystack || ''));
};

const extractKeywordSignals = (keyword = '') => {
    const raw = String(keyword || '')
        .replace(/\s+/g, ' ')
        .trim();
    const normalized = normalizeForRouting(raw);
    if (!normalized) {
        return {
            tokens: [],
            anchorTokens: [],
            phrases: [],
            phraseKeys: [],
            corePhraseKeys: [],
            anchorPhraseKeys: [],
        };
    }

    const tokens = Array.from(
        new Set(
            normalized
                .split(/\s+/)
                .filter((token) => token.length >= 3 && !LEGAL_QUERY_STOPWORDS.has(token))
                .slice(0, 20)
        )
    );

    const phraseCandidates = [];
    for (const phrase of LEGAL_MATCH_PHRASES) {
        if (normalized.includes(phrase)) phraseCandidates.push(phrase);
    }

    const quoted = [
        ...(raw.match(/"([^"]{3,80})"/g) || []),
        ...(raw.match(/'([^']{3,80})'/g) || []),
    ]
        .map((segment) => segment.replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
    phraseCandidates.push(...quoted);

    const numericAnchors = (raw.match(/\b\d{2,4}\b/g) || []).slice(0, 4);
    tokens.push(...numericAnchors);

    const uniqPhrases = Array.from(
        new Set(phraseCandidates.map((item) => String(item || '').trim()).filter(Boolean))
    );
    const phraseKeys = uniqPhrases.map((phrase) => normalizeForRouting(phrase)).filter(Boolean);
    const corePhraseKeys = phraseKeys.filter((phrase) => LEGAL_CORE_PHRASE_SET.has(phrase));
    const anchorTokens = tokens.filter(
        (token) => token.length >= 4 && !LEGAL_GENERIC_MATCH_TOKENS.has(token)
    );
    const anchorPhraseKeys = phraseKeys.filter((phrase) => !LEGAL_BROAD_PHRASE_SET.has(phrase));

    return {
        tokens: Array.from(new Set(tokens)),
        anchorTokens: Array.from(new Set(anchorTokens)),
        phrases: uniqPhrases,
        phraseKeys,
        corePhraseKeys,
        anchorPhraseKeys,
    };
};

const scoreAndFilterResultsByKeyword = (results = [], keyword = '') => {
    if (!Array.isArray(results) || results.length === 0) {
        return { results: [], filteredOutCount: 0, scoredResults: [] };
    }

    const signals = extractKeywordSignals(keyword);
    const hasSignals = signals.tokens.length > 0 || signals.phraseKeys.length > 0;
    const hasCorePhrases = signals.corePhraseKeys.length > 0;
    const requiredCorePhraseHits = hasCorePhrases
        ? signals.corePhraseKeys.length >= 3
            ? 2
            : 1
        : 0;
    const hasAnchorSignals = signals.anchorTokens.length > 0 || signals.anchorPhraseKeys.length > 0;
    const minTokenHits = hasCorePhrases ? 2 : signals.tokens.length >= 6 ? 2 : 1;
    const minAnchorTokenHits =
        signals.anchorTokens.length >= 4 ? 2 : signals.anchorTokens.length > 0 ? 1 : 0;
    const minScore = LEGAL_MIN_MATCH_SCORE;
    const metadataOnlyMode = !results.some((item) => {
        const ozetLength = String(item?.ozet || item?.snippet || '').trim().length;
        return ozetLength >= 40;
    });

    const scored = results.map((result) => {
        const haystack = normalizeForRouting(
            [
                result?.title || '',
                result?.mahkeme || '',
                result?.daire || '',
                result?.ozet || '',
                result?.esasNo || '',
                result?.kararNo || '',
                result?.tarih || '',
            ].join(' ')
        );

        const tokenHitCount = signals.tokens.filter((token) =>
            containsWholeTerm(haystack, token)
        ).length;
        const anchorTokenHitCount = signals.anchorTokens.filter((token) =>
            containsWholeTerm(haystack, token)
        ).length;
        const phraseHitCount = signals.phraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(haystack, phrase)
        ).length;
        const corePhraseHitCount = signals.corePhraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(haystack, phrase)
        ).length;
        const anchorPhraseHitCount = signals.anchorPhraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(haystack, phrase)
        ).length;
        const tokenCoverage = signals.tokens.length > 0 ? tokenHitCount / signals.tokens.length : 0;
        const phraseCoverage =
            signals.phraseKeys.length > 0 ? phraseHitCount / signals.phraseKeys.length : 0;
        const anchorTokenCoverage =
            signals.anchorTokens.length > 0 ? anchorTokenHitCount / signals.anchorTokens.length : 0;
        const upstreamScore = Number(result?.relevanceScore);

        let computedScore = tokenCoverage * 68 + phraseCoverage * 22;
        if (tokenHitCount >= 2) computedScore += 8;
        if (tokenHitCount >= 3) computedScore += 4;
        if (anchorTokenCoverage > 0) computedScore += anchorTokenCoverage * 12;
        if (anchorTokenHitCount >= 2) computedScore += 8;
        if (phraseHitCount > 0) computedScore += 10;
        if (corePhraseHitCount > 0) computedScore += 12;
        if (anchorPhraseHitCount > 0) computedScore += 10;

        if (
            metadataOnlyMode &&
            tokenHitCount === 0 &&
            phraseHitCount === 0 &&
            corePhraseHitCount === 0
        ) {
            computedScore = 0;
        }

        const finalScore = clampScore(computedScore);
        const relaxedCoreFallback =
            hasCorePhrases &&
            corePhraseHitCount === 0 &&
            anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1) &&
            tokenHitCount >= Math.max(3, minTokenHits + 1);
        const corePhraseRequirementSatisfied =
            !hasCorePhrases || corePhraseHitCount >= requiredCorePhraseHits || relaxedCoreFallback;
        const anchorTokenFallbackSatisfied =
            anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1);
        const anchorRequirementSatisfied =
            signals.anchorPhraseKeys.length > 0
                ? anchorPhraseHitCount > 0 || anchorTokenFallbackSatisfied
                : !hasAnchorSignals || anchorTokenHitCount >= minAnchorTokenHits;
        const metadataOnlyMatch = phraseHitCount > 0 || tokenHitCount >= minTokenHits;
        const standardMatch =
            phraseHitCount > 0 || tokenHitCount >= minTokenHits || finalScore >= minScore;
        // In metadata-only mode (no özet/snippet), be very lenient —
        // let content-based re-ranking do the real filtering with full text.
        const isMatch =
            !hasSignals ||
            metadataOnlyMode ||
            (corePhraseRequirementSatisfied && anchorRequirementSatisfied && standardMatch);

        return {
            ...result,
            relevanceScore: finalScore,
            _tokenHitCount: tokenHitCount,
            _anchorTokenHitCount: anchorTokenHitCount,
            _phraseHitCount: phraseHitCount,
            _corePhraseHitCount: corePhraseHitCount,
            _anchorPhraseHitCount: anchorPhraseHitCount,
            _upstreamScore: Number.isFinite(upstreamScore) ? upstreamScore : 0,
            _isMatch: isMatch,
        };
    });

    const scoredSorted = scored.sort((a, b) => {
        const diff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
        if (diff !== 0) return diff;
        return (b._upstreamScore || 0) - (a._upstreamScore || 0);
    });

    const matched = scoredSorted
        .filter((item) => item._isMatch)
        .map(
            ({
                _tokenHitCount,
                _anchorTokenHitCount,
                _phraseHitCount,
                _corePhraseHitCount,
                _anchorPhraseHitCount,
                _upstreamScore,
                _isMatch,
                ...rest
            }) => rest
        );

    const ranked = scoredSorted.map(
        ({
            _tokenHitCount,
            _anchorTokenHitCount,
            _phraseHitCount,
            _corePhraseHitCount,
            _anchorPhraseHitCount,
            _upstreamScore,
            _isMatch,
            ...rest
        }) => rest
    );

    return {
        results: matched,
        filteredOutCount: Math.max(0, scoredSorted.length - matched.length),
        scoredResults: ranked,
    };
};

const getLegalDecisionDocumentId = (result = {}) =>
    String(result?.documentId || result?.id || '').trim();

const dedupeLegalResults = (items = []) => {
    const deduped = [];
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== 'object') continue;
        const key =
            getLegalDecisionDocumentId(item) ||
            `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
    }
    return deduped;
};

const buildLegalResultBuckets = ({
    strongResults = [],
    candidateResults = [],
    targetCount = LEGAL_RELATED_RESULT_TARGET,
}) => {
    const strong = dedupeLegalResults(strongResults).map((item) => ({
        ...item,
        matchTier: item?.matchTier || 'strong',
    }));
    const strongIds = new Set(
        strong.map(
            (item) =>
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`
        )
    );
    const relatedPool = dedupeLegalResults(candidateResults)
        .filter((item) => {
            const key =
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
            return key && !strongIds.has(key);
        })
        .sort((a, b) => Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0));
    const needed = Math.max(0, Number(targetCount) - strong.length);
    const related = relatedPool.slice(0, needed).map((item) => ({
        ...item,
        matchTier: item?.matchTier || 'related',
    }));
    return {
        strong,
        related,
        combined: [...strong, ...related],
    };
};

const rerankResultsByDecisionContent = async (results = [], keyword = '') => {
    if (!Array.isArray(results) || results.length === 0) {
        return {
            applied: false,
            results: [],
            candidateCount: 0,
            fetchedCount: 0,
            matchedCount: 0,
            filteredOutCount: 0,
            fetchErrorCount: 0,
            emptyContentCount: 0,
        };
    }

    const signals = extractKeywordSignals(keyword);
    const hasSignals = signals.tokens.length > 0 || signals.phraseKeys.length > 0;
    if (!hasSignals) {
        return {
            applied: false,
            results: [],
            candidateCount: 0,
            fetchedCount: 0,
            matchedCount: 0,
            filteredOutCount: 0,
            fetchErrorCount: 0,
            emptyContentCount: 0,
        };
    }

    const uniqueCandidates = [];
    const seenIds = new Set();
    for (const item of results) {
        const documentId = getLegalDecisionDocumentId(item);
        if (!documentId || seenIds.has(documentId)) continue;
        seenIds.add(documentId);
        uniqueCandidates.push(item);
        if (uniqueCandidates.length >= LEGAL_CONTENT_RERANK_LIMIT) break;
    }

    if (uniqueCandidates.length === 0) {
        return {
            applied: false,
            results: [],
            candidateCount: 0,
            fetchedCount: 0,
            matchedCount: 0,
            filteredOutCount: 0,
            fetchErrorCount: 0,
            emptyContentCount: 0,
        };
    }

    const hasCorePhrases = signals.corePhraseKeys.length > 0;
    const requiredCorePhraseHits = hasCorePhrases
        ? signals.corePhraseKeys.length >= 3
            ? 2
            : 1
        : 0;
    const hasAnchorSignals = signals.anchorTokens.length > 0 || signals.anchorPhraseKeys.length > 0;
    const minTokenHits = hasCorePhrases ? 2 : signals.tokens.length >= 6 ? 2 : 1;
    const minAnchorTokenHits =
        signals.anchorTokens.length >= 4 ? 2 : signals.anchorTokens.length > 0 ? 1 : 0;
    const minScore = LEGAL_MIN_MATCH_SCORE;

    // Progressive fetch: batch boyutu (Bedesten rate limit 429'ı aşmamak için 4 ile sınırlandırıldı)
    // Cache'de veri yoksa hepsi çekilir. Yeterli iyi sonuç bulunduğunda erken durdurulur.
    const BATCH_SIZE = 4;
    const PROGRESSIVE_GOOD_RESULT_TARGET = 10;
    const settled = [];
    let progressiveGoodCount = 0;
    let stoppedByRateLimit = false;

    for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
        const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (result) => {
                const documentId = getLegalDecisionDocumentId(result);
                if (!documentId) {
                    return {
                        ok: false,
                        documentId,
                        result,
                        reason: 'missing-document-id',
                    };
                }
                try {
                    // Faz B: UYAP Emsal kararları için MCP'den tam metin çek
                    // Bedesten kararları için mevcut Bedesten API'yi kullan
                    // Cache entegrasyonu: getBedestenDocumentContent zaten cache kontrolü yapıyor
                    const isEmsalSource = result?._source === 'emsal-uyap';
                    let content = '';
                    if (isEmsalSource && documentId) {
                        try {
                            const emsalDoc = await getEmsalDocumentViaMcp(documentId);
                            content = String(emsalDoc?.content || '').trim();
                        } catch {
                            // UYAP tam metin çekilemezse Bedesten'den de dene
                            const bedestenDoc = await getBedestenDocumentContent(documentId);
                            content = String(bedestenDoc?.content || '').trim();
                        }
                    } else {
                        const bedestenDoc = await getBedestenDocumentContent(documentId);
                        content = String(bedestenDoc?.content || '').trim();
                    }
                    return {
                        ok: true,
                        documentId,
                        result,
                        content,
                    };
                } catch (error) {
                    return {
                        ok: false,
                        documentId,
                        result,
                        reason: error?.message || 'content-fetch-failed',
                    };
                }
            })
        );

        settled.push(...batchResults);

        // Hata alanları say, eger son batch'teki hatalarin cogu 429 (rate limit) ise erken çık (devamı da muhtemelen 429 verecek)
        const fetchErrors = batchResults.filter((r) => !r.ok);
        if (fetchErrors.length > 0 && fetchErrors.some(r => r.reason.includes('429'))) {
            stoppedByRateLimit = true;
            break; // Too many requests yediksek daha fazla saldırma!
        }

        // Progressive good count — erken durdurma için
        progressiveGoodCount += batchResults.filter(
            (r) => r?.ok && String(r.content || '').length >= 100
        ).length;

        // İlk batch'ten (high-priority) sonra yeterli iyi sonuç varsa dur
        if (i >= BATCH_SIZE && progressiveGoodCount >= PROGRESSIVE_GOOD_RESULT_TARGET) break;

        if (i + BATCH_SIZE < uniqueCandidates.length) {
            // Bedesten rate-limit koruması (429) için: Pacing'i güvenli (800ms) tut
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
    }

    let fetchedCount = 0;
    let matchedCount = 0;
    let fetchErrorCount = 0;
    let emptyContentCount = 0;
    const matched = [];

    for (const item of settled) {
        if (!item?.ok) {
            fetchErrorCount += 1;
            continue;
        }

        fetchedCount += 1;
        const normalizedContent = normalizeForRouting(item.content || '');
        if (!normalizedContent) {
            emptyContentCount += 1;
        }
        const contentHaystack = normalizeForRouting(
            [
                item.content || '',
                item?.result?.title || '',
                item?.result?.mahkeme || '',
                item?.result?.daire || '',
                item?.result?.ozet || '',
                item?.result?.snippet || '',
                item?.result?.esasNo || '',
                item?.result?.kararNo || '',
            ].join(' ')
        );
        if (!contentHaystack) continue;

        const tokenHitCount = signals.tokens.filter((token) =>
            containsWholeTerm(contentHaystack, token)
        ).length;
        const anchorTokenHitCount = signals.anchorTokens.filter((token) =>
            containsWholeTerm(contentHaystack, token)
        ).length;
        const phraseHitCount = signals.phraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(contentHaystack, phrase)
        ).length;
        const corePhraseHitCount = signals.corePhraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(contentHaystack, phrase)
        ).length;
        const anchorPhraseHitCount = signals.anchorPhraseKeys.filter(
            (phrase) => phrase && containsWholeTerm(contentHaystack, phrase)
        ).length;
        const tokenCoverage = signals.tokens.length > 0 ? tokenHitCount / signals.tokens.length : 0;
        const phraseCoverage =
            signals.phraseKeys.length > 0 ? phraseHitCount / signals.phraseKeys.length : 0;
        const anchorTokenCoverage =
            signals.anchorTokens.length > 0 ? anchorTokenHitCount / signals.anchorTokens.length : 0;

        let contentScore = tokenCoverage * 72 + phraseCoverage * 24;
        if (tokenHitCount >= 2) contentScore += 8;
        if (tokenHitCount >= 3) contentScore += 5;
        if (anchorTokenCoverage > 0) contentScore += anchorTokenCoverage * 14;
        if (anchorTokenHitCount >= 2) contentScore += 10;
        if (phraseHitCount > 0) contentScore += 12;
        if (corePhraseHitCount > 0) contentScore += 14;
        if (anchorPhraseHitCount > 0) contentScore += 12;

        const normalizedContentScore = clampScore(contentScore);
        const relaxedCoreFallback =
            hasCorePhrases &&
            corePhraseHitCount === 0 &&
            anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1) &&
            tokenHitCount >= Math.max(4, minTokenHits + 1);
        const corePhraseRequirementSatisfied =
            !hasCorePhrases || corePhraseHitCount >= requiredCorePhraseHits || relaxedCoreFallback;
        const anchorTokenFallbackSatisfied =
            anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1);
        const anchorRequirementSatisfied =
            signals.anchorPhraseKeys.length > 0
                ? anchorPhraseHitCount > 0 || anchorTokenFallbackSatisfied
                : !hasAnchorSignals || anchorTokenHitCount >= minAnchorTokenHits;
        const hasContentHit = phraseHitCount > 0 || tokenHitCount >= minTokenHits;
        // Fusion score yaklaşımı: hard cutoff yerine coverage'ı score bileşeni olarak kullan.
        // tokenCoverage düşük olan sonuçlar elenmiyor, bunun yerine düşük skor alıyor.
        // Böylece farklı lafızla yazılmış ama semantik olarak doğru kararlar korunuyor.
        let fusionScore = normalizedContentScore;
        // Coverage bonus: yüksek coverage'a ek puan
        if (tokenCoverage >= 0.7) fusionScore += 15;
        else if (tokenCoverage >= 0.5) fusionScore += 8;
        else if (tokenCoverage >= 0.3) fusionScore += 3;
        // Phrase hit bonus
        if (phraseHitCount >= 2) fusionScore += 10;
        else if (phraseHitCount >= 1) fusionScore += 5;
        // Core phrase bonus — hukuki terim eşleşmesi güçlü sinyal
        if (corePhraseHitCount >= 2) fusionScore += 12;
        else if (corePhraseHitCount >= 1) fusionScore += 6;
        const normalizedFusionScore = clampScore(fusionScore);

        // Yumuşak eşik: tamamen ilgisiz sonuçları ele ama düşük coverage'lı sonuçları koru.
        // Eski hard cutoff: tokenCoverage >= 0.7 || (phraseHitCount >= 2 && tokenCoverage >= 0.5)
        // Yeni: fusion score >= 25 veya en az 1 core phrase hit veya en az 1 anchor token hit
        const isMatch =
            normalizedFusionScore >= 25 ||
            corePhraseHitCount > 0 ||
            anchorPhraseHitCount > 0 ||
            (anchorTokenHitCount >= 2 && tokenHitCount >= 2);

        if (!isMatch) continue;

        matchedCount += 1;
        const baseRelevanceScore = Number(item?.result?.relevanceScore) || 0;

        let snippetText = item.result?.ozet || item.result?.snippet;
        if (!snippetText && item.content) {
            // Get first ~600 chars as snippet
            const cleanContent = item.content.replace(/\s+/g, ' ').trim();
            snippetText =
                cleanContent.length > 600 ? cleanContent.substring(0, 600) + '...' : cleanContent;
        }

        matched.push({
            ...item.result,
            relevanceScore: clampScore(Math.max(baseRelevanceScore, normalizedFusionScore)),
            ozet:
                snippetText ||
                `Anahtar kelime eslesmesi bulundu (metin skoru: ${normalizedFusionScore}).`,
            snippet:
                item.content ||
                snippetText ||
                `Anahtar kelime eslesmesi bulundu (metin skoru: ${normalizedFusionScore}).`,
        });
    }

    matched.sort((a, b) => Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0));

    return {
        applied: true,
        results: matched,
        candidateCount: uniqueCandidates.length,
        fetchedCount,
        matchedCount,
        filteredOutCount: Math.max(0, uniqueCandidates.length - matchedCount),
        fetchErrorCount,
        emptyContentCount,
    };
};

const pickLegalFallbackResults = ({
    scoring = null,
    contentCandidates = [],
    contentRerank = null,
    limit = LEGAL_RESULT_RETURN_LIMIT,
}) => {
    const safeLimit = Math.max(1, Number(limit) || LEGAL_RESULT_RETURN_LIMIT);
    const strictMatches = Array.isArray(scoring?.results) ? scoring.results : [];
    if (strictMatches.length > 0) {
        return {
            results: strictMatches.slice(0, safeLimit),
            mode: 'strict-scoring',
        };
    }

    const scoredResults = Array.isArray(scoring?.scoredResults) ? scoring.scoredResults : [];
    const strictThresholdMatches = scoredResults.filter(
        (item) => Number(item?.relevanceScore || 0) >= LEGAL_MIN_MATCH_SCORE
    );
    if (strictThresholdMatches.length > 0) {
        return {
            results: strictThresholdMatches.slice(0, safeLimit),
            mode: 'strict-threshold',
        };
    }

    const relaxedThresholdMatches = scoredResults.filter(
        (item) => Number(item?.relevanceScore || 0) >= LEGAL_RELAXED_MATCH_SCORE
    );
    if (relaxedThresholdMatches.length > 0) {
        return {
            results: relaxedThresholdMatches.slice(0, safeLimit),
            mode: 'relaxed-threshold',
        };
    }

    const safeCandidates = Array.isArray(contentCandidates) ? contentCandidates.filter(Boolean) : [];
    const hasFetchProblems =
        Boolean(contentRerank?.applied) && Number(contentRerank?.fetchErrorCount || 0) > 0;
    if (hasFetchProblems && safeCandidates.length > 0) {
        return {
            results: safeCandidates.slice(0, safeLimit),
            mode: 'content-candidates',
        };
    }

    return {
        results: [],
        mode: 'empty',
    };
};

const runPhraseFallbackSearch = async ({ keyword = '', source = 'all', filters = {} }) => {
    const normalizedKeyword = normalizeForRouting(keyword);
    const signals = extractKeywordSignals(keyword);
    const directKnownPhrases = LEGAL_MATCH_PHRASES.filter((phrase) =>
        normalizedKeyword.includes(phrase)
    ).slice(0, 6);
    const compactTokens = normalizedKeyword
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !LEGAL_QUERY_STOPWORDS.has(token))
        .slice(0, 16);
    const ngramCandidates = [];
    for (let idx = 0; idx < compactTokens.length - 1; idx += 1) {
        ngramCandidates.push(`${compactTokens[idx]} ${compactTokens[idx + 1]}`);
        if (idx + 2 < compactTokens.length) {
            ngramCandidates.push(
                `${compactTokens[idx]} ${compactTokens[idx + 1]} ${compactTokens[idx + 2]}`
            );
        }
    }

    const phraseCandidates = Array.from(
        new Set([
            ...(Array.isArray(signals.anchorPhraseKeys) ? signals.anchorPhraseKeys : []),
            ...(Array.isArray(signals.corePhraseKeys) ? signals.corePhraseKeys : []),
            ...directKnownPhrases,
            ...ngramCandidates,
        ])
    )
        .filter(
            (phrase) =>
                String(phrase || '')
                    .trim()
                    .split(/\s+/).length >= 2
        )
        .slice(0, 6);

    if (phraseCandidates.length < 2) {
        return {
            applied: false,
            results: [],
            phraseCandidates: [],
        };
    }

    const collected = [];
    const seen = new Set();
    const addCollected = (items = []) => {
        for (const item of Array.isArray(items) ? items : []) {
            const key =
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            collected.push(item);
        }
    };

    for (const phrase of phraseCandidates) {
        try {
            const phraseResults = await searchBedestenAPI(phrase, source, filters);
            if (!Array.isArray(phraseResults) || phraseResults.length === 0) continue;

            const phraseRerank = await rerankResultsByDecisionContent(phraseResults, phrase);
            if (
                phraseRerank.applied &&
                Array.isArray(phraseRerank.results) &&
                phraseRerank.results.length > 0
            ) {
                addCollected(phraseRerank.results.slice(0, 6));
                continue;
            }

            const phraseScoring = scoreAndFilterResultsByKeyword(phraseResults, phrase);
            if (Array.isArray(phraseScoring.results) && phraseScoring.results.length > 0) {
                addCollected(phraseScoring.results.slice(0, 6));
            }
        } catch {
            // ignore phrase-level errors and continue with other candidates
        }
    }
    let finalResults = collected;
    try {
        const fullKeywordScoring = scoreAndFilterResultsByKeyword(collected, keyword);
        // Rescore collected results based on the FULL keyword, not just the tiny phrase.
        if (Array.isArray(fullKeywordScoring.results) && fullKeywordScoring.results.length > 0) {
            finalResults = fullKeywordScoring.results;
        } else if (
            Array.isArray(fullKeywordScoring.scoredResults) &&
            fullKeywordScoring.scoredResults.length > 0
        ) {
            finalResults = fullKeywordScoring.scoredResults.filter(
                (item) => Number(item?.relevanceScore || 0) >= LEGAL_RELAXED_MATCH_SCORE
            );
        }
    } catch (e) {
        console.error('Fallback rescoring error:', e);
    }

    finalResults.sort((a, b) => Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0));

    return {
        applied: true,
        results: finalResults.slice(0, LEGAL_RESULT_RETURN_LIMIT),
        phraseCandidates,
    };
};

const semanticRerankWithGemini = async ({ candidates = [], keyword = '' }) => {
    if (!USE_GEMINI_SEMANTIC_RERANK || !GEMINI_API_KEY) {
        return { applied: false, results: [] };
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return { applied: false, results: [] };
    }

    const uniq = [];
    const seen = new Set();
    for (const item of candidates) {
        const key =
            getLegalDecisionDocumentId(item) ||
            `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniq.push(item);
        if (uniq.length >= LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT) break;
    }
    if (uniq.length === 0) {
        return { applied: false, results: [] };
    }

    const promptRows = uniq
        .map((item, index) => {
            const key = getLegalDecisionDocumentId(item) || `cand-${index + 1}`;
            const preview = String(item?.snippet || item?.ozet || '')
                .replace(/\s+/g, ' ')
                .slice(0, 800);
            return `--- Aday ${index + 1} (id=${key}) ---\nMahkeme: ${item?.title || ''}\nDaire: ${item?.daire || ''}\nEsas: ${item?.esasNo || ''} | Karar: ${item?.kararNo || ''} | Tarih: ${item?.tarih || ''}\nİçerik: ${preview}`;
        })
        .join('\n\n');

    const prompt = [
        'Asagidaki Turkce hukuk karar adaylarini verilen sorguya gore anlamsal olarak puanla.',
        'Kurallar:',
        '- Sadece JSON dondur.',
        '- JSON array formati: [{"id":"...","score":0-100}]',
        '- Sorguyla ilgisiz adaylara dusuk skor ver (0-30).',
        '- En ilgili adaylara yuksek skor ver (70-100).',
        'Puanlama Kriterleri:',
        '1. Hukuki konu eslesmesi (%40 agirlik)',
        '2. Kanun maddesi / kavram ortusumesi (%30 agirlik)',
        '3. Olay benzerligi (%20 agirlik)',
        '4. Guncellik / emsal degeri (%10 agirlik)',
        '',
        `Sorgu: ${keyword}`,
        '',
        'Adaylar:',
        promptRows,
    ].join('\n');

    try {
        const response = await generateContentWithRetry(
            {
                model: MODEL_NAME,
                contents: prompt,
                config: { temperature: 0.1 },
            },
            { maxRetries: 0, timeoutMs: Math.max(9000, LEGAL_ROUTER_TIMEOUT_MS) }
        );

        const parsed = maybeExtractJson(response?.text || '');
        const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.results)
                ? parsed.results
                : [];
        if (!Array.isArray(list) || list.length === 0) {
            return { applied: true, results: [] };
        }

        const scoreMap = new Map();
        for (const row of list) {
            const id = String(row?.id || '').trim();
            const scoreRaw = Number(row?.score);
            if (!id || !Number.isFinite(scoreRaw)) continue;
            scoreMap.set(id, clampScore(scoreRaw));
        }

        // Faz B: Weighted fusion — lexical (mevcut skor) + semantic (Gemini) birleşimi
        // Ağırlıklar: semantic %60, lexical %40 — semantic rerank en büyük kalite sıçramasını sağlar
        const SEMANTIC_WEIGHT = 0.6;
        const LEXICAL_WEIGHT = 0.4;

        const ranked = uniq
            .map((item, index) => {
                const id = getLegalDecisionDocumentId(item) || `cand-${index + 1}`;
                const semanticScore = Number(scoreMap.get(id) || 0);
                const lexicalScore = Number(item?.relevanceScore || 0);
                // Weighted fusion: her iki sinyali birleştir
                const fusedScore = clampScore(
                    semanticScore * SEMANTIC_WEIGHT + lexicalScore * LEXICAL_WEIGHT
                );
                return {
                    ...item,
                    relevanceScore: fusedScore,
                    _semanticScore: semanticScore,
                    _lexicalScore: lexicalScore,
                };
            })
            .filter(
                (item) =>
                    Number(item._semanticScore || 0) >= 30 || Number(item._lexicalScore || 0) >= 50
            )
            .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0))
            .map(({ _semanticScore, _lexicalScore, ...rest }) => rest);

        return {
            applied: true,
            results: ranked.slice(0, LEGAL_RESULT_RETURN_LIMIT),
        };
    } catch {
        return { applied: false, results: [] };
    }
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

    // --- Danistay sinyalleri: idari yargi alani ---
    addSignals(
        'danistay',
        [
            // Imar / yapi (idari islem)
            'imar',
            '3194',
            'ruhsat',
            'ruhsatsiz',
            'kacak yapi',
            'yikim karari',
            'encumen',
            'yapi tatil',
            'imar barisi',
            'yapi kayit belgesi',
            'gecici 16',
            // Idari yargi terimleri
            'idari yargi',
            'idare mahkemesi',
            'tam yargi',
            'tam yargi davasi',
            'iptal davasi',
            'idari islemin iptali',
            'yurutmenin durdurulmasi',
            'kamulastirma bedeli',
            'bolge idare',
            'vergi mahkemesi',
            'belediye',
            'idari para cezasi',
            // Kamu ihale
            'kamu ihale',
            'kik',
            'ihale iptal',
            // Elektrik / EPDK / enerji -> idari yargi
            'epdk',
            'tedas',
            'kacak elektrik',
            'elektrik piyasasi',
            'kayip kacak',
            'enerji piyasasi',
            'tespit tutanagi elektrik',
            'dagitim lisansi',
            'elektrik abonelik',
            // Vergi / kamu personeli
            'vergi inceleme',
            'vergi cezasi',
            'disiplin cezasi',
            'gumruk',
        ],
        1.35
    );

    // NOT: 'kacak' tek basina sinyal degil; 'kacak yapi' ve 'kacak elektrik'
    // olarak ayri ayri yukarida tanimlandigi icin dogru baglamda calismaktadir.

    // --- Yargitay sinyalleri: ozel hukuk ve ceza ---
    addSignals(
        'yargitay',
        [
            // Kanun kodlari
            'tck',
            'cmk',
            'hmk',
            'tbk',
            'tmk',
            'iik',
            'ttk',
            // Icra / alacak
            'kambiyo',
            'icra takibi',
            'icra iflas',
            'borca itiraz',
            'itirazin iptali', // cogunlukla icra hukuku -> Yargitay
            'menfi tespit',
            'alacak davasi',
            'zaman asimi',
            'zamanaasimi',
            'konkordato',
            'iflasin ertelenmesi',
            'tasarrufun iptali',
            // Ceza
            'ceza',
            'dolandiricilik',
            'hirsizlik',
            'yaralama',
            'tehdit',
            'uyusturucu',
            'uyusturucu madde',
            'kasten oldurme',
            'haksiz tahrik',
            'gorevi kotuye kullanma',
            // Aile / miras
            'bosanma',
            'nafaka',
            'velayet',
            'miras',
            'veraset',
            // Is hukuku
            'is davasi',
            'kidem tazminati',
            'ihbar tazminati',
            'hizmet tespiti',
            'is akdi',
            'ise iade',
            'fazla mesai alacagi',
            // Kira / tasinmaz
            'kira sozlesmesi',
            'kira alacagi',
            'tahliye',
            'tapu tescil',
            // Trafik / sigorta
            'trafik kazasi',
            'sigorta tazminati',
        ],
        1.1
    );

    // Baglamsal duzeltme: 'itirazin iptali' + idari baglamdaysa -> Danistay'a kaydir
    if (
        text.includes('itirazin iptali') &&
        (text.includes('idari') ||
            text.includes('vergi') ||
            text.includes('belediye') ||
            text.includes('kamu') ||
            text.includes('idare'))
    ) {
        scores['danistay'] += 2.5;
        scores['yargitay'] = Math.max(0, scores['yargitay'] - 1.5);
    }

    // Baglamsal duzeltme: kacak elektrik + icra/alacak/zaman asimi baglami -> Yargitay
    if (
        text.includes('kacak elektrik') &&
        (text.includes('itirazin iptali') ||
            text.includes('icra') ||
            text.includes('alacak') ||
            text.includes('menfi tespit') ||
            text.includes('zaman asimi')) &&
        !(text.includes('idari') || text.includes('epdk') || text.includes('idare mahkemesi'))
    ) {
        scores['yargitay'] += 3.0;
        scores['danistay'] = Math.max(0, scores['danistay'] - 1.5);
    }
    if (
        text.includes('kacak elektrik') &&
        text.includes('tespit tutanagi') &&
        (text.includes('hukuki') || text.includes('gecerlilik') || text.includes('gecerliligi')) &&
        !(text.includes('idari') || text.includes('epdk') || text.includes('idare mahkemesi'))
    ) {
        scores['yargitay'] += 2.5;
        scores['danistay'] = Math.max(0, scores['danistay'] - 1.0);
    }

    // Baglamsal duzeltme: imar barisi/yapi kayit/gecici 16 -> Danistay
    if (
        text.includes('imar barisi') ||
        text.includes('yapi kayit belgesi') ||
        text.includes('gecici 16') ||
        text.includes('3194')
    ) {
        scores['danistay'] += 3.0;
        scores['yargitay'] = Math.max(0, scores['yargitay'] - 1.0);
    }

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
        'Asagidaki Turkce hukuki ictihat arama sorgusu icin en uygun yargi kaynagini belirle.',
        '',
        'GECERLI SOURCE DEGERLERI: danistay | yargitay | anayasa | uyap | all',
        '',
        '=== ROUTING KURALLARI ===',
        '',
        'DANISTAY (idari yargi):',
        '  - Imar, ruhsat, kacak yapi, yikim karari, encumen karari, yapi tatil tutanagi',
        '  - Idari para cezasi, belediye islemleri, idari yargi, idare mahkemesi, tam yargi davasi',
        '  - Kamu ihale (KIK), vergi davasi, gumruk, disiplin cezasi, kamu personeli',
        '  - EPDK karari, elektrik piyasasi, kacak elektrik tuketimi, TEDAS uyusmazligi,',
        '    tespit tutanagi (elektrik), kayip kacak bedeli, dagitim sirketi',
        '',
        'YARGITAY (ozel hukuk + ceza):',
        '  - Kanun kodlari: TCK, CMK, HMK, TBK, TMK, IIK, TTK',
        '  - Icra takibi, borca itiraz, kambiyo senedi, iflas/konkordato',
        '  - Menfi tespit, alacak davasi, tazminat davasi',
        '  - Bosanma, nafaka, velayet, miras, veraset',
        '  - Is davasi, kidem tazminati, ihbar tazminati, hizmet tespiti, is akdi feshi',
        '  - Kira sozlesmesi, tahliye davasi, tapu tescil',
        '  - Ceza: dolandiricilik, hirsizlik, yaralama, tehdit, uyusturucu',
        '  - Trafik kazasi, sigorta tazminati, sigorta sozlesmesi',
        '',
        'ANAYASA: bireysel basvuru, AYM, Anayasa Mahkemesi karari',
        'UYAP: yerel mahkeme/bolge adliye/istinaf kararlari ozellikle isteniyorsa',
        'ALL: hem idari hem ozel hukuk boyutu varsa veya belirsizse',
        '',
        '=== ONEMLI NUANSLAR (dikkat) ===',
        '"itirazin iptali":',
        '  - EGER icra/para alacagi/kira/is alacagi baglamindaysa -> YARGITAY',
        '  - EGER idari/vergi/kamu ihale/belediye baglami varsa -> DANISTAY',
        '"iptal davasi":',
        '  - idari islemin iptali (belediye, kamu) -> DANISTAY',
        '  - sozlesme/sirket iptali -> YARGITAY',
        '"kacak":',
        '  - "kacak yapi/insaat/ruhsatsiz" -> DANISTAY',
        '  - "kacak elektrik/tuketim/sayac" -> DANISTAY (EPDK idari yargi)',
        '',
        '=== COMPACT QUERY ===',
        'compactQuery: Sorguyu Bedesten/UYAP aramasina uygun sekilde optimize et.',
        "  - Stop-word'leri at (ve, ile, icin, olan, hakkinda, gibi...)",
        '  - Onemli hukuki terimleri koru (kanun maddeleri, kurum adlari, esas kavramlar)',
        '  - Cok uzunsa 100-120 karaktere indir, ama ana anlami koru',
        '  - Turkce ASCII karakterlerle yaz (normalizasyon icin)',
        '',
        'Sadece asagidaki JSON formatini dondur (markdown/aciklama ekleme):',
        '{"source":"...","confidence":0.0,"birimAdi":"ALL","compactQuery":"..."}',
        '',
        `requestedSource: ${requested}`,
        `query: ${keyword}`,
    ].join('\n');

    try {
        const response = await generateContentWithRetry(
            {
                model: MODEL_NAME,
                contents: routingPrompt,
                config: { temperature: 0.1 },
            },
            { maxRetries: 0, timeoutMs: LEGAL_ROUTER_TIMEOUT_MS }
        );

        const parsed = maybeExtractJson(response.text || '');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;

        const source = normalizeSourceValue(parsed.source, 'all');
        const confidenceRaw = Number(parsed.confidence);
        const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : 0.5;
        const compactQuery =
            typeof parsed.compactQuery === 'string' ? parsed.compactQuery.trim() : '';
        const birimAdi = typeof parsed.birimAdi === 'string' ? parsed.birimAdi.trim() : '';

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

const buildSearchRoutingPlan = async ({
    keyword,
    rawQuery,
    requestedSource = 'all',
    filters = {},
}) => {
    const requested = normalizeSourceValue(requestedSource, 'all');
    const originalKeyword = String(keyword || '')
        .replace(/\s+/g, ' ')
        .trim();
    // rawQuery: kullanıcının tam sorgusu — routing, rerank ve explanation için kullanılır
    const preservedRawQuery =
        typeof rawQuery === 'string' && rawQuery.trim() ? rawQuery.trim() : originalKeyword;
    const compactKeyword = compactLegalKeywordQuery(originalKeyword);
    const ruleDecision = resolveSourceByRules(compactKeyword, requested);
    const aiDecision = await tryResolveSourceWithAI({
        keyword: compactKeyword,
        requestedSource: requested,
    });

    let resolvedSource = ruleDecision.source;
    let confidence = ruleDecision.confidence;
    let router = ruleDecision.method;

    if (aiDecision && aiDecision.source) {
        const aiCanOverrideRule =
            aiDecision.confidence >= 0.64 &&
            (ruleDecision.confidence < 0.84 ||
                aiDecision.source === requested ||
                requested === 'all');

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
    if (
        (!nextFilters.birimAdi || nextFilters.birimAdi === 'ALL') &&
        aiDecision?.birimAdi &&
        aiDecision.birimAdi !== 'ALL'
    ) {
        nextFilters.birimAdi = aiDecision.birimAdi;
    }

    const routedKeyword =
        router === 'ai' && aiDecision?.compactQuery
            ? aiDecision.compactQuery // YAPAY ZEKANIN OLUŞTURDUĞU SENSİBLE CONTEXT BOZULMADAN GÖNDERİLİYOR!
            : compactKeyword;

    return {
        requestedSource: requested,
        resolvedSource,
        confidence,
        router,
        keyword: routedKeyword || originalKeyword,
        originalKeyword,
        rawQuery: preservedRawQuery,
        fallbackSources,
        filters: nextFilters,
        compacted: compactKeyword !== originalKeyword,
    };
};

const toBedestenFormattedDecision = (item, index) => {
    const safe = item || {};
    const esasNo =
        safe.esasNo ||
        (safe.esasYili && safe.esasSiraNo ? `${safe.esasYili}/${safe.esasSiraNo}` : '');
    const kararNo =
        safe.kararNo ||
        (safe.kararYili && safe.kararSiraNo ? `${safe.kararYili}/${safe.kararSiraNo}` : '');
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

async function searchBedestenViaMcp(keyword, source, filters = {}) {
    const pageNumber = Math.max(1, Number(filters.pageNumber) || 1);
    const mcpArgs = {
        phrase: String(keyword || '').trim(),
        court_types: getMcpCourtTypesBySource(source),
        pageNumber,
        birimAdi: normalizeYargiMcpBirimAdi(filters.birimAdi || 'ALL'),
    };
    if (filters.kararTarihiStart) mcpArgs.kararTarihiStart = filters.kararTarihiStart;
    if (filters.kararTarihiEnd) mcpArgs.kararTarihiEnd = filters.kararTarihiEnd;

    const toolResponse = await callYargiMcpTool('search_bedesten_unified', mcpArgs);
    const payload =
        toolResponse.parsed && typeof toolResponse.parsed === 'object'
            ? toolResponse.parsed
            : maybeExtractJson(toolResponse.text) || {};
    const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];

    return decisions.map((item, index) =>
        toBedestenFormattedDecision(
            {
                ...item,
                relevanceScore:
                    Number(item?.relevanceScore ?? item?.score) || Math.max(0, 100 - index * 4),
            },
            index
        )
    );
}

async function searchEmsalViaMcp(keyword, filters = {}) {
    try {
        const mcpArgs = {
            keyword: String(keyword || '').trim(),
        };
        if (filters.kararTarihiStart) mcpArgs.baslangicTarihi = filters.kararTarihiStart;
        if (filters.kararTarihiEnd) mcpArgs.bitisTarihi = filters.kararTarihiEnd;

        const toolResponse = await callYargiMcpTool('search_emsal_detailed_decisions', mcpArgs);
        const payload =
            toolResponse.parsed && typeof toolResponse.parsed === 'object'
                ? toolResponse.parsed
                : maybeExtractJson(toolResponse.text) || {};

        // UYAP Emsal API response structure
        const emsalData = payload?.data?.data || payload?.data || [];
        const decisions = Array.isArray(emsalData) ? emsalData : [];

        // Yerel mahkeme kararlarını filtrele — sadece üst mahkeme kararlarını kabul et
        const UPPER_COURT_REGEX =
            /yargıtay|danıştay|bölge\s*adliye|bölge\s*idare|hukuk\s*genel\s*kurul|ceza\s*genel\s*kurul|idari\s*dava\s*daireleri|vergi\s*dava\s*daireleri/i;
        const upperCourtDecisions = decisions.filter((item) => {
            const daire = String(item?.daire || '');
            return UPPER_COURT_REGEX.test(daire);
        });

        return upperCourtDecisions.map((item, index) => {
            const safe = item || {};
            return {
                id: safe.id || `emsal-${index + 1}`,
                documentId: safe.id || '',
                title:
                    `${safe.yargiBirimi || safe.mahkeme || 'Emsal'} ${safe.daire || ''}`.trim() ||
                    `Emsal Karar ${index + 1}`,
                esasNo: safe.esasNo || '',
                kararNo: safe.kararNo || '',
                tarih: safe.kararTarihi || safe.tarih || '',
                daire: safe.daire || safe.yargiBirimi || '',
                ozet: safe.kararOzeti || safe.ozet || '',
                relevanceScore: Math.max(0, 100 - index * 5),
                _source: 'emsal-uyap',
            };
        });
    } catch (error) {
        console.error('UYAP Emsal MCP search failed:', error);
        return [];
    }
}

async function getEmsalDocumentViaMcp(documentId) {
    try {
        const toolResponse = await callYargiMcpTool('get_emsal_document_markdown', {
            id: String(documentId || '').trim(),
        });
        const payload =
            toolResponse.parsed && typeof toolResponse.parsed === 'object'
                ? toolResponse.parsed
                : maybeExtractJson(toolResponse.text) || {};
        const markdown = String(
            payload?.markdown_content || payload?.content || toolResponse.text || ''
        ).trim();
        return {
            content: markdown,
            mimeType: 'text/markdown',
        };
    } catch (error) {
        console.error('UYAP Emsal document fetch failed:', error);
        return { content: '', mimeType: 'text/markdown' };
    }
}

async function searchBedestenAPI(keyword, source, filters = {}, options = {}) {
    const allowSourceFallback = options?.allowSourceFallback !== false;
    // Always search Bedesten directly to avoid rate limiting.
    // MCP is used for semantic search, not keyword search variants.

    const pageNumber = Math.max(1, Number(filters.pageNumber) || 1);
    const pageSize = Math.min(
        50,
        Math.max(1, Number(filters.pageSize) || LEGAL_RESULT_RETURN_LIMIT)
    );
    const rawBirimAdi = typeof filters.birimAdi === 'string' ? filters.birimAdi.trim() : '';
    const birimAdi = !rawBirimAdi || rawBirimAdi.toUpperCase() === 'ALL' ? '' : rawBirimAdi;

    const payload = {
        data: {
            pageSize,
            pageNumber,
            itemTypeList: getBedestenItemTypeList(source),
            phrase: keyword,
            birimAdi,
            kararTarihiStart: filters.kararTarihiStart || '',
            kararTarihiEnd: filters.kararTarihiEnd || '',
            sortFields:
                Array.isArray(filters.sortFields) && filters.sortFields.length > 0
                    ? filters.sortFields
                    : ['KARAR_TARIHI'],
            sortDirection:
                (filters.sortDirection || 'desc').toString().toLowerCase() === 'asc'
                    ? 'asc'
                    : 'desc',
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };
    if (!payload.data.birimAdi) {
        delete payload.data.birimAdi;
    }

    const response = await fetchWithTimeout(
        BEDESTEN_SEARCH_URL,
        {
            method: 'POST',
            headers: getBedestenHeaders(),
            body: JSON.stringify(payload),
        },
        BEDESTEN_TIMEOUT_MS
    );

    if (!response.ok) {
        const rawError = await response.text().catch(() => '');
        throw new Error(`Bedesten search failed (${response.status}) ${rawError}`);
    }

    const data = await response.json();
    const list =
        [data?.data?.emsalKararList, data?.emsalKararList, data?.results].find(Array.isArray) || [];

    const formatted = list.map((item, index) => toBedestenFormattedDecision(item, index));
    if (formatted.length === 0 && allowSourceFallback && normalizeSourceValue(source, 'all') !== 'all') {
        return await searchBedestenAPI(keyword, 'all', filters, {
            allowSourceFallback: false,
        });
    }

    return formatted;
}

async function searchSemanticViaMcp(initialKeyword, semanticQuery, source = 'all', topK = 15) {
    try {
        const courtTypes = getMcpCourtTypesBySource(source);
        const mcpArgs = {
            initial_keyword: String(initialKeyword || '').trim(),
            query: String(semanticQuery || '').trim(),
            court_types: courtTypes,
            top_k: Math.min(50, Math.max(1, topK)),
        };

        // Semantic search needs more time — it fetches 100 docs, embeds them, then ranks
        const oldTimeout = YARGI_MCP_TIMEOUT_MS;
        const semanticSessionInit = async () => {
            const initPayload = {
                jsonrpc: '2.0',
                id: `init-sem-${Date.now()}`,
                method: 'initialize',
                params: {
                    protocolVersion: YARGI_MCP_PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: { name: 'dilekceasist-semantic', version: '1.0.0' },
                },
            };
            const initResponse = await postYargiMcp(initPayload);
            const sessionId = initResponse.sessionId;
            if (!sessionId) throw new Error('Semantic MCP session id alinamadi.');
            await postYargiMcp(
                { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
                sessionId
            );
            return sessionId;
        };

        let sessionId = '';
        try {
            sessionId = await semanticSessionInit();
            const callPayload = {
                jsonrpc: '2.0',
                id: `sem-call-${Date.now()}`,
                method: 'tools/call',
                params: {
                    name: 'search_bedesten_semantic',
                    arguments: mcpArgs,
                },
            };
            const callResult = await withTimeout(
                postYargiMcp(callPayload, sessionId),
                YARGI_MCP_SEMANTIC_TIMEOUT_MS,
                'MCP semantic search timed out'
            );
            const toolResult = callResult.eventPayload?.result || {};
            const textPayload = Array.isArray(toolResult.content)
                ? toolResult.content
                    .filter((item) => item && item.type === 'text')
                    .map((item) => String(item.text || ''))
                    .join('\n')
                    .trim()
                : '';

            if (toolResult.isError) {
                throw new Error(textPayload || 'MCP semantic search tool hatasi');
            }

            const parsed = maybeExtractJson(textPayload) || {};
            const semanticResults = Array.isArray(parsed?.results) ? parsed.results : [];

            return semanticResults.map((item, index) => {
                const meta = item?.metadata || {};
                return {
                    id: item?.document_id || meta?.document_id || `sem-${index + 1}`,
                    documentId: item?.document_id || meta?.document_id || '',
                    title:
                        item?.title ||
                        `${meta?.birim_adi || ''} ${meta?.esas_no ? 'E. ' + meta.esas_no : ''}`.trim() ||
                        `Semantik Sonuc ${index + 1}`,
                    esasNo: meta?.esas_no || '',
                    kararNo: meta?.karar_no || '',
                    tarih: meta?.karar_tarihi || '',
                    daire: meta?.birim_adi || '',
                    ozet: (item?.preview || '').slice(0, 400),
                    relevanceScore: Math.round((item?.similarity_score || 0) * 100),
                    _source: 'mcp-semantic',
                };
            });
        } finally {
            await closeYargiMcpSession(sessionId);
        }
    } catch (error) {
        console.error('MCP semantic search failed:', error);
        return [];
    }
}

async function getBedestenDocumentViaMcp(documentId) {
    const toolResponse = await callYargiMcpTool('get_bedesten_document_markdown', {
        documentId: String(documentId || '').trim(),
    });
    const payload =
        toolResponse.parsed && typeof toolResponse.parsed === 'object'
            ? toolResponse.parsed
            : maybeExtractJson(toolResponse.text) || {};
    const markdown = String(
        payload?.markdown_content || payload?.content || toolResponse.text || ''
    ).trim();
    return {
        content: markdown,
        mimeType: 'text/markdown',
    };
}

async function getBedestenDocumentContent(documentId) {
    // Cache kontrolü — karar metinleri immutable olduğundan cache güvenlidir
    const cached = getCachedDocumentContent(documentId);
    if (cached) return cached;

    // Always fetch directly from Bedesten API for re-ranking.
    // Going through MCP causes double UYAP requests and rate limiting.
    const payload = {
        data: { documentId },
        applicationName: 'UyapMevzuat',
    };

    const response = await fetchWithTimeout(
        BEDESTEN_DOCUMENT_URL,
        {
            method: 'POST',
            headers: getBedestenHeaders(),
            body: JSON.stringify(payload),
        },
        BEDESTEN_TIMEOUT_MS
    );

    if (!response.ok) {
        const rawError = await response.text().catch(() => '');
        throw new Error(`Bedesten get-document failed (${response.status}) ${rawError}`);
    }

    const data = await response.json();
    const container = data?.data || data || {};
    const encodedContent =
        container.content || container.documentContent || container.base64Content || '';
    const mimeType = String(container.mimeType || container.contentType || 'text/html');

    if (!encodedContent || typeof encodedContent !== 'string') {
        return { content: '', mimeType };
    }

    let result = { content: '', mimeType };
    try {
        if (mimeType.toLowerCase().includes('html')) {
            const decoded = Buffer.from(encodedContent, 'base64').toString('utf-8');
            result = { content: stripHtmlToText(decoded), mimeType };
        } else if (mimeType.toLowerCase().includes('text')) {
            const decoded = Buffer.from(encodedContent, 'base64').toString('utf-8');
            result = { content: decoded.trim(), mimeType };
        }
    } catch (error) {
        console.error('Bedesten content decode error:', error);
    }

    // Başarılı içerikleri cache'e yaz
    if (result.content) {
        setCachedDocumentContent(documentId, result);
    }

    return result;
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

            const backoffDelay = initialDelayMs * 2 ** attempt;
            const jitter = Math.floor(Math.random() * 200);
            await sleep(backoffDelay + jitter);
        }
    }

    throw lastError || new Error('AI request failed');
}

async function _searchEmsalFallback(keyword, sourceHint = 'all') {
    try {
        const normalizedSourceHint = normalizeSourceValue(sourceHint, 'all');
        const sourceDirective =
            normalizedSourceHint === 'all'
                ? 'Yargitay ve Danistay agirlikli'
                : `${normalizedSourceHint.toUpperCase()} agirlikli`;
        const response = await generateContentWithRetry(
            {
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
                config: { tools: [{ googleSearch: {} }] },
            },
            { maxRetries: 0 }
        );

        const text = response.text || '';
        const parsed = maybeExtractJson(text);
        const rows = Array.isArray(parsed) ? parsed : [];

        if (rows.length > 0) {
            return {
                success: true,
                results: rows
                    .map((row, index) => ({
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
                        relevanceScore: Number(row.relevanceScore) || Math.max(0, 100 - index * 8),
                    }))
                    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)),
            };
        }

        return {
            success: true,
            results: [
                {
                    id: 'ai-summary',
                    documentId: 'ai-summary',
                    title: 'AI Arama Sonucu',
                    ozet: String(text || '').slice(0, 500),
                },
            ],
        };
    } catch (error) {
        console.error('AI search fallback error:', error);
        return { success: false, results: [] };
    }
}

async function _getDocumentViaAIFallback({
    keyword = '',
    documentId = '',
    documentUrl = '',
    title = '',
    esasNo = '',
    kararNo = '',
    tarih = '',
    daire = '',
    ozet = '',
}) {
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
    ]
        .filter(Boolean)
        .join(' ')
        .trim();

    if (!query) return '';

    const response = await generateContentWithRetry(
        {
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
            },
        },
        { maxRetries: 0 }
    );

    return String(response.text || '')
        .replace(/https?:\/\/\S+/gi, '')
        .trim();
}

async function handleSources(req, res) {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargitay', description: 'Yargitay Kararlari (MCP/Bedesten)' },
            { id: 'danistay', name: 'Danistay', description: 'Danistay Kararlari (MCP/Bedesten)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (MCP/Bedesten)' },
            {
                id: 'anayasa',
                name: 'Anayasa Mahkemesi',
                description: 'AYM Kararlari (MCP/Bedesten)',
            },
            { id: 'kik', name: 'KIK', description: 'Kamu Ihale Kurulu Kararlari (MCP/Bedesten)' },
        ],
    });
}

async function handleSearchDecisions(req, res) {
    const { source, keyword, rawQuery, filters = {} } = req.body || {};
    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    // rawQuery: kullanıcının orijinal tam sorgusu (frontend tarafından korunur)
    // keyword: compactLegalSearchQuery ile kısaltılmış retrieval sürümü
    const effectiveRawQuery =
        typeof rawQuery === 'string' && rawQuery.trim() ? rawQuery.trim() : keyword;

    // Faz B: Cache kontrolü — aynı sorgu 60s içinde tekrar gelirse cache'den dön
    const cacheKey = `${source || 'all'}|${keyword}|${JSON.stringify(filters)}`;
    const cachedResponse = getCachedResult(cacheKey);
    if (cachedResponse) {
        return res.json({ ...cachedResponse, _cached: true });
    }

    // Faz C: Query parser — sorgudan hukuki varlıkları çıkar
    const parsedQuery = parseLegalQuery(effectiveRawQuery || keyword);

    const routingPlan = await buildSearchRoutingPlan({
        keyword,
        rawQuery: effectiveRawQuery,
        requestedSource: source,
        filters,
    });

    const provider = USE_YARGI_MCP ? 'yargi-mcp' : 'bedesten';
    const warningParts = [];
    let results = [];
    let usedSource = routingPlan.resolvedSource;
    const bedestenErrors = [];
    let semanticCandidates = [];
    let relatedResultCandidates = [];
    // rawQuery referansı — scoring, rerank ve fallback'te sınırlı kullanım için
    const rawQ = routingPlan.rawQuery || '';
    // AI mantıklı bir keyword/context oluşturduğunu varsaydığımızdan
    // saçma varyantlar ve regex silmeleri YAPMIYORUZ. Doğrudan AI sorgusunu aratıyoruz.
    const queryVariants = buildBedestenQueryVariants(
        routingPlan.keyword,
        routingPlan.originalKeyword
    );

    // Faz C4: Eş anlamlı terimlerden ek varyantlar üret
    if (
        parsedQuery.synonymExpansions.length > 0 &&
        queryVariants.length < LEGAL_QUERY_VARIANT_LIMIT
    ) {
        for (const { term, synonyms } of parsedQuery.synonymExpansions) {
            for (const syn of synonyms.slice(0, 2)) {
                // her terim için max 2 eş anlamlı
                if (queryVariants.length >= LEGAL_QUERY_VARIANT_LIMIT) break;
                const synVariant = routingPlan.keyword.replace(
                    new RegExp(escapeRegex(term), 'gi'),
                    syn
                );
                if (synVariant !== routingPlan.keyword && !queryVariants.includes(synVariant)) {
                    queryVariants.push(synVariant);
                }
            }
        }
    }

    const baseKeyword = routingPlan.originalKeyword || routingPlan.keyword;
    const normalizedBaseKeyword = normalizeForRouting(baseKeyword);
    const denseAnchorIntent =
        LEGAL_QUERY_PHRASE_ANCHORS.filter((phrase) => normalizedBaseKeyword.includes(phrase))
            .length >= 3;

    const requestedSourceNormalized = normalizeSourceValue(source, 'all');
    const dominantVariantSource =
        requestedSourceNormalized === 'all' && Number(routingPlan.confidence || 0) >= 0.78
            ? normalizeSourceValue(routingPlan.resolvedSource, 'all')
            : '';
    const variantPlans = [];
    let aiVariantRouteAttempts = 0;
    for (const variant of queryVariants) {
        const variantText = normalizeForRouting(variant);
        let explicitVariantSource = '';
        if (variantText.includes('danistay')) explicitVariantSource = 'danistay';
        else if (variantText.includes('yargitay')) explicitVariantSource = 'yargitay';
        else if (variantText.includes('anayasa')) explicitVariantSource = 'anayasa';
        else if (variantText.includes('uyap')) explicitVariantSource = 'uyap';

        let variantSource = routingPlan.resolvedSource;
        let routeMethod = 'rules';

        if (requestedSourceNormalized !== 'all') {
            variantSource = requestedSourceNormalized;
            routeMethod = 'requested';
        } else if (explicitVariantSource) {
            variantSource = explicitVariantSource;
            routeMethod = 'explicit';
        } else if (dominantVariantSource) {
            variantSource = dominantVariantSource;
            routeMethod = 'dominant';
        } else {
            const ruleDecision = resolveSourceByRules(variant, 'all');
            variantSource = normalizeSourceValue(ruleDecision.source, routingPlan.resolvedSource);
            if (ruleDecision.confidence < 0.78 && aiVariantRouteAttempts < 3) {
                const aiDecision = await tryResolveSourceWithAI({
                    keyword: variant,
                    requestedSource: 'all',
                });
                aiVariantRouteAttempts += 1;
                if (
                    aiDecision?.source &&
                    aiDecision.confidence >= Math.max(0.5, ruleDecision.confidence - 0.05)
                ) {
                    variantSource = normalizeSourceValue(aiDecision.source, variantSource);
                    routeMethod = 'ai';
                }
            }
        }

        variantPlans.push({
            variant,
            source: normalizeSourceValue(variantSource, routingPlan.resolvedSource),
            routeMethod,
        });
    }
    if (variantPlans.length === 0) {
        variantPlans.push({
            variant: baseKeyword,
            source: routingPlan.resolvedSource,
            routeMethod: 'fallback',
        });
    }

    const sourceCollected = [];
    const sourceSeen = new Set();
    const resolvedSources = new Set();
    let lastSourceError = null;
    let strictVariantHitCount = 0;
    const pushCollected = (items = []) => {
        for (const item of Array.isArray(items) ? items : []) {
            const key =
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
            if (!key || sourceSeen.has(key)) continue;
            sourceSeen.add(key);
            sourceCollected.push(item);
        }
    };

    // === PARALEL PIPELINE: Bedesten + Emsal + Semantic aynı anda başlatılır ===
    // Emsal ve Semantic aramaları variant loop'un bitmesini bekleMEZ.
    // Bu ~%40-60 hız kazancı sağlar.

    const emsalKeyword =
        baseKeyword.length > 120 ? compactLegalKeywordQuery(baseKeyword, 120) : baseKeyword;
    const shouldSearchEmsal =
        USE_YARGI_MCP &&
        (requestedSourceNormalized === 'uyap' || requestedSourceNormalized === 'all');
    const needsSemanticBoost =
        USE_MCP_SEMANTIC_SEARCH &&
        USE_YARGI_MCP &&
        baseKeyword.split(/\s+/).length >= 3; // 3+ kelimelik sorgu = semantik faydalı

    // Emsal ve Semantic aramaları HEMEN başlat (paralel)
    const emsalPromise = shouldSearchEmsal
        ? searchEmsalViaMcp(emsalKeyword, routingPlan.filters).catch((err) => {
            console.error('UYAP Emsal parallel search error:', err);
            return [];
        })
        : Promise.resolve([]);

    const shortKeyword = compactLegalKeywordQuery(baseKeyword, 80);
    const semanticQuery = routingPlan.originalKeyword || baseKeyword;
    const semanticPromise = needsSemanticBoost
        ? searchSemanticViaMcp(shortKeyword, semanticQuery, requestedSourceNormalized, 15).catch(
            (err) => {
                console.error('MCP semantic search error:', err);
                return [];
            }
        )
        : Promise.resolve([]);

    // Bedesten variant loop (sıralı — erken durdurma mantığı gerekli)
    for (const plan of variantPlans) {
        try {
            const bedestenResults = await searchBedestenAPI(
                plan.variant,
                plan.source,
                routingPlan.filters
            );
            if (Array.isArray(bedestenResults) && bedestenResults.length > 0) {
                pushCollected(bedestenResults);
                resolvedSources.add(plan.source);
                if (/\band\b/i.test(plan.variant) || String(plan.variant || '').includes('"')) {
                    strictVariantHitCount += 1;
                }
                if (plan.variant !== baseKeyword) {
                    warningParts.push('Arama sorgusu optimize edilerek MCP sonucu bulundu.');
                }
                if (sourceCollected.length >= LEGAL_VARIANT_RESULT_CAP) break;
                if (denseAnchorIntent && strictVariantHitCount >= 2 && sourceCollected.length >= 12)
                    break;
            }
        } catch (error) {
            lastSourceError = error;
            if (error?.code === 'REQUEST_TIMEOUT') {
                warningParts.push('MCP/Bedesten aramasi zaman asimina ugradi.');
                break;
            }
            console.error(
                `Bedesten search error (${plan.source}, variant=${plan.variant}):`,
                error
            );
        }
    }

    // Paralel başlatılan Emsal ve Semantic sonuçlarını topla
    const [emsalResults, semanticResults] = await Promise.all([emsalPromise, semanticPromise]);

    if (Array.isArray(emsalResults) && emsalResults.length > 0) {
        pushCollected(emsalResults);
        resolvedSources.add('uyap');
    }
    if (Array.isArray(semanticResults) && semanticResults.length > 0) {
        pushCollected(semanticResults);
        resolvedSources.add('semantic');
        warningParts.push('Semantik arama ile ek ilgili sonuclar bulundu.');
    }
    // Emsal sonucu geldikten sonra hâlâ yetersizse, ek arama yok — zaten paralel çalışıyorlar

    if (sourceCollected.length > 0) {
        results = sourceCollected.slice(0, LEGAL_VARIANT_RESULT_CAP);
        semanticCandidates = sourceCollected.slice(0, LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT);
        relatedResultCandidates = sourceCollected.slice(0, LEGAL_VARIANT_RESULT_CAP);
        if (resolvedSources.size === 1) {
            usedSource = Array.from(resolvedSources)[0];
        } else if (resolvedSources.size > 1) {
            usedSource = 'all';
        }
    }
    if (lastSourceError) {
        bedestenErrors.push(
            `${usedSource || routingPlan.resolvedSource}:${lastSourceError?.message || 'unknown-error'}`
        );
    }

    if (Array.isArray(results) && results.length > 0) {
        // rawQuery varsa tam bağlamla scoring yap, ama çok uzun metinler (>500 char)
        // token parsing'i boğar — bu durumda kısaltılmış keyword'e düş
        const scoringKeyword =
            rawQ.length > 0 && rawQ.length <= 500
                ? rawQ
                : routingPlan.originalKeyword || routingPlan.keyword;
        const scoring = scoreAndFilterResultsByKeyword(results, scoringKeyword);

        const contentCandidates = [];
        const contentCandidateSeen = new Set();
        const pushContentCandidate = (item) => {
            if (!item || typeof item !== 'object') return;
            const id = getLegalDecisionDocumentId(item);
            const fallbackKey = `${item.title || ''}|${item.esasNo || ''}|${item.kararNo || ''}`;
            const key = id || fallbackKey;
            if (!key || contentCandidateSeen.has(key)) return;
            contentCandidateSeen.add(key);
            contentCandidates.push(item);
        };
        for (const item of Array.isArray(scoring.results) ? scoring.results : []) {
            pushContentCandidate(item);
        }
        for (const item of Array.isArray(scoring.scoredResults) ? scoring.scoredResults : []) {
            pushContentCandidate(item);
        }
        semanticCandidates = contentCandidates.slice(0, LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT);
        relatedResultCandidates = contentCandidates.slice(0, LEGAL_VARIANT_RESULT_CAP);

        const contentRerank = await rerankResultsByDecisionContent(
            contentCandidates,
            scoringKeyword
        );
        const scoringFallback = pickLegalFallbackResults({
            scoring,
            contentCandidates,
            contentRerank,
            limit: LEGAL_RESULT_RETURN_LIMIT,
        });

        if (contentRerank.applied && contentRerank.fetchedCount > 0) {
            if (Array.isArray(contentRerank.results) && contentRerank.results.length > 0) {
                results = contentRerank.results.slice(
                    0,
                    Math.min(LEGAL_RESULT_RETURN_LIMIT, contentRerank.results.length)
                );
                if (contentRerank.filteredOutCount > 0) {
                    warningParts.push(
                        `${contentRerank.filteredOutCount} sonuc tam metinde anahtar kelime uyusmasi dusuk oldugu icin elendi.`
                    );
                }
            } else {
                results = scoringFallback.results;
                if (scoringFallback.mode === 'strict-scoring') {
                    warningParts.push(
                        'Tam metin filtresi sonuc vermedigi icin metadata eslesmeleri listelendi.'
                    );
                } else if (scoringFallback.mode === 'strict-threshold') {
                    warningParts.push(
                        `Tam metin filtresi sonuc vermedigi icin skor >= ${LEGAL_MIN_MATCH_SCORE} olan en yakin sonuclar listelendi.`
                    );
                } else if (scoringFallback.mode === 'relaxed-threshold') {
                    warningParts.push(
                        `Tam metin filtresi sonuc vermedigi icin skor >= ${LEGAL_RELAXED_MATCH_SCORE} olan en yakin sonuclar listelendi.`
                    );
                } else if (scoringFallback.mode === 'content-candidates') {
                    warningParts.push(
                        'Karar tam metinleri kismen dogrulanamadigi icin ilk bulunan MCP sonuclari listelendi.'
                    );
                } else {
                    warningParts.push('MCP tam metinlerinde anahtar kelime uyusmasi bulunamadi.');
                }
            }
        } else {
            results = scoringFallback.results;
            if (scoringFallback.mode === 'strict-threshold') {
                warningParts.push(
                    `Kati ifade filtresi nedeniyle skor >= ${LEGAL_MIN_MATCH_SCORE} olan en yakin MCP sonuclari listelendi.`
                );
            } else if (scoringFallback.mode === 'relaxed-threshold') {
                warningParts.push(
                    `Kati ifade filtresi nedeniyle skor >= ${LEGAL_RELAXED_MATCH_SCORE} olan en yakin MCP sonuclari listelendi.`
                );
            } else if (scoringFallback.mode === 'content-candidates') {
                warningParts.push(
                    'Karar tam metinleri cekilemedigi icin ilk bulunan MCP sonuclari listelendi.'
                );
            }

            if (contentRerank.applied && contentRerank.fetchErrorCount > 0) {
                warningParts.push('Bazi karar tam metinleri MCP uzerinden cekilemedi.');
            }
            if (
                scoring.filteredOutCount > 0 &&
                Array.isArray(scoring.results) &&
                scoring.results.length > 0
            ) {
                warningParts.push(
                    `${scoring.filteredOutCount} sonuc anahtar kelime uyusmasi dusuk oldugu icin elendi.`
                );
            }
        }
    }

    // === Faz B: Gemini semantic rerank — artık fallback değil, ana akış ===
    // Hem sonuç varken (kaliteyi artır) hem yokken (kurtarma) çalışır
    {
        const rerankQ =
            rawQ.length > 0 && rawQ.length <= 1500
                ? rawQ
                : routingPlan.originalKeyword || routingPlan.keyword;
        // Rerank adayları: sonuç varsa onları, yoksa tüm semantik adayları kullan
        const rerankCandidates =
            Array.isArray(results) && results.length > 0 ? results : semanticCandidates;

        if (rerankCandidates.length > 0) {
            const semanticRerank = await semanticRerankWithGemini({
                candidates: rerankCandidates,
                keyword: rerankQ,
            });
            if (
                semanticRerank.applied &&
                Array.isArray(semanticRerank.results) &&
                semanticRerank.results.length > 0
            ) {
                const hadResults = Array.isArray(results) && results.length > 0;
                results = semanticRerank.results.slice(0, LEGAL_RESULT_RETURN_LIMIT);
                if (!hadResults) {
                    warningParts.push('Gemini semantik siralama fallback kullanildi.');
                } else {
                    warningParts.push('Sonuclar Gemini ile semantik olarak yeniden siralandi.');
                }
            }
        }
    }

    if (!Array.isArray(results) || results.length === 0) {
        // Phrase fallback: uzun metin phrase parser'ı boğar, kısaltılmış keyword kullan
        const fallbackQ =
            rawQ.length > 0 && rawQ.length <= 500
                ? rawQ
                : routingPlan.originalKeyword || routingPlan.keyword;
        const phraseFallback = await runPhraseFallbackSearch({
            keyword: fallbackQ,
            source: usedSource || routingPlan.resolvedSource || 'all',
            filters: routingPlan.filters,
        });
        if (
            phraseFallback.applied &&
            Array.isArray(phraseFallback.results) &&
            phraseFallback.results.length > 0
        ) {
            results = phraseFallback.results;
            for (let i = warningParts.length - 1; i >= 0; i -= 1) {
                if (
                    String(warningParts[i] || '').includes(
                        'MCP tam metinlerinde anahtar kelime uyusmasi bulunamadi.'
                    )
                ) {
                    warningParts.splice(i, 1);
                }
            }
            warningParts.push(
                'Birlesik sorgu parcalanarak anahtar ifadelerle MCP aramasi yapildi.'
            );
        }
    }

    if ((!Array.isArray(results) || results.length === 0) && sourceCollected.length > 0) {
        results = sourceCollected
            .slice()
            .sort((a, b) => Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0))
            .slice(0, LEGAL_RESULT_RETURN_LIMIT);
        warningParts.push(
            'Tam metin ve ifade filtreleri sonuc vermedigi icin en yakin ham karar adaylari listelendi.'
        );
    }

    if (!Array.isArray(results) || results.length === 0) {
        const uniqueWarnings = Array.from(new Set(warningParts));
        return res.json({
            success: true,
            source: usedSource || routingPlan.resolvedSource || 'all',
            provider,
            keyword: routingPlan.keyword,
            results: [],
            warning:
                uniqueWarnings.length > 0
                    ? uniqueWarnings.join(' ')
                    : 'MCP/Bedesten kaynaginda karar bulunamadi veya servise ulasilamadi.',
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

    if (routingPlan.compacted) {
        warningParts.push('Uzun sorgu optimize edilerek arama yapildi.');
    }
    if (bedestenErrors.length > 0) {
        warningParts.push('Bazi Bedesten denemeleri basarisiz oldu.');
    }
    let uniqueWarnings = Array.from(new Set(warningParts));
    const strongResultsWithTier = (Array.isArray(results) ? results : []).map((item) => ({
        ...item,
        matchTier: item?.matchTier || 'strong',
    }));
    const resultSeen = new Set(
        strongResultsWithTier.map(
            (item) =>
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`
        )
    );
    const candidatePool = dedupeLegalResults(
        sourceCollected.length > 0 ? sourceCollected : relatedResultCandidates
    );
    const relatedTopUp = candidatePool
        .filter((item) => {
            const key =
                getLegalDecisionDocumentId(item) ||
                `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
            return key && !resultSeen.has(key);
        })
        .slice(0, Math.max(0, LEGAL_RESULT_RETURN_LIMIT - strongResultsWithTier.length))
        .map((item) => ({
            ...item,
            matchTier: item?.matchTier || 'related',
        }));
    const resultBuckets = {
        strong: strongResultsWithTier,
        related: relatedTopUp,
        combined: [...strongResultsWithTier, ...relatedTopUp],
    };
    if (relatedTopUp.length > 0) {
        results = resultBuckets.combined;
        warningParts.push(`${relatedTopUp.length} ilgili karar adayi da listeye eklendi.`);
        uniqueWarnings = Array.from(new Set(warningParts));
    } else {
        results = strongResultsWithTier;
    }

    // ─── Faz C: Field-aware boost + diversification + matchReason ───
    if (Array.isArray(results) && results.length > 0) {
        // C2: Field-aware scoring boost uygula
        results = results.map((item) => {
            const boost = computeFieldAwareBoost(item, parsedQuery);
            const currentScore = Number(item?.relevanceScore || 0);
            return {
                ...item,
                relevanceScore: clampScore(currentScore + boost),
            };
        });

        // Boost sonrası yeniden sırala
        results.sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0));

        // C3: Sonuç çeşitlendirme — aynı daireden max 3
        results = diversifyResults(results, 3);

        // C5: Açıklanabilir sonuç — her karar için matchReason ekle
        results = results.map((item) => ({
            ...item,
            matchReason: buildMatchReason(item, parsedQuery),
        }));
    }

    const responsePayload = {
        success: true,
        source: usedSource || routingPlan.resolvedSource || 'all',
        provider,
        keyword: routingPlan.keyword,
        results,
        resultBuckets,
        // Faz C: parsedQuery bilgisini response'a ekle (debugging ve frontend için)
        queryAnalysis: {
            courts: parsedQuery.courts,
            caseTypes: parsedQuery.caseTypes,
            kanunMaddeleri: parsedQuery.kanunMaddeleri,
            synonymsUsed: parsedQuery.synonymExpansions.map((s) => s.term),
        },
        routing: {
            requestedSource: routingPlan.requestedSource,
            resolvedSource: routingPlan.resolvedSource,
            usedSource,
            fallbackSources: routingPlan.fallbackSources,
            router: routingPlan.router,
            confidence: routingPlan.confidence,
            compacted: routingPlan.compacted,
        },
        ...(uniqueWarnings.length > 0 ? { warning: uniqueWarnings.join(' ') } : {}),
    };

    // Faz B: Başarılı sonuçları cache'e yaz
    if (Array.isArray(results) && results.length > 0) {
        setCachedResult(cacheKey, responsePayload);
    }

    return res.json(responsePayload);
}

async function handleGetDocument(req, res) {
    const { source, documentId, documentUrl } = req.body || {};
    if (!documentId && !documentUrl) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    const safeDocumentId = String(documentId || '');
    const safeDocumentUrl = String(documentUrl || '').trim();
    const hasSyntheticDocumentId = /^(search-|legal-|ai-summary)/i.test(safeDocumentId);
    if (!safeDocumentId || hasSyntheticDocumentId) {
        return res.status(400).json({
            error: 'Sadece MCP/Bedesten documentId ile karar metni getirilebilir.',
        });
    }

    let content = '';
    const provider = USE_YARGI_MCP ? 'yargi-mcp' : 'bedesten';
    let mimeType = 'text/plain';

    try {
        const bedestenDoc = await getBedestenDocumentContent(safeDocumentId);
        content = bedestenDoc.content || '';
        mimeType = bedestenDoc.mimeType || mimeType;
    } catch (error) {
        console.error('Bedesten get-document error:', error);
        return res.status(502).json({
            error: 'MCP/Bedesten karar metni servisine ulasilamadi.',
        });
    }

    if (!content || content.trim().length === 0) {
        return res.status(404).json({
            error: 'MCP/Bedesten kaynaginda karar metni bulunamadi.',
        });
    }

    return res.json({
        success: true,
        source,
        provider,
        document: {
            content,
            mimeType,
            documentId: safeDocumentId,
            documentUrl: safeDocumentUrl,
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
                if (req.method !== 'POST')
                    return res.status(405).json({ error: 'Method not allowed' });
                return handleSearchDecisions(req, res);
            case 'get-document':
                if (req.method !== 'POST')
                    return res.status(405).json({ error: 'Method not allowed' });
                return handleGetDocument(req, res);
            default:
                if (req.method === 'GET') return handleSources(req, res);
                return res.status(400).json({
                    error: 'action parametresi gerekli: sources, search-decisions, get-document',
                });
        }
    } catch (error) {
        console.error('Legal API Error:', error);
        return res.status(500).json({
            error:
                process.env.NODE_ENV === 'production'
                    ? 'Bir hata olustu.'
                    : error?.message || 'Bir hata olustu.',
        });
    }
}
