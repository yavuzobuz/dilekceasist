// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK = '0';

const simpleMocks = vi.hoisted(() => ({
    searchLegalDecisionsViaSimpleBedesten: vi.fn(),
    supportsSimpleBedestenSearch: vi.fn(() => true),
}));

const mcpMocks = vi.hoisted(() => ({
    searchLegalDecisionsViaMcp: vi.fn(),
}));

const aiPlanMocks = vi.hoisted(() => ({
    normalizeAiLegalSearchPlanWithDiagnostics: vi.fn((plan) => ({
        plan,
        planDiagnostics: undefined,
    })),
    generateLegalSearchPlanWithDiagnostics: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/legal/simpleBedestenService.js', () => ({
    searchLegalDecisionsViaSimpleBedesten: simpleMocks.searchLegalDecisionsViaSimpleBedesten,
    supportsSimpleBedestenSearch: simpleMocks.supportsSimpleBedestenSearch,
}));

vi.mock('../lib/legal/mcpLegalSearch.js', () => ({
    searchLegalDecisionsViaMcp: mcpMocks.searchLegalDecisionsViaMcp,
}));

vi.mock('../backend/gemini/legal-search-plan-core.js', () => ({
    normalizeAiLegalSearchPlanWithDiagnostics: aiPlanMocks.normalizeAiLegalSearchPlanWithDiagnostics,
    generateLegalSearchPlanWithDiagnostics: aiPlanMocks.generateLegalSearchPlanWithDiagnostics,
}));

vi.mock('../lib/legal/legal-multi-search.js', () => ({
    multiStrategySearch: vi.fn().mockResolvedValue({ results: [], _metadata: {} }),
}));

vi.mock('../lib/legal/legal-strategy-builder.js', () => ({
    buildSearchStrategies: vi.fn().mockResolvedValue([]),
}));

import handler from '../backend/legal/search-decisions.js';

const createMockRes = () => ({
    statusCode: 200,
    payload: null,
    writableEnded: false,
    once: vi.fn(),
    setHeader: vi.fn(),
    status(code: number) {
        this.statusCode = code;
        return this;
    },
    json(data: unknown) {
        this.payload = data;
        this.writableEnded = true;
        return this;
    },
    end() {
        this.writableEnded = true;
        return this;
    },
});

describe('search-decisions source routing', () => {
    beforeEach(() => {
        simpleMocks.searchLegalDecisionsViaSimpleBedesten.mockReset();
        simpleMocks.supportsSimpleBedestenSearch.mockReset();
        simpleMocks.supportsSimpleBedestenSearch.mockReturnValue(true);
        mcpMocks.searchLegalDecisionsViaMcp.mockReset();
        aiPlanMocks.generateLegalSearchPlanWithDiagnostics.mockReset();
        aiPlanMocks.generateLegalSearchPlanWithDiagnostics.mockResolvedValue(null);
        simpleMocks.searchLegalDecisionsViaSimpleBedesten.mockResolvedValue({
            results: [],
            retrievalDiagnostics: {
                backendMode: 'simple_bedesten',
                provider: 'http',
                queryVariants: ['bireysel basvuru'],
                zeroResultReason: 'no_candidates',
                sourceCoverageStatus: 'no_candidates',
            },
        });
    });

    it('routes source=all requests to anayasa when the resolved packet prefers anayasa', async () => {
        const req = {
            method: 'POST',
            body: {
                source: 'all',
                keyword: '',
                rawQuery: 'Adil yargilanma hakki ile makul sure ihlali iddiasina dayali bireysel basvuru kararlarina iliskin emsal araniyor.',
                searchMode: 'auto',
                filters: {},
                legalSearchPacket: {
                    primaryDomain: 'anayasa',
                    preferredSource: 'anayasa',
                    searchSeedText: 'anayasa mahkemesi bireysel basvuru makul sure adil yargilanma',
                    requiredConcepts: ['bireysel basvuru', 'makul sure', 'adil yargilanma'],
                    fallbackToNext: false,
                },
            },
            once: vi.fn(),
            aborted: false,
        };
        const res = createMockRes();

        await handler(req as any, res as any);

        expect(simpleMocks.supportsSimpleBedestenSearch).toHaveBeenCalledWith({
            source: 'anayasa',
            filters: {},
        });
        expect(simpleMocks.searchLegalDecisionsViaSimpleBedesten).toHaveBeenCalledTimes(1);
        expect(simpleMocks.searchLegalDecisionsViaSimpleBedesten.mock.calls[0][0].source).toBe('anayasa');
        expect(res.statusCode).toBe(200);
    });

    it('maps result aliases and accepts mode=pro as a searchMode alias', async () => {
        simpleMocks.searchLegalDecisionsViaSimpleBedesten.mockResolvedValue({
            results: [
                {
                    documentId: '1196201700',
                    daire: '3. Hukuk Dairesi',
                    esasNo: '2026/381',
                    tarih: '22.01.2026',
                    source: 'yargitay',
                },
            ],
            retrievalDiagnostics: {
                backendMode: 'simple_bedesten',
                provider: 'http',
                primaryDomain: 'borclar',
                agentDomain: 'borclar',
                embeddingQuery: 'TBK 315 temerrut mecur tahliye',
                selectedBirimAdi: 'H3',
                totalCandidates: 5,
                zeroResultReason: null,
                sourceCoverageStatus: 'ok',
            },
        });

        const req = {
            method: 'POST',
            body: {
                source: 'all',
                rawQuery: 'kiraci kira odemiyor tahliye istiyorum',
                mode: 'pro',
                filters: {},
            },
            once: vi.fn(),
            aborted: false,
        };
        const res = createMockRes();

        await handler(req as any, res as any);

        expect(simpleMocks.searchLegalDecisionsViaSimpleBedesten).toHaveBeenCalledWith(
            expect.objectContaining({
                searchMode: 'pro',
            })
        );
        expect(res.statusCode).toBe(200);
        expect(res.payload?.results?.[0]).toMatchObject({
            birimAdi: '3. Hukuk Dairesi',
            daire: '3. Hukuk Dairesi',
            kararTarihi: '22.01.2026',
            tarih: '22.01.2026',
            esasNo: '2026/381',
        });
        expect(res.payload?.retrievalDiagnostics).toMatchObject({
            agentDomain: 'borclar',
            embeddingQuery: 'TBK 315 temerrut mecur tahliye',
            selectedBirimAdi: 'H3',
            totalCandidates: 5,
        });
    });
});
