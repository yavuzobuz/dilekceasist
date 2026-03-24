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
const MAX_LEGAL_RESULTS_IN_BODY = 3;
const MAX_WEB_SOURCES_IN_BODY = 3;

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

function formatListSection(title, values, maxItems = 5) {
    const items = normalizeArray(values)
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .slice(0, maxItems);

    if (items.length === 0) return '';
    return `${title}: ${items.join(' | ')}`;
}

function formatAnalysisInsightsForPrompt(analysisInsights) {
    if (!analysisInsights || typeof analysisInsights !== 'object') {
        return 'Saglanmadi.';
    }

    const sections = [
        normalizeText(analysisInsights.documentType) ? `Belge Tipi: ${normalizeText(analysisInsights.documentType)}` : '',
        normalizeText(analysisInsights.caseStage) ? `Asama: ${normalizeText(analysisInsights.caseStage)}` : '',
        normalizeText(analysisInsights.primaryDomain) ? `Ana Hukuk Alani: ${normalizeText(analysisInsights.primaryDomain)}` : '',
        normalizeText(analysisInsights.caseType) ? `Dava Tipi: ${normalizeText(analysisInsights.caseType)}` : '',
        normalizeText(analysisInsights.coreIssue) ? `Ana Hukuki Mesele: ${normalizeText(analysisInsights.coreIssue)}` : '',
        formatListSection('Temel Olaylar', analysisInsights.keyFacts),
        formatListSection('Kronoloji', analysisInsights.timeline),
        formatListSection('Iddialar', analysisInsights.claims),
        formatListSection('Savunmalar', analysisInsights.defenses),
        formatListSection('Deliller', analysisInsights.evidenceSummary),
        formatListSection('Hukuki Meseleler', analysisInsights.legalIssues),
        formatListSection('Riskler ve Zayif Noktalar', analysisInsights.risksAndWeakPoints),
        formatListSection('Eksik Kritik Bilgiler', analysisInsights.missingCriticalInfo),
        formatListSection('Onerilen Sonraki Adimlar', analysisInsights.suggestedNextSteps),
        formatListSection('Web Arama Ana Sorgulari', analysisInsights.webSearchPlan?.coreQueries),
        formatListSection('Web Odak Konulari', analysisInsights.webSearchPlan?.focusTopics),
        formatListSection('Emsal Karar Zorunlu Kavramlari', analysisInsights.precedentSearchPlan?.requiredConcepts),
        normalizeText(analysisInsights.precedentSearchPlan?.searchSeedText)
            ? `Karar Arama Cekirdegi: ${normalizeText(analysisInsights.precedentSearchPlan?.searchSeedText)}`
            : '',
    ].filter(Boolean);

    return sections.length > 0 ? sections.join('\n') : 'Saglanmadi.';
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
    const structuredResults = normalizeArray(params?.legalSearchResults)
        .map((result) => {
            const title = normalizeText(result?.title);
            const daire = normalizeText(result?.daire);
            const esasNo = normalizeText(result?.esasNo);
            const kararNo = normalizeText(result?.kararNo);
            const tarih = normalizeText(result?.tarih);
            const source = normalizeText(result?.source);
            const summary = compactDecisionText(
                normalizeText(result?.selectionReason)
                || normalizeText(result?.summaryText)
                || normalizeText(result?.ozet)
                || normalizeText(result?.snippet)
            );
            const matchedRequiredConcepts = normalizeArray(result?.matchedRequiredConcepts).map(normalizeText).filter(Boolean);
            const matchedSupportConcepts = normalizeArray(result?.matchedSupportConcepts).map(normalizeText).filter(Boolean);
            const matchedEvidenceConcepts = normalizeArray(result?.matchedEvidenceConcepts).map(normalizeText).filter(Boolean);
            const matchedNegativeConcepts = normalizeArray(result?.matchedNegativeConcepts).map(normalizeText).filter(Boolean);

            if (!title && !summary && !esasNo && !kararNo) {
                return null;
            }

            return {
                title,
                daire,
                esasNo,
                kararNo,
                tarih,
                source,
                summary,
                matchedRequiredConcepts,
                matchedSupportConcepts,
                matchedEvidenceConcepts,
                matchedNegativeConcepts,
            };
        })
        .filter(Boolean)
        .slice(0, MAX_LEGAL_RESULTS_IN_PROMPT);

    if (structuredResults.length > 0) {
        return structuredResults;
    }

    const rawSummary = truncateText(
        normalizeText(params?.legalSearchResult),
        MAX_LEGAL_SUMMARY_SOURCE_CHARS
    );

    if (!rawSummary) {
        return [];
    }

    const compactLines = rawSummary
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .slice(0, MAX_LEGAL_RESULTS_IN_PROMPT);

    return compactLines.map((line) => ({
        title: truncateText(line, 120),
        daire: '',
        esasNo: '',
        kararNo: '',
        tarih: '',
        source: '',
        summary: compactDecisionText(line),
        matchedRequiredConcepts: [],
        matchedSupportConcepts: [],
        matchedEvidenceConcepts: [],
        matchedNegativeConcepts: [],
    }));
}

