import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    analyzeDocuments,
    generateSearchKeywords,
    performWebSearch,
    generatePetition,
    rewriteText,
    reviewPetition
} from '../services/geminiService';
import { UserRole, PetitionType } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('geminiService', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('analyzeDocuments', () => {
        it('should throw error when no documents provided', async () => {
            await expect(analyzeDocuments([], '', '')).rejects.toThrow(
                'Analiz edilecek hiçbir belge veya metin içeriği sağlanmadı.'
            );
        });

        it('should call API with correct payload', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    summary: 'Test özeti',
                    potentialParties: ['Davacı', 'Davalı'],
                    caseDetails: { court: 'Ankara Mahkemesi' },
                }),
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await analyzeDocuments([], 'UDF içeriği', '');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3001/api/gemini/analyze',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                })
            );

            expect(result.summary).toBe('Test özeti');
            expect(result.potentialParties).toContain('Davacı');
        });

        it('should handle API errors gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error',
                json: () => Promise.resolve({ error: 'Server error' }),
            });

            await expect(analyzeDocuments([], 'test', '')).rejects.toThrow('Server error');
        });
    });

    describe('generateSearchKeywords', () => {
        it('should return keywords from API response', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    keywords: ['haksız fesih', 'tazminat', 'iş hukuku'],
                }),
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await generateSearchKeywords('Özet metni', UserRole.Davaci);

            expect(result).toContain('haksız fesih');
            expect(result.length).toBe(3);
        });

        it('should return empty array on parse error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'invalid json' }),
            });

            const result = await generateSearchKeywords('Özet metni', UserRole.Davaci);

            expect(result).toEqual([]);
        });
    });

    describe('generatePetition', () => {
        it('should return petition text from API', async () => {
            const mockResponse = {
                text: 'Sayın Mahkeme Başkanlığına...',
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const params = {
                userRole: UserRole.Davaci,
                petitionType: PetitionType.DavaDilekcesi,
                caseDetails: { court: 'Test', fileNumber: '', decisionNumber: '', decisionDate: '' },
                analysisSummary: 'Özet',
                webSearchResult: '',
                specifics: '',
                chatHistory: [],
                docContent: '',
                parties: {},
            };

            const result = await generatePetition(params);

            expect(result).toBe('Sayın Mahkeme Başkanlığına...');
        });
    });

    describe('rewriteText', () => {
        it('should return rewritten text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ text: 'Düzeltilmiş metin' }),
            });

            const result = await rewriteText('Orijinal metin');

            expect(result).toBe('Düzeltilmiş metin');
        });
    });
});
