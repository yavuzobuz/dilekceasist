import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { getLegalDocumentViaMcp } from '../../lib/legal/mcpLegalSearch.js';
import {
    getLegalDocumentViaSimpleBedesten,
    supportsSimpleBedestenDocument,
} from '../../lib/legal/simpleBedestenService.js';

const ALLOW_LEGACY_FALLBACK = process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK !== '0';
const LEGAL_PRIMARY_BACKEND = String(process.env.LEGAL_PRIMARY_BACKEND || 'simple').trim().toLowerCase() === 'mcp'
    ? 'mcp'
    : 'simple';
const LEGAL_SIMPLE_PROVIDER = String(
    process.env.LEGAL_SIMPLE_BEDESTEN_PROVIDER || (process.env.NODE_ENV === 'test' ? 'http' : 'auto')
).trim().toLowerCase();

const buildLegacyDocumentPayload = ({ payload = {}, fallbackReason = 'legacy_requested' } = {}) => {
    const diagnostics = {
        ...(payload?.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : {}),
        backendMode: 'legacy_mcp',
        fallbackUsed: true,
        fallbackReason,
        upstream: 'legacy_mcp',
    };

    const document = typeof payload?.document === 'string'
        ? payload.document
        : (typeof payload?.markdownContent === 'string'
            ? payload.markdownContent
            : '');

    return {
        ...payload,
        document,
        sourceUrl: payload?.sourceUrl || payload?.documentUrl || undefined,
        mimeType: payload?.mimeType || undefined,
        diagnostics,
    };
};

const buildMcpPrimaryDocumentPayload = ({ payload = {}, fallbackUsed = false, fallbackReason = null } = {}) => {
    const diagnostics = {
        ...(payload?.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : {}),
        backendMode: 'mcp_primary',
        fallbackUsed,
        fallbackReason,
        upstream: 'mcp',
    };

    const document = typeof payload?.document === 'string'
        ? payload.document
        : (typeof payload?.markdownContent === 'string'
            ? payload.markdownContent
            : '');

    return {
        ...payload,
        document,
        sourceUrl: payload?.sourceUrl || payload?.documentUrl || undefined,
        mimeType: payload?.mimeType || undefined,
        diagnostics,
    };
};

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, x-api-key',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const source = String(req?.body?.source || 'all').trim().toLowerCase();
        const documentId = String(req?.body?.documentId || '').trim();
        const documentUrl = String(req?.body?.documentUrl || req?.body?.sourceUrl || '').trim();

        if (!documentId && !documentUrl) {
            return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
        }

        if (LEGAL_PRIMARY_BACKEND === 'mcp') {
            const mcpPayload = await getLegalDocumentViaMcp({
                source,
                documentId,
                documentUrl,
            });

            const mcpDocument = typeof mcpPayload?.document === 'string'
                ? mcpPayload.document
                : (typeof mcpPayload?.markdownContent === 'string' ? mcpPayload.markdownContent : '');

            if (mcpDocument.trim()) {
                return res.status(200).json(buildMcpPrimaryDocumentPayload({
                    payload: mcpPayload,
                }));
            }

            if (!supportsSimpleBedestenDocument({ source, documentId, documentUrl })) {
                return res.status(200).json(buildMcpPrimaryDocumentPayload({
                    payload: mcpPayload,
                }));
            }

            try {
                const simplePayload = await getLegalDocumentViaSimpleBedesten({
                    source,
                    documentId,
                    documentUrl,
                    provider: LEGAL_SIMPLE_PROVIDER,
                });
                return res.status(200).json({
                    ...simplePayload,
                    diagnostics: {
                        ...(simplePayload?.diagnostics || {}),
                        backendMode: 'simple_bedesten',
                        fallbackUsed: true,
                        fallbackReason: 'mcp_primary_empty_document',
                        upstream: 'bedesten',
                    },
                });
            } catch (error) {
                console.warn('[MCP Primary Document] simple fallback failed:', error?.message || error);
            }

            return res.status(200).json(buildMcpPrimaryDocumentPayload({
                payload: mcpPayload,
            }));
        }

        let fallbackReason = supportsSimpleBedestenDocument({ source, documentId, documentUrl })
            ? 'simple_document_error'
            : 'unsupported_source';

        if (supportsSimpleBedestenDocument({ source, documentId, documentUrl })) {
            try {
                const payload = await getLegalDocumentViaSimpleBedesten({
                    source,
                    documentId,
                    documentUrl,
                    provider: LEGAL_SIMPLE_PROVIDER,
                });
                return res.status(200).json(payload);
            } catch (error) {
                console.warn('[Simple Bedesten Document] fallback to legacy document:', error?.message || error);
                fallbackReason = String(error?.code || error?.message || 'simple_document_error');
            }
        }

        if (!ALLOW_LEGACY_FALLBACK) {
            return res.status(503).json({
                error: 'Karar metni su anda getirilemiyor.',
            });
        }

        const payload = await getLegalDocumentViaMcp({
            source,
            documentId,
            documentUrl,
        });

        return res.status(200).json(buildLegacyDocumentPayload({
            payload,
            fallbackReason,
        }));
    } catch (error) {
        const statusCode = Number(error?.status) || 500;
        console.error('Legal document error:', error);
        return res.status(statusCode).json({
            error: getSafeErrorMessage(error, 'Karar metni su anda getirilemiyor.'),
        });
    }
}