function buildLegalCitation(result) {
    const lead = normalizeText(result?.daire) || normalizeText(result?.title) || 'Emsal karar';
    const parts = [
        lead,
        normalizeText(result?.esasNo) ? `${normalizeText(result.esasNo)} E.` : '',
        normalizeText(result?.kararNo) ? `${normalizeText(result.kararNo)} K.` : '',
        normalizeText(result?.tarih) ? normalizeText(result.tarih) : '',
        normalizeText(result?.source) ? `Kaynak: ${normalizeText(result.source)}` : '',
    ].filter(Boolean);

    return parts.join(', ');
}

function buildLegalApplicabilityNote(result) {
    const conceptParts = [];
    if (normalizeArray(result?.matchedRequiredConcepts).length > 0) {
        conceptParts.push(`Dogrudan baglandigi kavramlar: ${normalizeArray(result.matchedRequiredConcepts).slice(0, 4).join(', ')}`);
    }
    if (normalizeArray(result?.matchedSupportConcepts).length > 0) {
        conceptParts.push(`Destekledigi alt meseleler: ${normalizeArray(result.matchedSupportConcepts).slice(0, 3).join(', ')}`);
    }
    if (normalizeArray(result?.matchedEvidenceConcepts).length > 0) {
        conceptParts.push(`Ilgili delil ekseni: ${normalizeArray(result.matchedEvidenceConcepts).slice(0, 3).join(', ')}`);
    }

    return conceptParts.join(' | ');
}

function getMinimumRequiredLegalCitationCount(params) {
    const legalResults = collectLegalResults(params);
    if (legalResults.length === 0) return 0;
    return Math.min(2, legalResults.length);
}

function buildMandatoryCitationChecklist(params) {
    const legalResults = collectLegalResults(params).slice(0, MAX_LEGAL_RESULTS_IN_BODY);
    if (legalResults.length === 0) {
        return 'Kullanilabilir emsal karar listesi bulunmuyor.';
    }

    return legalResults
        .map((result, index) => {
            const lines = [
                `${index + 1}. Zorunlu atif formu: (${buildLegalCitation(result)})`,
                result.summary ? `Kararin ozeti: ${result.summary}` : '',
            ];
            const applicability = buildLegalApplicabilityNote(result);
            if (applicability) {
                lines.push(`Somut olay bagi: ${applicability}`);
            }
            return lines.filter(Boolean).join('\n');
        })
        .join('\n\n');
}

function formatLegalResultsForPrompt(params) {
    const legalResults = collectLegalResults(params);
    if (legalResults.length === 0) {
        return 'Saglanmadi.';
    }

    return legalResults
        .map((result, index) => {
            const reference = [
                result.daire || result.title,
                result.esasNo ? `E. ${result.esasNo}` : '',
                result.kararNo ? `K. ${result.kararNo}` : '',
                result.tarih ? `T. ${result.tarih}` : '',
                result.source ? `Kaynak: ${result.source}` : '',
            ].filter(Boolean).join(' | ');

            const conceptLines = [];
            if (result.matchedRequiredConcepts.length > 0) {
                conceptLines.push(`Zorunlu kavramlar: ${result.matchedRequiredConcepts.slice(0, 5).join(', ')}`);
            }
            if (result.matchedSupportConcepts.length > 0) {
                conceptLines.push(`Destek kavramlari: ${result.matchedSupportConcepts.slice(0, 4).join(', ')}`);
            }
            if (result.matchedEvidenceConcepts.length > 0) {
                conceptLines.push(`Delil kavramlari: ${result.matchedEvidenceConcepts.slice(0, 4).join(', ')}`);
            }
            if (result.matchedNegativeConcepts.length > 0) {
                conceptLines.push(`Dislanacak/ikincil kavramlar: ${result.matchedNegativeConcepts.slice(0, 4).join(', ')}`);
            }

            return [
                `[Karar ${index + 1}] Mahkeme/Daire: ${reference || result.title || 'Belirtilmemis'}`,
                `Ozet: ${result.summary || 'Ozet saglanmadi.'}`,
                ...conceptLines,
            ].filter(Boolean).join('\n');
        })
        .join('\n\n');
}

