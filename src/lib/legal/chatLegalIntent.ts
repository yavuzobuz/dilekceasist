import type { LegalSearchResult } from '../../../types';

export interface LegalResearchBatchItem {
    title: string;
    daire?: string;
    esasNo?: string;
    kararNo?: string;
    tarih?: string;
    sourceUrl?: string;
}

export const LEGAL_RESEARCH_BATCH_MARKER = 'legal_research_batch';

const normalizeIntentText = (value = ''): string =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const LEGAL_INTENT_PATTERNS = [
    /emsal\s*(ara|bul|getir)/i,
    /ictihat\s*(ara|bul)/i,
    /derin\s*arastir/i,
    /karar\s*(ara|bul)/i,
    /yargitay.*karar/i,
];

export const detectLegalSearchIntent = (rawMessage = ''): boolean => {
    const normalized = normalizeIntentText(rawMessage);
    if (!normalized) return false;
    return LEGAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
};

const formatDecisionReference = (result: Partial<LegalSearchResult>, index: number): string => {
    const title = String(result.title || `Karar ${index + 1}`).trim();
    const parts = [
        result.daire ? `Daire: ${result.daire}` : '',
        result.esasNo ? `E. ${result.esasNo}` : '',
        result.kararNo ? `K. ${result.kararNo}` : '',
        result.tarih ? `T. ${result.tarih}` : '',
    ].filter(Boolean);

    const sourceUrl = String(result.documentUrl || result.sourceUrl || '').trim();
    const sourceLine = sourceUrl ? `[Kaynak ↗](${sourceUrl})` : 'Kaynak: Belirtilmedi';

    return [
        `### ${index + 1}. ${title}`,
        parts.length > 0 ? parts.join(' | ') : 'Numara bilgisi bulunamadi.',
        sourceLine,
    ].join('\n');
};

export const buildLegalResearchBatchMessage = (results: Array<Partial<LegalSearchResult>>): string => {
    const normalizedResults = Array.isArray(results) ? results.slice(0, 5) : [];
    if (normalizedResults.length === 0) return '';

    return [
        LEGAL_RESEARCH_BATCH_MARKER,
        '',
        ...normalizedResults.map((result, index) => formatDecisionReference(result, index)),
    ].join('\n');
};

const parseDecisionMetadata = (metadataLine: string): Omit<LegalResearchBatchItem, 'title' | 'sourceUrl'> => {
    const parsed: Omit<LegalResearchBatchItem, 'title' | 'sourceUrl'> = {};

    metadataLine
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
            if (/^Daire:/i.test(part)) {
                parsed.daire = part.replace(/^Daire:/i, '').trim();
                return;
            }
            if (/^E\./i.test(part)) {
                parsed.esasNo = part.replace(/^E\./i, '').trim();
                return;
            }
            if (/^K\./i.test(part)) {
                parsed.kararNo = part.replace(/^K\./i, '').trim();
                return;
            }
            if (/^T\./i.test(part)) {
                parsed.tarih = part.replace(/^T\./i, '').trim();
            }
        });

    return parsed;
};

export const parseLegalResearchBatchMessage = (rawMessage = ''): LegalResearchBatchItem[] => {
    const message = String(rawMessage || '').trim();
    if (!message.startsWith(LEGAL_RESEARCH_BATCH_MARKER)) return [];

    const body = message.slice(LEGAL_RESEARCH_BATCH_MARKER.length).trim();
    if (!body) return [];

    const parsedItems: Array<LegalResearchBatchItem | null> = body
        .split(/\n(?=###\s+\d+\.)/)
        .map((section) => section.trim())
        .filter(Boolean)
        .map((section) => {
            const lines = section
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            const titleLine = lines.find((line) => /^###\s+\d+\./.test(line)) || '';
            const title = titleLine.replace(/^###\s+\d+\.\s*/, '').trim();
            if (!title) return null;

            const metadataLine = lines.find((line) => line !== titleLine && !/^\[Kaynak/i.test(line) && !/^Kaynak:/i.test(line)) || '';
            const sourceLine = lines.find((line) => /^\[Kaynak/i.test(line) || /^Kaynak:/i.test(line)) || '';
            const sourceMatch = sourceLine.match(/\[[^\]]*Kaynak[^\]]*\]\(([^)]+)\)/i);

            return {
                title,
                ...parseDecisionMetadata(metadataLine),
                sourceUrl: sourceMatch?.[1]?.trim() || undefined,
            };
        });

    return parsedItems.filter((item): item is LegalResearchBatchItem => item !== null);
};
