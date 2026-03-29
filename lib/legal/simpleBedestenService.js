import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeLegalInput } from './legal-text-utils.js';
import {
    normalizeExplicitLegalSearchPacket,
    resolveLegalSearchContract,
} from './legal-search-packet-adapter.js';
import { buildSkillBackedSearchPackage } from './legal-search-skill.js';
import { expandQueryWithGemini } from '../../backend/gemini/legal-search-plan-core.js';
import { generateAgenticDomainSignals } from '../../backend/gemini/agentic-domain-signals.js';
import { buildAgentSignalBundle, judgeDecisionSet } from './agentPipeline.js';
import {
    computeEmbeddingScore,
    getEmbedding,
    isEmbeddingRerankEnabled,
    mergeDocumentScores,
} from './embeddingReranker.js';
import { docFetchRequest } from './requestThrottle.js';
import {
    DEFAULT_DOMAIN_PROFILE_ID,
    normalizeDomainId,
} from './legalDomainProfiles.js';

const SIMPLE_BEDESTEN_BASE_URL = String(
    process.env.LEGAL_SIMPLE_BEDESTEN_URL || 'https://bedesten.adalet.gov.tr'
).trim().replace(/\/+$/g, '');

const SIMPLE_BEDESTEN_TIMEOUT_MS = Math.max(
    5000,
    Math.min(60000, Number(process.env.LEGAL_SIMPLE_BEDESTEN_TIMEOUT_MS || 20000))
);
const execFileAsync = promisify(execFile);

const SIMPLE_BEDESTEN_HEADERS = {
    Accept: '*/*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    AdaletApplicationName: 'UyapMevzuat',
    'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://mevzuat.adalet.gov.tr',
    Referer: 'https://mevzuat.adalet.gov.tr/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

const SEARCH_ENDPOINT = '/emsal-karar/searchDocuments';
const DOCUMENT_ENDPOINT = '/emsal-karar/getDocumentContent';
const SIMPLE_DEFAULT_PAGE_SIZE = 20;
const SIMPLE_PRO_PAGE_SIZE = 35;
const SIMPLE_MAX_TARGET_BIRIM_CODES = Math.max(
    2,
    Math.min(6, Number(process.env.LEGAL_SIMPLE_MAX_TARGET_BIRIM_CODES || 4))
);
const SIMPLE_PARALLEL_VARIANT_LIMIT = Math.max(
    1,
    Math.min(5, Number(process.env.LEGAL_SIMPLE_PARALLEL_VARIANT_LIMIT || 5))
);
const SIMPLE_EXPANDED_PACKET_VARIANT_LIMIT = Math.max(
    SIMPLE_PARALLEL_VARIANT_LIMIT,
    Math.min(10, Number(process.env.LEGAL_SIMPLE_EXPANDED_PACKET_VARIANT_LIMIT || 10))
);
const SIMPLE_CONTENT_DOC_CONCURRENCY = Math.max(
    1,
    Math.min(6, Number(process.env.LEGAL_SIMPLE_CONTENT_DOC_CONCURRENCY || 4))
);
const SIMPLE_METADATA_CANDIDATE_LIMIT = Math.max(
    100,
    Math.min(150, Number(process.env.LEGAL_SIMPLE_METADATA_CANDIDATE_LIMIT || 125))
);
const SIMPLE_CONTENT_FETCH_LIMIT = Math.max(
    20,
    Math.min(30, Number(process.env.LEGAL_SIMPLE_CONTENT_FETCH_LIMIT || 25))
);

const createAsyncLimit = (concurrency = 4) => {
    let active = 0;
    const queue = [];

    const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        active += 1;
        const { fn, resolve, reject } = queue.shift();
        fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                active -= 1;
                next();
            });
    };

    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
};

const SIMPLE_SOURCE_COURTS = {
    all: ['YARGITAYKARARI', 'DANISTAYKARAR'],
    yargitay: ['YARGITAYKARARI'],
    danistay: ['DANISTAYKARAR'],
    anayasa: ['ANAYASA'],
};

const SIMPLE_SEARCH_AREA_COURTS = {
    auto: ['YARGITAYKARARI', 'DANISTAYKARAR'],
    ceza: ['YARGITAYKARARI'],
    hukuk: ['YARGITAYKARARI'],
    danistay: ['DANISTAYKARAR'],
    bam: ['ISTINAFHUKUK'],
};

const BEDDESTEN_ITEM_SOURCE_MAP = {
    YARGITAYKARARI: 'yargitay',
    DANISTAYKARAR: 'danistay',
    YERELHUKUK: 'uyap',
    ISTINAFHUKUK: 'uyap',
    KYB: 'uyap',
};

const QUERY_STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'ama', 'fakat', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'su',
    'daha', 'kadar', 'sonra', 'once', 'tum', 'her', 'davaci', 'davali', 'muvekkil', 'sanik',
    'mahkeme', 'karar', 'davasi', 'dosya', 'nedeniyle', 'sebebiyle', 'kapsaminda', 'geregi',
    'gerektigi', 'iddia', 'savunma', 'olay', 'metin', 'talepleri', 'talebi', 'edilmesi',
    'mahkemece', 'mahkemesince', 'dairesince', 'istinaf', 'temyiz', 'bozma', 'direnme',
    'esastan', 'reddine', 'duzeltilerek', 'uyarinca', 'maddeleri', 'maddesi', 'tarihli',
    'tarihli', 'tarihinin', 'sayili', 'hukuki', 'surec', 'hukuki', 'hukumlerin', 'hukumleri',
    'hukum', 'verilen', 'gonderilen', 'gonderildigi', 'inceleme', 'kararin', 'kararina',
    'karariyla', 'mahsuba',
]);

const SHORT_LEGAL_TOKENS = new Set([
    'tck', 'cmk', 'tbk', 'tmk', 'hmk', 'iik', 'ttk', 'iyuk', 'vuk', 'sgk', 'bam', 'ise',
]);

const DANISTAY_BIRIM_PREFIXES = new Set(['D', 'V']);
const YARGITAY_BIRIM_PREFIXES = new Set(['H', 'C']);
const SPECIAL_BIRIM_CODES = new Set(['HGK', 'CGK', 'VDDK']);

const COMPACT_QUERY_PHRASE_ANCHORS = [
    'cocugun cinsel istismari',
    'cinsel istismar',
    'kisiyi hurriyetinden yoksun kilma',
    'itirazin iptali',
    'menfi tespit',
    'istirdat davasi',
    'ise iade',
    'gecersiz fesih',
    'kidem tazminati',
    'ihbar tazminati',
    'fazla mesai',
    'bosanma',
    'velayet',
    'nafaka',
    'tam yargi davasi',
    'hizmet kusuru',
    'idari para cezasi',
    'uyusturucu madde',
    'kullanmak icin bulundurma',
    'uyusturucu madde ticareti',
    'hirsizlik',
    'guveni kotuye kullanma',
    'sebepsiz zenginlesme',
    'sozlesmeye aykirilik',
    'ticari temerrut',
    'haksiz fiil',
    'muris muvazaasi',
];

const CEZA_DRUG_SUBSTANCE_TOKENS = [
    'metamfetamin',
    'kokain',
    'eroin',
    'pregabalin',
    'kannabinoid',
    'sentetik',
];

const CEZA_DRUG_EVIDENCE_TOKENS = [
    'paketleme',
    'fiziki',
    'takip',
    'kullanici',
    'tanik',
];

const PROCEDURAL_DECISION_MARKERS = [
    'temyiz isteminin reddi',
    'temyiz istemi',
    'temyiz sebepleri',
    'esastan reddi',
    'istinaf basvurusunun esastan reddi',
    'karsi oy',
    'karsi oy gerekcesi',
    'hukuka kesin aykirilik',
    'cmk 294',
    'cmk 298',
    'sure asimi',
    'usulden ret',
    'gorev yonunden',
    'yetki yonunden',
    'karar kaldirma',
    'kesinlik siniri',
    'ilk inceleme',
    'dava sarti',
];

const DOMAIN_SUBSTANTIVE_SIGNAL_MAP = {
    ceza: [
        'tck 188',
        'tck 191',
        'uyusturucu madde ticareti',
        'kullanmak icin bulundurma',
        'ticaret kasti',
        'kisisel kullanim siniri',
        'fiziki takip',
        'kullanici tanik',
        'paketleme',
        'supheden sanik yararlanir',
    ],
    is_hukuku: [
        'ise iade',
        'gecersiz fesih',
        'kidem tazminati',
        'ihbar tazminati',
        'fazla mesai',
        'mobbing',
        'sendikal fesih',
        'ise baslatmama',
    ],
    aile: [
        'bosanma',
        'kusur durumu',
        'velayet',
        'nafaka',
        'ziynet',
        'mal rejimi',
        'kisisel iliski',
    ],
    borclar: [
        'sozlesmeye aykirilik',
        'haksiz fiil',
        'sebepsiz zenginlesme',
        'temerrut',
        'kira',
        'vekalet',
    ],
    ticaret: [
        'anonim sirket',
        'limited sirket',
        'genel kurul',
        'haksiz rekabet',
        'cek',
        'bono',
        'konkordato',
        'ticari defter',
    ],
    idare: [
        'idari islem',
        'iptal davasi',
        'tam yargi',
        'hizmet kusuru',
        'yurutmenin durdurulmasi',
        'olcululuk',
        'hukuki guvenlik',
        'savunma hakki',
    ],
    vergi: [
        'tarhiyat',
        'vergi ziyai',
        'kdv indirimi',
        'sahte fatura',
        'inceleme raporu',
        'uzlasma',
    ],
    icra: [
        'itirazin iptali',
        'menfi tespit',
        'istirdat',
        'odeme emri',
        'haczedilemezlik',
        'icra inkar tazminati',
    ],
    tuketici: [
        'ayipli mal',
        'ayipli hizmet',
        'cayma hakki',
        'bedel iadesi',
        'hakem heyeti',
        'garanti',
    ],
    sigorta: [
        'sigorta',
        'hasar',
        'deger kaybi',
        'rucu',
        'teminat',
        'kasko',
        'trafik sigortasi',
    ],
    gayrimenkul: [
        'tapu iptali ve tescil',
        'muris muvazaasi',
        'ortakligin giderilmesi',
        'elatmanin onlenmesi',
        'ecrimisil',
        'kira tahliye',
        'kira tespiti',
        'kat mulkiyeti',
    ],
    miras: [
        'muris muvazaasi',
        'tenkis',
        'vasiyetname',
        'tereke',
        'sakli pay',
        'mirasin reddi',
    ],
    anayasa: [
        'anayasa mahkemesi',
        'bireysel basvuru',
        'ihlal',
        'adil yargilanma',
        'ifade ozgurlugu',
        'mulkiyet hakki',
        'makul sure',
    ],
};

const DOMAIN_SUBSTANTIVE_SIGNAL_EXPANSIONS = {
    ceza: [
        'uyusturucu madde', 'hassas terazi', 'telefon incelemesi', 'hts kaydi', 'ele gecirilen miktar',
        'adli arama', 'hukuka aykiri delil', 'arama karari', 'kasten yaralama', 'kasten oldurme',
        'cinsel istismar', 'hirsizlik', 'nitelikli hirsizlik', 'dolandiricilik', 'santaj',
        'tehdit', 'hakaret', 'guveni kotuye kullanma', 'bilisim sucu', 'resmi belgede sahtecilik',
    ],
    is_hukuku: [
        'ucret alacagi', 'yillik izin ucreti', 'hafta tatili', 'ubgt',
        'fazla mesai', 'fazla calisma', 'fazla surelerle calisma', 'bordro', 'ucret hesap pusulasi',
        'puantaj', 'devam cizelgesi', 'ise giris cikis kayitlari', 'elektronik ortam kayitlari', 'serbest zaman',
        'is guvencesi', 'feshin gecersizligi', 'bosta gecen sure ucreti', 'ise baslatmama tazminati',
        'hakli fesih', 'gecerli neden', 'performans dusuklugu', 'alt isveren',
        'hizmet tespiti', 'is kazasi', 'meslek hastaligi', 'sendikal tazminat',
    ],
    aile: [
        'evlilik birliginin temelinden sarsilmasi', 'maddi tazminat', 'manevi tazminat', 'istirak nafakasi',
        'yoksulluk nafakasi', 'tedbir nafakasi', 'aile konutu', 'cocugun ustun yarari',
        'mal paylasimi', 'katilma alacagi', '6284 sayili kanun', 'uzaklastirma',
        'soybagi', 'babalik davasi',
    ],
    borclar: [
        'borcun ifasi', 'borca aykirilik', 'alacak davasi', 'maddi tazminat',
        'manevi tazminat', 'munzam zarar', 'menfi zarar', 'muspet zarar',
        'vekaletsiz is gorme', 'alacagin temliki', 'kefalet', 'cezai sart',
        'eser sozlesmesi', 'adi ortaklik', 'kira sozlesmesi', 'faiz alacagi',
    ],
    ticaret: [
        'ortaklar kurulu', 'sermaye artirimi', 'tasfiye', 'marka hakki',
        'patent hakki', 'ticari faiz', 'cari hesap', 'kiymetli evrak',
        'iflas', 'sira cetveli', 'acente', 'konkordato muhleti',
        'rekabet yasagi', 'banka teminati', 'hamiline cek', 'pay sahipligi',
    ],
    idare: [
        'idari para cezasi', 'disiplin cezasi', 'ruhsat iptali', 'kamulastirmasiz el atma',
        'belediye encumeni', 'imar para cezasi', 'yikim karari', 'yetki unsuru',
        'sekil unsuru', 'sebep unsuru', 'konu unsuru', 'amac unsuru',
        'savunma hakki', 'kazanilmis hak', 'hukuki guvenlik ilkesi', 'mulkiyet hakki ihlali',
    ],
    vergi: [
        'tarhiyatin iptali', 'vergi cezasi', 'sahte belge', 'muhteviyati itibariyla yaniltici belge',
        'e-defter', 'e-fatura', 'kurumlar vergisi', 'gelir vergisi',
        'kdv iadesi', 'odeme emri', 'uzlasma talebi', 'inceleme tutanagi',
    ],
    icra: [
        'itirazin kaldirilmasi', 'kambiyo takibi', 'imzaya itiraz', 'haciz',
        'ihalenin feshi', 'kiymet takdiri', 'konkordato', 'iflas',
        'rehnin paraya cevrilmesi', 'sira cetveli', 'maas haczi', 'borca itiraz',
    ],
    tuketici: [
        'hakem heyeti karari', 'mesafeli satis', 'garanti belgesi', 'servis kaydi',
        'paket tur', 'abonelik sozlesmesi', 'bedel indirimi', 'urun degisimi',
        'onarim hakki', 'on bilgilendirme', 'devre tatil', 'konut satisi',
    ],
    sigorta: [
        'sigorta tahkim', 'sigorta tahkim komisyonu', 'eksper raporu', 'riziko',
        'pert total', 'alkollu surus', 'munhasiran illiyet', 'zorunlu mali sorumluluk',
        'hasar dosyasi', 'yangin sigortasi', 'saglik sigortasi', 'hayat sigortasi',
        'is durmasi zarari', 'sovtaj', 'muafiyet', 'sigorta genel sartlari',
    ],
    gayrimenkul: [
        'tapu iptali', 'tescil davasi', 'yolsuz tescil', 'muvazaali devir',
        'kat karsiligi insaat', 'tasinmaz satis vaadi', 'payli mulkiyet', 'elbirligi mulkiyeti',
        'kat irtifaki', 'yonetim plani', 'ortak alan', 'aidat borcu',
        'komsuluk hukuku', 'fuzuli isgal', 'mulkiyet hakki', 'kamulastirmasiz el atma',
    ],
    miras: [
        'vasiyetnamenin iptali', 'mirasin paylastirilmasi', 'veraset ilami', 'miras sozlesmesi',
        'mirasciliktan cikarma', 'olume bagli tasarruf', 'fiil ehliyeti', 'sakli pay ihlali',
        'reddi miras', 'paylasma sozlesmesi', 'art mirasci', 'miras payi devri',
    ],
};

const NUMERIC_SIGNAL_TOKEN_PATTERN = /^\d{3,4}(?:[./-]\d+)*$/;

const PROCEDURAL_NOISE_PATTERNS = [
    /\b\d{1,4}-\d{1,5}\b/g,
    /\b\d{1,2}\.\d{1,2}\.\d{4}\b/g,
];

const PROCEDURAL_NOISE_TOKENS = new Set([
    'agir', 'ceza', 'mahkemesi', 'bolge', 'adliye', 'baskanligi', 'cumhuriyet', 'bassavciligi',
    'ozel', 'dairece', 'kurulunca', 'kurulunca', 'kurulu', 'genel', 'teblignamesi', 'katilan',
    'magdur', 'taniklarin', 'taniklar', 'muhakemesi', 'kanunu', 'maddesi', 'maddelerinin',
    'sayi', 'tarih', 'hapis', 'cezasi', 'hak', 'yoksunluguna',
]);

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const isQuerySignalToken = (token = '') =>
    token.length >= 4 || SHORT_LEGAL_TOKENS.has(token) || NUMERIC_SIGNAL_TOKEN_PATTERN.test(token);

const normalizeForCompactQuery = (value = '') => {
    let normalized = normalizeText(value);
    for (const pattern of PROCEDURAL_NOISE_PATTERNS) {
        normalized = normalized.replace(pattern, ' ');
    }

    return normalized
        .split(/\s+/)
        .filter((token) => token && !PROCEDURAL_NOISE_TOKENS.has(token))
        .join(' ')
        .trim();
};

