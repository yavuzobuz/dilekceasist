import { sanitizeLegalInput } from './legal-text-utils.js';
import { buildSkillBackedSearchPackage } from './legal-search-skill.js';
import { DOMAIN_RULES } from './domain-skills/registry.js';

const ALLOWED_SOURCES = new Set(['all', 'auto', 'yargitay', 'danistay', 'bam', 'anayasa']);
const ALLOWED_QUERY_MODES = new Set(['short_issue', 'long_fact', 'document_style', 'case_file']);

const normalizePacketText = (value = '', maxLength = 260) =>
    sanitizeLegalInput(String(value || '').replace(/\s+/g, ' ').trim()).text
        .slice(0, maxLength)
        .trim();

const normalizePacketList = (values = [], limit = 8, maxLength = 120) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizePacketText(value, maxLength);
        if (!normalized) continue;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(normalized);
        if (unique.length >= limit) break;
    }

    return unique;
};

const normalizeBirimCode = (value = '') =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

const normalizeBirimCodeList = (values = [], limit = 6) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeBirimCode(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
        if (unique.length >= limit) break;
    }

    return unique;
};

const normalizeSearchVariants = (values = [], limit = 4) => {
    const variants = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const query = normalizePacketText(value.query, 220);
        if (!query) continue;
        const key = query.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        variants.push({
            query,
            mode: normalizePacketText(value.mode, 24).toLocaleLowerCase('tr-TR') || undefined,
        });
        if (variants.length >= limit) break;
    }

    return variants;
};

export const extractBirimCodesFromCourtHint = (value = '') => {
    const normalized = normalizePacketText(value, 120).toLocaleLowerCase('tr-TR');
    if (!normalized) return [];

    const codes = [];
    const seen = new Set();
    const addCode = (code = '') => {
        const normalizedCode = normalizeBirimCode(code);
        if (!normalizedCode || seen.has(normalizedCode)) return;
        seen.add(normalizedCode);
        codes.push(normalizedCode);
    };

    const numberedYargitayMatches = normalized.matchAll(/(\d{1,2})\.\s*(ceza|hukuk)\s*dairesi/g);
    for (const match of numberedYargitayMatches) {
        const number = Number(match[1]);
        const prefix = match[2] === 'ceza' ? 'C' : 'H';
        addCode(`${prefix}${number}`);
    }

    const numberedDanistayMatches = normalized.matchAll(/(\d{1,2})\.\s*daire/g);
    for (const match of numberedDanistayMatches) {
        addCode(`D${Number(match[1])}`);
    }

    if (normalized.includes('ceza genel kurulu')) addCode('CGK');
    if (normalized.includes('hukuk genel kurulu')) addCode('HGK');
    if (normalized.includes('vergi dava daireleri kurulu') || normalized === 'vddk') addCode('VDDK');

    return codes;
};

export const normalizeExplicitLegalSearchPacket = (packet = null) => {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return null;

    const preferredSource = normalizePacketText(packet.preferredSource, 20).toLocaleLowerCase('tr-TR');
    const queryMode = normalizePacketText(packet.queryMode, 24).toLocaleLowerCase('tr-TR');
    const normalizedPacket = {
        primaryDomain: normalizePacketText(packet.primaryDomain, 40).toLocaleLowerCase('tr-TR') || undefined,
        caseType: normalizePacketText(packet.caseType, 160) || undefined,
        coreIssue: normalizePacketText(packet.coreIssue, 220) || undefined,
        requiredConcepts: normalizePacketList(packet.requiredConcepts, 12),
        supportConcepts: normalizePacketList(packet.supportConcepts, 12),
        evidenceConcepts: normalizePacketList(packet.evidenceConcepts, 10),
        negativeConcepts: normalizePacketList(packet.negativeConcepts, 10),
        preferredSource: ALLOWED_SOURCES.has(preferredSource) ? preferredSource : undefined,
        preferredBirimCodes: normalizeBirimCodeList(packet.preferredBirimCodes, 6),
        searchSeedText: normalizePacketText(packet.searchSeedText, 260) || undefined,
        searchVariants: normalizeSearchVariants(packet.searchVariants, 4),
        fallbackToNext: packet.fallbackToNext !== false,
        queryMode: ALLOWED_QUERY_MODES.has(queryMode) ? queryMode : undefined,
    };

    return Object.values(normalizedPacket).some((value) => {
        if (Array.isArray(value)) return value.length > 0;
        return typeof value === 'boolean' ? true : Boolean(value);
    })
        ? normalizedPacket
        : null;
};

