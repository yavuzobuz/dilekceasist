import type { LegalSearchResult } from '../../types';
import type { LegalSearchPacket } from '../../types';
import { normalizeLegalSource } from './legalSource';
import { normalizeExplicitLegalSearchPacket as normalizeSharedExplicitLegalSearchPacket } from '../../lib/legal/legal-search-packet-adapter.js';

export interface NormalizedLegalDecision extends LegalSearchResult {
    id?: string;
    documentId?: string;
    snippet?: string;
    similarityScore?: number;
    semanticQuery?: string;
    initialKeyword?: string;
    matchedKeywordCount?: number;
    matchedKeywords?: string[];
    matchStage?: 'summary' | 'full_text';
    requiredKeywordCount?: number;
    [key: string]: any;
}

const SYNTHETIC_LEGAL_RESULT_ID_REGEX = /^(search-|legal-|ai-summary|sem-|template-decision-)/i;

const getLegalResultIdentityKey = (result: Partial<NormalizedLegalDecision>): string => {
    const documentId = String(result.documentId || '').trim();
    if (documentId && !SYNTHETIC_LEGAL_RESULT_ID_REGEX.test(documentId)) {
        return `doc:${documentId}`;
    }

    return `meta:${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
};

interface SearchLegalDecisionsParams {
    source: string;
    keyword: string;
    rawQuery?: string;
    legalSearchPacket?: LegalSearchPacket | null;
    filters?: Record<string, any>;
    searchMode?: 'auto' | 'pro';
    apiBaseUrl?: string;
}

interface GetLegalDocumentParams {
    source?: string;
    documentId?: string;
    documentUrl?: string;
    title?: string;
    esasNo?: string;
    kararNo?: string;
    tarih?: string;
    daire?: string;
    ozet?: string;
    snippet?: string;
    apiBaseUrl?: string;
}

export interface LegalSearchDebugResult {
    endpoint: string;
    request: Record<string, any>;
    response: any;
    normalizedResults: NormalizedLegalDecision[];
    durationMs: number;
}

export interface LegalDocumentDebugResult {
    endpoint: string;
    request: Record<string, any>;
    response: any;
    documentText: string;
    durationMs: number;
}

export interface AiLegalSearchPlan {
    queryMode?: 'short_issue' | 'long_fact' | 'document_style' | 'case_file';
    allowEvidenceAsCore?: boolean;
    legalArea?: string;
    primaryDomain?: string;
    secondaryDomains?: string[];
    coreIssue?: string;
    searchQuery: string;
    semanticQuery?: string;
    searchClauses?: string[];
    queryVariantsTurkish?: string[];
    queryVariantsAscii?: string[];
    searchRounds?: Array<{
        round?: string;
        clauses?: string[];
        asciiClauses?: string[];
    }>;
    keywords: string[];
    retrievalConcepts?: string[];
    requiredConcepts?: string[];
    supportConcepts?: string[];
    evidenceConcepts?: string[];
    negativeConcepts?: string[];
    canonicalRequiredConcepts?: string[];
    canonicalSupportConcepts?: string[];
    targetSources?: string[];
    sourceTargets?: string[];
    sourceReason?: string;
    optionalBirimCodes?: string[];
    domainProfileId?: string;
    reasoning?: string;
    suggestedSource?: string;
}

interface PreparedLegalSearchRequest {
    effectiveRawQuery: string;
    effectiveSource: string;
    effectiveKeyword: string;
    effectiveLegalSearchPacket?: LegalSearchPacket;
    effectiveFilters: Record<string, any>;
    effectiveSearchMode?: 'pro';
}

interface RawLegalSearchRequestResult {
    endpoint: string;
    request: Record<string, any>;
    response: any;
    durationMs: number;
}

export const shouldUseProLegalSearchMode = ({
    keyword = '',
    rawQuery = '',
    searchMode = 'auto',
}: Partial<Pick<SearchLegalDecisionsParams, 'keyword' | 'rawQuery' | 'searchMode'>> = {}): boolean => {
    if (searchMode === 'pro') return true;

    const normalizedRaw = String(rawQuery || keyword || '').replace(/\s+/g, ' ').trim();
    const normalizedKeyword = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (!normalizedRaw) return false;

    const wordCount = normalizedRaw.split(/\s+/).filter(Boolean).length;
    if (String(rawQuery || '').includes('\n')) return true;
    if (normalizedRaw.length >= 80) return true;
    if (wordCount >= 8 && /[,:;?!]/.test(normalizedRaw)) return true;
    if (
        normalizedKeyword &&
        normalizedRaw.length >= 45 &&
        normalizedRaw.length - normalizedKeyword.length >= 18
    ) {
        return true;
    }

    return false;
};

export interface ValidationWarning {
    term: string;
    from?: string;
    to?: string;
    reason?: string;
    attempt?: number;
    [key: string]: any;
}

export interface PlanRetryForbiddenTerm {
    term: string;
    to?: string;
    reason?: string;
    [key: string]: any;
}

export interface PlanDiagnosticsAttempt {
    attempt: number;
    stage?: string;
    queryMode?: AiLegalSearchPlan['queryMode'] | string;
    validationWarnings?: ValidationWarning[];
    retryForbiddenTerms?: PlanRetryForbiddenTerm[];
    fewShotExampleIds?: string[];
    transportRetryCount?: number;
    [key: string]: any;
}

export interface PlanDiagnostics {
    generationMode?: 'always' | 'provided' | string;
    retryCount?: number;
    finalStatus?: 'accepted' | 'repaired' | 'retried' | 'fallback' | string;
    validationWarnings?: ValidationWarning[];
    attempts?: PlanDiagnosticsAttempt[];
    scoutProfile?: Record<string, any> | null;
    fewShotExampleIds?: string[];
    reviewApplied?: boolean;
    transportRetryCount?: number;
    [key: string]: any;
}

export interface RetrievalDiagnostics {
    backendMode?: 'simple_bedesten' | 'legacy_mcp' | string;
    upstream?: 'bedesten' | 'legacy_mcp' | string;
    queryVariants?: string[];
    fallbackReason?: string | null;
    targetSources?: string[];
    queryVariantsTurkish?: string[];
    queryVariantsAscii?: string[];
    primaryDomain?: string;
    secondaryDomains?: string[];
    clauseRuns?: Array<Record<string, any>>;
    totalCandidates?: number;
    summaryPassedCount?: number;
    fullTextCheckedCount?: number;
    strictFinalCount?: number;
    fallbackFinalCount?: number;
    finalMatchedCount?: number;
    fallbackUsed?: boolean;
    zeroResultReason?: string | null;
    summaryThresholdCount?: number;
    requiredKeywordCount?: number;
    semanticModel?: string;
    legalArea?: string;
    requiredConcepts?: string[];
    retrievalConcepts?: string[];
    supportConcepts?: string[];
    evidenceConcepts?: string[];
    negativeConcepts?: string[];
    [key: string]: any;
}

export interface LegalSearchResponseDiagnostics {
    planDiagnostics?: PlanDiagnostics;
    retrievalDiagnostics?: RetrievalDiagnostics;
    skillDiagnostics?: Record<string, any>;
    zeroResultReason?: string | null;
    zeroResultMessage?: string | null;
}

export interface LegalSearchDetailedResult {
    endpoint: string;
    request: Record<string, any>;
    response: any;
    normalizedResults: NormalizedLegalDecision[];
    evaluationGroups?: {
        davaci_lehine: NormalizedLegalDecision[];
        davali_lehine: NormalizedLegalDecision[];
        notr: NormalizedLegalDecision[];
    };
    durationMs: number;
    diagnostics: LegalSearchResponseDiagnostics;
}

const REQUEST_TIMEOUT_MS = Math.max(
    15000,
    Math.min(90000, Number((import.meta as any)?.env?.VITE_LEGAL_REQUEST_TIMEOUT_MS || 90000))
);
const DOCUMENT_REQUEST_TIMEOUT_MS = Math.max(
    12000,
    Math.min(45000, Number((import.meta as any)?.env?.VITE_LEGAL_DOCUMENT_TIMEOUT_MS || 20000))
);
const AI_PLAN_REQUEST_TIMEOUT_MS = Math.max(
    12000,
    Math.min(45000, Number((import.meta as any)?.env?.VITE_LEGAL_AI_PLAN_TIMEOUT_MS || 20000))
);
const LEGAL_SEARCH_TIMEOUT_MESSAGE = `Ictihat aramasi zaman asimina ugradi (${Math.round(REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
const LEGAL_DOCUMENT_TIMEOUT_MESSAGE = `Karar metni alma islemi zaman asimina ugradi (${Math.round(DOCUMENT_REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
const LEGAL_AI_PLAN_TIMEOUT_MESSAGE = `Uzun arama metni AI ile hazirlanirken zaman asimi oldu (${Math.round(AI_PLAN_REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
const inFlightLegalSearchRequests = new Map<string, Promise<RawLegalSearchRequestResult>>();
const LEGAL_QUERY_PRIORITY_PHRASES = [
    'itirazin iptali',
    'icra takibi',
    'borca itiraz',
    'menfi tespit',
    'hizmet tespit',
    'kacak elektrik',
    'kacak elektrik tuketimi',
    'usulsuz elektrik',
    'tespit tutanagi',
    'muhur kirma',
    'muhur fekki',
    'dagitim sirketi',
    'dagitim sirketi alacagi',
    'kayip kacak bedeli',
    'kayip kacak',
    'enerji piyasasi',
    'elektrik piyasasi',
    'tuketici hizmetleri',
    'haksiz fiil sorumlulugu',
    'haksiz fiil',
    'ispat yuku',
    'alacakli lehine',
    'idari para cezasi',
    'imar barisi',
    'yapi kayit belgesi',
    'sit alani',
    'gecici 16',
    'epdk',
];

const normalizeKeywordToken = (value: unknown): string =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const buildLegalKeywordQuery = (
    keywords: string[],
    options?: { maxTerms?: number; maxLength?: number }
): string => {
    const maxTerms = Math.max(3, Math.min(12, Number(options?.maxTerms) || 8));
    const maxLength = Math.max(80, Math.min(280, Number(options?.maxLength) || 240));
    const cleaned = (Array.isArray(keywords) ? keywords : [])
        .map((item) =>
            String(item || '')
                .replace(/\s+/g, ' ')
                .trim()
        )
        .filter(Boolean);

    if (cleaned.length === 0) return '';

    const prioritized: string[] = [];
    const fallback: string[] = [];

    for (const keyword of cleaned) {
        const normalized = normalizeKeywordToken(keyword);
        if (!normalized) continue;
        const hasPriorityPhrase = LEGAL_QUERY_PRIORITY_PHRASES.some((phrase) =>
            normalized.includes(phrase)
        );
        if (hasPriorityPhrase) prioritized.push(keyword);
        else fallback.push(keyword);
    }

    const ordered = [...prioritized, ...fallback];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const keyword of ordered) {
        const key = normalizeKeywordToken(keyword);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(keyword);
        if (unique.length >= maxTerms) break;
    }

    const merged = unique.join(' ').replace(/\s+/g, ' ').trim();
    if (merged.length <= maxLength) return merged;

    const compacted: string[] = [];
    let currentLength = 0;
    for (const keyword of unique) {
        const nextValue = String(keyword || '').trim();
        if (!nextValue) continue;
        const nextLength =
            currentLength === 0 ? nextValue.length : currentLength + 1 + nextValue.length;
        if (nextLength > maxLength) break;
        compacted.push(nextValue);
        currentLength = nextLength;
    }

    return compacted.join(' ').trim() || merged.slice(0, maxLength).trim();
};

const normalizeLegalSearchPacketText = (value: unknown, maxLength = 260): string =>
    String(value || '')
        .replace(/[â€œâ€"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        .trim();

const normalizeLegalSearchPacketList = (values: unknown, limit = 8): string[] => {
    if (!Array.isArray(values)) return [];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const normalized = normalizeLegalSearchPacketText(value, 120);
        if (!normalized) continue;
        const key = normalizeKeywordToken(normalized);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(normalized);
        if (deduped.length >= limit) break;
    }
    return deduped;
};

const normalizeLegalSearchPacketVariants = (values: LegalSearchPacket['searchVariants'] | unknown, limit = 4): NonNullable<LegalSearchPacket['searchVariants']> => {
    if (!Array.isArray(values)) return [];

    const variants: NonNullable<LegalSearchPacket['searchVariants']> = [];
    const seen = new Set<string>();

    for (const item of values) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const query = String((item as { query?: unknown }).query || '')
            .replace(/[â€œâ€]/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220)
            .trim();
        if (!query) continue;
        const key = normalizeKeywordToken(query);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        variants.push({
            query,
            mode: normalizeLegalSearchPacketText((item as { mode?: unknown }).mode, 24) || undefined,
        });
        if (variants.length >= limit) break;
    }

    return variants;
};

export const normalizeExplicitLegalSearchPacket = (value: LegalSearchPacket | null | undefined): LegalSearchPacket | undefined =>
    (normalizeSharedExplicitLegalSearchPacket(value as any) as unknown as LegalSearchPacket) || undefined;

const normalizeLegalSearchPacket = normalizeExplicitLegalSearchPacket;

const buildRawQueryFromLegalSearchPacket = (packet?: LegalSearchPacket): string => {
    if (!packet) return '';

    return normalizeLegalSearchPacketText([
        packet.searchSeedText,
        packet.coreIssue,
        packet.caseType,
        ...(Array.isArray(packet.requiredConcepts) ? packet.requiredConcepts.slice(0, 4) : []),
        ...(Array.isArray(packet.supportConcepts) ? packet.supportConcepts.slice(0, 2) : []),
    ].filter(Boolean).join(' '), 320);
};

const buildKeywordFromLegalSearchPacket = (packet?: LegalSearchPacket): string => {
    if (!packet) return '';

    return buildLegalKeywordQuery([
        ...(Array.isArray(packet.requiredConcepts) ? packet.requiredConcepts : []),
        ...(Array.isArray(packet.supportConcepts) ? packet.supportConcepts.slice(0, 4) : []),
    ], {
        maxTerms: 8,
        maxLength: 180,
    });
};

const getLegalSearchPacketKeywordList = (packet?: LegalSearchPacket): string[] => {
    if (!packet) return [];

    const ordered = [
        ...(Array.isArray(packet.requiredConcepts) ? packet.requiredConcepts : []),
        ...(Array.isArray(packet.supportConcepts) ? packet.supportConcepts : []),
        ...(Array.isArray(packet.evidenceConcepts) ? packet.evidenceConcepts : []),
    ];

    const seen = new Set<string>();
    const keywords: string[] = [];

    for (const item of ordered) {
        const normalized = normalizeLegalSearchPacketText(item, 120);
        if (!normalized) continue;
        const key = normalizeKeywordToken(normalized);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keywords.push(normalized);
        if (keywords.length >= 12) break;
    }

    return keywords;
};

const buildAutoLegalSearchText = ({
    packet,
    fallbackSummary = '',
    fallbackKeywords = [],
}: {
    packet?: LegalSearchPacket;
    fallbackSummary?: string;
    fallbackKeywords?: string[];
}): string => {
    const directPacketSearchText = String(packet?.searchSeedText || '').trim();
    if (directPacketSearchText) return directPacketSearchText;

    const packetText = buildRawQueryFromLegalSearchPacket(packet);
    if (packetText) return packetText;
    if (String(fallbackSummary || '').trim()) return String(fallbackSummary || '').trim();
    return Array.isArray(fallbackKeywords) ? fallbackKeywords.join(' ').trim() : '';
};

export const buildLegalSearchInputs = ({
    queryInput,
    legalSearchPacket,
    preserveKeywords = [],
    fallbackSummary = '',
    fallbackKeywords = [],
}: {
    queryInput?: string | string[];
    legalSearchPacket?: LegalSearchPacket | null;
    preserveKeywords?: string[];
    fallbackSummary?: string;
    fallbackKeywords?: string[];
}): {
    keyword: string;
    rawQuery: string;
    legalSearchPacket?: LegalSearchPacket;
    packetKeywords: string[];
} => {
    const normalizedPacket = normalizeLegalSearchPacket(legalSearchPacket);
    const packetKeywords = getLegalSearchPacketKeywordList(normalizedPacket);
    const rawQuery = Array.isArray(queryInput)
        ? queryInput.join(' ').trim()
        : String(queryInput || '').trim();
    const preservedKeywords = Array.isArray(preserveKeywords)
        ? preserveKeywords.filter(Boolean)
        : [];
    const effectiveFallbackKeywords = Array.isArray(fallbackKeywords) && fallbackKeywords.length > 0
        ? fallbackKeywords
        : preservedKeywords;
    const effectiveRawQuery = rawQuery || buildAutoLegalSearchText({
        packet: normalizedPacket,
        fallbackSummary,
        fallbackKeywords: effectiveFallbackKeywords,
    });
    const keyword = String(normalizedPacket?.searchSeedText || '').trim()
        || compactLegalSearchQuery(effectiveRawQuery, { preserveKeywords: [...packetKeywords, ...preservedKeywords] })
        || buildKeywordFromLegalSearchPacket(normalizedPacket)
        || effectiveRawQuery;

    return {
        keyword,
        rawQuery: effectiveRawQuery,
        legalSearchPacket: normalizedPacket,
        packetKeywords,
    };
};

const LEGAL_SEARCH_TEXT_STOPWORDS = new Set([
    've',
    'veya',
    'ile',
    'icin',
    'ama',
    'fakat',
    'gibi',
    'daha',
    'kadar',
    'olan',
    'olanlar',
    'olarak',
    'bu',
    'su',
    'o',
    'bir',
    'iki',
    'uc',
    'de',
    'da',
    'mi',
    'mu',
    'ki',
    'ya',
    'yada',
    'hem',
    'en',
    'cok',
    'az',
    'sonra',
    'once',
    'son',
    'ilk',
    'her',
    'tum',
    'hakkinda',
    'oldu',
    'olur',
    'olsun',
    'uzerinde',
    'suretiyle',
    'yonelik',
    'iliskin',
    'dair',
    'dolayi',
    'nedeniyle',
    'kapsaminda',
    'aciklanan',
    'hususlar',
    'mevcut',
    'birlikte',
    'degerlendirilerek',
    'anlasilmakla',
    'kanaatine',
    'varildigi',
    'itibar',
    'edilmedigi',
    'yeterli',
    'isiginda',
    'dogrultusunda',
    'yapilan',
    'alinan',
    'tespit',
    'edilen',
    'isimli',
    'sahislardan',
    'tarihli',
    'mahkemece',
    'mahkemesince',
    'dairesince',
    'istinaf',
    'temyiz',
    'bozma',
    'direnme',
    'esastan',
    'reddine',
    'duzeltilerek',
    'uyarinca',
    'maddeleri',
    'maddesi',
    'sayili',
    'tarihinin',
    'hukumlerin',
    'hukumleri',
    'hukum',
    'verilen',
    'gonderilen',
    'gonderildigi',
    'inceleme',
    'mahsuba',
]);

const LEGAL_SEARCH_SHORT_TOKENS = new Set([
    'tck',
    'cmk',
    'tbk',
    'tmk',
    'hmk',
    'iik',
    'ttk',
    'iyuk',
    'vuk',
    'aym',
]);

const LEGAL_SEARCH_NUMERIC_SIGNAL_TOKEN_PATTERN = /^\d{3,4}(?:[./-]\d+)*$/;

const LEGAL_SEARCH_PROCEDURAL_NOISE_PATTERNS = [
    /\b\d{1,4}-\d{1,5}\b/g,
    /\b\d{1,2}\.\d{1,2}\.\d{4}\b/g,
];

const LEGAL_SEARCH_PROCEDURAL_NOISE_TOKENS = new Set([
    'agir',
    'mahkemesi',
    'bolge',
    'adliye',
    'baskanligi',
    'cumhuriyet',
    'bassavciligi',
    'ozel',
    'dairece',
    'kurulunca',
    'teblignamesi',
    'katilan',
    'magdur',
    'taniklarin',
    'taniklar',
    'sayi',
    'tarih',
    'hapis',
    'yoksunluguna',
]);

const LONG_LEGAL_QUERY_MIN_CHARS = 260;
const LONG_LEGAL_QUERY_MIN_WORDS = 35;

const LEGAL_SEARCH_TEXT_PHRASE_ANCHORS = [
    'cocugun cinsel istismari',
    'cinsel istismar',
    'kisiyi hurriyetinden yoksun kilma',
    'itirazin iptali',
    'zaman asimi',
    'icra takibi',
    'borca itiraz',
    'menfi tespit',
    'konkordato',
    'iflasin ertelenmesi',
    'tasarrufun iptali',
    'kacak elektrik',
    'tespit tutanagi',
    'muhur fekki',
    'idari islemin iptali',
    'tam yargi davasi',
    'yurutmenin durdurulmasi',
    'kamulastirma bedeli',
    'idari para cezasi',
    'imar kanunu',
    'imar barisi',
    'yapi kayit belgesi',
    'ruhsatsiz yapi',
    'yapi tatil tutanagi',
    'sit alani',
    'gecici 16',
    'encumen karari',
    'muhurleme karari',
    'yikim karari',
    'imar mevzuatina aykirilik',
    'kasten oldurme',
    'uyusturucu madde',
    'haksiz tahrik',
    'gorevi kotuye kullanma',
    'ise iade',
    'fazla mesai alacagi',
    'kidem tazminati',
    'ihbar tazminati',
    'is akdi feshi',
    'iscilik alacagi',
    'kamu davasi',
    'uyusturucu madde satisi',
    'kullanmak icin bulundurma',
    'satis bedeli',
    'hassas terazi',
    'ticaret kasti',
    'somut delil',
    'paketlenmis satis materyali',
    'bilirkisi raporu',
    'kullanici tanik',
    'materyal mukayese',
    'kriminal rapor',
    'fiziki takip',
    'arama karari',
    'tutuklama',
    'tahliye',
];

const LEGAL_SEARCH_COMPACT_TARGET_PARTS = 6;
const LEGAL_SEARCH_COMPACT_MIN_PARTS = 4;
const LEGAL_SEARCH_SIGNAL_TOKEN_SUFFIXES = [
    'davasi',
    'takibi',
    'itirazi',
    'iptali',
    'tespit',
    'tespiti',
    'tazminati',
    'alacagi',
    'feshi',
    'hakki',
    'ihlali',
    'cezasi',
    'bedeli',
    'terazi',
    'delil',
    'delili',
    'kasti',
    'ticareti',
    'bulundurma',
    'raporu',
    'karari',
];

const isLegalSearchSignalToken = (token: string): boolean =>
    token.length >= 4
    || LEGAL_SEARCH_SHORT_TOKENS.has(token)
    || LEGAL_SEARCH_NUMERIC_SIGNAL_TOKEN_PATTERN.test(token);

const normalizeForLegalSearchCompaction = (value: string): string => {
    let normalized = normalizeKeywordToken(value);
    for (const pattern of LEGAL_SEARCH_PROCEDURAL_NOISE_PATTERNS) {
        normalized = normalized.replace(pattern, ' ');
    }

    return normalized
        .split(/\s+/)
        .filter((token) => token && !LEGAL_SEARCH_PROCEDURAL_NOISE_TOKENS.has(token))
        .join(' ')
        .trim();
};

const buildCompactCandidateScore = (value: string, anchorSet: Set<string>): number => {
    const normalized = normalizeKeywordToken(value);
    if (!normalized) return 0;

    const tokens = normalized.split(' ').filter(Boolean);
    let score = anchorSet.has(normalized) ? 100 : 0;
    score += tokens.length * 12;

    for (const token of tokens) {
        if (LEGAL_SEARCH_SIGNAL_TOKEN_SUFFIXES.some((suffix) => token.endsWith(suffix))) {
            score += 8;
        }
        if (token.length >= 8) {
            score += 2;
        }
    }

    return score;
};

const buildCompactPhraseCandidates = (tokens: string[], anchorSet: Set<string>) => {
    const candidates: Array<{ value: string; score: number }> = [];
    const seen = new Set<string>();

    for (const size of [3, 2]) {
        for (let index = 0; index <= tokens.length - size; index += 1) {
            const chunk = tokens.slice(index, index + size);
            if (chunk.some((token) => !isLegalSearchSignalToken(token))) continue;

            const value = chunk.join(' ').trim();
            if (!value || seen.has(value)) continue;

            const score = buildCompactCandidateScore(value, anchorSet);
            if (score <= 0) continue;

            seen.add(value);
            candidates.push({ value, score });
        }
    }

    return candidates.sort((left, right) => right.score - left.score);
};

export const compactLegalSearchQuery = (
    rawText: string,
    options?: { preserveKeywords?: string[]; maxLength?: number }
): string => {
    const trimmed = String(rawText || '').trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (trimmed.length <= 220 && wordCount <= 30) return trimmed;

    const normalized = normalizeForLegalSearchCompaction(trimmed) || normalizeKeywordToken(trimmed);
    const anchorSet = new Set(LEGAL_SEARCH_TEXT_PHRASE_ANCHORS.map((value) => normalizeKeywordToken(value)));
    const matchedPhrases: string[] = [];
    const seenPhrases = new Set<string>();
    const addPhrase = (value: string, force = false) => {
        const normalizedValue = normalizeKeywordToken(value);
        if (!normalizedValue || seenPhrases.has(normalizedValue)) return;
        if (!force && !normalized.includes(normalizedValue)) return;
        seenPhrases.add(normalizedValue);
        matchedPhrases.push(normalizedValue);
    };

    const preserveKeywordList = Array.isArray(options?.preserveKeywords)
        ? options.preserveKeywords
        : [];
    const preservedKeywords = preserveKeywordList
        .map((value) => normalizeKeywordToken(value))
        .filter((value) => value.length >= 3)
        .slice(0, 8);

    for (const keyword of preservedKeywords) {
        addPhrase(keyword, true);
    }

    for (const phrase of LEGAL_SEARCH_TEXT_PHRASE_ANCHORS) {
        if (matchedPhrases.length >= LEGAL_SEARCH_COMPACT_TARGET_PARTS) break;
        if (normalized.includes(phrase)) {
            addPhrase(phrase, true);
        }
    }

    const tokens = normalized
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => isLegalSearchSignalToken(token) && !LEGAL_SEARCH_TEXT_STOPWORDS.has(token));

    const phraseCandidates = buildCompactPhraseCandidates(tokens, anchorSet);
    const rankedCandidates: Array<{ value: string; score: number }> = matchedPhrases.map((phrase, index) => ({
        value: phrase,
        score: buildCompactCandidateScore(phrase, anchorSet) + (matchedPhrases.length - index),
    }));

    for (const candidate of phraseCandidates) {
        rankedCandidates.push(candidate);
    }

    const selectedParts: string[] = [];
    const seen = new Set<string>();
    const usedTokens = new Set<string>();

    const trySelectPart = (value: string) => {
        const normalizedValue = normalizeKeywordToken(value);
        if (!normalizedValue || seen.has(normalizedValue)) return;

        const partTokens = normalizedValue.split(' ').filter(Boolean);
        const freshTokenCount = partTokens.filter((token) => !usedTokens.has(token)).length;
        if (selectedParts.length >= 2 && freshTokenCount === 0) return;

        seen.add(normalizedValue);
        selectedParts.push(normalizedValue);
        for (const token of partTokens) {
            usedTokens.add(token);
        }
    };

    for (const candidate of rankedCandidates.sort((left, right) => right.score - left.score)) {
        trySelectPart(candidate.value);
        if (selectedParts.length >= LEGAL_SEARCH_COMPACT_TARGET_PARTS) break;
    }

    const fallbackTokens: string[] = [];
    for (const token of tokens) {
        if (!usedTokens.has(token) && !seen.has(token) && fallbackTokens.length < 8) {
            fallbackTokens.push(token);
        }
    }

    while (
        selectedParts.length < LEGAL_SEARCH_COMPACT_MIN_PARTS &&
        fallbackTokens.length > 0 &&
        selectedParts.length < LEGAL_SEARCH_COMPACT_TARGET_PARTS
    ) {
        const nextToken = fallbackTokens.shift();
        if (nextToken) {
            selectedParts.push(nextToken);
        }
    }

    const parts = selectedParts.slice(0, LEGAL_SEARCH_COMPACT_TARGET_PARTS);
    let result = parts.join(' ').trim();
    const maxLength = Math.max(60, Math.min(180, Number(options?.maxLength) || 120));
    if (result.length > maxLength) {
        result = result.slice(0, maxLength).trim();
    }

    return result || trimmed.slice(0, 120);
};

const shouldUseAiLegalSearchPlan = (rawQuery: string, keyword: string): boolean => {
    const raw = String(rawQuery || '').trim();
    if (!raw) return false;

    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    if (raw.length < LONG_LEGAL_QUERY_MIN_CHARS && wordCount < LONG_LEGAL_QUERY_MIN_WORDS) {
        return false;
    }

    const compacted = String(keyword || '').trim();
    return !compacted || raw.length - compacted.length > 40 || wordCount >= LONG_LEGAL_QUERY_MIN_WORDS;
};

const isAbortLikeError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const anyError = error as { name?: string; message?: string };
    const name = String(anyError.name || '').toLowerCase();
    const message = String(anyError.message || '').toLowerCase();
    return name === 'aborterror' || message.includes('aborted') || message.includes('abort');
};

const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (isAbortLikeError(error)) {
            throw new Error(`REQUEST_TIMEOUT:${timeoutMs}`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const getAuthHeaderValue = async (): Promise<string | null> => {
    try {
        const supabaseModule = await import('../../lib/supabase');
        const sessionResult = await supabaseModule.supabase.auth.getSession();
        const token = sessionResult?.data?.session?.access_token;
        if (typeof token === 'string' && token.trim().length > 0) {
            return `Bearer ${token}`;
        }
    } catch {
        // Supabase client may be unavailable in test/runtime edge cases.
    }
    return null;
};

const buildJsonHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = await getAuthHeaderValue();
    if (authHeader) headers.Authorization = authHeader;
    return headers;
};

const extractResultsFromText = (text: string): any[] => {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Text can contain prose around JSON payload.
    }

    const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonArrayMatch) return [];

    try {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const normalizeLegalSearchResults = (payload: any): NormalizedLegalDecision[] => {
    const raw: any[] = [];
    const payloadSource = normalizeLegalSource(payload?.source);

    if (Array.isArray(payload)) raw.push(...payload);
    if (Array.isArray(payload?.results)) raw.push(...payload.results);
    if (Array.isArray(payload?.results?.content)) raw.push(...payload.results.content);
    if (Array.isArray(payload?.content)) raw.push(...payload.content);
    if (Array.isArray(payload?.result?.content)) raw.push(...payload.result.content);

    if (typeof payload?.results === 'string') raw.push(...extractResultsFromText(payload.results));
    if (typeof payload?.text === 'string') raw.push(...extractResultsFromText(payload.text));

    const contentArrays = [
        payload?.results?.content,
        payload?.content,
        payload?.result?.content,
    ].filter(Array.isArray);
    for (const contentArray of contentArrays) {
        for (const item of contentArray as any[]) {
            if (typeof item?.text === 'string') {
                raw.push(...extractResultsFromText(item.text));
            }
        }
    }

    const mapped = raw
        .map((result: any, index: number): NormalizedLegalDecision | null => {
            if (!result || typeof result !== 'object') return null;

            const hasCoreFields = [
                result.title,
                result.mahkeme,
                result.court,
                result.daire,
                result.chamber,
                result.esasNo,
                result.esas_no,
                result.kararNo,
                result.karar_no,
                result.ozet,
                result.snippet,
                result.summary,
            ].some((value) => typeof value === 'string' && value.trim().length > 0);

            if (!hasCoreFields) return null;

            const mahkeme = result.mahkeme || result.court || '';
            const daire = result.daire || result.chamber || '';
            const title = (
                result.title ||
                `${mahkeme || 'Yargitay'} ${daire}`.trim() ||
                `Karar ${index + 1}`
            ).trim();
            const relevanceScore = Number(result.relevanceScore);
            const similarityScore = Number(result.similarityScore);
            const ozet = (result.ozet || result.snippet || result.summary || '').toString();

            return {
                id: result.id || result.documentId || `legal-${index + 1}`,
                documentId: result.documentId || result.id || undefined,
                documentUrl: result.documentUrl || result.sourceUrl || result.url || undefined,
                sourceUrl: result.sourceUrl || result.documentUrl || result.url || undefined,
                title,
                esasNo: result.esasNo || result.esas_no || '',
                kararNo: result.kararNo || result.karar_no || '',
                tarih: result.tarih || result.date || '',
                daire,
                ozet,
                source: normalizeLegalSource(result.source) || payloadSource || undefined,
                snippet: result.snippet || ozet,
                matchTier: result.matchTier,
                matchReason: result.matchReason,
                matchHighlights: Array.isArray(result.matchHighlights)
                    ? result.matchHighlights.filter((item: unknown) => typeof item === 'string')
                    : undefined,
                relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : undefined,
                similarityScore: Number.isFinite(similarityScore) ? similarityScore : undefined,
                semanticQuery: result.semanticQuery || payload?.semanticQuery || undefined,
                initialKeyword: result.initialKeyword || payload?.initialKeyword || undefined,
                matchedKeywordCount: Number.isFinite(Number(result.matchedKeywordCount)) ? Number(result.matchedKeywordCount) : undefined,
                matchedKeywords: Array.isArray(result.matchedKeywords) ? result.matchedKeywords.filter((item: unknown) => typeof item === 'string') : undefined,
                matchStage: result.matchStage === 'summary' || result.matchStage === 'full_text' ? result.matchStage : undefined,
                requiredKeywordCount: Number.isFinite(Number(result.requiredKeywordCount)) ? Number(result.requiredKeywordCount) : undefined,
                semanticScore: Number.isFinite(Number(result.semanticScore)) ? Number(result.semanticScore) : undefined,
                summaryKeywordHits: Number.isFinite(Number(result.summaryKeywordHits)) ? Number(result.summaryKeywordHits) : undefined,
                fullTextKeywordHits: Number.isFinite(Number(result.fullTextKeywordHits)) ? Number(result.fullTextKeywordHits) : undefined,
                selectionReason: typeof result.selectionReason === 'string' ? result.selectionReason : undefined,
                sourceUsed: typeof result.sourceUsed === 'string' ? result.sourceUsed : undefined,
                retrievalStage: result.retrievalStage === 'summary' || result.retrievalStage === 'full_text' ? result.retrievalStage : undefined,
                combinedScore: Number.isFinite(Number(result.combinedScore)) ? Number(result.combinedScore) : undefined,
                matchedRequiredConcepts: Array.isArray(result.matchedRequiredConcepts) ? result.matchedRequiredConcepts.filter((item: unknown) => typeof item === 'string') : undefined,
                missingRequiredConcepts: Array.isArray(result.missingRequiredConcepts) ? result.missingRequiredConcepts.filter((item: unknown) => typeof item === 'string') : undefined,
                matchedSupportConcepts: Array.isArray(result.matchedSupportConcepts) ? result.matchedSupportConcepts.filter((item: unknown) => typeof item === 'string') : undefined,
                matchedEvidenceConcepts: Array.isArray(result.matchedEvidenceConcepts) ? result.matchedEvidenceConcepts.filter((item: unknown) => typeof item === 'string') : undefined,
                matchedNegativeConcepts: Array.isArray(result.matchedNegativeConcepts) ? result.matchedNegativeConcepts.filter((item: unknown) => typeof item === 'string') : undefined,
                domainConfidence: Number.isFinite(Number(result.domainConfidence)) ? Number(result.domainConfidence) : undefined,
                rejectionReason: typeof result.rejectionReason === 'string' ? result.rejectionReason : undefined,
            };
        })
        .filter((result): result is NormalizedLegalDecision =>
            Boolean(result && (result.title || result.ozet))
        );

    const seen = new Set<string>();
    return mapped.filter((result) => {
        const key = getLegalResultIdentityKey(result);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const LEGAL_SEARCH_ZERO_RESULT_MESSAGES: Record<string, string> = {
    no_candidates: 'Kaynaklarda sorguya uygun aday karar bulunamadi.',
    summary_gate: 'Adaylar bulundu ama ilk ozet elemesini gecemedi.',
    strict_gate: 'Adaylar bulundu ama son dogrulama elemesini gecemedi.',
    semantic_fallback_empty: 'Ana arama bos kaldi, yedek anlamsal arama da aday getirmedi.',
    fallback_gate: 'Yedek anlamsal arama aday buldu ama son elemeden sonuc cikmadi.',
    skill_no_match: 'Alan skill dogru alani aradi ama uygun karar bulamadi.',
};

export const getLegalSearchZeroResultMessage = (reason?: string | null): string | null => {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason) return null;

    return (
        LEGAL_SEARCH_ZERO_RESULT_MESSAGES[normalizedReason] ||
        'Sonuc listesi olusmadi; farkli bir hukuki ifade ile tekrar deneyin.'
    );
};

export const extractLegalSearchDiagnostics = (
    payload: any,
    normalizedResults: NormalizedLegalDecision[] = normalizeLegalSearchResults(payload)
): LegalSearchResponseDiagnostics => {
    const planDiagnostics =
        payload?.planDiagnostics && typeof payload.planDiagnostics === 'object'
            ? (payload.planDiagnostics as PlanDiagnostics)
            : undefined;
    const retrievalDiagnostics =
        payload?.retrievalDiagnostics && typeof payload.retrievalDiagnostics === 'object'
            ? (payload.retrievalDiagnostics as RetrievalDiagnostics)
            : (payload?.diagnostics && typeof payload.diagnostics === 'object'
                ? (payload.diagnostics as RetrievalDiagnostics)
                : undefined);
    const skillDiagnostics =
        payload?.skillDiagnostics && typeof payload.skillDiagnostics === 'object'
            ? payload.skillDiagnostics as Record<string, any>
            : undefined;
    const rawZeroResultReason =
        typeof retrievalDiagnostics?.zeroResultReason === 'string'
            ? retrievalDiagnostics.zeroResultReason
            : (typeof skillDiagnostics?.zeroResultReason === 'string' ? skillDiagnostics.zeroResultReason : null);
    const zeroResultReason = normalizedResults.length === 0 ? rawZeroResultReason : null;
    const skillZeroResultMessage =
        normalizedResults.length === 0 && typeof skillDiagnostics?.zeroResultMessage === 'string'
            ? skillDiagnostics.zeroResultMessage
            : null;
    const retrievalZeroResultMessage =
        normalizedResults.length === 0 && typeof retrievalDiagnostics?.zeroResultMessage === 'string'
            ? retrievalDiagnostics.zeroResultMessage
            : null;

    return {
        planDiagnostics,
        retrievalDiagnostics,
        skillDiagnostics,
        zeroResultReason,
        zeroResultMessage:
            skillZeroResultMessage
            || retrievalZeroResultMessage
            || getLegalSearchZeroResultMessage(zeroResultReason),
    };
};

export const buildDetailedLegalSearchResult = ({
    endpoint,
    request,
    response,
    durationMs,
}: Pick<LegalSearchDetailedResult, 'endpoint' | 'request' | 'response' | 'durationMs'>): LegalSearchDetailedResult => {
    const normalizedResults = normalizeLegalSearchResults(response);
    
    let evaluationGroups;
    if (response?.evaluationGroups) {
        evaluationGroups = {
            davaci_lehine: response.evaluationGroups.davaci_lehine ? normalizeLegalSearchResults({ results: response.evaluationGroups.davaci_lehine }) : [],
            davali_lehine: response.evaluationGroups.davali_lehine ? normalizeLegalSearchResults({ results: response.evaluationGroups.davali_lehine }) : [],
            notr: response.evaluationGroups.notr ? normalizeLegalSearchResults({ results: response.evaluationGroups.notr }) : [],
        };
    }

    return {
        endpoint,
        request,
        response,
        durationMs,
        normalizedResults,
        evaluationGroups,
        diagnostics: extractLegalSearchDiagnostics(response, normalizedResults),
    };
};

const prepareLegalSearchRequest = async ({
    source,
    keyword,
    rawQuery,
    legalSearchPacket,
    filters = {},
    searchMode = 'auto',
}: SearchLegalDecisionsParams): Promise<PreparedLegalSearchRequest> => {
    const normalizedPacket = normalizeLegalSearchPacket(legalSearchPacket);
    const packetRawQuery = buildRawQueryFromLegalSearchPacket(normalizedPacket);
    const packetKeyword = buildKeywordFromLegalSearchPacket(normalizedPacket);
    const effectiveRawQuery = rawQuery || packetRawQuery || keyword;
    return {
        effectiveRawQuery,
        effectiveSource: source,
        effectiveKeyword: keyword || packetKeyword,
        effectiveLegalSearchPacket: normalizedPacket,
        effectiveFilters: { ...(filters || {}) },
        effectiveSearchMode: shouldUseProLegalSearchMode({
            keyword: keyword || packetKeyword,
            rawQuery: effectiveRawQuery,
            searchMode,
        })
            ? 'pro'
            : undefined,
    };
};

const createLegalSearchPayload = ({
    source,
    keyword,
    rawQuery,
    legalSearchPacket,
    filters = {},
    searchMode,
}: {
    source: string;
    keyword: string;
    rawQuery: string;
    legalSearchPacket?: LegalSearchPacket;
    filters?: Record<string, any>;
    searchMode?: 'pro';
}): Record<string, any> => {
    const payload: Record<string, any> = {
        source,
        keyword,
        filters,
        rawQuery,
    };

    if (legalSearchPacket) {
        payload.legalSearchPacket = legalSearchPacket;
    }
    if (searchMode) {
        payload.searchMode = searchMode;
    }

    return payload;
};

const buildLegalSearchRequestCacheKey = (
    payload: Record<string, any>,
    apiBaseUrl = ''
): string =>
    JSON.stringify({
        apiBaseUrl: String(apiBaseUrl || ''),
        payload,
    });

const performLegalSearchRequest = async ({
    payload,
    apiBaseUrl = '',
}: {
    payload: Record<string, any>;
    apiBaseUrl?: string;
}): Promise<RawLegalSearchRequestResult> => {
    const body = JSON.stringify(payload);
    const headers = await buildJsonHeaders();
    const endpoint = `${apiBaseUrl}/api/legal/search-decisions`;
    const retries = [endpoint, `${endpoint}?retry=1`, `${endpoint}?retry=2`];

    let lastErrorText = '';
    let lastStatus = 0;
    let timedOut = false;

    for (const url of retries) {
        try {
            const startedAt = performance.now();
            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers,
                body,
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    endpoint: url,
                    request: payload,
                    response: data,
                    durationMs: Math.round(performance.now() - startedAt),
                };
            }

            lastStatus = response.status;
            lastErrorText = await response.text().catch(() => '');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            lastErrorText = message || lastErrorText;

            if (message.startsWith('REQUEST_TIMEOUT:')) {
                timedOut = true;
                break;
            }
        }
    }

    if (timedOut) {
        throw new Error(LEGAL_SEARCH_TIMEOUT_MESSAGE);
    }

    let cleanError = lastErrorText;
    try {
        const parsed = JSON.parse(lastErrorText);
        if (parsed?.error) {
            cleanError = parsed.error;
            if (parsed.details?.[0]?.message) {
                cleanError += ': ' + parsed.details[0].message;
            }
        }
    } catch {
        if (lastErrorText.includes('<html') || lastErrorText.includes('<!DOCTYPE')) {
            cleanError = `Ictihat arama servisi yanit vermedi (HTTP ${lastStatus || 500}).`;
        }
    }

    throw new Error(
        cleanError || `Ictihat aramasi sirasinda bir hata olustu (HTTP ${lastStatus || 500}).`
    );
};

const requestLegalSearchJson = async ({
    payload,
    apiBaseUrl = '',
}: {
    payload: Record<string, any>;
    apiBaseUrl?: string;
}): Promise<RawLegalSearchRequestResult> => {
    const cacheKey = buildLegalSearchRequestCacheKey(payload, apiBaseUrl);
    const activeRequest = inFlightLegalSearchRequests.get(cacheKey);
    if (activeRequest) {
        return activeRequest;
    }

    const requestPromise = performLegalSearchRequest({ payload, apiBaseUrl }).finally(() => {
        inFlightLegalSearchRequests.delete(cacheKey);
    });
    inFlightLegalSearchRequests.set(cacheKey, requestPromise);
    return requestPromise;
};

export const searchLegalDecisionsDetailed = async ({
    source,
    keyword,
    rawQuery,
    legalSearchPacket,
    filters = {},
    searchMode = 'auto',
    apiBaseUrl = '',
}: SearchLegalDecisionsParams): Promise<LegalSearchDetailedResult> => {
    const {
        effectiveRawQuery,
        effectiveSource,
        effectiveKeyword,
        effectiveLegalSearchPacket,
        effectiveFilters,
        effectiveSearchMode,
    } =
        await prepareLegalSearchRequest({
            source,
            keyword,
            rawQuery,
            legalSearchPacket,
            filters,
            searchMode,
            apiBaseUrl,
        });

    const payload = createLegalSearchPayload({
        source: effectiveSource,
        keyword: effectiveKeyword,
        rawQuery: effectiveRawQuery,
        legalSearchPacket: effectiveLegalSearchPacket,
        filters: effectiveFilters,
        searchMode: effectiveSearchMode,
    });
    const responsePayload = await requestLegalSearchJson({ payload, apiBaseUrl });

    return buildDetailedLegalSearchResult(responsePayload);
};

export const searchLegalDecisions = async (
    params: SearchLegalDecisionsParams
): Promise<NormalizedLegalDecision[]> => {
    const detailed = await searchLegalDecisionsDetailed(params);
    return detailed.normalizedResults;
};

export const getLegalDocument = async ({
    source,
    documentId,
    documentUrl,
    title,
    esasNo,
    kararNo,
    tarih,
    daire,
    ozet,
    snippet,
    apiBaseUrl = '',
}: GetLegalDocumentParams): Promise<string> => {
    if (!documentId && !documentUrl) {
        throw new Error('Belge kimligi bulunamadi.');
    }

    const payload = {
        source,
        documentId,
        documentUrl,
        title,
        esasNo,
        kararNo,
        tarih,
        daire,
        ozet,
        snippet,
    };
    const body = JSON.stringify(payload);
    const headers = await buildJsonHeaders();
    const endpoint = `${apiBaseUrl}/api/legal/get-document`;
    const retries = [
        endpoint,
        `${endpoint}?retry=1`,
        `${apiBaseUrl}/api/legal?action=get-document`,
    ];

    let response: Response | null = null;
    let lastErrorText = '';
    let lastStatus = 0;
    let timedOut = false;

    for (const url of retries) {
        try {
            response = await fetchWithTimeout(url, {
                method: 'POST',
                headers,
                body,
            });

            if (response.ok) break;

            lastStatus = response.status;
            lastErrorText = await response.text().catch(() => '');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (message.startsWith('REQUEST_TIMEOUT:')) {
                timedOut = true;
            }
            lastErrorText = message || lastErrorText;
        }
    }

    if (!response || !response.ok) {
        if (timedOut) {
            throw new Error(LEGAL_DOCUMENT_TIMEOUT_MESSAGE);
        }
        throw new Error(lastErrorText || `Belge alinamadi (HTTP ${lastStatus || 500}).`);
    }

    const data = await response.json();
    if (!data?.document) return '';

    if (typeof data.document === 'string') {
        return data.document;
    }

    const directContentCandidates = [
        data.document.content,
        data.document.markdown_content,
        data.document.markdown,
        data.document.text,
        data.document.documentContent,
        data.document.fullText,
    ];

    for (const candidate of directContentCandidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate;
        }
    }

    return JSON.stringify(data.document, null, 2);
};

export const searchLegalDecisionsDebug = async ({
    source,
    keyword,
    rawQuery,
    filters = {},
    searchMode = 'auto',
    apiBaseUrl = '',
}: SearchLegalDecisionsParams): Promise<LegalSearchDebugResult> => {
    const {
        effectiveRawQuery,
        effectiveSource,
        effectiveKeyword,
        effectiveFilters,
        effectiveSearchMode,
    } =
        await prepareLegalSearchRequest({
            source,
            keyword,
            rawQuery,
            filters,
            searchMode,
            apiBaseUrl,
        });

    const payload = createLegalSearchPayload({
        source: effectiveSource,
        keyword: effectiveKeyword,
        rawQuery: effectiveRawQuery,
        filters: effectiveFilters,
        searchMode: effectiveSearchMode,
    });
    const responsePayload = await requestLegalSearchJson({ payload, apiBaseUrl });

    return {
        ...responsePayload,
        normalizedResults: normalizeLegalSearchResults(responsePayload.response),
    };
};

export const getLegalDocumentDebug = async ({
    source,
    documentId,
    documentUrl,
    title,
    esasNo,
    kararNo,
    tarih,
    daire,
    ozet,
    snippet,
    apiBaseUrl = '',
}: GetLegalDocumentParams): Promise<LegalDocumentDebugResult> => {
    if (!documentId && !documentUrl) {
        throw new Error('Belge kimligi bulunamadi.');
    }

    const payload: Record<string, any> = {
        source,
        documentId,
        documentUrl,
        title,
        esasNo,
        kararNo,
        tarih,
        daire,
        ozet,
        snippet,
    };
    const body = JSON.stringify(payload);
    const headers = await buildJsonHeaders();
    const endpoint = `${apiBaseUrl}/api/legal/get-document`;
    const retries = [endpoint, `${endpoint}?retry=1`, `${apiBaseUrl}/api/legal?action=get-document`];

    let response: Response | null = null;
    let lastErrorText = '';
    let lastStatus = 0;
    let timedOut = false;

    for (const url of retries) {
        try {
            const startedAt = performance.now();
            response = await fetchWithTimeout(url, {
                method: 'POST',
                headers,
                body,
            });

            if (response.ok) {
                const data = await response.json();
                let documentText = '';

                if (typeof data?.document === 'string') {
                    documentText = data.document;
                } else if (data?.document) {
                    const directContentCandidates = [
                        data.document.content,
                        data.document.markdown_content,
                        data.document.markdown,
                        data.document.text,
                        data.document.documentContent,
                        data.document.fullText,
                    ];

                    for (const candidate of directContentCandidates) {
                        if (typeof candidate === 'string' && candidate.trim().length > 0) {
                            documentText = candidate;
                            break;
                        }
                    }

                    if (!documentText) {
                        documentText = JSON.stringify(data.document, null, 2);
                    }
                }

                return {
                    endpoint: url,
                    request: payload,
                    response: data,
                    documentText,
                    durationMs: Math.round(performance.now() - startedAt),
                };
            }

            lastStatus = response.status;
            lastErrorText = await response.text().catch(() => '');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (message.startsWith('REQUEST_TIMEOUT:')) {
                timedOut = true;
            }
            lastErrorText = message || lastErrorText;
        }
    }

    if (!response || !response.ok) {
        if (timedOut) {
            throw new Error(LEGAL_DOCUMENT_TIMEOUT_MESSAGE);
        }
        throw new Error(lastErrorText || `Belge alinamadi (HTTP ${lastStatus || 500}).`);
    }

    throw new Error(lastErrorText || 'Belge alinamadi.');
};









