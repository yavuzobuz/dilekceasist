import { extractLegalArticles } from '../legal-domain-strategies.js';

export const SKILL_ID = 'turk-hukuku-karar-arama';
export const LONG_FACT_MIN_LENGTH = 260;
export const LONG_FACT_MIN_WORDS = 35;

const GLOBAL_EVIDENCE_ALIASES = [
    { canonical: 'paketleme', variants: ['paketleme', 'paketlenmis', 'paketcik', 'ambalaj', 'ziplock', 'gazete kagidi'] },
    { canonical: 'hassas terazi', variants: ['hassas terazi', 'dijital terazi', 'elektronik terazi', 'terazi'] },
    { canonical: 'ele gecirilen miktar', variants: ['ele gecirilen miktar', 'net agirlik', 'brut agirlik', 'gram', 'miktar'] },
    { canonical: 'telefon incelemesi', variants: ['telefon incelemesi', 'telefon inceleme tutanagi', 'telefon kaydi', 'arama kaydi'] },
    { canonical: 'hts kaydi', variants: ['hts', 'hts kaydi', 'arama kaydi'] },
    { canonical: 'mesaj', variants: ['mesaj', 'whatsapp', 'telegram', 'sms', 'ekran goruntusu'] },
    { canonical: 'kamera goruntusu', variants: ['kamera goruntusu', 'mobese', 'video kayit', 'guvenlik kamerasi'] },
    { canonical: 'tanik', variants: ['tanik', 'tanik beyani', 'tanik ifadesi', 'gorgu tanigi', 'kullanici tanik'] },
    { canonical: 'adli tip raporu', variants: ['adli tip raporu', 'adli rapor', 'kimyasal analiz', 'uyusturucu analiz raporu'] },
    { canonical: 'parmak izi', variants: ['parmak izi', 'dna raporu', 'materyal mukayese', 'ekspertiz raporu'] },
    { canonical: 'arama tutanagi', variants: ['arama tutanagi', 'el koyma tutanagi', 'olay yeri tutanagi'] },
    { canonical: 'bordro', variants: ['bordro', 'ucret pusulasi', 'maas bordrosu'] },
    { canonical: 'puantaj kaydi', variants: ['puantaj', 'puantaj kaydi'] },
    { canonical: 'sozlesme metni', variants: ['sozlesme', 'sozlesme metni', 'sozlesme tarihi'] },
    { canonical: 'fatura', variants: ['fatura', 'e-fatura', 'irsaliye', 'serbest meslek makbuzu'] },
    { canonical: 'banka hareketi', variants: ['banka hareketi', 'hesap ozeti', 'odeme dekontu', 'odeme belgesi'] },
    { canonical: 'bilirkisi raporu', variants: ['bilirkisi raporu', 'ekspertiz raporu', 'degerleme raporu', 'kiymet takdir raporu'] },
    { canonical: 'tapu kaydi', variants: ['tapu kaydi', 'tapu senedi'] },
];

export const dedupeStrings = (values = [], { max = 12 } = {}) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) continue;
        const normalized = cleaned.toLocaleLowerCase('tr-TR');
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(cleaned);
        if (unique.length >= max) break;
    }

    return unique;
};

export const normalizeSkillText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampWords = (value = '', maxWords = 6) =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .slice(0, maxWords)
        .join(' ')
        .trim();