const buildSkillDerivedPacket = (skillPackage = null) => {
    if (!skillPackage || typeof skillPackage !== 'object') return null;

    const primaryStrategy = Array.isArray(skillPackage.strategies)
        ? skillPackage.strategies[0]?.plan || null
        : null;
    const suggestedCourt = primaryStrategy?.suggestedCourt || skillPackage?.context?.suggestedCourt || '';
    const preferredBirimCodes = normalizeBirimCodeList(
        (Array.isArray(primaryStrategy?.primaryBirimCodes) && primaryStrategy.primaryBirimCodes.length > 0)
            ? primaryStrategy.primaryBirimCodes
            : extractBirimCodesFromCourtHint(suggestedCourt),
        6
    );
    const strategyVariants = Array.isArray(skillPackage.strategies)
        ? skillPackage.strategies.flatMap((strategy) => {
            const plan = strategy?.plan || {};
            const queries = normalizePacketList([
                ...(Array.isArray(plan?.candidateQueries) ? plan.candidateQueries : []),
                ...(Array.isArray(plan?.searchClauses) ? plan.searchClauses : []),
                plan?.searchQuery,
                plan?.initialKeyword,
            ], 4, 220);

            return queries.map((query, index) => ({
                query,
                mode: index === 0
                    ? (plan?.strategyCode || undefined)
                    : `${plan?.strategyCode || 'skill'}_${index + 1}`,
            }));
        })
        : [];

    return normalizeExplicitLegalSearchPacket({
        primaryDomain: skillPackage.primaryDomain || primaryStrategy?.primaryDomain,
        caseType:
            primaryStrategy?.subdomain
            || skillPackage?.context?.subdomain
            || primaryStrategy?.decisionType
            || skillPackage?.context?.skillType,
        coreIssue: primaryStrategy?.coreIssue,
        requiredConcepts: primaryStrategy?.retrievalConcepts || [],
        supportConcepts: primaryStrategy?.supportConcepts || [],
        evidenceConcepts: primaryStrategy?.evidenceConcepts || [],
        negativeConcepts: primaryStrategy?.negativeConcepts || skillPackage?.context?.negativeConcepts || [],
        preferredSource: Array.isArray(skillPackage.sourceTargets) ? skillPackage.sourceTargets[0] : undefined,
        preferredBirimCodes,
        searchSeedText: primaryStrategy?.searchQuery || primaryStrategy?.initialKeyword || primaryStrategy?.candidateQueries?.[0],
        searchVariants: strategyVariants,
        fallbackToNext: true,
        queryMode: skillPackage.queryMode || primaryStrategy?.queryMode,
    });
};

