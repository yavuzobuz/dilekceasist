import { beforeEach, describe, expect, it, vi } from 'vitest';

const normalizeConcepts = (values: unknown) =>
    (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').toLocaleLowerCase('tr-TR'));

describe('agentic domain signals', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('falls back heuristically when Gemini credentials are unavailable', async () => {
        vi.doMock('../backend/gemini/_shared.js', async (importOriginal) => {
            const actual = await importOriginal();
            return {
                ...actual,
                GEMINI_API_KEY: '',
                getGeminiClient: vi.fn(() => {
                    throw new Error('GEMINI_API_KEY is not configured');
                }),
            };
        });

        const { generateAgenticDomainSignals } = await import('../backend/gemini/agentic-domain-signals.js');
        const result = await generateAgenticDomainSignals({
            rawText: 'Ticareti yapma veya saglama sucunun TCK 188 kapsamindaki unsurlari nelerdir?',
            querySeedText: 'TCK 188 uyusturucu madde ticareti',
            primaryDomain: 'ceza',
            packet: {
                requiredConcepts: ['uyusturucu madde ticareti', 'TCK 188'],
                supportConcepts: ['ticaret kasti'],
            },
            skillPlan: {
                retrievalConcepts: ['uyusturucu madde ticareti'],
                supportConcepts: ['ticaret kasti'],
            },
        });

        expect(result.diagnostics?.mode).toBe('heuristic_fallback');
        expect(normalizeConcepts(result.requiredConcepts)).toEqual(expect.arrayContaining(['tck 188', 'uyusturucu madde ticareti']));
        expect(normalizeConcepts(result.mustConcepts)).toEqual(expect.arrayContaining(['tck 188', 'uyusturucu madde ticareti']));
        expect(normalizeConcepts(result.contrastConcepts)).toEqual(expect.arrayContaining(['tck 191', 'kullanmak icin bulundurma']));
        expect(String(result.embeddingQuery || '').toLocaleLowerCase('tr-TR')).toContain('tck 188');
        expect(String(result.embeddingQuery || '').toLocaleLowerCase('tr-TR')).toContain('ticaret kasti');
    });

    it('uses producer critic arbiter consensus when model responses are available', async () => {
        const generateContent = vi.fn()
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    primaryDomain: 'borclar',
                    mustConcepts: ['kira', 'tahliye'],
                    retrievalConcepts: ['kira', 'tahliye'],
                    supportConcepts: ['tbk 315'],
                    evidenceConcepts: ['ihtarname'],
                    contrastConcepts: ['kira tespiti'],
                    negativeConcepts: ['hukuk dairesi ceza'],
                    searchClauses: ['+"tahliye" +"temerrut" +"tbk 315"'],
                    candidateQueries: ['+"kiraci" +"kira" +"tahliye"'],
                    confidence: 0.62,
                }),
            })
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    primaryDomain: 'borclar',
                    mustConcepts: ['temerrut', 'tahliye'],
                    retrievalConcepts: ['temerrut', 'tahliye', 'tbk 315'],
                    supportConcepts: ['ihtarname'],
                    evidenceConcepts: ['kira bedeli'],
                    contrastConcepts: ['kira tespiti', 'kira artisi'],
                    negativeConcepts: [],
                    searchClauses: ['+"tahliye" +"temerrut" +"tbk 315"'],
                    candidateQueries: ['+"kiraci" +"kira" +"tahliye"'],
                    confidence: 0.77,
                }),
            })
            .mockResolvedValueOnce({
                text: JSON.stringify({
                    primaryDomain: 'borclar',
                    mustConcepts: ['temerrut', 'tahliye'],
                    retrievalConcepts: ['temerrut', 'tahliye', 'tbk 315'],
                    supportConcepts: ['ihtarname'],
                    evidenceConcepts: ['kira bedeli'],
                    contrastConcepts: ['kira tespiti', 'kira artisi'],
                    negativeConcepts: [],
                    embeddingQuery: 'TBK 315 temerrut mecur tahliye',
                    searchClauses: ['+"tahliye" +"temerrut" +"tbk 315"'],
                    candidateQueries: ['+"kiraci" +"kira" +"tahliye"'],
                    confidence: 0.84,
                }),
            });

        vi.doMock('../backend/gemini/_shared.js', async (importOriginal) => {
            const actual = await importOriginal();
            return {
                ...actual,
                GEMINI_API_KEY: 'test-key',
                getGeminiClient: vi.fn(() => ({
                    models: {
                        generateContent,
                    },
                })),
            };
        });

        const { generateAgenticDomainSignals } = await import('../backend/gemini/agentic-domain-signals.js');
        const result = await generateAgenticDomainSignals({
            rawText: 'Kiracim kirasini odemiyor, tahliye etmek istiyorum.',
            querySeedText: 'kira temerrut tahliye',
            primaryDomain: 'borclar',
            packet: {
                requiredConcepts: ['kira', 'temerrut', 'tahliye'],
                supportConcepts: ['TBK 315'],
            },
            skillPlan: {
                retrievalConcepts: ['kira', 'tahliye'],
                supportConcepts: ['TBK 315'],
            },
        });

        expect(generateContent).toHaveBeenCalledTimes(3);
        expect(result.diagnostics?.mode).toBe('agentic_consensus');
        expect(result.diagnostics?.producerApplied).toBe(true);
        expect(result.diagnostics?.criticApplied).toBe(true);
        expect(result.diagnostics?.arbiterApplied).toBe(true);
        expect(result.mustConcepts).toEqual(['temerrut', 'tahliye']);
        expect(result.requiredConcepts).toEqual(['temerrut', 'tahliye']);
        expect(normalizeConcepts(result.contrastConcepts)).toEqual(expect.arrayContaining(['kira tespiti', 'kira artisi']));
        expect(String(result.embeddingQuery || '')).toContain('TBK 315');
        expect(String(result.embeddingQuery || '').toLocaleLowerCase('tr-TR')).toContain('mecur');
    });
});
