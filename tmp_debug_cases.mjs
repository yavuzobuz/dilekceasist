import 'dotenv/config';
import { EventEmitter } from 'node:events';
import handler from './backend/legal/search-decisions.js';

const CASES = [
  {
    id: 'borclar-kira-ihtiyac',
    query: 'İhtiyaç nedeniyle tahliye, kiralananın tahliyesi, TBK 350',
    source: 'all',
    filters: { searchArea: 'hukuk' },
    legalSearchPacket: { caseType: 'borclar_kira' },
    mustConcepts: ['ihtiyac nedeniyle tahliye', 'kiralanan', 'tbk 350'],
  },
  {
    id: 'icra-itirazin-iptali',
    query: 'İİK 67 itirazın iptali, cari hesap alacağı, ticari defterler',
    source: 'all',
    filters: { searchArea: 'hukuk' },
    legalSearchPacket: { caseType: 'icra_ticari_itirazin_iptali' },
    mustConcepts: ['itirazin iptali', 'iik 67', 'cari hesap'],
  },
];

const invokeSearchHandler = (body) => new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.body = body;
    req.headers = {};

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { resolve({ statusCode: res.statusCode, payload }); };

    Promise.resolve(handler(req, res)).catch(reject);
});

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[İI]/g, 'i').replace(/[Şş]/g, 's').replace(/[Çç]/g, 'c')
    .replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const main = async () => {
  for (const cas of CASES) {
    console.log(`\n=============================================================`);
    console.log(`[CASE] ${cas.id}`);
    console.log(`Query: ${cas.query}`);
    
    // YARGI_CLI ve pipeline loglarını görmek için ENV değiştirilebilir ama 
    // şu an ana handler içinden gelen debug logs console.log(..) çalışıyor.

    const body = {
      query: cas.query,
      rawQuery: cas.query,
      source: cas.source,
      mode: 'pro',
      provider: 'auto',
      filters: cas.filters,
      legalSearchPacket: cas.legalSearchPacket,
      _debugMode: true
    };
    
    try {
      const { statusCode, payload } = await invokeSearchHandler(body);
      const results = payload?.results ?? payload?.decisions ?? [];
      const diagnostics = payload?.retrievalDiagnostics || {};
      
      console.log(`[RESULTS] Found ${results.length} docs. Status: ${statusCode}`);
      if (diagnostics.searchVariantAttempts) {
        console.log(`[VARIANTS] Bedesten queries attempted: ${diagnostics.searchVariantAttempts}`);
      }
      if (diagnostics.sourceCoverageStatus) {
        console.log(`[COVERAGE] ${diagnostics.sourceCoverageStatus}`);
      }

      // Check must hits in top 5
      const top5 = results.slice(0, 5);
      console.log(`[TOP-5 ANALYSIS]`);
      top5.forEach((r, i) => {
        const text = r.markdownContent || r.content || r.snippet || '';
        let hits = 0;
        const hitLog = cas.mustConcepts.map(c => {
          const hit = normalize(text).includes(normalize(c));
          if (hit) hits++;
          return hit ? `[Y] ${c}` : `[N] ${c}`;
        });
        console.log(`  #${i+1} score=${r.score} birim=${r.birimAdi||r.chamber} -> Hits: ${hits}/${cas.mustConcepts.length} (${hitLog.join(' | ')})`);
      });

    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
    }
  }
};

main();
