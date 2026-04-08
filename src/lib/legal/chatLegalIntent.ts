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
const DECISION_TITLE_REGEX = /^(?:###\s*)?(\d+)\.\s+(.+)$/;
const SOURCE_LINK_REGEX = /\[[^\]]*Kaynak[^\]]*\]\(([^)]+)\)/i;
const BARE_URL_REGEX = /(https?:\/\/[^\s)]+)/i;

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
    /karar\s*(ara|bul)/i,
    /yargitay.*karar/i,
];

const GENERIC_LEGAL_SEARCH_COMMAND_PATTERNS = [
    /^emsal\s*(karar)?\s*(ara|aramasi\s*yap|aramasi\s*yapin|bul|getir)$/i,
    /^ictihat\s*(ara|aramasi\s*yap|bul|getir)$/i,
    /^karar\s*(ara|aramasi\s*yap|bul|getir)$/i,
    /^bu\s+konuyla\s+ilgili\s+guclu\s+emsal\s+kararlar?\s+bul(?:\s+ve\s+kisa\s+kisa\s+acikla)?$/i,
    /^bu\s+konuyla\s+ilgili\s+emsal\s+kararlar?\s+bul(?:\s+ve\s+kisa\s+kisa\s+acikla)?$/i,
];

export const detectLegalSearchIntent = (rawMessage = ''): boolean => {
    const normalized = normalizeIntentText(rawMessage);
    if (!normalized) return false;
    return LEGAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isGenericLegalSearchCommand = (rawMessage = ''): boolean => {
    const normalized = normalizeIntentText(rawMessage);
    if (!normalized) return false;
    return GENERIC_LEGAL_SEARCH_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
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

const isSourceLine = (line: string): boolean => /^\[Kaynak/i.test(line) || /^Kaynak:/i.test(line);

const extractSourceUrl = (line: string): string | undefined => {
    const linkMatch = line.match(SOURCE_LINK_REGEX);
    if (linkMatch?.[1]) return linkMatch[1].trim();

    const urlMatch = line.match(BARE_URL_REGEX);
    return urlMatch?.[1]?.trim() || undefined;
};

const parseBatchSection = (lines: string[]): LegalResearchBatchItem | null => {
    const titleLine = lines.find((line) => DECISION_TITLE_REGEX.test(line)) || '';
    const titleMatch = titleLine.match(DECISION_TITLE_REGEX);
    const title = titleMatch?.[2]?.trim() || '';
    if (!title) return null;

    const metadataLine = lines.find((line) => line !== titleLine && !isSourceLine(line)) || '';
    const sourceLine = lines.find((line) => isSourceLine(line)) || '';

    return {
        title,
        ...parseDecisionMetadata(metadataLine),
        sourceUrl: extractSourceUrl(sourceLine),
    };
};

export const parseLegalResearchBatchMessage = (rawMessage = ''): LegalResearchBatchItem[] => {
    const message = String(rawMessage || '').trim();
    if (!message.startsWith(LEGAL_RESEARCH_BATCH_MARKER)) return [];

    const body = message.slice(LEGAL_RESEARCH_BATCH_MARKER.length).trim();
    if (!body) return [];

    const sections: string[][] = [];
    let currentSection: string[] = [];

    body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            if (DECISION_TITLE_REGEX.test(line)) {
                if (currentSection.length > 0) sections.push(currentSection);
                currentSection = [line];
                return;
            }

            if (currentSection.length === 0) return;

            if (currentSection.length < 4 || isSourceLine(line)) {
                currentSection.push(line);
            }
        });

    if (currentSection.length > 0) sections.push(currentSection);

    return sections
        .map((section) => parseBatchSection(section))
        .filter((item): item is LegalResearchBatchItem => item !== null);
};
