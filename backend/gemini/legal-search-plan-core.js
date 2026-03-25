import { Type } from '@google/genai';
import {
    GEMINI_FLASH_PREVIEW_MODEL_NAME,
    GEMINI_LEGAL_QUERY_EXPANSION_API_KEY,
    getGeminiClient,
} from './_shared.js';
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
    ceza: 'Ceza Hukuku',
    idare: 'Idare Hukuku',
    icra: 'Icra ve Iflas Hukuku',
    vergi: 'Vergi Hukuku',
    anayasa: 'Anayasa Hukuku',
    aile: 'Aile Hukuku',
    ticaret: 'Ticaret Hukuku',
    miras: 'Miras Hukuku',
    tuketici: 'Tuketici Hukuku',
    sigorta: 'Sigorta Hukuku',
    borclar: 'Borclar Hukuku',
    // Yargitay'a yonlendirilen alt alanlar
    saglik: 'Saglik Hukuku',
    bilisim: 'Bilisim Hukuku',
    fikri_mulkiyet: 'Fikri Mulkiyet Hukuku',
    cevre: 'Cevre Hukuku',
    basin: 'Basin Hukuku',
    gayrimenkul: 'Gayrimenkul Hukuku',
    kamulastirma: 'Kamulastirma Hukuku',
    bankacilik: 'Bankacilik Hukuku',
    esya: 'Esya Hukuku',
    deniz_ticaret: 'Deniz Ticaret Hukuku',
    spor: 'Spor Hukuku',
    enerji: 'Enerji Hukuku',
    sosyal_guvenlik: 'Sosyal Guvenlik Hukuku',
    uluslararasi: 'Uluslararasi Hukuk',
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
    miras: 'yargitay',
    tuketici: 'yargitay',
    sigorta: 'yargitay',
    borclar: 'yargitay',
    saglik: 'yargitay',
    bilisim: 'yargitay',
    fikri_mulkiyet: 'yargitay',
    cevre: 'yargitay',
    basin: 'yargitay',
    gayrimenkul: 'yargitay',
    kamulastirma: 'yargitay',
    bankacilik: 'yargitay',
    esya: 'yargitay',
    deniz_ticaret: 'yargitay',
    spor: 'yargitay',
    enerji: 'danistay',
    sosyal_guvenlik: 'yargitay',
    uluslararasi: 'yargitay',
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
    'muteahhit birakmis / insaat bitmedi -> yuklenicinin temerrudu + sozlesmeden donme',
    'arsa verdim daire alamadim -> arsa payi karsiligi insaat sozlesmesi + tapu iptali tescil',
    'fabrika tarlami kirletti / cevre kirliligi -> tehlike sorumlulugu + kusursuz sorumluluk',
    'SIM kart degisti para calindi / hesaptan para cekildi -> yetkisiz islem + bankanin ozen yukumlulugu',
    'marka calindi / taklit yapiliyor -> marka hakkina tecavuz + iltibas',
    'firma batti / borclarini odeyemiyor -> konkordato + borca batiklik',
    'tatil fiyaskosu / otel berbatti -> ayipli hizmet + paket tur sozlesmesi + sozlesmeden donme',
    'naylon fatura / fatura uydurma -> sahte fatura + VUK 359',
    'transfer fiyatlandirma cezasi -> ortulu kazanc dagitimi + transfer fiyatlandirmasi',
    'komsu zarar veriyor -> komsuluk hukuku + mudahalenin meni',
    'tapu devri yapilmadi -> tasinmaz satis vaadi + tapu iptali tescil',
    'araci deger kaybi -> arac deger kaybi + hasar tazminati',
    'ameliyat hatasi / doktor hatasi -> tibbi malpraktis + hekim kusuru + taksirle yaralama',
    'gazete haberi nedeniyle tutuklanma -> basin ozgurlugu + ifade ozgurlugu + haber verme hakki',
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
const EVIDENCE_SIGNAL_REGEX = /\b(rapor|tutanak|kamera|goruntu|mesaj|whatsapp|hts|log|imei|adres|tarih|miktar|bedel|fatura|irsaliye|dekont|hesap hareket|paket|paketlen|paketleme|paketlenmis|terazi|marka|uygulama|app|ekran|foto|bilirki|adli tip|tanik|beyan|kayit|kayitlar|kayitlari|defter|kagit|sarma|folyo|satis materyali|satis materyalleri|puantaj|bordro|bordrosu|bordrolar|giris cikis|nakit|nakit para|makbuz|tebligat|teblig|ihtar|ihtarname|sozlesme metni|kira sozlesmesi|tapu kaydi|veraset|noter|noterlik|imza cirografisi|parmak izi|dna|genetik|otopsi|ameliyat notu|muayene|recete|epikriz|polise|sigorta policesi|hasar dosyasi|eksper|ekspertiz|kiymet takdir|ihale tutanagi|sira cetveli|odeme emri|icra dosyasi|haciz tutanagi|ticaret sicil|esas sozlesme|genel kurul tutanagi|ortaklar sozlesmesi|cari hesap ekstresi|sevk irsaliyesi|banka hesap dokumu|kadastro|aplikasyon|imar plani|insaat ruhsati|yapi kullanma izni|kooperatif uyelik|satis vaadi|bilirkisi|uzman gorusu)\b/i;
const EVIDENCE_CORE_HINT_REGEX = /(hukuka aykiri delil|delilin hukuka uygunlugu|delil degeri|delilin degerlendirilmesi|arama islemi usulsuzlugu|usulsuz arama|elkoyma|el koyma|yasak delil)/i;
const LONG_FACT_HINTS = /(olay|vakia|ayrintili|beyanlar|evrak|kayitlar|birlikte degerlendir|surec|kapsaminda)/;
const PURE_STATUTE_CONCEPT_REGEX = /^(?:(?:\d+\s+sayili\s+)?[a-z0-9./-]+\s+)*(?:kanun|kanunu|madde|tck|cmk|hmk|tbk|iik|mk|vk)(?:\s+[0-9./-]+)?$/i;
const TRANSIENT_GENERATION_ERROR_REGEX = /(fetch failed|503|unavailable|high demand|timed out|timeout|temporar)/i;
const STRUCTURED_JSON_RETRY_DELAYS_MS = [350, 900];
const SOURCE_MISMATCH_WARNING_REASON = 'source_target_domain_mismatch';
const QUERY_EXPANSION_MODEL_NAME =
    process.env.GEMINI_LEGAL_QUERY_EXPANSION_MODEL_NAME ||
    process.env.VITE_GEMINI_LEGAL_QUERY_EXPANSION_MODEL_NAME ||
    'gemini-2.5-flash';
const QUERY_EXPANSION_MIN_VARIANTS = 5;
const QUERY_EXPANSION_MAX_VARIANTS = 10;

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
    if (/(uyusturucu|sanik|tck|cmk|tutuklama|mesru savunma|haksiz tahrik|kasten yaralama|hirsizlik|dolandiricilik|ceza|hakaret|orgut|supheden|santaj|ozel hayatin gizliligi|kisisel verileri|bilisim sistemine girme|taksirle yaralama|malpraktis|tibbi hata|hekim kusuru|organ kaybi|teror orgutu propagandasi|basin ozgurlugu|ifade ozgurlugu|gazetecilik|kvkk|veri ihlali)/.test(haystack)) {
        return 'ceza';
    }
    if (/(tapu iptali|tescil|muris muvazaasi|ortakligin giderilmesi|elatmanin onlenmesi|ecrimisil|kat mulkiyeti|aidat|tasinmaz satis vaadi|kira tespiti|kira tahliye|kat karsiligi insaat|yolsuz tescil|fuzuli isgal)/.test(haystack)) {
        return 'gayrimenkul';
    }
    if (/(imar|belediye|idari islem|idari|yurutmenin durdurulmasi|ruhsat|encumen|memur|atama|disiplin cezasi|ecrimisil|ihale|ogretmen|zabita|devlet memurlugundan cikarma|kamulastirmasiz el atma|fiili el atma|hukuki el atma|kamulastirma|tam yargi davasi|hizmet kusuru)/.test(haystack)) {
        return 'idare';
    }
    if (/(itirazin iptali|icra takibi|menfi tespit|istirdat|kambiyo|tahliye taahhudu|inkar tazminati|bono|alacak|temlik|sebepsiz zenginlesme|konkordato|borca batiklik|iflas erteleme|gecici muhlet|alacaklilar toplantisi|iyilestirme projesi)/.test(haystack)) {
        return 'icra';
    }
    if (/(ise iade|isci|isveren|kidem|ihbar|fazla mesai|mobbing|yillik izin|hafta tatili|sendikal|hizmet tespiti|ucret alacagi|ubgt|tir soforu|takograf)/.test(haystack)) {
        return 'is_hukuku';
    }
    if (/(vasiyetname|miras|tereke|tenkis|sakli pay|mirasin reddi|muris|veraset)/.test(haystack)) {
        return 'miras';
    }
    if (/(tuketici|ayipli mal|garanti suresi|sifir kilometre|urun degisimi|tkhk|sozlesmeden donme.*arac|arac.*ayip|paket tur|ayipli hizmet|tuketici hakem)/.test(haystack)) {
        return 'tuketici';
    }
    if (/(kasko|police|sigorta tazminat|hasar bedeli|riziko|munhasiran|sigorta tahkim|sigorta sirketi)/.test(haystack)) {
        return 'sigorta';
    }
    if (/(kira uyarlama|asiri ifa guclugu|emprevizyon|kira bedeli.*uyarlama|doviz.*kira|tbk 138|tehlike sorumlulugu|kusursuz sorumluluk|cevre kirliligi|toprak kirliligi|tehlikeli atik|arsa payi karsiligi|insaat sozlesmesi|yuklenici.*temerrudu|muteahhit|eser sozlesmesi|cezai sart|tapu iptali ve tescil)/.test(haystack)) {
        return 'borclar';
    }
    if (/(bosanma|velayet|nafaka|ziynet|aile konutu|evlilik birligi|katilma alacagi|mal rejimi|edinilmis mal|muvazaali devir)/.test(haystack)) {
        return 'aile';
    }
    if (/(cek.*iptal|cek.*ziya|kiymetli evrak|anonim sirket|limited sirket|ticari defter|cari hesap|ttk|haksiz rekabet|ticari sir|rekabet yasagi|marka.*tecavuz|marka tescil|iltibas|marka hukumsuz|banka sorumlulugu|yetkisiz islem|mevduatin iadesi|internet bankaciligi|sim swap)/.test(haystack)) {
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

const chooseBetterPlanResult = (baseResult = null, candidateResult = null) => {
    if (!baseResult) return candidateResult;
    if (!candidateResult) return baseResult;
    if (baseResult.isValid && !candidateResult.isValid) return baseResult;
    if (!baseResult.isValid && candidateResult.isValid) return candidateResult;
    return (candidateResult.validationWarnings?.length || 0) <= (baseResult.validationWarnings?.length || 0)
        ? candidateResult
        : baseResult;
};

const mergeValidationWarnings = (...warningLists) => {
    const merged = [];
    for (const warning of warningLists.flat()) {
        appendValidationWarning(merged, warning || {});
    }
    return merged;
};

const buildDomainLabel = (domainId = DEFAULT_DOMAIN_PROFILE_ID) =>
    DOMAIN_LABELS[domainId]
    || normalizeDisplayText(String(domainId || '').replace(/_/g, ' ')).replace(/^\w/, (c) => c.toUpperCase())
    || DOMAIN_LABELS[DEFAULT_DOMAIN_PROFILE_ID];
const hasLowerCourtHint = (haystack = '') =>
    LOWER_COURT_HINTS.some((hint) => haystack.includes(normalizeMatchText(hint)));

const hasConstitutionalHint = (haystack = '') =>
    /hak ihlali|ifade ozgurlugu|adil yargilanma|mulk hakki|mulkiyet hakki/.test(haystack);

const hasEvidenceCoreHint = (value = '') => EVIDENCE_CORE_HINT_REGEX.test(normalizeMatchText(value));

const resolveAllowEvidenceAsCore = ({ requested = false, texts = [] } = {}) => {
    if (hasEvidenceCoreHint((Array.isArray(texts) ? texts : [texts]).filter(Boolean).join(' '))) return true;
    return false;
};

const isEvidenceLikeConcept = (value = '') => EVIDENCE_SIGNAL_REGEX.test(normalizeMatchText(value));
const isCaseLikeQueryMode = (queryMode = '') => {
    const normalized = normalizeQueryMode(queryMode, '');
    return normalized === 'long_fact' || normalized === 'document_style' || normalized === 'case_file';
};

const classifyQueryMode = (rawText = '', parsed = {}) => {
    const explicit = normalizeQueryMode(parsed?.queryMode || '', '');
    if (explicit === 'case_file') return 'long_fact';
    if (explicit) return explicit;
    const raw = normalizeDisplayText(rawText);
    const normalizedRaw = normalizeMatchText(raw);
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const punctuationCount = (raw.match(/[,:;.]/g) || []).length;
    const documentStrong = DOCUMENT_STYLE_STRONG_HINTS.test(normalizedRaw);
    const documentSoft = DOCUMENT_STYLE_SOFT_HINTS.test(normalizedRaw);
    const longFactLike = LONG_FACT_HINTS.test(normalizedRaw);
    const veryLongText = raw.length >= CASE_FILE_MIN_CHARS
        || wordCount >= CASE_FILE_MIN_WORDS
        || punctuationCount >= 2;
    if (documentStrong) return 'document_style';
    if (documentSoft && !veryLongText) return 'document_style';
    if (veryLongText || longFactLike) return 'long_fact';
    return 'short_issue';
};

const normalizePrimaryDomain = (value = '') => normalizeDomainId(value, DEFAULT_DOMAIN_PROFILE_ID);

const inferTargetSources = ({ preferredSource = 'all', primaryDomain = DEFAULT_DOMAIN_PROFILE_ID, rawText = '', parsed = {} } = {}) => {
    const normalizedPreferredSource = normalizeSource(preferredSource, 'all');
    if (normalizedPreferredSource !== 'all') {
        return [normalizedPreferredSource];
    }

    const rawMatch = normalizeMatchText(rawText);
    const explicitTargets = normalizeTargetSources(parsed?.sourceTargets || parsed?.targetSources || parsed?.sources || []);
    const allowUyap = primaryDomain !== 'anayasa' && hasLowerCourtHint(rawMatch);
    const allowAnayasa = primaryDomain === 'anayasa' || hasConstitutionalHint(rawMatch);
    const primarySource = getSourceForDomain(primaryDomain);

    if (explicitTargets.length > 0) {
        return explicitTargets.filter((target) => {
            if (target === 'uyap') return allowUyap;
            if (target === 'anayasa') return allowAnayasa;
            return true;
        });
    }

    const targets = [primarySource];
    if (allowUyap && targets.length < MAX_TARGET_SOURCES) {
        targets.push('uyap');
    }
    if (allowAnayasa && targets.length < MAX_TARGET_SOURCES && !targets.includes('anayasa')) {
        targets.push('anayasa');
    }

    return normalizeTargetSources(targets, [primarySource]);
};

const inferSourceReason = ({ primaryDomain = DEFAULT_DOMAIN_PROFILE_ID, targetSources = [] } = {}) => {
    const label = buildDomainLabel(primaryDomain);
    if (targetSources.length === 1) {
        if (targetSources[0] === 'yargitay') return `${label} icin Yargitay aday havuzu secildi.`;
        if (targetSources[0] === 'danistay') return `${label} icin Danistay aday havuzu secildi.`;
        if (targetSources[0] === 'anayasa') return `${label} icin Anayasa Mahkemesi aday havuzu secildi.`;
        if (targetSources[0] === 'uyap') return `${label} icin alt derece emsal ihtiyaci nedeniyle UYAP aday havuzu secildi.`;
    }
    return `${label} icin birden fazla uygun kaynak taranarak aday havuzu olusturuldu.`;
};

const normalizeScoutProfile = ({ rawText = '', preferredSource = 'all', parsed = {}, fallbackQueryMode = 'short_issue' } = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText);
    const queryMode = normalizeQueryMode(parsed?.queryMode || fallbackQueryMode, fallbackQueryMode || 'short_issue');
    const primaryDomain = normalizePrimaryDomain(parsed?.primaryDomain || parsed?.legalArea || inferPrimaryDomainFromText(normalizedRawText));
    const secondaryDomains = dedupeByMatchKey(Array.isArray(parsed?.secondaryDomains) ? parsed.secondaryDomains : [], 2)
        .map((value) => normalizeDomainId(value, ''))
        .filter((value) => value && value !== primaryDomain);
    const allowEvidenceAsCore = resolveAllowEvidenceAsCore({
        requested: parsed?.allowEvidenceAsCore,
        texts: [normalizedRawText, parsed?.reasoning],
    });
    const sourceTargets = inferTargetSources({
        preferredSource,
        primaryDomain,
        rawText: normalizedRawText,
        parsed,
    });
    const riskTags = mergeRiskTags(
        buildHeuristicScoutRiskTags({ rawText: normalizedRawText, queryMode, primaryDomain }),
        parsed?.riskTags || [],
        isSourceTargetDomainMismatch({ primaryDomain, targetSources: sourceTargets }) ? ['source_target_risk'] : []
    );

    return {
        queryMode,
        primaryDomain,
        secondaryDomains,
        allowEvidenceAsCore,
        sourceTargets,
        sourceReason: normalizeDisplayText(parsed?.sourceReason || inferSourceReason({ primaryDomain, targetSources: sourceTargets })),
        riskTags,
        reasoning: normalizeDisplayText(parsed?.reasoning || ''),
    };
};

