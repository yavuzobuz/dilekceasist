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
    /\bderin\s*(?:arastir(?:ma)?|ara)\s*(?:yap)?\b/gi,
    /\b(?:bu\s+konu\s+(?:icin|hakkinda|ile\s+ilgili))\b/gi,
    /\b(?:konu\s+hakkinda)\b/gi,
    /\b(?:guncel\s+arama\s+yap)\b/gi,
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

export const stripSearchCommandPhrases = (raw: string): string => {
    let text = normalizeKeywordText(raw);
    for (const pattern of SEARCH_COMMAND_PATTERNS) {
        text = text.replace(pattern, ' ');
    }
    return text.replace(/\s+/g, ' ').trim();
};

export const extractContextFromChatHistory = (messages: ChatMessage[], maxMessages = 6): string => {
    if (!Array.isArray(messages) || messages.length === 0) return '';

    const relevantMessages = messages.slice(Math.max(0, messages.length - maxMessages - 1), -1);
    const contextParts: string[] = [];

    for (const msg of relevantMessages) {
        const text = String(msg?.text || '').trim();
        if (!text || text.length < 10) continue;
        contextParts.push(text.length > 500 ? text.slice(0, 500) : text);
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