const dedupeList = (values = []) => {
    const ordered = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const compact = String(value || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeText(compact);
        if (!compact || !normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        ordered.push(compact);
    }

    return ordered;
};

const mergePacketSearchVariants = ({
    baseVariants = [],
    additions = [],
    additionMode = 'gemini_dynamic',
    limit = SIMPLE_EXPANDED_PACKET_VARIANT_LIMIT,
} = {}) => {
    const merged = [];
    const seen = new Set();

    const addVariant = (query = '', mode = undefined) => {
        const normalizedQuery = sanitizeLegalInput(query).text;
        const key = normalizeText(normalizedQuery);
        if (!normalizedQuery || !key || seen.has(key)) return;
        seen.add(key);
        merged.push({
            query: normalizedQuery,
            mode: String(mode || '').trim() || undefined,
        });
    };

    for (const variant of Array.isArray(baseVariants) ? baseVariants : []) {
        addVariant(variant?.query, variant?.mode);
        if (merged.length >= limit) return merged;
    }

    for (const variant of Array.isArray(additions) ? additions : []) {
        if (typeof variant === 'string') {
            addVariant(variant, additionMode);
        } else {
            addVariant(variant?.query, variant?.mode || additionMode);
        }
        if (merged.length >= limit) break;
    }

    return merged;
};

const mergeSignalEntries = (base = [], additions = [], limit = 48) =>
    dedupeList([...(Array.isArray(base) ? base : []), ...(Array.isArray(additions) ? additions : [])]).slice(0, limit);

const normalizeLegalSearchPacket = (packet = null) => {
    return normalizeExplicitLegalSearchPacket(packet);
};

const normalizeRoutingProfile = (profile = null) => {
    if (!profile || typeof profile !== 'object') return null;

    const primaryBirimCodes = dedupeBirimCodes(Array.isArray(profile.primaryBirimCodes) ? profile.primaryBirimCodes : [], 6);
    const secondaryBirimCodes = dedupeBirimCodes(Array.isArray(profile.secondaryBirimCodes) ? profile.secondaryBirimCodes : [], 6);
    const routingMode = String(profile.routingMode || '').trim().toLowerCase()
        || (secondaryBirimCodes.length > 0
            ? 'primary_secondary'
            : (primaryBirimCodes.length > 0 ? 'hard_primary' : 'source_first'));

    return {
        primaryDomain: normalizeDomainId(profile.primaryDomain || '', DEFAULT_DOMAIN_PROFILE_ID),
        subdomain: String(profile.subdomain || '').trim() || '',
        sourcePolicy: normalizeSource(profile.sourcePolicy || ''),
        routingMode,
        mustConcepts: dedupeList(Array.isArray(profile.mustConcepts) ? profile.mustConcepts : []).slice(0, 12),
        supportConcepts: dedupeList(Array.isArray(profile.supportConcepts) ? profile.supportConcepts : []).slice(0, 12),
        denyConcepts: dedupeList(Array.isArray(profile.denyConcepts) ? profile.denyConcepts : []).slice(0, 16),
        primaryBirimCodes,
        secondaryBirimCodes,
        strictMatchMode: String(profile.strictMatchMode || '').trim() || 'query_core',
    };
};

const buildPacketDrivenQuerySeedText = (packet = null, fallbackText = '') => {
    const candidate = dedupeList([
        packet?.searchSeedText,
        packet?.caseType,
        packet?.coreIssue,
        ...(packet?.requiredConcepts || []).slice(0, 3),
        ...(packet?.supportConcepts || []).slice(0, 2),
    ]).join(' ').trim();

    return candidate || fallbackText;
};

const buildPacketDrivenRawText = ({
    packet = null,
    keywordText = '',
    rawQueryText = '',
} = {}) =>
    dedupeList([
        buildPacketDrivenQuerySeedText(packet, ''),
        keywordText,
        rawQueryText,
        ...(packet?.requiredConcepts || []),
        ...(packet?.supportConcepts || []),
        ...(packet?.evidenceConcepts || []),
        ...(packet?.negativeConcepts || []),
    ]).join(' ').trim();

const buildPacketBackedSkillPlan = (packet = null, fallbackPlan = null) => {
    if (!packet) return fallbackPlan;

    return {
        ...(fallbackPlan || {}),
        primaryDomain: packet.primaryDomain || fallbackPlan?.primaryDomain,
        retrievalConcepts: (packet.requiredConcepts && packet.requiredConcepts.length > 0)
            ? packet.requiredConcepts
            : (fallbackPlan?.retrievalConcepts || []),
        supportConcepts: (packet.supportConcepts && packet.supportConcepts.length > 0)
            ? packet.supportConcepts
            : (fallbackPlan?.supportConcepts || []),
        evidenceConcepts: (packet.evidenceConcepts && packet.evidenceConcepts.length > 0)
            ? packet.evidenceConcepts
            : (fallbackPlan?.evidenceConcepts || []),
        requiredConcepts: (packet.requiredConcepts && packet.requiredConcepts.length > 0)
            ? packet.requiredConcepts
            : (fallbackPlan?.requiredConcepts || fallbackPlan?.mustConcepts || []),
        mustConcepts: (packet.requiredConcepts && packet.requiredConcepts.length > 0)
            ? packet.requiredConcepts
            : (fallbackPlan?.mustConcepts || []),
        contrastConcepts: fallbackPlan?.contrastConcepts || [],
        negativeConcepts: dedupeList([
            ...(fallbackPlan?.negativeConcepts || []),
            ...(packet?.negativeConcepts || []),
        ]),
        embeddingQuery: packet?.searchSeedText
            || fallbackPlan?.embeddingQuery
            || dedupeList(packet?.requiredConcepts || []).join(' '),
        searchClauses: (fallbackPlan?.searchClauses || fallbackPlan?.candidateQueries || []).slice(0, 6),
        candidateQueries: (fallbackPlan?.candidateQueries || fallbackPlan?.searchClauses || []).slice(0, 6),
        searchQuery: packet?.searchSeedText || fallbackPlan?.searchQuery,
        initialKeyword: packet?.searchSeedText || fallbackPlan?.initialKeyword,
        suggestedCourt: fallbackPlan?.suggestedCourt,
    };
};

const buildAgenticAugmentedSkillPlan = (basePlan = null, signalPlan = null) => {
    if (!signalPlan) return basePlan;

    return {
        ...(basePlan || {}),
        primaryDomain: signalPlan.primaryDomain || basePlan?.primaryDomain,
        retrievalConcepts: dedupeList([
            ...(signalPlan.mustConcepts || []),
            ...(signalPlan.retrievalConcepts || []),
            ...(basePlan?.retrievalConcepts || []),
        ]).slice(0, 12),
        supportConcepts: dedupeList([
            ...(signalPlan.supportConcepts || []),
            ...(basePlan?.supportConcepts || []),
        ]).slice(0, 12),
        evidenceConcepts: dedupeList([
            ...(signalPlan.evidenceConcepts || []),
            ...(basePlan?.evidenceConcepts || []),
        ]).slice(0, 10),
        negativeConcepts: dedupeList([
            ...(basePlan?.negativeConcepts || []),
            ...(signalPlan.negativeConcepts || []),
        ]).slice(0, 10),
        searchClauses: dedupeList([
            ...(signalPlan.searchClauses || []),
            ...(basePlan?.searchClauses || []),
            ...(basePlan?.candidateQueries || []),
        ]).slice(0, 8),
        candidateQueries: dedupeList([
            ...(signalPlan.candidateQueries || []),
            ...(basePlan?.candidateQueries || []),
            ...(basePlan?.searchClauses || []),
        ]).slice(0, 8),
        requiredConcepts: dedupeList([
            ...(signalPlan.requiredConcepts || signalPlan.mustConcepts || []),
            ...(basePlan?.requiredConcepts || basePlan?.mustConcepts || []),
        ]).slice(0, 6),
        mustConcepts: dedupeList([
            ...(signalPlan.mustConcepts || []),
            ...(basePlan?.mustConcepts || []),
        ]).slice(0, 6),
        contrastConcepts: dedupeList([
            ...(signalPlan.contrastConcepts || []),
            ...(basePlan?.contrastConcepts || []),
        ]).slice(0, 6),
        embeddingQuery: String(
            signalPlan.embeddingQuery
            || basePlan?.embeddingQuery
            || dedupeList([
                ...(signalPlan.requiredConcepts || signalPlan.mustConcepts || []),
                ...(basePlan?.requiredConcepts || basePlan?.mustConcepts || []),
            ]).join(' ')
        ).trim() || undefined,
        semanticSignalDiagnostics: signalPlan.diagnostics || null,
    };
};

const resolvePacketDrivenRouting = ({
    source = 'all',
    filters = {},
    packet = null,
} = {}) => {
    const effectiveFilters = { ...(filters || {}) };
    let effectiveSource = normalizeSource(source);

    if (!packet) {
        return {
            source: effectiveSource,
            filters: effectiveFilters,
        };
    }

    if (effectiveSource === 'all' && packet.preferredSource === 'danistay') {
        effectiveSource = 'danistay';
    } else if (effectiveSource === 'all' && packet.preferredSource === 'yargitay') {
        effectiveSource = 'yargitay';
    } else if (effectiveSource === 'all' && packet.preferredSource === 'bam') {
        effectiveFilters.searchArea = 'bam';
    }

    return {
        source: effectiveSource,
        filters: effectiveFilters,
    };
};

Object.entries(DOMAIN_SUBSTANTIVE_SIGNAL_EXPANSIONS).forEach(([domainId, additions]) => {
    DOMAIN_SUBSTANTIVE_SIGNAL_MAP[domainId] = mergeSignalEntries(DOMAIN_SUBSTANTIVE_SIGNAL_MAP[domainId], additions, 48);
});

const dedupeResultsByIdentity = (results = []) => {
    const ordered = [];
    const seen = new Set();

    for (const result of Array.isArray(results) ? results : []) {
        const identity = String(
            result?.documentId
            || `${result?.title || ''}|${result?.esasNo || ''}|${result?.kararNo || ''}|${result?.tarih || ''}`
        ).trim();

        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        ordered.push(result);
    }

    return ordered;
};

const createTimeoutError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const resolveSimpleBedestenProvider = () => 'http';

const clampRelevanceScore = (value = 0) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const computeResultFactPatternAssessment = (result = {}) => {
    const factPatternHits = dedupeList([
        ...(Array.isArray(result?.contentMatchedFactPattern) ? result.contentMatchedFactPattern : []),
        ...(Array.isArray(result?.matchedEvidenceConcepts) ? result.matchedEvidenceConcepts : []),
    ]).slice(0, 8);
    const supportHits = dedupeList(Array.isArray(result?.matchedSupportConcepts) ? result.matchedSupportConcepts : []).slice(0, 6);
    const requiredHits = dedupeList(Array.isArray(result?.matchedRequiredConcepts) ? result.matchedRequiredConcepts : []).slice(0, 6);
    const proceduralHits = dedupeList(Array.isArray(result?.contentProceduralHits) ? result.contentProceduralHits : []).slice(0, 6);

    let score = (factPatternHits.length * 22)
        + (supportHits.length * 8)
        + (requiredHits.length * 4)
        - (proceduralHits.length * 14);

    if (factPatternHits.length >= 2) score += 18;
    if (factPatternHits.length >= 4) score += 12;
    if (factPatternHits.length === 0 && proceduralHits.length >= 2) score -= 28;
    if (String(result?.summaryText || result?.ozet || result?.snippet || '').trim()) {
        score += 6;
    } else {
        score -= 6;
    }

    return {
        hitCount: factPatternHits.length,
        hits: factPatternHits,
        supportHits,
        proceduralHits,
        proceduralShellBias: proceduralHits.length >= 2 && factPatternHits.length === 0,
        score: clampRelevanceScore(score),
    };
};

const computeSimpleResultRelevanceScore = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    targetSources = [],
    targetBirimCodes = [],
} = {}) => {
    const factPatternAssessment = computeResultFactPatternAssessment(result);
    const birimAlignment = assessTargetBirimAlignment({ result, targetBirimCodes });
    const expectedDanistay = ['idare', 'vergi'].includes(primaryDomain);
    const queryCore = Array.isArray(result?.contentMatchedQueryCore) ? result.contentMatchedQueryCore.length : 0;
    const queryTokens = Array.isArray(result?.contentMatchedQueryTokens) ? result.contentMatchedQueryTokens.length : 0;
    const must = Array.isArray(result?.matchedMustConcepts) ? result.matchedMustConcepts.length : 0;
    const contrast = Array.isArray(result?.matchedContrastConcepts) ? result.matchedContrastConcepts.length : 0;
    const required = Array.isArray(result?.matchedRequiredConcepts) ? result.matchedRequiredConcepts.length : 0;
    const substantive = Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive.length : 0;
    const evidence = Array.isArray(result?.matchedEvidenceConcepts) ? result.matchedEvidenceConcepts.length : 0;
    const negative = Array.isArray(result?.matchedNegativeConcepts) ? result.matchedNegativeConcepts.length : 0;
    const procedural = Array.isArray(result?.contentProceduralHits) ? result.contentProceduralHits.length : 0;
    const contentScore = Number(result?.contentScore || 0);

    let score = 46;

    if (expectedDanistay) {
        score += result?.source === 'danistay' ? 10 : -18;
    } else {
        score += result?.source === 'danistay' ? -12 : 10;
    }

    if (queryCore > 0) {
        score += 16 + (queryCore * 10);
    } else if (queryTokens >= 2) {
        score += 8;
    } else {
        score -= 26;
    }

    if (must > 0) {
        score += 14 + (must * 9);
    } else if (contrast > 0) {
        score -= Math.min(24, 10 + (contrast * 6));
    }

    if (required > 0 || substantive > 0) {
        score += 18 + (required * 7) + (substantive * 4);
    } else if (contentScore > 0) {
        score += 8;
    } else {
        score -= 10;
    }

    if (contentScore >= 450) score += 20;
    else if (contentScore >= 250) score += 14;
    else if (contentScore >= 120) score += 8;
    else if (contentScore > 0) score += 4;

    if (factPatternAssessment.hitCount > 0) {
        score += 10 + Math.min(14, factPatternAssessment.hitCount * 4);
    } else if (procedural > 0) {
        score -= 16;
    }

    if (evidence > 0) score += Math.min(8, evidence * 3);
    if (negative > 0) score -= Math.min(20, negative * 7);
    if (procedural > Math.max(1, substantive)) score -= 18;
    if (factPatternAssessment.proceduralShellBias) score -= 20;
    if (birimAlignment.matched) {
        score += Math.max(16, 28 - (birimAlignment.matchRank * 6));
    } else if (birimAlignment.sameFamilyMismatch) {
        score -= 56;
    }

    if (String(result?.selectionReason || '').trim()) score += 6;
    if (String(result?.ozet || result?.snippet || '').trim()) score += 6;
    else score -= 8;

    if (Array.isArray(targetSources) && targetSources.length > 0) score += 2;

    let scoreCap = 100;
    if (targetBirimCodes.length > 0) {
        if (birimAlignment.sameFamilyMismatch) scoreCap = 84;
        else if (!birimAlignment.matched) scoreCap = 92;
    }

    return Math.min(scoreCap, clampRelevanceScore(score));
};

const isResultCompatibleWithPrimaryDomain = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    targetBirimCodes = [],
    routedCourtTypes = [],
    negativeConcepts = [],
} = {}) => {
    const haystack = normalizeText([result?.daire, result?.title].filter(Boolean).join(' '));
    const semanticHaystack = normalizeText([
        result?.daire,
        result?.title,
        result?.ozet,
        result?.snippet,
        result?.summaryText,
        result?.selectionReason,
    ].filter(Boolean).join(' '));
    if (!haystack && !semanticHaystack) return true;

    const normalizedNegativeConcepts = dedupePhraseChunks(
        Array.isArray(negativeConcepts) ? negativeConcepts : [],
        14
    )
        .map((item) => normalizeText(item))
        .filter(Boolean);

    const hasTargetBirimMatch = targetBirimCodes.some((code) =>
        getBirimCodeMarkers(code)
            .map((item) => normalizeText(item))
            .some((marker) => marker && haystack.includes(marker))
    );

    if (Array.isArray(routedCourtTypes) && routedCourtTypes.includes('DANISTAYKARAR')) {
        if (haystack.includes('hukuk dairesi') || haystack.includes('ceza dairesi')) return false;
    }

    if (Array.isArray(routedCourtTypes) && routedCourtTypes.includes('YARGITAYKARARI')) {
        if (haystack.includes('danistay')) return false;
    }

    if (primaryDomain === 'ceza') {
        if (
            haystack.includes('hukuk dairesi')
            || haystack.includes('hukuk genel kurulu')
            || haystack.includes('idari dava dairesi')
            || haystack.includes('vergi dava daireleri kurulu')
        ) return false;

        if (targetBirimCodes.length > 0 && !hasTargetBirimMatch && haystack.includes('hukuk')) return false;
    }

    if (primaryDomain === 'hukuk' || primaryDomain === 'is_hukuku' || primaryDomain === 'aile' || primaryDomain === 'ticaret' || primaryDomain === 'icra') {
        if (
            haystack.includes('ceza dairesi')
            || haystack.includes('ceza genel kurulu')
            || haystack.includes('idari dava dairesi')
            || haystack.includes('vergi dava daireleri kurulu')
        ) return false;
    }

    if (
        primaryDomain === 'icra'
        && semanticHaystack
        && normalizedNegativeConcepts.some((phrase) => phrase && semanticHaystack.includes(phrase))
    ) return false;

    if (primaryDomain === 'idare' || primaryDomain === 'vergi') {
        if (
            haystack.includes('hukuk dairesi')
            || haystack.includes('hukuk genel kurulu')
            || haystack.includes('ceza dairesi')
            || haystack.includes('ceza genel kurulu')
        ) return false;
    }

    if (primaryDomain === 'anayasa') {
        return result?.source === 'anayasa' || haystack.includes('anayasa mahkemesi');
    }

    return true;
};

