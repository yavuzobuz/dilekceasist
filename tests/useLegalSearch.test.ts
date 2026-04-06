import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
    analyzeDocuments: vi.fn(),
    searchLegalDecisionsDetailed: vi.fn(),
    getLegalDocument: vi.fn(),
    compactLegalSearchQuery: vi.fn((value: string) => String(value || '').trim()),
}));

vi.mock('../services/geminiService', () => ({
    analyzeDocuments: hookMocks.analyzeDocuments,
}));

vi.mock('../src/utils/legalSearch', () => ({
    compactLegalSearchQuery: hookMocks.compactLegalSearchQuery,
    getLegalDocument: hookMocks.getLegalDocument,
    searchLegalDecisionsDetailed: hookMocks.searchLegalDecisionsDetailed,
}));

import { useLegalSearch } from '../src/hooks/useLegalSearch';

const analysisPayload = {
    summary: 'Kiracinin kira bedelini odememesi nedeniyle temerrut ve tahliye tartisilmaktadir.',
    potentialParties: [],
    caseDetails: {
        caseTitle: 'Kira uyusmazligi',
        court: '',
        fileNumber: '',
        decisionNumber: '',
        decisionDate: '',
    },
    legalSearchPacket: {
        primaryDomain: 'borclar',
        caseType: 'borclar_kira',
        coreIssue: 'Kiracinin temerrudu nedeniyle tahliye',
        requiredConcepts: ['tahliye', 'temerrut'],
        supportConcepts: ['ihtarname', 'TBK 315'],
        negativeConcepts: ['ceza'],
        preferredSource: 'yargitay',
        searchSeedText: 'kira temerrut tahliye',
        searchVariants: [
            { query: 'kira temerrut tahliye', mode: 'strict' },
        ],
        queryMode: 'long_fact',
    },
    analysisInsights: {
        caseType: 'kira uyusmazligi',
        coreIssue: 'Kiracinin temerrudu nedeniyle tahliye',
        legalIssues: ['TBK 315 uygulamasi'],
    },
};

const searchResponse = {
    normalizedResults: [
        {
            documentId: 'doc-1',
            source: 'yargitay',
            title: 'Yargitay 3. Hukuk Dairesi',
            daire: '3. Hukuk Dairesi',
            esasNo: '2024/10',
            kararNo: '2024/20',
            tarih: '01.01.2024',
            ozet: 'Tahliye karari ozeti',
        },
    ],
    diagnostics: {},
};

describe('useLegalSearch', () => {
    beforeEach(() => {
        hookMocks.analyzeDocuments.mockReset();
        hookMocks.searchLegalDecisionsDetailed.mockReset();
        hookMocks.getLegalDocument.mockReset();
        hookMocks.compactLegalSearchQuery.mockClear();
    });

    it('analyzes text input, sends documentAnalyzerResult to legal search, and stores results', async () => {
        hookMocks.analyzeDocuments.mockResolvedValueOnce(analysisPayload);
        hookMocks.searchLegalDecisionsDetailed.mockResolvedValueOnce(searchResponse);

        const { result } = renderHook(() => useLegalSearch());

        let searchResults: any[] = [];
        await act(async () => {
            searchResults = await result.current.search({
                text: 'Kiraci kira bedelini odemiyor ve tahliye talep ediliyor.',
            });
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.decisions).toHaveLength(1);
        });

        expect(searchResults).toHaveLength(1);
        expect(hookMocks.analyzeDocuments).toHaveBeenCalledWith([], 'Kiraci kira bedelini odemiyor ve tahliye talep ediliyor.', '');
        expect(hookMocks.searchLegalDecisionsDetailed).toHaveBeenCalledWith(expect.objectContaining({
            source: 'all',
            documentAnalyzerResult: expect.objectContaining({
                kaynak: 'bedesten',
                courtTypes: ['YARGITAYKARARI'],
                aramaIfadeleri: ['kira temerrut tahliye', 'Kiraci kira bedelini odemiyor ve tahliye talep ediliyor.'],
                mustKavramlar: expect.arrayContaining(['tahliye', 'temerrut']),
                supportKavramlar: expect.arrayContaining(['ihtarname', 'TBK 315']),
            }),
        }));
        expect(result.current.analysis?.documentAnalyzerResult?.mustKavramlar).toEqual(expect.arrayContaining(['tahliye', 'temerrut']));
        expect(result.current.error).toBeNull();
    });

    it('supports base64 input and caches full text after the first fetch', async () => {
        hookMocks.analyzeDocuments.mockResolvedValueOnce(analysisPayload);
        hookMocks.searchLegalDecisionsDetailed.mockResolvedValueOnce(searchResponse);
        hookMocks.getLegalDocument.mockResolvedValueOnce('Kararin tam metni');

        const { result } = renderHook(() => useLegalSearch());

        await act(async () => {
            await result.current.search({
                documentBase64: 'JVBERi0xLjQK',
                mimeType: 'application/pdf',
            });
        });

        let firstContent = '';
        let secondContent = '';
        await act(async () => {
            firstContent = await result.current.fetchFullText('doc-1');
            secondContent = await result.current.fetchFullText('doc-1');
        });

        expect(hookMocks.analyzeDocuments).toHaveBeenCalledWith([
            {
                name: 'legal-search-upload',
                mimeType: 'application/pdf',
                data: 'JVBERi0xLjQK',
            },
        ], '', '');
        expect(firstContent).toBe('Kararin tam metni');
        expect(secondContent).toBe('Kararin tam metni');
        expect(hookMocks.getLegalDocument).toHaveBeenCalledTimes(1);
        expect(result.current.fullTextCache['doc-1']).toBe('Kararin tam metni');
    });

    it('fills error state and resolves without throwing when search fails', async () => {
        hookMocks.analyzeDocuments.mockRejectedValueOnce(new Error('Analyzer failed'));

        const { result } = renderHook(() => useLegalSearch());

        let resolved: any[] = ['placeholder'];
        await act(async () => {
            resolved = await result.current.search({
                text: 'Hatali arama',
            });
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(resolved).toEqual([]);
        expect(result.current.error).toBe('Analyzer failed');
        expect(result.current.decisions).toEqual([]);
    });
});
