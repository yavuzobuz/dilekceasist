import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    normalizeLegalSearchResults,
    searchLegalDecisions,
    getLegalDocument,
} from '../src/utils/legalSearch';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('legalSearch utils', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('should normalize direct array payloads', () => {
        const payload = [
            {
                id: 'doc-1',
                title: 'Yargitay 1. HD Karari',
                esasNo: '2024/1',
                kararNo: '2024/2',
                tarih: '2024-01-01',
                ozet: 'Kisa ozet',
            },
        ];

        const normalized = normalizeLegalSearchResults(payload);

        expect(normalized).toHaveLength(1);
        expect(normalized[0].id).toBe('doc-1');
        expect(normalized[0].title).toContain('Yargitay');
        expect(normalized[0].ozet).toBe('Kisa ozet');
    });

    it('should parse markdown-wrapped JSON from text payload', () => {
        const payload = {
            text: '```json\n[{"title":"Danistay karari","esas_no":"2023/5","karar_no":"2023/9","summary":"ozet"}]\n```',
        };

        const normalized = normalizeLegalSearchResults(payload);

        expect(normalized).toHaveLength(1);
        expect(normalized[0].title).toBe('Danistay karari');
        expect(normalized[0].esasNo).toBe('2023/5');
        expect(normalized[0].kararNo).toBe('2023/9');
    });

    it('should deduplicate repeated decisions by core key', () => {
        const payload = {
            results: [
                {
                    title: 'Ayni Karar',
                    esasNo: '2022/11',
                    kararNo: '2022/22',
                    tarih: '2022-05-10',
                    ozet: 'Ilk',
                },
                {
                    title: 'Ayni Karar',
                    esasNo: '2022/11',
                    kararNo: '2022/22',
                    tarih: '2022-05-10',
                    ozet: 'Ikinci',
                },
            ],
        };

        const normalized = normalizeLegalSearchResults(payload);

        expect(normalized).toHaveLength(1);
    });

    it('should ignore payload entries without core legal fields', () => {
        const payload = [{ foo: 'bar' }, { baz: 1 }];
        const normalized = normalizeLegalSearchResults(payload);
        expect(normalized).toEqual([]);
    });

    it('searchLegalDecisions should call primary endpoint and normalize response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [{ title: 'Karar A', esasNo: '1', kararNo: '2', ozet: 'x' }],
            }),
        });

        const data = await searchLegalDecisions({
            source: 'yargitay',
            keyword: 'hakaret',
            filters: { year: 2025 },
        });

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/legal/search-decisions',
            expect.objectContaining({ method: 'POST' })
        );
        expect(data).toHaveLength(1);
        expect(data[0].title).toBe('Karar A');
    });

    it('searchLegalDecisions should fallback to action endpoint when primary fails', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: false, text: async () => 'primary failed' })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [{ title: 'Karar B', esasNo: '10', kararNo: '20', ozet: 'y' }],
                }),
            });

        const data = await searchLegalDecisions({
            source: 'danistay',
            keyword: 'iptal',
        });

        expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            '/api/legal?action=search-decisions',
            expect.objectContaining({ method: 'POST' })
        );
        expect(data[0].title).toBe('Karar B');
    });

    it('searchLegalDecisions should throw backend error text when both endpoints fail', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: false, text: async () => 'first error' })
            .mockResolvedValueOnce({ ok: false, text: async () => 'second error' });

        await expect(
            searchLegalDecisions({ source: 'yargitay', keyword: 'test' })
        ).rejects.toThrow('second error');
    });

    it('getLegalDocument should reject when document id and url are missing', async () => {
        await expect(getLegalDocument({ source: 'yargitay' })).rejects.toThrow('Belge kimligi bulunamadi.');
    });

    it('getLegalDocument should return string document directly', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ document: 'Tam metin icerigi' }),
        });

        const content = await getLegalDocument({ source: 'yargitay', documentId: 'abc' });
        expect(content).toBe('Tam metin icerigi');
    });

    it('getLegalDocument should fallback and extract object content', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: false, text: async () => 'down' })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ document: { markdown_content: '# Baslik\nIcerik' } }),
            });

        const content = await getLegalDocument({
            source: 'danistay',
            documentId: 'xyz',
            title: 'ornek',
        });

        expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            '/api/legal?action=get-document',
            expect.objectContaining({ method: 'POST' })
        );
        expect(content).toContain('# Baslik');
    });
});

