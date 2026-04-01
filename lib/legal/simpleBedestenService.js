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
import { getGeminiClient, GEMINI_FLASH_PREVIEW_MODEL_NAME } from '../../backend/gemini/_shared.js';
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
const KARAKAZI_HYBRID_ENABLED = String(process.env.LEGAL_KARAKAZI_HYBRID || '1').trim() !== '0';
const KARAKAZI_HYBRID_RESULT_LIMIT = Math.max(
    3,
    Math.min(10, Number(process.env.LEGAL_KARAKAZI_HYBRID_RESULT_LIMIT || 6))
);
const KARAKAZI_HYBRID_MODEL =
    process.env.GEMINI_KEYWORD_MODEL
    || process.env.VITE_GEMINI_KEYWORD_MODEL
    || GEMINI_FLASH_PREVIEW_MODEL_NAME;
const DEFAULT_YARGI_MCP_CLOUD_RUN_BASE_URL = String(
    process.env.YARGI_MCP_CLOUD_RUN_URL
    || 'https://yargi-mcp-31672947775.europe-west4.run.app'
).trim().replace(/\/+$/g, '');
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

const buildSemanticEmbeddingQuery = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
    packet = null,
    skillPlan = null,
} = {}) => {
    const domainLeadMap = {
        ceza: 'ceza uyusmazligi ve suca iliskin emsal karar aramasi',
        aile: 'aile hukuku uyusmazligina iliskin emsal karar aramasi',
        icra: 'icra ve iflas uyusmazligina iliskin emsal karar aramasi',
        is_hukuku: 'is hukuku uyusmazligina iliskin emsal karar aramasi',
        borclar: 'borclar hukuku uyusmazligina iliskin emsal karar aramasi',
        gayrimenkul: 'gayrimenkul uyusmazligina iliskin emsal karar aramasi',
        miras: 'miras uyusmazligina iliskin emsal karar aramasi',
        ticaret: 'ticari uyusmazliga iliskin emsal karar aramasi',
        tuketici: 'tuketici uyusmazligina iliskin emsal karar aramasi',
        idare: 'idari uyusmazliga iliskin emsal karar aramasi',
    };

    const conceptSummary = dedupeList([
        ...(packet?.requiredConcepts || []),
        ...(packet?.supportConcepts || []),
        ...(skillPlan?.requiredConcepts || skillPlan?.mustConcepts || []),
    ]).slice(0, 6).join(', ');

    const parts = [
        domainLeadMap[primaryDomain] || 'emsal karar aramasi',
        String(packet?.caseType || '').trim(),
        String(packet?.hukukiMesele || packet?.legalIssue || '').trim(),
        conceptSummary ? `odak kavramlar: ${conceptSummary}` : '',
        String(querySeedText || '').trim(),
        String(rawText || '').trim(),
    ].filter(Boolean);

    return sanitizeLegalInput(parts.join('. ')).text.slice(0, 900).trim();
};

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

const hasExplicitRoutingIntent = ({
    source = 'all',
    filters = {},
    rawQuery = '',
    keyword = '',
} = {}) => {
    const normalizedSource = normalizeSource(source);
    const normalizedSearchArea = normalizeSearchArea(filters?.searchArea || 'auto');
    return Boolean(
        normalizedSource !== 'all'
        || normalizedSearchArea !== 'auto'
        || String(filters?.birimAdi || '').trim()
        || (Array.isArray(filters?.birimAdiCandidates) && filters.birimAdiCandidates.length > 0)
        || extractBirimCodesFromCourtHint(rawQuery).length > 0
        || extractBirimCodesFromCourtHint(keyword).length > 0
    );
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

const buildKarakaziKeywordPrompt = () => [
    'Sen bir hukuk araştırma asistanısın.',
    'Aşağıdaki metinden karar aramada kullanılacak 5 kısa anahtar kelime çıkar.',
    'Çıktı sadece JSON olacak.',
    'Şema: { "keywords": ["kısa anahtar 1", "kısa anahtar 2"] }',
    'Kurallar:',
    '- Sadece kısa anahtar kelimeler (en fazla 4-5 kelime).',
    '- Olay anlatımını veya uzun cümleleri tekrar etme.',
    '- Hukuki çekirdeği ve delil tiplerini yakala.',
].join('\n');

const buildExactPhraseQuery = (value = '') => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized ? `"${normalized}"` : '';
};

const buildPlusJoinedQuery = (parts = []) =>
    (Array.isArray(parts) ? parts : [])
        .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((part) => `"${part}"`)
        .join('+');

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const buildKarakaziStyleQueryCandidates = ({ keywords = [] } = {}) => {
    const keywordSet = dedupeList(keywords, 6);
    const generalCore = keywordSet.slice(0, 4);
    return dedupeList([
        ...keywordSet.map((keyword) => buildExactPhraseQuery(keyword)),
        buildPlusJoinedQuery(generalCore),
        buildPlusJoinedQuery(keywordSet.slice(0, 3)),
        buildPlusJoinedQuery(keywordSet.slice(0, 2)),
        ...generalCore.slice(0, 3),
    ].filter(Boolean), 8);
};

const deriveRemoteKarakaziUrl = () => {
    const explicit = String(
        process.env.KARAKAZI_REMOTE_URL
        || process.env.YARGI_MCP_KARAKAZI_URL
        || ''
    ).trim();
    if (explicit) return explicit;

    const mcpUrl = String(process.env.YARGI_MCP_URL || '').trim();
    if (!mcpUrl || /127\.0\.0\.1|localhost/i.test(mcpUrl)) return '';
    if (/yargimcp\.fastmcp\.app/i.test(mcpUrl)) {
        return `${DEFAULT_YARGI_MCP_CLOUD_RUN_BASE_URL}/api/karakazi-search`;
    }
    return mcpUrl
        .replace(/\/mcp\/?$/i, '/api/karakazi-search')
        .replace(/([^:])\/{2,}/g, '$1/');
};

const normalizeKarakaziResultToSimpleResult = (result = {}, index = 0) => {
    const daire = String(result?.daire || result?.birimAdi || result?.mahkeme || '').trim();
    const esasNo = String(result?.esasNo || '').trim();
    const kararNo = String(result?.kararNo || '').trim();
    const documentId = String(result?.documentId || '').trim();
    const sourceUrl = String(result?.sourceUrl || result?.documentUrl || '').trim();
    const tarih = String(result?.kararTarihi || result?.tarih || '').trim();
    const summary = String(result?.summaryText || result?.snippet || result?.ozet || '').trim();
    const title = String(result?.title || [daire, esasNo ? `${esasNo} E.` : '', kararNo ? `${kararNo} K.` : ''].filter(Boolean).join(' ')).trim();
    return {
        id: documentId || `karakazi-hybrid-${index + 1}`,
        documentId: documentId || undefined,
        documentUrl: sourceUrl || undefined,
        sourceUrl: sourceUrl || undefined,
        title: title || `Karar ${index + 1}`,
        daire,
        esasNo,
        kararNo,
        tarih,
        ozet: summary,
        snippet: summary,
        summaryText: summary || undefined,
        retrievalStage: summary ? 'summary' : undefined,
        source: /dani[sş]tay/i.test(daire) ? 'danistay' : 'yargitay',
        sourceUsed: 'karakazi_hybrid',
    };
};

const fetchKarakaziHybridCandidates = async ({
    rawText = '',
    abortSignal = null,
} = {}) => {
    if (!KARAKAZI_HYBRID_ENABLED) {
        return { results: [], diagnostics: { applied: false, reason: 'hybrid_disabled' } };
    }

    const remoteUrl = deriveRemoteKarakaziUrl();
    if (!remoteUrl) {
        return { results: [], diagnostics: { applied: false, reason: 'missing_remote_url' } };
    }

    let keywords = [];
    let geminiFailureReason = '';
    try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
            model: KARAKAZI_HYBRID_MODEL,
            contents: [{ role: 'user', parts: [{ text: String(rawText || '').slice(0, 12000) }] }],
            config: {
                systemInstruction: buildKarakaziKeywordPrompt(),
                temperature: 0.2,
            },
        });
        const raw = extractGeminiResponseText(response);
        const parsed = safeJsonParse(raw);
        keywords = dedupeList(parsed?.keywords || [], 5);
    } catch (error) {
        geminiFailureReason = String(error?.message || error || 'gemini_keyword_failed');
    }

    const fallbackKeywords = dedupePhraseChunks(extractOperatorPhraseChunks(rawText), 5);
    let queryCandidates = buildKarakaziStyleQueryCandidates({ keywords });
    if (queryCandidates.length === 0) {
        queryCandidates = dedupeList([
            ...buildRawPhraseFirstVariants({ rawText }),
            ...buildKarakaziStyleQueryCandidates({ keywords: fallbackKeywords }),
        ]).slice(0, 8);
        if (keywords.length === 0) keywords = fallbackKeywords;
    }
    const query = queryCandidates[0] || '';
    if (!query) {
        return {
            results: [],
            diagnostics: {
                applied: false,
                reason: geminiFailureReason || 'empty_karakazi_query',
                keywords,
            },
        };
    }

    let payload = {};
    let lastStatus = 0;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const remoteResponse = await fetch(remoteUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    query,
                    queries: queryCandidates,
                    limit: KARAKAZI_HYBRID_RESULT_LIMIT,
                    fetchDocuments: false,
                    debug: false,
                }),
                signal: abortSignal || undefined,
            });

            lastStatus = Number(remoteResponse.status || 0);
            if (!remoteResponse.ok) {
                if ([500, 502, 503, 504].includes(lastStatus) && attempt < 2) {
                    await sleep(400 * (attempt + 1));
                    continue;
                }
                throw new Error(`karakazi_hybrid_http_${remoteResponse.status}`);
            }

            payload = await remoteResponse.json().catch(() => ({}));
            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            if (attempt < 2) {
                await sleep(400 * (attempt + 1));
                continue;
            }
        }
    }

    if (lastError) {
        if (lastStatus) throw new Error(`karakazi_hybrid_http_${lastStatus}`);
        throw lastError;
    }

    const results = (Array.isArray(payload?.results) ? payload.results : [])
        .map((result, index) => normalizeKarakaziResultToSimpleResult(result, index));

    return {
        results,
        diagnostics: {
            applied: true,
            source: 'karakazi_hybrid',
            keywords,
            query,
            queryCandidates,
            geminiFallbackUsed: Boolean(geminiFailureReason),
            geminiFailureReason: geminiFailureReason || null,
            count: results.length,
        },
    };
};

const createTimeoutError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const resolveSimpleBedestenProvider = () => 'http';

