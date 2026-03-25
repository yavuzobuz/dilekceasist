import { GEMINI_EMBEDDING_API_KEY, getGeminiClient } from '../../backend/gemini/_shared.js';
import {
    dedupeByMatchKey,
    normalizeDisplayText,
    normalizeMatchText,
    toAsciiSearchText,
} from './legalDomainProfiles.js';

const GEMINI_EMBEDDING_MODEL_NAME = process.env.GEMINI_EMBEDDING_MODEL_NAME || 'text-embedding-004';
const GEMINI_EMBEDDING_DIMENSION = Math.max(
    256,
    Math.min(3072, Number(process.env.GEMINI_EMBEDDING_DIMENSION || 768))
);
const SUMMARY_EMBED_CHAR_LIMIT = 2600;
const FULL_TEXT_EMBED_CHAR_LIMIT = 9000;
const FULL_TEXT_CANDIDATE_LIMIT = 30;
const MIN_SHORT_SUMMARY_SEMANTIC_SCORE = 0.46;
const MIN_SHORT_FINAL_SEMANTIC_SCORE = 0.50;
const MIN_CASE_FILE_SUMMARY_SEMANTIC_SCORE = 0.55;
const MIN_CASE_FILE_FINAL_SEMANTIC_SCORE = 0.60;
const MIN_CASE_FILE_FALLBACK_SEMANTIC_SCORE = 0.66;
const KEYWORD_STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'ama', 'fakat', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'su',
    'daha', 'kadar', 'sonra', 'once', 'tum', 'her', 'ilgili', 'halinde', 'dosyada', 'karari',
]);

const dedupeStrings = (values = []) => dedupeByMatchKey(values);

const tokenize = (value = '') =>
    normalizeMatchText(value)
        .split(' ')
        .map((item) => item.trim())
        .filter((item) => item.length >= 4 && !KEYWORD_STOPWORDS.has(item));

const getCommonPrefixLength = (left = '', right = '') => {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left[index] === right[index]) index += 1;
    return index;
};

const tokenLooselyMatches = (left = '', right = '') => {
    if (!left || !right) return false;
    if (left === right) return true;
    const minimumLength = Math.min(left.length, right.length);
    const requiredPrefix = Math.max(4, Math.min(6, Math.ceil(minimumLength * 0.6)));
    return getCommonPrefixLength(left, right) >= requiredPrefix;
};

const getMatchedConcepts = (text = '', concepts = []) => {
    const displayHaystack = normalizeDisplayText(text).toLocaleLowerCase('tr-TR');
    const matchHaystack = normalizeMatchText(text);
    const haystackTokens = tokenize(text);
    if (!displayHaystack && !matchHaystack) return [];

    return dedupeStrings(concepts).filter((concept) => {
        const displayConcept = normalizeDisplayText(concept).toLocaleLowerCase('tr-TR');
        const matchConcept = normalizeMatchText(concept);
        const asciiConcept = toAsciiSearchText(concept);
        if (displayConcept && displayHaystack.includes(displayConcept)) return true;
        if (matchConcept && matchHaystack.includes(matchConcept)) return true;
        if (asciiConcept && matchHaystack.includes(asciiConcept)) return true;

        const tokens = tokenize(concept);
        if (tokens.length === 0) return false;
        const requiredHits = tokens.length <= 2 ? 1 : Math.max(2, Math.floor(tokens.length / 2) + 1);
        const hitCount = tokens.filter((token) =>
            haystackTokens.some((haystackToken) => tokenLooselyMatches(token, haystackToken))
        ).length;
        return hitCount >= requiredHits;
    });
};

const normalizeVector = (values = []) => {
    const vector = Array.isArray(values) ? values.map((value) => Number(value) || 0) : [];
    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
    if (!magnitude) return vector;
    return vector.map((value) => value / magnitude);
};

