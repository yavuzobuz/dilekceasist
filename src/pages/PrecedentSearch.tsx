import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search,
    Info,
    CheckCircle,
    Scale,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
    AlertCircle,
    Copy,
    Check,
    Sparkles,
    BrainCircuit,
} from 'lucide-react';
import { Header } from '../../components/Header';
import { analyzeDocuments, generateSearchKeywords } from '../../services/geminiService';
import { UserRole, type DetailedAnalysis, type LegalSearchPacket } from '../../types';
import {
    buildLegalSearchInputs,
    getLegalDocument,
    searchLegalDecisionsDetailed,
    type NormalizedLegalDecision,
    type LegalSearchDetailedResult,
} from '../utils/legalSearch';

const SEARCH_AREAS = [
    { id: 'auto', label: 'Otomatik' },
    { id: 'ceza', label: 'Ceza' },
    { id: 'hukuk', label: 'Hukuk' },
    { id: 'danistay', label: 'Danistay' },
    { id: 'bam', label: 'BAM / Istinaf' },
];

const SYNTHETIC_RESULT_ID_REGEX = /^(search-|legal-|ai-summary|sem-|template-decision-)/i;
const DOCUMENT_PREVIEW_RESULT_LIMIT = 20;
const MIN_PREVIEW_FETCH_CHARS = 40;
const HIGHLIGHT_QUERY_STOPWORDS = new Set([
    've',
    'veya',
    'ile',
    'icin',
    'için',
    'ama',
    'fakat',
    'gibi',
    'olan',
    'olarak',
    'bir',
    'bu',
    'su',
    'şu',
    'o',
    'da',
    'de',
    'ki',
    'mi',
    'mu',
    'mu?',
    'mi?',
    'midir',
    'nedir',
    'vekil',
    'muvekkil',
    'müvekkil',
    'karar',
    'karari',
    'kararı',
    'kararlar',
    'mahkeme',
    'mahkemesi',
    'savcilik',
    'savcılık',
    'savciligin',
    'savcılığın',
    'savci',
    'savcı',
    'iddianame',
    'iddianamedeki',
    'tehlike',
    'nokta',
    'noktalar',
    'plan',
    'kritik',
    'durum',
    'olay',
    'dosya',
    'maddeler',
    'maddeyi',
    'maddenin',
    'bunlari',
    'bunları',
    'curutme',
    'çürütme',
    'savunmamiz',
    'savunmamız',
]);

const HIGHLIGHT_DOMAIN_TOKENS = new Set([
    'uyusturucu',
    'uyuşturucu',
    'coklu',
    'çoklu',
    'madde',
    'kullanma',
    'kullanim',
    'kullanım',
    'polidrug',
    'materyal',
    'mukayese',
    'raporu',
    'rapor',
    'ticaret',
    'satici',
    'satıcı',
    'delil',
    'ceşitliligi',
    'çeşitliliği',
    'kannabinoid',
    'kokain',
    'hap',
    'promosyon',
    'kagit',
    'kağıt',
    'bagimli',
    'bağımlı',
    'kullanicisi',
    'kullanıcısı',
]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeConceptText = (value: string) =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^a-z0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeKeywordText = (value: string): string => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const KEYWORD_STOPWORDS = new Set([
    've', 'veya', 'ile', 'olan', 'oldugu', 'iddia', 'edilen', 'uzerine', 'kapsaminda',
    'gibi', 'icin', 'uzere', 'bu', 'su', 'o', 'bir', 'de', 'da', 'mi', 'mu',
]);

const KEYWORD_DRAFTING_TERMS = new Set([
    'dilekce', 'savunma', 'belge', 'sozlesme', 'taslak', 'yaz', 'yazalim', 'hazirla', 'olustur', 'uret',
    'detayli', 'olmasi', 'olmali', 'koruyacak', 'haklarini', 'muvekkil', 'muvekkilin', 'vekil', 'vekili',
    'bana', 'lutfen', 'yardim', 'hazir', 'yapalim',
]);

const FACT_SIGNAL_REGEX = /\b(tck|cmk|hmk|tmk|anayasa|madde|maddesi|esas|karar|uyusturucu|hirsizlik|dolandiricilik|tehdit|yaralama|oldurme|gozalti|tutuk|delil|kamera|tanik|rapor|bilirkisi|ele gecir|kullanim siniri|ticaret|satici|isveren|kidem|ihbar|fesih|veraset|tapu|imar|ruhsat)\b/i;
const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const PERSON_NAME_REGEX = /^[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][a-z\u00E7\u011F\u0131\u00F6\u015F\u00FC]+(?:\s+[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][a-z\u00E7\u011F\u0131\u00F6\u015F\u00FC]+){1,2}$/;
const ADDRESS_HINT_REGEX = /\b(mahallesi|mah|sokak|sok|cadde|cad|bulvar|bulvari|apartman|apt|bina|daire|blok|kapi|no)\b/i;
const BARE_MADDE_REGEX = /^\d{1,3}\.?\s*maddesi?$/i;
const LAW_REFERENCE_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|vuk|kmk|anayasa|imar kanunu|is kanunu)\b/i;

const hasFactSignal = (rawValue: string): boolean => {
    const normalized = normalizeKeywordText(rawValue);
    if (!normalized) return false;
    return FACT_SIGNAL_REGEX.test(normalized);
};

