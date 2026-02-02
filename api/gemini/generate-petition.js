import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-3-pro-preview';

// Helper functions
function formatCaseDetailsForPrompt(caseDetails) {
    if (!caseDetails) return "Dava künyesi sağlanmadı.";
    return `Mahkeme: ${caseDetails.court || '-'}, Dosya No: ${caseDetails.fileNumber || '-'}, Karar No: ${caseDetails.decisionNumber || '-'}, Karar Tarihi: ${caseDetails.decisionDate || '-'}`;
}

function formatLawyerInfoForPrompt(lawyerInfo) {
    if (!lawyerInfo) return "Vekil bilgisi sağlanmadı.";
    return `${lawyerInfo.title || 'Av.'} ${lawyerInfo.name || '-'}, ${lawyerInfo.bar || '-'} Barosu, Sicil: ${lawyerInfo.barNumber || '-'}`;
}

function formatPartiesForPrompt(parties) {
    if (!parties || Object.keys(parties).length === 0) return "Taraf bilgisi sağlanmadı.";
    return Object.entries(parties).map(([role, name]) => `${role}: ${name}`).join(', ');
}

function formatChatHistoryForPrompt(chatHistory) {
    if (!chatHistory || chatHistory.length === 0) return "Sohbet geçmişi yok.";
    return chatHistory.map(m => `${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${m.text}`).join('\n');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const params = req.body;

        const systemInstruction = `Sen, Türk hukuk sisteminde 20+ yıl deneyime sahip, üst düzey bir hukuk danışmanı ve dilekçe yazım uzmanısın.

## SENİN GÖREVİN
Sağlanan ham verileri, profesyonel ve ikna edici bir hukuki anlatıya dönüştürmek.

## KRİTİK YAZIM KURALLARI

### AÇIKLAMALAR BÖLÜMÜ
Numaralı maddeler halinde, profesyonel hukuki anlatı.

### EMSAL KARARLARIN KULLANIMI
Yargıtay kararlarını ilgili argümanla birlikte AÇIKLAMALAR bölümünde entegre et.

### DİL VE ÜSLUP
- "Müvekkil" kelimesini tutarlı kullan
- Resmi hitap: "Sayın Mahkemeniz", "arz ve talep ederim"
- Hukuki terimler kullan`;

        const promptText = `
## DİLEKÇE OLUŞTURMA TALİMATI

### GİRDİ VERİLERİ
**Dilekçe Türü:** ${params.petitionType}
**Kullanıcının Rolü:** ${params.userRole}
**Dava Künyesi:** ${formatCaseDetailsForPrompt(params.caseDetails)}
**Vekil Bilgileri:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
**Taraflar:** ${formatPartiesForPrompt(params.parties)}
**Olay Özeti:** ${params.analysisSummary || "Sağlanmadı."}
**Hukuki Araştırma:** ${params.webSearchResult || "Sağlanmadı."}
**Emsal Kararlar:** ${params.legalSearchResult || "Sağlanmadı."}
**Ek Notlar:** ${params.docContent || "Sağlanmadı."}
**Özel Talimatlar:** ${params.specifics || "Sağlanmadı."}
**Sohbet Geçmişi:** ${formatChatHistoryForPrompt(params.chatHistory)}

## BEKLENEN ÇIKTI
1. Profesyonel, ikna edici hukuki anlatı
2. AÇIKLAMALAR, HUKUKİ SEBEPLER, DELİLLER, SONUÇ VE İSTEM bölümleri
3. Emsal kararları ilgili argümanla entegre et
4. Markdown formatı kullan
`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: error.message });
    }
}