const clampRelevanceScore = (value = 0) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const extractDecisionYear = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return null;
    const directMatch = text.match(/(?:19|20|21|22|30|40|50|60)\d{2}/g);
    if (Array.isArray(directMatch) && directMatch.length > 0) {
        const year = Number(directMatch[directMatch.length - 1]);
        return Number.isFinite(year) ? year : null;
    }
    const dottedMatch = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!dottedMatch) return null;
    const year = Number(dottedMatch[3]);
    return Number.isFinite(year) ? year : null;
};

const getRecencyBonus = (value = '') => {
    const year = extractDecisionYear(value);
    if (!Number.isFinite(year)) return 0;

    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - year);

    if (age <= 0) return 10;
    if (age === 1) return 9;
    if (age === 2) return 7;
    if (age === 3) return 5;
    if (age === 4) return 3;
    if (age === 5) return 2;
    if (age <= 8) return 1;
    return 0;
};

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
    const semanticHaystack = normalizeText([
        result?.source,
        result?.daire,
        result?.title,
        result?.summaryText,
        result?.ozet,
        result?.snippet,
        result?.selectionReason,
    ].filter(Boolean).join(' '));
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
    if (semanticHaystack.includes('hukuk genel kurulu') || semanticHaystack.includes('ceza genel kurulu')) {
        score -= ['gayrimenkul', 'miras', 'is_hukuku', 'borclar', 'tuketici', 'ticaret', 'aile', 'icra'].includes(primaryDomain)
            ? 40
            : 18;
    }

    score += getRecencyBonus(result?.tarih || result?.kararTarihi || result?.kararTarihiStr || result?.decisionDate || '');

    if (primaryDomain === 'ceza') {
        if (semanticHaystack.includes('uyusturucu madde ticareti') || semanticHaystack.includes('tck 188')) score += 22;
        if (semanticHaystack.includes('kullanici tanik') || semanticHaystack.includes('materyal mukayese') || semanticHaystack.includes('hassas terazi')) score += 14;
        if (semanticHaystack.includes('silahla ates etme') || semanticHaystack.includes('meskun mahal')) score += 14;
        if (semanticHaystack.includes('kullanmak icin bulundurma') || semanticHaystack.includes('tck 191')) score -= 18;
    }

    if (primaryDomain === 'aile') {
        if (semanticHaystack.includes('aile mahkemesi')) score += 18;
        if (semanticHaystack.includes('bosanma') || semanticHaystack.includes('velayet') || semanticHaystack.includes('nafaka')) score += 18;
        if (semanticHaystack.includes('6284') || semanticHaystack.includes('uzaklastirma') || semanticHaystack.includes('zorlama hapsi')) score += 18;
        if (semanticHaystack.includes('evlilik birliginin sarsilmasi') || semanticHaystack.includes('siddetli gecimsizlik') || semanticHaystack.includes('cocugun ustun yarari')) score += 14;
    }

    if (primaryDomain === 'is_hukuku') {
        if (semanticHaystack.includes('ise iade') || semanticHaystack.includes('gecersiz fesih')) score += 22;
        if (semanticHaystack.includes('savunma') || semanticHaystack.includes('son care') || semanticHaystack.includes('performans')) score += 14;
        if (semanticHaystack.includes('hizmet tespiti') || semanticHaystack.includes('sgk')) score += 18;
        if (semanticHaystack.includes('is mahkemesi') || semanticHaystack.includes('is sozlesmesi')) score += 12;
    }

    if (primaryDomain === 'borclar') {
        if (semanticHaystack.includes('kira') || semanticHaystack.includes('tbk 315') || semanticHaystack.includes('temerrut')) score += 14;
        if (semanticHaystack.includes('arsa payi karsiligi insaat') || semanticHaystack.includes('ayipli is')) score += 22;
        if (semanticHaystack.includes('yuklenici') || semanticHaystack.includes('eksik ifa') || semanticHaystack.includes('gec teslim')) score += 14;
    }

    if (primaryDomain === 'ticaret') {
        if (semanticHaystack.includes('genel kurul') || semanticHaystack.includes('anonim sirket') || semanticHaystack.includes('limited sirket')) score += 14;
        if (semanticHaystack.includes('marka') || semanticHaystack.includes('iltibas') || semanticHaystack.includes('haksiz rekabet')) score += 12;
    }

    if (primaryDomain === 'tuketici') {
        if (semanticHaystack.includes('tuketici') || semanticHaystack.includes('ayipli arac') || semanticHaystack.includes('ayipli mal')) score += 14;
    }

    if (primaryDomain === 'idare') {
        if (semanticHaystack.includes('imar') || semanticHaystack.includes('yikim') || semanticHaystack.includes('idari islem iptali')) score += 16;
        if (semanticHaystack.includes('danistay')) score += 10;
    }

    if (primaryDomain === 'vergi') {
        if (semanticHaystack.includes('vergi') || semanticHaystack.includes('vergi mahkemesi')) score += 14;
        if (semanticHaystack.includes('tarhiyat') || semanticHaystack.includes('tarhiyatin iptali') || semanticHaystack.includes('vergi ziyai')) score += 18;
        if (semanticHaystack.includes('sahte fatura') || semanticHaystack.includes('sahte belge') || semanticHaystack.includes('muhteviyati itibariyla yaniltici belge')) score += 18;
        if (semanticHaystack.includes('danistay') || semanticHaystack.includes('vergi dava daireleri kurulu')) score += 14;
    }

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
    const isKarakaziHybrid = result?.sourceUsed === 'karakazi_hybrid';
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

    if (isKarakaziHybrid) {
        const hybridPositiveSignalMap = {
            aile: ['bosanma', 'velayet', 'nafaka', '6284', 'evlilik', 'kusur', 'kisisel iliski', 'mal rejimi'],
            gayrimenkul: ['tapu', 'tescil', 'ortakligin giderilmesi', 'aynen taksim', 'ecrimisil', 'elatmanin onlenmesi', 'muris muvazaasi', 'haksiz isgal'],
            miras: ['miras', 'tenkis', 'sakli pay', 'vasiyetname', 'tereke', 'mirasin reddi', 'reddi miras', 'veraset', 'muris muvazaasi'],
            is_hukuku: ['ise iade', 'gecersiz fesih', 'is mahkemesi', 'is sozlesmesi', 'performans', 'savunma', 'fazla mesai', 'hizmet tespiti', 'is kazasi'],
            ticaret: ['genel kurul', 'anonim sirket', 'limited sirket', 'marka', 'haksiz rekabet', 'cek', 'menfi tespit'],
            tuketici: ['tuketici', 'ayipli', 'konut', 'gec teslim', 'mesafeli satis'],
            icra: ['itirazin iptali', 'menfi tespit', 'takip', 'icra', 'haciz'],
            borclar: ['kira', 'temerrut', 'arsa payi', 'eksik ifa', 'sebepsiz zenginlesme'],
            anayasa: ['anayasa mahkemesi', 'ifade ozgurlugu', 'makul sure', 'adil yargilanma'],
            idare: ['idari islem', 'imar', 'yikim', 'iptal'],
            vergi: ['vergi', 'tarh', 'ceza ihbarnamesi', 'uzlasma'],
        };
        const hybridNegativeSignalMap = {
            aile: ['ceza dairesi', 'ceza genel kurulu', 'danistay', 'vergi dava daireleri kurulu'],
            gayrimenkul: ['ceza dairesi', 'ceza genel kurulu', 'danistay', 'nafaka', 'velayet'],
            miras: ['ceza dairesi', 'ceza genel kurulu', 'danistay', 'nafaka', 'velayet'],
            is_hukuku: ['ceza dairesi', 'ceza genel kurulu', 'danistay'],
            ticaret: ['ceza dairesi', 'ceza genel kurulu', 'danistay'],
            tuketici: ['ceza dairesi', 'ceza genel kurulu', 'danistay'],
            icra: ['ceza dairesi', 'ceza genel kurulu', 'danistay'],
            borclar: ['ceza dairesi', 'ceza genel kurulu', 'danistay'],
            anayasa: ['hukuk dairesi', 'ceza dairesi', 'danistay'],
            idare: ['hukuk dairesi', 'ceza dairesi'],
            vergi: ['hukuk dairesi', 'ceza dairesi'],
        };
        const positiveSignals = hybridPositiveSignalMap[primaryDomain] || [];
        const negativeSignals = hybridNegativeSignalMap[primaryDomain] || [];
        const positiveHitCount = positiveSignals.filter((signal) => semanticHaystack.includes(signal)).length;
        const hasHardNegative = negativeSignals.some((signal) => haystack.includes(signal) || semanticHaystack.includes(signal));

        if (hasHardNegative && positiveHitCount === 0) return false;
        if (positiveHitCount >= 1) return true;
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

    if (primaryDomain === 'aile') {
        const positiveSignals = ['bosanma', 'velayet', 'nafaka', '6284', 'evlilik', 'kusur', 'kisisel iliski', 'mal rejimi'];
        if (haystack.includes('ceza dairesi') || haystack.includes('ceza genel kurulu') || haystack.includes('danistay')) return false;
        return hasTargetBirimMatch || positiveSignals.some((signal) => semanticHaystack.includes(signal));
    }

    if (primaryDomain === 'gayrimenkul') {
        const positiveSignals = ['tapu', 'tescil', 'ortakligin giderilmesi', 'aynen taksim', 'ecrimisil', 'elatmanin onlenmesi', 'muris muvazaasi'];
        if (
            haystack.includes('ceza dairesi')
            || haystack.includes('ceza genel kurulu')
            || haystack.includes('danistay')
            || semanticHaystack.includes('nafaka')
            || semanticHaystack.includes('velayet')
        ) return false;
        return hasTargetBirimMatch || positiveSignals.some((signal) => semanticHaystack.includes(signal));
    }

    if (primaryDomain === 'miras') {
        const positiveSignals = ['miras', 'tenkis', 'sakli pay', 'vasiyetname', 'tereke', 'muris muvazaasi', 'veraset'];
        if (
            haystack.includes('ceza dairesi')
            || haystack.includes('ceza genel kurulu')
            || haystack.includes('danistay')
            || semanticHaystack.includes('nafaka')
            || semanticHaystack.includes('velayet')
        ) return false;
        return hasTargetBirimMatch || positiveSignals.some((signal) => semanticHaystack.includes(signal));
    }

    if (primaryDomain === 'is_hukuku') {
        const positiveSignals = [
            'ise iade',
            'gecersiz fesih',
            'is mahkemesi',
            'is sozlesmesi',
            'fazla calisma',
            'fazla mesai',
            'hizmet tespiti',
            'sgk',
            'hakli fesih',
            'kidem tazminati',
            'ihbar tazminati',
            'mobbing',
            'manevi tazminat',
            'is kazasi',
            'meslek hastaligi',
            'maluliyet',
            'surekli is goremezlik',
        ];
        if (haystack.includes('ceza dairesi') || haystack.includes('danistay')) return false;
        if (hasTargetBirimMatch) return true;
        return positiveSignals.some((signal) => semanticHaystack.includes(signal));
    }

    return true;
};

