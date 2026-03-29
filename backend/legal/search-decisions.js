import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { analyzerOutputToPacket } from '../gemini/document-analyzer.js';
import { normalizeAiLegalSearchPlanWithDiagnostics, generateLegalSearchPlanWithDiagnostics } from '../gemini/legal-search-plan-core.js';
import { searchLegalDecisionsViaMcp } from '../../lib/legal/mcpLegalSearch.js';
import {
    searchLegalDecisionsViaSimpleBedesten,
    supportsSimpleBedestenSearch,
} from '../../lib/legal/simpleBedestenService.js';
import {
    normalizeExplicitLegalSearchPacket,
    resolveLegalSearchContract,
} from '../../lib/legal/legal-search-packet-adapter.js';
import { sanitizeLegalInput } from '../../lib/legal/legal-text-utils.js';
import { multiStrategySearch } from '../../lib/legal/legal-multi-search.js';
import { buildSearchStrategies } from '../../lib/legal/legal-strategy-builder.js';
import { evaluatePrecedents } from '../gemini/legal-precedent-evaluator.js';

const ALLOW_LEGACY_FALLBACK = process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK !== '0';
const LEGAL_PRIMARY_BACKEND = String(process.env.LEGAL_PRIMARY_BACKEND || 'simple').trim().toLowerCase() === 'mcp'
    ? 'mcp'
    : 'simple';
const LEGAL_SIMPLE_PROVIDER = 'http';

const normalizePacketText = (value = '', maxLength = 240) =>
    sanitizeLegalInput(String(value || '').replace(/\s+/g, ' ').trim()).text.slice(0, maxLength).trim();

const buildPacketFallbackText = (packet = null) => {
    if (!packet) return '';

    const directSearchSeedText = normalizePacketText(packet.searchSeedText, 240);
    if (directSearchSeedText) return directSearchSeedText;

    const directVariantQuery = normalizePacketText(packet.searchVariants?.[0]?.query, 220);
    if (directVariantQuery) return directVariantQuery;

    return [
        packet.coreIssue,
        packet.caseType,
        ...(Array.isArray(packet.requiredConcepts) ? packet.requiredConcepts.slice(0, 4) : []),
        ...(Array.isArray(packet.supportConcepts) ? packet.supportConcepts.slice(0, 2) : []),
    ]
        .map((value) => normalizePacketText(value, 240))
        .filter(Boolean)
        .join(' ')
        .trim();
};

const normalizeApiResultShape = (result = {}) => {
    const resolvedBirimAdi = String(
        result?.birimAdi
        || result?.daire
        || result?.birim
        || result?.chamber
        || ''
    ).trim();
    const resolvedKararTarihi = String(
        result?.kararTarihi
        || result?.kararTarihiStr
        || result?.tarih
        || ''
    ).trim();
    const resolvedDocumentId = String(result?.documentId || result?.id || '').trim();
    const resolvedSourceUrl = String(
        result?.sourceUrl
        || result?.documentUrl
        || (resolvedDocumentId ? `https://mevzuat.adalet.gov.tr/ictihat/${resolvedDocumentId}` : '')
    ).trim();
    const numericMergedScore = Number(result?.contentMergedScore);
    const fallbackMergedScore = Number(result?.__mergedScore01);
    const numericEmbeddingScore = Number(result?.contentEmbeddingScore);

    return {
        ...result,
        birimAdi: resolvedBirimAdi || undefined,
        daire: String(result?.daire || resolvedBirimAdi || '').trim() || undefined,
        kararTarihi: resolvedKararTarihi || undefined,
        tarih: String(result?.tarih || resolvedKararTarihi || '').trim() || undefined,
        contentMergedScore: Number.isFinite(numericMergedScore)
            ? numericMergedScore
            : (Number.isFinite(fallbackMergedScore) ? fallbackMergedScore : undefined),
        contentEmbeddingScore: Number.isFinite(numericEmbeddingScore) ? numericEmbeddingScore : undefined,
        sourceUrl: resolvedSourceUrl || undefined,
    };
};