async function summarizeLegalResults(_ai, params) {
    return params;
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

function splitPetitionSections(text) {
    const marker = '## DESTEKLEYICI ARASTIRMA';
    const rawText = String(text || '').trim();
    const index = rawText.indexOf(marker);

    if (index === -1) {
        return {
            mainBody: rawText,
            appendix: '',
        };
    }

    return {
        mainBody: rawText.slice(0, index).trim(),
        appendix: rawText.slice(index).trim(),
    };
}

function countReferencedLegalResults(text, legalResults) {
    return legalResults.reduce((count, result) => {
        const tokens = buildLegalReferenceTokens([result]);
        return count + (tokens.length > 0 && textIncludesAnyToken(text, tokens) ? 1 : 0);
    }, 0);
}

function buildEvidenceAppendix(params) {
    const webEvidence = formatWebEvidenceForPrompt(params);
    const legalEvidence = formatLegalResultsForPrompt(params);

    return [
        '## DESTEKLEYICI ARASTIRMA',
        '### Web Arastirmasi',
        webEvidence,
        '',
        '### Emsal Kararlar',
        legalEvidence,
    ].join('\n');
}

function buildIntegratedResearchSection(params) {
    const legalResults = collectLegalResults(params).slice(0, MAX_LEGAL_RESULTS_IN_BODY);
    const webSources = collectWebSources(params).slice(0, MAX_WEB_SOURCES_IN_BODY);
    const webSummary = truncateText(normalizeText(params?.webSearchResult), 900);
    const sections = [];

    if (legalResults.length > 0) {
        sections.push([
            '## EMSAL KARARLARIN SOMUT OLAYA UYGULANMASI',
            ...legalResults.map((result, index) => {
                const lines = [
                    `${index + 1}. ${buildLegalCitation(result)}`,
                    result.summary || 'Kararin somut olayla iliskili ozeti saglanmadi.',
                ];
                const applicability = buildLegalApplicabilityNote(result);
                if (applicability) {
                    lines.push(`Somut olaya etkisi: ${applicability}`);
                }
                lines.push('Bu emsal karar, somut olaydaki hukuki nitelendirme ve talep sonucunu destekleyen gerekce olarak kullanilmalidir.');
                return lines.join('\n');
            }),
        ].join('\n\n'));
    }

    if (webSummary || webSources.length > 0) {
        sections.push([
            '## HARICI HUKUKI ARASTIRMANIN DEGERLENDIRILMESI',
            webSummary || 'Web arastirmasi ozeti saglanmadi.',
            webSources.length > 0
                ? `Kaynaklar: ${webSources.map((source) => source.title || source.uri).join(' | ')}`
                : 'Kaynak listesi saglanmadi.',
            'Bu arastirma ciktisi, hukuki tartismayi guncel kaynak ve ikincil aciklamalarla desteklemek icin kullanilmalidir.',
        ].join('\n\n'));
    }

    return sections.join('\n\n').trim();
}

function mergeIntegratedResearchIntoPetition(text, params) {
    const integratedSection = buildIntegratedResearchSection(params).trim();
    const { mainBody } = splitPetitionSections(text);
    const parts = [
        mainBody,
        integratedSection,
    ].filter(Boolean);

    return parts.join('\n\n').trim();
}

function petitionUsesResearchEvidence(text, params) {
    const webSources = collectWebSources(params);
    const legalResults = collectLegalResults(params);
    const { mainBody, appendix } = splitPetitionSections(text);
    const normalizedText = normalizeComparableText(text);
    const normalizedMainBody = normalizeComparableText(mainBody);
    const hasEvidenceSection = normalizedText.includes('destekleyici arastirma');
    const usesWebEvidence = webSources.length === 0 || textIncludesAnyToken(text, buildWebReferenceTokens(webSources));
    const minimumRequiredLegalCitations = getMinimumRequiredLegalCitationCount(params);
    const referencedLegalResultCount = countReferencedLegalResults(mainBody, legalResults);
    const usesLegalEvidenceInBody =
        legalResults.length === 0 || referencedLegalResultCount >= minimumRequiredLegalCitations;
    const hasIntegratedPrecedentSection =
        normalizedMainBody.includes('emsal kararlarin somut olaya uygulanmasi')
        || normalizedMainBody.includes('hukuki degerlendirme')
        || normalizedMainBody.includes('emsal');

    return {
        hasEvidenceSection: false,
        usesWebEvidence: true,
        usesLegalEvidence: usesLegalEvidenceInBody,
        usesLegalEvidenceInBody,
        referencedLegalResultCount,
        minimumRequiredLegalCitations,
        hasIntegratedPrecedentSection,
        appendixPresent: false,
        satisfied: usesLegalEvidenceInBody && hasIntegratedPrecedentSection,
    };
}

function hasWebEvidence(params) {
    const summary = normalizeText(params?.webSearchResult);
    const sourceCount = Math.max(Number(params?.webSourceCount || 0), collectWebSources(params).length);
    return summary.length >= 40 && sourceCount > 0;
}

function hasLegalEvidence() {
    return true;
}

const ANALYSIS_SUMMARY_HELP_TEXT = [
    'Analiz ozeti, yuklediginiz belgelerden cikarilan olay ozetidir.',
    'Ornek belgeler: tapu kayitlari, veraset ilami, sozlesmeler, tutanaklar ve mahkeme evraklari.',
].join(' ');

const DOCUMENT_REQUIREMENTS_HELP_TEXT = [
    `${ANALYSIS_SUMMARY_HELP_TEXT}`,
    'Belge olusturma icin su 2 adim zorunludur: 1) Belgeleri yukleyip analiz et, 2) Web arastirmasi yap.',
].join(' ');

const DOCUMENT_UPLOADED_BUT_ANALYSIS_MISSING_TEXT = 'Belge yuklenmis gorunuyor ancak analiz ozeti henuz olusmamis. Once "Belgeleri Analiz Et" adimini tamamla.';

function buildGenerationPrompt(params) {
    const legalEvidence = formatLegalResultsForPrompt(params);
    const detailedAnalysis = formatAnalysisInsightsForPrompt(params.analysisInsights);
    const mandatoryCitationChecklist = buildMandatoryCitationChecklist(params);
    const minimumRequiredLegalCitations = getMinimumRequiredLegalCitationCount(params);

    return `
## DILEKCE OLUSTURMA TALIMATI

### GIRDILER
**Dilekce Turu:** ${params.petitionType}
**Kullanicinin Rolu:** ${params.userRole}
**Dava Kunyesi:** ${formatCaseDetailsForPrompt(params.caseDetails)}
**Vekil Bilgileri:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
**Taraflar:** ${formatPartiesForPrompt(params.parties)}
**Olay Ozeti:** ${params.analysisSummary || 'Saglanmadi.'}
**Detayli Hukuki Analiz:**
${detailedAnalysis}
**Arama Anahtar Kelimeleri:** ${formatSearchKeywordsForPrompt(params.searchKeywords)}
**Hukuki Arastirma ve Kaynaklar:**
${formatWebEvidenceForPrompt(params)}
**Emsal Kararlar ve Hukuki Dayanaklar:**
${legalEvidence}
**Zorunlu Emsal Atif Kontrol Listesi:**
${mandatoryCitationChecklist}

**Ek Notlar:** ${params.docContent || 'Saglanmadi.'}
**Ozel Talimatlar:** ${params.specifics || 'Saglanmadi.'}
**Sohbet Gecmisi:** ${formatChatHistoryForPrompt(params.chatHistory)}

## ZORUNLU KULLANIM KURALI
- Yukaridaki web arastirmasi baglayici girdi kabul edilecektir.
- Yukaridaki emsal kararlar ve hukuki dayanaklar metin icinde somut sekilde kullanilacaktir.
- Yukaridaki detayli hukuki analiz; iddialar, savunmalar, deliller ve zayif noktalar icin ana iskelet kabul edilecektir.
- Dilekce icinde, ilgili argumanlari desteklerken emsal karar referanslarini belirt ve her atiftan hemen sonra bu kararın somut olaya neden uydugunu acikla.
- Emsal kararlar sadece en sonda liste olarak birakilmayacak; ana govdede hukuki degerlendirme icine yerlestirilecektir.
- Aciklamalar bolumundeki numarali maddelerde, hangi vakia hangi emsal karar veya web arastirmasi ile destekleniyorsa o kaynak ayni madde altinda kullanilacaktir.
- Web arastirmasi ve emsal kararlar, ilgili dilekce maddesiyle eslestirilmeden ayri bir ozet gibi birakilmayacaktir.
- Mumkunse ilk ${minimumRequiredLegalCitations} emsal karar, ana govdede dogrudan atifla kullanilacaktir.
- Atif formu parantez icinde ve tam olacak: (Daire/kurul, Esas No E., Karar No K., Tarih).
- Saglanmayan kaynagi uydurma.

## BEKLENEN CIKTI
1. Profesyonel, ikna edici, detayli ve gerekceli hukuki anlati
2. En az su bolumleri kur: GIRIS, ACIKLAMALAR, HUKUKI DEGERLENDIRME VE EMSAL UYGULAMASI, DELILLER, SONUC VE ISTEM
3. Aciklamalar bolumunu kronolojik ve numarali maddeler halinde yaz
4. Hukuki degerlendirme bolumunde her ana iddiayi: vakia + delil + norm + emsal karar + somut olaya uyarlama seklinde kur
5. Karsi tarafin muhtemel savunmalarina veya dosyanin zayif noktalarina cevap ver
6. Web arastirmasini ve emsal karar aramasini ilgili argumanlara bagla
7. Markdown formatinda yaz, dilekce sonuna kesinlikle link listesi, web kaynaklari veya karar listesi EKLEME. Kaynaklari yalnizca dilekce metni icerisinde atif yaparak erit.
`;
}

function buildRepairPrompt(params, draftText) {
    const minimumRequiredLegalCitations = getMinimumRequiredLegalCitationCount(params);
    return `
Asagidaki dilekce taslagi, saglanan web arastirmasini ve emsal kararlarini yeterince kullanmadigi icin revize edilecektir.

## DETAYLI HUKUKI ANALIZ
${formatAnalysisInsightsForPrompt(params.analysisInsights)}

## KULLANILMASI ZORUNLU ARASTIRMA
${buildEvidenceAppendix(params)}

## REVIZE EDILECEK TASLAK
${draftText}

## REVIZYON KURALLARI
- Mevcut taslagi bastan sona yeniden yaz.
- Olay orgusunu degistirme, ancak hukuki gerekceyi arastirma ile guclendir.
- Ana govdede ayri bir \`HUKUKI DEGERLENDIRME VE EMSAL UYGULAMASI\` bolumu kur.
- En az ${minimumRequiredLegalCitations} emsal karara govde metninde dogrudan atif yap.
- Her emsal atifindan hemen sonra kararın somut olaya uygulanma nedenini yaz.
- Arastirma verilerini, ilgili numarali aciklama maddesi veya ilgili talep altinda somut vakia ile birlikte kullan.
- Emsal kararlar sadece listenmesin; taleple, vakiyayla ve delille baglansin.
- Metnin sonuna veya herhangi bir yerine "Destekleyici Arastirma", "Web Kaynaklari", "Yargitay Kararlari" gibi referans listeleri veya raw linkler KESINLIKLE EKLEME.
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

        const credit = await consumeGenerationCredit(req, 'generate_petition');
        if (!credit.allowed) {
            return res.status(credit.status || 429).json(credit.payload || {
                error: 'Belge uretim kotasi kontrolu basarisiz.',
                code: 'CREDIT_CHECK_FAILED',
            });
        }

        const effectiveParams = await summarizeLegalResults(ai, params);

        const systemInstruction = `Sen, Turk hukuk sisteminde 20+ yil deneyime sahip, ust duzey bir hukuk danismani ve dava dilekcesi yazim uzmansin.

## SENIN GOREVIN
Saglanan ham verileri, profesyonel, detayli, gerekceli ve dava stratejisi kuran bir hukuki anlatia donusturmek.

## KRITIK YAZIM KURALLARI
- Aciklamalar bolumunu numarali maddelerle kur.
- Resmi hitap kullan: "Sayin Mahkemeniz", "arz ve talep ederim".
- Genel ve bos kalip ifadelerden kac; her iddiayi somut olay, delil ve hukuki norm ile bagla.
- Saglanan web arastirmasi ve emsal kararlar kullanilmadan taslak tamamlama.
- Emsal kararlari govde metninde dogrudan atifla kullan; sadece sonda listeleme.
- Her emsal atifindan sonra, bu kararın somut olaya neden uygulanabilir oldugunu acikla.
- Talep sonucunu destekleyen norm, delil ve emsal bagini acik kur.`;

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
            finalText = mergeIntegratedResearchIntoPetition(finalText, effectiveParams);
            evidenceCheck = petitionUsesResearchEvidence(finalText, effectiveParams);
        }

        res.json({ text: finalText, usage: credit.usage || null });
    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Generate petition API error') });
    }
}

export const __testables = {
    collectLegalResults,
    buildLegalCitation,
    buildMandatoryCitationChecklist,
    formatLegalResultsForPrompt,
    formatAnalysisInsightsForPrompt,
    buildGenerationPrompt,
    buildRepairPrompt,
    buildIntegratedResearchSection,
    mergeIntegratedResearchIntoPetition,
    petitionUsesResearchEvidence,
};

