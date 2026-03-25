import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error('missing api key');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const models = [
  process.env.GEMINI_MODEL_NAME || process.env.VITE_GEMINI_MODEL_NAME || 'gemini-2.5-flash',
  process.env.GEMINI_FLASH_PREVIEW_MODEL_NAME || process.env.VITE_GEMINI_FLASH_PREVIEW_MODEL_NAME || 'gemini-3-flash-preview',
];

for (const model of models) {
  const started = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: 'Gecersiz fesih nedeniyle ise iade talebi.',
      config: {
        systemInstruction: 'Sadece JSON dondur. {"ok":true,"queryMode":"short_issue","primaryDomain":"is_hukuku"}',
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ok: { type: Type.BOOLEAN },
            queryMode: { type: Type.STRING },
            primaryDomain: { type: Type.STRING },
          },
          required: ['ok','queryMode','primaryDomain'],
        },
      },
    });
    const text = response?.text || response?.outputText || '';
    console.log(JSON.stringify({ model, ok: true, ms: Date.now() - started, text }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ model, ok: false, ms: Date.now() - started, message: error?.message || String(error) }, null, 2));
  }
}
