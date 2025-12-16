import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { source, keyword, filters = {} } = req.body;

        if (!keyword) {
            return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
        }

        console.log(`📚 Legal Search: "${keyword}" (source: ${source || 'all'})`);

        // Use AI-powered search with Google grounding
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Türkiye'de "${keyword}" konusunda emsal Yargıtay ve Danıştay kararları bul. Her karar için:
            - Mahkeme (Yargıtay/Danıştay)
            - Daire
            - Esas No
            - Karar No
            - Tarih
            - Kısa özet (1-2 cümle)
            - İlgi Skoru (0-100)
            
            En az 10 farklı karar bul ve JSON formatında döndür:
            [{"mahkeme": "...", "daire": "...", "esasNo": "...", "kararNo": "...", "tarih": "...", "ozet": "...", "relevanceScore": 85}]
            
            Sadece JSON array döndür. Sonuçları ilgi skoruna göre sırala.`,
            config: { tools: [{ googleSearch: {} }] }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);

        let results = [];
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                results = parsed.map((r, i) => ({
                    id: `search-${i}`,
                    title: `${r.mahkeme || 'Yargıtay'} ${r.daire || ''}`,
                    esasNo: r.esasNo || '',
                    kararNo: r.kararNo || '',
                    tarih: r.tarih || '',
                    daire: r.daire || '',
                    ozet: r.ozet || '',
                    relevanceScore: r.relevanceScore || Math.max(0, 100 - (i * 8))
                })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
            } catch (e) {
                console.error('JSON parse error:', e);
            }
        }

        res.json({
            success: true,
            source: source || 'all',
            keyword,
            results
        });

    } catch (error) {
        console.error('Legal Search Error:', error);
        res.status(500).json({
            error: 'İçtihat arama sırasında bir hata oluştu.',
            details: error.message
        });
    }
}
