import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cliBridgeMocks = vi.hoisted(() => ({
    searchDecisionsViaYargiCli: vi.fn(),
    getDocumentViaYargiCli: vi.fn(),
    isYargiCliLikelyAvailable: vi.fn(() => true),
}));

const embeddingRerankerMocks = vi.hoisted(() => ({
    isEmbeddingRerankEnabled: vi.fn(() => false),
    getEmbedding: vi.fn(),
    computeEmbeddingScore: vi.fn(async () => 0),
    mergeDocumentScores: vi.fn(({
        lexicalScore = 0,
        embeddingScore = 0,
        proceduralShellBias = false,
    } = {}) => {
        const normalizedLexical = Math.min(Math.max(Number(lexicalScore || 0) / 1000, 0), 1);
        const normalizedEmbedding = Math.min(Math.max(Number(embeddingScore || 0), 0), 1);
        return proceduralShellBias
            ? Math.min(0.39, normalizedLexical * 0.35)
            : (normalizedLexical * 0.65) + (normalizedEmbedding * 0.35);
    }),
}));

vi.mock('../lib/legal/cliBedestenBridge.js', () => ({
    searchDecisionsViaYargiCli: cliBridgeMocks.searchDecisionsViaYargiCli,
    getDocumentViaYargiCli: cliBridgeMocks.getDocumentViaYargiCli,
    isYargiCliLikelyAvailable: cliBridgeMocks.isYargiCliLikelyAvailable,
}));

vi.mock('../lib/legal/embeddingReranker.js', () => ({
    isEmbeddingRerankEnabled: embeddingRerankerMocks.isEmbeddingRerankEnabled,
    getEmbedding: embeddingRerankerMocks.getEmbedding,
    computeEmbeddingScore: embeddingRerankerMocks.computeEmbeddingScore,
    mergeDocumentScores: embeddingRerankerMocks.mergeDocumentScores,
}));

import {
    __testables,
    getLegalDocumentViaSimpleBedesten,
    searchLegalDecisionsViaSimpleBedesten,
    supportsSimpleBedestenDocument,
    supportsSimpleBedestenSearch,
} from '../lib/legal/simpleBedestenService.js';

