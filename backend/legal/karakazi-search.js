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
const DEFAULT_YARGI_MCP_CLOUD_RUN_BASE_URL = String(
    process.env.YARGI_MCP_CLOUD_RUN_URL
    || 'https://yargi-mcp-31672947775.europe-west4.run.app'
).trim().replace(/\/+$/g, '');
const KARAKAZI_REMOTE_FETCH_DOCUMENTS =
    String(process.env.KARAKAZI_REMOTE_FETCH_DOCUMENTS || '0').trim() === '1';

const deriveRemoteKarakaziUrl = () => {
    const explicit = String(
        process.env.KARAKAZI_REMOTE_URL
        || process.env.YARGI_MCP_KARAKAZI_URL
        || ''
    ).trim();
    if (explicit) return explicit;

    const mcpUrl = String(process.env.YARGI_MCP_URL || '').trim();
    if (!mcpUrl || /127\.0\.0\.1|localhost/i.test(mcpUrl)) return '';

    if (/yargimcp\.fastmcp\.app/i.test(mcpUrl)) {
        return `${DEFAULT_YARGI_MCP_CLOUD_RUN_BASE_URL}/api/karakazi-search`;
    }

    return mcpUrl
        .replace(/\/mcp\/?$/i, '/api/karakazi-search')
        .replace(/([^:])\/{2,}/g, '$1/');
};

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

const normalizeSearchText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\u0131/g, 'i')
        .replace(/\u0130/g, 'i')
        .replace(/\u015f|\u015e/g, 's')
        .replace(/\u011f|\u011e/g, 'g')
        .replace(/\u00fc|\u00dc/g, 'u')
        .replace(/\u00f6|\u00d6/g, 'o')
        .replace(/\u00e7|\u00c7/g, 'c')
        .replace(/\s+/g, ' ')
        .trim();

const FAMILY_SIGNAL_MAP = {
    ceza: ['ceza dairesi', 'ceza genel kurulu', 'agir ceza', 'asliye ceza', 'sulh ceza', 'yargitay karari', 'cumhuriyet bassavciligi'],
    icra: ['icra', 'itirazin iptali', 'itirazin kaldirilmasi', 'iik', 'haciz', 'takip', 'menfi tespit', 'icra hukuk'],
    aile: ['aile mahkemesi', 'nafaka', 'velayet', 'bosanma', '6284', 'soybagi', 'kisisel iliski'],
    gayrimenkul: ['tapu', 'ortakligin giderilmesi', 'elatmanin onlenmesi', 'ecrimisil', 'kat mulkiyeti', 'kamulastirma'],
    ticaret: ['ticaret mahkemesi', 'asliye ticaret', 'genel kredi sozlesmesi', 'bono', 'cek', 'konkordato', 'ticari'],
    is_hukuku: ['is mahkemesi', 'ise iade', 'kidem tazminati', 'fazla mesai', 'iscilik alacagi'],
    idare: ['danistay', 'idare mahkemesi', 'vergi mahkemesi', 'idari islem', 'iptal davasi'],
};

const FAMILY_NEGATIVE_MAP = {
    ceza: ['hukuk dairesi', 'hukuk genel kurulu', 'ticaret mahkemesi', 'asliye ticaret', 'aile mahkemesi', 'danistay', 'idare mahkemesi'],
    icra: ['ceza dairesi', 'ceza genel kurulu', 'aile mahkemesi', 'danistay', 'agir ceza', 'asliye ceza'],
    aile: ['ceza dairesi', 'ceza genel kurulu', 'icra hukuk', 'ticaret mahkemesi', 'danistay'],
    gayrimenkul: ['ceza dairesi', 'ceza genel kurulu', 'aile mahkemesi', 'agir ceza', 'asliye ceza'],
    ticaret: ['ceza dairesi', 'ceza genel kurulu', 'aile mahkemesi', 'danistay', 'agir ceza', 'asliye ceza'],
    is_hukuku: ['ceza dairesi', 'ceza genel kurulu', 'ticaret mahkemesi', 'danistay'],
    idare: ['ceza dairesi', 'ceza genel kurulu', 'ticaret mahkemesi', 'aile mahkemesi', 'icra hukuk'],
};

