import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    analyzeDocuments,
    generateSearchKeywords,
    performWebSearch,
    generatePetition,
    rewriteText,
    reviewPetition,
} from '../services/geminiService';
import { UserRole, PetitionType } from '../types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('geminiService', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('analyzeDocuments', () => {
        it('should throw when no documents are provided', async () => {
            await expect(analyzeDocuments([], '', '')).rejects.toThrow(/Analiz edilecek/);
        });

        it('should call API and parse analysis payload', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: JSON.stringify({
                        summary: 'Test ozeti',
                        potentialParties: ['Davaci', 'Davali'],
                        analysisInsights: {
                            documentType: 'iddianame',
                            caseStage: 'ilk derece',
                            primaryDomain: 'ceza',
                            caseType: 'uyusturucu ticareti',
                            coreIssue: 'TCK 188 ile TCK 191 ayrimi',
                            keyFacts: ['Fiziki takip yapildi', 'Sanik evinde maddeler ele gecirildi'],
                            claims: ['Savcilik ticaret kastinin var oldugunu ileri suruyor'],
                            defenses: ['Sanik kisisel kullanim savunmasi yapiyor'],
                            evidenceSummary: ['Tanik beyanlari', 'Kriminal rapor'],
                            legalIssues: ['ticaret kastinin ispatı', 'kisisel kullanim siniri'],
                            risksAndWeakPoints: ['Arama usulune itiraz gelebilir'],
                            webSearchPlan: {
                                coreQueries: ['uyusturucu madde ticareti TCK 188', 'kisisel kullanim TCK 191'],
                                focusTopics: ['ticaret kasti', 'kisisel kullanim siniri'],
                            },
                            precedentSearchPlan: {
                                requiredConcepts: ['TCK 188', 'TCK 191'],
                                supportConcepts: ['ticaret kasti'],
                                evidenceConcepts: ['fiziki takip'],
                                preferredSource: 'yargitay',
                                preferredBirimCodes: ['C10'],
                                searchSeedText: 'TCK 188 TCK 191 ticaret kasti',
                                searchVariants: [
                                    { query: '+"TCK 188" +"ticaret kasti"', mode: 'strict' },
                                    { query: '"TCK 188" "TCK 191"', mode: 'statute' },
                                ],
                                fallbackToNext: true,
                                queryMode: 'long_fact',
                            },
                        },
                        legalSearchPacket: {
                            primaryDomain: 'is_hukuku',
                            caseType: 'ise iade',
                            coreIssue: 'Gecersiz fesih iddiasi',
                            requiredConcepts: ['ise iade', 'gecersiz fesih'],
                            supportConcepts: ['bosta gecen sure ucreti'],
                            preferredSource: 'yargitay',
                            preferredBirimCodes: ['H9'],
                            searchSeedText: 'Ise iade gecersiz fesih',
                            searchVariants: [
                                { query: '+"ise iade" +"gecersiz fesih"', mode: 'strict' },
                                { query: '+"ise iade" +"is guvencesi"', mode: 'broad' },
                            ],
                            fallbackToNext: true,
                            queryMode: 'short_issue',
                        },
                        caseDetails: { caseTitle: '', court: 'Ankara Mahkemesi' },
                    }),
                }),
            });

            const result = await analyzeDocuments([], 'UDF icerigi', '');

            expect(mockFetch).toHaveBeenCalledWith(
                '/api/gemini/analyze',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                })
            );
            expect(result.summary).toBe('Test ozeti');
            expect(result.potentialParties).toContain('Davaci');
            expect(result.legalSearchPacket?.primaryDomain).toBe('is_hukuku');
            expect(result.legalSearchPacket?.requiredConcepts).toContain('ise iade');
            expect(result.legalSearchPacket?.preferredBirimCodes).toContain('H9');
            expect(result.legalSearchPacket?.searchVariants?.[0]).toEqual({
                query: '+"ise iade" +"gecersiz fesih"',
                mode: 'strict',
            });
            expect(result.analysisInsights?.documentType).toBe('iddianame');
            expect(result.analysisInsights?.claims).toContain('Savcilik ticaret kastinin var oldugunu ileri suruyor');
            expect(result.analysisInsights?.webSearchPlan?.coreQueries).toContain('uyusturucu madde ticareti TCK 188');
            expect(result.analysisInsights?.precedentSearchPlan?.searchVariants?.[0]).toEqual({
                query: '+"TCK 188" +"ticaret kasti"',
                mode: 'strict',
            });
        });

        it('should build a fallback legal search packet when backend response omits it', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: JSON.stringify({
                        summary: 'Ise iade davasinda gecersiz fesih ve ise baslatmama tazminati talebi.',
                        potentialParties: ['Davaci', 'Davali'],
                    }),
                }),
            });

            const result = await analyzeDocuments([], 'Ise iade davasinda gecersiz fesih ve ise baslatmama tazminati talebi.', '');

            expect(result.legalSearchPacket?.searchSeedText).toBeTruthy();
            expect(result.legalSearchPacket?.searchVariants?.length || 0).toBeGreaterThan(0);
            expect(result.legalSearchPacket?.requiredConcepts?.length || 0).toBeGreaterThan(0);
            expect(result.analysisInsights?.coreIssue).toBeTruthy();
            expect(result.analysisInsights?.precedentSearchPlan?.requiredConcepts?.length || 0).toBeGreaterThan(0);
            expect(result.analysisInsights?.precedentSearchPlan?.searchVariants?.length || 0).toBeGreaterThan(0);
        });

        it('extracts contrastive legal concepts from short issue text without manual keyword input', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: JSON.stringify({
                        summary: 'Uyuşturucu ticareti mi kullanmak mı ayrımı deliller üzerinden tartışılmaktadır.',
                        potentialParties: ['Sanik'],
                    }),
                }),
            });

            const result = await analyzeDocuments([], 'uyuşturucu ticareti mi kullanmak mı ayırımı deliller', '');

            expect(result.legalSearchPacket?.requiredConcepts).toEqual(expect.arrayContaining([
                'uyuşturucu ticareti',
            ]));
            expect(
                (result.legalSearchPacket?.requiredConcepts || []).some((concept) => concept.includes('kullanmak'))
            ).toBe(true);
            expect(result.legalSearchPacket?.supportConcepts).toContain('uyuşturucu ticareti kullanmak ayrimi');
            expect(result.legalSearchPacket?.searchVariants?.[0]?.query).toContain('uyuşturucu ticareti');
        });

        it('extracts absence-of-evidence phrases from long criminal defense text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: JSON.stringify({
                        summary: 'Hassas terazi ve nakit para gibi emarelerin bulunmadigi, not kagitlarinin ticari amaca delalet etmedigi savunuluyor.',
                        potentialParties: ['Sanik'],
                    }),
                }),
            });

            const result = await analyzeDocuments([], `Müvekkilimizin ikametinde yapılan aramada uyuşturucu maddelerin paketlemede kullanıldığı iddia edilen not kağıtları dışında, hassas terazi, çok sayıda boş paketleme malzemesi, büyük miktarda nakit para gibi uyuşturucu ticareti için gerekli ve tipik olan emareler bulunmamıştır. Not kağıtları ticari amaca delalet etmez.`, '');

            expect(result.legalSearchPacket?.supportConcepts).toEqual(expect.arrayContaining([
                'hassas terazi',
                'nakit para',
                'ticari amaca delalet etmez',
            ]));
        });


        it('repairs malformed searchVariants queries before parsing analyze response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: '{"summary":"Ozet","analysisInsights":{"documentType":"iddianame","precedentSearchPlan":{"requiredConcepts":["TCK 188"],"searchSeedText":"uyusturucu ticareti","searchVariants":[{"query":"+"uyu?turucu madde ticareti" +"TCK 188" +"kullan?m s?n?r?"","mode":"strict"}] }},"legalSearchPacket":{"primaryDomain":"ceza","caseType":"Uyu?turucu ticareti","coreIssue":"TCK 188 ayrimi","requiredConcepts":["uyu?turucu madde ticareti"],"searchSeedText":"uyusturucu ticareti","searchVariants":[{"query":"+"uyu?turucu madde ticareti" +"TCK 188" +"kullan?m s?n?r?"","mode":"strict"}]}}',
                }),
            });

            const result = await analyzeDocuments([], 'uyusturucu ticareti', '');

            expect(result.legalSearchPacket?.searchVariants?.[0]).toEqual({
                query: '+"uyu?turucu madde ticareti" +"TCK 188" +"kullan?m s?n?r?"',
                mode: 'strict',
            });
            expect(result.analysisInsights?.precedentSearchPlan?.searchVariants?.[0]).toEqual({
                query: '+"uyu?turucu madde ticareti" +"TCK 188" +"kullan?m s?n?r?"',
                mode: 'strict',
            });
        });
        it('should throw backend error message for failed response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error',
                json: () => Promise.resolve({ error: 'Server error' }),
            });

            await expect(analyzeDocuments([], 'test', '')).rejects.toThrow('Server error');
        });
    });

    describe('generateSearchKeywords', () => {
        it('should return keyword array from API response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: JSON.stringify({ keywords: ['haksiz fesih', 'tazminat', 'is hukuku'] }),
                }),
            });

            const result = await generateSearchKeywords('Ozet metni', UserRole.Davaci);

            expect(result).toContain('haksiz fesih');
            expect(result.length).toBe(3);
        });

        it('should fall back to extracted keywords on parse failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'invalid json' }),
            });

            const result = await generateSearchKeywords('Ozet metni', UserRole.Davaci);
            expect(result).toContain('Ozet metni');
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('performWebSearch', () => {
        it('should map text and grounding metadata to search result', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    text: 'Arama ozeti',
                    groundingMetadata: {
                        groundingChunks: [
                            { web: { uri: 'https://example.com/1', title: 'Kaynak 1' } },
                            { web: { uri: 'https://example.com/2', title: 'Kaynak 2' } },
                        ],
                    },
                }),
            });

            const result = await performWebSearch(['ise iade', 'kidem']);

            expect(result.summary).toBe('Arama ozeti');
            expect(result.sources).toHaveLength(2);
            expect(result.sources[0].uri).toBe('https://example.com/1');
        });
    });

    describe('generatePetition', () => {
        it('should return petition text from API', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'Sayin Mahkeme Baskanligina...' }),
            });

            const params = {
                userRole: UserRole.Davaci,
                petitionType: PetitionType.DavaDilekcesi,
                caseDetails: { caseTitle: '', court: 'Test', fileNumber: '', decisionNumber: '', decisionDate: '' },
                analysisSummary: 'Ozet',
                webSearchResult: '',
                specifics: '',
                chatHistory: [],
                docContent: '',
                parties: {},
            };

            const result = await generatePetition(params);
            expect(result).toBe('Sayin Mahkeme Baskanligina...');
        });
    });

    describe('rewriteText', () => {
        it('should return rewritten text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'Duzeltilmis metin' }),
            });

            const result = await rewriteText('Orijinal metin');
            expect(result).toBe('Duzeltilmis metin');
        });
    });

    describe('reviewPetition', () => {
        it('should return reviewed petition text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'Gozden gecirilmis dilekce' }),
            });

            const params = {
                userRole: UserRole.Davaci,
                petitionType: PetitionType.DavaDilekcesi,
                caseDetails: { caseTitle: '', court: 'Test Mahkemesi', fileNumber: '', decisionNumber: '', decisionDate: '' },
                analysisSummary: 'Analiz',
                webSearchResult: '',
                specifics: '',
                chatHistory: [],
                docContent: '',
                parties: {},
                currentPetition: 'Mevcut dilekce metni',
            };

            const result = await reviewPetition(params);
            expect(result).toBe('Gozden gecirilmis dilekce');
        });
    });
});
