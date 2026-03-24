import { Type } from '@google/genai';
import { GEMINI_FLASH_PREVIEW_MODEL_NAME, getGeminiClient } from './_shared.js';
import {
    collectFewShotExampleIds,
    renderFewShotExamples,
    selectFewShotExamples,
} from './legal-search-plan-fewshot.js';
import {
    dedupeByMatchKey,
    getDomainProfile,
    normalizeDisplayText,
    normalizeDomainId,
    normalizeMatchText,
    toAsciiSearchText,
} from '../../lib/legal/legalDomainProfiles.js';

const MODEL_NAME =
    process.env.GEMINI_LEGAL_SEARCH_MODEL_NAME ||
    process.env.VITE_GEMINI_LEGAL_SEARCH_MODEL_NAME ||
    GEMINI_FLASH_PREVIEW_MODEL_NAME;

const DEFAULT_DOMAIN_PROFILE_ID = 'genel_hukuk';
const DOMAIN_LABELS = {
    is_hukuku: 'Is Hukuku',
    ceza: 'Ceza',
    idare: 'Idare',
    icra: 'Icra ve Alacak Hukuku',
    vergi: 'Vergi',
    anayasa: 'Anayasa',
    aile: 'Aile Hukuku',
    ticaret: 'Ticaret Hukuku',
    genel_hukuk: 'Genel Hukuk',
};
const PRIMARY_SOURCE_BY_DOMAIN = {
    is_hukuku: 'yargitay',
    ceza: 'yargitay',
    idare: 'danistay',
    icra: 'yargitay',
    vergi: 'danistay',
    anayasa: 'anayasa',
    aile: 'yargitay',
    ticaret: 'yargitay',
    genel_hukuk: 'yargitay',
};
const getSourceForDomain = (domain = '') => {
    if (PRIMARY_SOURCE_BY_DOMAIN[domain]) return PRIMARY_SOURCE_BY_DOMAIN[domain];
    const normalized = normalizeMatchText(domain);
    if (/(idare|idari|vergi)/.test(normalized)) return 'danistay';
    if (/(anayasa)/.test(normalized)) return 'anayasa';
    return 'yargitay';
};

const TERMINOLOGY_GLOSSARY = [
    'mal kacirma / mal kacirdi -> muvazaali devir',
    'bozuk araba / arizali arac / sifir km bozuldu -> ayipli mal',
    'isten atildi / kovuldu -> haksiz fesih veya gecersiz fesih',
    'Alzheimer hastasiyken vasiyetname -> fiil ehliyetsizligi + vasiyetnamenin iptali',
    'esim mal kacirdi -> katilma alacagi + muvazaali devir',
    'kira cok artti / odeyemiyorum -> asiri ifa guclugu (emprevizyon) + kira uyarlama',
    'sigorta odemedi / kasko reddi -> hasar tazminati + munhasiran illiyet',
    'veri calindi / bilgi sizdirildi -> kisisel verileri hukuka aykiri ele gecirme',
    'tehdit etti / santaj yapti -> santaj + ozel hayatin gizliligini ihlal',
    'memur isten atildi -> devlet memurlugundan cikarma + disiplin cezasi iptali',
    'cek kayboldu / cek calindi -> cek ziyai + kiymetli evrak iptali',
    'miras paylasimi -> terekenin taksimi + mirasin paylastirilmasi',
    'mirasi reddetti -> mirasin reddi',
    'sakli payima dokunuldu -> tenkis davasi',
    'garanti suresi / urun bozuldu -> ayipli mal + sozlesmeden donme',
    'aldatma / sadakatsizlik -> evlilik birliginin sarsilmasi + bosanma',
    'nafaka az / nafaka artirim -> nafaka artirimi davasi',
    'ev sahibi cikarmak istiyor -> tahliye davasi + kiracinin tahliyesi',
    'borc odenmedi -> alacak davasi + borcun ifasi',
    'trafik kazasi tazminat -> haksiz fiilden tazminat + destekten yoksun kalma',
    'dolandiricilik / dolandirildi -> nitelikli dolandiricilik + hileli davranis',
    'hakaret etti -> kamu gorevlisine hakaret veya hakaret sucu',
    'uyusturucu yakalandi -> uyusturucu madde ticareti veya kullanmak icin bulundurma',
    'hirsizlik -> hirsizlik sucu + nitelikli hirsizlik',
    'imar cezasi / kacak yapi -> imar para cezasi + ruhsatsiz yapi + yikim karari',
    'ruhsat iptal edildi -> ruhsat iptali + idari islemin iptali',
    'vergi cezasi kesildi -> vergi ziyai + tarhiyat',
    'is kazasi -> is kazasi tazminati + kusur tespiti + isveren sorumlulugu',
    'tasinmaz satisi -> tapu iptali ve tescil',
    'kefil oldum -> kefilin sorumlulugu + adi kefalet + muteselsil kefalet',
];

