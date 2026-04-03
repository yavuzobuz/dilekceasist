export const normalizeKeywordText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LEGAL_INTENT_PATTERNS = [
    /emsal\s*(ara|bul|getir)/i,
    /ictihat\s*(ara|bul)/i,
    /derin\s*arastir/i,
    /karar\s*(ara|bul)/i,
    /yargitay.*karar/i,
];

export const detectLegalSearchIntent = (rawMessage = '') => {
    const normalized = normalizeKeywordText(rawMessage);
    if (!normalized) return false;
    return LEGAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const hasSearchOptOutIntent = (rawMessage = '') => {
    const norm = normalizeKeywordText(rawMessage);
    if (!norm) return false;
    return /(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet).*(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin)|\b(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin).*(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet)\b/i.test(norm);
};

export const isExplicitWebSearchRequest = (raw = '') => {
    const norm = normalizeKeywordText(raw);
    if (!norm || hasSearchOptOutIntent(norm)) return false;
    const hasWebTerm = /(web|internet|google|internetten|webde|webden)/i.test(norm);
    const hasSearchVerb = /(ara|bul|tara|getir|incele|listele|arastir)/i.test(norm);
    return hasWebTerm && hasSearchVerb;
};

export const isLikelyPetitionRequest = (rawMessage = '') =>
    /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep|sozlesme|sözleşme)/i.test(rawMessage)
    && /(olustur|olutur|hazirla|hazırla|yaz)/i.test(rawMessage);

export const resolveWordAssistantIntent = ({ mode = 'edit', message = '' } = {}) => {
    const normalizedMode = String(mode || 'edit').trim().toLowerCase();
    const explicitWeb = isExplicitWebSearchRequest(message);
    const explicitLegal = detectLegalSearchIntent(message);
    const petitionLike = isLikelyPetitionRequest(message);

    if (normalizedMode === 'web_search') {
        return { appliedIntent: 'web_search', allowWebSearch: true, allowLegalSearch: false };
    }
    if (normalizedMode === 'precedent_search') {
        return { appliedIntent: 'precedent_search', allowWebSearch: false, allowLegalSearch: true };
    }
    if (normalizedMode === 'research_and_answer') {
        return { appliedIntent: 'research_and_answer', allowWebSearch: true, allowLegalSearch: true };
    }
    if (normalizedMode === 'edit') {
        return { appliedIntent: 'edit', allowWebSearch: false, allowLegalSearch: false };
    }

    const allowWebSearch = petitionLike ? true : explicitWeb;
    const allowLegalSearch = petitionLike ? true : explicitLegal;
    return {
        appliedIntent: petitionLike
            ? 'research_and_answer'
            : (allowWebSearch || allowLegalSearch ? 'brainstorm_research' : 'brainstorm'),
        allowWebSearch,
        allowLegalSearch,
    };
};
