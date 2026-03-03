import { type ChatMessage, type GeneratePetitionParams, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, ChatContext, LawyerInfo, ContactInfo } from '../types';
import { supabase } from '../lib/supabase';

const API_BASE_URL = '/api/gemini';

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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }
    return response.json();
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

function dedupeKeywords(rawKeywords: unknown[]): string[] {
    const seen = new Set<string>();
    const keywords: string[] = [];

    for (const item of rawKeywords) {
        const normalized = String(item || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) continue;
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
        const normalized = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) return;
        candidates.push(normalized);
    };

    const tckMatches = text.match(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    tckMatches.forEach(add);

    if (/uyuşturucu|uyusturucu/i.test(text) && /ticaret|satıc|satic/i.test(text)) {
        add('uyuşturucu ticareti');
        add('uyuşturucu satıcılığı iddiası');
    }

    if (/evine gelen\s*\d+\s*kişi|evine gelen.*kişi/i.test(text)) {
        add('evine gelen kişilerde farklı uyuşturucu ele geçirilmesi');
    }

    if (/kullanım sınırını aşan|kullanim sinirini asan|kullanım sınırı|kullanim siniri/i.test(text)) {
        add('kullanım sınırını aşan miktarda madde');
    }

    const fullNameMatches = text.match(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/g) || [];
    fullNameMatches.forEach(add);

    const phraseChunks = text.split(/[,\n;]+/g).map(chunk => chunk.trim()).filter(chunk => chunk.length >= 6);
    phraseChunks.slice(0, 10).forEach(add);

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
        body: JSON.stringify(payload)
    }));

    const rawResponseText = typeof data?.text === 'string' ? data.text : '';
    const cleanText = cleanJsonString(rawResponseText);

    try {
        const json = safeJsonObjectParse(cleanText);
        if (!json || typeof json !== 'object') {
            throw new Error('Analysis response is not valid JSON.');
        }

        const caseDetails: CaseDetails = {
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
            caseDetails: { court: '', fileNumber: '', decisionNumber: '', decisionDate: '' }
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
    } catch (e) {
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
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: await buildJsonHeaders(),
            body: JSON.stringify({ chatHistory, analysisSummary, context, files })
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

