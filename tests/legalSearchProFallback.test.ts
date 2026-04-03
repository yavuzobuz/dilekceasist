// @ts-nocheck
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const createRes = () => ({
    statusCode: 200,
    payload: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { this.payload = data; return this; },
    end() { return this; },
    setHeader() {},
});

describe('search-decisions simple backend', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('GEMINI_LEGAL_QUERY_EXPANSION_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
        normalizeAiLegalSearchPlanWithDiagnostics.mockReset();
        searchLegalDecisionsViaMcp.mockReset();
    });

    it('uses the simple Bedesten backend as the primary path', async () => {
        const fetchMock = vi.fn().mockImplementation(() => createJsonResponse({
            data: {
                emsalKararList: [
                    {
                        documentId: '112233',
                        itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                        birimAdi: '9. Hukuk Dairesi',
                        esasNo: '2024/10',
                        kararNo: '2024/20',
                        kararTarihiStr: '01.01.2024',
                    },
                ],
                total: 1,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: 'ise iade gecersiz fesih',
                rawQuery: 'ise iade gecersiz fesih',
                filters: { searchArea: 'hukuk' },
                legalSearchPacket: {
                    primaryDomain: 'is_hukuku',
                    caseType: 'ise iade',
                    requiredConcepts: ['ise iade', 'gecersiz fesih'],
                    supportConcepts: ['bosta gecen sure ucreti'],
                    preferredSource: 'yargitay',
                    preferredBirimCodes: ['H9'],
                    searchSeedText: 'Ise iade gecersiz fesih',
                },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        expect(res.payload?.retrievalDiagnostics?.backendMode).toBe('simple_bedesten');
        expect(res.payload?.retrievalDiagnostics?.fallbackUsed).toBe(false);
        expect(res.payload?.retrievalDiagnostics?.packetApplied).toBe(true);
        expect(res.payload?.retrievalDiagnostics?.packetPrimaryDomain).toBe('is_hukuku');
        expect(res.payload?.retrievalDiagnostics?.packetRequiredConceptCount).toBe(2);
    }, 25000);

    it('can start from legalSearchPacket even when keyword and rawQuery are empty', async () => {
        const fetchMock = vi.fn().mockImplementation(() => createJsonResponse({
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
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: '',
                rawQuery: '',
                filters: { searchArea: 'hukuk' },
                legalSearchPacket: {
                    primaryDomain: 'is_hukuku',
                    caseType: 'ise iade',
                    requiredConcepts: ['ise iade', 'gecersiz fesih'],
                    supportConcepts: ['bosta gecen sure ucreti'],
                    searchSeedText: 'Ise iade gecersiz fesih',
                },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        expect(res.payload?.retrievalDiagnostics?.packetApplied).toBe(true);
    }, 15000);

    it('falls back to legacy MCP when the requested source is unsupported by the simple backend', async () => {
        vi.stubGlobal('fetch', vi.fn());
        normalizeAiLegalSearchPlanWithDiagnostics.mockReturnValue({
            plan: { searchQuery: 'uyap plani' },
            planDiagnostics: { provided: true },
        });
        searchLegalDecisionsViaMcp.mockResolvedValue({
            results: [
                {
                    id: 'uyap-1',
                    source: 'uyap',
                    daire: 'Istanbul BAM',
                    title: 'Istinaf karari',
                },
            ],
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'uyap',
                keyword: 'istinaf sure asimi',
                rawQuery: 'istinaf sure asimi',
                filters: { searchArea: 'bam' },
                aiSearchPlan: { searchQuery: 'eski plan' },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).toHaveBeenCalledTimes(1);
        expect(searchLegalDecisionsViaMcp.mock.calls[0][0].aiSearchPlan).toMatchObject({
            searchQuery: 'uyap plani',
        });
        expect(res.payload?.retrievalDiagnostics?.backendMode).toBe('legacy_mcp');
        expect(res.payload?.retrievalDiagnostics?.fallbackUsed).toBe(true);
        expect(res.payload?.retrievalDiagnostics?.fallbackReason).toBe('unsupported_source');
        expect(res.payload?.planDiagnostics?.provided).toBe(true);
    });

    it('falls back to legacy MCP when simple results are low quality and procedural-biased', async () => {
        const fetchMock = vi.fn().mockImplementation((url) => {
            const normalizedUrl = String(url || '');
            if (normalizedUrl.includes('searchDocuments')) {
                return Promise.resolve(createJsonResponse({
                    data: {
                        emsalKararList: [
                            {
                                documentId: '998877',
                                itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
                                birimAdi: '12. Hukuk Dairesi',
                                esasNo: '2024/90',
                                kararNo: '2025/17',
                                kararTarihiStr: '12.02.2025',
                            },
                        ],
                        total: 1,
                    },
                }));
            }

            if (normalizedUrl.includes('getDocumentContent')) {
                return Promise.resolve(createJsonResponse({
                    data: {
                        content: Buffer.from('Temyiz isteminin reddi, usulden ret, gorev ve yetki yonunden inceleme ile karar kaldirma nedenleri tartisilmaktadir.', 'utf-8').toString('base64'),
                        mimeType: 'text/plain',
                    },
                }));
            }

            throw new Error(`Unexpected fetch url: ${normalizedUrl}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        searchLegalDecisionsViaMcp.mockResolvedValue({
            results: [
                {
                    id: 'legacy-2',
                    source: 'yargitay',
                    daire: '1. Hukuk Dairesi',
                    title: 'Legacy substantive karar',
                },
            ],
            retrievalDiagnostics: {
                backendMode: 'legacy_mcp',
            },
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: 'tapu iptali ve tescil muris muvazaasi',
                rawQuery: 'Tapu iptali ve tescil ile muris muvazaasi davasinda tasinmaz devrinin muvazaali oldugu ileri surulmektedir.',
                searchMode: 'pro',
                filters: { searchArea: 'hukuk' },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).toHaveBeenCalledTimes(1);
        expect(res.payload?.retrievalDiagnostics?.backendMode).toBe('legacy_mcp');
        expect(res.payload?.retrievalDiagnostics?.fallbackReason).toBe('quality_gate_low');
        expect(res.payload?.retrievalDiagnostics?.simpleQualityScore).toBeLessThan(80);
        expect(res.payload?.retrievalDiagnostics?.qualityWarnings).toEqual(expect.arrayContaining(['procedural_bias']));
    }, 15000);

    it('tries one extra query variant in pro mode before falling back to legacy', async () => {
        const fetchMock = vi.fn().mockImplementation(() => createJsonResponse({ data: { emsalKararList: [], total: 0 } }));
        vi.stubGlobal('fetch', fetchMock);
        searchLegalDecisionsViaMcp.mockResolvedValue({
            results: [
                {
                    id: 'legacy-1',
                    source: 'yargitay',
                    daire: '11. Hukuk Dairesi',
                    title: 'Legacy karar',
                },
            ],
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: '',
                rawQuery: 'Müvekkil şirket alacağını tahsil edemediği için sözleşmeye aykırılık ve ticari temerrüt nedeniyle tazminat talep etmektedir.',
                searchMode: 'pro',
                filters: { searchArea: 'hukuk' },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(searchLegalDecisionsViaMcp).toHaveBeenCalledTimes(1);
        expect(res.payload?.retrievalDiagnostics?.backendMode).toBe('legacy_mcp');
        expect(res.payload?.retrievalDiagnostics?.fallbackUsed).toBe(true);
        expect(res.payload?.retrievalDiagnostics?.fallbackReason).toBe('simple_no_results');
        expect(res.payload?.retrievalDiagnostics?.queryVariants?.length).toBeGreaterThanOrEqual(4);
    }, 15000);

    it('does not fall back to legacy MCP when simple search is aborted', async () => {
        vi.doMock('../lib/legal/simpleBedestenService.js', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../lib/legal/simpleBedestenService.js')>();
            const abortError = Object.assign(new Error('REQUEST_ABORTED'), {
                code: 'REQUEST_ABORTED' as const,
            });
            return {
                ...actual,
                supportsSimpleBedestenSearch: vi.fn(() => true),
                searchLegalDecisionsViaSimpleBedesten: vi.fn().mockRejectedValue(abortError),
            };
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: 'uyusturucu madde ticareti tck 188',
                rawQuery: 'uyusturucu madde ticareti tck 188',
                filters: { searchArea: 'ceza' },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).not.toHaveBeenCalled();
        expect(res.payload).toBeNull();
        vi.doUnmock('../lib/legal/simpleBedestenService.js');
    });

    it('does not abort the request when req close fires before the response is written', async () => {
        let resolveSimpleSearch: ((value: any) => void) | null = null;

        vi.doMock('../lib/legal/simpleBedestenService.js', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../lib/legal/simpleBedestenService.js')>();
            return {
                ...actual,
                supportsSimpleBedestenSearch: vi.fn(() => true),
                searchLegalDecisionsViaSimpleBedesten: vi.fn().mockImplementation(
                    () =>
                        new Promise((resolve) => {
                            resolveSimpleSearch = resolve;
                        })
                ),
            };
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = Object.assign(new EventEmitter(), {
            method: 'POST',
            headers: {},
            aborted: false,
            body: {
                source: 'all',
                keyword: 'uyusturucu madde ticareti tck 188',
                rawQuery: 'uyusturucu madde ticareti tck 188',
                filters: { searchArea: 'ceza' },
            },
        });
        const res = Object.assign(new EventEmitter(), createRes());

        const pending = handler(req as any, res as any);
        req.emit('close');

        expect(resolveSimpleSearch).not.toBeNull();
        resolveSimpleSearch?.({
            results: [
                {
                    documentId: 'http-1',
                    source: 'yargitay',
                    title: '20. Ceza Dairesi karari',
                },
            ],
            retrievalDiagnostics: {
                backendMode: 'simple_bedesten',
                provider: 'http',
                fallbackUsed: false,
                zeroResultReason: null,
            },
        });

        await pending;

        expect(res.statusCode).toBe(200);
        expect(res.payload?.results).toHaveLength(1);
        vi.doUnmock('../lib/legal/simpleBedestenService.js');
    });

    it('can use MCP as the primary backend when configured', async () => {
        vi.stubEnv('LEGAL_PRIMARY_BACKEND', 'mcp');
        vi.stubGlobal('fetch', vi.fn());
        searchLegalDecisionsViaMcp.mockResolvedValue({
            results: [
                {
                    id: 'mcp-1',
                    source: 'yargitay',
                    daire: '11. Hukuk Dairesi',
                    title: 'MCP ana sonuc',
                },
            ],
            retrievalDiagnostics: {
                finalMatchedCount: 1,
            },
        });

        const { default: handler } = await import('../backend/legal/search-decisions.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'all',
                keyword: 'anonim sirket genel kurul iptali',
                rawQuery: 'Anonim sirket genel kurul kararinin iptali ve bilgi alma hakkinin ihlali tartisilmaktadir.',
                filters: { searchArea: 'hukuk' },
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(searchLegalDecisionsViaMcp).toHaveBeenCalledTimes(1);
        expect(res.payload?.retrievalDiagnostics?.backendMode).toBe('mcp_primary');
        expect(res.payload?.retrievalDiagnostics?.fallbackUsed).toBe(false);
        expect(res.payload?.results).toHaveLength(1);
    });
});