const passesStrictQueryPrecisionGate = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    subdomain = '',
    negativeConcepts = [],
    mustConcepts = [],
    denyConcepts = [],
    strictMatchMode = 'query_core',
} = {}) => {
    const factPatternAssessment = computeResultFactPatternAssessment(result);
    const queryPhraseSignalCount = Number(result?.queryCoreSignalCount || 0);
    const queryTokenSignalCount = Number(result?.queryTokenSignalCount || 0);
    const queryCoreHits = Array.isArray(result?.contentMatchedQueryCore) ? result.contentMatchedQueryCore.length : 0;
    const queryTokenHits = Array.isArray(result?.contentMatchedQueryTokens) ? result.contentMatchedQueryTokens.length : 0;
    const requiredHits = Array.isArray(result?.matchedRequiredConcepts) ? result.matchedRequiredConcepts.length : 0;
    const substantiveHits = Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive.length : 0;
    const negativeHits = Array.isArray(result?.matchedNegativeConcepts) ? result.matchedNegativeConcepts.length : 0;
    const evidenceHits = Array.isArray(result?.matchedEvidenceConcepts) ? result.matchedEvidenceConcepts.length : 0;
    const proceduralHits = Array.isArray(result?.contentProceduralHits) ? result.contentProceduralHits.length : 0;
    const contentScore = Number(result?.contentScore || 0);
    const previewHaystack = normalizeText([
        result?.title,
        result?.daire,
        result?.summaryText,
        result?.ozet,
        result?.snippet,
        ...(Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive : []),
        ...(Array.isArray(result?.matchedRequiredConcepts) ? result.matchedRequiredConcepts : []),
    ].filter(Boolean).join(' '));
    const matchedMustConcepts = dedupeList((Array.isArray(mustConcepts) ? mustConcepts : []).filter((item) => {
        const token = normalizeText(item);
        return token && previewHaystack.includes(token);
    }));
    const matchedDenyConcepts = dedupeList([
        ...(Array.isArray(result?.matchedNegativeConcepts) ? result.matchedNegativeConcepts : []),
        ...(Array.isArray(denyConcepts) ? denyConcepts : []).filter((item) => {
            const token = normalizeText(item);
            return token && previewHaystack.includes(token);
        }),
    ]);
    const supportHits = Array.isArray(result?.matchedSupportConcepts) ? result.matchedSupportConcepts.length : 0;

    if (!isResultCompatibleWithPrimaryDomain({ result, primaryDomain, negativeConcepts })) {
        return false;
    }

    if (matchedDenyConcepts.length > 0 && matchedMustConcepts.length === 0) {
        return false;
    }

    if (factPatternAssessment.proceduralShellBias) {
        return false;
    }

    if (
        proceduralHits > 0
        && factPatternAssessment.hitCount === 0
        && evidenceHits === 0
        && supportHits === 0
        && substantiveHits <= 1
        && queryCoreHits <= 1
        && queryTokenHits < 3
    ) {
        return false;
    }

    if (subdomain === 'ticaret_genel_kurul' && matchedDenyConcepts.length > 0) {
        return false;
    }

    if (
        subdomain === 'ticaret_genel_kurul'
        && (
            previewHaystack.includes('asliye hukuk mahkemesi')
            || previewHaystack.includes('tacir sifatinin bulunmadigi')
            || previewHaystack.includes('tacir sifati bulunmadigi')
            || previewHaystack.includes('cekismesiz yargi isi')
        )
    ) {
        return false;
    }

    if (
        subdomain === 'ticaret_genel_kurul'
        && negativeHits === 0
        && matchedDenyConcepts.length === 0
        && matchedMustConcepts.length > 0
        && (
            supportHits > 0
            || requiredHits > 0
            || substantiveHits >= 2
        )
        && (
            (queryCoreHits > 0 && queryTokenHits >= 2)
            || (supportHits > 0 && contentScore >= 160)
            || (requiredHits > 0 && contentScore >= 170)
        )
    ) {
        return true;
    }

    if (
        subdomain === 'ticaret_marka_iltibas'
        && negativeHits === 0
        && matchedDenyConcepts.length === 0
        && (
            matchedMustConcepts.length > 0
            || requiredHits > 0
        )
        && (
            supportHits > 0
            || substantiveHits > 0
            || queryCoreHits > 0
        )
        && (
            queryTokenHits >= 2
            || contentScore >= 150
        )
    ) {
        return true;
    }

    if (
        subdomain === 'is_hukuku_fazla_mesai'
        && negativeHits === 0
        && matchedDenyConcepts.length === 0
        && (
            matchedMustConcepts.length > 0
            || requiredHits > 0
            || supportHits > 0
            || substantiveHits > 0
        )
        && (
            queryCoreHits > 0
            || queryTokenHits >= 2
            || supportHits >= 2
            || contentScore >= 140
        )
    ) {
        return true;
    }

    if (
        String(subdomain || '').startsWith('anayasa_bireysel_basvuru')
        && result?.source === 'anayasa'
        && negativeHits === 0
        && (
            matchedMustConcepts.length > 0
            || requiredHits > 0
            || supportHits > 0
            || substantiveHits > 0
            || queryTokenHits >= 2
        )
    ) {
        return true;
    }

    if (strictMatchMode === 'must_support') {
        if (matchedMustConcepts.length === 0 && requiredHits === 0) {
            return false;
        }

        if (
            supportHits === 0
            && substantiveHits === 0
            && queryCoreHits === 0
            && queryTokenHits < 2
        ) {
            return false;
        }
    }

    if (
        (primaryDomain === 'vergi' || primaryDomain === 'idare')
        && negativeHits === 0
        && contentScore >= 220
        && (
            requiredHits >= 1
            || substantiveHits >= 2
            || queryTokenHits >= 3
        )
    ) {
        return true;
    }

    if (queryPhraseSignalCount >= 2) {
        return queryCoreHits >= 1;
    }
    if (queryPhraseSignalCount === 1) {
        return queryCoreHits >= 1 || queryTokenHits >= 3;
    }
    if (queryTokenSignalCount >= 5) {
        return queryTokenHits >= 2;
    }

    return queryCoreHits > 0 || queryTokenHits > 0;
};

const createRequestAbortError = () => {
    const error = new Error('client_request_aborted');
    error.code = 'REQUEST_ABORTED';
    return error;
};

const throwIfAbortRequested = (abortSignal = null) => {
    if (!abortSignal?.aborted) return;
    throw createRequestAbortError();
};

