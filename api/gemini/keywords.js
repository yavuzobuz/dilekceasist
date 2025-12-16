import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { analysisText, userRole } = req.body;

        const systemInstruction = `Sen bir hukuki anahtar kelime üreticisisin.
Sana verilen analiz metnine dayanarak, web araması için uygun anahtar kelimeler üret.
Rol: ${userRole || 'Tarafsız'}

Anahtar kelimeleri şu JSON formatında döndür:
{ "keywords": ["kelime1", "kelime2", ...] }

En fazla 10 anahtar kelime üret. SADECE JSON döndür.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: analysisText,
            config: { systemInstruction }
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('Keywords Error:', error);
        res.status(500).json({ error: error.message });
    }
}