const passesHardDomainExclusionOnly = ({
    result = {},
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    routedCourtTypes = [],
} = {}) => {
    const haystack = normalizeText([result?.daire, result?.title, result?.summaryText, result?.ozet, result?.snippet].filter(Boolean).join(' '));
    if (!haystack) return true;

    if (Array.isArray(routedCourtTypes) && routedCourtTypes.includes('DANISTAYKARAR')) {
        return !haystack.includes('hukuk dairesi') && !haystack.includes('ceza dairesi');
    }

    if (Array.isArray(routedCourtTypes) && routedCourtTypes.includes('YARGITAYKARARI') && haystack.includes('danistay')) {
        return false;
    }

    if (primaryDomain === 'ceza') {
        return !haystack.includes('hukuk dairesi') && !haystack.includes('hukuk genel kurulu') && !haystack.includes('danistay');
    }

    if (['is_hukuku', 'aile', 'ticaret', 'icra', 'borclar', 'gayrimenkul', 'miras', 'tuketici'].includes(primaryDomain)) {
        return !haystack.includes('ceza dairesi') && !haystack.includes('ceza genel kurulu') && !haystack.includes('danistay');
    }

    if (primaryDomain === 'idare' || primaryDomain === 'vergi') {
        return !haystack.includes('hukuk dairesi') && !haystack.includes('ceza dairesi') && !haystack.includes('ceza genel kurulu');
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
    const maxAttempts = endpoint === SEARCH_ENDPOINT ? 3 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.code = response.status === 429 ? 'HTTP_429' : 'HTTP_FETCH_FAILED';
                throw error;
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

            const shouldRetry = attempt < maxAttempts && (
                String(error?.code || '') === 'HTTP_429'
                || /HTTP 429/i.test(String(error?.message || ''))
            );
            if (!shouldRetry) throw error;

            await delay(700 * attempt);
        } finally {
            clearTimeout(timer);
            if (abortSignal) {
                abortSignal.removeEventListener('abort', handleAbort);
            }
        }
    }

    throw new Error('simple_bedesten_retry_exhausted');
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
    const normalized = normalizeText(effectiveText);
    if (/(anayasa mahkemesi|bireysel basvuru|makul sure|ifade ozgurlugu|adil yargilanma|mulkiyet hakki)/.test(normalized)) return 'anayasa';
    if (/(vergi ziya|vergi ziyai|resen tarh|defter ibraz|zayi belgesi|tarhiyat|vergi inceleme)/.test(normalized)) return 'vergi';
    if (/(on odemeli konut|konut gec teslim|teslim tarihi|cezai sart|konut satisi|bedel iadesi)/.test(normalized)) return 'tuketici';
    if (/(ise iade|gecersiz fesih|performans dusuklugu|savunma alinmadan fesih|hakli fesih|kidem tazminati|ihbar tazminati|mobbing|psikolojik taciz|is kazasi|meslek hastaligi|hizmet tespiti|sgk|fazla mesai|fazla calisma|isveren|isci|yillik izin)/.test(normalized)) return 'is_hukuku';
    if (/(itirazin iptali|menfi tespit|icra inkar|kambiyo takibi|imzaya itiraz|ihalenin feshi|kiymet takdiri|iik 67|iik 72)/.test(normalized)) return 'icra';
    if (/(bosanma|velayet|nafaka|6284|uzaklastirma|zorlama hapsi|evlilik birligi)/.test(normalized)) return 'aile';
    if (/(ortakligin giderilmesi|aynen taksim|ecrimisil|elatmanin onlenmesi|tapu iptali)/.test(normalized)) return 'gayrimenkul';
    if (/(miras|tenkis|sakli pay|vasiyetname|tereke)/.test(normalized)) return 'miras';
    if (/(tuketici|devre mulk|cayma hakki|on odemeli konut|ayipli mal|ayipli arac|bedel iadesi|garanti|konut satisi|gec teslim|cezai sart)/.test(normalized)) return 'tuketici';
    if (/(sebepsiz zenginlesme|vekalet sozlesmesi|havale|vekil|ucret alacagi|kira sozlesmesi|temerrut nedeniyle tahliye|arsa payi karsiligi insaat|eksik ifa|ayipli is)/.test(normalized)) return 'borclar';
    if (/(marka|haksiz rekabet|iltibas|genel kurul|konkordato)/.test(normalized)) return 'ticaret';
    if (/(imar para cezasi|yikim karari|idari islem|disiplin cezasi|encumen)/.test(normalized)) return 'idare';
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
        const domainKeywordFallback = {
            aile: ['bosanma', 'velayet', 'nafaka', '6284', 'uzaklastirma', 'zorlama hapsi', 'evlilik birligi'],
            borclar: ['kira', 'temerrut', 'tahliye', 'tbk', 'kiralanan', 'arsa payi', 'eser sozlesmesi'],
            icra: ['icra', 'haciz', 'itirazin iptali', 'menfi tespit', 'ihalenin feshi', 'meskeniyet', 'iik'],
            gayrimenkul: ['muris muvazaasi', 'tapu iptali', 'tescil', 'ortakligin giderilmesi', 'aynen taksim', 'ecrimisil', 'elatmanin onlenmesi'],
            miras: ['miras', 'tenkis', 'sakli pay', 'vasiyetname', 'tereke', 'muris muvazaasi'],
            ticaret: ['marka', 'haksiz rekabet', 'iltibas', 'genel kurul', 'konkordato', 'ticaret sirketi'],
            idare: ['imar para cezasi', 'yikim karari', 'idari islem', 'disiplin cezasi', 'encumen', 'belediye'],
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

const SIMPLE_LONGFORM_QUERY_STOPWORDS = new Set([
    'karar',
    'mahkeme',
    'dava',
    'davasi',
    'dosya',
    'delil',
    'rapor',
    'tutanak',
    'beyan',
    'beyani',
    'olay',
    'uyusmazlik',
    'uyusmazligi',
    'talep',
    'istem',
    'sonuc',
    'gerekce',
    'hukuk',
    'hukuku',
    'ceza',
]);

const DOMAIN_LOCKED_OVERRIDES = new Set(['aile', 'gayrimenkul', 'miras']);

const DOMAIN_SAFE_VARIANT_LEXICON = {
    aile: [
        'bosanma',
        'velayet',
        'nafaka',
        'kusur durumu',
        'kisisel iliski',
        'mal rejimi',
        '6284',
        'uzaklastirma',
        'evlilik birligi',
    ],
    gayrimenkul: [
        'tapu',
        'tescil',
        'ortakligin giderilmesi',
        'aynen taksim',
        'ecrimisil',
        'elatmanin onlenmesi',
        'tapu iptali tescil',
        'muris muvazaasi',
        'kat mulkiyeti',
    ],
    miras: [
        'miras',
        'tenkis',
        'sakli pay',
        'vasiyetname',
        'tereke',
        'mirasin reddi',
        'reddi miras',
        'muris muvazaasi',
        'veraset',
    ],
};

const DOMAIN_BLOCKED_VARIANT_TOKENS = {
    aile: ['uyusturucu', 'ceza', 'gocmen kacakciligi', 'cumhurbaskanina hakaret', 'marka', 'konkordato'],
    gayrimenkul: ['uyusturucu', 'nafaka', 'velayet', '6284', 'ceza', 'disiplin cezasi'],
    miras: ['uyusturucu', 'nafaka', 'velayet', '6284', 'ceza', 'disiplin cezasi'],
};

const SPECIAL_RECALL_PACKETS = {
    ceza: [
        {
            test: /(uyusturucu|tck 188|tck 191|metamfetamin|kokain|pregabalin|sentetik kannabinoid)/,
            queries: [
                '"uyusturucu madde ticareti"+"tck 188"+"ticaret kasti"',
                '"uyusturucu madde ticareti"+"kullanici tanik beyani"+"kullanim siniri"',
                '"materyal mukayese tutanagi"+"kriminal rapor"+"uyusturucu madde ticareti"',
            ],
        },
        {
            test: /(silahla ates|meskun mahal|6136|genel guvenligin tehlikeye sokulmasi)/,
            queries: [
                '"meskun mahalde silahla ates etme"+"6136"',
                '"genel guvenligin kasten tehlikeye sokulmasi"+"silahla ates"',
            ],
        },
        {
            test: /(hakaret|sosyal medya|iletisim yoluyla)/,
            queries: [
                '"hakaret sucu"+"sosyal medya"',
                '"iletisim yoluyla hakaret"+"alenen hakaret"',
            ],
        },
    ],
    aile: [
        {
            test: /(bosanma|velayet|nafaka|kusur|kisisel iliski|cocugun ustun yarari)/,
            queries: [
                '"bosanma"+"velayet"+"nafaka"+"kusur durumu"',
                '"cocugun ustun yarari"+"kisisel iliski"+"velayet"',
                '"yoksulluk nafakasi"+"istirak nafakasi"+"bosanma"',
                '"aile mahkemesi"+"bosanma"+"velayet"',
                '"evlilik birliginin sarsilmasi"+"bosanma"+"kusur"',
                '"siddetli gecimsizlik"+"bosanma"+"velayet"',
                '"tmk 166"+"evlilik birliginin sarsilmasi"+"bosanma"',
                '"tmk 166"+"velayet"+"nafaka"',
            ],
        },
        {
            test: /(6284|uzaklastirma|zorlama hapsi|koruyucu tedbir|onleyici tedbir)/,
            queries: [
                '"6284"+"uzaklastirma tedbiri"+"zorlama hapsi"',
                '"koruyucu tedbir"+"6284"+"tedbir ihlali"',
                '"aile mahkemesi"+"uzaklastirma"+"6284"',
            ],
        },
    ],
    icra: [
        {
            test: /(itirazin iptali|cari hesap|iik 67|icra inkar)/,
            queries: [
                '"itirazin iptali"+"cari hesap"+"iik 67"',
                '"icra inkar tazminati"+"itirazin iptali"',
            ],
        },
        {
            test: /(menfi tespit|iik 72|teminat)/,
            queries: [
                '"menfi tespit"+"iik 72"+"teminat"',
                '"menfi tespit davasi"+"icra takibi"',
            ],
        },
    ],
    is_hukuku: [
        {
            test: /(ise iade|gecersiz fesih|savunma alinmadan|son care|performans dusuklugu)/,
            queries: [
                '"ise iade"+"gecersiz fesih"',
                '"savunma alinmadan fesih"+"son care ilkesi"',
                '"performans dusuklugu"+"ise iade"',
            ],
        },
        {
            test: /(hakli fesih|istifa|kidem tazminati|ihbar tazminati)/,
            queries: [
                '"hakli fesih"+"kidem tazminati"+"istifa"',
                '"isci feshi"+"hakli neden"+"kidem tazminati"',
                '"ucretin odenmemesi"+"hakli fesih"+"kidem tazminati"',
            ],
        },
        {
            test: /(mobbing|psikolojik taciz)/,
            queries: [
                '"mobbing"+"manevi tazminat"+"is yeri"',
                '"psikolojik taciz"+"manevi tazminat"+"is hukuku"',
                '"mobbing"+"isveren"+"manevi zarar"',
            ],
        },
        {
            test: /(is kazasi|meslek hastaligi|surekli is goremezlik|destekten yoksun)/,
            queries: [
                '"is kazasi"+"maddi manevi tazminat"',
                '"is kazasi"+"kusur raporu"+"maluliyet"',
                '"meslek hastaligi"+"is kazasi"+"tazminat"',
            ],
        },
        {
            test: /(fazla mesai|fazla calisma|bordro|ihtirazi kayit)/,
            queries: [
                '"fazla calisma"+"bordro"+"ihtirazi kayit"',
                '"fazla mesai"+"puantaj"+"tanik beyanlari"',
            ],
        },
        {
            test: /(hizmet tespiti|sgk)/,
            queries: [
                '"hizmet tespiti"+"sgk"',
                '"sigortasiz calisma"+"hizmet tespiti"',
            ],
        },
    ],
    borclar: [
        {
            test: /(kira|tbk 315|tahliye|temerrut)/,
            queries: [
                '"kira sozlesmesi"+"tbk 315"+"temerrut nedeniyle tahliye"',
                '"kiracinin temerrudu"+"tahliye"',
            ],
        },
        {
            test: /(arsa payi|eksik ifa|ayipli is|yuklenici|gec teslim)/,
            queries: [
                '"arsa payi karsiligi insaat"+"eksik ifa"',
                '"yuklenici"+"ayipli is"+"arsa payi"',
                '"gec teslim"+"arsa payi karsiligi insaat"',
            ],
        },
    ],
    gayrimenkul: [
        {
            test: /(muris muvazaasi|tapu iptali|tescil)/,
            queries: [
                '"muris muvazaasi"+"tapu iptali tescil"',
                '"tapu iptali"+"muris muvazaasi"',
            ],
        },
        {
            test: /(ortakligin giderilmesi|aynen taksim|izale-i suyu)/,
            queries: [
                '"ortakligin giderilmesi"+"aynen taksim"',
                '"izalei suyu"+"ortakligin giderilmesi"',
            ],
        },
        {
            test: /(ecrimisil|haksiz isgal|fuzuli isgal)/,
            queries: [
                '"ecrimisil"+"haksiz isgal"+"tasinmaz"',
                '"ecrimisil"+"haksiz isgal"+"fuzuli sagil"',
            ],
        },
        {
            test: /(elatmanin onlenmesi|el atmanin onlenmesi|sinir ihtilafi|fiili mudahale)/,
            queries: [
                '"elatmanin onlenmesi"+"haksiz mudahale"+"tasinmaz"',
                '"el atmanin onlenmesi"+"tapu"',
                '"muhdesatin kal i"+"elatmanin onlenmesi"',
            ],
        },
    ],
    miras: [
        {
            test: /(tenkis|sakli pay|vasiyetname|tereke|reddi miras|mirasin reddi)/,
            queries: [
                '"tenkis"+"sakli pay"+"miras"',
                '"vasiyetname"+"tereke"+"miras"',
                '"reddi miras"+"tereke"',
                '"mirasin reddi"+"tereke borclari"',
                '"reddi miras"+"murisin borclari"',
            ],
        },
    ],
    ticaret: [
        {
            test: /(genel kurul|anonim sirket|limited sirket|iptal|butlan|yokluk)/,
            queries: [
                '"genel kurul karari iptali"+"anonim sirket"',
                '"ttk"+"genel kurul"+"iptal"',
                '"butlan"+"genel kurul karari"',
            ],
        },
        {
            test: /(marka|iltibas|haksiz rekabet)/,
            queries: [
                '"marka hakki"+"iltibas"',
                '"haksiz rekabet"+"marka"',
            ],
        },
    ],
    tuketici: [
        {
            test: /(ayipli arac|ayipli mal|bedel iadesi|garanti|servis kayitlari)/,
            queries: [
                '"ayipli arac"+"bedel iadesi"',
                '"ayipli mal"+"garanti"',
                '"servis kayitlari"+"tuketici"',
            ],
        },
    ],
    idare: [
        {
            test: /(imar|yikim|belediye|ruhsat|idari islem iptali)/,
            queries: [
                '"imar para cezasi"+"yikim karari"+"idari islem iptali"',
                '"belediye"+"ruhsat"+"yikim karari"',
                '"danistay"+"imar"+"yikim"',
            ],
        },
        {
            test: /(disiplin cezasi|idari para cezasi)/,
            queries: [
                '"idari para cezasi"+"iptal davasi"',
                '"disiplin cezasi"+"idari yargi"',
            ],
        },
    ],
    anayasa: [
        {
            test: /(makul sure|yargilamanin uzun surmesi|gec yargilama)/,
            queries: [
                '"anayasa mahkemesi"+"makul sure"+"adil yargilanma"',
                '"bireysel basvuru"+"makul sure"',
                '"yargilamanin uzun surmesi"+"anayasa mahkemesi"',
            ],
        },
        {
            test: /(ifade ozgurlugu|dusunceyi aciklama|basin ozgurlugu|sosyal medya paylasimi)/,
            queries: [
                '"anayasa mahkemesi"+"ifade ozgurlugu"',
                '"bireysel basvuru"+"ifade ozgurlugu"+"ceza mahkumiyeti"',
                '"dusunceyi aciklama ve yayma ozgurlugu"+"anayasa mahkemesi"',
            ],
        },
    ],
};

const buildPlusJoinedPhraseVariant = (terms = []) =>
    dedupeList(terms)
        .map((term) => normalizeText(term))
        .filter(Boolean)
        .slice(0, 4)
        .map((term) => `"${term}"`)
        .join('+');

const isLockedDomain = (primaryDomain = '') => DOMAIN_LOCKED_OVERRIDES.has(normalizeDomainId(primaryDomain, ''));

const buildSpecialRecallQueries = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
} = {}) => {
    const normalizedRaw = normalizeText([rawText, querySeedText].filter(Boolean).join(' '));
    const normalizedDomain = normalizeDomainId(primaryDomain, DEFAULT_DOMAIN_PROFILE_ID);
    const domainPackets = Array.isArray(SPECIAL_RECALL_PACKETS[normalizedDomain]) ? SPECIAL_RECALL_PACKETS[normalizedDomain] : [];

    return dedupeList(
        domainPackets
            .filter((packet) => packet?.test?.test(normalizedRaw))
            .flatMap((packet) => Array.isArray(packet?.queries) ? packet.queries : [])
            .filter(Boolean)
    ).slice(0, 6);
};

