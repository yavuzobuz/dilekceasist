import { Type } from '@google/genai';
import { consumeGenerationCredit, TRIAL_DAILY_GENERATION_LIMIT } from '../../lib/api/generationQuota.js';
import legalApiHandler from '../../api/legal/[action].js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

const getAiClient = () => getGeminiClient();

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const truncateText = (value, maxLength = 180) => {
    const safe = normalizeText(value);
    if (!safe || safe.length <= maxLength) return safe;
    return `${safe.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const CHAT_VISIBLE_LEGAL_RESULT_LIMIT = 5;
const CHAT_LEGAL_SUMMARY_PREVIEW_CHARS = 480;

const normalizeKeywordText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const KEYWORD_STOPWORDS = new Set([
    've', 'veya', 'ile', 'olan', 'oldugu', 'iddia', 'edilen',
    'uzerine', 'kapsaminda', 'gibi', 'icin', 'uzere', 'bu', 'su', 'o', 'bir', 'de', 'da',
    'mi', 'mu', 'ki', 'ise', 'hem', 'ne', 'ya', 'ben', 'sen', 'biz', 'siz', 'ama',
    'fakat', 'ancak', 'eger', 'bile', 'dahi', 'kadar', 'sonra', 'once', 'yani',
    'zaten', 'sadece', 'yalniz', 'hep', 'her', 'hic', 'diye', 'bana', 'beni',
    'sana', 'seni', 'ona', 'onu', 'bize', 'size', 'olarak', 'gore', 'nasil',
    'misin', 'lutfen', 'neden', 'onlar', 'benim', 'senin', 'onun',
]);

const KEYWORD_DRAFTING_TERMS = new Set([
    'dilekce', 'savunma', 'belge', 'sozlesme', 'taslak', 'yaz', 'yazalim', 'hazirla', 'olustur', 'uret',
    'detayli', 'olmasi', 'olmali', 'koruyacak', 'haklarini', 'muvekkil', 'muvekkilin', 'vekil', 'vekili',
    'bana', 'lutfen', 'yardim', 'hazir', 'yapalim',
]);

// Expanded fact signal regex covering all Turkish law domains
const FACT_SIGNAL_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|sgk|iyuk|aihm|anayasa|madde|maddesi|esas|karar|yargitay|danistay|uyusturucu|hirsizlik|dolandiricilik|tehdit|yaralama|oldurme|gozalti|tutuk|delil|kamera|tanik|rapor|bilirkisi|ele gecir|kullanim siniri|ticaret|satici|isveren|kidem|ihbar|fesih|veraset|tapu|nafaka|velayet|bosanma|boşanma|miras|tenkis|haciz|icra|iflas|alacak|tazminat|kira|tahliye|imar|ruhsat|disiplin|kamulastirma|tuketici|ayipli|senet|cek|bono|sirket|ortaklik|beraat|mahkumiyet|temyiz|istinaf|itiraz|kanun|hukum|yargilama|dava|magdur|sanik|davaci|davali|bilirkisi|kesinlesme|infaz|hapis|adli para|erteleme|hagb|hukmun|denetim|suresi|suc|kusur|ispat|mudafi|musadere|gasp|yagma|zimmet|rusvet|irtikap|sahtecilik|hakaret|mala zarar|cinsel|taciz|mobbing|is kazasi|fazla mesai|ucret|brut|net|sigorta|prim|emekli|maluliyet|kadastro|ecrimisil|kat mulkiyeti|konkordato|kambiyo|ihtiyati|tedbir|tespit|tenfiz|tanima)\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b\d{4,}\b/i;

const hasFactSignal = (rawValue = '') => {
    const normalized = normalizeKeywordText(rawValue);
    if (!normalized) return false;
    return FACT_SIGNAL_REGEX.test(normalized);
};

const extractKeywordCandidates = (rawValue = '') => {
    const text = normalizeText(rawValue);
    if (!text) return [];

    const normalizedText = normalizeKeywordText(text);
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
        const cleaned = String(value || '').replace(/[“”\"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length < 3) return;

        const normalizedKey = normalizeKeywordText(cleaned);
        if (!normalizedKey || normalizedKey.length < 3) return;

        const words = normalizedKey.split(/\s+/).filter(Boolean);
        const nonStopWords = words.filter((word) => !KEYWORD_STOPWORDS.has(word));
        if (nonStopWords.length === 0) return;

        // Allow single meaningful words if they have a fact signal (legal term)
        // For multi-word phrases, accept even without fact signal as they are likely specific
        if (nonStopWords.length < 2 && !hasFactSignal(normalizedKey)) {
            // Relaxed: allow single words if they are at least 5 chars and not a drafting term
            if (nonStopWords[0] && nonStopWords[0].length >= 5 && !KEYWORD_DRAFTING_TERMS.has(nonStopWords[0])) {
                // Accept it - long single words are often meaningful legal terms
            } else {
                return;
            }
        }

        const hasDraftingTerm = nonStopWords.some((word) => KEYWORD_DRAFTING_TERMS.has(word));
        if (hasDraftingTerm && !hasFactSignal(normalizedKey)) return;

        if (seen.has(normalizedKey)) return;
        seen.add(normalizedKey);
        candidates.push(cleaned);
    };

    // Legal code references (broader)
    const codeRefs = text.match(/(?:TCK|CMK|HMK|TMK|TBK|İİK|IIK|TTK|BK|AİHM|AIHM|İYUK|IYUK|SGK)\s*(?:m\.?\s*)?\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    codeRefs.forEach(addCandidate);

    // Domain-specific compound term detection
    if (/uyusturucu/.test(normalizedText) && /(ticaret|satic)/.test(normalizedText)) {
        addCandidate('uyusturucu ticareti');
        addCandidate('uyusturucu saticiligi iddiasi');
    }

    if (/evine gelen\s*\d+\s*kisi|evine gelen.*kisi/.test(normalizedText)) {
        addCandidate('evine gelen kisilerde farkli uyusturucu ele gecirilmesi');
    }

    if (/kullanim sinirini asan|kullanim siniri/.test(normalizedText)) {
        addCandidate('kullanim sinirini asan miktarda madde');
    }

    // Compound legal terms
    if (/haksiz/.test(normalizedText) && /fesih/.test(normalizedText)) addCandidate('haksiz fesih');
    if (/kidem/.test(normalizedText) && /tazminat/.test(normalizedText)) addCandidate('kidem tazminati');
    if (/ihbar/.test(normalizedText) && /tazminat/.test(normalizedText)) addCandidate('ihbar tazminati');
    if (/ise/.test(normalizedText) && /iade/.test(normalizedText)) addCandidate('ise iade davasi');
    if (/bosanma/.test(normalizedText)) addCandidate('bosanma davasi');
    if (/velayet/.test(normalizedText)) addCandidate('velayet davasi');
    if (/nafaka/.test(normalizedText)) addCandidate('nafaka');
    if (/miras/.test(normalizedText)) addCandidate('miras hukuku');
    if (/tapu/.test(normalizedText) && /(iptal|tescil)/.test(normalizedText)) addCandidate('tapu iptal ve tescil');
    if (/haciz/.test(normalizedText)) addCandidate('icra haciz');
    if (/tazminat/.test(normalizedText)) addCandidate('tazminat davasi');
    if (/alacak/.test(normalizedText) && /dava/.test(normalizedText)) addCandidate('alacak davasi');

    // Full name matches
    const fullNameMatches = text.match(/\b[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][A-Za-z\u00C7\u011E\u0130\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]+\s+[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][A-Za-z\u00C7\u011E\u0130\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]+\b/g) || [];
    fullNameMatches.forEach(addCandidate);

    // Split by commas, newlines, semicolons - each chunk can be a keyword
    text.split(/[,\n;]+/g).forEach((chunk) => {
        const normalizedChunk = normalizeKeywordText(chunk);
        const chunkWordCount = normalizedChunk ? normalizedChunk.split(/\s+/).filter(Boolean).length : 0;
        if (!hasFactSignal(chunk) && chunkWordCount > 8) return;
        addCandidate(chunk);
    });

    // Token-level fallback for individual meaningful words
    const tokenFallback = normalizedText
        .split(/[\s,;:.!?()\//\\-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4
            && !KEYWORD_STOPWORDS.has(token)
            && !KEYWORD_DRAFTING_TERMS.has(token)
            && hasFactSignal(token));

    for (const token of tokenFallback) {
        addCandidate(token);
        if (candidates.length >= 12) break;
    }

    return candidates.slice(0, 12);
};

const getLastUserMessageText = (chatHistory = []) => {
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
        const message = chatHistory[i];
        if (message?.role === 'user') {
            return normalizeText(message?.text || '');
        }
    }

    return '';
};

const isLikelyDocumentRequest = (text = '') => {
    if (!text) return false;
    const hasDocumentWord = /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep|sozlesme|sözleşme)/i.test(text);
    const hasCreationWord = /(olustur|oluştur|hazirla|hazırla|yaz|uret|üret)/i.test(text);
    return hasDocumentWord && hasCreationWord;
};

const isSimpleGuidanceQuestion = (text = '') => {
    const normalized = normalizeText(text.toLowerCase());
    if (!normalized) return false;
    if (isLikelyDocumentRequest(normalized)) return false;

    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    const hasSimpleIntent = /(nereye|hangi mahkeme|hangi mahkemeye|nasil|nasil|sure|süre|kac gun|kaç gün|harc|harç|gorevli|görevli|yetkili|acabilir miyim|açabilir miyim|acmaliyim|açmalıyım|gerekli mi)/i.test(normalized);
    const hasComplexIntent = /(emsal|ictihat|içtihat|karar no|esas no|detayli analiz|detaylı analiz|madde madde|belge olustur|belge oluştur|dilekce|dilekçe|taslak)/i.test(normalized);

    return hasSimpleIntent && !hasComplexIntent && tokenCount <= 24;
};

const hasSearchOptOutIntent = (text = '') => {
    const normalized = normalizeKeywordText(text);
    if (!normalized) return false;
    return /(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet).*(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin)|\b(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin).*(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet)\b/i.test(normalized);
};

const isExplicitWebSearchQuestion = (text = '') => {
    const normalized = normalizeKeywordText(text);
    if (!normalized || hasSearchOptOutIntent(normalized)) return false;

    const hasWebToken = /\b(web|internet|google|site|kaynak|link|url)\b/i.test(normalized);
    const hasSearchVerb = /\b(ara|arama|arastir|arastirma|bul|tara|getir|incele|listele)\b/i.test(normalized);
    const hasSourceAsk = /\b(kaynak|link|url)\b/i.test(normalized);

    return hasWebToken && (hasSearchVerb || hasSourceAsk);
};

const isExplicitLegalSearchQuestion = (text = '') => {
    const normalized = normalizeKeywordText(text);
    if (!normalized || hasSearchOptOutIntent(normalized)) return false;

    const hasLegalToken = /\b(emsal|ictihat|yargitay|danistay|karar no|esas no|karar ara)\b/i.test(normalized);
    const hasSearchVerb = /\b(ara|arama|arastir|arastirma|bul|getir|goster|listele|paylas)\b/i.test(normalized);
    const hasLookupQuestion = /\b(var mi|ne diyor|ornek)\b/i.test(normalized);

    return hasLegalToken && (hasSearchVerb || hasLookupQuestion);
};

const isDefinitionQuestion = (text = '') => {
    const normalized = normalizeText(text.toLowerCase());
    if (!normalized) return false;
    if (isLikelyDocumentRequest(normalized)) return false;
    return /(nedir|ne demek|ne anlama gelir|kimdir|tanimi nedir|anlami nedir)/i.test(normalized);
};

const isDisputeOrRiskQuestion = (text = '') => {
    const normalized = normalizeText(text.toLowerCase());
    if (!normalized) return false;
    if (isDefinitionQuestion(normalized)) return false;
    return /(parsel|ada|pafta|ruhsat|ruhsatsiz|imar|koruma kurulu|yikim|muhurl|iptal|tazminat|uyusmazlik|dava|risk|somut olay|strateji|ne yapmaliyim|nasil ilerlemeliyim|itiraz|savunma)/i.test(normalized);
};

const hasWebEvidence = (summary, sourceCount) => {
    const safeSummary = normalizeText(summary);
    const count = Number(sourceCount || 0);
    return safeSummary.length >= 40 && (count > 0 || safeSummary.length >= 280);
};

const hasLegalEvidence = (summary, resultCount) => {
    const safeSummary = normalizeText(summary);
    const count = Number(resultCount || 0);
    const hasCitationToken = /(?:E\.\s*\S+|K\.\s*\S+|esas|karar|yargitay|danistay)/i.test(safeSummary);
    return safeSummary.length >= 40 && hasCitationToken && (count > 0 || safeSummary.length >= 280);
};

const ANALYSIS_SUMMARY_HELP_TEXT = [
    'Analiz özeti, yüklediğiniz belgelerden çıkarılan olay özetidir.',
    'Örnek belgeler: tapu kayıtları, veraset ilamı, sözleşmeler, tutanaklar ve mahkeme evrakları.',
].join(' ');

const DOCUMENT_REQUIREMENTS_HELP_TEXT = [
    `${ANALYSIS_SUMMARY_HELP_TEXT}`,
    'Belge oluşturma için şu 3 adım zorunludur: 1) Belgeleri yükleyip analiz et, 2) Web araştırması yap, 3) Emsal karar araması yap.',
].join(' ');

const DIRECT_DOCUMENT_WITHOUT_ANALYSIS_TEXT = 'Analiz edilecek belge olmadan dilekçe/belge/sözleşme oluşturamam. Önce belge yükleyip analiz etmelisin.';

const DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT = 'Belge yuklenmis gorunuyor ancak analiz ozeti henuz olusmamis. Once \"Belgeleri Analiz Et\" adimini tamamla.';

const parseFunctionArgs = (rawArgs) => {
    if (!rawArgs) return {};
    if (typeof rawArgs === 'string') {
        try {
            const parsed = JSON.parse(rawArgs);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    return typeof rawArgs === 'object' ? rawArgs : {};
};

const formatLegalResultsForContext = (results = []) => {
    if (!Array.isArray(results) || results.length === 0) return '';

    return results
        .slice(0, 10)
        .map((result) => {
            const meta = [
                result?.esasNo ? `E. ${result.esasNo}` : '',
                result?.kararNo ? `K. ${result.kararNo}` : '',
                result?.tarih ? `T. ${result.tarih}` : '',
            ].filter(Boolean).join(' ');
            return `- ${result?.title || 'Karar'} ${meta} ${result?.ozet || ''}`.trim();
        })
        .join('\n');
};

const GEMINI_INLINE_SUPPORTED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
]);

const MAX_TEXT_FILE_CHARS = 12000;

const normalizeMimeType = (value = '') => String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

const decodeBase64Utf8 = (base64Value = '') => {
    try {
        const decoded = Buffer.from(String(base64Value || ''), 'base64').toString('utf8');
        return decoded.replace(/\0/g, '').trim();
    } catch {
        return '';
    }
};

const appendGeminiFileParts = (parts, files = []) => {
    if (!Array.isArray(parts) || !Array.isArray(files)) return;

    files.forEach((file, index) => {
        const mimeType = normalizeMimeType(file?.mimeType || '');
        const data = typeof file?.data === 'string' ? file.data.trim() : '';
        const name = normalizeText(file?.name || '') || `dosya-${index + 1}`;
        if (!data) return;

        if (GEMINI_INLINE_SUPPORTED_MIME_TYPES.has(mimeType)) {
            parts.push({ inlineData: { mimeType, data } });
            return;
        }

        if (mimeType.startsWith('text/')) {
            const decodedText = decodeBase64Utf8(data);
            if (decodedText) {
                parts.push({
                    text: `[Yuklenen Metin Dosyasi: ${name}]\n${decodedText.slice(0, MAX_TEXT_FILE_CHARS)}`,
                });
                return;
            }
        }

        parts.push({
            text: `[Desteklenmeyen dosya turu atlandi: ${name} (${mimeType || 'bilinmiyor'})]`,
        });
    });
};

const invokeLegalSearchHandler = async ({ keyword, source = 'all', headers = {} }) => {
    const responseState = {
        statusCode: 200,
        headers: {},
        body: null,
    };

    let resolved = false;

    return new Promise((resolve) => {
        const finalize = (payload = null) => {
            if (resolved) return;
            resolved = true;
            responseState.body = payload;
            resolve(responseState);
        };

        const mockRes = {
            headersSent: false,
            setHeader(name, value) {
                responseState.headers[name] = value;
                return this;
            },
            status(code) {
                responseState.statusCode = Number(code) || 500;
                return this;
            },
            json(payload) {
                this.headersSent = true;
                finalize(payload);
                return this;
            },
            end(payload) {
                this.headersSent = true;
                finalize(payload);
                return this;
            },
            write() {
                return true;
            },
        };

        const mockReq = {
            method: 'POST',
            query: { action: 'search-decisions' },
            body: {
                action: 'search-decisions',
                source,
                keyword,
                filters: {},
            },
            headers,
        };

        void (async () => {
            try {
                await legalApiHandler(mockReq, mockRes);
                if (!resolved) {
                    finalize(null);
                }
            } catch (error) {
                responseState.statusCode = 500;
                responseState.body = { error: error?.message || 'Internal legal search invocation failed' };
                finalize(responseState.body);
            }
        })();
    });
};

// Chat uses the same legal search pipeline as the precedent search page.
async function searchEmsalFallback(_ai, keyword, req, sourceHint = 'all') {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
        return { success: true, results: [] };
    }

    try {
        const legalResponse = await invokeLegalSearchHandler({
            keyword: normalizedKeyword,
            source: sourceHint,
            headers: req?.headers || {},
        });
        const legalResults = Array.isArray(legalResponse?.body?.results) ? legalResponse.body.results : [];

        if (legalResults.length > 0) {
            return {
                success: true,
                results: legalResults,
                provider: legalResponse?.body?.provider || 'legal-api',
                source: legalResponse?.body?.source || sourceHint,
                warning: legalResponse?.body?.warning || '',
            };
        }

        if (legalResponse?.statusCode >= 400) {
            console.error('Verified legal search failed in chat:', legalResponse?.body?.error || legalResponse);
        }
    } catch (error) {
        console.error('Verified legal search invocation error in chat:', error);
    }

    return { success: true, results: [] };
}
async function runWebVerificationSearch(ai, keyword, question) {
    const query = normalizeText([keyword, question].filter(Boolean).join(' '));
    if (!query) {
        return { summary: '', sourceCount: 0 };
    }

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Turk hukukunda su soruya yonelik guvenilir web arastirmasi yap:\n\nSoru: ${question || query}\n\nArama odagi: ${query}\n\nKisa bir hukuki arastirma ozeti ver.`,
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
            },
        });

        const summary = normalizeText(response.text || '');
        const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sourceCount = Array.isArray(groundingChunks)
            ? groundingChunks.filter((chunk) => chunk?.web?.uri).length
            : 0;

        return { summary, sourceCount };
    } catch (error) {
        console.error('Web verification search error:', error);
        return { summary: '', sourceCount: 0 };
    }
}
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getAiClient();
        const { chatHistory, analysisSummary, context, files } = req.body || {};
        const safeContext = context || {};

        if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
            return res.status(400).json({ error: 'chatHistory must be a non-empty array' });
        }

        const lastUserMessage = getLastUserMessageText(chatHistory);
        const isDocumentRequest = isLikelyDocumentRequest(lastUserMessage);
        const requestedWebSearch = safeContext.allowWebSearch === true || isExplicitWebSearchQuestion(lastUserMessage);
        const requestedLegalSearch = safeContext.allowLegalSearch === true || isExplicitLegalSearchQuestion(lastUserMessage);
        const requiresEvidenceForAnswer = isDocumentRequest || requestedWebSearch || requestedLegalSearch;
        const requiresWebEvidence = isDocumentRequest || requestedWebSearch;
        const requiresLegalEvidence = isDocumentRequest || requestedLegalSearch;
        const allowSearchYargitayTool = isDocumentRequest || requestedLegalSearch;
        const hasAnalysisSummary = normalizeText(analysisSummary || '').length > 0;
        const hasUploadedDocument = (Array.isArray(files) && files.length > 0) || normalizeText(safeContext.docContent || '').length > 0;

        if (isDocumentRequest && !hasAnalysisSummary) {
            return res.status(422).json({
                error: hasUploadedDocument ? DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT : DIRECT_DOCUMENT_WITHOUT_ANALYSIS_TEXT,
                code: 'MISSING_ANALYSIS_SUMMARY_FOR_DOCUMENT_CHAT',
            });
        }

        let effectiveSearchSummary = normalizeText(safeContext.searchSummary || '');
        let effectiveLegalSummary = normalizeText(safeContext.legalSummary || '');
        let effectiveWebSourceCount = Number(safeContext.webSourceCount || 0);
        let effectiveLegalResultCount = Number(safeContext.legalResultCount || 0);

        const keywordSeed = Array.from(new Set([
            ...extractKeywordCandidates(safeContext.keywords || ''),
            ...extractKeywordCandidates(lastUserMessage),
        ])).join(' ').trim();

        const evidenceQuery = keywordSeed || normalizeText(lastUserMessage) || 'turk hukuku';

        if (requiresEvidenceForAnswer) {
            // First attempt: search with extracted keywords
            if (requiresWebEvidence && !hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount)) {
                try {
                    const webEvidence = await runWebVerificationSearch(ai, evidenceQuery, lastUserMessage);
                    if (webEvidence.summary) {
                        effectiveSearchSummary = [effectiveSearchSummary, webEvidence.summary].filter(Boolean).join('\n\n').trim();
                        effectiveWebSourceCount = Math.max(effectiveWebSourceCount, webEvidence.sourceCount);
                    }
                } catch (webErr) {
                    console.error('Web evidence search error (attempt 1):', webErr);
                }
            }

            // Retry web search with raw message if first attempt didn't produce results
            if (requiresWebEvidence && !hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount) && lastUserMessage) {
                try {
                    const retryWebEvidence = await runWebVerificationSearch(ai, lastUserMessage, lastUserMessage);
                    if (retryWebEvidence.summary) {
                        effectiveSearchSummary = [effectiveSearchSummary, retryWebEvidence.summary].filter(Boolean).join('\n\n').trim();
                        effectiveWebSourceCount = Math.max(effectiveWebSourceCount, retryWebEvidence.sourceCount);
                    }
                } catch (webRetryErr) {
                    console.error('Web evidence search error (retry):', webRetryErr);
                }
            }

            if (requiresLegalEvidence && !hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount)) {
                try {
                    const legalEvidence = await searchEmsalFallback(ai, evidenceQuery, req);
                    if (Array.isArray(legalEvidence.results) && legalEvidence.results.length > 0) {
                        const legalSummaryFromResults = formatLegalResultsForContext(legalEvidence.results);
                        effectiveLegalSummary = [effectiveLegalSummary, legalSummaryFromResults].filter(Boolean).join('\n').trim();
                        effectiveLegalResultCount = Math.max(effectiveLegalResultCount, legalEvidence.results.length);
                    }
                } catch (legalErr) {
                    console.error('Legal evidence search error (attempt 1):', legalErr);
                }
            }

            // Retry legal search with raw message if first attempt didn't produce results
            if (requiresLegalEvidence && !hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount) && lastUserMessage) {
                try {
                    const retryLegalEvidence = await searchEmsalFallback(ai, lastUserMessage, req);
                    if (Array.isArray(retryLegalEvidence.results) && retryLegalEvidence.results.length > 0) {
                        const legalSummaryFromResults = formatLegalResultsForContext(retryLegalEvidence.results);
                        effectiveLegalSummary = [effectiveLegalSummary, legalSummaryFromResults].filter(Boolean).join('\n').trim();
                        effectiveLegalResultCount = Math.max(effectiveLegalResultCount, retryLegalEvidence.results.length);
                    }
                } catch (legalRetryErr) {
                    console.error('Legal evidence search error (retry):', legalRetryErr);
                }
            }
        }

        const hasVerifiedWebEvidence = hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount);
        const hasVerifiedLegalEvidence = hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount);

        // Only block document generation when evidence is missing - never block regular chat
        if (isDocumentRequest && (!hasVerifiedWebEvidence || !hasVerifiedLegalEvidence)) {
            return res.status(422).json({
                error: `Belge oluşturma engellendi. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_REQUIRED_EVIDENCE_FOR_DOCUMENT'
            });
        }

        // For regular chat: note missing evidence but NEVER block
        const evidenceLimitedForChat = requiresEvidenceForAnswer && !isDocumentRequest && (!hasVerifiedWebEvidence || !hasVerifiedLegalEvidence);

        const documentGenerationAllowed = hasVerifiedWebEvidence && hasVerifiedLegalEvidence;
        const allowDocumentGenerationTool = documentGenerationAllowed && safeContext.disableDocumentGeneration !== true;

        const contextPrompt = `
**MEVCUT DURUM:**
- Vaka Ozeti: ${analysisSummary || 'Henuz analiz yapilmadi.'}
- Anahtar Kelimeler: ${safeContext.keywords || evidenceQuery || 'Yok'}
- Web Arastirma: ${effectiveSearchSummary || 'Yok'}
- Emsal Karar Arastirmasi: ${effectiveLegalSummary || 'Yok'}
- Web Kaynak Sayisi: ${effectiveWebSourceCount}
- Emsal Karar Sayisi: ${effectiveLegalResultCount}
${Array.isArray(files) && files.length > 0 ? `- Yuklenen Belgeler: ${files.length} adet` : ''}
`;

        const evidenceCautionNote = evidenceLimitedForChat
            ? `\n\n**DIKKAT:** Web veya emsal karar arastirmasi kisitli sonuc verdi. Yanit verirken:\n- Dogrulanmis bilgileri acikca belirt\n- Kesin olmayan bilgiler icin "dogrulanmasi onerilen" ifadesini kullan${allowSearchYargitayTool ? '\n- Mumkunse search_yargitay fonksiyonunu cagirarak ek karar bulmaya calis' : ''}\n- Kullaniciyi asla engelleme, elindeki bilgiyle en iyi cevabi ver`
            : '';

        const systemInstruction = `Sen, Turk Hukuku uzmani bir hukuk asistanisin.

**GOREVLERIN:**
1. Hukuki sorulari yanitla
2. Dava stratejisi konusunda yardimci ol
3. Belge yuklendiyse analiz et
4. Emsal karar numarasi/kunyesi uydurma
5. Sadece dogrulanmis bulgulara dayan
${allowDocumentGenerationTool ? '6. generate_document fonksiyonunu sadece dogrulanmis kanit varken kullan' : '6. generate_document kullanma, kullanici belge isterse mevcut kaniti ozetle ve belge uretimini istemciye birak'}
${allowSearchYargitayTool
                ? '7. Kullanici acikca emsal karar aradiginda search_yargitay fonksiyonu ile ictihat ara'
                : '7. Kullanici emsal karar aramasi talep etmedikce search_yargitay fonksiyonunu cagirma'}
8. Kullanicinin sorusunu ASLA engelleme, her zaman elindeki bilgiyle yanit ver

${contextPrompt}${evidenceCautionNote}

Ek kural: Basit sorularda (or. hangi mahkeme, sure) kisa ve net cevap ver.`;

        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'Anahtar kelime ekle',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keywordsToAdd: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['keywordsToAdd'],
            },
        };

        const generateDocumentFunction = {
            name: 'generate_document',
            description: 'Belge veya dilekce olustur',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: { type: Type.STRING },
                    documentTitle: { type: Type.STRING },
                    documentContent: { type: Type.STRING }
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };

        const searchYargitayFunction = {
            name: 'search_yargitay',
            description: 'Emsal karar veya ictihat ara',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['searchQuery'],
            },
        };

        const functionDeclarations = allowDocumentGenerationTool
            ? [updateKeywordsFunction, generateDocumentFunction, ...(allowSearchYargitayTool ? [searchYargitayFunction] : [])]
            : [updateKeywordsFunction, ...(allowSearchYargitayTool ? [searchYargitayFunction] : [])];

        const contents = chatHistory.map((msg) => {
            const parts = [{ text: msg?.text || '' }];
            if (Array.isArray(msg?.files) && msg.files.length > 0) {
                appendGeminiFileParts(parts, msg.files);
            }
            return { role: msg?.role === 'user' ? 'user' : 'model', parts };
        });

        if (Array.isArray(files) && files.length > 0 && contents.length > 0) {
            const lastIdx = contents.length - 1;
            if (contents[lastIdx].role === 'user') {
                appendGeminiFileParts(contents[lastIdx].parts, files);
            }
        }

        const responseStream = await ai.models.generateContentStream({
            model: MODEL_NAME,
            contents,
            config: {
                systemInstruction,
                tools: [{ functionDeclarations }],
            },
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const pendingSearchCalls = [];
        let hasConsumedDocumentCredit = false;
        let streamBlockedByQuota = false;

        for await (const chunk of responseStream) {
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall?.name === 'search_yargitay' && allowSearchYargitayTool) {
                        pendingSearchCalls.push(part.functionCall);
                    }

                    if (part.functionCall?.name === 'generate_document' && !documentGenerationAllowed) {
                        res.write(JSON.stringify({
                            text: `\n\nBelge oluşturma engellendi.\n${DOCUMENT_REQUIREMENTS_HELP_TEXT}\n`,
                            error: true,
                            code: 'MISSING_REQUIRED_EVIDENCE_FOR_DOCUMENT',
                        }) + '\n');
                        continue;
                    }

                    if (part.functionCall?.name === 'generate_document' && !hasConsumedDocumentCredit) {
                        const credit = await consumeGenerationCredit(req, 'chat_document_generation');
                        if (!credit.allowed) {
                            streamBlockedByQuota = true;
                            const quotaMessage = credit.payload?.error || 'Belge uretim kotaniz doldu.';
                            const shouldExposeUsage = (
                                credit.payload?.dailyLimit !== undefined
                                || credit.payload?.usedToday !== undefined
                                || credit.payload?.remainingToday !== undefined
                                || credit.payload?.trialEndsAt !== undefined
                            );

                            const quotaChunk = {
                                text: `\n\n⚠️ ${quotaMessage}\n`,
                                error: true,
                                status: credit.status || 429,
                                code: credit.payload?.code || 'TRIAL_DAILY_LIMIT_REACHED',
                                quotaBlocked: true,
                            };

                            if (shouldExposeUsage) {
                                quotaChunk.usage = {
                                    dailyLimit: credit.payload?.dailyLimit ?? TRIAL_DAILY_GENERATION_LIMIT,
                                    usedToday: credit.payload?.usedToday ?? TRIAL_DAILY_GENERATION_LIMIT,
                                    remainingToday: credit.payload?.remainingToday ?? 0,
                                    trialEndsAt: credit.payload?.trialEndsAt || null,
                                };
                            }

                            res.write(JSON.stringify(quotaChunk) + '\n');
                            break;
                        }

                        hasConsumedDocumentCredit = true;

                        if (credit.usage) {
                            res.write(JSON.stringify({
                                usageUpdated: true,
                                usage: credit.usage
                            }) + '\n');
                        }
                    }
                }
            }

            if (streamBlockedByQuota) {
                break;
            }

            res.write(JSON.stringify(chunk) + '\n');
        }

        if (streamBlockedByQuota) {
            res.end();
            return;
        }

        if (pendingSearchCalls.length > 0) {
            for (const fc of pendingSearchCalls) {
                const args = parseFunctionArgs(fc.args);
                const searchQuery = normalizeText(args?.searchQuery || evidenceQuery || '');
                const searchResult = await searchEmsalFallback(ai, searchQuery, req);
                const visibleResults = Array.isArray(searchResult.results)
                    ? searchResult.results.slice(0, CHAT_VISIBLE_LEGAL_RESULT_LIMIT)
                    : [];
                const hiddenCount = Math.max(0, (searchResult.results?.length || 0) - visibleResults.length);

                let formattedResults = '\n\n### BULUNAN EMSAL KARARLAR\n\n';
                if (visibleResults.length > 0) {
                    visibleResults.forEach((result, index) => {
                        formattedResults += `**${index + 1}. ${result.title}**\n`;
                        if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                        if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                        if (result.tarih) formattedResults += `T. ${result.tarih}`;
                        formattedResults += '\n';
                        if (result.ozet) formattedResults += `Ozet: ${truncateText(result.ozet, CHAT_LEGAL_SUMMARY_PREVIEW_CHARS)}\n\n`;
                    });
                    if (hiddenCount > 0) {
                        formattedResults += `+ ${hiddenCount} ek karar bulundu. Tam liste baglama eklendi.\n`;
                    }
                } else {
                    formattedResults += 'Bu konuda emsal karar bulunamadi.\n';
                }

                res.write(JSON.stringify({
                    text: formattedResults,
                    functionCallResults: true,
                    searchResults: searchResult.results
                }) + '\n');
            }
        }

        res.end();
    } catch (error) {
        console.error('Chat Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error?.message || 'Internal Server Error' });
        } else {
            res.write(JSON.stringify({
                text: '\n\nSohbet servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.\n',
                error: true
            }) + '\n');
            res.end();
        }
    }
}
