import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK = '0';
process.env.LEGAL_SIMPLE_BEDESTEN_PROVIDER = 'cli';

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
                searchMode: 'pro',
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
});