const cosineSimilarity = (left = [], right = []) => {
    const size = Math.min(left.length, right.length);
    if (!size) return 0;
    let total = 0;
    for (let index = 0; index < size; index += 1) {
        total += (Number(left[index]) || 0) * (Number(right[index]) || 0);
    }
    return total;
};

const toScore = (value = 0) => {
    const numeric = Number(value) || 0;
    return Number(Math.max(0, Math.min(1, numeric)).toFixed(4));
};

const buildSummaryText = (result = {}) =>
    [result.title, result.daire, result.mahkeme, result.ozet, result.snippet]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');

const hasDetailedSummaryText = (result = {}) => {
    const detailText = [result.ozet, result.snippet]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');
    if (normalizeMatchText(detailText).length >= 12) return true;

    const titleText = normalizeMatchText(result.title);
    const daireText = normalizeMatchText(result.daire);
    return titleText.length >= 18
        && !titleText.startsWith('yargitay karari')
        && !titleText.startsWith('emsal ')
        && titleText !== daireText;
};

const buildDocumentEmbeddingText = ({ title = '', text = '', maxLength = SUMMARY_EMBED_CHAR_LIMIT } = {}) => {
    const titleLine = String(title || '').trim();
    const body = String(text || '').replace(/\s+/g, ' ').trim();
    const merged = titleLine ? `Baslik: ${titleLine}\n\n${body}` : body;
    return merged.slice(0, maxLength).trim();
};

const normalizeRelevance = (value = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric / 100));
};

const sourceBoost = (source = '', targetSources = []) =>
    Array.isArray(targetSources) && targetSources.includes(String(source || '').trim()) ? 1 : 0;

const embedTexts = async (texts = [], { taskType = 'RETRIEVAL_DOCUMENT' } = {}) => {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const ai = getGeminiClient({ apiKey: GEMINI_EMBEDDING_API_KEY });
    const response = await ai.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL_NAME,
        contents: texts,
        config: {
            taskType,
            outputDimensionality: GEMINI_EMBEDDING_DIMENSION,
        },
    });

    const embeddings = Array.isArray(response?.embeddings) ? response.embeddings : [];
    return embeddings.map((item) => normalizeVector(item?.values || []));
};

const buildRequiredConceptThreshold = (count = 0) => {
    if (count <= 1) return count;
    if (count <= 2) return 2;
    if (count <= 5) return 3;
    return 4;
};

const resolveQueryMode = (aiSearchPlan = null) => {
    const raw = normalizeMatchText(aiSearchPlan?.queryMode || '').replace(/\s+/g, '_');
    if (raw === 'case_file') return 'case_file';
    if (raw === 'long_fact' || raw === 'document_style') return raw;
    return 'short_issue';
};
const isCaseLikeQueryMode = (queryMode = 'short_issue') =>
    queryMode === 'long_fact' || queryMode === 'document_style' || queryMode === 'case_file';

const buildQueryModeConfig = (queryMode = 'short_issue', retrievalCount = 0) => {
    if (queryMode === 'case_file') {
        const requiredHitTarget = retrievalCount >= 3 ? 2 : Math.max(1, retrievalCount - 1);
        return {
            queryMode,
            requiredHitTarget,
            summaryThresholdCount: 1,
            summarySemanticThreshold: MIN_CASE_FILE_SUMMARY_SEMANTIC_SCORE,
            finalSemanticThreshold: MIN_CASE_FILE_FINAL_SEMANTIC_SCORE,
            fallbackSemanticThreshold: MIN_CASE_FILE_FALLBACK_SEMANTIC_SCORE,
            singleHitSummarySemanticThreshold: MIN_CASE_FILE_SUMMARY_SEMANTIC_SCORE,
            singleHitFinalSemanticThreshold: MIN_CASE_FILE_FINAL_SEMANTIC_SCORE,
            fallbackSupportThreshold: 2,
        };
    }

    if (isCaseLikeQueryMode(queryMode)) {
        // Less strict core concept matching for long facts (allow partial matches as long as semantics are ok)
        const requiredHitTarget = retrievalCount >= 3 ? 2 : Math.max(1, retrievalCount - 1);
        return {
            queryMode,
            requiredHitTarget,
            summaryThresholdCount: Math.max(1, requiredHitTarget - 1),
            summarySemanticThreshold: MIN_CASE_FILE_SUMMARY_SEMANTIC_SCORE,
            finalSemanticThreshold: MIN_CASE_FILE_FINAL_SEMANTIC_SCORE,
            fallbackSemanticThreshold: MIN_CASE_FILE_FALLBACK_SEMANTIC_SCORE,
        };
    }

    const requiredHitTarget = Math.max(2, buildRequiredConceptThreshold(retrievalCount));
    return {
        queryMode,
        requiredHitTarget,
        summaryThresholdCount: Math.max(1, requiredHitTarget - 1),
        summarySemanticThreshold: MIN_SHORT_SUMMARY_SEMANTIC_SCORE,
        finalSemanticThreshold: MIN_SHORT_FINAL_SEMANTIC_SCORE,
        fallbackSemanticThreshold: MIN_CASE_FILE_FALLBACK_SEMANTIC_SCORE,
    };
};

