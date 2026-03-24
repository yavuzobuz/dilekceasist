import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
    FileText,
    Search,
    Filter,
    ArrowLeft,
    Loader2,
    Crown,
    Users,
    X,
    Check,
    HeartCrack,
    Banknote,
    Gavel,
    Home,
    Building2,
    Siren,
    ClipboardList,
    Scale,
    Scroll,
    UserPlus,
    FileSpreadsheet,
    Upload,
    Download,
    Table,
    Archive,
    User,
    Plus,
    Pencil,
    Trash2,
    UploadCloud,
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { marked } from 'marked';
import mammoth from 'mammoth';
import { ClientManager } from '../components/ClientManager';
import { Client } from '../types';
import { searchLegalDecisions, type NormalizedLegalDecision } from '../utils/legalSearch';

import { useAuth } from '../contexts/AuthContext';
import {
    fetchUserTemplates,
    createUserTemplate,
    updateUserTemplate,
    deleteUserTemplate,
    extractVariablesFromContent,
    type UserCustomTemplate,
} from '../services/customTemplateService';

const IconMap: Record<string, React.FC<any>> = {
    HeartCrack,
    Banknote,
    Gavel,
    Home,
    Building2,
    Siren,
    ClipboardList,
    Scale,
    Scroll,
    FileText,
};

marked.setOptions({
    breaks: true,
    gfm: true,
});

interface Template {
    id: string;
    category: string;
    subcategory: string;
    title: string;
    description: string;
    icon: string;
    isPremium: boolean;
    usageCount: number;
    variableCount: number;
    isCustom?: boolean;
}

interface TemplateVariable {
    key: string;
    label: string;
    type: string;
    placeholder?: string;
    required?: boolean;
}

interface TemplateDetail {
    id: string;
    category: string;
    subcategory: string;
    title: string;
    description: string;
    icon: string;
    content: string;
    variables: TemplateVariable[];
    isPremium: boolean;
    usageCount: number;
    isCustom?: boolean;
}

interface BulkSheetData {
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
}

interface TemplatesPageProps {
    onBack: () => void;
    onUseTemplate: (content: string, context?: TemplateTransferContext) => void;
}

interface TemplateTransferDecision {
    title: string;
    esasNo?: string;
    kararNo?: string;
    tarih?: string;
    daire?: string;
    ozet?: string;
    relevanceScore?: number;
}

export interface TemplateTransferContext {
    source: 'templates_page';
    templateId: string;
    templateTitle: string;
    templateCategory: string;
    templateSubcategory: string;
    variableValues: Record<string, string>;
    selectedDecisions: TemplateTransferDecision[];
    aiRequested: boolean;
    createdAt: string;
    bulkPackagePending?: boolean;
    bulkPackageStorageKey?: string;
    bulkRowCount?: number;
    editableTemplateContent?: string;
    templateVariables?: Array<{
        key: string;
        label?: string;
        required?: boolean;
    }>;
    enableVariableEditor?: boolean;
}

const BULK_TEMPLATE_PACKAGE_STORAGE_KEY = 'templateBulkPackage';

const makeUniqueHeaders = (headers: string[]): string[] => {
    const counts = new Map<string, number>();

    return headers.map((rawHeader, index) => {
        const baseHeader = (rawHeader || `Kolon_${index + 1}`).trim() || `Kolon_${index + 1}`;
        const currentCount = counts.get(baseHeader) || 0;
        const nextCount = currentCount + 1;
        counts.set(baseHeader, nextCount);
        return nextCount === 1 ? baseHeader : `${baseHeader}_${nextCount}`;
    });
};

const CATEGORIES = [
    { id: 'templates', name: 'Şablonlar', icon: 'ClipboardList' },
    { id: 'contracts', name: 'Sözleşmeler', icon: 'Scroll' },
    { id: 'notices', name: 'İhtarnameler', icon: 'Siren' },
    { id: 'Hukuk', name: 'Hukuk', icon: 'Scale' },
    { id: 'Icra', name: 'İcra', icon: 'Scroll' },
    { id: 'Is Hukuku', name: 'İş Hukuku', icon: 'Briefcase' },
    { id: 'Ceza', name: 'Ceza', icon: 'Siren' },
    { id: 'Idari', name: 'İdari', icon: 'Building2' },
];

type CustomTemplateType = 'dilekce' | 'sozlesme' | 'ihtarname';
type PetitionTemplateCategory = 'Hukuk' | 'Ceza' | 'Is Hukuku' | 'Icra' | 'Idari';

const PETITION_CATEGORY_OPTIONS: Array<{ value: PetitionTemplateCategory; label: string }> = [
    { value: 'Hukuk', label: 'Hukuk' },
    { value: 'Ceza', label: 'Ceza' },
    { value: 'Is Hukuku', label: 'İş Hukuku' },
    { value: 'Icra', label: 'İcra' },
    { value: 'Idari', label: 'İdari' },
];

const CATEGORY_QUERY_MAP: Record<string, string> = {
    Icra: '\u0130cra',
    'Is Hukuku': '\u0130\u015f Hukuku',
    Idari: '\u0130dari',
};
const DEFAULT_TEMPLATE_CATEGORY = 'templates';
const CONTRACTS_NOTICES_CATEGORY = 'contracts_notices';
const CONTRACTS_NOTICES_ROUTE = '/sozlesmeler-ihtarnameler';
const AVAILABLE_CATEGORY_IDS = new Set(CATEGORIES.map(category => category.id));

const resolveCategoryFromSearch = (search: string): string => {
    const searchParams = new URLSearchParams(search);
    const routeCategory = searchParams.get('category');
    if (routeCategory && AVAILABLE_CATEGORY_IDS.has(routeCategory)) return routeCategory;
    return DEFAULT_TEMPLATE_CATEGORY;
};

const API_BASE_URL = '';
const CLIENT_FIELD_KEYS = ['SIKAYET_EDEN', 'SUPHELI', 'KIRAYA_VEREN', 'KIRACI', 'BORCLU', 'ALACAKLI', 'VEKIL', 'MUVEKKIL'];
const TURKISH_LOOKUP_MAP: Record<string, string> = {
    '\u0131': 'i',
    '\u0130': 'i',
    '\u015f': 's',
    '\u015e': 's',
    '\u011f': 'g',
    '\u011e': 'g',
    '\u00fc': 'u',
    '\u00dc': 'u',
    '\u00f6': 'o',
    '\u00d6': 'o',
    '\u00e7': 'c',
    '\u00c7': 'c',
};

const normalizeLookupKey = (value: string): string => {
    if (!value) return '';

    const normalizedTurkish = Array.from(value)
        .map(char => TURKISH_LOOKUP_MAP[char] || char)
        .join('');

    return normalizedTurkish
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
};

