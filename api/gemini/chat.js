import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-3-pro-preview';

// Fallback search function for legal decisions
async function searchEmsalFallback(keyword) {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Türkiye'de "${keyword}" konusunda emsal Yargıtay ve Danıştay kararları bul. Her karar için:
            - Mahkeme, Daire, Esas No, Karar No, Tarih, Özet, İlgi Skoru (0-100)
            
            En az 10 karar bul ve JSON formatında döndür:
            [{"mahkeme": "...", "daire": "...", "esasNo": "...", "kararNo": "...", "tarih": "...", "ozet": "...", "relevanceScore": 85}]
            
            Sadece JSON array döndür.`,
            config: { tools: [{ googleSearch: {} }] }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                results: results.map((r, i) => ({
                    id: `search-${i}`,
                    title: `${r.mahkeme || 'Yargıtay'} ${r.daire || ''}`,
                    esasNo: r.esasNo || '',
                    kararNo: r.kararNo || '',
                    tarih: r.tarih || '',
                    daire: r.daire || '',
                    ozet: r.ozet || '',
                    relevanceScore: r.relevanceScore || Math.max(0, 100 - (i * 8))
                })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
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
        const { chatHistory, analysisSummary, context, files } = req.body;

        const contextPrompt = `
**MEVCUT DURUM:**
- Vaka Özeti: ${analysisSummary || "Henüz analiz yapılmadı."}
- Anahtar Kelimeler: ${context?.keywords || "Yok"}
- Web Araştırma: ${context?.searchSummary || "Yok"}
${files?.length > 0 ? `- Yüklenen Belgeler: ${files.length} adet` : ''}
`;

        const systemInstruction = `Sen, Türk Hukuku uzmanı bir hukuk asistanısın.

**GÖREVLERİN:**
1. Hukuki soruları yanıtla
2. Dava stratejisi konusunda yardımcı ol
3. Belge yüklendiyse analiz et
4. generate_document fonksiyonu ile belge oluştur
5. search_yargitay fonksiyonu ile içtihat ara

${contextPrompt}

Türkçe yanıt ver.`;

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
            description: 'Belge/dilekçe oluştur',
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
            description: 'Yargıtay kararı ara',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['searchQuery'],
            },
        };

        // Build contents with file support
        const contents = chatHistory.map(msg => {
            const parts = [{ text: msg.text }];
            if (msg.files?.length > 0) {
                msg.files.forEach(file => {
                    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
                });
            }
            return { role: msg.role === 'user' ? 'user' : 'model', parts };
        });

        // Add files from request to last message
        if (files?.length > 0 && contents.length > 0) {
            const lastIdx = contents.length - 1;
            if (contents[lastIdx].role === 'user') {
                files.forEach(file => {
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

        // Streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let pendingSearchCalls = [];

        for await (const chunk of responseStream) {
            // Check for search function calls
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

        // Execute pending search calls
        if (pendingSearchCalls.length > 0) {
            for (const fc of pendingSearchCalls) {
                const searchQuery = fc.args?.searchQuery || '';
                console.log(`🔍 AI legal search: "${searchQuery}"`);
                const searchResult = await searchEmsalFallback(searchQuery);

                let formattedResults = '\n\n### 📚 BULUNAN YARGITAY KARARLARI\n\n';
                if (searchResult.results?.length > 0) {
                    searchResult.results.forEach((r, i) => {
                        formattedResults += `**${i + 1}. ${r.title}**\n`;
                        if (r.esasNo) formattedResults += `E. ${r.esasNo} `;
                        if (r.kararNo) formattedResults += `K. ${r.kararNo} `;
                        if (r.tarih) formattedResults += `T. ${r.tarih}`;
                        formattedResults += '\n';
                        if (r.ozet) formattedResults += `Özet: ${r.ozet}\n\n`;
                    });
                } else {
                    formattedResults += 'Bu konuda emsal karar bulunamadı.\n';
                }

                res.write(JSON.stringify({ text: formattedResults, functionCallResults: true, searchResults: searchResult.results }) + '\n');
            }
        }

        res.end();

    } catch (error) {
        console.error('Chat Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.end();
        }
    }
}
