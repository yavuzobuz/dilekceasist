import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getGeminiClient();
        const params = req.body;

        const systemInstruction = `Sen üst düzey bir Türk hukuk editörüsün. Dilekçeyi gözden geçir ve iyileştir.`;

        const promptText = `
**GÖREV: DİLEKÇE TASLAĞI İYİLEŞTİRME**

**MEVCUT DİLEKÇE:**
${params.currentPetition}

**BAĞLAM:**
- Kullanıcı Rolü: ${params.userRole}
- Dilekçe Türü: ${params.petitionType}
- Olay Özeti: ${params.analysisSummary || '-'}

**İYİLEŞTİRİLMİŞ NİHAİ DİLEKÇE:**
`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text.trim() });

    } catch (error) {
        console.error('Review Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Review API error') });
    }
}