const shouldApplyPlanReview = ({ scoutProfile = {}, plan = {}, validationWarnings = [] } = {}) => {
    const riskTags = mergeRiskTags(
        scoutProfile?.riskTags || [],
        (Array.isArray(validationWarnings) ? validationWarnings : []).map((warning) => warning?.reason || '')
    );
    const targetSources = plan?.targetSources || plan?.sourceTargets || scoutProfile?.sourceTargets || [];

    if (plan?.queryMode === 'long_fact' || plan?.queryMode === 'document_style') return true;
    if (isSourceTargetDomainMismatch({ primaryDomain: plan?.primaryDomain || scoutProfile?.primaryDomain, targetSources })) return true;
    if (riskTags.some((tag) => tag === 'bucket_risk' || tag === 'statute_noise_risk' || tag === SOURCE_MISMATCH_WARNING_REASON)) return true;
    if (plan?.searchQuery && isLikelyNaturalLanguageQuery(plan.searchQuery)) return true;
    if (plan?.semanticQuery && isLikelyKeywordQuery(plan.semanticQuery)) return true;
    return false;
};

const tokenizeForClause = (value = '') =>
    normalizeDisplayText(value)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3 && !SEARCH_STOPWORDS.has(normalizeMatchText(item)));

const buildRequiredTermClause = (concepts = []) => {
    const tokens = [];
    const seen = new Set();

    for (const concept of Array.isArray(concepts) ? concepts : []) {
        for (const token of tokenizeForClause(concept)) {
            const key = normalizeMatchText(token);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            tokens.push(`+${token}`);
            if (tokens.length >= 4) return tokens.join(' ');
        }
    }

    return tokens.join(' ');
};

const buildConceptClauses = ({ retrievalConcepts = [], supportConcepts = [], fallback = '' } = {}) => {
    const exactPhraseClause = retrievalConcepts
        .filter((concept) => concept.split(/\s+/).length >= 2)
        .slice(0, 2)
        .map((concept) => `"${concept}"`)
        .join(' ')
        .trim();
    const requiredTermClause = buildRequiredTermClause(retrievalConcepts);
    const blendedClause = buildKeywordSearchPhrase({
        concepts: dedupeByMatchKey([
            ...retrievalConcepts.slice(0, 3),
            ...supportConcepts.slice(0, 1),
        ], 4),
        fallback,
        maxWords: 8,
        maxConcepts: 3,
        maxWordsPerConcept: 3,
    });

    return dedupeByMatchKey([
        exactPhraseClause,
        requiredTermClause,
        blendedClause,
        normalizeDisplayText(fallback),
    ], MAX_SEARCH_CLAUSES);
};

const buildAsciiVariants = (values = []) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : []) {
        const normalized = toAsciiSearchText(value);
        if (!normalized || seen.has(normalized) || normalized === normalizeMatchText(value)) continue;
        seen.add(normalized);
        unique.push(normalized);
        if (unique.length >= MAX_SEARCH_CLAUSES) break;
    }

    return unique;
};

const buildSearchQuery = ({ queryMode = 'short_issue', coreIssue = '', retrievalConcepts = [], supportConcepts = [], fallback = '' } = {}) => {
    const caseLike = isCaseLikeQueryMode(queryMode);
    const keywordQuery = buildKeywordSearchPhrase({
        concepts: caseLike
            ? dedupeByMatchKey([...retrievalConcepts.slice(0, 2), ...supportConcepts.slice(0, 1)], 3)
            : dedupeByMatchKey([...retrievalConcepts.slice(0, 3), ...supportConcepts.slice(0, 1)], 4),
        fallback: fallback || coreIssue,
        maxWords: caseLike ? 6 : 7,
        maxConcepts: caseLike ? 2 : 3,
        maxWordsPerConcept: 3,
        separator: ', ',
    });

    return keywordQuery;
};

const buildSemanticQuery = ({ semanticQuery = '', coreIssue = '', rawText = '', searchQuery = '' } = {}) => {
    const explicit = normalizeDisplayText(semanticQuery).slice(0, 480).trim();
    const normalizedSearchQuery = normalizeDisplayText(searchQuery).trim();
    if (explicit && normalizeMatchText(explicit) !== normalizeMatchText(normalizedSearchQuery) && isLikelyNaturalLanguageQuery(explicit)) {
        return explicit;
    }

    const normalizedCoreIssue = normalizeDisplayText(coreIssue).slice(0, 480).trim();
    if (normalizedCoreIssue && isLikelyNaturalLanguageQuery(normalizedCoreIssue)) {
        return normalizedCoreIssue;
    }

    const normalizedRawText = normalizeDisplayText(rawText).slice(0, 480).trim();
    if (normalizedRawText && isLikelyNaturalLanguageQuery(normalizedRawText)) {
        return normalizedRawText;
    }

    return explicit || normalizedCoreIssue || normalizedRawText || normalizedSearchQuery;
};

const buildSupportExpansionClauses = ({ coreIssue = '', retrievalConcepts = [], supportConcepts = [], searchQuery = '' } = {}) => {
    const limitedSupport = supportConcepts.slice(0, 2);
    if (limitedSupport.length === 0) return [];
    const anchor = normalizeDisplayText(searchQuery || compactConceptPhrase(coreIssue));
    return dedupeByMatchKey([
        buildKeywordSearchPhrase({
            concepts: [anchor, ...limitedSupport],
            fallback: anchor || coreIssue,
            maxWords: 8,
            maxConcepts: 3,
            maxWordsPerConcept: 3,
        }),
        buildKeywordSearchPhrase({
            concepts: [...retrievalConcepts.slice(0, 2), ...limitedSupport],
            fallback: anchor || coreIssue,
            maxWords: 8,
            maxConcepts: 3,
            maxWordsPerConcept: 3,
        }),
    ], 2);
};

const buildSearchRounds = ({
    queryMode = 'short_issue',
    coreIssue = '',
    retrievalConcepts = [],
    supportConcepts = [],
    searchQuery = '',
} = {}) => {
    if (isCaseLikeQueryMode(queryMode)) {
        const keywordAnchor = normalizeDisplayText(searchQuery || compactConceptPhrase(coreIssue));
        const keywordAnchorNormalized = normalizeDisplayText(keywordAnchor.replace(/,\s*/g, ' '));
        const coreIssueClauses = dedupeByMatchKey([
            keywordAnchor,
            keywordAnchorNormalized,
        ], 2);
        const retrievalClauses = buildConceptClauses({
            retrievalConcepts,
            supportConcepts: [],
            fallback: keywordAnchor || coreIssue || searchQuery,
        });
        const supportClauses = buildSupportExpansionClauses({ coreIssue, retrievalConcepts, supportConcepts, searchQuery: keywordAnchor });

        return [
            {
                round: 'core_issue',
                clauses: coreIssueClauses,
                asciiClauses: buildAsciiVariants(coreIssueClauses),
            },
            {
                round: 'retrieval_concepts',
                clauses: retrievalClauses,
                asciiClauses: buildAsciiVariants(retrievalClauses),
            },
            {
                round: 'support_concepts',
                clauses: supportClauses,
                asciiClauses: buildAsciiVariants(supportClauses),
            },
        ].filter((round) => round.clauses.length > 0 || round.asciiClauses.length > 0);
    }

    const directClauses = buildConceptClauses({
        retrievalConcepts,
        supportConcepts,
        fallback: searchQuery || coreIssue,
    });

    return [{
        round: 'direct',
        clauses: directClauses,
        asciiClauses: buildAsciiVariants(directClauses),
    }];
};

