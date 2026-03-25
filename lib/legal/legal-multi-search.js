import { searchLegalDecisionsViaMcp, getLegalDocumentViaMcp } from './mcpLegalSearch.js';
import { getGeminiClient, GEMINI_MODEL_NAME } from '../../backend/gemini/_shared.js';

const MIN_COMBINED_SCORE = 0.15;

function getResultQualityScore(result) {
    return Number(
        result?.combinedScore
        ?? result?.relevanceScore
        ?? result?.domainConfidence
        ?? result?.similarityScore
        ?? 0
    ) || 0;
}

function dedupeResults(results = []) {
    const seenIds = new Set();
    return (Array.isArray(results) ? results : []).filter((result) => {
        const id = result?.documentId || result?.id || result?.sourceUrl || '';
        if (!id || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
    });
}

function collectExcludedCourtHints({ strategy = null, skillContext = null } = {}) {
    return Array.from(new Set([
        ...(Array.isArray(strategy?.plan?.negativeConcepts) ? strategy.plan.negativeConcepts : []),
        ...(Array.isArray(skillContext?.negativeConcepts) ? skillContext.negativeConcepts : []),
        ...(Array.isArray(skillContext?.context?.negativeConcepts) ? skillContext.context.negativeConcepts : []),
    ]
        .map((item) => String(item || '').toLowerCase().trim())
        .filter((item) => item && /(dairesi|mahkemesi|danistay|anayasa|ceza|hukuk|vergi|idare|idari)/i.test(item))));
}

function filterByDomain(results = [], domain = 'borclar', strategy = null, skillContext = null) {
    void domain;
    const excludedLower = collectExcludedCourtHints({ strategy, skillContext });
    if (excludedLower.length === 0) {
        return results;
    }
    return results.filter((result) => {
        const courtName = (result?.daire || result?.kurum_dairesi || result?.court || '').toLowerCase();
        return !excludedLower.some((excluded) => courtName.includes(excluded));
    });
}

function filterBySkillConcepts(results = [], strategy = null, { strict = false } = {}) {
    const retrievalConcepts = Array.isArray(strategy?.plan?.retrievalConcepts)
        ? strategy.plan.retrievalConcepts.map((item) => String(item || '').toLowerCase())
        : [];
    const negativeConcepts = Array.isArray(strategy?.plan?.negativeConcepts)
        ? strategy.plan.negativeConcepts.map((item) => String(item || '').toLowerCase())
        : [];

    if (retrievalConcepts.length === 0 && negativeConcepts.length === 0) {
        return results;
    }

    const matched = (Array.isArray(results) ? results : []).filter((result) => {
        const text = [
            result?.ozet,
            result?.snippet,
            result?.summaryText,
            result?.title,
            result?.daire,
            ...(result?.matchedKeywords || []),
            ...(result?.matchedRequiredConcepts || []),
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        const retrievalHit = retrievalConcepts.length === 0
            ? true
            : retrievalConcepts.some((concept) => text.includes(concept))
                || (result?.matchedRequiredConcepts || []).length > 0
                || getResultQualityScore(result) >= 0.45;
        const negativeHit = negativeConcepts.some((concept) => text.includes(concept));
        return retrievalHit && !negativeHit;
    });

    if (matched.length > 0) return matched;
    return strict ? [] : results;
}

function filterBySuggestedCourt(results = [], strategy = null, { strict = false } = {}) {
    const suggestedCourt = String(strategy?.plan?.suggestedCourt || '').trim();
    if (!suggestedCourt) return results;

    const targets = suggestedCourt
        .split(',')
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean);
    if (targets.length === 0) return results;

    const withCourtInfo = (Array.isArray(results) ? results : []).filter((result) =>
        String(result?.daire || result?.kurum_dairesi || result?.court || '').trim()
    );
    if (withCourtInfo.length === 0) return results;

    const matched = withCourtInfo.filter((result) => {
        const courtName = String(result?.daire || result?.kurum_dairesi || result?.court || '')
            .toLowerCase();
        return targets.some((target) => courtName.includes(target));
    });

    if (matched.length > 0) return matched;
    return strict ? [] : results;
}

function filterByQuality(results = [], { strict = false } = {}) {
    const filtered = (Array.isArray(results) ? results : []).filter((result) => getResultQualityScore(result) >= MIN_COMBINED_SCORE);
    if (filtered.length > 0) return filtered;
    return strict ? [] : results;
}

async function runSingleStrategy({ strategy, rawQuery, limit, source }) {
    const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`strategy_timeout_${timeoutMs}`));
        }, timeoutMs);

        Promise.resolve(promise)
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });

    try {
        const strategyTimeoutMs = 25000;
        const resultData = await withTimeout(searchLegalDecisionsViaMcp({
            source,
            rawQuery: rawQuery || strategy?.plan?.semanticQuery || strategy?.plan?.searchQuery || '',
            aiSearchPlan: strategy?.plan,
            limit,
            rerank_threshold: 0.45,
            enable_semantic_search: true,
        }), strategyTimeoutMs);

        const mappedResults = Array.isArray(resultData?.results)
            ? resultData.results.map((result) => ({ ...result, _strategy: strategy?.name || '' }))
            : [];

        return {
            resultData,
            results: mappedResults,
            timedOut: false,
            errorMessage: '',
        };
    } catch (error) {
        console.error(`[Multi-Search] Strateji calistirilamadi (${strategy?.name || 'isimsiz'}): ${error.message}`);
        return {
            resultData: null,
            results: [],
            timedOut: String(error?.message || '').includes('strategy_timeout_'),
            errorMessage: String(error?.message || ''),
        };
    }
}

