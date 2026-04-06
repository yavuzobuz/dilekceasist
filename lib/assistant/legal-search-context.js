export const dedupeStrings = (values = [], limit = 8) => {
    const seen = new Set();
    const items = [];

    for (const value of values) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) continue;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(normalized);
        if (items.length >= limit) break;
    }

    return items;
};

const inferLegalSourceForQuery = (fallbackText = '') => {
    const normalized = String(fallbackText || '').toLocaleLowerCase('tr-TR');
    if (/(anayasa|bireysel basvuru|hak ihlali)/i.test(normalized)) return 'anayasa';
    if (/(danistay|idare mahkemesi|vergi mahkemesi|idari islem|imar)/i.test(normalized)) return 'danistay';
    if (/(bam|bolge adliye|istinaf|yerel mahkeme|uyap)/i.test(normalized)) return 'uyap';
    if (/(yargitay|ceza|hukuk dairesi|icra|borclar|is hukuku|aile)/i.test(normalized)) return 'yargitay';
    return 'all';
};

export const mapPreferredSourceToAnalyzer = (preferredSource = '', fallbackText = '') => {
    const normalizedSource = String(preferredSource || '').trim().toLocaleLowerCase('tr-TR');
    const inferredSource = inferLegalSourceForQuery(fallbackText);
    const effectiveSource = normalizedSource || inferredSource;

    if (effectiveSource === 'anayasa') {
        return { kaynak: 'anayasa', courtTypes: [] };
    }
    if (effectiveSource === 'danistay') {
        return { kaynak: 'bedesten', courtTypes: ['DANISTAYKARAR'] };
    }
    if (effectiveSource === 'uyap' || effectiveSource === 'bam') {
        return { kaynak: 'emsal', courtTypes: ['ISTINAFHUKUK'] };
    }
    if (effectiveSource === 'yargitay') {
        return { kaynak: 'bedesten', courtTypes: ['YARGITAYKARARI'] };
    }
    return { kaynak: 'bedesten', courtTypes: [] };
};

export const extractLawReferences = (values = []) =>
    dedupeStrings(
        values.filter((value) => /(?:\b(?:tbk|tck|hmk|cmk|tmk|ihk|kvkk|aym)\b|\b\d+\s*sayili\b|\bmadde\b)/i.test(value)),
        6
    );

export const buildDocumentAnalyzerResult = (analysisData, fallbackText = '') => {
    if (!analysisData || typeof analysisData !== 'object') return null;

    const legalSearchPacket = analysisData.legalSearchPacket;
    const fallbackQuery = String(fallbackText || analysisData.summary || '').trim();
    const searchClauses = dedupeStrings([
        ...((legalSearchPacket?.searchVariants || []).map((item) => item?.query)),
        legalSearchPacket?.searchSeedText,
        fallbackQuery,
    ], 6);

    const primaryConcepts = dedupeStrings([
        ...(legalSearchPacket?.requiredConcepts || []),
        analysisData.analysisInsights?.coreIssue,
        analysisData.caseDetails?.caseTitle,
    ], 8);
    const supportConcepts = dedupeStrings([
        ...(legalSearchPacket?.supportConcepts || []),
        ...((analysisData.analysisInsights?.legalIssues || [])),
    ], 8);
    const negativeConcepts = dedupeStrings(legalSearchPacket?.negativeConcepts || [], 8);

    if (searchClauses.length === 0 && primaryConcepts.length === 0 && supportConcepts.length === 0 && !analysisData.summary?.trim()) {
        return null;
    }

    const sourceHints = mapPreferredSourceToAnalyzer(legalSearchPacket?.preferredSource, fallbackQuery);
    const lawReferences = extractLawReferences([
        ...primaryConcepts,
        ...supportConcepts,
        ...searchClauses,
    ]);

    return {
        davaKonusu:
            legalSearchPacket?.caseType
            || analysisData.analysisInsights?.caseType
            || analysisData.caseDetails?.caseTitle
            || '',
        hukukiMesele:
            legalSearchPacket?.coreIssue
            || analysisData.analysisInsights?.coreIssue
            || analysisData.summary
            || fallbackQuery,
        kaynak: sourceHints.kaynak,
        courtTypes: sourceHints.courtTypes,
        aramaIfadeleri: searchClauses,
        ilgiliKanunlar: lawReferences,
        mustKavramlar: primaryConcepts,
        supportKavramlar: supportConcepts,
        negativeKavramlar: negativeConcepts,
        queryMode: legalSearchPacket?.queryMode || 'long_fact',
        diagnostics: {
            origin: 'assistant_shared',
        },
    };
};

export const getLegalResultPreviewText = (result = {}) =>
    (typeof result.ozet === 'string' ? result.ozet.trim() : '')
    || (typeof result.snippet === 'string' ? result.snippet.trim() : '')
    || (typeof result.summaryText === 'string' ? result.summaryText.trim() : '');

export const buildLegalResultsPrompt = (results = []) => {
    if (!Array.isArray(results) || results.length === 0) return '';
    return results.map((result) => {
        const preview = getLegalResultPreviewText(result);
        return `- ${result.title || 'Karar'} ${result.esasNo ? `E. ${result.esasNo}` : ''} ${result.kararNo ? `K. ${result.kararNo}` : ''} ${result.tarih ? `T. ${result.tarih}` : ''} ${preview}`.replace(/\s+/g, ' ').trim();
    }).join('\n');
};

export const mergeWebSearchResults = (existing = null, incoming = null) => {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const summary = [existing.summary, incoming.summary].filter(Boolean).join('\n\n').trim();
    const sourceMap = new Map();
    [...(existing.sources || []), ...(incoming.sources || [])]
        .filter((source) => source?.uri)
        .forEach((source) => sourceMap.set(source.uri, { uri: source.uri, title: source.title || source.uri }));
    return { summary, sources: Array.from(sourceMap.values()) };
};