const normalizeApiResults = (results = []) =>
    Array.isArray(results) ? results.map((result) => normalizeApiResultShape(result)) : [];

const normalizeRetrievalDiagnostics = (diagnostics = {}, resultCount = 0) => ({
    ...diagnostics,
    agentDomain: diagnostics?.agentDomain || diagnostics?.primaryDomain || diagnostics?.packetPrimaryDomain || null,
    embeddingQuery: typeof diagnostics?.embeddingQuery === 'string' && diagnostics.embeddingQuery.trim()
        ? diagnostics.embeddingQuery.trim()
        : null,
    selectedBirimAdi: diagnostics?.selectedBirimAdi || diagnostics?.firstSuccessfulBirimAdi || null,
    totalCandidates: Number.isFinite(Number(diagnostics?.totalCandidates))
        ? Number(diagnostics.totalCandidates)
        : resultCount,
});

const resolveDocumentAnalyzerResult = (body = null) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    const candidate = body.documentAnalyzerResult || body.analyzerResult || body.documentAnalysis || null;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    return candidate;
};

const mergeRequestPackets = ({
    analyzerPacket = null,
    explicitPacket = null,
} = {}) => {
    const normalizedAnalyzerPacket = normalizeExplicitLegalSearchPacket(analyzerPacket);
    const normalizedExplicitPacket = normalizeExplicitLegalSearchPacket(explicitPacket);

    if (!normalizedAnalyzerPacket) return normalizedExplicitPacket;
    if (!normalizedExplicitPacket) return normalizedAnalyzerPacket;

    return normalizeExplicitLegalSearchPacket({
        primaryDomain: normalizedExplicitPacket.primaryDomain || normalizedAnalyzerPacket.primaryDomain,
        caseType: normalizedExplicitPacket.caseType || normalizedAnalyzerPacket.caseType,
        coreIssue: normalizedExplicitPacket.coreIssue || normalizedAnalyzerPacket.coreIssue,
        requiredConcepts: (normalizedExplicitPacket.requiredConcepts || []).length > 0
            ? normalizedExplicitPacket.requiredConcepts
            : normalizedAnalyzerPacket.requiredConcepts,
        supportConcepts: (normalizedExplicitPacket.supportConcepts || []).length > 0
            ? normalizedExplicitPacket.supportConcepts
            : normalizedAnalyzerPacket.supportConcepts,
        evidenceConcepts: (normalizedExplicitPacket.evidenceConcepts || []).length > 0
            ? normalizedExplicitPacket.evidenceConcepts
            : normalizedAnalyzerPacket.evidenceConcepts,
        negativeConcepts: (normalizedExplicitPacket.negativeConcepts || []).length > 0
            ? normalizedExplicitPacket.negativeConcepts
            : normalizedAnalyzerPacket.negativeConcepts,
        preferredSource: normalizedExplicitPacket.preferredSource || normalizedAnalyzerPacket.preferredSource,
        preferredBirimCodes: (normalizedExplicitPacket.preferredBirimCodes || []).length > 0
            ? normalizedExplicitPacket.preferredBirimCodes
            : normalizedAnalyzerPacket.preferredBirimCodes,
        searchSeedText: normalizedExplicitPacket.searchSeedText || normalizedAnalyzerPacket.searchSeedText,
        searchVariants: (normalizedExplicitPacket.searchVariants || []).length > 0
            ? normalizedExplicitPacket.searchVariants
            : normalizedAnalyzerPacket.searchVariants,
        fallbackToNext: normalizedExplicitPacket.fallbackToNext !== undefined
            ? normalizedExplicitPacket.fallbackToNext
            : normalizedAnalyzerPacket.fallbackToNext,
        queryMode: normalizedExplicitPacket.queryMode || normalizedAnalyzerPacket.queryMode,
    });
};

