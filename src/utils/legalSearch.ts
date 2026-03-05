import type { LegalSearchResult } from '../../types';

export interface NormalizedLegalDecision extends LegalSearchResult {
  id?: string;
  documentId?: string;
  snippet?: string;
  [key: string]: any;
}

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

const REQUEST_TIMEOUT_MS = 35000;
const LEGAL_SEARCH_TIMEOUT_MESSAGE = `Ictihat aramasi zaman asimina ugradi (${Math.round(REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;
const LEGAL_DOCUMENT_TIMEOUT_MESSAGE = `Karar metni alma islemi zaman asimina ugradi (${Math.round(REQUEST_TIMEOUT_MS / 1000)} sn). Lutfen tekrar deneyin.`;

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
        snippet: result.snippet || ozet,
        relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : undefined,
      };
    })
    .filter((result): result is NormalizedLegalDecision => Boolean(result && (result.title || result.ozet)));

  const seen = new Set<string>();
  return mapped.filter(result => {
    const key = `${result.title}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
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
  const retries = [endpoint, `${endpoint}?retry=1`, `${apiBaseUrl}/api/legal?action=search-decisions`];

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

  throw new Error(lastErrorText || `Ictihat aramasi sirasinda bir hata olustu (HTTP ${lastStatus || 500}).`);
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
