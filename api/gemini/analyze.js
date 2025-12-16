import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { uploadedFiles, udfTextContent, wordTextContent } = req.body;

        if ((!uploadedFiles || uploadedFiles.length === 0) && !udfTextContent && !wordTextContent) {
            return res.status(400).json({ error: "Analiz edilecek hiçbir belge sağlanmadı." });
        }

        const systemInstruction = `Sen bir Türk hukuki asistanısın. Görevin yüklenen belgeleri analiz etmek.
        
TÜM METİN BLOKLARINI birleştir ve analizi şu JSON formatında döndür:

{
  "summary": "Belgenin özeti - paragraflar halinde yaz",
  "potentialParties": ["Taraf1", "Taraf2", ...],
  "caseDetails": {
    "court": "Mahkeme adı",
    "fileNumber": "Dosya numarası",
    "decisionNumber": "Karar numarası",
    "decisionDate": "Karar tarihi"
  },
  "lawyerInfo": {
    "name": "Avukat adı",
    "bar": "Baro",
    "barNumber": "Sicil no",
    "address": "Adres",
    "phone": "Telefon",
    "email": "Email",
    "tcNo": "TC Kimlik No"
  },
  "contactInfo": [
    { "name": "Ad", "address": "Adres", "phone": "Telefon", "email": "Email", "tcNo": "TC" }
  ]
}

SADECE JSON döndür, başka açıklama ekleme.`;

        // Build content parts for Gemini
        const parts = [];

        // Add text content
        if (udfTextContent) {
            parts.push({ text: `UDF İçeriği:\n${udfTextContent}\n\n---\n` });
        }
        if (wordTextContent) {
            parts.push({ text: `Word İçeriği:\n${wordTextContent}\n\n---\n` });
        }

        // Add uploaded files as inline data
        if (uploadedFiles && uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                if (file.mimeType && file.data) {
                    parts.push({
                        inlineData: {
                            mimeType: file.mimeType,
                            data: file.data
                        }
                    });
                }
            }
        }

        parts.push({ text: "Lütfen yukarıdaki tüm belgeleri analiz et ve JSON formatında sonuç döndür." });

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: 'user', parts }],
            config: { systemInstruction }
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('Analyze Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