const normalizeAmbiguousMaddeKeyword = (value: string, sourceText: string): string => {
    const cleaned = String(value || '').replace(/[â€œâ€"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';

    const maddeMatch = cleaned.match(/^(\d{1,3})\.?\s*maddesi?$/i);
    if (!maddeMatch) return cleaned;

    const maddeNo = maddeMatch[1];
    const normalizedSource = normalizeKeywordText(sourceText);
    if ((maddeNo === '32' || maddeNo === '42') && /(imar|ruhsat|ruhsatsiz|yapi|yikim|imar barisi)/i.test(normalizedSource)) {
        return `3194 sayili Imar Kanunu ${maddeNo}. madde`;
    }

    return '';
};

const isNoisyKeywordCandidate = (value: string): boolean => {
    const cleaned = String(value || '').replace(/[â€œâ€"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return true;

    if (DATE_ONLY_REGEX.test(cleaned)) return true;
    if (DIGITS_ONLY_REGEX.test(cleaned)) return true;
    if (ADDRESS_HINT_REGEX.test(cleaned)) return true;
    if (PERSON_NAME_REGEX.test(cleaned)) return true;
    if (BARE_MADDE_REGEX.test(cleaned) && !LAW_REFERENCE_REGEX.test(cleaned)) return true;

    return false;
};

const extractKeywordCandidates = (rawValue: string): string[] => {
    const text = String(rawValue || '').trim();
    if (!text) return [];

    const normalizedText = normalizeKeywordText(text);
    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (value: string) => {
        const normalizedMadde = normalizeAmbiguousMaddeKeyword(value, text);
        const cleaned = String(normalizedMadde || value || '').replace(/[â€œâ€"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length < 3) return;
        if (isNoisyKeywordCandidate(cleaned)) return;

        const normalizedKey = normalizeKeywordText(cleaned);
        if (!normalizedKey || normalizedKey.length < 3) return;

        const words = normalizedKey.split(/\s+/).filter(Boolean);
        const nonStopWords = words.filter((word) => !KEYWORD_STOPWORDS.has(word));
        if (nonStopWords.length === 0) return;

        if (!hasFactSignal(normalizedKey) && nonStopWords.length < 2) return;

        const hasDraftingTerm = nonStopWords.some((word) => KEYWORD_DRAFTING_TERMS.has(word));
        if (hasDraftingTerm && !hasFactSignal(normalizedKey)) return;

        if (seen.has(normalizedKey)) return;
        seen.add(normalizedKey);
        candidates.push(cleaned);
    };

    const tckMatches = text.match(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-â€“]\s*\d+)?/gi) || [];
    for (const match of tckMatches) {
        addCandidate(match);
    }

    const phraseChunks = text.split(/[,\n;]+/g);
    for (const chunk of phraseChunks) {
        const normalizedChunk = normalizeKeywordText(chunk);
        const chunkWordCount = normalizedChunk ? normalizedChunk.split(/\s+/).filter(Boolean).length : 0;
        if (!hasFactSignal(chunk) && chunkWordCount > 8) continue;
        addCandidate(chunk);
    }

    const tokenFallback = normalizedText
        .split(/[\s,;:.!?()\/\\-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4
            && !KEYWORD_STOPWORDS.has(token)
            && !KEYWORD_DRAFTING_TERMS.has(token)
            && hasFactSignal(token));

    for (const token of tokenFallback) {
        addCandidate(token);
        if (candidates.length >= 12) break;
    }

    return candidates.slice(0, 12);
};

const getPacketKeywordList = (packet: LegalSearchPacket | null | undefined): string[] => {
    if (!packet) return [];

    const ordered = [
        ...(Array.isArray(packet.requiredConcepts) ? packet.requiredConcepts : []),
        ...(Array.isArray(packet.supportConcepts) ? packet.supportConcepts : []),
        ...(Array.isArray(packet.evidenceConcepts) ? packet.evidenceConcepts : []),
    ];

    const seen = new Set<string>();
    const keywords: string[] = [];

    for (const item of ordered) {
        const normalized = String(item || '').replace(/\s+/g, ' ').trim();
        if (!normalized) continue;
        const key = normalizeKeywordText(normalized);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keywords.push(normalized);
        if (keywords.length >= 12) break;
    }

    return keywords;
};

const getInsightList = (values: string[] | undefined, limit = 8): string[] => {
    if (!Array.isArray(values)) return [];

    const seen = new Set<string>();
    const items: string[] = [];

    for (const item of values) {
        const normalized = String(item || '').replace(/\s+/g, ' ').trim();
        if (!normalized) continue;
        const key = normalizeKeywordText(normalized);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push(normalized);
        if (items.length >= limit) break;
    }

    return items;
};

const getWebPlanKeywordList = (
    insights: DetailedAnalysis | null | undefined,
    packet: LegalSearchPacket | null | undefined
): string[] => {
    const ordered = [
        ...getInsightList(insights?.webSearchPlan?.coreQueries, 6),
        ...getInsightList(insights?.webSearchPlan?.supportQueries, 6),
        ...getInsightList(insights?.webSearchPlan?.focusTopics, 6),
        ...getPacketKeywordList(packet),
    ];

    return getInsightList(ordered, 12);
};

const buildAutoLegalSearchText = ({
    packet,
    fallbackSummary = '',
    fallbackKeywords = [],
}: {
    packet?: LegalSearchPacket | null;
    fallbackSummary?: string;
    fallbackKeywords?: string[];
}): string => {
    const directPacketSearchText = String(packet?.searchSeedText || '').trim();
    if (directPacketSearchText) return directPacketSearchText;

    const packetText = [
        packet?.coreIssue,
        packet?.caseType,
        ...(Array.isArray(packet?.requiredConcepts) ? packet.requiredConcepts.slice(0, 4) : []),
        ...(Array.isArray(packet?.supportConcepts) ? packet.supportConcepts.slice(0, 2) : []),
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();

    if (packetText) return packetText;
    if (String(fallbackSummary || '').trim()) return String(fallbackSummary || '').trim();
    return Array.isArray(fallbackKeywords) ? fallbackKeywords.join(' ').trim() : '';
};

const buildAutoWebSearchKeywords = ({
    insights,
    packet,
    fallbackKeywords = [],
}: {
    insights?: DetailedAnalysis | null;
    packet?: LegalSearchPacket | null;
    fallbackKeywords?: string[];
}): string[] => {
    const planKeywords = getWebPlanKeywordList(insights, packet);
    if (planKeywords.length > 0) return planKeywords;
    return getInsightList(fallbackKeywords, 12);
};

const extractSearchConcepts = (query: string) => {
    const raw = String(query || '').trim();
    if (!raw) return [];

    const concepts: string[] = [];
    const seen = new Set<string>();
    const addConcept = (value: string) => {
        const compact = value.replace(/\s+/g, ' ').trim();
        const normalized = normalizeConceptText(compact);
        if (!compact || normalized.length < 4 || seen.has(normalized)) return;
        if (HIGHLIGHT_QUERY_STOPWORDS.has(normalized)) return;
        seen.add(normalized);
        concepts.push(compact);
    };

    for (const match of raw.matchAll(/"([^"]+)"|'([^']+)'/g)) {
        addConcept(match[1] || match[2] || '');
    }

    raw
        .replace(/["']/g, ' ')
        .split(/[\s,;:.!?()[\]{}\\/+-]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => {
            const normalized = normalizeConceptText(token);
            if (!normalized || HIGHLIGHT_QUERY_STOPWORDS.has(normalized)) return;
            if (HIGHLIGHT_DOMAIN_TOKENS.has(normalized) || normalized.length >= 8) {
                addConcept(token);
            }
        });

    const filteredTokens = raw
        .replace(/["']/g, ' ')
        .split(/[\s,;:.!?()[\]{}\\/+-]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => {
            const normalized = normalizeConceptText(token);
            return normalized && !HIGHLIGHT_QUERY_STOPWORDS.has(normalized);
        });

    for (let size = 4; size >= 2; size -= 1) {
        for (let index = 0; index <= filteredTokens.length - size; index += 1) {
            const phraseTokens = filteredTokens.slice(index, index + size);
            const normalizedPhraseTokens = phraseTokens.map((token) => normalizeConceptText(token));
            const phrase = phraseTokens.join(' ');
            const hasDomainSignal = normalizedPhraseTokens.some((token) => HIGHLIGHT_DOMAIN_TOKENS.has(token));
            const joinedLength = normalizeConceptText(phrase).length;
            if (!hasDomainSignal && joinedLength < 14) continue;
            addConcept(phrase);
        }
    }

    return concepts
        .sort((left, right) => right.length - left.length)
        .slice(0, 24);
};

const getPresentConcepts = (text: string, concepts: string[]) => {
    const normalizedText = normalizeConceptText(text);
    const presentConcepts = concepts.filter((concept) =>
        normalizedText.includes(normalizeConceptText(concept))
    );

    return presentConcepts.filter((concept, _, allConcepts) => {
        const normalizedConcept = normalizeConceptText(concept);
        return !allConcepts.some((otherConcept) => {
            const normalizedOtherConcept = normalizeConceptText(otherConcept);
            return (
                normalizedOtherConcept !== normalizedConcept &&
                normalizedOtherConcept.length > normalizedConcept.length &&
                normalizedOtherConcept.includes(normalizedConcept)
            );
        });
    });
};

const turkishCharClass: Record<string, string> = {
    c: '[cç]', ç: '[cç]',
    g: '[gğ]', ğ: '[gğ]',
    i: '[iı]', ı: '[iı]',
    o: '[oö]', ö: '[oö]',
    s: '[sş]', ş: '[sş]',
    u: '[uü]', ü: '[uü]',
};

const conceptToFuzzyPattern = (concept: string) =>
    Array.from(concept)
        .map((ch) => {
            const lower = ch.toLowerCase();
            if (turkishCharClass[lower]) return turkishCharClass[lower];
            return escapeRegExp(ch);
        })
        .join('');

const renderHighlightedText = (
    text: string,
    concepts: string[],
    keyPrefix: string
): React.ReactNode => {
    const safeText = String(text || '');
    if (!safeText || concepts.length === 0) return safeText;

    const pattern = concepts
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
        .map((concept) => conceptToFuzzyPattern(concept))
        .join('|');

    if (!pattern) return safeText;

    const regex = new RegExp(`(${pattern})`, 'giu');
    const segments = safeText.split(regex);

    return segments.map((segment, index) => {
        if (!segment) return null;
        const normalizedSegment = normalizeConceptText(segment);
        const isMatch = concepts.some(
            (concept) => normalizedSegment === normalizeConceptText(concept)
        );

        return isMatch ? (
            <mark
                key={`${keyPrefix}-match-${index}`}
                className="legal-match-highlight"
            >
                {segment}
            </mark>
        ) : (
            <React.Fragment key={`${keyPrefix}-text-${index}`}>{segment}</React.Fragment>
        );
    });
};

const canFetchDocumentPreview = (result: NormalizedLegalDecision) => {
    const documentId = String(result.documentId || result.id || '').trim();
    const documentUrl = String(result.documentUrl || result.sourceUrl || '').trim();
    if (documentUrl) return true;
    return Boolean(documentId) && !SYNTHETIC_RESULT_ID_REGEX.test(documentId);
};

const shouldHydratePreview = (result: NormalizedLegalDecision) => {
    const preview = String(result.snippet || result.ozet || '').replace(/\s+/g, ' ').trim();
    return preview.length < MIN_PREVIEW_FETCH_CHARS;
};

// Component to handle floating copy button for selected text
const SelectableText = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    const [showCopyButton, setShowCopyButton] = useState(false);
    const [buttonPos, setButtonPos] = useState({ top: 0, left: 0 });
    const [isCopied, setIsCopied] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleSelection = () => {
            const selection = window.getSelection();
            if (
                selection &&
                selection.toString().trim().length > 0 &&
                textRef.current &&
                textRef.current.contains(selection.anchorNode)
            ) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Position button above the selection
                setButtonPos({
                    top: rect.top + window.scrollY - 40,
                    left: rect.left + window.scrollX + rect.width / 2 - 50,
                });
                setShowCopyButton(true);
            } else {
                if (!isCopied) {
                    setShowCopyButton(false);
                }
            }
        };

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, [isCopied]);

    const handleCopySelection = async () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            await navigator.clipboard.writeText(selection.toString());
            setIsCopied(true);
            setTimeout(() => {
                setIsCopied(false);
                setShowCopyButton(false);
                window.getSelection()?.removeAllRanges(); // Clear selection after copy
            }, 1500);
        }
    };

    return (
        <>
            <div ref={textRef} className={className}>
                {children}
            </div>
            {showCopyButton && (
                <button
                    onClick={handleCopySelection}
                    style={{ top: `${buttonPos.top}px`, left: `${buttonPos.left}px` }}
                    className="absolute z-50 flex items-center gap-1.5 bg-[#1A1A1D] border border-red-500/30 text-white px-3 py-1.5 rounded-lg shadow-2xl text-xs font-medium cursor-pointer transition-all animate-in fade-in zoom-in-95 hover:bg-[#25252A] hover:border-red-500/50"
                >
                    {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                        <Copy className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span>{isCopied ? 'Kopyalandı' : 'Kopyala'}</span>

                    {/* Tooltip arrow */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-red-500/30"></div>
                </button>
            )}
        </>
    );
};

export default function PrecedentSearch() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchArea, setSearchArea] = useState('auto');
    const [isSearching, setIsSearching] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const [results, setResults] = useState<NormalizedLegalDecision[]>([]);
    const [evaluationGroups, setEvaluationGroups] = useState<LegalSearchDetailedResult['evaluationGroups']>();
    const [activeTab, setActiveTab] = useState<'all' | 'davaci_lehine' | 'davali_lehine' | 'notr'>('all');
    const [error, setError] = useState<string | null>(null);
    const [zeroResultMessage, setZeroResultMessage] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | number | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set());
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const activeSearchRunRef = useRef(0);

    const toggleExpand = (id: string | number) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const hydrateResultPreviews = useCallback(async (searchRunId: number, apiResults: NormalizedLegalDecision[]) => {
        const previewTargets = apiResults
            .map((result, index) => ({ result, index }))
            .filter(({ result }) => canFetchDocumentPreview(result) && shouldHydratePreview(result))
            .slice(0, DOCUMENT_PREVIEW_RESULT_LIMIT);

        if (previewTargets.length === 0) return;

        const previewUpdates = await Promise.all(
            previewTargets.map(async ({ result, index }) => {
                try {
                    const documentId = String(result.documentId || result.id || '').trim();
                    const documentUrl = String(result.documentUrl || result.sourceUrl || '').trim();
                    const content = await getLegalDocument({
                        source: result.source,
                        documentId: documentId && !SYNTHETIC_RESULT_ID_REGEX.test(documentId) ? documentId : undefined,
                        documentUrl: documentUrl || undefined,
                        title: result.title,
                        esasNo: result.esasNo,
                        kararNo: result.kararNo,
                        tarih: result.tarih,
                        daire: result.daire,
                        ozet: result.ozet,
                        snippet: result.snippet,
                    });

                    const normalizedContent = String(content || '').trim();
                    if (normalizedContent.length < MIN_PREVIEW_FETCH_CHARS) {
                        return null;
                    }

                    return {
                        index,
                        snippet: normalizedContent,
                    };
                } catch {
                    return null;
                }
            })
        );

        if (activeSearchRunRef.current !== searchRunId) return;

        const updateMap = new Map(
            previewUpdates
                .filter((item): item is { index: number; snippet: string } => Boolean(item?.snippet))
                .map((item) => [item.index, item.snippet])
        );

        if (updateMap.size === 0) return;

        setResults((prev) =>
            prev.map((item, index) =>
                updateMap.has(index)
                    ? {
                          ...item,
                          snippet: updateMap.get(index) || item.snippet,
                      }
                    : item
            )
        );
    }, []);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [searchQuery]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        const searchRunId = activeSearchRunRef.current + 1;
        activeSearchRunRef.current = searchRunId;
        setIsSearching(true);
        setHasResults(false);
        setError(null);
        setZeroResultMessage(null);
        setResults([]);
        setExpandedIds(new Set());

        try {
            // Dual query yaklaşımı: retrieval için kısaltılmış, rerank/routing için ham sorgu
            const analysis = await analyzeDocuments([], searchQuery.trim(), '');
            const keywordSeed = [
                analysis.summary || '',
                searchQuery.trim(),
            ]
                .filter(Boolean)
                .join('\n');
            const packetKeywords = getPacketKeywordList(analysis.legalSearchPacket);
            const plannedKeywords = buildAutoWebSearchKeywords({
                insights: analysis.analysisInsights,
                packet: analysis.legalSearchPacket,
                fallbackKeywords: packetKeywords,
            });

            let finalKeywords = plannedKeywords;
            if (finalKeywords.length === 0) {
                try {
                    finalKeywords = await generateSearchKeywords(
                        keywordSeed || analysis.summary || '',
                        UserRole.Vekil
                    );
                } catch {
                    finalKeywords = [];
                }
            }
            if (finalKeywords.length === 0) {
                finalKeywords = extractKeywordCandidates(keywordSeed || analysis.summary || '').slice(0, 8);
            }

            const rawSearchQuery = buildAutoLegalSearchText({
                packet: analysis.legalSearchPacket,
                fallbackSummary: analysis.summary || '',
                fallbackKeywords: finalKeywords,
            });
            const { keyword, rawQuery, legalSearchPacket } = buildLegalSearchInputs({
                queryInput: rawSearchQuery || finalKeywords,
                legalSearchPacket: analysis.legalSearchPacket,
                preserveKeywords: [...packetKeywords, ...finalKeywords],
                fallbackSummary: analysis.summary || '',
                fallbackKeywords: finalKeywords,
            });
            const detailedResult = await searchLegalDecisionsDetailed({
                keyword,
                rawQuery,
                legalSearchPacket,
                source: 'all',
                filters: { searchArea },
                searchMode: 'pro',
            });

            setResults(detailedResult.normalizedResults || []);
            setEvaluationGroups(detailedResult.evaluationGroups);
            setActiveTab('all');
            setZeroResultMessage(detailedResult.diagnostics.zeroResultMessage || null);
            setHasResults(true);
            void hydrateResultPreviews(searchRunId, detailedResult.normalizedResults || []);
        } catch (err: any) {
            console.error('Legal search error:', err);
            setError(err.message || 'Karar aranirken bir hata olustu.');
            setZeroResultMessage(null);
            setHasResults(true); // show error message area
        } finally {
            setIsSearching(false);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setHasResults(false);
        setResults([]);
        setEvaluationGroups(undefined);
        setActiveTab('all');
        setError(null);
        setZeroResultMessage(null);
    };

    const insertExample = (text: string) => {
        setSearchQuery(text);
    };

    const handleCopyFull = async (content: string, id: string | number | undefined) => {
        if (!content || !id) return;
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-[#0F0F11] font-sans flex flex-col text-gray-300">
            <Header />

            {/* Header section with brand colors */}
            <div className="bg-gradient-to-br from-[#111113] via-[#0A0A0B] to-black text-white pt-16 pb-20 px-4 sm:px-6 relative overflow-hidden border-b border-white/5">
                {/* Subtle background decoration */}
                <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-red-600/10 to-transparent pointer-events-none"></div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative max-w-4xl mx-auto text-center space-y-6">
                    <div className="inline-flex items-center justify-center p-3 bg-[#1A1A1D] border border-white/10 rounded-full mb-4 shadow-lg shadow-red-500/10">
                        <Scale className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                        Emsal Karar Arama
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-light">
                        Yargıtay, Danıştay ve İstinaf Mahkemeleri emsal kararları içerisinde detaylı
                        arama yapın.
                    </p>
                </div>
            </div>

            {/* Main Search Bar - Pulled up to overlap header */}
            <div className="relative z-10 -mt-10 px-4 sm:px-6 w-full max-w-5xl mx-auto">
                <div className="bg-[#1A1A1D] rounded-2xl shadow-2xl p-4 border border-white/10 flex flex-col sm:flex-row gap-4 items-center transition-all duration-300 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500/40">
                    <div className="flex-1 w-full relative group flex flex-col justify-center">
                        <div className="absolute top-4 left-4 flex items-center pointer-events-none">
                            <Search
                                className={`w-5 h-5 transition-colors duration-300 ${searchQuery ? 'text-red-500' : 'text-gray-500'}`}
                            />
                        </div>
                        <form onSubmit={handleSearch} className="w-full">
                            <textarea
                                ref={textareaRef}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSearch(e as unknown as React.FormEvent);
                                    }
                                }}
                                rows={1}
                                placeholder='Orn: Sanigin uzerinde para cikmamasi ticaret kastinin ispatlanamadigini gosterir veya dava metnini yapistirin...'
                                className="w-full pl-12 pr-12 py-4 bg-[#111113] border border-white/5 rounded-xl text-white placeholder-gray-600 text-lg focus:outline-none focus:ring-0 focus:border-white/10 transition-colors resize-none overflow-y-auto min-h-[60px] max-h-[300px]"
                                style={{ height: 'auto' }}
                            />
                        </form>
                        {searchQuery && (
                            <button
                                onClick={clearSearch}
                                className="absolute top-4 right-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
                                type="button"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    <div className="w-full sm:w-[180px] shrink-0">
                        <select
                            value={searchArea}
                            onChange={(e) => setSearchArea(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-[#111113] px-4 py-4 text-sm text-white outline-none"
                        >
                            {SEARCH_AREAS.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-full sm:w-auto shrink-0 flex items-center pr-2">
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !searchQuery.trim()}
                            className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium py-4 px-8 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 border border-white/5"
                        >
                            {isSearching ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Aranıyor...</span>
                                </>
                            ) : (
                                <>
                                    <span>Karar Bul</span>
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Search Guide Button */}
                <div className="mt-5 flex justify-center">
                    <button
                        onClick={() => setIsGuideOpen(true)}
                        className="text-gray-400 hover:text-red-400 flex items-center gap-2 text-sm font-medium transition-colors bg-[#111113]/80 backdrop-blur border border-white/5 px-4 py-2 rounded-full hover:border-red-500/30 shadow-lg shadow-black/20 hover:shadow-red-500/10"
                    >
                        <Info className="w-4 h-4 text-red-500" />
                        Gelişmiş Arama Nasıl Yapılır? Rehberi Aç
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-12 space-y-10">
                {/* Search Explanation Banner */}
                <div className="bg-gradient-to-r from-red-900/20 to-black/40 rounded-2xl p-6 border border-red-500/20 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <BrainCircuit className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                        <div className="bg-[#1A1A1D] p-3 rounded-xl shadow-inner border border-white/5 shrink-0">
                            <Sparkles className="w-8 h-8 text-red-500" />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-lg font-bold text-white tracking-tight">
                                Akilli Karar Arama
                            </h3>
                            <p className="text-gray-400 leading-relaxed text-sm lg:text-base max-w-3xl">
                                Arama; CLI, Bedesten ve gerekirse diger arka plan arama katmanlariyla calisir. Uygun sonuclar bulunup mevcut ekranda gosterilir.
                            </p>
                            <p className="hidden text-gray-400 leading-relaxed text-sm lg:text-base max-w-3xl">
                                Aramalarınız sadece anahtar kelime eşleşmesine bakmaz. Yapay zeka
                                (AI) sistemimiz sonuçları{' '}
                                <strong>anlamsal olarak analiz eder</strong>, girdiğiniz konuyla
                                hukuki anlamda en yüksek eşleşen kararları tespit edip{' '}
                                <strong className="text-gray-200">
                                    kapsamlı bir metin analiziyle sıralar
                                </strong>
                                . İlgi alaka skoru en yüksek olanlar en üstte gösterilir.
                            </p>
                        </div>
                    </div>
                </div>

                {hasResults ? (
                    /* Search Results Area - Premium Look */
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {error ? (
                            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center shadow-lg">
                                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <h3 className="text-white font-semibold mb-1">Arama Hatası</h3>
                                <p className="text-gray-400 text-sm">{error}</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="bg-[#1A1A1D] border border-white/5 rounded-xl p-8 text-center shadow-lg">
                                <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                                <h3 className="text-white font-semibold mb-1">Kayıt Bulunamadı</h3>
                                <p className="text-gray-400 text-sm">
                                    Girdiginiz arama terimleriyle eslesen bir karar bulunamadi.
                                    Lutfen farkli kelimelerle veya rehberdeki kurallara gore tekrar
                                    deneyin.
                                </p>
                                {zeroResultMessage ? (
                                    <p className="mt-3 text-xs text-gray-500">{zeroResultMessage}</p>
                                ) : null}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-4">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Search className="w-5 h-5 text-red-500" />
                                        Arama Sonuçları
                                        {activeTab === 'all' && (
                                            <span className="text-sm font-normal text-gray-500 ml-2">
                                                ({results.length} sonuç bulundu)
                                            </span>
                                        )}
                                    </h2>
                                </div>

                                {/* Tabs */}
                                {evaluationGroups && (
                                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
                                        <button
                                            onClick={() => setActiveTab('all')}
                                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                                                activeTab === 'all'
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-[#1A1A1D] text-gray-400 hover:text-white border border-white/5'
                                            }`}
                                        >
                                            Tümü ({results.length})
                                        </button>
                                        {evaluationGroups.davaci_lehine && evaluationGroups.davaci_lehine.length > 0 && (
                                            <button
                                                onClick={() => setActiveTab('davaci_lehine')}
                                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                                                    activeTab === 'davaci_lehine'
                                                        ? 'bg-green-600 text-white'
                                                        : 'bg-[#1A1A1D] text-green-500 hover:text-green-400 border border-green-500/20'
                                                }`}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                Davacı / Kabul ({evaluationGroups.davaci_lehine.length})
                                            </button>
                                        )}
                                        {evaluationGroups.davali_lehine && evaluationGroups.davali_lehine.length > 0 && (
                                            <button
                                                onClick={() => setActiveTab('davali_lehine')}
                                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                                                    activeTab === 'davali_lehine'
                                                        ? 'bg-rose-600 text-white'
                                                        : 'bg-[#1A1A1D] text-rose-500 hover:text-rose-400 border border-rose-500/20'
                                                }`}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                                Davalı / Red ({evaluationGroups.davali_lehine.length})
                                            </button>
                                        )}
                                        {evaluationGroups.notr && evaluationGroups.notr.length > 0 && (
                                            <button
                                                onClick={() => setActiveTab('notr')}
                                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                                                    activeTab === 'notr'
                                                        ? 'bg-amber-600 text-white'
                                                        : 'bg-[#1A1A1D] text-amber-500 hover:text-amber-400 border border-amber-500/20'
                                                }`}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                Nötr / Usul ({evaluationGroups.notr.length})
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Premium Result Cards List */}
                                <div className="space-y-8">
                                    {(activeTab === 'all' ? results : (evaluationGroups?.[activeTab] || [])).map((result: NormalizedLegalDecision, index: number) => {
                                        const uniqueId = result.id || `res-${index}`;
                                        const isThisCopied = copiedId === uniqueId;

                                        const score =
                                            result.relevanceScore != null
                                                ? Math.round(result.relevanceScore)
                                                : 100;
                                        // Skora göre renk belirleme mantığı (görsel zenginlik için)
                                        let scoreColorClass =
                                            'bg-green-900/40 text-green-400 border-green-500/20';
                                        if (score < 75)
                                            scoreColorClass =
                                                'bg-amber-900/40 text-amber-400 border-amber-500/20';
                                        if (score < 60)
                                            scoreColorClass =
                                                'bg-red-900/40 text-red-400 border-red-500/20';

                                        const contentToDisplay =
                                            result.snippet || result.ozet || 'İçerik bulunamadı.';
                                        const esasKarar = `Esas No: ${result.esasNo || '-'} — Karar No: ${result.kararNo || '-'}`;
                                        const backendMatchedConcepts = Array.isArray(result.matchHighlights)
                                            ? result.matchHighlights.filter((item: any) => typeof item === 'string')
                                            : [];
                                        const searchConcepts = extractSearchConcepts(searchQuery);
                                        const combinedTextForMatch = [result.title, result.daire, contentToDisplay]
                                            .filter(Boolean)
                                            .join(' ');
                                        // Validate backend concepts against actual text — only show concepts truly present
                                        const validatedBackendConcepts = backendMatchedConcepts.length > 0
                                            ? getPresentConcepts(combinedTextForMatch, backendMatchedConcepts)
                                            : [];
                                        const matchedConcepts = validatedBackendConcepts.length > 0
                                            ? validatedBackendConcepts
                                            : getPresentConcepts(combinedTextForMatch, searchConcepts);

                                        return (
                                            <div
                                                key={uniqueId}
                                                className="bg-[#1A1A1D] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col transition-all hover:border-red-500/30"
                                            >
                                                {/* Card Header */}
                                                <div className="bg-[#111113] border-b border-white/5 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div>
                                                        <div className="flex items-center flex-wrap gap-3 mb-1">
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gray-800 text-gray-300 border border-white/5 tracking-wide">
                                                                {result.daire ||
                                                                    result.source ||
                                                                    'Mahkeme'}
                                                            </span>
                                                            {result.tarih && (
                                                                <span className="text-sm font-medium text-gray-400">
                                                                    {result.tarih}
                                                                </span>
                                                            )}
                                                            <span
                                                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border cursor-help ${scoreColorClass}`}
                                                                title="Eslesme Skoru"
                                                            >
                                                                Skor: {score}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-lg font-bold text-white mt-1">
                                                            {result.title &&
                                                            result.title !== result.daire
                                                                ? renderHighlightedText(
                                                                      result.title,
                                                                      matchedConcepts,
                                                                      `${uniqueId}-title`
                                                                  )
                                                                : renderHighlightedText(
                                                                      esasKarar,
                                                                      matchedConcepts,
                                                                      `${uniqueId}-citation`
                                                                  )}
                                                        </h3>
                                                        {result.title &&
                                                            result.title !== result.daire && (
                                                                <div className="text-sm font-medium text-red-400/80 mt-0.5">
                                                                    {renderHighlightedText(
                                                                        esasKarar,
                                                                        matchedConcepts,
                                                                        `${uniqueId}-meta`
                                                                    )}
                                                                </div>
                                                            )}
                                                    </div>
                                                    <div className="shrink-0 flex items-center gap-2 mt-2 sm:mt-0">
                                                        <button
                                                            onClick={() =>
                                                                handleCopyFull(
                                                                    `T.C. ${result.daire || result.source || 'Mahkeme'}\n${result.title || esasKarar}\nTarih: ${result.tarih || '-'}\n\n${contentToDisplay}`,
                                                                    uniqueId
                                                                )
                                                            }
                                                            className="flex items-center gap-2 px-4 py-2 bg-[#25252A] hover:bg-[#2D2D33] border border-white/10 text-white rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto justify-center"
                                                        >
                                                            {isThisCopied ? (
                                                                <Check className="w-4 h-4 text-green-400" />
                                                            ) : (
                                                                <Copy className="w-4 h-4 text-red-400" />
                                                            )}
                                                            <span className="shrink-0">
                                                                {isThisCopied
                                                                    ? 'Kopyalandı'
                                                                    : 'Tümünü Kopyala'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Card Body */}
                                                <div className="p-6">
                                                    {matchedConcepts.length > 0 && (
                                                        <div className="mb-4 flex flex-wrap items-center gap-2">
                                                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300/80">
                                                                Eslesen kavramlar
                                                            </span>
                                                            {matchedConcepts.slice(0, 8).map((concept) => (
                                                                <span
                                                                    key={`${uniqueId}-chip-${concept}`}
                                                                    className="legal-match-chip"
                                                                >
                                                                    {concept}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <SelectableText className="prose prose-invert max-w-none text-gray-300 text-[15px] leading-relaxed selection:bg-red-500/30 selection:text-white">
                                                        <div className="whitespace-pre-wrap font-serif text-justify">
                                                            {(() => {
                                                                const isExpanded =
                                                                    expandedIds.has(uniqueId);
                                                                const COLLAPSE_CHAR_LIMIT = 1500;
                                                                const isLong = contentToDisplay.length > COLLAPSE_CHAR_LIMIT;

                                                                let textToShow = contentToDisplay;
                                                                if (isLong && !isExpanded) {
                                                                    // Find nearest newline or sentence end before the limit for a clean cut
                                                                    let cutPoint = contentToDisplay.lastIndexOf('\n', COLLAPSE_CHAR_LIMIT);
                                                                    if (cutPoint < COLLAPSE_CHAR_LIMIT * 0.5) {
                                                                        cutPoint = contentToDisplay.lastIndexOf('. ', COLLAPSE_CHAR_LIMIT);
                                                                    }
                                                                    if (cutPoint < COLLAPSE_CHAR_LIMIT * 0.3) {
                                                                        cutPoint = COLLAPSE_CHAR_LIMIT;
                                                                    }
                                                                    textToShow = contentToDisplay.slice(0, cutPoint).trimEnd() + '\n\n...';
                                                                }

                                                                return (
                                                                    <>
                                                                        <p>
                                                                            {renderHighlightedText(
                                                                                textToShow,
                                                                                matchedConcepts,
                                                                                `${uniqueId}-body-${isExpanded ? 'full' : 'short'}`
                                                                            )}
                                                                        </p>
                                                                        {isLong && (
                                                                            <button
                                                                                onClick={() =>
                                                                                    toggleExpand(
                                                                                        uniqueId
                                                                                    )
                                                                                }
                                                                                className="mt-4 flex items-center justify-center w-full py-2 bg-[#25252A] hover:bg-[#2D2D33] border border-white/10 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                                                                            >
                                                                                {isExpanded ? (
                                                                                    <>
                                                                                        <span>Metni Daralt</span>
                                                                                        <ChevronUp className="w-4 h-4 ml-2" />
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <span>Devamını Oku (Tüm Metin)</span>
                                                                                        <ChevronDown className="w-4 h-4 ml-2" />
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </SelectableText>
                                                </div>

                                                {/* Card Footer Hint */}
                                                <div className="bg-[#0A0A0B] px-6 py-3 border-t border-white/5 flex items-center gap-2 text-xs text-gray-500">
                                                    <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    <span>
                                                        İpucu: Sadece kullanmak istediğiniz
                                                        paragrafı fare ile basılı tutup seçerek
                                                        kopyalayabilirsiniz.
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    /* Empty state when no results yet */
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-[#1A1A1D] rounded-full flex items-center justify-center border border-white/5 shadow-inner">
                            <Scale className="w-8 h-8 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-white">Karar Aramaya Başlayın</h3>
                        <p className="text-gray-500 max-w-sm">
                            Yapay zeka asistanı, yazdığınız senaryoya en uygun Yargıtay kararlarını
                            saniyeler içinde anlamsal olarak bularak listeler.
                        </p>
                    </div>
                )}
            </div>

            {/* Guide Modal Overlay */}
            {isGuideOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-[#0F0F11] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col disable-scrollbars">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-[#0F0F11]/95 backdrop-blur border-b border-white/10 p-4 sm:p-6 flex items-center justify-between z-10 shadow-sm">
                            <div className="flex items-center gap-3">
                                <Info className="w-6 h-6 text-red-500" />
                                <h2 className="text-xl font-semibold text-white">
                                    Arama Kriterleri Rehberi
                                </h2>
                            </div>
                            <button
                                onClick={() => setIsGuideOpen(false)}
                                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-4 sm:p-6">
                            {/* Guide Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Card I */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            I
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Geniş Arama (VEYA Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelimeler arasına boşluk konularak arama
                                                yapıldığında yazılan kelimelerin{' '}
                                                <strong className="text-gray-200">
                                                    herhangi birinin
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() => insertExample('arsa payı')}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-red-500" />
                                                    <code className="text-sm font-semibold text-red-400">
                                                        arsa payı
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    İçeriğinde{' '}
                                                    <strong className="text-gray-300">arsa</strong>{' '}
                                                    VEYA{' '}
                                                    <strong className="text-gray-300">payı</strong>{' '}
                                                    kelimelerinden biri geçen evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card II */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            II
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Tam İfade Araması
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Çift tırnak içerisine yazılarak arama yapıldığında
                                                tırnak içerisinde yer alan{' '}
                                                <strong className="text-gray-200">
                                                    kelime öbeğinin aynen
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() => insertExample('"arsa payı"')}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-green-500" />
                                                    <code className="text-sm font-semibold text-green-400">
                                                        &quot;arsa payı&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    kelime öbeğinin bütün olarak geçtiği evrakları
                                                    getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card III */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            III
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Çoklu İfade Araması (VEYA Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Çift tırnak içerisinde birden fazla kelime öbeği
                                                yazıldığında, yazılan kelime öbeklerinin{' '}
                                                <strong className="text-gray-200">
                                                    herhangi birini
                                                </strong>{' '}
                                                içeren evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('"arsa payı" "bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-indigo-400" />
                                                    <code className="text-sm font-semibold text-indigo-400">
                                                        &quot;arsa payı&quot; &quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    VEYA{' '}
                                                    <strong className="text-gray-300">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    öbeklerinden biri geçen evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card IV */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-red-500/30 shadow-lg ring-1 ring-red-500/10 relative overflow-hidden">
                                    {/* Highlight ribbon */}
                                    <div className="absolute top-0 right-0 bg-red-600/90 text-white text-[10px] uppercase font-bold px-3 py-1 pb-1.5 rounded-bl-lg">
                                        Tavsiye Edilen
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="bg-red-900/40 border border-red-500/20 p-2.5 rounded-lg shrink-0 text-red-400 font-bold text-sm">
                                            IV
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-white flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-red-500" />
                                                Kesişim Araması (VE Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelimelerin başına{' '}
                                                <strong className="text-red-400 bg-red-900/30 px-1 rounded border border-red-500/20">
                                                    + (artı)
                                                </strong>{' '}
                                                işareti konularak arama yapıldığında,{' '}
                                                <strong className="text-gray-200">
                                                    kelimelerin hepsinin aynı anda
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-red-900/10 p-4 rounded-lg border border-red-500/20 mt-2 hover:bg-red-900/20 cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('+"arsa payı" +"bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-red-500" />
                                                    <code className="text-sm font-bold text-red-400">
                                                        +&quot;arsa payı&quot; +&quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    İçeriğinde HEM{' '}
                                                    <strong className="text-gray-200">
                                                        arsa payı
                                                    </strong>{' '}
                                                    HEM DE{' '}
                                                    <strong className="text-gray-200">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    kelime öbeklerini{' '}
                                                    <span className="underline decoration-red-500/50 underline-offset-2">
                                                        birlikte
                                                    </span>{' '}
                                                    içeren evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card V */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors md:col-span-2 lg:col-span-1">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            V
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Dışlama Araması (HARİÇ Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelime öbeklerinin başına{' '}
                                                <strong className="text-red-400 bg-red-900/30 px-1 rounded border border-red-500/20">
                                                    - (eksi)
                                                </strong>{' '}
                                                işareti konularak aranan evrakların{' '}
                                                <strong className="text-gray-200">
                                                    o kelimeyi içermemesi
                                                </strong>{' '}
                                                sağlanır.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('+"arsa payı" -"bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-rose-500" />
                                                    <code className="text-sm font-semibold text-rose-400">
                                                        +&quot;arsa payı&quot; -&quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    İçeriğinde{' '}
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    geçen AMA{' '}
                                                    <strong className="text-rose-400">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    kelime öbeği{' '}
                                                    <span className="font-bold">geçmeyen</span>{' '}
                                                    evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Helper alert */}
                                <div className="bg-amber-900/10 rounded-xl p-6 border border-amber-500/20 shadow-lg md:col-span-2 lg:col-span-1 flex flex-col justify-center">
                                    <div className="flex gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                                        <div>
                                            <h3 className="font-medium text-amber-500 mb-2">
                                                Önemli İpucu
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Arama kutusuna kopyala-yapıştır yaparken tırnak
                                                işaretlerinin doğru formatta ({' '}
                                                <strong className="text-white">" "</strong> )
                                                olduğuna dikkat edin. Akıllı tırnaklar ( “ ” ) arama
                                                sistemini yanıltabilir.
                                            </p>
                                            <p className="text-sm text-amber-400/80 mt-2 font-medium">
                                                Yukarıdaki örnek kutulara tıklayarak arama çubuğuna
                                                otomatik ekleyebilirsiniz.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



