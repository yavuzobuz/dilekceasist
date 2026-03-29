import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { sanitizeLegalInput } from '../../lib/legal/legal-text-utils.js';
import { getGeminiClient, GEMINI_FLASH_PREVIEW_MODEL_NAME } from '../gemini/_shared.js';
import { searchLegalDecisionsViaPlaywright } from '../../lib/legal/playwrightMevzuatSearch.js';

const KEYWORD_MODEL =
    process.env.GEMINI_KEYWORD_MODEL
    || process.env.VITE_GEMINI_KEYWORD_MODEL
    || GEMINI_FLASH_PREVIEW_MODEL_NAME;

const MAX_INPUT_CHARS = 12000;
const KARAKAZI_RESULT_LIMIT = 15;

const normalizeText = (value = '') =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

const dedupeList = (values = [], limit = Infinity) => {
    const seen = new Set();
    const output = [];
    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
        if (output.length >= limit) break;
    }
    return output;
};

const extractTextFromParts = (parts = []) =>
    (Array.isArray(parts) ? parts : [])
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter(Boolean);

const extractResponseText = (response = {}) => {
    const candidateParts = (Array.isArray(response?.candidates) ? response.candidates : [])
        .flatMap((candidate) => extractTextFromParts(candidate?.content?.parts));
    if (candidateParts.length > 0) return candidateParts.join('');

    const contentParts = extractTextFromParts(response?.content?.parts);
    if (contentParts.length > 0) return contentParts.join('');

    if (typeof response?.text === 'string') return response.text;
    if (typeof response?.outputText === 'string') return response.outputText;
    return '';
};

const extractJsonFragment = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return '';

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const unfenced = fencedMatch?.[1]?.trim() || text;
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return unfenced.slice(firstBrace, lastBrace + 1);
    }
    return unfenced;
};

const safeJsonParse = (value = '') => {
    const rawValue = String(value || '').trim();
    const candidates = [rawValue, extractJsonFragment(rawValue)].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            continue;
        }
    }
    return null;
};

const buildKeywordPrompt = () => [
    'Sen bir hukuk araştırma asistanısın.',
    'Aşağıdaki metinden karar aramada kullanılacak 5 kısa anahtar kelime çıkar.',
    'Çıktı sadece JSON olacak.',
    'Şema: { "keywords": ["kısa anahtar 1", "kısa anahtar 2"] }',
    'Kurallar:',
    '- Sadece kısa anahtar kelimeler (en fazla 4-5 kelime).',
    '- Olay anlatımını veya uzun cümleleri tekrar etme.',
    '- Hukuki çekirdeği ve delil tiplerini yakala.',
].join('\n');

const buildPlusJoinedQuery = (parts = []) =>
    parts
        .map((part) => normalizeText(part))
        .filter(Boolean)
        .map((part) => `"${part}"`)
        .join('+');

const buildQueryCandidates = ({ keywords = [], rawText = '' } = {}) => {
    const normalizedRaw = normalizeText(rawText);
    const keywordSet = dedupeList(keywords, 6);
    const generalCore = keywordSet.slice(0, 4);
    const hasDrugTrade =
        normalizedRaw.includes('tck 188')
        || normalizedRaw.includes('188')
        || normalizedRaw.includes('uyusturucu madde ticareti');
    const hasUsageLimit =
        normalizedRaw.includes('kullanim siniri')
        || normalizedRaw.includes('kullanim sinirinin uzerinde')
        || normalizedRaw.includes('kullanmak icin bulundurma')
        || normalizedRaw.includes('191');
    const hasWitness =
        normalizedRaw.includes('kullanici tanik')
        || normalizedRaw.includes('tanik beyan');

    const cezaCore = [
        hasDrugTrade ? 'uyusturucu madde ticareti' : keywordSet[0],
        hasUsageLimit ? 'kullanim siniri' : keywordSet[1],
        hasWitness ? 'tanik beyaninin' : keywordSet[2],
        'kullanici',
    ].filter(Boolean);

    const candidates = [
        buildPlusJoinedQuery(generalCore),
        buildPlusJoinedQuery(keywordSet.slice(0, 3)),
        buildPlusJoinedQuery(keywordSet.slice(0, 2)),
        keywordSet.slice(0, 4).join(' '),
    ];

    if (hasDrugTrade) {
        candidates.unshift(buildPlusJoinedQuery([
            'uyusturucu madde ticareti',
            'kullanim siniri',
            'tanik beyaninin',
            'kullanici',
        ]));
        candidates.unshift(buildPlusJoinedQuery(cezaCore));
    }

    if (normalizedRaw.includes('tck 188') || normalizedRaw.includes('188')) {
        candidates.unshift(buildPlusJoinedQuery(['tck 188', 'uyusturucu madde ticareti']));
    }
    if (normalizedRaw.includes('tck 191') || normalizedRaw.includes('191')) {
        candidates.unshift(buildPlusJoinedQuery(['tck 191', 'kullanmak icin bulundurma']));
    }

    return dedupeList(candidates, 6).filter(Boolean);
};

