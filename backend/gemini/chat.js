import { GoogleGenAI, Type } from '@google/genai';
import { consumeGenerationCredit, TRIAL_DAILY_GENERATION_LIMIT } from '../../lib/api/generationQuota.js';
import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_API_KEY, GEMINI_MODEL_NAME } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const ensureContextObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const normalizeContextText = (value) => {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeText(item))
            .filter(Boolean)
            .join(', ');
    }
    return '';
};

const clipPromptText = (value, maxLength = 2200) => {
    const normalized = normalizeContextText(value);
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...[truncated]`;
};

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
    'uzerine', 'kapsaminda', 'gibi', 'icin', 'uzere', 'bu', 'su', 'o', 'bir', 'de', 'da'
]);

const KEYWORD_DRAFTING_TERMS = new Set([
    'dilekce', 'savunma', 'belge', 'sozlesme', 'taslak', 'yaz', 'yazalim', 'hazirla', 'olustur', 'uret',
    'detayli', 'olmasi', 'olmali', 'koruyacak', 'haklarini', 'muvekkil', 'muvekkilin', 'vekil', 'vekili',
    'bana', 'lutfen', 'yardim', 'hazir', 'yapalim'
]);

const FACT_SIGNAL_REGEX = /\b(tck|cmk|hmk|tmk|anayasa|madde|maddesi|esas|karar|uyusturucu|hirsizlik|dolandiricilik|tehdit|yaralama|oldurme|gozalti|tutuk|delil|kamera|tanik|rapor|bilirkisi|ele gecir|kullanim siniri|ticaret|satici|isveren|kidem|ihbar|fesih|veraset|tapu)\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b\d{4,}\b/i;

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
        const cleaned = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length < 3) return;

        const normalizedKey = normalizeKeywordText(cleaned);
        if (!normalizedKey || normalizedKey.length < 3) return;

        const words = normalizedKey.split(/\s+/).filter(Boolean);
        const nonStopWords = words.filter((word) => !KEYWORD_STOPWORDS.has(word));
        if (nonStopWords.length === 0) return;

        if (!hasFactSignal(normalizedKey) && nonStopWords.length < 2) return;

        const hasDraftingTerm = nonStopWords.some((word) => KEYWORD_DRAFTING_TERMS.has(word));
        if (hasDraftingTerm && !hasFactSignal(normalizedKey)) return;

        if (seen.has(normalizedKey)) return;
        seen.add(normalizedKey);
        candidates.push(cleaned);
    };

    const tckMatches = text.match(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    tckMatches.forEach(addCandidate);

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

    const fullNameMatches = text.match(/\b[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][A-Za-z\u00C7\u011E\u0130\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]+\s+[A-Z\u00C7\u011E\u0130\u00D6\u015E\u00DC][A-Za-z\u00C7\u011E\u0130\u00D6\u015E\u00DC\u00E7\u011F\u0131\u00F6\u015F\u00FC]+\b/g) || [];
    fullNameMatches.forEach(addCandidate);

    text.split(/[,\n;]+/g).forEach((chunk) => {
        const normalizedChunk = normalizeKeywordText(chunk);
        const chunkWordCount = normalizedChunk ? normalizedChunk.split(/\s+/).filter(Boolean).length : 0;
        if (!hasFactSignal(chunk) && chunkWordCount > 8) return;
        addCandidate(chunk);
    });

    const tokenFallback = normalizedText
        .split(/[\s,;:.!?()\/\\-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4
            && !KEYWORD_STOPWORDS.has(token)
            && !KEYWORD_DRAFTING_TERMS.has(token)
            && hasFactSignal(token));

    for (const token of tokenFallback) {
        addCandidate(token);
        if (candidates.length >= 10) break;
    }

    return candidates.slice(0, 10);
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

const isEmsalSearchQuestion = (text = '') => {
    const normalized = normalizeText(text.toLowerCase());
    if (!normalized) return false;
    return /(emsal|ictihat|içtihat|yargitay|danistay|karar ara|karar aramasi|karar arar misin)/i.test(normalized);
};

const isDefinitionQuestion = (text = '') => {
    const raw = normalizeText(text);
    if (!raw) return false;
    if (isLikelyDocumentRequest(raw) || isEmsalSearchQuestion(raw)) return false;

    const normalized = normalizeKeywordText(raw);
    if (!normalized) return false;

    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    const asksDefinition = /(nedir|ne demek|ne anlama gelir|anlami nedir|tanimi nedir|kime denir|nasil tanimlanir|kavrami nedir)/i.test(normalized);
    const hasDisputeMarkers = /(parsel|ada|pafta|ruhsat|ruhsatsiz|imar|yikim|muhurl|iptal|tazminat|uyusmazlik|dava|muvekkil|dosya|risk|strateji|itiraz|savunma)/i.test(normalized);

    // Kisa "X nedir?" sorularini tanim sorusu olarak kabul et.
    if (asksDefinition && tokenCount <= 8) return true;

    return asksDefinition && !hasDisputeMarkers && tokenCount <= 22;
};

const isDisputeOrApplicationQuestion = (text = '') => {
    const raw = normalizeText(text);
    if (!raw) return false;
    if (isDefinitionQuestion(raw)) return false;

    const normalized = normalizeKeywordText(raw);
    if (!normalized) return false;

    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    const hasRiskOrDisputeIntent = /(parsel|ada|pafta|ruhsat|ruhsatsiz|imar|koruma kurulu|yikim|muhurl|iptal|tazminat|idari islem|uyusmazlik|somut olay|dosya|muvekkil|risk|strateji|ne yapmaliyim|nasil ilerlemeliyim|itiraz|savunma)/i.test(normalized);
    const hasCaseSignal = hasFactSignal(normalized) && /(olay|dosya|parsel|muvekkil|sanik|davaci|davali|islem|iddia|karar)/i.test(normalized);

    return hasRiskOrDisputeIntent || hasCaseSignal || tokenCount > 28;
};

const getCurrentDateContext = () => {
    const now = new Date();
    const istanbulDate = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(now);
    const istanbulTime = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(now);

    return {
        istanbulDate,
        istanbulTime,
        utcIso: now.toISOString(),
    };
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

// Fallback search function for legal decisions
async function searchEmsalFallback(ai, keyword) {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Turkiye'de "${keyword}" konusunda emsal Yargitay ve Danistay kararlari bul. Her karar icin:
            - Mahkeme, Daire, Esas No, Karar No, Tarih, Ozet, Ilgi Skoru (0-100)

            En az 6 karar bul ve JSON formatinda dondur:
            [{"mahkeme": "...", "daire": "...", "esasNo": "...", "kararNo": "...", "tarih": "...", "ozet": "...", "relevanceScore": 85}]

            Sadece JSON array dondur.`,
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
            }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsedResults = JSON.parse(jsonMatch[0]);
            const results = Array.isArray(parsedResults) ? parsedResults : [];

            return {
                success: true,
                results: results
                    .map((result, index) => ({
                        id: `search-${index}`,
                        title: `${result.mahkeme || 'Yargitay'} ${result.daire || ''}`.trim(),
                        esasNo: result.esasNo || '',
                        kararNo: result.kararNo || '',
                        tarih: result.tarih || '',
                        daire: result.daire || '',
                        ozet: result.ozet || '',
                        relevanceScore: result.relevanceScore || Math.max(0, 100 - (index * 8))
                    }))
                    .filter((item) => item.title && (item.ozet || item.esasNo || item.kararNo))
                    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            };
        }

        return { success: true, results: [] };
    } catch (error) {
        console.error('Search error:', error);
        return { success: false, results: [] };
    }
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
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, x-api-key',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getAiClient();
        const { chatHistory, analysisSummary, context, files } = req.body || {};
        const safeContext = ensureContextObject(context);

        if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
            return res.status(400).json({ error: 'chatHistory must be a non-empty array' });
        }

        const summaryFromBody = normalizeText(analysisSummary || '');
        const summaryFromContext = normalizeContextText(safeContext.analysisSummary);
        const effectiveAnalysisSummary = summaryFromBody || summaryFromContext;
        const contextKeywords = normalizeContextText(safeContext.keywords);
        const contextDocContent = normalizeContextText(safeContext.docContent);
        const contextSpecifics = normalizeContextText(safeContext.specifics);
        const contextCurrentDraft = normalizeContextText(
            safeContext.currentDraft
            || safeContext.currentPetition
            || safeContext.generatedPetition
            || safeContext.generatedDocument
        );

        const lastUserMessage = getLastUserMessageText(chatHistory);
        const isDocumentRequest = isLikelyDocumentRequest(lastUserMessage);
        const isSimpleQuestion = isSimpleGuidanceQuestion(lastUserMessage);
        const isEmsalOnlyQuery = isEmsalSearchQuestion(lastUserMessage);
        const isDefinitionOnlyQuery = isDefinitionQuestion(lastUserMessage);
        const isDisputeOrApplicationQuery = isDisputeOrApplicationQuestion(lastUserMessage);
        const requiresEvidenceForAnswer = isDocumentRequest || isEmsalOnlyQuery || isDisputeOrApplicationQuery;
        const requiresWebEvidence = isDocumentRequest || isDisputeOrApplicationQuery;
        const requiresLegalEvidence = isDocumentRequest || isEmsalOnlyQuery || isDisputeOrApplicationQuery;
        const hasAnalysisSummary = effectiveAnalysisSummary.length > 0;
        const hasUploadedDocument = (Array.isArray(files) && files.length > 0) || contextDocContent.length > 0;

        if (isDocumentRequest && !hasAnalysisSummary) {
            return res.status(422).json({
                error: hasUploadedDocument ? DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT : DIRECT_DOCUMENT_WITHOUT_ANALYSIS_TEXT,
                code: 'MISSING_ANALYSIS_SUMMARY_FOR_DOCUMENT_CHAT',
            });
        }

        let effectiveSearchSummary = normalizeContextText(safeContext.searchSummary || safeContext.webSearchSummary);
        let effectiveLegalSummary = normalizeContextText(safeContext.legalSummary);
        let effectiveWebSourceCount = Number(safeContext.webSourceCount || 0);
        let effectiveLegalResultCount = Number(safeContext.legalResultCount || 0);

        const keywordSeed = Array.from(new Set([
            ...extractKeywordCandidates(contextKeywords),
            ...extractKeywordCandidates(lastUserMessage),
        ])).join(' ').trim();

        const evidenceQuery = keywordSeed || normalizeText(lastUserMessage) || 'turk hukuku';

        if (requiresEvidenceForAnswer) {
            if (requiresWebEvidence && !hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount)) {
                const webEvidence = await runWebVerificationSearch(ai, evidenceQuery, lastUserMessage);
                if (webEvidence.summary) {
                    effectiveSearchSummary = [effectiveSearchSummary, webEvidence.summary].filter(Boolean).join('\n\n').trim();
                    effectiveWebSourceCount = Math.max(effectiveWebSourceCount, webEvidence.sourceCount);
                }
            }

            if (requiresLegalEvidence && !hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount)) {
                const legalEvidence = await searchEmsalFallback(ai, evidenceQuery);
                if (Array.isArray(legalEvidence.results) && legalEvidence.results.length > 0) {
                    const legalSummaryFromResults = formatLegalResultsForContext(legalEvidence.results);
                    effectiveLegalSummary = [effectiveLegalSummary, legalSummaryFromResults].filter(Boolean).join('\n').trim();
                    effectiveLegalResultCount = Math.max(effectiveLegalResultCount, legalEvidence.results.length);
                }
            }
        }

        const hasVerifiedWebEvidence = hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount);
        const hasVerifiedLegalEvidence = hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount);

        if (isDocumentRequest && (!hasVerifiedWebEvidence || !hasVerifiedLegalEvidence)) {
            return res.status(422).json({
                error: `Belge oluşturma engellendi. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_REQUIRED_EVIDENCE_FOR_DOCUMENT'
            });
        }

        const missingWebEvidenceForChat = requiresWebEvidence && !hasVerifiedWebEvidence;
        const missingLegalEvidenceForChat = requiresLegalEvidence && !hasVerifiedLegalEvidence;
        const evidenceGapForChat = !isDocumentRequest && (missingWebEvidenceForChat || missingLegalEvidenceForChat);

        const documentGenerationAllowed = hasVerifiedWebEvidence && hasVerifiedLegalEvidence;
        const promptAnalysisSummary = clipPromptText(effectiveAnalysisSummary, 2200);
        const promptKeywords = clipPromptText(contextKeywords || evidenceQuery, 900);
        const promptSearchSummary = clipPromptText(effectiveSearchSummary, 2400);
        const promptLegalSummary = clipPromptText(effectiveLegalSummary, 2400);
        const promptDocContent = clipPromptText(contextDocContent, 1800);
        const promptSpecifics = clipPromptText(contextSpecifics, 1200);
        const promptCurrentDraft = clipPromptText(contextCurrentDraft, 3000);
        const currentDateContext = getCurrentDateContext();

        const contextPrompt = `
**MEVCUT DURUM:**
- Vaka Ozeti: ${promptAnalysisSummary || 'Henuz analiz yapilmadi.'}
- Anahtar Kelimeler: ${promptKeywords || 'Yok'}
- Web Arastirma: ${promptSearchSummary || 'Yok'}
- Emsal Karar Arastirmasi: ${promptLegalSummary || 'Yok'}
- Kullanicinin Ek Metinleri: ${promptDocContent || 'Yok'}
- Kullanicinin Ozel Talimatlari: ${promptSpecifics || 'Yok'}
- Mevcut Dilekce Taslagi: ${promptCurrentDraft || 'Henuz olusturulan taslak yok'}
- Web Kaynak Sayisi: ${effectiveWebSourceCount}
- Emsal Karar Sayisi: ${effectiveLegalResultCount}
- Dogrulama Modu: ${requiresEvidenceForAnswer ? 'Uygulama/Uyusmazlik - web+emsal arastirmasi gerekli' : 'Tanim/Genel - once mevzuat aciklamasi, sonra istege bagli emsal'}
- Dogrulama Durumu: ${evidenceGapForChat ? 'Eksik kanit var, once soruyu analiz et; yalnizca gerekiyorsa arama oner veya arama yap' : 'Yeterli / zorunlu olmayan dogrulama'}
- Sistem Tarihi (Europe/Istanbul): ${currentDateContext.istanbulDate}
- Sistem Saati (Europe/Istanbul): ${currentDateContext.istanbulTime}
- UTC Zaman Damgasi: ${currentDateContext.utcIso}
${Array.isArray(files) && files.length > 0 ? `- Yuklenen Belgeler: ${files.length} adet` : ''}
`;

        const systemInstruction = `Sen, Turk Hukuku uzmani bir hukuk asistanisin.

**GOREVLERIN:**
1. Hukuki sorulari yanitla
2. Dava stratejisi konusunda yardimci ol
3. Belge yuklendiyse analiz et
4. Emsal karar numarasi/kunyesi uydurma
5. Sadece dogrulanmis bulgulara dayan
${documentGenerationAllowed ? '6. generate_document fonksiyonunu sadece dogrulanmis kanit varken kullan' : '6. generate_document kullanma, kanit eksigini bildir'}
7. search_yargitay fonksiyonu ile ictihat ara
8. Mevcut dilekce taslagi varsa, sorulari o taslak metin uzerinden yanitla ve revizyon onerilerini taslaga uygulayarak ver
9. Kullanici sorusunu once siniflandir: tanim/genel, usul, uygulama/uyusmazlik.
10. Tanim/genel sorularda arama zorunlu degil; kisa ve net cevap ver, isterse emsal arastirmasi teklif et.
11. Uygulama/uyusmazlik sorularinda gerekli gordugunde arama yap; arama yapamadiysan eldeki bilgiyle sinirlarini belirterek yanitla, dogrudan engelleme mesaji verme.

${contextPrompt}

Ek kural 1: Basit sorularda (or. hangi mahkeme, sure) kisa ve net cevap ver.
${isDefinitionOnlyQuery
        ? 'Ek kural 2: Tanim/kavram sorularinda once kisa mevzuat cevabi ver. Web veya emsal aramasi zorunlu degil; cevabin sonunda istenirse emsal ictihat arastirabilecegini tek cumleyle opsiyon olarak belirt.'
        : isSimpleQuestion
            ? 'Ek kural 2: Basit usul sorularinda gereksiz uzun analiz yapma.'
            : 'Ek kural 2: Uygulama/uyusmazlik sorularinda dogrulanmis web ve emsal bulgularina oncelik ver.'}
Ek kural 3: Tarih/saat sorularinda yukaridaki sistem tarih-saat bilgisini esas al; tarih uydurma.`;

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
            description: 'Yargitay karari ara',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['searchQuery'],
            },
        };

        const functionDeclarations = documentGenerationAllowed
            ? [updateKeywordsFunction, generateDocumentFunction, searchYargitayFunction]
            : [updateKeywordsFunction, searchYargitayFunction];

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
                    if (part.functionCall?.name === 'search_yargitay') {
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
                const searchResult = await searchEmsalFallback(ai, searchQuery);

                let formattedResults = '\n\n### BULUNAN YARGITAY KARARLARI\n\n';
                if (searchResult.results?.length > 0) {
                    searchResult.results.forEach((result, index) => {
                        formattedResults += `**${index + 1}. ${result.title}**\n`;
                        if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                        if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                        if (result.tarih) formattedResults += `T. ${result.tarih}`;
                        formattedResults += '\n';
                        if (result.ozet) formattedResults += `Ozet: ${result.ozet}\n\n`;
                    });
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
            res.status(500).json({ error: getSafeErrorMessage(error, 'Internal Server Error') });
        } else {
            res.write(JSON.stringify({
                text: '\n\nSohbet servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.\n',
                error: true
            }) + '\n');
            res.end();
        }
    }
}