const filterVariantsForLockedDomain = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    variants = [],
    fallbackVariants = [],
} = {}) => {
    if (!isLockedDomain(primaryDomain)) {
        return {
            variants: dedupeList((Array.isArray(variants) ? variants : []).filter(Boolean)),
            rejectedCount: 0,
        };
    }

    const lexicon = (DOMAIN_SAFE_VARIANT_LEXICON[primaryDomain] || []).map((item) => normalizeText(item)).filter(Boolean);
    const blockedTokens = (DOMAIN_BLOCKED_VARIANT_TOKENS[primaryDomain] || []).map((item) => normalizeText(item)).filter(Boolean);
    let rejectedCount = 0;

    const filtered = dedupeList((Array.isArray(variants) ? variants : []).filter(Boolean)).filter((variant) => {
        const normalized = normalizeText(variant);
        if (!normalized) {
            rejectedCount += 1;
            return false;
        }

        if (blockedTokens.some((token) => token && normalized.includes(token))) {
            rejectedCount += 1;
            return false;
        }

        if (lexicon.some((token) => token && normalized.includes(token))) return true;

        rejectedCount += 1;
        return false;
    });

    if (filtered.length > 0) {
        return { variants: filtered, rejectedCount };
    }

    return {
        variants: dedupeList((Array.isArray(fallbackVariants) ? fallbackVariants : []).filter(Boolean)),
        rejectedCount,
    };
};

