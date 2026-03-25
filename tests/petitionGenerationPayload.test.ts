import { describe, expect, it } from 'vitest';

import { buildGeneratePetitionParams, buildLegalSearchResultSummary } from '../src/utils/petitionGeneration';
import { PetitionType, UserRole } from '../types';

describe('petition generation payload builder', () => {
    it('keeps web sources, structured legal results and analysis insights in the request', () => {
        const payload = buildGeneratePetitionParams({
            userRole: UserRole.Davaci,
            petitionType: PetitionType.DavaDilekcesi,
            caseDetails: {
                caseTitle: 'Ise iade',
                court: 'Istanbul Is Mahkemesi',
                fileNumber: '',
                decisionNumber: '',
                decisionDate: '',
            },
            analysisData: {
                summary: 'Isverenin gecersiz feshi iddia ediliyor.',
                potentialParties: [],
                lawyerInfo: {
                    name: 'Av. Ayse Demir',
                    address: 'Istanbul',
                    phone: '555',
                    email: 'ayse@example.com',
                    tcNo: '123',
                    barNumber: '456',
                    bar: 'Istanbul',
                    title: 'Avukat',
                },
                contactInfo: [],
                analysisInsights: {
                    primaryDomain: 'is_hukuku',
                    coreIssue: 'ise iade ve gecersiz fesih',
                    claims: ['Fesih gecersizdir.'],
                },
            },
            webSearchResult: {
                summary: 'Web arastirmasi feshin son care olmasi gerektigini aktariyor.',
                sources: [
                    { title: 'Ornek kaynak', uri: 'https://example.com/kaynak' },
                ],
            },
            legalSearchResults: [
                {
                    title: '9. Hukuk Dairesi',
                    esasNo: '2024/10',
                    kararNo: '2024/20',
                    tarih: '01.01.2024',
                    snippet: 'Gecersiz fesih halinde ise iade kosullari degerlendirilir.',
                    source: 'yargitay',
                },
            ],
            docContent: 'Fesih bildirimi eklidir.',
            specifics: 'Kisa ve net yaz.',
            searchKeywords: ['ise iade', 'gecersiz fesih'],
            chatHistory: [],
            parties: { davaci: 'Ali Veli' },
        });

        expect(payload.webSources).toHaveLength(1);
        expect(payload.webSources?.[0]?.title).toBe('Ornek kaynak');
        expect(payload.legalSearchResults).toHaveLength(1);
        expect(payload.legalSearchResults?.[0]?.snippet).toContain('Gecersiz fesih');
        expect(payload.legalSearchResult).toContain('9. Hukuk Dairesi');
        expect(payload.legalSearchResult).toContain('Gecersiz fesih halinde');
        expect(payload.analysisInsights?.coreIssue).toBe('ise iade ve gecersiz fesih');
        expect(payload.webSourceCount).toBe(1);
        expect(payload.legalResultCount).toBe(1);
    });

    it('uses snippet fallback when legal summary text is missing', () => {
        const summary = buildLegalSearchResultSummary([
            {
                title: '10. Ceza Dairesi',
                snippet: 'TCK 188 ile TCK 191 ayrimi tartisilmistir.',
            },
        ]);

        expect(summary).toContain('10. Ceza Dairesi');
        expect(summary).toContain('TCK 188 ile TCK 191 ayrimi');
    });

    it('uses selectionReason fallback when ozet and snippet are missing', () => {
        const summary = buildLegalSearchResultSummary([
            {
                title: '9. Hukuk Dairesi',
                esasNo: '2024/10',
                kararNo: '2024/20',
                selectionReason: 'Gecersiz fesihte ise iade kosullarini dogrudan acikliyor.',
            },
        ]);

        expect(summary).toContain('9. Hukuk Dairesi');
        expect(summary).toContain('Gecersiz fesihte ise iade kosullarini dogrudan acikliyor.');
    });
});
