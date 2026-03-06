import { GoogleGenAI } from '@google/genai';

export const config = {
    maxDuration: 60,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';
const LEGAL_AI_TIMEOUT_MS = Number(process.env.LEGAL_AI_TIMEOUT_MS || 35000);
const BEDESTEN_TIMEOUT_MS = Number(process.env.BEDESTEN_TIMEOUT_MS || 15000);
const LEGAL_ROUTER_TIMEOUT_MS = Number(process.env.LEGAL_ROUTER_TIMEOUT_MS || 8000);
const LEGAL_RESULT_RETURN_LIMIT = Math.max(10, Math.min(100, Number(process.env.LEGAL_RESULT_RETURN_LIMIT || 50)));
const LEGAL_CONTENT_RERANK_LIMIT = Math.max(LEGAL_RESULT_RETURN_LIMIT, Math.min(100, Number(process.env.LEGAL_CONTENT_RERANK_LIMIT || 50)));
const LEGAL_QUERY_VARIANT_LIMIT = Math.max(6, Math.min(20, Number(process.env.LEGAL_QUERY_VARIANT_LIMIT || 10)));
const LEGAL_VARIANT_RESULT_CAP = Math.max(LEGAL_RESULT_RETURN_LIMIT, Math.min(150, Number(process.env.LEGAL_VARIANT_RESULT_CAP || 50)));
const USE_GEMINI_SEMANTIC_RERANK = process.env.LEGAL_USE_GEMINI_SEMANTIC !== '0';
const LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT = Math.max(LEGAL_RESULT_RETURN_LIMIT, Math.min(100, Number(process.env.LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT || 50)));
const USE_MCP_SEMANTIC_SEARCH = process.env.LEGAL_USE_MCP_SEMANTIC !== '0';
const YARGI_MCP_SEMANTIC_TIMEOUT_MS = Number(process.env.YARGI_MCP_SEMANTIC_TIMEOUT_MS || 90000);

const BEDESTEN_BASE_URL = 'https://bedesten.adalet.gov.tr';
const BEDESTEN_SEARCH_URL = `${BEDESTEN_BASE_URL}/emsal-karar/searchDocuments`;
const BEDESTEN_DOCUMENT_URL = `${BEDESTEN_BASE_URL}/emsal-karar/getDocumentContent`;
const YARGI_MCP_URL = String(process.env.YARGI_MCP_URL || 'https://yargimcp.fastmcp.app/mcp/').trim();
const YARGI_MCP_PROTOCOL_VERSION = process.env.YARGI_MCP_PROTOCOL_VERSION || '2024-11-05';
const YARGI_MCP_TIMEOUT_MS = Number(process.env.YARGI_MCP_TIMEOUT_MS || 90000);
const USE_YARGI_MCP = process.env.LEGAL_USE_YARGI_MCP !== '0';
const STRICT_MCP_ONLY = process.env.LEGAL_STRICT_MCP !== '0';

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

const normalizeYargiMcpUrl = () => {
    const raw = String(YARGI_MCP_URL || '').trim();
    if (!raw) {
        throw new Error('YARGI_MCP_URL tanimli degil.');
    }
    return raw.endsWith('/') ? raw : `${raw}/`;
};

const normalizeYargiMcpBirimAdi = (value = 'ALL') => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw || raw === 'ALL') return 'ALL';
    if (/^(H([1-9]|1\d|2[0-3])|C([1-9]|1\d|2[0-3])|D([1-9]|1[0-7])|HGK|CGK|BGK|HBK|CBK|DBGK|IDDK|VDDK|IBK|IIK|DBK|AYIM|AYIMDK|AYIMB|AYIM1|AYIM2|AYIM3)$/.test(raw)) {
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

    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    }, YARGI_MCP_TIMEOUT_MS);

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

    await postYargiMcp({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
    }, sessionId);

    return sessionId;
};

const closeYargiMcpSession = async (sessionId = '') => {
    if (!sessionId) return;
    try {
        await fetchWithTimeout(normalizeYargiMcpUrl(), {
            method: 'DELETE',
            headers: { 'mcp-session-id': sessionId },
        }, 5000);
    } catch {
        // session cleanup best effort
    }
};

const callYargiMcpTool = async (name, args = {}) => {
    let sessionId = '';
    try {
        sessionId = await initYargiMcpSession();
        const callPayload = {
            jsonrpc: '2.0',
            id: `call-${Date.now()}`,
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
            throw new Error(textPayload || `Yargi MCP tool hatasi (${name})`);
        }

        return {
            text: textPayload,
            parsed: maybeExtractJson(textPayload),
        };
    } finally {
        await closeYargiMcpSession(sessionId);
    }
};

