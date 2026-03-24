import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.LEGAL_SIMPLE_BEDESTEN_PROVIDER = 'cli';
process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK = '0';

const { default: handler } = await import('../backend/legal/search-decisions.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../output');
const RESULTS_PATH = path.join(OUTPUT_DIR, 'yargi-cli-live-detailed-results.json');
const REPORT_PATH = path.join(OUTPUT_DIR, 'yargi-cli-live-detailed-report.md');

const SCENARIO_DELAY_MS = 6000;
const BATCH_DELAY_MS = 25000;
const RATE_LIMIT_COOLDOWN_MS = 60000;

const normalizeText = (value = '') =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const hasFamilyMatch = (families = [], expectedLabel = '') => {
  const expected = normalizeText(expectedLabel);
  if (!expected) return true;
  return (Array.isArray(families) ? families : []).some((item) => normalizeText(item).includes(expected));
};

const hasBirimMatch = (value = '', expected = '') =>
  !expected || normalizeText(value) === normalizeText(expected);

const clampScore = (value = 0) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const computeFactPatternSimilarity = (result = {}) => {
  const factHits = Array.from(new Set([
    ...((Array.isArray(result?.contentMatchedFactPattern) ? result.contentMatchedFactPattern : [])),
    ...((Array.isArray(result?.matchedEvidenceConcepts) ? result.matchedEvidenceConcepts : [])),
  ].map((item) => normalizeText(item)).filter(Boolean)));
  const supportHits = Array.from(new Set((Array.isArray(result?.matchedSupportConcepts) ? result.matchedSupportConcepts : []).map((item) => normalizeText(item)).filter(Boolean)));
  const requiredHits = Array.from(new Set((Array.isArray(result?.matchedRequiredConcepts) ? result.matchedRequiredConcepts : []).map((item) => normalizeText(item)).filter(Boolean)));
  const substantiveHits = Array.from(new Set((Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive : []).map((item) => normalizeText(item)).filter(Boolean)));
  const proceduralHits = Array.from(new Set((Array.isArray(result?.contentProceduralHits) ? result.contentProceduralHits : []).map((item) => normalizeText(item)).filter(Boolean)));

  let score = (factHits.length * 22)
    + (supportHits.length * 8)
    + (requiredHits.length * 6)
    + (substantiveHits.length * 4)
    - (proceduralHits.length * 14);

  if (factHits.length >= 2) score += 14;
  if (factHits.length === 0 && proceduralHits.length >= 2) score -= 28;
  if (String(result?.summaryText || result?.ozet || result?.snippet || '').trim()) score += 6;

  return {
    score: clampScore(score),
    hits: factHits.slice(0, 6),
    proceduralHits: proceduralHits.slice(0, 4),
    proceduralShellBias: proceduralHits.length >= 2 && factHits.length === 0,
  };
};