const fallbackKeywordPatterns = [
    { test: /tck\s*188|uyu[sş]turucu madde ticareti/i, keyword: 'uyusturucu madde ticareti' },
    { test: /tck\s*191|kullanmak icin bulundurma|kullanım sınırı|kullanim siniri/i, keyword: 'kullanim siniri' },
    { test: /kullan[ıi]c[ıi]\s+tan[ıi]k|tan[ıi]k beyan/i, keyword: 'kullanici tanik beyani' },
    { test: /materyal mukayese/i, keyword: 'materyal mukayese tutanagi' },
    { test: /kriminal|uzmanl[ıi]k numaras[ıi]|raporda/i, keyword: 'kriminal rapor' },
    { test: /fiziki takip/i, keyword: 'fiziki takip' },
    { test: /sentetik kannabinoid|metamfetamin|kokain|pregabalin/i, keyword: 'uyusturucu madde cesitliligi' },
    { test: /sat[ıi][sş] i[cç]in bulundurma|sat[ıi][sş]/i, keyword: 'satis icin bulundurma' },
];

const extractFallbackKeywords = (text = '') => {
    const output = [];
    fallbackKeywordPatterns.forEach(({ test, keyword }) => {
        if (test.test(text)) output.push(keyword);
    });

    if (output.length === 0) {
        const tokens = dedupeList(
            normalizeText(text)
                .split(' ')
                .filter((token) => token.length >= 5),
            5
        );
        output.push(...tokens);
    }

    return dedupeList(output, 5).slice(0, 5);
};

const extractKeywords = async (text = '') => {
    try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
            model: KEYWORD_MODEL,
            contents: [{ role: 'user', parts: [{ text }] }],
            config: {
                systemInstruction: buildKeywordPrompt(),
                temperature: 0.2,
            },
        });
        const raw = extractResponseText(response);
        const parsed = safeJsonParse(raw);
        const keywords = dedupeList(parsed?.keywords || [], 5);
        return {
            keywords: keywords.slice(0, 5),
            mode: 'gemini',
            error: null,
        };
    } catch (error) {
        return {
            keywords: extractFallbackKeywords(text),
            mode: 'fallback',
            error: String(error?.message || error || 'keyword_generation_failed'),
        };
    }
};

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, x-api-key',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const rawText = sanitizeLegalInput(String(req?.body?.text || '')).text;
        if (!rawText) {
            return res.status(400).json({ error: 'Metin zorunludur.' });
        }

        const clipped = rawText.slice(0, MAX_INPUT_CHARS);
        const keywordPayload = await extractKeywords(clipped);
        const keywords = keywordPayload.keywords;
        const queryCandidates = buildQueryCandidates({ keywords, rawText: clipped });
        const query = queryCandidates[0] || '';

        const searchPayload = await searchLegalDecisionsViaPlaywright({
            query,
            queries: queryCandidates,
            headless: String(process.env.KARAKAZI_HEADLESS || '1').trim() !== '0',
            keepOpen: String(process.env.KARAKAZI_KEEP_OPEN || '0').trim() === '1',
            debug: String(process.env.KARAKAZI_DEBUG || '0').trim() === '1',
            fetchDocuments: String(process.env.KARAKAZI_FETCH_DOCUMENTS || '1').trim() !== '0',
            browser: 'firefox',
            limit: KARAKAZI_RESULT_LIMIT,
        });

        return res.status(200).json({
            keywords,
            query,
            queryCandidates,
            results: searchPayload.results || [],
            diagnostics: {
                ...(searchPayload.diagnostics || {}),
                keywordMode: keywordPayload.mode,
                keywordError: keywordPayload.error,
            },
        });
    } catch (error) {
        console.error('karakazi-search error:', error);
        return res.status(500).json({
            error: getSafeErrorMessage(error, 'Karakazi arama sırasında hata oluştu.'),
        });
    }
}