const CP1252_REVERSE_BYTE_MAP = new Map<number, number>([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
    [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
    [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
    [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const MOJIBAKE_DETECTION = /[ÃÄÅÂ]/;

const decodePotentialMojibake = (value: string): string => {
    if (!value || !MOJIBAKE_DETECTION.test(value)) return value;

    const bytes: number[] = [];
    for (const char of value) {
        const codePoint = char.codePointAt(0);
        if (codePoint == null) continue;

        if (codePoint <= 0xFF) {
            bytes.push(codePoint);
            continue;
        }

        const cp1252Byte = CP1252_REVERSE_BYTE_MAP.get(codePoint);
        if (cp1252Byte == null) {
            return value;
        }
        bytes.push(cp1252Byte);
    }

    try {
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch {
        return value;
    }
};

const deepSanitizeText = <T,>(input: T): T => {
    if (typeof input === 'string') return decodePotentialMojibake(input) as T;
    if (Array.isArray(input)) return input.map(item => deepSanitizeText(item)) as T;
    if (input && typeof input === 'object') {
        const entries = Object.entries(input as Record<string, unknown>)
            .map(([key, value]) => [key, deepSanitizeText(value)]);
        return Object.fromEntries(entries) as T;
    }
    return input;
};

const sanitizeFileName = (value: string): string => {
    const safe = value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .trim();

    return safe || 'dilekce';
};

const replaceTemplateVariables = (content: string, variables: Record<string, string>): string => {
    let result = content || '';
    const today = new Date().toLocaleDateString('tr-TR');
    result = result.replace(/\{\{\s*TARIH\s*\}\}/gi, today);

    for (const [key, value] of Object.entries(variables)) {
        if (!key) continue;
        const placeholderRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        result = result.replace(placeholderRegex, value || '');
    }

    return result.replace(/\{\{\s*[A-Z0-9_]+\s*\}\}/gi, '[...]');
};

const markdownToHtml = (content: string): string => {
    const parsed = marked.parse(content);
    const htmlBody = typeof parsed === 'string' ? parsed : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${htmlBody}</body></html>`;
};

const splitCsvLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            result.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    result.push(current);
    return result;
};

const parseCsvFile = async (file: File): Promise<BulkSheetData> => {
    const text = await file.text();
    const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
    const lines = normalizedText
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.length > 0);

    if (lines.length < 2) {
        throw new Error('CSV dosyasinda en az 1 baslik satiri ve 1 veri satiri olmalidir.');
    }

    const firstLine = lines[0];
    const delimiterCandidates: Array<';' | ',' | '\t'> = [';', ',', '\t'];
    let delimiter: ';' | ',' | '\t' = ';';
    let bestCount = -1;

    for (const candidate of delimiterCandidates) {
        const count = firstLine.split(candidate).length;
        if (count > bestCount) {
            bestCount = count;
            delimiter = candidate;
        }
    }

    const headersRaw = splitCsvLine(firstLine, delimiter).map(value => value.trim());
    const headers = makeUniqueHeaders(headersRaw);

    const rows = lines
        .slice(1)
        .map(line => {
            const cells = splitCsvLine(line, delimiter);
            const row: Record<string, string> = {};
            headers.forEach((header, index) => {
                row[header] = (cells[index] ?? '').trim();
            });
            return row;
        })
        .filter(row => Object.values(row).some(value => value.trim().length > 0));

    if (rows.length === 0) {
        throw new Error('CSV dosyasinda gecerli veri satiri bulunamadi.');
    }

    return {
        fileName: file.name,
        headers,
        rows,
    };
};

const columnRefToIndex = (columnRef: string): number => {
    let index = 0;
    for (let i = 0; i < columnRef.length; i += 1) {
        index = (index * 26) + (columnRef.charCodeAt(i) - 64);
    }
    return index - 1;
};

const parseXlsxFile = async (file: File): Promise<BulkSheetData> => {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const parseXml = (xmlContent: string): Document => {
        return new DOMParser().parseFromString(xmlContent, 'application/xml');
    };

    const readXml = async (path: string): Promise<string | null> => {
        const entry = zip.file(path);
        if (!entry) return null;
        return entry.async('string');
    };

    const sharedStrings: string[] = [];
    const sharedStringsXml = await readXml('xl/sharedStrings.xml');
    if (sharedStringsXml) {
        const sharedDoc = parseXml(sharedStringsXml);
        const stringItems = Array.from(sharedDoc.getElementsByTagName('si'));
        stringItems.forEach(item => {
            const textNodes = Array.from(item.getElementsByTagName('t'));
            const combined = textNodes.map(node => node.textContent || '').join('');
            sharedStrings.push(combined);
        });
    }

    const workbookXml = await readXml('xl/workbook.xml');
    if (!workbookXml) {
        throw new Error('XLSX icinde workbook.xml bulunamadi.');
    }

    const workbookDoc = parseXml(workbookXml);
    const firstSheet = workbookDoc.getElementsByTagName('sheet')[0];
    const firstSheetRelId = firstSheet?.getAttribute('r:id') || '';

    let worksheetPath = 'xl/worksheets/sheet1.xml';

    if (firstSheetRelId) {
        const relsXml = await readXml('xl/_rels/workbook.xml.rels');
        if (relsXml) {
            const relsDoc = parseXml(relsXml);
            const relationships = Array.from(relsDoc.getElementsByTagName('Relationship'));
            const relationship = relationships.find(rel => rel.getAttribute('Id') === firstSheetRelId);
            const target = relationship?.getAttribute('Target');
            if (target) {
                const cleanTarget = target.replace(/^\/+/, '');
                worksheetPath = cleanTarget.startsWith('xl/') ? cleanTarget : `xl/${cleanTarget}`;
            }
        }
    }

    let worksheetXml = await readXml(worksheetPath);
    if (!worksheetXml) {
        const firstWorksheetPath = Object.keys(zip.files).find(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path));
        if (!firstWorksheetPath) {
            throw new Error('XLSX icinde worksheet bulunamadi.');
        }
        worksheetXml = await readXml(firstWorksheetPath);
    }

    if (!worksheetXml) {
        throw new Error('XLSX worksheet okunamadı.');
    }

    const worksheetDoc = parseXml(worksheetXml);
    const rowNodes = Array.from(worksheetDoc.getElementsByTagName('row'));
    const matrix: string[][] = [];
    let maxColumnIndex = 0;

    rowNodes.forEach((rowNode, rowIndex) => {
        const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
        const rowValues: string[] = [];

        cellNodes.forEach((cellNode, fallbackCellIndex) => {
            const reference = cellNode.getAttribute('r') || '';
            const refMatch = reference.match(/[A-Z]+/i);
            const columnIndex = refMatch ? columnRefToIndex(refMatch[0].toUpperCase()) : fallbackCellIndex;
            const cellType = cellNode.getAttribute('t');

            let cellValue = '';

            if (cellType === 'inlineStr') {
                cellValue = cellNode.getElementsByTagName('t')[0]?.textContent || '';
            } else {
                const valueNode = cellNode.getElementsByTagName('v')[0];
                const rawValue = valueNode?.textContent || '';

                if (cellType === 's') {
                    const sharedIndex = Number(rawValue);
                    cellValue = Number.isFinite(sharedIndex) ? (sharedStrings[sharedIndex] || '') : '';
                } else if (cellType === 'b') {
                    cellValue = rawValue === '1' ? 'TRUE' : 'FALSE';
                } else {
                    cellValue = rawValue;
                }
            }

            rowValues[columnIndex] = cellValue.trim();
            if (columnIndex > maxColumnIndex) maxColumnIndex = columnIndex;
        });

        matrix[rowIndex] = rowValues;
    });

    if (matrix.length < 2) {
        throw new Error('XLSX dosyasinda en az 1 baslik ve 1 veri satiri bulunmalidir.');
    }

    const headerRow = matrix[0] || [];
    const headersRaw = Array.from({ length: maxColumnIndex + 1 }, (_, index) => {
        const value = (headerRow[index] || '').trim();
        return value || `Kolon_${index + 1}`;
    });
    const headers = makeUniqueHeaders(headersRaw);

    const rows = matrix
        .slice(1)
        .map(rowValues => {
            const row: Record<string, string> = {};
            headers.forEach((header, index) => {
                row[header] = (rowValues[index] || '').trim();
            });
            return row;
        })
        .filter(row => Object.values(row).some(value => value.length > 0));

    if (rows.length === 0) {
        throw new Error('XLSX dosyasinda gecerli veri satiri bulunamadi.');
    }

    return {
        fileName: file.name,
        headers,
        rows,
    };
};

const parseSpreadsheetFile = async (file: File): Promise<BulkSheetData> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'csv') return parseCsvFile(file);
    if (extension === 'xlsx') return parseXlsxFile(file);
    throw new Error('Desteklenmeyen format. Lütfen .xlsx veya .csv yükleyin.');
};

const scoreHeaderMatch = (variableCandidate: string, headerCandidate: string): number => {
    if (!variableCandidate || !headerCandidate) return 0;
    if (variableCandidate === headerCandidate) return 100;
    if (variableCandidate.replace(/_/g, '') === headerCandidate.replace(/_/g, '')) return 95;
    if (headerCandidate.includes(variableCandidate) || variableCandidate.includes(headerCandidate)) return 80;

    const variableTokens = variableCandidate.split('_').filter(token => token.length > 1);
    const headerTokens = headerCandidate.split('_').filter(token => token.length > 1);
    if (variableTokens.length === 0 || headerTokens.length === 0) return 0;

    const levenshteinDistance = (a: string, b: string): number => {
        const rows = a.length + 1;
        const cols = b.length + 1;
        const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
        for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

        for (let i = 1; i < rows; i += 1) {
            for (let j = 1; j < cols; j += 1) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[a.length][b.length];
    };

    const tokenSimilarity = (left: string, right: string): number => {
        const maxLength = Math.max(left.length, right.length);
        if (maxLength === 0) return 1;
        return 1 - (levenshteinDistance(left, right) / maxLength);
    };

    let exactTokenMatches = 0;
    const unmatchedHeaderTokens = [...headerTokens];

    variableTokens.forEach(variableToken => {
        const exactIndex = unmatchedHeaderTokens.indexOf(variableToken);
        if (exactIndex >= 0) {
            exactTokenMatches += 1;
            unmatchedHeaderTokens.splice(exactIndex, 1);
        }
    });

    let fuzzyTokenMatches = 0;
    variableTokens.forEach(variableToken => {
        if (headerTokens.includes(variableToken)) return;

        let bestMatchIndex = -1;
        let bestSimilarity = 0;
        unmatchedHeaderTokens.forEach((headerToken, index) => {
            const similarity = tokenSimilarity(variableToken, headerToken);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatchIndex = index;
            }
        });

        if (bestMatchIndex >= 0 && bestSimilarity >= 0.55) {
            fuzzyTokenMatches += 1;
            unmatchedHeaderTokens.splice(bestMatchIndex, 1);
        }
    });

    const totalMatches = exactTokenMatches + fuzzyTokenMatches;
    if (totalMatches === 0) return 0;

    const allTokensMatched = totalMatches >= variableTokens.length;
    return (exactTokenMatches * 15) + (fuzzyTokenMatches * 10) + (allTokensMatched ? 20 : 0);
};

const getVariableAliases = (variable: TemplateVariable): string[] => {
    const aliases = new Set<string>();
    const normalizedKey = normalizeLookupKey(variable.key);
    const normalizedLabel = normalizeLookupKey(variable.label);

    if (normalizedKey) aliases.add(normalizedKey);
    if (normalizedLabel) aliases.add(normalizedLabel);

    const suffixes = [
        { endsWith: '_ad', extra: ['_ad_soyad', '_adi', '_ad_soyadi', '_unvan'] },
        { endsWith: '_adres', extra: ['_adresi'] },
        { endsWith: '_tc', extra: ['_tc_no', '_kimlik_no'] },
        { endsWith: '_vkn', extra: ['_vergi_no', '_vergi_kimlik_no'] },
        { endsWith: '_telefon', extra: ['_tel', '_gsm'] },
    ];

    suffixes.forEach(({ endsWith, extra }) => {
        if (normalizedKey.endsWith(endsWith)) {
            const prefix = normalizedKey.slice(0, normalizedKey.length - endsWith.length);
            extra.forEach(suffix => aliases.add(`${prefix}${suffix}`));
        }
    });

    if (normalizedKey.includes('brut')) aliases.add(normalizedKey.replace(/brut/g, 'butur'));
    if (normalizedLabel.includes('brut')) aliases.add(normalizedLabel.replace(/brut/g, 'butur'));

    return Array.from(aliases);
};

const findBestMatchingHeaderForVariable = (variable: TemplateVariable, headers: string[]): string | null => {
    const normalizedHeaders = headers.map(header => ({
        raw: header,
        normalized: normalizeLookupKey(header),
    }));
    const aliases = getVariableAliases(variable);
    let bestHeader: string | null = null;
    let bestScore = -1;

    normalizedHeaders.forEach(headerInfo => {
        aliases.forEach(alias => {
            const score = scoreHeaderMatch(alias, headerInfo.normalized);
            if (score > bestScore) {
                bestHeader = headerInfo.raw;
                bestScore = score;
            }
        });
    });

    return bestScore >= 30 ? bestHeader : null;
};

const inferColumnMapping = (variables: TemplateVariable[], headers: string[]): Record<string, string> => {
    const result: Record<string, string> = {};

    variables.forEach(variable => {
        const bestHeader = findBestMatchingHeaderForVariable(variable, headers);
        if (bestHeader) result[variable.key] = bestHeader;
    });

    return result;
};

const escapeCsvCell = (value: string): string => {
    return `"${value.replace(/"/g, '""')}"`;
};

const isClientField = (key: string): boolean => {
    const upperKey = key.toUpperCase();
    return upperKey.endsWith('_AD') || CLIENT_FIELD_KEYS.includes(upperKey);
};

type TemplateSectionKey = 'contracts' | 'notices' | 'other';

const buildDecisionIdentity = (decision: Pick<NormalizedLegalDecision, 'title' | 'esasNo' | 'kararNo' | 'tarih'>): string => {
    return `${decision.title || ''}|${decision.esasNo || ''}|${decision.kararNo || ''}|${decision.tarih || ''}`;
};

const formatDecisionCitation = (decision: Pick<NormalizedLegalDecision, 'title' | 'esasNo' | 'kararNo' | 'tarih' | 'ozet'>): string => {
    const citation = [
        decision.title || 'Yargıtay Kararı',
        decision.esasNo ? `E. ${decision.esasNo}` : '',
        decision.kararNo ? `K. ${decision.kararNo}` : '',
        decision.tarih ? `T. ${decision.tarih}` : '',
    ].filter(Boolean).join(' - ');

    const summary = (decision.ozet || '').trim();
    return summary ? `${citation}\n  Özet: ${summary}` : citation;
};

const buildMcpDecisionAppendix = (decisions: Array<Pick<NormalizedLegalDecision, 'title' | 'esasNo' | 'kararNo' | 'tarih' | 'ozet'>>): string => {
    if (!decisions.length) return '';

    const lines = decisions.map((decision, index) => `${index + 1}. ${formatDecisionCitation(decision)}`);
    return `## EMSAL YARGITAY KARARLARI (MCP)\n${lines.join('\n\n')}`;
};

const buildVariableContext = (values: Record<string, string>): string => {
    const lines = Object.entries(values)
        .map(([key, value]) => [key, (value || '').trim()] as const)
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => `- ${key}: ${value}`);

    return lines.length ? lines.join('\n') : '- Deger girilmedi';
};

const resolveTemplateSection = (template: Template): TemplateSectionKey => {
    const category = normalizeLookupKey(template.category || '');
    const subcategory = normalizeLookupKey(template.subcategory || '');
    const title = normalizeLookupKey(template.title || '');
    const description = normalizeLookupKey(template.description || '');
    const combined = `${category} ${subcategory} ${title} ${description}`;

    const isNotice = category.includes('ihtar')
        || subcategory.includes('ihtar')
        || title.includes('ihtar')
        || combined.includes('ihtarname');
    if (isNotice) return 'notices';

    const isContract = category.includes('sozles')
        || subcategory.includes('sozles')
        || title.includes('sozles')
        || combined.includes('sozlesme');
    if (isContract) return 'contracts';

    return 'other';
};

const resolveCustomTemplateCategoryInfo = (
    template: Pick<UserCustomTemplate, 'template_type' | 'petition_category'>
): { category: string; subcategory: string } => {
    if (template.template_type === 'sozlesme') {
        return { category: 'contracts', subcategory: 'Sozlesme' };
    }
    if (template.template_type === 'ihtarname') {
        return { category: 'notices', subcategory: 'Ihtarname' };
    }

    const petitionCategory = template.petition_category || 'templates';
    return { category: petitionCategory, subcategory: template.petition_category || 'Dilekçe' };
};

const templateMatchesCategory = (template: Template, categoryId: string): boolean => {
    const section = resolveTemplateSection(template);
    if (categoryId === CONTRACTS_NOTICES_CATEGORY) {
        return section === 'contracts' || section === 'notices';
    }
    if (categoryId === 'templates') return section === 'other';
    if (categoryId === 'contracts') return section === 'contracts';
    if (categoryId === 'notices') return section === 'notices';

    return normalizeLookupKey(template.category || '') === normalizeLookupKey(categoryId);
};

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onBack, onUseTemplate }) => {
    const location = useLocation();
    const isContractsNoticesPage = location.pathname === CONTRACTS_NOTICES_ROUTE;
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(() =>
        isContractsNoticesPage ? CONTRACTS_NOTICES_CATEGORY : resolveCategoryFromSearch(location.search)
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationMode, setGenerationMode] = useState<'single' | 'bulk'>('single');
    const [isAiEnhanced, setIsAiEnhanced] = useState(true);
    const [mcpKeyword, setMcpKeyword] = useState('');
    const [mcpSearchResults, setMcpSearchResults] = useState<NormalizedLegalDecision[]>([]);
    const [selectedMcpDecisions, setSelectedMcpDecisions] = useState<NormalizedLegalDecision[]>([]);
    const [isSearchingMcp, setIsSearchingMcp] = useState(false);
    const [mcpSearchError, setMcpSearchError] = useState<string | null>(null);

    const [bulkSheetData, setBulkSheetData] = useState<BulkSheetData | null>(null);
    const [bulkColumnMapping, setBulkColumnMapping] = useState<Record<string, string>>({});
    const [bulkFallbackValues, setBulkFallbackValues] = useState<Record<string, string>>({});
    const [includeDocxInBulk, setIncludeDocxInBulk] = useState(true);
    const [isBulkGenerating, setIsBulkGenerating] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

    const [showClientManager, setShowClientManager] = useState(false);
    const [clientManagerMode, setClientManagerMode] = useState<'manage' | 'select'>('manage');
    const [targetVariablePrefix, setTargetVariablePrefix] = useState<string | null>(null);

    // Özel şablon yönetimi
    const { user } = useAuth();
    const [customTemplates, setCustomTemplates] = useState<UserCustomTemplate[]>([]);
    const [isLoadingCustom, setIsLoadingCustom] = useState(false);
    const [showCustomTemplateModal, setShowCustomTemplateModal] = useState(false);
    const [editingCustomTemplate, setEditingCustomTemplate] = useState<UserCustomTemplate | null>(null);
    const [customForm, setCustomForm] = useState({
        title: '',
        description: '',
        template_type: 'dilekce' as CustomTemplateType,
        petition_category: '' as PetitionTemplateCategory | '',
        content: '',
        style_notes: '',
        source_file_name: null as string | null,
    });
    const [customFormVariables, setCustomFormVariables] = useState<TemplateVariable[]>([]);
    const [customFormSaving, setCustomFormSaving] = useState(false);
    const [customFormError, setCustomFormError] = useState<string | null>(null);

    const effectiveCategory = isContractsNoticesPage ? CONTRACTS_NOTICES_CATEGORY : selectedCategory;
    const visibleCategories = useMemo(
        () => CATEGORIES.filter(category => category.id !== 'contracts' && category.id !== 'notices'),
        []
    );

    const previewValueByHeader = useMemo(() => {
        if (!bulkSheetData || bulkSheetData.rows.length === 0) return {} as Record<string, string>;

        const previewMap: Record<string, string> = {};
        bulkSheetData.headers.forEach(header => {
            const sampleRow = bulkSheetData.rows.find(row => (row[header] || '').trim().length > 0);
            previewMap[header] = (sampleRow?.[header] || bulkSheetData.rows[0]?.[header] || '').trim();
        });

        return previewMap;
    }, [bulkSheetData]);

    const resetBulkModeState = () => {
        setBulkSheetData(null);
        setBulkColumnMapping({});
        setBulkFallbackValues({});
        setIncludeDocxInBulk(true);
        setIsBulkGenerating(false);
        setBulkError(null);
        setBulkSuccess(null);
        setBulkProgress({ current: 0, total: 0 });
    };

    const resetSingleModeEnhancementState = () => {
        setIsAiEnhanced(true);
        setMcpKeyword('');
        setMcpSearchResults([]);
        setSelectedMcpDecisions([]);
        setIsSearchingMcp(false);
        setMcpSearchError(null);
    };

    const closeTemplateModal = () => {
        setSelectedTemplate(null);
        setVariableValues({});
        setGenerationMode('single');
        resetBulkModeState();
        resetSingleModeEnhancementState();
    };

    const handleCustomTemplateTypeChange = useCallback((templateType: CustomTemplateType) => {
        setCustomForm(prev => ({
            ...prev,
            template_type: templateType,
            petition_category: templateType === 'dilekce' ? prev.petition_category : '',
        }));
    }, []);

    // Özel şablonları Supabase'den yükle
    const loadCustomTemplates = useCallback(async () => {
        if (!user) {
            setCustomTemplates([]);
            return;
        }
        setIsLoadingCustom(true);
        try {
            const data = await fetchUserTemplates(user.id);
            setCustomTemplates(data);
        } catch (loadErr) {
            console.error('Custom templates load error:', loadErr);
        } finally {
            setIsLoadingCustom(false);
        }
    }, [user]);

    useEffect(() => {
        loadCustomTemplates();
    }, [loadCustomTemplates]);

    // Özel şablon oluşturma/düzenleme modal'ını aç
    const openCustomTemplateModal = useCallback((template?: UserCustomTemplate) => {
        if (template) {
            setEditingCustomTemplate(template);
            setCustomForm({
                title: template.title,
                description: template.description || '',
                template_type: template.template_type,
                petition_category: template.template_type === 'dilekce' ? (template.petition_category || '') : '',
                content: template.content,
                style_notes: template.style_notes || '',
                source_file_name: template.source_file_name,
            });
            setCustomFormVariables(template.variables || []);
        } else {
            setEditingCustomTemplate(null);
            setCustomForm({
                title: '',
                description: '',
                template_type: 'dilekce',
                petition_category: '',
                content: '',
                style_notes: '',
                source_file_name: null,
            });
            setCustomFormVariables([]);
        }
        setCustomFormError(null);
        setShowCustomTemplateModal(true);
    }, []);

    // İçerikteki {{ALAN}} değişkenlerini otomatik çıkar
    const handleCustomContentChange = useCallback((newContent: string) => {
        setCustomForm(prev => ({ ...prev, content: newContent }));
        const detected = extractVariablesFromContent(newContent);
        setCustomFormVariables(detected);
    }, []);

    // Dosya yükleme: .txt, .md, .docx
    const handleCustomFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase();
        let fileText = '';

        try {
            if (extension === 'txt' || extension === 'md') {
                fileText = await file.text();
            } else if (extension === 'docx') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                fileText = result.value;
            } else {
                setCustomFormError('Desteklenmeyen format. .txt, .md veya .docx yükleyin.');
                return;
            }

            setCustomForm(prev => ({ ...prev, content: fileText, source_file_name: file.name }));
            const detected = extractVariablesFromContent(fileText);
            setCustomFormVariables(detected);
            setCustomFormError(null);
        } catch (fileErr) {
            setCustomFormError(fileErr instanceof Error ? fileErr.message : 'Dosya okunamadı.');
        }
    }, []);

    // Özel şablonu kaydet veya güncelle
    const handleSaveCustomTemplate = useCallback(async () => {
        if (!user) return;
        if (!customForm.title.trim()) {
            setCustomFormError('Şablon başlığı zorunludur.');
            return;
        }
        if (!customForm.content.trim()) {
            setCustomFormError('Şablon içeriği zorunludur.');
            return;
        }
        if (customForm.template_type === 'dilekce' && !customForm.petition_category) {
            setCustomFormError('Dilekçe kategorisi seçimi zorunludur.');
            return;
        }

        setCustomFormSaving(true);
        setCustomFormError(null);

        try {
            if (editingCustomTemplate) {
                await updateUserTemplate(editingCustomTemplate.id, {
                    title: customForm.title.trim(),
                    description: customForm.description.trim() || null,
                    template_type: customForm.template_type,
                    petition_category: customForm.template_type === 'dilekce' ? (customForm.petition_category || null) : null,
                    content: customForm.content,
                    style_notes: customForm.style_notes.trim() || null,
                    source_file_name: customForm.source_file_name,
                    variables: customFormVariables,
                });
            } else {
                await createUserTemplate({
                    user_id: user.id,
                    title: customForm.title.trim(),
                    description: customForm.description.trim() || null,
                    template_type: customForm.template_type,
                    petition_category: customForm.template_type === 'dilekce' ? (customForm.petition_category || null) : null,
                    content: customForm.content,
                    style_notes: customForm.style_notes.trim() || null,
                    source_file_name: customForm.source_file_name,
                    variables: customFormVariables,
                });
            }

            setShowCustomTemplateModal(false);
            await loadCustomTemplates();
        } catch (saveErr) {
            setCustomFormError(saveErr instanceof Error ? saveErr.message : 'Kayıt hatası.');
        } finally {
            setCustomFormSaving(false);
        }
    }, [user, customForm, customFormVariables, editingCustomTemplate, loadCustomTemplates]);

    // Özel şablon sil
    const handleDeleteCustomTemplate = useCallback(async (id: string) => {
        if (!confirm('Bu özel şablonu silmek istediğinize emin misiniz?')) return;

        try {
            await deleteUserTemplate(id);
            await loadCustomTemplates();
        } catch (delErr) {
            console.error('Delete custom template error:', delErr);
        }
    }, [loadCustomTemplates]);

    // Özel şablonu TemplateDetail olarak aç (mevcut modal ile)
    const openCustomTemplateAsDetail = useCallback((ct: UserCustomTemplate) => {
        const { category, subcategory } = resolveCustomTemplateCategoryInfo(ct);
        const detail: TemplateDetail = {
            id: `custom-${ct.id}`,
            category,
            subcategory,
            title: ct.title,
            description: ct.description || '',
            icon: 'FileText',
            content: ct.content,
            variables: ct.variables || [],
            isPremium: false,
            usageCount: 0,
            isCustom: true,
        };
        setSelectedTemplate(detail);
        setVariableValues({});
        setGenerationMode('single');
        resetBulkModeState();
        resetSingleModeEnhancementState();
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [effectiveCategory]);

    useEffect(() => {
        const routeCategory = isContractsNoticesPage
            ? CONTRACTS_NOTICES_CATEGORY
            : resolveCategoryFromSearch(location.search);
        setSelectedCategory(prev => (prev === routeCategory ? prev : routeCategory));
    }, [location.search, isContractsNoticesPage]);

    const fetchTemplates = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const clientFilteredCategories = new Set(['templates', 'contracts', 'notices']);
            const apiCategory = CATEGORY_QUERY_MAP[effectiveCategory] || effectiveCategory;
            const url = clientFilteredCategories.has(effectiveCategory) || effectiveCategory === CONTRACTS_NOTICES_CATEGORY
                ? `${API_BASE_URL}/api/templates`
                : `${API_BASE_URL}/api/templates?category=${encodeURIComponent(apiCategory)}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Şablonlar yüklenemedi');

            const data = await response.json();
            setTemplates(deepSanitizeText(data.templates || []));
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Bir hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTemplateDetail = async (id: string) => {
        setIsLoadingTemplate(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/templates?id=${encodeURIComponent(id)}`);
            if (!response.ok) throw new Error('Şablon yüklenemedi');

            const data = await response.json();
            setSelectedTemplate(deepSanitizeText(data.template));
            setVariableValues({});
            setGenerationMode('single');
            resetBulkModeState();
            resetSingleModeEnhancementState();
        } catch (templateError) {
            console.error('Template fetch error:', templateError);
        } finally {
            setIsLoadingTemplate(false);
        }
    };

    const isMcpDecisionSelected = (decision: Pick<NormalizedLegalDecision, 'title' | 'esasNo' | 'kararNo' | 'tarih'>) => {
        const identity = buildDecisionIdentity(decision);
        return selectedMcpDecisions.some(item => buildDecisionIdentity(item) === identity);
    };

    const toggleMcpDecision = (decision: NormalizedLegalDecision) => {
        const identity = buildDecisionIdentity(decision);
        setSelectedMcpDecisions(prev => {
            const exists = prev.some(item => buildDecisionIdentity(item) === identity);
            if (exists) {
                return prev.filter(item => buildDecisionIdentity(item) !== identity);
            }
            return [...prev, decision];
        });
    };

    const handleMcpSearch = async () => {
        const keyword = mcpKeyword.trim();
        if (!keyword) return;

        setIsSearchingMcp(true);
        setMcpSearchError(null);

        try {
            // Kaynak seçimini server AI router'a bırak (PrecedentSearch ile aynı yaklaşım)
            const results = await searchLegalDecisions({
                source: 'all',
                keyword,
                rawQuery: keyword,
                apiBaseUrl: API_BASE_URL,
            });
            setMcpSearchResults(results);
        } catch (searchError) {
            const message = searchError instanceof Error ? searchError.message : 'MCP karar aramasinda hata olustu.';
            setMcpSearchError(message);
            setMcpSearchResults([]);
        } finally {
            setIsSearchingMcp(false);
        }
    };

    const enhanceTemplateWithAI = async (draftContent: string): Promise<string> => {
        const decisionContext = selectedMcpDecisions.length
            ? selectedMcpDecisions.map((decision, index) => `${index + 1}. ${formatDecisionCitation(decision)}`).join('\n\n')
            : 'Emsal karar secilmedi.';
        const variableContext = buildVariableContext(variableValues);

        const enhancementPrompt = [
            'GÖREV: Aşağıdaki Türkçe hukuk dilekçe taslağını profesyonel bir hukuk dili ile geliştir.',
            'KURALLAR:',
            '- Baslik yapisini koru.',
            '- Somut olgu uydurma, sadece verilen bilgi ve taslaktan ilerle.',
            '- Etiket gibi duran metinleri (örneğin "TC Kimlik No", "İşe Giriş Tarihi") hukuki anlatıma uygun hale getir.',
            '- Bilgi eksikse [ ... ] yaz.',
            selectedMcpDecisions.length > 0
                ? '- Seçilen MCP Yargıtay kararlarını gerekçe ve talep bölümünde atıf yaparak kullan.'
                : '- Hukuki gerekçeyi güçlendirirken metni boş bırakma.',
            '',
            '[TASLAK METIN]',
            draftContent,
            '',
            '[ALAN DEGERLERI]',
            variableContext,
            '',
            '[MCP YARGITAY KARARLARI]',
            decisionContext,
            '',
            '[ÇIKTI]',
            'Sadece iyileştirilmiş nihai dilekçe metnini döndür.',
        ].join('\n');

        const response = await fetch(`${API_BASE_URL}/api/gemini/rewrite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ textToRewrite: enhancementPrompt }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(errorText || 'AI zenginleştirme başarısız oldu.');
        }

        const data = await response.json();
        const rewritten = decodePotentialMojibake(String(data.text || '')).trim();
        return rewritten || draftContent;
    };

    const handleUseTemplate = async () => {
        if (!selectedTemplate) return;

        setIsGenerating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedTemplate.id, variables: variableValues }),
            });

            if (!response.ok) throw new Error('Şablon kullanılamadı');

            const data = await response.json();
            const baseContent = decodePotentialMojibake(String(data.content || ''));
            const legalAppendix = buildMcpDecisionAppendix(selectedMcpDecisions);
            const mergedContent = legalAppendix ? `${baseContent}\n\n${legalAppendix}` : baseContent;
            const editableTemplateContent = legalAppendix ? `${selectedTemplate.content}\n\n${legalAppendix}` : selectedTemplate.content;
            const templateVariablesForTransfer = selectedTemplate.variables.map(variable => ({
                key: variable.key,
                label: variable.label || variable.key,
                required: Boolean(variable.required),
            }));

            let finalContent = mergedContent;
            let aiEnhancedInTemplates = false;
            if (isAiEnhanced) {
                try {
                    finalContent = await enhanceTemplateWithAI(mergedContent);
                    aiEnhancedInTemplates = true;
                } catch (enhancementError) {
                    console.error('Template AI enhancement failed, alt-app fallback will be used:', enhancementError);
                }
            }

            const transferContext: TemplateTransferContext = {
                source: 'templates_page',
                templateId: selectedTemplate.id,
                templateTitle: selectedTemplate.title,
                templateCategory: selectedTemplate.category,
                templateSubcategory: selectedTemplate.subcategory,
                variableValues: { ...variableValues },
                selectedDecisions: selectedMcpDecisions.map(decision => ({
                    title: decision.title || 'Yargıtay Kararı',
                    esasNo: decision.esasNo || '',
                    kararNo: decision.kararNo || '',
                    tarih: decision.tarih || '',
                    daire: decision.daire || '',
                    ozet: decision.ozet || '',
                    relevanceScore: decision.relevanceScore,
                })),
                aiRequested: isAiEnhanced && !aiEnhancedInTemplates,
                createdAt: new Date().toISOString(),
                editableTemplateContent,
                templateVariables: templateVariablesForTransfer,
                enableVariableEditor: !aiEnhancedInTemplates,
            };

            onUseTemplate(finalContent, transferContext);
        } catch (templateUseError) {
            console.error('Template use error:', templateUseError);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSpreadsheetUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = '';
        if (!file || !selectedTemplate) return;

        setBulkError(null);
        setBulkSuccess(null);

        try {
            const sheetData = await parseSpreadsheetFile(file);
            const autoMapping = inferColumnMapping(selectedTemplate.variables, sheetData.headers);

            setBulkSheetData(sheetData);
            setBulkColumnMapping(autoMapping);
            setBulkFallbackValues({});
            setBulkProgress({ current: 0, total: sheetData.rows.length });
            setBulkSuccess(`${sheetData.rows.length} satır yüklendi. Kolon eşlemeleri otomatik önerildi.`);
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : 'Dosya okunurken hata oluştu.';
            setBulkError(message);
            setBulkSheetData(null);
            setBulkColumnMapping({});
            setBulkFallbackValues({});
        }
    };

    const downloadSampleCsv = () => {
        if (!selectedTemplate) return;

        const headers = selectedTemplate.variables.map(variable => variable.key);
        const sampleValues = selectedTemplate.variables.map(variable => variable.placeholder || variable.label || `Ornek ${variable.key}`);
        const csvLines = [
            headers.map(escapeCsvCell).join(';'),
            sampleValues.map(escapeCsvCell).join(';'),
        ];

        const csvContent = `\uFEFF${csvLines.join('\n')}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `${sanitizeFileName(selectedTemplate.title)}_ornek_sablon.csv`);
    };

    const buildVariablesForBulkRow = (row: Record<string, string>, variables: TemplateVariable[]): Record<string, string> => {
        const rowValues: Record<string, string> = {};
        const rowHeaders = Object.keys(row);

        variables.forEach(variable => {
            const mappedColumn = bulkColumnMapping[variable.key];
            const inferredColumn = mappedColumn || findBestMatchingHeaderForVariable(variable, rowHeaders) || '';
            const mappedValue = inferredColumn ? row[inferredColumn] || '' : '';
            const fallbackValue = bulkFallbackValues[variable.key] || '';
            rowValues[variable.key] = (mappedValue || fallbackValue || '').trim();
        });

        return rowValues;
    };

    const validateBulkRows = (rows: Record<string, string>[], variables: TemplateVariable[]) => {
        const rowErrors: number[] = [];
        rows.forEach((row, index) => {
            const values = buildVariablesForBulkRow(row, variables);
            const hasMissingRequired = variables.some(variable => variable.required && !(values[variable.key] || '').trim());
            if (hasMissingRequired) {
                rowErrors.push(index + 2);
            }
        });

        if (rowErrors.length > 0) {
            const sampleRows = rowErrors.slice(0, 10).join(', ');
            return `Zorunlu alanlari eksik satirlar var. Satir numaralari: ${sampleRows}${rowErrors.length > 10 ? ' ...' : ''}`;
        }

        return null;
    };

    const bulkPreviewContent = useMemo(() => {
        if (!selectedTemplate || !bulkSheetData || bulkSheetData.rows.length === 0) return '';

        const previewRow = bulkSheetData.rows.find(row =>
            selectedTemplate.variables.some(variable => {
                const mappedColumn = bulkColumnMapping[variable.key];
                if (!mappedColumn) return false;
                return Boolean((row[mappedColumn] || '').trim());
            })
        ) || bulkSheetData.rows[0];

        const previewVariables = buildVariablesForBulkRow(previewRow, selectedTemplate.variables);
        return replaceTemplateVariables(selectedTemplate.content, previewVariables);
    }, [selectedTemplate, bulkSheetData, bulkColumnMapping, bulkFallbackValues]);

    const singlePreviewContent = useMemo(() => {
        if (!selectedTemplate) return '';
        const base = replaceTemplateVariables(selectedTemplate.content, variableValues);
        const legalAppendix = buildMcpDecisionAppendix(selectedMcpDecisions);
        return legalAppendix ? `${base}\n\n${legalAppendix}` : base;
    }, [selectedTemplate, variableValues, selectedMcpDecisions]);

    const activePreviewContent = generationMode === 'bulk' ? bulkPreviewContent : singlePreviewContent;
    const previewHint = generationMode === 'bulk'
        ? 'Kolon eşlemeleri ve sabit değerler değiştikçe önizleme otomatik güncellenir.'
        : 'Sağ taraftaki alanları doldurdukça önizleme canlı olarak güncellenir.';

    const handleBulkGenerate = async () => {
        if (!selectedTemplate || !bulkSheetData) return;

        setIsBulkGenerating(true);
        setBulkError(null);
        setBulkSuccess(null);
        setBulkProgress({ current: 0, total: bulkSheetData.rows.length });

        try {
            const validationError = validateBulkRows(bulkSheetData.rows, selectedTemplate.variables);
            if (validationError) {
                setBulkError(validationError);
                return;
            }

            const rowVariablePayload = bulkSheetData.rows.map(row =>
                buildVariablesForBulkRow(row, selectedTemplate.variables)
            );
            const pendingBulkPackage = {
                source: 'templates_page_bulk',
                templateId: selectedTemplate.id,
                templateTitle: selectedTemplate.title,
                templateContent: selectedTemplate.content,
                rowVariables: rowVariablePayload,
                includeDocx: includeDocxInBulk,
                createdAt: new Date().toISOString(),
            };

            try {
                localStorage.setItem(BULK_TEMPLATE_PACKAGE_STORAGE_KEY, JSON.stringify(pendingBulkPackage));
            } catch (storageError) {
                console.error('Bulk package storage error:', storageError);
                setBulkError('Seri paket verisi kaydedilemedi. Tarayici depolama alani yetersiz olabilir.');
                return;
            }

            setBulkProgress({ current: rowVariablePayload.length, total: rowVariablePayload.length });
            const templateVariablesForTransfer = selectedTemplate.variables.map(variable => ({
                key: variable.key,
                label: variable.label || variable.key,
                required: Boolean(variable.required),
            }));

            const transferContext: TemplateTransferContext = {
                source: 'templates_page',
                templateId: selectedTemplate.id,
                templateTitle: selectedTemplate.title,
                templateCategory: selectedTemplate.category,
                templateSubcategory: selectedTemplate.subcategory,
                variableValues: {},
                selectedDecisions: [],
                aiRequested: false,
                createdAt: new Date().toISOString(),
                bulkPackagePending: true,
                bulkPackageStorageKey: BULK_TEMPLATE_PACKAGE_STORAGE_KEY,
                bulkRowCount: rowVariablePayload.length,
                editableTemplateContent: selectedTemplate.content,
                templateVariables: templateVariablesForTransfer,
                enableVariableEditor: false,
            };

            onUseTemplate(selectedTemplate.content, transferContext);
        } catch (generationError) {
            const message = generationError instanceof Error ? generationError.message : 'Seri üretim sırasında hata oluştu.';
            setBulkError(message);
        } finally {
            setIsBulkGenerating(false);
        }
    };

    // Özel şablonları Template formatına dönüştür
    const customTemplatesAsCards: Template[] = useMemo(() => {
        return customTemplates.map(ct => ({
            ...resolveCustomTemplateCategoryInfo(ct),
            id: `custom-${ct.id}`,
            title: ct.title,
            description: ct.description || '',
            icon: 'FileText',
            isPremium: false,
            usageCount: 0,
            variableCount: (ct.variables || []).length,
            isCustom: true,
        }));
    }, [customTemplates]);

    const templatesBySelectedCategory = useMemo(() => {
        const presetFiltered = templates.filter(template => templateMatchesCategory(template, effectiveCategory));

        // Ozel sablonlari da kategoriye gore filtrele ve basa ekle
        const customFiltered = customTemplatesAsCards.filter(ct => templateMatchesCategory(ct, effectiveCategory));

        return [...customFiltered, ...presetFiltered];
    }, [templates, customTemplatesAsCards, effectiveCategory]);

    const filteredTemplates = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return templatesBySelectedCategory;

        return templatesBySelectedCategory.filter(template =>
            template.title.toLowerCase().includes(normalizedQuery) ||
            template.description.toLowerCase().includes(normalizedQuery)
        );
    }, [templatesBySelectedCategory, searchQuery]);

    const sectionTitle = effectiveCategory === 'templates'
        ? 'Sablonlar'
        : effectiveCategory === 'contracts'
            ? 'Sozlesmeler'
            : effectiveCategory === 'notices'
                ? 'Ihtarnameler'
                : null;

    const contractsTemplates = useMemo(
        () => filteredTemplates.filter(template => resolveTemplateSection(template) === 'contracts'),
        [filteredTemplates]
    );

    const noticesTemplates = useMemo(
        () => filteredTemplates.filter(template => resolveTemplateSection(template) === 'notices'),
        [filteredTemplates]
    );

    const isContractsNoticesView = effectiveCategory === CONTRACTS_NOTICES_CATEGORY;
    const pageTitle = isContractsNoticesView ? 'Sozlesmeler & Ihtarnameler' : 'Sablon Galerisi';
    const pageDescription = isContractsNoticesView
        ? 'Tüm sözleşme ve ihtarname şablonlarını buradan kullanabilirsiniz'
        : 'Hazır dilekçe şablonlarından seçin';
    const showTemplateDetailPage = Boolean(selectedTemplate || isLoadingTemplate);

    const renderTemplateCard = (template: Template) => {
        const isCustom = template.isCustom === true;
        const realCustomId = isCustom ? template.id.replace('custom-', '') : null;
        const matchingCustom = realCustomId ? customTemplates.find(ct => ct.id === realCustomId) : null;

        return (
            <div
                key={template.id}
                onClick={() => {
                    if (isCustom && matchingCustom) {
                        openCustomTemplateAsDetail(matchingCustom);
                    } else {
                        fetchTemplateDetail(template.id);
                    }
                }}
                className={`bg-gray-800/50 border rounded-xl p-6 cursor-pointer hover:bg-gray-800 transition-all group ${isCustom ? 'border-blue-500/40 hover:border-blue-400' : 'border-gray-700 hover:border-red-500'
                    }`}
            >
                <div className="flex items-start justify-between mb-4">
                    <span className={`text-4xl ${isCustom ? 'text-blue-400' : 'text-red-500'}`}>
                        {(() => {
                            const Icon = IconMap[template.icon] || FileText;
                            return <Icon className="w-10 h-10" />;
                        })()}
                    </span>
                    <div className="flex items-center gap-2">
                        {isCustom && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs font-medium">
                                <User className="w-3 h-3" />
                                Kendi Şablonum
                            </span>
                        )}
                        {template.isPremium && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
                                <Crown className="w-3 h-3" />
                                Premium
                            </span>
                        )}
                    </div>
                </div>

                <h3 className={`text-lg font-semibold text-white mb-2 transition-colors ${isCustom ? 'group-hover:text-blue-400' : 'group-hover:text-red-400'
                    }`}>
                    {template.title}
                </h3>

                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {template.description}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="bg-gray-700 px-2 py-1 rounded">
                        {template.subcategory}
                    </span>
                    {isCustom && matchingCustom ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); openCustomTemplateModal(matchingCustom); }}
                                className="p-1 hover:bg-gray-600 rounded transition-colors"
                                title="Düzenle"
                            >
                                <Pencil className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteCustomTemplate(matchingCustom.id); }}
                                className="p-1 hover:bg-red-900/50 rounded transition-colors"
                                title="Sil"
                            >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                        </div>
                    ) : (
                        <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {template.usageCount} kullanim
                        </span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-white">
            <header className="premium-topbar sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button
                                onClick={onBack}
                                className="premium-back-button"
                                aria-label="Geri"
                            >
                                <ArrowLeft className="w-5 h-5 premium-back-icon" />
                                <span className="premium-back-label hidden sm:inline">Geri</span>
                            </button>
                            {user && (
                                <button
                                    onClick={() => openCustomTemplateModal()}
                                    className="premium-cta-button premium-cta-button--brand text-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Yeni Özel Şablon</span>
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setClientManagerMode('manage');
                                    setShowClientManager(true);
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
                            >
                                <Users className="w-4 h-4 text-red-500" />
                                <span className="hidden sm:inline">Muvekkillerim</span>
                            </button>
                            <div className="hidden sm:block">
                                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                    {pageTitle}
                                </h1>
                                <p className="text-sm text-gray-400 hidden md:block">{pageDescription}</p>
                            </div>
                        </div>

                        <div className="relative w-full sm:w-64 md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={isContractsNoticesView ? 'Sozlesme veya ihtarname ara...' : 'Sablon ara...'}
                                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {!isContractsNoticesView && (
                    <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                        {visibleCategories.map(category => (
                            <button
                                key={category.id}
                                onClick={() => setSelectedCategory(category.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${effectiveCategory === category.id
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                    }`}
                            >
                                <span>
                                    {(() => {
                                        const Icon = IconMap[category.icon] || FileText;
                                        return <Icon className="w-5 h-5" />;
                                    })()}
                                </span>
                                {category.name}
                            </button>
                        ))}
                    </div>
                )}

                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
                        <p className="text-gray-400">Şablonlar yükleniyor...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
                        {error}
                    </div>
                )}

                {!showTemplateDetailPage && !isLoading && !error && (
                    isContractsNoticesView ? (
                        <div className="space-y-10">
                            <section className="space-y-4">
                                <h2 className="text-2xl font-semibold text-white">Sozlesmeler</h2>
                                {contractsTemplates.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {contractsTemplates.map(renderTemplateCard)}
                                    </div>
                                ) : (
                                    <p className="text-gray-500">Sozlesme sablonu bulunamadi.</p>
                                )}
                            </section>

                            <section className="space-y-4">
                                <h2 className="text-2xl font-semibold text-white">Ihtarnameler</h2>
                                {noticesTemplates.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {noticesTemplates.map(renderTemplateCard)}
                                    </div>
                                ) : (
                                    <p className="text-gray-500">Ihtarname sablonu bulunamadi.</p>
                                )}
                            </section>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sectionTitle && (
                                <h2 className="text-2xl font-semibold text-white">{sectionTitle}</h2>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredTemplates.map(renderTemplateCard)}
                            </div>
                        </div>
                    )
                )}

                {!showTemplateDetailPage && !isLoading && !error && filteredTemplates.length === 0 && (
                    <div className="text-center py-20">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-400 mb-2">Şablon bulunamadı</h3>
                        <p className="text-gray-500">Farklı bir kategori veya arama terimi deneyin</p>
                    </div>
                )}
            </div>

            {showTemplateDetailPage && (
                <div className="max-w-7xl mx-auto px-4 pb-10">
                    <div className="bg-gray-900 rounded-3xl min-h-[calc(100vh-10rem)] flex flex-col border border-gray-700 shadow-2xl overflow-hidden">
                        {isLoadingTemplate ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
                            </div>
                        ) : selectedTemplate && (
                            <>
                                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="text-2xl sm:text-3xl text-red-500 flex-shrink-0">
                                            {(() => {
                                                const Icon = IconMap[selectedTemplate.icon] || FileText;
                                                return <Icon className="w-8 h-8 sm:w-10 sm:h-10" />;
                                            })()}
                                        </span>
                                        <div className="min-w-0">
                                            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{selectedTemplate.title}</h2>
                                            <p className="text-xs sm:text-sm text-gray-400">{selectedTemplate.subcategory}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={closeTemplateModal}
                                        className="inline-flex items-center gap-2 p-2 sm:px-4 sm:py-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0 ml-2 text-gray-300"
                                    >
                                        <>
                                            <ArrowLeft className="w-4 h-4" />
                                            <span className="hidden sm:inline">Listeye D?n</span>
                                        </>
                                    </button>
                                </div>

                                <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
                                    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.08fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-1 gap-4 sm:gap-6">
                                        <div className="min-h-0 bg-black/30 border border-gray-700 rounded-xl p-4 flex flex-col order-2 xl:order-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <FileText className="w-4 h-4 text-red-500" />
                                                <h3 className="font-semibold text-white">Dilekçe Önizleme</h3>
                                            </div>
                                            <p className="text-xs text-gray-400 mb-3">{previewHint}</p>
                                            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-700 bg-black/40 p-3">
                                                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200 font-serif">
                                                    {activePreviewContent || 'Önizleme için alanları doldurmaya başlayın.'}
                                                </pre>
                                            </div>
                                        </div>

                                        <div className="min-h-0 overflow-y-auto pr-1 pb-2 space-y-4 order-1 xl:order-1">
                                            <p className="text-gray-400 mb-4">{selectedTemplate.description}</p>

                                            <div className="flex items-center gap-2 bg-gray-800 p-1 rounded-xl border border-gray-700 mb-5">
                                                <button
                                                    onClick={() => setGenerationMode('single')}
                                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${generationMode === 'single'
                                                        ? 'bg-red-600 text-white'
                                                        : 'text-gray-300 hover:bg-gray-700'
                                                        }`}
                                                >
                                                    Tekli Doldur
                                                </button>
                                                <button
                                                    onClick={() => setGenerationMode('bulk')}
                                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${generationMode === 'bulk'
                                                        ? 'bg-red-600 text-white'
                                                        : 'text-gray-300 hover:bg-gray-700'
                                                        }`}
                                                >
                                                    <FileSpreadsheet className="w-4 h-4" />
                                                    Seri (Excel/CSV)
                                                </button>
                                            </div>

                                            {generationMode === 'single' && (
                                                <>
                                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                                        <Filter className="w-4 h-4 text-red-500" />
                                                        Bilgileri Doldurun
                                                    </h3>

                                                    <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-3">
                                                        <label className="flex items-center gap-2 text-sm text-gray-200">
                                                            <input
                                                                type="checkbox"
                                                                checked={isAiEnhanced}
                                                                onChange={(event) => setIsAiEnhanced(event.target.checked)}
                                                                className="rounded border-gray-500 bg-gray-700 text-red-600 focus:ring-red-500"
                                                            />
                                                            AI ile dilekçeyi zenginleştir
                                                        </label>
                                                        {isAiEnhanced && (
                                                            <p className="text-xs text-gray-400">
                                                                Seçilen kararlar ve alan değerleri alt uygulamada chatbot mantığı ile otomatik işlenecek.
                                                            </p>
                                                        )}

                                                        <div className="space-y-2">
                                                            <p className="text-xs text-gray-400">
                                                                MCP ile Yargıtay kararı ara ve seçilen kararlarını dilekçeye ekle.
                                                            </p>
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={mcpKeyword}
                                                                    onChange={(event) => setMcpKeyword(event.target.value)}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === 'Enter') {
                                                                            event.preventDefault();
                                                                            handleMcpSearch();
                                                                        }
                                                                    }}
                                                                    placeholder="Örn: kıdem tazminatı fesih haklı nedenle"
                                                                    className="flex-1 p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                                />
                                                                <button
                                                                    onClick={handleMcpSearch}
                                                                    disabled={isSearchingMcp || !mcpKeyword.trim()}
                                                                    className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/60 disabled:text-gray-500 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    {isSearchingMcp ? (
                                                                        <>
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                            Aranıyor...
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Search className="w-4 h-4" />
                                                                            Yargıtay Ara (MCP)
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {mcpSearchError && (
                                                            <div className="text-xs text-red-300 bg-red-900/30 border border-red-700 rounded-lg p-2">
                                                                {mcpSearchError}
                                                            </div>
                                                        )}

                                                        {selectedMcpDecisions.length > 0 && (
                                                            <div className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-700/60 rounded-lg p-2">
                                                                {selectedMcpDecisions.length} karar seçildi. Üretimde dilekçeye eklenecek.
                                                            </div>
                                                        )}

                                                        {mcpSearchResults.length > 0 && (
                                                            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                                                                {mcpSearchResults.slice(0, 12).map((decision, index) => {
                                                                    const selected = isMcpDecisionSelected(decision);
                                                                    const decisionKey = buildDecisionIdentity(decision) || `decision-${index}`;

                                                                    return (
                                                                        <button
                                                                            key={decisionKey}
                                                                            type="button"
                                                                            onClick={() => toggleMcpDecision(decision)}
                                                                            className={`w-full text-left p-3 rounded-lg border transition-colors ${selected
                                                                                ? 'border-red-500/70 bg-red-900/20'
                                                                                : 'border-gray-700 bg-gray-800/60 hover:border-gray-500'
                                                                                }`}
                                                                        >
                                                                            <div className="flex items-start justify-between gap-3">
                                                                                <div className="min-w-0">
                                                                                    <p className="text-sm text-white font-medium">{decision.title || 'Yargıtay Kararı'}</p>
                                                                                    <p className="text-xs text-gray-400 mt-1">
                                                                                        {decision.esasNo ? `E. ${decision.esasNo} ` : ''}
                                                                                        {decision.kararNo ? `K. ${decision.kararNo} ` : ''}
                                                                                        {decision.tarih ? `T. ${decision.tarih}` : ''}
                                                                                    </p>
                                                                                </div>
                                                                                <span className={`text-[11px] px-2 py-1 rounded-full border ${selected
                                                                                    ? 'border-red-500 text-red-300'
                                                                                    : 'border-gray-600 text-gray-300'
                                                                                    }`}>
                                                                                    {selected ? 'Eklendi' : 'Ekle'}
                                                                                </span>
                                                                            </div>
                                                                            {decision.ozet && (
                                                                                <p className="text-xs text-gray-300 mt-2 line-clamp-3">
                                                                                    {decision.ozet}
                                                                                </p>
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {selectedTemplate.variables.map(variable => (
                                                        <div key={variable.key}>
                                                            <div className="flex justify-between items-end mb-1">
                                                                <label className="block text-sm font-medium text-gray-300">
                                                                    {variable.label}
                                                                    {variable.required && <span className="text-red-500 ml-1">*</span>}
                                                                </label>

                                                                {isClientField(variable.key) && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setTargetVariablePrefix(variable.key);
                                                                            setClientManagerMode('select');
                                                                            setShowClientManager(true);
                                                                        }}
                                                                        className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors bg-red-900/20 px-2 py-0.5 rounded"
                                                                    >
                                                                        <UserPlus className="w-3 h-3" />
                                                                        Kişi Seç
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {variable.type === 'textarea' ? (
                                                                <textarea
                                                                    value={variableValues[variable.key] || ''}
                                                                    onChange={(event) => setVariableValues(prev => ({
                                                                        ...prev,
                                                                        [variable.key]: event.target.value,
                                                                    }))}
                                                                    placeholder={variable.placeholder}
                                                                    rows={3}
                                                                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                                />
                                                            ) : (
                                                                <input
                                                                    type={variable.type === 'date' ? 'date' : variable.type === 'number' ? 'number' : 'text'}
                                                                    value={variableValues[variable.key] || ''}
                                                                    onChange={(event) => setVariableValues(prev => ({
                                                                        ...prev,
                                                                        [variable.key]: event.target.value,
                                                                    }))}
                                                                    placeholder={variable.placeholder}
                                                                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </>
                                            )}

                                            {generationMode === 'bulk' && (
                                                <div className="space-y-5">
                                                    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                                                        <h3 className="font-semibold text-white flex items-center gap-2 mb-2">
                                                            <FileSpreadsheet className="w-4 h-4 text-red-500" />
                                                            Seri Dilekçe Üretimi
                                                        </h3>
                                                        <p className="text-sm text-gray-300 mb-4">
                                                            Excel/CSV yükleyin, kolonları şablon değişkenleriyle eşleyin ve tek tıkla toplu dilekçe paketi oluşturun.
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            <label className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg cursor-pointer transition-colors">
                                                                <Upload className="w-4 h-4" />
                                                                Excel/CSV Yükle
                                                                <input
                                                                    type="file"
                                                                    accept=".xlsx,.csv"
                                                                    className="hidden"
                                                                    onChange={handleSpreadsheetUpload}
                                                                />
                                                            </label>
                                                            <button
                                                                onClick={downloadSampleCsv}
                                                                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                                Şablon Oluştur (CSV)
                                                            </button>
                                                            <button
                                                                onClick={downloadSampleCsv}
                                                                className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                                                            >
                                                                <FileSpreadsheet className="w-4 h-4" />
                                                                Seri Dilekçe Şablonu
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-3">
                                                            Not: CSV dosyasını Excel ile açabilirsiniz. XLSX ve CSV desteklenir.
                                                        </p>
                                                    </div>

                                                    {bulkError && (
                                                        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 text-sm">
                                                            {bulkError}
                                                        </div>
                                                    )}

                                                    {bulkSuccess && (
                                                        <div className="bg-emerald-900/25 border border-emerald-700 text-emerald-200 rounded-lg p-3 text-sm">
                                                            {bulkSuccess}
                                                        </div>
                                                    )}

                                                    {bulkSheetData && (
                                                        <>
                                                            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-2">
                                                                <div className="flex items-center gap-2 text-sm text-gray-200">
                                                                    <Table className="w-4 h-4 text-red-400" />
                                                                    Dosya: <span className="font-semibold">{bulkSheetData.fileName}</span>
                                                                </div>
                                                                <p className="text-sm text-gray-300">
                                                                    {bulkSheetData.rows.length} veri satırı, {bulkSheetData.headers.length} kolon algılandı.
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {bulkSheetData.headers.slice(0, 20).map(header => (
                                                                        <span key={header} className="px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded border border-gray-600">
                                                                            {header}
                                                                        </span>
                                                                    ))}
                                                                    {bulkSheetData.headers.length > 20 && (
                                                                        <span className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600">
                                                                            +{bulkSheetData.headers.length - 20} kolon
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <h4 className="font-semibold text-white flex items-center gap-2">
                                                                    <Archive className="w-4 h-4 text-red-500" />
                                                                    Değişken - Kolon Eşleme
                                                                </h4>
                                                                {selectedTemplate.variables.map(variable => {
                                                                    const selectedHeader = bulkColumnMapping[variable.key] || '';
                                                                    const previewValue = selectedHeader ? (previewValueByHeader[selectedHeader] || '') : '';

                                                                    return (
                                                                        <div key={variable.key} className="border border-gray-700 rounded-lg p-3 bg-gray-800/40">
                                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                                <div>
                                                                                    <p className="text-sm font-medium text-white">
                                                                                        {variable.label}
                                                                                        {variable.required && <span className="text-red-500 ml-1">*</span>}
                                                                                    </p>
                                                                                    <p className="text-xs text-gray-500 mt-1">{variable.key}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs text-gray-400 mb-1">Kolon seçimi</label>
                                                                                    <select
                                                                                        value={selectedHeader}
                                                                                        onChange={(event) => setBulkColumnMapping(prev => ({
                                                                                            ...prev,
                                                                                            [variable.key]: event.target.value,
                                                                                        }))}
                                                                                        className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                                                                                    >
                                                                                        <option value="">Kolon eşleme yok</option>
                                                                                        {bulkSheetData.headers.map(header => (
                                                                                            <option key={header} value={header}>{header}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs text-gray-400 mb-1">Sabit değer (opsiyonel)</label>
                                                                                    <input
                                                                                        type="text"
                                                                                        value={bulkFallbackValues[variable.key] || ''}
                                                                                        onChange={(event) => setBulkFallbackValues(prev => ({
                                                                                            ...prev,
                                                                                            [variable.key]: event.target.value,
                                                                                        }))}
                                                                                        placeholder="Kolon boş ise kullanılır"
                                                                                        className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                                                    />
                                                                                    <p className="text-xs text-gray-500 mt-1 truncate">
                                                                                        Önizleme: {previewValue || bulkFallbackValues[variable.key] || '-'}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            <div className="flex items-center gap-2 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                                                                <input
                                                                    id="include-docx-in-bulk"
                                                                    type="checkbox"
                                                                    checked={includeDocxInBulk}
                                                                    onChange={(event) => setIncludeDocxInBulk(event.target.checked)}
                                                                    className="rounded border-gray-500 bg-gray-700 text-red-600 focus:ring-red-500"
                                                                />
                                                                <label htmlFor="include-docx-in-bulk" className="text-sm text-gray-200 cursor-pointer">
                                                                    Toplu çıktıya Word (.docx) dosyaları da eklensin
                                                                </label>
                                                            </div>

                                                            {isBulkGenerating && (
                                                                <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200">
                                                                    İşleniyor: {bulkProgress.current} / {bulkProgress.total}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 sm:p-6 border-t border-gray-700 flex gap-2 sm:gap-3">
                                    <button
                                        onClick={closeTemplateModal}
                                        className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                                    >
                                        İptal
                                    </button>
                                    {generationMode === 'single' ? (
                                        <button
                                            onClick={handleUseTemplate}
                                            disabled={isGenerating}
                                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    {isAiEnhanced ? 'AI ile geliştiriliyor...' : 'Oluşturuluyor...'}
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-5 h-5" />
                                                    Dilekçe Oluştur
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleBulkGenerate}
                                            disabled={!bulkSheetData || isBulkGenerating}
                                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            {isBulkGenerating ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Alt-app'e aktarılıyor...
                                                </>
                                            ) : (
                                                <>
                                                    <Archive className="w-5 h-5" />
                                                    Alt-app'te Onayla ve İndir
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {showClientManager && (
                <ClientManager
                    mode={clientManagerMode}
                    onClose={() => setShowClientManager(false)}
                    onSelect={(client: Client) => {
                        if (targetVariablePrefix) {
                            const updates: Record<string, string> = {};
                            updates[targetVariablePrefix] = client.name;

                            let groupPrefix = '';
                            if (targetVariablePrefix.endsWith('_AD')) {
                                groupPrefix = targetVariablePrefix.replace('_AD', '');
                            } else {
                                groupPrefix = targetVariablePrefix;
                            }

                            const findKey = (suffix: string) => {
                                return selectedTemplate?.variables.find(variable =>
                                    variable.key === `${groupPrefix}_${suffix}` ||
                                    variable.key === `${targetVariablePrefix}_${suffix}`
                                )?.key;
                            };

                            const tcKey = findKey('TC') || findKey('VKN') || findKey('TC_NO') || findKey('KIMLIK_NO');
                            if (tcKey) updates[tcKey] = client.tc_vk_no || '';

                            const addressKey = findKey('ADRES');
                            if (addressKey) updates[addressKey] = client.address || '';

                            const phoneKey = findKey('TELEFON');
                            if (phoneKey) updates[phoneKey] = client.phone || '';

                            setVariableValues(prev => ({ ...prev, ...updates }));
                            setShowClientManager(false);
                            setTargetVariablePrefix(null);
                        }
                    }}
                />
            )}

            {/* Özel Şablon Oluşturma/Düzenleme Modalı */}
            {showCustomTemplateModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
                                    <User className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">
                                        {editingCustomTemplate ? 'Şablonu Düzenle' : 'Yeni Özel Şablon'}
                                    </h2>
                                    <p className="text-xs text-gray-400">Kendi şablonunuzu oluşturun veya dosyadan yükleyin</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCustomTemplateModal(false)}
                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {customFormError && (
                                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">
                                    {customFormError}
                                </div>
                            )}

                            {/* Başlık */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Şablon Başlığı *</label>
                                <input
                                    type="text"
                                    value={customForm.title}
                                    onChange={(e) => setCustomForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Örn: İş Akdi Fesih İhbarnamesi"
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* Açıklama */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Açıklama</label>
                                <input
                                    type="text"
                                    value={customForm.description}
                                    onChange={(e) => setCustomForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Kısa açıklama"
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* Tür Seçimi */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Şablon Türü</label>
                                <div className="flex gap-2">
                                    {([
                                        { value: 'dilekce', label: 'Dilekçe' },
                                        { value: 'sozlesme', label: 'Sözleşme' },
                                        { value: 'ihtarname', label: 'İhtarname' },
                                    ] as const).map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => handleCustomTemplateTypeChange(opt.value)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${customForm.template_type === opt.value
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {customForm.template_type === 'dilekce' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Dilekçe Kategorisi *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PETITION_CATEGORY_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setCustomForm(prev => ({ ...prev, petition_category: opt.value }))}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${customForm.petition_category === opt.value
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Dosya Yükleme */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Dosyadan Yükle <span className="text-gray-500 font-normal">(opsiyonel)</span>
                                </label>
                                <label className="flex items-center gap-3 p-4 bg-gray-800/50 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-gray-800 transition-colors">
                                    <UploadCloud className="w-6 h-6 text-gray-400" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-300">
                                            {customForm.source_file_name || '.txt, .md veya .docx dosyası yükleyin'}
                                        </p>
                                        <p className="text-xs text-gray-500">İçerik ve {'{{ALAN}}'} değişkenleri otomatik çıkarılır</p>
                                    </div>
                                    <input
                                        type="file"
                                        accept=".txt,.md,.docx"
                                        onChange={handleCustomFileUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {/* İçerik */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Şablon İçeriği *
                                    <span className="text-gray-500 font-normal ml-2">{'{{DEGISKEN_ADI}}'} formatında değişken kullanın</span>
                                </label>
                                <textarea
                                    value={customForm.content}
                                    onChange={(e) => handleCustomContentChange(e.target.value)}
                                    placeholder={"Sayın {{MAHKEME_ADI}},\n\nDavacı: {{DAVACI_ADI}}\nDavalı: {{DAVALI_ADI}}\n\n...şablon içeriğiniz..."}
                                    rows={10}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm resize-y"
                                />
                            </div>

                            {/* Otomatik Tespit Edilen Değişkenler */}
                            {customFormVariables.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Tespit Edilen Değişkenler ({customFormVariables.length})
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {customFormVariables.map(v => (
                                            <span
                                                key={v.key}
                                                className="px-2.5 py-1 bg-blue-600/20 text-blue-400 rounded-md text-xs font-mono"
                                            >
                                                {`{{${v.key}}}`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Stil Notları */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Stil Notları (opsiyonel)</label>
                                <input
                                    type="text"
                                    value={customForm.style_notes}
                                    onChange={(e) => setCustomForm(prev => ({ ...prev, style_notes: e.target.value }))}
                                    placeholder="Örn: Resmi dil, kısa paragraflar"
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-700">
                            <button
                                onClick={() => setShowCustomTemplateModal(false)}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSaveCustomTemplate}
                                disabled={customFormSaving}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                            >
                                {customFormSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        {editingCustomTemplate ? 'Güncelle' : 'Kaydet'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

