import { Type } from '@google/genai';
import {
    GEMINI_API_KEY,
    GEMINI_FLASH_PREVIEW_MODEL_NAME,
    GEMINI_MODEL_NAME,
    getGeminiClient,
} from './_shared.js';

const PRODUCER_MODEL_NAME =
    process.env.GEMINI_DOMAIN_SIGNAL_PRODUCER_MODEL_NAME
    || process.env.VITE_GEMINI_DOMAIN_SIGNAL_PRODUCER_MODEL_NAME
    || GEMINI_FLASH_PREVIEW_MODEL_NAME
    || GEMINI_MODEL_NAME;

const CRITIC_MODEL_NAME =
    process.env.GEMINI_DOMAIN_SIGNAL_CRITIC_MODEL_NAME
    || process.env.VITE_GEMINI_DOMAIN_SIGNAL_CRITIC_MODEL_NAME
    || GEMINI_FLASH_PREVIEW_MODEL_NAME
    || GEMINI_MODEL_NAME;

const ARBITER_MODEL_NAME =
    process.env.GEMINI_DOMAIN_SIGNAL_ARBITER_MODEL_NAME
    || process.env.VITE_GEMINI_DOMAIN_SIGNAL_ARBITER_MODEL_NAME
    || GEMINI_MODEL_NAME
    || GEMINI_FLASH_PREVIEW_MODEL_NAME;

const MAX_LIST_SIZE = 8;
const DEFAULT_STAGE_TIMEOUT_MS = 1200;
const STAGE_TIMEOUT_MS = (() => {
    const rawTimeout = Number(
        process.env.GEMINI_DOMAIN_SIGNAL_STAGE_TIMEOUT_MS
        || process.env.VITE_GEMINI_DOMAIN_SIGNAL_STAGE_TIMEOUT_MS
        || DEFAULT_STAGE_TIMEOUT_MS
    );
    return Number.isFinite(rawTimeout) && rawTimeout >= 250
        ? Math.floor(rawTimeout)
        : DEFAULT_STAGE_TIMEOUT_MS;
})();

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\u0131/g, 'i')
        .replace(/\u0130/g, 'i')
        .replace(/\u015f|\u015e/g, 's')
        .replace(/\u011f|\u011e/g, 'g')
        .replace(/\u00fc|\u00dc/g, 'u')
        .replace(/\u00f6|\u00d6/g, 'o')
        .replace(/\u00e7|\u00c7/g, 'c')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const dedupeList = (values = [], limit = Infinity) => {
    const seen = new Set();
    const output = [];

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(String(value || '').trim());
        if (output.length >= limit) break;
    }

    return output;
};

const normalizeConceptList = (values = [], limit = MAX_LIST_SIZE) =>
    dedupeList(
        (Array.isArray(values) ? values : [values])
            .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
            .filter((value) => value.length >= 2),
        limit
    );

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

    const firstBracket = unfenced.indexOf('[');
    const lastBracket = unfenced.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
        return unfenced.slice(firstBracket, lastBracket + 1);
    }

    return unfenced;
};

const safeJsonParse = (value = '') => {
    const rawValue = String(value || '').trim();
    const candidates = [rawValue, extractJsonFragment(rawValue)]
        .filter(Boolean)
        .filter((candidate, index, list) => list.indexOf(candidate) === index);

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            continue;
        }
    }

    return null;
};

const withTimeout = async (factory, timeoutMs = STAGE_TIMEOUT_MS, label = 'operation') =>
    new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            settled = true;
            const error = new Error(`${label}_timeout_${timeoutMs}ms`);
            error.code = 'ETIMEDOUT';
            reject(error);
        }, timeoutMs);

        Promise.resolve()
            .then(() => factory())
            .then(
                (value) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(value);
                },
                (error) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(error);
                }
            );
    });

const AGENTIC_SIGNAL_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        primaryDomain: { type: Type.STRING },
        requiredConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        mustConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        retrievalConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        supportConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        evidenceConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        contrastConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        negativeConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        searchClauses: { type: Type.ARRAY, items: { type: Type.STRING } },
        candidateQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
        embeddingQuery: { type: Type.STRING },
        rationale: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
    },
};

