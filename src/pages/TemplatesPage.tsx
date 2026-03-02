import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { marked } from 'marked';
import { ClientManager } from '../components/ClientManager';
import { Client } from '../types';
import { searchLegalDecisions, type NormalizedLegalDecision } from '../utils/legalSearch';

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
}

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
        throw new Error('XLSX worksheet okunamadi.');
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
    throw new Error('Desteklenmeyen format. Lutfen .xlsx veya .csv yukleyin.');
};

const scoreHeaderMatch = (variableCandidate: string, headerCandidate: string): number => {
    if (!variableCandidate || !headerCandidate) return 0;
    if (variableCandidate === headerCandidate) return 100;
    if (variableCandidate.replace(/_/g, '') === headerCandidate.replace(/_/g, '')) return 95;
    if (headerCandidate.includes(variableCandidate) || variableCandidate.includes(headerCandidate)) return 80;

    const variableTokens = variableCandidate.split('_').filter(token => token.length > 1);
    const headerTokens = headerCandidate.split('_').filter(token => token.length > 1);
    const commonTokenCount = variableTokens.filter(token => headerTokens.includes(token)).length;
    if (commonTokenCount === 0) return 0;

    const allTokensMatched = commonTokenCount === variableTokens.length;
    return (commonTokenCount * 15) + (allTokensMatched ? 20 : 0);
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

    return Array.from(aliases);
};

