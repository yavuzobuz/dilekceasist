import { GoogleGenAI, Type } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash';

const getAiClient = () => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY or VITE_GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

// Fallback search function for legal decisions
async function searchEmsalFallback(ai, keyword) {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Turkiye'de "${keyword}" konusunda emsal Yargitay ve Danistay kararlari bul. Her karar icin:
            - Mahkeme, Daire, Esas No, Karar No, Tarih, Ozet, Ilgi Skoru (0-100)

            En az 10 karar bul ve JSON formatinda dondur:
            [{"mahkeme": "...", "daire": "...", "esasNo": "...", "kararNo": "...", "tarih": "...", "ozet": "...", "relevanceScore": 85}]

            Sadece JSON array dondur.`,
            config: { tools: [{ googleSearch: {} }] }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                results: results
                    .map((r, i) => ({
                        id: `search-${i}`,
                        title: `${r.mahkeme || 'Yargitay'} ${r.daire || ''}`.trim(),
                        esasNo: r.esasNo || '',
                        kararNo: r.kararNo || '',
                        tarih: r.tarih || '',
                        daire: r.daire || '',
                        ozet: r.ozet || '',
                        relevanceScore: r.relevanceScore || Math.max(0, 100 - (i * 8))
                    }))
                    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            };
        }
        return { success: true, results: [] };
    } catch (error) {
        console.error('Search error:', error);
        return { success: false, results: [] };
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getAiClient();
        const { chatHistory, analysisSummary, context, files } = req.body || {};
        const safeContext = context || {};

        if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
            return res.status(400).json({ error: 'chatHistory must be a non-empty array' });
        }

        const contextPrompt = `
**MEVCUT DURUM:**
- Vaka Ozeti: ${analysisSummary || 'Henuz analiz yapilmadi.'}
- Anahtar Kelimeler: ${safeContext.keywords || 'Yok'}
- Web Arastirma: ${safeContext.searchSummary || 'Yok'}
${Array.isArray(files) && files.length > 0 ? `- Yuklenen Belgeler: ${files.length} adet` : ''}
`;

        const systemInstruction = `Sen, Turk Hukuku uzmani bir hukuk asistanisin.

**GOREVLERIN:**
1. Hukuki sorulari yanitla
2. Dava stratejisi konusunda yardimci ol
3. Belge yuklendiyse analiz et
4. generate_document fonksiyonu ile belge olustur
5. search_yargitay fonksiyonu ile ictihat ara

${contextPrompt}

Turkce yanit ver.`;

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
                tools: [{ functionDeclarations: [updateKeywordsFunction, generateDocumentFunction, searchYargitayFunction] }],
            },
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const pendingSearchCalls = [];

        for await (const chunk of responseStream) {
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall?.name === 'search_yargitay') {
                        pendingSearchCalls.push(part.functionCall);
                    }
                }
            }
            res.write(JSON.stringify(chunk) + '\n');
        }

        if (pendingSearchCalls.length > 0) {
            for (const fc of pendingSearchCalls) {
                const searchQuery = fc.args?.searchQuery || '';
                console.log(`[AI] legal search: "${searchQuery}"`);
                const searchResult = await searchEmsalFallback(ai, searchQuery);

                let formattedResults = '\n\n### BULUNAN YARGITAY KARARLARI\n\n';
                if (searchResult.results?.length > 0) {
                    searchResult.results.forEach((r, i) => {
                        formattedResults += `**${i + 1}. ${r.title}**\n`;
                        if (r.esasNo) formattedResults += `E. ${r.esasNo} `;
                        if (r.kararNo) formattedResults += `K. ${r.kararNo} `;
                        if (r.tarih) formattedResults += `T. ${r.tarih}`;
                        formattedResults += '\n';
                        if (r.ozet) formattedResults += `Ozet: ${r.ozet}\n\n`;
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
                text: '\n\nSohbet servisi gecici olarak kullanilamiyor. Lutfen tekrar deneyin.\n',
                error: true
            }) + '\n');
            res.end();
        }
    }
}