const buildLegacyRetrievalDiagnostics = ({
    legacyPayload = {},
    simplePayload = null,
    fallbackReason = 'legacy_requested',
} = {}) => {
    const base = legacyPayload?.retrievalDiagnostics && typeof legacyPayload.retrievalDiagnostics === 'object'
        ? legacyPayload.retrievalDiagnostics
        : {};
    const queryVariants = Array.isArray(simplePayload?.retrievalDiagnostics?.queryVariants)
        ? simplePayload.retrievalDiagnostics.queryVariants
        : [];
    const targetSources = Array.isArray(base?.targetSources) && base.targetSources.length > 0
        ? base.targetSources
        : (Array.isArray(simplePayload?.retrievalDiagnostics?.targetSources)
            ? simplePayload.retrievalDiagnostics.targetSources
            : []);
    const resultCount = Array.isArray(legacyPayload?.results) ? legacyPayload.results.length : 0;
    const simpleQualityScore = Number(simplePayload?.retrievalDiagnostics?.simpleQualityScore);
    const qualityWarnings = Array.isArray(simplePayload?.retrievalDiagnostics?.qualityWarnings)
        ? simplePayload.retrievalDiagnostics.qualityWarnings
        : [];
    const packetDiagnostics = simplePayload?.retrievalDiagnostics?.packetApplied
        ? {
            packetApplied: true,
            packetPrimaryDomain: simplePayload?.retrievalDiagnostics?.packetPrimaryDomain || null,
            packetCaseType: simplePayload?.retrievalDiagnostics?.packetCaseType || null,
            packetRequiredConceptCount: Number(simplePayload?.retrievalDiagnostics?.packetRequiredConceptCount) || 0,
        }
        : {};

    return {
        ...base,
        backendMode: 'legacy_mcp',
        queryVariants,
        fallbackUsed: true,
        fallbackReason,
        upstream: 'legacy_mcp',
        targetSources,
        finalMatchedCount: Number.isFinite(Number(base?.finalMatchedCount))
            ? Number(base.finalMatchedCount)
            : resultCount,
        simpleQualityScore: Number.isFinite(simpleQualityScore) ? simpleQualityScore : undefined,
        qualityWarnings,
        ...packetDiagnostics,
        zeroResultReason: typeof base?.zeroResultReason === 'string'
            ? base.zeroResultReason
            : (resultCount === 0 ? 'no_candidates' : null),
    };
};

const buildSimpleResponsePayload = ({
    payload = {},
    searchMode = 'auto',
    planDiagnostics = undefined,
    fallbackUsed = false,
    fallbackReason = null,
} = {}) => {
    const results = normalizeApiResults(payload?.results || []);
    const inheritedFallbackReason = payload?.retrievalDiagnostics?.fallbackReason || null;
    const resolvedFallbackReason = fallbackReason || inheritedFallbackReason || null;
    const inheritedZeroResultReason = payload?.retrievalDiagnostics?.zeroResultReason || null;
    const sourceCoverageStatus = payload?.retrievalDiagnostics?.sourceCoverageStatus
        || (resolvedFallbackReason === 'unsupported_source'
            ? 'unsupported'
            : (String(resolvedFallbackReason || '').includes('429')
                ? 'rate_limited'
                : (inheritedZeroResultReason === 'no_candidates'
                    ? 'no_candidates'
                    : (resolvedFallbackReason ? 'dependency_error' : undefined))));
    const retrievalDiagnostics = normalizeRetrievalDiagnostics({
        ...(payload?.retrievalDiagnostics || {}),
        backendMode: 'simple_bedesten',
        fallbackUsed,
        fallbackReason: resolvedFallbackReason,
        upstream: 'bedesten',
        sourceCoverageStatus,
    }, results.length);

    return {
        ...payload,
        results,
        searchMode,
        retrievalDiagnostics,
        diagnostics: retrievalDiagnostics,
        planDiagnostics,
    };
};