const rankResultsForFullText = (results = [], targetSources = []) =>
    [...(Array.isArray(results) ? results : [])].sort((left, right) => {
        const sourceGap = sourceBoost(right.source, targetSources) - sourceBoost(left.source, targetSources);
        if (sourceGap !== 0) return sourceGap;

        const detailGap = Number(Boolean(right.summaryHasDetails)) - Number(Boolean(left.summaryHasDetails));
        if (detailGap !== 0) return detailGap;

        const relevanceGap = Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0);
        if (relevanceGap !== 0) return relevanceGap;

        const semanticGap = Number(right.semanticScore || 0) - Number(left.semanticScore || 0);
        if (semanticGap !== 0) return semanticGap;

        return Number(right.combinedScore || 0) - Number(left.combinedScore || 0);
    });

const buildSelectionReason = ({
    selectionMode = 'strict',
    queryMode = 'short_issue',
    semanticScore = 0,
    summaryKeywordHits = 0,
    fullTextKeywordHits = 0,
    matchedNegativeConcepts = [],
    retrievalStage = 'summary',
} = {}) => {
    const negativeInfo = Array.isArray(matchedNegativeConcepts) && matchedNegativeConcepts.length > 0
        ? `, negatif=${matchedNegativeConcepts.length}`
        : '';
    const prefix = selectionMode === 'semantic_fallback' ? 'Semantic fallback gecti.' : retrievalStage === 'full_text' ? 'Tam metin dogrulamasi gecti.' : 'Ozet asamasi gecti.';
    const hitLabel = retrievalStage === 'full_text' ? fullTextKeywordHits : summaryKeywordHits;
    return `${prefix} mode=${queryMode}, semantic=${semanticScore.toFixed(3)}, cekirdek=${hitLabel}${negativeInfo}`;
};

const buildDomainConfidence = ({ retrievalRatio = 0, supportRatio = 0, evidenceRatio = 0, negativeRatio = 0, semanticScore = 0, targetBoost = 0 }) =>
    toScore(
        retrievalRatio * 0.42 +
        supportRatio * 0.14 +
        evidenceRatio * 0.05 +
        semanticScore * 0.23 +
        targetBoost * 0.1 +
        Math.max(0, 1 - negativeRatio) * 0.06
    );

const shouldRejectForNegativeConcepts = ({
    matchedNegativeConcepts = [],
    matchedRequiredConcepts = [],
    semanticScore = 0,
    primaryDomain = '',
} = {}) => {
    const negativeCount = Array.isArray(matchedNegativeConcepts) ? matchedNegativeConcepts.length : 0;
    const requiredCount = Array.isArray(matchedRequiredConcepts) ? matchedRequiredConcepts.length : 0;
    if (negativeCount === 0) return false;
    if (String(primaryDomain || '').trim() === 'ceza' && negativeCount > 0 && requiredCount < 2) return true;
    if (requiredCount === 0) return true;
    if (negativeCount > requiredCount && semanticScore < 0.7) return true;
    return false;
};