const flattenSearchRounds = (searchRounds = []) => {
    const queryVariantsTurkish = dedupeByMatchKey(
        searchRounds.flatMap((round) => Array.isArray(round?.clauses) ? round.clauses : []),
        MAX_SEARCH_CLAUSES
    );
    const queryVariantsAscii = dedupeByMatchKey(
        searchRounds.flatMap((round) => Array.isArray(round?.asciiClauses) ? round.asciiClauses : []),
        MAX_SEARCH_CLAUSES
    ).filter((clause) => !queryVariantsTurkish.some((item) => normalizeMatchText(item) === normalizeMatchText(clause)));

    return {
        searchClauses: queryVariantsTurkish,
        queryVariantsTurkish,
        queryVariantsAscii,
    };
};

const splitConceptBuckets = ({
    retrievalConcepts = [],
    supportConcepts = [],
    evidenceConcepts = [],
    allowEvidenceAsCore = false,
    attempt = 1,
} = {}) => {
    const nextRetrieval = [];
    const nextSupport = [];
    const nextEvidence = [];
    const validationWarnings = [];

    for (const concept of normalizeConceptList(retrievalConcepts, MAX_RETRIEVAL_CONCEPTS)) {
        if (!allowEvidenceAsCore && isEvidenceLikeConcept(concept)) {
            nextEvidence.push(concept);
            appendValidationWarning(validationWarnings, {
                term: concept,
                from: 'retrievalConcepts',
                to: 'evidenceConcepts',
                reason: 'delil_sinyali',
                attempt,
            });
            continue;
        }
        nextRetrieval.push(concept);
    }

    for (const concept of normalizeConceptList(supportConcepts, MAX_SUPPORT_CONCEPTS)) {
        if (nextRetrieval.some((item) => normalizeMatchText(item) === normalizeMatchText(concept))) continue;
        if (!allowEvidenceAsCore && isEvidenceLikeConcept(concept)) {
            nextEvidence.push(concept);
            appendValidationWarning(validationWarnings, {
                term: concept,
                from: 'supportConcepts',
                to: 'evidenceConcepts',
                reason: 'delil_sinyali',
                attempt,
            });
            continue;
        }
        nextSupport.push(concept);
    }

    for (const concept of normalizeConceptList(evidenceConcepts, MAX_EVIDENCE_CONCEPTS)) {
        if (nextRetrieval.some((item) => normalizeMatchText(item) === normalizeMatchText(concept))) {
            if (!allowEvidenceAsCore) {
                nextEvidence.push(concept);
                appendValidationWarning(validationWarnings, {
                    term: concept,
                    from: 'retrievalConcepts',
                    to: 'evidenceConcepts',
                    reason: 'delil_sinyali',
                    attempt,
                });
            }
            continue;
        }
        if (nextSupport.some((item) => normalizeMatchText(item) === normalizeMatchText(concept))) continue;
        nextEvidence.push(concept);
    }

    return {
        retrievalConcepts: dedupeByMatchKey(nextRetrieval, MAX_RETRIEVAL_CONCEPTS),
        supportConcepts: dedupeByMatchKey(nextSupport, MAX_SUPPORT_CONCEPTS),
        evidenceConcepts: dedupeByMatchKey(nextEvidence, MAX_EVIDENCE_CONCEPTS),
        validationWarnings,
    };
};

const normalizePlanPayload = ({ rawText = '', preferredSource = 'all', parsed = {}, attempt = 1 } = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText || parsed?.semanticQuery || parsed?.searchQuery || parsed?.coreIssue || '');
    const queryMode = classifyQueryMode(normalizedRawText, parsed);
    const primaryDomain = normalizePrimaryDomain(parsed?.primaryDomain || parsed?.legalArea || DEFAULT_DOMAIN_PROFILE_ID);
    const allowEvidenceAsCore = resolveAllowEvidenceAsCore({
        requested: parsed?.allowEvidenceAsCore,
        texts: [normalizedRawText, parsed?.coreIssue, parsed?.semanticQuery, parsed?.searchQuery, parsed?.reasoning],
    });
    const coreIssue = normalizeDisplayText(parsed?.coreIssue || parsed?.semanticQuery || parsed?.searchQuery || normalizedRawText).slice(0, 220).trim();
    const rawRetrievalConcepts = parsed?.retrievalConcepts || parsed?.requiredConcepts || parsed?.keywords || [];
    const rawSupportConcepts = parsed?.supportConcepts || [];
    const rawEvidenceConcepts = parsed?.evidenceConcepts || [];
    const conceptBuckets = splitConceptBuckets({
        retrievalConcepts: rawRetrievalConcepts,
        supportConcepts: rawSupportConcepts,
        evidenceConcepts: rawEvidenceConcepts,
        allowEvidenceAsCore,
        attempt,
    });
    const isCezaLongFact = queryMode === 'long_fact' && primaryDomain === 'ceza' && !allowEvidenceAsCore;
    const retrievalLimit = isCezaLongFact ? CEZA_LONG_FACT_MAX_RETRIEVAL_CONCEPTS : MAX_RETRIEVAL_CONCEPTS;
    const fullRetrievalConcepts = conceptBuckets.retrievalConcepts.length > 0
        ? conceptBuckets.retrievalConcepts
        : normalizeConceptList([coreIssue], MAX_RETRIEVAL_CONCEPTS);
    const retrievalConcepts = dedupeByMatchKey(fullRetrievalConcepts, retrievalLimit);
    const overflowRetrievalConcepts = fullRetrievalConcepts.slice(retrievalLimit);
    const normalizationWarnings = Array.isArray(conceptBuckets.validationWarnings)
        ? [...conceptBuckets.validationWarnings]
        : [];
    overflowRetrievalConcepts.forEach((concept) => {
        appendValidationWarning(normalizationWarnings, {
            term: concept,
            from: 'retrievalConcepts',
            to: 'supportConcepts',
            reason: 'ceza_long_fact_cekirdek_limiti',
            attempt,
        });
    });
    const supportConcepts = dedupeByMatchKey([
        ...conceptBuckets.supportConcepts,
        ...overflowRetrievalConcepts,
    ], MAX_SUPPORT_CONCEPTS);
    const evidenceConcepts = conceptBuckets.evidenceConcepts;
    const negativeConcepts = normalizeConceptList(parsed?.negativeConcepts || [], MAX_NEGATIVE_CONCEPTS);
    const targetSources = inferTargetSources({ preferredSource, primaryDomain, rawText: normalizedRawText, parsed });
    const optionalBirimCodes = normalizeBirimCodes([
        ...(Array.isArray(parsed?.optionalBirimCodes) ? parsed.optionalBirimCodes : []),
        ...(Array.isArray(parsed?.birimCodes) ? parsed.birimCodes : []),
        // Domain fallback: AI optionalBirimCodes birakmissa domain'den kodlari al
        ...(() => {
            if (Array.isArray(parsed?.optionalBirimCodes) && parsed.optionalBirimCodes.length > 0) return [];
            const DOMAIN_DEFAULT_BIRIM_CODES = {
                is_hukuku: ['H9', 'H22'],
                icra: ['H12'],
                aile: ['H2'],
                ticaret: ['H11', 'H19'],
                borclar: ['H3', 'H6'],
                gayrimenkul: ['H14'],
            };
            return DOMAIN_DEFAULT_BIRIM_CODES[String(primaryDomain || '').trim().toLowerCase()] || [];
        })(),
    ]);
    const secondaryDomains = dedupeByMatchKey(Array.isArray(parsed?.secondaryDomains) ? parsed.secondaryDomains : [], 2)
        .map((value) => normalizeDomainId(value, ''))
        .filter((value) => value && value !== primaryDomain);
    const searchQuery = buildSearchQuery({
        queryMode,
        coreIssue,
        retrievalConcepts,
        supportConcepts,
        fallback: normalizedRawText,
    });

    if (!searchQuery) {
        const error = new Error('AI arama plani uretilemedi.');
        error.status = 502;
        throw error;
    }

    const semanticQuery = buildSemanticQuery({
        semanticQuery: parsed?.semanticQuery,
        coreIssue,
        rawText: normalizedRawText,
        searchQuery,
    }) || searchQuery;
    const searchRounds = buildSearchRounds({
        queryMode,
        coreIssue,
        retrievalConcepts,
        supportConcepts,
        searchQuery,
    });
    const flattenedSearch = flattenSearchRounds(searchRounds);

    return {
        queryMode,
        allowEvidenceAsCore,
        legalArea: primaryDomain,
        primaryDomain,
        secondaryDomains,
        coreIssue,
        initialKeyword: searchQuery,
        searchQuery,
        semanticQuery,
        searchRounds,
        searchClauses: flattenedSearch.searchClauses,
        queryVariantsTurkish: flattenedSearch.queryVariantsTurkish,
        queryVariantsAscii: flattenedSearch.queryVariantsAscii,
        keywords: retrievalConcepts,
        retrievalConcepts,
        requiredConcepts: retrievalConcepts,
        supportConcepts,
        evidenceConcepts,
        negativeConcepts,
        canonicalRequiredConcepts: retrievalConcepts,
        canonicalSupportConcepts: supportConcepts,
        targetSources,
        sourceTargets: targetSources,
        sourceReason: normalizeDisplayText(parsed?.sourceReason || inferSourceReason({ primaryDomain, targetSources })),
        optionalBirimCodes,
        reasoning: normalizeDisplayText(parsed?.reasoning),
        suggestedSource: targetSources.length === 1 ? targetSources[0] : 'all',
        normalizationWarnings,
    };
};

const collectFallbackRetrievalConcepts = ({ plan = {}, rawText = '', limit = MAX_RETRIEVAL_CONCEPTS } = {}) => {
    const allowEvidenceAsCore = Boolean(plan?.allowEvidenceAsCore);
    const candidates = normalizeConceptList([
        ...(Array.isArray(plan?.retrievalConcepts) ? plan.retrievalConcepts : []),
        ...(Array.isArray(plan?.supportConcepts) ? plan.supportConcepts : []),
        plan?.coreIssue,
        plan?.searchQuery,
        rawText,
    ], MAX_RETRIEVAL_CONCEPTS + MAX_SUPPORT_CONCEPTS);

    return candidates
        .filter((term) => allowEvidenceAsCore || !isEvidenceLikeConcept(term))
        .slice(0, limit);
};