const buildTerminologyGlossaryBlock = () => [
    'ZORUNLU TERMINOLOJI CEVIRISI SOZLUGU:',
    'Asagidaki gundelik ifadeler retrievalConcepts, searchQuery ve coreIssue alanlarina ASLA ham haliyle yazilmaz.',
    'Bu ifadeleri gordugunde karsiliktaki resmi hukuk terimine MUTLAKA cevir:',
    ...TERMINOLOGY_GLOSSARY.map((entry) => `  - ${entry}`),
    'Bu liste ornektir; listede olmayan gundelik ifadeleri de ayni mantikla resmi hukuk terminine cevir.',
    'Kural: Eger retrievalConcepts veya searchQuery icinde gundelik/halk agzi ifade varsa plan HATALIDIR.',
].join('\n');

const QUERY_MODE_VALUES = new Set(['short_issue', 'long_fact', 'document_style', 'case_file']);
const MAX_RETRIEVAL_CONCEPTS = 6;
const CEZA_LONG_FACT_MAX_RETRIEVAL_CONCEPTS = 3;
const MAX_SUPPORT_CONCEPTS = 5;
const MAX_EVIDENCE_CONCEPTS = 6;
const MAX_NEGATIVE_CONCEPTS = 5;
const MAX_SEARCH_CLAUSES = 5;
const MAX_TARGET_SOURCES = 2;
const CASE_FILE_MIN_CHARS = 140;
const CASE_FILE_MIN_WORDS = 18;
const LONG_LEGAL_QUERY_MIN_CHARS = 80;
const LONG_LEGAL_QUERY_MIN_WORDS = 8;
const ALLOWED_SOURCES = new Set(['all', 'yargitay', 'danistay', 'uyap', 'anayasa']);
const ALLOWED_TARGET_SOURCES = new Set(['yargitay', 'danistay', 'uyap', 'anayasa']);
const VALID_BIRIM_CODES = new Set([
    ...Array.from({ length: 23 }, (_, index) => `C${index + 1}`),
    ...Array.from({ length: 23 }, (_, index) => `H${index + 1}`),
    ...Array.from({ length: 17 }, (_, index) => `D${index + 1}`),
    'CGK',
    'HGK',
    'VDDK',
    'IDDK',
]);
const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const SEARCH_STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'ama', 'fakat', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'su',
    'daha', 'kadar', 'sonra', 'once', 'tum', 'her', 'dosyada', 'halinde', 'gereken',
    'nedeniyle', 'sebebiyle', 'dolayi', 'uzerinde', 'sonrasinda', 'dosya', 'kapsaminda',
]);
const LOWER_COURT_HINTS = ['emsal', 'bam', 'bolge adliye', 'ilk derece', 'yerel mahkeme', 'istinaf'];
const DOCUMENT_STYLE_STRONG_HINTS = /(sayin (mahkeme|ilgili merci)|arz ve talep|arz ederim|talep olunur|dilekce|iddianame|sorusturma evraki|isbu|sozlesme metni)/;
const DOCUMENT_STYLE_SOFT_HINTS = /(hukuki dayanak|huzurdaki|muhatap|istem sonucu|sonuc ve talep|ekli belgeler)/;
const CONCEPT_NOISE_WORDS = /\b(davasi|dava|talebi|karari|karar|sucu|uyusmazligi|kosullari|nedeniyle|hali|halinde|istemi|dayali)\b/gi;
const GENERIC_CONCEPT_KEYS = new Set([
    'alacak',
    'tazminat',
    'sozlesme',
    'delil',
    'takip',
    'borclu',
    'alacakli',
    'iade',
    'sartlar',
    'sartlari',
    'kosullar',
    'kosullari',
    'uyusmazlik',
    'uyusmazligi',
]);
const EVIDENCE_SIGNAL_REGEX = /\b(rapor|tutanak|kamera|goruntu|mesaj|whatsapp|hts|log|imei|adres|tarih|miktar|bedel|fatura|irsaliye|dekont|hesap hareket|paket|paketlen|paketleme|paketlenmis|terazi|marka|uygulama|app|ekran|foto|bilirki|adli tip|tanik|beyan|kayit|kayitlar|kayitlari|defter|kagit|sarma|folyo|satis materyali|satis materyalleri|puantaj|bordro|bordrosu|bordrolar|giris cikis)\b/i;
const EVIDENCE_CORE_HINT_REGEX = /(hukuka aykiri delil|delilin hukuka uygunlugu|delil degeri|delilin degerlendirilmesi|arama islemi usulsuzlugu|usulsuz arama|elkoyma|el koyma|yasak delil)/i;
const LONG_FACT_HINTS = /(olay|vakia|ayrintili|beyanlar|evrak|kayitlar|birlikte degerlendir|surec|kapsaminda)/;
const PURE_STATUTE_CONCEPT_REGEX = /^(?:(?:\d+\s+sayili\s+)?[a-z0-9./-]+\s+)*(?:kanun|kanunu|madde|tck|cmk|hmk|tbk|iik|mk|vk)(?:\s+[0-9./-]+)?$/i;
const TRANSIENT_GENERATION_ERROR_REGEX = /(fetch failed|503|unavailable|high demand|timed out|timeout|temporar)/i;
const STRUCTURED_JSON_RETRY_DELAYS_MS = [350, 900];
const SOURCE_MISMATCH_WARNING_REASON = 'source_target_domain_mismatch';

