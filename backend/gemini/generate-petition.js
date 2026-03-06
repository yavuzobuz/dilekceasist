import { consumeGenerationCredit } from '../../lib/api/generationQuota.js';
import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import {
    GEMINI_FLASH_PREVIEW_MODEL_NAME,
    GEMINI_LEGAL_SUMMARIZER_MODEL_NAME,
    GEMINI_MODEL_NAME,
    getGeminiClient,
} from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;
const LEGAL_SUMMARIZER_MODEL_NAME = GEMINI_LEGAL_SUMMARIZER_MODEL_NAME;
const LEGAL_SUMMARIZER_PREVIEW_MODEL_NAME = GEMINI_FLASH_PREVIEW_MODEL_NAME;

const MAX_WEB_SOURCES_IN_PROMPT = 8;
const MAX_LEGAL_RESULTS_IN_PROMPT = 8;
const MAX_LEGAL_SUMMARY_SOURCE_CHARS = 4000;
const MAX_LEGAL_SUMMARY_OUTPUT_CHARS = 360;

function formatCaseDetailsForPrompt(caseDetails) {
    if (!caseDetails) return 'Dava kunyesi saglanmadi.';
    return `Dava Basligi/Konu: ${caseDetails.caseTitle || '-'}, Mahkeme: ${caseDetails.court || '-'}, Dosya No: ${caseDetails.fileNumber || '-'}, Karar No: ${caseDetails.decisionNumber || '-'}, Karar Tarihi: ${caseDetails.decisionDate || '-'}`;
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

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function cleanJsonLikeText(value) {
    return String(value || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}

function safeJsonParse(value) {
    const cleaned = cleanJsonLikeText(value);
    if (!cleaned) return null;

    try {
        return JSON.parse(cleaned);
    } catch {
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch {
                return null;
            }
        }
    }

    return null;
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./:-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateText(value, maxLength) {
    const text = normalizeText(value);
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactDecisionText(value) {
    const text = normalizeText(value).replace(/\s+/g, ' ');
    if (!text) return '';

    const sentenceMatches = text.match(/[^.!?]+[.!?]?/g) || [];
    const compact = sentenceMatches.slice(0, 2).join(' ').trim() || text;
    return truncateText(compact, MAX_LEGAL_SUMMARY_OUTPUT_CHARS);
}

function collectWebSources(params) {
    return normalizeArray(params?.webSources)
        .map((source) => ({
            title: normalizeText(source?.title),
            uri: normalizeText(source?.uri),
        }))
        .filter((source) => source.title || source.uri)
        .slice(0, MAX_WEB_SOURCES_IN_PROMPT);
}

function formatWebEvidenceForPrompt(params) {
    const summary = normalizeText(params?.webSearchResult);
    const sources = collectWebSources(params);
    const sourceLines = sources.length > 0
        ? sources.map((source, index) => `${index + 1}. ${source.title || source.uri}${source.uri ? ` | ${source.uri}` : ''}`).join('\n')
        : 'Kaynak listesi saglanmadi.';

    return [
        'WEB ARASTIRMASI OZETI:',
        summary || 'Saglanmadi.',
        '',
        'WEB KAYNAKLARI:',
        sourceLines,
    ].join('\n');
}

function collectLegalResults(params) {
    return normalizeArray(params?.legalSearchResults)
        .map((result) => ({
            title: normalizeText(result?.title),
            daire: normalizeText(result?.daire),
            esasNo: normalizeText(result?.esasNo),
            kararNo: normalizeText(result?.kararNo),
            tarih: normalizeText(result?.tarih),
            ozet: normalizeText(result?.ozet || result?.snippet),
            supportReason: normalizeText(result?.supportReason),
            source: normalizeText(result?.source),
            sourceUrl: normalizeText(result?.sourceUrl || result?.documentUrl),
            documentId: normalizeText(result?.documentId),
        }))
        .filter((result) => result.title || result.ozet || result.documentId)
        .slice(0, MAX_LEGAL_RESULTS_IN_PROMPT);
}

function formatLegalResultsForPrompt(params) {
    const results = collectLegalResults(params);
    if (results.length === 0) {
        const fallbackText = normalizeText(params?.legalSearchResult);
        return fallbackText || 'Saglanmadi.';
    }

    return results.map((result, index) => {
        const referenceParts = [
            result.daire ? `Daire: ${result.daire}` : '',
            result.esasNo ? `E. ${result.esasNo}` : '',
            result.kararNo ? `K. ${result.kararNo}` : '',
            result.tarih ? `T. ${result.tarih}` : '',
            result.documentId ? `Belge ID: ${result.documentId}` : '',
            result.source ? `Kaynak: ${result.source}` : '',
            result.sourceUrl ? `URL: ${result.sourceUrl}` : '',
        ].filter(Boolean).join(' | ');

        return [
            `${index + 1}. ${result.title || 'Emsal karar'}`,
            referenceParts || 'Kunye bilgisi sinirli.',
            result.ozet ? `Ozet: ${result.ozet}` : '',
            result.supportReason ? `Dilekceye Katkisi: ${result.supportReason}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n');
}

async function summarizeLegalResults(ai, params) {
    const rawResults = collectLegalResults(params);
    if (rawResults.length === 0) return params;

    const summarizationPayload = rawResults.map((result, index) => ({
        index: index + 1,
        title: result.title,
        daire: result.daire,
        esasNo: result.esasNo,
        kararNo: result.kararNo,
        tarih: result.tarih,
        documentId: result.documentId,
        source: result.source,
        sourceUrl: result.sourceUrl,
        text: truncateText(result.ozet, MAX_LEGAL_SUMMARY_SOURCE_CHARS),
    }));

    const summarizationPrompt = `
Asagidaki Turk hukuku emsal kararlarini dilekce icin kisa ve kullanisli hale getir.

Kurallar:
- Her karar icin tam olarak 1-2 cumlelik "summary" yaz.
- Her karar icin tek cumlelik "supportReason" yaz.
- Sadece verilen metni kullan, yeni bilgi uydurma.
- Ozet ve destek cumlesi kisa, net ve dilekce diline uygun olsun.
- JSON array disinda hicbir sey yazma.

Beklenen format:
[{"index":1,"summary":"...","supportReason":"..."}]

Kararlar:
${JSON.stringify(summarizationPayload, null, 2)}
`;

    let summarizedItems = null;

    for (const modelName of [LEGAL_SUMMARIZER_MODEL_NAME, LEGAL_SUMMARIZER_PREVIEW_MODEL_NAME]) {
        if (!modelName) continue;
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: summarizationPrompt,
            });

            const parsed = safeJsonParse(response.text);
            if (Array.isArray(parsed) && parsed.length > 0) {
                summarizedItems = parsed;
                break;
            }
        } catch (error) {
            console.error(`Legal decision summarization failed for model ${modelName}:`, error);
        }
    }

    const summaryMap = new Map();
    if (Array.isArray(summarizedItems)) {
        for (const item of summarizedItems) {
            const index = Number(item?.index);
            if (!Number.isInteger(index) || index < 1) continue;
            summaryMap.set(index, {
                summary: compactDecisionText(item?.summary),
                supportReason: compactDecisionText(item?.supportReason),
            });
        }
    }

    const summarizedResults = rawResults.map((result, index) => {
        const summarized = summaryMap.get(index + 1);
        const fallbackSummary = compactDecisionText(result.ozet);
        const fallbackSupportReason = compactDecisionText(
            `${result.title || 'Bu karar'} ${result.daire ? `${result.daire} kararina gore` : 'kararina gore'} benzer hukuki noktada destek saglayabilir.`
        );

        return {
            ...result,
            ozet: summarized?.summary || fallbackSummary,
            supportReason: summarized?.supportReason || fallbackSupportReason,
        };
    });

    return {
        ...params,
        legalSearchResults: summarizedResults,
        legalSearchResult: formatLegalResultsForPrompt({
            ...params,
            legalSearchResults: summarizedResults,
        }),
    };
}

function buildWebReferenceTokens(webSources) {
    const tokens = [];

    for (const source of webSources) {
        if (source.title) tokens.push(source.title);
        if (source.uri) {
            tokens.push(source.uri);
            try {
                const hostname = new URL(source.uri).hostname.replace(/^www\./i, '');
                if (hostname) tokens.push(hostname);
            } catch {
                // Ignore invalid URLs and keep raw URI token only.
            }
        }
    }

    return Array.from(new Set(tokens.map(normalizeComparableText).filter((token) => token.length >= 6)));
}

function buildLegalReferenceTokens(legalResults) {
    const tokens = [];

    for (const result of legalResults) {
        if (result.title) tokens.push(result.title);
        if (result.daire && result.title) tokens.push(`${result.daire} ${result.title}`);
        if (result.daire) tokens.push(result.daire);
        if (result.esasNo) tokens.push(`E. ${result.esasNo}`);
        if (result.kararNo) tokens.push(`K. ${result.kararNo}`);
        if (result.esasNo && result.kararNo) tokens.push(`E. ${result.esasNo} K. ${result.kararNo}`);
        if (result.documentId) tokens.push(result.documentId);
    }

    return Array.from(new Set(tokens.map(normalizeComparableText).filter((token) => token.length >= 4)));
}

function textIncludesAnyToken(text, tokens) {
    const normalizedText = normalizeComparableText(text);
    return tokens.some((token) => token && normalizedText.includes(token));
}

function buildEvidenceAppendix(params) {
    const webEvidence = formatWebEvidenceForPrompt(params);
    const legalEvidence = formatLegalResultsForPrompt(params);

    return [
        '## DESTEKLEYICI ARASTIRMA VE EMSAL KARARLAR',
        '### Web Arastirmasi',
        webEvidence,
        '',
        '### Emsal Kararlar',
        legalEvidence,
    ].join('\n');
}

function petitionUsesResearchEvidence(text, params) {
    const webSources = collectWebSources(params);
    const legalResults = collectLegalResults(params);
    const normalizedText = normalizeComparableText(text);
    const hasEvidenceSection = normalizedText.includes('destekleyici arastirma ve emsal kararlar');
    const usesWebEvidence = webSources.length === 0 || textIncludesAnyToken(text, buildWebReferenceTokens(webSources));
    const usesLegalEvidence = legalResults.length === 0 || textIncludesAnyToken(text, buildLegalReferenceTokens(legalResults));

    return {
        hasEvidenceSection,
        usesWebEvidence,
        usesLegalEvidence,
        satisfied: hasEvidenceSection && usesWebEvidence && usesLegalEvidence,
    };
}

function hasWebEvidence(params) {
    const summary = normalizeText(params?.webSearchResult);
    const sourceCount = Math.max(Number(params?.webSourceCount || 0), collectWebSources(params).length);
    return summary.length >= 40 && sourceCount > 0;
}

function hasLegalEvidence(params) {
    const legalText = normalizeText(params?.legalSearchResult);
    const legalResults = collectLegalResults(params);
    const legalCount = Math.max(Number(params?.legalResultCount || 0), legalResults.length);
    const hasCitationToken = /(?:E\.\s*\S+|K\.\s*\S+|esas|karar|yargitay|danistay)/i.test(legalText);
    const structuredSignal = legalResults.some((result) => result.title && (result.esasNo || result.kararNo || result.daire || result.documentId));
    return ((legalText.length >= 40 && hasCitationToken) || structuredSignal) && legalCount > 0;
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

function buildGenerationPrompt(params) {
    return `
## DILEKCE OLUSTURMA TALIMATI

### GIRDILER
**Dilekce Turu:** ${params.petitionType}
**Kullanicinin Rolu:** ${params.userRole}
**Dava Kunyesi:** ${formatCaseDetailsForPrompt(params.caseDetails)}
**Vekil Bilgileri:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
**Taraflar:** ${formatPartiesForPrompt(params.parties)}
**Olay Ozeti:** ${params.analysisSummary || 'Saglanmadi.'}
**Arama Anahtar Kelimeleri:** ${formatSearchKeywordsForPrompt(params.searchKeywords)}
**Hukuki Arastirma ve Kaynaklar:**
${formatWebEvidenceForPrompt(params)}

**Emsal Kararlar ve Kunyeleri:**
${formatLegalResultsForPrompt(params)}

**Ek Notlar:** ${params.docContent || 'Saglanmadi.'}
**Ozel Talimatlar:** ${params.specifics || 'Saglanmadi.'}
**Sohbet Gecmisi:** ${formatChatHistoryForPrompt(params.chatHistory)}

## ZORUNLU KULLANIM KURALI
- Yukaridaki web arastirmasi ve emsal kararlar baglayici girdi kabul edilecektir.
- Bu arastirma ve emsal kararlar kullanilmadan dilekce tamamlama.
- Saglanmayan kaynagi veya emsal karari uydurma.
- ACIKLAMALAR ve HUKUKI SEBEPLER bolumlerinde arastirma ve emsal kararlari ilgili iddiaya bagla.
- Metnin sonunda aynen \`## DESTEKLEYICI ARASTIRMA VE EMSAL KARARLAR\` basligini ac.
- Bu baslik altinda:
  1. Web arastirmasinda kullanilan kaynaklari basliklariyla yaz.
  2. Emsal kararlari daire, E/K no, tarih veya belge ID bilgisiyle yaz.
  3. Yalnizca saglanan kaynak ve emsal karar bilgilerini kullan.

## BEKLENEN CIKTI
1. Profesyonel, ikna edici hukuki anlati
2. ACIKLAMALAR, HUKUKI SEBEPLER, DELILLER, SONUC VE ISTEM bolumleri
3. Web arastirmasi ile emsal kararlari ilgili argumana bagla
4. Markdown formatinda yaz
`;
}

function buildRepairPrompt(params, draftText) {
    return `
Asagidaki dilekce taslagi, saglanan web arastirmasi ve emsal kararlari yeterince kullanmadigi icin revize edilecektir.

## KULLANILMASI ZORUNLU ARASTIRMA VE EMSAL KARARLAR
${buildEvidenceAppendix(params)}

## REVIZE EDILECEK TASLAK
${draftText}

## REVIZYON KURALLARI
- Mevcut taslagi bastan sona yeniden yaz.
- Olay orgusunu degistirme, ancak hukuki gerekceyi arastirma ve emsal kararlarla guclendir.
- Metnin sonunda aynen \`## DESTEKLEYICI ARASTIRMA VE EMSAL KARARLAR\` basligini koru.
- Web kaynaklarini basliklariyla, emsal kararlari daire ve E/K/tarih veya belge ID bilgileriyle yaz.
- Saglanmayan kaynak, karar veya vakia uydurma.
`;
}

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

        const effectiveParams = await summarizeLegalResults(ai, params);

        const systemInstruction = `Sen, Turk hukuk sisteminde 20+ yil deneyime sahip, ust duzey bir hukuk danismani ve dilekce yazim uzmansin.

## SENIN GOREVIN
Saglanan ham verileri, profesyonel ve ikna edici bir hukuki anlatia donusturmek.

## KRITIK YAZIM KURALLARI
- Aciklamalar bolumunu numarali maddelerle kur.
- Emsal karar atiflarini ilgili argumanla birlikte metne entegre et.
 - Resmi hitap kullan: "Sayin Mahkemeniz", "arz ve talep ederim".
 - Saglanan web arastirmasi ve emsal kararlar kullanilmadan taslak tamamlama.
 - Metnin sonunda "DESTEKLEYICI ARASTIRMA VE EMSAL KARARLAR" basligini mutlaka ekle.`;

        const promptText = buildGenerationPrompt(effectiveParams);

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: { systemInstruction },
        });

        let finalText = response.text || '';
        let evidenceCheck = petitionUsesResearchEvidence(finalText, effectiveParams);

        if (!evidenceCheck.satisfied) {
            const repairResponse = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: buildRepairPrompt(effectiveParams, finalText),
                config: { systemInstruction },
            });

            if (repairResponse.text) {
                finalText = repairResponse.text;
                evidenceCheck = petitionUsesResearchEvidence(finalText, effectiveParams);
            }
        }

        if (!evidenceCheck.satisfied) {
            finalText = `${finalText.trim()}\n\n${buildEvidenceAppendix(effectiveParams)}`.trim();
        }

        res.json({ text: finalText, usage: credit.usage || null });
    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Generate petition API error') });
    }
}
