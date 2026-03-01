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
                        caseDetails: { court: 'Ankara Mahkemesi' },
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

        it('should return empty array on parse failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'invalid json' }),
            });

            const result = await generateSearchKeywords('Ozet metni', UserRole.Davaci);
            expect(result).toEqual([]);
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
                caseDetails: { court: 'Test', fileNumber: '', decisionNumber: '', decisionDate: '' },
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
                caseDetails: { court: 'Test Mahkemesi', fileNumber: '', decisionNumber: '', decisionDate: '' },
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