const buildEmbeddingQueryFromConcepts = ({
    primaryDomain = '',
    requiredConcepts = [],
    supportConcepts = [],
    evidenceConcepts = [],
    rawText = '',
    querySeedText = '',
} = {}) => {
    const normalizedCombined = normalizeText([rawText, querySeedText].filter(Boolean).join(' '));
    const normalizedRequired = normalizeConceptList(requiredConcepts, 6);
    const normalizedSupport = normalizeConceptList(supportConcepts, 4);
    const normalizedEvidence = normalizeConceptList(evidenceConcepts, 3);

    if (
        primaryDomain === 'ceza'
        && normalizedRequired.some((item) => normalizeText(item).includes('188'))
    ) {
        return dedupeList([
            normalizedRequired.find((item) => normalizeText(item).includes('188')) || 'TCK 188',
            normalizedRequired.find((item) => normalizeText(item).includes('uyusturucu madde ticareti')) || 'uyusturucu madde ticareti',
            normalizedSupport.find((item) => normalizeText(item).includes('ticaret kasti'))
                || (normalizedCombined.includes('ticaret') ? 'ticaret kasti' : ''),
            normalizedCombined.includes('saglama') ? 'saglama' : '',
            normalizedCombined.includes('nakletme') ? 'nakletme' : '',
        ].filter(Boolean)).join(' ');
    }

    if (
        primaryDomain === 'borclar'
        && normalizedCombined.includes('kira')
        && normalizedRequired.some((item) => {
            const token = normalizeText(item);
            return token.includes('tahliye') || token.includes('temerrut');
        })
    ) {
        return dedupeList([
            normalizedSupport.find((item) => normalizeText(item).includes('tbk 315')) || 'TBK 315',
            normalizedRequired.find((item) => normalizeText(item).includes('temerrut')) || 'temerrut',
            'mecur',
            normalizedRequired.find((item) => normalizeText(item).includes('tahliye')) || 'tahliye',
            'kira',
        ].filter(Boolean)).join(' ');
    }

    return dedupeList([
        ...normalizedRequired,
        ...normalizedSupport.slice(0, 2),
        ...normalizedEvidence.slice(0, 1),
    ].filter(Boolean)).slice(0, 6).join(' ');
};

const buildHeuristicMustConcepts = ({ normalizedRaw = '', primaryDomain = '', packet = null } = {}) => {
    const requiredConcepts = normalizeConceptList(packet?.requiredConcepts || [], 6);
    const supportConcepts = normalizeConceptList(packet?.supportConcepts || [], 4);
    const seed = [...requiredConcepts];

    if (primaryDomain === 'ceza') {
        if (
            normalizedRaw.includes('188')
            || normalizedRaw.includes('ticaret')
            || normalizedRaw.includes('saglama')
        ) {
            seed.push('tck 188', 'uyusturucu madde ticareti', 'ticaret kasti');
        }
        if (
            normalizedRaw.includes('191')
            || normalizedRaw.includes('kullanmak')
            || normalizedRaw.includes('bulundurma')
        ) {
            seed.push('tck 191', 'kullanmak icin bulundurma', 'kisisel kullanim siniri');
        }
    }

    if (primaryDomain === 'borclar') {
        if (
            normalizedRaw.includes('kira')
            || normalizedRaw.includes('kiraci')
            || normalizedRaw.includes('kiraya veren')
        ) {
            seed.push('kira');
        }
        if (normalizedRaw.includes('tahliye')) seed.push('tahliye');
        if (normalizedRaw.includes('temerrut')) seed.push('temerrut');
        if (normalizedRaw.includes('ihtar')) seed.push('ihtarname');
    }

    return normalizeConceptList([...seed, ...supportConcepts], 6);
};

const buildHeuristicContrastConcepts = ({ normalizedRaw = '', primaryDomain = '' } = {}) => {
    if (primaryDomain === 'ceza') {
        if (
            normalizedRaw.includes('188')
            || normalizedRaw.includes('ticaret')
            || normalizedRaw.includes('saglama')
        ) {
            return ['tck 191', 'kullanmak icin bulundurma', 'kisisel kullanim'];
        }
        if (
            normalizedRaw.includes('191')
            || normalizedRaw.includes('kullanmak')
            || normalizedRaw.includes('bulundurma')
        ) {
            return ['tck 188', 'uyusturucu madde ticareti', 'ticaret kasti'];
        }
    }

    if (primaryDomain === 'borclar') {
        if (
            normalizedRaw.includes('kira')
            && (normalizedRaw.includes('tahliye') || normalizedRaw.includes('temerrut'))
        ) {
            return ['kira tespiti', 'kira artisi', 'tufe'];
        }
    }

    return [];
};

