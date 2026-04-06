import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGeminiClient = vi.fn(() => ({
    models: {
        generateContent,
    },
}));

vi.mock('../backend/gemini/_shared.js', () => ({
    GEMINI_FLASH_PREVIEW_MODEL_NAME: 'test-gemini-model',
    getGeminiClient,
}));

describe('document analyzer', () => {
    beforeEach(() => {
        generateContent.mockReset();
        getGeminiClient.mockClear();
    });

    it('returns normalized Gemini analysis when the model responds with valid JSON', async () => {
        generateContent.mockResolvedValueOnce({
            text: JSON.stringify({
                davaKonusu: 'kira uyusmazligi',
                hukukiMesele: 'Kiracinin kira bedelini odememesi nedeniyle tahliye sartlari tartisilmaktadir.',
                kaynak: 'bedesten',
                courtTypes: ['YARGITAYKARARI'],
                birimAdi: '3. Hukuk Dairesi',
                aramaIfadeleri: [
                    'kira temerrut tahliye',
                    'TBK 315 tahliye',
                ],
                ilgiliKanunlar: ['TBK 315'],
                mustKavramlar: ['kira', 'temerrut', 'tahliye'],
                supportKavramlar: ['ihtarname'],
                negativeKavramlar: ['ceza'],
                queryMode: 'short_issue',
            }),
        });

        const { analyzeDocument } = await import('../backend/gemini/document-analyzer.js');
        const result = await analyzeDocument('Kiraci kira bedelini odemiyor, tahliye ve temerrut kosullari tartisiliyor.');

        expect(getGeminiClient).toHaveBeenCalledTimes(1);
        expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
            model: expect.any(String),
            config: expect.objectContaining({
                systemInstruction: expect.stringContaining('Sadece JSON dondur'),
                responseMimeType: 'application/json',
                responseSchema: expect.any(Object),
            }),
        }));
        expect(result.kaynak).toBe('bedesten');
        expect(result.courtTypes).toEqual(['YARGITAYKARARI']);
        expect(result.birimAdi).toBe('3. Hukuk Dairesi');
        expect(result.ilgiliKanunlar).toContain('TBK 315');
        expect(result.mustKavramlar).toEqual(expect.arrayContaining(['kira', 'temerrut', 'tahliye']));
        expect(result.diagnostics.provider).toBe('gemini');
        expect(result.diagnostics.fallbackUsed).toBe(false);
    });

    it('falls back to heuristic analysis when Gemini is rate limited', async () => {
        generateContent.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'));

        const { analyzeDocument } = await import('../backend/gemini/document-analyzer.js');
        const result = await analyzeDocument('Kiraci iki aydir kira odemiyor. Temerrut nedeniyle tahliye ve ihtarname tartisiliyor.');

        expect(result.kaynak).toBe('bedesten');
        expect(result.courtTypes).toEqual(['YARGITAYKARARI']);
        expect(result.birimAdi).toBe('3. Hukuk Dairesi');
        expect(result.ilgiliKanunlar).toContain('TBK 315');
        expect(result.mustKavramlar).toEqual(expect.arrayContaining(['kira', 'temerrut', 'tahliye']));
        expect(result.aramaIfadeleri).toEqual(expect.arrayContaining([
            'kira temerrut tahliye',
            'TBK 315 tahliye',
        ]));
        expect(result.diagnostics.provider).toBe('heuristic');
        expect(result.diagnostics.fallbackUsed).toBe(true);
        expect(result.diagnostics.warning).toContain('429');
    });

    it('throws for too-short input', async () => {
        const { analyzeDocument } = await import('../backend/gemini/document-analyzer.js');

        await expect(analyzeDocument('abc')).rejects.toThrow(/en az 5 karakter/i);
    });
});
