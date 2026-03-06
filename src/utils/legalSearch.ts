import type { LegalSearchResult } from '../../types';
import { normalizeLegalSource } from './legalSource';

export interface NormalizedLegalDecision extends LegalSearchResult {
  id?: string;
  documentId?: string;
  snippet?: string;
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
  filters?: Record<string, any>;
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

const REQUEST_TIMEOUT_MS = Math.max(
  45000,
  Math.min(
    180000,
    Number((import.meta as any)?.env?.VITE_LEGAL_REQUEST_TIMEOUT_MS || 90000)
  )
);
const LEGAL_SEARCH_TIMEOUT_MESSAGE = `Ictihat aramasi zaman asimina ugradi (${Math.round(REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
const LEGAL_DOCUMENT_TIMEOUT_MESSAGE = `Karar metni alma islemi zaman asimina ugradi (${Math.round(REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
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
    .map(item => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (cleaned.length === 0) return '';

  const prioritized: string[] = [];
  const fallback: string[] = [];

  for (const keyword of cleaned) {
    const normalized = normalizeKeywordToken(keyword);
    if (!normalized) continue;
    const hasPriorityPhrase = LEGAL_QUERY_PRIORITY_PHRASES.some(phrase => normalized.includes(phrase));
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
    const nextLength = currentLength === 0
      ? nextValue.length
      : currentLength + 1 + nextValue.length;
    if (nextLength > maxLength) break;
    compacted.push(nextValue);
    currentLength = nextLength;
  }

  return compacted.join(' ').trim() || merged.slice(0, maxLength).trim();
};

const LEGAL_SEARCH_TEXT_STOPWORDS = new Set([
  've', 'veya', 'ile', 'icin', 'ama', 'fakat', 'gibi', 'daha', 'kadar',
  'olan', 'olanlar', 'olarak', 'bu', 'su', 'o', 'bir', 'iki', 'uc',
  'de', 'da', 'mi', 'mu', 'ki', 'ya', 'yada', 'hem',
  'en', 'cok', 'az', 'sonra', 'once', 'son', 'ilk', 'her', 'tum',
  'hakkinda', 'oldu', 'olur', 'olsun', 'uzerinde', 'suretiyle',
  'yonelik', 'iliskin', 'dair', 'dolayi', 'nedeniyle', 'kapsaminda',
  'aciklanan', 'hususlar', 'mevcut', 'birlikte', 'degerlendirilerek',
  'anlasilmakla', 'kanaatine', 'varildigi', 'itibar', 'edilmedigi',
  'yeterli', 'isiginda', 'dogrultusunda', 'yapilan', 'alinan',
  'tespit', 'edilen', 'isimli', 'sahislardan', 'tarihli',
]);

const LEGAL_SEARCH_TEXT_PHRASE_ANCHORS = [
  'itirazin iptali', 'zaman asimi', 'icra takibi', 'borca itiraz',
  'menfi tespit', 'konkordato', 'iflasin ertelenmesi', 'tasarrufun iptali',
  'kacak elektrik', 'tespit tutanagi', 'muhur fekki', 'idari islemin iptali',
  'tam yargi davasi', 'yurutmenin durdurulmasi', 'kamulastirma bedeli',
  'idari para cezasi', 'imar kanunu', 'imar barisi', 'yapi kayit belgesi',
  'ruhsatsiz yapi', 'yapi tatil tutanagi', 'sit alani', 'gecici 16',
  'encumen karari', 'muhurleme karari', 'yikim karari', 'imar mevzuatina aykirilik',
  'kasten oldurme', 'uyusturucu madde', 'haksiz tahrik', 'gorevi kotuye kullanma',
  'ise iade', 'fazla mesai alacagi', 'kidem tazminati', 'ihbar tazminati',
  'is akdi feshi', 'iscilik alacagi', 'kamu davasi', 'uyusturucu madde satisi',
  'bilirkisi raporu', 'kullanici tanik', 'materyal mukayese', 'kriminal rapor',
  'fiziki takip', 'arama karari', 'tutuklama', 'tahliye',
];

export const compactLegalSearchQuery = (
  rawText: string,
  options?: { preserveKeywords?: string[]; maxLength?: number }
): string => {
  const trimmed = String(rawText || '').trim();
  if (trimmed.length <= 300) return trimmed;

  const normalized = normalizeKeywordToken(trimmed);
  const matchedPhrases: string[] = [];
  const seenPhrases = new Set<string>();
  const addPhrase = (value: string, force = false) => {
    const normalizedValue = normalizeKeywordToken(value);
    if (!normalizedValue || seenPhrases.has(normalizedValue)) return;
    if (!force && !normalized.includes(normalizedValue)) return;
    seenPhrases.add(normalizedValue);
    matchedPhrases.push(normalizedValue);
  };

  const preserveKeywordList = Array.isArray(options?.preserveKeywords) ? options.preserveKeywords : [];
  const preservedKeywords = preserveKeywordList
    .map((value) => normalizeKeywordToken(value))
    .filter((value) => value.length >= 3)
    .slice(0, 12);

  for (const keyword of preservedKeywords) {
    addPhrase(keyword, true);
  }

  for (const phrase of LEGAL_SEARCH_TEXT_PHRASE_ANCHORS) {
    if (matchedPhrases.length >= 12) break;
    if (normalized.includes(phrase)) {
      addPhrase(phrase, true);
    }
  }

  const tokens = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !LEGAL_SEARCH_TEXT_STOPWORDS.has(token));

  const seen = new Set(matchedPhrases.flatMap((phrase) => phrase.split(' ')));
  const uniqueTokens: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token) && uniqueTokens.length < 20) {
      seen.add(token);
      uniqueTokens.push(token);
    }
  }