const buildMcpPrimaryResponsePayload = ({
    payload = {},
    fallbackUsed = false,
    fallbackReason = null,
    planDiagnostics = undefined,
    searchMode = 'auto',
} = {}) => {
    const base = payload?.retrievalDiagnostics && typeof payload.retrievalDiagnostics === 'object'
        ? payload.retrievalDiagnostics
        : {};
    const results = normalizeApiResults(payload?.results || []);
    const retrievalDiagnostics = normalizeRetrievalDiagnostics({
        ...base,
        backendMode: 'mcp_primary',
        fallbackUsed,
        fallbackReason,
        upstream: 'mcp',
        finalMatchedCount: Number.isFinite(Number(base?.finalMatchedCount))
            ? Number(base.finalMatchedCount)
            : results.length,
        zeroResultReason: typeof base?.zeroResultReason === 'string'
            ? base.zeroResultReason
            : (results.length === 0 ? 'no_candidates' : null),
    }, results.length);

    return {
        ...payload,
        results,
        searchMode,
        retrievalDiagnostics,
        diagnostics: retrievalDiagnostics,
        planDiagnostics: planDiagnostics || payload?.planDiagnostics || undefined,
    };
};

const shouldFallbackForLowQuality = (payload = null) => {
    const resultCount = Array.isArray(payload?.results) ? payload.results.length : 0;
    if (resultCount === 0) return false;
    if (!payload?.retrievalDiagnostics?.contentRerankApplied) return false;

    const qualityScore = Number(payload?.retrievalDiagnostics?.simpleQualityScore);
    return Number.isFinite(qualityScore) && qualityScore < 80;
};

const shouldReturnCliResponseDirectly = () => false;

const isAbortLikeError = (error = null, abortSignal = null, req = null) =>
    error?.code === 'REQUEST_ABORTED'
    || abortSignal?.aborted
    || req?.aborted;