const buildAiPlanDerivedPacket = (aiSearchPlan = null) => {
    if (!aiSearchPlan || typeof aiSearchPlan !== 'object') return null;

    const candidateQueries = normalizePacketList([
        ...(Array.isArray(aiSearchPlan.candidateQueries) ? aiSearchPlan.candidateQueries : []),
        ...(Array.isArray(aiSearchPlan.searchClauses) ? aiSearchPlan.searchClauses : []),
    ], 4, 220);

    return normalizeExplicitLegalSearchPacket({
        primaryDomain: aiSearchPlan.primaryDomain,
        caseType: aiSearchPlan.decisionType,
        coreIssue: aiSearchPlan.coreIssue,
        requiredConcepts: aiSearchPlan.retrievalConcepts || [],
        supportConcepts: aiSearchPlan.supportConcepts || [],
        evidenceConcepts: aiSearchPlan.evidenceConcepts || [],
        negativeConcepts: aiSearchPlan.negativeConcepts || [],
        preferredSource: Array.isArray(aiSearchPlan.targetSources) ? aiSearchPlan.targetSources[0] : undefined,
        preferredBirimCodes: [
            ...(Array.isArray(aiSearchPlan.optionalBirimCodes) ? aiSearchPlan.optionalBirimCodes : []),
            ...(Array.isArray(aiSearchPlan.birimCodes) ? aiSearchPlan.birimCodes : []),
        ],
        searchSeedText: aiSearchPlan.searchQuery || aiSearchPlan.initialKeyword,
        searchVariants: candidateQueries.map((query) => ({ query, mode: 'ai_candidate' })),
        fallbackToNext: true,
        queryMode: aiSearchPlan.queryMode,
    });
};

const mergeVariantLists = (lists = [], limit = 4) =>
    normalizeSearchVariants(lists.flatMap((list) => Array.isArray(list) ? list : []), limit);

const mergeTextLists = (lists = [], limit = 8, maxLength = 120) =>
    normalizePacketList(lists.flatMap((list) => Array.isArray(list) ? list : []), limit, maxLength);

const normalizeRoutingMode = (value = '') =>
    normalizePacketText(value, 40).toLocaleLowerCase('tr-TR') || undefined;

const normalizeLookupValue = (value = '') =>
    normalizePacketText(value, 160).toLocaleLowerCase('tr-TR') || '';

const resolveRegistryRuleByCaseType = (primaryDomain = '', caseType = '') => {
    const normalizedDomain = normalizeLookupValue(primaryDomain);
    const normalizedCaseType = normalizeLookupValue(caseType);
    if (!normalizedCaseType) return null;

    const candidateEntries = normalizedDomain && DOMAIN_RULES[normalizedDomain]
        ? [[normalizedDomain, DOMAIN_RULES[normalizedDomain]]]
        : Object.entries(DOMAIN_RULES);

    for (const [domainKey, rule] of candidateEntries) {
        const defaultVariant = rule?.defaultVariant || null;
        const defaultKey = normalizeLookupValue(defaultVariant?.subdomain || defaultVariant?.decisionType || '');
        if (defaultKey && defaultKey === normalizedCaseType) {
            return { domainKey, rule, variant: defaultVariant };
        }

        const matchedVariant = (Array.isArray(rule?.variants) ? rule.variants : []).find((variant) => {
            const subdomainKey = normalizeLookupValue(variant?.subdomain || '');
            const decisionKey = normalizeLookupValue(variant?.decisionType || '');
            return subdomainKey === normalizedCaseType || decisionKey === normalizedCaseType;
        });

        if (matchedVariant) {
            return { domainKey, rule, variant: matchedVariant };
        }
    }

    return null;
};

const buildRegistryPacketFromCaseType = (primaryDomain = '', caseType = '') => {
    const registryMatch = resolveRegistryRuleByCaseType(primaryDomain, caseType);
    if (!registryMatch?.variant) return { registryMatch: null, packet: null };

    const { domainKey, rule, variant } = registryMatch;
    const suggestedCourt = variant?.suggestedCourt || rule?.suggestedCourt || '';
    const primaryBirimCodes = normalizeBirimCodeList(
        Array.isArray(variant?.primaryBirimCodes) && variant.primaryBirimCodes.length > 0
            ? variant.primaryBirimCodes
            : extractBirimCodesFromCourtHint(suggestedCourt),
        6
    );
    const clauses = normalizePacketList(variant?.clauses || [], 4, 220);

    return {
        registryMatch,
        packet: normalizeExplicitLegalSearchPacket({
            primaryDomain: domainKey,
            caseType: variant?.subdomain || caseType,
            coreIssue: variant?.core || undefined,
            requiredConcepts: (variant?.must || []).length > 0 ? variant.must : (variant?.retrieval || []),
            supportConcepts: variant?.support || [],
            evidenceConcepts: variant?.evidence || [],
            negativeConcepts: [
                ...(rule?.negative || []),
                ...(variant?.deny || []),
                ...(variant?.negative || []),
            ],
            preferredSource: variant?.sourcePolicy || rule?.sources?.[0],
            preferredBirimCodes: primaryBirimCodes,
            searchSeedText: clauses[0] || variant?.retrieval?.[0] || variant?.core || undefined,
            searchVariants: clauses.map((query) => ({ query, mode: 'registry_case_type' })),
            fallbackToNext: true,
        }),
    };
};