const extractSimpleLongformTerms = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
    packet = null,
} = {}) => {
    const normalizedRaw = normalizeText([rawText, querySeedText].filter(Boolean).join(' '));
    const output = [];
    const addTerm = (value = '') => {
        const normalized = normalizeText(value);
        if (!normalized || SIMPLE_LONGFORM_QUERY_STOPWORDS.has(normalized)) return;
        output.push(normalized);
    };

    if (primaryDomain === 'ceza') {
        if (normalizedRaw.includes('uyusturucu')) addTerm('uyusturucu madde ticareti');
        if (/(kullanici tanik|tanik beyan)/.test(normalizedRaw)) addTerm('kullanici tanik beyani');
        if (/(kullanim siniri|kisisel kullanim|kullanmak icin bulundurma|tck 191)/.test(normalizedRaw)) addTerm('kullanim siniri');
        if (normalizedRaw.includes('materyal mukayese')) addTerm('materyal mukayese tutanagi');
        if (/(kriminal|uzmanlik raporu|bilirki)/.test(normalizedRaw)) addTerm('kriminal rapor');
        if (normalizedRaw.includes('hassas terazi')) addTerm('hassas terazi');
        if (normalizedRaw.includes('fiziki takip')) addTerm('fiziki takip');
    }

    if (primaryDomain === 'aile') {
        if (/(bosanma|evlilik birligi)/.test(normalizedRaw)) addTerm('bosanma');
        if (normalizedRaw.includes('velayet')) addTerm('velayet');
        if (normalizedRaw.includes('nafaka')) addTerm('nafaka');
        if (normalizedRaw.includes('kusur')) addTerm('kusur durumu');
        if (/(kisisel iliski|cocukla gorusme)/.test(normalizedRaw)) addTerm('kisisel iliski');
        if (/(mal rejimi|katilma alacagi|edinilmis mallara katilma)/.test(normalizedRaw)) addTerm('mal rejimi');
        if (normalizedRaw.includes('6284')) addTerm('6284');
        if (/(uzaklastirma|tedbir ihlali|zorlama hapsi)/.test(normalizedRaw)) addTerm('uzaklastirma tedbiri');
    }

    if (primaryDomain === 'icra') {
        if (normalizedRaw.includes('itirazin iptali')) addTerm('itirazin iptali');
        if (normalizedRaw.includes('menfi tespit')) addTerm('menfi tespit');
        if (normalizedRaw.includes('iik 67')) addTerm('iik 67');
        if (normalizedRaw.includes('iik 72')) addTerm('iik 72');
        if (normalizedRaw.includes('cari hesap')) addTerm('cari hesap');
        if (normalizedRaw.includes('icra inkar tazminati')) addTerm('icra inkar tazminati');
    }

    if (primaryDomain === 'is_hukuku') {
        if (normalizedRaw.includes('ise iade')) addTerm('ise iade');
        if (normalizedRaw.includes('gecersiz fesih')) addTerm('gecersiz fesih');
        if (normalizedRaw.includes('performans dusuklugu')) addTerm('performans dusuklugu');
        if (normalizedRaw.includes('savunma alinmadan fesih')) addTerm('savunma alinmadan fesih');
        if (/(hakli fesih|haklı fesih)/.test(normalizedRaw)) addTerm('hakli fesih');
        if (/(kidem tazminati|kıdem tazminatı)/.test(normalizedRaw)) addTerm('kidem tazminati');
        if (/(mobbing|psikolojik taciz)/.test(normalizedRaw)) addTerm('mobbing');
        if (/(manevi tazminat)/.test(normalizedRaw)) addTerm('manevi tazminat');
        if (/(is kazasi|iş kazası)/.test(normalizedRaw)) addTerm('is kazasi');
        if (/(maluliyet|surekli is goremezlik|sürekli iş göremezlik)/.test(normalizedRaw)) addTerm('maluliyet');
        if (/(fazla mesai|fazla calisma)/.test(normalizedRaw)) addTerm('fazla calisma');
        if (normalizedRaw.includes('hizmet tespiti')) addTerm('hizmet tespiti');
        if (normalizedRaw.includes('sgk')) addTerm('sgk');
    }

    if (primaryDomain === 'borclar') {
        if (normalizedRaw.includes('kira')) addTerm('kira sozlesmesi');
        if (normalizedRaw.includes('tbk 315')) addTerm('tbk 315');
        if (normalizedRaw.includes('tahliye')) addTerm('tahliye');
        if (normalizedRaw.includes('arsa payi karsiligi insaat')) addTerm('arsa payi karsiligi insaat');
        if (normalizedRaw.includes('ayipli is')) addTerm('ayipli is');
    }

    if (primaryDomain === 'gayrimenkul') {
        if (normalizedRaw.includes('muris muvazaasi')) {
            addTerm('muris muvazaasi');
            addTerm('tapu iptali tescil');
        }
        if (normalizedRaw.includes('tapu iptali')) addTerm('tapu iptali tescil');
        if (normalizedRaw.includes('ortakligin giderilmesi')) addTerm('ortakligin giderilmesi');
        if (normalizedRaw.includes('aynen taksim')) addTerm('aynen taksim');
        if (normalizedRaw.includes('ecrimisil')) addTerm('ecrimisil');
        if (/(haksiz isgal|haksız işgal|fuzuli isgal|fuzuli işgal)/.test(normalizedRaw)) addTerm('haksiz isgal');
        if (/(elatmanin onlenmesi|el atmanin onlenmesi)/.test(normalizedRaw)) addTerm('elatmanin onlenmesi');
    }

    if (primaryDomain === 'miras') {
        if (normalizedRaw.includes('muris muvazaasi')) addTerm('muris muvazaasi');
        if (normalizedRaw.includes('tenkis')) addTerm('tenkis');
        if (normalizedRaw.includes('sakli pay')) addTerm('sakli pay');
        if (normalizedRaw.includes('vasiyetname')) addTerm('vasiyetname');
        if (normalizedRaw.includes('tereke')) addTerm('tereke');
        if (/(mirasin reddi|reddi miras)/.test(normalizedRaw)) addTerm('mirasin reddi');
        if (/(murisin borclari|muris borcu|tereke borcu|tereke borclari)/.test(normalizedRaw)) addTerm('tereke borclari');
    }

    if (primaryDomain === 'anayasa') {
        if (/(anayasa mahkemesi)/.test(normalizedRaw)) addTerm('anayasa mahkemesi');
        if (/(bireysel basvuru)/.test(normalizedRaw)) addTerm('bireysel basvuru');
        if (/(makul sure|makul süre)/.test(normalizedRaw)) addTerm('makul sure');
        if (/(ifade ozgurlugu|ifade özgürlüğü)/.test(normalizedRaw)) addTerm('ifade ozgurlugu');
        if (/(adil yargilanma|adil yargılanma)/.test(normalizedRaw)) addTerm('adil yargilanma');
    }

    if (primaryDomain === 'ticaret') {
        if (normalizedRaw.includes('marka')) addTerm('marka hakki');
        if (normalizedRaw.includes('iltibas')) addTerm('iltibas');
        if (normalizedRaw.includes('haksiz rekabet')) addTerm('haksiz rekabet');
        if (normalizedRaw.includes('genel kurul')) addTerm('genel kurul karari iptali');
        if (normalizedRaw.includes('konkordato')) addTerm('konkordato');
    }

    if (primaryDomain === 'tuketici') {
        if (normalizedRaw.includes('ayipli mal')) addTerm('ayipli mal');
        if (normalizedRaw.includes('bedel iadesi')) addTerm('bedel iadesi');
        if (normalizedRaw.includes('servis kayitlari')) addTerm('servis kayitlari');
        if (normalizedRaw.includes('konut gec teslim')) addTerm('konut gec teslim');
        if (normalizedRaw.includes('on odemeli konut')) addTerm('on odemeli konut');
        if (normalizedRaw.includes('cezai sart')) addTerm('cezai sart');
        if (normalizedRaw.includes('kira kaybi')) addTerm('kira kaybi');
    }

    if (primaryDomain === 'idare') {
        if (normalizedRaw.includes('imar para cezasi')) addTerm('imar para cezasi');
        if (normalizedRaw.includes('yikim karari')) addTerm('yikim karari');
        if (normalizedRaw.includes('disiplin cezasi')) addTerm('disiplin cezasi');
        if (normalizedRaw.includes('iptal')) addTerm('idari islem iptali');
    }

    if (primaryDomain === 'vergi') {
        if (normalizedRaw.includes('sahte fatura')) addTerm('sahte fatura');
        if (normalizedRaw.includes('sahte belge')) addTerm('sahte belge');
        if (normalizedRaw.includes('muhteviyati itibariyla yaniltici belge')) addTerm('muhteviyati itibariyla yaniltici belge');
        if (normalizedRaw.includes('vergi ziya')) addTerm('vergi ziyai cezasi');
        if (normalizedRaw.includes('resen tarh')) addTerm('resen tarh');
        if (normalizedRaw.includes('defter ibraz')) addTerm('defter ibraz etmeme');
        if (normalizedRaw.includes('kdv')) addTerm('katma deger vergisi');
        if (normalizedRaw.includes('kurumlar vergisi')) addTerm('kurumlar vergisi');
        if (normalizedRaw.includes('uzlasma')) addTerm('uzlasma');
    }

    [
        ...(packet?.requiredConcepts || []),
        ...(packet?.supportConcepts || []),
    ].forEach((term) => addTerm(term));

    return dedupeList(output).slice(0, 5);
};

const buildSimpleLongformVariants = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
    packet = null,
} = {}) => {
    const simpleTerms = extractSimpleLongformTerms({
        primaryDomain,
        rawText,
        querySeedText,
        packet,
    });
    const variants = [];

    if (simpleTerms.length >= 2) variants.push(buildPlusJoinedPhraseVariant(simpleTerms));
    if (simpleTerms.length >= 3) variants.push(buildPlusJoinedPhraseVariant(simpleTerms.slice(0, 3)));
    if (simpleTerms.length >= 2) variants.push(buildStructuredQueryVariant(simpleTerms.slice(0, 3)));
    if (simpleTerms.length > 0) variants.push(simpleTerms.join(' '));

    return dedupeList(variants.filter(Boolean)).slice(0, 4);
};

const buildRawPhraseFirstVariants = ({
    rawText = '',
    querySeedText = '',
} = {}) => {
    const phraseChunks = dedupePhraseChunks([
        ...extractOperatorPhraseChunks(rawText),
        ...extractOperatorPhraseChunks(querySeedText),
        ...extractArticlePhraseChunks(rawText),
        ...extractArticlePhraseChunks(querySeedText),
    ], 5).filter(Boolean);

    if (phraseChunks.length === 0) return [];

    return dedupeList([
        buildPlusJoinedPhraseVariant(phraseChunks.slice(0, 4)),
        buildPlusJoinedPhraseVariant(phraseChunks.slice(0, 3)),
        ...phraseChunks.slice(0, 3).map((chunk) => buildExactPhraseQuery(chunk)),
        buildStructuredQueryVariant(phraseChunks.slice(0, 3)),
        phraseChunks.join(' '),
    ].filter(Boolean)).slice(0, 5);
};

const buildExactKeywordVariant = (value = '') => {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    if (tokenCount === 0 || tokenCount > 5) return '';
    return buildExactPhraseQuery(normalized);
};

