import { createHash } from 'node:crypto';
import { GEMINI_EMBEDDING_API_KEY, getGeminiClient } from '../../backend/gemini/_shared.js';

const GEMINI_EMBEDDING_MODEL_NAME = process.env.GEMINI_EMBEDDING_MODEL_NAME || 'text-embedding-004';
const GEMINI_EMBEDDING_DIMENSION = Math.max(
    256,
    Math.min(3072, Number(process.env.GEMINI_EMBEDDING_DIMENSION || 768))
);
const GEMINI_EMBED_FALLBACK_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL_NAME}:embedContent`;
const EMBEDDING_MAX_TEXT_CHARS = 2048;
const CHUNK_CONCURRENCY = 3;

const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

const normalizeEmbeddingText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const isMockedFetch = () => typeof fetch === 'function' && typeof fetch?.mock === 'object';
const isEmbeddingDebugEnabled = () => String(process.env.LEGAL_EMBED_DEBUG || '').trim() === '1';
const logEmbeddingDebug = (event, payload = {}) => {
    if (!isEmbeddingDebugEnabled()) return;
    console.log(`[EMBED_DEBUG] ${event}`, JSON.stringify(payload));
};
const extractEmbeddingValues = (payload = null) => {
    const values = payload?.embeddings?.[0]?.values || payload?.embedding?.values;
    return Array.isArray(values) && values.length > 0 ? values : null;
};

const fetchEmbeddingCompatibility = async (normalizedText, taskType) => {
    if (typeof fetch !== 'function') return null;
    logEmbeddingDebug('compatibility_fallback_enter', {
        taskType,
        textHead: normalizedText.slice(0, 120),
    });

    const response = await fetch(`${GEMINI_EMBED_FALLBACK_URL}?key=${encodeURIComponent(String(GEMINI_EMBEDDING_API_KEY || '').trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${GEMINI_EMBEDDING_MODEL_NAME}`,
            content: { parts: [{ text: normalizedText }] },
            taskType,
            outputDimensionality: GEMINI_EMBEDDING_DIMENSION,
        }),
    });

    if (!response.ok) {
        throw new Error(`embedding_api_error_${response.status}`);
    }

    const payload = await response.json();
    return extractEmbeddingValues(payload);
};

const createAsyncLimit = (concurrency = 3) => {
    let active = 0;
    const queue = [];

    const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        active += 1;
        const { fn, resolve, reject } = queue.shift();
        fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                active -= 1;
                next();
            });
    };

    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
};

const SECTION_PATTERNS = [
    { key: 'olay', regex: /(?:^|\n)\s*(?:olay|maddi\s*vak[ai]|olayin\s*gelisimi)\s*[:;]/i, weight: 1.3 },
    { key: 'gerekce', regex: /(?:^|\n)\s*(?:gerekce|gerekçe|hukuki\s*degerlendirme|hukuki\s*değerlendirme)\s*[:;]/i, weight: 1.5 },
    { key: 'delil', regex: /(?:^|\n)\s*(?:delil|ispat\s*araclari|ispat\s*araçlari)\s*[:;]/i, weight: 1.1 },
    { key: 'karar', regex: /(?:^|\n)\s*(?:hukum|hüküm|sonuc|sonuç|bu\s*nedenle)\s*[:;]/i, weight: 0.4 },
];

export const isEmbeddingRerankEnabled = () =>
    String(process.env.LEGAL_EMBEDDING_RERANK_ENABLED || '').trim() === 'true'
    && Boolean(String(GEMINI_EMBEDDING_API_KEY || '').trim());

export const chunkDocumentForEmbedding = (documentText = '') => {
    const text = normalizeEmbeddingText(documentText);
    if (!text) return [];

    const sectionMatches = SECTION_PATTERNS
        .map(({ key, regex, weight }) => ({ key, weight, index: text.search(regex) }))
        .filter((item) => item.index >= 0)
        .sort((left, right) => left.index - right.index);

    if (sectionMatches.length > 0) {
        const sectionChunks = sectionMatches.map((section, index) => {
            const nextStart = sectionMatches[index + 1]?.index;
            const rawChunk = text.slice(
                section.index,
                nextStart && nextStart > section.index ? nextStart : Math.min(text.length, section.index + 1600)
            );
            return {
                key: section.key,
                text: normalizeEmbeddingText(rawChunk).slice(0, 1600),
                weight: section.weight,
            };
        });

        const filtered = sectionChunks.filter((chunk) => chunk.text.length > 50);
        if (filtered.length > 0) return filtered;
    }

    const words = text.split(/\s+/);
    return [
        { key: 'w0', text: words.slice(0, 150).join(' '), weight: 0.5 },
        { key: 'w1', text: words.slice(150, 450).join(' '), weight: 1.5 },
        { key: 'w2', text: words.slice(450, 700).join(' '), weight: 1.1 },
        { key: 'w3', text: words.slice(-150).join(' '), weight: 0.3 },
    ].filter((chunk) => normalizeEmbeddingText(chunk.text).length > 50);
};

export const getEmbedding = async (text, taskType = 'RETRIEVAL_DOCUMENT') => {
    const normalizedText = normalizeEmbeddingText(text).slice(0, EMBEDDING_MAX_TEXT_CHARS);

    if (!String(GEMINI_EMBEDDING_API_KEY || '').trim()) {
        throw new Error('missing_gemini_api_key');
    }
    if (!normalizedText) return [];
    if (isMockedFetch()) {
        const compatibilityValues = await fetchEmbeddingCompatibility(normalizedText, taskType);
        if (Array.isArray(compatibilityValues) && compatibilityValues.length > 0) {
            return compatibilityValues;
        }
    }

    const ai = getGeminiClient({ apiKey: GEMINI_EMBEDDING_API_KEY });
    const response = await ai.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL_NAME,
        contents: [normalizedText],
        config: {
            taskType,
            outputDimensionality: GEMINI_EMBEDDING_DIMENSION,
        },
    });

    const sdkValues = extractEmbeddingValues(response);
    if (Array.isArray(sdkValues) && sdkValues.length > 0) {
        logEmbeddingDebug('sdk_vector', {
            taskType,
            length: sdkValues.length,
            head: sdkValues.slice(0, 5),
            textHead: normalizedText.slice(0, 120),
        });
    }

    const values = sdkValues || await fetchEmbeddingCompatibility(normalizedText, taskType);
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('embedding_payload_invalid');
    }

    return values;
};

const cosineSimilarity = (left = [], right = []) => {
    const length = Math.min(Array.isArray(left) ? left.length : 0, Array.isArray(right) ? right.length : 0);
    if (length === 0) return 0;

    let dot = 0;
    let magLeft = 0;
    let magRight = 0;

    for (let index = 0; index < length; index += 1) {
        const a = Number(left[index] || 0);
        const b = Number(right[index] || 0);
        dot += a * b;
        magLeft += a * a;
        magRight += b * b;
    }

    if (magLeft === 0 || magRight === 0) return 0;
    return dot / (Math.sqrt(magLeft) * Math.sqrt(magRight));
};

export const computeEmbeddingScore = async ({
    queryEmbedding = [],
    documentText = '',
    documentId = '',
    cache = null,
} = {}) => {
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return 0;

    const chunks = chunkDocumentForEmbedding(documentText);
    if (chunks.length === 0) return 0;

    const limit = createAsyncLimit(CHUNK_CONCURRENCY);
    const chunkScores = await Promise.all(chunks.map((chunk, index) => limit(async () => {
        const normalized = normalizeEmbeddingText(chunk.text);
        const chunkHash = createHash('sha1').update(normalized).digest('hex').slice(0, 12);
        const cacheKey = `${String(documentId || 'unknown').trim() || 'unknown'}::${index}::${chunkHash}`;

        let chunkEmbedding = cache?.get(cacheKey);
        if (!chunkEmbedding) {
            chunkEmbedding = await getEmbedding(normalized, 'RETRIEVAL_DOCUMENT');
            cache?.set(cacheKey, chunkEmbedding);
        }

        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
        return {
            key: chunk.key,
            index,
            similarity,
            weightedScore: similarity * Number(chunk.weight || 1),
            weight: Number(chunk.weight || 1),
            textHead: normalized.slice(0, 120),
        };
    })));

    const maxWeight = Math.max(...chunks.map((chunk) => Number(chunk.weight || 1)), 1);
    const bestChunk = chunkScores.reduce((best, current) =>
        !best || current.weightedScore > best.weightedScore ? current : best,
    null);
    const normalizedBestScore = Number(bestChunk?.weightedScore || 0) / maxWeight;

    logEmbeddingDebug('document_score', {
        documentId: String(documentId || 'unknown'),
        chunkCount: chunks.length,
        maxWeight,
        bestChunk,
        normalizedBestScore,
    });

    return clamp(normalizedBestScore, 0, 1);
};

export const mergeDocumentScores = ({
    lexicalScore = 0,
    embeddingScore = 0,
    proceduralShellBias = false,
    queryMode = 'default',
} = {}) => {
    const normalizedLexical = clamp(Number(lexicalScore || 0) / 2000, 0, 1);
    const normalizedEmbedding = clamp(embeddingScore, 0, 1);

    if (proceduralShellBias) {
        return Math.min(0.39, normalizedLexical * 0.35);
    }

    const isLongFact = String(queryMode || '').trim() === 'long_fact';
    const lexicalWeight = isLongFact ? 0.45 : 0.65;
    const embeddingWeight = isLongFact ? 0.55 : 0.35;

    return clamp(
        (normalizedLexical * lexicalWeight) + (normalizedEmbedding * embeddingWeight),
        0,
        1
    );
};