function buildSkillDiagnostics(base = {}, override = {}) {
    return {
        active: true,
        skillId: base?.skillId || override?.skillId || 'turk-hukuku-karar-arama',
        primaryDomain: override?.primaryDomain || base?.primaryDomain || 'ceza',
        domainLabel: override?.domainLabel || base?.domainLabel || null,
        queryMode: override?.queryMode || base?.queryMode || 'long_fact',
        sourceTargets: override?.sourceTargets || base?.sourceTargets || ['yargitay'],
        strategyOrder: Array.isArray(override?.strategyOrder) ? override.strategyOrder : (base?.strategyOrder || ['A', 'B', 'C']),
        selectedStrategy: override?.selectedStrategy ?? base?.selectedStrategy ?? null,
        attemptedStrategies: Array.isArray(override?.attemptedStrategies) ? override.attemptedStrategies : (base?.attemptedStrategies || []),
        fallbackAttempted: Boolean(override?.fallbackAttempted ?? base?.fallbackAttempted),
        zeroResultReason: override?.zeroResultReason ?? base?.zeroResultReason ?? null,
        zeroResultMessage: override?.zeroResultMessage ?? base?.zeroResultMessage ?? null,
        coreIssue: override?.coreIssue || base?.coreIssue || null,
    };
}