const validateAndRepairPlan = ({ plan = {}, rawText = '', attempt = 1 } = {}) => {
    const validationWarnings = Array.isArray(plan?.normalizationWarnings)
        ? plan.normalizationWarnings.map((warning) => ({ ...warning }))
        : [];
    const allowEvidenceAsCore = Boolean(plan?.allowEvidenceAsCore);
    const isCezaLongFact = plan?.queryMode === 'long_fact' && plan?.primaryDomain === 'ceza' && !allowEvidenceAsCore;
    const retrievalLimit = isCezaLongFact ? CEZA_LONG_FACT_MAX_RETRIEVAL_CONCEPTS : MAX_RETRIEVAL_CONCEPTS;
    const retrievalCandidates = normalizeConceptList(plan?.retrievalConcepts || [], MAX_RETRIEVAL_CONCEPTS);
    const supportCandidates = normalizeConceptList(plan?.supportConcepts || [], MAX_SUPPORT_CONCEPTS + MAX_RETRIEVAL_CONCEPTS);
    const evidenceCandidates = normalizeConceptList(plan?.evidenceConcepts || [], MAX_EVIDENCE_CONCEPTS + MAX_RETRIEVAL_CONCEPTS);
    const negativeConcepts = normalizeConceptList(plan?.negativeConcepts || [], MAX_NEGATIVE_CONCEPTS);
    const retrievalPool = [];
    const nextRetrieval = [];
    const nextSupport = [];
    const nextEvidence = [];

    for (const concept of evidenceCandidates) {
        pushUniqueConcept(nextEvidence, concept, { limit: MAX_EVIDENCE_CONCEPTS });
    }

    for (const concept of retrievalCandidates) {
        if (!allowEvidenceAsCore && isEvidenceLikeConcept(concept)) {
            pushUniqueConcept(nextEvidence, concept, { limit: MAX_EVIDENCE_CONCEPTS });
            appendValidationWarning(validationWarnings, {
                term: concept,
                from: 'retrievalConcepts',
                to: 'evidenceConcepts',
                reason: 'delil_sinyali',
                attempt,
            });
            continue;
        }

        pushUniqueConcept(retrievalPool, concept, { limit: MAX_RETRIEVAL_CONCEPTS });
    }

    if (isCezaLongFact) {
        retrievalPool.slice(0, retrievalLimit).forEach((concept) => {
            pushUniqueConcept(nextRetrieval, concept, { limit: retrievalLimit });
        });

        for (const concept of retrievalPool.slice(retrievalLimit)) {
            pushUniqueConcept(nextSupport, concept, { limit: MAX_SUPPORT_CONCEPTS });
            appendValidationWarning(validationWarnings, {
                term: concept,
                from: 'retrievalConcepts',
                to: 'supportConcepts',
                reason: 'ceza_long_fact_cekirdek_limiti',
                attempt,
            });
        }
    } else {
        retrievalPool.forEach((concept) => {
            pushUniqueConcept(nextRetrieval, concept, { limit: retrievalLimit });
        });
    }

    for (const concept of supportCandidates) {
        if (nextRetrieval.some((item) => normalizeMatchText(item) === normalizeMatchText(concept))) continue;
        if (!allowEvidenceAsCore && isEvidenceLikeConcept(concept)) {
            pushUniqueConcept(nextEvidence, concept, { limit: MAX_EVIDENCE_CONCEPTS });
            appendValidationWarning(validationWarnings, {
                term: concept,
                from: 'supportConcepts',
                to: 'evidenceConcepts',
                reason: 'delil_sinyali',
                attempt,
            });
            continue;
        }

        pushUniqueConcept(nextSupport, concept, { limit: MAX_SUPPORT_CONCEPTS });
    }

    const targetSources = normalizeTargetSources(plan?.targetSources || plan?.sourceTargets || []);
    if (isSourceTargetDomainMismatch({ primaryDomain: plan?.primaryDomain, targetSources })) {
        appendValidationWarning(validationWarnings, {
            term: targetSources.join(', '),
            from: 'sourceTargets',
            to: 'sourceTargets',
            reason: SOURCE_MISMATCH_WARNING_REASON,
            attempt,
        });
    }

    for (const concept of nextRetrieval) {
        if (!isStatuteOnlyConcept(concept)) continue;
        appendValidationWarning(validationWarnings, {
            term: concept,
            from: 'retrievalConcepts',
            to: 'retrievalConcepts',
            reason: 'statute_noise_risk',
            attempt,
        });
    }

    if (nextRetrieval.length === 0) {
        const fallbackRetrievalConcepts = collectFallbackRetrievalConcepts({
            plan,
            rawText,
            limit: retrievalLimit,
        });

        const rawFallbackAnchor = rawText ? normalizeMatchText(compactConceptPhrase(rawText)) : '';
        for (const concept of fallbackRetrievalConcepts) {
            if (pushUniqueConcept(nextRetrieval, concept, { limit: retrievalLimit })) {
                appendValidationWarning(validationWarnings, {
                    term: concept,
                    from: rawFallbackAnchor && normalizeMatchText(concept) === rawFallbackAnchor ? 'rawText' : 'coreIssue',
                    to: 'retrievalConcepts',
                    reason: 'cekirdek_yedekleme',
                    attempt,
                });
            }
            if (nextRetrieval.length >= retrievalLimit) break;
        }
    }

    const searchQuery = buildSearchQuery({
        queryMode: plan?.queryMode,
        coreIssue: plan?.coreIssue,
        retrievalConcepts: nextRetrieval,
        supportConcepts: nextSupport,
        fallback: normalizeDisplayText(rawText || plan?.searchQuery || plan?.coreIssue),
    });

    if (!searchQuery) {
        const error = new Error('AI arama plani uretilemedi.');
        error.status = 502;
        throw error;
    }

    const semanticQuery = buildSemanticQuery({
        semanticQuery: plan?.semanticQuery,
        coreIssue: plan?.coreIssue,
        rawText,
        searchQuery,
    }) || searchQuery;
    const searchRounds = buildSearchRounds({
        queryMode: plan?.queryMode,
        coreIssue: plan?.coreIssue,
        retrievalConcepts: nextRetrieval,
        supportConcepts: nextSupport,
        searchQuery,
    });
    const flattenedSearch = flattenSearchRounds(searchRounds);

    const { normalizationWarnings: _ignoredNormalizationWarnings, ...planWithoutNormalizationWarnings } = plan;

    return {
        plan: {
            ...planWithoutNormalizationWarnings,
            initialKeyword: searchQuery,
            searchQuery,
            semanticQuery,
            searchRounds,
            searchClauses: flattenedSearch.searchClauses,
            queryVariantsTurkish: flattenedSearch.queryVariantsTurkish,
            queryVariantsAscii: flattenedSearch.queryVariantsAscii,
            keywords: nextRetrieval,
            retrievalConcepts: nextRetrieval,
            requiredConcepts: nextRetrieval,
            supportConcepts: nextSupport,
            evidenceConcepts: dedupeByMatchKey(nextEvidence, MAX_EVIDENCE_CONCEPTS),
            negativeConcepts,
            canonicalRequiredConcepts: nextRetrieval,
            canonicalSupportConcepts: nextSupport,
        },
        validationWarnings,
        isValid: validationWarnings.length === 0,
    };
};

const normalizePlanResult = ({ rawText = '', preferredSource = 'all', parsed = {}, attempt = 1 } = {}) =>
    validateAndRepairPlan({
        plan: normalizePlanPayload({ rawText, preferredSource, parsed, attempt }),
        rawText,
        attempt,
    });

const buildMinimalFallbackPlan = ({ rawText = '', preferredSource = 'all', seedPlan = {}, attempt = 1 } = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText || seedPlan?.coreIssue || seedPlan?.searchQuery || '');
    const primaryDomain = normalizePrimaryDomain(seedPlan?.primaryDomain || seedPlan?.legalArea || DEFAULT_DOMAIN_PROFILE_ID);
    const queryMode = normalizeQueryMode(seedPlan?.queryMode || classifyQueryMode(normalizedRawText, seedPlan), 'short_issue');
    const allowEvidenceAsCore = resolveAllowEvidenceAsCore({
        requested: seedPlan?.allowEvidenceAsCore,
        texts: [normalizedRawText, seedPlan?.coreIssue, seedPlan?.semanticQuery, seedPlan?.searchQuery, seedPlan?.reasoning],
    });
    const retrievalLimit = queryMode === 'long_fact' && primaryDomain === 'ceza' && !allowEvidenceAsCore
        ? CEZA_LONG_FACT_MAX_RETRIEVAL_CONCEPTS
        : MAX_RETRIEVAL_CONCEPTS;
    const coreIssue = normalizeDisplayText(seedPlan?.coreIssue || seedPlan?.searchQuery || normalizedRawText).slice(0, 220).trim();
    const retrievalConcepts = collectFallbackRetrievalConcepts({
        plan: seedPlan,
        rawText: normalizedRawText,
        limit: retrievalLimit,
    });
    const supportConcepts = normalizeConceptList(seedPlan?.supportConcepts || [], MAX_SUPPORT_CONCEPTS)
        .filter((concept) => !retrievalConcepts.some((item) => normalizeMatchText(item) === normalizeMatchText(concept)))
        .filter((concept) => allowEvidenceAsCore || !isEvidenceLikeConcept(concept));
    const evidenceConcepts = dedupeByMatchKey([
        ...normalizeConceptList(seedPlan?.evidenceConcepts || [], MAX_EVIDENCE_CONCEPTS),
        ...normalizeConceptList([
            ...(Array.isArray(seedPlan?.retrievalConcepts) ? seedPlan.retrievalConcepts : []),
            ...(Array.isArray(seedPlan?.supportConcepts) ? seedPlan.supportConcepts : []),
        ], MAX_RETRIEVAL_CONCEPTS + MAX_SUPPORT_CONCEPTS).filter((concept) => isEvidenceLikeConcept(concept)),
    ], MAX_EVIDENCE_CONCEPTS);

    const normalizedRetrievalConcepts = retrievalConcepts.length > 0
        ? retrievalConcepts
        : normalizeConceptList([coreIssue || normalizedRawText], retrievalLimit);
    const searchQuery = buildSearchQuery({
        queryMode,
        coreIssue,
        retrievalConcepts: normalizedRetrievalConcepts,
        supportConcepts,
        fallback: normalizedRawText,
    });
    const semanticQuery = buildSemanticQuery({
        semanticQuery: seedPlan?.semanticQuery,
        coreIssue,
        rawText: normalizedRawText,
        searchQuery,
    }) || searchQuery;

    return normalizePlanResult({
        rawText: normalizedRawText,
        preferredSource,
        parsed: {
            ...seedPlan,
            queryMode,
            primaryDomain,
            coreIssue,
            initialKeyword: searchQuery,
            searchQuery,
            semanticQuery,
            retrievalConcepts: normalizedRetrievalConcepts,
            supportConcepts,
            evidenceConcepts,
            sourceTargets: seedPlan?.targetSources || seedPlan?.sourceTargets || [],
            negativeConcepts: seedPlan?.negativeConcepts || [],
            allowEvidenceAsCore,
        },
        attempt,
    });
};

const formatPromptJson = (value = {}) => JSON.stringify(value, null, 2);

const buildModeRules = ({ queryMode = 'short_issue', primaryDomain = DEFAULT_DOMAIN_PROFILE_ID, allowEvidenceAsCore = false } = {}) => {
    const glossary = buildTerminologyGlossaryBlock();
    if (queryMode === 'long_fact') {
        return [
            'queryMode alani long_fact olmali.',
            'coreIssue alaninda metnin ana hukuki sonucunu aramaya uygun 1-2 cumlede kur; halk agzi anlatimi resmi hukuk tezine cevir.',
            'retrievalConcepts alaninda cekirdek hukuki omurgayi yaz; olay metnini kopyalama ve halk dili ASLA kullanma.',
            'supportConcepts alaninda alt basliklari yaz.',
            'evidenceConcepts alaninda rapor, tutanak, miktar, tarih, kisi, adres, mesaj, fatura, kayit, paketleme, terazi gibi dosya sinyallerini yaz.',
            'Salt kanun/madde numarasini retrievalConcepts omurgasi yapma.',
            primaryDomain === 'ceza'
                ? 'Ceza long_fact icin allowEvidenceAsCore=false ise retrievalConcepts en fazla 3 cekirdek kavram olsun; terazi, paketleme, satis bedeli gibi detaylar evidenceConcepts alanina insin.'
                : 'Uzun olaylarda retrievalConcepts hukuki omurga olsun; belge ve delil ayrintilari evidenceConcepts tarafinda kalsin.',
            allowEvidenceAsCore
                ? 'Bu istekte delilin hukuka uygunlugu ana konu oldugu icin delil odakli cekirdek kavramlara izin ver.'
                : 'Ana konu delilin hukuka uygunlugu degilse delil odakli kavramlari retrievalConcepts icine koyma.',
            glossary,
        ].join('\n');
    }

    if (queryMode === 'document_style') {
        return [
            'queryMode alani document_style olmali.',
            'Belge dilini degil hukuki istemin cekirdegini yaz; halk agzi ifadeleri resmi hukuk diline MUTLAKA cevir.',
            'Belge turu ve uyusmazlik konusu retrievalConcepts alaninda birlikte gorunsun.',
            'Delil nitelikli belge unsurlari evidenceConcepts tarafinda kalsin.',
            glossary,
        ].join('\n');
    }

    return [
        'queryMode alani short_issue olmali.',
        'coreIssue alaninda kisa sorguyu aramaya uygun hukuki teze cevir; halk agzi ifadeleri resmi hukuk diline MUTLAKA donustur.',
        'retrievalConcepts alaninda yalniz dava/suc/istemin omurgasi olan 2-5 kisa kavram yaz; gundelik ifade ASLA kullanma.',
        'supportConcepts alaninda yardimci 0-4 kavram yaz.',
        'evidenceConcepts alaninda rapor, tutanak, miktar, tarih, adres, mesaj, kamera, marka, paketleme gibi dosya sinyallerini yaz.',
        allowEvidenceAsCore
            ? 'Bu istekte delil degeri ana tez oldugu icin delil odakli cekirdege izin ver.'
            : 'Delil odakli kavramlari retrievalConcepts icine koyma.',
        glossary,
    ].join('\n');
};