const buildLegacyResponsePayload = ({
    payload = {},
    simplePayload = null,
    fallbackReason = 'legacy_requested',
    planDiagnostics = undefined,
    searchMode = 'auto',
} = {}) => {
    const retrievalDiagnostics = buildLegacyRetrievalDiagnostics({
        legacyPayload: payload,
        simplePayload,
        fallbackReason,
    });
    const results = normalizeApiResults(payload?.results || []);
    const normalizedRetrievalDiagnostics = normalizeRetrievalDiagnostics(retrievalDiagnostics, results.length);

    return {
        ...payload,
        results,
        searchMode,
        retrievalDiagnostics: normalizedRetrievalDiagnostics,
        diagnostics: normalizedRetrievalDiagnostics,
        planDiagnostics: planDiagnostics || payload?.planDiagnostics || undefined,
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

    const requestAbortController = new AbortController();
    const abortRequest = () => {
        if (!requestAbortController.signal.aborted) {
            requestAbortController.abort();
        }
    };

    // Global safety timeout: respond before Vercel kills the function (60s limit)
    const GLOBAL_TIMEOUT_MS = 55000;
    let globalTimedOut = false;
    const globalTimer = setTimeout(() => {
        globalTimedOut = true;
        abortRequest();
        console.warn('[LEGAL_SEARCH] Global 55s safety timeout triggered');
        if (!res.headersSent) {
            return res.status(200).json({
                results: [],
                searchMode: 'auto',
                retrievalDiagnostics: {
                    backendMode: 'timeout_safety',
                    fallbackUsed: false,
                    fallbackReason: 'global_timeout_55s',
                    upstream: 'none',
                    zeroResultReason: 'global_timeout',
                },
                diagnostics: { globalTimeout: true },
            });
        }
    }, GLOBAL_TIMEOUT_MS);

    req?.once?.('aborted', abortRequest);
    res?.once?.('close', () => {
        if (!res.writableEnded) {
            abortRequest();
        }
    });

    try {
        const source = String(req?.body?.source || 'all').trim().toLowerCase();
        const agenticSignalsEnabled = String(process.env.LEGAL_AGENTIC_SIGNALS_ENABLED || '').trim() === 'true';
        const embeddingRerankEnabled = String(process.env.LEGAL_EMBEDDING_RERANK_ENABLED || '').trim() === 'true';
        if (!agenticSignalsEnabled) {
            process.env.LEGAL_AGENT_PIPELINE = '0';
        }
        if (!embeddingRerankEnabled) {
            process.env.LEGAL_EMBEDDING_RERANK_ENABLED = 'false';
        }
        const analyzerResult = resolveDocumentAnalyzerResult(req?.body);
        const analyzerPacket = analyzerOutputToPacket(analyzerResult);
        const legalSearchPacket = mergeRequestPackets({
            analyzerPacket,
            explicitPacket: req?.body?.legalSearchPacket,
        });
        const packetFallbackText = buildPacketFallbackText(legalSearchPacket);
        const keyword = sanitizeLegalInput(req?.body?.keyword || '').text;
        const rawQuery = sanitizeLegalInput(req?.body?.rawQuery || packetFallbackText || keyword || '').text;
        const rawText = [keyword, rawQuery].filter(Boolean).join(' ').trim() || rawQuery;
        const filters = req?.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
        const requestedSearchMode = req?.body?.searchMode ?? req?.body?.mode ?? 'auto';
        const normalizedSearchMode = String(requestedSearchMode || 'auto').trim().toLowerCase() === 'pro'
            ? 'pro'
            : 'auto';

        console.info(
            `[LEGAL_SEARCH] API start source=${source}, mode=${normalizedSearchMode}, provider=${LEGAL_SIMPLE_PROVIDER}, rawQuery="${rawQuery.slice(0, 120)}"`
        );

        if (!rawQuery) {
            return res.status(400).json({ error: 'rawQuery veya keyword gereklidir.' });
        }

        let normalizedProvidedPlan = null;
        if (req?.body?.aiSearchPlan && typeof req.body.aiSearchPlan === 'object') {
            normalizedProvidedPlan = normalizeAiLegalSearchPlanWithDiagnostics(req.body.aiSearchPlan, source);
        } else if (
            agenticSignalsEnabled
            && normalizedSearchMode === 'pro'
            && !legalSearchPacket
            && rawQuery
            && rawQuery.length > 100
        ) {
            try {
                const generatedPlan = await generateLegalSearchPlanWithDiagnostics({ rawText: rawQuery, preferredSource: source });
                if (generatedPlan && generatedPlan.plan) {
                    normalizedProvidedPlan = {
                        plan: generatedPlan.plan,
                        planDiagnostics: generatedPlan.diagnostics,
                    };
                    console.info(`[LEGAL_SEARCH] Auto-generated AI plan for pro search mode (rawQuery: ${rawQuery.slice(0, 50)})`);
                }
            } catch (planError) {
                console.warn('[LEGAL_SEARCH] Failed to auto-generate AI plan:', planError?.message || planError);
            }
        }
        const resolvedContract = resolveLegalSearchContract({
            rawText,
            preferredSource: source,
            explicitPacket: legalSearchPacket,
            aiSearchPlan: normalizedProvidedPlan?.plan || null,
        });
        const resolvedLegalSearchPacket = resolvedContract.legalSearchPacket;
        const resolvedAiSearchPlan = resolvedContract.aiSearchPlan;
        const effectiveSource = String(
            resolvedLegalSearchPacket?.preferredSource
            || source
            || 'all'
        ).trim().toLowerCase() || 'all';

        if (LEGAL_PRIMARY_BACKEND === 'mcp') {
            const mcpPayload = await searchLegalDecisionsViaMcp({
                source: effectiveSource,
                keyword,
                rawQuery,
                filters,
                aiSearchPlan: resolvedAiSearchPlan,
                abortSignal: requestAbortController.signal,
            });

            if (requestAbortController.signal.aborted) {
                return;
            }

            if ((mcpPayload?.results || []).length > 0) {
                return res.status(200).json(buildMcpPrimaryResponsePayload({
                    payload: mcpPayload,
                    searchMode: normalizedSearchMode,
                    planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
                }));
            }

            const simpleSupportedInMcpMode = supportsSimpleBedestenSearch({ source: effectiveSource, filters });
            if (!simpleSupportedInMcpMode) {
                return res.status(200).json(buildMcpPrimaryResponsePayload({
                    payload: mcpPayload,
                    fallbackUsed: false,
                    fallbackReason: null,
                    searchMode: normalizedSearchMode,
                    planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
                }));
            }

            try {
                const simplePayloadFromMcpFallback = await searchLegalDecisionsViaSimpleBedesten({
                    source: effectiveSource,
                    keyword,
                    rawQuery,
                    filters,
                    searchMode: normalizedSearchMode,
                    legalSearchPacket: resolvedLegalSearchPacket,
                    abortSignal: requestAbortController.signal,
                    provider: LEGAL_SIMPLE_PROVIDER,
                });

                if (requestAbortController.signal.aborted) {
                    return;
                }

                if ((simplePayloadFromMcpFallback?.results || []).length > 0 && !shouldFallbackForLowQuality(simplePayloadFromMcpFallback)) {
                    return res.status(200).json(buildSimpleResponsePayload({
                        payload: simplePayloadFromMcpFallback,
                        searchMode: normalizedSearchMode,
                        planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
                        fallbackUsed: true,
                        fallbackReason: 'mcp_primary_no_results',
                    }));
                }
            } catch (error) {
                if (isAbortLikeError(error, requestAbortController.signal, req)) {
                    throw error;
                }
                console.warn('[MCP Primary] simple fallback failed:', error?.message || error);
            }

            return res.status(200).json(buildMcpPrimaryResponsePayload({
                payload: mcpPayload,
                searchMode: normalizedSearchMode,
                planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
            }));
        }

        const simpleSupported = supportsSimpleBedestenSearch({ source: effectiveSource, filters });
        let simplePayload = null;
        let fallbackReason = simpleSupported ? 'simple_no_results' : 'unsupported_source';

        if (simpleSupported) {
            const isLongQuery = rawQuery.length > 100;
            if (isLongQuery) {
                try {
                    console.log(`[LEGAL_SEARCH] Multi-Strategy path activated (rawQuery.length=${rawQuery.length}, mode=${normalizedSearchMode})`);
                    const strategies = await buildSearchStrategies({
                        rawText: rawQuery,
                        preferredSource: effectiveSource,
                        forceAiStrategy: true,
                    });

                    if (strategies && strategies.length > 0) {
                        const multiResult = await multiStrategySearch({
                            strategies,
                            rawQuery,
                            limit: 10,
                            source: effectiveSource,
                            skipEnrichment: false,
                        });

                        if (requestAbortController.signal.aborted) {
                            return;
                        }

                        if ((multiResult?.results || []).length > 0) {
                            console.log(`[LEGAL_SEARCH] Multi-Strategy returned ${multiResult.results.length} results`);
                            
                            // Değerlendirme (Faz 4)
                            const evaluationResult = await evaluatePrecedents({
                                decisions: multiResult.results,
                                caseContext: rawQuery,
                                userRole: req?.body?.userRole || 'notr',
                                topN: 10
                            });

                            return res.status(200).json(buildSimpleResponsePayload({
                                payload: {
                                    ...multiResult,
                                    results: evaluationResult.evaluated, // Değerlendirilmiş sonuçlar
                                    evaluationGroups: evaluationResult.groups, // Gruplandırılmış sonuçlar
                                    retrievalDiagnostics: {
                                        ...(multiResult?.retrievalDiagnostics || {}),
                                        backendMode: 'multi_strategy',
                                        strategyCount: strategies.length,
                                        evaluationMetrics: evaluationResult._metadata,
                                        ...(multiResult?._metadata || {}),
                                    },
                                },
                                searchMode: normalizedSearchMode,
                                planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
                            }));
                        }
                        console.log('[LEGAL_SEARCH] Multi-Strategy returned 0 results, falling back to single query.');
                    }
                } catch (multiError) {
                    if (isAbortLikeError(multiError, requestAbortController.signal, req)) {
                        throw multiError;
                    }
                    console.warn('[LEGAL_SEARCH] Multi-Strategy failed, falling back to single query:', multiError?.message || multiError);
                }
            }

            try {
                simplePayload = await searchLegalDecisionsViaSimpleBedesten({
                    source: effectiveSource,
                    keyword,
                    rawQuery,
                    filters,
                    searchMode: normalizedSearchMode,
                    legalSearchPacket: resolvedLegalSearchPacket,
                    abortSignal: requestAbortController.signal,
                    provider: LEGAL_SIMPLE_PROVIDER,
                });

                if (requestAbortController.signal.aborted) {
                    return;
                }

                if ((simplePayload?.results || []).length > 0) {
                    if (!shouldFallbackForLowQuality(simplePayload)) {
                        return res.status(200).json(buildSimpleResponsePayload({
                            payload: simplePayload,
                            searchMode: normalizedSearchMode,
                            planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
                        }));
                    }

                    fallbackReason = 'quality_gate_low';
                }
            } catch (error) {
                if (isAbortLikeError(error, requestAbortController.signal, req)) {
                    throw error;
                }
                console.warn('[Simple Bedesten] fallback to legacy search:', error?.message || error);
                fallbackReason = String(error?.code || error?.message || 'simple_bedesten_error');
            }
        }

        if (shouldReturnCliResponseDirectly(simplePayload)) {
            return res.status(200).json(buildSimpleResponsePayload({
                payload: simplePayload || {
                    results: [],
                    retrievalDiagnostics: {
                        backendMode: 'simple_bedesten',
                        queryVariants: [],
                        selectedQueryVariant: null,
                        fallbackUsed: false,
                        fallbackReason,
                        upstream: 'bedesten',
                        zeroResultReason: 'no_candidates',
                    },
                },
                searchMode: normalizedSearchMode,
                planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
            }));
        }

        if (!ALLOW_LEGACY_FALLBACK) {
            return res.status(200).json(buildSimpleResponsePayload({
                payload: simplePayload || {
                    results: [],
                    retrievalDiagnostics: {
                        backendMode: 'simple_bedesten',
                        queryVariants: [],
                        selectedQueryVariant: null,
                        fallbackUsed: false,
                        fallbackReason,
                        upstream: 'bedesten',
                        zeroResultReason: 'no_candidates',
                    },
                },
                searchMode: normalizedSearchMode,
                planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
            }));
        }

        const legacyPayload = await searchLegalDecisionsViaMcp({
            source: effectiveSource,
            keyword,
            rawQuery,
            filters,
            aiSearchPlan: resolvedAiSearchPlan,
            abortSignal: requestAbortController.signal,
        });

        if (requestAbortController.signal.aborted) {
            return;
        }

        return res.status(200).json(buildLegacyResponsePayload({
            payload: legacyPayload,
            simplePayload,
            fallbackReason,
            planDiagnostics: normalizedProvidedPlan?.planDiagnostics || undefined,
            searchMode: normalizedSearchMode,
        }));
    } catch (error) {
        clearTimeout(globalTimer);
        if (globalTimedOut || error?.code === 'REQUEST_ABORTED' || requestAbortController.signal.aborted || req.aborted) {
            return;
        }
        const statusCode = Number(error?.status) || 500;
        console.error('Legal search error:', error);
        return res.status(statusCode).json({
            error: getSafeErrorMessage(error, 'Karar aramasi su anda kullanilamiyor.'),
        });
    } finally {
        clearTimeout(globalTimer);
    }
}
