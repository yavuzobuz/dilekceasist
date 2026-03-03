import { GoogleGenAI } from '@google/genai';
import { consumeGenerationCredit } from '../_lib/generationQuota.js';

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
function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hasWebEvidence(params) {
    const summary = normalizeText(params?.webSearchResult);
    const sourceCount = Number(params?.webSourceCount || 0);
    return summary.length >= 40 && sourceCount > 0;
}

function hasLegalEvidence(params) {
    const legalText = normalizeText(params?.legalSearchResult);
    const legalCount = Number(params?.legalResultCount || 0);
    const hasCitationToken = /(?:E\.\s*\S+|K\.\s*\S+|esas|karar|yargitay|danistay)/i.test(legalText);
    return legalText.length >= 40 && legalCount > 0 && hasCitationToken;
}

const ANALYSIS_SUMMARY_HELP_TEXT = [
    'Analiz özeti, yüklediğiniz belgelerden çıkarılan olay özetidir.',
    'Örnek belgeler: tapu kayıtları, veraset ilamı, sözleşmeler, tutanaklar ve mahkeme evrakları.',
].join(' ');

const DOCUMENT_REQUIREMENTS_HELP_TEXT = [
    `${ANALYSIS_SUMMARY_HELP_TEXT}`,
    'Belge oluşturma için şu 3 adım zorunludur: 1) Belgeleri yükleyip analiz et, 2) Web araştırması yap, 3) Emsal karar araması yap.',
].join(' ');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const credit = await consumeGenerationCredit(req, 'generate_petition');
        if (!credit.allowed) {
            return res.status(credit.status || 429).json(credit.payload || {
                error: 'Belge uretim kotasi kontrolu basarisiz.',
                code: 'CREDIT_CHECK_FAILED',
            });
        }

        const params = req.body || {};
        const analysisSummary = normalizeText(params.analysisSummary);

        if (!analysisSummary) {
            return res.status(422).json({
                error: `Belge oluşturma engellendi. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_ANALYSIS_SUMMARY'
            });
        }

        if (!hasWebEvidence(params)) {
            return res.status(422).json({
                error: `Web araştırması eksik. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_WEB_EVIDENCE'
            });
        }

        if (!hasLegalEvidence(params)) {
            return res.status(422).json({
                error: `Emsal karar araması eksik. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_LEGAL_EVIDENCE'
            });
        }

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
## DILEKCE OLUSTURMA TALIMATI

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

        res.json({ text: response.text, usage: credit.usage || null });

    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: error.message });
    }
}


