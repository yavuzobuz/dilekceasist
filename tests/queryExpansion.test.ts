// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createJsonResponse = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

vi.mock('../lib/legal/embeddingReranker.js', () => ({
    isEmbeddingRerankEnabled: vi.fn(() => false),
    getEmbedding: vi.fn(),
    computeEmbeddingScore: vi.fn(async () => 0),
    mergeDocumentScores: vi.fn(() => 0),
}));

describe('query expansion via Gemini', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.doUnmock('../backend/gemini/legal-search-plan-core.js');
        vi.unstubAllGlobals();
    });

    it('returns an empty array when Gemini credentials are missing', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('GEMINI_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
        vi.stubEnv('GEMINI_LEGAL_QUERY_EXPANSION_API_KEY', '');
        vi.stubEnv('VITE_GEMINI_LEGAL_QUERY_EXPANSION_API_KEY', '');

        const { expandQueryWithGemini } = await import('../backend/gemini/legal-search-plan-core.js');
        const variants = await expandQueryWithGemini({
            rawQuery: 'kiraci kira odemiyor tahliye',
            caseType: 'borclar_kira',
            primaryDomain: 'borclar',
        });

        expect(variants).toEqual([]);
    });

    it('merges and dedupes registry and Gemini variants before HTTP search dispatch', async () => {
        vi.doMock('../backend/gemini/legal-search-plan-core.js', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../backend/gemini/legal-search-plan-core.js')>();
            return {
                ...actual,
                expandQueryWithGemini: vi.fn(async () => [
                    'mecurun tahliyesi',
                    'TBK 350',
                    'kira tahliye',
                    'mecurun tahliyesi',
                ]),
            };
        });

        const fetchMock = vi.fn().mockImplementation(() => createJsonResponse({
            data: {
                emsalKararList: [],
                total: 0,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const {
            searchLegalDecisionsViaSimpleBedesten,
        } = await import('../lib/legal/simpleBedestenService.js');

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'kiraci kira odemiyor tahliye',
            filters: { searchArea: 'hukuk' },
            legalSearchPacket: {
                primaryDomain: 'borclar',
                caseType: 'borclar_kira',
                preferredBirimCodes: ['H3'],
                searchSeedText: 'kiraci kira odemiyor tahliye',
                requiredConcepts: ['kira tahliye', 'TBK 315'],
                supportConcepts: ['temerrut', 'ihtar'],
                searchVariants: [
                    { query: 'kira tahliye', mode: 'registry_case_type' },
                ],
            },
        });

        expect(fetchMock).toHaveBeenCalled();
        expect(payload.retrievalDiagnostics.queryVariants.some((item) => String(item || '').includes('kira tahliye'))).toBe(true);
        expect(payload.retrievalDiagnostics.queryVariants.some((item) => String(item || '').includes('mecurun tahliyesi'))).toBe(true);
        expect(payload.retrievalDiagnostics.queryVariants.some((item) => String(item || '').includes('TBK 350'))).toBe(true);
        expect(payload.retrievalDiagnostics.queryVariants.length).toBe(
            new Set(payload.retrievalDiagnostics.queryVariants).size
        );
        expect(payload.retrievalDiagnostics.provider).toBe('http');
    });

    it('uses agentic required and forbidden concepts when generating Gemini variants', async () => {
        const generateStructuredJsonImpl = vi.fn().mockResolvedValue({
            parsed: {
                variants: [
                    'TCK 191 kullanmak icin bulundurma',
                    'TCK 188 ticaret kasti',
                    'uyusturucu madde ticareti saglama',
                ],
            },
            transportRetryCount: 0,
        });

        const { expandQueryWithGemini } = await import('../backend/gemini/legal-search-plan-core.js');
        const variants = await expandQueryWithGemini({
            rawQuery: 'Ticareti yapma veya saglama sucunun TCK 188 kapsamindaki unsurlari nelerdir?',
            caseType: 'ceza_uyusturucu',
            primaryDomain: 'ceza',
            existingVariants: ['TCK 188 uyusturucu madde ticareti'],
            agenticSignals: {
                requiredConcepts: ['TCK 188', 'uyusturucu madde ticareti'],
                negativeConcepts: ['kira', 'alacak'],
                contrastConcepts: ['TCK 191', 'kullanmak icin bulundurma'],
            },
            generateStructuredJsonImpl,
        });

        const prompt = String(generateStructuredJsonImpl.mock.calls[0]?.[0]?.contents || '');
        expect(prompt).toContain('Agentik cekirdek kavramlar');
        expect(prompt).toContain('TCK 188');
        expect(prompt).toContain('Agentik kontrast kavramlar');
        expect(prompt).toContain('TCK 191');
        expect(variants).toEqual(expect.arrayContaining(['TCK 188 ticaret kasti', 'uyusturucu madde ticareti saglama']));
        expect(variants.join(' ').toLocaleLowerCase('tr-TR')).not.toContain('tck 191');
        expect(variants.join(' ').toLocaleLowerCase('tr-TR')).not.toContain('kullanmak icin bulundurma');
    });
});