const createJsonResponse = (payload: any, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const createDocumentResponse = (text: string, mimeType = 'text/plain') =>
    createJsonResponse({
        data: {
            content: Buffer.from(text, 'utf-8').toString('base64'),
            mimeType,
        },
    });

describe('simpleBedestenService', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        cliBridgeMocks.searchDecisionsViaYargiCli.mockReset();
        cliBridgeMocks.getDocumentViaYargiCli.mockReset();
        cliBridgeMocks.isYargiCliLikelyAvailable.mockReset();
        cliBridgeMocks.isYargiCliLikelyAvailable.mockReturnValue(true);
        embeddingRerankerMocks.isEmbeddingRerankEnabled.mockReset();
        embeddingRerankerMocks.getEmbedding.mockReset();
        embeddingRerankerMocks.computeEmbeddingScore.mockReset();
        embeddingRerankerMocks.mergeDocumentScores.mockReset();
        embeddingRerankerMocks.mergeDocumentScores.mockImplementation(({
            lexicalScore = 0,
            embeddingScore = 0,
            proceduralShellBias = false,
        } = {}) => {
            const normalizedLexical = Math.min(Math.max(Number(lexicalScore || 0) / 1000, 0), 1);
            const normalizedEmbedding = Math.min(Math.max(Number(embeddingScore || 0), 0), 1);
            return proceduralShellBias
                ? Math.min(0.39, normalizedLexical * 0.35)
                : (normalizedLexical * 0.65) + (normalizedEmbedding * 0.35);
        });
        embeddingRerankerMocks.isEmbeddingRerankEnabled.mockReturnValue(false);
        embeddingRerankerMocks.computeEmbeddingScore.mockResolvedValue(0);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefers agent searchSeedText over keyword and rawQuery in CLI mode', async () => {
        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([
            {
                documentId: 'cli-1',
                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                birimAdi: '9. Hukuk Dairesi',
                esasNo: '2024/91',
                kararNo: '2024/145',
                kararTarihiStr: '10.03.2024',
            },
        ]);
        cliBridgeMocks.getDocumentViaYargiCli.mockResolvedValue({
            documentId: 'cli-1',
            markdownContent: 'Ise iade, gecersiz fesih ve ise baslatmama tazminati talebi esastan degerlendirilmistir.',
            mimeType: 'text/plain',
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            keyword: 'bunu bizim kod yazmis olsun',
            rawQuery: 'Ise iade ve gecersiz fesih nedeniyle ise baslatmama tazminati talebi.',
            filters: { searchArea: 'hukuk' },
            provider: 'auto',
            legalSearchPacket: {
                searchSeedText: 'Ise iade gecersiz fesih',
                caseType: 'Ise iade',
                requiredConcepts: ['gecersiz fesih'],
            },
        });

        expect(cliBridgeMocks.searchDecisionsViaYargiCli).toHaveBeenCalledTimes(2);
        expect(cliBridgeMocks.getDocumentViaYargiCli).toHaveBeenCalledTimes(1);
        expect(
            cliBridgeMocks.searchDecisionsViaYargiCli.mock.calls.some(([request]) =>
                String(request?.phrase || '').toLocaleLowerCase('tr-TR').includes('ise iade')
                && String(request?.phrase || '').toLocaleLowerCase('tr-TR').includes('gecersiz fesih')
            )
        ).toBe(true);
        expect(payload.results.length).toBeLessThanOrEqual(1);
        expect(payload.results[0].documentId).toBe('cli-1');
        expect(payload.results[0].source).toBe('yargitay');
        expect(payload.retrievalDiagnostics.provider).toBe('cli');
        expect(payload.retrievalDiagnostics.contentRerankApplied).toBe(true);
        expect(['packet_search_seed', 'packet_required_concepts', 'packet_search_variant']).toContain(payload.retrievalDiagnostics.searchPhraseSource);
    });

    it('can use CLI transport for simple document retrieval when requested', async () => {
        cliBridgeMocks.getDocumentViaYargiCli.mockResolvedValue({
            documentId: '998877',
            markdownContent: '# Karar\n\nDavaci haklidir.',
            sourceUrl: 'https://mevzuat.adalet.gov.tr/ictihat/998877',
            mimeType: 'text/html',
        });

        const payload = await getLegalDocumentViaSimpleBedesten({
            source: 'yargitay',
            documentId: '998877',
            provider: 'cli',
        });

        expect(cliBridgeMocks.getDocumentViaYargiCli).toHaveBeenCalledTimes(1);
        expect(payload.document).toContain('Davaci haklidir.');
        expect(payload.diagnostics.provider).toBe('cli');
    });

    it('filters incompatible CLI raw results instead of leaking them to the final list', async () => {
        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([
            {
                documentId: 'cli-low-1',
                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                birimAdi: '4. Ceza Dairesi',
                esasNo: '2024/91',
                kararNo: '2024/145',
                kararTarihiStr: '10.03.2024',
            },
        ]);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'ise iade',
            filters: { searchArea: 'hukuk' },
            provider: 'cli',
        });

        expect(payload.results).toHaveLength(0);
        expect(payload.retrievalDiagnostics.zeroResultReason).toBe('no_candidates');
    });

    it('does not request query embeddings when there are no rerank candidates', async () => {
        embeddingRerankerMocks.isEmbeddingRerankEnabled.mockReturnValue(true);
        embeddingRerankerMocks.getEmbedding.mockResolvedValue([0.9, 0.1, 0.2]);
        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([]);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Uyusturucu madde ticareti TCK 188 fiziki takip',
            filters: { searchArea: 'ceza' },
            provider: 'cli',
        });

        expect(payload.results).toHaveLength(0);
        expect(embeddingRerankerMocks.getEmbedding).not.toHaveBeenCalled();
    });

    it('uses the raw CLI result list for ceza queries too', async () => {
        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([
            {
                documentId: 'cli-ceza-1',
                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                birimAdi: '10. Ceza Dairesi',
                esasNo: '2024/91',
                kararNo: '2024/145',
                kararTarihiStr: '10.03.2024',
            },
        ]);
        cliBridgeMocks.getDocumentViaYargiCli.mockResolvedValue({
            documentId: 'cli-ceza-1',
            markdownContent: 'Uyusturucu madde ticareti, TCK 188, fiziki takip ve paketleme emareleri birlikte degerlendirilmistir.',
            mimeType: 'text/plain',
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Uyusturucu madde ticareti TCK 188 fiziki takip ve paketleme',
            filters: { searchArea: 'ceza' },
            provider: 'cli',
        });

        expect(payload.results.length).toBeLessThanOrEqual(1);
        expect(payload.results[0].documentId).toBe('cli-ceza-1');
        expect(cliBridgeMocks.getDocumentViaYargiCli).toHaveBeenCalledTimes(1);
    });

    it('tries agent provided CLI query variants sequentially and keeps the first successful one in diagnostics', async () => {
        cliBridgeMocks.searchDecisionsViaYargiCli
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    documentId: 'cli-variant-1',
                    itemType: { name: 'ISTINAFHUKUK', description: 'Istinaf Karari' },
                    birimAdi: 'Istanbul BAM 1. Hukuk Dairesi',
                    esasNo: '2024/11',
                    kararNo: '2024/22',
                    kararTarihiStr: '05.02.2024',
                },
            ]);
        cliBridgeMocks.getDocumentViaYargiCli.mockResolvedValue({
            documentId: 'cli-variant-1',
            markdownContent: 'Istinaf sure asimi ve karar kaldirma talebi hakkinda esastan inceleme yapilmistir.',
            mimeType: 'text/plain',
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'deneme aramasi',
            filters: { searchArea: 'bam' },
            provider: 'cli',
            legalSearchPacket: {
                searchSeedText: '',
                searchVariants: [
                    { query: '"alpha strict"', mode: 'strict' },
                    { query: '"beta broad"', mode: 'broad' },
                ],
                fallbackToNext: true,
            },
        });

        expect(cliBridgeMocks.searchDecisionsViaYargiCli).toHaveBeenCalledTimes(2);
        expect(payload.results.length).toBeLessThanOrEqual(1);
        expect(payload.retrievalDiagnostics.queryVariants.length).toBeGreaterThanOrEqual(2);
        expect(payload.retrievalDiagnostics.selectedQueryVariant).toBe('"beta broad"');
        expect(payload.retrievalDiagnostics.searchPhrase).toBe('"beta broad"');
        expect(payload.retrievalDiagnostics.searchVariantMode).toBe('broad');
    });

    it('caps CLI variants in auto mode and avoids HTTP fallback when CLI attempts fail', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const timeoutError = new Error('Yargi CLI zaman asimina ugradi.');
        (timeoutError as any).code = 'yargi_cli_timeout';

        cliBridgeMocks.searchDecisionsViaYargiCli
            .mockRejectedValueOnce(timeoutError)
            .mockResolvedValueOnce([]);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Uyusturucu madde ticareti TCK 188 kullanma siniri',
            filters: { searchArea: 'ceza' },
            provider: 'cli',
            legalSearchPacket: {
                primaryDomain: 'ceza',
                searchVariants: [
                    { query: '"strict one"', mode: 'strict' },
                    { query: '"broad two"', mode: 'broad' },
                    { query: '"statute three"', mode: 'statute' },
                ],
            },
        });

        expect(cliBridgeMocks.searchDecisionsViaYargiCli).toHaveBeenCalledTimes(6);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(payload.results).toHaveLength(0);
        expect(payload.retrievalDiagnostics.queryVariants).toEqual(['"strict one"', '"broad two"']);
        expect(payload.retrievalDiagnostics.cliVariantLimitApplied).toBe(2);
        expect(payload.retrievalDiagnostics.searchVariantAttempts.some((attempt) =>
            attempt?.query === '"strict one"'
            && attempt?.errorCode === 'yargi_cli_timeout'
            && attempt?.status === 'error'
        )).toBe(true);
        expect(payload.retrievalDiagnostics.searchVariantAttempts.some((attempt) =>
            attempt?.query === '"broad two"'
        )).toBe(true);
    });

    it('falls through to HTTP search in auto mode when CLI returns empty results', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    emsalKararList: [
                        {
                            documentId: 'http-1',
                            itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                            birimAdi: '10. Ceza Dairesi',
                            esasNo: '2024/91',
                            kararNo: '2024/145',
                            kararTarihiStr: '10.03.2024',
                        },
                    ],
                    total: 1,
                },
            }))
            .mockResolvedValueOnce(createDocumentResponse('Uyuşturucu ticareti ve paketleme olgusu birlikte değerlendirilmiştir.'));
        vi.stubGlobal('fetch', fetchMock);

        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([]);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Uyusturucu madde ticareti TCK 188 fiziki takip ve paketleme',
            filters: { searchArea: 'ceza' },
            provider: 'auto',
        });

        expect(cliBridgeMocks.searchDecisionsViaYargiCli).toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalled();
        expect(payload.results).toHaveLength(1);
        expect(payload.results[0].documentId).toBe('http-1');
        expect(payload.retrievalDiagnostics.provider).toBe('http');
        expect(payload.retrievalDiagnostics.fallbackUsed).toBe(true);
        expect(payload.retrievalDiagnostics.fallbackReason).toBe('cli_empty_results');
        expect(payload.retrievalDiagnostics.searchVariantAttempts.length).toBeGreaterThan(0);
    });

    it('builds a required-term variant from a compact legal query', () => {
        expect(__testables.buildRequiredTermVariant('ise iade gecersiz fesih')).toBe(
            '+"ise iade" gecersiz fesih'
        );
    });

    it('builds a quoted required-phrase variant in Yargitay search syntax', () => {
        expect(__testables.buildQuotedRequiredPhraseVariant('cocugun cinsel istismari kisiyi hurriyetinden yoksun kilma')).toBe(
            '+"cocugun cinsel istismari" "kisiyi hurriyetinden yoksun kilma"'
        );
    });

    it('runs one extra query variant in pro mode after an empty first response', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({ data: { emsalKararList: [], total: 0 } }))
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    emsalKararList: [
                        {
                            documentId: '445566',
                            itemType: { name: 'ISTINAFHUKUK', description: 'Istinaf Karari' },
                            birimAdi: 'Istanbul BAM 1. Hukuk Dairesi',
                            esasNo: '2024/11',
                            kararNo: '2024/22',
                            kararTarihiStr: '05.02.2024',
                        },
                    ],
                    total: 1,
                },
            }))
            .mockResolvedValueOnce(createDocumentResponse('Istinaf sure asimi ve karar kaldirma degerlendirmesi.'));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Istinaf sure asimi nedeniyle karar kaldirma talebi.',
            searchMode: 'pro',
            filters: { searchArea: 'bam' },
        });
        const firstRequestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(firstRequestBody.data.pageSize).toBe(25);
        expect(payload.results).toHaveLength(1);
        expect(payload.retrievalDiagnostics.queryVariants.length).toBeGreaterThanOrEqual(2);
        expect(payload.retrievalDiagnostics.zeroResultReason).toBeNull();
        expect(payload.retrievalDiagnostics.contentRerankApplied).toBe(true);
    });

    it('reranks pro results with document content so substantive matches beat procedural ones', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createDocumentResponse('CMK 294, CMK 298, temyiz isteminin reddi ve karsi oy gerekcesi tartisilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Sanik hakkinda TCK 188 ve TCK 191 ayrimi, ticaret kasti, kisisel kullanim siniri, fiziki takip ve kullanici tanik beyanlari degerlendirilmistir.'));
        vi.stubGlobal('fetch', fetchMock);

        const reranked = await __testables.rerankResultsByDocumentContent({
            enabled: true,
            primaryDomain: 'ceza',
            querySeedText: 'Uyusturucu madde ticareti sucu TCK 188 Kullanmak icin bulundurma sucu TCK 191',
            rawText: 'Ticaret kasti, kisisel kullanim siniri, fiziki takip ve tanik beyanlari tartismasi.',
            source: 'yargitay',
            results: [
                { documentId: 'doc-1', title: '20. Ceza Dairesi 2019/265 E. 2019/1502 K.', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-2', title: '10. Ceza Dairesi 2025/8690 E. 2026/32 K.', daire: '10. Ceza Dairesi', source: 'yargitay' },
            ],
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(reranked.results[0].documentId).toBe('doc-2');
        expect(reranked.results[0].contentMatchedPhrases?.length).toBeGreaterThan(0);
        expect(reranked.results[0].contentMatchedQueryCore?.length).toBeGreaterThan(0);
        expect(reranked.results[0].contentMatchedSubstantive?.length).toBeGreaterThan(0);
    });

    it('reranks beyond the first five candidates when a later document matches the real dispute better', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createDocumentResponse('Temyiz isteminin reddi, CMK 294 ve CMK 298 tartisilmakta, karsi oy gerekcesi bulunmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Istinaf sure asimi ve usulden ret tartisilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Gorev yonunden ret ve karar kaldirma nedenleri degerlendirilmektedir.'))
            .mockResolvedValueOnce(createDocumentResponse('Yetki yonunden ret ve ilk inceleme sorunlari anlatilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Kesinlik siniri ve dava sarti eksikligi tartisilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Sanik hakkinda TCK 188 ve TCK 191 ayrimi, ticaret kasti, kisisel kullanim siniri, fiziki takip, paketleme ve kullanici tanik beyanlari birlikte degerlendirilmistir.'));
        vi.stubGlobal('fetch', fetchMock);

        const reranked = await __testables.rerankResultsByDocumentContent({
            enabled: true,
            primaryDomain: 'ceza',
            querySeedText: 'Uyusturucu madde ticareti sucu TCK 188 Kullanmak icin bulundurma sucu TCK 191',
            rawText: 'Ticaret kasti, kisisel kullanim siniri, fiziki takip ve kullanici tanik tartismasi.',
            source: 'yargitay',
            results: [
                { documentId: 'doc-1', title: '20. Ceza Dairesi 1', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-2', title: '20. Ceza Dairesi 2', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-3', title: '20. Ceza Dairesi 3', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-4', title: '20. Ceza Dairesi 4', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-5', title: '20. Ceza Dairesi 5', daire: '20. Ceza Dairesi', source: 'yargitay' },
                { documentId: 'doc-6', title: '10. Ceza Dairesi 6', daire: '10. Ceza Dairesi', source: 'yargitay' },
            ],
        });

        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(reranked.results[0].documentId).toBe('doc-6');
        expect(reranked.diagnostics.rerankedCount).toBe(6);
    });

    it('stages a larger metadata pool but caps full-text fetches to the configured doc limit', async () => {
        embeddingRerankerMocks.isEmbeddingRerankEnabled.mockReturnValue(false);
        cliBridgeMocks.getDocumentViaYargiCli.mockImplementation(async ({ documentId }: any) => {
            if (documentId === 'doc-91') {
                return {
                    documentId,
                    markdownContent: 'Sanik hakkinda TCK 188 ve TCK 191 ayrimi, ticaret kasti, kisisel kullanim siniri, fiziki takip, paketleme ve kullanici tanik beyanlari birlikte degerlendirilmistir.',
                    mimeType: 'text/plain',
                };
            }

            return {
                documentId,
                markdownContent: 'Temyiz isteminin reddi, CMK 294 ve CMK 298 ile usulden ret ve karsi oy gerekcesi tartisilmistir.',
                mimeType: 'text/plain',
            };
        });

        const results = Array.from({ length: 120 }, (_, index) => {
            const docNumber = index + 1;
            const isSpecial = docNumber === 91;
            return {
                documentId: `doc-${docNumber}`,
                title: isSpecial
                    ? '10. Ceza Dairesi 2025/91 E. 2025/191 K. Uyusturucu madde ticareti TCK 188 TCK 191'
                    : `20. Ceza Dairesi Procedural ${docNumber}`,
                daire: isSpecial ? '10. Ceza Dairesi' : '20. Ceza Dairesi',
                source: 'yargitay',
                summaryText: isSpecial
                    ? 'TCK 188 ve TCK 191 ayrimi, ticaret kasti, kisisel kullanim siniri, fiziki takip ve paketleme degerlendirilmistir.'
                    : 'Temyiz isteminin reddi ve usulden ret tartisilmistir.',
            };
        });

        const reranked = await __testables.rerankResultsByDocumentContent({
            enabled: true,
            primaryDomain: 'ceza',
            querySeedText: 'Uyusturucu madde ticareti sucu TCK 188 Kullanmak icin bulundurma sucu TCK 191',
            rawText: 'Ticaret kasti, kisisel kullanim siniri, fiziki takip ve kullanici tanik tartismasi.',
            source: 'yargitay',
            provider: 'cli',
            results,
        });

        expect(cliBridgeMocks.getDocumentViaYargiCli).toHaveBeenCalledTimes(25);
        expect(reranked.diagnostics.metadataCandidateCount).toBe(120);
        expect(reranked.diagnostics.docFetchCount).toBe(25);
        expect(reranked.results[0].documentId).toBe('doc-91');
        expect(reranked.results[0].contentMetadataScore).toBeGreaterThan(0);
    });

    it('pushes idare substantive matches above procedural Danistay decisions', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createDocumentResponse('Sure asimi, usulden ret ve ilk inceleme asamasinda gorev yonunden ret tartisilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Idari islem iptal davasi, tam yargi talebi, hizmet kusuru, olcululuk ve hukuki guvenlik ilkeleri birlikte degerlendirilmistir.'));
        vi.stubGlobal('fetch', fetchMock);

        const reranked = await __testables.rerankResultsByDocumentContent({
            enabled: true,
            primaryDomain: 'idare',
            querySeedText: 'Idari islem iptal davasi tam yargi hizmet kusuru',
            rawText: 'Belediye islemine karsi iptal ve tam yargi istemi, hizmet kusuru ve olcululuk tartismasi.',
            source: 'danistay',
            results: [
                { documentId: 'doc-1', title: '6. Daire 2024/11 E. 2025/15 K.', daire: '6. Daire', source: 'danistay' },
                { documentId: 'doc-2', title: '8. Daire 2024/71 E. 2025/91 K.', daire: '8. Daire', source: 'danistay' },
            ],
        });

        expect(reranked.results[0].documentId).toBe('doc-2');
        expect(reranked.results[0].contentMatchedSubstantive?.length).toBeGreaterThanOrEqual(1);
    });

    it('passes long_fact queryMode into mergeDocumentScores and uses the 0.55 embedding branch', async () => {
        embeddingRerankerMocks.isEmbeddingRerankEnabled.mockReturnValue(true);
        embeddingRerankerMocks.getEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        embeddingRerankerMocks.computeEmbeddingScore.mockResolvedValue(0.6);
        embeddingRerankerMocks.mergeDocumentScores.mockImplementation(({
            lexicalScore = 0,
            embeddingScore = 0,
            proceduralShellBias = false,
            queryMode = 'default',
        } = {}) => {
            expect(queryMode).toBe('long_fact');
            const normalizedLexical = Math.min(Math.max(Number(lexicalScore || 0) / 2000, 0), 1);
            const normalizedEmbedding = Math.min(Math.max(Number(embeddingScore || 0), 0), 1);
            return proceduralShellBias
                ? Math.min(0.39, normalizedLexical * 0.35)
                : (normalizedLexical * 0.45) + (normalizedEmbedding * 0.55);
        });
        cliBridgeMocks.searchDecisionsViaYargiCli.mockResolvedValue([
            {
                documentId: 'long-fact-1',
                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                birimAdi: '10. Ceza Dairesi',
                esasNo: '2025/1',
                kararNo: '2025/2',
                kararTarihiStr: '01.01.2025',
            },
        ]);
        cliBridgeMocks.getDocumentViaYargiCli.mockResolvedValue({
            documentId: 'long-fact-1',
            markdownContent: 'Uyuşturucu madde ticareti, fiziki takip, kullanıcı tanık beyanı ve hassas terazi birlikte değerlendirilmiştir.',
            mimeType: 'text/plain',
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Uyuşturucu madde ticareti, ele geçirme, bulundurma savunması',
            filters: { searchArea: 'ceza' },
            provider: 'cli',
            legalSearchPacket: {
                caseType: 'ceza_uyusturucu_ticaret',
                queryMode: 'long_fact',
                searchSeedText: 'uyuşturucu ticareti fiziki takip hassas terazi',
            },
        });

        const mergeCall = embeddingRerankerMocks.mergeDocumentScores.mock.calls.find(([args]) => args?.queryMode === 'long_fact');
        expect(mergeCall).toBeTruthy();
        const [mergeArgs] = mergeCall || [];
        const normalizedLexical = Math.min(Math.max(Number(mergeArgs?.lexicalScore || 0) / 2000, 0), 1);
        const normalizedEmbedding = Math.min(Math.max(Number(mergeArgs?.embeddingScore || 0), 0), 1);

        expect(mergeArgs?.queryMode).toBe('long_fact');
        expect(payload.results[0].contentMergedScore).toBeCloseTo(
            (normalizedLexical * 0.45) + (normalizedEmbedding * 0.55),
            6
        );
    });

    it('targets the preferred chamber first for is hukuku queries', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(createJsonResponse({
            data: {
                emsalKararList: [
                    {
                        documentId: '123123',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '9. Hukuk Dairesi',
                        esasNo: '2024/91',
                        kararNo: '2024/145',
                        kararTarihiStr: '10.03.2024',
                    },
                ],
                total: 1,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ise iade ve gecersiz fesih nedeniyle ise baslatmama tazminati talebi.',
            filters: { searchArea: 'hukuk' },
        });

        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestBody.data.phrase).toBe('+"ise iade" "gecersiz fesih" "is k. 18"');
        expect(requestBody.data.birimAdi).toBe('9. Hukuk Dairesi');
        expect(requestBody.data.itemTypeList).toEqual(['YARGITAYKARARI']);
        expect(payload.retrievalDiagnostics.primaryDomain).toBe('is_hukuku');
        expect(payload.retrievalDiagnostics.birimAdiCandidates).toContain('H9');
    });

    it('prefers provided keyword seeds over noisy long raw text when building the search phrase', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(createJsonResponse({
            data: {
                emsalKararList: [
                    {
                        documentId: 'ceza-1',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: 'Ceza Genel Kurulu',
                        esasNo: '2024/11',
                        kararNo: '2025/22',
                        kararTarihiStr: '01.02.2025',
                    },
                ],
                total: 1,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            keyword: 'Uyusturucu madde ticareti sucu TCK 188 Kullanmak icin bulundurma sucu TCK 191',
            rawQuery: 'Elazig Universite Mahallesindeki ikametgahta yapilan fiziki takipte eve girip cikan sahislar ve aramalarda ele gecen maddeler anlatilmaktadir.',
            filters: {},
        });

        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(requestBody.data.phrase).toContain('uyusturucu madde ticareti');
        expect(requestBody.data.phrase).not.toContain('niversite mahallesindeki ikametgah');
        expect(payload.retrievalDiagnostics.primaryDomain).toBe('ceza');
        expect(payload.retrievalDiagnostics.birimAdiCandidates).toEqual(expect.arrayContaining(['C10', 'C8', 'C20']));
    });

    it('routes pure fazla mesai disputes to 9. Hukuk Dairesi and SGK-heavy hizmet tespiti disputes to 10. Hukuk Dairesi', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    emsalKararList: [
                        {
                            documentId: 'is-1',
                            itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                            birimAdi: '9. Hukuk Dairesi',
                            esasNo: '2024/91',
                            kararNo: '2025/145',
                            kararTarihiStr: '10.03.2025',
                        },
                    ],
                    total: 1,
                },
            }))
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    emsalKararList: [
                        {
                            documentId: 'is-2',
                            itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                            birimAdi: '10. Hukuk Dairesi',
                            esasNo: '2024/133',
                            kararNo: '2025/221',
                            kararTarihiStr: '14.04.2025',
                        },
                    ],
                    total: 1,
                },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const pureFazlaMesai = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Fazla mesai ucreti talebinde ucret hesap pusulasi, puantaj kaydi ve ise giris cikis kayitlarinin degerlendirilmesi istenmektedir.',
            filters: { searchArea: 'hukuk' },
        });
        const sgkHeavy = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Hizmet tespiti ile birlikte SGK kayitlari, sigortalilik tespiti ve calisma olgusu yaninda fazla calisma alacagi da talep edilmektedir.',
            filters: { searchArea: 'hukuk' },
        });

        const firstRequestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        const secondRequestBody = JSON.parse(fetchMock.mock.calls[1][1].body);

        expect(firstRequestBody.data.birimAdi).toBe('9. Hukuk Dairesi');
        expect(secondRequestBody.data.birimAdi).toBe('10. Hukuk Dairesi');
        expect(pureFazlaMesai.retrievalDiagnostics.birimAdiCandidates).toContain('H9');
        expect(sgkHeavy.retrievalDiagnostics.birimAdiCandidates).toContain('H10');
    });

    it('uses legalSearchPacket as the primary routing and query source when provided', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(createJsonResponse({
            data: {
                emsalKararList: [
                    {
                        documentId: 'idare-1',
                        itemType: { name: 'DANISTAYKARAR', description: 'Danistay Karari' },
                        birimAdi: '6. Daire',
                        esasNo: '2024/91',
                        kararNo: '2025/14',
                        kararTarihiStr: '04.02.2025',
                    },
                ],
                total: 1,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            keyword: '',
            rawQuery: 'Belediye ile ilgili uzun olay anlatimi.',
            legalSearchPacket: {
                primaryDomain: 'idare',
                caseType: 'iptal davasi',
                coreIssue: 'Idari islem iptali ve tam yargi talebi',
                requiredConcepts: ['idari islem', 'iptal davasi', 'tam yargi'],
                supportConcepts: ['hizmet kusuru', 'olcululuk'],
                negativeConcepts: ['sure asimi'],
                preferredSource: 'danistay',
                preferredBirimCodes: ['D6'],
                searchSeedText: 'Idari islem iptal davasi tam yargi',
                queryMode: 'short_issue',
            },
            filters: { searchArea: 'hukuk' },
        });

        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(requestBody.data.itemTypeList).toEqual(['DANISTAYKARAR']);
        expect(requestBody.data.birimAdi).toBe('6. Daire');
        expect(requestBody.data.phrase).toContain('idari islem');
        expect(payload.retrievalDiagnostics.packetApplied).toBe(true);
        expect(payload.retrievalDiagnostics.packetPrimaryDomain).toBe('idare');
        expect(payload.retrievalDiagnostics.packetRequiredConceptCount).toBe(3);
    });

    it('does not lock generic ceza file searches to Ceza Genel Kurulu by default', () => {
        const candidates = __testables.resolveTargetBirimCodes({
            primaryDomain: 'ceza',
            courtTypes: ['YARGITAYKARARI'],
            filters: {},
            effectiveText: 'Uyusturucu madde ticareti TCK 188 ve kullanmak icin bulundurma TCK 191 tartismasi.',
        });

        expect(candidates).toEqual([]);
    });

    it('builds focused ceza variants for uyuşturucu trade files', () => {
        const variants = __testables.buildCezaFocusedVariants({
            querySeedText: 'Uyusturucu madde ticareti sucu TCK 188 Kullanmak icin bulundurma sucu TCK 191',
            rawText: 'Metamfetamin maddesi, fiziki takip, paketleme materyali ve kullanici tanik beyanlari dosyada yer almaktadir.',
        });

        expect(variants).toEqual(expect.arrayContaining([
            '+metamfetamin +ticaret +188',
            '+kullanmak +bulundurma +191',
        ]));
    });

    it('keeps expanded substantive signal dictionaries above the x3 floor for critical domains', () => {
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.ceza.length).toBeGreaterThanOrEqual(30);
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.icra.length).toBeGreaterThanOrEqual(18);
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.borclar.length).toBeGreaterThanOrEqual(18);
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.sigorta.length).toBeGreaterThanOrEqual(21);
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.ticaret.length).toBeGreaterThanOrEqual(24);
        expect(__testables.DOMAIN_SUBSTANTIVE_SIGNAL_MAP.gayrimenkul.length).toBeGreaterThanOrEqual(24);
    });

    it('builds focused gayrimenkul variants from tapu and kira disputes', () => {
        const variants = __testables.buildDomainFocusedVariants({
            primaryDomain: 'gayrimenkul',
            querySeedText: 'Tapu iptali ve tescil davasi ile muris muvazaasi tartismasi',
            rawText: 'Ortakligin giderilmesi, elatmanin onlenmesi, ecrimisil, kira tahliye ve kira tespiti istemleri de ayni dosyada ileri surulmustur.',
        });

        expect(variants).toEqual(expect.arrayContaining([
            '+"muris muvazaasi" +"tapu iptali" +"tescil"',
            '+"miras birakanin gercek iradesi" +"muvazaali devir" +"tapu"',
            '+"yolsuz tescil" +"tapu kaydi" +"mulkiyet"',
            'tapu iptali ve tescil',
        ]));
    });

    it('keeps ceza long-text files in the ceza domain instead of drifting to is hukuku', () => {
        const rawText = `
Sanigin cocugun cinsel istismari sucundan TCK 103 ve kisiyi hurriyetinden yoksun kilma sucundan
TCK 109 kapsaminda mahkumiyetine karar verilmis; istinaf, bozma ve direnme sureci sonunda dosya
Ceza Genel Kuruluna gelmistir.
        `;

        const primaryDomain = __testables.inferPrimaryDomain({
            effectiveText: rawText,
            source: 'all',
            filters: {},
        });

        expect(primaryDomain).toBe('ceza');
    });

    it('compacts long ceza procedural text around the real crime instead of dates and docket numbers', () => {
        const rawText = `
Sanigin cocugun cinsel istismari sucundan 5237 sayili TCK'nin 103/1 ve 103/4 maddeleri ile
kisiyi hurriyetinden yoksun kilma sucundan 109/2 maddesi uyarinca cezalandirilmasina dair
14.09.2022 tarihli 212-318 sayili karar, 23.11.2022 tarihli 2174-2557 sayili bozma ve devam eden
istinaf-temyiz sureci sonunda yeniden incelenmistir.
        `;

        const compacted = __testables.compactSimpleLegalQuery(rawText);

        expect(compacted).toContain('cinsel istismar');
        expect(compacted).toContain('hurriyetinden yoksun kilma');
        expect(compacted).not.toContain('2174-2557');
        expect(compacted).not.toContain('14.09.2022');
    });

    it('rejects aile odakli preview noise for ticari icra packets', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'icra',
            negativeConcepts: ['nafaka', 'velayet', 'bosanma'],
            result: {
                title: '12. Hukuk Dairesi 2024/1 E. 2024/7 K.',
                daire: '12. Hukuk Dairesi',
                ozet: 'Bosanma ilamina dayali nafaka alacagi ve maddi tazminat takibi nedeniyle itiraz degerlendirilmelidir.',
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: ['itirazin iptali'],
                contentMatchedQueryTokens: ['itiraz', 'alacak', 'takip'],
            },
        });

        expect(allowed).toBe(false);
    });

    it('allows strong vergi substantive matches through the strict gate even when exact phrase wording differs', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'vergi',
            result: {
                title: 'Danistay 3. Daire 2024/1 E. 2025/7 K.',
                daire: '3. Daire',
                queryCoreSignalCount: 2,
                queryTokenSignalCount: 6,
                contentMatchedQueryCore: [],
                contentMatchedQueryTokens: ['kdv', 'tarhiyat', 'mukellef'],
                matchedRequiredConcepts: ['sahte fatura'],
                contentMatchedSubstantive: ['vergi ziyai', 'tarhiyat'],
                matchedNegativeConcepts: [],
                contentScore: 260,
            },
        });

        expect(allowed).toBe(true);
    });

    it('routes idare-like text to Danistay in the simple path', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(createJsonResponse({
            data: {
                emsalKararList: [
                    {
                        documentId: '454545',
                        itemType: { name: 'DANISTAYKARAR', description: 'Danistay Karari' },
                        birimAdi: '6. Daire',
                        esasNo: '2023/88',
                        kararNo: '2024/17',
                        kararTarihiStr: '21.02.2024',
                    },
                ],
                total: 1,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Kamuda mobbing ve hizmet kusuru nedeniyle tam yargi davasi acilmasi.',
            filters: { searchArea: 'hukuk' },
        });

        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

        expect(requestBody.data.itemTypeList).toEqual(['DANISTAYKARAR']);
        expect(payload.retrievalDiagnostics.primaryDomain).toBe('idare');
        expect(payload.results[0].source).toBe('danistay');
    });

    it('routes gayrimenkul-like text to the standalone gayrimenkul domain', () => {
        const primaryDomain = __testables.inferPrimaryDomain({
            effectiveText: 'Tapu iptali ve tescil, muris muvazaasi, ortakligin giderilmesi, ecrimisil ve kira tespiti talepleri ayni tasinmaz uyusmazliginda birlikte ileri surulmustur.',
            source: 'all',
            filters: { searchArea: 'hukuk' },
        });

        expect(primaryDomain).toBe('gayrimenkul');
    });

    it('pushes procedural gayrimenkul decisions below substantive tapu decisions', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createDocumentResponse('Gorev yonunden ret, husumet yoklugu, kesin sure ve usulden ret tartisilmaktadir.'))
            .mockResolvedValueOnce(createDocumentResponse('Tapu iptali ve tescil, muris muvazaasi, yolsuz tescil, ecrimisil ve elatmanin onlenmesi istemleri birlikte degerlendirilmistir.'));
        vi.stubGlobal('fetch', fetchMock);

        const reranked = await __testables.rerankResultsByDocumentContent({
            enabled: true,
            primaryDomain: 'gayrimenkul',
            querySeedText: 'Tapu iptali ve tescil muris muvazaasi ecrimisil',
            rawText: 'Muris muvazaasi nedeniyle tapu iptali, elatmanin onlenmesi ve ecrimisil talebi.',
            source: 'yargitay',
            results: [
                { documentId: 'doc-1', title: '1. Hukuk Dairesi Usul', daire: '1. Hukuk Dairesi', source: 'yargitay' },
                { documentId: 'doc-2', title: '1. Hukuk Dairesi Tapu', daire: '1. Hukuk Dairesi', source: 'yargitay' },
            ],
        });

        expect(reranked.results[0].documentId).toBe('doc-2');
        expect(reranked.results[0].matchedRequiredConcepts?.length).toBeGreaterThan(1);
        expect(reranked.results[0].selectionReason).toContain('Tam metin');
    });

    it('reranks fallback results toward the expected chamber', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({ data: { emsalKararList: [], total: 0 } }))
            .mockResolvedValueOnce(createJsonResponse({ data: { emsalKararList: [], total: 0 } }))
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    emsalKararList: [
                        {
                            documentId: '1',
                            itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                            birimAdi: '12. Hukuk Dairesi',
                            esasNo: '2024/12',
                            kararNo: '2024/44',
                            kararTarihiStr: '03.01.2024',
                        },
                        {
                            documentId: '2',
                            itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                            birimAdi: '9. Hukuk Dairesi',
                            esasNo: '2024/99',
                            kararNo: '2024/144',
                            kararTarihiStr: '11.01.2024',
                        },
                    ],
                    total: 2,
                },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ise iade ve gecersiz fesih nedeniyle bosta gecen sure ucreti talebi.',
            filters: { searchArea: 'hukuk' },
        });

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(payload.results[0].daire).toBe('9. Hukuk Dairesi');
        expect(payload.results[1].daire).toBe('12. Hukuk Dairesi');
    });

    it('converts html document content into plain markdown-like text', async () => {
        const encodedHtml = Buffer.from(
            '<h1>Karar</h1><p>Davaci haklidir.</p><ul><li>Bozma</li></ul>',
            'utf-8'
        ).toString('base64');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: {
                content: encodedHtml,
                mimeType: 'text/html',
            },
        })));

        const payload = await getLegalDocumentViaSimpleBedesten({
            source: 'yargitay',
            documentId: '998877',
        });

        expect(payload.document).toContain('# Karar');
        expect(payload.document).toContain('Davaci haklidir.');
        expect(payload.document).toContain('- Bozma');
        expect(payload.diagnostics.backendMode).toBe('simple_bedesten');
    });

    it('requires must concepts and blocks deny concepts in strict match mode', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            mustConcepts: ['anonim sirket', 'genel kurul'],
            denyConcepts: ['icra', 'takip'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2024/12 E. 2025/44 K.',
                daire: '11. Hukuk Dairesi',
                summaryText: 'Anonim sirket genel kurul karari ve pay sahipligi hakki tartisilmistir.',
                matchedRequiredConcepts: ['anonim sirket'],
                matchedSupportConcepts: ['pay sahipligi'],
                contentMatchedSubstantive: ['genel kurul'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: ['genel kurul'],
                contentMatchedQueryTokens: ['anonim', 'sirket', 'genel', 'kurul'],
            },
        });
        const blocked = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            mustConcepts: ['marka', 'iltibas'],
            denyConcepts: ['icra', 'takip'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2024/12 E. 2025/44 K.',
                daire: '11. Hukuk Dairesi',
                summaryText: 'Icra takibine itiraz ve cari hesap bakiyesi tartisilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: [],
                contentMatchedSubstantive: ['cari hesap'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: [],
                contentMatchedQueryTokens: ['icra', 'takip', 'cari', 'hesap'],
            },
        });

        expect(allowed).toBe(true);
        expect(blocked).toBe(false);
    });

    it('allows fazla mesai results with labor-record signals and blocks SGK-heavy drift in strict match mode', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'is_hukuku',
            subdomain: 'is_hukuku_fazla_mesai',
            mustConcepts: ['fazla mesai', 'fazla calisma'],
            denyConcepts: ['sgk', '5510', 'hizmet tespiti', 'is kazasi'],
            strictMatchMode: 'must_support',
            result: {
                title: '9. Hukuk Dairesi 2025/44 E. 2026/91 K.',
                daire: '9. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Fazla mesai ucreti alacaginda ucret hesap pusulasi, puantaj kaydi ve ise giris cikis kayitlari degerlendirilmistir.',
                matchedRequiredConcepts: ['fazla mesai'],
                matchedSupportConcepts: ['ucret hesap pusulasi', 'puantaj'],
                contentMatchedSubstantive: ['fazla mesai', 'bordro'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 5,
                contentMatchedQueryCore: ['fazla mesai'],
                contentMatchedQueryTokens: ['fazla', 'mesai', 'puantaj', 'bordro', 'kayit'],
                contentScore: 175,
            },
        });
        const blocked = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'is_hukuku',
            subdomain: 'is_hukuku_fazla_mesai',
            mustConcepts: ['fazla mesai', 'fazla calisma'],
            denyConcepts: ['sgk', '5510', 'hizmet tespiti', 'is kazasi'],
            strictMatchMode: 'must_support',
            result: {
                title: '10. Hukuk Dairesi 2025/11 E. 2026/12 K.',
                daire: '10. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Hizmet tespiti, SGK kayitlari ve 5510 sayili Kanun kapsaminda sigortalilik olgusu tartisilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: [],
                contentMatchedSubstantive: ['hizmet tespiti', 'sgk'],
                matchedNegativeConcepts: ['sgk', 'hizmet tespiti'],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: [],
                contentMatchedQueryTokens: ['sgk', '5510', 'hizmet', 'tespiti'],
                contentScore: 160,
            },
        });

        expect(allowed).toBe(true);
        expect(blocked).toBe(false);
    });

    it('supports anayasa source documents through direct document urls', () => {
        expect(supportsSimpleBedestenSearch({
            source: 'anayasa',
            filters: { searchArea: 'auto' },
        })).toBe(true);
        expect(supportsSimpleBedestenDocument({
            source: 'anayasa',
            documentUrl: 'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2022/12345',
        })).toBe(true);
    });

    it('extracts anayasa decision links from kararlarbilgibankasi pages', () => {
        const html = [
            '<section>',
            '<a href="https://kararlarbilgibankasi.anayasa.gov.tr/BB/2022/52826">(Seyfettin Turut, B. No: 2022/52826, 18/9/2024)</a>',
            '</section>',
        ].join('');

        const links = __testables.extractAnayasaLinks(html);

        expect(links).toHaveLength(1);
        expect(links[0].documentUrl).toContain('kararlarbilgibankasi.anayasa.gov.tr/BB/2022/52826');
        expect(links[0].title).toContain('Seyfettin Turut');
    });

    it('allows ticaret genel kurul results through the strict gate when genel kurul support signals are present', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            subdomain: 'ticaret_genel_kurul',
            mustConcepts: ['genel kurul'],
            denyConcepts: ['icra', 'takip'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2025/100 E. 2026/20 K.',
                daire: '11. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Genel kurul kararinin iptali, cagri usulsuzlugu ve pay sahipligi hakki tartisilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: ['cagri usulsuzlugu', 'pay sahipligi'],
                contentMatchedSubstantive: ['genel kurul'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: ['genel kurul'],
                contentMatchedQueryTokens: ['genel', 'kurul', 'cagri', 'pay'],
                contentScore: 180,
            },
        });

        expect(allowed).toBe(true);
    });

    it('rejects ticaret genel kurul results when tapu or marka drift signals are present', () => {
        const blocked = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            subdomain: 'ticaret_genel_kurul',
            mustConcepts: ['genel kurul'],
            denyConcepts: ['marka', 'tapu', 'muris muvazaasi', 'cari hesap'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2025/3390 E. 2026/372 K.',
                daire: '11. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Genel kurul toplanti ve muzakere defteri tartisilirken davacinin tasinmazinin muvazaali satisi nedeniyle tapu iptali ve tescil istemi de ileri surulmustur.',
                matchedRequiredConcepts: ['genel kurul'],
                matchedSupportConcepts: [],
                contentMatchedSubstantive: ['genel kurul'],
                matchedNegativeConcepts: ['tapu', 'muris muvazaasi'],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 5,
                contentMatchedQueryCore: ['genel kurul'],
                contentMatchedQueryTokens: ['genel', 'kurul', 'tapu', 'iptal', 'tescil'],
                contentScore: 210,
            },
        });

        expect(blocked).toBe(false);
    });

    it('allows ticaret marka results when marka tecavuzu and karistirilma support signals are present', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            subdomain: 'ticaret_marka_iltibas',
            mustConcepts: ['marka'],
            denyConcepts: ['tapu', 'icra', 'cari hesap'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2025/3710 E. 2026/396 K.',
                daire: '11. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Davalinin e-ticaret sitelerinde tescilli marka ile karistirilma ihtimali yaratacak sekilde kullanim yaptigi, marka hakkina tecavuz ve haksiz rekabet olusturdugu tartisilmistir.',
                matchedRequiredConcepts: ['marka'],
                matchedSupportConcepts: ['karistirilma ihtimali', 'tescilli marka', 'e-ticaret'],
                contentMatchedSubstantive: ['tecavuz', 'haksiz rekabet'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 5,
                contentMatchedQueryCore: ['marka'],
                contentMatchedQueryTokens: ['marka', 'tecavuz', 'karistirilma', 'e-ticaret', 'tescilli'],
                contentScore: 170,
            },
        });

        expect(allowed).toBe(true);
    });

    it('rejects ticaret genel kurul results when only generic H11 procedural text exists without genel kurul support signals', () => {
        const blocked = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            subdomain: 'ticaret_genel_kurul',
            mustConcepts: ['genel kurul'],
            denyConcepts: ['dernek', 'kooperatif', 'ek tasfiye'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2026/561 E. 2026/425 K.',
                daire: '11. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Ek tasfiyenin cekismesiz yargi isi oldugu ve dernege iliskin uyusmazligin ticari dava niteliginde bulunmadigi tartisilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: [],
                contentMatchedSubstantive: ['genel kurul'],
                matchedNegativeConcepts: ['ek tasfiye', 'dernek'],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 2,
                contentMatchedQueryCore: ['genel kurul'],
                contentMatchedQueryTokens: ['genel', 'kurul'],
                contentScore: 175,
            },
        });

        expect(blocked).toBe(false);
    });

    it('rejects ticaret genel kurul results when the summary is only a task/gorev drift about tacir sifati and Asliye Hukuk', () => {
        const blocked = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'ticaret',
            subdomain: 'ticaret_genel_kurul',
            mustConcepts: ['genel kurul'],
            denyConcepts: ['asliye hukuk mahkemesi', 'tacir sifati'],
            strictMatchMode: 'must_support',
            result: {
                title: '11. Hukuk Dairesi 2026/581 E. 2026/431 K.',
                daire: '11. Hukuk Dairesi',
                source: 'yargitay',
                summaryText: 'Taraflarin tacir sifati bulunmadigi ve Asliye Hukuk Mahkemesince karar verildigi, dosyanin gorev yonunden degerlendirildigi anlasilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: [],
                contentMatchedSubstantive: ['genel kurul'],
                matchedNegativeConcepts: ['asliye hukuk mahkemesi', 'tacir sifati'],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 2,
                contentMatchedQueryCore: ['genel kurul'],
                contentMatchedQueryTokens: ['genel', 'kurul'],
                contentScore: 180,
            },
        });

        expect(blocked).toBe(false);
    });

    it('allows anayasa bireysel basvuru results through the strict gate when anayasa source and makul sure signals are present', () => {
        const allowed = __testables.passesStrictQueryPrecisionGate({
            primaryDomain: 'anayasa',
            subdomain: 'anayasa_bireysel_basvuru_makul_sure',
            mustConcepts: ['makul sure'],
            denyConcepts: ['yargitay', 'danistay'],
            strictMatchMode: 'must_support',
            result: {
                title: 'B. No: 2012/107',
                daire: '',
                source: 'anayasa',
                summaryText: 'Bireysel basvuruda makul surede yargilanma hakkinin ihlali nedeniyle manevi tazminata karar verilmistir.',
                matchedRequiredConcepts: [],
                matchedSupportConcepts: ['manevi tazminat'],
                contentMatchedSubstantive: ['makul sure', 'hak ihlali'],
                matchedNegativeConcepts: [],
                queryCoreSignalCount: 1,
                queryTokenSignalCount: 4,
                contentMatchedQueryCore: ['makul sure'],
                contentMatchedQueryTokens: ['bireysel', 'basvuru', 'makul', 'sure'],
                contentScore: 190,
            },
        });

        expect(allowed).toBe(true);
    });
});