const normalizeSource = (value = '', fallback = 'all') => {
    const normalized = normalizeMatchText(value);
    return ALLOWED_SOURCES.has(normalized) ? normalized : fallback;
};

const normalizeTargetSources = (values = [], fallback = []) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeSource(value, '');
        if (!normalized || normalized === 'all' || !ALLOWED_TARGET_SOURCES.has(normalized) || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        unique.push(normalized);
        if (unique.length >= MAX_TARGET_SOURCES) break;
    }

    if (unique.length > 0) return unique;
    return dedupeByMatchKey(fallback || [], MAX_TARGET_SOURCES).filter((item) => ALLOWED_TARGET_SOURCES.has(item));
};

const normalizeQueryMode = (value = '', fallback = 'short_issue') => {
    const normalized = normalizeMatchText(value).replace(/\s+/g, '_');
    return QUERY_MODE_VALUES.has(normalized) ? normalized : fallback;
};

const normalizeBirimCode = (value = '') => {
    const normalized = normalizeDisplayText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return VALID_BIRIM_CODES.has(normalized) ? normalized : '';
};

const normalizeBirimCodes = (values = []) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeBirimCode(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
    }

    return unique;
};

const getDefaultOptionalBirimCodes = (primaryDomain = '') => {
    const normalizedDomain = normalizePrimaryDomain(primaryDomain, '');
    if (!normalizedDomain || normalizedDomain === 'ceza') return [];
    return normalizeBirimCodes(getDomainProfile(normalizedDomain)?.preferredBirimCodes || []);
};

const safeJsonParse = (raw = '') => {
    const text = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    if (!text) return null;

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
};

const compactConceptPhrase = (value = '') =>
    normalizeDisplayText(value)
        .replace(CONCEPT_NOISE_WORDS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 5)
        .join(' ')
        .trim();

const NATURAL_LANGUAGE_QUERY_HINT_REGEX = /\b(tartisilmaktadir|halinde|nedeniyle|olup|olmadigi|uygulanip|uygulanmayacagi|verilebilir|gerektigi|denetimi|iddiasi|iliskin|kararinin|kosullari|sartlari|degerlendirilmesi)\b/i;

const isLikelyNaturalLanguageQuery = (value = '') => {
    const normalized = normalizeDisplayText(value);
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (/[?.:;!]/.test(normalized)) return true;
    if (wordCount >= 12) return true;
    if (wordCount >= 6 && NATURAL_LANGUAGE_QUERY_HINT_REGEX.test(normalized)) return true;
    return false;
};

const isLikelyKeywordQuery = (value = '') => {
    const normalized = normalizeDisplayText(value);
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return wordCount <= 8 && !isLikelyNaturalLanguageQuery(normalized);
};

const compactSearchConcept = (value = '', maxWords = 3) => {
    const compacted = compactConceptPhrase(value);
    if (!compacted) return '';

    return compacted
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, Math.max(1, maxWords))
        .join(' ')
        .trim();
};

