import { afterEach, describe, expect, it, vi } from 'vitest';
import * as embeddingReranker from '../lib/legal/embeddingReranker.js';

describe('embeddingReranker', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('caps procedural shell merged score below 0.4 and keeps scores normalized', () => {
        expect(embeddingReranker.mergeDocumentScores({
            lexicalScore: 4000,
            embeddingScore: 0.98,
            proceduralShellBias: true,
        })).toBeLessThan(0.4);

        expect(embeddingReranker.mergeDocumentScores({
            lexicalScore: 2500,
            embeddingScore: 1.4,
            proceduralShellBias: false,
        })).toBeLessThanOrEqual(1);
    });

    it('returns 0 for empty embedding inputs', async () => {
        await expect(embeddingReranker.computeEmbeddingScore({
            queryEmbedding: [],
            documentText: '',
            documentId: 'doc-empty',
            cache: new Map(),
        })).resolves.toBe(0);
    });

    it('reuses chunk embeddings from cache for the same document', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            embedding: { values: [1, 0, 0] },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        process.env.GEMINI_API_KEY = 'test-key';

        const cache = new Map();
        const text = [
            'OLAY: Kiraciya ihtar gonderildi ve tahliye taahhudune dayali takip yapildi.',
            'GEREKCE: Mahkeme kiralananin tahliyesi ve hakli ihtar sartlarini tartisti.',
            'DELIL: Sozlesme, ihtarname ve icra takip dosyasi incelendi.',
            'HUKUM: Davanin kabulune karar verildi.',
        ].join(' ');

        const first = await embeddingReranker.computeEmbeddingScore({
            queryEmbedding: [1, 0, 0],
            documentText: text,
            documentId: 'doc-1',
            cache,
        });
        const firstCallCount = fetchMock.mock.calls.length;

        const second = await embeddingReranker.computeEmbeddingScore({
            queryEmbedding: [1, 0, 0],
            documentText: text,
            documentId: 'doc-1',
            cache,
        });

        expect(first).toBeGreaterThan(0);
        expect(second).toBe(first);
        expect(fetchMock.mock.calls.length).toBe(firstCallCount);
    });
});