const DOMAIN_HINTS = [
    { domain: 'ceza', tests: [/tck\s*188/i, /tck\s*191/i, /uyu[sş]turucu/i, /sanik/i, /sorusturma/i, /kovusturma/i, /cezalandirilmasina/i] },
    { domain: 'icra', tests: [/icra/i, /itirazin iptali/i, /haciz/i, /takip/i, /iik/i, /cari hesap/i] },
    { domain: 'aile', tests: [/nafaka/i, /velayet/i, /bosanma/i, /6284/i, /aile mahkemesi/i] },
    { domain: 'gayrimenkul', tests: [/tapu/i, /ortakligin giderilmesi/i, /ecrimisil/i, /elatmanin onlenmesi/i, /kat mulkiyeti/i] },
    { domain: 'ticaret', tests: [/ticaret mahkemesi/i, /genel kredi sozlesmesi/i, /bono/i, /cek/i, /konkordato/i] },
    { domain: 'is_hukuku', tests: [/ise iade/i, /kidem tazminati/i, /fazla mesai/i, /iscilik/i] },
    { domain: 'idare', tests: [/danistay/i, /idare mahkemesi/i, /vergi mahkemesi/i, /idari islem/i] },
];

const GENERIC_KEYWORD_STOPLIST = new Set([
    'karar',
    'mahkeme',
    'dava',
    'davasi',
    'rapor',
    'tutanak',
    'beyan',
    'beyani',
    'delil',
    'hukuk',
    'ceza',
    'mahkumiyet',
]);

const countSignalHits = (text = '', signals = []) =>
    (Array.isArray(signals) ? signals : [])
        .filter(Boolean)
        .reduce((count, signal) => (text.includes(normalizeSearchText(signal)) ? count + 1 : count), 0);

const pickRequiredSignals = (keywords = [], rawText = '', domain = '') => {
    const normalizedRaw = normalizeSearchText(rawText);
    const output = [];

    for (const keyword of dedupeList(keywords, 6)) {
        const normalized = normalizeSearchText(keyword);
        if (!normalized || GENERIC_KEYWORD_STOPLIST.has(normalized)) continue;
        output.push(normalized);
        if (output.length >= 4) break;
    }

    if (domain === 'ceza') {
        if (/uyu[sş]turucu/i.test(rawText)) output.unshift('uyusturucu madde ticareti');
        if (/kullan[ıi]c[ıi]\s+tan[ıi]k|tan[ıi]k beyan/i.test(rawText)) output.push('kullanici tanik');
        if (/kullanim siniri|kullanmak icin bulundurma|191/i.test(normalizedRaw)) output.push('kullanim siniri');
    }
    if (domain === 'icra') {
        if (/itirazin iptali/i.test(rawText)) output.unshift('itirazin iptali');
        if (/icra/i.test(rawText)) output.push('icra');
    }

    return dedupeList(output, 5);
};

const inferPrimaryDomain = ({ rawText = '', keywords = [], queryCandidates = [] } = {}) => {
    const combined = normalizeSearchText([rawText, ...(keywords || []), ...(queryCandidates || [])].join(' '));
    let bestDomain = 'genel_hukuk';
    let bestScore = 0;

    for (const entry of DOMAIN_HINTS) {
        const score = entry.tests.reduce((sum, test) => (test.test(combined) ? sum + 1 : sum), 0);
        if (score > bestScore) {
            bestDomain = entry.domain;
            bestScore = score;
        }
    }

    return bestDomain;
};

const buildSearchProfile = ({ rawText = '', keywords = [], queryCandidates = [] } = {}) => {
    const primaryDomain = inferPrimaryDomain({ rawText, keywords, queryCandidates });
    return {
        primaryDomain,
        requiredSignals: pickRequiredSignals(keywords, rawText, primaryDomain),
        positiveFamilySignals: FAMILY_SIGNAL_MAP[primaryDomain] || [],
        negativeFamilySignals: FAMILY_NEGATIVE_MAP[primaryDomain] || [],
    };
};