async function runOrderedSkillSearch({
    strategies = [],
    rawQuery = '',
    limit = 10,
    source = 'all',
    skillContext = null,
    skillDiagnostics = null,
    skipEnrichment = false,
}) {
    const attempts = [];
    const domain = skillContext?.primaryDomain || strategies[0]?.plan?.domain || 'ceza';
    const strictMode = Boolean(skillContext?.strictResultMode);
    const ultraStrictDomains = new Set(['ceza', 'anayasa']);
    const orderedStrategies = strictMode && ultraStrictDomains.has(domain)
        ? strategies.slice(0, 2)
        : strategies;
    let totalRaw = 0;
    let totalUnique = 0;
    const strategyTimeouts = [];
    const timedOutChannels = [];
    const timedOutPhrases = [];
    let latestDiagnostics = null;

    for (let index = 0; index < orderedStrategies.length; index += 1) {
        const strategy = orderedStrategies[index];
        const { resultData, results, timedOut, errorMessage } = await runSingleStrategy({ strategy, rawQuery, limit, source });
        totalRaw += results.length;

        if (timedOut) {
            strategyTimeouts.push(strategy?.plan?.strategyCode || strategy?.name || `S${index + 1}`);
        }
        if (resultData?.diagnostics) {
            latestDiagnostics = resultData.diagnostics;
        }
        if (Array.isArray(resultData?.diagnostics?.timedOutChannels)) {
            timedOutChannels.push(...resultData.diagnostics.timedOutChannels);
        }
        if (Array.isArray(resultData?.diagnostics?.timedOutPhrases)) {
            timedOutPhrases.push(...resultData.diagnostics.timedOutPhrases);
        }

        let filteredResults = dedupeResults(results);
        totalUnique += filteredResults.length;
        filteredResults = filterByDomain(filteredResults, domain, strategy, skillContext);
        filteredResults = filterBySkillConcepts(filteredResults, strategy, { strict: strictMode });
        filteredResults = filterBySuggestedCourt(filteredResults, strategy, { strict: strictMode });
        filteredResults = filterByQuality(filteredResults, { strict: strictMode });
        filteredResults.sort((left, right) => getResultQualityScore(right) - getResultQualityScore(left));

        attempts.push(strategy?.plan?.strategyCode || strategy?.name || `S${index + 1}`);

        if (filteredResults.length > 0) {
            const finalResults = filteredResults.slice(0, limit);
            const enrichedResults = skipEnrichment
                ? finalResults
                : await enrichResultsWithSummaries(finalResults, domain);
            return {
                results: enrichedResults,
                retrievalDiagnostics: resultData?.retrievalDiagnostics || undefined,
                _metadata: {
                    totalRaw,
                    totalUnique,
                    totalFiltered: filteredResults.length,
                    strategyCount: orderedStrategies.length,
                    appliedDomain: domain,
                    selectedStrategy: strategy?.plan?.strategyCode || strategy?.name || null,
                    attemptedStrategies: attempts,
                    strategyTimeouts,
                    timedOutChannels: Array.from(new Set(timedOutChannels)),
                    timedOutPhrases: Array.from(new Set(timedOutPhrases)),
                },
                diagnostics: resultData?.diagnostics || undefined,
                skillDiagnostics: buildSkillDiagnostics(skillDiagnostics, {
                    domainLabel: skillContext?.domainLabel || skillDiagnostics?.domainLabel || null,
                    selectedStrategy: strategy?.plan?.strategyCode || strategy?.name || null,
                    attemptedStrategies: attempts,
                    fallbackAttempted: attempts.length > 1,
                    zeroResultReason: timedOut ? errorMessage : null,
                }),
            };
        }
    }

    return {
        results: [],
        _metadata: {
            totalRaw,
            totalUnique,
            totalFiltered: 0,
            strategyCount: orderedStrategies.length,
            appliedDomain: domain,
            selectedStrategy: null,
            attemptedStrategies: attempts,
            strategyTimeouts,
            timedOutChannels: Array.from(new Set(timedOutChannels)),
            timedOutPhrases: Array.from(new Set(timedOutPhrases)),
        },
        diagnostics: latestDiagnostics || {
            semanticChannelStatus: 'unavailable',
            semanticUsed: false,
            semanticResultCount: 0,
            timedOutChannels: Array.from(new Set(timedOutChannels)),
            timedOutPhrases: Array.from(new Set(timedOutPhrases)),
        },
        skillDiagnostics: buildSkillDiagnostics(skillDiagnostics, {
            domainLabel: skillContext?.domainLabel || skillDiagnostics?.domainLabel || null,
            attemptedStrategies: attempts,
            fallbackAttempted: attempts.length > 1,
            zeroResultReason: 'skill_no_match',
            zeroResultMessage: `${skillContext?.domainLabel || 'Alan'} skill dogru alani aradi ama uygun karar bulamadi. Kontrollu fallback denendi, alakasiz karar gosterilmedi.`,
        }),
    };
}

