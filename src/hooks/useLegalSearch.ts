import { useRef, useState } from 'react';
import { analyzeDocuments } from '../../services/geminiService';
import type { AnalysisData, UploadedFile } from '../../types';
import {
    compactLegalSearchQuery,
    getLegalDocument,
    searchLegalDecisionsDetailed,
    type DocumentAnalyzerResult,
    type NormalizedLegalDecision,
} from '../utils/legalSearch';
import { resolveLegalSourceForQuery } from '../utils/legalSource';
import { buildDocumentAnalyzerResult as buildSharedDocumentAnalyzerResult } from '../../lib/assistant/legal-search-context.js';

export interface UseLegalSearchParams {
    text?: string;
    documentBase64?: string;
    mimeType?: string;
}

export type LegalSearchAnalysis = AnalysisData & {
    documentAnalyzerResult: DocumentAnalyzerResult | null;
};

const buildUploadedFiles = ({
    documentBase64,
    mimeType,
}: UseLegalSearchParams): UploadedFile[] => {
    const encoded = String(documentBase64 || '').trim();
    if (!encoded) return [];

    return [{
        name: 'legal-search-upload',
        mimeType: String(mimeType || 'application/pdf').trim() || 'application/pdf',
        data: encoded,
    }];
};

const getDecisionId = (decision: Partial<NormalizedLegalDecision>, fallback = ''): string =>
    String(decision.documentId || decision.id || fallback || '').trim();

const shouldFetchDocumentFromApi = (decision: Partial<NormalizedLegalDecision>, documentId: string): boolean => {
    const resolvedId = getDecisionId(decision, documentId);
    const hasSyntheticId = /^(search-|legal-|ai-summary|sem-|template-decision-)/i.test(resolvedId);
    const hasDocumentUrl = Boolean(String(decision.documentUrl || decision.sourceUrl || '').trim());
    return hasDocumentUrl || !hasSyntheticId;
};

export const useLegalSearch = () => {
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<LegalSearchAnalysis | null>(null);
    const [decisions, setDecisions] = useState<NormalizedLegalDecision[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [fullTextCache, setFullTextCache] = useState<Record<string, string>>({});

    const decisionsRef = useRef<NormalizedLegalDecision[]>([]);
    const fullTextCacheRef = useRef<Record<string, string>>({});

    const search = async (params: UseLegalSearchParams): Promise<NormalizedLegalDecision[]> => {
        setLoading(true);
        setError(null);
        setDecisions([]);
        decisionsRef.current = [];

        try {
            const text = String(params.text || '').trim();
            const uploadedFiles = buildUploadedFiles(params);

            if (!text && uploadedFiles.length === 0) {
                throw new Error('Arama icin metin veya belge gereklidir.');
            }

            let analysisData: AnalysisData | null = null;
            try {
                analysisData = await analyzeDocuments(uploadedFiles, text, '');
            } catch {
                analysisData = null;
            }
            const documentAnalyzerResult = analysisData
                ? buildSharedDocumentAnalyzerResult(analysisData, text) as DocumentAnalyzerResult | null
                : null;
            const analysisState: LegalSearchAnalysis | null = analysisData
                ? {
                    ...analysisData,
                    documentAnalyzerResult,
                }
                : null;
            const rawQuery =
                text
                || analysisData?.summary
                || documentAnalyzerResult?.aramaIfadeleri?.[0]
                || documentAnalyzerResult?.hukukiMesele
                || '';
            const keyword = compactLegalSearchQuery(rawQuery) || rawQuery;

            setAnalysis(analysisState);

            const detailedResult = await searchLegalDecisionsDetailed({
                source: 'all',
                keyword,
                rawQuery,
                documentAnalyzerResult,
                filters: { searchArea: 'auto' },
                searchMode: 'pro',
            });

            const normalizedResults = detailedResult.normalizedResults || [];
            decisionsRef.current = normalizedResults;
            setDecisions(normalizedResults);
            return normalizedResults;
        } catch (searchError) {
            const message = searchError instanceof Error
                ? searchError.message
                : 'Ictihat aramasi sirasinda bir hata olustu.';
            decisionsRef.current = [];
            setDecisions([]);
            setError(message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const fetchFullText = async (documentId: string): Promise<string> => {
        const normalizedDocumentId = String(documentId || '').trim();
        if (!normalizedDocumentId) {
            setError('Belge kimligi bulunamadi.');
            return '';
        }

        const cachedText = fullTextCacheRef.current[normalizedDocumentId];
        if (typeof cachedText === 'string') {
            return cachedText;
        }

        const matchedDecision = decisionsRef.current.find((decision) =>
            getDecisionId(decision, normalizedDocumentId) === normalizedDocumentId
        );

        if (!matchedDecision) {
            setError('Belge arama sonuclarinda bulunamadi.');
            return '';
        }

        if (!shouldFetchDocumentFromApi(matchedDecision, normalizedDocumentId)) {
            const unsupportedMessage = 'Bu karar icin tam metin getirilemiyor.';
            fullTextCacheRef.current = {
                ...fullTextCacheRef.current,
                [normalizedDocumentId]: unsupportedMessage,
            };
            setFullTextCache((prev) => ({
                ...prev,
                [normalizedDocumentId]: unsupportedMessage,
            }));
            return unsupportedMessage;
        }

        try {
            setError(null);
            const documentSource =
                String(matchedDecision.source || '').trim()
                || resolveLegalSourceForQuery(
                    [
                        analysis?.summary || '',
                        matchedDecision.title || '',
                        matchedDecision.daire || '',
                        matchedDecision.documentUrl || matchedDecision.sourceUrl || '',
                    ],
                    'all'
                );

            const content = await getLegalDocument({
                source: documentSource,
                documentId: normalizedDocumentId,
                documentUrl: matchedDecision.documentUrl || matchedDecision.sourceUrl,
                title: matchedDecision.title,
                esasNo: matchedDecision.esasNo,
                kararNo: matchedDecision.kararNo,
                tarih: matchedDecision.tarih,
                daire: matchedDecision.daire,
                ozet: matchedDecision.ozet,
                snippet: matchedDecision.snippet,
            });

            const normalizedContent = String(content || '').trim();
            fullTextCacheRef.current = {
                ...fullTextCacheRef.current,
                [normalizedDocumentId]: normalizedContent,
            };
            setFullTextCache((prev) => ({
                ...prev,
                [normalizedDocumentId]: normalizedContent,
            }));
            return normalizedContent;
        } catch (documentError) {
            const message = documentError instanceof Error
                ? documentError.message
                : 'Karar tam metni alinamadi.';
            setError(message);
            return '';
        }
    };

    return {
        search,
        fetchFullText,
        loading,
        analysis,
        decisions,
        error,
        fullTextCache,
    };
};
