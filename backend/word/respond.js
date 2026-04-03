import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { getGeminiClient, GEMINI_MODEL_NAME } from '../gemini/_shared.js';
import analyzeHandler from '../gemini/analyze.js';
import rewriteHandler from '../gemini/rewrite.js';
import webSearchHandler from '../gemini/web-search.js';
import { buildSystemInstruction } from '../gemini/chat.js';
import { resolveWordAssistantIntent } from '../../lib/assistant/intent-routing.js';
import { buildDocumentAnalyzerResult, buildLegalResultsPrompt } from '../../lib/assistant/legal-search-context.js';
import { buildAssistantChatContext } from '../../lib/assistant/chat-context-builder.js';
import { searchLegalDecisionsViaSimpleBedesten } from '../../lib/legal/simpleBedestenService.js';

const WORD_ASSISTANT_MODEL = GEMINI_MODEL_NAME;

const normalizeMode = (value = '') => {
    const normalized = String(value || 'edit').trim().toLowerCase();
    return ['edit', 'brainstorm', 'web_search', 'precedent_search', 'research_and_answer'].includes(normalized)
        ? normalized
        : 'edit';
};

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const compactSearchQuery = (value = '') => normalizeText(value).split(/\s+/).slice(0, 12).join(' ');

const createMemoryResponse = () => {
    let statusCode = 200;
    let ended = false;
    let jsonPayload = null;
    const headers = {};

    return {
        get statusCode() {
            return statusCode;
        },
        get jsonPayload() {
            return jsonPayload;
        },
        get ended() {
            return ended;
        },
        headers,
        setHeader(name, value) {
            headers[name] = value;
            return this;
        },
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            jsonPayload = payload;
            ended = true;
            return this;
        },
        end(payload) {
            jsonPayload = payload ?? jsonPayload;
            ended = true;
            return this;
        },
        write() {
            return true;
        },
    };
};

const invokeJsonHandler = async (handler, reqLike) => {
    const resLike = createMemoryResponse();
    await handler(reqLike, resLike);

    if (resLike.statusCode >= 400) {
        const errorMessage = resLike.jsonPayload?.error || `HTTP ${resLike.statusCode}`;
        const error = new Error(errorMessage);
        error.status = resLike.statusCode;
        error.payload = resLike.jsonPayload;
        throw error;
    }

    return resLike.jsonPayload;
};

const summarizeAnalysis = (analysisPayload) => {
    const rawText = String(analysisPayload?.text || '').trim();
    if (!rawText) return null;

    try {
        return JSON.parse(rawText);
    } catch {
        return {
            summary: rawText,
        };
    }
};

const buildLegalSearchRequest = ({
    message = '',
    selectionText = '',
    documentText = '',
    analysisData = null,
    documentAnalyzerResult = null,
} = {}) => {
    const rawQuery = normalizeText([
        message,
        selectionText,
        documentText,
        analysisData?.summary,
        documentAnalyzerResult?.hukukiMesele,
    ].filter(Boolean).join('\n\n'));

    return {
        source: 'all',
        keyword: compactSearchQuery(rawQuery) || rawQuery,
        rawQuery,
        legalSearchPacket: analysisData?.legalSearchPacket || undefined,
        documentAnalyzerResult,
        filters: { searchArea: 'auto' },
        searchMode: 'pro',
        apiBaseUrl: '',
    };
};

