// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK = '0';
process.env.LEGAL_PRIMARY_BACKEND = 'simple';

const normalizeAiLegalSearchPlanWithDiagnostics = vi.fn();
const searchLegalDecisionsViaMcp = vi.fn();

vi.mock('../backend/gemini/legal-search-plan-core.js', () => ({
    normalizeAiLegalSearchPlanWithDiagnostics,
    generateLegalSearchPlanWithDiagnostics: vi.fn().mockResolvedValue(null),
    expandQueryWithGemini: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/legal/mcpLegalSearch.js', () => ({
    searchLegalDecisionsViaMcp,
}));

vi.mock('../lib/legal/legal-multi-search.js', () => ({
    multiStrategySearch: vi.fn().mockResolvedValue({ results: [], _metadata: {} }),
}));

vi.mock('../lib/legal/legal-strategy-builder.js', () => ({
    buildSearchStrategies: vi.fn().mockResolvedValue([]),
}));

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

const createRes = () => ({
    statusCode: 200,
    payload: null as any,
    status(code: number) {
        this.statusCode = code;
        return this;
    },
    json(data: any) {
        this.payload = data;
        return this;
    },
    end() {
        return this;
    },
    setHeader() {},
});

const getSearchBody = (fetchMock: ReturnType<typeof vi.fn>) => {
    const searchCall = fetchMock.mock.calls.find(([url]) =>
        String(url || '').includes('searchDocuments')
    );
    return JSON.parse(String(searchCall?.[1]?.body || '{}'));
};

const kiraAnalyzerResult = {
    davaKonusu: 'kira uyusmazligi',
    hukukiMesele: 'Kiracinin kira bedelini odememesi nedeniyle temerrut ve tahliye kosullari tartisilmaktadir.',
    kaynak: 'bedesten',
    courtTypes: ['YARGITAYKARARI'],
    birimAdi: '3. Hukuk Dairesi',
    aramaIfadeleri: [
        'kira temerrut tahliye',
        'TBK 315 tahliye',
    ],
    ilgiliKanunlar: ['TBK 315'],
    mustKavramlar: ['tahliye', 'temerrut'],
    supportKavramlar: ['ihtarname'],
    negativeKavramlar: ['ceza'],
    queryMode: 'long_fact',
};

const imarAnalyzerResult = {
    davaKonusu: 'imar para cezasi ve yikim karari',
    hukukiMesele: 'Ruhsatsiz yapi nedeniyle belediye encumeni tarafindan verilen imar para cezasi ve yikim kararinin iptali istenmektedir.',
    kaynak: 'bedesten',
    courtTypes: ['DANISTAYKARAR'],
    birimAdi: '6. Daire',
    aramaIfadeleri: [
        'imar para cezasi yikim karari',
        'ruhsatsiz yapi belediye encumeni',
    ],
    ilgiliKanunlar: ['3194 sayili Kanun 42'],
    mustKavramlar: ['imar para cezasi', 'yikim karari'],
    supportKavramlar: ['ruhsatsiz yapi'],
    negativeKavramlar: ['kamulastirma'],
    queryMode: 'long_fact',
};