const postJsonWithTimeout = async (endpoint, body, abortSignal = null) => {
    throwIfAbortRequested(abortSignal);
    const controller = new AbortController();
    const handleAbort = () => controller.abort();
    const timer = setTimeout(() => controller.abort(), SIMPLE_BEDESTEN_TIMEOUT_MS);
    if (abortSignal) {
        if (abortSignal.aborted) {
            controller.abort();
        } else {
            abortSignal.addEventListener('abort', handleAbort, { once: true });
        }
    }

    try {
        const response = await fetch(`${SIMPLE_BEDESTEN_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: SIMPLE_BEDESTEN_HEADERS,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        if (
            endpoint === SEARCH_ENDPOINT
            && String(process.env.LEGAL_BEDESTEN_LOG_ONCE || '').trim() === 'true'
        ) {
            process.env.LEGAL_BEDESTEN_LOG_ONCE = 'false';
            console.log('[BEDESTEN_DEBUG] request_payload', JSON.stringify(body, null, 2));
            console.log('[BEDESTEN_DEBUG] response_payload', JSON.stringify(payload, null, 2));
        }
        return payload;
    } catch (error) {
        if (String(error?.name || '').toLowerCase() === 'aborterror') {
            if (abortSignal?.aborted) {
                throw createRequestAbortError();
            }
            throw createTimeoutError('simple_bedesten_timeout', 'simple_bedesten_timeout');
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (abortSignal) {
            abortSignal.removeEventListener('abort', handleAbort);
        }
    }
};

const fetchTextWithTimeout = async (url, abortSignal = null) => {
    throwIfAbortRequested(abortSignal);
    const controller = new AbortController();
    const handleAbort = () => controller.abort();
    const timer = setTimeout(() => controller.abort(), SIMPLE_BEDESTEN_TIMEOUT_MS);
    if (abortSignal) {
        if (abortSignal.aborted) {
            controller.abort();
        } else {
            abortSignal.addEventListener('abort', handleAbort, { once: true });
        }
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': SIMPLE_BEDESTEN_HEADERS['User-Agent'],
                'Accept-Language': SIMPLE_BEDESTEN_HEADERS['Accept-Language'],
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.code = response.status === 429 ? 'HTTP_429' : 'HTTP_FETCH_FAILED';
            throw error;
        }

        return await response.text();
    } catch (error) {
        if (String(error?.name || '').toLowerCase() === 'aborterror') {
            if (abortSignal?.aborted) {
                throw createRequestAbortError();
            }
            throw createTimeoutError('simple_http_timeout', 'simple_http_timeout');
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (abortSignal) {
            abortSignal.removeEventListener('abort', handleAbort);
        }
    }
};

const fetchTextViaPowerShell = async (url, abortSignal = null) => {
    throwIfAbortRequested(abortSignal);
    if (process.platform !== 'win32') {
        const error = new Error('powershell_fetch_unsupported');
        error.code = 'POWERSHELL_FETCH_UNSUPPORTED';
        throw error;
    }

    const timeoutSec = Math.max(5, Math.ceil(SIMPLE_BEDESTEN_TIMEOUT_MS / 1000));
    const escapedUrl = String(url || '').replace(/'/g, "''");
    const userAgent = String(SIMPLE_BEDESTEN_HEADERS['User-Agent'] || 'Mozilla/5.0').replace(/'/g, "''");
    const acceptLanguage = String(SIMPLE_BEDESTEN_HEADERS['Accept-Language'] || 'tr-TR,tr;q=0.9').replace(/'/g, "''");
    const command = [
        "$ProgressPreference='SilentlyContinue'",
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
        `$resp = Invoke-WebRequest -Uri '${escapedUrl}' -UseBasicParsing -Headers @{ 'User-Agent'='${userAgent}'; 'Accept-Language'='${acceptLanguage}' } -MaximumRedirection 5 -TimeoutSec ${timeoutSec}`,
        'Write-Output $resp.Content',
    ].join('; ');

    try {
        const { stdout } = await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
            { timeout: SIMPLE_BEDESTEN_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
        );
        const text = String(stdout || '');
        if (!text.trim()) {
            const error = new Error('empty_powershell_fetch_output');
            error.code = 'HTTP_FETCH_FAILED';
            throw error;
        }
        return text;
    } catch (error) {
        if (abortSignal?.aborted) {
            throw createRequestAbortError();
        }
        if (String(error?.code || '').toLowerCase() === 'aborterror') {
            throw createTimeoutError('simple_http_timeout', 'simple_http_timeout');
        }
        throw error;
    }
};

const normalizeSource = (value = 'all') => {
    const normalized = String(value || 'all').trim().toLocaleLowerCase('tr-TR');
    return normalized || 'all';
};

const normalizeSearchArea = (value = 'auto') =>
    String(value || 'auto').trim().toLocaleLowerCase('tr-TR');

const normalizeBirimCode = (value = '') =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

const extractBirimCodesFromCourtHint = (value = '') => {
    const normalized = String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return [];

    const numberedCourtMatch = normalized.match(/(\d{1,2})\.\s*(ceza|hukuk)?\s*dairesi/);
    if (numberedCourtMatch) {
        const number = Number(numberedCourtMatch[1]);
        const family = numberedCourtMatch[2];
        if (family === 'ceza') return [`C${number}`];
        if (family === 'hukuk') return [`H${number}`];
    }

    const numberedDanistayMatch = normalized.match(/(\d{1,2})\.\s*daire\b/);
    if (numberedDanistayMatch) {
        return [`D${Number(numberedDanistayMatch[1])}`];
    }

    if (normalized.includes('ceza genel kurulu')) return ['CGK'];
    if (normalized.includes('hukuk genel kurulu')) return ['HGK'];
    if (
        normalized.includes('vergi dava daireleri kurulu')
        || normalized === 'vddk'
    ) {
        return ['VDDK'];
    }

    return [];
};

const dedupeBirimCodes = (values = [], limit = Infinity) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeBirimCode(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
        if (unique.length >= limit) break;
    }

    return unique;
};

const expandBirimAdiCode = (value = '') => {
    const normalized = normalizeBirimCode(value);
    if (!normalized || normalized === 'ALL') return '';

    const numberedMatch = normalized.match(/^([HCD])(\d{1,2})$/);
    if (numberedMatch) {
        const no = Number(numberedMatch[2]);
        if (numberedMatch[1] === 'H') return `${no}. Hukuk Dairesi`;
        if (numberedMatch[1] === 'C') return `${no}. Ceza Dairesi`;
        if (numberedMatch[1] === 'D') return `${no}. Daire`;
    }

    if (normalized === 'HGK') return 'Hukuk Genel Kurulu';
    if (normalized === 'CGK') return 'Ceza Genel Kurulu';
    if (normalized === 'VDDK') return 'Vergi Dava Daireleri Kurulu';
    if (normalized === 'IDDK') return 'Idare Dava Daireleri Kurulu';
    if (normalized === 'DBGK') return 'Buyuk Gen.Kur.';
    if (normalized === 'IBK') return 'Ictihatlari Birlestirme Kurulu';
    if (normalized === 'IIK') return 'Idari Isler Kurulu';
    if (normalized === 'DBK') return 'Baskanlar Kurulu';

    return String(value || '').trim();
};

const matchesCourtTypeFamily = (code = '', courtTypes = []) => {
    const normalizedCode = normalizeBirimCode(code);
    if (!normalizedCode) return false;

    const types = Array.isArray(courtTypes) ? courtTypes : [];
    const hasDanistay = types.includes('DANISTAYKARAR');
    const hasYargitay = types.includes('YARGITAYKARARI') || types.includes('ISTINAFHUKUK');

    if (hasDanistay && !hasYargitay) {
        if (SPECIAL_BIRIM_CODES.has(normalizedCode)) {
            return normalizedCode === 'VDDK';
        }
        return DANISTAY_BIRIM_PREFIXES.has(normalizedCode.charAt(0));
    }

    if (hasYargitay && !hasDanistay) {
        if (SPECIAL_BIRIM_CODES.has(normalizedCode)) {
            return normalizedCode === 'HGK' || normalizedCode === 'CGK';
        }
        return YARGITAY_BIRIM_PREFIXES.has(normalizedCode.charAt(0));
    }

    if (hasDanistay && hasYargitay) {
        if (SPECIAL_BIRIM_CODES.has(normalizedCode)) return true;
        return DANISTAY_BIRIM_PREFIXES.has(normalizedCode.charAt(0))
            || YARGITAY_BIRIM_PREFIXES.has(normalizedCode.charAt(0));
    }

    return true;
};

const resolveCourtTypes = ({ source = 'all', filters = {} } = {}) => {
    const normalizedSource = normalizeSource(source);
    const searchArea = normalizeSearchArea(filters?.searchArea || 'auto');

    if (normalizedSource === 'all' && SIMPLE_SEARCH_AREA_COURTS[searchArea]) {
        return {
            supported: true,
            source: normalizedSource,
            courtTypes: [...SIMPLE_SEARCH_AREA_COURTS[searchArea]],
            reason: null,
        };
    }

    if (SIMPLE_SOURCE_COURTS[normalizedSource]) {
        return {
            supported: true,
            source: normalizedSource,
            courtTypes: [...SIMPLE_SOURCE_COURTS[normalizedSource]],
            reason: null,
        };
    }

    if (normalizedSource === 'anayasa') {
        return {
            supported: true,
            source: normalizedSource,
            courtTypes: ['ANAYASA'],
            reason: null,
        };
    }

    if (normalizedSource === 'uyap') {
        return {
            supported: false,
            source: normalizedSource,
            courtTypes: [],
            reason: 'unsupported_source',
        };
    }

    return {
        supported: false,
        source: normalizedSource,
        courtTypes: [],
        reason: 'unsupported_route',
    };
};

const inferPrimaryDomain = ({ effectiveText = '', source = 'all', filters = {} } = {}) => {
    const searchArea = normalizeSearchArea(filters?.searchArea || 'auto');
    if (searchArea === 'ceza') return 'ceza';
    if (searchArea === 'bam' || normalizeSource(source) === 'bam') return 'genel_hukuk';
    const skillGuess = normalizeDomainId(
        buildSkillBackedSearchPackage({
            rawText: effectiveText,
            preferredSource: normalizeSource(source),
        })?.primaryDomain || '',
        DEFAULT_DOMAIN_PROFILE_ID
    );

    if (searchArea === 'danistay') {
        return ['idare', 'vergi'].includes(skillGuess) ? skillGuess : 'idare';
    }

    if (normalizeSource(source) === 'danistay') {
        return ['idare', 'vergi'].includes(skillGuess) ? skillGuess : 'idare';
    }

    if (!skillGuess || skillGuess === DEFAULT_DOMAIN_PROFILE_ID) {
        const normalized = normalizeText(effectiveText);
        const domainKeywordFallback = {
            borclar: ['kira', 'temerrut', 'tahliye', 'tbk', 'kiralanan', 'arsa payi', 'eser sozlesmesi'],
            icra: ['icra', 'haciz', 'itirazin iptali', 'menfi tespit', 'ihalenin feshi', 'meskeniyet', 'iik'],
            tuketici: ['ayipli mal', 'cayma hakki', 'tuketici', 'garanti', 'mesafeli satis'],
        };

        for (const [domain, keywords] of Object.entries(domainKeywordFallback)) {
            if (keywords.some((keyword) => normalized.includes(keyword))) {
                return domain;
            }
        }
    }

    return skillGuess;
};

const resolveRoutedCourtTypes = ({
    baseRouting = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    source = 'all',
    filters = {},
} = {}) => {
    if (!baseRouting?.supported) return baseRouting;

    const normalizedSource = normalizeSource(source);
    const searchArea = normalizeSearchArea(filters?.searchArea || 'auto');

    if (normalizedSource === 'all') {
        if (searchArea === 'bam') {
            return { ...baseRouting, courtTypes: ['ISTINAFHUKUK'] };
        }

        if (primaryDomain === 'vergi' || primaryDomain === 'idare') {
            return { ...baseRouting, courtTypes: ['DANISTAYKARAR'] };
        }

        if (primaryDomain === 'anayasa') {
            return {
                supported: true,
                source: 'anayasa',
                courtTypes: ['ANAYASA'],
                reason: null,
            };
        }

        if (searchArea === 'auto' && primaryDomain === DEFAULT_DOMAIN_PROFILE_ID) {
            return baseRouting;
        }

        return { ...baseRouting, courtTypes: ['YARGITAYKARARI'] };
    }

    return baseRouting;
};

const resolveTargetBirimCodes = ({
    courtTypes = [],
    filters = {},
    effectiveText = '',
    preferredBirimCodes = [],
} = {}) => {
    const explicitCandidates = dedupeBirimCodes([
        ...(Array.isArray(preferredBirimCodes) ? preferredBirimCodes : []),
        ...(Array.isArray(filters?.birimAdiCandidates) ? filters.birimAdiCandidates : []),
        filters?.birimAdi,
    ]);
    const textDerivedSpecialCodes = dedupeBirimCodes(
        extractBirimCodesFromCourtHint(effectiveText).filter((code) => SPECIAL_BIRIM_CODES.has(code)),
        SIMPLE_MAX_TARGET_BIRIM_CODES
    );
    const candidates = dedupeBirimCodes([
        ...explicitCandidates,
        ...textDerivedSpecialCodes,
    ], SIMPLE_MAX_TARGET_BIRIM_CODES);

    return candidates
        .filter((code) => !SPECIAL_BIRIM_CODES.has(code) || explicitCandidates.includes(code) || textDerivedSpecialCodes.includes(code))
        .filter((code) => matchesCourtTypeFamily(code, courtTypes))
        .slice(0, SIMPLE_MAX_TARGET_BIRIM_CODES);
};

const extractAnayasaLinks = (html = '') => {
    const matches = [];
    const regex = /<a[^>]+href="([^"]*kararlarbilgibankasi\.anayasa\.gov\.tr[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html))) {
        const documentUrl = String(match[1] || '').trim();
        const anchorText = stripHtml(match[2] || '').replace(/\s+/g, ' ').trim();
        const windowStart = Math.max(0, match.index - 320);
        const contextText = stripHtml(String(html).slice(windowStart, match.index + 200))
            .replace(/\s+/g, ' ')
            .trim();
        if (!documentUrl) continue;
        matches.push({
            documentUrl,
            title: anchorText || 'Anayasa Mahkemesi Karari',
            summary: contextText,
        });
    }
    return matches;
};

const ANAYASA_SOURCE_PAGES = {
    anayasa_bireysel_basvuru_makul_sure: [
        'https://www.anayasa.gov.tr/tr/bireysel-basvuru/temel-hak-ve-ozgurluklerin-ihlaline-dair-emsal-kararlar/adil-yargilanma-hakki-medeni-hak-ve-yukumlulukler/kararlar/',
        'https://www.anayasa.gov.tr/tr/bireysel-basvuru/temel-hak-ve-ozgurluklerin-ihlaline-dair-emsal-kararlar/adil-yargilanma-hakki-medeni-hak-ve-yukumlulukler/tum-liste',
    ],
    anayasa_bireysel_basvuru: [
        'https://www.anayasa.gov.tr/tr/bireysel-basvuru/temel-hak-ve-ozgurluklerin-ihlaline-dair-emsal-kararlar/adil-yargilanma-hakki-medeni-hak-ve-yukumlulukler/kararlar/',
        'https://www.anayasa.gov.tr/tr/bireysel-basvuru/temel-hak-ve-ozgurluklerin-ihlaline-dair-emsal-kararlar/adil-yargilanma-hakki-medeni-hak-ve-yukumlulukler/tum-liste',
    ],
    anayasa_norm_denetimi: [
        'https://www.anayasa.gov.tr/tr/kararlar/norm-denetimi-kararlari/',
    ],
};

const resolveAnayasaSourcePages = ({ routingProfile = null } = {}) => {
    const subdomain = String(routingProfile?.subdomain || '').trim();
    return ANAYASA_SOURCE_PAGES[subdomain] || ANAYASA_SOURCE_PAGES.anayasa_bireysel_basvuru;
};

const scoreAnayasaCandidate = ({
    candidate = {},
    mustConcepts = [],
    supportConcepts = [],
    denyConcepts = [],
} = {}) => {
    const haystack = normalizeText([
        candidate?.title,
        candidate?.summary,
        'anayasa mahkemesi bireysel basvuru hak ihlali',
    ].filter(Boolean).join(' '));
    const mustHits = dedupeList((Array.isArray(mustConcepts) ? mustConcepts : []).filter((item) => {
        const token = normalizeText(item);
        return token && haystack.includes(token);
    }));
    const supportHits = dedupeList((Array.isArray(supportConcepts) ? supportConcepts : []).filter((item) => {
        const token = normalizeText(item);
        return token && haystack.includes(token);
    }));
    const denyHits = dedupeList((Array.isArray(denyConcepts) ? denyConcepts : []).filter((item) => {
        const token = normalizeText(item);
        return token && haystack.includes(token);
    }));

    return {
        mustHits,
        supportHits,
        denyHits,
        score: (mustHits.length * 60) + (supportHits.length * 24) - (denyHits.length * 80),
    };
};

const searchAnayasaDecisions = async ({
    routingProfile = null,
    abortSignal = null,
} = {}) => {
    const sourcePages = resolveAnayasaSourcePages({ routingProfile });
    const aggregated = [];
    for (const pageUrl of sourcePages) {
        let html = '';
        try {
            html = await fetchTextWithTimeout(pageUrl, abortSignal);
        } catch {
            html = await fetchTextViaPowerShell(pageUrl, abortSignal);
        }
        aggregated.push(...extractAnayasaLinks(html));
    }

    return aggregated
        .map((candidate, index) => {
            const score = scoreAnayasaCandidate({
                candidate,
                mustConcepts: routingProfile?.mustConcepts || [],
                supportConcepts: routingProfile?.supportConcepts || [],
                denyConcepts: routingProfile?.denyConcepts || [],
            });
            return {
                documentId: '',
                documentUrl: candidate.documentUrl,
                birimAdi: 'Anayasa Mahkemesi',
                itemType: { name: 'ANAYASAKARAR', description: 'Anayasa Mahkemesi Karari' },
                esasNo: '',
                kararNo: '',
                title: candidate.title,
                ozet: candidate.summary,
                snippet: candidate.summary,
                __score: score.score,
                __mustHits: score.mustHits,
                __supportHits: score.supportHits,
                __denyHits: score.denyHits,
                __index: index,
            };
        })
        .filter((item) => item.__denyHits.length === 0)
        .filter((item) => item.__mustHits.length > 0 || item.__supportHits.length > 0)
        .sort((left, right) => {
            if (right.__score !== left.__score) return right.__score - left.__score;
            return left.__index - right.__index;
        })
        .slice(0, 10)
        .map(({ __score, __mustHits, __supportHits, __denyHits, __index, ...item }) => item);
};

const buildCompactCandidateScore = (value, anchorSet) => {
    const normalized = normalizeText(value);
    if (!normalized) return 0;

    const tokens = normalized.split(' ').filter(Boolean);
    let score = anchorSet.has(normalized) ? 100 : 0;
    score += tokens.length * 10;

    for (const token of tokens) {
        if (token.length >= 8) score += 2;
        if (SHORT_LEGAL_TOKENS.has(token)) score += 4;
    }

    return score;
};

const buildCompactPhraseCandidates = (tokens, anchorSet) => {
    const candidates = [];
    const seen = new Set();

    for (const size of [3, 2]) {
        for (let index = 0; index <= tokens.length - size; index += 1) {
            const chunk = tokens.slice(index, index + size);
            const value = chunk.join(' ').trim();
            if (!value) continue;

            const normalized = normalizeText(value);
            if (!normalized || seen.has(normalized)) continue;

            const score = buildCompactCandidateScore(value, anchorSet);
            if (score <= 0) continue;

            seen.add(normalized);
            candidates.push({ value, score });
        }
    }

    return candidates.sort((left, right) => right.score - left.score);
};

const dedupePhraseChunks = (values = [], limit = 3) => {
    const selected = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized)) continue;

        const overlapsExisting = selected.some((item) =>
            item.includes(normalized) || normalized.includes(item)
        );
        if (overlapsExisting) continue;

        seen.add(normalized);
        selected.push(normalized);
        if (selected.length >= limit) break;
    }

    return selected;
};

const extractArticlePhraseChunks = (query = '') => {
    const matches = normalizeText(query).match(/\b(?:tck|cmk|tbk|tmk|hmk|iik|ttk|iyuk|vuk)\s+\d{1,3}(?:\/\d+)?\b/g);
    return dedupePhraseChunks(matches || [], 2);
};

const extractOperatorPhraseChunks = (query = '') => {
    const normalized = normalizeText(query);
    if (!normalized) return [];

    const anchorMatches = COMPACT_QUERY_PHRASE_ANCHORS
        .map((phrase) => normalizeText(phrase))
        .filter((phrase) => phrase && normalized.includes(phrase))
        .sort((left, right) => {
            const leftIndex = normalized.indexOf(left);
            const rightIndex = normalized.indexOf(right);
            if (leftIndex !== rightIndex) return leftIndex - rightIndex;
            return right.length - left.length;
        });
    const dedupedAnchors = dedupePhraseChunks(anchorMatches, 3);
    if (dedupedAnchors.length > 0) {
        return dedupePhraseChunks([...dedupedAnchors, ...extractArticlePhraseChunks(normalized)], 3);
    }

    const tokens = normalized
        .split(/\s+/)
        .filter((token) => isQuerySignalToken(token) && !QUERY_STOPWORDS.has(token));
    const anchorSet = new Set(COMPACT_QUERY_PHRASE_ANCHORS.map((value) => normalizeText(value)));
    const candidates = buildCompactPhraseCandidates(tokens, anchorSet)
        .map((item) => item.value)
        .filter((value) => normalizeText(value).split(/\s+/).length >= 2);

    return dedupePhraseChunks([...candidates, ...extractArticlePhraseChunks(normalized)], 3);
};

const buildCezaFocusedVariants = ({ querySeedText = '', rawText = '' } = {}) => {
    const combined = normalizeText([querySeedText, rawText].filter(Boolean).join(' '));
    const normalizedRaw = normalizeText(rawText);
    if (!combined.includes('uyusturucu')) return [];

    const variants = [];
    const has188 = combined.includes('188');
    const has191 = combined.includes('191');
    const explicitlyTargets188 = normalizedRaw.includes('188')
        || normalizedRaw.includes('ticaret')
        || normalizedRaw.includes('saglama');
    const explicitlyTargets191 = normalizedRaw.includes('191')
        || normalizedRaw.includes('kullanmak')
        || normalizedRaw.includes('bulundurma');
    const firstSubstance = CEZA_DRUG_SUBSTANCE_TOKENS.find((token) => combined.includes(token));
    const evidenceTokens = CEZA_DRUG_EVIDENCE_TOKENS.filter((token) => combined.includes(token));

    if (explicitlyTargets188 || has188 || combined.includes('ticaret')) {
        variants.push(dedupeList([
            firstSubstance || 'uyusturucu',
            'ticaret',
            has188 ? '188' : '',
        ]).map((token) => `+${token}`).join(' '));
    }

    if (
        explicitlyTargets191
        || (
            !explicitlyTargets188
            && (has191 || combined.includes('kullanmak') || combined.includes('bulundurma'))
        )
    ) {
        variants.push(dedupeList([
            'kullanmak',
            'bulundurma',
            has191 ? '191' : '',
        ]).map((token) => `+${token}`).join(' '));
    }

    if (firstSubstance && evidenceTokens.length > 0) {
        variants.push(dedupeList([
            evidenceTokens[0],
            firstSubstance,
            has188 || combined.includes('ticaret') ? 'ticaret' : '',
        ]).map((token) => `+${token}`).join(' '));
    }

    return dedupeList(variants.filter(Boolean));
};

const filterConflictingCezaVariants = ({
    variants = [],
    querySeedText = '',
    rawText = '',
} = {}) => {
    const normalizedContext = normalizeText(rawText || querySeedText);
    const explicitlyTargets188 = normalizedContext.includes('188')
        || normalizedContext.includes('ticaret')
        || normalizedContext.includes('saglama');
    const explicitlyTargets191 = normalizedContext.includes('191')
        || normalizedContext.includes('kullanmak')
        || normalizedContext.includes('bulundurma')
        || normalizedContext.includes('kisisel kullanim');

    if (
        (!explicitlyTargets188 && !explicitlyTargets191)
        || (explicitlyTargets188 && explicitlyTargets191)
    ) {
        return dedupeList(variants.filter(Boolean));
    }

    const blockedTerms = explicitlyTargets188
        ? ['191', 'kullanmak icin bulundurma', 'kisisel kullanim']
        : ['188', 'uyusturucu madde ticareti', 'ticaret kasti', 'saglama'];

    return dedupeList(
        variants.filter((variant) => {
            const normalizedVariant = normalizeText(variant);
            if (!normalizedVariant) return false;
            return !blockedTerms.some((term) => normalizedVariant.includes(normalizeText(term)));
        })
    );
};

const buildDocumentRerankSignals = async ({
    querySeedText = '',
    rawText = '',
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    skillPlan = null,
    agentBundle: injectedAgentBundle = null,
} = {}) => {
    let agentBundle = injectedAgentBundle;
    let agentAnalysis = injectedAgentBundle?.analysis || null;
    let agentQueryPlan = injectedAgentBundle?.queryPlan || null;
    const useAgentPipeline = String(process.env.LEGAL_AGENT_PIPELINE || '1').trim() !== '0';
    if (!agentBundle && useAgentPipeline && (querySeedText || rawText)) {
        try {
            agentBundle = await buildAgentSignalBundle({
                rawText: [querySeedText, rawText].filter(Boolean).join(' ').trim(),
            });
            agentAnalysis = agentBundle?.analysis || null;
            agentQueryPlan = agentBundle?.queryPlan || null;
        } catch {
            agentBundle = null;
            agentAnalysis = null;
            agentQueryPlan = null;
        }
    }
    const fallbackSkillPackage = skillPlan
        ? null
        : buildSkillBackedSearchPackage({
            rawText: [querySeedText, rawText].filter(Boolean).join(' ').trim(),
            preferredSource: 'all',
        });
    const resolvedSkillPlan = skillPlan || (
        fallbackSkillPackage?.primaryDomain === primaryDomain
            ? fallbackSkillPackage?.strategies?.[0]?.plan || null
            : null
    );
    const skillRetrieval = dedupePhraseChunks(resolvedSkillPlan?.retrievalConcepts || [], 6);
    const skillSupport = dedupePhraseChunks(resolvedSkillPlan?.supportConcepts || [], 4);
    const skillEvidence = dedupePhraseChunks(resolvedSkillPlan?.evidenceConcepts || [], 4);
    const agenticMustConcepts = dedupePhraseChunks(
        (
            Array.isArray(agentAnalysis?.requiredConcepts) && agentAnalysis.requiredConcepts.length > 0
                ? agentAnalysis.requiredConcepts
                : (resolvedSkillPlan?.requiredConcepts || resolvedSkillPlan?.mustConcepts || [])
        ),
        6
    );
    const agenticContrastConcepts = dedupePhraseChunks(resolvedSkillPlan?.contrastConcepts || [], 6);
    const agenticNegativeConcepts = dedupePhraseChunks(
        Array.isArray(agentAnalysis?.negativeConcepts) && agentAnalysis.negativeConcepts.length > 0
            ? agentAnalysis.negativeConcepts
            : [],
        10
    );
    const hasAgenticSignalAuthority =
        agenticMustConcepts.length > 0
        || agenticContrastConcepts.length > 0;
    const phraseSignals = dedupePhraseChunks([
        ...extractOperatorPhraseChunks(querySeedText),
        ...extractOperatorPhraseChunks(rawText),
        ...skillRetrieval,
        ...skillSupport,
    ], 16);
    const queryCorePhraseSignals = dedupePhraseChunks([
        ...extractOperatorPhraseChunks(querySeedText),
        ...extractOperatorPhraseChunks(rawText),
        ...extractArticlePhraseChunks(querySeedText),
        ...extractArticlePhraseChunks(rawText),
        ...skillRetrieval,
    ], 8);
    // Cross-domain safety net: scan ALL domain keyword lists and add any keyword
    // whose normalized form appears in the query text, regardless of detected domain.
    // This ensures substantive/factPattern signals work even when domain detection fails
    // (e.g. borclar queries detected as null).
    const queryTextNormalized = normalizeText([querySeedText, rawText].filter(Boolean).join(' '));
    const crossDomainSubstantive = [];
    if (queryTextNormalized && !hasAgenticSignalAuthority) {
        Object.entries(DOMAIN_SUBSTANTIVE_SIGNAL_MAP).forEach(([, keywords]) => {
            (keywords || []).forEach((kw) => {
                const nkw = normalizeText(kw);
                if (nkw && nkw.length > 2 && queryTextNormalized.includes(nkw)) {
                    crossDomainSubstantive.push(kw);
                }
            });
        });
    }

    const substantiveSignals = dedupePhraseChunks([
        ...extractArticlePhraseChunks(querySeedText),
        ...extractArticlePhraseChunks(rawText),
        ...skillRetrieval,
        ...skillSupport,
        ...(hasAgenticSignalAuthority ? [] : (DOMAIN_SUBSTANTIVE_SIGNAL_MAP[primaryDomain] || [])),
        ...crossDomainSubstantive,
    ], 28);
    const evidenceSignals = dedupePhraseChunks(skillEvidence, 10);
    const agentQuerySignals = dedupePhraseChunks(
        Array.isArray(agentQueryPlan?.queries) ? agentQueryPlan.queries : [],
        6
    );
    const factPatternSignals = dedupePhraseChunks([
        ...agenticMustConcepts,
        ...agentQuerySignals,
        ...skillSupport,
        ...skillEvidence,
    ], 20);
    const tokenSignals = dedupeList([
        ...phraseSignals.flatMap((phrase) => normalizeText(phrase).split(/\s+/)),
        ...normalizeText(querySeedText).split(/\s+/),
        ...skillRetrieval.flatMap((phrase) => normalizeText(phrase).split(/\s+/)),
        ...skillSupport.flatMap((phrase) => normalizeText(phrase).split(/\s+/)),
        ...skillEvidence.flatMap((phrase) => normalizeText(phrase).split(/\s+/)),
    ])
        .map((token) => normalizeText(token))
        .filter((token) => token && !QUERY_STOPWORDS.has(token) && isQuerySignalToken(token))
        .slice(0, 24);
    const queryCoreTokenSignals = dedupeList([
        ...queryCorePhraseSignals.flatMap((phrase) => normalizeText(phrase).split(/\s+/)),
        ...normalizeText(querySeedText).split(/\s+/),
        ...normalizeText(rawText).split(/\s+/),
    ])
        .map((token) => normalizeText(token))
        .filter((token) => token && !QUERY_STOPWORDS.has(token) && isQuerySignalToken(token))
        .slice(0, 18);
    const mustSignals = dedupePhraseChunks([
        ...agenticMustConcepts,
        ...queryCorePhraseSignals.slice(0, 2),
    ], 8);
    const contrastSignals = dedupePhraseChunks(agenticContrastConcepts, 8);
    const negativeSignals = dedupePhraseChunks(
        [
            ...(Array.isArray(resolvedSkillPlan?.negativeConcepts) ? resolvedSkillPlan.negativeConcepts : []),
            ...agenticNegativeConcepts,
        ],
        14
    )
        .map((value) => normalizeText(value))
        .filter(Boolean);

    return {
        phraseSignals,
        queryCorePhraseSignals,
        substantiveSignals,
        evidenceSignals,
        factPatternSignals,
        tokenSignals,
        queryCoreTokenSignals,
        mustSignals,
        contrastSignals,
        negativeSignals,
        agentDiagnostics: agentAnalysis
            ? {
                domain: agentAnalysis?.domain || null,
                birim: agentAnalysis?.birim || null,
                requiredConcepts: agentAnalysis?.requiredConcepts || [],
                negativeConcepts: agentAnalysis?.negativeConcepts || [],
                queryMode: agentQueryPlan?.queryMode || null,
                queryCount: Array.isArray(agentQueryPlan?.queries) ? agentQueryPlan.queries.length : 0,
            }
            : null,
    };
};

const scoreDocumentAgainstSignals = ({
    documentText = '',
    signals = {},
} = {}) => {
    const normalizedDocument = normalizeText(documentText);
    if (!normalizedDocument) {
        return {
            score: 0,
            phraseHits: [],
            queryCorePhraseHits: [],
            substantiveHits: [],
            evidenceHits: [],
            factPatternHits: [],
            tokenHits: [],
            queryCoreTokenHits: [],
            mustHits: [],
            contrastHits: [],
            negativeHits: [],
            proceduralHits: [],
        };
    }

    const phraseHits = (signals?.phraseSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const queryCorePhraseHits = (signals?.queryCorePhraseSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const substantiveHits = (signals?.substantiveSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const evidenceHits = (signals?.evidenceSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const factPatternHits = (signals?.factPatternSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const tokenHits = (signals?.tokenSignals || []).filter((token) => token && normalizedDocument.includes(token));
    const queryCoreTokenHits = (signals?.queryCoreTokenSignals || []).filter((token) => token && normalizedDocument.includes(token));
    const mustHits = (signals?.mustSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const contrastHits = (signals?.contrastSignals || []).filter((phrase) => phrase && normalizedDocument.includes(phrase));
    const negativeHits = (signals?.negativeSignals || []).filter((token) => token && normalizedDocument.includes(token));
    const domainProceduralMarkers = PROCEDURAL_DECISION_MARKERS;
    const proceduralHits = domainProceduralMarkers.filter((marker) => normalizedDocument.includes(marker));

    let score = (phraseHits.length * 165)
        + (queryCorePhraseHits.length * 220)
        + (substantiveHits.length * 126)
        + (evidenceHits.length * 48)
        + (factPatternHits.length * 72)
        + (tokenHits.length * 12)
        + (queryCoreTokenHits.length * 18)
        + (mustHits.length * 210)
        - (contrastHits.length * 32)
        - (negativeHits.length * 54)
        - (proceduralHits.length * 30);

    if (queryCorePhraseHits.length >= 1) score += 120;
    if (queryCorePhraseHits.length >= 2) score += 160;
    if (mustHits.length >= 1) score += 140;
    if (mustHits.length >= 2) score += 180;
    if (substantiveHits.length >= 2) score += 105;
    if (substantiveHits.length >= 4) score += 135;
    if (evidenceHits.length >= 2) score += 60;
    if (factPatternHits.length >= 2) score += 90;
    if (factPatternHits.length >= 4) score += 120;

    if ((signals?.queryCorePhraseSignals || []).length >= 2 && queryCorePhraseHits.length === 0) {
        score -= queryCoreTokenHits.length === 0 ? 420 : 260;
    } else if ((signals?.queryCorePhraseSignals || []).length === 1 && queryCorePhraseHits.length === 0 && queryCoreTokenHits.length < 3) {
        score -= 180;
    } else if ((signals?.queryCoreTokenSignals || []).length >= 5 && queryCoreTokenHits.length < 2) {
        score -= 150;
    }

    if ((signals?.mustSignals || []).length >= 2 && mustHits.length === 0) {
        score -= (contrastHits.length > 0) ? 420 : 300;
    } else if ((signals?.mustSignals || []).length >= 1 && mustHits.length === 0) {
        score -= contrastHits.length > 0 ? 260 : 180;
    }

    if (contrastHits.length > 0 && mustHits.length === 0) {
        score -= 180 + (contrastHits.length * 32);
    }

    if (proceduralHits.length >= 2 && factPatternHits.length === 0 && substantiveHits.length === 0 && phraseHits.length <= 1 && tokenHits.length <= 4) {
        score -= 360;
    } else if (proceduralHits.length >= substantiveHits.length + 2) {
        score -= 180;
    }

    if (proceduralHits.length > 0 && factPatternHits.length === 0 && evidenceHits.length === 0) {
        score -= 120;
    }

    return {
        score,
        phraseHits,
        queryCorePhraseHits,
        substantiveHits,
        evidenceHits,
        factPatternHits,
        tokenHits,
        queryCoreTokenHits,
        mustHits,
        contrastHits,
        negativeHits,
        proceduralHits,
    };
};

const scoreMetadataCandidate = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    signals = {},
} = {}) => {
    const metadataText = [
        String(result?.title || '').trim(),
        String(result?.summaryText || result?.ozet || result?.snippet || '').trim(),
        String(result?.daire || '').trim(),
        String(result?.source || '').trim(),
        String(result?.esasNo || '').trim(),
        String(result?.kararNo || '').trim(),
    ].filter(Boolean).join('\n');

    const baseScore = scoreDocumentAgainstSignals({
        documentText: metadataText,
        primaryDomain,
        signals,
    });

    let score = Number(baseScore.score || 0);
    if (baseScore.queryCorePhraseHits.length > 0) score += 140;
    if (baseScore.substantiveHits.length > 0) score += 70;
    if (baseScore.factPatternHits.length > 1) score += 30;
    if (baseScore.proceduralHits.length > 0 && baseScore.substantiveHits.length === 0) score -= 40;

    return {
        ...baseScore,
        score,
    };
};

export const compactSimpleLegalQuery = (rawText = '') => {
    const { text } = sanitizeLegalInput(rawText);
    const trimmed = String(text || '').trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    if (!trimmed) return '';
    if (trimmed.length <= 220 && wordCount <= 30) return trimmed;

    const normalized = normalizeForCompactQuery(trimmed) || normalizeText(trimmed);
    const anchorSet = new Set(COMPACT_QUERY_PHRASE_ANCHORS.map((value) => normalizeText(value)));
    const selected = [];
    const seen = new Set();

    for (const phrase of COMPACT_QUERY_PHRASE_ANCHORS) {
        const normalizedPhrase = normalizeText(phrase);
        if (normalized.includes(normalizedPhrase) && !seen.has(normalizedPhrase)) {
            seen.add(normalizedPhrase);
            selected.push(phrase);
            if (selected.length >= 3) break;
        }
    }

    const tokens = normalized
        .split(/\s+/)
        .filter((token) => isQuerySignalToken(token) && !QUERY_STOPWORDS.has(token));

    const candidates = buildCompactPhraseCandidates(tokens, anchorSet);
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeText(candidate.value);
        if (seen.has(normalizedCandidate)) continue;
        seen.add(normalizedCandidate);
        selected.push(candidate.value);
        if (selected.length >= 6) break;
    }

    if (selected.length === 0) {
        for (const token of tokens.slice(0, 6)) {
            if (seen.has(token)) continue;
            seen.add(token);
            selected.push(token);
        }
    }

    const compact = selected.join(' ').replace(/\s+/g, ' ').trim();
    if (compact) return compact.slice(0, 120).trim();

    return trimmed.slice(0, 120).trim();
};

export const buildQuotedRequiredPhraseVariant = (query = '') => {
    const sanitized = String(query || '').replace(/\s+/g, ' ').trim();
    if (!sanitized) return '';
    if (/[+\-"]|\b(?:AND|OR|NOT)\b/i.test(sanitized)) return '';

    const phraseChunks = extractOperatorPhraseChunks(sanitized);
    if (phraseChunks.length === 0) return '';

    // Bedesten strict timeouts spike when every chunk is mandatory; keep one hard anchor.
    return phraseChunks.map((phrase, index) => (
        index === 0 ? `+"${phrase}"` : `"${phrase}"`
    )).join(' ');
};

export const buildRequiredTermVariant = (query = '') => {
    const sanitized = String(query || '').replace(/\s+/g, ' ').trim();
    if (!sanitized) return '';
    if (/[+\-"]|\b(?:AND|OR|NOT)\b/i.test(sanitized)) return '';

    const tokens = normalizeText(sanitized)
        .split(/\s+/)
        .filter((token) =>
            token && !QUERY_STOPWORDS.has(token) && (token.length >= 4 || SHORT_LEGAL_TOKENS.has(token))
        )
        .slice(0, 4);

    if (tokens.length < 2) return '';

    const dedupedTokens = dedupeList(tokens);
    const structuredTerms = [
        dedupedTokens.slice(0, 2).join(' '),
        ...dedupedTokens.slice(2),
    ].filter(Boolean);

    return structuredTerms.map((term, index) => (
        index === 0
            ? `+"${term}"`
            : term
    )).join(' ');
};

const buildStructuredQueryVariant = (terms = []) => {
    const normalizedTerms = dedupeList(terms)
        .map((term) => normalizeText(term))
        .filter(Boolean)
        .slice(0, 3);

    if (normalizedTerms.length < 2) return '';

    const parts = normalizedTerms.map((term, index) => (
        term.includes(' ') || /\d/.test(term)
            ? (index === 0 ? `+"${term}"` : `"${term}"`)
            : (index === 0 ? `+${term}` : term)
    ));

    return dedupeList(parts).join(' ');
};

const buildDomainFocusedVariants = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    querySeedText = '',
    rawText = '',
    skillPlan = null,
} = {}) => {
    const fallbackSkillPackage = skillPlan
        ? null
        : buildSkillBackedSearchPackage({
            rawText: [querySeedText, rawText].filter(Boolean).join(' ').trim(),
            preferredSource: 'all',
        });
    const resolvedSkillPlan = skillPlan || (
        fallbackSkillPackage?.primaryDomain === primaryDomain
            ? fallbackSkillPackage?.strategies?.[0]?.plan || null
            : null
    );
    const retrievalConcepts = dedupePhraseChunks(resolvedSkillPlan?.retrievalConcepts || [], 4);
    const supportConcepts = dedupePhraseChunks(resolvedSkillPlan?.supportConcepts || [], 4);
    const evidenceConcepts = dedupePhraseChunks(resolvedSkillPlan?.evidenceConcepts || [], 2);
    const skillClauses = dedupeList([
        ...(resolvedSkillPlan?.searchClauses || []),
        ...(resolvedSkillPlan?.candidateQueries || []),
    ]).slice(0, 4);
    const articleConcepts = dedupePhraseChunks([
        ...extractArticlePhraseChunks(querySeedText),
        ...extractArticlePhraseChunks(rawText),
    ], 2);

    if (retrievalConcepts.length === 0 && supportConcepts.length === 0 && evidenceConcepts.length === 0 && articleConcepts.length === 0 && skillClauses.length === 0) {
        return [];
    }

    const variants = [...skillClauses];
    const seedTerms = [
        ...retrievalConcepts,
        ...supportConcepts,
        ...evidenceConcepts,
        ...articleConcepts,
    ].slice(0, 6);

    if (seedTerms.length >= 2) variants.push(buildStructuredQueryVariant(seedTerms.slice(0, 2)));
    if (seedTerms.length >= 3) variants.push(buildStructuredQueryVariant(seedTerms.slice(0, 3)));
    if (seedTerms.length >= 4) variants.push(buildStructuredQueryVariant([seedTerms[0], seedTerms[2], seedTerms[3]]));

    return dedupeList(variants).slice(0, 4);
};

const extractDecisionSummary = (decision = {}) => {
    const candidate = [
        decision?.ozet,
        decision?.summary,
        decision?.summaryText,
        decision?.snippet,
        decision?.kararOzeti,
        decision?.kararOzet,
        decision?.highlightText,
        decision?.highlight,
        decision?.contentSummary,
    ].find((value) => String(value || '').trim());

    return String(candidate || '').replace(/\s+/g, ' ').trim();
};

const buildPreviewFromDocument = ({
    documentText = '',
} = {}) => {
    const compact = String(documentText || '').trim();
    if (!compact) return '';
    return compact.slice(0, 4500).trim();
};

const buildSelectionReason = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    substantiveHits = [],
    evidenceHits = [],
    factPatternHits = [],
    proceduralHits = [],
} = {}) => {
    const required = dedupeList(substantiveHits).slice(0, 3);
    const evidence = dedupeList(evidenceHits).slice(0, 2);
    const facts = dedupeList(factPatternHits).slice(0, 3);
    const procedural = dedupeList(proceduralHits).slice(0, 2);

    if (required.length > 0) {
        const parts = [`Tam metin dogrulamasi: ${required.join(', ')} eslesmesi`];
        if (facts.length > 0) parts.push(`olay kalibi: ${facts.join(', ')}`);
        if (evidence.length > 0) parts.push(`delil sinyalleri: ${evidence.join(', ')}`);
        return parts.join(' | ');
    }

    if (procedural.length > 0) {
        return `${primaryDomain} alaninda usul baskinligi saptandi: ${procedural.join(', ')}`;
    }

    return `${primaryDomain} alaninda ilk adaylar arasinda anlam eslesmesi bulundu.`;
};

const assessSimpleQuality = ({
    results = [],
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    targetSources = [],
} = {}) => {
    const list = Array.isArray(results) ? results : [];
    const top = list[0] || null;
    const topThree = list.slice(0, 3);
    const reasons = [];
    let score = list.length > 0 ? 48 : 0;

    if (!top) {
        return {
            score: 0,
            reasons: ['no_candidates'],
        };
    }

    const expectedDanistay = ['idare', 'vergi'].includes(primaryDomain);
    if (expectedDanistay && top.source !== 'danistay') {
        score -= 24;
        reasons.push('wrong_source_bias');
    } else if (!expectedDanistay && top.source === 'danistay') {
        score -= 18;
        reasons.push('wrong_source_bias');
    } else {
        score += 8;
    }

    const topRequired = Array.isArray(top.matchedRequiredConcepts) ? top.matchedRequiredConcepts.length : 0;
    const topSubstantive = Array.isArray(top.contentMatchedSubstantive) ? top.contentMatchedSubstantive.length : 0;
    const topEvidence = Array.isArray(top.matchedEvidenceConcepts) ? top.matchedEvidenceConcepts.length : 0;
    const topNegative = Array.isArray(top.matchedNegativeConcepts) ? top.matchedNegativeConcepts.length : 0;
    const topProcedural = Array.isArray(top.contentProceduralHits) ? top.contentProceduralHits.length : 0;
    const topFactPatternAssessment = computeResultFactPatternAssessment(top);

    if (topRequired > 0 || topSubstantive > 0) {
        score += 20 + (topRequired * 4) + (topSubstantive * 3);
    } else {
        score -= 22;
        reasons.push('missing_substantive_match');
    }

    if (topFactPatternAssessment.hitCount > 0) {
        score += 14 + Math.min(16, topFactPatternAssessment.hitCount * 4);
    } else if (topProcedural > 0 || topRequired > 0 || topSubstantive > 0) {
        score -= 18;
        reasons.push('missing_fact_pattern');
    }

    if (topEvidence > 0) score += Math.min(10, topEvidence * 3);
    if (topNegative > 0) {
        score -= Math.min(18, topNegative * 6);
        reasons.push('negative_match_bias');
    }

    if (topProcedural > Math.max(1, topSubstantive)) {
        score -= 26;
        reasons.push('procedural_bias');
    }
    if (topFactPatternAssessment.proceduralShellBias) {
        score -= 24;
        reasons.push('procedural_shell_bias');
    }

    if (!String(top.ozet || top.snippet || '').trim()) {
        score -= 12;
        reasons.push('missing_preview');
    } else {
        score += 6;
    }

    if (!String(top.selectionReason || '').trim()) {
        score -= 8;
    } else {
        score += 4;
    }

    const topThreeSubstantive = topThree.reduce((total, item) => (
        total + (Array.isArray(item?.matchedRequiredConcepts) ? item.matchedRequiredConcepts.length : 0)
    ), 0);
    if (topThreeSubstantive >= 3) score += 12;

    if (Array.isArray(targetSources) && targetSources.length > 0) score += 2;

    return {
        score: Math.max(0, Math.min(100, score)),
        reasons: dedupeList(reasons),
        topFactPatternScore: topFactPatternAssessment.score,
        topFactPatternHitCount: topFactPatternAssessment.hitCount,
        topFactPatternHits: topFactPatternAssessment.hits,
        topProceduralHitCount: topFactPatternAssessment.proceduralHits.length,
        proceduralShellBias: topFactPatternAssessment.proceduralShellBias,
    };
};

const mapItemSource = (itemTypeName = '', fallbackSource = 'all') =>
    BEDDESTEN_ITEM_SOURCE_MAP[String(itemTypeName || '').trim()] || fallbackSource || 'all';

const formatDisplayDate = (decision = {}) => {
    const display = String(decision?.kararTarihiStr || '').trim();
    if (display) return display;

    const isoValue = String(decision?.kararTarihi || '').trim();
    if (!isoValue) return '';

    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return isoValue;

    return new Intl.DateTimeFormat('tr-TR').format(parsed);
};

const getBirimCodeMarkers = (code = '') => {
    const normalizedCode = normalizeBirimCode(code);
    const numberMatch = normalizedCode.match(/^([HCD])(\d{1,2})$/);
    if (numberMatch) {
        const value = Number(numberMatch[2]);
        if (numberMatch[1] === 'H') return [`${value}. hukuk dairesi`, `${value} hukuk dairesi`, `${value}. hukuk`, `${value} hukuk`];
        if (numberMatch[1] === 'C') return [`${value}. ceza dairesi`, `${value} ceza dairesi`, `${value}. ceza`, `${value} ceza`];
        if (numberMatch[1] === 'D') return [`${value}. daire`, `${value} daire`, `${value}. idari dava dairesi`, `${value} idari dava dairesi`];
    }

    if (normalizedCode === 'HGK') return ['hukuk genel kurulu'];
    if (normalizedCode === 'CGK') return ['ceza genel kurulu'];
    if (normalizedCode === 'VDDK') return ['vergi dava daireleri kurulu'];
    return [];
};

const getDomainDaireMarkers = (primaryDomain = DEFAULT_DOMAIN_PROFILE_ID) => {
    if (primaryDomain === 'ceza') return ['ceza dairesi', 'ceza genel kurulu'];
    if (primaryDomain === 'idare') return ['danistay', 'idari dava dairesi', ' daire'];
    if (primaryDomain === 'vergi') return ['vergi dava daireleri kurulu', ' daire'];
    if (primaryDomain === 'anayasa') return ['anayasa mahkemesi'];
    return ['hukuk dairesi', 'hukuk genel kurulu'];
};

const inferResultBirimFamily = (result = {}) => {
    const haystack = normalizeText([result?.daire, result?.title].filter(Boolean).join(' '));
    if (!haystack) return '';
    if (haystack.includes('ceza dairesi') || haystack.includes('ceza genel kurulu')) return 'C';
    if (haystack.includes('hukuk dairesi') || haystack.includes('hukuk genel kurulu')) return 'H';
    if (
        haystack.includes('danistay')
        || haystack.includes('idari dava dairesi')
        || haystack.includes('vergi dava daireleri kurulu')
    ) {
        return 'D';
    }
    return '';
};

const assessTargetBirimAlignment = ({
    result = {},
    targetBirimCodes = [],
} = {}) => {
    const normalizedTargetCodes = dedupeBirimCodes(Array.isArray(targetBirimCodes) ? targetBirimCodes : [], 8);
    if (normalizedTargetCodes.length === 0) {
        return {
            matched: false,
            matchRank: -1,
            sameFamilyMismatch: false,
        };
    }

    const haystack = normalizeText([result?.daire, result?.title].filter(Boolean).join(' '));
    if (!haystack) {
        return {
            matched: false,
            matchRank: -1,
            sameFamilyMismatch: false,
        };
    }

    let matchRank = -1;
    normalizedTargetCodes.forEach((code, codeIndex) => {
        const markers = getBirimCodeMarkers(code).map((item) => normalizeText(item));
        if (markers.some((marker) => marker && haystack.includes(marker))) {
            matchRank = matchRank === -1 ? codeIndex : Math.min(matchRank, codeIndex);
        }
    });

    if (matchRank >= 0) {
        return {
            matched: true,
            matchRank,
            sameFamilyMismatch: false,
        };
    }

    const resultFamily = inferResultBirimFamily(result);
    const targetFamilies = new Set(
        normalizedTargetCodes
            .map((code) => normalizeBirimCode(code).charAt(0))
            .filter(Boolean)
    );

    return {
        matched: false,
        matchRank: -1,
        sameFamilyMismatch: Boolean(resultFamily) && targetFamilies.has(resultFamily),
    };
};

const scoreResultForDomain = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    targetBirimCodes = [],
    routedCourtTypes = [],
    index = 0,
} = {}) => {
    const haystack = normalizeText([result?.daire, result?.title].filter(Boolean).join(' '));
    let score = 100 - index;

    targetBirimCodes.forEach((code, codeIndex) => {
        const markers = getBirimCodeMarkers(code).map((item) => normalizeText(item));
        if (markers.some((marker) => marker && haystack.includes(marker))) {
            score += 80 - (codeIndex * 10);
        }
    });

    const domainMarkers = getDomainDaireMarkers(primaryDomain).map((item) => normalizeText(item));
    if (domainMarkers.some((marker) => marker && haystack.includes(marker))) {
        score += 20;
    }

    if (primaryDomain === 'ceza' && haystack.includes('hukuk dairesi')) score -= 40;
    if ((primaryDomain === 'idare' || primaryDomain === 'vergi') && result?.source !== 'danistay') score -= 50;
    if (
        routedCourtTypes.includes('YARGITAYKARARI')
        && result?.source === 'danistay'
        && !['idare', 'vergi'].includes(primaryDomain)
    ) {
        score -= 25;
    }

    return score;
};

const rerankResultsForDomain = ({
    results = [],
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    targetBirimCodes = [],
    routedCourtTypes = [],
} = {}) =>
    (Array.isArray(results) ? results : [])
        .map((result, index) => ({
            ...result,
            __score: scoreResultForDomain({
                result,
                primaryDomain,
                targetBirimCodes,
                routedCourtTypes,
                index,
            }),
            __index: index,
        }))
        .sort((left, right) => {
            if (right.__score !== left.__score) return right.__score - left.__score;
            return left.__index - right.__index;
        })
        .map(({ __score, __index, ...result }) => result);

const rerankResultsByDocumentContent = async ({
    results = [],
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    querySeedText = '',
    rawText = '',
    queryMode = 'default',
    source = 'all',
    enabled = false,
    skillPlan = null,
    agentBundle = null,
    abortSignal = null,
    provider = 'http',
} = {}) => {
    throwIfAbortRequested(abortSignal);
    const baseResults = Array.isArray(results) ? results : [];
    if (!enabled || baseResults.length === 0) {
        return {
            results: baseResults,
            diagnostics: {
                applied: false,
                rerankedCount: 0,
            },
        };
    }

    const signals = await buildDocumentRerankSignals({
        querySeedText,
        rawText,
        primaryDomain,
        skillPlan,
        agentBundle,
    });
    const metadataCandidates = baseResults
        .slice(0, SIMPLE_METADATA_CANDIDATE_LIMIT)
        .map((result, index) => ({
            ...result,
            __baseIndex: index,
            __metadataScore: scoreMetadataCandidate({
                result,
                primaryDomain,
                signals,
            }).score,
        }))
        .filter((result) => String(result?.documentId || result?.documentUrl || '').trim());

    if (metadataCandidates.length === 0) {
        return {
            results: baseResults,
            diagnostics: {
                applied: false,
                rerankedCount: 0,
            },
        };
    }

    const docFetchCandidates = metadataCandidates
        .slice()
        .sort((left, right) => {
            if (right.__metadataScore !== left.__metadataScore) return right.__metadataScore - left.__metadataScore;
            return left.__baseIndex - right.__baseIndex;
        })
        .slice(0, SIMPLE_CONTENT_FETCH_LIMIT);
    const docFetchIndexSet = new Set(docFetchCandidates.map((result) => result.__baseIndex));

    const queryTextForEmbedding = String(
        skillPlan?.embeddingQuery
        || dedupeList([
            ...(skillPlan?.requiredConcepts || skillPlan?.mustConcepts || []),
        ]).join(' ')
        || querySeedText
        || rawText
        || ''
    ).trim();
    let queryEmbedding = null;
    if (isEmbeddingRerankEnabled() && queryTextForEmbedding) {
        try {
            queryEmbedding = await getEmbedding(queryTextForEmbedding, 'RETRIEVAL_QUERY');
        } catch {
            queryEmbedding = null;
        }
    }
    const embeddingCache = queryEmbedding ? new Map() : null;
    const docLimit = createAsyncLimit(SIMPLE_CONTENT_DOC_CONCURRENCY);

    const scoredEntries = await Promise.all(baseResults.map((result, index) => docLimit(async () => {
        throwIfAbortRequested(abortSignal);
        if (!docFetchIndexSet.has(index) || !String(result?.documentId || result?.documentUrl || '').trim()) {
            return {
                ...result,
                __docScore: 0,
                __docMergedScore: 0,
                __docEmbeddingScore: 0,
                __docProceduralShellBias: false,
                __docMetadataScore: index < SIMPLE_METADATA_CANDIDATE_LIMIT
                    ? Number(metadataCandidates.find((item) => item.__baseIndex === index)?.__metadataScore || 0)
                    : 0,
                __baseIndex: index,
            };
        }

        try {
            const documentPayload = await docFetchRequest(() => getLegalDocumentViaSimpleBedesten({
                source,
                documentId: result.documentId,
                documentUrl: result.documentUrl,
                abortSignal,
                provider,
                skipCliThrottle: true,
            }));
            const documentText = documentPayload?.document || '';
            const documentScore = scoreDocumentAgainstSignals({
                documentText,
                primaryDomain,
                signals,
            });
            const preview = buildPreviewFromDocument({
                documentText,
                phraseHits: documentScore.phraseHits,
                substantiveHits: documentScore.substantiveHits,
                evidenceHits: documentScore.evidenceHits,
            });
            const requiredConcepts = dedupeList([
                ...documentScore.mustHits,
                ...documentScore.substantiveHits,
                ...documentScore.phraseHits,
            ]).slice(0, 6);
            const supportConcepts = dedupeList(
                [
                    ...documentScore.phraseHits,
                    ...documentScore.factPatternHits,
                ].filter((item) => !requiredConcepts.includes(item))
            ).slice(0, 4);
            const factPatternAssessment = computeResultFactPatternAssessment({
                ...result,
                contentMatchedFactPattern: documentScore.factPatternHits,
                matchedRequiredConcepts: requiredConcepts,
                matchedSupportConcepts: supportConcepts,
                matchedEvidenceConcepts: documentScore.evidenceHits,
                contentProceduralHits: documentScore.proceduralHits,
            });
            let embeddingScore = 0;
            if (queryEmbedding) {
                try {
                    embeddingScore = await computeEmbeddingScore({
                        queryEmbedding,
                        documentText,
                        documentId: result.documentId || result.documentUrl || String(index),
                        cache: embeddingCache,
                    });
                } catch {
                    embeddingScore = 0;
                }
            }
            const mergedScore = mergeDocumentScores({
                lexicalScore: documentScore.score,
                embeddingScore,
                proceduralShellBias: factPatternAssessment.proceduralShellBias,
                queryMode,
            });
            const selectionReason = buildSelectionReason({
                primaryDomain,
                substantiveHits: documentScore.substantiveHits,
                evidenceHits: documentScore.evidenceHits,
                factPatternHits: documentScore.factPatternHits,
                proceduralHits: documentScore.proceduralHits,
            });

            return {
                ...result,
                __docScore: documentScore.score,
                __docMergedScore: mergedScore,
                __docEmbeddingScore: embeddingScore,
                __docMetadataScore: Number(metadataCandidates.find((item) => item.__baseIndex === index)?.__metadataScore || 0),
                __docPhraseHits: documentScore.phraseHits,
                __docQueryCoreHits: documentScore.queryCorePhraseHits,
                __docSubstantiveHits: documentScore.substantiveHits,
                __docEvidenceHits: documentScore.evidenceHits,
                __docFactPatternHits: documentScore.factPatternHits,
                __docTokenHits: documentScore.tokenHits,
                __docQueryTokenHits: documentScore.queryCoreTokenHits,
                __docMustHits: documentScore.mustHits,
                __docContrastHits: documentScore.contrastHits,
                __docNegativeHits: documentScore.negativeHits,
                __docProceduralHits: documentScore.proceduralHits,
                __docProceduralShellBias: factPatternAssessment.proceduralShellBias,
                __docPreview: preview,
                __docSelectionReason: selectionReason,
                __docRequiredConcepts: requiredConcepts,
                __docSupportConcepts: supportConcepts,
                __queryCoreSignalCount: Array.isArray(signals?.queryCorePhraseSignals) ? signals.queryCorePhraseSignals.length : 0,
                __queryTokenSignalCount: Array.isArray(signals?.queryCoreTokenSignals) ? signals.queryCoreTokenSignals.length : 0,
                __baseIndex: index,
            };
        } catch (error) {
            if (error?.code === 'REQUEST_ABORTED') throw error;
            return {
                ...result,
                __docScore: 0,
                __docMergedScore: 0,
                __docEmbeddingScore: 0,
                __docProceduralShellBias: false,
                __docMetadataScore: index < SIMPLE_METADATA_CANDIDATE_LIMIT
                    ? Number(metadataCandidates.find((item) => item.__baseIndex === index)?.__metadataScore || 0)
                    : 0,
                __baseIndex: index,
            };
        }
    })));

    const useJudge = String(process.env.LEGAL_AGENT_JUDGE || '1').trim() !== '0';
    let judgeDiagnostics = null;
    const judgeScoreMap = new Map();
    const judgeReasonMap = new Map();
    if (useJudge && agentBundle?.analysis) {
        const judgeCandidates = scoredEntries
            .filter((entry) => String(entry?.documentId || entry?.documentUrl || '').trim())
            .slice()
            .sort((left, right) => {
                if (right.__docMergedScore !== left.__docMergedScore) return right.__docMergedScore - left.__docMergedScore;
                return left.__baseIndex - right.__baseIndex;
            })
            .slice(0, 5)
            .map((entry) => ({
                documentId: entry.documentId || entry.documentUrl,
                title: entry.title || entry.kararAdi || '',
                daire: entry.daire || entry.mahkeme || '',
                summary: entry.ozet || entry.snippet || '',
                selectionReason: entry.__docSelectionReason || '',
            }));

        try {
            const judgeResult = await judgeDecisionSet({
                analysis: agentBundle.analysis,
                decisions: judgeCandidates,
            });
            (judgeResult?.rankedDecisions || []).forEach((item) => {
                judgeScoreMap.set(item.documentId, Number(item.score || 0));
                if (item.reason) judgeReasonMap.set(item.documentId, item.reason);
            });
            judgeDiagnostics = {
                applied: judgeScoreMap.size > 0,
                scoredCount: judgeScoreMap.size,
                rejectionReasons: judgeResult?.rejectionReasons || [],
            };
        } catch (error) {
            judgeDiagnostics = {
                applied: false,
                error: String(error?.code || error?.message || 'judge_failed'),
            };
        }
    }

    const reranked = scoredEntries
        .slice()
        .map((entry) => {
            const key = entry.documentId || entry.documentUrl || '';
            const judgeScore = judgeScoreMap.has(key) ? judgeScoreMap.get(key) : null;
            return {
                ...entry,
                __judgeScore: judgeScore,
                __judgeReason: judgeScore !== null ? judgeReasonMap.get(key) || '' : '',
            };
        })
        .sort((left, right) => {
            if (right.__judgeScore !== left.__judgeScore) {
                const leftScore = Number.isFinite(left.__judgeScore) ? left.__judgeScore : -1;
                const rightScore = Number.isFinite(right.__judgeScore) ? right.__judgeScore : -1;
                if (rightScore !== leftScore) return rightScore - leftScore;
            }
            if (right.__docMergedScore !== left.__docMergedScore) return right.__docMergedScore - left.__docMergedScore;
            if (right.__docScore !== left.__docScore) return right.__docScore - left.__docScore;
            return left.__baseIndex - right.__baseIndex;
        })
        .map(({
            __docScore,
            __docMergedScore,
            __docEmbeddingScore,
            __docMetadataScore,
            __docPhraseHits,
            __docQueryCoreHits,
            __docSubstantiveHits,
            __docEvidenceHits,
            __docFactPatternHits,
            __docTokenHits,
            __docQueryTokenHits,
            __docMustHits,
            __docContrastHits,
            __docNegativeHits,
            __docProceduralHits,
            __docProceduralShellBias,
            __docPreview,
            __docSelectionReason,
            __docRequiredConcepts,
            __docSupportConcepts,
            __queryCoreSignalCount,
            __queryTokenSignalCount,
            __judgeScore,
            __judgeReason,
            __baseIndex,
            ...result
        }) => ({
            ...result,
            judgeScore: Number.isFinite(__judgeScore) ? __judgeScore : undefined,
            judgeReason: __judgeReason ? __judgeReason : undefined,
            contentScore: __docScore || undefined,
            contentMergedScore: Number.isFinite(__docMergedScore) ? __docMergedScore : undefined,
            contentEmbeddingScore: __docEmbeddingScore || undefined,
            contentMetadataScore: Number.isFinite(__docMetadataScore) ? __docMetadataScore : undefined,
            contentMatchedPhrases: Array.isArray(__docPhraseHits) && __docPhraseHits.length > 0 ? __docPhraseHits : undefined,
            contentMatchedQueryCore: Array.isArray(__docQueryCoreHits) && __docQueryCoreHits.length > 0 ? __docQueryCoreHits : undefined,
            contentMatchedSubstantive: Array.isArray(__docSubstantiveHits) && __docSubstantiveHits.length > 0 ? __docSubstantiveHits : undefined,
            contentMatchedEvidence: Array.isArray(__docEvidenceHits) && __docEvidenceHits.length > 0 ? __docEvidenceHits : undefined,
            contentMatchedFactPattern: Array.isArray(__docFactPatternHits) && __docFactPatternHits.length > 0 ? __docFactPatternHits : undefined,
            contentMatchedTokens: Array.isArray(__docTokenHits) && __docTokenHits.length > 0 ? __docTokenHits : undefined,
            matchedMustConcepts: Array.isArray(__docMustHits) && __docMustHits.length > 0 ? __docMustHits : undefined,
            matchedContrastConcepts: Array.isArray(__docContrastHits) && __docContrastHits.length > 0 ? __docContrastHits : undefined,
            contentMatchedQueryTokens: Array.isArray(__docQueryTokenHits) && __docQueryTokenHits.length > 0 ? __docQueryTokenHits : undefined,
            contentProceduralHits: Array.isArray(__docProceduralHits) && __docProceduralHits.length > 0 ? __docProceduralHits : undefined,
            matchedRequiredConcepts: Array.isArray(__docRequiredConcepts) && __docRequiredConcepts.length > 0 ? __docRequiredConcepts : undefined,
            matchedSupportConcepts: Array.isArray(__docSupportConcepts) && __docSupportConcepts.length > 0 ? __docSupportConcepts : undefined,
            matchedEvidenceConcepts: Array.isArray(__docEvidenceHits) && __docEvidenceHits.length > 0 ? __docEvidenceHits : undefined,
            matchedNegativeConcepts: Array.isArray(__docNegativeHits) && __docNegativeHits.length > 0 ? __docNegativeHits : undefined,
            queryCoreSignalCount: Number(__queryCoreSignalCount || 0) || undefined,
            queryTokenSignalCount: Number(__queryTokenSignalCount || 0) || undefined,
            proceduralShellBias: __docProceduralShellBias || undefined,
            selectionReason: String(__docSelectionReason || result.selectionReason || '').trim() || undefined,
            retrievalStage: __docScore > 0 ? 'full_text' : (result.retrievalStage || 'summary'),
            summaryText: String(__docPreview || result.summaryText || result.ozet || result.snippet || '').trim() || undefined,
            ozet: String(__docPreview || result.ozet || result.snippet || '').trim(),
            snippet: String(__docPreview || result.snippet || result.ozet || '').trim(),
        }));

    return {
        results: reranked,
        diagnostics: {
            applied: true,
            rerankedCount: docFetchCandidates.length,
            metadataCandidateCount: metadataCandidates.length,
            docFetchCount: docFetchCandidates.length,
            embeddingApplied: Boolean(queryEmbedding),
            embeddingCandidateCount: queryEmbedding ? docFetchCandidates.length : 0,
            agentDiagnostics: signals?.agentDiagnostics || null,
            judgeDiagnostics,
        },
    };
};

const mapDecisionToResult = (decision = {}, source = 'all', index = 0) => {
    const daire = String(decision?.birimAdi || decision?.itemType?.description || '').trim();
    const esasNo = String(decision?.esasNo || '').trim();
    const kararNo = String(decision?.kararNo || '').trim();
    const documentId = String(decision?.documentId || '').trim();
    const directDocumentUrl = String(decision?.documentUrl || '').trim();
    const tarih = formatDisplayDate(decision);
    const sourceValue = mapItemSource(decision?.itemType?.name, source);
    const summary = extractDecisionSummary(decision) || String(decision?.ozet || decision?.snippet || '').trim();
    const title = [
        String(decision?.title || '').trim() || daire || decision?.itemType?.description || 'Karar',
        esasNo ? `${esasNo} E.` : '',
        kararNo ? `${kararNo} K.` : '',
    ].filter(Boolean).join(' ').trim();

    return {
        id: documentId || `simple-bedesten-${index + 1}`,
        documentId: documentId || undefined,
        documentUrl: directDocumentUrl || (documentId ? `https://mevzuat.adalet.gov.tr/ictihat/${documentId}` : undefined),
        sourceUrl: directDocumentUrl || (documentId ? `https://mevzuat.adalet.gov.tr/ictihat/${documentId}` : undefined),
        title: title || `Karar ${index + 1}`,
        daire,
        esasNo,
        kararNo,
        tarih,
        ozet: summary,
        snippet: summary,
        summaryText: summary || undefined,
        retrievalStage: summary ? 'summary' : undefined,
        source: sourceValue,
        sourceUsed: 'simple_bedesten',
    };
};

const formatDateBoundary = (value = '', boundary = 'start') => {
    const compact = String(value || '').trim();
    if (!compact) return undefined;
    if (compact.endsWith('Z') || compact.includes('T')) return compact;
    return boundary === 'start'
        ? `${compact}T00:00:00.000Z`
        : `${compact}T23:59:59.999Z`;
};

const buildSearchRequestBody = ({
    phrase,
    courtTypes,
    filters = {},
} = {}) => {
    const body = {
        data: {
            pageSize: Math.max(1, Number(filters?.pageSize || SIMPLE_DEFAULT_PAGE_SIZE)),
            pageNumber: Math.max(1, Number(filters?.page || filters?.pageNumber || 1)),
            itemTypeList: courtTypes,
            phrase,
            kararTarihiStart: formatDateBoundary(filters?.dateStart || filters?.kararTarihiStart, 'start'),
            kararTarihiEnd: formatDateBoundary(filters?.dateEnd || filters?.kararTarihiEnd, 'end'),
            sortFields: ['KARAR_TARIHI'],
            sortDirection: 'desc',
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };

    if (!body.data.kararTarihiStart) delete body.data.kararTarihiStart;
    if (!body.data.kararTarihiEnd) delete body.data.kararTarihiEnd;
    if (filters?.birimAdi) {
        const mappedBirimAdi = expandBirimAdiCode(filters.birimAdi);
        if (mappedBirimAdi) body.data.birimAdi = mappedBirimAdi;
    }

    return body;
};

const runSearchAttempt = async ({
    phrase = '',
    courtTypes = [],
    filters = {},
    birimAdi = '',
    abortSignal = null,
    routingProfile = null,
} = {}) => {
    if (!phrase) return [];
    throwIfAbortRequested(abortSignal);

    if (courtTypes.includes('ANAYASA')) {
        return await searchAnayasaDecisions({
            routingProfile,
            abortSignal,
        });
    }

    const response = await postJsonWithTimeout(
        SEARCH_ENDPOINT,
        buildSearchRequestBody({
            phrase,
            courtTypes,
            filters: birimAdi ? { ...filters, birimAdi } : filters,
        }),
        abortSignal
    );

    return Array.isArray(response?.data?.emsalKararList)
        ? response.data.emsalKararList
        : [];
};

const mergeBedestenDecisionLists = (base = [], additions = []) => {
    const merged = [];
    const seen = new Set();

    for (const item of [...(Array.isArray(base) ? base : []), ...(Array.isArray(additions) ? additions : [])]) {
        const identity = String(
            item?.documentId
            || `${item?.birimAdi || ''}|${item?.esasNo || ''}|${item?.kararNo || ''}|${item?.kararTarihiStr || item?.kararTarihi || ''}`
        ).trim();

        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        merged.push(item);
    }

    return merged;
};

const decodeHtmlEntities = (html = '') =>
    String(html || '')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, '\'')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');

const stripHtml = (value = '') =>
    decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const convertHtmlToSimpleMarkdown = (html = '') => {
    if (!html) return '';

    const withHeadings = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\s*li[^>]*>/gi, '\n- ')
        .replace(/<\s*\/li\s*>/gi, '')
        .replace(/<\s*(p|div|section|article|tr|table|ul|ol|blockquote)[^>]*>/gi, '\n')
        .replace(/<\s*\/(p|div|section|article|tr|table|ul|ol|blockquote)\s*>/gi, '\n')
        .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
            const clean = stripHtml(content);
            return clean ? `\n\n${'#'.repeat(Number(level))} ${clean}\n\n` : '\n';
        })
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, content) => {
            const clean = stripHtml(content);
            return clean ? `**${clean}**` : '';
        })
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, content) => {
            const clean = stripHtml(content);
            return clean ? `*${clean}*` : '';
        })
        .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, content) => {
            const clean = stripHtml(content);
            return clean ? `[${clean}](${href})` : href;
        });

    return decodeHtmlEntities(withHeadings)
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n\s*-\s+/g, '\n- ')
        .trim();
};

