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
        const { textToRewrite } = req.body;

        const systemInstruction = `Sen bir Türk hukuk metni editörüsün. Verilen metni daha profesyonel ve hukuki bir dille yeniden yaz.`;
        const promptText = `Lütfen aşağıdaki metni yeniden yaz:\n\n"${textToRewrite}"`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text.trim() });

    } catch (error) {
        console.error('Rewrite Error:', error);
        res.status(500).json({ error: error.message });
    }
}
