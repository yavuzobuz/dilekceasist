import { getGeminiClient, GEMINI_API_KEY } from '../../backend/gemini/_shared.js';

const DEFAULT_MODEL = process.env.GEMINI_AGENT_MODEL || 'gemini-2.0-flash';
const MAX_TEXT = 12000;
const MAX_QUERY_LENGTH = 140;
const MAX_QUERY_COUNT = 5;
const MAX_CONCEPTS = 6;

const clampText = (text = '', limit = MAX_TEXT) => {
    const normalized = String(text || '').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.floor(limit * 0.6))}\n\n...[KESILDI]...\n\n${normalized.slice(-Math.floor(limit * 0.3))}`;
};

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\u0131/g, 'i')
        .replace(/\u0130/g, 'i')
        .replace(/\u015f|\u015e/g, 's')
        .replace(/\u011f|\u011e/g, 'g')
        .replace(/\u00fc|\u00dc/g, 'u')
        .replace(/\u00f6|\u00d6/g, 'o')
        .replace(/\u00e7|\u00c7/g, 'c')
        .replace(/\s+/g, ' ')
        .trim();

const dedupeList = (values = [], limit = Infinity) => {
    const seen = new Set();
    const output = [];

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(String(value || '').trim());
        if (output.length >= limit) break;
    }

    return output;
};

const extractTextFromParts = (parts = []) =>
    (Array.isArray(parts) ? parts : [])
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter(Boolean);

const extractResponseText = (response = {}) => {
    const candidateParts = (Array.isArray(response?.candidates) ? response.candidates : [])
        .flatMap((candidate) => extractTextFromParts(candidate?.content?.parts));
    if (candidateParts.length > 0) return candidateParts.join('');

    const contentParts = extractTextFromParts(response?.content?.parts);
    if (contentParts.length > 0) return contentParts.join('');

    if (typeof response?.text === 'string') return response.text;
    if (typeof response?.outputText === 'string') return response.outputText;
    return '';
};

const extractJsonFragment = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return '';

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const unfenced = fencedMatch?.[1]?.trim() || text;
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return unfenced.slice(firstBrace, lastBrace + 1);
    }

    const firstBracket = unfenced.indexOf('[');
    const lastBracket = unfenced.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
        return unfenced.slice(firstBracket, lastBracket + 1);
    }

    return unfenced;
};

const safeJsonParse = (value = '') => {
    const rawValue = String(value || '').trim();
    const candidates = [rawValue, extractJsonFragment(rawValue)]
        .filter(Boolean)
        .filter((candidate, index, list) => list.indexOf(candidate) === index);

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            continue;
        }
    }

    return null;
};

const normalizeConceptList = (values = [], limit = MAX_CONCEPTS) =>
    dedupeList(
        (Array.isArray(values) ? values : [values])
            .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
            .filter((value) => value.length >= 2),
        limit
    );

const normalizeQueries = (values = [], limit = MAX_QUERY_COUNT) =>
    dedupeList(
        (Array.isArray(values) ? values : [values])
            .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
            .filter((value) => value.length >= 3 && value.length <= MAX_QUERY_LENGTH && !value.includes('\n')),
        limit
    );

const callGeminiJson = async ({ systemInstruction = '', userText = '', model = DEFAULT_MODEL } = {}) => {
    if (!String(GEMINI_API_KEY || '').trim()) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.code = 'missing_gemini_api_key';
        throw error;
    }
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
            systemInstruction,
            temperature: 0.2,
        },
    });
    const text = extractResponseText(response);
    const parsed = safeJsonParse(text);
    if (!parsed) {
        const error = new Error('gemini_agent_json_parse_failed');
        error.code = 'agent_json_parse_failed';
        throw error;
    }
    return parsed;
};

export const runAnalyst = async ({ rawText = '' } = {}) => {
    const prompt = [
        'Sen bir hukuk analistisin.',
        'Girdi metninden dava/suç tipini, ilgili kanun/madde ipuçlarını ve doğru daire ailesini çıkar.',
        'Çıktı sadece JSON olacak.',
        'Şema:',
        '{',
        '  "domain": "ceza|icra|aile|gayrimenkul|is_hukuku|ticaret|idare|vergi|borclar|genel_hukuk",',
        '  "birim": "örnek: 10. Ceza Dairesi veya H9 veya boş",',
        '  "requiredConcepts": ["kavram1","kavram2"],',
        '  "negativeConcepts": ["yanlis alan", "yanlis suc"],',
        '  "articles": ["TCK 188", "TBK 315"]',
        '}',
    ].join('\n');
    const content = clampText(rawText);
    const payload = await callGeminiJson({
        systemInstruction: prompt,
        userText: `Metin:\n\n${content}`,
    });
    return {
        domain: String(payload?.domain || '').trim(),
        birim: String(payload?.birim || '').trim(),
        requiredConcepts: normalizeConceptList(payload?.requiredConcepts || []),
        negativeConcepts: normalizeConceptList(payload?.negativeConcepts || []),
        articles: normalizeConceptList(payload?.articles || []),
    };
};

export const runQueryWriter = async ({ analysis = {} } = {}) => {
    const prompt = [
        'Sen bir hukuk arama uzmanı olarak Bedesten için kısa arama ifadeleri üretiyorsun.',
        'Çıktı sadece JSON olacak.',
        'Şema:',
        '{',
        '  "queryMode": "short_issue|statute|fact_pattern",',
        '  "queries": ["ifade1","ifade2","ifade3","ifade4","ifade5"]',
        '}',
        'Kurallar:',
        '- Her ifade kısa olacak.',
        '- 3-5 ifade üret.',
        '- Farklı hukuki açılardan yaklaş.',
        '- Paragraf üretme; ham olay anlatımı verme.',
    ].join('\n');
    const payload = await callGeminiJson({
        systemInstruction: prompt,
        userText: `Analiz:\n${JSON.stringify(analysis)}`,
    });
    return {
        queryMode: String(payload?.queryMode || '').trim(),
        queries: normalizeQueries(payload?.queries || []),
    };
};

export const runJudge = async ({ analysis = {}, decisions = [] } = {}) => {
    const prompt = [
        'Sen hukuk denetçisisin. Gelen kararların uygunluğunu 0-100 arası puanla.',
        'Çıktı sadece JSON olacak.',
        'Şema:',
        '{',
        '  "rankedDecisions": [',
        '     { "documentId": "id", "score": 0, "reason": "kısa gerekçe" }',
        '  ],',
        '  "rejectionReasons": ["kısa neden"]',
        '}',
        'Kurallar:',
        '- Yanlış dava/suç tipine ait kararlar düşük puan alır.',
        '- Analizdeki negativeConcepts varsa cezalandır.',
        '- Referans dışı kararları düşük puanla.',
    ].join('\n');
    const payload = await callGeminiJson({
        systemInstruction: prompt,
        userText: `Analiz:\n${JSON.stringify(analysis)}\n\nKararlar:\n${JSON.stringify(decisions)}`,
    });
    const ranked = Array.isArray(payload?.rankedDecisions) ? payload.rankedDecisions : [];
    return {
        rankedDecisions: ranked
            .map((item) => ({
                documentId: String(item?.documentId || '').trim(),
                score: Number(item?.score || 0),
                reason: String(item?.reason || '').trim(),
            }))
            .filter((item) => item.documentId),
        rejectionReasons: normalizeConceptList(payload?.rejectionReasons || [], 6),
    };
};

export const buildAgentSignalBundle = async ({ rawText = '' } = {}) => {
    const analysis = await runAnalyst({ rawText });
    const queryPlan = await runQueryWriter({ analysis });
    return {
        analysis,
        queryPlan,
    };
};

export const judgeDecisionSet = async ({ analysis = {}, decisions = [] } = {}) =>
    runJudge({ analysis, decisions });
