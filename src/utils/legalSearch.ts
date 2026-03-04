import type { LegalSearchResult } from '../../types';
import { supabase } from '../../lib/supabase';

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

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Istek zaman asimina ugradi. Lutfen tekrar deneyin.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
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
        sourceUrl: result.sourceUrl || result.url || '',
        documentUrl: result.documentUrl || result.sourceUrl || result.url || '',
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
    const { data: { session } } = await supabase.auth.getSession();
    const authHeaders: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
        authHeaders.Authorization = `Bearer ${session.access_token}`;
    }

  let response = await fetchWithTimeout(`${apiBaseUrl}/api/legal/search-decisions`, {
    method: 'POST',
    headers: authHeaders,
    body,
  }, 18000);

  if (!response.ok) {
    response = await fetchWithTimeout(`${apiBaseUrl}/api/legal?action=search-decisions`, {
      method: 'POST',
      headers: authHeaders,
      body,
    }, 18000);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || 'Ictihat aramasi sirasinda bir hata olustu.');
  }

  const data = await response.json();
  return normalizeLegalSearchResults(data);
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
  const summaryFallback = [ozet, snippet].map(value => String(value || '').trim()).filter(Boolean).join('\n\n');
  const isSyntheticDocumentId = /^(search-|legal-|ai-summary)/i.test(String(documentId || ''));

  if (!documentUrl && isSyntheticDocumentId && summaryFallback) {
    return summaryFallback;
  }

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
  const { data: { session } } = await supabase.auth.getSession();
  const authHeaders: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    authHeaders.Authorization = `Bearer ${session.access_token}`;
  }

  let response = await fetchWithTimeout(`${apiBaseUrl}/api/legal/get-document`, {
    method: 'POST',
    headers: authHeaders,
    body,
  }, 18000);

  if (!response.ok) {
    response = await fetchWithTimeout(`${apiBaseUrl}/api/legal?action=get-document`, {
      method: 'POST',
      headers: authHeaders,
      body,
    }, 18000);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || 'Belge alinamadi.');
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