const buildUnifiedRetrievalQueries = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
    packet = null,
    phaseOneQueries = [],
    phaseTwoQueries = [],
    queryVariants = [],
} = {}) => {
    const simpleTerms = extractSimpleLongformTerms({
        primaryDomain,
        rawText,
        querySeedText,
        packet,
    }).slice(0, 4);

    const individualClauseQueries = simpleTerms.map((term) => {
        const normalized = normalizeText(term);
        if (!normalized) return '';
        return (normalized.includes(' ') || /\d/.test(normalized))
            ? `"${normalized}"`
            : normalized;
    }).filter(Boolean);

    const normalizedRaw = normalizeText([rawText, querySeedText].filter(Boolean).join(' '));
    const domainRecallQueries = [];
    const specialRecallQueries = buildSpecialRecallQueries({
        primaryDomain,
        rawText,
        querySeedText,
    });

    if (primaryDomain === 'ceza' && normalizedRaw.includes('uyusturucu')) {
        domainRecallQueries.push('"uyusturucu madde ticareti"+"kullanici tanik beyani"+"kullanim siniri"+"materyal mukayese tutanagi"');
        domainRecallQueries.push('"tck 188"+"ticaret kasti"+"kullanici tanik beyani"');
        if (/(hassas terazi|paketleme|fiziki takip)/.test(normalizedRaw)) {
            domainRecallQueries.push('"uyusturucu madde ticareti"+"hassas terazi"+"paketleme"');
        }
    }

    if (primaryDomain === 'aile' && /bosanma|velayet|nafaka/.test(normalizedRaw)) {
        domainRecallQueries.push('"bosanma"+"velayet"+"nafaka"+"kusur durumu"');
        domainRecallQueries.push('"bosanma"+"cocugun ustun yarari"+"kisisel iliski"');
        domainRecallQueries.push('"yoksulluk nafakasi"+"istirak nafakasi"+"velayet"');
        domainRecallQueries.push('"bosanma"+"nafaka"+"aile mahkemesi"');
    }

    if (primaryDomain === 'idare' && /imar|yikim|iptal|belediye/.test(normalizedRaw)) {
        domainRecallQueries.push('"imar para cezasi"+"yikim karari"+"idari islem iptali"');
        domainRecallQueries.push('"belediye"+"ruhsat"+"yikim karari"');
        domainRecallQueries.push('"danistay"+"imar"+"yikim"');
    }

    if (primaryDomain === 'vergi') {
        if (/(sahte fatura|sahte belge|muhteviyati itibariyla yaniltici belge)/.test(normalizedRaw)) {
            domainRecallQueries.push('"sahte fatura"+"vergi ziyai cezasi"+"tarhiyatin iptali"');
            domainRecallQueries.push('"sahte belge"+"vergi inceleme raporu"+"tarhiyat"');
            domainRecallQueries.push('"muhteviyati itibariyla yaniltici belge"+"kdv"+"kurumlar vergisi"');
        }
        if (/(resen tarh|defter ibraz|zayi belgesi)/.test(normalizedRaw)) {
            domainRecallQueries.push('"resen tarh"+"defter ibraz etmeme"+"vergi inceleme raporu"');
            domainRecallQueries.push('"defter ibraz etmeme"+"tarhiyatin iptali"+"vergi mahkemesi"');
        }
        if (/(uzlasma|ceza ihbarnamesi|odeme emri|kdv|kurumlar vergisi|gelir vergisi)/.test(normalizedRaw)) {
            domainRecallQueries.push('"uzlasma"+"vergi cezasi"+"ceza ihbarnamesi"');
            domainRecallQueries.push('"katma deger vergisi"+"tarhiyatin iptali"+"danistay"');
            domainRecallQueries.push('"kurumlar vergisi"+"vergi mahkemesi"+"danistay"');
        }
    }

    if (primaryDomain === 'is_hukuku') {
        if (/(hakli fesih|kidem tazminati|ihbar tazminati|fazla mesai|yillik izin)/.test(normalizedRaw)) {
            domainRecallQueries.push('"hakli fesih"+"kidem tazminati"+"fazla mesai"');
            domainRecallQueries.push('"kidem tazminati"+"yillik izin"+"isci feshi"');
        }
        if (/(mobbing|psikolojik taciz|manevi tazminat)/.test(normalizedRaw)) {
            domainRecallQueries.push('"mobbing"+"manevi tazminat"+"psikolojik taciz"');
            domainRecallQueries.push('"mobbing"+"isverenin gozetim borcu"');
        }
        if (/(is kazasi|surekli is goremezlik|maluliyet|is guvenligi)/.test(normalizedRaw)) {
            domainRecallQueries.push('"is kazasi"+"maddi manevi tazminat"+"maluliyet"');
            domainRecallQueries.push('"is guvenligi"+"is kazasi"+"surekli is goremezlik"');
        }
    }

    if (primaryDomain === 'gayrimenkul') {
        if (/(ecrimisil|haksiz isgal|fuzuli isgal)/.test(normalizedRaw)) {
            domainRecallQueries.push('"ecrimisil"+"haksiz isgal"+"tasinmaz"');
            domainRecallQueries.push('"ecrimisil"+"fuzuli isgal"');
        }
        if (/(elatmanin onlenmesi|el atmanin onlenmesi|sinir ihtilafi|fiili mudahale)/.test(normalizedRaw)) {
            domainRecallQueries.push('"elatmanin onlenmesi"+"muhdesatin kal i"+"tasinmaz"');
            domainRecallQueries.push('"elatmanin onlenmesi"+"haksiz mudahale"');
        }
    }

    if (primaryDomain === 'miras' && /(reddi miras|mirasin reddi|tereke borc|murisin borc)/.test(normalizedRaw)) {
        domainRecallQueries.push('"reddi miras"+"tereke borclari"+"miras"');
        domainRecallQueries.push('"mirasin reddi"+"murisin borclari"');
    }

    if (primaryDomain === 'anayasa') {
        if (/(makul sure|yargilamanin uzun surmesi|adil yargilanma)/.test(normalizedRaw)) {
            domainRecallQueries.push('"anayasa mahkemesi"+"makul sure"+"bireysel basvuru"');
            domainRecallQueries.push('"makul sure"+"adil yargilanma hakki"');
        }
        if (/(ifade ozgurlugu|sosyal medya paylasim|elestiri|hakaret ayrimi)/.test(normalizedRaw)) {
            domainRecallQueries.push('"anayasa mahkemesi"+"ifade ozgurlugu"+"sosyal medya"');
            domainRecallQueries.push('"ifade ozgurlugu"+"elestiri hakaret ayrimi"');
        }
    }

    return dedupeList([
        ...specialRecallQueries,
        ...domainRecallQueries,
        buildPlusJoinedPhraseVariant(simpleTerms),
        buildPlusJoinedPhraseVariant(simpleTerms.slice(0, 3)),
        ...individualClauseQueries.slice(0, 2),
        ...(Array.isArray(phaseOneQueries) ? phaseOneQueries.slice(0, 1) : []),
        ...(Array.isArray(phaseTwoQueries) ? phaseTwoQueries.slice(0, 1) : []),
        ...(Array.isArray(queryVariants) ? queryVariants.slice(0, 1) : []),
    ].filter(Boolean)).slice(0, 10);
};