const buildResultCorpus = (result = {}) => {
    const metadataText = normalizeSearchText([
        result?.title,
        result?.snippet,
        result?.daire,
        result?.mahkeme,
        result?.kararNo,
        result?.esasNo,
        result?.kararTarihi,
    ].filter(Boolean).join(' '));

    const contentText = normalizeSearchText(
        String(result?.documentText || result?.documentHtml || '')
            .replace(/<[^>]+>/g, ' ')
            .slice(0, 4000)
    );

    return {
        metadataText,
        contentText,
        combinedText: normalizeSearchText(`${metadataText} ${contentText}`),
    };
};

const detectFamily = (text = '') => {
    const scores = Object.entries(FAMILY_SIGNAL_MAP).map(([family, signals]) => ({
        family,
        score: countSignalHits(text, signals),
    }));
    scores.sort((left, right) => right.score - left.score);
    return scores[0]?.score > 0 ? scores[0].family : '';
};

const evaluateKarakaziResult = (result = {}, profile = {}) => {
    const { metadataText, contentText, combinedText } = buildResultCorpus(result);
    const family = detectFamily(metadataText || combinedText);
    const positiveHits = countSignalHits(combinedText, profile.positiveFamilySignals || []);
    const negativeHits = countSignalHits(combinedText, profile.negativeFamilySignals || []);
    const requiredConceptCoverage = countSignalHits(combinedText, profile.requiredSignals || []);
    const contentCoverage = contentText
        ? countSignalHits(contentText, profile.requiredSignals || [])
        : 0;

    let familyDecision = 'uncertain';
    let familyDecisionReason = 'insufficient_family_signal';

    if (positiveHits > 0 && negativeHits === 0) {
        familyDecision = 'accept';
        familyDecisionReason = 'positive_family_signal';
    } else if (negativeHits > 0 && positiveHits === 0) {
        familyDecision = 'reject';
        familyDecisionReason = 'domain_family_mismatch';
    } else if (family && profile.primaryDomain && family === profile.primaryDomain) {
        familyDecision = 'accept';
        familyDecisionReason = 'detected_family_match';
    }

    const familyMatchScore =
        familyDecision === 'accept'
            ? 60
            : familyDecision === 'reject'
                ? -80
                : 10;
    const domainMatchScore = positiveHits * 14 - negativeHits * 16;
    const negativeConceptPenalty = negativeHits * 12;
    const contentVerifyScore = contentCoverage > 0 ? 8 + (contentCoverage * 6) : 0;
    const metadataBias = result?.documentText || result?.documentHtml ? 6 : 0;

    return {
        ...result,
        detectedFamily: family || null,
        familyDecision,
        familyDecisionReason,
        familyMatchScore,
        domainMatchScore,
        requiredConceptCoverage,
        negativeConceptPenalty,
        contentVerifyScore,
        totalScore:
            familyMatchScore
            + domainMatchScore
            + (requiredConceptCoverage * 9)
            - negativeConceptPenalty
            + contentVerifyScore
            + metadataBias,
    };
};