const buildKeywordSearchPhrase = ({
    concepts = [],
    fallback = '',
    maxWords = 7,
    maxConcepts = 3,
    maxWordsPerConcept = 3,
    separator = ' ',
} = {}) => {
    const parts = [];
    const seen = new Set();
    let totalWords = 0;

    for (const concept of Array.isArray(concepts) ? concepts : []) {
        if (parts.length >= maxConcepts || totalWords >= maxWords) break;

        const compacted = compactSearchConcept(concept, maxWordsPerConcept);
        const key = normalizeMatchText(compacted);
        if (!compacted || !key || seen.has(key)) continue;

        const tokens = compacted.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) continue;

        const remainingWords = maxWords - totalWords;
        const acceptedTokens = tokens.slice(0, Math.max(1, remainingWords));
        const accepted = acceptedTokens.join(' ').trim();
        const acceptedKey = normalizeMatchText(accepted);
        if (!accepted || !acceptedKey || seen.has(acceptedKey)) continue;

        parts.push(accepted);
        seen.add(acceptedKey);
        totalWords += acceptedTokens.length;
    }

    if (parts.length > 0) {
        return normalizeDisplayText(parts.join(separator)).trim();
    }

    return compactSearchConcept(fallback, maxWords).slice(0, 120).trim();
};

const isNoisyConcept = (value = '') => {
    const normalized = normalizeDisplayText(value);
    const normalizedKey = normalizeMatchText(normalized);
    if (!normalized || normalized.length < 3) return true;
    if (DATE_ONLY_REGEX.test(normalized)) return true;
    if (DIGITS_ONLY_REGEX.test(normalized)) return true;
    if (GENERIC_CONCEPT_KEYS.has(normalizedKey)) return true;
    return false;
};

const normalizeConceptList = (values = [], limit = MAX_RETRIEVAL_CONCEPTS) => {
    const cleaned = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : []) {
        const compacted = compactConceptPhrase(value);
        const key = normalizeMatchText(compacted);
        if (!compacted || !key || isNoisyConcept(compacted) || seen.has(key)) continue;
        seen.add(key);
        cleaned.push(compacted);
        if (cleaned.length >= limit) break;
    }

    return cleaned;
};

const normalizeWarningBucket = (value = '') => normalizeDisplayText(value || '').trim() || 'unknown';

const appendValidationWarning = (warnings = [], {
    term = '',
    from = 'unknown',
    to = 'unknown',
    reason = 'validation',
    attempt = 1,
} = {}) => {
    const normalizedTerm = normalizeDisplayText(term);
    if (!normalizedTerm) return warnings;

    const entry = {
        term: normalizedTerm,
        from: normalizeWarningBucket(from),
        to: normalizeWarningBucket(to),
        reason: normalizeDisplayText(reason).replace(/\s+/g, '_') || 'validation',
        attempt: Number(attempt) || 1,
    };
    const key = [entry.term, entry.from, entry.to, entry.reason, entry.attempt].join('|');
    if ((Array.isArray(warnings) ? warnings : []).some((item) =>
        [item?.term, item?.from, item?.to, item?.reason, Number(item?.attempt) || 1].join('|') === key
    )) {
        return warnings;
    }

    warnings.push(entry);
    return warnings;
};

const pushUniqueConcept = (target = [], value = '', { limit = Number.POSITIVE_INFINITY } = {}) => {
    const normalized = normalizeDisplayText(value);
    const key = normalizeMatchText(normalized);
    if (!normalized || !key || isNoisyConcept(normalized)) return false;
    if ((Array.isArray(target) ? target : []).some((item) => normalizeMatchText(item) === key)) return false;
    if ((Array.isArray(target) ? target : []).length >= limit) return false;
    target.push(normalized);
    return true;
};

const buildRetryForbiddenTerms = (validationWarnings = []) => {
    const unique = [];
    const seen = new Set();

    for (const warning of Array.isArray(validationWarnings) ? validationWarnings : []) {
        const term = normalizeDisplayText(warning?.term);
        const to = normalizeWarningBucket(warning?.to || '');
        const reason = normalizeDisplayText(warning?.reason).replace(/\s+/g, '_') || 'validation';
        const from = normalizeWarningBucket(warning?.from || '');
        if (!term || (from !== 'retrievalConcepts' && from !== 'supportConcepts' && from !== 'coreIssue' && from !== 'rawText')) {
            continue;
        }

        const key = [term, to, reason].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({ term, to, reason });
    }

    return unique;
};