const inferColumnMapping = (variables: TemplateVariable[], headers: string[]): Record<string, string> => {
    const normalizedHeaders = headers.map(header => ({
        raw: header,
        normalized: normalizeLookupKey(header),
    }));

    const result: Record<string, string> = {};

    variables.forEach(variable => {
        const aliases = getVariableAliases(variable);
        let best: { header: string; score: number } | null = null;

        normalizedHeaders.forEach(headerInfo => {
            aliases.forEach(alias => {
                const score = scoreHeaderMatch(alias, headerInfo.normalized);
                if (!best || score > best.score) {
                    best = { header: headerInfo.raw, score };
                }
            });
        });

        if (best && best.score >= 30) {
            result[variable.key] = best.header;
        }
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
        decision.title || 'Yargitay Karari',
        decision.esasNo ? `E. ${decision.esasNo}` : '',
        decision.kararNo ? `K. ${decision.kararNo}` : '',
        decision.tarih ? `T. ${decision.tarih}` : '',
    ].filter(Boolean).join(' - ');

    const summary = (decision.ozet || '').trim();
    return summary ? `${citation}\n  Ozet: ${summary}` : citation;
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
            setError(fetchError instanceof Error ? fetchError.message : 'Bir hata olustu');
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
            const results = await searchLegalDecisions({
                source: 'yargitay',
                keyword,
                apiBaseUrl: API_BASE_URL,
            });
            setMcpSearchResults(results);
        } catch (searchError) {
            const message = searchError instanceof Error ? searchError.message : 'MCP Yargitay aramasinda hata olustu.';
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
            'GOREV: Asagidaki Turkce hukuk dilekce taslagini profesyonel bir hukuk dili ile gelistir.',
            'KURALLAR:',
            '- Baslik yapisini koru.',
            '- Somut olgu uydurma, sadece verilen bilgi ve taslaktan ilerle.',
            '- Etiket gibi duran metinleri (ornegin "TC Kimlik No", "Ise Giris Tarihi") hukuki anlatima uygun hale getir.',
            '- Bilgi eksikse [ ... ] yaz.',
            selectedMcpDecisions.length > 0
                ? '- Secilen MCP Yargitay kararlarini gerekce ve talep bolumunde atif yaparak kullan.'
                : '- Hukuki gerekceyi guclendirirken metni bos birakma.',
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
            '[CIKTI]',
            'Sadece iyilestirilmis nihai dilekce metnini dondur.',
        ].join('\n');

        const response = await fetch(`${API_BASE_URL}/api/gemini/rewrite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ textToRewrite: enhancementPrompt }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(errorText || 'AI zenginlestirme basarisiz oldu.');
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
            const transferContext: TemplateTransferContext = {
                source: 'templates_page',
                templateId: selectedTemplate.id,
                templateTitle: selectedTemplate.title,
                templateCategory: selectedTemplate.category,
                templateSubcategory: selectedTemplate.subcategory,
                variableValues: { ...variableValues },
                selectedDecisions: selectedMcpDecisions.map(decision => ({
                    title: decision.title || 'Yargitay Karari',
                    esasNo: decision.esasNo || '',
                    kararNo: decision.kararNo || '',
                    tarih: decision.tarih || '',
                    daire: decision.daire || '',
                    ozet: decision.ozet || '',
                    relevanceScore: decision.relevanceScore,
                })),
                aiRequested: isAiEnhanced,
                createdAt: new Date().toISOString(),
            };

            onUseTemplate(mergedContent, transferContext);
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
            setBulkSuccess(`${sheetData.rows.length} satir yuklendi. Kolon eslemeleri otomatik onerildi.`);
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : 'Dosya okunurken hata olustu.';
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

        variables.forEach(variable => {
            const mappedColumn = bulkColumnMapping[variable.key];
            const mappedValue = mappedColumn ? row[mappedColumn] || '' : '';
            const fallbackValue = bulkFallbackValues[variable.key] || '';
            rowValues[variable.key] = (mappedValue || fallbackValue || '').trim();
        });

        return rowValues;
    };

    const validateBulkRows = (rows: Record<string, string>[], variables: TemplateVariable[]) => {
        const missingRequiredMappings = variables.filter(variable => {
            if (!variable.required) return false;
            const hasColumn = Boolean(bulkColumnMapping[variable.key]);
            const hasFallback = Boolean((bulkFallbackValues[variable.key] || '').trim());
            return !hasColumn && !hasFallback;
        });

        if (missingRequiredMappings.length > 0) {
            return `Zorunlu alanlar eslenmedi: ${missingRequiredMappings.map(field => field.label || field.key).join(', ')}`;
        }

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
        ? 'Kolon eslemeleri ve sabit degerler degistikce onizleme otomatik guncellenir.'
        : 'Sag taraftaki alanlari doldurdukca onizleme canli olarak guncellenir.';

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

            let generatedRows: Array<{ index: number; variables: Record<string, string>; content: string }> = [];

            try {
                const bulkResponse = await fetch(`${API_BASE_URL}/api/templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedTemplate.id,
                        rows: rowVariablePayload,
                    }),
                });

                if (!bulkResponse.ok) {
                    throw new Error(`Template bulk endpoint hatasi: ${bulkResponse.status}`);
                }

                const bulkData = await bulkResponse.json();
                if (Array.isArray(bulkData.rows)) {
                    generatedRows = deepSanitizeText(bulkData.rows);
                }
            } catch (bulkFillError) {
                console.warn('Bulk template endpoint failed, local fill fallback will be used:', bulkFillError);
            }

            if (generatedRows.length === 0) {
                generatedRows = rowVariablePayload.map((variables, index) => ({
                    index,
                    variables,
                    content: replaceTemplateVariables(selectedTemplate.content, variables),
                }));
            }

            const zip = new JSZip();
            const failedDocxRows: string[] = [];
            const usedNames = new Set<string>();

            for (let index = 0; index < generatedRows.length; index += 1) {
                const generatedRow = generatedRows[index];
                const values = generatedRow?.variables || rowVariablePayload[index] || {};
                const content = typeof generatedRow?.content === 'string'
                    ? generatedRow.content
                    : replaceTemplateVariables(selectedTemplate.content, values);

                const preferredName =
                    Object.entries(values).find(([key, value]) => key.endsWith('_AD') && value.trim())?.[1] ||
                    values[selectedTemplate.variables[0]?.key] ||
                    '';

                let fileBase = sanitizeFileName(`${index + 1}_${preferredName || 'dilekce'}`);
                while (usedNames.has(fileBase)) {
                    fileBase = `${fileBase}_${index + 1}`;
                }
                usedNames.add(fileBase);

                zip.file(`${fileBase}.txt`, content);

                if (includeDocxInBulk) {
                    try {
                        const response = await fetch('/api/html-to-docx', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                html: markdownToHtml(content),
                                options: {
                                    font: 'Calibri',
                                    fontSize: '22',
                                },
                            }),
                        });

                        if (!response.ok) {
                            throw new Error(`DOCX endpoint hatasi: ${response.status}`);
                        }

                        const docxBuffer = await response.arrayBuffer();
                        zip.file(`${fileBase}.docx`, docxBuffer);
                    } catch (docxError) {
                        const reason = docxError instanceof Error ? docxError.message : 'Bilinmeyen hata';
                        failedDocxRows.push(`Satir ${index + 2}: ${reason}`);
                    }
                }

                setBulkProgress({ current: index + 1, total: generatedRows.length });
            }

            if (failedDocxRows.length > 0) {
                zip.file('_docx_hatalari.txt', failedDocxRows.join('\n'));
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${sanitizeFileName(selectedTemplate.title)}_seri_dilekceler.zip`);

            if (failedDocxRows.length === 0) {
                setBulkSuccess(`${bulkSheetData.rows.length} satir icin seri dilekce paketi olusturuldu.`);
            } else {
                setBulkSuccess(`${bulkSheetData.rows.length} satir icin paket olusturuldu. ${failedDocxRows.length} satirda DOCX olusturma hatasi var; detaylar ZIP icindeki _docx_hatalari.txt dosyasinda.`);
            }
        } catch (generationError) {
            const message = generationError instanceof Error ? generationError.message : 'Seri uretim sirasinda hata olustu.';
            setBulkError(message);
        } finally {
            setIsBulkGenerating(false);
        }
    };

    const templatesBySelectedCategory = useMemo(() => {
        return templates.filter(template => {
            const section = resolveTemplateSection(template);

            if (effectiveCategory === CONTRACTS_NOTICES_CATEGORY) {
                return section === 'contracts' || section === 'notices';
            }
            if (effectiveCategory === 'templates') return section === 'other';
            if (effectiveCategory === 'contracts') return section === 'contracts';
            if (effectiveCategory === 'notices') return section === 'notices';
            return true;
        });
    }, [templates, effectiveCategory]);

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
        ? 'Tum sozlesme ve ihtarname sablonlarini buradan kullanabilirsiniz'
        : 'Hazir dilekce sablonlarindan secin';

    const renderTemplateCard = (template: Template) => (
        <div
            key={template.id}
            onClick={() => fetchTemplateDetail(template.id)}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 cursor-pointer hover:border-red-500 hover:bg-gray-800 transition-all group"
        >
            <div className="flex items-start justify-between mb-4">
                <span className="text-4xl text-red-500">
                    {(() => {
                        const Icon = IconMap[template.icon] || FileText;
                        return <Icon className="w-10 h-10" />;
                    })()}
                </span>
                {template.isPremium && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
                        <Crown className="w-3 h-3" />
                        Premium
                    </span>
                )}
            </div>

            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-red-400 transition-colors">
                {template.title}
            </h3>

            <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {template.description}
            </p>

            <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="bg-gray-700 px-2 py-1 rounded">
                    {template.subcategory}
                </span>
                <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {template.usageCount} kullanim
                </span>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-white">
            <header className="border-b border-gray-700 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
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

                {!isLoading && !error && (
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

                {!isLoading && !error && filteredTemplates.length === 0 && (
                    <div className="text-center py-20">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-400 mb-2">Şablon bulunamadı</h3>
                        <p className="text-gray-500">Farkli bir kategori veya arama terimi deneyin</p>
                    </div>
                )}
            </div>

            {(selectedTemplate || isLoadingTemplate) && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-2">
                    <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:w-[96vw] 2xl:max-w-[1800px] h-[96vh] sm:h-[92vh] flex flex-col border-t sm:border border-gray-700 shadow-2xl overflow-hidden">
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
                                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0 ml-2"
                                    >
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
                                    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-1 gap-4 sm:gap-6">
                                        <div className="min-h-0 bg-black/30 border border-gray-700 rounded-xl p-4 flex flex-col">
                                            <div className="flex items-center gap-2 mb-2">
                                                <FileText className="w-4 h-4 text-red-500" />
                                                <h3 className="font-semibold text-white">Dilekce Onizleme</h3>
                                            </div>
                                            <p className="text-xs text-gray-400 mb-3">{previewHint}</p>
                                            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-700 bg-black/40 p-3">
                                                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200 font-serif">
                                                    {activePreviewContent || 'Onizleme icin alanlari doldurmaya baslayin.'}
                                                </pre>
                                            </div>
                                        </div>

                                        <div className="min-h-0 overflow-y-auto pr-1 pb-2 space-y-4">
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
                                                    AI ile dilekceyi zenginlestir
                                                </label>
                                                {isAiEnhanced && (
                                                    <p className="text-xs text-gray-400">
                                                        Secilen kararlar ve alan degerleri alt uygulamada chatbot mantigi ile otomatik islenecek.
                                                    </p>
                                                )}

                                                <div className="space-y-2">
                                                    <p className="text-xs text-gray-400">
                                                        MCP ile Yargitay karari ara ve secilen kararlarini dilekceye ekle.
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
                                                            placeholder="Orn: kidem tazminati fesih hakli nedenle"
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
                                                                    Araniyor...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Search className="w-4 h-4" />
                                                                    Yargitay Ara (MCP)
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
                                                        {selectedMcpDecisions.length} karar secildi. Uretimde dilekceye eklenecek.
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
                                                                            <p className="text-sm text-white font-medium">{decision.title || 'Yargitay Karari'}</p>
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
                                                                Kisi Sec
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
                                                    Seri Dilekce Uretimi
                                                </h3>
                                                <p className="text-sm text-gray-300 mb-4">
                                                    Excel/CSV yükleyin, kolonları şablon değişkenleriyle eşleyin ve tek tıkla toplu dilekçe paketi oluşturun.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg cursor-pointer transition-colors">
                                                        <Upload className="w-4 h-4" />
                                                        Excel/CSV Yukle
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
                                                        Sablon Olustur (CSV)
                                                    </button>
                                                    <button
                                                        onClick={downloadSampleCsv}
                                                        className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                                                    >
                                                        <FileSpreadsheet className="w-4 h-4" />
                                                        Seri Dilekce Sablonu
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-3">
                                                    Not: CSV dosyasini Excel ile acabilirsiniz. XLSX ve CSV desteklenir.
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
                                                            {bulkSheetData.rows.length} veri satiri, {bulkSheetData.headers.length} kolon algilandi.
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
                                                            Degisken - Kolon Esleme
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
                                                                            <label className="block text-xs text-gray-400 mb-1">Kolon secimi</label>
                                                                            <select
                                                                                value={selectedHeader}
                                                                                onChange={(event) => setBulkColumnMapping(prev => ({
                                                                                    ...prev,
                                                                                    [variable.key]: event.target.value,
                                                                                }))}
                                                                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                                                                            >
                                                                                <option value="">Kolon esleme yok</option>
                                                                                {bulkSheetData.headers.map(header => (
                                                                                    <option key={header} value={header}>{header}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs text-gray-400 mb-1">Sabit deger (opsiyonel)</label>
                                                                            <input
                                                                                type="text"
                                                                                value={bulkFallbackValues[variable.key] || ''}
                                                                                onChange={(event) => setBulkFallbackValues(prev => ({
                                                                                    ...prev,
                                                                                    [variable.key]: event.target.value,
                                                                                }))}
                                                                                placeholder="Kolon bos ise kullanilir"
                                                                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                                            />
                                                                            <p className="text-xs text-gray-500 mt-1 truncate">
                                                                                Onizleme: {previewValue || bulkFallbackValues[variable.key] || '-'}
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
                                                            Toplu ciktiya Word (.docx) dosyalari da eklensin
                                                        </label>
                                                    </div>

                                                    {isBulkGenerating && (
                                                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200">
                                                            Isleniyor: {bulkProgress.current} / {bulkProgress.total}
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
                                        Iptal
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
                                                    {isAiEnhanced ? 'Alt uygulamaya aktariliyor...' : 'Olusturuluyor...'}
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-5 h-5" />
                                                    Dilekce Olustur
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
                                                    Seri paket hazirlaniyor...
                                                </>
                                            ) : (
                                                <>
                                                    <Archive className="w-5 h-5" />
                                                    Seri Dilekce Paketi Uret
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
        </div>
    );
};