const postProcessKarakaziResults = ({ results = [], profile = {}, limit = KARAKAZI_RESULT_LIMIT } = {}) => {
    const evaluated = (Array.isArray(results) ? results : [])
        .map((result) => evaluateKarakaziResult(result, profile));
    const accepted = evaluated.filter((item) => item.familyDecision === 'accept');
    const uncertain = evaluated.filter((item) => item.familyDecision === 'uncertain');
    const rejected = evaluated.filter((item) => item.familyDecision === 'reject');

    let selected = [];
    if (accepted.length > 0) {
        selected = accepted;
    } else if (uncertain.length > 0) {
        selected = uncertain;
    } else {
        selected = rejected;
    }

    const sorted = [...selected].sort((left, right) => {
        if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
        const leftHasDoc = left.documentText || left.documentHtml ? 1 : 0;
        const rightHasDoc = right.documentText || right.documentHtml ? 1 : 0;
        if (rightHasDoc !== leftHasDoc) return rightHasDoc - leftHasDoc;
        return 0;
    });

    return {
        results: sorted.slice(0, Math.max(1, limit)),
        diagnostics: {
            familyFilterApplied: true,
            familyFilterDomain: profile.primaryDomain,
            familyFilterAcceptedCount: accepted.length,
            familyFilterUncertainCount: uncertain.length,
            familyFilterRejectedCount: rejected.length,
            familyFilterRejectedReasons: dedupeList(rejected.map((item) => item.familyDecisionReason), 10),
            top1FamilyDecision: sorted[0]?.familyDecision || null,
        },
    };
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

const buildExactPhraseQuery = (value = '') => {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    return `"${normalized}"`;
};

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
        ...keywordSet.map((keyword) => buildExactPhraseQuery(keyword)),
        buildPlusJoinedQuery(generalCore),
        buildPlusJoinedQuery(keywordSet.slice(0, 3)),
        buildPlusJoinedQuery(keywordSet.slice(0, 2)),
        ...generalCore.slice(0, 3).map((keyword) => normalizeText(keyword)).filter(Boolean),
    ];

    if (hasDrugTrade) {
        candidates.push(buildPlusJoinedQuery([
            'uyusturucu madde ticareti',
            'kullanim siniri',
            'tanik beyaninin',
            'kullanici',
        ]));
        candidates.push(buildPlusJoinedQuery(cezaCore));
    }

    if (normalizedRaw.includes('tck 188') || normalizedRaw.includes('188')) {
        candidates.push(buildPlusJoinedQuery(['tck 188', 'uyusturucu madde ticareti']));
    }
    if (normalizedRaw.includes('tck 191') || normalizedRaw.includes('191')) {
        candidates.push(buildPlusJoinedQuery(['tck 191', 'kullanmak icin bulundurma']));
    }

    return dedupeList(candidates, 8).filter(Boolean);
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

const searchViaRemoteKarakazi = async ({
    query = '',
    queryCandidates = [],
} = {}) => {
    const remoteUrl = deriveRemoteKarakaziUrl();
    if (!remoteUrl) return null;

    const response = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            query,
            queries: queryCandidates,
            limit: KARAKAZI_RESULT_LIMIT,
            fetchDocuments: KARAKAZI_REMOTE_FETCH_DOCUMENTS,
            debug: String(process.env.KARAKAZI_DEBUG || '0').trim() === '1',
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || `remote_karakazi_http_${response.status}`);
    }

    return {
        results: Array.isArray(payload?.results) ? payload.results : [],
        diagnostics: {
            ...(payload?.diagnostics || {}),
            source: 'remote_playwright',
            remoteUrl,
        },
    };
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
        const searchProfile = buildSearchProfile({
            rawText: clipped,
            keywords,
            queryCandidates,
        });

        const searchPayload =
            await searchViaRemoteKarakazi({ query, queryCandidates })
            || await searchLegalDecisionsViaPlaywright({
                query,
                queries: queryCandidates,
                headless: String(process.env.KARAKAZI_HEADLESS || '1').trim() !== '0',
                keepOpen: String(process.env.KARAKAZI_KEEP_OPEN || '0').trim() === '1',
                debug: String(process.env.KARAKAZI_DEBUG || '0').trim() === '1',
                fetchDocuments: String(process.env.KARAKAZI_FETCH_DOCUMENTS || '1').trim() !== '0',
                browser: 'firefox',
                limit: KARAKAZI_RESULT_LIMIT,
            });
        const filteredPayload = postProcessKarakaziResults({
            results: searchPayload.results || [],
            profile: searchProfile,
            limit: KARAKAZI_RESULT_LIMIT,
        });

        return res.status(200).json({
            keywords,
            query,
            queryCandidates,
            results: filteredPayload.results || [],
            diagnostics: {
                ...(searchPayload.diagnostics || {}),
                ...(filteredPayload.diagnostics || {}),
                inferredPrimaryDomain: searchProfile.primaryDomain,
                requiredSignals: searchProfile.requiredSignals,
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
