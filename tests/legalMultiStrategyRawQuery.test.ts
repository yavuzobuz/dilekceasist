/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchLegalDecisionsViaMcp = vi.fn();
const getLegalDocumentViaMcp = vi.fn();

vi.mock('../lib/legal/mcpLegalSearch.js', () => ({
    searchLegalDecisionsViaMcp,
    getLegalDocumentViaMcp,
}));

vi.mock('../backend/gemini/_shared.js', () => ({
    getGeminiClient: () => ({
        models: {
            generateContent: vi.fn(),
        },
    }),
    GEMINI_MODEL_NAME: 'test-model',
}));

describe('multiStrategySearch raw query handling', () => {
    beforeEach(() => {
        searchLegalDecisionsViaMcp.mockReset();
        getLegalDocumentViaMcp.mockReset();
    });

    it('keeps the original raw query while using the skill plan', async () => {
        searchLegalDecisionsViaMcp.mockResolvedValue({
            results: [],
            retrievalDiagnostics: { ok: true },
        });

        const { multiStrategySearch } = await import('../lib/legal/legal-multi-search.js');

        await multiStrategySearch({
            strategies: [
                {
                    name: 'Strateji A',
                    plan: {
                        strategyCode: 'A',
                        domain: 'aile',
                        semanticQuery: 'Bu sadece kisa skill ozeti olmaliydi.',
                        searchQuery: 'bosanma tmk 166 kusur',
                    },
                },
            ],
            rawQuery: 'Taraflar arasindaki uzun aile hukuku olayi burada duruyor.',
            source: 'all',
            limit: 10,
            skillContext: {
                active: true,
                enforceStrategyOrder: true,
                primaryDomain: 'aile',
                domainLabel: 'Aile hukuku',
                strictResultMode: false,
            },
            skillDiagnostics: {
                active: true,
                primaryDomain: 'aile',
            },
        });

        expect(searchLegalDecisionsViaMcp).toHaveBeenCalledTimes(1);
        expect(searchLegalDecisionsViaMcp.mock.calls[0][0]).toMatchObject({
            rawQuery: 'Taraflar arasindaki uzun aile hukuku olayi burada duruyor.',
        });
    }, 30000);
});
// @ts-nocheck
