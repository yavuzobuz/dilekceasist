/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/legal/embeddingReranker.js', () => ({
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

const createJsonResponse = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const createDocumentResponse = (text, mimeType = 'text/plain') =>
    createJsonResponse({
        data: {
            content: Buffer.from(text, 'utf-8').toString('base64'),
            mimeType,
        },
    });

const createSearchPayload = (emsalKararList = []) => ({
    data: {
        emsalKararList,
        total: emsalKararList.length,
    },
});

const createBedestenFetchMock = ({
    searchPayloads = [],
    documentTexts = [],
} = {}) => {
    let searchIndex = 0;
    let documentIndex = 0;

    return vi.fn().mockImplementation((url) => {
        const normalizedUrl = String(url || '');
        if (normalizedUrl.includes('searchDocuments')) {
            const payload = searchPayloads[searchIndex] || createSearchPayload([]);
            searchIndex += 1;
            return Promise.resolve(createJsonResponse(payload));
        }

        if (normalizedUrl.includes('getDocumentContent')) {
            const text = documentTexts[documentIndex] || '';
            documentIndex += 1;
            return Promise.resolve(createDocumentResponse(text));
        }

        throw new Error(`Unexpected fetch url: ${normalizedUrl}`);
    });
};

describe('simpleBedestenService', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('GEMINI_LEGAL_QUERY_EXPANSION_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
    });

    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('uses HTTP-only search and returns bedesten diagnostics', async () => {
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'http-1',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '9. Hukuk Dairesi',
                        esasNo: '2024/91',
                        kararNo: '2024/145',
                        kararTarihiStr: '10.03.2024',
                    },
                ]),
                createSearchPayload([
                    {
                        documentId: 'http-1',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '9. Hukuk Dairesi',
                        esasNo: '2024/91',
                        kararNo: '2024/145',
                        kararTarihiStr: '10.03.2024',
                    },
                ]),
            ],
            documentTexts: [
                'Ise iade, gecersiz fesih ve ise baslatmama tazminati esastan degerlendirilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ise iade ve gecersiz fesih nedeniyle ise baslatmama tazminati talebi.',
            filters: { searchArea: 'hukuk' },
            searchMode: 'pro',
        });

        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(payload.results).toHaveLength(1);
        expect(payload.results[0].documentId).toBe('http-1');
        expect(payload.retrievalDiagnostics.provider).toBe('http');
        expect(payload.retrievalDiagnostics.contentRerankApplied).toBe(true);
    }, 25000);

    it('keeps target chamber matches above same-family mismatches in final ordering', async () => {
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'wrong-h12',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '12. Hukuk Dairesi',
                        esasNo: '2006/10799',
                        kararNo: '2006/13163',
                        kararTarihiStr: '20.09.2005',
                    },
                    {
                        documentId: 'right-h3',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '3. Hukuk Dairesi',
                        esasNo: '2025/2456',
                        kararNo: '2026/336',
                        kararTarihiStr: '22.01.2026',
                    },
                ]),
                createSearchPayload([
                    {
                        documentId: 'wrong-h12',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '12. Hukuk Dairesi',
                        esasNo: '2006/10799',
                        kararNo: '2006/13163',
                        kararTarihiStr: '20.09.2005',
                    },
                    {
                        documentId: 'right-h3',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '3. Hukuk Dairesi',
                        esasNo: '2025/2456',
                        kararNo: '2026/336',
                        kararTarihiStr: '22.01.2026',
                    },
                ]),
            ],
            documentTexts: [
                'Bosanma ilami, nafaka ve kesinlesme nedeniyle icra takibi degerlendirilmistir.',
                'Kiraci kira bedelini odememis, TBK 315 kapsaminda temerrut ve tahliye sartlari degerlendirilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Kiracim kirasini odemiyor, temerrut nedeniyle tahliye istiyorum.',
            filters: { searchArea: 'auto', birimAdiCandidates: ['H3'] },
            searchMode: 'pro',
            legalSearchPacket: {
                primaryDomain: 'borclar',
                caseType: 'borclar_kira',
                searchSeedText: 'kira temerrut tahliye',
                requiredConcepts: ['kira', 'temerrut', 'tahliye'],
                supportConcepts: ['TBK 315', 'ihtarname'],
                negativeConcepts: ['bosanma', 'nafaka'],
            },
        });

        expect(payload.results).toHaveLength(2);
        expect(payload.results[0].daire).toBe('3. Hukuk Dairesi');
        expect(payload.results[0].relevanceScore).toBeGreaterThan(payload.results[1].relevanceScore);
    }, 15000);

    it('supplements low-result pro searches with extra query variants before reranking', async () => {
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'c10-a',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/10',
                        kararNo: '2024/20',
                        kararTarihiStr: '10.02.2024',
                    },
                ]),
                createSearchPayload([
                    {
                        documentId: 'c10-b',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/11',
                        kararNo: '2024/21',
                        kararTarihiStr: '11.02.2024',
                    },
                    {
                        documentId: 'c10-c',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/12',
                        kararNo: '2024/22',
                        kararTarihiStr: '12.02.2024',
                    },
                    {
                        documentId: 'c10-d',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/13',
                        kararNo: '2024/23',
                        kararTarihiStr: '13.02.2024',
                    },
                    {
                        documentId: 'c10-e',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/14',
                        kararNo: '2024/24',
                        kararTarihiStr: '14.02.2024',
                    },
                ]),
            ],
            documentTexts: [
                'TCK 188 kapsaminda uyusturucu madde ticareti ve saglama unsurlari tartisilmistir.',
                'Sanigin eyleminin uyusturucu madde ticareti sucu yonunden degerlendirilmesi yapilmistir.',
                'Kullanmak icin bulundurma ile TCK 188 ticaret ayrimi delillerle incelenmistir.',
                'TCK 188 kapsaminda ticaret kasti, paketleme ve ele gecirilen miktar degerlendirilmistir.',
                'Uyusturucu madde ticareti sucu yonunden saglama fiili ve ticari baglanti tartisilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ticareti yapma veya saglama sucunun TCK 188 kapsaminda unsurlari nelerdir?',
            filters: { searchArea: 'auto', birimAdiCandidates: ['C10'] },
            searchMode: 'pro',
            legalSearchPacket: {
                primaryDomain: 'ceza',
                searchSeedText: 'TCK 188 uyusturucu madde ticareti',
                requiredConcepts: ['uyusturucu madde ticareti', 'TCK 188'],
                supportConcepts: ['ticareti yapma', 'saglama', 'kullanmak icin bulundurma'],
                negativeConcepts: ['hukuk dairesi', 'kira', 'alacak'],
            },
        });

        const searchCallCount = fetchMock.mock.calls.filter(([url]) =>
            String(url).includes('searchDocuments')
        ).length;

        expect(payload.retrievalDiagnostics.queryVariants).toEqual(
            expect.arrayContaining([
                expect.stringContaining('+188'),
            ])
        );
        expect(payload.retrievalDiagnostics.agentDomain).toBe('ceza');
        expect(String(payload.retrievalDiagnostics.embeddingQuery || '').toLocaleLowerCase('tr-TR')).toContain('tck 188');
        expect(searchCallCount).toBeGreaterThan(1);
        expect(payload.retrievalDiagnostics.totalCandidates).toBeGreaterThanOrEqual(5);
        expect(payload.results.length).toBeGreaterThanOrEqual(5);
        expect(payload.results[0].daire).toBe('10. Ceza Dairesi');
    });

    it('keeps explicit TCK 188 trade decisions above TCK 191 possession decisions', async () => {
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'c191-top',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/100',
                        kararNo: '2024/200',
                        kararTarihiStr: '10.01.2024',
                    },
                    {
                        documentId: 'c188-right',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/101',
                        kararNo: '2024/201',
                        kararTarihiStr: '11.01.2024',
                    },
                ]),
            ],
            documentTexts: [
                'Sanik hakkinda TCK 191 kapsaminda kullanmak icin uyusturucu madde bulundurma sucu nedeniyle kisisel kullanim siniri tartisilmistir.',
                'Sanik hakkinda TCK 188 kapsaminda uyusturucu madde ticareti yapma sucu, ticaret kasti ve paketleme delilleriyle birlikte degerlendirilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ticareti yapma veya saglama sucunun TCK 188 kapsamindaki unsurlari nelerdir?',
            filters: { searchArea: 'auto', birimAdiCandidates: ['C10'] },
            searchMode: 'pro',
            legalSearchPacket: {
                primaryDomain: 'ceza',
                searchSeedText: 'TCK 188 uyusturucu madde ticareti',
                requiredConcepts: ['uyusturucu madde ticareti', 'TCK 188'],
                supportConcepts: ['ticaret kasti', 'paketleme'],
                negativeConcepts: ['kira', 'alacak'],
            },
        });

        expect(payload.results).toHaveLength(2);
        expect(payload.results[0].documentId).toBe('c188-right');
        expect(payload.results[0].matchedRequiredConcepts).toEqual(
            expect.arrayContaining(['tck 188', 'uyusturucu madde ticareti'])
        );
        expect(payload.results[1].matchedContrastConcepts).toEqual(
            expect.arrayContaining(['tck 191'])
        );
    });

    it('uses the agentic embedding query for explicit TCK 188 searches', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'c188-embed',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '10. Ceza Dairesi',
                        esasNo: '2024/301',
                        kararNo: '2024/401',
                        kararTarihiStr: '15.01.2024',
                    },
                ]),
            ],
            documentTexts: [
                'Sanigin eylemi TCK 188 kapsaminda uyusturucu madde ticareti, ticaret kasti ve saglama olgulari ile birlikte degerlendirilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const embeddingModule = await import('../lib/legal/embeddingReranker.js');
        vi.mocked(embeddingModule.isEmbeddingRerankEnabled).mockReturnValue(true);
        vi.mocked(embeddingModule.getEmbedding).mockResolvedValue([0.12, 0.34]);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Ticareti yapma veya saglama sucunun TCK 188 kapsamindaki unsurlari nelerdir?',
            filters: { searchArea: 'auto', birimAdiCandidates: ['C10'] },
            searchMode: 'pro',
            legalSearchPacket: {
                primaryDomain: 'ceza',
                searchSeedText: 'TCK 188 uyusturucu madde ticareti',
                requiredConcepts: ['uyusturucu madde ticareti', 'TCK 188'],
                supportConcepts: ['ticaret kasti', 'saglama'],
                negativeConcepts: ['kira', 'alacak'],
            },
        });

        expect(embeddingModule.getEmbedding).toHaveBeenCalled();
        const [embeddingQuery, embeddingTask] = vi.mocked(embeddingModule.getEmbedding).mock.calls[0] || [];
        const normalizedEmbeddingQuery = String(embeddingQuery || '').toLocaleLowerCase('tr-TR');
        expect(normalizedEmbeddingQuery).toContain('tck 188');
        expect(normalizedEmbeddingQuery).toContain('ticaret kasti');
        expect(embeddingTask).toBe('RETRIEVAL_QUERY');
    });

    it('uses the agentic embedding query for kira tahliye searches', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
        const fetchMock = createBedestenFetchMock({
            searchPayloads: [
                createSearchPayload([
                    {
                        documentId: 'kira-embed',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '3. Hukuk Dairesi',
                        esasNo: '2025/501',
                        kararNo: '2026/601',
                        kararTarihiStr: '20.01.2026',
                    },
                ]),
            ],
            documentTexts: [
                'TBK 315 uyarinca kiracinin temerrudu, mecurun tahliyesi ve ihtarname kosullari degerlendirilmistir.',
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const embeddingModule = await import('../lib/legal/embeddingReranker.js');
        vi.mocked(embeddingModule.isEmbeddingRerankEnabled).mockReturnValue(true);
        vi.mocked(embeddingModule.getEmbedding).mockResolvedValue([0.21, 0.55]);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'Kiracim kirasini odemiyor, temerrut nedeniyle tahliye istiyorum.',
            filters: { searchArea: 'auto', birimAdiCandidates: ['H3'] },
            searchMode: 'pro',
            legalSearchPacket: {
                primaryDomain: 'borclar',
                caseType: 'borclar_kira',
                searchSeedText: 'kira temerrut tahliye',
                requiredConcepts: ['kira', 'temerrut', 'tahliye'],
                supportConcepts: ['TBK 315', 'ihtarname'],
                negativeConcepts: ['bosanma', 'nafaka'],
            },
        });

        expect(embeddingModule.getEmbedding).toHaveBeenCalled();
        const [embeddingQuery, embeddingTask] = vi.mocked(embeddingModule.getEmbedding).mock.calls[0] || [];
        const normalizedEmbeddingQuery = String(embeddingQuery || '').toLocaleLowerCase('tr-TR');
        expect(normalizedEmbeddingQuery).toContain('tbk 315');
        expect(normalizedEmbeddingQuery).toContain('temerrut');
        expect(normalizedEmbeddingQuery).toContain('mecur');
        expect(normalizedEmbeddingQuery).toContain('tahliye');
        expect(embeddingTask).toBe('RETRIEVAL_QUERY');
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

        const {
            getLegalDocumentViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await getLegalDocumentViaSimpleBedesten({
            source: 'yargitay',
            documentId: '998877',
        });

        expect(payload.document).toContain('# Karar');
        expect(payload.document).toContain('Davaci haklidir.');
        expect(payload.document).toContain('- Bozma');
        expect(payload.diagnostics.provider).toBe('http');
    });

    it('supports anayasa source documents through direct document urls', async () => {
        const {
            __testables,
            supportsSimpleBedestenDocument,
            supportsSimpleBedestenSearch,
        } = await import('../lib/legal/simpleBedestenService.js');

        expect(supportsSimpleBedestenSearch({
            source: 'anayasa',
            filters: { searchArea: 'auto' },
        })).toBe(true);
        expect(supportsSimpleBedestenDocument({
            source: 'anayasa',
            documentUrl: 'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2022/12345',
        })).toBe(true);
        expect(__testables.resolveSimpleBedestenProvider()).toBe('http');
    });
});
// @ts-nocheck