describe('document analyzer packet pipeline', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
        normalizeAiLegalSearchPlanWithDiagnostics.mockReset();
        searchLegalDecisionsViaMcp.mockReset();
    });

    it('converts kira analyzer output into a packet and runs the existing search pipeline', async () => {
        const fetchMock = vi.fn().mockImplementation((url) => {
            const normalizedUrl = String(url || '');
            if (normalizedUrl.includes('searchDocuments')) {
                return createJsonResponse({
                    data: {
                        emsalKararList: [
                            {
                                documentId: '112233',
                                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                                birimAdi: '3. Hukuk Dairesi',
                                esasNo: '2024/10',
                                kararNo: '2024/20',
                                kararTarihiStr: '01.01.2024',
                            },
                        ],
                        total: 1,
                    },
                });
            }

            if (normalizedUrl.includes('getDocumentContent')) {
                return createDocumentResponse(
                    'Kiracinin kira bedelini odememesi nedeniyle temerrut ve tahliye kosullari TBK 315 kapsaminda degerlendirilmistir.'
                );
            }

            throw new Error(`Unexpected fetch url: ${normalizedUrl}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const { analyzerOutputToPacket } = await import('../backend/gemini/document-analyzer.js');
        const packet = analyzerOutputToPacket(kiraAnalyzerResult);

        expect(packet).toMatchObject({
            source: 'yargitay',
            caseType: 'borclar_kira',
            primaryBirim: '3. Hukuk Dairesi',
            queryMode: 'long_fact',
        });
        expect(packet?.primaryBirimCodes).toContain('H3');
        expect(packet?.requiredConcepts).toEqual(expect.arrayContaining(['tahliye', 'temerrut']));
        expect(packet?.searchClauses).toEqual(expect.arrayContaining(['kira temerrut tahliye']));

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: '',
                rawQuery: '',
                filters: {},
                documentAnalyzerResult: kiraAnalyzerResult,
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        expect(res.payload?.retrievalDiagnostics).toMatchObject({
            backendMode: 'simple_bedesten',
            packetApplied: true,
            packetPrimaryDomain: 'borclar',
            packetCaseType: 'borclar_kira',
        });

        const searchBody = getSearchBody(fetchMock);
        expect(searchBody?.data?.itemTypeList).toEqual(['YARGITAYKARARI']);
        expect(searchBody?.data?.phrase).toContain('tahliye');
        expect(searchBody?.data?.phrase).toContain('temerrut');
    }, 15000);

    it('maps Danistay analyzer output to idare_imar and keeps the normal simple search flow', async () => {
        const fetchMock = vi.fn().mockImplementation((url) => {
            const normalizedUrl = String(url || '');
            if (normalizedUrl.includes('searchDocuments')) {
                return createJsonResponse({
                    data: {
                        emsalKararList: [
                            {
                                documentId: '778899',
                                itemType: { name: 'DANISTAYKARAR', description: 'Danistay Karari' },
                                birimAdi: '6. Daire',
                                esasNo: '2024/55',
                                kararNo: '2024/66',
                                kararTarihiStr: '03.03.2024',
                            },
                        ],
                        total: 1,
                    },
                });
            }

            if (normalizedUrl.includes('getDocumentContent')) {
                return createDocumentResponse(
                    'Ruhsatsiz yapi nedeniyle verilen imar para cezasi ve yikim karari belediye encumeni islemi olarak incelenmistir.'
                );
            }

            throw new Error(`Unexpected fetch url: ${normalizedUrl}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const { analyzerOutputToPacket } = await import('../backend/gemini/document-analyzer.js');
        const packet = analyzerOutputToPacket(imarAnalyzerResult);

        expect(packet).toMatchObject({
            source: 'danistay',
            caseType: 'idare_imar',
            primaryBirim: '6. Daire',
            queryMode: 'long_fact',
        });
        expect(packet?.primaryBirimCodes).toContain('D6');

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: '',
                rawQuery: '',
                filters: {},
                documentAnalyzerResult: imarAnalyzerResult,
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        expect(res.payload?.retrievalDiagnostics).toMatchObject({
            backendMode: 'simple_bedesten',
            packetApplied: true,
            packetPrimaryDomain: 'idare',
            packetCaseType: 'idare_imar',
        });
        expect(res.payload?.retrievalDiagnostics?.targetSources).toEqual(expect.arrayContaining(['DANISTAYKARAR']));

        const searchBody = getSearchBody(fetchMock);
        expect(searchBody?.data?.itemTypeList).toEqual(['DANISTAYKARAR']);
        expect(searchBody?.data?.phrase).toContain('imar');
    }, 15000);

    it('lets an explicit legalSearchPacket override analyzer-derived packet fields before search runs', async () => {
        const fetchMock = vi.fn().mockImplementation((url) => {
            const normalizedUrl = String(url || '');
            if (normalizedUrl.includes('searchDocuments')) {
                return createJsonResponse({
                    data: {
                        emsalKararList: [
                            {
                                documentId: '445566',
                                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                                birimAdi: '9. Hukuk Dairesi',
                                esasNo: '2024/44',
                                kararNo: '2024/88',
                                kararTarihiStr: '02.02.2024',
                            },
                        ],
                        total: 1,
                    },
                });
            }

            if (normalizedUrl.includes('getDocumentContent')) {
                return createDocumentResponse(
                    'Ise iade ve gecersiz fesih nedeniyle bosta gecen sure ucreti ile ise baslatmama tazminati degerlendirilmistir.'
                );
            }

            throw new Error(`Unexpected fetch url: ${normalizedUrl}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: '',
                rawQuery: '',
                filters: {},
                documentAnalyzerResult: kiraAnalyzerResult,
                legalSearchPacket: {
                    primaryDomain: 'is_hukuku',
                    caseType: 'ise iade',
                    requiredConcepts: ['ise iade', 'gecersiz fesih'],
                    supportConcepts: ['bosta gecen sure ucreti'],
                    preferredSource: 'yargitay',
                    preferredBirimCodes: ['H9'],
                    searchSeedText: 'ise iade gecersiz fesih',
                    queryMode: 'short_issue',
                },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        expect(res.payload?.retrievalDiagnostics).toMatchObject({
            packetApplied: true,
            packetPrimaryDomain: 'is_hukuku',
            packetCaseType: 'ise iade',
            packetRequiredConceptCount: 2,
        });

        const searchBody = getSearchBody(fetchMock);
        expect(searchBody?.data?.itemTypeList).toEqual(['YARGITAYKARARI']);
        expect(searchBody?.data?.phrase).toContain('ise iade');
    }, 15000);
});