const getMcpCourtTypesBySource = (source = 'all') => {
    const normalized = normalizeSourceValue(source, 'all');
    return YARGI_MCP_COURT_TYPES_BY_SOURCE[normalized] || YARGI_MCP_COURT_TYPES_BY_SOURCE.all;
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
    Accept: '*/*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    AdaletApplicationName: 'UyapMevzuat',
    'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://mevzuat.adalet.gov.tr',
    Referer: 'https://mevzuat.adalet.gov.tr/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
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
        // Imar / yapi
        'imar kanunu', 'kacak yapi', 'ruhsatsiz insaat',
        'imar mevzuatina aykirilik', 'yikim karari', 'idari para cezasi',
        'yapi tatil tutanagi', 'proje tadilatina aykiri yapi', 'encumen karari',
        'imar barisi', 'yapi kayit belgesi',
        // Elektrik / EPDK / enerji
        'kacak elektrik tuketimi', 'kacak elektrik', 'elektrik piyasasi kanunu',
        'epdk yonetmeligi', 'tespit tutanagi', 'kayip kacak bedeli',
        'dagitim sirketi', 'elektrik aboneligi',
        // Icra / alacak - ozel hukuk
        'itirazin iptali', 'borca itiraz', 'menfi tespit', 'icra takibi',
        'alacak davasi', 'kambiyo senedi',
        // Is hukuku
        'kidem tazminati', 'ihbar tazminati', 'hizmet tespiti',
        'is akdi feshi', 'is sozlesmesi',
        // Kamu ihale
        'kamu ihale kanunu', 'kik karari', 'ihale iptal',
        // Kira / tasınmaz
        'kira sozlesmesi', 'tahliye davasi', 'tapu tescil',
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

const LEGAL_QUERY_STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'gibi', 'olan', 'olarak', 'dair',
    'karar', 'kararlari', 'karari', 'davasi', 'davasi',
    'maddesi', 'madde', 'sayili', 'kanun', 'kanunu', 'hukuku',
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
    const raw = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';

    const normalized = normalizeForRouting(raw);
    const requiredPhrases = LEGAL_QUERY_PHRASE_ANCHORS
        .filter((phrase) => normalized.includes(phrase))
        .slice(0, 5);

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
    const routed = String(keyword || '').replace(/\s+/g, ' ').trim();
    const raw = String(originalKeyword || routed).replace(/\s+/g, ' ').trim();
    if (!raw) return [];

    const variants = [];
    const seen = new Set();
    const pushVariant = (value) => {
        const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
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
    const matchedAnchors = LEGAL_QUERY_PHRASE_ANCHORS
        .filter((phrase) => normalized.includes(phrase))
        .slice(0, 6);
    const hasDenseAnchorIntent = matchedAnchors.length >= 3;
    if (matchedAnchors.length >= 2) {
        pushVariant(`+"${matchedAnchors[0]}" +"${matchedAnchors[1]}"`);
    }
    if (matchedAnchors.length >= 3) {
        pushVariant(`+"${matchedAnchors[0]}" +"${matchedAnchors[1]}" +"${matchedAnchors[2]}"`);
    }
    if (matchedAnchors.length >= 4) {
        pushVariant(`+"${matchedAnchors[0]}" +"${matchedAnchors[1]}" +"${matchedAnchors[2]}" +"${matchedAnchors[3]}"`);
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
            pushVariant(`${segmentedTokens[0]} ${segmentedTokens[1]} ${segmentedTokens[2]} ${segmentedTokens[3]}`);
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
    if (normalized.includes('muhur kirma') || normalized.includes('muhur fekki')) focused.push('muhur kirma');
    if (normalized.includes('tespit tutanagi')) focused.push('tespit tutanagi');
    if (normalized.includes('dagitim sirketi')) focused.push('dagitim sirketi');
    if (normalized.includes('kayip kacak')) focused.push('kayip kacak bedeli');
    if (normalized.includes('epdk') || normalized.includes('enerji piyasasi')) focused.push('epdk');
    if (normalized.includes('itirazin iptali')) focused.push('itirazin iptali');
    if (normalized.includes('haksiz fiil')) focused.push('haksiz fiil sorumlulugu');
    if (normalized.includes('ispat yuku')) focused.push('ispat yuku');
    if (normalized.includes('tuketici hizmetleri')) focused.push('tuketici hizmetleri');
    if (focused.length >= 2) {
        pushVariant(focused.map(item => (item.includes(' ') ? `+"${item}"` : `+${item}`)).join(' '));
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

const LEGAL_BROAD_PHRASE_SET = new Set([
    'idari para cezasi',
]);

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
const LEGAL_MIN_MATCH_SCORE = 50;
const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsWholeTerm = (haystack = '', term = '') => {
    const token = String(term || '').trim();
    if (!token) return false;
    return new RegExp(`(?:^|\\s)${escapeRegex(token)}(?=\\s|$)`).test(String(haystack || ''));
};

const extractKeywordSignals = (keyword = '') => {
    const raw = String(keyword || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeForRouting(raw);
    if (!normalized) {
        return { tokens: [], anchorTokens: [], phrases: [], phraseKeys: [], corePhraseKeys: [], anchorPhraseKeys: [] };
    }

    const tokens = Array.from(new Set(
        normalized
            .split(/\s+/)
            .filter((token) => token.length >= 3 && !LEGAL_QUERY_STOPWORDS.has(token))
            .slice(0, 20)
    ));

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

    const uniqPhrases = Array.from(new Set(
        phraseCandidates
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    ));
    const phraseKeys = uniqPhrases.map((phrase) => normalizeForRouting(phrase)).filter(Boolean);
    const corePhraseKeys = phraseKeys.filter((phrase) => LEGAL_CORE_PHRASE_SET.has(phrase));
    const anchorTokens = tokens.filter((token) => token.length >= 4 && !LEGAL_GENERIC_MATCH_TOKENS.has(token));
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
    const requiredCorePhraseHits = hasCorePhrases ? (signals.corePhraseKeys.length >= 3 ? 2 : 1) : 0;
    const hasAnchorSignals = signals.anchorTokens.length > 0 || signals.anchorPhraseKeys.length > 0;
    const minTokenHits = hasCorePhrases ? 2 : (signals.tokens.length >= 6 ? 2 : 1);
    const minAnchorTokenHits = signals.anchorTokens.length >= 4 ? 2 : (signals.anchorTokens.length > 0 ? 1 : 0);
    const minScore = LEGAL_MIN_MATCH_SCORE;
    const metadataOnlyMode = !results.some((item) => {
        const ozetLength = String(item?.ozet || item?.snippet || '').trim().length;
        return ozetLength >= 40;
    });

    const scored = results.map((result) => {
        const haystack = normalizeForRouting([
            result?.title || '',
            result?.mahkeme || '',
            result?.daire || '',
            result?.ozet || '',
            result?.esasNo || '',
            result?.kararNo || '',
            result?.tarih || '',
        ].join(' '));

        const tokenHitCount = signals.tokens.filter((token) => containsWholeTerm(haystack, token)).length;
        const anchorTokenHitCount = signals.anchorTokens.filter((token) => containsWholeTerm(haystack, token)).length;
        const phraseHitCount = signals.phraseKeys.filter((phrase) => phrase && containsWholeTerm(haystack, phrase)).length;
        const corePhraseHitCount = signals.corePhraseKeys.filter((phrase) => phrase && containsWholeTerm(haystack, phrase)).length;
        const anchorPhraseHitCount = signals.anchorPhraseKeys.filter((phrase) => phrase && containsWholeTerm(haystack, phrase)).length;
        const tokenCoverage = signals.tokens.length > 0 ? tokenHitCount / signals.tokens.length : 0;
        const phraseCoverage = signals.phraseKeys.length > 0 ? phraseHitCount / signals.phraseKeys.length : 0;
        const anchorTokenCoverage = signals.anchorTokens.length > 0 ? anchorTokenHitCount / signals.anchorTokens.length : 0;
        const upstreamScore = Number(result?.relevanceScore);

        let computedScore = (tokenCoverage * 68) + (phraseCoverage * 22);
        if (tokenHitCount >= 2) computedScore += 8;
        if (tokenHitCount >= 3) computedScore += 4;
        if (anchorTokenCoverage > 0) computedScore += anchorTokenCoverage * 12;
        if (anchorTokenHitCount >= 2) computedScore += 8;
        if (phraseHitCount > 0) computedScore += 10;
        if (corePhraseHitCount > 0) computedScore += 12;
        if (anchorPhraseHitCount > 0) computedScore += 10;

        if (metadataOnlyMode && tokenHitCount === 0 && phraseHitCount === 0 && corePhraseHitCount === 0) {
            computedScore = 0;
        }

        const finalScore = clampScore(computedScore);
        const relaxedCoreFallback = hasCorePhrases
            && corePhraseHitCount === 0
            && anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1)
            && tokenHitCount >= Math.max(3, minTokenHits + 1);
        const corePhraseRequirementSatisfied = !hasCorePhrases || corePhraseHitCount >= requiredCorePhraseHits || relaxedCoreFallback;
        const anchorTokenFallbackSatisfied = anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1);
        const anchorRequirementSatisfied = signals.anchorPhraseKeys.length > 0
            ? (anchorPhraseHitCount > 0 || anchorTokenFallbackSatisfied)
            : (!hasAnchorSignals || anchorTokenHitCount >= minAnchorTokenHits);
        const metadataOnlyMatch = phraseHitCount > 0 || tokenHitCount >= minTokenHits;
        const standardMatch = (
            phraseHitCount > 0
            || tokenHitCount >= minTokenHits
            || finalScore >= minScore
        );
        // In metadata-only mode (no özet/snippet), be very lenient —
        // let content-based re-ranking do the real filtering with full text.
        const isMatch = !hasSignals
            || metadataOnlyMode
            || (corePhraseRequirementSatisfied && anchorRequirementSatisfied && standardMatch);

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

    const scoredSorted = scored
        .sort((a, b) => {
            const diff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
            if (diff !== 0) return diff;
            return (b._upstreamScore || 0) - (a._upstreamScore || 0);
        });

    const matched = scoredSorted
        .filter((item) => item._isMatch)
        .map(({ _tokenHitCount, _anchorTokenHitCount, _phraseHitCount, _corePhraseHitCount, _anchorPhraseHitCount, _upstreamScore, _isMatch, ...rest }) => rest);

    const ranked = scoredSorted
        .map(({ _tokenHitCount, _anchorTokenHitCount, _phraseHitCount, _corePhraseHitCount, _anchorPhraseHitCount, _upstreamScore, _isMatch, ...rest }) => rest);

    return {
        results: matched,
        filteredOutCount: Math.max(0, scoredSorted.length - matched.length),
        scoredResults: ranked,
    };
};

const getLegalDecisionDocumentId = (result = {}) =>
    String(result?.documentId || result?.id || '').trim();

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
    const requiredCorePhraseHits = hasCorePhrases ? (signals.corePhraseKeys.length >= 3 ? 2 : 1) : 0;
    const hasAnchorSignals = signals.anchorTokens.length > 0 || signals.anchorPhraseKeys.length > 0;
    const minTokenHits = hasCorePhrases ? 2 : (signals.tokens.length >= 6 ? 2 : 1);
    const minAnchorTokenHits = signals.anchorTokens.length >= 4 ? 2 : (signals.anchorTokens.length > 0 ? 1 : 0);
    const minScore = LEGAL_MIN_MATCH_SCORE;

    const BATCH_SIZE = 5;
    const settled = [];

    for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
        const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (result) => {
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
                const bedestenDoc = await getBedestenDocumentContent(documentId);
                const content = String(bedestenDoc?.content || '').trim();
                if (!content) {
                    return {
                        ok: true,
                        documentId,
                        result,
                        content: '',
                    };
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
        }));

        settled.push(...batchResults);

        if (i + BATCH_SIZE < uniqueCandidates.length) {
            await new Promise(resolve => setTimeout(resolve, 800)); // Be gentle to UYAP :)
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
        const contentHaystack = normalizeForRouting([
            item.content || '',
            item?.result?.title || '',
            item?.result?.mahkeme || '',
            item?.result?.daire || '',
            item?.result?.ozet || '',
            item?.result?.snippet || '',
            item?.result?.esasNo || '',
            item?.result?.kararNo || '',
        ].join(' '));
        if (!contentHaystack) continue;

        const tokenHitCount = signals.tokens.filter((token) => containsWholeTerm(contentHaystack, token)).length;
        const anchorTokenHitCount = signals.anchorTokens.filter((token) => containsWholeTerm(contentHaystack, token)).length;
        const phraseHitCount = signals.phraseKeys.filter((phrase) => phrase && containsWholeTerm(contentHaystack, phrase)).length;
        const corePhraseHitCount = signals.corePhraseKeys.filter((phrase) => phrase && containsWholeTerm(contentHaystack, phrase)).length;
        const anchorPhraseHitCount = signals.anchorPhraseKeys.filter((phrase) => phrase && containsWholeTerm(contentHaystack, phrase)).length;
        const tokenCoverage = signals.tokens.length > 0 ? tokenHitCount / signals.tokens.length : 0;
        const phraseCoverage = signals.phraseKeys.length > 0 ? phraseHitCount / signals.phraseKeys.length : 0;
        const anchorTokenCoverage = signals.anchorTokens.length > 0 ? anchorTokenHitCount / signals.anchorTokens.length : 0;

        let contentScore = (tokenCoverage * 72) + (phraseCoverage * 24);
        if (tokenHitCount >= 2) contentScore += 8;
        if (tokenHitCount >= 3) contentScore += 5;
        if (anchorTokenCoverage > 0) contentScore += anchorTokenCoverage * 14;
        if (anchorTokenHitCount >= 2) contentScore += 10;
        if (phraseHitCount > 0) contentScore += 12;
        if (corePhraseHitCount > 0) contentScore += 14;
        if (anchorPhraseHitCount > 0) contentScore += 12;

        const normalizedContentScore = clampScore(contentScore);
        const relaxedCoreFallback = hasCorePhrases
            && corePhraseHitCount === 0
            && anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1)
            && tokenHitCount >= Math.max(4, minTokenHits + 1);
        const corePhraseRequirementSatisfied = !hasCorePhrases || corePhraseHitCount >= requiredCorePhraseHits || relaxedCoreFallback;
        const anchorTokenFallbackSatisfied = anchorTokenHitCount >= Math.max(2, minAnchorTokenHits + 1);
        const anchorRequirementSatisfied = signals.anchorPhraseKeys.length > 0
            ? (anchorPhraseHitCount > 0 || anchorTokenFallbackSatisfied)
            : (!hasAnchorSignals || anchorTokenHitCount >= minAnchorTokenHits);
        const hasContentHit = phraseHitCount > 0 || tokenHitCount >= minTokenHits;
        // Require at least 70% of keyword tokens to appear in the full text.
        // Low-coverage results are irrelevant noise for legal documents.
        const isMatch = tokenCoverage >= 0.7 || (phraseHitCount >= 2 && tokenCoverage >= 0.5);

        if (!isMatch) continue;

        matchedCount += 1;
        const baseRelevanceScore = Number(item?.result?.relevanceScore) || 0;

        let snippetText = item.result?.ozet || item.result?.snippet;
        if (!snippetText && item.content) {
            // Get first ~600 chars as snippet
            const cleanContent = item.content.replace(/\s+/g, ' ').trim();
            snippetText = cleanContent.length > 600 ? cleanContent.substring(0, 600) + '...' : cleanContent;
        }

        matched.push({
            ...item.result,
            relevanceScore: clampScore(Math.max(baseRelevanceScore, normalizedContentScore)),
            ozet: snippetText || `Anahtar kelime eslesmesi bulundu (metin skoru: ${normalizedContentScore}).`,
            snippet: item.content || snippetText || `Anahtar kelime eslesmesi bulundu (metin skoru: ${normalizedContentScore}).`,
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

const runPhraseFallbackSearch = async ({ keyword = '', source = 'all', filters = {} }) => {
    const normalizedKeyword = normalizeForRouting(keyword);
    const signals = extractKeywordSignals(keyword);
    const directKnownPhrases = LEGAL_MATCH_PHRASES
        .filter((phrase) => normalizedKeyword.includes(phrase))
        .slice(0, 6);
    const compactTokens = normalizedKeyword
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !LEGAL_QUERY_STOPWORDS.has(token))
        .slice(0, 16);
    const ngramCandidates = [];
    for (let idx = 0; idx < compactTokens.length - 1; idx += 1) {
        ngramCandidates.push(`${compactTokens[idx]} ${compactTokens[idx + 1]}`);
        if (idx + 2 < compactTokens.length) {
            ngramCandidates.push(`${compactTokens[idx]} ${compactTokens[idx + 1]} ${compactTokens[idx + 2]}`);
        }
    }

    const phraseCandidates = Array.from(new Set([
        ...(Array.isArray(signals.anchorPhraseKeys) ? signals.anchorPhraseKeys : []),
        ...(Array.isArray(signals.corePhraseKeys) ? signals.corePhraseKeys : []),
        ...directKnownPhrases,
        ...ngramCandidates,
    ]))
        .filter((phrase) => String(phrase || '').trim().split(/\s+/).length >= 2)
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
        for (const item of (Array.isArray(items) ? items : [])) {
            const key = getLegalDecisionDocumentId(item)
                || `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
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
            if (phraseRerank.applied && Array.isArray(phraseRerank.results) && phraseRerank.results.length > 0) {
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
        } else if (Array.isArray(fullKeywordScoring.scoredResults) && fullKeywordScoring.scoredResults.length > 0) {
            // Include anything that has at least some relevance to the full context.
            finalResults = fullKeywordScoring.scoredResults.filter(item => Number(item?.relevanceScore || 0) >= 75);
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
        const key = getLegalDecisionDocumentId(item)
            || `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniq.push(item);
        if (uniq.length >= LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT) break;
    }
    if (uniq.length === 0) {
        return { applied: false, results: [] };
    }

    const promptRows = uniq.map((item, index) => {
        const key = getLegalDecisionDocumentId(item) || `cand-${index + 1}`;
        const preview = String(item?.ozet || item?.snippet || '').replace(/\s+/g, ' ').slice(0, 240);
        return `${index + 1}) id=${key} | title=${item?.title || ''} | daire=${item?.daire || ''} | esas=${item?.esasNo || ''} | karar=${item?.kararNo || ''} | ozet=${preview}`;
    }).join('\n');

    const prompt = [
        'Asagidaki Turkce hukuk karar adaylarini verilen sorguya gore anlamsal olarak puanla.',
        'Kurallar:',
        '- Sadece JSON dondur.',
        '- JSON array formati: [{"id":"...","score":0-100}]',
        '- Sorguyla ilgisiz adaylara dusuk skor ver (0-30).',
        '- En ilgili adaylara yuksek skor ver (70-100).',
        `Sorgu: ${keyword}`,
        '',
        'Adaylar:',
        promptRows,
    ].join('\n');

    try {
        const response = await generateContentWithRetry({
            model: MODEL_NAME,
            contents: prompt,
            config: { temperature: 0.1 },
        }, { maxRetries: 0, timeoutMs: Math.max(9000, LEGAL_ROUTER_TIMEOUT_MS) });

        const parsed = maybeExtractJson(response?.text || '');
        const list = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.results) ? parsed.results : []);
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

        const ranked = uniq.map((item, index) => {
            const id = getLegalDecisionDocumentId(item) || `cand-${index + 1}`;
            const semanticScore = Number(scoreMap.get(id) || 0);
            return {
                ...item,
                relevanceScore: clampScore(Math.max(Number(item?.relevanceScore || 0), semanticScore)),
                _semanticScore: semanticScore,
            };
        })
            .filter((item) => Number(item._semanticScore || 0) >= 40)
            .sort((a, b) => Number(b._semanticScore || 0) - Number(a._semanticScore || 0))
            .map(({ _semanticScore, ...rest }) => rest);

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
    addSignals('danistay', [
        // Imar / yapi (idari islem)
        'imar', '3194', 'ruhsat', 'ruhsatsiz', 'kacak yapi',
        'yikim karari', 'encumen', 'yapi tatil', 'imar barisi', 'yapi kayit belgesi', 'gecici 16',
        // Idari yargi terimleri
        'idari yargi', 'idare mahkemesi', 'tam yargi', 'tam yargi davasi', 'iptal davasi', 'idari islemin iptali',
        'yurutmenin durdurulmasi', 'kamulastirma bedeli',
        'bolge idare', 'vergi mahkemesi',
        'belediye', 'idari para cezasi',
        // Kamu ihale
        'kamu ihale', 'kik', 'ihale iptal',
        // Elektrik / EPDK / enerji -> idari yargi
        'epdk', 'tedas', 'kacak elektrik', 'elektrik piyasasi',
        'kayip kacak', 'enerji piyasasi', 'tespit tutanagi elektrik',
        'dagitim lisansi', 'elektrik abonelik',
        // Vergi / kamu personeli
        'vergi inceleme', 'vergi cezasi', 'disiplin cezasi', 'gumruk',
    ], 1.35);

    // NOT: 'kacak' tek basina sinyal degil; 'kacak yapi' ve 'kacak elektrik'
    // olarak ayri ayri yukarida tanimlandigi icin dogru baglamda calismaktadir.

    // --- Yargitay sinyalleri: ozel hukuk ve ceza ---
    addSignals('yargitay', [
        // Kanun kodlari
        'tck', 'cmk', 'hmk', 'tbk', 'tmk', 'iik', 'ttk',
        // Icra / alacak
        'kambiyo', 'icra takibi', 'icra iflas', 'borca itiraz',
        'itirazin iptali', // cogunlukla icra hukuku -> Yargitay
        'menfi tespit', 'alacak davasi', 'zaman asimi', 'zamanaasimi', 'konkordato', 'iflasin ertelenmesi', 'tasarrufun iptali',
        // Ceza
        'ceza', 'dolandiricilik', 'hirsizlik', 'yaralama', 'tehdit', 'uyusturucu', 'uyusturucu madde', 'kasten oldurme', 'haksiz tahrik', 'gorevi kotuye kullanma',
        // Aile / miras
        'bosanma', 'nafaka', 'velayet', 'miras', 'veraset',
        // Is hukuku
        'is davasi', 'kidem tazminati', 'ihbar tazminati', 'hizmet tespiti', 'is akdi', 'ise iade', 'fazla mesai alacagi',
        // Kira / tasinmaz
        'kira sozlesmesi', 'kira alacagi', 'tahliye', 'tapu tescil',
        // Trafik / sigorta
        'trafik kazasi', 'sigorta tazminati',
    ], 1.1);

    // Baglamsal duzeltme: 'itirazin iptali' + idari baglamdaysa -> Danistay'a kaydir
    if (text.includes('itirazin iptali') &&
        (text.includes('idari') || text.includes('vergi') ||
            text.includes('belediye') || text.includes('kamu') || text.includes('idare'))) {
        scores['danistay'] += 2.5;
        scores['yargitay'] = Math.max(0, scores['yargitay'] - 1.5);
    }

    // Baglamsal duzeltme: kacak elektrik + icra/alacak/zaman asimi baglami -> Yargitay
    if (text.includes('kacak elektrik') &&
        (text.includes('itirazin iptali') || text.includes('icra') || text.includes('alacak') || text.includes('menfi tespit') || text.includes('zaman asimi')) &&
        !(text.includes('idari') || text.includes('epdk') || text.includes('idare mahkemesi'))) {
        scores['yargitay'] += 3.0;
        scores['danistay'] = Math.max(0, scores['danistay'] - 1.5);
    }
    if (text.includes('kacak elektrik') && text.includes('tespit tutanagi') &&
        (text.includes('hukuki') || text.includes('gecerlilik') || text.includes('gecerliligi')) &&
        !(text.includes('idari') || text.includes('epdk') || text.includes('idare mahkemesi'))) {
        scores['yargitay'] += 2.5;
        scores['danistay'] = Math.max(0, scores['danistay'] - 1.0);
    }

    // Baglamsal duzeltme: imar barisi/yapi kayit/gecici 16 -> Danistay
    if (text.includes('imar barisi') || text.includes('yapi kayit belgesi') || text.includes('gecici 16') || text.includes('3194')) {
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
        '  - Stop-word\'leri at (ve, ile, icin, olan, hakkinda, gibi...)',
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
    const originalKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();
    const compactKeyword = compactLegalKeywordQuery(originalKeyword);
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

    const routedKeyword = (router === 'ai' && aiDecision?.compactQuery)
        ? aiDecision.compactQuery // YAPAY ZEKANIN OLUŞTURDUĞU SENSİBLE CONTEXT BOZULMADAN GÖNDERİLİYOR!
        : compactKeyword;

    return {
        requestedSource: requested,
        resolvedSource,
        confidence,
        router,
        keyword: routedKeyword || originalKeyword,
        originalKeyword,
        fallbackSources,
        filters: nextFilters,
        compacted: compactKeyword !== originalKeyword,
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
    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : maybeExtractJson(toolResponse.text) || {};
    const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];

    return decisions.map((item, index) => toBedestenFormattedDecision({
        ...item,
        relevanceScore: Number(item?.relevanceScore ?? item?.score) || Math.max(0, 100 - (index * 4)),
    }, index));
}

async function searchEmsalViaMcp(keyword, filters = {}) {
    try {
        const mcpArgs = {
            keyword: String(keyword || '').trim(),
        };
        if (filters.kararTarihiStart) mcpArgs.baslangicTarihi = filters.kararTarihiStart;
        if (filters.kararTarihiEnd) mcpArgs.bitisTarihi = filters.kararTarihiEnd;

        const toolResponse = await callYargiMcpTool('search_emsal_detailed_decisions', mcpArgs);
        const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
            ? toolResponse.parsed
            : maybeExtractJson(toolResponse.text) || {};

        // UYAP Emsal API response structure
        const emsalData = payload?.data?.data || payload?.data || [];
        const decisions = Array.isArray(emsalData) ? emsalData : [];

        return decisions.map((item, index) => {
            const safe = item || {};
            return {
                id: safe.id || `emsal-${index + 1}`,
                documentId: safe.id || '',
                title: `${safe.yargiBirimi || safe.mahkeme || 'Emsal'} ${safe.daire || ''}`.trim() || `Emsal Karar ${index + 1}`,
                esasNo: safe.esasNo || '',
                kararNo: safe.kararNo || '',
                tarih: safe.kararTarihi || safe.tarih || '',
                daire: safe.daire || safe.yargiBirimi || '',
                ozet: safe.kararOzeti || safe.ozet || '',
                relevanceScore: Math.max(0, 100 - (index * 5)),
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
        const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
            ? toolResponse.parsed
            : maybeExtractJson(toolResponse.text) || {};
        const markdown = String(payload?.markdown_content || payload?.content || toolResponse.text || '').trim();
        return {
            content: markdown,
            mimeType: 'text/markdown',
        };
    } catch (error) {
        console.error('UYAP Emsal document fetch failed:', error);
        return { content: '', mimeType: 'text/markdown' };
    }
}

async function searchBedestenAPI(keyword, source, filters = {}) {
    // Always search Bedesten directly to avoid rate limiting.
    // MCP is used for semantic search, not keyword search variants.

    const pageNumber = Math.max(1, Number(filters.pageNumber) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || LEGAL_RESULT_RETURN_LIMIT));
    const rawBirimAdi = typeof filters.birimAdi === 'string' ? filters.birimAdi.trim() : '';
    const birimAdi = (!rawBirimAdi || rawBirimAdi.toUpperCase() === 'ALL') ? '' : rawBirimAdi;

    const payload = {
        data: {
            pageSize,
            pageNumber,
            itemTypeList: getBedestenItemTypeList(source),
            phrase: keyword,
            birimAdi,
            kararTarihiStart: filters.kararTarihiStart || '',
            kararTarihiEnd: filters.kararTarihiEnd || '',
            sortFields: Array.isArray(filters.sortFields) && filters.sortFields.length > 0 ? filters.sortFields : ['KARAR_TARIHI'],
            sortDirection: (filters.sortDirection || 'desc').toString().toLowerCase() === 'asc' ? 'asc' : 'desc',
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };
    if (!payload.data.birimAdi) {
        delete payload.data.birimAdi;
    }

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
            await postYargiMcp({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);
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
                    title: item?.title || `${meta?.birim_adi || ''} ${meta?.esas_no ? 'E. ' + meta.esas_no : ''}`.trim() || `Semantik Sonuc ${index + 1}`,
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
    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : maybeExtractJson(toolResponse.text) || {};
    const markdown = String(payload?.markdown_content || payload?.content || toolResponse.text || '').trim();
    return {
        content: markdown,
        mimeType: 'text/markdown',
    };
}

async function getBedestenDocumentContent(documentId) {
    // Always fetch directly from Bedesten API for re-ranking.
    // Going through MCP causes double UYAP requests and rate limiting.
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

async function _searchEmsalFallback(keyword, sourceHint = 'all') {
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

async function _getDocumentViaAIFallback({ keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' }) {
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

    const provider = USE_YARGI_MCP ? 'yargi-mcp' : 'bedesten';
    const warningParts = [];
    let results = [];
    let usedSource = routingPlan.resolvedSource;
    const bedestenErrors = [];
    let semanticCandidates = [];
    // AI mantıklı bir keyword/context oluşturduğunu varsaydığımızdan
    // saçma varyantlar ve regex silmeleri YAPMIYORUZ. Doğrudan AI sorgusunu aratıyoruz.
    const queryVariants = buildBedestenQueryVariants(routingPlan.keyword, routingPlan.originalKeyword);
    const baseKeyword = routingPlan.originalKeyword || routingPlan.keyword;
    const normalizedBaseKeyword = normalizeForRouting(baseKeyword);
    const denseAnchorIntent = LEGAL_QUERY_PHRASE_ANCHORS
        .filter((phrase) => normalizedBaseKeyword.includes(phrase))
        .length >= 3;

    const requestedSourceNormalized = normalizeSourceValue(source, 'all');
    const dominantVariantSource = requestedSourceNormalized === 'all' && Number(routingPlan.confidence || 0) >= 0.78
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
                if (aiDecision?.source && aiDecision.confidence >= Math.max(0.5, ruleDecision.confidence - 0.05)) {
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
        for (const item of (Array.isArray(items) ? items : [])) {
            const key = getLegalDecisionDocumentId(item)
                || `${item?.title || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.tarih || ''}`;
            if (!key || sourceSeen.has(key)) continue;
            sourceSeen.add(key);
            sourceCollected.push(item);
        }
    };

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
                if (denseAnchorIntent && strictVariantHitCount >= 2 && sourceCollected.length >= 12) break;
            }
        } catch (error) {
            lastSourceError = error;
            if (error?.code === 'REQUEST_TIMEOUT') {
                warningParts.push('MCP/Bedesten aramasi zaman asimina ugradi.');
                break;
            }
            console.error(`Bedesten search error (${plan.source}, variant=${plan.variant}):`, error);
        }
    }

    // === UYAP Emsal parallel search — her konu icin, hardcoded domain listesi yok ===
    const shouldSearchEmsal = USE_YARGI_MCP && (
        requestedSourceNormalized === 'uyap'
        || requestedSourceNormalized === 'all'
        || sourceCollected.length < 8
    );

    if (shouldSearchEmsal) {
        try {
            const emsalKeyword = baseKeyword.length > 120
                ? compactLegalKeywordQuery(baseKeyword, 120)
                : baseKeyword;
            const emsalResults = await searchEmsalViaMcp(emsalKeyword, routingPlan.filters);
            if (Array.isArray(emsalResults) && emsalResults.length > 0) {
                pushCollected(emsalResults);
                resolvedSources.add('uyap');
            }
        } catch (emsalErr) {
            console.error('UYAP Emsal parallel search error:', emsalErr);
        }
    }

    // === MCP Semantic Search — AI embedding ile semantik siralama ===
    // keyword aramasindan donen sonuc azsa veya kullanici isterse, MCP'nin semantic tool'unu cagir
    const needsSemanticBoost = USE_MCP_SEMANTIC_SEARCH && USE_YARGI_MCP && (
        sourceCollected.length < 5
        || (baseKeyword.split(/\s+/).length >= 4) // birden fazla kelimelik sorgu = semantik daha iyi
    );

    if (needsSemanticBoost) {
        try {
            // initial_keyword: kisa keyword arama icin, query: detayli cumle semantik icin
            const shortKeyword = compactLegalKeywordQuery(baseKeyword, 80);
            const semanticQuery = routingPlan.originalKeyword || baseKeyword;
            const semanticResults = await searchSemanticViaMcp(
                shortKeyword,
                semanticQuery,
                requestedSourceNormalized,
                15
            );
            if (Array.isArray(semanticResults) && semanticResults.length > 0) {
                pushCollected(semanticResults);
                resolvedSources.add('semantic');
                warningParts.push('Semantik arama ile ek ilgili sonuclar bulundu.');
            }
        } catch (semErr) {
            console.error('MCP semantic search error:', semErr);
        }
    }

    if (sourceCollected.length > 0) {
        results = sourceCollected.slice(0, LEGAL_VARIANT_RESULT_CAP);
        semanticCandidates = sourceCollected.slice(0, LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT);
        if (resolvedSources.size === 1) {
            usedSource = Array.from(resolvedSources)[0];
        } else if (resolvedSources.size > 1) {
            usedSource = 'all';
        }
    }
    if (lastSourceError) {
        bedestenErrors.push(`${usedSource || routingPlan.resolvedSource}:${lastSourceError?.message || 'unknown-error'}`);
    }

    if (Array.isArray(results) && results.length > 0) {
        const scoringKeyword = routingPlan.originalKeyword || routingPlan.keyword;
        const scoring = scoreAndFilterResultsByKeyword(
            results,
            scoringKeyword
        );

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
        for (const item of (Array.isArray(scoring.results) ? scoring.results : [])) {
            pushContentCandidate(item);
        }
        for (const item of (Array.isArray(scoring.scoredResults) ? scoring.scoredResults : [])) {
            pushContentCandidate(item);
        }
        semanticCandidates = contentCandidates.slice(0, LEGAL_GEMINI_SEMANTIC_CANDIDATE_LIMIT);

        const contentRerank = await rerankResultsByDecisionContent(contentCandidates, scoringKeyword);

        if (contentRerank.applied && contentRerank.fetchedCount > 0) {
            if (Array.isArray(contentRerank.results) && contentRerank.results.length > 0) {
                results = contentRerank.results.slice(0, Math.min(LEGAL_RESULT_RETURN_LIMIT, contentRerank.results.length));
                if (contentRerank.filteredOutCount > 0) {
                    warningParts.push(`${contentRerank.filteredOutCount} sonuc tam metinde anahtar kelime uyusmasi dusuk oldugu icin elendi.`);
                }
            } else {
                results = [];
                warningParts.push('MCP tam metinlerinde anahtar kelime uyusmasi bulunamadi.');
            }
        } else {
            if (Array.isArray(scoring.results) && scoring.results.length > 0) {
                results = scoring.results;
            } else if (Array.isArray(scoring.scoredResults) && scoring.scoredResults.length > 0) {
                const thresholdMatches = scoring.scoredResults
                    .filter((item) => Number(item?.relevanceScore || 0) >= LEGAL_MIN_MATCH_SCORE);
                if (thresholdMatches.length > 0) {
                    results = thresholdMatches.slice(0, Math.min(LEGAL_RESULT_RETURN_LIMIT, thresholdMatches.length));
                    warningParts.push(`Kati ifade filtresi nedeniyle skor >= ${LEGAL_MIN_MATCH_SCORE} olan en yakin MCP sonuclari listelendi.`);
                } else {
                    results = [];
                }
            } else {
                results = [];
            }

            if (contentRerank.applied && contentRerank.fetchErrorCount > 0) {
                warningParts.push('Bazi karar tam metinleri MCP uzerinden cekilemedi.');
            }
            if (scoring.filteredOutCount > 0 && Array.isArray(scoring.results) && scoring.results.length > 0) {
                warningParts.push(`${scoring.filteredOutCount} sonuc anahtar kelime uyusmasi dusuk oldugu icin elendi.`);
            }
        }
    }

    if (!Array.isArray(results) || results.length === 0) {
        const semanticRerank = await semanticRerankWithGemini({
            candidates: semanticCandidates,
            keyword: routingPlan.originalKeyword || routingPlan.keyword,
        });
        if (semanticRerank.applied && Array.isArray(semanticRerank.results) && semanticRerank.results.length > 0) {
            results = semanticRerank.results.slice(0, LEGAL_RESULT_RETURN_LIMIT);
            warningParts.push('Gemini semantik siralama fallback kullanildi.');
        }
    }

    if (!Array.isArray(results) || results.length === 0) {
        const phraseFallback = await runPhraseFallbackSearch({
            keyword: routingPlan.originalKeyword || routingPlan.keyword,
            source: usedSource || routingPlan.resolvedSource || 'all',
            filters: routingPlan.filters,
        });
        if (phraseFallback.applied && Array.isArray(phraseFallback.results) && phraseFallback.results.length > 0) {
            results = phraseFallback.results;
            for (let i = warningParts.length - 1; i >= 0; i -= 1) {
                if (String(warningParts[i] || '').includes('MCP tam metinlerinde anahtar kelime uyusmasi bulunamadi.')) {
                    warningParts.splice(i, 1);
                }
            }
            warningParts.push('Birlesik sorgu parcalanarak anahtar ifadelerle MCP aramasi yapildi.');
        }
    }

    if (!Array.isArray(results) || results.length === 0) {
        const uniqueWarnings = Array.from(new Set(warningParts));
        return res.json({
            success: true,
            source: usedSource || routingPlan.resolvedSource || 'all',
            provider,
            keyword: routingPlan.keyword,
            results: [],
            warning: uniqueWarnings.length > 0
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
    const uniqueWarnings = Array.from(new Set(warningParts));

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
        ...(uniqueWarnings.length > 0 ? { warning: uniqueWarnings.join(' ') } : {}),
    });
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