const canPassSummary = ({ queryMode = 'short_issue', summaryKeywordHits = 0, semanticScore = 0, config = {} } = {}) => {
    if (queryMode === 'case_file') {
        if (summaryKeywordHits >= config.requiredHitTarget) return true;
        return summaryKeywordHits >= 1 && semanticScore >= (config.singleHitSummarySemanticThreshold || config.summarySemanticThreshold || 0);
    }

    if (isCaseLikeQueryMode(queryMode)) {
        if (summaryKeywordHits >= config.requiredHitTarget) return true;
        return summaryKeywordHits >= 1 && semanticScore >= config.summarySemanticThreshold;
    }

    if (summaryKeywordHits >= config.summaryThresholdCount) return true;
    return summaryKeywordHits >= 1 && semanticScore >= config.summarySemanticThreshold;
};

const canPassFinal = ({ selectionMode = 'strict', queryMode = 'short_issue', retrievalHits = 0, supportHits = 0, semanticScore = 0, config = {} } = {}) => {
    if (selectionMode === 'semantic_fallback') {
        if (queryMode === 'case_file') {
            return semanticScore >= (config.fallbackSemanticThreshold || 0) && (
                retrievalHits >= 1 || supportHits >= (config.fallbackSupportThreshold || 2)
            );
        }
        return semanticScore >= config.fallbackSemanticThreshold && (retrievalHits >= 2 || (retrievalHits >= 1 && supportHits >= 2));
    }

    if (queryMode === 'case_file') {
        if (retrievalHits >= config.requiredHitTarget) return true;
        return retrievalHits >= 1 && semanticScore >= (config.singleHitFinalSemanticThreshold || config.finalSemanticThreshold || 0);
    }

    if (isCaseLikeQueryMode(queryMode)) {
        if (retrievalHits >= config.requiredHitTarget) return true;
        return retrievalHits >= 2 && semanticScore >= config.finalSemanticThreshold;
    }

    // short_issue: require at least 2 core concept matches, or high semantic with support
    if (retrievalHits >= config.requiredHitTarget) return true;
    if (retrievalHits >= 2 && semanticScore >= config.finalSemanticThreshold) return true;
    return false;
};

const buildZeroResultReason = ({ selectionMode = 'strict', totalCandidates = 0, summaryPassedCount = 0, fullTextCheckedCount = 0, finalMatchedCount = 0 } = {}) => {
    if (finalMatchedCount > 0) return null;
    if (totalCandidates === 0) return 'no_candidates';
    if (summaryPassedCount === 0) return 'summary_gate';
    if (fullTextCheckedCount === 0) return 'no_full_text';
    return selectionMode === 'semantic_fallback' ? 'fallback_gate' : 'strict_gate';
};

