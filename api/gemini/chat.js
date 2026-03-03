import { GoogleGenAI, Type } from '@google/genai';
import { consumeGenerationCredit, TRIAL_DAILY_GENERATION_LIMIT } from '../_lib/generationQuota.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const KEYWORD_STOPWORDS = new Set([
    've', 'veya', 'ile', 'olan', 'oldugu', 'olduğu', 'iddia', 'edilen',
    'uzerine', 'üzerine', 'kapsaminda', 'kapsamında', 'gibi', 'icin', 'için',
    'uzere', 'üzere', 'bu', 'su', 'şu', 'o', 'bir', 'de', 'da'
]);

const extractKeywordCandidates = (rawValue = '') => {
    const text = normalizeText(rawValue);
    if (!text) return [];

    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
        const normalized = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) return;

        const words = normalized.split(/\s+/).filter(Boolean);
        const nonStopCount = words.filter((word) => !KEYWORD_STOPWORDS.has(word.toLocaleLowerCase('tr-TR'))).length;
        if (nonStopCount === 0) return;

        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(normalized);
    };

    const tckMatches = text.match(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    tckMatches.forEach(addCandidate);

    if (/uyusturucu|uyuşturucu/i.test(text) && /ticaret|satic|satıc/i.test(text)) {
        addCandidate('uyusturucu ticareti');
        addCandidate('uyusturucu saticiligi iddiasi');
    }

    if (/evine gelen\s*\d+\s*kisi|evine gelen.*kisi|evine gelen.*kişi/i.test(text)) {
        addCandidate('evine gelen kisilerde farkli uyusturucu ele gecirilmesi');
    }

    if (/kullanim sinirini asan|kullanım sınırını aşan|kullanim siniri|kullanım sınırı/i.test(text)) {
        addCandidate('kullanim sinirini asan miktarda madde');
    }

    const fullNameMatches = text.match(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/g) || [];
    fullNameMatches.forEach(addCandidate);

    text.split(/[,\n;]+/g).forEach(addCandidate);

    const tokenFallback = text
        .split(/[\s,;:.!?()\/\\-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !KEYWORD_STOPWORDS.has(token.toLocaleLowerCase('tr-TR')));

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
    const hasDocumentWord = /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep)/i.test(text);
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
        const isSimpleQuestion = isSimpleGuidanceQuestion(lastUserMessage);
        const requiresEvidenceForAnswer = !isSimpleQuestion || isDocumentRequest || (Array.isArray(files) && files.length > 0);

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
            if (!hasWebEvidence(effectiveSearchSummary, effectiveWebSourceCount)) {
                const webEvidence = await runWebVerificationSearch(ai, evidenceQuery, lastUserMessage);
                if (webEvidence.summary) {
                    effectiveSearchSummary = [effectiveSearchSummary, webEvidence.summary].filter(Boolean).join('\n\n').trim();
                    effectiveWebSourceCount = Math.max(effectiveWebSourceCount, webEvidence.sourceCount);
                }
            }

            if (!hasLegalEvidence(effectiveLegalSummary, effectiveLegalResultCount)) {
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

        if (requiresEvidenceForAnswer && !isDocumentRequest && (!hasVerifiedWebEvidence || !hasVerifiedLegalEvidence)) {
            return res.status(422).json({
                error: 'Bu soruya güvenli yanıt için web ve emsal karar doğrulaması tamamlanamadı. Lütfen tekrar deneyin.',
                code: 'MISSING_REQUIRED_EVIDENCE_FOR_CHAT'
            });
        }

        const documentGenerationAllowed = hasVerifiedWebEvidence && hasVerifiedLegalEvidence;

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

        const systemInstruction = `Sen, Turk Hukuku uzmani bir hukuk asistanisin.

**GOREVLERIN:**
1. Hukuki sorulari yanitla
2. Dava stratejisi konusunda yardimci ol
3. Belge yuklendiyse analiz et
4. Emsal karar numarasi/kunyesi uydurma
5. Sadece dogrulanmis bulgulara dayan
${documentGenerationAllowed ? '6. generate_document fonksiyonunu sadece dogrulanmis kanit varken kullan' : '6. generate_document kullanma, kanit eksigini bildir'}
7. search_yargitay fonksiyonu ile ictihat ara

${contextPrompt}

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
                msg.files.forEach((file) => {
                    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
                });
            }
            return { role: msg?.role === 'user' ? 'user' : 'model', parts };
        });

        if (Array.isArray(files) && files.length > 0 && contents.length > 0) {
            const lastIdx = contents.length - 1;
            if (contents[lastIdx].role === 'user') {
                files.forEach((file) => {
                    contents[lastIdx].parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
                });
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
