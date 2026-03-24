import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.LEGAL_SIMPLE_BEDESTEN_PROVIDER = 'cli';
process.env.LEGAL_SIMPLE_ALLOW_LEGACY_FALLBACK = '0';

const { default: handler } = await import('../backend/legal/search-decisions.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../output');
const RESULTS_PATH = path.join(OUTPUT_DIR, 'yargi-cli-live-results.json');
const REPORT_PATH = path.join(OUTPUT_DIR, 'yargi-cli-live-report.md');
const SCENARIO_DELAY_MS = 5000;
const BATCH_DELAY_MS = 22000;
const RATE_LIMIT_COOLDOWN_MS = 45000;

const SCENARIOS = [
  {
    id: 'aile-bosanma',
    label: 'Aile bosanma velayet nafaka',
    body: {
      source: 'all',
      keyword: 'bosanma velayet nafaka kisisel iliski',
      rawQuery: 'TMK 166 kapsaminda cekismeli bosanma, velayet, nafaka ve kisisel iliski duzenlenmesine iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'aile',
        caseType: 'aile_bosanma',
        preferredSource: 'yargitay',
        searchSeedText: 'bosanma velayet nafaka kisisel iliski',
        requiredConcepts: ['bosanma', 'velayet', 'nafaka'],
        supportConcepts: ['kisisel iliski', 'cocugun ustun yarari'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'borclar-kira',
    label: 'Borclar kira tahliye artirim',
    body: {
      source: 'all',
      keyword: 'kira sozlesmesi tahliye kira artisi itirazin kaldirilmasi',
      rawQuery: 'Kira sozlesmesinden kaynaklanan tahliye, kira artisi, icra mahkemesi itirazin kaldirilmasi ve finansal kiralama savunmasina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'borclar',
        caseType: 'borclar_kira',
        preferredSource: 'yargitay',
        searchSeedText: 'kira sozlesmesi tahliye kira artisi',
        requiredConcepts: ['kira sozlesmesi', 'tahliye'],
        supportConcepts: ['kira artisi', 'itirazin kaldirilmasi'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'gayrimenkul-tapu',
    label: 'Gayrimenkul tapu iptali muris muvazaasi',
    body: {
      source: 'all',
      keyword: 'tapu iptali tescil muris muvazaasi',
      rawQuery: 'Muris muvazaasi nedeniyle tapu iptali ve tescil, yolsuz tescil ve miras birakanin gercek iradesine iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'gayrimenkul',
        caseType: 'gayrimenkul_tapu',
        preferredSource: 'yargitay',
        searchSeedText: 'tapu iptali tescil muris muvazaasi',
        requiredConcepts: ['tapu iptali', 'tescil', 'muris muvazaasi'],
        supportConcepts: ['yolsuz tescil', 'miras birakanin gercek iradesi'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'miras-tenkis',
    label: 'Miras tenkis sakli pay',
    body: {
      source: 'all',
      keyword: 'tenkis sakli pay miras paylasma',
      rawQuery: 'Sakli payin ihlali, tenkis istemi ve miras paylasimina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'miras',
        caseType: 'miras_tenkis',
        preferredSource: 'yargitay',
        searchSeedText: 'tenkis sakli pay miras paylasma',
        requiredConcepts: ['tenkis', 'sakli pay'],
        supportConcepts: ['miras paylasma', 'miras payi'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'tuketici-ayipli-mal',
    label: 'Tuketici ayipli mal iade degisim',
    body: {
      source: 'all',
      keyword: 'ayipli mal bedel iadesi degisim garanti',
      rawQuery: 'Ayipli mal nedeniyle bedel iadesi, degisim ve garanti kapsamindaki tuketici uyusmazligina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'tuketici',
        caseType: 'tuketici_ayipli_mal',
        preferredSource: 'yargitay',
        searchSeedText: 'ayipli mal bedel iadesi degisim garanti',
        requiredConcepts: ['ayipli mal', 'bedel iadesi'],
        supportConcepts: ['degisim', 'garanti'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'sigorta-trafik',
    label: 'Sigorta trafik deger kaybi tazminat',
    body: {
      source: 'all',
      keyword: 'trafik kazasi deger kaybi sigorta tazminat',
      rawQuery: 'Trafik kazasi nedeniyle deger kaybi, destekten yoksun kalma ve sigorta sirketinin tazminat sorumluluguna iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'sigorta',
        caseType: 'sigorta_deger_kaybi',
        preferredSource: 'yargitay',
        searchSeedText: 'trafik kazasi deger kaybi sigorta tazminat',
        requiredConcepts: ['trafik kazasi', 'sigorta tazminati'],
        supportConcepts: ['deger kaybi', 'destekten yoksun kalma'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'ticaret-marka-tescil',
    label: 'Ticaret marka tescil iltibas',
    body: {
      source: 'all',
      keyword: 'marka tescil iltibas hukumsuzluk haksiz rekabet',
      rawQuery: 'Tescilli markaya iltibas olusturan kullanim, marka hukumsuzlugu, tecavuz ve haksiz rekabete iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'ticaret',
        caseType: 'ticaret_marka_iltibas',
        preferredSource: 'yargitay',
        searchSeedText: 'marka tescil iltibas hukumsuzluk haksiz rekabet',
        requiredConcepts: ['marka hakki', 'haksiz rekabet', 'iltibas'],
        supportConcepts: ['tescil', 'hukumsuzluk', 'tecavuz'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'ticaret-genel-kurul',
    label: 'Ticaret anonim sirket genel kurul iptali',
    body: {
      source: 'all',
      keyword: 'anonim sirket genel kurul karari iptali pay sahipligi',
      rawQuery: 'Anonim sirket genel kurul kararinin iptali, pay sahipligi, hazirun cetveli ve cagri usulsuzluguna iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'ticaret',
        caseType: 'ticaret_genel_kurul',
        preferredSource: 'yargitay',
        searchSeedText: 'anonim sirket genel kurul karari iptali pay sahipligi',
        requiredConcepts: ['anonim sirket', 'genel kurul', 'iptal'],
        supportConcepts: ['pay sahipligi', 'hazirun cetveli', 'cagri usulsuzlugu'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'ticaret-konkordato',
    label: 'Ticaret konkordato iflas sira cetveli',
    body: {
      source: 'all',
      keyword: 'konkordato iflas sira cetveli kayit kabul terkin',
      rawQuery: 'Konkordato tasdiki, iflas, sira cetveli ve kayit kabul-terkin istemlerine iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'ticaret',
        caseType: 'ticaret_konkordato_iflas',
        preferredSource: 'yargitay',
        searchSeedText: 'konkordato iflas sira cetveli kayit kabul terkin',
        requiredConcepts: ['konkordato', 'iflas'],
        supportConcepts: ['sira cetveli', 'kayit kabul', 'terkin'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'icra-itirazin-iptali',
    label: 'Icra ticari itirazin iptali IIK 67',
    body: {
      source: 'all',
      keyword: 'itirazin iptali iik 67 cari hesap icra inkar',
      rawQuery: 'Cari hesap ve ticari defter iliskisine dayali itirazin iptali, IIK 67 ve icra inkar tazminatina iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'icra',
        caseType: 'icra_ticari_itirazin_iptali',
        preferredSource: 'yargitay',
        searchSeedText: 'itirazin iptali iik 67 cari hesap icra inkar',
        requiredConcepts: ['itirazin iptali', 'IIK 67', 'cari hesap'],
        supportConcepts: ['icra inkar tazminati', 'ticari defter'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'icra-haciz',
    label: 'Icra prosedur haciz sikayet',
    body: {
      source: 'all',
      keyword: 'haciz sikayet itirazin kaldirilmasi icra mahkemesi',
      rawQuery: 'Icra mahkemesinde haciz, haczedilemezlik sikayeti, itirazin kaldirilmasi ve kambiyo takibinin prosedurune iliskin Yargitay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'icra',
        caseType: 'icra_haciz',
        preferredSource: 'yargitay',
        searchSeedText: 'haciz sikayet itirazin kaldirilmasi icra mahkemesi',
        requiredConcepts: ['haciz', 'sikayet', 'icra mahkemesi'],
        supportConcepts: ['itirazin kaldirilmasi', 'kambiyo takibi'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'idare-imar',
    label: 'Idare imar para cezasi yikim',
    body: {
      source: 'all',
      keyword: 'imar para cezasi yikim karari ruhsat iptali',
      rawQuery: 'Imar para cezasi, yikim karari ve ruhsat iptaline iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_imar',
        preferredSource: 'danistay',
        searchSeedText: 'imar para cezasi yikim karari ruhsat iptali',
        requiredConcepts: ['imar para cezasi', 'yikim karari'],
        supportConcepts: ['ruhsat iptali', 'kazanilmis hak'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'idare-kamu-ihale',
    label: 'Idare kamu ihale 4734',
    body: {
      source: 'all',
      keyword: 'kamu ihale 4734 ihale iptal rekabet',
      rawQuery: '4734 sayili Kanun kapsaminda kamu ihale sureci, ihale iptali ve rekabet ilkesine iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_kamu_ihale',
        preferredSource: 'danistay',
        searchSeedText: 'kamu ihale 4734 ihale iptal rekabet',
        requiredConcepts: ['kamu ihale', '4734'],
        supportConcepts: ['ihale iptal', 'rekabet'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'idare-disiplin',
    label: 'Idare disiplin savunma hakki',
    body: {
      source: 'all',
      keyword: 'disiplin cezasi savunma hakki ihrac memurluk',
      rawQuery: 'Memuriyetten cikarma, disiplin cezasi, savunma hakki ve olcululuk ilkesine iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'idare',
        caseType: 'idare_disiplin',
        preferredSource: 'danistay',
        searchSeedText: 'disiplin cezasi savunma hakki ihrac memurluk',
        requiredConcepts: ['disiplin cezasi', 'savunma hakki'],
        supportConcepts: ['ihrac', 'memurluk'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'vergi-kdv',
    label: 'Vergi KDV sahte fatura tarhiyat',
    body: {
      source: 'all',
      keyword: 'kdv sahte fatura vergi ziya tarhiyat',
      rawQuery: 'Sahte fatura kullanimi iddiasina dayali KDV indirimi reddi, vergi ziya cezasi ve tarhiyat islemine iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'vergi',
        caseType: 'vergi_kdv_sahte_fatura',
        preferredSource: 'danistay',
        searchSeedText: 'kdv sahte fatura vergi ziya tarhiyat',
        requiredConcepts: ['sahte fatura', 'KDV indirimi', 'vergi ziya'],
        supportConcepts: ['tarhiyat', 'vergi inceleme raporu'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'vergi-gumruk',
    label: 'Vergi gumruk otv ithalat',
    body: {
      source: 'all',
      keyword: 'gumruk otv ithalat tarhiyat',
      rawQuery: 'Gumruk vergileri, ithalde KDV ve OTV tarhiyatina iliskin Danistay emsal kararlar araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'vergi',
        caseType: 'vergi_gumruk_otv',
        preferredSource: 'danistay',
        searchSeedText: 'gumruk otv ithalat tarhiyat',
        requiredConcepts: ['gumruk', 'otv'],
        supportConcepts: ['ithalat', 'tarhiyat'],
        fallbackToNext: false
      }
    }
  },
  {
    id: 'anayasa-bireysel-basvuru',
    label: 'Anayasa bireysel basvuru makul sure',
    body: {
      source: 'anayasa',
      keyword: 'anayasa mahkemesi bireysel basvuru makul sure adil yargilanma',
      rawQuery: 'Adil yargilanma hakki ile makul sure ihlali iddiasina dayali bireysel basvuru kararlarina iliskin emsal araniyor.',
      searchMode: 'pro',
      filters: {},
      legalSearchPacket: {
        primaryDomain: 'anayasa',
        caseType: 'anayasa_bireysel_basvuru_makul_sure',
        preferredSource: 'anayasa',
        searchSeedText: 'anayasa mahkemesi bireysel basvuru makul sure adil yargilanma',
        requiredConcepts: ['bireysel basvuru', 'makul sure', 'adil yargilanma'],
        supportConcepts: ['ihlal', 'yeniden yargilama'],
        fallbackToNext: false
      }
    }
  }
];

const BATCHES = [
  {
    id: 'batch-civil-yargitay',
    scenarioIds: ['aile-bosanma', 'borclar-kira', 'gayrimenkul-tapu', 'miras-tenkis', 'tuketici-ayipli-mal', 'sigorta-trafik'],
  },
  {
    id: 'batch-commercial-icra-yargitay',
    scenarioIds: ['ticaret-marka-tescil', 'ticaret-genel-kurul', 'ticaret-konkordato', 'icra-itirazin-iptali', 'icra-haciz'],
  },
  {
    id: 'batch-danistay-anayasa',
    scenarioIds: ['idare-imar', 'idare-kamu-ihale', 'idare-disiplin', 'vergi-kdv', 'vergi-gumruk', 'anayasa-bireysel-basvuru'],
  },
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
  return {
    resultCount: results.length,
    detectedDomain: payload?.skillDiagnostics?.primaryDomain || payload?.aiSearchPlan?.primaryDomain || payload?.retrievalDiagnostics?.primaryDomain || null,
    retrievalDiagnostics: payload?.retrievalDiagnostics || null,
    topResults: results.slice(0, 5).map((item) => ({
      title: item?.title || '',
      daire: item?.daire || '',
      source: item?.source || '',
      summaryPreview: String(item?.summaryText || item?.ozet || item?.snippet || '').slice(0, 220),
    })),
    zeroResultMessage: payload?.zeroResultMessage || payload?.diagnostics?.zeroResultMessage || null,
    error: payload?.error || null,
  };
}

function buildReport(results) {
  const lines = ['# Yargi CLI Live Report', ''];
  for (const item of results) {
    lines.push(`## ${item.label}`);
    lines.push(`- batchId: ${item.batchId}`);
    lines.push(`- durationMs: ${item.durationMs}`);
    lines.push(`- resultCount: ${item.resultCount}`);
    lines.push(`- detectedDomain: ${item.detectedDomain || 'n/a'}`);
    lines.push(`- selectedBirimAdi: ${item.retrievalDiagnostics?.selectedBirimAdi || 'n/a'}`);
    lines.push(`- firstSuccessfulBirimAdi: ${item.retrievalDiagnostics?.firstSuccessfulBirimAdi || 'n/a'}`);
    lines.push(`- routingMode: ${item.retrievalDiagnostics?.routingMode || 'n/a'}`);
    lines.push(`- acceptedTopResultDaireler: ${(item.retrievalDiagnostics?.acceptedTopResultDaireler || []).join(', ') || 'n/a'}`);
    lines.push(`- compatibilityFilteredOutCount: ${item.retrievalDiagnostics?.compatibilityFilteredOutCount ?? 'n/a'}`);
    lines.push(`- contentRerankApplied: ${item.retrievalDiagnostics?.contentRerankApplied ?? 'n/a'}`);
    lines.push(`- strictPrecisionGateApplied: ${item.retrievalDiagnostics?.strictPrecisionGateApplied ?? 'n/a'}`);
    lines.push(`- sourceCoverageStatus: ${item.retrievalDiagnostics?.sourceCoverageStatus || 'n/a'}`);
    lines.push(`- phaseAttemptSummary: ${JSON.stringify(item.retrievalDiagnostics?.phaseAttemptSummary || [])}`);
    lines.push(`- simpleQualityScore: ${item.retrievalDiagnostics?.simpleQualityScore ?? 'n/a'}`);
    lines.push(`- queryVariantCount: ${item.retrievalDiagnostics?.queryVariants?.length ?? 0}`);
    lines.push(`- birimCandidateCount: ${item.retrievalDiagnostics?.birimAdiCandidates?.length ?? 0}`);
    lines.push(`- finalMatchedCount: ${item.retrievalDiagnostics?.finalMatchedCount ?? 'n/a'}`);
    lines.push(`- encountered429: ${item.encountered429}`);
    lines.push(`- cooldownAppliedMs: ${item.cooldownAppliedMs}`);
    lines.push(`- zeroResultReason: ${item.retrievalDiagnostics?.zeroResultReason || 'n/a'}`);
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

    results.push({
      id: scenario.id,
      label: scenario.label,
      batchId: batch.id,
      scenarioIndexInBatch: index,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      cooldownAppliedMs,
      encountered429,
      ...summary,
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