const buildSourceRules = () => [
    'Kaynak secimi kurallari:',
    '- primaryDomain veya primaryDomainHint alanini sabit listeyle sinirlama; en uygun hukuk alanini serbestce uret.',
    '- Urettigin alan mumkunse kisa, normalize edilebilir ve snake_case uyumlu olsun. Ornek: miras, tuketici, borclar, sigorta, bilisim_hukuku.',
    '- anayasa alaninda varsayilan ana kaynak anayasa kaynagidir.',
    '- idari veya vergi tipi uyusmazliklarda varsayilan ana kaynak danistaydir.',
    '- Diger hukuk alanlarinda varsayilan ana kaynak yargitaydir.',
    '- uyap sadece kullanici acikca BAM, istinaf, yerel mahkeme emsali, alt derece emsali veya UYAP karari istediginde eklenir.',
    '- Olay anlatiminda yerel mahkeme, ilk derece, istinaf sureci veya onceki karar gecmesi tek basina uyap secme nedeni degildir.',
    '- sourceTargets alani, Yargi MCP tarafindaki court_types aday havuzunu belirler; tek ana alan varsa gereksiz ikinci yuksek mahkeme ekleme.',
    '- optionalBirimCodes alanini yalnizca alan cok netse doldur; yoksa bos birak.',
    '- Kullanici acik kaynak secmedikce alakasiz ikinci yuksek mahkeme ekleme.',
].join('\n');

const buildSemanticSearchFieldRules = () => [
    'searchQuery alani Yargi MCPdeki initial_keyword rolunu tasir; ham kelime filtresi gibi dusun ve 1-3 cekirdek terimi virgulle ayir.',
    'searchQuery yalniz retrievalConcepts icindeki en guclu 2-3 hukuki omurgadan kurulur; supportConcepts ancak zorunluysa tek bir ek destek olarak girer.',
    'KRITIK KURAL: Halk agzi, gundelik anlatim, sokak dili veya serbest ifade bicimlerini retrievalConcepts, searchQuery ve coreIssue alanlarina ham haliyle koyma. Bu kurali ihlal eden plan HATALIDIR.',
    'Bu tip ifadeleri MUTLAKA resmi hukuk terminolojisine cevir. Kullanicinin kelimelerini kopyalama, Yargitay kararlarinda gecen resmi hukuki kavramlari kullan.',
    'searchQuery alaninda tam cumle, olay ozeti, paragraf, soru cumlesi veya mi/mi ekli dogal dil ifade kullanma.',
    'Ornek dogru searchQuery: fazla mesai, 45 saat; askerlik feshi, kidem tazminati; uyusturucu madde ticareti, kullanmak icin bulundurma; menfi tespit, bedelsiz bono; ayipli mal, sozlesmeden donme; muvazaali devir, katilma alacagi; fiil ehliyetsizligi, vasiyetnamenin iptali.',
    'semanticQuery alani Yargi MCPdeki query rolunu tasir; tek cumlelik dogal dil hukuki tez yaz.',
    'Ornek dogru semanticQuery: Muvazzaf askerlik nedeniyle fesheden iscinin kidem tazminati hakki tartisilmaktadir.',
    'searchQuery ve semanticQuery ayni metin olmasin; searchQuery virgulle ayrilmis keyword listesi, semanticQuery dogal dil tez olsun.',
].join('\n');

const buildReaderContext = (readerProfile = {}) => {
    if (!readerProfile || !readerProfile.cleanedText) return '';

    return [
        'Reader profile:',
        formatPromptJson({
            role: readerProfile.role,
            task: readerProfile.task,
            cleanedText: readerProfile.cleanedText,
            coreIssueHint: readerProfile.coreIssueHint,
            retrievalHints: readerProfile.retrievalHints,
            evidenceHints: readerProfile.evidenceHints,
            primaryDomainHint: readerProfile.primaryDomainHint,
            queryModeHint: readerProfile.queryModeHint,
            lowerCourtMentionMode: readerProfile.lowerCourtMentionMode,
            ignoredPhrases: readerProfile.ignoredPhrases,
        }),
        readerProfile.role || readerProfile.task
            ? `[!!!] STRATEJI UYARISI [!!!]\nKullanici bir ${readerProfile.role || 'taraf'} olarak arama yapiyor.\nHedefi: ${readerProfile.task || 'belirtilmemis'}\nKullanicinin bu hedefini (ornegin: kisisel kullanim, supheden sanik yararlanir vb.) KESINLIKLE negativeConcepts icine yazma! Aksine, bu savunma argumanina yonelik spesifik (kurtarici) kavramlari retrievalConcepts ve searchClauses icine yerlestir.`
            : '',
        readerProfile.lowerCourtMentionMode === 'history_only'
            ? 'Yerel mahkeme veya istinaf anlatimi sadece olay gecmisi; bunu alt derece emsal talebi sanma.'
            : '',
    ].filter(Boolean).join('\n');
};

const buildReaderInstruction = () => [
    'STAGE: reader',
    'Sen uzun Turk hukuku metnini arama oncesi ayiklayan AI okuyucusun.',
    'Gorevin metindeki sus cumlelerini, dosya anlatimini ve usul gecmisini ayirip geriye sadece aranacak hukuki cekirdegi birakmaktir.',
    'cleanedText alaninda metni 1-4 cumlelik temiz arama ozetine indir.',
    'coreIssueHint alaninda tek cumlelik hukuki meseleyi yaz.',
    'retrievalHints alaninda 2-5 kisa hukuki kavram yaz.',
    'evidenceHints alaninda puantaj, bordro, terazi, paketleme, mesaj, rapor, tutanak, fatura gibi delil ayrintilarini yaz.',
    'ignoredPhrases alaninda arama cekirdegi olmayan kaliplari yaz.',
    'KRITIK: Halk agzi ifadeleri retrievalHints veya coreIssueHint icine ham haliyle ASLA koyma. Once MUTLAKA resmi hukuk diline cevir.',
    'lowerCourtMentionMode alani yalnizca none, history_only veya explicit_request olsun.',
    'Metinde yerel mahkeme, BAM, istinaf veya onceki karar sadece olay gecmisi olarak geciyorsa lowerCourtMentionMode=history_only yaz.',
    'Kullanici acikca alt derece emsali, BAM karari, istinaf karari veya UYAP karari istiyorsa lowerCourtMentionMode=explicit_request yaz.',
    'uyusmazlik dosyasi icinde, dosya kapsaminda, beyanlar birlikte degerlendirildiginde, olaylar daginik sekilde anlatilmistir gibi kaliplari retrievalHints veya coreIssueHint icine tasima.',
    'queryModeHint alani short_issue, long_fact veya document_style olmali.',
    'primaryDomainHint alaninda en uygun hukuk alanini serbestce yaz; mumkunse kisa, normalize edilebilir ve snake_case uyumlu bir alan kullan.',
    'KRITIK: Eger metin bir iddianame, mutalaa, savunma, sorgu veya acikca ceza davasi ise, primaryDomainHint KESINLIKLE "ceza" olmalidir.',
    buildTerminologyGlossaryBlock(),
    'Sadece JSON dondur.',
].join('\n');

const buildScoutInstruction = ({ preferredSource = 'all', fallbackQueryMode = 'short_issue', readerProfile = null } = {}) => [
    'STAGE: scout',
    'Sen Turk hukuku karar aramasi icin once siniflandirma yapan AI scoutsun.',
    'Sadece JSON dondur.',
    `Kullanici kaynak tercihi: ${normalizeSource(preferredSource)}.`,
    `Eger emin olamazsan queryMode icin ${fallbackQueryMode} varsayimini kullan.`,
    buildSourceRules(),
    'riskTags alaninda su etiketlerden uygun olanlari yaz: source_target_risk, bucket_risk, compression_risk, statute_noise_risk, lower_court_risk.',
    'queryMode alani short_issue, long_fact veya document_style olmali.',
    'primaryDomain alaninda en uygun hukuk alanini serbestce yaz; mumkunse kisa, normalize edilebilir ve snake_case uyumlu bir alan kullan.',
    'DOMAIN UYARISI: saglik_hukuku yerine ceza, bankacilik_hukuku yerine ticaret, gayrimenkul_hukuku yerine gayrimenkul, kamulastirma yerine idare yaz. Alt-alan degil ust-alan kullan.',
    'KRITIK: Eger metin veya kullanici senaryosu bir iddianame, mutalaa veya savunma iseriyorsa, primaryDomain KESINLIKLE "ceza" olmalidir.',
    'allowEvidenceAsCore yalnizca delilin hukuka uygunlugu veya delil degeri ana konuysa true olsun.',
    'sourceTargets alaninda sadece yargitay, danistay, uyap veya anayasa yaz.',
    readerProfile?.cleanedText ? buildReaderContext(readerProfile) : '',
].filter(Boolean).join('\n\n');

const buildPlannerInstruction = ({ preferredSource = 'all', scoutProfile = {}, readerProfile = null, fewShotExamples = [], retryForbiddenTerms = [] } = {}) => [
    'STAGE: planner',
    'Sen Turk hukuku icin karar arama plani cikarirsin.',
    'Scout profiline sadik kal; acik celiski yoksa alan ve kaynak secimini bozma.',
    `Kullanici kaynak tercihi: ${normalizeSource(preferredSource)}.`,
    buildSourceRules(),
    'primaryDomain alanini sabit bir listeye daraltma; scout profiline uygun yeni bir hukuk alani gerekiyorsa aynen koru.',
    buildModeRules({
        queryMode: scoutProfile?.queryMode,
        primaryDomain: scoutProfile?.primaryDomain,
        allowEvidenceAsCore: scoutProfile?.allowEvidenceAsCore,
    }),
    buildSemanticSearchFieldRules(),
    'negativeConcepts alaninda yanlis alani isaret eden 0-4 kavram yaz. EGER KULLANICI SAVUNMA/TARAFLI ARAMA YAPIYORSA, KULLANICININ HEDEF SAVUNMA ARGUMANLARINI (ORN: KISISEL KULLANIM, SUPHEDEN SANIK YARARLANIR) ASLA BURAYA YAZMA!',
    'searchClauses alaninda retrievalConcepts ve supportConcepts uzerinden 2-4 kisa arama cumlesi yaz; searchQuery alanini uzun cumleye cevirme.',
    'Long_fact ve document_style icin olay anlatimini degil, aranabilir hukuki omurgayi yaz; puantaj, tanik, terazi, paketleme, makbuz gibi delilleri searchQuery icine tasima.',
    'Yerel mahkeme veya istinaf sureci sadece olay gecmisi olarak anlatiliyorsa sourceTargets icine uyap ekleme.',
    'Reader profile varsa cleanedText ve retrievalHints alanlarini oncele; ignoredPhrases icindeki kaliplari arama cekirdegi yapma.',
    'ARAMA STRATEJISI: searchClauses icinde 3 farkli strateji dene: A(Dar): Tam suc/kurum + madde; B(Ilke): Genel hukuki omurga; C(Daire): Hedef daire + kanun.',
    'DOMAIN UYARISI: primaryDomain saglik_hukuku, bankacilik_hukuku, fikri_ve_sinai_haklar gibi alt-alan YAZMA. Bunun yerine ceza, ticaret, gayrimenkul, borclar, idare gibi ust-alan adlarini dogrudan kullan.',
    'Sadece JSON dondur.',
    readerProfile?.cleanedText ? buildReaderContext(readerProfile) : '',
    'Scout profile:',
    formatPromptJson(scoutProfile),
    retryForbiddenTerms.length > 0 ? buildRetryConstraintInstruction(retryForbiddenTerms) : '',
    fewShotExamples.length > 0 ? 'Asagidaki orneklerdeki dogru plan davranisini taklit et, yanlis plan davranislarini tekrar etme:' : '',
    fewShotExamples.length > 0 ? renderFewShotExamples(fewShotExamples) : '',
].filter(Boolean).join('\n\n');

