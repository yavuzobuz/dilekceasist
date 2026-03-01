import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

const maybeExtractJson = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        // ignore
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch {
            // ignore
        }
    }

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            // ignore
        }
    }

    return null;
};

// GET /api/legal?action=sources
async function handleSources(req, res) {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargitay', description: 'Yargitay Kararlari' },
            { id: 'danistay', name: 'Danistay', description: 'Danistay Kararlari' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararlari' },
            { id: 'kik', name: 'KIK', description: 'Kamu Ihale Kurulu Kararlari' },
        ]
    });
}

// POST /api/legal?action=search-decisions
async function handleSearchDecisions(req, res) {
    const { source, keyword } = req.body || {};

    if (!keyword) {
        return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
    }

    const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Turkiye'de "${keyword}" konusunda emsal Yargitay ve Danistay kararlarini bul.

Her karar icin su alanlari uret:
- mahkeme
- daire
- esasNo
- kararNo
- tarih
- ozet (en fazla 2-3 cumle)
- sourceUrl (resmi karar arama linki varsa)
- relevanceScore (0-100)

Sadece JSON array dondur:
[{"mahkeme":"...","daire":"...","esasNo":"...","kararNo":"...","tarih":"...","ozet":"...","sourceUrl":"https://...","relevanceScore":85}]`,
        config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || '';
    const parsed = maybeExtractJson(text);
    const rows = Array.isArray(parsed) ? parsed : [];

    const results = rows.length > 0
        ? rows.map((r, i) => ({
            id: `search-${i}`,
            documentId: `search-${i}`,
            title: `${r.mahkeme || 'Yargitay'} ${r.daire || ''}`.trim(),
            esasNo: r.esasNo || r.esas_no || '',
            kararNo: r.kararNo || r.karar_no || '',
            tarih: r.tarih || r.date || '',
            daire: r.daire || '',
            ozet: r.ozet || r.snippet || '',
            sourceUrl: r.sourceUrl || r.url || '',
            relevanceScore: Number(r.relevanceScore) || Math.max(0, 100 - (i * 8)),
        })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        : [{
            id: 'ai-summary',
            documentId: 'ai-summary',
            title: 'AI Arama Sonucu',
            ozet: text.substring(0, 500),
        }];

    res.json({
        success: true,
        source: source || 'all',
        provider: 'ai-fallback',
        keyword,
        results,
    });
}

async function getDocumentViaAIFallback({ keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' }) {
    const queryParts = [
        keyword,
        title,
        daire,
        esasNo ? `E. ${esasNo}` : '',
        kararNo ? `K. ${kararNo}` : '',
        tarih ? `T. ${tarih}` : '',
        ozet,
        documentId,
        documentUrl,
    ].filter(Boolean);

    const query = queryParts.join(' ').trim();
    if (!query) return '';

    const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Asagidaki karar kunyesine ait karar METNINI resmi kaynaklardan bul:
${query}

Kurallar:
- Cevapta URL/link verme.
- Giris/yorum ekleme.
- Sadece karar metnini duz yazi olarak dondur.
- Tam metin bulunamazsa, bulunabilen en detayli metni dondur.`,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
        }
    });

    return (response.text || '').replace(/https?:\/\/\S+/gi, '').trim();
}

// POST /api/legal?action=get-document
async function handleGetDocument(req, res) {
    const { source, documentId, documentUrl, title, esasNo, kararNo, tarih, daire, ozet, snippet } = req.body || {};

    if (!documentId && !documentUrl) {
        return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
    }

    let content = '';
    try {
        content = await getDocumentViaAIFallback({
            keyword: [title, daire, esasNo, kararNo, tarih].filter(Boolean).join(' '),
            documentId,
            documentUrl,
            title,
            esasNo,
            kararNo,
            tarih,
            daire,
            ozet: [ozet, snippet].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('AI get-document fallback error:', error);
    }

    if (!content) {
        content = 'Karar metni getirilemedi. Lutfen farkli bir karar secip tekrar deneyin.';
    }

    res.json({
        success: true,
        source,
        provider: 'ai-fallback',
        document: {
            content,
            mimeType: 'text/plain',
            documentId: documentId || '',
            documentUrl: documentUrl || '',
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
                if (req.method === 'GET') return handleSources(req, res);
                return res.status(400).json({ error: 'action parametresi gerekli: sources, search-decisions, get-document' });
        }

    } catch (error) {
        console.error('Legal API Error:', error);
        res.status(500).json({ error: 'Bir hata olustu.', details: error.message });
    }
}
