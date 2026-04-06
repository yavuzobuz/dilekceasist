import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { AI_CONFIG } from '../../config.js';
import { GEMINI_STABLE_FALLBACK_MODEL_NAME, getGeminiClient } from './_shared.js';
import { getCurrentDateContext } from './current-date.js';

const MODEL_NAME = GEMINI_STABLE_FALLBACK_MODEL_NAME || 'gemini-2.5-flash';
const SEARCH_TIMEOUT_MS = Number(process.env.GEMINI_WEB_SEARCH_TIMEOUT_MS || 45000);
const SEARCH_MAX_RETRIES = Math.max(1, Number(process.env.GEMINI_WEB_SEARCH_MAX_RETRIES || AI_CONFIG.MAX_RETRIES || 3));
const INITIAL_RETRY_DELAY_MS = Math.max(250, Number(process.env.GEMINI_WEB_SEARCH_RETRY_DELAY_MS || AI_CONFIG.INITIAL_RETRY_DELAY_MS || 1000));

const SEARCH_COMMAND_PATTERNS = [
    /\b(?:web|internet(?:ten|te)?|google(?:'?da)?|webde|webden)\s*(?:ara(?:ma(?:si)?|stir(?:ma(?:si)?)?)?|bul|tara|getir|incele|listele)\s*(?:yap(?:ilsin)?|et)?\b/gi,
    /\b(?:ara(?:ma(?:si)?|stir(?:ma(?:si)?)?)?|bul|tara|getir|incele|listele)\s*(?:web|internet(?:ten|te)?|google(?:'?da)?|webde|webden)\b/gi,
    /\bderin\s*(?:arastir(?:ma)?|ara)\s*(?:yap)?\b/gi,
    /\b(?:bu\s+konu\s+(?:icin|hakkinda|ile\s+ilgili))\b/gi,
    /\b(?:konu\s+hakkinda)\b/gi,
    /\b(?:guncel\s+arama\s+yap)\b/gi,
    /\b(?:hesaplari\s+dogrula)\b/gi,
    /\b(?:yaparak\s+dogrula)\b/gi,
    /\b(?:dogrula)\b/gi,
];

const COMMAND_ONLY_TOKENS = new Set([
    'web', 'internet', 'internetten', 'webde', 'webden', 'google', 'googleda',
    'ara', 'arama', 'aramasi', 'arastir', 'arastirma', 'bul', 'tara', 'getir',
    'incele', 'listele', 'yap', 'yaparak', 'dogrula', 'kaynak', 'link', 'url',
    'konu', 'hakkinda', 'ilgili', 'guncel', 'derin',
]);

const normalizeKeywordText = (value) => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripSearchCommandPhrases = (raw) => {
    let text = normalizeKeywordText(raw);
    for (const pattern of SEARCH_COMMAND_PATTERNS) {
        text = text.replace(pattern, ' ');
    }
    return text.replace(/\s+/g, ' ').trim();
};

const normalizeKeywordList = (rawKeywords) => {
    if (!Array.isArray(rawKeywords)) return [];

    const seen = new Set();
    const cleaned = [];

    rawKeywords.forEach((item) => {
        const value = String(item || '').replace(/\s+/g, ' ').trim();
        if (!value) return;
        const strippedValue = stripSearchCommandPhrases(value) || value;
        const normalizedValue = normalizeKeywordText(strippedValue);
        if (!normalizedValue) return;
        const tokens = normalizedValue.split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || tokens.every((token) => COMMAND_ONLY_TOKENS.has(token))) return;
        const key = normalizedValue;
        if (seen.has(key)) return;
        seen.add(key);
        cleaned.push(strippedValue.slice(0, 120));
    });

    return cleaned.slice(0, 8);
};

const normalizeSearchTerms = ({ rawKeywords, rawQuery } = {}) => {
    const normalizedKeywords = normalizeKeywordList(rawKeywords);
    if (normalizedKeywords.length > 0) return normalizedKeywords;

    const normalizedQuery = String(rawQuery || '').replace(/\s+/g, ' ').trim();
    if (!normalizedQuery) return [];

    return normalizeKeywordList([normalizedQuery]);
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableSearchError = (error) => {
    const status = Number(error?.status || error?.code || 0);
    const message = String(error?.message || error || '').toLowerCase();

    return status === 429
        || status === 500
        || status === 503
        || message.includes('high demand')
        || message.includes('unavailable')
        || message.includes('try again later')
        || message.includes('timed out')
        || message.includes('timeout');
};

const runWithRetry = async (task, { retries = SEARCH_MAX_RETRIES, initialDelayMs = INITIAL_RETRY_DELAY_MS } = {}) => {
    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            attempt += 1;

            if (attempt >= retries || !isRetryableSearchError(error)) {
                throw error;
            }

            await sleep(initialDelayMs * (2 ** (attempt - 1)));
        }
    }

    throw lastError;
};

const buildPrimaryPrompt = (keywords) => {
    const currentDateContext = getCurrentDateContext();
    const mevzuatQueries = keywords.map((kw) => `"${kw}" kanun maddesi hukum`);

    return `
## ARAMA GOREVI: HUKUKI WEB ARASTIRMASI

### GUNCEL TARIH BAGLAMI
${currentDateContext.instruction}

### ANAHTAR KELIMELER
${keywords.join(', ')}

### ARAMA STRATEJISI
**1. Hukuki Web Arastirmasi**
${keywords.map((q) => `- ${q}`).join('\n')}

**2. Mevzuat Aramasi**
${mevzuatQueries.map((q) => `- ${q}`).join('\n')}

## BEKLENTILER
1. Konuyu ozetle
2. Ilgili mevzuati listele
3. Pratik risk ve dikkat noktalarini belirt
`;
};

const SYSTEM_INSTRUCTION = `${getCurrentDateContext().instruction}

Sen, Turk hukuku alaninda genel web arastirmasi yapan bir yardimci asistansin.
Uydurma karar veya kaynak verme.
Konuyu kisa, net ve kullanisli sekilde ozetle.`;

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const keywords = normalizeSearchTerms({
            rawKeywords: req?.body?.keywords,
            rawQuery: req?.body?.query,
        });

        if (keywords.length === 0) {
            return res.status(400).json({ error: 'keywords veya query gerekli' });
        }

        const ai = getGeminiClient();

        const primaryPrompt = buildPrimaryPrompt(keywords);

        let response = null;
        let degraded = false;
        let warning = null;

        let _debugPrimaryError = null;
        let _debugFallbackError = null;

        try {
            response = await runWithRetry(
                () => withTimeout(
                    ai.models.generateContent({
                        model: MODEL_NAME,
                        contents: primaryPrompt,
                        config: {
                            tools: [{ googleSearch: {} }],
                            systemInstruction: SYSTEM_INSTRUCTION,
                        },
                    }),
                    SEARCH_TIMEOUT_MS,
                    'Web search timed out'
                )
            );
        } catch (searchError) {
            degraded = true;
            _debugPrimaryError = String(searchError?.message || searchError || 'unknown');
            console.error('[web-search] Primary search error:', searchError);
            warning = getSafeErrorMessage(searchError, 'Live web search failed');

            const fallbackPrompt = `Asagidaki anahtar kelimelere gore Turk hukuku kapsaminda kisa bir mevzuat odakli on degerlendirme ver. Uydurma karar numarasi yazma.\n\nAnahtar kelimeler: ${keywords.join(', ')}`;

            try {
                response = await withTimeout(
                    ai.models.generateContent({
                        model: MODEL_NAME,
                        contents: fallbackPrompt,
                        config: {
                            systemInstruction: SYSTEM_INSTRUCTION,
                        },
                    }),
                    10000, // 10s cap so 45s + 10s = 55s (under 60s Vercel limit)
                    'Fallback search timed out'
                );
            } catch (fallbackError) {
                _debugFallbackError = String(fallbackError?.message || fallbackError || 'unknown');
                console.error('[web-search] Fallback search error:', fallbackError);
                warning = getSafeErrorMessage(fallbackError, warning || 'Live/Fallback web search failed');
                response = { text: 'Canli arama su an tamamlanamadi. Mevcut bilgilerle genel bir hukuki yonlendirme sunulabilir.' };
            }
        }

        return res.status(200).json({
            text: String(response?.text || '').trim(),
            groundingMetadata: response?.candidates?.[0]?.groundingMetadata || null,
            degraded,
            warning,
            _debugPrimaryError,
            _debugFallbackError,
        });
    } catch (error) {
        console.error('Web Search Error:', error);
        return res.status(200).json({
            text: 'Web aramasi su anda kullanilamiyor. Soru genel hukuki cercevede yanitlanmalidir.',
            groundingMetadata: null,
            degraded: true,
            warning: getSafeErrorMessage(error, 'Web search API error'),
        });
    }
}