const buildReviewerInstruction = ({ preferredSource = 'all', scoutProfile = {}, readerProfile = null, draftPlan = {}, validationWarnings = [], fewShotExamples = [] } = {}) => [
    'STAGE: reviewer',
    'Sen bir taslak AI arama planini duzelten AI reviewersin.',
    'Gorevin yanlis kaynak secimini, zayif coreIssue yazimini, yanlis kavram kovalarini ve salt madde numarasi gurultusunu duzeltmektir.',
    'ONEMLI EK GOREV: retrievalConcepts ve searchQuery icinde halk agzi / gundelik dil ifadesi varsa bunlari MUTLAKA resmi hukuk terminine cevir. Bu en kritik review kontroludur.',
    `Kullanici kaynak tercihi: ${normalizeSource(preferredSource)}.`,
    buildSourceRules(),
    'primaryDomain alanini sabit bir listeye zorla cekme; dogruysa yeni ve dinamik hukuk alani adini koru.',
    buildModeRules({
        queryMode: draftPlan?.queryMode || scoutProfile?.queryMode,
        primaryDomain: draftPlan?.primaryDomain || scoutProfile?.primaryDomain,
        allowEvidenceAsCore: draftPlan?.allowEvidenceAsCore || scoutProfile?.allowEvidenceAsCore,
    }),
    buildSemanticSearchFieldRules(),
    'Review kontrolu: searchQuery uzunsa veya cumle halindeyse retrievalConcepts uzerinden kisalt.',
    'Review kontrolu: semanticQuery sadece keyword dizisi gibi kaldiysa coreIssue temelinde dogal dil teze cevir.',
    'Review kontrolu: sourceTargets gereksiz genisse court_types mantigina gore daralt.',
    'Review kontrolu: yerel mahkeme veya istinaf gecmisi sadece olay anlatimindaysa uyapi sourceTargets icinden cikar.',
    'Review kontrolu: Reader profile icindeki ignoredPhrases veya cleanedText ile celisen sargi cumlelerini cekirdekten temizle.',
    'Review kontrolu: retrievalConcepts icinde halk agzi ifade varsa (ornek: bozuk araba, mal kacirma, isten atildi, Alzheimer) bunlari Yargitay terminolojisine cevir (ornek: ayipli mal, muvazaali devir, haksiz fesih, fiil ehliyetsizligi).',
    'Review kontrolu: negativeConcepts icinde kullanicinin ASIL SAVUNMA HEDEFINI (ornek: kisi kisisel kullanim diyorsa kisisel kullanimi) curuten ifadeler varsa bunlari DERHAL SİL ve retrievalConcepts kismina tasi!',
    'Bos alan birakma. Duzenlenmis son JSON plani dondur.',
    readerProfile?.cleanedText ? buildReaderContext(readerProfile) : '',
    'Scout profile:',
    formatPromptJson(scoutProfile),
    'Validation warnings:',
    formatValidationWarnings(validationWarnings) || 'warning yok',
    'Taslak plan:',
    formatPromptJson({
        queryMode: draftPlan?.queryMode,
        primaryDomain: draftPlan?.primaryDomain,
        coreIssue: draftPlan?.coreIssue,
        searchQuery: draftPlan?.searchQuery,
        semanticQuery: draftPlan?.semanticQuery,
        retrievalConcepts: draftPlan?.retrievalConcepts,
        supportConcepts: draftPlan?.supportConcepts,
        evidenceConcepts: draftPlan?.evidenceConcepts,
        negativeConcepts: draftPlan?.negativeConcepts,
        sourceTargets: draftPlan?.targetSources || draftPlan?.sourceTargets,
        allowEvidenceAsCore: draftPlan?.allowEvidenceAsCore,
    }),
    fewShotExamples.length > 0 ? 'Asagidaki orneklerdeki dogru duzeltme davranisini uygula:' : '',
    fewShotExamples.length > 0 ? renderFewShotExamples(fewShotExamples) : '',
].filter(Boolean).join('\n\n');

const SCOUT_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        queryMode: { type: Type.STRING },
        primaryDomain: { type: Type.STRING },
        secondaryDomains: { type: Type.ARRAY, items: { type: Type.STRING } },
        allowEvidenceAsCore: { type: Type.BOOLEAN },
        sourceTargets: { type: Type.ARRAY, items: { type: Type.STRING } },
        riskTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        sourceReason: { type: Type.STRING },
        reasoning: { type: Type.STRING },
    },
    required: ['queryMode', 'primaryDomain', 'sourceTargets'],
};
const READER_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        cleanedText: { type: Type.STRING },
        coreIssueHint: { type: Type.STRING },
        retrievalHints: { type: Type.ARRAY, items: { type: Type.STRING } },
        evidenceHints: { type: Type.ARRAY, items: { type: Type.STRING } },
        primaryDomainHint: { type: Type.STRING },
        queryModeHint: { type: Type.STRING },
        lowerCourtMentionMode: { type: Type.STRING },
        ignoredPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
        reasoning: { type: Type.STRING },
    },
    required: ['cleanedText'],
};
const SHORT_ISSUE_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        queryMode: { type: Type.STRING },
        primaryDomain: { type: Type.STRING },
        secondaryDomains: { type: Type.ARRAY, items: { type: Type.STRING } },
        coreIssue: { type: Type.STRING },
        searchQuery: { type: Type.STRING },
        semanticQuery: { type: Type.STRING },
        searchClauses: { type: Type.ARRAY, items: { type: Type.STRING } },
        retrievalConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        supportConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        evidenceConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        negativeConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        sourceTargets: { type: Type.ARRAY, items: { type: Type.STRING } },
        optionalBirimCodes: { type: Type.ARRAY, items: { type: Type.STRING } },
        allowEvidenceAsCore: { type: Type.BOOLEAN },
        sourceReason: { type: Type.STRING },
        reasoning: { type: Type.STRING },
    },
    required: ['primaryDomain', 'coreIssue', 'retrievalConcepts'],
};

const CASE_FILE_SUMMARY_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        queryMode: { type: Type.STRING },
        primaryDomain: { type: Type.STRING },
        secondaryDomains: { type: Type.ARRAY, items: { type: Type.STRING } },
        coreIssue: { type: Type.STRING },
        allowEvidenceAsCore: { type: Type.BOOLEAN },
        reasoning: { type: Type.STRING },
    },
    required: ['primaryDomain', 'coreIssue'],
};

const CASE_FILE_PLAN_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        primaryDomain: { type: Type.STRING },
        secondaryDomains: { type: Type.ARRAY, items: { type: Type.STRING } },
        coreIssue: { type: Type.STRING },
        searchQuery: { type: Type.STRING },
        semanticQuery: { type: Type.STRING },
        searchClauses: { type: Type.ARRAY, items: { type: Type.STRING } },
        retrievalConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        supportConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        evidenceConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        negativeConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
        sourceTargets: { type: Type.ARRAY, items: { type: Type.STRING } },
        optionalBirimCodes: { type: Type.ARRAY, items: { type: Type.STRING } },
        allowEvidenceAsCore: { type: Type.BOOLEAN },
        sourceReason: { type: Type.STRING },
        reasoning: { type: Type.STRING },
    },
    required: ['primaryDomain', 'retrievalConcepts'],
};
const QUERY_EXPANSION_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        variants: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['variants'],
};

export const LEGAL_SEARCH_PLAN_RESPONSE_SCHEMA = SHORT_ISSUE_RESPONSE_SCHEMA;

export const shouldGenerateLegalSearchPlan = (rawText = '', keyword = '') => {
    const raw = normalizeDisplayText(rawText);
    if (!raw) return false;

    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const normalizedRaw = normalizeMatchText(raw);
    const compacted = normalizeDisplayText(keyword);
    const sentenceLike = /[,:;.]/.test(raw) || /(nedeniyle|halinde|talebi|gerekcesi|iddiasi|uyusmazligi)/.test(normalizedRaw);
    const legalSignal = /(ise iade|is sozlesmesi|kidem tazminati|fazla mesai|itirazin iptali|icra takibi|uyusturucu|tutuklama|arama karari|imar|yurutmenin durdurulmasi|vergi|nafaka|bireysel basvuru|fatura|ticari defter|cari hesap)/.test(normalizedRaw);

    return raw.length >= LONG_LEGAL_QUERY_MIN_CHARS
        || wordCount >= LONG_LEGAL_QUERY_MIN_WORDS
        || sentenceLike
        || legalSignal
        || raw.length - compacted.length > 20;
};

export const normalizeAiLegalSearchPlanWithDiagnostics = (value = {}, preferredSource = 'all') => {
    const rawText = normalizeDisplayText(value?.coreIssue || value?.semanticQuery || value?.searchQuery || value?.reasoning || '');
    const normalized = normalizePlanResult({
        rawText,
        preferredSource,
        parsed: value || {},
        attempt: 1,
    });

    return {
        plan: normalized.plan,
        planDiagnostics: {
            generationMode: 'provided',
            retryCount: 0,
            finalStatus: normalized.validationWarnings.length > 0 ? 'repaired' : 'accepted',
            validationWarnings: normalized.validationWarnings,
            scoutProfile: null,
            readerApplied: false,
            readerProfile: null,
            fewShotExampleIds: [],
            reviewApplied: false,
            transportRetryCount: 0,
            attempts: [{
                attempt: 1,
                stage: 'provided',
                queryMode: normalized.plan?.queryMode || 'short_issue',
                validationWarnings: normalized.validationWarnings,
                retryForbiddenTerms: [],
                fewShotExampleIds: [],
                transportRetryCount: 0,
            }],
        },
    };
};

export const normalizeAiLegalSearchPlan = (value = {}, preferredSource = 'all') =>
    normalizeAiLegalSearchPlanWithDiagnostics(value, preferredSource).plan;

const extractTextFromParts = (parts = []) =>
    (Array.isArray(parts) ? parts : [])
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter(Boolean);
const extractGeminiResponseText = (response = {}) => {
    const candidateParts = (Array.isArray(response?.candidates) ? response.candidates : [])
        .flatMap((candidate) => extractTextFromParts(candidate?.content?.parts));
    if (candidateParts.length > 0) return candidateParts.join('');
    const contentParts = extractTextFromParts(response?.content?.parts);
    if (contentParts.length > 0) return contentParts.join('');
    const directParts = extractTextFromParts(response?.parts);
    if (directParts.length > 0) return directParts.join('');
    const outputText = typeof response?.outputText === 'string' ? response.outputText : '';
    if (outputText) return outputText;
    if (typeof response?.text === 'string') return response.text;
    return '';
};
const generateStructuredJson = async ({
    model = MODEL_NAME,
    contents = '',
    systemInstruction = '',
    responseSchema = SHORT_ISSUE_RESPONSE_SCHEMA,
    apiKey = '',
} = {}) => {
    const ai = getGeminiClient(apiKey ? { apiKey } : {});
    const response = await ai.models.generateContent({
        model,
        contents,
        config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema,
        },
    });

    const responseText = extractGeminiResponseText(response);
    return safeJsonParse(responseText) || {};
};

const unwrapStructuredJsonResult = (result = {}) => {
    if (result && typeof result === 'object' && !Array.isArray(result) && Object.prototype.hasOwnProperty.call(result, 'parsed')) {
        return {
            parsed: result.parsed || {},
            transportRetryCount: Number(result.transportRetryCount) || 0,
        };
    }

    return {
        parsed: result || {},
        transportRetryCount: 0,
    };
};

const normalizeQueryExpansionVariants = ({
    variants = [],
    existingVariants = [],
    limit = QUERY_EXPANSION_MAX_VARIANTS,
} = {}) => {
    const seen = new Set(
        dedupeByMatchKey(existingVariants, Math.max(existingVariants.length, limit))
            .map((item) => normalizeMatchText(item))
            .filter(Boolean)
    );
    const normalizedVariants = [];

    for (const value of Array.isArray(variants) ? variants : []) {
        const normalized = normalizeDisplayText(value).slice(0, 120).trim();
        const matchKey = normalizeMatchText(normalized);
        if (!normalized || normalized.length < 3 || !matchKey || seen.has(matchKey)) continue;
        seen.add(matchKey);
        normalizedVariants.push(normalized);
        if (normalizedVariants.length >= limit) break;
    }

    return normalizedVariants;
};

