import type { ChatMessage } from '../../types';

const normalizeKeywordText = (value: string): string => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SEARCH_COMMAND_PATTERNS = [
    /\b(?:web|internet(?:ten|te)?|google(?:'?da)?|webde|webden)\s*(?:ara(?:ma(?:si)?|stir(?:ma(?:si)?)?)?|bul|tara|getir|incele|listele)\s*(?:yap(?:ilsin)?|et)?\b/gi,
    /\b(?:ara(?:ma(?:si)?|stir(?:ma(?:si)?)?)?|bul|tara|getir|incele|listele)\s*(?:web|internet(?:ten|te)?|google(?:'?da)?|webde|webden)\b/gi,
    /\b(?:emsal\s*karar|emsal|ictihat|karar)\s*(?:ara(?:ma(?:si)?)?|bul|getir|listele)\s*(?:yap(?:ilsin)?|et)?\b/gi,
    /\bderin\s*(?:arastir(?:ma)?|ara)\s*(?:yap)?\b/gi,
    /\b(?:bu\s+konu\s+(?:icin|hakkinda|ile\s+ilgili))\b/gi,
    /\b(?:bu\s+konuyla\s+ilgili)\b/gi,
    /\b(?:konu\s+hakkinda)\b/gi,
    /\b(?:guncel\s+arama\s+yap)\b/gi,
    /\b(?:guclu\s+emsal\s+kararlar?\s+bul)\b/gi,
    /\b(?:kisa\s+kisa\s+acikla)\b/gi,
    /\b(?:hesaplari\s+dogrula)\b/gi,
    /\b(?:yaparak\s+dogrula)\b/gi,
    /\b(?:dogrula)\b/gi,
];

const COMMAND_ONLY_TOKENS = new Set([
    'web', 'internet', 'internetten', 'webde', 'webden', 'google', 'googleda',
    'ara', 'arama', 'aramasi', 'arastir', 'arastirma', 'bul', 'tara', 'getir',
    'incele', 'listele', 'yap', 'yaparak', 'dogrula', 'kaynak', 'link', 'url',
    'konu', 'hakkinda', 'ilgili', 'guncel', 'derin',
]);

const FALLBACK_STOPWORDS = new Set([
    'bir', 'bu', 'su', 've', 'ile', 'de', 'da', 'olan', 'icin', 'gibi', 'ama',
    'veya', 'ben', 'sen', 'biz', 'siz', 'ne', 'mi', 'mu', 'dir', 'bana', 'beni',
    'lutfen', 'lütfen', 'sadece',
]);

const INTENT_SIGNAL_PATTERN = /\b(?:web|internet|google|ara|arama|arastir|arastirma|bul|tara|getir|incele|listele|emsal|ictihat|karar|yargitay|danistay|dilekce|belge|hazirla|olustur|duzenle|revize|guncelle|ozetle)\b/i;

export const extractLatestIntentSegment = (raw: string): string => {
    const text = String(raw || '').replace(/\r/g, '\n');
    if (!text.trim()) return '';

    const segments = text
        .split(/\n+/)
        .map((part) => part.trim())
        .filter(Boolean);

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (INTENT_SIGNAL_PATTERN.test(segments[index])) {
            return segments[index];
        }
    }

    return segments[segments.length - 1] || '';
};

export const stripSearchCommandPhrases = (raw: string): string => {
    let text = normalizeKeywordText(raw);
    for (const pattern of SEARCH_COMMAND_PATTERNS) {
        text = text.replace(pattern, ' ');
    }
    return text.replace(/\s+/g, ' ').trim();
};

const hasMeaningfulTopicText = (raw: string): boolean => {
    const tokens = normalizeKeywordText(raw)
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !FALLBACK_STOPWORDS.has(word))
        .filter((word) => !COMMAND_ONLY_TOKENS.has(word));

    return tokens.length >= 2;
};

export const resolveSearchTopicFromMessage = (raw: string, messages: ChatMessage[], maxMessages = 6): string => {
    const cleanedMessage = stripSearchCommandPhrases(raw);
    if (cleanedMessage && hasMeaningfulTopicText(cleanedMessage)) return cleanedMessage;
    return extractContextFromChatHistory(messages, maxMessages);
};

export const extractContextFromChatHistory = (messages: ChatMessage[], maxMessages = 6): string => {
    if (!Array.isArray(messages) || messages.length === 0) return '';

    const relevantMessages = messages
        .slice(Math.max(0, messages.length - (maxMessages * 2) - 1), -1)
        .filter((msg) => msg?.role === 'user');
    const contextParts: string[] = [];

    for (const msg of relevantMessages) {
        const text = String(msg?.text || '').trim();
        if (!text || text.length < 10) continue;
        const cleaned = stripSearchCommandPhrases(text);
        const candidate = cleaned || text;
        if (!candidate || candidate.length < 10) continue;
        contextParts.push(candidate.length > 700 ? candidate.slice(0, 700) : candidate);
        if (contextParts.length >= maxMessages) break;
    }

    return contextParts.join('\n').trim();
};

export const buildRetryKeywords = (raw: string, limit = 6): string[] => {
    const cleaned = stripSearchCommandPhrases(raw);
    const source = cleaned || normalizeKeywordText(raw);

    return source
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3)
        .filter((word) => !FALLBACK_STOPWORDS.has(word))
        .filter((word) => !COMMAND_ONLY_TOKENS.has(word))
        .slice(0, limit);
};