const keepPacketIfDomainCompatible = (packet = null, explicitPrimaryDomain = '') => {
    if (!packet || typeof packet !== 'object') return null;
    const normalizedExplicitDomain = normalizePacketText(explicitPrimaryDomain, 40).toLocaleLowerCase('tr-TR');
    const normalizedPacketDomain = normalizePacketText(packet?.primaryDomain, 40).toLocaleLowerCase('tr-TR');
    if (!normalizedExplicitDomain || !normalizedPacketDomain) return packet;
    return normalizedExplicitDomain === normalizedPacketDomain ? packet : null;
};

const buildRoutingProfile = ({
    legalSearchPacket = null,
    explicitPacket = null,
    skillPackage = null,
    registryMatch = null,
} = {}) => {
    const skillStrategy = Array.isArray(skillPackage?.strategies)
        ? skillPackage.strategies[0]?.plan || null
        : null;
    const primaryStrategy = registryMatch?.variant || skillStrategy;
    const context = registryMatch?.rule || skillPackage?.context || {};
    const explicitPrimaryCodes = normalizeBirimCodeList(explicitPacket?.preferredBirimCodes || [], 6);
    const skillPrimaryCodes = normalizeBirimCodeList(
        (Array.isArray(primaryStrategy?.primaryBirimCodes) && primaryStrategy.primaryBirimCodes.length > 0)
            ? primaryStrategy.primaryBirimCodes
            : extractBirimCodesFromCourtHint(primaryStrategy?.suggestedCourt || context?.suggestedCourt || ''),
        6
    );
    const skillSecondaryCodes = normalizeBirimCodeList([
        ...(Array.isArray(primaryStrategy?.secondaryBirimCodes) ? primaryStrategy.secondaryBirimCodes : []),
        ...(Array.isArray(context?.secondaryBirimCodes) ? context.secondaryBirimCodes : []),
    ], 6);
    const inferredRoutingMode = explicitPrimaryCodes.length > 0
        ? 'hard_primary'
        : (
            primaryStrategy?.routingMode
            || context?.routingMode
            || (skillSecondaryCodes.length > 0
                ? 'primary_secondary'
                : (skillPrimaryCodes.length > 0 ? 'hard_primary' : 'source_first'))
        );

    return {
        primaryDomain: legalSearchPacket?.primaryDomain || registryMatch?.domainKey || skillPackage?.primaryDomain || undefined,
        subdomain: legalSearchPacket?.caseType || primaryStrategy?.subdomain || context?.subdomain || undefined,
        sourcePolicy: normalizeRoutingMode(
            primaryStrategy?.sourcePolicy
            || context?.sourcePolicy
            || legalSearchPacket?.preferredSource
            || context?.sources?.[0]
        ),
        routingMode: normalizeRoutingMode(inferredRoutingMode) || 'source_first',
        mustConcepts: mergeTextLists([
            legalSearchPacket?.requiredConcepts,
            primaryStrategy?.mustConcepts,
        ], 12),
        supportConcepts: mergeTextLists([
            legalSearchPacket?.supportConcepts,
            primaryStrategy?.supportConcepts,
        ], 12),
        denyConcepts: mergeTextLists([
            legalSearchPacket?.negativeConcepts,
            primaryStrategy?.denyConcepts,
            context?.denyConcepts,
        ], 16),
        primaryBirimCodes: explicitPrimaryCodes.length > 0 ? explicitPrimaryCodes : skillPrimaryCodes,
        secondaryBirimCodes: explicitPrimaryCodes.length > 0 ? [] : skillSecondaryCodes,
        strictMatchMode: normalizeRoutingMode(
            primaryStrategy?.strictMatchMode || context?.strictMatchMode || 'query_core'
        ) || 'query_core',
    };
};