const buildQueryExpansionPrompt = ({
    rawQuery = '',
    caseType = '',
    primaryDomain = '',
    existingVariants = [],
} = {}) => {
    const normalizedExistingVariants = dedupeByMatchKey(existingVariants, QUERY_EXPANSION_MAX_VARIANTS)
        .map((item) => normalizeDisplayText(item).trim())
        .filter(Boolean);

    // Build domain-aware negative example hint to prevent cross-domain concept bleed.
    const negativeDomainHints = [
        caseType?.includes('kira_ihtiyac') || rawQuery?.includes('ihtiyac') && rawQuery?.includes('tahliye')
            ? 'YAZMA (ihtiyac tahliyesi davasi icin): TUFE, kira artisi, TBK 344, enflasyon — bunlar kira artis davasina aittir.'
            : '',
        caseType?.includes('itirazin_iptali') || rawQuery?.includes('itirazin iptali')
            ? 'YAZMA (itirazin iptali davasi icin): tahliye, kira, kiralayan, kira bedeli — bunlar kira davasina aittir.'
            : '',
        caseType?.includes('borclar_kira') && !rawQuery?.includes('ihtiyac')
            ? 'YAZMA (kira davasi icin): icra takibi, konkordato, ihalenin feshi — bunlar icra davasina aittir.'
            : '',
    ].filter(Boolean);

    return [
        'Sen Turkce mahkeme karari aramalarini genisleten bir hukuk asistanisin.',
        'Verilen hukuki sorgu icin Yargitay, Danistay ve BAM karar metinlerinde gecmesi muhtemel EK hukuki ifade varyantlari uret.',
        `Sorgu: ${JSON.stringify(normalizeDisplayText(rawQuery).trim())}`,
        `Birincil domain: ${DOMAIN_LABELS[normalizeDomainId(primaryDomain, DEFAULT_DOMAIN_PROFILE_ID)] || normalizeDisplayText(primaryDomain || '') || 'Genel Hukuk'}`,
        `Dava tipi / alt alan: ${normalizeDisplayText(caseType || '').trim() || 'belirtilmedi'}. Bu dava tipine UYMAYAN kavramlar uretme.`,
        `Mevcut varyantlar: ${JSON.stringify(normalizedExistingVariants)}`,
        'Kurallar:',
        `1. ${QUERY_EXPANSION_MIN_VARIANTS} ile ${QUERY_EXPANSION_MAX_VARIANTS} arasinda EK varyant uret.`,
        '2. Mevcut varyantlari tekrar etme.',
        '3. Sadece gercek Turk hukuk terminolojisi kullan.',
        '4. Gerekliyse kanun ve madde kisaltmalari ekle.',
        '5. Gundelik dil yerine karar metni dili kullan.',
        '6. Kisa arama ifadesi yaz; uzun aciklayici cumle kurma.',
        '7. KRITIK: Sadece bu dava tipiyle DOGRUDAN ilgili kavramlar yaz. Baska dava tipine ait kavramlari YAZMA.',
        '8. KRITIK: Operatör KULLANMA. +, -, ", AND, OR sembolleri yasak. Sadece saf hukuki kavram yaz.',
        ...negativeDomainHints,
        'Yanit yalnizca JSON nesnesi olsun: {"variants":["varyant1","varyant2"]}',
    ].join('\n');
};

const invokeStructuredJsonWithRetry = async ({
    model = MODEL_NAME,
    contents = '',
    systemInstruction = '',
    responseSchema = SHORT_ISSUE_RESPONSE_SCHEMA,
    generateStructuredJsonImpl = generateStructuredJson,
    apiKey = '',
} = {}) => {
    let transportRetryCount = 0;

    while (true) {
        try {
            const rawResult = await generateStructuredJsonImpl({
                model,
                contents,
                systemInstruction,
                responseSchema,
                apiKey,
            });
            const normalized = unwrapStructuredJsonResult(rawResult);
            return {
                parsed: normalized.parsed || {},
                transportRetryCount: transportRetryCount + normalized.transportRetryCount,
            };
        } catch (error) {
            if (transportRetryCount >= STRUCTURED_JSON_RETRY_DELAYS_MS.length || !isTransientGenerationError(error)) {
                throw error;
            }
            const delayMs = STRUCTURED_JSON_RETRY_DELAYS_MS[transportRetryCount] || 0;
            transportRetryCount += 1;
            await sleep(delayMs);
        }
    }
};

