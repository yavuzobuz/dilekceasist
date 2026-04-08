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

    it('treats command-only legal prompts as generic follow-up commands', () => {
        expect(isGenericLegalSearchCommand('emsal karar aramasi yap')).toBe(true);
        expect(isGenericLegalSearchCommand('Bu konuyla ilgili guclu emsal kararlar bul ve kisa kisa acikla')).toBe(true);
        expect(isGenericLegalSearchCommand('emsal ara kira temerrut tahliye')).toBe(false);
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

    it('parses plain numbered batch messages even with noisy log lines', () => {
        const message = [
            'legal_research_batch',
            '',
            '1. 7. Hukuk Dairesi 2013/12849 E. 2013/19293 K.',
            'Daire: 7. Hukuk Dairesi | E. 2013/12849 | K. 2013/19293 | T. 14.11.2013',
            '[Kaynak ↗](https://mevzuat.adalet.gov.tr/ictihat/84216200)',
            '[0] there are non-text parts thoughtSignature in the response, returning concatenation of all text parts.',
            '[0] Chat Error: ApiError: got status: UNAVAILABLE.',
            '2. 22. Hukuk Dairesi 2011/4881 E. 2012/602 K.',
            'Daire: 22. Hukuk Dairesi | E. 2011/4881 | K. 2012/602 | T. 26.01.2012',
            '[Kaynak ↗](https://mevzuat.adalet.gov.tr/ictihat/77801800)',
        ].join('\n');

        expect(parseLegalResearchBatchMessage(message)).toEqual([
            {
                title: '7. Hukuk Dairesi 2013/12849 E. 2013/19293 K.',
                daire: '7. Hukuk Dairesi',
                esasNo: '2013/12849',
                kararNo: '2013/19293',
                tarih: '14.11.2013',
                sourceUrl: 'https://mevzuat.adalet.gov.tr/ictihat/84216200',
            },
            {
                title: '22. Hukuk Dairesi 2011/4881 E. 2012/602 K.',
                daire: '22. Hukuk Dairesi',
                esasNo: '2011/4881',
                kararNo: '2012/602',
                tarih: '26.01.2012',
                sourceUrl: 'https://mevzuat.adalet.gov.tr/ictihat/77801800',
            },
        ]);
    });
});
