import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';
import { getCurrentDateContext } from './current-date.js';

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
        const params = req.body || {};
        const currentDateContext = getCurrentDateContext();

        const systemInstruction = `${currentDateContext.instruction}

Sen ust duzey bir Turk hukuk editorusun. Dilekceyi gozden gecir ve iyilestir.`;

        const promptText = `
**GOREV: DILEKCE TASLAGI IYILESTIRME**

**GUNCEL TARIH BAGLAMI:**
${currentDateContext.instruction}

**MEVCUT DILEKCE:**
${params.currentPetition || ''}

**BAGLAM:**
- Kullanici Rolu: ${params.userRole || '-'}
- Dilekce Turu: ${params.petitionType || '-'}
- Olay Ozeti: ${params.analysisSummary || '-'}

**IYILESTIRILMIS NIHAI DILEKCE:**
`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: String(response?.text || '').trim() });
    } catch (error) {
        console.error('Review Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Review API error') });
    }
}
