import { getGeminiClient, GEMINI_FLASH_PREVIEW_MODEL_NAME } from '../backend/gemini/_shared.js';
import { searchLegalDecisionsViaPlaywright } from '../lib/legal/playwrightMevzuatSearch.js';

const KEYWORD_MODEL =
    process.env.GEMINI_KEYWORD_MODEL
    || process.env.VITE_GEMINI_KEYWORD_MODEL
    || GEMINI_FLASH_PREVIEW_MODEL_NAME;

const MAX_INPUT_CHARS = 12000;

const normalizeText = (value = '') =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

const dedupeList = (values = [], limit = Infinity) => {
    const seen = new Set();
    const output = [];
    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
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
    return unfenced;
};

const safeJsonParse = (value = '') => {
    const rawValue = String(value || '').trim();
    const candidates = [rawValue, extractJsonFragment(rawValue)].filter(Boolean);
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            continue;
        }
    }
    return null;
};

const buildKeywordPrompt = () => [
    'Sen bir hukuk araştırma asistanısın.',
    'Aşağıdaki metinden karar aramada kullanılacak 5 kısa anahtar kelime çıkar.',
    'Çıktı sadece JSON olacak.',
    'Şema: { "keywords": ["kısa anahtar 1", "kısa anahtar 2"] }',
    'Kurallar:',
    '- Sadece kısa anahtar kelimeler (en fazla 4-5 kelime).',
    '- Olay anlatımını veya uzun cümleleri tekrar etme.',
    '- Hukuki çekirdeği ve delil tiplerini yakala.',
].join('\n');

const extractKeywords = async (text = '') => {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model: KEYWORD_MODEL,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
            systemInstruction: buildKeywordPrompt(),
            temperature: 0.2,
        },
    });
    const raw = extractResponseText(response);
    const parsed = safeJsonParse(raw);
    const keywords = dedupeList(parsed?.keywords || [], 5);
    return keywords.slice(0, 5);
};

const rawText = process.argv.slice(2).join(' ').trim();
if (!rawText) {
    console.error('Usage: node scripts/karakazi-live.mjs "<long text>"');
    process.exit(1);
}

const clipped = rawText.slice(0, MAX_INPUT_CHARS);
const keywords = await extractKeywords(clipped);
const query = keywords.join(' ');
const searchPayload = await searchLegalDecisionsViaPlaywright({
    query,
    headless: true,
    browser: 'firefox',
    keepOpen: String(process.env.KARAKAZI_KEEP_OPEN || '0').trim() === '1',
    debug: String(process.env.KARAKAZI_DEBUG || '0').trim() === '1',
    limit: 10,
});

console.log(JSON.stringify({
    keywords,
    query,
    results: searchPayload.results || [],
    diagnostics: searchPayload.diagnostics || {},
}, null, 2));
