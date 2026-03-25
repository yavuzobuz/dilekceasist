/**
 * tmp_retrieval_debug.mjs
 * Her iki vakayı legal-search API üzerinden çalıştırır ve pipeline adımlarını raporlar.
 * YARGI_CLI_DEBUG=1 çevre değişkeniyle çalıştırın.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';

const BASE = 'http://localhost:3001';

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

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[İI]/g, 'i').replace(/[Şş]/g, 's').replace(/[Çç]/g, 'c')
    .replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function checkMust(doc, concepts) {
  const norm = normalize(doc);
  return concepts.map(c => ({ concept: c, hit: norm.includes(normalize(c)) }));
}

async function runCase(cas) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CASE: ${cas.id}`);
  console.log(`Query: ${cas.query}`);
  console.log(`mustConcepts: ${cas.mustConcepts.join(', ')}`);
  console.log('='.repeat(70));

  const body = {
    query: cas.query,
    source: cas.source,
    filters: cas.filters,
    legalSearchPacket: cas.legalSearchPacket,
    _debugMode: true,
  };

  const res = await fetch(`${BASE}/api/legal-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  const results = payload?.results ?? payload?.decisions ?? [];

  console.log(`\n[STEP] API response status: ${res.status}`);
  console.log(`[STEP] Total results returned: ${results.length}`);

  if (results.length === 0) {
    console.log('[WARN] Sıfır sonuç döndü — arama boş kaldı.');
    return;
  }

  // Top 5 analiz
  const top5 = results.slice(0, 5);
  console.log(`\n[STEP] Top-5 karar analizi:`);
  top5.forEach((r, i) => {
    const content = r.markdownContent || r.content || r.snippet || '';
    const hits = checkMust(content, cas.mustConcepts);
    const hitCount = hits.filter(h => h.hit).length;
    console.log(`\n  #${i + 1} docId=${r.documentId || r.id || '?'} birim="${r.birimAdi || r.chamber || '?'}" score=${r.score ?? '?'}`);
    console.log(`       mustHits: ${hitCount}/${cas.mustConcepts.length}`);
    hits.forEach(h => console.log(`         [${h.hit ? '✓' : '✗'}] "${h.concept}"`));
    if (content) {
      // mustConcept etrafından 80 char snippet
      cas.mustConcepts.forEach(c => {
        const normContent = normalize(content);
        const idx = normContent.indexOf(normalize(c));
        if (idx >= 0) {
          const snippet = content.substring(Math.max(0, idx - 40), idx + 80).replace(/\n/g, ' ');
          console.log(`         snippet("${c}"): ...${snippet}...`);
        }
      });
    } else {
      console.log('       [WARN] content/markdownContent yok');
    }
  });

  // Tüm sonuçlarda herhangi bir mustConcept var mı?
  console.log(`\n[STEP] Tüm ${results.length} sonuçta mustConcept varlığı:`);
  cas.mustConcepts.forEach(c => {
    const matchCount = results.filter(r => {
      const txt = r.markdownContent || r.content || r.snippet || '';
      return normalize(txt).includes(normalize(c));
    }).length;
    console.log(`  "${c}": ${matchCount}/${results.length} kararda mevcut`);
  });

  // Retrieval diagnostics varsa göster
  if (payload?.retrievalDiagnostics) {
    console.log('\n[STEP] retrievalDiagnostics:');
    console.log(JSON.stringify(payload.retrievalDiagnostics, null, 2));
  }
}

try {
  for (const cas of CASES) {
    await runCase(cas);
  }
} catch (err) {
  console.error('[FATAL]', err.message);
  if (err.message.includes('ECONNREFUSED')) {
    console.error('Dev server çalışmıyor — önce `npm run dev` başlatın ve port numarasını kontrol edin.');
  }
}
