import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importTestablesWithSkillGuess = async (primaryDomain: string | null) => {
    vi.doMock('../lib/legal/legal-search-skill.js', () => ({
        buildSkillBackedSearchPackage: vi.fn(() => (
            primaryDomain ? { primaryDomain } : null
        )),
    }));
    vi.doMock('../backend/gemini/legal-search-plan-core.js', () => ({
        expandQueryWithGemini: vi.fn(async () => []),
    }));
    vi.doMock('../lib/legal/embeddingReranker.js', () => ({
        isEmbeddingRerankEnabled: vi.fn(() => false),
        getEmbedding: vi.fn(),
        computeEmbeddingScore: vi.fn(async () => 0),
        mergeDocumentScores: vi.fn(() => 0),
    }));

    const module = await import('../lib/legal/simpleBedestenService.js');
    return module.__testables;
};

describe('inferPrimaryDomain keyword fallback', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('GEMINI_LEGAL_QUERY_EXPANSION_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
    });

    afterEach(() => {
        vi.doUnmock('../lib/legal/legal-search-skill.js');
        vi.doUnmock('../backend/gemini/legal-search-plan-core.js');
        vi.doUnmock('../lib/legal/embeddingReranker.js');
        vi.resetModules();
    });

    it('falls back to borclar keywords when the skill package is unavailable', async () => {
        const testables = await importTestablesWithSkillGuess(null);

        expect(testables.inferPrimaryDomain({
            effectiveText: 'Kiraci kira bedelini odemiyor, temerrut ihtari ve TBK 315 nedeniyle tahliye talep ediliyor.',
            source: 'all',
            filters: { searchArea: 'hukuk' },
        })).toBe('borclar');
    }, 10000);

    it('falls back to icra keywords when the skill package drifts to the default domain', async () => {
        const testables = await importTestablesWithSkillGuess('genel_hukuk');

        expect(testables.inferPrimaryDomain({
            effectiveText: 'Icra takibinde haciz, meskeniyet sikayeti ve IIK 82 kapsaminda haczedilmezlik savunmasi ileri suruluyor.',
            source: 'all',
            filters: { searchArea: 'hukuk' },
        })).toBe('icra');
    }, 10000);
});
