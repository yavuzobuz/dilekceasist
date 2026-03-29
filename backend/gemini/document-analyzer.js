import { Type } from '@google/genai';
import {
    extractBirimCodesFromCourtHint,
    resolveLegalSearchContract,
} from '../../lib/legal/legal-search-packet-adapter.js';
import { sanitizeLegalInput } from '../../lib/legal/legal-text-utils.js';
import { GEMINI_FLASH_PREVIEW_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME =
    process.env.GEMINI_DOCUMENT_ANALYZER_MODEL_NAME ||
    process.env.VITE_GEMINI_DOCUMENT_ANALYZER_MODEL_NAME ||
    process.env.GEMINI_MODEL_NAME ||
    process.env.VITE_GEMINI_MODEL_NAME ||
    GEMINI_FLASH_PREVIEW_MODEL_NAME;

const VALID_SOURCES = new Set(['bedesten', 'emsal', 'anayasa']);
const VALID_COURT_TYPES = new Set([
    'YARGITAYKARARI',
    'DANISTAYKARAR',
    'YERELHUKUK',
    'ISTINAFHUKUK',
    'KYB',
]);
const MAX_TEXT_LENGTH = 12000;
const MAX_PHRASES = 5;
const MAX_TERMS = 6;
const MAX_LAWS = 6;
const MAX_SUPPORT_TERMS = 5;
const MAX_NEGATIVE_TERMS = 4;
const STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'ama', 'fakat', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'su',
    'daha', 'kadar', 'sonra', 'once', 'tum', 'her', 'muvvekkil', 'muvekkil', 'davaci', 'davali',
    'sanik', 'supheli', 'mahkeme', 'karar', 'davasi', 'dava', 'dosya', 'dosyada', 'metin',
    'oldugu', 'olmadigi', 'ettigi', 'edildigi', 'nedeniyle', 'sebebiyle', 'kapsaminda', 'gore',
    'iliskin', 'hakkinda', 'uzerine', 'ancak', 'buna', 'gore', 'icin', 'ile', 'olarak',
]);

const ANALYZER_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        davaKonusu: { type: Type.STRING },
        hukukiMesele: { type: Type.STRING },
        kaynak: { type: Type.STRING },
        courtTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
        birimAdi: { type: Type.STRING },
        aramaIfadeleri: { type: Type.ARRAY, items: { type: Type.STRING } },
        ilgiliKanunlar: { type: Type.ARRAY, items: { type: Type.STRING } },
        mustKavramlar: { type: Type.ARRAY, items: { type: Type.STRING } },
        supportKavramlar: { type: Type.ARRAY, items: { type: Type.STRING } },
        negativeKavramlar: { type: Type.ARRAY, items: { type: Type.STRING } },
        queryMode: { type: Type.STRING },
    },
};

const ANALYZER_SYSTEM_INSTRUCTION = `Sen deneyimli bir Turk hukuk arastirma asistanisin.
Gorevin, verilen metinden yalnizca emsal karar aramasi icin gerekli cekirdek analizi cikarmaktir.

Sadece JSON dondur. Baska aciklama yazma.

JSON semasi:
{
  "davaKonusu": "kisa uyusmazlik basligi",
  "hukukiMesele": "tek cumlelik temel hukuki sorun",
  "kaynak": "bedesten | emsal | anayasa",
  "courtTypes": ["YARGITAYKARARI"],
  "birimAdi": "3. Hukuk Dairesi",
  "aramaIfadeleri": ["kisa arama ifadesi 1", "kisa arama ifadesi 2"],
  "ilgiliKanunlar": ["TBK 315"],
  "mustKavramlar": ["kira", "temerrut", "tahliye"],
  "supportKavramlar": ["ihtarname"],
  "negativeKavramlar": ["ceza"],
  "queryMode": "short_issue | long_fact | document_style"
}

Kurallar:
- Arama ifadeleri 2-5 kelime olsun.
- Arama ifadelerinde regex veya uzun cumle kullanma.
- Zorunlu kavramlar cekirdek hukuki kavramlar olsun.
- supportKavramlar yardimci ama alan-ici kavramlar olsun.
- negativeKavramlar yanlis alana goturecek kavramlar olsun.
- Kira/tasinmaz uyusmazliklarinda genelde "3. Hukuk Dairesi" dusun.
- Aile uyusmazliklarinda genelde "2. Hukuk Dairesi" dusun.
- Is hukuku uyusmazliklarinda genelde "9. Hukuk Dairesi" dusun.
- Icra/iflas uyusmazliklarinda genelde "12. Hukuk Dairesi" dusun.
- Ticari uyusmazliklarda genelde "11. Hukuk Dairesi" dusun.
- Uyusturucu ticareti icin genelde "10. Ceza Dairesi" dusun.
- Idare/imar uyusmazliklarinda Danistay kaynaklarini dusun.
- Temel hak ihlali ve bireysel basvuru ekseninde Anayasa Mahkemesini dusun.
- Kaynak secimi:
  - bedesten: Yargitay / Danistay / genel ictihat aramasi
  - emsal: alt derece / istinaf / yerel emsal odagi
  - anayasa: AYM bireysel basvuru veya norm denetimi
`;