export const rerankLegalSearchResults = async ({
    results = [],
    query = '',
    aiSearchPlan = null,
    targetSources = [],
    limit = 20,
    fetchDocumentText,
    selectionMode = 'strict',
} = {}) => {
    const sortedResults = [...(Array.isArray(results) ? results : [])].sort((left, right) => {
        const rightScore = Number(right?.relevanceScore || 0);
        const leftScore = Number(left?.relevanceScore || 0);
        return rightScore - leftScore;
    });

    const queryMode = resolveQueryMode(aiSearchPlan);
    const retrievalConcepts = dedupeStrings(aiSearchPlan?.retrievalConcepts || aiSearchPlan?.canonicalRequiredConcepts || aiSearchPlan?.requiredConcepts || aiSearchPlan?.keywords || []);
    const supportConcepts = dedupeStrings(aiSearchPlan?.canonicalSupportConcepts || aiSearchPlan?.supportConcepts || []);
    const evidenceConcepts = dedupeStrings(aiSearchPlan?.evidenceConcepts || []);
    const negativeConcepts = dedupeStrings(aiSearchPlan?.negativeConcepts || []);
    const config = buildQueryModeConfig(queryMode, retrievalConcepts.length);
    const semanticQuery = String(aiSearchPlan?.semanticQuery || aiSearchPlan?.coreIssue || aiSearchPlan?.searchQuery || query || '').trim();

    if (!semanticQuery || retrievalConcepts.length === 0) {
        return {
            results: sortedResults.slice(0, limit),
            diagnostics: {
                enabled: false,
                reason: 'ai_plan_missing',
                queryMode,
                totalCandidates: sortedResults.length,
                strictFinalCount: 0,
                fallbackFinalCount: 0,
                fallbackUsed: false,
                finalMatchedCount: Math.min(sortedResults.length, limit),
            },
        };
    }

    const summaryTexts = sortedResults.map((result) =>
        buildDocumentEmbeddingText({ title: result.title, text: buildSummaryText(result), maxLength: SUMMARY_EMBED_CHAR_LIMIT })
    );
    const [queryVector] = await embedTexts([semanticQuery], { taskType: 'RETRIEVAL_QUERY' });
    const summaryVectors = await embedTexts(summaryTexts, { taskType: 'RETRIEVAL_DOCUMENT' });

    const summaryAnnotated = sortedResults.map((result, index) => {
        const summaryText = buildSummaryText(result);
        const matchedRequiredConcepts = getMatchedConcepts(summaryText, retrievalConcepts);
        const matchedSupportConcepts = getMatchedConcepts(summaryText, supportConcepts);
        const matchedEvidenceConcepts = getMatchedConcepts(summaryText, evidenceConcepts);
        const matchedNegativeConcepts = getMatchedConcepts(summaryText, negativeConcepts);
        const semanticScore = toScore(cosineSimilarity(queryVector, summaryVectors[index] || []));
        const retrievalHits = matchedRequiredConcepts.length;
        const supportHits = matchedSupportConcepts.length;
        const evidenceHits = matchedEvidenceConcepts.length;
        const retrievalRatio = retrievalConcepts.length > 0 ? retrievalHits / retrievalConcepts.length : 0;
        const supportRatio = supportConcepts.length > 0 ? supportHits / supportConcepts.length : 0;
        const evidenceRatio = evidenceConcepts.length > 0 ? evidenceHits / evidenceConcepts.length : 0;
        const negativeRatio = negativeConcepts.length > 0 ? matchedNegativeConcepts.length / negativeConcepts.length : 0;
        const targetBoost = sourceBoost(result.source, targetSources);
        const domainConfidence = buildDomainConfidence({ retrievalRatio, supportRatio, evidenceRatio, negativeRatio, semanticScore, targetBoost });
        const combinedScore = toScore(
            semanticScore * (isCaseLikeQueryMode(queryMode) ? 0.44 : 0.4) +
            retrievalRatio * (isCaseLikeQueryMode(queryMode) ? 0.28 : 0.32) +
            supportRatio * 0.08 +
            evidenceRatio * 0.04 +
            targetBoost * 0.08 +
            normalizeRelevance(result.relevanceScore) * 0.03 +
            domainConfidence * 0.08 -
            negativeRatio * 0.11
        );
        const missingRequiredConcepts = retrievalConcepts.filter((concept) =>
            !matchedRequiredConcepts.some((matched) => normalizeMatchText(matched) === normalizeMatchText(concept))
        );
        const rejectedByNegativeConcepts = shouldRejectForNegativeConcepts({
            matchedNegativeConcepts,
            matchedRequiredConcepts,
            semanticScore,
            primaryDomain: aiSearchPlan?.primaryDomain || aiSearchPlan?.domain || '',
        });
        const matchHighlights = dedupeStrings([...matchedRequiredConcepts, ...matchedSupportConcepts, ...matchedEvidenceConcepts]);

        return {
            ...result,
            summaryText,
            summaryHasDetails: hasDetailedSummaryText(result),
            semanticScore,
            similarityScore: semanticScore,
            summaryKeywordHits: retrievalHits,
            summarySupportHits: supportHits,
            summaryEvidenceHits: evidenceHits,
            fullTextKeywordHits: 0,
            matchedKeywords: matchHighlights,
            matchedRequiredConcepts,
            missingRequiredConcepts,
            matchedSupportConcepts,
            matchedEvidenceConcepts,
            matchedNegativeConcepts,
            retrievalStage: 'summary',
            sourceUsed: result.source || '',
            combinedScore,
            domainConfidence,
            matchedKeywordCount: retrievalHits,
            requiredKeywordCount: config.requiredHitTarget,
            matchStage: 'summary',
            selectionReason: buildSelectionReason({ selectionMode, queryMode, semanticScore, summaryKeywordHits: retrievalHits, retrievalStage: 'summary', matchedNegativeConcepts }),
            matchReason: buildSelectionReason({ selectionMode, queryMode, semanticScore, summaryKeywordHits: retrievalHits, retrievalStage: 'summary', matchedNegativeConcepts }),
            matchHighlights,
            rejectedByNegativeConcepts,
            rejectionReason: rejectedByNegativeConcepts ? 'negative_concepts' : undefined,
        };
    });

    const strictSummaryCandidates = summaryAnnotated
        .filter((result) => {
            if (result.rejectedByNegativeConcepts) return false;
            return canPassSummary({
                queryMode,
                summaryKeywordHits: result.summaryKeywordHits,
                semanticScore: result.semanticScore,
                config,
            });
        })
        .sort((left, right) => {
            const hitGap = (right.summaryKeywordHits || 0) - (left.summaryKeywordHits || 0);
            if (hitGap !== 0) return hitGap;
            return (right.combinedScore || 0) - (left.combinedScore || 0);
        });

    const fullTextSeedLimit = Math.min(FULL_TEXT_CANDIDATE_LIMIT, Math.max(limit * 2, 10));
    const fullTextCandidates = [];
    const seenFullTextKeys = new Set();
    const addFullTextCandidate = (candidate) => {
        if (!candidate || fullTextCandidates.length >= fullTextSeedLimit) return;
        const key = String(candidate.documentId || '').trim() || `${candidate.source || ''}|${candidate.title || ''}|${candidate.esasNo || ''}|${candidate.kararNo || ''}`;
        if (!key || seenFullTextKeys.has(key)) return;
        seenFullTextKeys.add(key);
        fullTextCandidates.push(candidate);
    };

    strictSummaryCandidates.forEach(addFullTextCandidate);
    rankResultsForFullText(summaryAnnotated, targetSources).forEach(addFullTextCandidate);

    const fullTexts = await Promise.all(fullTextCandidates.map(async (result) => {
        try {
            const rawText = await fetchDocumentText(result);
            const cleanText = String(rawText || '').trim();
            return buildDocumentEmbeddingText({ title: result.title, text: cleanText, maxLength: FULL_TEXT_EMBED_CHAR_LIMIT });
        } catch {
            return '';
        }
    }));

    const fullTextVectorIndexes = fullTexts
        .map((text, index) => ({ text, index }))
        .filter((item) => item.text.length > 0);
    
    let fullTextVectors = [];
    try {
        if (fullTextVectorIndexes.length > 0) {
            fullTextVectors = await embedTexts(fullTextVectorIndexes.map((item) => item.text), { taskType: 'RETRIEVAL_DOCUMENT' });
        }
    } catch (err) {
        console.warn(`[legalSearchRerank] Tam metin embedding hatasi (aday sayisi: \${fullTextVectorIndexes.length}):`, err.message);
        // Hata durumunda fullTextVectors bos kalir, asagidaki islemde vectorIndex bulunsa bile (fullTextVectors[vectorIndex] || []) guvende oluruz.
        // Boylece reranker tamamen cokmek yerine en azindan ozet (summary) bazli skorlarla filtelemeye devam edebilir.
    }

    const finalCandidates = fullTextCandidates.map((result, candidateIndex) => {
        const vectorEntry = fullTextVectorIndexes.find((item) => item.index === candidateIndex);
        const vectorIndex = vectorEntry ? fullTextVectorIndexes.findIndex((item) => item.index === vectorEntry.index) : -1;
        const fullText = vectorEntry?.text || '';
        const referenceText = fullText || buildSummaryText(result);
        const matchedRequiredConcepts = getMatchedConcepts(referenceText, retrievalConcepts);
        const matchedSupportConcepts = getMatchedConcepts(referenceText, supportConcepts);
        const matchedEvidenceConcepts = getMatchedConcepts(referenceText, evidenceConcepts);
        const matchedNegativeConcepts = getMatchedConcepts(referenceText, negativeConcepts);
        const retrievalHits = matchedRequiredConcepts.length;
        const supportHits = matchedSupportConcepts.length;
        const evidenceHits = matchedEvidenceConcepts.length;
        const fullTextSemanticScore = vectorIndex >= 0 ? toScore(cosineSimilarity(queryVector, fullTextVectors[vectorIndex] || [])) : 0;
        const semanticScore = Math.max(result.semanticScore || 0, fullTextSemanticScore);
        const retrievalRatio = retrievalConcepts.length > 0 ? retrievalHits / retrievalConcepts.length : 0;
        const supportRatio = supportConcepts.length > 0 ? supportHits / supportConcepts.length : 0;
        const evidenceRatio = evidenceConcepts.length > 0 ? evidenceHits / evidenceConcepts.length : 0;
        const negativeRatio = negativeConcepts.length > 0 ? matchedNegativeConcepts.length / negativeConcepts.length : 0;
        const targetBoost = sourceBoost(result.source, targetSources);
        const domainConfidence = buildDomainConfidence({ retrievalRatio, supportRatio, evidenceRatio, negativeRatio, semanticScore, targetBoost });
        const combinedScore = toScore(
            semanticScore * (isCaseLikeQueryMode(queryMode) ? 0.42 : 0.39) +
            retrievalRatio * (isCaseLikeQueryMode(queryMode) ? 0.3 : 0.34) +
            supportRatio * 0.08 +
            evidenceRatio * 0.04 +
            targetBoost * 0.08 +
            normalizeRelevance(result.relevanceScore) * 0.03 +
            domainConfidence * 0.09 -
            negativeRatio * 0.12
        );
        const retrievalStage = fullText ? 'full_text' : 'summary';
        const missingRequiredConcepts = retrievalConcepts.filter((concept) =>
            !matchedRequiredConcepts.some((matched) => normalizeMatchText(matched) === normalizeMatchText(concept))
        );
        const rejectedByNegativeConcepts = shouldRejectForNegativeConcepts({
            matchedNegativeConcepts,
            matchedRequiredConcepts,
            semanticScore,
            primaryDomain: aiSearchPlan?.primaryDomain || aiSearchPlan?.domain || '',
        });
        const matchHighlights = dedupeStrings([...matchedRequiredConcepts, ...matchedSupportConcepts, ...matchedEvidenceConcepts]);

        return {
            ...result,
            semanticScore,
            similarityScore: semanticScore,
            fullTextKeywordHits: retrievalHits,
            fullTextSupportHits: supportHits,
            fullTextEvidenceHits: evidenceHits,
            matchedKeywords: matchHighlights,
            matchedRequiredConcepts,
            missingRequiredConcepts,
            matchedSupportConcepts,
            matchedEvidenceConcepts,
            matchedNegativeConcepts,
            matchedKeywordCount: retrievalHits,
            retrievalStage,
            matchStage: retrievalStage,
            combinedScore,
            domainConfidence,
            sourceUsed: result.source || '',
            selectionReason: buildSelectionReason({
                selectionMode,
                queryMode,
                semanticScore,
                summaryKeywordHits: result.summaryKeywordHits,
                fullTextKeywordHits: retrievalHits,
                retrievalStage,
                matchedNegativeConcepts,
            }),
            matchReason: buildSelectionReason({
                selectionMode,
                queryMode,
                semanticScore,
                summaryKeywordHits: result.summaryKeywordHits,
                fullTextKeywordHits: retrievalHits,
                retrievalStage,
                matchedNegativeConcepts,
            }),
            matchHighlights,
            rejectedByNegativeConcepts,
            rejectionReason: rejectedByNegativeConcepts ? 'negative_concepts' : undefined,
        };
    });

    const finalResults = finalCandidates
        .filter((result) => {
            if (result.rejectedByNegativeConcepts) return false;
            const retrievalHits = result.retrievalStage === 'full_text'
                ? result.fullTextKeywordHits
                : result.summaryKeywordHits;
            const supportHits = result.retrievalStage === 'full_text'
                ? result.fullTextSupportHits
                : result.summarySupportHits;
            return canPassFinal({
                selectionMode,
                queryMode,
                retrievalHits,
                supportHits,
                semanticScore: result.semanticScore,
                config,
            });
        })
        .sort((left, right) => {
            const hitGap = (right.fullTextKeywordHits || right.summaryKeywordHits || 0) - (left.fullTextKeywordHits || left.summaryKeywordHits || 0);
            if (hitGap !== 0) return hitGap;
            const supportGap = (right.fullTextSupportHits || right.summarySupportHits || 0) - (left.fullTextSupportHits || left.summarySupportHits || 0);
            if (supportGap !== 0) return supportGap;
            const semanticGap = (right.semanticScore || 0) - (left.semanticScore || 0);
            if (semanticGap !== 0) return semanticGap;
            return (right.combinedScore || 0) - (left.combinedScore || 0);
        })
        .slice(0, limit);

    const strictFinalCount = selectionMode === 'strict' ? finalResults.length : 0;
    const fallbackFinalCount = selectionMode === 'semantic_fallback' ? finalResults.length : 0;

    return {
        results: finalResults.map((result) => ({
            ...result,
            semanticScore: toScore(result.semanticScore),
            similarityScore: toScore(result.semanticScore),
            combinedScore: toScore(result.combinedScore),
            domainConfidence: toScore(result.domainConfidence),
        })),
        diagnostics: {
            enabled: true,
            selectionMode,
            queryMode,
            semanticModel: GEMINI_EMBEDDING_MODEL_NAME,
            embeddingDimension: GEMINI_EMBEDDING_DIMENSION,
            legalArea: aiSearchPlan?.legalArea || aiSearchPlan?.primaryDomain || null,
            primaryDomain: aiSearchPlan?.primaryDomain || aiSearchPlan?.legalArea || null,
            secondaryDomains: aiSearchPlan?.secondaryDomains || [],
            keywords: retrievalConcepts,
            retrievalConcepts,
            requiredConcepts: retrievalConcepts,
            supportConcepts,
            evidenceConcepts,
            negativeConcepts,
            requiredKeywordCount: config.requiredHitTarget,
            summaryThresholdCount: config.summaryThresholdCount,
            totalCandidates: sortedResults.length,
            summaryRankedCount: summaryAnnotated.length,
            summaryPassedCount: strictSummaryCandidates.length,
            fullTextCheckedCount: fullTextCandidates.length,
            fullTextFallbackUsed: fullTextCandidates.length > strictSummaryCandidates.length,
            strictFinalCount,
            fallbackFinalCount,
            fallbackUsed: selectionMode === 'semantic_fallback' && finalResults.length > 0,
            zeroResultReason: buildZeroResultReason({
                selectionMode,
                totalCandidates: sortedResults.length,
                summaryPassedCount: strictSummaryCandidates.length,
                fullTextCheckedCount: fullTextCandidates.length,
                finalMatchedCount: finalResults.length,
            }),
            finalMatchedCount: finalResults.length,
        },
    };
};

export const __testables = {
    buildQueryModeConfig,
    canPassSummary,
    canPassFinal,
    buildZeroResultReason,
};