  const parts = [...matchedPhrases, ...uniqueTokens];
  let result = parts.join(' ').trim();
  const maxLength = Math.max(180, Math.min(700, Number(options?.maxLength) || 500));
  if (result.length > maxLength) {
    result = result.slice(0, maxLength).trim();
  }

  return result || trimmed.slice(0, 300);
};

const isAbortLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const anyError = error as { name?: string; message?: string };
  const name = String(anyError.name || '').toLowerCase();
  const message = String(anyError.message || '').toLowerCase();
  return name === 'aborterror' || message.includes('aborted') || message.includes('abort');
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> => {
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

  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
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

  const contentArrays = [payload?.results?.content, payload?.content, payload?.result?.content].filter(Array.isArray);
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
      ].some(value => typeof value === 'string' && value.trim().length > 0);

      if (!hasCoreFields) return null;

      const mahkeme = result.mahkeme || result.court || '';
      const daire = result.daire || result.chamber || '';
      const title = (result.title || `${mahkeme || 'Yargitay'} ${daire}`.trim() || `Karar ${index + 1}`).trim();
      const relevanceScore = Number(result.relevanceScore);
      const ozet = (result.ozet || result.snippet || result.summary || '').toString();

      return {
        id: result.id || result.documentId || `legal-${index + 1}`,
        documentId: result.documentId || result.id || undefined,
        title,
        esasNo: result.esasNo || result.esas_no || '',
        kararNo: result.kararNo || result.karar_no || '',
        tarih: result.tarih || result.date || '',
        daire,
        ozet,
        source: normalizeLegalSource(result.source) || payloadSource || undefined,
        snippet: result.snippet || ozet,
        relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : undefined,
      };
    })
    .filter((result): result is NormalizedLegalDecision => Boolean(result && (result.title || result.ozet)));

  const seen = new Set<string>();
  return mapped.filter(result => {
    const key = getLegalResultIdentityKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const searchLegalDecisions = async ({
  source,
  keyword,
  filters = {},
  apiBaseUrl = '',
}: SearchLegalDecisionsParams): Promise<NormalizedLegalDecision[]> => {
  const payload = { source, keyword, filters };
  const body = JSON.stringify(payload);
  const headers = await buildJsonHeaders();
  const endpoint = `${apiBaseUrl}/api/legal/search-decisions`;
  const retries = [endpoint, `${endpoint}?retry=1`, `${endpoint}?retry=2` /* Removed the action fallback as it's not handled by the new server path */];

  let lastErrorText = '';
  let lastStatus = 0;
  let timedOut = false;

  for (const url of retries) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body,
      });

      if (response.ok) {
        const data = await response.json();
        return normalizeLegalSearchResults(data);
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

  if (timedOut) {
    throw new Error(LEGAL_SEARCH_TIMEOUT_MESSAGE);
  }

  // Try to parse JSON error response for a cleaner message
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
    // If it's HTML or non-JSON, strip tags
    if (lastErrorText.includes('<html') || lastErrorText.includes('<!DOCTYPE')) {
      cleanError = `Ictihat arama servisi yanit vermedi (HTTP ${lastStatus || 500}).`;
    }
  }

  throw new Error(cleanError || `Ictihat aramasi sirasinda bir hata olustu (HTTP ${lastStatus || 500}).`);
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
  const retries = [endpoint, `${endpoint}?retry=1`, `${apiBaseUrl}/api/legal?action=get-document`];

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
