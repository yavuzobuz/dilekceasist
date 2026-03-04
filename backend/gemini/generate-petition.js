import { consumeGenerationCredit } from '../../lib/api/generationQuota.js';
import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

function formatCaseDetailsForPrompt(caseDetails) {
    if (!caseDetails) return 'Dava kunyesi saglanmadi.';
    return `Mahkeme: ${caseDetails.court || '-'}, Dosya No: ${caseDetails.fileNumber || '-'}, Karar No: ${caseDetails.decisionNumber || '-'}, Karar Tarihi: ${caseDetails.decisionDate || '-'}`;
}

function formatLawyerInfoForPrompt(lawyerInfo) {
    if (!lawyerInfo) return 'Vekil bilgisi saglanmadi.';
    return `${lawyerInfo.title || 'Av.'} ${lawyerInfo.name || '-'}, ${lawyerInfo.bar || '-'} Barosu, Sicil: ${lawyerInfo.barNumber || '-'}`;
}

function formatPartiesForPrompt(parties) {
    if (!parties || Object.keys(parties).length === 0) return 'Taraf bilgisi saglanmadi.';
    return Object.entries(parties).map(([role, name]) => `${role}: ${name}`).join(', ');
}

function formatSearchKeywordsForPrompt(rawKeywords) {
    if (Array.isArray(rawKeywords)) {
        const cleaned = rawKeywords.map((item) => normalizeText(item)).filter(Boolean);
        return cleaned.length > 0 ? cleaned.join(', ') : 'Saglanmadi.';
    }

    const text = normalizeText(rawKeywords);
    return text || 'Saglanmadi.';
}

function formatChatHistoryForPrompt(chatHistory) {
    if (!chatHistory || chatHistory.length === 0) return 'Sohbet gecmisi yok.';
    return chatHistory.map((m) => `${m.role === 'user' ? 'Kullanici' : 'Asistan'}: ${m.text}`).join('\n');
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
    'Analiz ozeti, yuklediginiz belgelerden cikarilan olay ozetidir.',
    'Ornek belgeler: tapu kayitlari, veraset ilami, sozlesmeler, tutanaklar ve mahkeme evraklari.',
].join(' ');

const DOCUMENT_REQUIREMENTS_HELP_TEXT = [
    `${ANALYSIS_SUMMARY_HELP_TEXT}`,
    'Belge olusturma icin su 3 adim zorunludur: 1) Belgeleri yukleyip analiz et, 2) Web arastirmasi yap, 3) Emsal karar aramasi yap.',
].join(' ');

const DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT = 'Belge yuklenmis gorunuyor ancak analiz ozeti henuz olusmamis. Once "Belgeleri Analiz Et" adimini tamamla.';

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, x-api-key',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getGeminiClient();
        const params = req.body || {};
        const analysisSummary = normalizeText(params.analysisSummary);
        const hasUploadedDocument = normalizeText(params.docContent || '').length > 0;

        if (!analysisSummary) {
            return res.status(422).json({
                error: hasUploadedDocument
                    ? DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT
                    : `Belge olusturma engellendi. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_ANALYSIS_SUMMARY',
            });
        }

        if (!hasWebEvidence(params)) {
            return res.status(422).json({
                error: `Web arastirmasi eksik. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_WEB_EVIDENCE',
            });
        }

        if (!hasLegalEvidence(params)) {
            return res.status(422).json({
                error: `Emsal karar aramasi eksik. ${DOCUMENT_REQUIREMENTS_HELP_TEXT}`,
                code: 'MISSING_LEGAL_EVIDENCE',
            });
        }

        const credit = await consumeGenerationCredit(req, 'generate_petition');
        if (!credit.allowed) {
            return res.status(credit.status || 429).json(credit.payload || {
                error: 'Belge uretim kotasi kontrolu basarisiz.',
                code: 'CREDIT_CHECK_FAILED',
            });
        }

        const systemInstruction = `Sen, Turk hukuk sisteminde 20+ yil deneyime sahip, ust duzey bir hukuk danismani ve dilekce yazim uzmansin.

## SENIN GOREVIN
Saglanan ham verileri, profesyonel ve ikna edici bir hukuki anlatia donusturmek.

## KRITIK YAZIM KURALLARI
- Aciklamalar bolumunu numarali maddelerle kur.
- Emsal karar atiflarini ilgili argumanla birlikte metne entegre et.
- Resmi hitap kullan: "Sayin Mahkemeniz", "arz ve talep ederim".`;

        const promptText = `
## DILEKCE OLUSTURMA TALIMATI

### GIRDILER
**Dilekce Turu:** ${params.petitionType}
**Kullanicinin Rolu:** ${params.userRole}
**Dava Kunyesi:** ${formatCaseDetailsForPrompt(params.caseDetails)}
**Vekil Bilgileri:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
**Taraflar:** ${formatPartiesForPrompt(params.parties)}
**Olay Ozeti:** ${params.analysisSummary || 'Saglanmadi.'}
**Arama Anahtar Kelimeleri:** ${formatSearchKeywordsForPrompt(params.searchKeywords)}
**Hukuki Arastirma:** ${params.webSearchResult || 'Saglanmadi.'}
**Emsal Kararlar:** ${params.legalSearchResult || 'Saglanmadi.'}
**Ek Notlar:** ${params.docContent || 'Saglanmadi.'}
**Ozel Talimatlar:** ${params.specifics || 'Saglanmadi.'}
**Sohbet Gecmisi:** ${formatChatHistoryForPrompt(params.chatHistory)}

## BEKLENEN CIKTI
1. Profesyonel, ikna edici hukuki anlati
2. ACIKLAMALAR, HUKUKI SEBEPLER, DELILLER, SONUC VE ISTEM bolumleri
3. Emsal kararlari ilgili argumana bagla
4. Markdown formatinda yaz
`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text, usage: credit.usage || null });
    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Generate petition API error') });
    }
}
