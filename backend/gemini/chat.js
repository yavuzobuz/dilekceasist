import { Type } from '@google/genai';
import { consumeGenerationCredit, TRIAL_DAILY_GENERATION_LIMIT } from '../../lib/api/generationQuota.js';
import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const appendGeminiFileParts = (parts, files) => {
    if (!Array.isArray(files)) return;

    for (const file of files) {
        const mimeType = normalizeText(file?.mimeType);
        const data = normalizeText(file?.data);
        if (!mimeType || !data) continue;
        parts.push({ inlineData: { mimeType, data } });
    }
};

export const buildSystemInstruction = ({ analysisSummary, context }) => {
    const safeContext = context && typeof context === 'object' ? context : {};
    const summary = normalizeText(analysisSummary);
    const keywords = Array.isArray(safeContext.searchKeywords)
        ? safeContext.searchKeywords.filter(Boolean).join(', ')
        : normalizeText(safeContext.keywords);
    const webSummary = normalizeText(safeContext.webSearchSummary || safeContext.searchSummary);
    const legalSummary = normalizeText(safeContext.legalSummary);
    const webSources = normalizeArray(safeContext.webSources)
        .map((source) => {
            const title = normalizeText(source?.title);
            let display = title;
            if (!display && source?.uri) {
                try {
                    display = new URL(source.uri).hostname.replace('www.', '');
                } catch {
                    display = source.uri;
                }
            }
            // Çirkin yönlendirme linklerini (vertexaisearch vb.) modele hiç verme
            if (display && display.includes('vertexaisearch')) {
                display = 'Google Search Source';
            }
            return display ? `- ${display}` : '';
        })
        .filter(Boolean)
        .slice(0, 6)
        .join('\n');
    const legalResults = normalizeArray(safeContext.legalSearchResults)
        .map((result) => {
            const title = normalizeText(result?.title) || normalizeText(result?.daire) || 'Emsal karar';
            const reference = [
                title,
                normalizeText(result?.esasNo) ? `E. ${normalizeText(result.esasNo)}` : '',
                normalizeText(result?.kararNo) ? `K. ${normalizeText(result.kararNo)}` : '',
                normalizeText(result?.tarih),
            ].filter(Boolean).join(' ');
            const details =
                normalizeText(result?.selectionReason)
                || normalizeText(result?.summaryText)
                || normalizeText(result?.ozet)
                || normalizeText(result?.snippet);
            return details ? `${reference}: ${details}` : reference;
        })
        .filter(Boolean)
        .slice(0, 6)
        .join('\n');
    const additionalText = normalizeText(safeContext.additionalContext || safeContext.docContent);
    const specialInstructions = normalizeText(safeContext.specialInstructions || safeContext.specifics);

    const hasWebData = !!(webSummary || webSources);
    const hasLegalData = !!(legalSummary || legalResults);
    const searchCapabilityText = [
        hasWebData
            ? '- Web arastirmasi verisi bu istekte zaten saglandi; yalnizca bu veriyi kullan.'
            : '- Bu istekte web arastirmasi verisi saglanmadi. Web aramasi yapildigini ima etme.',
        hasLegalData
            ? '- Emsal karar verisi bu istekte zaten saglandi; yalnizca bu veriyi kullan.'
            : '- Bu istekte emsal karar verisi saglanmadi. Emsal karar arandigini veya bulundu gunu ima etme.',
    ].join('\n');

    return [
        'Sen Turk hukuku konusunda uzman bir hukuk asistanisin.',
        'ONEMLI KURALLAR:',
        '- Dogrulanmamis kaynak uydurma.',
        '- Kullanici belge isterse generate_document fonksiyonunu kullan.',
        '- Kullanici anahtar kelime eklemek isterse update_search_keywords fonksiyonunu kullan.',
        '',
        'YETENEKLERIN:',
        searchCapabilityText,
        '- Belge olusturma: Kullanici dilekce/belge istediginde uygun durumda generate_document ile belge olustur.',
        '',
        'CEVAP VERIRKEN:',
        '- ASLA "web aramasi yapamiyorum", "internete erisemiyorum", "arama yetenegim yok", "bu konuda arastirma yapiliyor" gibi ifadeler KULLANMA.',
        '- ASLA "bekleyin" veya "en kisa surede sunulacak" gibi bekleme ifadeleri KULLANMA.',
        '- Asagida web veya emsal karar verileri varsa bunlari kullanarak detayli cevap ver.',
        '- Asagida veri yoksa, arama yapildigini soylemeden dogrudan kendi hukuk bilginle kapsamli cevap ver.',
        '- Gerektiginde kullaniciya "Daha detayli bilgi icin \'web aramasi yap\' veya \'emsal karar ara\' diyebilirsiniz" seklinde oneri sun.',
        '- Her zaman gercek bilgi ve mevzuat referanslarina dayanarak cevap ver.',
        '',
        hasWebData ? `=== WEB ARASTIRMASI SONUCLARI ===\n${webSummary || ''}\n\nKaynaklar:\n${webSources || ''}` : '',
        hasLegalData ? `=== EMSAL KARAR SONUCLARI ===\n${legalSummary || ''}\n\nDetayli Sonuclar:\n${legalResults || ''}` : '',
        summary ? `=== VAKA OZETI ===\n${summary}` : '',
        keywords ? `Anahtar Kelimeler: ${keywords}` : '',
        additionalText ? `=== EK BELGELER ===\n${additionalText}` : '',
        specialInstructions ? `=== OZEL TALIMATLAR ===\n${specialInstructions}` : '',
    ].filter(Boolean).join('\n');
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
        const ai = getGeminiClient();
        const { chatHistory, analysisSummary, context, files } = req.body || {};
        const safeChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

        if (safeChatHistory.length === 0) {
            return res.status(400).json({ error: 'chatHistory must be a non-empty array' });
        }

        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'Kullanici yeni anahtar kelime eklemek istediginde kullan.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keywordsToAdd: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['keywordsToAdd'],
            },
        };

        const generateDocumentFunction = {
            name: 'generate_document',
            description: 'Kullanici bir belge veya dilekce hazirlanmasini istediginde kullan.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: { type: Type.STRING },
                    documentTitle: { type: Type.STRING },
                    documentContent: { type: Type.STRING },
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };

        const contents = [];
        for (const message of safeChatHistory) {
            const parts = [{ text: normalizeText(message?.text) }];
            if (Array.isArray(message?.files) && message.files.length > 0) {
                appendGeminiFileParts(parts, message.files);
            }
            const role = message?.role === 'user' ? 'user' : 'model';
            
            if (contents.length > 0 && contents[contents.length - 1].role === role) {
                // Aynı role sahip ardışık mesajları birleştir. Araya yeni satır ekleyerek metinleri ayır.
                const lastParts = contents[contents.length - 1].parts;
                const lastPartText = lastParts[lastParts.length - 1]?.text;
                if (lastPartText && parts[0]?.text) {
                    lastParts[lastParts.length - 1].text = lastPartText + '\n\n' + parts[0].text;
                    lastParts.push(...parts.slice(1));
                } else {
                    lastParts.push(...parts);
                }
            } else {
                contents.push({ role, parts });
            }
        }

        if (Array.isArray(files) && files.length > 0 && contents.length > 0) {
            const lastIndex = contents.length - 1;
            if (contents[lastIndex].role === 'user') {
                appendGeminiFileParts(contents[lastIndex].parts, files);
            }
        }

        const responseStream = await ai.models.generateContentStream({
            model: MODEL_NAME,
            contents,
            config: {
                systemInstruction: buildSystemInstruction({ analysisSummary, context }),
                tools: [{ functionDeclarations: [updateKeywordsFunction, generateDocumentFunction] }],
            },
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let hasConsumedDocumentCredit = false;
        let streamBlockedByQuota = false;

        for await (const chunk of responseStream) {
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall?.name === 'generate_document' && !hasConsumedDocumentCredit) {
                        const credit = await consumeGenerationCredit(req, 'chat_document_generation');
                        if (!credit.allowed) {
                            streamBlockedByQuota = true;
                            const quotaChunk = {
                                text: `\n\nGunluk belge uretim limitine ulastiniz. (Limit: ${TRIAL_DAILY_GENERATION_LIMIT})\n`,
                                error: true,
                                code: credit.payload?.code || 'TRIAL_DAILY_LIMIT_REACHED',
                            };
                            res.write(JSON.stringify(quotaChunk) + '\n');
                            break;
                        }
                        hasConsumedDocumentCredit = true;
                    }
                }
            }

            if (streamBlockedByQuota) break;
            res.write(JSON.stringify(chunk) + '\n');
        }

        res.end();
    } catch (error) {
        console.error('Chat Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: getSafeErrorMessage(error, 'Sohbet servisi gecici olarak kullanilamiyor.') });
        } else {
            res.end();
        }
    }
}

export const __testables = {
    buildSystemInstruction,
};
