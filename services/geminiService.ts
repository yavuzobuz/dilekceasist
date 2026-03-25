import { type ChatMessage, type GeneratePetitionParams, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, ChatContext, LawyerInfo, ContactInfo } from '../types';
import { supabase } from '../lib/supabase';
import type { DetailedAnalysis, LegalSearchPacket, PrecedentSearchPlan, WebSearchPlan } from '../types';

const API_BASE_URL = '/api/gemini';
const MAX_CHAT_API_BODY_BYTES = 15 * 1024 * 1024;
const MAX_ANALYZE_API_BODY_BYTES = 40 * 1024 * 1024;

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
        const fallbackMessage = `API Error (${response.status}): ${response.statusText}`;
        let rawError = '';

        if (response.status === 413) {
            throw new Error('Istek boyutu limiti asildi. Daha kucuk dosya/metin ile tekrar deneyin.');
        }

        if (typeof response.text === 'function') {
            rawError = await response.text();
        } else if (typeof response.json === 'function') {
            try {
                const parsed = await response.json();
                rawError = JSON.stringify(parsed || {});
            } catch {
                rawError = '';
            }
        }

        if (rawError) {
            try {
                const parsed = JSON.parse(rawError);
                throw new Error(parsed?.error || parsed?.details || fallbackMessage);
            } catch {
                throw new Error(rawError || fallbackMessage);
            }
        }

        throw new Error(fallbackMessage);
    }
    return response.json();
}

function stringifyPayloadWithLimit(payload: unknown, contextLabel: string, maxBytes = MAX_CHAT_API_BODY_BYTES): string {
    const body = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(body).length;

    if (bytes > maxBytes) {
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        throw new Error(`${contextLabel} icin gonderilen veri cok buyuk (${mb} MB). Lutfen dosyalari/parcalari kucultun.`);
    }

    return body;
}

