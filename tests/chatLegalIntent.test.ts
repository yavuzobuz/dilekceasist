import { describe, expect, it } from 'vitest';
import {
    buildLegalResearchBatchMessage,
    detectLegalSearchIntent,
    isGenericLegalSearchCommand,
    parseLegalResearchBatchMessage,
} from '../src/lib/legal/chatLegalIntent';

describe('chat legal intent', () => {
    it('detects explicit legal search phrases deterministically', () => {
        expect(detectLegalSearchIntent('emsal ara')).toBe(true);
        expect(detectLegalSearchIntent('İçtihat bul')).toBe(true);
        expect(detectLegalSearchIntent('karar bul')).toBe(true);
        expect(detectLegalSearchIntent('Yargıtay karar')).toBe(true);
        expect(detectLegalSearchIntent('Bu konuyu webde derin araştır')).toBe(false);
        expect(detectLegalSearchIntent('normal sohbet metni')).toBe(false);
    });

    it('formats a legal research batch message with card-like result blocks', () => {
        const message = buildLegalResearchBatchMessage([
            {
                title: '3. Hukuk Dairesi',
                daire: '3. Hukuk Dairesi',
                esasNo: '2024/10',
                kararNo: '2024/20',
                tarih: '01.01.2024',
                documentUrl: 'https://example.com/karar-1',
            },
        ]);

        expect(message).toContain('legal_research_batch');
        expect(message).toContain('3. Hukuk Dairesi');
        expect(message).toContain('E. 2024/10');
        expect(message).toContain('K. 2024/20');
        expect(message).toContain('[Kaynak ↗](https://example.com/karar-1)');
    });

    it('returns an empty batch message when there are no results', () => {
        expect(buildLegalResearchBatchMessage([])).toBe('');
    });

    it('detects bare legal-search commands that need chat context', () => {
        expect(isGenericLegalSearchCommand('emsal karar araması yap')).toBe(true);
        expect(isGenericLegalSearchCommand('emsal karar ara')).toBe(true);
        expect(isGenericLegalSearchCommand('Bu konuyla ilgili guclu emsal kararlar bul ve kisa kisa acikla')).toBe(true);
        expect(isGenericLegalSearchCommand('ictihat ara')).toBe(true);
        expect(isGenericLegalSearchCommand('not kagidi ile paketleme ve TCK 188 ayrimi icin emsal ara')).toBe(false);
    });

    it('parses a batch message back into structured cards', () => {
        const message = buildLegalResearchBatchMessage([
            {
                title: 'Danistay 6. Daire Karari',
                daire: '6. Daire',
                esasNo: '2024/100',
                kararNo: '2024/200',
                tarih: '02.02.2024',
                sourceUrl: 'https://example.com/danistay/1',
            },
        ]);

        expect(parseLegalResearchBatchMessage(message)).toEqual([
            {
                title: 'Danistay 6. Daire Karari',
                daire: '6. Daire',
                esasNo: '2024/100',
                kararNo: '2024/200',
                tarih: '02.02.2024',
                sourceUrl: 'https://example.com/danistay/1',
            },
        ]);
    });
});