const buildZeroResultRecoveryQueries = ({
    primaryDomain = DEFAULT_DOMAIN_PROFILE_ID,
    rawText = '',
    querySeedText = '',
    packet = null,
} = {}) => {
    const simpleTerms = extractSimpleLongformTerms({
        primaryDomain,
        rawText,
        querySeedText,
        packet,
    }).slice(0, 5);
    const normalizedRaw = normalizeText([rawText, querySeedText].filter(Boolean).join(' '));
    const recoveryQueries = [];

    if (simpleTerms.length >= 4) {
        recoveryQueries.push(buildPlusJoinedPhraseVariant([
            simpleTerms[0],
            simpleTerms[1],
            simpleTerms[2],
            simpleTerms[3],
        ]));
    }

    if (simpleTerms.length >= 3) {
        recoveryQueries.push(buildPlusJoinedPhraseVariant([
            simpleTerms[0],
            simpleTerms[1],
            simpleTerms[2],
        ]));
    }

    if (primaryDomain === 'is_hukuku') {
        if (/(ise iade|gecersiz fesih|savunma alinmadan fesih|performans dusuklugu)/.test(normalizedRaw)) {
            recoveryQueries.push('"ise iade"+"gecersiz fesih"+"savunma alinmadan fesih"');
            recoveryQueries.push('"ise iade"+"performans dusuklugu"+"fesih"');
            recoveryQueries.push('"gecersiz fesih"+"is guvencesi"+"ise iade"');
            recoveryQueries.push('"performans dusuklugu gecerli fesih"');
        } else if (/(is kazasi|maluliyet|surekli is goremezlik)/.test(normalizedRaw)) {
            recoveryQueries.push('"is kazasi"+"surekli is goremezlik"+"maddi manevi tazminat"');
            recoveryQueries.push('"is kazasi"+"maluliyet"+"isverenin sorumlulugu"');
            recoveryQueries.push('"is guvenligi"+"is kazasi"+"tazminat"');
        }
    }

    if (primaryDomain === 'gayrimenkul') {
        if (/(ecrimisil|haksiz isgal|fuzuli isgal)/.test(normalizedRaw)) {
            recoveryQueries.push('"ecrimisil"+"haksiz isgal"+"fuzuli isgal"');
            recoveryQueries.push('"ecrimisil"+"tasinmaz"+"kullanim bedeli"');
            recoveryQueries.push('"haksiz isgal"+"ecrimisil"+"tapu"');
        }
        if (/(elatmanin onlenmesi|el atmanin onlenmesi|muhdesat|haksiz mudahale)/.test(normalizedRaw)) {
            recoveryQueries.push('"elatmanin onlenmesi"+"haksiz mudahale"+"tasinmaz"');
            recoveryQueries.push('"elatmanin onlenmesi"+"muhdesatin kal i"');
            recoveryQueries.push('"el atmanin onlenmesi"+"tapu"+"tescil"');
        }
    }

    if (primaryDomain === 'tuketici' && /(konut|gec teslim|teslim tarihi|cezai sart)/.test(normalizedRaw)) {
        recoveryQueries.push('"tuketici"+"konut gec teslim"+"cezai sart"');
        recoveryQueries.push('"on odemeli konut"+"gec teslim"+"bedel iadesi"');
        recoveryQueries.push('"konut satisi"+"gec teslim"+"tuketici"');
        recoveryQueries.push('"konut gec teslim"');
    }

    if (primaryDomain === 'anayasa') {
        if (/(ifade ozgurlugu|sosyal medya|elestiri|hakaret ayrimi)/.test(normalizedRaw)) {
            recoveryQueries.push('"anayasa mahkemesi"+"ifade ozgurlugu"+"bireysel basvuru"');
            recoveryQueries.push('"ifade ozgurlugu"+"sosyal medya"+"anayasa mahkemesi"');
            recoveryQueries.push('"ifade ozgurlugu"+"elestiri"+"hakaret ayrimi"');
        }
        if (/(makul sure|adil yargilanma|yargilamanin uzun surmesi)/.test(normalizedRaw)) {
            recoveryQueries.push('"anayasa mahkemesi"+"makul sure"+"bireysel basvuru"');
            recoveryQueries.push('"makul sure"+"adil yargilanma hakki"+"anayasa mahkemesi"');
            recoveryQueries.push('"yargilamanin uzun surmesi"+"makul sure"+"bireysel basvuru"');
        }
    }

    if (primaryDomain === 'miras' && /(reddi miras|mirasin reddi|tereke borc|murisin borc)/.test(normalizedRaw)) {
        recoveryQueries.push('"reddi miras"+"mirasin reddi"+"tereke borclari"');
        recoveryQueries.push('"mirasin reddi"+"murisin borclari"+"tereke"');
        recoveryQueries.push('"reddi miras"+"sulh hukuk mahkemesi"+"tereke"');
    }

    return dedupeList(recoveryQueries.filter(Boolean)).slice(0, 3);
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
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };

    if (!body.data.kararTarihiStart) delete body.data.kararTarihiStart;
    if (!body.data.kararTarihiEnd) delete body.data.kararTarihiEnd;
    if (filters?.sortFields) body.data.sortFields = filters.sortFields;
    if (filters?.sortDirection) body.data.sortDirection = filters.sortDirection;
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
    hybridFastMode = false,
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
    const explicitRoutingIntent = hasExplicitRoutingIntent({
        source,
        filters,
        rawQuery,
        keyword,
    });
    const packetDrivenRouting = resolvePacketDrivenRouting({
        source,
        filters,
        packet: explicitRoutingIntent ? normalizedPacket : null,
    });
    const baseRouting = resolveCourtTypes({
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });
    const sanitizedKeyword = sanitizeLegalInput(keyword);
    const sanitizedRawQuery = sanitizeLegalInput(rawQuery || keyword);
    const originalLegalText = [String(keyword || '').trim(), String(rawQuery || '').trim()]
        .filter(Boolean)
        .join(' ')
        .trim();
    const initialQuerySeedText =
        String(keyword || '').trim()
        || String(sanitizedKeyword.text || '').trim()
        || compactSimpleLegalQuery(originalLegalText)
        || compactSimpleLegalQuery(sanitizedRawQuery.text)
        || buildPacketDrivenQuerySeedText(
            normalizedPacket,
            sanitizedKeyword.text || sanitizedRawQuery.text
        );
    const initialDomainText = dedupeList([
        sanitizedKeyword.text,
        sanitizedRawQuery.text,
        ...(normalizedPacket?.requiredConcepts || []),
        ...(normalizedPacket?.supportConcepts || []),
        ...(normalizedPacket?.evidenceConcepts || []),
        ...(normalizedPacket?.negativeConcepts || []),
    ].filter(Boolean)).join(' ').trim();
    const initialInferredPrimaryDomain = inferPrimaryDomain({
        effectiveText: initialQuerySeedText || initialDomainText,
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });
    const rawDomainOverride = inferPrimaryDomain({
        effectiveText: originalLegalText || sanitizedRawQuery.text || sanitizedKeyword.text,
        source: 'all',
        filters: { searchArea: 'auto' },
    });
    const domainLocked = isLockedDomain(rawDomainOverride);
    const querySeedText = initialQuerySeedText;
    const domainText = initialDomainText;
    const inferredPrimaryDomain = initialInferredPrimaryDomain;
    const seedDrivenSkillPackage = buildSkillBackedSearchPackage({
        rawText: querySeedText || domainText,
        preferredSource: packetDrivenRouting.source,
    });
    const resolvedSkillPackage = resolvedContract.skillPackage;
    const expectedPrimaryDomain = normalizeDomainId(
        rawDomainOverride || normalizedPacket?.primaryDomain || routingProfile?.primaryDomain || inferredPrimaryDomain,
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
    const naturalLongformMode =
        String(process.env.LEGAL_SIMPLE_NATURAL_LONGFORM_MODE || '0').trim().toLowerCase() === 'true'
        && (
            String(normalizedPacket?.queryMode || '').trim().toLowerCase() === 'long_fact'
            || String(normalizedPacket?.queryMode || '').trim().toLowerCase() === 'case_file'
            || sanitizedRawQuery.text.length >= 180
        );
    const primaryDomain = normalizeDomainId(
        rawDomainOverride
        || normalizedPacket?.primaryDomain
        || routingProfile?.primaryDomain
        || inferredPrimaryDomain
        || runtimeSkillPackage?.primaryDomain,
        DEFAULT_DOMAIN_PROFILE_ID
    );
    const useAgentPipeline =
        !hybridFastMode
        && String(process.env.LEGAL_AGENT_PIPELINE || '1').trim() !== '0';
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
    const agenticSignalsEnabled =
        !hybridFastMode
        && String(process.env.LEGAL_AGENTIC_SIGNALS_ENABLED || '').trim() === 'true';
    const agentSignalPlan = agenticSignalsEnabled
        ? await generateAgenticDomainSignals({
            rawText: sanitizedRawQuery.text || sanitizedKeyword.text,
            querySeedText: querySeedText || initialQuerySeedText || sanitizedRawQuery.text || sanitizedKeyword.text,
            primaryDomain,
            packet: normalizedPacket,
            skillPlan: baseSkillPlan,
        })
        : null;
    let skillPlan = buildAgenticAugmentedSkillPlan(baseSkillPlan, agentSignalPlan);
    const geminiExpandedVariants = hybridFastMode
        ? []
        : await expandQueryWithGemini({
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
    let routing = resolveRoutedCourtTypes({
        baseRouting,
        primaryDomain,
        source: packetDrivenRouting.source,
        filters: packetDrivenRouting.filters,
    });
    if (!explicitRoutingIntent && normalizeSource(source) === 'all' && !['idare', 'vergi', 'anayasa'].includes(primaryDomain)) {
        routing = baseRouting;
    }

    const primaryQuery = compactSimpleLegalQuery(querySeedText);
    const exactKeywordVariant = buildExactKeywordVariant(keyword);
    const packetRequiredVariant = buildStructuredQueryVariant(normalizedPacket?.requiredConcepts || []);
    const packetSupportVariant = buildStructuredQueryVariant(dedupeList([
        ...(normalizedPacket?.requiredConcepts || []).slice(0, 2),
        ...(normalizedPacket?.supportConcepts || []).slice(0, 2),
    ]));
    const exactPhraseVariant = buildQuotedRequiredPhraseVariant(querySeedText);
    const simpleLongformVariants = buildSimpleLongformVariants({
        primaryDomain,
        rawText: rawQuery || domainText,
        querySeedText,
        packet: normalizedPacket,
    });
    const retrievalInitialKeyword =
        exactKeywordVariant
        || simpleLongformVariants[0]
        || packetRequiredVariant
        || exactPhraseVariant
        || primaryQuery
        || '';
    const semanticEmbeddingQuery = buildSemanticEmbeddingQuery({
        primaryDomain,
        rawText: rawQuery || domainText || sanitizedRawQuery.text,
        querySeedText,
        packet: normalizedPacket,
        skillPlan,
    });
    skillPlan = {
        ...(skillPlan || {}),
        initialKeyword: retrievalInitialKeyword || skillPlan?.initialKeyword,
        embeddingQuery: semanticEmbeddingQuery || skillPlan?.embeddingQuery || retrievalInitialKeyword,
    };
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
    const lockedQueryVariantSet = filterVariantsForLockedDomain({
        primaryDomain,
        variants: [
            exactKeywordVariant,
            ...simpleLongformVariants,
            packetRequiredVariant,
            packetSupportVariant,
            exactPhraseVariant,
            ...agentQueryVariants,
            ...focusedVariants,
            ...geminiExpandedVariants,
            primaryQuery,
        ],
        fallbackVariants: [
            exactKeywordVariant,
            ...simpleLongformVariants,
            packetRequiredVariant,
            exactPhraseVariant,
            primaryQuery,
        ],
    });
    const domainSafeQueryVariants = lockedQueryVariantSet.variants;
    const queryVariants = (primaryDomain === 'ceza'
        ? filterConflictingCezaVariants({
            variants: [
                exactKeywordVariant,
                ...simpleLongformVariants,
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
        : isLockedDomain(primaryDomain)
            ? domainSafeQueryVariants
        : dedupeList([
            exactKeywordVariant,
            ...simpleLongformVariants,
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
                exactKeywordVariant,
                ...simpleLongformVariants.slice(0, 2),
                packetRequiredVariant,
                exactPhraseVariant,
                ...agentQueryVariants.slice(0, 2),
                ...cezaFocusedVariants.slice(0, 2),
                ...focusedVariants.slice(0, 2),
                ...geminiExpandedVariants.slice(0, 2),
            ],
            ...cezaVariantContext,
        })
        : isLockedDomain(primaryDomain)
            ? domainSafeQueryVariants.slice(0, 4)
        : dedupeList([
            exactKeywordVariant,
            ...simpleLongformVariants.slice(0, 2),
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
                ...simpleLongformVariants.slice(2),
                packetSupportVariant,
                ...agentQueryVariants.slice(2),
                ...cezaFocusedVariants.slice(2),
                ...focusedVariants.slice(2),
                ...geminiExpandedVariants.slice(2, 5),
                primaryQuery,
            ],
            ...cezaVariantContext,
        })
        : isLockedDomain(primaryDomain)
            ? domainSafeQueryVariants.slice(4, 8)
        : dedupeList([
            ...simpleLongformVariants.slice(2),
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
        courtTypes: routing.courtTypes,
        filters: packetDrivenRouting.filters,
        effectiveText: domainText,
        preferredBirimCodes: routingProfile?.primaryBirimCodes?.length
            ? routingProfile.primaryBirimCodes
            : (normalizedPacket?.preferredBirimCodes || []),
    });
    const secondaryTargetBirimCodes = resolveTargetBirimCodes({
        courtTypes: routing.courtTypes,
        filters: packetDrivenRouting.filters,
        effectiveText: domainText,
        preferredBirimCodes: routingProfile?.secondaryBirimCodes || [],
    });
    const explicitBirimIntent = dedupeBirimCodes([
        ...(Array.isArray(packetDrivenRouting.filters?.birimAdiCandidates) ? packetDrivenRouting.filters.birimAdiCandidates : []),
        packetDrivenRouting.filters?.birimAdi,
        ...extractBirimCodesFromCourtHint(domainText),
        ...extractBirimCodesFromCourtHint(rawQuery || ''),
        ...extractBirimCodesFromCourtHint(keyword || ''),
    ]).length > 0;
    const routingMode = String(
        routingProfile?.routingMode
        || (secondaryTargetBirimCodes.length > 0
            ? 'primary_secondary'
            : (primaryTargetBirimCodes.length > 0 ? 'hard_primary' : 'source_first'))
    ).trim().toLowerCase() || 'source_first';
    const effectiveRoutingMode = explicitBirimIntent ? routingMode : 'source_first';
    const isSourceFirstRouting = effectiveRoutingMode === 'source_first';
    const allowSecondaryRouting = effectiveRoutingMode === 'primary_secondary' && secondaryTargetBirimCodes.length > 0;
    const targetBirimCodes = explicitBirimIntent
        ? dedupeBirimCodes([
            ...primaryTargetBirimCodes,
            ...secondaryTargetBirimCodes,
        ], SIMPLE_MAX_TARGET_BIRIM_CODES)
        : [];
    const rankingTargetBirimCodes = explicitBirimIntent
        ? (primaryTargetBirimCodes.length > 0 ? primaryTargetBirimCodes : targetBirimCodes)
        : [];
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
                initialKeyword: String(skillPlan?.initialKeyword || '').trim() || null,
                embeddingQuery: String(skillPlan?.embeddingQuery || agentSignalPlan?.embeddingQuery || '').trim() || null,
                packetApplied: Boolean(normalizedPacket),
                packetPrimaryDomain: normalizedPacket?.primaryDomain || null,
                packetCaseType: normalizedPacket?.caseType || null,
                packetRequiredConceptCount: Array.isArray(normalizedPacket?.requiredConcepts) ? normalizedPacket.requiredConcepts.length : 0,
                agenticSignalMode: agentSignalPlan?.diagnostics?.mode || null,
                agenticSignalsApplied: Boolean(agentSignalPlan),
                rawDomainOverride: rawDomainOverride || null,
                domainLocked,
                domainSafeVariantCount: domainSafeQueryVariants.length,
                rejectedCrossDomainVariantCount: Number(lockedQueryVariantSet?.rejectedCount || 0),
                birimAdiCandidates: targetBirimCodes,
                finalMatchedCount: 0,
                familyRejectCount: 0,
            },
        };
    }

    let decisionList = [];
    let selectedQueryVariant = null;
    const selectedBirimAdi = '';
    const unifiedRetrievalQueries = buildUnifiedRetrievalQueries({
        primaryDomain,
        rawText: domainText,
        querySeedText,
        packet: normalizedPacket,
        phaseOneQueries,
        phaseTwoQueries,
        queryVariants,
    });
    const zeroResultRecoveryQueries = buildZeroResultRecoveryQueries({
        primaryDomain,
        rawText: domainText,
        querySeedText,
        packet: normalizedPacket,
    });
    const phaseAttemptSummary = {
        unified_retrieval: {
            queryCount: unifiedRetrievalQueries.length,
            birimCount: 1,
        },
        zero_result_recovery: {
            queryCount: zeroResultRecoveryQueries.length,
        },
    };
    let retrievalAttemptErrors = [];

    for (const queryVariant of unifiedRetrievalQueries) {
        throwIfAbortRequested(abortSignal);
        let attemptResults = [];
        try {
            attemptResults = await runSearchAttempt({
                phrase: queryVariant,
                courtTypes: routing.courtTypes,
                filters: attemptFilters,
                birimAdi: '',
                abortSignal,
                routingProfile,
            });
        } catch (error) {
            retrievalAttemptErrors.push({
                query: queryVariant,
                error: String(error?.code || error?.message || 'search_attempt_failed'),
            });
            phaseAttemptSummary.unified_retrieval[queryVariant] = 0;
            continue;
        }

        phaseAttemptSummary.unified_retrieval[queryVariant] = attemptResults.length;

        if (attemptResults.length > 0 && !selectedQueryVariant) {
            selectedQueryVariant = queryVariant;
        }

        if (attemptResults.length > 0) {
            decisionList = mergeBedestenDecisionLists(decisionList, attemptResults);
        }

        decisionList = dedupeResultsByIdentity(decisionList).slice(0, 15);
        if (decisionList.length >= 12) break;
    }

    if (decisionList.length === 0 && extraVariantEnabled) {
        const requiredVariant = buildRequiredTermVariant(primaryQuery);
        if (requiredVariant && !unifiedRetrievalQueries.includes(requiredVariant)) {
            try {
                const fallbackResults = await runSearchAttempt({
                    phrase: requiredVariant,
                    courtTypes: routing.courtTypes,
                    filters: attemptFilters,
                    birimAdi: '',
                    abortSignal,
                    routingProfile,
                });
                phaseAttemptSummary.unified_retrieval[requiredVariant] = fallbackResults.length;
                if (fallbackResults.length > 0) {
                    selectedQueryVariant = selectedQueryVariant || requiredVariant;
                    decisionList = mergeBedestenDecisionLists(decisionList, fallbackResults);
                    decisionList = dedupeResultsByIdentity(decisionList).slice(0, 15);
                }
            } catch (error) {
                retrievalAttemptErrors.push({
                    query: requiredVariant,
                    error: String(error?.code || error?.message || 'search_attempt_failed'),
                });
                phaseAttemptSummary.unified_retrieval[requiredVariant] = 0;
            }
        }
    }

    if (decisionList.length === 0 && zeroResultRecoveryQueries.length > 0) {
        for (const recoveryQuery of zeroResultRecoveryQueries) {
            throwIfAbortRequested(abortSignal);
            try {
                const recoveryResults = await runSearchAttempt({
                    phrase: recoveryQuery,
                    courtTypes: routing.courtTypes,
                    filters: attemptFilters,
                    birimAdi: '',
                    abortSignal,
                    routingProfile,
                });
                phaseAttemptSummary.zero_result_recovery[recoveryQuery] = recoveryResults.length;
                if (recoveryResults.length > 0) {
                    selectedQueryVariant = selectedQueryVariant || recoveryQuery;
                    decisionList = mergeBedestenDecisionLists(decisionList, recoveryResults);
                    decisionList = dedupeResultsByIdentity(decisionList).slice(0, 15);
                }
            } catch (error) {
                retrievalAttemptErrors.push({
                    query: recoveryQuery,
                    error: String(error?.code || error?.message || 'zero_result_recovery_failed'),
                });
                phaseAttemptSummary.zero_result_recovery[recoveryQuery] = 0;
            }

            if (decisionList.length >= 10) break;
        }
    }

    let mappedResults = rerankResultsForDomain({
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
    let compatibilityFilteredResults = mappedResults.filter((result) =>
        passesHardDomainExclusionOnly({
            result,
            primaryDomain,
            routedCourtTypes: routing.courtTypes,
        })
    );
    const relaxedCompatibilityFallbackUsed = false;
    if (compatibilityFilteredResults.length === 0 && mappedResults.length > 0) {
        compatibilityFilteredResults = mappedResults.slice();
    }
    let karakaziHybridDiagnostics = {
        applied: false,
        reason: 'not_needed',
        count: 0,
    };
    const allowKarakaziHybrid = !['idare', 'vergi', 'anayasa'].includes(primaryDomain);
    if (compatibilityFilteredResults.length < 10 && allowKarakaziHybrid) {
        try {
            const karakaziHybrid = await fetchKarakaziHybridCandidates({
                rawText: rawQuery || domainText || sanitizedRawQuery.text || sanitizedKeyword.text,
                abortSignal,
            });
            karakaziHybridDiagnostics = karakaziHybrid.diagnostics || karakaziHybridDiagnostics;
            if (Array.isArray(karakaziHybrid.results) && karakaziHybrid.results.length > 0) {
                mappedResults = rerankResultsForDomain({
                    results: dedupeResultsByIdentity([
                        ...mappedResults,
                        ...karakaziHybrid.results,
                    ]),
                    primaryDomain,
                    targetBirimCodes: rankingTargetBirimCodes,
                    routedCourtTypes: routing.courtTypes,
                });
                compatibilityFilteredResults = mappedResults.filter((result) =>
                    passesHardDomainExclusionOnly({
                        result,
                        primaryDomain,
                        routedCourtTypes: routing.courtTypes,
                    })
                );
                if (compatibilityFilteredResults.length === 0 && mappedResults.length > 0) {
                    compatibilityFilteredResults = mappedResults.slice();
                }
            }
        } catch (error) {
            karakaziHybridDiagnostics = {
                applied: false,
                reason: String(error?.message || error || 'karakazi_hybrid_failed'),
                count: 0,
            };
        }
    } else if (!allowKarakaziHybrid) {
        karakaziHybridDiagnostics = {
            applied: false,
            reason: 'disabled_for_danistay_domain',
            count: 0,
        };
    }
    const documentRerank = await rerankResultsByDocumentContent({
        results: compatibilityFilteredResults.slice(0, 12),
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
            initialKeyword: String(skillPlan?.initialKeyword || '').trim() || null,
            embeddingQuery: String(skillPlan?.embeddingQuery || agentSignalPlan?.embeddingQuery || '').trim() || null,
            packetApplied: Boolean(normalizedPacket),
            packetPrimaryDomain: normalizedPacket?.primaryDomain || null,
            packetCaseType: normalizedPacket?.caseType || null,
            packetRequiredConceptCount: Array.isArray(normalizedPacket?.requiredConcepts) ? normalizedPacket.requiredConcepts.length : 0,
            agenticSignalMode: agentSignalPlan?.diagnostics?.mode || null,
            agenticSignalsApplied: Boolean(agentSignalPlan),
            agenticSignalWarnings: agentSignalPlan?.diagnostics?.warnings || [],
            zeroResultRecoveryQueries,
            rawDomainOverride: rawDomainOverride || null,
            domainLocked,
            domainSafeVariantCount: domainSafeQueryVariants.length,
            rejectedCrossDomainVariantCount: Number(lockedQueryVariantSet?.rejectedCount || 0),
            routingMode: effectiveRoutingMode,
            explicitBirimIntent,
            birimAdiCandidates: targetBirimCodes,
            totalCandidates: compatibilityFilteredResults.length,
            finalMatchedCount: strictPrecisionResults.length,
            zeroResultReason: strictPrecisionResults.length === 0 ? 'no_candidates' : null,
            compatibilityFilterApplied: compatibilityFilteredResults.length !== mappedResults.length,
            compatibilityFilteredOutCount: Math.max(0, mappedResults.length - compatibilityFilteredResults.length),
            familyRejectCount: Math.max(0, mappedResults.length - compatibilityFilteredResults.length),
            relaxedCompatibilityFallbackUsed,
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
            retrievalAttemptErrors,
            selectedBirimAdi: selectedBirimAdi || null,
            firstSuccessfulBirimAdi: selectedBirimAdi || null,
            acceptedTopResultDaireler: dedupeList(strictPrecisionResults.map((item) => item?.daire).filter(Boolean)).slice(0, 4),
            rejectionReasons: strictPrecisionResults.length > 0 ? [] : [sourceCoverageStatus],
            sourceCoverageStatus,
            phaseAttemptSummary,
            rateLimitedAttemptCount: 0,
            karakaziHybridDiagnostics,
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