const performAssistantChatCompletion = async ({
    message = '',
    selectionText = '',
    documentText = '',
    context,
    analysisSummary = '',
} = {}) => {
    const ai = getGeminiClient();
    const userMessage = [
        normalizeText(message),
        selectionText ? `Word secimi:\n${selectionText}` : '',
        documentText ? `Belge baglami:\n${documentText}` : '',
    ].filter(Boolean).join('\n\n');

    const response = await ai.models.generateContent({
        model: WORD_ASSISTANT_MODEL,
        contents: userMessage,
        config: {
            systemInstruction: buildSystemInstruction({
                analysisSummary,
                context,
            }),
        },
    });

    return String(response?.text || '').trim();
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
        const message = normalizeText(req.body?.message || '');
        const selectionText = String(req.body?.selectionText || '').trim();
        const documentText = String(req.body?.documentText || '').trim();
        const includeDocumentContext = Boolean(req.body?.includeDocumentContext);
        const mode = normalizeMode(req.body?.mode);
        const files = Array.isArray(req.body?.files) ? req.body.files : [];

        if (!message && !selectionText && !documentText) {
            return res.status(400).json({ error: 'message, selectionText veya documentText gerekli.' });
        }

        const intent = resolveWordAssistantIntent({ mode, message });
        const effectiveDocumentText = includeDocumentContext ? documentText : '';
        const combinedContextText = [selectionText, effectiveDocumentText].filter(Boolean).join('\n\n');

        let analysisData = null;
        let documentAnalyzerResult = null;
        let webSearch = null;
        let legalSearch = null;
        let assistantText = '';

        if (mode === 'edit') {
            const rewritePayload = await invokeJsonHandler(rewriteHandler, {
                method: 'POST',
                headers: req.headers || {},
                body: {
                    textToRewrite: normalizeText(selectionText || effectiveDocumentText || message),
                    mode: 'rewrite',
                },
            });

            assistantText = String(rewritePayload?.text || '').trim();
            return res.status(200).json({
                assistantText,
                webSearch: null,
                legalSearch: null,
                analysis: null,
                appliedIntent: intent.appliedIntent,
                quota: null,
                debug: process.env.NODE_ENV === 'production' ? undefined : { mode },
            });
        }

        if ((intent.allowLegalSearch || mode === 'research_and_answer') && combinedContextText) {
            try {
                const analyzePayload = await invokeJsonHandler(analyzeHandler, {
                    method: 'POST',
                    headers: req.headers || {},
                    body: {
                        uploadedFiles: files,
                        udfTextContent: normalizeText(message),
                        wordTextContent: combinedContextText,
                    },
                });
                analysisData = summarizeAnalysis(analyzePayload);
                documentAnalyzerResult = buildDocumentAnalyzerResult(analysisData, combinedContextText);
            } catch {
                analysisData = {
                    summary: combinedContextText || message,
                };
                documentAnalyzerResult = null;
            }
        }

        if (intent.allowWebSearch) {
            const queryKeywords = compactSearchQuery(
                normalizeText([message, selectionText, analysisData?.summary].filter(Boolean).join(' '))
            ).split(/\s+/).filter(Boolean).slice(0, 8);

            webSearch = await invokeJsonHandler(webSearchHandler, {
                method: 'POST',
                headers: req.headers || {},
                body: {
                    keywords: queryKeywords,
                    query: message || selectionText || analysisData?.summary || '',
                },
            }).catch(() => ({
                text: '',
                groundingMetadata: null,
                degraded: true,
                sources: [],
            }));

            webSearch = {
                summary: String(webSearch?.text || '').trim(),
                sources: Array.isArray(webSearch?.groundingMetadata?.groundingChunks)
                    ? webSearch.groundingMetadata.groundingChunks.map((chunk) => ({
                        uri: chunk?.web?.uri,
                        title: chunk?.web?.title,
                    })).filter((item) => item.uri)
                    : [],
                degraded: Boolean(webSearch?.degraded),
                warning: webSearch?.warning || null,
            };
        }

        if (intent.allowLegalSearch) {
            const legalSearchRequest = buildLegalSearchRequest({
                message,
                selectionText,
                documentText: effectiveDocumentText,
                analysisData,
                documentAnalyzerResult,
            });

            const simplePayload = await searchLegalDecisionsViaSimpleBedesten({
                source: legalSearchRequest.source,
                keyword: legalSearchRequest.keyword,
                rawQuery: legalSearchRequest.rawQuery,
                legalSearchPacket: legalSearchRequest.legalSearchPacket,
                documentAnalyzerResult: legalSearchRequest.documentAnalyzerResult,
                filters: legalSearchRequest.filters,
                searchMode: 'pro',
            });
            legalSearch = {
                summary: buildLegalResultsPrompt(simplePayload?.results?.slice(0, 5) || []),
                results: simplePayload?.results || [],
                retrievalDiagnostics: simplePayload?.retrievalDiagnostics || null,
            };
        }

        if (mode === 'precedent_search') {
            assistantText = legalSearch?.summary || 'Bu konuda emsal karar bulunamadi.';
        } else if (mode === 'web_search') {
            assistantText = webSearch?.summary || 'Bu konuda web arastirmasi sonucu bulunamadi.';
        } else {
            assistantText = await performAssistantChatCompletion({
                message,
                selectionText,
                documentText: effectiveDocumentText,
                analysisSummary: String(analysisData?.summary || combinedContextText || message).trim(),
                context: buildAssistantChatContext({
                    keywords: compactSearchQuery(message || combinedContextText).split(/\s+/).filter(Boolean).slice(0, 8),
                    webSearchResult: webSearch,
                    legalSearchResults: legalSearch?.results || [],
                    docContent: effectiveDocumentText,
                    specifics: selectionText,
                    allowWebSearch: intent.allowWebSearch,
                    allowLegalSearch: intent.allowLegalSearch,
                    disableDocumentGeneration: true,
                }),
            });
        }

        return res.status(200).json({
            assistantText,
            webSearch,
            legalSearch,
            analysis: {
                summary: analysisData?.summary || null,
                documentAnalyzerResult,
                legalSearchPacket: analysisData?.legalSearchPacket || null,
            },
            appliedIntent: intent.appliedIntent,
            quota: null,
            debug: process.env.NODE_ENV === 'production' ? undefined : {
                mode,
                allowWebSearch: intent.allowWebSearch,
                allowLegalSearch: intent.allowLegalSearch,
            },
        });
    } catch (error) {
        console.error('Word assistant response error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Word assistant response failed'),
            details: process.env.NODE_ENV === 'production' ? null : (error?.message || null),
        });
    }
}

export const __testables = {
    resolveWordAssistantIntent,
};