export const expandQueryWithGemini = async ({
    rawQuery = '',
    caseType = '',
    primaryDomain = '',
    existingVariants = [],
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const normalizedRawQuery = normalizeDisplayText(rawQuery).slice(0, 240).trim();
    const usingLiveTransport = generateStructuredJsonImpl === generateStructuredJson;
    const hasGeminiKey = Boolean(String(GEMINI_LEGAL_QUERY_EXPANSION_API_KEY || '').trim());

    if (normalizedRawQuery.length < 3) return [];
    if (usingLiveTransport && process.env.NODE_ENV === 'test') return [];
    if (usingLiveTransport && !hasGeminiKey) return [];

    try {
        const { parsed } = await invokeStructuredJsonWithRetry({
            model: QUERY_EXPANSION_MODEL_NAME,
            contents: buildQueryExpansionPrompt({
                rawQuery: normalizedRawQuery,
                caseType,
                primaryDomain,
                existingVariants,
            }),
            systemInstruction: 'Turk hukuk karar aramalari icin tekrar etmeyen, kisa ve resmi query varyantlari uret.',
            responseSchema: QUERY_EXPANSION_RESPONSE_SCHEMA,
            generateStructuredJsonImpl,
            apiKey: GEMINI_LEGAL_QUERY_EXPANSION_API_KEY,
        });

        return normalizeQueryExpansionVariants({
            variants: parsed?.variants,
            existingVariants,
        });
    } catch (error) {
        if (usingLiveTransport) {
            console.warn('[legal-search-plan] Gemini query expansion fallback:', error?.message || error);
        }
        return [];
    }
};

const buildPlanResponseSchema = (queryMode = 'short_issue') =>
    queryMode === 'short_issue' ? SHORT_ISSUE_RESPONSE_SCHEMA : CASE_FILE_PLAN_SCHEMA;

const buildPlannerSeed = ({ rawText = '', parsed = {}, scoutProfile = {}, readerProfile = null } = {}) => ({
    ...parsed,
    queryMode: normalizeQueryMode(
        parsed?.queryMode || scoutProfile?.queryMode || readerProfile?.queryModeHint || 'short_issue',
        'short_issue'
    ),
    primaryDomain: normalizePrimaryDomain(
        parsed?.primaryDomain || parsed?.legalArea || scoutProfile?.primaryDomain || readerProfile?.primaryDomainHint || DEFAULT_DOMAIN_PROFILE_ID
    ),
    secondaryDomains: Array.isArray(parsed?.secondaryDomains) && parsed.secondaryDomains.length > 0
        ? parsed.secondaryDomains
        : (scoutProfile?.secondaryDomains || []),
    coreIssue: normalizeDisplayText(parsed?.coreIssue || readerProfile?.coreIssueHint || ''),
    retrievalConcepts: Array.isArray(parsed?.retrievalConcepts) && parsed.retrievalConcepts.length > 0
        ? parsed.retrievalConcepts
        : (readerProfile?.retrievalHints || []),
    evidenceConcepts: Array.isArray(parsed?.evidenceConcepts) && parsed.evidenceConcepts.length > 0
        ? parsed.evidenceConcepts
        : (readerProfile?.evidenceHints || []),
    allowEvidenceAsCore: resolveAllowEvidenceAsCore({
        requested: Boolean(parsed?.allowEvidenceAsCore) || Boolean(scoutProfile?.allowEvidenceAsCore),
        texts: [rawText, parsed?.coreIssue, parsed?.semanticQuery, parsed?.searchQuery, parsed?.reasoning, readerProfile?.coreIssueHint],
    }),
    sourceTargets: Array.isArray(parsed?.sourceTargets) && parsed.sourceTargets.length > 0
        ? parsed.sourceTargets
        : (scoutProfile?.sourceTargets || []),
    sourceReason: normalizeDisplayText(parsed?.sourceReason || scoutProfile?.sourceReason || ''),
    reasoning: normalizeDisplayText(parsed?.reasoning || readerProfile?.reasoning || scoutProfile?.reasoning || ''),
});

const runReaderAttempt = async ({
    rawText = '',
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const { parsed, transportRetryCount } = await invokeStructuredJsonWithRetry({
        contents: rawText,
        systemInstruction: buildReaderInstruction(),
        responseSchema: READER_RESPONSE_SCHEMA,
        generateStructuredJsonImpl,
    });

    return {
        readerProfile: normalizeReaderProfile({ rawText, parsed }),
        transportRetryCount,
    };
};

const runScoutAttempt = async ({
    rawText = '',
    preferredSource = 'all',
    fallbackQueryMode = 'short_issue',
    readerProfile = null,
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const { parsed, transportRetryCount } = await invokeStructuredJsonWithRetry({
        contents: rawText,
        systemInstruction: buildScoutInstruction({ preferredSource, fallbackQueryMode, readerProfile }),
        responseSchema: SCOUT_RESPONSE_SCHEMA,
        generateStructuredJsonImpl,
    });

    return {
        scoutProfile: normalizeScoutProfile({
            rawText,
            preferredSource,
            parsed,
            fallbackQueryMode,
        }),
        transportRetryCount,
    };
};

const runPlannerAttempt = async ({
    rawText = '',
    preferredSource = 'all',
    scoutProfile = {},
    readerProfile = null,
    attempt = 1,
    retryForbiddenTerms = [],
    fewShotExamples = [],
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const queryMode = normalizeQueryMode(scoutProfile?.queryMode || 'short_issue', 'short_issue');
    const { parsed, transportRetryCount } = await invokeStructuredJsonWithRetry({
        contents: rawText,
        systemInstruction: buildPlannerInstruction({
            preferredSource,
            scoutProfile,
            readerProfile,
            fewShotExamples,
            retryForbiddenTerms,
        }),
        responseSchema: buildPlanResponseSchema(queryMode),
        generateStructuredJsonImpl,
    });

    return {
        ...normalizePlanResult({
            rawText,
            preferredSource,
            parsed: buildPlannerSeed({ rawText, parsed, scoutProfile, readerProfile }),
            attempt,
        }),
        transportRetryCount,
        fewShotExampleIds: collectFewShotExampleIds(fewShotExamples),
    };
};

const runReviewerAttempt = async ({
    rawText = '',
    preferredSource = 'all',
    scoutProfile = {},
    readerProfile = null,
    draftPlan = {},
    validationWarnings = [],
    fewShotExamples = [],
    attempt = 2,
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const queryMode = normalizeQueryMode(draftPlan?.queryMode || scoutProfile?.queryMode || 'short_issue', 'short_issue');
    const { parsed, transportRetryCount } = await invokeStructuredJsonWithRetry({
        contents: rawText,
        systemInstruction: buildReviewerInstruction({
            preferredSource,
            scoutProfile,
            readerProfile,
            draftPlan,
            validationWarnings,
            fewShotExamples,
        }),
        responseSchema: buildPlanResponseSchema(queryMode),
        generateStructuredJsonImpl,
    });

    return {
        ...normalizePlanResult({
            rawText,
            preferredSource,
            parsed: buildPlannerSeed({ rawText, parsed, scoutProfile, readerProfile }),
            attempt,
        }),
        transportRetryCount,
        fewShotExampleIds: collectFewShotExampleIds(fewShotExamples),
    };
};

export const generateLegalSearchPlanWithDiagnostics = async ({
    rawText = '',
    preferredSource = 'all',
    generateStructuredJsonImpl = generateStructuredJson,
} = {}) => {
    const normalizedRawText = normalizeDisplayText(rawText);
    const normalizedPreferredSource = normalizeSource(preferredSource, 'all');
    if (normalizedRawText.length < 2) {
        const error = new Error('rawText en az 2 karakter olmali.');
        error.status = 400;
        throw error;
    }

    const heuristicQueryMode = classifyQueryMode(normalizedRawText);
    let transportRetryCount = 0;
    let readerProfile = null;
    let readerApplied = false;
    let planningRawText = normalizedRawText;
    const attempts = [];

    if (shouldApplyReaderStage({ rawText: normalizedRawText, queryMode: heuristicQueryMode })) {
        try {
            const readerAttempt = await runReaderAttempt({
                rawText: normalizedRawText,
                generateStructuredJsonImpl,
            });
            transportRetryCount += readerAttempt.transportRetryCount;
            readerProfile = readerAttempt.readerProfile;
            readerApplied = Boolean(readerProfile?.cleanedText);
            planningRawText = normalizeDisplayText(readerProfile?.cleanedText || readerProfile?.coreIssueHint || normalizedRawText) || normalizedRawText;
            attempts.push({
                attempt: 0,
                stage: 'reader',
                queryMode: readerProfile?.queryModeHint || heuristicQueryMode,
                validationWarnings: [],
                retryForbiddenTerms: [],
                fewShotExampleIds: [],
                transportRetryCount: readerAttempt.transportRetryCount,
                cleanedText: readerProfile?.cleanedText || '',
                ignoredPhrases: readerProfile?.ignoredPhrases || [],
            });
        } catch (error) {
            attempts.push({
                attempt: 0,
                stage: 'reader_failed',
                queryMode: heuristicQueryMode,
                validationWarnings: [],
                retryForbiddenTerms: [],
                fewShotExampleIds: [],
                transportRetryCount: 0,
                error: error?.message || String(error || ''),
            });
            readerProfile = null;
            readerApplied = false;
            planningRawText = normalizedRawText;
        }
    }

    const initialQueryMode = normalizeQueryMode(readerProfile?.queryModeHint || heuristicQueryMode, heuristicQueryMode || 'short_issue');
    const initialPrimaryDomain = normalizePrimaryDomain(readerProfile?.primaryDomainHint || inferPrimaryDomainFromText(planningRawText));
    let scoutProfile = normalizeScoutProfile({
        rawText: planningRawText,
        preferredSource: normalizedPreferredSource,
        parsed: {
            queryMode: initialQueryMode,
            primaryDomain: initialPrimaryDomain,
            riskTags: buildHeuristicScoutRiskTags({
                rawText: planningRawText,
                queryMode: initialQueryMode,
                primaryDomain: initialPrimaryDomain,
            }),
        },
        fallbackQueryMode: initialQueryMode,
    });

    try {
        const scoutAttempt = await runScoutAttempt({
            rawText: planningRawText,
            preferredSource: normalizedPreferredSource,
            fallbackQueryMode: initialQueryMode,
            readerProfile,
            generateStructuredJsonImpl,
        });
        scoutProfile = scoutAttempt.scoutProfile;
        transportRetryCount += scoutAttempt.transportRetryCount;
    } catch (error) {
        attempts.push({
            attempt: attempts.length > 0 ? 1 : 0,
            stage: 'scout_failed',
            queryMode: initialQueryMode,
            validationWarnings: [],
            retryForbiddenTerms: [],
            fewShotExampleIds: [],
            transportRetryCount: 0,
            error: error?.message || String(error || ''),
        });
        // Scout dugumu dusse bile heuristic profil ile devam et.
    }

    const plannerExamples = selectFewShotExamples({
        primaryDomain: scoutProfile.primaryDomain,
        queryMode: scoutProfile.queryMode,
        riskTags: scoutProfile.riskTags,
        stage: 'planner',
        maxExamples: scoutProfile.queryMode === 'short_issue' ? 4 : 6,
    });
    const plannerExampleIds = collectFewShotExampleIds(plannerExamples);

    let firstAttempt;
    try {
        firstAttempt = await runPlannerAttempt({
            rawText: planningRawText,
            preferredSource: normalizedPreferredSource,
            scoutProfile,
            readerProfile,
            attempt: 1,
            retryForbiddenTerms: [],
            fewShotExamples: plannerExamples,
            generateStructuredJsonImpl,
        });
        transportRetryCount += firstAttempt.transportRetryCount;
    } catch (error) {
        attempts.push({
            attempt: 1,
            stage: 'planner_failed',
            queryMode: scoutProfile.queryMode,
            validationWarnings: [],
            retryForbiddenTerms: [],
            fewShotExampleIds: plannerExampleIds,
            transportRetryCount: 0,
            error: error?.message || String(error || ''),
        });
        const fallbackAttempt = buildMinimalFallbackPlan({
            rawText: planningRawText,
            preferredSource: normalizedPreferredSource,
            seedPlan: {
                ...scoutProfile,
                coreIssue: readerProfile?.coreIssueHint || scoutProfile?.coreIssue,
                retrievalConcepts: readerProfile?.retrievalHints || scoutProfile?.retrievalConcepts,
                evidenceConcepts: readerProfile?.evidenceHints || scoutProfile?.evidenceConcepts,
            },
            attempt: 1,
        });
        return {
            plan: fallbackAttempt.plan,
            planDiagnostics: {
                generationMode: 'always',
                retryCount: 0,
                finalStatus: 'fallback',
                validationWarnings: fallbackAttempt.validationWarnings,
                scoutProfile,
                readerApplied,
                readerProfile,
                fewShotExampleIds: plannerExampleIds,
                reviewApplied: false,
                transportRetryCount,
                attempts: [
                    ...attempts,
                    {
                        attempt: 1,
                        stage: 'fallback',
                        queryMode: fallbackAttempt.plan?.queryMode || scoutProfile.queryMode,
                        validationWarnings: fallbackAttempt.validationWarnings,
                        retryForbiddenTerms: [],
                        fewShotExampleIds: plannerExampleIds,
                        transportRetryCount: 0,
                    },
                ],
            },
        };
    }

    const retryForbiddenTerms = buildRetryForbiddenTerms(firstAttempt.validationWarnings);
    attempts.push({
        attempt: 1,
        stage: 'generated',
        queryMode: firstAttempt.plan?.queryMode || scoutProfile.queryMode,
        validationWarnings: firstAttempt.validationWarnings,
        retryForbiddenTerms,
        fewShotExampleIds: firstAttempt.fewShotExampleIds,
        transportRetryCount: firstAttempt.transportRetryCount,
    });

    let plannerRetryCount = 0;
    let selectedResult = firstAttempt;
    let allValidationWarnings = [...firstAttempt.validationWarnings];

    if (!firstAttempt.isValid) {
        try {
            const secondAttempt = await runPlannerAttempt({
                rawText: planningRawText,
                preferredSource: normalizedPreferredSource,
                scoutProfile,
                readerProfile,
                attempt: 2,
                retryForbiddenTerms,
                fewShotExamples: plannerExamples,
                generateStructuredJsonImpl,
            });
            transportRetryCount += secondAttempt.transportRetryCount;
            plannerRetryCount = 1;
            const secondRetryForbiddenTerms = buildRetryForbiddenTerms(secondAttempt.validationWarnings);
            attempts.push({
                attempt: 2,
                stage: 'retry',
                queryMode: secondAttempt.plan?.queryMode || scoutProfile.queryMode,
                validationWarnings: secondAttempt.validationWarnings,
                retryForbiddenTerms: secondRetryForbiddenTerms,
                fewShotExampleIds: secondAttempt.fewShotExampleIds,
                transportRetryCount: secondAttempt.transportRetryCount,
            });
            selectedResult = chooseBetterPlanResult(firstAttempt, secondAttempt);
            allValidationWarnings = mergeValidationWarnings(firstAttempt.validationWarnings, secondAttempt.validationWarnings);
        } catch (error) {
            attempts.push({
                attempt: 2,
                stage: 'retry_failed',
                queryMode: scoutProfile.queryMode,
                validationWarnings: [],
                retryForbiddenTerms: [],
                fewShotExampleIds: plannerExampleIds,
                transportRetryCount: 0,
                error: error?.message || String(error || ''),
            });
            selectedResult = firstAttempt;
            allValidationWarnings = mergeValidationWarnings(firstAttempt.validationWarnings);
        }
    }

    let reviewApplied = false;
    let reviewExampleIds = [];
    let reviewChanged = false;
    if (shouldApplyPlanReview({
        scoutProfile,
        plan: selectedResult?.plan,
        validationWarnings: selectedResult?.validationWarnings,
    })) {
        reviewApplied = true;
        const reviewExamples = selectFewShotExamples({
            primaryDomain: scoutProfile.primaryDomain,
            queryMode: scoutProfile.queryMode,
            riskTags: mergeRiskTags(
                scoutProfile.riskTags || [],
                (selectedResult?.validationWarnings || []).map((warning) => warning?.reason || '')
            ),
            stage: 'reviewer',
            maxExamples: scoutProfile.queryMode === 'short_issue' ? 4 : 6,
        });
        reviewExampleIds = collectFewShotExampleIds(reviewExamples);
        try {
            const reviewAttempt = await runReviewerAttempt({
                rawText: planningRawText,
                preferredSource: normalizedPreferredSource,
                scoutProfile,
                readerProfile,
                draftPlan: selectedResult.plan,
                validationWarnings: selectedResult.validationWarnings,
                fewShotExamples: reviewExamples,
                attempt: plannerRetryCount > 0 ? 3 : 2,
                generateStructuredJsonImpl,
            });
            transportRetryCount += reviewAttempt.transportRetryCount;
            attempts.push({
                attempt: plannerRetryCount > 0 ? 3 : 2,
                stage: 'review',
                queryMode: reviewAttempt.plan?.queryMode || scoutProfile.queryMode,
                validationWarnings: reviewAttempt.validationWarnings,
                retryForbiddenTerms: buildRetryForbiddenTerms(reviewAttempt.validationWarnings),
                fewShotExampleIds: reviewAttempt.fewShotExampleIds,
                transportRetryCount: reviewAttempt.transportRetryCount,
            });
            const nextSelectedResult = chooseBetterPlanResult(selectedResult, reviewAttempt);
            reviewChanged = JSON.stringify(nextSelectedResult?.plan || {}) !== JSON.stringify(selectedResult?.plan || {});
            selectedResult = nextSelectedResult;
            allValidationWarnings = mergeValidationWarnings(allValidationWarnings, reviewAttempt.validationWarnings);
        } catch (error) {
            attempts.push({
                attempt: plannerRetryCount > 0 ? 3 : 2,
                stage: 'review_failed',
                queryMode: scoutProfile.queryMode,
                validationWarnings: [],
                retryForbiddenTerms: [],
                fewShotExampleIds: reviewExampleIds,
                transportRetryCount: 0,
                error: error?.message || String(error || ''),
            });
            reviewApplied = false;
        }
    }

    if (!selectedResult?.isValid) {
        const fallbackAttempt = buildMinimalFallbackPlan({
            rawText: planningRawText,
            preferredSource: normalizedPreferredSource,
            seedPlan: {
                ...(selectedResult?.plan || scoutProfile),
                coreIssue: selectedResult?.plan?.coreIssue || readerProfile?.coreIssueHint || scoutProfile?.coreIssue,
                retrievalConcepts: (selectedResult?.plan?.retrievalConcepts?.length ? selectedResult.plan.retrievalConcepts : (readerProfile?.retrievalHints || scoutProfile?.retrievalConcepts)),
                evidenceConcepts: (selectedResult?.plan?.evidenceConcepts?.length ? selectedResult.plan.evidenceConcepts : (readerProfile?.evidenceHints || scoutProfile?.evidenceConcepts)),
            },
            attempt: plannerRetryCount > 0 || reviewApplied ? 4 : 3,
        });
        attempts.push({
            attempt: plannerRetryCount > 0 || reviewApplied ? 4 : 3,
            stage: 'fallback',
            queryMode: fallbackAttempt.plan?.queryMode || scoutProfile.queryMode,
            validationWarnings: fallbackAttempt.validationWarnings,
            retryForbiddenTerms: [],
            fewShotExampleIds: [],
            transportRetryCount: 0,
        });
        return {
            plan: fallbackAttempt.plan,
            planDiagnostics: {
                generationMode: 'always',
                retryCount: plannerRetryCount,
                finalStatus: 'fallback',
                validationWarnings: mergeValidationWarnings(allValidationWarnings, fallbackAttempt.validationWarnings),
                scoutProfile,
                readerApplied,
                readerProfile,
                fewShotExampleIds: dedupeByMatchKey([...plannerExampleIds, ...reviewExampleIds], 12),
                reviewApplied,
                transportRetryCount,
                attempts,
            },
        };
    }

    return {
        plan: selectedResult.plan,
        planDiagnostics: {
            generationMode: 'always',
            retryCount: plannerRetryCount,
            finalStatus: plannerRetryCount > 0 ? 'retried' : (reviewChanged ? 'repaired' : 'accepted'),
            validationWarnings: allValidationWarnings,
            scoutProfile,
            readerApplied,
            readerProfile,
            fewShotExampleIds: dedupeByMatchKey([...plannerExampleIds, ...reviewExampleIds], 12),
            reviewApplied,
            transportRetryCount,
            attempts,
        },
    };
};
export const generateLegalSearchPlan = async ({ rawText = '', preferredSource = 'all' } = {}) =>
    (await generateLegalSearchPlanWithDiagnostics({ rawText, preferredSource })).plan;

export const __testables = {
    classifyQueryMode,
    splitConceptBuckets,
    buildSearchRounds,
    hasEvidenceCoreHint,
    isEvidenceLikeConcept,
    validateAndRepairPlan,
    buildRetryForbiddenTerms,
    buildRetryConstraintInstruction,
    buildMinimalFallbackPlan,
    buildSearchQuery,
    buildSemanticQuery,
    isLikelyNaturalLanguageQuery,
    isLikelyKeywordQuery,
};