// Helper to clean JSON string from Markdown code blocks
function cleanJsonString(text: string): string {
    // Remove ```json and ``` or just ```
    let cleanText = text.replace(/```json\s*|\s*```/g, '');
    // Also remove generic code blocks if json tag wasn't used
    cleanText = cleanText.replace(/```/g, '');
    return cleanText.trim();
}

function repairMalformedSearchVariantQueries(text: string): string {
    if (!text || !/"query"\s*:\s*"/.test(text)) return text;

    const queryStartRegex = /"query"\s*:\s*"/g;
    let output = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = queryStartRegex.exec(text)) !== null) {
        const valueStart = queryStartRegex.lastIndex;
        output += text.slice(cursor, valueStart);

        let endIndex = valueStart;
        let escaped = false;

        while (endIndex < text.length) {
            const char = text[endIndex];

            if (escaped) {
                escaped = false;
                endIndex += 1;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                endIndex += 1;
                continue;
            }

            if (char === '"') {
                let lookAhead = endIndex + 1;
                while (lookAhead < text.length && /\s/.test(text[lookAhead])) {
                    lookAhead += 1;
                }

                if (text[lookAhead] === ',' || text[lookAhead] === '}') {
                    break;
                }
            }

            endIndex += 1;
        }

        if (endIndex >= text.length) {
            return text;
        }

        const rawValue = text.slice(valueStart, endIndex);
        let repairedValue = '';
        let valueEscaped = false;

        for (const valueChar of rawValue) {
            if (valueEscaped) {
                repairedValue += valueChar;
                valueEscaped = false;
                continue;
            }

            if (valueChar === '\\') {
                repairedValue += valueChar;
                valueEscaped = true;
                continue;
            }

            if (valueChar === '"') {
                repairedValue += '\\"';
                continue;
            }

            repairedValue += valueChar;
        }

        output += repairedValue;
        cursor = endIndex;
        queryStartRegex.lastIndex = endIndex + 1;
    }

    output += text.slice(cursor);
    return output;
}

function safeJsonObjectParse(text: string): any | null {
    if (!text || typeof text !== 'string') return null;

    const repairedText = repairMalformedSearchVariantQueries(text);

    try {
        return JSON.parse(repairedText);
    } catch {
        const objectMatch = repairedText.match(/\{[\s\S]*\}/);
        if (!objectMatch) return null;
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            return null;
        }
    }
}

const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const PERSON_NAME_REGEX = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2}$/;
const ADDRESS_HINT_REGEX = /\b(mahallesi|mah|sokak|sok|cadde|cad|bulvar|bulvari|apartman|apt|bina|daire|blok|kapi|no)\b/i;
const BARE_MADDE_REGEX = /^\d{1,3}\.?\s*maddesi?$/i;
const LAW_REFERENCE_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|vuk|kmk|anayasa|imar kanunu|is kanunu)\b/i;

function isNoisyKeyword(value: string): boolean {
    const normalized = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return true;

    if (DATE_ONLY_REGEX.test(normalized)) return true;
    if (DIGITS_ONLY_REGEX.test(normalized)) return true;
    if (ADDRESS_HINT_REGEX.test(normalized)) return true;
    if (PERSON_NAME_REGEX.test(normalized)) return true;
    if (BARE_MADDE_REGEX.test(normalized) && !LAW_REFERENCE_REGEX.test(normalized)) return true;

    return false;
}

function dedupeKeywords(rawKeywords: unknown[]): string[] {
    const seen = new Set<string>();
    const keywords: string[] = [];

    for (const item of rawKeywords) {
        const normalized = String(item || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3 || normalized.toLocaleLowerCase('tr-TR') === 'kul') continue;
        if (isNoisyKeyword(normalized)) continue;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        keywords.push(normalized);
        if (keywords.length >= 12) break;
    }

    return keywords;
}

const GENERIC_LEGAL_SIGNAL_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|iyuk|vuk|anayasa|madde|maddesi|suclu|suçlu|sanik|sanık|magdur|mağdur|delil|arama|tutanak|rapor|ticaret|kullanim|kullanım|orantililik|orantılılık|iptal|yikim|yıkım|imar|ruhsat|haciz|fesih|nafaka|velayet|tapu|ecrimisil)\b/i;
const GENERIC_CONTRAST_REGEXES = [
    /([\p{L}\d][\p{L}\d\s]{2,48}?)\s+mi\s+([\p{L}\d][\p{L}\d\s]{2,36}?)(?:\s+mi)?(?:\s+(?:ayrimi|ayırımı|ayrimi|ayrimi|ayrımı|ayrimi))?/giu,
    /([\p{L}\d][\p{L}\d\s]{2,48}?)\s+ile\s+([\p{L}\d][\p{L}\d\s]{2,36}?)\s+ayr[ıi]m[ıi]/giu,
];
const GENERIC_NEGATION_REGEX = /(bulunmami[sş]tir|bulunmam[iı][sş]tir|bulunamami[sş]tir|yoktur|ele gecirilmemi[sş]tir|ele geçirilmemi[sş]tir|rastlanmami[sş]tir|rastlanmam[iı][sş]tir)/i;
const GENERIC_ARGUMENT_REGEX = /(delalet etmez|anlamina gelmez|anlamına gelmez|gostermez|göstermez|ispatlamaz|yeterli degildir|yeterli değildir|orantisizdir|orantısızdır|olcululuk ilkesine aykiridir|ölçülülük ilkesine aykırıdır)/i;

function trimPhraseEdges(value: string): string {
    return String(value || '')
        .replace(/^[,;:.()\-\s]+|[,;:.()\-\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactPhraseForSearch(value: string, maxWords = 7): string {
    const words = trimPhraseEdges(value).split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(words.length - maxWords).join(' ');
}

function extractGenericLegalConcepts(text: string): {
    requiredConcepts: string[];
    supportConcepts: string[];
} {
    const sourceText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!sourceText) {
        return { requiredConcepts: [], supportConcepts: [] };
    }

    const requiredConcepts: string[] = [];
    const supportConcepts: string[] = [];
    const addRequired = (value: string) => {
        const normalized = trimPhraseEdges(value);
        if (normalized) requiredConcepts.push(normalized);
    };
    const addSupport = (value: string) => {
        const normalized = trimPhraseEdges(value);
        if (normalized) supportConcepts.push(normalized);
    };

    for (const regex of GENERIC_CONTRAST_REGEXES) {
        const matches = sourceText.matchAll(regex);
        for (const match of matches) {
            const left = compactPhraseForSearch(match[1] || '', 5);
            const right = compactPhraseForSearch(match[2] || '', 5);
            if (!left || !right) continue;
            addRequired(left);
            addRequired(right);
            addSupport(`${left} ${right} ayrimi`);
        }
    }

    const clauses = sourceText
        .split(/[\n.!?;]+/)
        .flatMap((sentence) => sentence.split(/\s*,\s*/))
        .map((item) => trimPhraseEdges(item))
        .filter(Boolean);

    for (const clause of clauses) {
        if (GENERIC_NEGATION_REGEX.test(clause)) {
            const leading = trimPhraseEdges(clause.split(GENERIC_NEGATION_REGEX)[0] || '');
            const candidates = leading
                .split(/\s+ve\s+|\/| ile /i)
                .map((item) => trimPhraseEdges(item.split(/\sgibi\s/i)[0] || item))
                .map((item) => compactPhraseForSearch(item, 6))
                .filter((item) => item && !isNoisyKeyword(item));

            for (const candidate of candidates) {
                addSupport(candidate);
            }
        }

        if (GENERIC_ARGUMENT_REGEX.test(clause)) {
            const compactClause = compactPhraseForSearch(clause, 9);
            if (GENERIC_LEGAL_SIGNAL_REGEX.test(clause)) {
                addRequired(compactClause);
            } else {
                addSupport(compactClause);
            }
        }

        if (/kendi kullan[iı]m|kişisel kullan[iı]m|kisisel kullan[iı]m/i.test(clause)) {
            addSupport(/kişisel kullan[iı]m|kisisel kullan[iı]m/i.test(clause) ? 'kisisel kullanim' : 'kendi kullanim');
        }

        if (/uzun sureli kullanici|uzun süreli kullanıcı/i.test(clause)) {
            addSupport('uzun sureli kullanici');
        }

        if (GENERIC_LEGAL_SIGNAL_REGEX.test(clause)) {
            const compactClause = compactPhraseForSearch(clause, 7);
            if (!isNoisyKeyword(compactClause)) {
                addSupport(compactClause);
            }
        }
    }

    return {
        requiredConcepts: dedupeKeywords(requiredConcepts).slice(0, 8),
        supportConcepts: dedupeKeywords(supportConcepts).slice(0, 10),
    };
}

function extractKeywordFallbackFromAnalysis(analysisText: string): string[] {
    const text = String(analysisText || '');
    if (!text.trim()) return [];

    const candidates: string[] = [];
    const add = (value: string) => {
        const normalized = String(value || '').replace(/[""\"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized || normalized.length < 3) return;
        candidates.push(normalized);
    };

    const genericConcepts = extractGenericLegalConcepts(text);
    genericConcepts.requiredConcepts.forEach(add);
    genericConcepts.supportConcepts.forEach(add);

    // Legal code references (broad)
    const codeRefs = text.match(/(?:TCK|CMK|HMK|TMK|TBK|İİK|IIK|TTK|BK|AİHM|AIHM|İYUK|IYUK|SGK)\s*(?:m\.?\s*)?\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    codeRefs.forEach(add);

    // "madde" references
    const maddeRefs = text.match(/\d+\.?\s*madde(?:si)?/gi) || [];
    maddeRefs.forEach(add);

    // Esas/Karar number references
    const esasKarar = text.match(/(?:E(?:sas)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+|K(?:arar)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+)/gi) || [];
    esasKarar.forEach(add);

    // Ceza hukuku
    if (/uyuşturucu|uyusturucu/i.test(text) && /ticaret|satıc|satic|satış|satis/i.test(text)) {
        add('uyuşturucu ticareti'); add('uyuşturucu satıcılığı iddiası');
    }
    if (/kullanım sınırını aşan|kullanim sinirini asan|kullanım sınırı|kullanim siniri/i.test(text)) {
        add('kullanım sınırını aşan miktarda madde');
    }
    if (/hırsızlık|hirsizlik/i.test(text)) add('hırsızlık suçu');
    if (/dolandırıcılık|dolandiricilik/i.test(text)) add('dolandırıcılık suçu');
    if (/tehdit|şantaj|santaj/i.test(text)) add('tehdit suçu');
    if (/yaralama|müessir fiil/i.test(text)) add('kasten yaralama');
    if (/öldürme|adam öldürme|cinayet/i.test(text)) add('kasten öldürme');
    if (/cinsel|tecavüz|taciz/i.test(text)) add('cinsel suçlar');
    if (/zimmet|rüşvet|irtikap/i.test(text)) add('zimmet suçu');
    if (/sahtecilik|sahte belge/i.test(text)) add('resmi belgede sahtecilik');
    if (/hakaret|onur|şeref/i.test(text)) add('hakaret suçu');
    if (/yağma|gasp/i.test(text)) add('yağma suçu');
    if (/tutuklama|tutuklan|tutuklu/i.test(text)) add('tutukluluk');
    if (/beraat|berâat/i.test(text)) add('beraat kararı');
    if (/mahkumiyet|mahkûmiyet/i.test(text)) add('ceza indirimi');

    // İş hukuku
    if (/kıdem tazminatı|kidem tazminati/i.test(text)) add('kıdem tazminatı');
    if (/ihbar tazminatı|ihbar tazminati/i.test(text)) add('ihbar tazminatı');
    if (/işe iade|ise iade/i.test(text)) add('işe iade davası');
    if (/haksız fesih|haksiz fesih/i.test(text)) add('haksız fesih');
    if (/fazla mesai|fazla çalışma|mesai ücreti/i.test(text)) add('fazla mesai ücreti');
    if (/mobbing|iş yeri baskısı/i.test(text)) add('mobbing');
    if (/iş kazası|is kazasi/i.test(text)) add('iş kazası tazminat');

    // Aile hukuku
    if (/boşanma|bosanma/i.test(text)) add('boşanma davası');
    if (/nafaka/i.test(text)) add('nafaka');
    if (/velayet/i.test(text)) add('velayet davası');
    if (/mal paylaşımı|mal paylaşimi|mal rejimi/i.test(text)) add('mal paylaşımı davası');

    // Miras hukuku
    if (/miras|veraset|tereke/i.test(text)) add('miras hukuku');
    if (/vasiyetname|vasiyet/i.test(text)) add('vasiyetname');
    if (/tenkis/i.test(text)) add('tenkis davası');

    // Borçlar hukuku
    if (/alacak/i.test(text) && /dava|borç|borc/i.test(text)) add('alacak davası');
    if (/tazminat/i.test(text) && /zarar|talep|dava/i.test(text)) add('tazminat davası');
    if (/kira|kiracı|tahliye/i.test(text)) add('kira hukuku');

    // İdare hukuku
    if (/idari işlem|idari islem|iptal davası/i.test(text)) add('idari işlemin iptali');
    if (/disiplin cezası|disiplin cezasi/i.test(text)) add('disiplin cezası iptali');
    if (/kamulaştırma|kamulastirma/i.test(text)) add('kamulaştırma');

    // Tüketici hukuku
    if (/tüketici|tuketici|ayıplı mal|ayipli mal/i.test(text)) add('tüketici hakları');

    // İcra iflas
    if (/icra|haciz/i.test(text)) add('icra hukuku');
    if (/itirazın iptali|itirazin iptali/i.test(text)) add('itirazın iptali');

    // Gayrimenkul
    if (/tapu/i.test(text) && /iptal|tescil/i.test(text)) add('tapu iptal ve tescil');
    if (/ecrimisil/i.test(text)) add('ecrimisil davası');
    if (/kat mülkiyeti|kat mulkiyeti/i.test(text)) add('kat mülkiyeti');

    // Ticaret hukuku
    if (/çek|senet|bono|kambiyo/i.test(text)) add('kambiyo senetleri');
    if (/iflas|konkordato/i.test(text)) add('iflas hukuku');

    const deduped = dedupeKeywords(candidates);
    if (deduped.length > 0) return deduped;

    const compactFallback = String(analysisText || '').replace(/\s+/g, ' ').trim();
    return compactFallback ? [compactFallback] : [];
}

const LEGAL_SEARCH_PACKET_DOMAINS = new Set<NonNullable<LegalSearchPacket['primaryDomain']>>([
    'ceza',
    'is_hukuku',
    'aile',
    'icra',
    'borclar',
    'ticaret',
    'gayrimenkul',
    'idare',
    'vergi',
    'tuketici',
    'sigorta',
    'miras',
    'anayasa',
    'fikri_mulkiyet',
    'bilisim',
    'deniz',
    'kamulastirma',
    'rekabet',
    'cevre',
    'bankacilik',
    'kadastro',
    'cocuk',
    'saglik',
    'infaz',
    'is_guvenligi',
    'tahkim',
]);

const DOMAIN_ALIAS_MAP: Record<string, NonNullable<LegalSearchPacket['primaryDomain']>> = {
    bilisim_hukuku: 'bilisim',
    siber_hukuk: 'bilisim',
    siber: 'bilisim',
    bilisim_sucları: 'bilisim',
    elektronik_ticaret: 'bilisim',
    saglik_hukuku: 'saglik',
    tibbi_malpraktis: 'saglik',
    malpraktis: 'saglik',
    hasta_haklari: 'saglik',
    hekim_sorumlulugu: 'saglik',
    fikri_mulkiyet_hukuku: 'fikri_mulkiyet',
    fikri_ve_sinai_haklar: 'fikri_mulkiyet',
    fikri_sinai_haklar: 'fikri_mulkiyet',
    sinai_mulkiyet: 'fikri_mulkiyet',
    patent_hukuku: 'fikri_mulkiyet',
    marka_hukuku: 'fikri_mulkiyet',
    telif_hukuku: 'fikri_mulkiyet',
    fsek: 'fikri_mulkiyet',
    smk: 'fikri_mulkiyet',
    deniz_ticaret_hukuku: 'deniz',
    deniz_ticaret: 'deniz',
    denizcilik_hukuku: 'deniz',
    gemi_hukuku: 'deniz',
    kamulastirma_hukuku: 'kamulastirma',
    kentsel_donusum: 'kamulastirma',
    kamulaştırma: 'kamulastirma',
    rekabet_hukuku: 'rekabet',
    haksiz_rekabet_hukuku: 'rekabet',
    rkhk: 'rekabet',
    cevre_hukuku: 'cevre',
    imar_hukuku: 'cevre',
    cevre_ve_imar: 'cevre',
    imar_ve_cevre: 'cevre',
    bankacilik_hukuku: 'bankacilik',
    finans_hukuku: 'bankacilik',
    sermaye_piyasasi_hukuku: 'bankacilik',
    sermaye_piyasasi: 'bankacilik',
    bddk: 'bankacilik',
    spk: 'bankacilik',
    kadastro_hukuku: 'kadastro',
    tapu_kadastro: 'kadastro',
    cocuk_hukuku: 'cocuk',
    cocuk_ceza: 'cocuk',
    infaz_hukuku: 'infaz',
    ceza_infaz: 'infaz',
    is_sagligi_guvenligi: 'is_guvenligi',
    isg: 'is_guvenligi',
    is_kazasi: 'is_guvenligi',
    meslek_hastaligi: 'is_guvenligi',
    tahkim_hukuku: 'tahkim',
    uluslararasi_tahkim: 'tahkim',
    istac: 'tahkim',
    mtk: 'tahkim',
    esya_hukuku: 'gayrimenkul',
    esya: 'gayrimenkul',
    tasinmaz: 'gayrimenkul',
    kira_hukuku: 'gayrimenkul',
    sosyal_guvenlik_hukuku: 'is_hukuku',
    sosyal_guvenlik: 'is_hukuku',
    is_ve_sosyal_guvenlik: 'is_hukuku',
    spor_hukuku: 'borclar',
    uluslararasi_hukuk: 'borclar',
    uluslararasi: 'borclar',
    tazminat_hukuku: 'borclar',
    tazminat: 'borclar',
    borclar_hukuku: 'borclar',
    sozlesme_hukuku: 'borclar',
    sozlesme: 'borclar',
    basin_hukuku: 'ceza',
    basin: 'ceza',
    iflas_konkordato: 'icra',
    iflas: 'icra',
    konkordato: 'icra',
    aile_ve_miras: 'aile',
    ceza_hukuku: 'ceza',
    idare_hukuku: 'idare',
    is_hukuku_ve_sosyal_guvenlik: 'is_hukuku',
    vergi_hukuku: 'vergi',
    aile_hukuku: 'aile',
    miras_hukuku: 'miras',
    ticaret_hukuku: 'ticaret',
    gayrimenkul_hukuku: 'gayrimenkul',
    sigorta_hukuku: 'sigorta',
    tuketici_hukuku: 'tuketici',
    icra_iflas_hukuku: 'icra',
    icra_ve_iflas: 'icra',
    anayasa_hukuku: 'anayasa',
    enerji_hukuku: 'idare',
    enerji: 'idare',
};



const LEGAL_SEARCH_PACKET_SOURCES = new Set<NonNullable<LegalSearchPacket['preferredSource']>>([
    'yargitay',
    'danistay',
    'bam',
    'auto',
]);

const normalizePacketText = (value: unknown, maxLength = 320): string =>
    String(value || '')
        .replace(/[“”"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        .trim();

const normalizePacketList = (values: unknown, limit = 8): string[] => {
    if (!Array.isArray(values)) return [];
    return dedupeKeywords(values.map((item) => normalizePacketText(item, 120))).slice(0, limit);
};

const normalizeSearchVariantMode = (value: unknown): string | undefined => {
    const normalized = normalizePacketText(value, 24).toLocaleLowerCase('tr-TR');
    return normalized || undefined;
};

const normalizeSearchVariants = (values: unknown, limit = 4): NonNullable<LegalSearchPacket['searchVariants']> => {
    if (!Array.isArray(values)) return [];

    const normalizedVariants: NonNullable<LegalSearchPacket['searchVariants']> = [];
    const seen = new Set<string>();

    for (const item of values) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const candidate = item as Record<string, unknown>;
        const query = String(candidate.query || '')
            .replace(/[“”]/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220)
            .trim();
        if (!query) continue;
        const key = query.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        normalizedVariants.push({
            query,
            mode: normalizeSearchVariantMode(candidate.mode),
        });
        if (normalizedVariants.length >= limit) break;
    }

    return normalizedVariants;
};

const extractStatuteTokens = (values: string[] = []): string[] => {
    const matches = values.join(' ').match(/(?:TCK|CMK|HMK|TMK|TBK|IIK|IYUK|TTK|4857|5237|6100|6098|3194)\s*\d*(?:\s*\/\s*\d+)?/gi) || [];
    return dedupeKeywords(matches).slice(0, 2);
};

const buildSearchVariantsFromPacket = ({
    caseType = '',
    coreIssue = '',
    requiredConcepts = [],
    supportConcepts = [],
    searchSeedText = '',
}: {
    caseType?: string;
    coreIssue?: string;
    requiredConcepts?: string[];
    supportConcepts?: string[];
    searchSeedText?: string;
}): NonNullable<LegalSearchPacket['searchVariants']> => {
    const strictTerms = dedupeKeywords(requiredConcepts).slice(0, 2);
    const broadTerms = dedupeKeywords([...requiredConcepts, ...supportConcepts]).slice(0, 2);
    const statuteTokens = extractStatuteTokens([
        caseType,
        coreIssue,
        searchSeedText,
        ...requiredConcepts,
        ...supportConcepts,
    ]);

    return normalizeSearchVariants([
        strictTerms.length > 0
            ? { query: strictTerms.map((item) => `+"${item}"`).join(' '), mode: 'strict' }
            : null,
        broadTerms.length > 0
            ? { query: broadTerms.map((item) => `+"${item}"`).join(' '), mode: 'broad' }
            : null,
        statuteTokens.length > 0
            ? { query: [caseType, ...statuteTokens].filter(Boolean).map((item) => `"${item}"`).join(' '), mode: 'statute' }
            : null,
        searchSeedText
            ? { query: searchSeedText, mode: 'fallback' }
            : null,
    ].filter(Boolean), 4);
};

const normalizePacketCodeList = (values: unknown, limit = 6): string[] => {
    if (!Array.isArray(values)) return [];

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const item of values) {
        const code = normalizePacketText(item, 40).toUpperCase();
        if (!code || code.length < 2) continue;
        if (seen.has(code)) continue;
        seen.add(code);
        normalized.push(code);
        if (normalized.length >= limit) break;
    }

    return normalized;
};

const inferPacketQueryMode = (text: string): NonNullable<LegalSearchPacket['queryMode']> => {
    const normalized = String(text || '').trim();
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (normalized.includes('\n') || wordCount >= 120) return 'document_style';
    if (wordCount >= 45 || normalized.length >= 260) return 'long_fact';
    return 'short_issue';
};

const inferPacketPrimaryDomain = (text: string): LegalSearchPacket['primaryDomain'] => {
    const normalized = String(text || '').toLocaleLowerCase('tr-TR');
    if (!normalized.trim()) return undefined;

    if (/(18 yas|18 yaş|çocuk mahkeme|cocuk mahkeme|çocuk suçlu|cocuk suclu|suça surüklenen|suça sürüklenen|çkk|5395)/i.test(normalized)) return 'cocuk';
    if (/(infaz hakimi|infaz hâkimi|ceza infaz|cgk|cgtihk|koşullu salıverilme|kosullu saliverme|denetimli serbestlik|tahliye talebi|hükümlü|hukumlu|cezaevi|tutukluluk suresi|tutukluluk süresi)/i.test(normalized)) return 'infaz';
    if (/(marka tescil|patent|faydalı model|faydalı model|tasarım tescil|telif|eser sahipliği|eser sahibi|fsek|smk|6769|5846|fikri hak|sinai hak|fikri mülkiyet|fikri mulkiyet)/i.test(normalized)) return 'fikri_mulkiyet';
    if (/(bilişim suç|bilisim suc|bilgisayar sistemleri|yetkisiz erişim|veri ihlali|siber saldırı|siber saldiri|sosyal medya suç|sosyal medya suc|tck 243|tck 244|tck 245|elektronik dolandırıcılık|elektronik dolandiricilik)/i.test(normalized)) return 'bilisim';
    if (/(gemi|deniz kazası|deniz kazasi|denizcilik|konşimento|konşimento|liman|navlun|deniz ticareti|deniz sigortası|deniz sigortasi|5136|kaptan|donatan)/i.test(normalized)) return 'deniz';
    if (/(kamulaştırma|kamulastirma|2942|kamulaştırmasız|kamulastirmasiz|kentsel dönüşüm|kentsel donusum|acele kamulaştırma|acele kamulastirma|bedel tespiti ve tescil)/i.test(normalized)) return 'kamulastirma';
    if (/(rekabet kurumu|rkhk|4054|tekelleşme|tekellesme|kartelleme|kartel|hakim durum|hâkim durum|piyasa gücü|piyasa gucu|birleşme izni|birleme izni)/i.test(normalized)) return 'rekabet';
    if (/(çevre kirliliği|cevre kirliligi|çevre izni|cevre izni|çed raporu|ced raporu|çevresel etki|2872|orman tahribat|orman kanunu|6831|imar planı|imar plani|nazim imar|uygulama imar|çevre cezası|cevre cezasi)/i.test(normalized)) return 'cevre';
    if (/(banka|bddk|5411|kredi sözleşmesi|kredi sozlesmesi|tüketici kredisi|tuketici kredisi|konut kredisi|kredi kartı|kredi karti|finansal kiralama|leasing|menkul kıymet|menkul kiymet|sermaye piyasası|sermaye piyasasi|spk|borsa istanbul)/i.test(normalized)) return 'bankacilik';
    if (/(kadastro|tapu sicili|sınırlandırma|sinirlandirma|3402|tapulama|tapu mahkemesi|mera|orman sınırı|orman siniri|2B arazi|hazine taşınmazı|hazine tasinmazi)/i.test(normalized)) return 'kadastro';
    if (/(iş sağlığı|is sagligi|iş güvenliği|is guvenligi|isg|meslek hastalığı|meslek hastaligi|is kazasi tazminat|iş kazası tazminat|6331|kişisel koruyucu|kisiel koruyucu|işyeri tehlike|isyeri tehlike)/i.test(normalized)) return 'is_guvenligi';
    if (/(tahkim|hakem|hakem kurulu|istac|mtk|tahkim sözleşmesi|tahkim sozlesmesi|hakem kararının tenfizi|hakem kararinin tenfizi|milletlerarası tahkim|milletlerarasi tahkim|4686|uluslararası tahkim|uluslararasi tahkim)/i.test(normalized)) return 'tahkim';
    if (/(sağlık hukuku|saglik hukuku|malpraktis|tıbbi müdahale|tibbi mudahale|hekim hatası|hekim hatasi|tıbbi ihmal|tibbi ihmal|hasta hakları|hasta haklari|tıbbi uygulama|tibbi uygulama|hastane sorumluluğu)/i.test(normalized)) return 'saglik';
    if (/(uyusturucu|uyuşturucu|tck|cmk|sanik|şüpheli|supheli|magdur|mağdur|hirsizlik|hırsızlık|dolandiricilik|dolandırıcılık|iddianame|savunma|beraat|mahkumiyet|mahkûmiyet|zimmet|rüşvet|irtikap|sahtecilik|yağma|gasp|hakaret|tehdit|adam öldürme|kasten öldürme|cinsel saldiri|cinsel saldırı)/i.test(normalized)) return 'ceza';
    if (/(ise iade|işe iade|kidem|kıdem|ihbar tazminat|fazla mesai|fazla çalışma|isci|işçi|isveren|işveren|mobbing|is sozlesmesi|iş sözleşmesi|isyeri|işyeri|yillik izin|yıllık izin|asgari ucret|asgari ücret|toplu is sozlesmesi|sendika|sgk|sosyal guvenlik)/i.test(normalized)) return 'is_hukuku';
    if (/(bosanma|boşanma|nafaka|velayet|ziynet|mal rejimi|aile konutu|evlilik birliginin|evlilik birliğinin|soy baglantisi|soybağlantısı|babalik davasi|babalık davası|edinilmis mallar|edinilmiş mallar|katilma alacagi|katılma alacağı)/i.test(normalized)) return 'aile';
    if (/(itirazin iptali|itirazın iptali|menfi tespit|istirdat|odeme emri|ödeme emri|borcun olmadigi|borcun olmadığı|kambiyo|senede itiraz|çek itiraz|bono itiraz)/.test(normalized)) return 'icra';
    if (/(icra|haciz|tasinir haczi|taşınır haczi|alacak haczi|maaş haczi|maas haczi|ihale|satisi)/.test(normalized) && !/(idari islem|idari işlem)/i.test(normalized)) return 'icra';
    if (/(tapu iptal|tapu iptali|tapu tescil|muris muvazaasi|muris muvazaası|ortakligin giderilmesi|ortaklığın giderilmesi|ecrimisil|kira tahliye|kira tespiti|kira uyarlama|kat mulkiyeti|kat mülkiyeti|kat irtifaki|kat irtifakı|arsa payi|arsa payı|onalim|ön alım|satiş vaadi|satış vaadi|intifa hakki|intifa hakkı)/i.test(normalized)) return 'gayrimenkul';
    if (/(idari islem|idari işlem|iptal davasi|iptal davası|tam yargi|tam yargı|hizmet kusuru|yurutmenin durdurulmasi|yürütmenin durdurulması|yikim karari|yıkım kararı|yapi tatil|yapı tatil|yapi tespit|yapı tespit|ruhsatsiz yapi|ruhsatsız yapı|belediye encumeni|belediye encümeni|ihale iptal|kamu ihale|idari para cezasi|idari para cezası|disiplin cezasi|disiplin cezası|memuriyet|devlet memur)/i.test(normalized)) return 'idare';
    if (/(vergi|tarhiyat|kdv|kv|gelir vergisi|stopaj|vergi ziyai|naylon fatura|sahte fatura|vuk|transfer fiyatlandirma|transfer fiyatlandırma|ortulu kazanc|örtülü kazanç)/i.test(normalized)) return 'vergi';
    if (/(anonim sirket|anonim şirket|limited sirket|limited şirket|ticari defter|genel kurul|konkordato|iflas|borca batik|borca batık|kambiyo senedi|ciranta|ciro|esas sozlesme|esas sözleşme|pay devri|ortaklar)/i.test(normalized)) return 'ticaret';
    if (/(sigorta|kasko|trafik sigortasi|trafik sigortası|riziko|deger kaybi|değer kaybı|eksper|hasar tazminat|hasar bedel|sigorta poliçe|sigorta police|munhasiran illiyet)/i.test(normalized)) return 'sigorta';
    if (/(miras|tereke|tenkis|vasiyet|sakli pay|saklı pay|mirasin reddi|mirasın reddi|veraset|veraset ilamı|veraset ilami|muris|mirasci|mirasçı)/i.test(normalized)) return 'miras';
    if (/(ayipli mal|ayıplı mal|ayipli hizmet|ayıplı hizmet|tuketici|tüketici|hakem heyeti|cayma hakki|cayma hakkı|garanti belgesi|urun iadesi|ürün iadesi|paket tur|tatil sozlesmesi)/i.test(normalized)) return 'tuketici';
    if (/(sozlesmeye aykirilik|sözleşmeye aykırılık|sebepsiz zenginlesme|sebepsiz zenginleşme|haksiz fiil|haksız fiil|temerrut|temerrüt|vekalet|borcun ifasi|borcun ifası|alacak davasi|alacak davası|kira sozlesmesi|kira sözleşmesi|yuklenici|yüklenici|eser sozlesmesi|eser sözleşmesi|ibra|nakdi tazminat)/i.test(normalized)) return 'borclar';
    if (/(anayasa|aym|bireysel basvuru|bireysel başvuru|hak ihlali|ifade ozgurlugu|ifade özgürlüğü|basin ozgurlugu|basın özgürlüğü|toplanma|dernek kurma)/i.test(normalized)) return 'anayasa';
    return undefined;
};

const inferPacketPreferredSource = (primaryDomain?: LegalSearchPacket['primaryDomain']): LegalSearchPacket['preferredSource'] => {
    if (!primaryDomain) return 'auto';
    if (primaryDomain === 'idare' || primaryDomain === 'vergi' || primaryDomain === 'rekabet' || primaryDomain === 'cevre') return 'danistay';
    if (primaryDomain === 'anayasa') return 'auto';
    return 'yargitay';
};

const resolvePrimaryDomain = (
    raw: string | undefined,
    fallbackText = ''
): LegalSearchPacket['primaryDomain'] => {
    if (!raw) return inferPacketPrimaryDomain(fallbackText);
    const key = raw.toLocaleLowerCase('tr-TR').replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
    if (LEGAL_SEARCH_PACKET_DOMAINS.has(key as NonNullable<LegalSearchPacket['primaryDomain']>)) {
        return key as NonNullable<LegalSearchPacket['primaryDomain']>;
    }
    if (DOMAIN_ALIAS_MAP[key]) return DOMAIN_ALIAS_MAP[key];
    return inferPacketPrimaryDomain(fallbackText) ?? inferPacketPrimaryDomain(raw) ?? undefined;
};

const extractEvidenceConceptsFromText = (text: string): string[] => {
    const candidates: string[] = [];
    const addIf = (regex: RegExp, value: string) => {
        if (regex.test(text)) candidates.push(value);
    };

    addIf(/tanik|tanık/i, 'tanik beyani');
    addIf(/bilirkişi|bilirkisi/i, 'bilirkisi raporu');
    addIf(/kamera|goruntu|görüntü/i, 'kamera goruntusu');
    addIf(/fiziki takip/i, 'fiziki takip');
    addIf(/sozlesme|sözleşme/i, 'sozlesme metni');
    addIf(/fatura/i, 'fatura');
    addIf(/banka kaydi|banka kaydı|hesap hareketi|hesap ekstresi/i, 'banka hesap kaydi');
    addIf(/whatsapp|mesaj|sms/i, 'mesaj kaydi');
    addIf(/gsm kaydi|gsm kaydı|hts kaydi|hts kaydı|telefon kaydi|telefon kaydı|arama kaydi|arama kaydı/i, 'gsm ve hts kaydi');
    addIf(/bordro|puantaj|ucret bordro|ücret bordro/i, 'bordro ve puantaj kaydi');
    addIf(/ekspertiz|eksper raporu|hasar raporu/i, 'ekspertiz raporu');
    addIf(/tapu kaydi|tapu kaydı|tapu belgesi/i, 'tapu kaydi');
    addIf(/noter|noterlik|noter onay/i, 'noter belgesi');
    addIf(/tutanak/i, 'resmi tutanak');
    addIf(/veraset|veraset ilamı/i, 'veraset ilami');
    addIf(/adli tip|adli tıp|otopsi|dna/i, 'adli tip raporu');
    addIf(/kira sozlesmesi|kira sözleşmesi/i, 'kira sozlesmesi');
    addIf(/isveren kayitlari|işveren kayıtları|sgk kaydi|sgk kaydı/i, 'sgk ve isveren kaydi');
    addIf(/keşif|kesif|keşif tutanagi/i, 'kesif tutanagi');
    addIf(/ihtar|ihtarname/i, 'ihtarname');
    addIf(/makbuz|dekont|odeme belgesi|ödeme belgesi/i, 'odeme belgesi');
    addIf(/sigorta police|sigorta poliçe/i, 'sigorta policesi');
    addIf(/ticaret sicil|sicil belgesi/i, 'ticaret sicil belgesi');

    return dedupeKeywords(candidates).slice(0, 6);
};

const extractCriticalLegalSearchConcepts = (text: string): {
    requiredConcepts: string[];
    supportConcepts: string[];
} => {
    const normalized = String(text || '').toLocaleLowerCase('tr-TR');
    const requiredConcepts: string[] = [];
    const supportConcepts: string[] = [];
    const genericConcepts = extractGenericLegalConcepts(text);
    const addRequired = (regex: RegExp, value: string) => {
        if (regex.test(normalized)) requiredConcepts.push(value);
    };
    const addSupport = (regex: RegExp, value: string) => {
        if (regex.test(normalized)) supportConcepts.push(value);
    };

    const hasImarYikimContext =
        /(yikim karari|yıkım kararı|yapi tatil tutanagi|yapı tatil tutanağı|yapi tespit tutanagi|yapı tespit tutanağı|imar mevzuati|imar mevzuatı|ruhsatsiz yapi|ruhsatsız yapı|belediye encumeni|belediye encümeni|3194|orantililik ilkesi|orantılılık ilkesi)/i.test(normalized);

    const hasDrugTradeUseContrast =
        /(uyusturucu|uyuşturucu)/i.test(normalized)
        && /(ticareti|ticareti sucu|satıcılığı|saticiligi)/i.test(normalized)
        && /(kullanmak|kullanım|kullanim)/i.test(normalized);

    if (hasImarYikimContext) {
        addRequired(/yikim karari|yıkım kararı/i, 'yikim karari');
        addRequired(/yapi tatil tutanagi|yapı tatil tutanağı/i, 'yapi tatil tutanagi');
        addRequired(/yapi tespit tutanagi|yapı tespit tutanağı/i, 'yapi tespit tutanagi');
        addRequired(/imar mevzuati|imar mevzuatı|3194/i, '3194 sayili Imar Kanunu');
        addRequired(/orantililik ilkesi|orantılılık ilkesi/i, 'orantililik ilkesi');
        addRequired(/aykiriliklarin niteligi|aykırılıkların niteliği|aykiriligin niteligi|aykırılığın niteliği|kapsami|kapsamı/i, 'aykiriligin niteligi ve kapsami');
        addSupport(/idari islem|idari işlem/i, 'idari islem');
        addSupport(/hukuka uygun/i, 'hukuka uygunluk denetimi');
        addSupport(/ruhsatsiz yapi|ruhsatsız yapı|tadilat|eklenti/i, 'ruhsatsiz yapi ve tadilat');
        addSupport(/belediye encumeni|belediye encümeni/i, 'belediye encumeni karari');
    }

    if (hasDrugTradeUseContrast) {
        requiredConcepts.push('uyuşturucu ticareti');
        requiredConcepts.push('kullanmak icin bulundurma');
        supportConcepts.push('uyuşturucu ticareti kullanmak ayrimi');
    }

    addSupport(/hassas terazi/i, 'hassas terazi');
    addSupport(/nakit para/i, 'nakit para');
    addSupport(/ticari amaca delalet etmez|delalet etmedigi|delalet etmediği/i, 'ticari amaca delalet etmez');

    // İş hukuku
    const hasIsHukuku = /(ise iade|işe iade|kidem|kıdem|ihbar|fazla mesai|isci|işçi|isveren|işveren|is sozlesmesi|iş sözleşmesi)/i.test(normalized);
    if (hasIsHukuku) {
        addRequired(/ise iade|işe iade/i, 'ise iade');
        addRequired(/kidem tazminat|kıdem tazminat/i, 'kidem tazminati');
        addRequired(/ihbar tazminat/i, 'ihbar tazminati');
        addRequired(/haksiz fesih|haksız fesih|gecersiz fesih|geçersiz fesih/i, 'haksiz fesih');
        addRequired(/fazla mesai|fazla çalışma/i, 'fazla mesai ucreti');
        addRequired(/mobbing/i, 'mobbing ve kisilik haklari ihlali');
        addSupport(/askerlik|muvazzaf askerlik/i, 'askerlik nedeniyle fesih');
        addSupport(/istifa|baskiyla istifa|zorunlu istifa/i, 'istifanin gecersizligi');
        addSupport(/is kazasi|iş kazası/i, 'is kazasi tazminati');
        addSupport(/yillik izin|yıllık izin/i, 'yillik ucretli izin alacagi');
        addSupport(/ihracat|asgari gecim|agi/i, 'asgari gecim indirimi');
    }

    // Aile hukuku
    const hasAileHukuku = /(bosanma|boşanma|nafaka|velayet|mal rejimi|ziynet|katilma alacagi|katılma alacağı)/i.test(normalized);
    if (hasAileHukuku) {
        addRequired(/bosanma|boşanma/i, 'bosanma davasi');
        addRequired(/nafaka artirim|nafaka artırım|nafaka artisi|nafaka artışı/i, 'nafaka artirimi');
        addRequired(/nafaka indirim/i, 'nafaka indirimi');
        addRequired(/velayet/i, 'velayet davasi');
        addRequired(/mal rejimi|edinilmis mallar|edinilmiş mallar/i, 'mal rejiminin tasfiyesi');
        addRequired(/katilma alacagi|katılma alacağı/i, 'katilma alacagi');
        addRequired(/ziynet|ceyiz|çeyiz/i, 'ziynet esyasi ve ceyiz');
        addSupport(/muvazaali devir|muvazaalı devir/i, 'mal kacirma ve muvazaa');
        addSupport(/aile konutu/i, 'aile konutu serhi');
        addSupport(/sadakatsizlik|aldatma/i, 'evlilik birliginin sarsilmasi');
        addSupport(/kisisel mal|kişisel mal/i, 'kisisel mallar ve ispat yuku');
    }

    // Ticaret hukuku
    const hasTicaretHukuku = /(anonim|limited|limited sirket|ticari defter|genel kurul|ortaklik paylarim|konkordato|iflas|borca batik|kambiyo|çek|bono|senet|poliçe)/i.test(normalized);
    if (hasTicaretHukuku) {
        addRequired(/genel kurul karari|genel kurul kararı/i, 'genel kurul karari iptali');
        addRequired(/pay devri|hisse devri/i, 'pay devri ve ortaklik sozlesmesi');
        addRequired(/konkordato/i, 'konkordato ve borca batiklik');
        addRequired(/iflas/i, 'iflas ve alacaklilar');
        addRequired(/kambiyo senedi|çek|bono|senet|poliçe/i, 'kambiyo senedi');
        addRequired(/haksiz rekabet|haksız rekabet/i, 'haksiz rekabet');
        addRequired(/ticari defter|defterlerin ibraz/i, 'ticari defterlerin ibrazı');
        addSupport(/ciranta|ciro/i, 'ciro ve ciranta sorumlulugu');
        addSupport(/murahhas|yonetim kurulu|yönetim kurulu/i, 'yonetim kurulu sorumlulugu');
    }

    // Gayrimenkul
    const hasGayrimenkul = /(tapu|tescil|ecrimisil|kat mulkiyeti|kat mülkiyeti|onalim|ön alım|muris muvazaasi|arsa payi|satiş vaadi)/i.test(normalized);
    if (hasGayrimenkul) {
        addRequired(/tapu iptal|tapu iptali/i, 'tapu iptali ve tescil');
        addRequired(/muris muvazaasi|muris muvazaası/i, 'muris muvazaasi');
        addRequired(/ecrimisil/i, 'ecrimisil tazminati');
        addRequired(/kat mulkiyeti|kat mülkiyeti/i, 'kat mulkiyeti kanunu');
        addRequired(/onalim|ön alım/i, 'onalim hakki');
        addRequired(/ortakligin giderilmesi|ortaklığın giderilmesi/i, 'ortakligin giderilmesi davasi');
        addRequired(/satiş vaadi|satış vaadi|satis vaadi/i, 'tasinmaz satis vaadi sozlesmesi');
        addSupport(/arsa payi sozlesmesi|arsa payı sözleşmesi/i, 'arsa payi karsiligi insaat sozlesmesi');
        addSupport(/intifa hakki|intifa hakkı/i, 'intifa hakki');
        addSupport(/kira tespiti|kira uyarlama/i, 'kira bedeli tespiti');
    }

    // Sigorta hukuku
    const hasSigorta = /(sigorta|kasko|trafik sigortasi|riziko|hasar|deger kaybi|değer kaybı|eksper|poliçe)/i.test(normalized);
    if (hasSigorta) {
        addRequired(/kasko/i, 'kasko sigorta sozlesmesi');
        addRequired(/trafik sigortasi|trafik sigortası|zorunlu mali sorumluluk/i, 'zorunlu trafik sigortasi');
        addRequired(/deger kaybi|değer kaybı/i, 'arac deger kaybi tazminati');
        addRequired(/hasar tazminat/i, 'hasar tazminati');
        addSupport(/munhasiran illiyet|munhasir|sigorta kapsaminda/i, 'munhasir illiyet bagli');
        addSupport(/eksper|ekspertiz/i, 'eksper raporu ve deger tespiti');
        addSupport(/riziko|risk gerceklesmesi/i, 'riziko ve sigorta alacagi');
        addSupport(/kusur orani|kusur oranı/i, 'kusur orani tespiti');
    }

    // Miras hukuku
    const hasMirasHukuku = /(miras|tereke|tenkis|vasiyet|sakli pay|saklı pay|veraset|muris|mirasci)/i.test(normalized);
    if (hasMirasHukuku) {
        addRequired(/tenkis/i, 'tenkis davasi');
        addRequired(/sakli pay|saklı pay/i, 'sakli pay ihlali');
        addRequired(/vasiyetname|vasiyet/i, 'vasiyetnamenin iptali');
        addRequired(/mirasin reddi|mirasın reddi/i, 'mirasin reddi');
        addRequired(/terekenin taksimi/i, 'terekenin taksimi davasi');
        addSupport(/muris muvazaasi|muris muvazaası/i, 'muris muvazaasi ve miras');
        addSupport(/fiil ehliyetsizligi|ehliyetsizlik/i, 'vasiyetci fiil ehliyetsizligi');
        addSupport(/mirasci tespiti/i, 'mirasci tespiti ve veraset ilami');
    }

    // İcra hukuku
    const hasIcraHukuku = /(icra|haciz|itirazin iptali|itirazın iptali|menfi tespit|odeme emri|ödeme emri|kambiyo|istirdat)/i.test(normalized);
    if (hasIcraHukuku) {
        addRequired(/itirazin iptali|itirazın iptali/i, 'itirazin iptali davasi');
        addRequired(/menfi tespit/i, 'menfi tespit davasi');
        addRequired(/istirdat/i, 'istirdat davasi');
        addRequired(/odeme emrine itiraz|ödeme emrine itiraz/i, 'odeme emrine itiraz');
        addSupport(/borca batik|borca batık/i, 'borcun yoklugu veya sona ermesi');
        addSupport(/zamanaşımı|zaman asimi/i, 'borcun zamanasimiyla ortadan kalkmasi');
        addSupport(/imza itirazı|imza itiraz/i, 'imzaya itiraz ve ispat yuku');
    }

    // Tüketici hukuku
    const hasTuketici = /(ayipli|ayıplı|tuketici|tüketici|cayma hakki|cayma hakkı|garanti|paket tur|tatil)/i.test(normalized);
    if (hasTuketici) {
        addRequired(/ayipli mal|ayıplı mal/i, 'ayipli mal tazminati');
        addRequired(/ayipli hizmet|ayıplı hizmet/i, 'ayipli hizmet tazminati');
        addRequired(/cayma hakki|cayma hakkı/i, 'cayma hakki ve iade');
        addRequired(/paket tur|tatil sozlesmesi/i, 'paket tur sozlesmesi ihlali');
        addSupport(/garanti|garanti suresi/i, 'garanti kapsaminda ayip');
        addSupport(/tüketici hakem heyeti|tuketici hakem heyeti/i, 'tuketici hakem heyeti karari');
        addSupport(/sozlesmeden donme|sözleşmeden dönme/i, 'sozlesmeden donme ve iade');
    }

    // Vergi hukuku
    const hasVergiHukuku = /(vergi|tarhiyat|kdv|sahte fatura|vergi ziyai|naylon fatura|vuk|stopaj|transfer fiyatlandirma)/i.test(normalized);
    if (hasVergiHukuku) {
        addRequired(/tarhiyat/i, 'vergi tarhiyati ve cezasi');
        addRequired(/sahte fatura|naylon fatura/i, 'sahte fatura ve vergi ziyai cezasi');
        addRequired(/vergi ziyai|vergi ziyaı/i, 'vergi ziyai cezasi');
        addRequired(/kdv|katma deger vergisi|katma değer vergisi/i, 'kdv tarhiyati');
        addSupport(/vuk 359|kaçakçılık sucu|kacakcilik sucu/i, 'vuk 359 vergi kacakciligi');
        addSupport(/transfer fiyatlandirma|transfer fiyatlandırma/i, 'transfer fiyatlandirmasi ve ortulu kazanc');
        addSupport(/uzlasma|uzlaşma/i, 'vergi uzlasmasi');
    }

    // İdare hukuku (non-imar)
    const hasIdareHukuku = !hasImarYikimContext && /(idari islem|idari işlem|iptal davasi|iptal davası|tam yargi|tam yargı|disiplin|memuriyet|devlet memur|kamu gozevli|kamu görevli|yurutmenin durdurulmasi|yürütmenin durdurulması)/i.test(normalized);
    if (hasIdareHukuku) {
        addRequired(/iptal davasi|iptal davası/i, 'idari islemin iptali davasi');
        addRequired(/tam yargi|tam yargı/i, 'tam yargi davasi ve hizmet kusuru');
        addRequired(/disiplin cezasi|disiplin cezası/i, 'disiplin cezasinin iptali');
        addRequired(/yurutmenin durdurulmasi|yürütmenin durdurulması/i, 'yurutmenin durdurulmasi talebi');
        addSupport(/yetki asimi|yetki aşımı/i, 'yetki asimi ve sekil unsuru');
        addSupport(/hizmet kusuru/i, 'idarenin hizmet kusuru');
        addSupport(/orantililik|ölçülülük/i, 'orantililik ilkesi ve idari islem');
    }

    // Borçlar hukuku (genel)
    const hasBorclarHukuku = /(sozlesme|sözleşme|tazminat|haksiz fiil|haksız fiil|temerrut|temerrüt|vekalet|yuklenici|yüklenici|eser sozlesmesi|sebepsiz zenginlesme)/i.test(normalized);
    if (hasBorclarHukuku && !hasIsHukuku && !hasAileHukuku && !hasGayrimenkul && !hasTuketici) {
        addRequired(/haksiz fiil|haksız fiil/i, 'haksiz fiil ve sorumluluk');
        addRequired(/sebepsiz zenginlesme|sebepsiz zenginleşme/i, 'sebepsiz zenginlesme davasi');
        addRequired(/temerrut|temerrüt/i, 'borcun ifahindaki temerrut');
        addRequired(/vekalet|vekilin sorumlulugu|vekilin sorumluluğu/i, 'vekalet sozlesmesi ve vekil sorumlulugu');
        addRequired(/eser sozlesmesi|eser sözleşmesi|yuklenici|yüklenici/i, 'eser sozlesmesi ve ayip');
        addRequired(/asiri ifa guclugu|aşırı ifa güçlüğü|emprevizyon/i, 'asiri ifa guclugu ve uyarlama');
        addSupport(/ibra|ibra belgesi/i, 'ibra ve borcu sona erdiren nedenler');
        addSupport(/manevi tazminat/i, 'manevi tazminat hesabi');
    }

    // Fikri Mülkiyet
    const hasFikriMulkiyet = /(marka|patent|tasarım|tasarim|telif|eser|fsek|smk|fikri hak|sinai hak|6769|5846)/i.test(normalized);
    if (hasFikriMulkiyet) {
        addRequired(/marka tescil|marka ihlali/i, 'marka tescili ve ihlali');
        addRequired(/patent|faydalı model|faydalı model/i, 'patent ihlali ve tecavuz');
        addRequired(/telif|eser sahipliği|eser sahibi/i, 'telif hakki ihlali');
        addRequired(/tasarım tescil|tasarim tescil/i, 'endustriyel tasarim korumasi');
        addSupport(/lisans sozlesmesi|lisans sözleşmesi/i, 'lisans sozlesmesi ve royalti');
        addSupport(/tecavuzun onlenmesi|tecavüzün önlenmesi/i, 'tecavuzun men ve tazminat');
        addSupport(/taklit|korsan/i, 'taklit urun ve korsan yazilim');
    }

    // Bilişim Hukuku
    const hasBilisim = /(bilişim|bilisim|siber|yetkisiz erişim|veri ihlali|tck 243|tck 244|tck 245|sosyal medya suç|elektronik dolandırıcılık)/i.test(normalized);
    if (hasBilisim) {
        addRequired(/yetkisiz erişim|yetkisiz erisim|tck 243/i, 'bilisim sistemine yetkisiz erisim');
        addRequired(/veri ihlali|kisisel veri|kişisel veri/i, 'kisisel verilerin ihlali kvkk');
        addRequired(/siber dolandırıcılık|elektronik dolandırıcılık|siber dolandiricilik/i, 'siber dolandiricilik');
        addSupport(/dijital delil|elektronik delil/i, 'dijital delil ve log kaydi');
        addSupport(/sosyal medya|internet yayini/i, 'sosyal medya ve internet yayini');
    }

    // Deniz Hukuku
    const hasDeniz = /(gemi|denizcilik|liman|navlun|konşimento|deniz kazası|deniz kazasi|kaptan|donatan)/i.test(normalized);
    if (hasDeniz) {
        addRequired(/gemi alacaklisi|gemi alacaklısı/i, 'gemi alacaklisi ve ipotek');
        addRequired(/navlun sozlesmesi|navlun sözleşmesi|konşimento/i, 'navlun sozlesmesi ve konsimento');
        addRequired(/deniz kazası|deniz kazasi|çatma|çarpışma/i, 'deniz kazasi ve kusur tespiti');
        addSupport(/gemi tutma|sefine tutma/i, 'gemi tutma ve ihtiyati haciz');
        addSupport(/donatan sorumlulugu|donatan sorumluluğu/i, 'donatan ve isletici sorumlulugu');
    }

    // Kamulaştırma
    const hasKamulastirma = /(kamulaştırma|kamulastirma|2942|kentsel dönüşüm|kentsel donusum|bedel tespiti ve tescil)/i.test(normalized);
    if (hasKamulastirma) {
        addRequired(/bedel tespiti|bedel tesbiti/i, 'kamulaştirma bedel tespiti ve tescil');
        addRequired(/acele kamulaştırma|acele kamulastirma/i, 'acele kamulastirma karari');
        addRequired(/kentsel dönüşüm|kentsel donusum/i, 'kentsel donusum ve riskli alan');
        addSupport(/deger artis payi|değer artış payı/i, 'deger artis payi kesintisi');
        addSupport(/2942|kamulaştırmasız|kamulastirmasiz/i, 'kamulastirmasiz el atma tazminati');
    }

    // Rekabet Hukuku
    const hasRekabet = /(rekabet kurumu|rkhk|4054|kartel|tekelleşme|hakim durum|hâkim durum|piyasa gücü)/i.test(normalized);
    if (hasRekabet) {
        addRequired(/kartel|fiyat tespiti/i, 'kartel ve fiyat tespiti ihlali');
        addRequired(/hakim durum|hâkim durum|piyasa gücü/i, 'hakim durumun kotüye kullanimi');
        addRequired(/birleşme devralma|birleşme izni/i, 'birlesme ve devralma izni');
        addSupport(/rkhk 4|rkhk 6/i, 'rkhk madde 4 ve 6 ihlali');
        addSupport(/rekabet kurulu kararı|rekabet kurulu karari/i, 'rekabet kurulu kararina itiraz');
    }

    // Çevre ve İmar Hukuku
    const hasCevre = /(çevre kirliliği|cevre kirliligi|çed raporu|ced raporu|2872|orman kanunu|6831|imar planı|imar plani|nazim imar|çevre cezası)/i.test(normalized);
    if (hasCevre) {
        addRequired(/çed raporu|ced raporu|çevresel etki/i, 'çed raporu ve çevresel etki degerlendirmesi');
        addRequired(/imar planı|imar plani|nazim imar/i, 'imar plani iptali');
        addRequired(/çevre kirliliği|cevre kirliligi/i, 'cevre kirliligi ve tazminat');
        addSupport(/2872|cevre kanunu/i, 'cevre kanunu idari para cezasi');
        addSupport(/6831|orman|orman vasfı/i, 'orman kadastrosu ve orman vasfi');
    }

    // Bankacılık ve Finans Hukuku
    const hasBankacilik = /(banka|bddk|5411|kredi sözleşmesi|kredi sozlesmesi|konut kredisi|kredi kartı|kredi karti|leasing|menkul kıymet|spk|borsa istanbul)/i.test(normalized);
    if (hasBankacilik) {
        addRequired(/kredi sozlesmesi|kredi sözleşmesi/i, 'kredi sozlesmesi ve faiz');
        addRequired(/kredi karti|kredi kartı|kart borcu/i, 'kredi karti sozlesmesi ve limit');
        addRequired(/finansal kiralama|leasing/i, 'finansal kiralama sozlesmesi');
        addRequired(/menkul kıymet|menkul kiymet|sermaye piyasası/i, 'sermaye piyasasi araclari');
        addSupport(/bddk|5411/i, 'bddk denetimi ve bankacilik kanunu');
        addSupport(/spk|borsa istanbul/i, 'spk mevzuati ve borsa islemleri');
    }

    // Kadastro Hukuku
    const hasKadastro = /(kadastro|3402|tapulama|mera|orman sınırı|orman siniri|2B arazi|hazine taşınmazı|hazine tasinmazi)/i.test(normalized);
    if (hasKadastro) {
        addRequired(/kadastro tespiti|kadastro tesbiti/i, 'kadastro tespitine itiraz');
        addRequired(/tapulama|tapu tescil/i, 'tapulama ve tapu tescil');
        addRequired(/2B arazi|hazine taşınmazı|hazine tasinmazi/i, '2b arazi ve hazine tasinmazı');
        addSupport(/mera|mera tahsis/i, 'mera ve tahsis karari');
        addSupport(/sınırlandırma|sinirlandirma|3402/i, 'sinirlandirma ve orman kadastrosu');
    }

    // Çocuk Hukuku
    const hasCocuk = /(çocuk mahkeme|cocuk mahkeme|18 yaş|18 yas|suça sürüklenen|suça surüklenen|5395|çkk)/i.test(normalized);
    if (hasCocuk) {
        addRequired(/suça sürüklenen|suça surüklenen/i, 'suca suruklenen cocuk yargilamasi');
        addRequired(/koruyucu ve destekleyici tedbir/i, 'koruyucu ve destekleyici tedbirler');
        addRequired(/uzlastirma|uzlaştırma/i, 'cocuk uzlastirma proseduru');
        addSupport(/5395|çkk/i, 'cocuk koruma kanunu uygulamasi');
        addSupport(/sosyal inceleme raporu/i, 'sosyal inceleme raporu ve uzman gorusu');
    }

    // Sağlık Hukuku
    const hasSaglik = /(malpraktis|tıbbi müdahale|tibbi mudahale|hekim hatası|hekim hatasi|tıbbi ihmal|tibbi ihmal|hasta hakları|hasta haklari|hastane sorumluluğu)/i.test(normalized);
    if (hasSaglik) {
        addRequired(/malpraktis|hekim hatası|hekim hatasi/i, 'tibbi malpraktis ve hekim sorumlulugu');
        addRequired(/tıbbi ihmal|tibbi ihmal|tanı hatası|tani hatasi/i, 'tani ve tedavi hatasi');
        addRequired(/aydınlatılmış rıza|aydinlatilmis riza/i, 'aydinlatilmis riza ve bilgilendirme yukumlulugu');
        addSupport(/adli tıp|adli tip|bilirkisi raporu/i, 'adli tip ve uzman bilirkisi raporu');
        addSupport(/hastane sorumluluğu|hastane sorumlulugu/i, 'hastane istihdam eden sorumlulugu');
    }

    // İnfaz Hukuku
    const hasInfaz = /(infaz hakimi|infaz hâkimi|ceza infaz|cgtihk|koşullu salıverilme|kosullu saliverme|denetimli serbestlik|hükümlü|hukumlu|cezaevi)/i.test(normalized);
    if (hasInfaz) {
        addRequired(/koşullu salıverilme|kosullu saliverme/i, 'kosullu saliverme ve infaz hesabi');
        addRequired(/denetimli serbestlik/i, 'denetimli serbestlik uygulamasi');
        addRequired(/infaz indirimi|infaz hesabi/i, 'infaz hesabi ve indirim oranlari');
        addSupport(/cgtihk|infaz kanunu/i, 'ceza ve guvenlik tedbirlerinin infazi kanunu');
        addSupport(/tutukluluk suresi|tutukluluk süresi/i, 'tutukluluk suresinin mahsubı');
    }

    // İş Sağlığı ve Güvenliği
    const hasIsGuvenligi = /(iş sağlığı|is sagligi|iş güvenliği|is guvenligi|meslek hastalığı|meslek hastaligi|6331|is kazasi tazminat|iş kazası tazminat)/i.test(normalized);
    if (hasIsGuvenligi) {
        addRequired(/is kazasi|iş kazası/i, 'is kazasi tazminat davasi');
        addRequired(/meslek hastalığı|meslek hastaligi/i, 'meslek hastaligi ve tazminat');
        addRequired(/6331|isg kanunu/i, 'is sagligi ve guvenligi kanunu ihlali');
        addSupport(/kisisel koruyucu|işyeri tehlike/i, 'kisisel koruyucu donanimlar ve isveren yukumu');
        addSupport(/kusur orani|kusur oranı/i, 'kusur orani tespiti ve tazminat hesabi');
    }

    // Tahkim
    const hasTahkim = /(tahkim|hakem|istac|mtk|4686|milletlerarası tahkim|hakem kararının tenfizi)/i.test(normalized);
    if (hasTahkim) {
        addRequired(/tahkim sozlesmesi|tahkim sözleşmesi/i, 'tahkim sozlesmesi ve tahkim sarти');
        addRequired(/hakem kararı|hakem karari/i, 'hakem karari ve tenfiz talebi');
        addRequired(/milletlerarası tahkim|milletlerarasi tahkim|4686/i, 'milletlerarasi tahkim kanunu');
        addSupport(/new york sozlesmesi|new york sözleşmesi/i, 'new york sozlesmesi ve yabanci hakem karari tenfizi');
        addSupport(/tahkim yeri|tahkim usulu/i, 'tahkim yeri ve uygulanacak hukuk');
    }

    return {
        requiredConcepts: dedupeKeywords([
            ...requiredConcepts,
            ...genericConcepts.requiredConcepts,
        ]).slice(0, 8),
        supportConcepts: dedupeKeywords([
            ...supportConcepts,
            ...genericConcepts.supportConcepts,
        ]).slice(0, 8),
    };
};

const buildFallbackLegalSearchPacket = (text: string, caseTitle = ''): LegalSearchPacket | undefined => {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return undefined;

    const fallbackKeywords = extractKeywordFallbackFromAnalysis(normalizedText).slice(0, 10);
    const criticalConcepts = extractCriticalLegalSearchConcepts(normalizedText);
    const requiredConcepts = dedupeKeywords([
        ...criticalConcepts.requiredConcepts,
        ...fallbackKeywords.slice(0, 4),
    ]).slice(0, 6);
    const supportConcepts = dedupeKeywords([
        ...criticalConcepts.supportConcepts,
        ...fallbackKeywords.slice(4, 8),
    ]).slice(0, 6);
    const primaryDomain = inferPacketPrimaryDomain(normalizedText);
    const caseType = normalizePacketText(caseTitle || requiredConcepts[0] || normalizedText, 140);
    const coreIssue = normalizePacketText(normalizedText.split(/[.!?]/)[0] || normalizedText, 220);
    const evidenceConcepts = extractEvidenceConceptsFromText(normalizedText);
    const searchSeedText = normalizePacketText(
        [caseType, coreIssue, ...requiredConcepts.slice(0, 3)].filter(Boolean).join(' '),
        260
    );
    const searchVariants = buildSearchVariantsFromPacket({
        caseType,
        coreIssue,
        requiredConcepts,
        supportConcepts,
        searchSeedText,
    });

    return {
        primaryDomain,
        caseType,
        coreIssue,
        requiredConcepts,
        supportConcepts,
        evidenceConcepts,
        negativeConcepts: [],
        preferredSource: inferPacketPreferredSource(primaryDomain),
        preferredBirimCodes: [],
        searchSeedText,
        searchVariants,
        fallbackToNext: true,
        queryMode: inferPacketQueryMode(normalizedText),
    };
};

const normalizeLegalSearchPacket = (
    value: unknown,
    fallbackText = '',
    caseTitle = ''
): LegalSearchPacket | undefined => {
    const fallbackPacket = buildFallbackLegalSearchPacket(fallbackText, caseTitle);
    if (!value || typeof value !== 'object') return fallbackPacket;

    const packet = value as Record<string, unknown>;
    const primaryDomainCandidate = normalizePacketText(packet.primaryDomain, 40) as LegalSearchPacket['primaryDomain'];
    const preferredSourceCandidate = normalizePacketText(packet.preferredSource, 20) as LegalSearchPacket['preferredSource'];
    const queryModeCandidate = normalizePacketText(packet.queryMode, 40) as LegalSearchPacket['queryMode'];
    const criticalConcepts = extractCriticalLegalSearchConcepts(fallbackText);
    const requiredConcepts = dedupeKeywords([
        ...criticalConcepts.requiredConcepts,
        ...normalizePacketList(packet.requiredConcepts, 8),
    ]).slice(0, 8);
    const supportConcepts = dedupeKeywords([
        ...criticalConcepts.supportConcepts,
        ...normalizePacketList(packet.supportConcepts, 8),
    ]).slice(0, 8);
    const evidenceConcepts = normalizePacketList(packet.evidenceConcepts, 6);
    const negativeConcepts = normalizePacketList(packet.negativeConcepts, 6);
    const preferredBirimCodes = normalizePacketCodeList(packet.preferredBirimCodes, 6);
    const searchVariants = normalizeSearchVariants(packet.searchVariants, 4);
    const backfillText = [fallbackText, ...requiredConcepts, ...supportConcepts].filter(Boolean).join(' ');

    const normalizedPacket: LegalSearchPacket = {
        primaryDomain: resolvePrimaryDomain(primaryDomainCandidate, backfillText),
        caseType: normalizePacketText(packet.caseType, 160),
        coreIssue: normalizePacketText(packet.coreIssue, 220),
        requiredConcepts,
        supportConcepts,
        evidenceConcepts,
        negativeConcepts,
        preferredSource: LEGAL_SEARCH_PACKET_SOURCES.has(preferredSourceCandidate || 'auto')
            ? preferredSourceCandidate
            : inferPacketPreferredSource(primaryDomainCandidate),
        preferredBirimCodes,
        searchSeedText: normalizePacketText(packet.searchSeedText, 260),
        searchVariants,
        fallbackToNext: packet.fallbackToNext !== false,
        queryMode: queryModeCandidate && ['short_issue', 'long_fact', 'document_style'].includes(queryModeCandidate as string)
            ? queryModeCandidate as 'short_issue' | 'long_fact' | 'document_style'
            : inferPacketQueryMode(backfillText),
    };

    if (!normalizedPacket.caseType) {
        normalizedPacket.caseType = normalizePacketText(caseTitle || requiredConcepts[0] || fallbackPacket?.caseType || '', 160);
    }
    if (!normalizedPacket.coreIssue) {
        normalizedPacket.coreIssue = normalizePacketText(fallbackPacket?.coreIssue || fallbackText, 220);
    }
    if (!normalizedPacket.searchSeedText) {
        normalizedPacket.searchSeedText = normalizePacketText(
            [
                normalizedPacket.caseType,
                normalizedPacket.coreIssue,
                ...requiredConcepts.slice(0, 3),
                ...supportConcepts.slice(0, 2),
            ].filter(Boolean).join(' '),
            260
        );
    }
    if (!normalizedPacket.searchVariants?.length) {
        normalizedPacket.searchVariants = buildSearchVariantsFromPacket({
            caseType: normalizedPacket.caseType,
            coreIssue: normalizedPacket.coreIssue,
            requiredConcepts,
            supportConcepts,
            searchSeedText: normalizedPacket.searchSeedText,
        });
    }
    if (!normalizedPacket.requiredConcepts?.length && fallbackPacket?.requiredConcepts?.length) {
        normalizedPacket.requiredConcepts = fallbackPacket.requiredConcepts;
    }
    if (!normalizedPacket.supportConcepts?.length && fallbackPacket?.supportConcepts?.length) {
        normalizedPacket.supportConcepts = fallbackPacket.supportConcepts;
    }
    if (!normalizedPacket.evidenceConcepts?.length && fallbackPacket?.evidenceConcepts?.length) {
        normalizedPacket.evidenceConcepts = fallbackPacket.evidenceConcepts;
    }
    if (!normalizedPacket.preferredSource) {
        normalizedPacket.preferredSource = fallbackPacket?.preferredSource || 'auto';
    }
    if ((!normalizedPacket.preferredBirimCodes || normalizedPacket.preferredBirimCodes.length === 0) && fallbackPacket?.preferredBirimCodes?.length) {
        normalizedPacket.preferredBirimCodes = fallbackPacket.preferredBirimCodes;
    }
    if ((!normalizedPacket.searchVariants || normalizedPacket.searchVariants.length === 0) && fallbackPacket?.searchVariants?.length) {
        normalizedPacket.searchVariants = fallbackPacket.searchVariants;
    }

    const hasAnySignal = Boolean(
        normalizedPacket.searchSeedText
        || normalizedPacket.searchVariants?.length
        || normalizedPacket.coreIssue
        || normalizedPacket.caseType
        || normalizedPacket.requiredConcepts?.length
        || normalizedPacket.supportConcepts?.length
    );

    return hasAnySignal ? normalizedPacket : fallbackPacket;
};

const normalizeInsightList = (values: unknown, limit = 8): string[] | undefined => {
    const normalized = normalizePacketList(values, limit);
    return normalized.length > 0 ? normalized : undefined;
};

const normalizeInsightDomainList = (values: unknown, limit = 4): string[] | undefined => {
    if (!Array.isArray(values)) return undefined;

    const normalized = Array.from(new Set(
        values
            .map((item) => normalizePacketText(item, 40))
            .filter((item): item is string => Boolean(item))
    )).slice(0, limit);

    return normalized.length > 0 ? normalized : undefined;
};

const inferDocumentType = (text: string): string => {
    const normalized = String(text || '').toLocaleLowerCase('tr-TR');
    if (/iddianame/.test(normalized)) return 'iddianame';
    if (/karar|hukum|hüküm|gerekceli karar|gerekçeli karar/.test(normalized)) return 'mahkeme karari';
    if (/sozlesme|sözleşme|protokol|taahhutname|taahhütname/.test(normalized)) return 'sozlesme';
    if (/ihtarname|ihtar/.test(normalized)) return 'ihtarname';
    if (/bilirkişi|bilirkisi/.test(normalized)) return 'bilirkisi raporu';
    if (/tapu/.test(normalized)) return 'tapu kaydi';
    if (/tutanak/.test(normalized)) return 'tutanak';
    return 'hukuki belge';
};

const inferCaseStage = (text: string): string => {
    const normalized = String(text || '').toLocaleLowerCase('tr-TR');
    if (/temyiz|yargitay|yargıtay|ceza genel kurulu|hukuk genel kurulu/.test(normalized)) return 'temyiz';
    if (/istinaf|bolge adliye|bölge adliye/.test(normalized)) return 'istinaf';
    if (/icra|odeme emri|ödeme emri|haciz/.test(normalized)) return 'icra';
    if (/idari basvuru|idari başvuru|itiraz komisyonu/.test(normalized)) return 'idari basvuru';
    if (/dava|mahkeme|cumhuriyet bassavciligi|cumhuriyet başsavcılığı/.test(normalized)) return 'ilk derece';
    return 'dava oncesi';
};

const buildLegalSearchPacketFromInsights = (
    insights?: DetailedAnalysis,
    fallbackText = '',
    caseTitle = ''
): LegalSearchPacket | undefined => {
    if (!insights) {
        return buildFallbackLegalSearchPacket(fallbackText, caseTitle);
    }

    const plan = insights.precedentSearchPlan;
    const packet = normalizeLegalSearchPacket({
        primaryDomain: insights.primaryDomain,
        caseType: insights.caseType,
        coreIssue: insights.coreIssue,
        requiredConcepts: plan?.requiredConcepts || insights.legalIssues || insights.keyFacts,
        supportConcepts: plan?.supportConcepts || insights.claims,
        evidenceConcepts: plan?.evidenceConcepts || insights.evidenceSummary,
        negativeConcepts: plan?.negativeConcepts || insights.risksAndWeakPoints,
        preferredSource: plan?.preferredSource,
        preferredBirimCodes: plan?.preferredBirimCodes,
        searchSeedText: plan?.searchSeedText || [insights.caseType, insights.coreIssue].filter(Boolean).join(' '),
        searchVariants: plan?.searchVariants,
        fallbackToNext: plan?.fallbackToNext,
        queryMode: plan?.queryMode,
    }, fallbackText, caseTitle);

    return packet || buildFallbackLegalSearchPacket(fallbackText, caseTitle);
};

const buildFallbackDetailedAnalysis = (
    text: string,
    caseTitle = '',
    packet?: LegalSearchPacket
): DetailedAnalysis | undefined => {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return undefined;

    const sentences = normalizedText
        .split(/(?<=[.!?])\s+|\n+/)
        .map((item) => normalizePacketText(item, 220))
        .filter(Boolean);

    const activePacket = packet || buildFallbackLegalSearchPacket(normalizedText, caseTitle);
    const focusItems = Array.from(new Set([
        activePacket?.caseType,
        activePacket?.coreIssue,
        ...(activePacket?.requiredConcepts || []),
        ...(activePacket?.supportConcepts || []),
    ].filter(Boolean))).slice(0, 6) as string[];

    return {
        documentType: inferDocumentType(normalizedText),
        caseStage: inferCaseStage(normalizedText),
        primaryDomain: activePacket?.primaryDomain,
        caseType: activePacket?.caseType || normalizePacketText(caseTitle || sentences[0], 140),
        coreIssue: activePacket?.coreIssue || normalizePacketText(sentences[0] || normalizedText, 220),
        keyFacts: sentences.slice(0, 4),
        timeline: sentences.filter((item) => /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}/.test(item)).slice(0, 4),
        claims: activePacket?.requiredConcepts,
        defenses: undefined,
        evidenceSummary: activePacket?.evidenceConcepts,
        legalIssues: focusItems,
        risksAndWeakPoints: activePacket?.negativeConcepts,
        missingCriticalInfo: undefined,
        suggestedNextSteps: [
            'Web arastirmasiyla guncel kaynaklari dogrula.',
            'Emsal karar aramasi ile benzer karar cizgisini kontrol et.',
        ],
        webSearchPlan: {
            coreQueries: activePacket?.requiredConcepts,
            supportQueries: activePacket?.supportConcepts,
            negativeQueries: activePacket?.negativeConcepts,
            focusTopics: focusItems,
        },
        precedentSearchPlan: {
            requiredConcepts: activePacket?.requiredConcepts,
            supportConcepts: activePacket?.supportConcepts,
            evidenceConcepts: activePacket?.evidenceConcepts,
            negativeConcepts: activePacket?.negativeConcepts,
            preferredSource: activePacket?.preferredSource,
            preferredBirimCodes: activePacket?.preferredBirimCodes,
            searchSeedText: activePacket?.searchSeedText,
            searchVariants: activePacket?.searchVariants,
            fallbackToNext: activePacket?.fallbackToNext,
            queryMode: activePacket?.queryMode,
        },
    };
};

const normalizeWebSearchPlan = (
    value: unknown,
    fallbackKeywords: string[] = []
): WebSearchPlan | undefined => {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const coreQueries = normalizeInsightList(source.coreQueries, 8) || fallbackKeywords.slice(0, 4);
    const supportQueries = normalizeInsightList(source.supportQueries, 8);
    const negativeQueries = normalizeInsightList(source.negativeQueries, 6);
    const focusTopics = normalizeInsightList(source.focusTopics, 8);

    const hasSignal = coreQueries.length > 0 || (supportQueries?.length || 0) > 0 || (focusTopics?.length || 0) > 0;
    if (!hasSignal) return undefined;

    return {
        coreQueries,
        supportQueries,
        negativeQueries,
        focusTopics,
    };
};

const normalizePrecedentSearchPlan = (
    value: unknown,
    fallbackPacket?: LegalSearchPacket
): PrecedentSearchPlan | undefined => {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const preferredSourceCandidate = normalizePacketText(source.preferredSource, 20) as PrecedentSearchPlan['preferredSource'];
    const queryModeCandidate = normalizePacketText(source.queryMode, 40) as PrecedentSearchPlan['queryMode'];
    const preferredBirimCodes = normalizePacketCodeList(source.preferredBirimCodes, 6);
    const searchVariants = normalizeSearchVariants(source.searchVariants, 4);

    const normalized: PrecedentSearchPlan = {
        requiredConcepts: normalizeInsightList(source.requiredConcepts, 8) || fallbackPacket?.requiredConcepts,
        supportConcepts: normalizeInsightList(source.supportConcepts, 8) || fallbackPacket?.supportConcepts,
        evidenceConcepts: normalizeInsightList(source.evidenceConcepts, 6) || fallbackPacket?.evidenceConcepts,
        negativeConcepts: normalizeInsightList(source.negativeConcepts, 6) || fallbackPacket?.negativeConcepts,
        preferredSource: LEGAL_SEARCH_PACKET_SOURCES.has(preferredSourceCandidate || 'auto')
            ? preferredSourceCandidate
            : fallbackPacket?.preferredSource,
        preferredBirimCodes: preferredBirimCodes.length > 0 ? preferredBirimCodes : fallbackPacket?.preferredBirimCodes,
        searchSeedText: normalizePacketText(source.searchSeedText, 260) || fallbackPacket?.searchSeedText,
        searchVariants: searchVariants.length > 0 ? searchVariants : fallbackPacket?.searchVariants,
        fallbackToNext: source.fallbackToNext === false ? false : (fallbackPacket?.fallbackToNext ?? true),
        queryMode: queryModeCandidate && ['short_issue', 'long_fact', 'document_style'].includes(queryModeCandidate as string)
            ? queryModeCandidate as 'short_issue' | 'long_fact' | 'document_style'
            : fallbackPacket?.queryMode,
    };

    const hasSignal = Boolean(
        normalized.searchSeedText
        || normalized.searchVariants?.length
        || normalized.requiredConcepts?.length
        || normalized.supportConcepts?.length
    );

    return hasSignal ? normalized : undefined;
};

const normalizeDetailedAnalysis = (
    value: unknown,
    fallbackText = '',
    caseTitle = '',
    packet?: LegalSearchPacket
): DetailedAnalysis | undefined => {
    const fallbackInsights = buildFallbackDetailedAnalysis(fallbackText, caseTitle, packet);
    if (!value || typeof value !== 'object') return fallbackInsights;

    const source = value as Record<string, unknown>;
    const backfillText = [fallbackText, caseTitle, source.coreIssue, source.caseType].filter(Boolean).join(' ');
    const packetFromInsights = buildLegalSearchPacketFromInsights({
        primaryDomain: normalizePacketText(source.primaryDomain, 40) as DetailedAnalysis['primaryDomain'],
        caseType: normalizePacketText(source.caseType, 160),
        coreIssue: normalizePacketText(source.coreIssue, 220),
        legalIssues: normalizeInsightList(source.legalIssues, 8),
        keyFacts: normalizeInsightList(source.keyFacts, 8),
        claims: normalizeInsightList(source.claims, 8),
        evidenceSummary: normalizeInsightList(source.evidenceSummary, 6),
        risksAndWeakPoints: normalizeInsightList(source.risksAndWeakPoints, 6),
        precedentSearchPlan: undefined,
    }, backfillText, caseTitle) || packet;

    const normalized: DetailedAnalysis = {
        documentType: normalizePacketText(source.documentType, 120) || inferDocumentType(backfillText),
        caseStage: normalizePacketText(source.caseStage, 80) || inferCaseStage(backfillText),
        primaryDomain: resolvePrimaryDomain(
            normalizePacketText(source.primaryDomain, 40),
            backfillText
        ) ?? packetFromInsights?.primaryDomain,
        secondaryDomains: normalizeInsightDomainList(source.secondaryDomains, 4),
        caseType: normalizePacketText(source.caseType, 160) || packetFromInsights?.caseType,
        coreIssue: normalizePacketText(source.coreIssue, 220) || packetFromInsights?.coreIssue,
        keyFacts: normalizeInsightList(source.keyFacts, 8),
        timeline: normalizeInsightList(source.timeline, 8),
        claims: normalizeInsightList(source.claims, 8),
        defenses: normalizeInsightList(source.defenses, 8),
        evidenceSummary: normalizeInsightList(source.evidenceSummary, 8) || packetFromInsights?.evidenceConcepts,
        legalIssues: normalizeInsightList(source.legalIssues, 8) || packetFromInsights?.requiredConcepts,
        risksAndWeakPoints: normalizeInsightList(source.risksAndWeakPoints, 8),
        missingCriticalInfo: normalizeInsightList(source.missingCriticalInfo, 8),
        suggestedNextSteps: normalizeInsightList(source.suggestedNextSteps, 8),
        webSearchPlan: normalizeWebSearchPlan(source.webSearchPlan, [
            ...(packetFromInsights?.requiredConcepts || []),
            ...(packetFromInsights?.supportConcepts || []),
        ]),
        precedentSearchPlan: normalizePrecedentSearchPlan(source.precedentSearchPlan, packetFromInsights),
    };

    return {
        ...fallbackInsights,
        ...normalized,
        webSearchPlan: normalized.webSearchPlan || fallbackInsights?.webSearchPlan,
        precedentSearchPlan: normalized.precedentSearchPlan || fallbackInsights?.precedentSearchPlan,
        keyFacts: normalized.keyFacts || fallbackInsights?.keyFacts,
        timeline: normalized.timeline || fallbackInsights?.timeline,
        claims: normalized.claims || fallbackInsights?.claims,
        defenses: normalized.defenses || fallbackInsights?.defenses,
        evidenceSummary: normalized.evidenceSummary || fallbackInsights?.evidenceSummary,
        legalIssues: normalized.legalIssues || fallbackInsights?.legalIssues,
        risksAndWeakPoints: normalized.risksAndWeakPoints || fallbackInsights?.risksAndWeakPoints,
        missingCriticalInfo: normalized.missingCriticalInfo || fallbackInsights?.missingCriticalInfo,
        suggestedNextSteps: normalized.suggestedNextSteps || fallbackInsights?.suggestedNextSteps,
        secondaryDomains: normalized.secondaryDomains || fallbackInsights?.secondaryDomains,
    };
};

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
        body: stringifyPayloadWithLimit(payload, 'Analiz', MAX_ANALYZE_API_BODY_BYTES)
    }));

    const rawResponseText = typeof data?.text === 'string' ? data.text : '';
    const cleanText = cleanJsonString(rawResponseText);

    try {
        const json = safeJsonObjectParse(cleanText);
        if (!json || typeof json !== 'object') {
            throw new Error('Analysis response is not valid JSON.');
        }

        const caseDetails: CaseDetails = {
            caseTitle: json.caseDetails?.caseTitle || json.caseDetails?.subject || '',
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

        const fallbackAnalysisText = [json.summary || '', udfTextContent || '', wordTextContent || ''].filter(Boolean).join('\n');
        const caseTitle = json.caseDetails?.caseTitle || json.caseDetails?.subject || '';
        const rawAnalysisInsights = json.analysisInsights || json.detailedAnalysis || null;
        const analysisInsights = normalizeDetailedAnalysis(
            rawAnalysisInsights,
            fallbackAnalysisText,
            caseTitle,
            undefined
        );

        const legalSearchPacket = normalizeLegalSearchPacket(
            json.legalSearchPacket || analysisInsights?.precedentSearchPlan,
            fallbackAnalysisText,
            caseTitle
        ) || buildLegalSearchPacketFromInsights(analysisInsights, fallbackAnalysisText, caseTitle);

        return {
            summary: json.summary || '',
            potentialParties: Array.from(new Set(json.potentialParties || [])) as string[],
            caseDetails,
            lawyerInfo,
            contactInfo,
            legalSearchPacket,
            analysisInsights,
        };
    } catch (e) {
        console.error("Failed to parse analysis JSON from backend:", e);
        const fallbackSummary = cleanText || rawResponseText;
        const fallbackInsights = normalizeDetailedAnalysis(null, fallbackSummary, '', undefined);
        return {
            summary: fallbackSummary || "Sunucudan gelen analiz sonucu islenemedi.",
            potentialParties: [],
            caseDetails: { caseTitle: '', court: '', fileNumber: '', decisionNumber: '', decisionDate: '' },
            legalSearchPacket: normalizeLegalSearchPacket(null, fallbackSummary, ''),
            analysisInsights: fallbackInsights,
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
    } catch {
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
        const compactChatHistory = Array.isArray(chatHistory)
            ? chatHistory.map(({ files: _files, ...message }) => message)
            : [];
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: await buildJsonHeaders(),
            body: stringifyPayloadWithLimit({ chatHistory: compactChatHistory, analysisSummary, context, files }, 'Sohbet')
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
