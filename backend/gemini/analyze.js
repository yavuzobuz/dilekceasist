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

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ai = getGeminiClient();
        const { uploadedFiles, udfTextContent, wordTextContent } = req.body;
        const safeUploadedFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];

        if (safeUploadedFiles.length === 0 && !udfTextContent && !wordTextContent) {
            return res.status(400).json({ error: "Analiz edilecek hiçbir belge sağlanmadı." });
        }

        const systemInstruction = `Sen bir Türk hukuki asistanısın. Görevin yüklenen belgeleri analiz etmek.
        
TÜM METİN BLOKLARINI birleştir ve analizi şu JSON formatında döndür:

{
  "summary": "Belgenin özeti - paragraflar halinde yaz",
  "potentialParties": ["Taraf1", "Taraf2", ...],
  "caseDetails": {
    "caseTitle": "Dava başlığı veya konu",
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

SADECE JSON döndür, başka açıklama ekleme.

EK KURAL: Eğer yüklenen dosya taranmış, görüntü tabanlı veya resimden oluşmuş bir PDF ise görünen metni OCR mantığı ile okuyup analiz et. Metin seçilemiyor olsa bile yazılar, mühürler, imzalar, tablo başlıkları ve sayfa üstbilgilerini dikkate al.`;

        const fileSummaries = safeUploadedFiles
            .map((file, index) => {
                const fileName = String(file?.name || `Belge ${index + 1}`).trim() || `Belge ${index + 1}`;
                const mimeType = String(file?.mimeType || 'bilinmeyen').trim() || 'bilinmeyen';
                const scannedHint = /pdf/i.test(mimeType)
                    ? 'Taranmış/görüntü tabanlı PDF olabilir; OCR ile oku.'
                    : /^image\//i.test(mimeType)
                        ? 'Görsel belge; görünen metni ve düzeni incele.'
                        : '';
                return `- ${fileName} (${mimeType})${scannedHint ? ` - ${scannedHint}` : ''}`;
            })
            .join('\n');

        // Build content parts for Gemini
        const parts = [];

        // Add text content
        if (udfTextContent) {
            parts.push({ text: `UDF İçeriği:\n${udfTextContent}\n\n---\n` });
        }
        if (wordTextContent) {
            parts.push({ text: `Word İçeriği:\n${wordTextContent}\n\n---\n` });
        }

        if (fileSummaries) {
            parts.push({ text: `Yüklenen dosyalar:\n${fileSummaries}\n` });
        }

        // Add uploaded files as inline data
        if (safeUploadedFiles.length > 0) {
            for (const file of safeUploadedFiles) {
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Internal Server Error') });
    }
}
