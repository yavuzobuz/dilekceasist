import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

// GET /api/legal?action=sources
async function handleSources(req, res) {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargıtay', description: 'Yargıtay Kararları' },
            { id: 'danistay', name: 'Danıştay', description: 'Danıştay Kararları' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararları' },
            { id: 'kik', name: 'Kamu İhale Kurulu', description: 'KİK Kararları' },
        ]
    });
}

// POST /api/legal?action=search-decisions
async function handleSearchDecisions(req, res) {
    const { source, keyword, filters = {} } = req.body;

    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    console.log(`📚 Legal Search: "${keyword}" (source: ${source || 'all'})`);

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
}

// POST /api/legal?action=get-document
async function handleGetDocument(req, res) {
    const { source, documentId, documentUrl } = req.body;

    if (!documentId && !documentUrl) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    res.json({
        success: true,
        source,
        document: {
            content: `Belge detayları için lütfen resmi kaynaklara başvurun:
            
• Yargıtay: https://karararama.yargitay.gov.tr
• Danıştay: https://www.danistay.gov.tr/karar-arama
• UYAP Emsal: https://emsal.uyap.gov.tr

Belge ID: ${documentId || documentUrl}`,
            note: 'Tam metin erişimi için resmi portalleri kullanın.'
        }
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const action = req.query.action || req.body?.action;

        switch (action) {
            case 'sources':
                return handleSources(req, res);
            case 'search-decisions':
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                return handleSearchDecisions(req, res);
            case 'get-document':
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                return handleGetDocument(req, res);
            default:
                // Default: return sources for GET, error for POST without action
                if (req.method === 'GET') return handleSources(req, res);
                return res.status(400).json({ error: 'action parametresi gerekli: sources, search-decisions, get-document' });
        }

    } catch (error) {
        console.error('Legal API Error:', error);
        res.status(500).json({ error: 'Bir hata oluştu.', details: error.message });
    }
}
