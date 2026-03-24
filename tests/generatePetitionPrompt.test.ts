import { describe, expect, it } from 'vitest';

import { __testables as petitionTestables } from '../backend/gemini/generate-petition.js';
import { __testables as chatTestables } from '../backend/gemini/chat.js';
import { PetitionType, UserRole } from '../types';

describe('generate-petition prompt evidence wiring', () => {
    it('formats structured legal search results into the petition prompt', () => {
        const prompt = petitionTestables.buildGenerationPrompt({
            userRole: UserRole.Davaci,
            petitionType: PetitionType.DavaDilekcesi,
            caseDetails: {
                caseTitle: 'Uyusturucu dosyasi',
                court: 'Agir Ceza',
                fileNumber: '',
                decisionNumber: '',
                decisionDate: '',
            },
            analysisSummary: 'Sanik hakkinda ticaret mi kisisel kullanim mi ayrimi tartisiliyor.',
            analysisInsights: {
                documentType: 'iddianame',
                caseStage: 'ilk derece',
                primaryDomain: 'ceza',
                caseType: 'uyusturucu ticareti',
                coreIssue: 'TCK 188 ile TCK 191 ayrimi ve ticaret kastinin ispatı',
                claims: ['Savcilik ticaret kastinin varligini ileri suruyor.'],
                defenses: ['Sanik maddelerin kisisel kullanim icin bulunduruldugunu savunuyor.'],
                evidenceSummary: ['Kriminal rapor', 'fiziki takip', 'tanik beyanlari'],
                risksAndWeakPoints: ['Arama usulune itiraz gelebilir.'],
                webSearchPlan: {
                    coreQueries: ['uyusturucu madde ticareti TCK 188'],
                    focusTopics: ['ticaret kasti'],
                },
                precedentSearchPlan: {
                    requiredConcepts: ['TCK 188', 'TCK 191'],
                    searchSeedText: 'TCK 188 TCK 191 ticaret kasti',
                },
            },
            searchKeywords: ['TCK 188', 'TCK 191'],
            webSearchResult: 'Web arastirmasi, ticaret kastinin paketleme ve tanik beyanlariyla desteklenmesi gerektigini soyluyor.',
            webSources: [
                { title: 'Ornek kaynak', uri: 'https://example.com/kaynak' },
            ],
            legalSearchResults: [
                {
                    title: '10. Ceza Dairesi 2025/8690 E. 2026/32 K.',
                    daire: '10. Ceza Dairesi',
                    esasNo: '2025/8690',
                    kararNo: '2026/32',
                    tarih: '10.01.2026',
                    selectionReason: 'TCK 188 ve TCK 191 ayrimi ile ticaret kastini dogrudan tartisiyor.',
                    matchedRequiredConcepts: ['TCK 188', 'TCK 191'],
                    matchedEvidenceConcepts: ['fiziki takip', 'tanik beyanlari'],
                },
            ],
            legalSearchResult: '- 10. Ceza Dairesi 2025/8690 E. 2026/32 K.',
            docContent: 'Ek belge notu',
            specifics: 'Somut olaya uyarlanmis dille yaz.',
            chatHistory: [],
            parties: {},
        });

        expect(prompt).toContain('WEB ARASTIRMASI OZETI');
        expect(prompt).toContain('Ornek kaynak');
        expect(prompt).toContain('Emsal Kararlar ve Hukuki Dayanaklar');
        expect(prompt).toContain('10. Ceza Dairesi');
        expect(prompt).toContain('TCK 188');
        expect(prompt).toContain('fiziki takip');
        expect(prompt).toContain('Detayli Hukuki Analiz');
        expect(prompt).toContain('Savcilik ticaret kastinin varligini ileri suruyor.');
        expect(prompt).toContain('Arama usulune itiraz gelebilir.');
        expect(prompt).toContain('ilgili dilekce maddesiyle eslestirilmeden');
    });

    it('falls back to raw legal search summary text when structured results are missing', () => {
        const formatted = petitionTestables.formatLegalResultsForPrompt({
            legalSearchResult: '- Danistay 6. Daire 2025/123 E. 2025/456 K. hizmet kusuru ve tam yargi davasini tartisiyor.',
        });

        expect(formatted).toContain('Danistay 6. Daire');
        expect(formatted).not.toContain('Saglanmadi.');
    });

    it('formats detailed analysis into the petition prompt payload', () => {
        const formatted = petitionTestables.formatAnalysisInsightsForPrompt({
            documentType: 'sozlesme',
            caseStage: 'dava oncesi',
            primaryDomain: 'borclar',
            caseType: 'alacak',
            coreIssue: 'sozlesmeye aykirilik ve temerrut',
            claims: ['Davaci alacagin odenmedigini ileri suruyor.'],
            defenses: ['Davali ifanin yerine getirildigini savunuyor.'],
            evidenceSummary: ['sozlesme', 'ihtarname'],
            risksAndWeakPoints: ['Temerrut tarihi net degil.'],
        });

        expect(formatted).toContain('Belge Tipi: sozlesme');
        expect(formatted).toContain('Ana Hukuk Alani: borclar');
        expect(formatted).toContain('Davaci alacagin odenmedigini ileri suruyor.');
        expect(formatted).toContain('Temerrut tarihi net degil.');
    });
});

describe('chat context evidence wiring', () => {
    it('uses current web and legal context field names in the system instruction', () => {
        const instruction = chatTestables.buildSystemInstruction({
            analysisSummary: 'Isten cikarilan isci ise iade talep ediyor.',
            context: {
                keywords: 'ise iade, gecersiz fesih',
                searchSummary: 'Web arastirmasi gecersiz fesihte feshin son care oldugunu vurguluyor.',
                legalSummary: '9. Hukuk Dairesi kararlari ise iade ve gecersiz fesih olcutlerini aktariyor.',
                webSources: [{ title: 'Ornek kaynak', uri: 'https://example.com/kaynak' }],
                legalSearchResults: [{ title: '9. Hukuk Dairesi', esasNo: '2024/10', kararNo: '2024/20', selectionReason: 'Gecersiz fesih olcutlerini acikliyor.' }],
                docContent: 'Fesih bildirimi ve ihtarname metni mevcut.',
                specifics: 'Kisa ve net yaz.',
            },
        });

        expect(instruction).toContain('Anahtar Kelimeler: ise iade, gecersiz fesih');
        expect(instruction).toContain('Web Arastirma: Web arastirmasi gecersiz fesihte');
        expect(instruction).toContain('Emsal Kararlar: 9. Hukuk Dairesi');
        expect(instruction).toContain('Web Kaynaklari:');
        expect(instruction).toContain('Ornek kaynak');
        expect(instruction).toContain('Yapilandirilmis Emsal Sonuclari:');
        expect(instruction).toContain('Gecersiz fesih olcutlerini acikliyor.');
        expect(instruction).toContain('Ek Metinler: Fesih bildirimi');
        expect(instruction).toContain('Ozel Talimatlar: Kisa ve net yaz.');
    });
});