const mergePackets = ({ explicitPacket = null, skillPacket = null, aiPacket = null } = {}) =>
    normalizeExplicitLegalSearchPacket({
        primaryDomain: explicitPacket?.primaryDomain || skillPacket?.primaryDomain || aiPacket?.primaryDomain,
        caseType: explicitPacket?.caseType || skillPacket?.caseType || aiPacket?.caseType,
        coreIssue: explicitPacket?.coreIssue || skillPacket?.coreIssue || aiPacket?.coreIssue,
        requiredConcepts: (explicitPacket?.requiredConcepts || []).length > 0
            ? explicitPacket.requiredConcepts
            : mergeTextLists([skillPacket?.requiredConcepts, aiPacket?.requiredConcepts], 12),
        supportConcepts: (explicitPacket?.supportConcepts || []).length > 0
            ? explicitPacket.supportConcepts
            : mergeTextLists([skillPacket?.supportConcepts, aiPacket?.supportConcepts], 12),
        evidenceConcepts: (explicitPacket?.evidenceConcepts || []).length > 0
            ? explicitPacket.evidenceConcepts
            : mergeTextLists([skillPacket?.evidenceConcepts, aiPacket?.evidenceConcepts], 10),
        negativeConcepts: (explicitPacket?.negativeConcepts || []).length > 0
            ? explicitPacket.negativeConcepts
            : mergeTextLists([skillPacket?.negativeConcepts, aiPacket?.negativeConcepts], 10),
        preferredSource: explicitPacket?.preferredSource || skillPacket?.preferredSource || aiPacket?.preferredSource,
        preferredBirimCodes: normalizeBirimCodeList([
            ...(explicitPacket?.preferredBirimCodes || []),
            ...(skillPacket?.preferredBirimCodes || []),
            ...(aiPacket?.preferredBirimCodes || []),
        ], 6),
        searchSeedText: explicitPacket?.searchSeedText || skillPacket?.searchSeedText || aiPacket?.searchSeedText,
        searchVariants: (explicitPacket?.searchVariants || []).length > 0
            ? explicitPacket.searchVariants
            : mergeVariantLists([skillPacket?.searchVariants, aiPacket?.searchVariants], 4),
        fallbackToNext: explicitPacket?.fallbackToNext !== undefined
            ? explicitPacket.fallbackToNext
            : (skillPacket?.fallbackToNext !== undefined ? skillPacket.fallbackToNext : aiPacket?.fallbackToNext),
        queryMode: explicitPacket?.queryMode || skillPacket?.queryMode || aiPacket?.queryMode,
    });

const buildMinimalAiSearchPlan = (resolvedPacket = null) => {
    if (!resolvedPacket) return null;

    const targetSources = resolvedPacket.preferredSource
        ? [resolvedPacket.preferredSource]
        : [];

    return {
        primaryDomain: resolvedPacket.primaryDomain || null,
        coreIssue: resolvedPacket.coreIssue || '',
        retrievalConcepts: resolvedPacket.requiredConcepts || [],
        supportConcepts: resolvedPacket.supportConcepts || [],
        evidenceConcepts: resolvedPacket.evidenceConcepts || [],
        negativeConcepts: resolvedPacket.negativeConcepts || [],
        optionalBirimCodes: resolvedPacket.preferredBirimCodes || [],
        targetSources,
        sourceTargets: targetSources,
        queryMode: resolvedPacket.queryMode || 'short_issue',
        searchQuery: resolvedPacket.searchSeedText || '',
        initialKeyword: resolvedPacket.searchSeedText || '',
        candidateQueries: (resolvedPacket.searchVariants || []).map((item) => item.query),
        searchClauses: (resolvedPacket.searchVariants || []).map((item) => item.query),
    };
};

