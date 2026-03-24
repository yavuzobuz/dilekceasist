/**
 * 5 Hukuk Dalı Canlı Alaka Testi
 * Kullanım: node scripts/live-alaka-testi.mjs
 *
 * bedesten.adalet.gov.tr'ye gerçek HTTP istekleri atar.
 * Her hukuk dalı için:
 *   - Kaç sonuç döndü
 *   - Sonuçların kaçı domain ile alakalı (birimAdi / ozet içinde beklenen terimler)
 *   - Alaka %'si
 */

import { searchLegalDecisionsViaSimpleBedesten } from '../lib/legal/simpleBedestenService.js';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/\u0131/g, 'i').replace(/\u0130/g, 'i')
        .replace(/\u015f|\u015e/g, 's')
        .replace(/\u011f|\u011e/g, 'g')
        .replace(/\u00fc|\u00dc/g, 'u')
        .replace(/\u00f6|\u00d6/g, 'o')
        .replace(/\u00e7|\u00c7/g, 'c')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function resultHaystack(result = {}) {
    return normalizeText([
        result.title,
        result.daire,
        result.ozet,
        result.snippet,
        result.summaryText,
    ].filter(Boolean).join(' '));
}

function verdictColor(pct) {
    if (pct >= 75) return GREEN;
    if (pct >= 50) return YELLOW;
    return RED;
}

const TEST_CASES = [
    {
        id: 'is_hukuku',
        label: 'İş Hukuku — İşe İade & Tazminat',
        request: {
            source: 'all',
            keyword: 'ise iade gecersiz fesih kidem tazminati',
            rawQuery: 'Gecersiz fesih nedeniyle ise iade ve kidem tazminati talebi',
            filters: { searchArea: 'hukuk' },
            provider: 'http',
            legalSearchPacket: {
                primaryDomain: 'is_hukuku',
                preferredSource: 'yargitay',
                searchSeedText: 'ise iade gecersiz fesih kidem tazminati',
                requiredConcepts: ['ise iade', 'gecersiz fesih', 'kidem tazminati'],
            },
        },
        relevanceTerms: ['ise iade', 'gecersiz fesih', 'kidem tazminati', 'ihbar', 'fazla mesai', 'is sozlesmesi'],
        expectedBirimKeywords: ['hukuk dairesi', 'hukuk genel kurulu', '9. hukuk', '22. hukuk'],
    },
    {
        id: 'ceza',
        label: 'Ceza Hukuku — Uyuşturucu TCK 188',
        request: {
            source: 'all',
            keyword: 'uyusturucu madde ticareti tck 188',
            rawQuery: 'Uyusturucu madde ticareti TCK 188 ticaret kasti kisisel kullanim ayirt etme',
            filters: { searchArea: 'ceza' },
            provider: 'http',
            legalSearchPacket: {
                primaryDomain: 'ceza',
                preferredSource: 'yargitay',
                searchSeedText: 'uyusturucu madde ticareti tck 188',
                requiredConcepts: ['uyusturucu madde ticareti', 'tck 188', 'kisisel kullanim'],
            },
        },
        relevanceTerms: ['uyusturucu', 'tck 188', 'ticaret kasti', 'kisisel kullanim', 'madde', 'ceza'],
        expectedBirimKeywords: ['ceza dairesi', 'ceza genel kurulu', '10. ceza', '20. ceza'],
    },
    {
        id: 'aile',
        label: 'Aile Hukuku — Boşanma & Velayet',
        request: {
            source: 'all',
            keyword: 'bosanma velayet nafaka',
            rawQuery: 'Evlilik birliginin temelden sarsilmasi nedeniyle bosanma velayet ve yoksulluk nafakasi',
            filters: { searchArea: 'hukuk' },
            provider: 'http',
            legalSearchPacket: {
                primaryDomain: 'aile',
                preferredSource: 'yargitay',
                searchSeedText: 'bosanma velayet nafaka',
                requiredConcepts: ['bosanma', 'velayet', 'nafaka'],
            },
        },
        relevanceTerms: ['bosanma', 'velayet', 'nafaka', 'evlilik birligi', 'cocuk', 'kusur'],
        expectedBirimKeywords: ['hukuk dairesi', '2. hukuk', 'hukuk genel kurulu'],
    },
    {
        id: 'idare',
        label: 'İdare Hukuku — İmar Cezası & İptal',
        request: {
            source: 'danistay',
            keyword: 'imar para cezasi yikim karari iptal',
            rawQuery: 'Ruhsatsiz yapi nedeniyle verilen imar para cezasi ve yikim kararinin iptali',
            filters: {},
            provider: 'http',
            legalSearchPacket: {
                primaryDomain: 'idare',
                preferredSource: 'danistay',
                searchSeedText: 'imar para cezasi yikim iptal',
                requiredConcepts: ['imar para cezasi', 'yikim', 'iptal davasi'],
            },
        },
        relevanceTerms: ['imar', 'yikim', 'iptal', 'encumen', 'idari islem', 'para cezasi'],
        expectedBirimKeywords: ['danistay', 'idari dava', 'daire', 'vergi dava'],
    },
    {
        id: 'ticaret',
        label: 'Ticaret Hukuku — Haksız Rekabet & Marka',
        request: {
            source: 'all',
            keyword: 'haksiz rekabet marka hakki',
            rawQuery: 'Marka hakki ihlali nedeniyle haksiz rekabet tazminati ve tecavuzun men talebi',
            filters: { searchArea: 'hukuk' },
            provider: 'http',
            legalSearchPacket: {
                primaryDomain: 'ticaret',
                preferredSource: 'yargitay',
                searchSeedText: 'haksiz rekabet marka hakki ihlali',
                requiredConcepts: ['haksiz rekabet', 'marka hakki', 'tecavuz'],
            },
        },
        relevanceTerms: ['haksiz rekabet', 'marka', 'tecavuz', 'tazminat', 'ttk', 'smarkasi'],
        expectedBirimKeywords: ['hukuk dairesi', '11. hukuk', 'hukuk genel kurulu'],
    },
];