const buildRetryConstraintInstruction = (retryForbiddenTerms = []) => {
    const forbidden = Array.isArray(retryForbiddenTerms) ? retryForbiddenTerms : [];
    if (forbidden.length === 0) return '';

    return [
        'Ilk denemede validation sorunu alindi.',
        'Asagidaki kavramlari retrievalConcepts alanina koyma:',
        ...forbidden.map((item) => {
            const destination = normalizeWarningBucket(item?.to || '');
            const reason = normalizeDisplayText(item?.reason).replace(/\s+/g, '_') || 'validation';
            return destination && destination !== 'unknown'
                ? normalizeDisplayText(item?.term) + ' (' + reason + ') -> ' + destination
                : normalizeDisplayText(item?.term) + ' (' + reason + ')';
        }),
    ].join('\n');
};

const extendInstructionWithRetryConstraints = (instruction = '', retryForbiddenTerms = []) =>
    [instruction, buildRetryConstraintInstruction(retryForbiddenTerms)].filter(Boolean).join('\n');

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientGenerationError = (error) => {
    const message = [
        error?.message,
        error?.statusText,
        typeof error === 'string' ? error : '',
        (() => {
            try {
                return JSON.stringify(error);
            } catch {
                return '';
            }
        })(),
    ].filter(Boolean).join(' ');

    return TRANSIENT_GENERATION_ERROR_REGEX.test(message);
};

const normalizeRiskTags = (values = []) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeMatchText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
    }

    return unique;
};

const mergeRiskTags = (...riskLists) => normalizeRiskTags(riskLists.flat());

const normalizeReaderList = (values = [], limit = 6) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeDisplayText(value).slice(0, 140).trim();
        const key = normalizeMatchText(normalized);
        if (!normalized || !key || seen.has(key)) continue;
        seen.add(key);
        unique.push(normalized);
        if (unique.length >= limit) break;
    }

    return unique;
};

const normalizeLowerCourtMentionMode = (value = '') => {
    const normalized = normalizeMatchText(value).replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').trim();
    if (!normalized) return 'none';
    if (normalized.includes('explicit')) return 'explicit_request';
    if (normalized.includes('history')) return 'history_only';
    return 'none';
};

const normalizeReaderProfile = ({ rawText = '', parsed = {} } = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText);
    const cleanedCandidate = normalizeDisplayText(parsed?.cleanedText || parsed?.focusText || parsed?.distilledText || '');
    const cleanedText = cleanedCandidate.length >= 24 ? cleanedCandidate : normalizedRawText;
    const coreIssueHint = normalizeDisplayText(parsed?.coreIssueHint || parsed?.coreIssue || '').slice(0, 220).trim();
    const retrievalHints = normalizeConceptList(parsed?.retrievalHints || parsed?.retrievalConcepts || [], MAX_RETRIEVAL_CONCEPTS);
    const evidenceHints = normalizeConceptList(parsed?.evidenceHints || parsed?.evidenceConcepts || [], MAX_EVIDENCE_CONCEPTS);
    const primaryDomainHint = normalizePrimaryDomain(parsed?.primaryDomainHint || parsed?.primaryDomain || inferPrimaryDomainFromText(cleanedText));
    const queryModeHint = normalizeQueryMode(parsed?.queryModeHint || parsed?.queryMode || classifyQueryMode(cleanedText), classifyQueryMode(cleanedText));
    const ignoredPhrases = normalizeReaderList(parsed?.ignoredPhrases || parsed?.ignoredSegments || [], 6);
    const lowerCourtMentionMode = normalizeLowerCourtMentionMode(parsed?.lowerCourtMentionMode || parsed?.lowerCourtUsage || parsed?.sourceIntent || '');

    return {
        cleanedText,
        coreIssueHint,
        retrievalHints,
        evidenceHints,
        primaryDomainHint,
        queryModeHint,
        lowerCourtMentionMode,
        ignoredPhrases,
        reasoning: normalizeDisplayText(parsed?.reasoning || ''),
    };
};

const shouldApplyReaderStage = ({ rawText = '', queryMode = 'short_issue' } = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText);
    if (!normalizedRawText) return false;
    if (queryMode === 'long_fact' || queryMode === 'document_style') return true;
    return false;
};

