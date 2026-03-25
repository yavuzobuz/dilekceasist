import { describe, expect, it } from 'vitest';
import { __testables } from '../lib/legal/mcpLegalSearch.js';
import { shouldUseProLegalSearchMode } from '../src/utils/legalSearch';

describe('legal search request mode', () => {
    it('keeps short keyword-style searches on the lightweight path', () => {
        expect(shouldUseProLegalSearchMode({
            keyword: 'ise iade gecersiz fesih',
            rawQuery: 'ise iade gecersiz fesih',
        })).toBe(false);
    });

    it('promotes longer natural-language searches to pro mode automatically', () => {
        expect(shouldUseProLegalSearchMode({
            keyword: 'ise iade gecersiz fesih',
            rawQuery: 'Isverenin performans bahanesiyle is akdini sona erdirmesi sonrasinda ise iade ve bos gecen sure ucreti talep edilebilir mi?',
        })).toBe(true);
    });

    it('normalizes externally provided plans into usable search guidance', () => {
        const normalized = __testables.normalizeProvidedAiSearchPlan({
            aiSearchPlan: {
                primaryDomain: 'is_hukuku',
                targetSources: ['yargitay'],
                searchQuery: 'ise iade gecersiz fesih',
                semanticQuery: 'Is sozlesmesinin gecersiz nedenle feshi nedeniyle ise iade talebi.',
                coreIssue: 'Ise iade davasi',
                retrievalConcepts: ['ise iade', 'gecersiz fesih'],
                supportConcepts: ['isveren feshi'],
                evidenceConcepts: ['fesih bildirimi'],
                searchClauses: ['ise iade gecersiz fesih', 'gecersiz fesih isveren feshi'],
            },
            requestedSource: 'all',
            keyword: 'ise iade',
            rawQuery: 'Isveren performans bahanesiyle is akdini sona erdirdi.',
        });

        expect(normalized).toBeTruthy();
        expect(normalized?.source).toBe('yargitay');
        expect(normalized?.primaryProfile).toBe('is_hukuku');
        expect(normalized?.initialKeyword).toContain('ise iade');
        expect(normalized?.candidateQueries).toEqual(expect.arrayContaining(['ise iade gecersiz fesih']));
        expect(normalized?.keywordPhrases).toEqual(expect.arrayContaining(['ise iade', 'gecersiz fesih']));
    });
});