const buildHeuristicSignalPlan = ({
    rawText = '',
    querySeedText = '',
    primaryDomain = '',
    packet = null,
    skillPlan = null,
} = {}) => {
    const normalizedRaw = normalizeText(rawText || querySeedText);
    const mustConcepts = buildHeuristicMustConcepts({ normalizedRaw, primaryDomain, packet });
    const contrastConcepts = buildHeuristicContrastConcepts({ normalizedRaw, primaryDomain });
    const retrievalConcepts = normalizeConceptList([
        ...mustConcepts,
        ...(skillPlan?.retrievalConcepts || []),
        ...(packet?.requiredConcepts || []),
    ], MAX_LIST_SIZE);
    const supportConcepts = normalizeConceptList([
        ...(skillPlan?.supportConcepts || []),
        ...(packet?.supportConcepts || []),
    ], MAX_LIST_SIZE);
    const evidenceConcepts = normalizeConceptList([
        ...(skillPlan?.evidenceConcepts || []),
        ...(packet?.evidenceConcepts || []),
    ], MAX_LIST_SIZE);
    const negativeConcepts = normalizeConceptList([
        ...(skillPlan?.negativeConcepts || []),
        ...(packet?.negativeConcepts || []),
    ], MAX_LIST_SIZE);

    const defaultSearchClauses = [];
    if (primaryDomain === 'ceza' && mustConcepts.some((item) => normalizeText(item).includes('188'))) {
        defaultSearchClauses.push('+"tck 188" +"uyusturucu madde ticareti"', '+"ticaret kasti" +"kullanmak icin bulundurma" +ayrim');
    }
    if (
        primaryDomain === 'borclar'
        && mustConcepts.some((item) => normalizeText(item).includes('tahliye'))
    ) {
        defaultSearchClauses.push('+"tahliye" +"temerrut" +"tbk 315"', '+"kiraci" +"kira" +"tahliye"');
    }

    const requiredConcepts = normalizeConceptList(mustConcepts, 6);
    const embeddingQuery = buildEmbeddingQueryFromConcepts({
        primaryDomain,
        requiredConcepts,
        supportConcepts,
        evidenceConcepts,
        rawText,
        querySeedText,
    });

    return {
        primaryDomain,
        requiredConcepts,
        mustConcepts,
        retrievalConcepts,
        supportConcepts,
        evidenceConcepts,
        contrastConcepts,
        negativeConcepts,
        embeddingQuery,
        searchClauses: normalizeConceptList([
            ...(skillPlan?.searchClauses || []),
            ...(skillPlan?.candidateQueries || []),
            ...defaultSearchClauses,
        ], MAX_LIST_SIZE),
        candidateQueries: normalizeConceptList([
            ...(skillPlan?.candidateQueries || []),
            ...(skillPlan?.searchClauses || []),
            ...defaultSearchClauses,
        ], MAX_LIST_SIZE),
        rationale: 'Heuristik domain signal fallback plan.',
        confidence: 0.45,
        diagnostics: {
            mode: 'heuristic_fallback',
            producerApplied: false,
            criticApplied: false,
            arbiterApplied: false,
            warnings: [],
        },
    };
};

const normalizeSignalPlan = (plan = null, fallbackPlan = null) => {
    const fallback = fallbackPlan || buildHeuristicSignalPlan({});
    const candidate = plan && typeof plan === 'object' ? plan : {};
    const requiredConcepts = normalizeConceptList(
        candidate.requiredConcepts || candidate.mustConcepts || fallback.requiredConcepts || fallback.mustConcepts || [],
        6
    );
    const supportConcepts = normalizeConceptList(candidate.supportConcepts || fallback.supportConcepts || [], MAX_LIST_SIZE);
    const evidenceConcepts = normalizeConceptList(candidate.evidenceConcepts || fallback.evidenceConcepts || [], MAX_LIST_SIZE);

    return {
        primaryDomain: String(candidate.primaryDomain || fallback.primaryDomain || '').trim().toLocaleLowerCase('tr-TR') || undefined,
        requiredConcepts,
        mustConcepts: requiredConcepts,
        retrievalConcepts: normalizeConceptList(candidate.retrievalConcepts || fallback.retrievalConcepts || [], MAX_LIST_SIZE),
        supportConcepts,
        evidenceConcepts,
        contrastConcepts: normalizeConceptList(candidate.contrastConcepts || fallback.contrastConcepts || [], 6),
        negativeConcepts: normalizeConceptList(candidate.negativeConcepts || fallback.negativeConcepts || [], MAX_LIST_SIZE),
        embeddingQuery: String(
            candidate.embeddingQuery
            || fallback.embeddingQuery
            || buildEmbeddingQueryFromConcepts({
                primaryDomain: String(candidate.primaryDomain || fallback.primaryDomain || '').trim().toLocaleLowerCase('tr-TR'),
                requiredConcepts,
                supportConcepts,
                evidenceConcepts,
            })
        ).replace(/\s+/g, ' ').trim() || undefined,
        searchClauses: normalizeConceptList(candidate.searchClauses || fallback.searchClauses || [], MAX_LIST_SIZE),
        candidateQueries: normalizeConceptList(candidate.candidateQueries || fallback.candidateQueries || [], MAX_LIST_SIZE),
        rationale: String(candidate.rationale || fallback.rationale || '').trim(),
        confidence: Number.isFinite(Number(candidate.confidence))
            ? Math.max(0, Math.min(1, Number(candidate.confidence)))
            : Number(fallback.confidence || 0.45),
    };
};

