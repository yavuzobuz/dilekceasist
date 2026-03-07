import { type ChatMessage, type GeneratePetitionParams, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, ChatContext, LawyerInfo, ContactInfo } from '../types';
import { supabase } from '../lib/supabase';

const API_BASE_URL = '/api/gemini';
const MAX_CHAT_API_BODY_BYTES = 15 * 1024 * 1024;
const MAX_ANALYZE_API_BODY_BYTES = 40 * 1024 * 1024;

async function buildJsonHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
        }
    } catch (error) {
        console.error('Could not load auth session for API headers:', error);
    }
    return headers;
}

// Helper to handle API response errors
async function handleResponse(response: Response) {
    if (!response.ok) {
        const rawError = await response.text();
        const fallbackMessage = `API Error (${response.status}): ${response.statusText}`;

        if (response.status === 413) {
            throw new Error('Istek boyutu limiti asildi. Daha kucuk dosya/metin ile tekrar deneyin.');
        }

        if (rawError) {
            try {
                const parsed = JSON.parse(rawError);
                throw new Error(parsed?.error || parsed?.details || fallbackMessage);
            } catch {
                throw new Error(rawError || fallbackMessage);
            }
        }

        throw new Error(fallbackMessage);
    }
    return response.json();
}

function stringifyPayloadWithLimit(payload: unknown, contextLabel: string, maxBytes = MAX_CHAT_API_BODY_BYTES): string {
    const body = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(body).length;

    if (bytes > maxBytes) {
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        throw new Error(`${contextLabel} icin gonderilen veri cok buyuk (${mb} MB). Lutfen dosyalari/parcalari kucultun.`);
    }

    return body;
}