export const supportsSimpleBedestenSearch = ({ source = 'all', filters = {} } = {}) =>
    resolveCourtTypes({ source, filters }).supported;

export const searchLegalDecisionsViaSimpleBedesten = async ({
    source = 'all',
    keyword = '',
    rawQuery = '',
    filters = {},
    searchMode = 'auto',
    legalSearchPacket = null,
    abortSignal = null,
    provider = 'http',
} = {}) => {
    throwIfAbortRequested(abortSignal);
    void provider;
    const resolvedContract = resolveLegalSearchContract({
        rawText: rawQuery || keyword,
        preferredSource: source,
        explicitPacket: legalSearchPacket,
    });
    const seedResolvedContract = !legalSearchPacket && String(keyword || '').trim()
        ? resolveLegalSearchContract({
            rawText: keyword,
            preferredSource: source,
            explicitPacket: null,
        })
        : null;
    let normalizedPacket = normalizeLegalSearchPacket(
        (!legalSearchPacket && seedResolvedContract?.legalSearchPacket)
            ? seedResolvedContract.legalSearchPacket
            : resolvedContract.legalSearchPacket
    );
    const routingProfile = normalizeRoutingProfile(
        (!legalSearchPacket && seedResolvedContract?.routingProfile)
            ? seedResolvedContract.routingProfile
            : resolvedContract.routingProfile
    );
    const packetDrivenRouting = resolvePacketDrivenRouting({
        source,
        filters,
        packet: normalizedPacket,
    });
    const baseRouting = resolveCourtTypes({
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });
    const sanitizedKeyword = sanitizeLegalInput(keyword);
    const sanitizedRawQuery = sanitizeLegalInput(rawQuery || keyword);
    const initialQuerySeedText = buildPacketDrivenQuerySeedText(
        normalizedPacket,
        sanitizedKeyword.text || sanitizedRawQuery.text
    );
    const initialDomainText = buildPacketDrivenRawText({
        packet: normalizedPacket,
        keywordText: sanitizedKeyword.text,
        rawQueryText: sanitizedRawQuery.text,
    });
    const initialInferredPrimaryDomain = inferPrimaryDomain({
        effectiveText: initialQuerySeedText || initialDomainText,
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });
    const querySeedText = initialQuerySeedText;
    const domainText = initialDomainText;
    const inferredPrimaryDomain = initialInferredPrimaryDomain;
    const seedDrivenSkillPackage = buildSkillBackedSearchPackage({
        rawText: querySeedText || domainText,
        preferredSource: packetDrivenRouting.source,
    });
    const resolvedSkillPackage = resolvedContract.skillPackage;
    const expectedPrimaryDomain = normalizeDomainId(
        normalizedPacket?.primaryDomain || routingProfile?.primaryDomain || inferredPrimaryDomain,
        DEFAULT_DOMAIN_PROFILE_ID
    );
    const runtimeSkillPackage =
        resolvedSkillPackage
        && normalizeDomainId(resolvedSkillPackage?.primaryDomain || '', DEFAULT_DOMAIN_PROFILE_ID) === expectedPrimaryDomain
            ? resolvedSkillPackage
            : (seedDrivenSkillPackage || resolvedSkillPackage);
    const runtimeSkillPlan = Array.isArray(runtimeSkillPackage?.strategies)
        ? runtimeSkillPackage.strategies[0]?.plan || null
        : null;
    const baseSkillPlan = buildPacketBackedSkillPlan(
        normalizedPacket,
        runtimeSkillPlan
    );
    const primaryDomain = normalizeDomainId(
        normalizedPacket?.primaryDomain
        || routingProfile?.primaryDomain
        || inferredPrimaryDomain
        || runtimeSkillPackage?.primaryDomain,
        DEFAULT_DOMAIN_PROFILE_ID
    );
    const useAgentPipeline = String(process.env.LEGAL_AGENT_PIPELINE || '1').trim() !== '0';
    let agentBundle = null;
    if (useAgentPipeline && (sanitizedRawQuery.text || sanitizedKeyword.text)) {
        try {
            agentBundle = await buildAgentSignalBundle({
                rawText: [
                    querySeedText,
                    initialQuerySeedText,
                    sanitizedRawQuery.text,
                    sanitizedKeyword.text,
                ].filter(Boolean).join(' ').trim(),
            });
        } catch {
            agentBundle = null;
        }
    }
    const agenticSignalsEnabled = String(process.env.LEGAL_AGENTIC_SIGNALS_ENABLED || '').trim() === 'true';
    const agentSignalPlan = agenticSignalsEnabled
        ? await generateAgenticDomainSignals({
            rawText: sanitizedRawQuery.text || sanitizedKeyword.text,
            querySeedText: querySeedText || initialQuerySeedText || sanitizedRawQuery.text || sanitizedKeyword.text,
            primaryDomain,
            packet: normalizedPacket,
            skillPlan: baseSkillPlan,
        })
        : null;
    const skillPlan = buildAgenticAugmentedSkillPlan(baseSkillPlan, agentSignalPlan);
    const geminiExpandedVariants = await expandQueryWithGemini({
        rawQuery: querySeedText || domainText || sanitizedRawQuery.text || sanitizedKeyword.text,
        caseType: normalizedPacket?.caseType || routingProfile?.subdomain || '',
        primaryDomain,
        existingVariants: dedupeList([
            ...(normalizedPacket?.searchVariants || []).map((item) => item?.query),
            normalizedPacket?.searchSeedText,
            normalizedPacket?.caseType,
            ...(normalizedPacket?.requiredConcepts || []),
            ...(normalizedPacket?.supportConcepts || []),
            ...(agentSignalPlan?.mustConcepts || agentSignalPlan?.retrievalConcepts || []),
            ...(agentSignalPlan?.candidateQueries || []),
            ...(agentSignalPlan?.searchClauses || []),
        ]),
        agenticSignals: agentSignalPlan,
    });
    if (geminiExpandedVariants.length > 0) {
        normalizedPacket = {
            ...(normalizedPacket || {}),
            searchVariants: mergePacketSearchVariants({
                baseVariants: normalizedPacket?.searchVariants || [],
                additions: geminiExpandedVariants.map((query) => ({
                    query,
                    mode: 'gemini_dynamic',
                })),
            }),
        };
    }
    const routing = resolveRoutedCourtTypes({
        baseRouting,
        primaryDomain,
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });

    const primaryQuery = compactSimpleLegalQuery(querySeedText);
    const packetRequiredVariant = buildStructuredQueryVariant(normalizedPacket?.requiredConcepts || []);
    const packetSupportVariant = buildStructuredQueryVariant(dedupeList([
        ...(normalizedPacket?.requiredConcepts || []).slice(0, 2),
        ...(normalizedPacket?.supportConcepts || []).slice(0, 2),
    ]));
    const exactPhraseVariant = buildQuotedRequiredPhraseVariant(querySeedText);
    const focusedVariants = buildDomainFocusedVariants({
        primaryDomain,
        querySeedText,
        rawText: domainText,
        skillPlan,
    });
    const cezaFocusedVariants = primaryDomain === 'ceza'
        ? buildCezaFocusedVariants({
            querySeedText,
            rawText: rawQuery || domainText,
        })
        : [];
    const cezaVariantContext = {
        querySeedText,
        rawText: rawQuery || domainText,
    };
    const agentQueryVariants = dedupeList([
        ...(agentSignalPlan?.candidateQueries || []),
        ...(agentSignalPlan?.searchClauses || []),
    ])
        .map((query) => String(query || '').trim())
        .filter((query) => query.length > 2 && query.length <= 160 && !query.includes('\n'))
        .slice(0, 5);
    const queryVariants = (primaryDomain === 'ceza'
        ? filterConflictingCezaVariants({
            variants: [
                packetRequiredVariant,
                packetSupportVariant,
                exactPhraseVariant,
                ...agentQueryVariants,
                ...cezaFocusedVariants,
                ...focusedVariants,
                ...geminiExpandedVariants,
                primaryQuery,
            ],
            ...cezaVariantContext,
        })
        : dedupeList([
            packetRequiredVariant,
            packetSupportVariant,
            exactPhraseVariant,
            ...agentQueryVariants,
            ...cezaFocusedVariants,
            ...focusedVariants,
            ...geminiExpandedVariants,
            primaryQuery,
        ].filter(Boolean))).slice(0, SIMPLE_EXPANDED_PACKET_VARIANT_LIMIT);
    const phaseOneQueries = (primaryDomain === 'ceza'
        ? filterConflictingCezaVariants({
            variants: [
                packetRequiredVariant,
                exactPhraseVariant,
                ...agentQueryVariants.slice(0, 2),
                ...cezaFocusedVariants.slice(0, 2),
                ...focusedVariants.slice(0, 2),
                ...geminiExpandedVariants.slice(0, 2),
            ],
            ...cezaVariantContext,
        })
        : dedupeList([
            packetRequiredVariant,
            exactPhraseVariant,
            ...agentQueryVariants.slice(0, 2),
            ...cezaFocusedVariants.slice(0, 2),
            ...focusedVariants.slice(0, 2),
            ...geminiExpandedVariants.slice(0, 2),
        ].filter(Boolean))).slice(0, 4);
    const phaseTwoQueries = (primaryDomain === 'ceza'
        ? filterConflictingCezaVariants({
            variants: [
                packetSupportVariant,
                ...agentQueryVariants.slice(2),
                ...cezaFocusedVariants.slice(2),
                ...focusedVariants.slice(2),
                ...geminiExpandedVariants.slice(2, 5),
                primaryQuery,
            ],
            ...cezaVariantContext,
        })
        : dedupeList([
            packetSupportVariant,
            ...agentQueryVariants.slice(2),
            ...cezaFocusedVariants.slice(2),
            ...focusedVariants.slice(2),
            ...geminiExpandedVariants.slice(2, 5),
            primaryQuery,
        ].filter(Boolean))).slice(0, 5);
    const extraVariantEnabled =
        String(searchMode || '').trim().toLowerCase() === 'pro';
    const primaryTargetBirimCodes = resolveTargetBirimCodes({
        primaryDomain,
        courtTypes: routing.courtTypes,
        filters: packetDrivenRouting.filters,
        effectiveText: domainText,
        preferredBirimCodes: routingProfile?.primaryBirimCodes?.length
            ? routingProfile.primaryBirimCodes
            : (normalizedPacket?.preferredBirimCodes || []),
    });
    const secondaryTargetBirimCodes = resolveTargetBirimCodes({
        primaryDomain,
        courtTypes: routing.courtTypes,
        filters: packetDrivenRouting.filters,
        effectiveText: domainText,
        preferredBirimCodes: routingProfile?.secondaryBirimCodes || [],
    });
    const routingMode = String(
        routingProfile?.routingMode
        || (secondaryTargetBirimCodes.length > 0
            ? 'primary_secondary'
            : (primaryTargetBirimCodes.length > 0 ? 'hard_primary' : 'source_first'))
    ).trim().toLowerCase() || 'source_first';
    const isSourceFirstRouting = routingMode === 'source_first';
    const allowSecondaryRouting = routingMode === 'primary_secondary' && secondaryTargetBirimCodes.length > 0;
    const targetBirimCodes = dedupeBirimCodes([
        ...primaryTargetBirimCodes,
        ...secondaryTargetBirimCodes,
    ], SIMPLE_MAX_TARGET_BIRIM_CODES);
    const rankingTargetBirimCodes = primaryTargetBirimCodes.length > 0
        ? primaryTargetBirimCodes
        : targetBirimCodes;
    const attemptFilters = extraVariantEnabled
        ? {
            ...packetDrivenRouting.filters,
            pageSize: Math.max(
                Number(packetDrivenRouting.filters?.pageSize || 0) || 0,
                SIMPLE_PRO_PAGE_SIZE
            ),
        }
        : packetDrivenRouting.filters;

    if (!routing.supported) {
        return {
            supported: false,
            results: [],
            source: normalizeSource(source),
            retrievalDiagnostics: {
                backendMode: 'simple_bedesten',
                queryVariants,
                fallbackUsed: false,
                fallbackReason: routing.reason || 'unsupported_route',
                upstream: 'bedesten',
                zeroResultReason: null,
                targetSources: routing.courtTypes,
                primaryDomain,
                agentDomain: agentSignalPlan?.primaryDomain || primaryDomain,
                embeddingQuery: String(skillPlan?.embeddingQuery || agentSignalPlan?.embeddingQuery || '').trim() || null,
                packetApplied: Boolean(normalizedPacket),
                packetPrimaryDomain: normalizedPacket?.primaryDomain || null,
                packetCaseType: normalizedPacket?.caseType || null,
                packetRequiredConceptCount: Array.isArray(normalizedPacket?.requiredConcepts) ? normalizedPacket.requiredConcepts.length : 0,
                agenticSignalMode: agentSignalPlan?.diagnostics?.mode || null,
                agenticSignalsApplied: Boolean(agentSignalPlan),
                birimAdiCandidates: targetBirimCodes,
                finalMatchedCount: 0,
            },
        };
    }

    let decisionList = [];
    let selectedQueryVariant = null;
    let selectedBirimAdi = '';
    const phaseDefinitions = [
        { phase: 'primary_narrow', queries: phaseOneQueries, birimCodes: isSourceFirstRouting ? [] : primaryTargetBirimCodes },
        { phase: 'primary_broadened', queries: phaseTwoQueries, birimCodes: isSourceFirstRouting ? [] : primaryTargetBirimCodes },
        ...(allowSecondaryRouting
            ? [{ phase: 'secondary_broadened', queries: phaseTwoQueries, birimCodes: secondaryTargetBirimCodes }]
            : []),
    ].filter((entry) =>
        entry.queries.length > 0 && (isSourceFirstRouting || entry.birimCodes.length > 0 || routing.courtTypes.includes('ANAYASA'))
    );
    const phaseAttemptSummary = {};
    for (const phaseDefinition of phaseDefinitions) {
        phaseAttemptSummary[phaseDefinition.phase] = {
            queryCount: phaseDefinition.queries.length,
            birimCount: phaseDefinition.birimCodes.length,
        };
        for (const queryVariant of phaseDefinition.queries) {
            throwIfAbortRequested(abortSignal);
            const phaseBirimCodes = phaseDefinition.birimCodes.length > 0 ? phaseDefinition.birimCodes : [''];
            for (const birimAdi of phaseBirimCodes) {
                decisionList = await runSearchAttempt({
                    phrase: queryVariant,
                    courtTypes: routing.courtTypes,
                    filters: attemptFilters,
                    birimAdi,
                    abortSignal,
                    routingProfile,
                });
                if (decisionList.length > 0) {
                    selectedQueryVariant = queryVariant;
                    selectedBirimAdi = birimAdi;
                    break;
                }
            }

            if (decisionList.length > 0) break;
        }

        if (decisionList.length > 0) break;
    }

    if (decisionList.length === 0 && extraVariantEnabled) {
        const requiredVariant = buildRequiredTermVariant(primaryQuery);
        if (requiredVariant && !queryVariants.includes(requiredVariant)) {
            if (queryVariants.length < 6) queryVariants.push(requiredVariant);
            const fallbackBirimCodes = primaryTargetBirimCodes.length > 0 ? primaryTargetBirimCodes : [''];
            for (const birimAdi of fallbackBirimCodes) {
                throwIfAbortRequested(abortSignal);
                decisionList = await runSearchAttempt({
                    phrase: requiredVariant,
                    courtTypes: routing.courtTypes,
                    filters: attemptFilters,
                    birimAdi,
                    abortSignal,
                    routingProfile,
                });
                if (decisionList.length > 0) {
                    selectedQueryVariant = requiredVariant;
                    selectedBirimAdi = birimAdi;
                    break;
                }
            }
        }
    }

    if (extraVariantEnabled && decisionList.length <= 1) {
        const supplementaryQueries = queryVariants
            .filter((queryVariant) => queryVariant && queryVariant !== selectedQueryVariant)
            .slice(0, 4);
        const supplementaryBirimCodes = [
            ...(targetBirimCodes.length > 0 ? targetBirimCodes : []),
            '',
        ].filter((value, index, list) => list.indexOf(value) === index);

        for (const queryVariant of supplementaryQueries) {
            throwIfAbortRequested(abortSignal);
            for (const birimAdi of supplementaryBirimCodes) {
                const supplementaryResults = await runSearchAttempt({
                    phrase: queryVariant,
                    courtTypes: routing.courtTypes,
                    filters: attemptFilters,
                    birimAdi,
                    abortSignal,
                    routingProfile,
                });

                if (supplementaryResults.length > 0) {
                    decisionList = mergeBedestenDecisionLists(decisionList, supplementaryResults);
                }

                if (decisionList.length >= 6) break;
            }

            if (decisionList.length >= 6) break;
        }
    }

    const mappedResults = rerankResultsForDomain({
        results: dedupeResultsByIdentity(
        decisionList.map((decision, index) => mapDecisionToResult(
            decision,
            routing.source === 'all' ? 'all' : routing.source,
            index
        ))
        ),
        primaryDomain,
        targetBirimCodes: rankingTargetBirimCodes,
        routedCourtTypes: routing.courtTypes,
    });
    const compatibilityFilteredResults = mappedResults.filter((result) =>
        isResultCompatibleWithPrimaryDomain({
            result,
            primaryDomain,
            targetBirimCodes,
            routedCourtTypes: routing.courtTypes,
            negativeConcepts: normalizedPacket?.negativeConcepts || [],
        })
    );
    const documentRerank = await rerankResultsByDocumentContent({
        results: compatibilityFilteredResults,
        primaryDomain,
        querySeedText,
        rawText: domainText,
        queryMode: normalizedPacket?.queryMode,
        source: routing.source === 'all' ? 'yargitay' : routing.source,
        enabled: extraVariantEnabled,
        skillPlan,
        agentBundle,
        abortSignal,
        provider: 'http',
    });
    const scoredResults = documentRerank.results.map((result, index) => {
        const birimAlignment = assessTargetBirimAlignment({ result, targetBirimCodes: rankingTargetBirimCodes });
        return {
            ...result,
            __rankingIndex: index,
            __birimMatched: birimAlignment.matched,
            __birimMatchRank: birimAlignment.matchRank,
            __sameFamilyMismatch: birimAlignment.sameFamilyMismatch,
            relevanceScore: computeSimpleResultRelevanceScore({
                result,
                primaryDomain,
                targetSources: routing.courtTypes,
                targetBirimCodes: rankingTargetBirimCodes,
            }),
        };
    });
    const strictPrecisionResults = scoredResults
        .slice()
        .sort((left, right) => {
            const leftBirimMatched = left?.__birimMatched ? 1 : 0;
            const rightBirimMatched = right?.__birimMatched ? 1 : 0;
            if (rightBirimMatched !== leftBirimMatched) return rightBirimMatched - leftBirimMatched;

            if (leftBirimMatched && rightBirimMatched) {
                const leftMatchRank = Number(left?.__birimMatchRank ?? Number.POSITIVE_INFINITY);
                const rightMatchRank = Number(right?.__birimMatchRank ?? Number.POSITIVE_INFINITY);
                if (leftMatchRank !== rightMatchRank) return leftMatchRank - rightMatchRank;
            }

            const leftFamilyMismatch = left?.__sameFamilyMismatch ? 1 : 0;
            const rightFamilyMismatch = right?.__sameFamilyMismatch ? 1 : 0;
            if (leftFamilyMismatch !== rightFamilyMismatch) return leftFamilyMismatch - rightFamilyMismatch;

            const leftRelevance = Number(left?.relevanceScore || 0);
            const rightRelevance = Number(right?.relevanceScore || 0);
            if (rightRelevance !== leftRelevance) return rightRelevance - leftRelevance;

            const leftMerged = Number(left?.contentMergedScore || 0);
            const rightMerged = Number(right?.contentMergedScore || 0);
            if (rightMerged !== leftMerged) return rightMerged - leftMerged;

            const leftContent = Number(left?.contentScore || 0);
            const rightContent = Number(right?.contentScore || 0);
            if (rightContent !== leftContent) return rightContent - leftContent;

            return Number(left?.__rankingIndex || 0) - Number(right?.__rankingIndex || 0);
        })
        .map(({
            __rankingIndex,
            __birimMatched,
            __birimMatchRank,
            __sameFamilyMismatch,
            ...result
        }) => result);
    const qualityAssessment = assessSimpleQuality({
        results: strictPrecisionResults,
        primaryDomain,
        targetSources: routing.courtTypes,
    });
    const sourceCoverageStatus = !routing.supported
        ? 'unsupported'
        : (strictPrecisionResults.length > 0
            ? 'ok'
            : 'no_candidates');

    return {
        supported: true,
        results: strictPrecisionResults,
        source: routing.source,
        retrievalDiagnostics: {
            backendMode: 'simple_bedesten',
            queryVariants,
            fallbackUsed: false,
            fallbackReason: null,
            upstream: 'bedesten',
            provider: 'http',
            targetSources: routing.courtTypes,
            primaryDomain,
            agentDomain: agentSignalPlan?.primaryDomain || primaryDomain,
            embeddingQuery: String(skillPlan?.embeddingQuery || agentSignalPlan?.embeddingQuery || '').trim() || null,
            packetApplied: Boolean(normalizedPacket),
            packetPrimaryDomain: normalizedPacket?.primaryDomain || null,
            packetCaseType: normalizedPacket?.caseType || null,
            packetRequiredConceptCount: Array.isArray(normalizedPacket?.requiredConcepts) ? normalizedPacket.requiredConcepts.length : 0,
            agenticSignalMode: agentSignalPlan?.diagnostics?.mode || null,
            agenticSignalsApplied: Boolean(agentSignalPlan),
            agenticSignalWarnings: agentSignalPlan?.diagnostics?.warnings || [],
            routingMode,
            birimAdiCandidates: targetBirimCodes,
            totalCandidates: compatibilityFilteredResults.length,
            finalMatchedCount: strictPrecisionResults.length,
            zeroResultReason: strictPrecisionResults.length === 0 ? 'no_candidates' : null,
            compatibilityFilterApplied: compatibilityFilteredResults.length !== mappedResults.length,
            compatibilityFilteredOutCount: Math.max(0, mappedResults.length - compatibilityFilteredResults.length),
            contentRerankApplied: documentRerank.diagnostics.applied,
            contentRerankCount: documentRerank.diagnostics.rerankedCount,
            simpleQualityScore: qualityAssessment.score,
            qualityWarnings: qualityAssessment.reasons,
            topFactPatternScore: qualityAssessment.topFactPatternScore,
            topFactPatternHitCount: qualityAssessment.topFactPatternHitCount,
            topFactPatternHits: qualityAssessment.topFactPatternHits,
            topProceduralHitCount: qualityAssessment.topProceduralHitCount,
            proceduralShellBias: qualityAssessment.proceduralShellBias,
            strictPrecisionGateApplied: false,
            strictPrecisionThreshold: null,
            searchPhrase: selectedQueryVariant || null,
            searchPhraseSource: null,
            searchVariantMode: null,
            selectedQueryVariant: selectedQueryVariant || null,
            searchVariantAttempts: [],
            selectedBirimAdi: selectedBirimAdi || null,
            firstSuccessfulBirimAdi: selectedBirimAdi || null,
            acceptedTopResultDaireler: dedupeList(strictPrecisionResults.map((item) => item?.daire).filter(Boolean)).slice(0, 4),
            rejectionReasons: strictPrecisionResults.length > 0 ? [] : [sourceCoverageStatus],
            sourceCoverageStatus,
            phaseAttemptSummary,
            rateLimitedAttemptCount: 0,
        },
    };
};

