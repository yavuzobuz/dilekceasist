import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const createCliDecision = (documentId: string, birimAdi = '3. Hukuk Dairesi') => ({
    documentId,
    itemType: { name: 'YARGITAYKARARI', description: 'Yargitay Karari' },
    birimAdi,
    esasNo: '2024/91',
    kararNo: '2024/145',
    kararTarihiStr: '10.03.2024',
});

const mergeDocumentScores = ({
    lexicalScore = 0,
    embeddingScore = 0,
    proceduralShellBias = false,
} = {}) => {
    const normalizedLexical = Math.min(Math.max(Number(lexicalScore || 0) / 1000, 0), 1);
    const normalizedEmbedding = Math.min(Math.max(Number(embeddingScore || 0), 0), 1);
    return proceduralShellBias
        ? Math.min(0.39, normalizedLexical * 0.35)
        : (normalizedLexical * 0.65) + (normalizedEmbedding * 0.35);
};

const importSimpleBedestenWithExpansion = async ({
    expansionVariants = [],
    searchMock = vi.fn(async () => []),
    getDocumentMock = vi.fn(async ({ documentId }: { documentId: string }) => ({
        documentId,
        markdownContent: 'Kira tahliye, TBK 315, mecurun tahliyesi, temerrut ihtari ve kiralananin tahliyesi birlikte degerlendirilmistir.',
        mimeType: 'text/plain',
    })),
} = {}) => {
    vi.doMock('../backend/gemini/legal-search-plan-core.js', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../backend/gemini/legal-search-plan-core.js')>();
        return {
            ...actual,
            expandQueryWithGemini: vi.fn(async () => expansionVariants),
        };
    });

    vi.doMock('../lib/legal/cliBedestenBridge.js', () => ({
        searchDecisionsViaYargiCli: searchMock,
        getDocumentViaYargiCli: getDocumentMock,
        isYargiCliLikelyAvailable: vi.fn(() => true),
    }));

    vi.doMock('../lib/legal/embeddingReranker.js', () => ({
        isEmbeddingRerankEnabled: vi.fn(() => false),
        getEmbedding: vi.fn(),
        computeEmbeddingScore: vi.fn(async () => 0),
        mergeDocumentScores: vi.fn(mergeDocumentScores),
    }));

    const simpleBedestenModule = await import('../lib/legal/simpleBedestenService.js');
    return {
        ...simpleBedestenModule,
        searchMock,
        getDocumentMock,
    };
};

describe('query expansion via Gemini', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.doUnmock('../backend/gemini/legal-search-plan-core.js');
        vi.doUnmock('../lib/legal/cliBedestenBridge.js');
        vi.doUnmock('../lib/legal/embeddingReranker.js');
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

    it('normalizes mocked Gemini responses into string variants', async () => {
        const { expandQueryWithGemini } = await import('../backend/gemini/legal-search-plan-core.js');

        const variants = await expandQueryWithGemini({
            rawQuery: 'kiraci kira odemiyor tahliye',
            caseType: 'borclar_kira',
            primaryDomain: 'borclar',
            existingVariants: ['kira tahliye'],
            generateStructuredJsonImpl: vi.fn().mockResolvedValue({
                variants: [
                    'mecurun tahliyesi',
                    'TBK 350',
                    'temerrut ihtari',
                    'kira tahliye',
                    42,
                    '  kiralananin tahliyesi  ',
                ],
            }),
        });

        expect(variants.length).toBeGreaterThan(0);
        expect(variants.every((variant) => typeof variant === 'string')).toBe(true);
        expect(variants).toEqual(expect.arrayContaining([
            'mecurun tahliyesi',
            'TBK 350',
            'temerrut ihtari',
            'kiralananin tahliyesi',
        ]));
        expect(variants).not.toContain('kira tahliye');
    });

    it('preserves registry variants when Gemini adds dynamic ones', async () => {
        const { searchLegalDecisionsViaSimpleBedesten } = await importSimpleBedestenWithExpansion({
            expansionVariants: [
                'mecurun tahliyesi',
                'TBK 350',
                'kira bedelinin odenmemesi',
                'temerrut ihtari',
            ],
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'kiraci kira odemiyor tahliye',
            filters: { searchArea: 'hukuk' },
            provider: 'cli',
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

        expect(payload.retrievalDiagnostics.queryVariants).toContain('kira tahliye');
        expect(payload.retrievalDiagnostics.queryVariants).toContain('mecurun tahliyesi');
        expect(payload.retrievalDiagnostics.queryVariants).toContain('TBK 350');
    });

    it('dedupes merged registry and Gemini variants before search dispatch', async () => {
        const { searchLegalDecisionsViaSimpleBedesten } = await importSimpleBedestenWithExpansion({
            expansionVariants: [
                'mecurun tahliyesi',
                'TBK 350',
                'kira tahliye',
                'mecurun tahliyesi',
            ],
        });

        const payload = await searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'kiraci kira odemiyor tahliye',
            filters: { searchArea: 'hukuk' },
            provider: 'cli',
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

        expect(payload.retrievalDiagnostics.queryVariants.length).toBe(
            new Set(payload.retrievalDiagnostics.queryVariants).size
        );
    });

    it('starts the first five merged CLI variants in parallel and dedupes duplicate decisions', async () => {
        const deferredCalls: Array<{
            phrase: string;
            resolve: (value: unknown) => void;
            settled: boolean;
        }> = [];
        const searchMock = vi.fn().mockImplementation(async ({ phrase }: { phrase: string }) =>
            new Promise((resolve) => {
                deferredCalls.push({
                    phrase,
                    resolve,
                    settled: false,
                });
            })
        );

        const { searchLegalDecisionsViaSimpleBedesten } = await importSimpleBedestenWithExpansion({
            expansionVariants: [
                'mecurun tahliyesi',
                'TBK 350',
                'kira bedelinin odenmemesi',
                'temerrut ihtari',
            ],
            searchMock,
        });

        const pendingPayload = searchLegalDecisionsViaSimpleBedesten({
            source: 'all',
            rawQuery: 'kiraci kira odemiyor tahliye',
            filters: { searchArea: 'hukuk' },
            provider: 'cli',
            legalSearchPacket: {
                primaryDomain: 'borclar',
                preferredBirimCodes: ['H3'],
                searchSeedText: 'kiraci kira odemiyor tahliye',
                requiredConcepts: ['kira tahliye', 'TBK 315'],
                supportConcepts: ['temerrut', 'ihtar'],
                searchVariants: [
                    { query: 'kira tahliye', mode: 'registry_case_type' },
                ],
            },
        });

        await flushPromises();

        expect(searchMock).toHaveBeenCalledTimes(5);

        const resolvePendingCalls = async () => {
            while (true) {
                const unresolvedCalls = deferredCalls.filter((call) => !call.settled);
                if (unresolvedCalls.length === 0) break;

                unresolvedCalls.forEach((call) => {
                    call.settled = true;
                    if (call.phrase === 'kira tahliye' || call.phrase === 'mecurun tahliyesi') {
                        call.resolve([createCliDecision('doc-1')]);
                        return;
                    }
                    call.resolve([]);
                });

                await flushPromises();
            }
        };

        await resolvePendingCalls();
        const payload = await pendingPayload;

        expect(payload.results).toHaveLength(1);
        expect(payload.results[0].documentId).toBe('doc-1');
    });
});
