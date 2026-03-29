import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
    analyzeDocuments: vi.fn(),
    searchLegalDecisionsDetailed: vi.fn(),
    getLegalDocument: vi.fn(),
    compactLegalSearchQuery: vi.fn((value: string) => String(value || '').trim()),
    clipboardWriteText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/geminiService', () => ({
    analyzeDocuments: hookMocks.analyzeDocuments,
}));

vi.mock('../src/utils/legalSearch', () => ({
    compactLegalSearchQuery: hookMocks.compactLegalSearchQuery,
    getLegalDocument: hookMocks.getLegalDocument,
    searchLegalDecisionsDetailed: hookMocks.searchLegalDecisionsDetailed,
}));

import EmsalPanel from '../src/components/EmsalPanel';

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
            title: 'Yargitay 3. Hukuk Dairesi Karari',
            daire: '3. Hukuk Dairesi',
            esasNo: '2024/10',
            kararNo: '2024/20',
            tarih: '01.01.2024',
            ozet: 'Tahliye karari ozeti',
            documentUrl: 'https://example.com/karar/doc-1',
            sourceUrl: 'https://example.com/karar/doc-1',
        },
    ],
    diagnostics: {},
};

class MockFileReader {
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

    readAsDataURL(file: File) {
        this.result = `data:${file.type || 'application/pdf'};base64,UERGREFUQQ==`;
        if (this.onload) {
            this.onload.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>);
        }
    }
}

describe('EmsalPanel', () => {
    beforeEach(() => {
        hookMocks.analyzeDocuments.mockReset();
        hookMocks.searchLegalDecisionsDetailed.mockReset();
        hookMocks.getLegalDocument.mockReset();
        hookMocks.compactLegalSearchQuery.mockClear();
        hookMocks.clipboardWriteText.mockClear();
        vi.unstubAllGlobals();

        hookMocks.analyzeDocuments.mockResolvedValue(analysisPayload);
        hookMocks.searchLegalDecisionsDetailed.mockResolvedValue(searchResponse);
        hookMocks.getLegalDocument.mockResolvedValue('Tam metin icerigi burada.');

        vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: hookMocks.clipboardWriteText,
            },
            configurable: true,
        });
    });

    it('searches by text and renders the analysis summary plus decisions', async () => {
        render(<EmsalPanel />);

        fireEvent.change(screen.getByRole('textbox', { name: /emsal arama metni/i }), {
            target: { value: 'Kiraci kira bedelini odemiyor' },
        });
        fireEvent.click(screen.getByRole('button', { name: /emsal ara/i }));

        await waitFor(() => {
            expect(screen.getByText('Kira uyusmazligi')).toBeInTheDocument();
            expect(screen.getAllByText('3. Hukuk Dairesi').length).toBeGreaterThan(0);
            expect(screen.getByText('TBK 315')).toBeInTheDocument();
            expect(screen.getByText('Yargitay 3. Hukuk Dairesi Karari')).toBeInTheDocument();
        });

        expect(hookMocks.analyzeDocuments).toHaveBeenCalledWith([], 'Kiraci kira bedelini odemiyor', '');
        expect(hookMocks.searchLegalDecisionsDetailed).toHaveBeenCalledWith(expect.objectContaining({
            documentAnalyzerResult: expect.objectContaining({
                davaKonusu: 'borclar_kira',
                ilgiliKanunlar: expect.arrayContaining(['TBK 315']),
            }),
        }));

        expect(screen.getByRole('link', { name: /kaynak/i })).toHaveAttribute(
            'href',
            'https://example.com/karar/doc-1'
        );
    }, 10000);

    it('uploads PDF/Word files as base64 before searching', async () => {
        render(<EmsalPanel />);

        const file = new File(['fake pdf'], 'dosya.pdf', { type: 'application/pdf' });
        fireEvent.change(screen.getByLabelText(/emsal belge yükle/i), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(hookMocks.analyzeDocuments).toHaveBeenCalledWith([
                expect.objectContaining({
                    name: 'legal-search-upload',
                    mimeType: 'application/pdf',
                    data: 'UERGREFUQQ==',
                }),
            ], '', '');
        });

        await waitFor(() => {
            expect(screen.getByText('Yargitay 3. Hukuk Dairesi Karari')).toBeInTheDocument();
        });
    });

    it('loads full text lazily, reuses the cache, and copies the text', async () => {
        render(<EmsalPanel />);

        fireEvent.change(screen.getByRole('textbox', { name: /emsal arama metni/i }), {
            target: { value: 'Kiraci kira bedelini odemiyor' },
        });
        fireEvent.click(screen.getByRole('button', { name: /emsal ara/i }));

        await waitFor(() => {
            expect(screen.getByText('Yargitay 3. Hukuk Dairesi Karari')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /tam metin/i }));

        await waitFor(() => {
            expect(screen.getByText('Tam metin icerigi burada.')).toBeInTheDocument();
        });
        expect(hookMocks.getLegalDocument).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /^kopyala$/i }));
        await waitFor(() => {
            expect(hookMocks.clipboardWriteText).toHaveBeenCalledWith('Tam metin icerigi burada.');
        });
        expect(screen.getByRole('button', { name: /kopyalandı/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /kapat/i }));
        fireEvent.click(screen.getByRole('button', { name: /tam metin/i }));

        await waitFor(() => {
            expect(screen.getByText('Tam metin icerigi burada.')).toBeInTheDocument();
        });
        expect(hookMocks.getLegalDocument).toHaveBeenCalledTimes(1);
    }, 10000);
});