export async function multiStrategySearch({
    strategies,
    rawQuery,
    limit = 10,
    source = 'all',
    skillContext = null,
    skillDiagnostics = null,
    skipEnrichment = false,
}) {
    if (!strategies || strategies.length === 0) {
        return { results: [], _metadata: { error: 'Strateji bulunamadi' } };
    }

    if (skillContext?.active && skillContext?.enforceStrategyOrder) {
        return runOrderedSkillSearch({
            strategies,
            rawQuery,
            limit,
            source,
            skillContext,
            skillDiagnostics,
            skipEnrichment,
        });
    }

    const domain = strategies[0]?.plan?.domain || 'borclar';
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const searchPromises = strategies.map(async (strategy, index) => {
        if (index > 0) {
            await delay(index * 250); // Staggered delay to prevent rate limits
        }
        const { resultData, results } = await runSingleStrategy({ strategy, rawQuery, limit, source });
        return { resultData, results };
    });

    const resultsArray = await Promise.all(searchPromises);
    const allResults = resultsArray.flatMap((item) => item.results || []);

    if (allResults.length === 0) {
        return { results: [], _metadata: { totalRaw: 0 } };
    }

    const uniqueResults = dedupeResults(allResults);
    const domainFilteredResults = filterByDomain(uniqueResults, domain, strategies[0], skillContext);
    const conceptFilteredResults = filterBySkillConcepts(domainFilteredResults, strategies[0], { strict: false });
    const courtFilteredResults = filterBySuggestedCourt(conceptFilteredResults, strategies[0], { strict: false });
    const qualityFilteredResults = filterByQuality(courtFilteredResults, { strict: false });
    qualityFilteredResults.sort((left, right) => getResultQualityScore(right) - getResultQualityScore(left));

    const finalResults = qualityFilteredResults.slice(0, limit);
    const enrichedResults = skipEnrichment
        ? finalResults
        : await enrichResultsWithSummaries(finalResults, domain);
    const firstDiagnostics = resultsArray.find((item) => item?.resultData?.retrievalDiagnostics)?.resultData?.retrievalDiagnostics;

    return {
        results: enrichedResults,
        retrievalDiagnostics: firstDiagnostics || undefined,
        _metadata: {
            totalRaw: allResults.length,
            totalUnique: uniqueResults.length,
            totalFiltered: qualityFilteredResults.length,
            strategyCount: strategies.length,
            appliedDomain: domain,
        },
    };
}

async function enrichResultsWithSummaries(results, domain) {
    const TOP_N = 5;
    const candidates = results.slice(0, TOP_N);

    const enrichPromises = candidates.map(async (result) => {
        const existingSummary = result?.ozet || result?.summaryText || result?.karar_ozeti || '';
        if (existingSummary.length > 50) return result;

        try {
            const docPayload = await getLegalDocumentViaMcp({
                source: result?.source || 'yargitay',
                documentId: result?.documentId || result?.id,
            });
            const fullText = String(docPayload?.document || '').trim();
            if (!fullText || fullText.length < 100) return result;

            const snippet = fullText.substring(0, 2000);
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL_NAME,
                contents: [{ role: 'user', parts: [{ text: snippet }] }],
                config: {
                    systemInstruction: `Bu bir Yargitay/Danistay kararidir.
Kararin hukuki ozunu en fazla 3 cumle ile okunakli ve net bir Turkce ile ozetle.
Sadece ozeti yaz, baska hicbir aciklama veya on ek ekleme.`,
                },
            });

            const aiSummary = String(response?.text || '').trim();
            if (aiSummary) {
                result.summaryText = aiSummary;
                result._summarySource = 'ai_generated';
            }
        } catch (error) {
            console.warn(`[Enrichment] Ozet uretilemedi (${result?.documentId || result?.id}): ${error.message}`);
        }

        return result;
    });

    const enriched = await Promise.all(enrichPromises);
    return [...enriched, ...results.slice(TOP_N)];
}

export {
    runOrderedSkillSearch,
    runSingleStrategy,
    dedupeResults,
    filterByDomain,
    filterBySkillConcepts,
    filterBySuggestedCourt,
    filterByQuality,
    getResultQualityScore
};