const buildProducerPrompt = ({ rawText = '', querySeedText = '', primaryDomain = '', packet = null, skillPlan = null } = {}) =>
    [
        'Sen hukuk arama sistemi icin domain-signal ureten producer modelsin.',
        'Gorevin: kullanicinin arama niyetini semantik olarak ayristir.',
        'mustConcepts: kararin gercekten gecmesi gereken cekirdek kavramlar.',
        'requiredConcepts: mustConcepts ile ayni cekirdek kavramlarin normalize kopyasi olsun.',
        'contrastConcepts: ilgili ama tek basina ustte cikarsa alakasizlasan kavramlar.',
        'negativeConcepts: acikca yanlis alana goturen kavramlar. Kullanicinin asıl hedef savunmasini buraya yazma.',
        'embeddingQuery: embedding retrieval icin 4-8 kelimelik yogun cekirdek tez yaz.',
        'searchClauses/candidateQueries: Bedesten icin kisa ve hedefli olsun.',
        'Ceza alaninda TCK 188 ile TCK 191 ayrimini dikkatle ayir.',
        'Kira alaninda tahliye/temerrut ile kira artisi/kira tespiti ayrimini dikkatle ayir.',
        '',
        `primaryDomain: ${primaryDomain || ''}`,
        `rawText: ${rawText || ''}`,
        `querySeedText: ${querySeedText || ''}`,
        `packet: ${JSON.stringify(packet || {})}`,
        `skillPlan: ${JSON.stringify(skillPlan || {})}`,
    ].join('\n');

const buildCriticPrompt = ({ rawText = '', querySeedText = '', primaryDomain = '', producerPlan = null } = {}) =>
    [
        'Sen hukuk arama sistemi icin critic modelsin.',
        'Producer planini denetle ve yalnizca duzeltilmis bir plan dondur.',
        'Kontrol listesi:',
        '- mustConcepts fazla genel mi?',
        '- requiredConcepts mustConcepts ile tutarli mi?',
        '- contrastConcepts kullanicinin asli hedefini yanlislikla bastiriyor mu?',
        '- embeddingQuery cekirdek tezi tasiyor mu, contrast/negative kavramlarla bulaniyor mu?',
        '- TCK 188 sorgusunda TCK 191 ust siraya cikacak sekilde plan bozuluyor mu?',
        '- kira tahliye sorgusunda kira artisi/kira tespiti gereksiz yukseliyor mu?',
        '',
        `primaryDomain: ${primaryDomain || ''}`,
        `rawText: ${rawText || ''}`,
        `querySeedText: ${querySeedText || ''}`,
        `producerPlan: ${JSON.stringify(producerPlan || {})}`,
    ].join('\n');

