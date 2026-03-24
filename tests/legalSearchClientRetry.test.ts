import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchLegalDecisionsDetailed } from '../src/utils/legalSearch';

const createJsonResponse = (payload: any, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const createAbortError = () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
};

describe('legal search client retries', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does not send retry requests after a client-side timeout', async () => {
        const fetchMock = vi.fn().mockRejectedValue(createAbortError());
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            searchLegalDecisionsDetailed({
                source: 'all',
                keyword: 'uyusturucu madde ticareti',
                rawQuery: 'Uyusturucu madde ticareti TCK 188/3',
            })
        ).rejects.toThrow('Ictihat aramasi zaman asimina ugradi');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reuses the same in-flight request for identical concurrent searches', async () => {
        let resolveFetch: ((value: Response) => void) | null = null;
        const fetchMock = vi.fn().mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                })
        );
        vi.stubGlobal('fetch', fetchMock);

        const firstRequest = searchLegalDecisionsDetailed({
            source: 'all',
            keyword: 'ise iade gecersiz fesih',
            rawQuery: 'Isverenin gecersiz feshi nedeniyle ise iade talebi',
        });
        const secondRequest = searchLegalDecisionsDetailed({
            source: 'all',
            keyword: 'ise iade gecersiz fesih',
            rawQuery: 'Isverenin gecersiz feshi nedeniyle ise iade talebi',
        });

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(resolveFetch).not.toBeNull();
        });

        if (!resolveFetch) {
            throw new Error('Fetch resolver kurulmamisti.');
        }

        resolveFetch(
            createJsonResponse({
                results: [
                    {
                        documentId: '123',
                        title: '9. Hukuk Dairesi karari',
                        esasNo: '2024/10',
                        kararNo: '2024/20',
                        tarih: '01.01.2024',
                    },
                ],
            })
        );

        const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(firstResult.normalizedResults).toHaveLength(1);
        expect(secondResult.normalizedResults).toHaveLength(1);
        expect(firstResult.normalizedResults[0]?.title).toBe(secondResult.normalizedResults[0]?.title);
    });
});