const SCENARIOS = [
  {
    id: 'aile-6284-tedbir',
    label: 'Aile 6284 koruyucu-onleyici tedbir',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'aile',
      caseType: 'aile_6284',
      birim: 'H2',
      family: '2. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: '6284 uzaklastirma tedbiri siddet tehdidi ortak konut',
      rawQuery: '6284 sayili Kanun kapsaminda uzaklastirma, ortak konutun tahsisi, iletisim araclariyla rahatsiz etmeme ve gecici nafaka tedbirlerine iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'aile',
        caseType: 'aile_6284',
        preferredSource: 'yargitay',
        searchSeedText: '6284 uzaklastirma tedbiri siddet tehdidi ortak konut',
        requiredConcepts: ['6284', 'uzaklastirma tedbiri'],
        supportConcepts: ['ortak konut', 'gecici nafaka', 'rahatsiz etmeme'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'borclar-eser-arsa-payi',
    label: 'Borclar eser arsa payi karsiligi insaat',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'borclar',
      caseType: 'borclar_vekalet_eser',
      birim: 'H6',
      family: '6. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'arsa payi karsiligi insaat eksik ifa gec teslim',
      rawQuery: 'Arsa payi karsiligi insaat sozlesmesinde eksik ifa, gec teslim, bagimsiz bolum devri ve yuklenicinin sorumluluguna iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'borclar',
        caseType: 'borclar_vekalet_eser',
        preferredSource: 'yargitay',
        searchSeedText: 'arsa payi karsiligi insaat eksik ifa gec teslim',
        requiredConcepts: ['arsa payi karsiligi insaat', 'eksik ifa'],
        supportConcepts: ['gec teslim', 'bagimsiz bolum devri'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'gayrimenkul-ortaklik',
    label: 'Gayrimenkul ortakligin giderilmesi',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'gayrimenkul',
      caseType: 'gayrimenkul_ortaklik',
      birim: 'H7',
      family: '7. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'ortakligin giderilmesi aynen taksim izalei suyu',
      rawQuery: 'Payli mulkiyete tabi tasinmazda ortakligin giderilmesi, aynen taksim olanagi ve satis suretiyle giderme kosullarina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'gayrimenkul',
        caseType: 'gayrimenkul_ortaklik',
        preferredSource: 'yargitay',
        searchSeedText: 'ortakligin giderilmesi aynen taksim izalei suyu',
        requiredConcepts: ['ortakligin giderilmesi', 'aynen taksim'],
        supportConcepts: ['izalei suyu', 'payli mulkiyet'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'miras-muris-muvazaasi',
    label: 'Miras muris muvazaasi bakma sozlesmesi',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'miras',
      caseType: 'miras_muris_muvazaasi',
      birim: 'H1',
      family: '1. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'muris muvazaasi olunceye kadar bakma tapu devri',
      rawQuery: 'Olunceye kadar bakma sozlesmesi gorunumu altinda muris muvazaasi ile yapildigi iddia edilen tapu devrinin iptali ve tesciline iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'miras',
        caseType: 'miras_muris_muvazaasi',
        preferredSource: 'yargitay',
        searchSeedText: 'muris muvazaasi olunceye kadar bakma tapu devri',
        requiredConcepts: ['muris muvazaasi', 'tapu devri'],
        supportConcepts: ['olunceye kadar bakma', 'tescil'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'tuketici-cayma',
    label: 'Tuketici mesafeli satis cayma hakki',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'tuketici',
      caseType: 'tuketici_cayma',
      birim: 'H3',
      family: '3. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'mesafeli satis cayma hakki kargo iade',
      rawQuery: 'Mesafeli satis sozlesmesinde cayma hakkinin kullanimi, kargo bedelinin iadesi ve satıcının bilgi verme yukumlulugune iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'tuketici',
        caseType: 'tuketici_cayma',
        preferredSource: 'yargitay',
        searchSeedText: 'mesafeli satis cayma hakki kargo iade',
        requiredConcepts: ['cayma hakki', 'mesafeli sozlesme'],
        supportConcepts: ['kargo bedeli', 'iade'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'sigorta-ticari-nakliyat',
    label: 'Sigorta ticari nakliyat hasari',
    batchId: 'batch-yargitay-family-civil',
    expected: {
      domain: 'sigorta',
      caseType: 'sigorta_ticari',
      birim: 'H11',
      family: '11. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'nakliyat sigortasi emtia hasari prim alacagi',
      rawQuery: 'Nakliyat sigortasi kapsaminda emtia hasari, prim alacagi ve tasima rizikosunun police kapsaminda olup olmadigina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'sigorta',
        caseType: 'sigorta_ticari',
        preferredSource: 'yargitay',
        searchSeedText: 'nakliyat sigortasi emtia hasari prim alacagi',
        requiredConcepts: ['nakliyat sigortasi', 'prim alacagi'],
        supportConcepts: ['emtia hasari', 'tasima rizikosu'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'ticaret-limited-ortaklik',
    label: 'Ticaret limited sirket ortaklik',
    batchId: 'batch-yargitay-commercial',
    expected: {
      domain: 'ticaret',
      caseType: 'ticaret_limited',
      birim: 'H11',
      family: '11. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'limited sirket ortaklik pay devri ortakliktan cikma',
      rawQuery: 'Limited sirket ortakliginda pay devri, ortakliktan cikma, ayrilma akcesi ve yonetim yetkisinin kotuye kullanilmasina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'ticaret',
        caseType: 'ticaret_limited',
        preferredSource: 'yargitay',
        searchSeedText: 'limited sirket ortaklik pay devri ortakliktan cikma',
        requiredConcepts: ['limited sirket', 'pay devri'],
        supportConcepts: ['ortakliktan cikma', 'ayrilma akcesi'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'ticaret-konkordato-komiser',
    label: 'Ticaret konkordato komiser raporu',
    batchId: 'batch-yargitay-commercial',
    expected: {
      domain: 'ticaret',
      caseType: 'ticaret_konkordato_iflas',
      birim: 'H6',
      family: '6. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'konkordato komiser raporu tasdik rehinli alacakli',
      rawQuery: 'Konkordato komiser raporu, rehinli alacaklinin durumu, tasdik kosullari ve sira cetveli uyusmazligina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'ticaret',
        caseType: 'ticaret_konkordato_iflas',
        preferredSource: 'yargitay',
        searchSeedText: 'konkordato komiser raporu tasdik rehinli alacakli',
        requiredConcepts: ['konkordato', 'tasdik'],
        supportConcepts: ['komiser raporu', 'sira cetveli', 'rehinli alacakli'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'icra-haczedilmezlik-meskeniyet',
    label: 'Icra haczedilmezlik meskeniyet',
    batchId: 'batch-yargitay-commercial',
    expected: {
      domain: 'icra',
      caseType: 'icra_haciz',
      birim: 'H12',
      family: '12. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'meskeniyet sikayeti haczedilmezlik aile konutu',
      rawQuery: 'Meskeniyet sikayeti, aile konutu serhi, haczedilmezlik iddiasi ve icra mahkemesinin denetimine iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'icra',
        caseType: 'icra_haciz',
        preferredSource: 'yargitay',
        searchSeedText: 'meskeniyet sikayeti haczedilmezlik aile konutu',
        requiredConcepts: ['haczedilmezlik', 'meskeniyet sikayeti'],
        supportConcepts: ['aile konutu', 'icra mahkemesi'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'icra-menfi-istirdat',
    label: 'Icra menfi tespit ve istirdat',
    batchId: 'batch-yargitay-commercial',
    expected: {
      domain: 'icra',
      caseType: 'icra_menfi_tespit',
      birim: 'H11',
      family: '11. Hukuk Dairesi',
    },
    body: {
      source: 'all',
      keyword: 'menfi tespit istirdat sebepsiz takip teminat',
      rawQuery: 'Sebepsiz icra takibine karsi menfi tespit ve istirdat davasi, teminat kosullari ve odeme baskisinin ispatina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'icra',
        caseType: 'icra_menfi_tespit',
        preferredSource: 'yargitay',
        searchSeedText: 'menfi tespit istirdat sebepsiz takip teminat',
        requiredConcepts: ['menfi tespit', 'istirdat'],
        supportConcepts: ['teminat', 'sebepsiz takip'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'idare-imar-yikim',
    label: 'Idare imar encumen yikim',
    batchId: 'batch-danistay-public',
    expected: {
      domain: 'idare',
      caseType: 'idare_imar',
      birim: 'D6',
      family: '6. Daire',
    },
    body: {
      source: 'all',
      keyword: 'imar encumen yikim ruhsatsiz yapi kazanilmis hak',
      rawQuery: 'Belediye encumeninin ruhsatsiz yapi nedeniyle yikim ve para cezasi karari, kazanilmis hak ve imar plani uygunluguna iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_imar',
        preferredSource: 'danistay',
        searchSeedText: 'imar encumen yikim ruhsatsiz yapi kazanilmis hak',
        requiredConcepts: ['yikim karari', 'imar para cezasi'],
        supportConcepts: ['kazanilmis hak', 'imar plani'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'idare-kamu-ihale-asiri-dusuk',
    label: 'Idare kamu ihale asiri dusuk teklif',
    batchId: 'batch-danistay-public',
    expected: {
      domain: 'idare',
      caseType: 'idare_kamu_ihale',
      birim: 'D13',
      family: '13. Daire',
    },
    body: {
      source: 'all',
      keyword: '4734 asiri dusuk teklif aciklamasi degerlendirme disi',
      rawQuery: '4734 sayili Kanun kapsaminda asiri dusuk teklif aciklamasinin yetersiz bulunmasi ve teklifin degerlendirme disi birakilmasina iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_kamu_ihale',
        preferredSource: 'danistay',
        searchSeedText: '4734 asiri dusuk teklif aciklamasi degerlendirme disi',
        requiredConcepts: ['4734', 'kamu ihale'],
        supportConcepts: ['asiri dusuk teklif', 'degerlendirme disi'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'idare-disiplin-kademe',
    label: 'Idare disiplin kademe ilerlemesi',
    batchId: 'batch-danistay-public',
    expected: {
      domain: 'idare',
      caseType: 'idare_disiplin',
      birim: 'D12',
      family: '12. Daire',
    },
    body: {
      source: 'all',
      keyword: 'kademe ilerlemesinin durdurulmasi disiplin savunma',
      rawQuery: 'Memura verilen kademe ilerlemesinin durdurulmasi cezasinda savunma alinmadan tesis edilen islem ve disiplin kurulu denetimine iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_disiplin',
        preferredSource: 'danistay',
        searchSeedText: 'kademe ilerlemesinin durdurulmasi disiplin savunma',
        requiredConcepts: ['disiplin cezasi', 'savunma hakki'],
        supportConcepts: ['kademe ilerlemesinin durdurulmasi', 'disiplin kurulu'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'vergi-miyb-kdv',
    label: 'Vergi MIYB KDV indirimi',
    batchId: 'batch-danistay-public',
    expected: {
      domain: 'vergi',
      caseType: 'vergi_kdv_sahte_fatura',
      birim: 'D3',
      family: '3. Daire',
    },
    body: {
      source: 'all',
      keyword: 'muhteviyati itibariyla yaniltici belge kdv indirimi',
      rawQuery: 'Muhteviyati itibariyla yaniltici belge kullanildigi iddiasiyla KDV indiriminin reddi, vergi ziya cezasi ve vergi inceleme raporuna iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'vergi',
        caseType: 'vergi_kdv_sahte_fatura',
        preferredSource: 'danistay',
        searchSeedText: 'muhteviyati itibariyla yaniltici belge kdv indirimi',
        requiredConcepts: ['KDV indirimi', 'vergi ziya'],
        supportConcepts: ['muhteviyati itibariyla yaniltici belge', 'vergi inceleme raporu'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'vergi-gumruk-royalti',
    label: 'Vergi gumruk royalti ve ithal kiymeti',
    batchId: 'batch-danistay-public',
    expected: {
      domain: 'vergi',
      caseType: 'vergi_gumruk_otv',
      birim: 'D7',
      family: '7. Daire',
    },
    body: {
      source: 'all',
      keyword: 'gumruk kiymeti royalti ithalatta otv',
      rawQuery: 'Ithal edilen esya icin odenen royalti bedelinin gumruk kiymetine eklenmesi, ithalatta OTV ve gumruk vergisi tarhiyatina iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'vergi',
        caseType: 'vergi_gumruk_otv',
        preferredSource: 'danistay',
        searchSeedText: 'gumruk kiymeti royalti ithalatta otv',
        requiredConcepts: ['gumruk', 'otv'],
        supportConcepts: ['royalti', 'gumruk kiymeti', 'ithalat'],
        fallbackToNext: false,
      },
    },
  },
  {
    id: 'anayasa-norm-denetimi',
    label: 'Anayasa norm denetimi esitlik belirlilik',
    batchId: 'batch-anayasa',
    expected: {
      domain: 'anayasa',
      caseType: 'anayasa_norm_denetimi',
      family: 'Anayasa Mahkemesi',
    },
    body: {
      source: 'anayasa',
      keyword: 'anayasaya aykirilik norm denetimi esitlik belirlilik',
      rawQuery: 'Itiraz yoluyla anayasaya aykirilik basvurusunda esitlik, belirlilik ve olcululuk ilkeleri yonunden norm denetimine iliskin AYM kararlarina dair emsal araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'anayasa',
        caseType: 'anayasa_norm_denetimi',
        preferredSource: 'anayasa',
        searchSeedText: 'anayasaya aykirilik norm denetimi esitlik belirlilik',
        requiredConcepts: ['anayasaya aykirilik', 'norm denetimi'],
        supportConcepts: ['esitlik ilkesi', 'belirlilik', 'olcululuk'],
        fallbackToNext: false,
      },
    },
  },
];

const BATCHES = [
  { id: 'batch-yargitay-family-civil', scenarioIds: ['aile-6284-tedbir', 'borclar-eser-arsa-payi', 'gayrimenkul-ortaklik', 'miras-muris-muvazaasi', 'tuketici-cayma', 'sigorta-ticari-nakliyat'] },
  { id: 'batch-yargitay-commercial', scenarioIds: ['ticaret-limited-ortaklik', 'ticaret-konkordato-komiser', 'icra-haczedilmezlik-meskeniyet', 'icra-menfi-istirdat'] },
  { id: 'batch-danistay-public', scenarioIds: ['idare-imar-yikim', 'idare-kamu-ihale-asiri-dusuk', 'idare-disiplin-kademe', 'vergi-miyb-kdv', 'vergi-gumruk-royalti'] },
  { id: 'batch-anayasa', scenarioIds: ['anayasa-norm-denetimi'] },
];

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; },
    end() { return this; },
    setHeader() {},
  };
}

function summarize(payload = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const top = results[0] || null;
  const factPattern = computeFactPatternSimilarity(top || {});
  return {
    resultCount: results.length,
    detectedDomain: payload?.skillDiagnostics?.primaryDomain || payload?.aiSearchPlan?.primaryDomain || payload?.retrievalDiagnostics?.primaryDomain || null,
    retrievalDiagnostics: payload?.retrievalDiagnostics || null,
    factPatternSimilarityScore: top ? factPattern.score : 0,
    topFactPatternHits: factPattern.hits,
    topProceduralHits: factPattern.proceduralHits,
    topProceduralShellBias: factPattern.proceduralShellBias,
    topResults: results.slice(0, 5).map((item) => ({
      title: item?.title || '',
      daire: item?.daire || '',
      source: item?.source || '',
      summaryPreview: String(item?.summaryText || item?.ozet || item?.snippet || '').slice(0, 240),
    })),
    zeroResultMessage: payload?.zeroResultMessage || payload?.diagnostics?.zeroResultMessage || null,
    error: payload?.error || null,
  };
}

function evaluateScenario(result = {}, expected = {}) {
  const diagnostics = result.retrievalDiagnostics || {};
  const acceptedFamilies = diagnostics.acceptedTopResultDaireler || [];
  const selected = diagnostics.selectedBirimAdi || diagnostics.firstSuccessfulBirimAdi || '';
  const domainPass = normalizeText(result.detectedDomain) === normalizeText(expected.domain);
  const birimPass = hasBirimMatch(selected, expected.birim);
  const familyPass = result.resultCount > 0 && hasFamilyMatch(acceptedFamilies, expected.family);
  const rateLimited = String(diagnostics.sourceCoverageStatus || '') === 'rate_limited' || result.encountered429;
  const factPatternPass = result.resultCount > 0
    && Number(result.factPatternSimilarityScore || 0) >= 40
    && !result.topProceduralShellBias;

  let status = 'fail';
  if (domainPass && birimPass && familyPass && factPatternPass) status = 'pass';
  else if (domainPass && birimPass && familyPass) status = 'partial';
  else if (domainPass && birimPass && (result.resultCount === 0 || rateLimited)) status = 'partial';

  return {
    status,
    checks: {
      domainPass,
      birimPass,
      familyPass,
      factPatternPass,
      rateLimited,
    },
  };
}

function buildReport(results) {
  const totals = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { pass: 0, partial: 0, fail: 0 });

  const lines = [
    '# Yargi CLI Live Detailed Report',
    '',
    `- scenarioCount: ${results.length}`,
    `- pass: ${totals.pass || 0}`,
    `- partial: ${totals.partial || 0}`,
    `- fail: ${totals.fail || 0}`,
    '',
  ];

  for (const item of results) {
    lines.push(`## ${item.label}`);
    lines.push(`- status: ${item.status}`);
    lines.push(`- batchId: ${item.batchId}`);
    lines.push(`- durationMs: ${item.durationMs}`);
    lines.push(`- expectedDomain: ${item.expected.domain}`);
    lines.push(`- detectedDomain: ${item.detectedDomain || 'n/a'}`);
    lines.push(`- expectedBirim: ${item.expected.birim || 'n/a'}`);
    lines.push(`- selectedBirimAdi: ${item.retrievalDiagnostics?.selectedBirimAdi || 'n/a'}`);
    lines.push(`- firstSuccessfulBirimAdi: ${item.retrievalDiagnostics?.firstSuccessfulBirimAdi || 'n/a'}`);
    lines.push(`- routingMode: ${item.retrievalDiagnostics?.routingMode || 'n/a'}`);
    lines.push(`- expectedFamily: ${item.expected.family || 'n/a'}`);
    lines.push(`- acceptedTopResultDaireler: ${(item.retrievalDiagnostics?.acceptedTopResultDaireler || []).join(', ') || 'n/a'}`);
    lines.push(`- resultCount: ${item.resultCount}`);
    lines.push(`- sourceCoverageStatus: ${item.retrievalDiagnostics?.sourceCoverageStatus || 'n/a'}`);
    lines.push(`- zeroResultReason: ${item.retrievalDiagnostics?.zeroResultReason || 'n/a'}`);
    lines.push(`- encountered429: ${item.encountered429}`);
    lines.push(`- simpleQualityScore: ${item.retrievalDiagnostics?.simpleQualityScore ?? 'n/a'}`);
    lines.push(`- factPatternSimilarityScore: ${item.factPatternSimilarityScore ?? 'n/a'}`);
    lines.push(`- topProceduralShellBias: ${item.topProceduralShellBias}`);
    lines.push(`- topFactPatternHits: ${item.topFactPatternHits.join(', ') || 'n/a'}`);
    lines.push(`- topProceduralHits: ${item.topProceduralHits.join(', ') || 'n/a'}`);
    lines.push(`- phaseAttemptSummary: ${JSON.stringify(item.retrievalDiagnostics?.phaseAttemptSummary || {})}`);
    lines.push(`- checks: domain=${item.checks.domainPass}, birim=${item.checks.birimPass}, family=${item.checks.familyPass}, factPattern=${item.checks.factPatternPass}, rateLimited=${item.checks.rateLimited}`);
    if (item.zeroResultMessage) lines.push(`- zeroResultMessage: ${item.zeroResultMessage}`);
    if (item.error) lines.push(`- error: ${item.error}`);
    for (const top of item.topResults) {
      lines.push(`- top: ${top.title} | ${top.daire} | ${top.source}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scenarioMap = new Map(SCENARIOS.map((item) => [item.id, item]));
const results = [];

for (let batchIndex = 0; batchIndex < BATCHES.length; batchIndex += 1) {
  const batch = BATCHES[batchIndex];
  const batchScenarios = batch.scenarioIds.map((id) => scenarioMap.get(id)).filter(Boolean);

  for (let index = 0; index < batchScenarios.length; index += 1) {
    const scenario = batchScenarios[index];
    const req = { method: 'POST', headers: {}, body: scenario.body };
    const res = createMockRes();
    const startedAt = Date.now();
    await handler(req, res);

    const summary = summarize(res.payload || {});
    const diagnostics = summary.retrievalDiagnostics || {};
    const encountered429 =
      String(summary.error || '').includes('429')
      || Number(diagnostics?.rateLimitedAttemptCount || 0) > 0
      || String(diagnostics?.sourceCoverageStatus || '') === 'rate_limited';
    const cooldownAppliedMs = encountered429
      ? RATE_LIMIT_COOLDOWN_MS
      : ((index < batchScenarios.length - 1)
        ? SCENARIO_DELAY_MS
        : (batchIndex < BATCHES.length - 1 ? BATCH_DELAY_MS : 0));

    const baseResult = {
      id: scenario.id,
      label: scenario.label,
      batchId: batch.id,
      expected: scenario.expected,
      scenarioIndexInBatch: index,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      cooldownAppliedMs,
      encountered429,
      ...summary,
    };

    const evaluation = evaluateScenario(baseResult, scenario.expected);

    results.push({
      ...baseResult,
      ...evaluation,
    });

    if (cooldownAppliedMs > 0) {
      await sleep(cooldownAppliedMs);
    }
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
await fs.writeFile(REPORT_PATH, `${buildReport(results)}\n`, 'utf8');
process.stdout.write(JSON.stringify({ resultsPath: RESULTS_PATH, reportPath: REPORT_PATH, scenarioCount: results.length }, null, 2));