const inferPrimaryDomainFromText = (value = '') => {
    const haystack = normalizeMatchText(value);
    if (!haystack) return DEFAULT_DOMAIN_PROFILE_ID;
    if (/(uyusturucu|sanik|tck|cmk|tutuklama|mesru savunma|haksiz tahrik|kasten yaralama|hirsizlik|dolandiricilik|ceza|hakaret|orgut|supheden|santaj|ozel hayatin gizliligi|kisisel verileri|bilisim sistemine girme)/.test(haystack)) {
        return 'ceza';
    }
    if (/(imar|belediye|idari islem|idari|yurutmenin durdurulmasi|ruhsat|encumen|memur|atama|disiplin cezasi|ecrimisil|ihale|ogretmen|zabita|devlet memurlugundan cikarma)/.test(haystack)) {
        return 'idare';
    }
    if (/(itirazin iptali|icra takibi|menfi tespit|istirdat|kambiyo|tahliye taahhudu|inkar tazminati|bono|alacak|temlik|sebepsiz zenginlesme)/.test(haystack)) {
        return 'icra';
    }
    if (/(ise iade|isci|isveren|kidem|ihbar|fazla mesai|mobbing|yillik izin|hafta tatili|sendikal|hizmet tespiti|ucret alacagi|ubgt|tir soforu|takograf)/.test(haystack)) {
        return 'is_hukuku';
    }
    if (/(vasiyetname|miras|tereke|tenkis|sakli pay|mirasin reddi|muris|veraset)/.test(haystack)) {
        return 'miras';
    }
    if (/(tuketici|ayipli mal|garanti suresi|sifir kilometre|urun degisimi|tkhk|sozlesmeden donme.*arac|arac.*ayip)/.test(haystack)) {
        return 'tuketici';
    }
    if (/(kasko|police|sigorta tazminat|hasar bedeli|riziko|munhasiran|sigorta tahkim|sigorta sirketi)/.test(haystack)) {
        return 'sigorta';
    }
    if (/(kira uyarlama|asiri ifa guclugu|emprevizyon|kira bedeli.*uyarlama|doviz.*kira|tbk 138)/.test(haystack)) {
        return 'borclar';
    }
    if (/(bosanma|velayet|nafaka|ziynet|aile konutu|evlilik birligi|katilma alacagi|mal rejimi|edinilmis mal|muvazaali devir)/.test(haystack)) {
        return 'aile';
    }
    if (/(cek.*iptal|cek.*ziya|kiymetli evrak|anonim sirket|limited sirket|ticari defter|cari hesap|ttk)/.test(haystack)) {
        return 'ticaret';
    }
    return DEFAULT_DOMAIN_PROFILE_ID;
};

const isSourceTargetDomainMismatch = ({ primaryDomain = DEFAULT_DOMAIN_PROFILE_ID, targetSources = [] } = {}) => {
    const expectedPrimarySource = getSourceForDomain(primaryDomain);
    const targets = normalizeTargetSources(targetSources);
    if (expectedPrimarySource === 'yargitay' && targets.includes('danistay')) return true;
    if (expectedPrimarySource === 'danistay' && targets.includes('yargitay')) return true;
    return false;
};

const isStatuteOnlyConcept = (value = '') => PURE_STATUTE_CONCEPT_REGEX.test(normalizeMatchText(value));

const buildHeuristicScoutRiskTags = ({ rawText = '', queryMode = 'short_issue', primaryDomain = DEFAULT_DOMAIN_PROFILE_ID } = {}) => {
    const normalizedRaw = normalizeMatchText(rawText);
    const tags = [];

    if (queryMode === 'long_fact' || queryMode === 'document_style') {
        tags.push('compression_risk');
    }
    if (isEvidenceLikeConcept(rawText) && !hasEvidenceCoreHint(rawText)) {
        tags.push('bucket_risk');
    }
    if (/(tck|cmk|hmk|tbk|iik|kanun|kanunu|madde)/.test(normalizedRaw)) {
        tags.push('statute_noise_risk');
    }
    if (hasLowerCourtHint(normalizedRaw)) {
        tags.push('lower_court_risk');
    }
    if (primaryDomain && primaryDomain !== DEFAULT_DOMAIN_PROFILE_ID) {
        tags.push('source_target_risk');
    }

    return normalizeRiskTags(tags);
};

const formatValidationWarnings = (validationWarnings = []) =>
    (Array.isArray(validationWarnings) ? validationWarnings : [])
        .map((warning) => [warning?.term || '-', warning?.from || '-', warning?.to || '-', warning?.reason || 'validation'].join(' | '));