const buildArbiterPrompt = ({
    rawText = '',
    querySeedText = '',
    primaryDomain = '',
    producerPlan = null,
    criticPlan = null,
} = {}) =>
    [
        'Sen hukuk arama sistemi icin arbiter modelsin.',
        'Producer ve critic ciktilarini uzlastirip final domain-signal planini dondur.',
        'Kurallar:',
        '- mustConcepts kisa ve sert olsun.',
        '- requiredConcepts mustConcepts ile ayni cekirdek ekseni korusun.',
        '- contrastConcepts ancak tek basina ustte cikmasi sakincali kavramlari icerir.',
        '- negativeConcepts kullanicinin hedef tezini bastirmasin.',
        '- embeddingQuery mustConcepts ve en fazla 1-2 destek kavramdan olussun.',
        '- searchClauses/candidateQueries en fazla 4 guclu varyant olsun.',
        '',
        `primaryDomain: ${primaryDomain || ''}`,
        `rawText: ${rawText || ''}`,
        `querySeedText: ${querySeedText || ''}`,
        `producerPlan: ${JSON.stringify(producerPlan || {})}`,
        `criticPlan: ${JSON.stringify(criticPlan || {})}`,
    ].join('\n');

const generateStructuredSignalPlan = async ({
    model = PRODUCER_MODEL_NAME,
    contents = '',
    apiKey = GEMINI_API_KEY,
    timeoutMs = STAGE_TIMEOUT_MS,
} = {}) => {
    const ai = getGeminiClient({ apiKey });
    const response = await withTimeout(
        () => ai.models.generateContent({
            model,
            contents,
            config: {
                systemInstruction: 'Sadece gecerli JSON dondur.',
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: AGENTIC_SIGNAL_SCHEMA,
            },
        }),
        timeoutMs,
        `domain_signal_${model}`
    );

    const responseText = extractResponseText(response);
    const parsed = safeJsonParse(responseText);

    if (!parsed || typeof parsed !== 'object') {
        const error = new Error('invalid_domain_signal_json');
        error.responseText = responseText;
        throw error;
    }

    return parsed;
};

export const generateAgenticDomainSignals = async ({
    rawText = '',
    querySeedText = '',
    primaryDomain = '',
    packet = null,
    skillPlan = null,
    apiKey = GEMINI_API_KEY,
    generateStructuredSignalPlanImpl = generateStructuredSignalPlan,
    stageTimeoutMs = STAGE_TIMEOUT_MS,
} = {}) => {
    const fallbackPlan = buildHeuristicSignalPlan({
        rawText,
        querySeedText,
        primaryDomain,
        packet,
        skillPlan,
    });

    if (!String(apiKey || '').trim()) {
        return fallbackPlan;
    }

    const warnings = [];

    try {
        const producerPlan = normalizeSignalPlan(
            await generateStructuredSignalPlanImpl({
                model: PRODUCER_MODEL_NAME,
                contents: buildProducerPrompt({ rawText, querySeedText, primaryDomain, packet, skillPlan }),
                apiKey,
                timeoutMs: stageTimeoutMs,
            }),
            fallbackPlan
        );

        let criticPlan = producerPlan;
        try {
            criticPlan = normalizeSignalPlan(
                await generateStructuredSignalPlanImpl({
                    model: CRITIC_MODEL_NAME,
                    contents: buildCriticPrompt({ rawText, querySeedText, primaryDomain, producerPlan }),
                    apiKey,
                    timeoutMs: stageTimeoutMs,
                }),
                producerPlan
            );
        } catch (error) {
            warnings.push(`critic_failed:${String(error?.message || error)}`);
        }

        let finalPlan = criticPlan;
        try {
            finalPlan = normalizeSignalPlan(
                await generateStructuredSignalPlanImpl({
                    model: ARBITER_MODEL_NAME,
                    contents: buildArbiterPrompt({
                        rawText,
                        querySeedText,
                        primaryDomain,
                        producerPlan,
                        criticPlan,
                    }),
                    apiKey,
                    timeoutMs: stageTimeoutMs,
                }),
                criticPlan
            );
        } catch (error) {
            warnings.push(`arbiter_failed:${String(error?.message || error)}`);
        }

        return {
            ...finalPlan,
            diagnostics: {
                mode: 'agentic_consensus',
                producerApplied: true,
                criticApplied: !warnings.some((item) => item.startsWith('critic_failed:')),
                arbiterApplied: !warnings.some((item) => item.startsWith('arbiter_failed:')),
                warnings,
                producerModel: PRODUCER_MODEL_NAME,
                criticModel: CRITIC_MODEL_NAME,
                arbiterModel: ARBITER_MODEL_NAME,
            },
        };
    } catch (error) {
        return {
            ...fallbackPlan,
            diagnostics: {
                ...fallbackPlan.diagnostics,
                warnings: [`producer_failed:${String(error?.message || error)}`],
            },
        };
    }
};

export const __testables = {
    normalizeSignalPlan,
    buildHeuristicSignalPlan,
};