const extractDocumentId = ({ documentId = '', documentUrl = '' } = {}) => {
    const directId = String(documentId || '').trim();
    if (directId) return directId;

    const url = String(documentUrl || '').trim();
    const match = url.match(/\/ictihat\/(\d+)/i) || url.match(/\b(\d{6,})\b/);
    return match?.[1] || '';
};

export const supportsSimpleBedestenDocument = ({
    source = 'all',
    documentId = '',
    documentUrl = '',
} = {}) => {
    const normalizedSource = normalizeSource(source);
    if (normalizedSource === 'anayasa') return Boolean(String(documentUrl || '').trim());
    return Boolean(extractDocumentId({ documentId, documentUrl }));
};

export const getLegalDocumentViaSimpleBedesten = async ({
    source = 'all',
    documentId = '',
    documentUrl = '',
    abortSignal = null,
    provider = 'http',
    skipCliThrottle = false,
} = {}) => {
    throwIfAbortRequested(abortSignal);
    void provider;
    void skipCliThrottle;
    if (normalizeSource(source) === 'anayasa') {
        const directUrl = String(documentUrl || '').trim();
        if (!directUrl) {
            const error = new Error('anayasa_document_missing_url');
            error.code = 'simple_anayasa_document_missing_url';
            throw error;
        }

        const html = await fetchTextWithTimeout(directUrl, abortSignal);
        return {
            documentId: '',
            document: convertHtmlToSimpleMarkdown(html),
            sourceUrl: directUrl,
            mimeType: 'text/html',
            diagnostics: {
                backendMode: 'simple_bedesten',
                fallbackUsed: false,
                fallbackReason: null,
                upstream: 'anayasa',
                source: 'anayasa',
                provider: 'http',
            },
        };
    }
    const resolvedDocumentId = extractDocumentId({ documentId, documentUrl });
    if (!resolvedDocumentId) {
        const error = new Error('documentId veya gecerli Bedesten URL gereklidir.');
        error.code = 'simple_bedesten_document_missing_id';
        throw error;
    }

    const response = await postJsonWithTimeout(DOCUMENT_ENDPOINT, {
        data: { documentId: resolvedDocumentId },
        applicationName: 'UyapMevzuat',
    }, abortSignal);

    const mimeType = String(response?.data?.mimeType || '').trim() || 'application/octet-stream';
    const encodedContent = String(response?.data?.content || '').trim();

    if (!encodedContent) {
        throw new Error('Bedesten dokuman icerigi bos dondu.');
    }

    const contentBytes = Buffer.from(encodedContent, 'base64');
    let document = '';

    if (mimeType === 'text/html') {
        document = convertHtmlToSimpleMarkdown(contentBytes.toString('utf-8'));
    } else if (mimeType.startsWith('text/')) {
        document = contentBytes.toString('utf-8').trim();
    } else {
        document = `Desteklenmeyen belge turu: ${mimeType}. Kaynak URL: https://mevzuat.adalet.gov.tr/ictihat/${resolvedDocumentId}`;
    }

    return {
        documentId: resolvedDocumentId,
        document,
        sourceUrl: `https://mevzuat.adalet.gov.tr/ictihat/${resolvedDocumentId}`,
        mimeType,
        diagnostics: {
            backendMode: 'simple_bedesten',
            fallbackUsed: false,
            fallbackReason: null,
            upstream: 'bedesten',
            source: normalizeSource(source),
            provider: 'http',
        },
    };
};

export const __testables = {
    resolveCourtTypes,
    resolveRoutedCourtTypes,
    inferPrimaryDomain,
    resolveTargetBirimCodes,
    expandBirimAdiCode,
    buildCezaFocusedVariants,
    buildDomainFocusedVariants,
    buildDocumentRerankSignals,
    scoreDocumentAgainstSignals,
    rerankResultsByDocumentContent,
    assessSimpleQuality,
    compactSimpleLegalQuery,
    buildQuotedRequiredPhraseVariant,
    buildRequiredTermVariant,
    rerankResultsForDomain,
    convertHtmlToSimpleMarkdown,
    computeSimpleResultRelevanceScore,
    passesStrictQueryPrecisionGate,
    extractAnayasaLinks,
    extractDocumentId,
    resolveSimpleBedestenProvider,
    DOMAIN_SUBSTANTIVE_SIGNAL_MAP,
};