function computeRelevance(results = [], terms = [], birimKeywords = []) {
    if (results.length === 0) return { relevantCount: 0, totalCount: 0, pct: 0, termHitsByResult: [] };

    const termHitsByResult = results.map((result) => {
        const haystack = resultHaystack(result);
        const termHits = terms.filter((t) => haystack.includes(normalizeText(t)));
        const birimHit = birimKeywords.some((b) => haystack.includes(normalizeText(b)));
        return { termHits, birimHit, isRelevant: termHits.length >= 1 || birimHit };
    });

    const relevantCount = termHitsByResult.filter((r) => r.isRelevant).length;
    const pct = Math.round((relevantCount / results.length) * 100);

    return { relevantCount, totalCount: results.length, pct, termHitsByResult };
}

async function runCase(tc) {
    const startedAt = Date.now();
    let payload = null;
    let error = null;

    try {
        payload = await searchLegalDecisionsViaSimpleBedesten(tc.request);
    } catch (err) {
        error = err;
    }

    const durationMs = Date.now() - startedAt;
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const diag = payload?.retrievalDiagnostics || {};
    const relevance = computeRelevance(results, tc.relevanceTerms, tc.expectedBirimKeywords);

    return { tc, durationMs, results, diag, relevance, error };
}

function printResult(run) {
    const { tc, durationMs, results, diag, relevance, error } = run;
    const { pct, relevantCount, totalCount, termHitsByResult } = relevance;
    const color = verdictColor(pct);

    console.log(`\n${BOLD}${CYAN}━━ ${tc.label}${RESET}`);

    if (error) {
        console.log(`  ${RED}HATA: ${error.message}${RESET}`);
        return;
    }

    console.log(`  Sonuç sayısı : ${BOLD}${totalCount}${RESET}`);
    console.log(`  Alakalı      : ${BOLD}${color}${relevantCount}/${totalCount} (${pct}%)${RESET}`);
    console.log(`  Süre         : ${DIM}${durationMs} ms${RESET}`);
    console.log(`  Domain       : ${DIM}${diag.primaryDomain || 'n/a'}${RESET}`);
    console.log(`  Mahkeme      : ${DIM}${(diag.targetSources || []).join(', ') || 'n/a'}${RESET}`);
    console.log(`  Sorgu        : ${DIM}${diag.searchPhrase || diag.selectedQueryVariant || 'n/a'}${RESET}`);

    if (totalCount > 0) {
        console.log(`\n  ${BOLD}İlk 3 sonuç:${RESET}`);
        results.slice(0, 3).forEach((r, i) => {
            const hits = termHitsByResult[i];
            const flag = hits?.isRelevant ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
            const hitStr = hits?.termHits?.length > 0 ? ` ${DIM}[${hits.termHits.join(', ')}]${RESET}` : '';
            console.log(`    ${flag} ${r.daire || r.title || '?'} — ${String(r.ozet || r.snippet || '').slice(0, 80)}${hitStr}`);
        });
    }
}

function printSummary(runs) {
    const valid = runs.filter((r) => !r.error);
    if (valid.length === 0) return;

    const totalPct = valid.reduce((s, r) => s + r.relevance.pct, 0);
    const avgPct = Math.round(totalPct / valid.length);
    const avgDur = Math.round(valid.reduce((s, r) => s + r.durationMs, 0) / valid.length);
    const color = verdictColor(avgPct);

    console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${BOLD}GENEL ÖZET${RESET}`);
    console.log(`${'─'.repeat(47)}`);
    console.log(`  Test sayısı          : ${valid.length}`);
    console.log(`  Ortalama alaka       : ${BOLD}${color}%${avgPct}${RESET}`);
    console.log(`  Ortalama süre        : ${DIM}${avgDur} ms${RESET}`);
    console.log();
    console.log(`  ${BOLD}Dal bazlı alaka:${RESET}`);
    for (const r of valid) {
        const c = verdictColor(r.relevance.pct);
        const bar = '█'.repeat(Math.round(r.relevance.pct / 10)).padEnd(10, '░');
        console.log(`    ${r.tc.id.padEnd(12)} ${c}${bar}${RESET} %${String(r.relevance.pct).padStart(3)} (${r.relevance.relevantCount}/${r.relevance.totalCount})`);
    }
    console.log();
}

async function main() {
    console.log(`\n${BOLD}5 Hukuk Dalı Canlı Alaka Testi${RESET}`);
    console.log(`${'─'.repeat(47)}`);
    console.log(`Hedef: bedesten.adalet.gov.tr (HTTP)\n`);

    const runs = [];
    for (const tc of TEST_CASES) {
        process.stdout.write(`⏳ ${tc.label}...`);
        const run = await runCase(tc);
        runs.push(run);
        process.stdout.write('\r\x1b[K');
        printResult(run);
    }

    printSummary(runs);
}

main().catch((err) => {
    console.error(`\nKritik hata: ${err.message}`);
    process.exit(1);
});
