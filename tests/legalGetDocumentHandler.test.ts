import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLegalDocumentViaMcp = vi.fn();

vi.mock('../lib/legal/mcpLegalSearch.js', () => ({
    getLegalDocumentViaMcp,
}));

const createJsonResponse = (payload: any, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const createRes = () => ({
    statusCode: 200,
    payload: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { this.payload = data; return this; },
    end() { return this; },
    setHeader() {},
});

describe('get-document simple backend', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        getLegalDocumentViaMcp.mockReset();
    });

    it('uses simple Bedesten document retrieval first', async () => {
        const encodedHtml = Buffer.from('<p>Karar metni burada.</p>', 'utf-8').toString('base64');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: {
                content: encodedHtml,
                mimeType: 'text/html',
            },
        })));

        const { default: handler } = await import('../backend/legal/get-document.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'yargitay',
                documentId: '123456',
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(getLegalDocumentViaMcp).not.toHaveBeenCalled();
        expect(res.payload?.document).toContain('Karar metni burada.');
        expect(res.payload?.diagnostics?.backendMode).toBe('simple_bedesten');
    }, 15000);

    it('falls back to legacy document retrieval when the simple path is unsupported', async () => {
        vi.stubGlobal('fetch', vi.fn());
        getLegalDocumentViaMcp.mockResolvedValue({
            document: 'Legacy belge',
            sourceUrl: 'https://example.com/doc',
            mimeType: 'text/markdown',
        });

        const { default: handler } = await import('../backend/legal/get-document.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'anayasa',
                documentId: '654321',
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(getLegalDocumentViaMcp).toHaveBeenCalledTimes(1);
        expect(res.payload?.document).toBe('Legacy belge');
        expect(res.payload?.diagnostics?.backendMode).toBe('legacy_mcp');
        expect(res.payload?.diagnostics?.fallbackUsed).toBe(true);
        expect(res.payload?.diagnostics?.fallbackReason).toBe('unsupported_source');
    });

    it('can use MCP as the primary document backend when configured', async () => {
        vi.stubEnv('LEGAL_PRIMARY_BACKEND', 'mcp');
        vi.stubGlobal('fetch', vi.fn());
        getLegalDocumentViaMcp.mockResolvedValue({
            document: 'MCP belge icerigi',
            sourceUrl: 'https://example.com/mcp-doc',
            mimeType: 'text/markdown',
        });

        const { default: handler } = await import('../backend/legal/get-document.js');
        const req = {
            method: 'POST',
            headers: {},
            body: {
                source: 'yargitay',
                documentId: '777',
            },
        };
        const res = createRes();

        await handler(req as any, res as any);

        expect(getLegalDocumentViaMcp).toHaveBeenCalledTimes(1);
        expect(res.payload?.document).toBe('MCP belge icerigi');
        expect(res.payload?.diagnostics?.backendMode).toBe('mcp_primary');
        expect(res.payload?.diagnostics?.fallbackUsed).toBe(false);
    });
});