const cleanClause = (value = '', { maxWords = 8 } = {}) => {
    const clause = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clause) return '';
    if (/[+"]/u.test(clause)) return clause;
    return clampWords(clause, maxWords);
};

const normalizeEvidenceTerms = (values = []) =>
    dedupeStrings(values, { max: 16 }).map((item) => normalizeSkillText(item));

export const extractEvidenceSignalConcepts = (rawText = '', extraTerms = []) => {
    const normalized = normalizeSkillText(rawText);
    const terms = [
        ...GLOBAL_EVIDENCE_ALIASES,
        ...((Array.isArray(extraTerms) ? extraTerms : []).map((item) => ({ canonical: item, variants: [item] }))),
    ];

    return dedupeStrings(
        terms
            .filter((entry) => entry.variants.some((variant) => normalized.includes(normalizeSkillText(variant))))
            .map((entry) => entry.canonical),
        { max: 14 }
    );
};

const moveEvidenceOutOfRetrieval = ({
    retrievalConcepts = [],
    evidenceConcepts = [],
    supportConcepts = [],
    evidenceHints = [],
    maxRetrieval = 4,
    allowEvidenceAsCore = false,
}) => {
    if (allowEvidenceAsCore) {
        return {
            retrievalConcepts: dedupeStrings(retrievalConcepts, { max: maxRetrieval }),
            evidenceConcepts: dedupeStrings(evidenceConcepts, { max: 10 }),
            supportConcepts: dedupeStrings(supportConcepts, { max: 8 }),
            warnings: [],
        };
    }

    const evidenceSet = new Set(normalizeEvidenceTerms([
        ...evidenceConcepts,
        ...evidenceHints,
    ]));
    const repairedRetrieval = [];
    const repairedEvidence = [...(Array.isArray(evidenceConcepts) ? evidenceConcepts : [])];
    const repairedSupport = [...(Array.isArray(supportConcepts) ? supportConcepts : [])];
    const warnings = [];

    for (const concept of Array.isArray(retrievalConcepts) ? retrievalConcepts : []) {
        const normalized = normalizeSkillText(concept);
        if (evidenceSet.has(normalized)) {
            repairedEvidence.push(concept);
            warnings.push(`"${concept}" delil sinyali olarak retrieval disina tasindi.`);
            continue;
        }

        repairedRetrieval.push(concept);
    }

    if (repairedRetrieval.length > maxRetrieval) {
        const overflow = repairedRetrieval.splice(maxRetrieval);
        repairedSupport.push(...overflow);
        warnings.push(`Cekirdek kavram sayisi ${maxRetrieval} ile sinirlandi.`);
    }

    return {
        retrievalConcepts: dedupeStrings(repairedRetrieval, { max: maxRetrieval }),
        evidenceConcepts: dedupeStrings(repairedEvidence, { max: 10 }),
        supportConcepts: dedupeStrings(repairedSupport, { max: 8 }),
        warnings: dedupeStrings(warnings, { max: 6 }),
    };
};

export const buildKeywordSearch = (concepts = [], fallback = '', { maxConcepts = 2, maxWords = 6 } = {}) => {
    const coreConcepts = dedupeStrings(concepts, { max: maxConcepts })
        .slice(0, maxConcepts)
        .map((item) => clampWords(item, maxWords))
        .filter(Boolean);

    if (coreConcepts.length > 0) {
        return coreConcepts.join(' ').trim();
    }

    return clampWords(fallback, maxWords);
};

const buildCompactQueries = ({
    retrievalConcepts = [],
    supportConcepts = [],
    clauses = [],
    articles = [],
    label = '',
    domain = '',
}) => {
    const retrieval = dedupeStrings(retrievalConcepts, { max: 4 }).map((item) => clampWords(item, 6));
    const support = dedupeStrings(supportConcepts, { max: 4 }).map((item) => clampWords(item, 5));
    const compactClauses = dedupeStrings(clauses, { max: 6 }).map((item) => cleanClause(item, { maxWords: 8 }));
    const compactArticles = dedupeStrings(articles, { max: 2 }).map((item) => clampWords(item, 4));

    return dedupeStrings([
        ...compactClauses,
        ...retrieval,
        retrieval[0] && retrieval[1] ? `${retrieval[0]} ${retrieval[1]}` : '',
        retrieval[0] && support[0] ? `${retrieval[0]} ${support[0]}` : '',
        retrieval[0] && support[1] ? `${retrieval[0]} ${support[1]}` : '',
        retrieval[1] && support[0] ? `${retrieval[1]} ${support[0]}` : '',
        compactArticles[0] && retrieval[0] ? `${compactArticles[0]} ${retrieval[0]}` : '',
        compactArticles[0] && retrieval[1] ? `${compactArticles[0]} ${retrieval[1]}` : '',
        label ? `${clampWords(label, 3)} emsal karar` : '',
        domain ? `${clampWords(domain, 2)} emsal karar` : '',
    ], { max: 6 });
};

export const resolveQueryMode = (rawText = '') => {
    const text = String(rawText || '').trim();
    const normalized = normalizeSkillText(text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;

    if (
        /\b(dilekce|davaci|davali|talep sonucu|sonuc ve istem|aciklanan nedenlerle|sayin mahkeme)\b/i.test(normalized)
        && lineCount >= 4
    ) {
        return 'document_style';
    }

    if (
        /\b(iddianame|cumhuriyet bassavciligi|hazirlik burosu|sorusturma no|esas no|supheli|sanik|mudafii|deliller|sorusturma evraki|mahkemesine|tutuklu is)\b/i.test(normalized)
        && lineCount >= 4
    ) {
        return 'case_file';
    }

    if (
        /\b(iddianame|cumhuriyet bassavciligi|hazirlik burosu|sorusturma no|esas no|supheli|sanik|mudafii|deliller|sorusturma evraki|sonuc|sayin mahkeme|dava konusu|aciklanan nedenlerle)\b/i.test(normalized)
        || text.length >= LONG_FACT_MIN_LENGTH
        || wordCount >= LONG_FACT_MIN_WORDS
    ) {
        return 'long_fact';
    }

    return 'short_issue';
};

export const buildSemanticQuery = ({ coreIssue = '', supportConcepts = [], evidenceConcepts = [] } = {}) =>
    [
        coreIssue,
        supportConcepts.length > 0 ? `Destek basliklari: ${supportConcepts.slice(0, 3).join(', ')}.` : '',
        evidenceConcepts.length > 0 ? `Delil sinyalleri: ${evidenceConcepts.slice(0, 4).join(', ')}.` : '',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export const buildStrategyPlan = ({
    name,
    code,
    description,
    queryMode,
    domain,
    label,
    sourceTargets,
    profiles,
    coreIssue,
    retrievalConcepts,
    supportConcepts,
    evidenceConcepts,
    negativeConcepts,
    clauses,
    articles,
    subdomain = '',
    suggestedCourt = '',
    decisionType = '',
    sourcePolicy = '',
    routingMode = '',
    mustConcepts = [],
    denyConcepts = [],
    primaryBirimCodes = [],
    secondaryBirimCodes = [],
    strictMatchMode = '',
    validationWarnings = [],
    allowEvidenceAsCore = false,
}) => {
    const normalizedClauses = dedupeStrings(clauses, { max: 6 });
    const plainClause = normalizedClauses.find((item) => item && !/[+"]/u.test(item));
    const primarySearchQuery = plainClause || buildKeywordSearch(retrievalConcepts, coreIssue);

    return {
        name,
        description,
        plan: {
        skillId: SKILL_ID,
        skillActive: true,
        strategyCode: code,
        queryMode,
        domain,
        primaryDomain: domain,
        domainLabel: label,
        legalArea: domain,
        primaryProfile: profiles[0] || domain,
        profiles,
        sourceTargets,
        targetSources: sourceTargets,
        coreIssue,
        retrievalConcepts,
        supportConcepts,
        evidenceConcepts,
        negativeConcepts,
        searchClauses: normalizedClauses,
        candidateQueries: normalizedClauses,
        semanticQuery: buildSemanticQuery({ coreIssue, supportConcepts, evidenceConcepts }),
        searchQuery: primarySearchQuery,
        initialKeyword: primarySearchQuery,
        subdomain,
        suggestedCourt,
        decisionType,
        sourcePolicy,
        routingMode,
        mustConcepts: dedupeStrings(mustConcepts, { max: 12 }),
        denyConcepts: dedupeStrings(denyConcepts, { max: 16 }),
        primaryBirimCodes: dedupeStrings(primaryBirimCodes, { max: 6 }),
        secondaryBirimCodes: dedupeStrings(secondaryBirimCodes, { max: 6 }),
        strictMatchMode: strictMatchMode || 'query_core',
        validationWarnings: dedupeStrings(validationWarnings, { max: 6 }),
        allowEvidenceAsCore: Boolean(allowEvidenceAsCore),
        reason: `${SKILL_ID} skill stratejisi ${code} calisti.`,
        extractedArticles: articles,
        fallbackPolicy: 'ordered',
        },
    };
};

export const buildGenericPackage = ({
    rawText = '',
    domain = '',
    label = '',
    profiles = [],
    sources = ['yargitay'],
    negative = [],
    principles = [],
    evidence = [],
    variant = null,
    queryMode = 'short_issue',
    preferredSource = 'all',
    strictResultMode = false,
    suggestedCourt = '',
    subdomain = '',
    decisionType = '',
    allowEvidenceAsCore = false,
}) => {
    if (!variant) return null;

    const articles = dedupeStrings(extractLegalArticles(rawText), { max: 4 });
    const sourceTargets = dedupeStrings(
        preferredSource && preferredSource !== 'all' ? [preferredSource] : sources,
        { max: 2 }
    );
    const normalizedText = normalizeSkillText(rawText);
    const rawRetrievalConcepts = dedupeStrings(
        variant.retrieval || [],
        { max: queryMode === 'long_fact' ? 5 : 6 }
    );
    const rawSupportConcepts = dedupeStrings([
        ...(variant.support || []),
        ...principles.slice(0, 2),
        ...articles.slice(0, 2),
    ], { max: 6 });
    const rawEvidenceConcepts = dedupeStrings([
        ...extractEvidenceSignalConcepts(rawText, [...evidence, ...(variant.evidence || [])]),
        ...evidence.filter((term) => normalizedText.includes(normalizeSkillText(term))),
        ...(variant.evidence || []),
    ], { max: 10 });
    const negativeConcepts = dedupeStrings(negative, { max: 12 });
    const repaired = moveEvidenceOutOfRetrieval({
        retrievalConcepts: rawRetrievalConcepts,
        evidenceConcepts: rawEvidenceConcepts,
        supportConcepts: rawSupportConcepts,
        evidenceHints: evidence,
        maxRetrieval: domain === 'ceza' && ['long_fact', 'case_file'].includes(queryMode) ? 3 : 4,
        allowEvidenceAsCore,
    });
    const retrievalConcepts = repaired.retrievalConcepts;
    const supportConcepts = repaired.supportConcepts;
    const evidenceConcepts = repaired.evidenceConcepts;
    const validationWarnings = repaired.warnings;
    const mustConcepts = dedupeStrings([
        ...(variant.must || []),
        ...retrievalConcepts.slice(0, 3),
    ], { max: 10 });
    const denyConcepts = dedupeStrings([
        ...(negativeConcepts || []),
        ...(variant.deny || []),
    ], { max: 16 });
    const primaryBirimCodes = dedupeStrings(variant.primaryBirimCodes || [], { max: 6 });
    const secondaryBirimCodes = dedupeStrings(variant.secondaryBirimCodes || [], { max: 6 });
    const sourcePolicy = String(variant.sourcePolicy || sourceTargets[0] || '').trim();
    const routingMode = String(
        variant.routingMode
        || (secondaryBirimCodes.length > 0
            ? 'primary_secondary'
            : (primaryBirimCodes.length > 0 ? 'hard_primary' : 'source_first'))
    ).trim() || 'source_first';
    const strictMatchMode = String(
        variant.strictMatchMode || (strictResultMode ? 'must_support' : 'query_core')
    ).trim() || 'query_core';

    const strategyA = buildStrategyPlan({
        name: 'Strateji A',
        code: 'A',
        description: 'Dar cekirdek sorun aramasi',
        queryMode,
        domain,
        label,
        sourceTargets,
        profiles,
        coreIssue: variant.core,
        retrievalConcepts,
        supportConcepts: supportConcepts.slice(0, 4),
        evidenceConcepts,
        negativeConcepts,
        clauses: buildCompactQueries({
            retrievalConcepts,
            supportConcepts: supportConcepts.slice(0, 2),
            clauses: variant.clauses || [buildKeywordSearch(retrievalConcepts, variant.core)],
            articles,
            label,
            domain,
        }),
        articles,
        subdomain,
        suggestedCourt,
        decisionType,
        sourcePolicy,
        routingMode,
        mustConcepts,
        denyConcepts,
        primaryBirimCodes,
        secondaryBirimCodes,
        strictMatchMode,
        validationWarnings,
        allowEvidenceAsCore,
    });

    const strategyB = buildStrategyPlan({
        name: 'Strateji B',
        code: 'B',
        description: 'Ilke ve prensip aramasi',
        queryMode,
        domain,
        label,
        sourceTargets,
        profiles,
        coreIssue: `${variant.core}. Ilke, ispat ve yorum standartlari da birlikte degerlendirilsin.`,
        retrievalConcepts: dedupeStrings([retrievalConcepts[0], ...principles.slice(0, 2)], { max: 3 }),
        supportConcepts,
        evidenceConcepts,
        negativeConcepts,
        clauses: buildCompactQueries({
            retrievalConcepts: dedupeStrings([retrievalConcepts[0], ...principles.slice(0, 2)], { max: 3 }),
            supportConcepts,
            clauses: [
                ...((variant.clauses || []).slice(0, 2)),
                ...principles.slice(0, 2).map((item) => `${retrievalConcepts[0] || domain} ${item}`),
            ],
            articles,
            label,
            domain,
        }),
        articles,
        subdomain,
        suggestedCourt,
        decisionType,
        sourcePolicy,
        routingMode,
        mustConcepts,
        denyConcepts,
        primaryBirimCodes,
        secondaryBirimCodes,
        strictMatchMode,
        validationWarnings,
        allowEvidenceAsCore,
    });

    const strategyC = buildStrategyPlan({
        name: 'Strateji C',
        code: 'C',
        description: 'Madde ve kurum odakli kontrollu fallback',
        queryMode,
        domain,
        label,
        sourceTargets,
        profiles,
        coreIssue: `${variant.core}. Kanun maddesi ve kurum uygulamasi odakli fallback aramasi.`,
        retrievalConcepts: dedupeStrings([...retrievalConcepts.slice(0, 2), ...articles.slice(0, 1)], { max: 3 }),
        supportConcepts,
        evidenceConcepts,
        negativeConcepts,
        clauses: buildCompactQueries({
            retrievalConcepts: dedupeStrings([...retrievalConcepts.slice(0, 2), ...articles.slice(0, 1)], { max: 3 }),
            supportConcepts,
            clauses: [
                ...((variant.clauses || []).slice(0, 2)),
                ...articles.map((article) => `${article} ${retrievalConcepts[0] || domain}`),
                `${label} emsal karar`,
            ],
            articles,
            label,
            domain,
        }),
        articles,
        subdomain,
        suggestedCourt,
        decisionType,
        sourcePolicy,
        routingMode,
        mustConcepts,
        denyConcepts,
        primaryBirimCodes,
        secondaryBirimCodes,
        strictMatchMode,
        validationWarnings,
        allowEvidenceAsCore,
    });

    return {
        skillId: SKILL_ID,
        active: true,
        primaryDomain: domain,
        queryMode,
        sourceTargets,
        strategies: [strategyA, strategyB, strategyC],
        context: {
            active: true,
            skillId: SKILL_ID,
            primaryDomain: domain,
            domainLabel: label,
            queryMode,
            enforceStrategyOrder: true,
            strictResultMode,
            sourceTargets,
            negativeConcepts,
            skillType: subdomain || `${domain}_general`,
            subdomain,
            suggestedCourt,
            decisionType,
            sourcePolicy,
            routingMode,
            mustConcepts,
            denyConcepts,
            primaryBirimCodes,
            secondaryBirimCodes,
            strictMatchMode,
            validationWarnings,
        },
        diagnostics: {
            active: true,
            skillId: SKILL_ID,
            primaryDomain: domain,
            domainLabel: label,
            queryMode,
            sourceTargets,
            strategyOrder: ['A', 'B', 'C'],
            selectedStrategy: null,
            attemptedStrategies: [],
            fallbackAttempted: false,
            zeroResultReason: null,
            zeroResultMessage: null,
            coreIssue: variant.core,
            subdomain,
            suggestedCourt,
            decisionType,
            sourcePolicy,
            routingMode,
            mustConcepts,
            denyConcepts,
            primaryBirimCodes,
            secondaryBirimCodes,
            strictMatchMode,
            validationWarnings,
        },
    };
};