// Helper to clean JSON string from Markdown code blocks
function cleanJsonString(text: string): string {
    // Remove ```json and ``` or just ```
    let cleanText = text.replace(/```json\s*|\s*```/g, '');
    // Also remove generic code blocks if json tag wasn't used
    cleanText = cleanText.replace(/```/g, '');
    return cleanText.trim();
}

function safeJsonObjectParse(text: string): any | null {
    if (!text || typeof text !== 'string') return null;

    try {
        return JSON.parse(text);
    } catch {
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (!objectMatch) return null;
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            return null;
        }
    }
}

const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const PERSON_NAME_REGEX = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2}$/;
const ADDRESS_HINT_REGEX = /\b(mahallesi|mah|sokak|sok|cadde|cad|bulvar|bulvari|apartman|apt|bina|daire|blok|kapi|no)\b/i;
const BARE_MADDE_REGEX = /^\d{1,3}\.?\s*maddesi?$/i;
const LAW_REFERENCE_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|vuk|kmk|anayasa|imar kanunu|is kanunu)\b/i;

function isNoisyKeyword(value: string): boolean {
    const normalized = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return true;

    if (DATE_ONLY_REGEX.test(normalized)) return true;
    if (DIGITS_ONLY_REGEX.test(normalized)) return true;
    if (ADDRESS_HINT_REGEX.test(normalized)) return true;
    if (PERSON_NAME_REGEX.test(normalized)) return true;
    if (BARE_MADDE_REGEX.test(normalized) && !LAW_REFERENCE_REGEX.test(normalized)) return true;

    return false;
}

function dedupeKeywords(rawKeywords: unknown[]): string[] {
    const seen = new Set<string>();
    const keywords: string[] = [];

    for (const item of rawKeywords) {
        const normalized = String(item || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) continue;
        if (isNoisyKeyword(normalized)) continue;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        keywords.push(normalized);
        if (keywords.length >= 12) break;
    }

    return keywords;
}

function extractKeywordFallbackFromAnalysis(analysisText: string): string[] {
    const text = String(analysisText || '');
    if (!text.trim()) return [];

    const candidates: string[] = [];
    const add = (value: string) => {
        const normalized = String(value || '').replace(/[""\"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) return;
        candidates.push(normalized);
    };

    // Legal code references (broad)
    const codeRefs = text.match(/(?:TCK|CMK|HMK|TMK|TBK|İİK|IIK|TTK|BK|AİHM|AIHM|İYUK|IYUK|SGK)\s*(?:m\.?\s*)?\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    codeRefs.forEach(add);

    // "madde" references
    const maddeRefs = text.match(/\d+\.?\s*madde(?:si)?/gi) || [];
    maddeRefs.forEach(add);

    // Esas/Karar number references
    const esasKarar = text.match(/(?:E(?:sas)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+|K(?:arar)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+)/gi) || [];
    esasKarar.forEach(add);

    // Ceza hukuku
    if (/uyuşturucu|uyusturucu/i.test(text) && /ticaret|satıc|satic|satış|satis/i.test(text)) {
        add('uyuşturucu ticareti'); add('uyuşturucu satıcılığı iddiası');
    }
    if (/kullanım sınırını aşan|kullanim sinirini asan|kullanım sınırı|kullanim siniri/i.test(text)) {
        add('kullanım sınırını aşan miktarda madde');
    }
    if (/hırsızlık|hirsizlik/i.test(text)) add('hırsızlık suçu');
    if (/dolandırıcılık|dolandiricilik/i.test(text)) add('dolandırıcılık suçu');
    if (/tehdit|şantaj|santaj/i.test(text)) add('tehdit suçu');
    if (/yaralama|müessir fiil/i.test(text)) add('kasten yaralama');
    if (/öldürme|adam öldürme|cinayet/i.test(text)) add('kasten öldürme');
    if (/cinsel|tecavüz|taciz/i.test(text)) add('cinsel suçlar');
    if (/zimmet|rüşvet|irtikap/i.test(text)) add('zimmet suçu');
    if (/sahtecilik|sahte belge/i.test(text)) add('resmi belgede sahtecilik');
    if (/hakaret|onur|şeref/i.test(text)) add('hakaret suçu');
    if (/yağma|gasp/i.test(text)) add('yağma suçu');
    if (/tutuklama|tutuklan|tutuklu/i.test(text)) add('tutukluluk');
    if (/beraat|berâat/i.test(text)) add('beraat kararı');
    if (/mahkumiyet|mahkûmiyet/i.test(text)) add('ceza indirimi');

    // İş hukuku
    if (/kıdem tazminatı|kidem tazminati/i.test(text)) add('kıdem tazminatı');
    if (/ihbar tazminatı|ihbar tazminati/i.test(text)) add('ihbar tazminatı');
    if (/işe iade|ise iade/i.test(text)) add('işe iade davası');
    if (/haksız fesih|haksiz fesih/i.test(text)) add('haksız fesih');
    if (/fazla mesai|fazla çalışma|mesai ücreti/i.test(text)) add('fazla mesai ücreti');
    if (/mobbing|iş yeri baskısı/i.test(text)) add('mobbing');
    if (/iş kazası|is kazasi/i.test(text)) add('iş kazası tazminat');

    // Aile hukuku
    if (/boşanma|bosanma/i.test(text)) add('boşanma davası');
    if (/nafaka/i.test(text)) add('nafaka');
    if (/velayet/i.test(text)) add('velayet davası');
    if (/mal paylaşımı|mal paylaşimi|mal rejimi/i.test(text)) add('mal paylaşımı davası');

    // Miras hukuku
    if (/miras|veraset|tereke/i.test(text)) add('miras hukuku');
    if (/vasiyetname|vasiyet/i.test(text)) add('vasiyetname');
    if (/tenkis/i.test(text)) add('tenkis davası');

    // Borçlar hukuku
    if (/alacak/i.test(text) && /dava|borç|borc/i.test(text)) add('alacak davası');
    if (/tazminat/i.test(text) && /zarar|talep|dava/i.test(text)) add('tazminat davası');
    if (/kira|kiracı|tahliye/i.test(text)) add('kira hukuku');

    // İdare hukuku
    if (/idari işlem|idari islem|iptal davası/i.test(text)) add('idari işlemin iptali');
    if (/disiplin cezası|disiplin cezasi/i.test(text)) add('disiplin cezası iptali');
    if (/kamulaştırma|kamulastirma/i.test(text)) add('kamulaştırma');

    // Tüketici hukuku
    if (/tüketici|tuketici|ayıplı mal|ayipli mal/i.test(text)) add('tüketici hakları');

    // İcra iflas
    if (/icra|haciz/i.test(text)) add('icra hukuku');
    if (/itirazın iptali|itirazin iptali/i.test(text)) add('itirazın iptali');

    // Gayrimenkul
    if (/tapu/i.test(text) && /iptal|tescil/i.test(text)) add('tapu iptal ve tescil');
    if (/ecrimisil/i.test(text)) add('ecrimisil davası');
    if (/kat mülkiyeti|kat mulkiyeti/i.test(text)) add('kat mülkiyeti');

    // Ticaret hukuku
    if (/çek|senet|bono|kambiyo/i.test(text)) add('kambiyo senetleri');
    if (/iflas|konkordato/i.test(text)) add('iflas hukuku');

    return dedupeKeywords(candidates);
}

export async function analyzeDocuments(
    uploadedFiles: UploadedFile[],
    udfTextContent: string,
    wordTextContent: string
): Promise<AnalysisData> {
    if (uploadedFiles.length === 0 && !udfTextContent && !wordTextContent) {
        throw new Error("Analiz edilecek hicbir belge veya metin icerigi saglanmadi.");
    }

    const payload = {
        uploadedFiles,
        udfTextContent,
        wordTextContent
    };

    const data = await handleResponse(await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: stringifyPayloadWithLimit(payload, 'Analiz', MAX_ANALYZE_API_BODY_BYTES)
    }));

    const rawResponseText = typeof data?.text === 'string' ? data.text : '';
    const cleanText = cleanJsonString(rawResponseText);

    try {
        const json = safeJsonObjectParse(cleanText);
        if (!json || typeof json !== 'object') {
            throw new Error('Analysis response is not valid JSON.');
        }

        const caseDetails: CaseDetails = {
            caseTitle: json.caseDetails?.caseTitle || json.caseDetails?.subject || '',
            court: json.caseDetails?.court || '',
            fileNumber: json.caseDetails?.fileNumber || '',
            decisionNumber: json.caseDetails?.decisionNumber || '',
            decisionDate: json.caseDetails?.decisionDate || '',
        };

        const lawyerInfo: LawyerInfo | undefined = json.lawyerInfo ? {
            name: json.lawyerInfo.name || '',
            address: json.lawyerInfo.address || '',
            phone: json.lawyerInfo.phone || '',
            email: json.lawyerInfo.email || '',
            barNumber: json.lawyerInfo.barNumber || '',
            bar: json.lawyerInfo.bar || '',
            title: json.lawyerInfo.title || 'Avukat',
            tcNo: json.lawyerInfo.tcNo,
        } : undefined;

        const contactInfo: ContactInfo[] | undefined = json.contactInfo?.map((contact: any) => ({
            name: contact.name || '',
            address: contact.address || '',
            phone: contact.phone || '',
            email: contact.email || '',
            tcNo: contact.tcNo,
        }));

        return {
            summary: json.summary || '',
            potentialParties: Array.from(new Set(json.potentialParties || [])) as string[],
            caseDetails,
            lawyerInfo,
            contactInfo
        };
    } catch (e) {
        console.error("Failed to parse analysis JSON from backend:", e);
        const fallbackSummary = cleanText || rawResponseText;
        return {
            summary: fallbackSummary || "Sunucudan gelen analiz sonucu islenemedi.",
            potentialParties: [],
            caseDetails: { caseTitle: '', court: '', fileNumber: '', decisionNumber: '', decisionDate: '' }
        };
    }
}

export async function generateSearchKeywords(analysisText: string, userRole: UserRole): Promise<string[]> {
    const data = await handleResponse(await fetch(`${API_BASE_URL}/keywords`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: JSON.stringify({ analysisText, userRole })
    }));

    try {
        if (Array.isArray(data?.keywords) && data.keywords.length > 0) {
            return dedupeKeywords(data.keywords);
        }

        const cleanText = cleanJsonString(String(data?.text || ''));
        const json = JSON.parse(cleanText);
        if (Array.isArray(json?.keywords) && json.keywords.length > 0) {
            return dedupeKeywords(json.keywords);
        }
    } catch {
        return extractKeywordFallbackFromAnalysis(analysisText);
    }

    return extractKeywordFallbackFromAnalysis(analysisText);
}

export async function performWebSearch(keywords: string[]): Promise<WebSearchResult> {
    const data = await handleResponse(await fetch(`${API_BASE_URL}/web-search`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: JSON.stringify({ keywords })
    }));

    return {
        summary: data.text,
        sources: data.groundingMetadata?.groundingChunks?.map((c: any) => ({
            uri: c.web?.uri,
            title: c.web?.title
        })) || []
    };
}

export async function generatePetition(
    params: GeneratePetitionParams
): Promise<string> {
    const data = await handleResponse(await fetch(`${API_BASE_URL}/generate-petition`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: JSON.stringify(params)
    }));

    return data.text;
}

export async function* streamChatResponse(
    chatHistory: ChatMessage[],
    analysisSummary: string,
    context: ChatContext,
    files?: { name: string; mimeType: string; data: string }[]
): AsyncGenerator<any> { // Using 'any' for the chunk type as we don't import specific SDK types
    try {
        const compactChatHistory = Array.isArray(chatHistory)
            ? chatHistory.map(({ files: _files, ...message }) => message)
            : [];
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: await buildJsonHeaders(),
            body: stringifyPayloadWithLimit({ chatHistory: compactChatHistory, analysisSummary, context, files }, 'Sohbet')
        });

        if (!response.ok) {
            const rawError = await response.text();
            let message = `Chat API failed (HTTP ${response.status})`;

            if (rawError) {
                try {
                    const parsed = JSON.parse(rawError);
                    if (parsed?.error) {
                        message = `Chat API failed (HTTP ${response.status}): ${parsed.error}`;
                    }
                } catch {
                    message = `Chat API failed (HTTP ${response.status}): ${rawError}`;
                }
            }

            throw new Error(message);
        }
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const chunk = JSON.parse(line);
                        yield chunk;
                    } catch (e) {
                        console.error('Error parsing chat stream chunk:', e);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Stream Error:', e);
        throw e;
    }
}

export async function rewriteText(textToRewrite: string): Promise<string> {
    const data = await handleResponse(await fetch(`${API_BASE_URL}/rewrite`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: JSON.stringify({ textToRewrite })
    }));
    return data.text;
}

export async function reviewPetition(
    params: GeneratePetitionParams & { currentPetition: string }
): Promise<string> {
    const data = await handleResponse(await fetch(`${API_BASE_URL}/review`, {
        method: 'POST',
        headers: await buildJsonHeaders(),
        body: JSON.stringify(params)
    }));
    return data.text;
}