const enrichAiSearchPlan = (aiSearchPlan = null, resolvedPacket = null) => {
    if (!aiSearchPlan) return buildMinimalAiSearchPlan(resolvedPacket);
    if (!resolvedPacket) return aiSearchPlan;

    const targetSources = mergeTextLists([
        aiSearchPlan.targetSources,
        aiSearchPlan.sourceTargets,
        resolvedPacket.preferredSource ? [resolvedPacket.preferredSource] : [],
    ], 2, 20);

    return {
        ...aiSearchPlan,
        primaryDomain: resolvedPacket.primaryDomain || aiSearchPlan.primaryDomain,
        coreIssue: resolvedPacket.coreIssue || aiSearchPlan.coreIssue,
        retrievalConcepts: mergeTextLists([
            resolvedPacket.requiredConcepts,
            aiSearchPlan.retrievalConcepts,
        ], 8),
        supportConcepts: mergeTextLists([
            resolvedPacket.supportConcepts,
            aiSearchPlan.supportConcepts,
        ], 8),
        evidenceConcepts: mergeTextLists([
            resolvedPacket.evidenceConcepts,
            aiSearchPlan.evidenceConcepts,
        ], 8),
        negativeConcepts: mergeTextLists([
            resolvedPacket.negativeConcepts,
            aiSearchPlan.negativeConcepts,
        ], 8),
        optionalBirimCodes: normalizeBirimCodeList([
            ...(resolvedPacket.preferredBirimCodes || []),
            ...(aiSearchPlan.optionalBirimCodes || []),
        ], 6),
        targetSources,
        sourceTargets: targetSources,
        queryMode: aiSearchPlan.queryMode || resolvedPacket.queryMode,
        searchQuery: aiSearchPlan.searchQuery || resolvedPacket.searchSeedText || '',
        initialKeyword: aiSearchPlan.initialKeyword || aiSearchPlan.searchQuery || resolvedPacket.searchSeedText || '',
        candidateQueries: mergeTextLists([
            aiSearchPlan.candidateQueries,
            aiSearchPlan.searchClauses,
            (resolvedPacket.searchVariants || []).map((item) => item.query),
        ], 6, 220),
    };
};

export const resolveLegalSearchContract = ({
    rawText = '',
    preferredSource = 'all',
    explicitPacket = null,
    aiSearchPlan = null,
} = {}) => {
    const normalizedExplicitPacket = normalizeExplicitLegalSearchPacket(explicitPacket);
    const { registryMatch, packet: registryPacket } = buildRegistryPacketFromCaseType(
        normalizedExplicitPacket?.primaryDomain,
        normalizedExplicitPacket?.caseType
    );
    const skillText = normalizePacketText(
        rawText || normalizedExplicitPacket?.searchSeedText || normalizedExplicitPacket?.coreIssue || '',
        4000
    );
    const skillPackage = skillText
        ? buildSkillBackedSearchPackage({
            rawText: skillText,
            preferredSource: normalizedExplicitPacket?.preferredSource || preferredSource,
        })
        : null;
    const explicitPrimaryDomain = normalizedExplicitPacket?.primaryDomain || '';
    const skillPacket = keepPacketIfDomainCompatible(
        buildSkillDerivedPacket(skillPackage),
        explicitPrimaryDomain
    );
    const aiPacket = keepPacketIfDomainCompatible(
        buildAiPlanDerivedPacket(aiSearchPlan),
        explicitPrimaryDomain
    );
    const legalSearchPacket = mergePackets({
        explicitPacket: normalizedExplicitPacket,
        skillPacket: registryPacket || skillPacket,
        aiPacket,
    });

    return {
        legalSearchPacket,
        aiSearchPlan: enrichAiSearchPlan(aiSearchPlan, legalSearchPacket),
        skillPackage,
        routingProfile: buildRoutingProfile({
            legalSearchPacket,
            explicitPacket: normalizedExplicitPacket,
            skillPackage,
            registryMatch,
        }),
    };
};