const HEURISTIC_RULES = [
    {
        id: 'anayasa_bireysel',
        when: /\b(anayasa mahkemesi|aym|bireysel basvuru|adil yargilanma|ifade ozgurlugu|mulkiyet hakki|makul sure|hak ihlali)\b/i,
        analysis: {
            davaKonusu: 'anayasa mahkemesi bireysel basvuru',
            hukukiMesele: 'Temel hak ihlali ve bireysel basvuru kosullarinin degerlendirilmesi.',
            kaynak: 'anayasa',
            courtTypes: [],
            birimAdi: '',
            aramaIfadeleri: [
                'anayasa mahkemesi bireysel basvuru',
                'hak ihlali bireysel basvuru',
                'makul sure adil yargilanma',
            ],
            ilgiliKanunlar: ['Anayasa 36'],
            mustKavramlar: ['bireysel basvuru', 'hak ihlali'],
            supportKavramlar: ['adil yargilanma', 'makul sure'],
            negativeKavramlar: ['danistay iptal davasi'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'kira',
        when: /\b(kira|kiraci|kiraya veren|temerrut|tahliye|kira bedeli|ihtarname)\b/i,
        analysis: {
            davaKonusu: 'kira uyusmazligi',
            hukukiMesele: 'Kiracinin kira bedelini odememesi nedeniyle temerrut ve tahliye kosullarinin degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['YARGITAYKARARI'],
            birimAdi: '3. Hukuk Dairesi',
            aramaIfadeleri: [
                'kira temerrut tahliye',
                'kiraci kira odememesi',
                'TBK 315 tahliye',
                'kira bedeli odenmemesi',
            ],
            ilgiliKanunlar: ['TBK 315'],
            mustKavramlar: ['kira', 'temerrut', 'tahliye'],
            supportKavramlar: ['ihtarname', 'kira bedeli'],
            negativeKavramlar: ['ceza'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'is_hukuku',
        when: /\b(ise iade|gecersiz fesih|kidem tazminati|ihbar tazminati|fazla mesai|is guvencesi)\b/i,
        analysis: {
            davaKonusu: 'is hukuku uyusmazligi',
            hukukiMesele: 'Fesih, is guvencesi veya iscilik alacaklarina iliskin sartlarin degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['YARGITAYKARARI'],
            birimAdi: '9. Hukuk Dairesi',
            aramaIfadeleri: [
                'ise iade gecersiz fesih',
                'is guvencesi ise iade',
                'kidem ihbar tazminati',
            ],
            ilgiliKanunlar: ['Is Kanunu 18'],
            mustKavramlar: ['ise iade', 'gecersiz fesih'],
            supportKavramlar: ['is guvencesi', 'kidem tazminati'],
            negativeKavramlar: ['ceza'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'icra',
        when: /\b(itirazin iptali|menfi tespit|istirdat|icra takibi|odeme emri|haciz)\b/i,
        analysis: {
            davaKonusu: 'icra ve iflas uyusmazligi',
            hukukiMesele: 'Takip hukuku ve itiraz mekanizmalarinin degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['YARGITAYKARARI'],
            birimAdi: '12. Hukuk Dairesi',
            aramaIfadeleri: [
                'itirazin iptali icra inkar',
                'menfi tespit icra takibi',
                'odeme emri borca itiraz',
            ],
            ilgiliKanunlar: ['IIK 67'],
            mustKavramlar: ['itirazin iptali', 'icra takibi'],
            supportKavramlar: ['icra inkar tazminati', 'borca itiraz'],
            negativeKavramlar: ['aile hukuku'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'uyusturucu',
        when: /\b(uyusturucu|tck 188|tck 191|ticaret kasti|kisisel kullanim|paketleme|hassas terazi)\b/i,
        analysis: {
            davaKonusu: 'uyusturucu sucu uyusmazligi',
            hukukiMesele: 'Uyusturucu madde ticareti ile kullanmak icin bulundurma ayriminin degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['YARGITAYKARARI'],
            birimAdi: '10. Ceza Dairesi',
            aramaIfadeleri: [
                'uyusturucu ticareti TCK 188',
                'kullanmak icin bulundurma TCK 191',
                'ticaret kasti kisisel kullanim',
            ],
            ilgiliKanunlar: ['TCK 188', 'TCK 191'],
            mustKavramlar: ['uyusturucu ticareti', 'kullanmak icin bulundurma'],
            supportKavramlar: ['ticaret kasti', 'kisisel kullanim'],
            negativeKavramlar: ['imar'],
            queryMode: 'long_fact',
        },
    },
    {
        id: 'imar',
        when: /\b(imar|ruhsat|yapi tatil|yikim karari|belediye encumeni|ruhsatsiz yapi)\b/i,
        analysis: {
            davaKonusu: 'imar uyusmazligi',
            hukukiMesele: 'Imar yaptirimi, ruhsat ve yikim kararlarinin hukuka uygunlugunun degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['DANISTAYKARAR'],
            birimAdi: '6. Daire',
            aramaIfadeleri: [
                'imar para cezasi ruhsatsiz yapi',
                'yapi tatil tutanagi yikim',
                '3194 ruhsat iptali',
            ],
            ilgiliKanunlar: ['3194 sayili Imar Kanunu'],
            mustKavramlar: ['imar', 'ruhsatsiz yapi', 'yikim karari'],
            supportKavramlar: ['yapi tatil tutanagi', 'belediye encumeni'],
            negativeKavramlar: ['uyusturucu'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'vergi',
        when: /\b(vergi|kdv|tarhiyat|vergi ziyai|sahte fatura|inceleme raporu)\b/i,
        analysis: {
            davaKonusu: 'vergi uyusmazligi',
            hukukiMesele: 'Vergi tarhiyati ve vergi cezalarinin hukuka uygunlugunun degerlendirilmesi.',
            kaynak: 'bedesten',
            courtTypes: ['DANISTAYKARAR'],
            birimAdi: '3. Daire',
            aramaIfadeleri: [
                'vergi tarhiyati sahte fatura',
                'kdv indirimi inceleme raporu',
                'vergi ziyai cezasi',
            ],
            ilgiliKanunlar: ['VUK 359'],
            mustKavramlar: ['tarhiyat', 'vergi ziyai'],
            supportKavramlar: ['sahte fatura', 'inceleme raporu'],
            negativeKavramlar: ['bosanma'],
            queryMode: 'short_issue',
        },
    },
    {
        id: 'emsal_alt_derece',
        when: /\b(emsal|istinaf|bam|bolge adliye|yerel mahkeme|ilk derece)\b/i,
        analysis: {
            davaKonusu: 'alt derece emsal aramasi',
            hukukiMesele: 'Yerel mahkeme veya istinaf eksenli emsal kararlarin aranmasi.',
            kaynak: 'emsal',
            courtTypes: ['ISTINAFHUKUK'],
            birimAdi: '',
            aramaIfadeleri: [
                'istinaf emsal karar',
                'yerel mahkeme emsal',
                'bam emsal karar',
            ],
            ilgiliKanunlar: [],
            mustKavramlar: ['emsal karar'],
            supportKavramlar: ['istinaf', 'yerel mahkeme'],
            negativeKavramlar: ['anayasa mahkemesi'],
            queryMode: 'short_issue',
        },
    },
];

const normalizeLower = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const dedupeList = (values = [], { limit = 8, maxLength = 120 } = {}) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const normalized = sanitizeLegalInput(String(value || '').replace(/\s+/g, ' ').trim()).text
            .slice(0, maxLength)
            .trim();
        if (!normalized) continue;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(normalized);
        if (unique.length >= limit) break;
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

const toTitleCase = (value = '') =>
    String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');

const detectQueryMode = (text = '') => {
    const normalized = sanitizeLegalInput(text, { preserveLayout: true }).text;
    if (!normalized) return 'short_issue';
    if (/\n/.test(normalized) || normalized.length > 220) return 'document_style';
    if (normalized.length > 100 || normalized.split(/\s+/).length >= 12) return 'long_fact';
    return 'short_issue';
};

const extractLawReferences = (text = '') => {
    const source = sanitizeLegalInput(text, { preserveLayout: true }).text;
    const asciiSource = normalizeLower(source);
    const found = [];
    const seen = new Set();

    const addLaw = (value = '') => {
        const normalized = sanitizeLegalInput(value.replace(/\s+/g, ' ').trim()).text;
        if (!normalized) return;
        const key = normalized.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) return;
        seen.add(key);
        found.push(normalized);
    };

    for (const match of asciiSource.matchAll(/\b(tbk|tck|cmk|hmk|tmk|iik|ttk|iyuk|vuk|ay)\s*(?:maddesi|md\.?|madde)?\s*(\d+(?:\/\d+)?)?\b/g)) {
        const code = String(match[1] || '').toUpperCase();
        const no = String(match[2] || '').trim();
        addLaw(no ? `${code} ${no}` : code);
    }

    for (const match of asciiSource.matchAll(/\b(\d{4})\s+sayili\s+([a-z\s]+?)(?=[,.;:\n]|$)/g)) {
        addLaw(`${match[1]} sayili ${toTitleCase(match[2])}`.trim());
    }

    return found.slice(0, MAX_LAWS);
};

const extractKeywordCandidates = (text = '') => {
    const normalized = normalizeLower(text);
    const words = normalized.split(/\s+/).filter(Boolean);
    const unique = [];
    const seen = new Set();

    for (const word of words) {
        if (word.length < 3) continue;
        if (/^\d+$/.test(word)) continue;
        if (STOPWORDS.has(word)) continue;
        if (seen.has(word)) continue;
        seen.add(word);
        unique.push(word);
        if (unique.length >= 10) break;
    }

    return unique;
};

const buildGenericSearchPhrases = (text = '', laws = []) => {
    const keywords = extractKeywordCandidates(text);
    const phrases = [];

    if (keywords.length >= 3) {
        phrases.push(keywords.slice(0, 3).join(' '));
    }
    if (keywords.length >= 4) {
        phrases.push(keywords.slice(1, 4).join(' '));
    }
    if (keywords.length >= 2) {
        phrases.push(keywords.slice(0, 2).join(' '));
    }
    if (laws[0] && keywords.length >= 1) {
        phrases.push(`${laws[0]} ${keywords[0]}`);
    }

    return dedupeList(phrases, { limit: MAX_PHRASES, maxLength: 80 });
};

const buildGenericIssue = (text = '') => {
    const normalized = sanitizeLegalInput(text).text;
    if (!normalized) return '';
    const trimmed = normalized.slice(0, 180).trim();
    return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
};

const buildRuleBasedAnalysis = (text = '') => {
    const normalized = sanitizeLegalInput(text, { preserveLayout: true }).text;
    const matchedRule = HEURISTIC_RULES.find((rule) => rule.when.test(normalized));
    const laws = extractLawReferences(normalized);

    if (matchedRule) {
        return {
            ...matchedRule.analysis,
            ilgiliKanunlar: dedupeList([
                ...matchedRule.analysis.ilgiliKanunlar,
                ...laws,
            ], { limit: MAX_LAWS }),
        };
    }

    const genericMust = extractKeywordCandidates(normalized).slice(0, 3);
    return {
        davaKonusu: genericMust.length > 0 ? `${genericMust[0]} uyusmazligi` : 'hukuki uyusmazlik',
        hukukiMesele: buildGenericIssue(normalized) || 'Belgede anlatilan hukuki uyusmazligin degerlendirilmesi.',
        kaynak: 'bedesten',
        courtTypes: ['YARGITAYKARARI'],
        birimAdi: '',
        aramaIfadeleri: buildGenericSearchPhrases(normalized, laws),
        ilgiliKanunlar: laws,
        mustKavramlar: dedupeList(genericMust, { limit: MAX_TERMS }),
        supportKavramlar: dedupeList(extractKeywordCandidates(normalized).slice(3, 6), { limit: MAX_SUPPORT_TERMS }),
        negativeKavramlar: [],
        queryMode: detectQueryMode(normalized),
    };
};

const normalizeSource = (value = '', fallback = 'bedesten') => {
    const normalized = sanitizeLegalInput(value).text.toLocaleLowerCase('tr-TR');
    return VALID_SOURCES.has(normalized) ? normalized : fallback;
};

const normalizeCourtTypes = (values = [], fallback = []) => {
    const normalized = dedupeList(values, { limit: 4, maxLength: 24 })
        .map((value) => value.toUpperCase())
        .filter((value) => VALID_COURT_TYPES.has(value));
    return normalized.length > 0 ? normalized : fallback;
};

const normalizeDocumentAnalysis = (raw = null, heuristic = null, diagnostics = {}) => {
    const fallback = heuristic || buildRuleBasedAnalysis('');
    const source = normalizeSource(raw?.kaynak, fallback.kaynak || 'bedesten');

    return {
        davaKonusu: sanitizeLegalInput(raw?.davaKonusu || fallback.davaKonusu || '').text || fallback.davaKonusu,
        hukukiMesele: sanitizeLegalInput(raw?.hukukiMesele || fallback.hukukiMesele || '').text || fallback.hukukiMesele,
        kaynak: source,
        courtTypes: normalizeCourtTypes(raw?.courtTypes, fallback.courtTypes || []),
        birimAdi: sanitizeLegalInput(raw?.birimAdi || fallback.birimAdi || '').text,
        aramaIfadeleri: dedupeList(
            (Array.isArray(raw?.aramaIfadeleri) && raw.aramaIfadeleri.length > 0)
                ? raw.aramaIfadeleri
                : fallback.aramaIfadeleri,
            { limit: MAX_PHRASES, maxLength: 80 }
        ),
        ilgiliKanunlar: dedupeList([
            ...(Array.isArray(raw?.ilgiliKanunlar) ? raw.ilgiliKanunlar : []),
            ...(fallback.ilgiliKanunlar || []),
        ], { limit: MAX_LAWS, maxLength: 80 }),
        mustKavramlar: dedupeList(
            (Array.isArray(raw?.mustKavramlar) && raw.mustKavramlar.length > 0)
                ? raw.mustKavramlar
                : fallback.mustKavramlar,
            { limit: MAX_TERMS, maxLength: 60 }
        ),
        supportKavramlar: dedupeList([
            ...(Array.isArray(raw?.supportKavramlar) ? raw.supportKavramlar : []),
            ...(fallback.supportKavramlar || []),
        ], { limit: MAX_SUPPORT_TERMS, maxLength: 60 }),
        negativeKavramlar: dedupeList([
            ...(Array.isArray(raw?.negativeKavramlar) ? raw.negativeKavramlar : []),
            ...(fallback.negativeKavramlar || []),
        ], { limit: MAX_NEGATIVE_TERMS, maxLength: 60 }),
        queryMode: sanitizeLegalInput(raw?.queryMode || fallback.queryMode || '').text || fallback.queryMode || 'short_issue',
        diagnostics: {
            model: MODEL_NAME,
            provider: diagnostics.provider || 'heuristic',
            fallbackUsed: Boolean(diagnostics.fallbackUsed),
            warning: diagnostics.warning || null,
            rawTextLength: Number(diagnostics.rawTextLength) || 0,
        },
    };
};

const buildAnalyzerPrompt = (text = '') => [
    'METIN:',
    '"""',
    text,
    '"""',
    '',
    'Lutfen bu metinden emsal karar aramasi icin cekirdek analizi cikar.',
].join('\n');

const buildFallbackWarning = (error = null) => {
    const message = String(error?.message || error || '').trim();
    if (!message) return 'Gemini document analyzer kullanilamadi; heuristik fallback uygulandi.';
    return `Gemini document analyzer kullanilamadi; heuristik fallback uygulandi: ${message}`;
};

const resolvePreferredSourceFromAnalyzer = (analysis = {}) => {
    const source = normalizeSource(analysis?.kaynak, '');
    const courtTypes = normalizeCourtTypes(analysis?.courtTypes, []);

    if (source === 'anayasa') return 'anayasa';
    if (source === 'emsal') return 'bam';
    if (courtTypes.includes('DANISTAYKARAR')) return 'danistay';
    if (courtTypes.includes('ISTINAFHUKUK') || courtTypes.includes('YERELHUKUK') || courtTypes.includes('KYB')) {
        return 'bam';
    }
    if (courtTypes.includes('YARGITAYKARARI')) return 'yargitay';
    return source === 'bedesten' ? 'all' : 'all';
};

const buildAnalyzerSearchText = (analysis = {}) =>
    dedupeList([
        analysis?.davaKonusu,
        analysis?.hukukiMesele,
        ...(Array.isArray(analysis?.mustKavramlar) ? analysis.mustKavramlar : []),
        ...(Array.isArray(analysis?.supportKavramlar) ? analysis.supportKavramlar : []),
        ...(Array.isArray(analysis?.ilgiliKanunlar) ? analysis.ilgiliKanunlar : []),
        ...(Array.isArray(analysis?.aramaIfadeleri) ? analysis.aramaIfadeleri : []),
        analysis?.birimAdi,
    ], { limit: 16, maxLength: 120 }).join(' ').trim();

export const analyzerOutputToPacket = (analyzerResult = null) => {
    if (!analyzerResult || typeof analyzerResult !== 'object' || Array.isArray(analyzerResult)) {
        return null;
    }

    const normalizedAnalysis = normalizeDocumentAnalysis(analyzerResult, buildRuleBasedAnalysis(''));
    const preferredSource = resolvePreferredSourceFromAnalyzer(normalizedAnalysis);
    const primaryBirim = sanitizeLegalInput(normalizedAnalysis?.birimAdi || '').text;
    const preferredBirimCodes = extractBirimCodesFromCourtHint(primaryBirim);
    const searchClauses = dedupeList(normalizedAnalysis?.aramaIfadeleri || [], { limit: MAX_PHRASES, maxLength: 80 });
    const searchSeedText = searchClauses[0]
        || dedupeList(normalizedAnalysis?.mustKavramlar || [], { limit: 3, maxLength: 40 }).join(' ')
        || sanitizeLegalInput(normalizedAnalysis?.hukukiMesele || normalizedAnalysis?.davaKonusu || '').text
            .split(/\s+/)
            .slice(0, 6)
            .join(' ')
            .trim();
    const explicitPacket = {
        coreIssue: normalizedAnalysis.hukukiMesele,
        requiredConcepts: normalizedAnalysis.mustKavramlar || [],
        supportConcepts: normalizedAnalysis.supportKavramlar || [],
        negativeConcepts: normalizedAnalysis.negativeKavramlar || [],
        preferredSource,
        preferredBirimCodes,
        searchSeedText,
        searchVariants: searchClauses.map((query) => ({ query, mode: 'document_analyzer' })),
        queryMode: normalizedAnalysis.queryMode || 'short_issue',
    };

    const resolvedContract = resolveLegalSearchContract({
        rawText: buildAnalyzerSearchText(normalizedAnalysis),
        preferredSource,
        explicitPacket,
    });
    const resolvedPacket = resolvedContract?.legalSearchPacket || explicitPacket;
    const resolvedSearchClauses = dedupeList(
        (resolvedPacket?.searchVariants || []).map((item) => item?.query).filter(Boolean),
        { limit: MAX_PHRASES, maxLength: 80 }
    );

    return {
        ...resolvedPacket,
        source: resolvedPacket?.preferredSource || preferredSource,
        primaryBirim,
        primaryBirimCodes: resolvedPacket?.preferredBirimCodes || preferredBirimCodes,
        searchClauses: resolvedSearchClauses.length > 0 ? resolvedSearchClauses : searchClauses,
        courtTypes: normalizedAnalysis.courtTypes,
        analyzerDiagnostics: normalizedAnalysis.diagnostics || {},
    };
};

export const analyzeDocument = async (text = '') => {
    const sanitized = sanitizeLegalInput(text, { preserveLayout: true }).text.slice(0, MAX_TEXT_LENGTH).trim();
    if (sanitized.length < 5) {
        const error = new Error('Analiz icin en az 5 karakterlik metin gereklidir.');
        error.status = 400;
        throw error;
    }

    const heuristic = buildRuleBasedAnalysis(sanitized);

    try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: buildAnalyzerPrompt(sanitized),
            config: {
                systemInstruction: ANALYZER_SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: ANALYZER_RESPONSE_SCHEMA,
            },
        });

        const parsed = safeJsonParse(response?.text || '');
        if (!parsed || typeof parsed !== 'object') {
            return normalizeDocumentAnalysis(null, heuristic, {
                provider: 'heuristic',
                fallbackUsed: true,
                warning: 'Gemini output parse edilemedi; heuristik fallback uygulandi.',
                rawTextLength: sanitized.length,
            });
        }

        return normalizeDocumentAnalysis(parsed, heuristic, {
            provider: 'gemini',
            fallbackUsed: false,
            rawTextLength: sanitized.length,
        });
    } catch (error) {
        return normalizeDocumentAnalysis(null, heuristic, {
            provider: 'heuristic',
            fallbackUsed: true,
            warning: buildFallbackWarning(error),
            rawTextLength: sanitized.length,
        });
    }
};

export const __testables = {
    analyzerOutputToPacket,
    buildRuleBasedAnalysis,
    extractLawReferences,
    detectQueryMode,
    normalizeDocumentAnalysis,
};
