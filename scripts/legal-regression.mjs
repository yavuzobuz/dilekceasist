/* global console, process */
import 'dotenv/config';

import { searchLegalDecisionsViaMcp } from '../lib/legal/mcpLegalSearch.js';

const CASES = [
    {
        id: 'hakaret',
        searchArea: 'ceza',
        expectedDomains: ['ceza'],
        query: 'hakaret sucu manevi unsur aleniyet',
    },
    {
        id: 'arama-el-koyma-suc-geliri',
        searchArea: 'ceza',
        expectedDomains: ['ceza'],
        query: 'arama el koyma suc geliri aklama tedbir karari',
    },
    {
        id: 'ise-iade-fesih',
        searchArea: 'hukuk',
        expectedDomains: ['is_hukuku', 'hukuk'],
        query: 'ise iade feshin gecersizligi',
    },
    {
        id: 'imar-barisi-yikim',
        searchArea: 'danistay',
        expectedDomains: ['idare'],
        query: 'imar barisi yapi kayit belgesi yikim karari',
    },
    {
        id: 'istinaf-esastan-ret',
        searchArea: 'bam',
        expectedDomains: ['istinaf'],
        query: 'istinaf basvurusu esastan ret',
    },
    {
        id: 'uzun-ceza-paragrafi',
        searchArea: 'ceza',
        expectedDomains: ['ceza'],
        query:
            'uyusturucu madde kamu davasi uyusturucu madde satisi kullanici tanik materyal mukayese kriminal rapor fiziki takip bilgiler calismalar sonucu suphelinin kimlik bilgileri yaptigi adres bilgilerinin uyumlu olmasi kolluk gorevlilerince kesintisiz takipte ikamete girip ciktigi',
    },
];

const EMPTY_RATE_THRESHOLD = 0.34;

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const classifyResultDomain = (item = {}) => {
    const detected = String(item?.primaryDetectedDomain || '').trim();
    if (detected) return detected;

    const haystack = normalizeText(
        [
            item?.source,
            item?.title,
            item?.daire,
            item?.mahkeme,
            item?.courtType,
            item?.ozet,
            item?.snippet,
        ].join(' ')
    );

    if (/anayasa mahkemesi|bireysel basvuru|hak ihlali|norm denetimi/.test(haystack)) return 'anayasa';
    if (/istinaf|bolge adliye|bam|esastan ret|esastan reddi/.test(haystack)) return 'istinaf';
    if (/danistay|idare mahkemesi|vergi mahkemesi|idari dava|imar|yapi kayit belgesi|encumen|yikim karari/.test(haystack)) return 'idare';
    if (/ceza|agir ceza|ceza dairesi|savcilik|sanik|supheli|mahkumiyet|beraat|tck|hakaret|uyusturucu/.test(haystack)) return 'ceza';
    if (/is mahkemesi|ise iade|feshin gecersizligi|iscilik|isci|isveren|kidem|ihbar|fazla mesai/.test(haystack)) return 'is_hukuku';
    if (/hukuk dairesi|asliye hukuk|asliye ticaret|ticaret|aile mahkemesi|tuketici|icra hukuk|menfi tespit|itirazin iptali/.test(haystack)) return 'hukuk';
    return 'unknown';
};

const summarizeTopResults = (results = []) =>
    results.slice(0, 3).map((item, index) => ({
        rank: index + 1,
        domain: classifyResultDomain(item),
        source: item?.source || '',
        title: String(item?.title || '').slice(0, 140),
        score: Number(item?.relevanceScore || 0),
    }));

const runCase = async (testCase) => {
    const startedAt = Date.now();
    const payload = await searchLegalDecisionsViaMcp({
        source: 'all',
        keyword: testCase.query,
        rawQuery: testCase.query,
        filters: { searchArea: testCase.searchArea },
    });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const top3 = summarizeTopResults(results);
    const wrongTop3 = top3.filter(
        (item) => item.domain !== 'unknown' && !testCase.expectedDomains.includes(item.domain)
    );

    return {
        id: testCase.id,
        searchArea: testCase.searchArea,
        expectedDomains: testCase.expectedDomains,
        durationMs: Date.now() - startedAt,
        resultCount: results.length,
        top3,
        wrongTop3Count: wrongTop3.length,
        passed: results.length > 0 && wrongTop3.length === 0,
        warning: payload?.warning || '',
    };
};

const main = async () => {
    const outputs = [];

    for (const testCase of CASES) {
        try {
            const output = await runCase(testCase);
            outputs.push(output);
            console.log(
                `[LEGAL_REGRESSION] ${output.passed ? 'PASS' : 'FAIL'} ${output.id} results=${output.resultCount} wrongTop3=${output.wrongTop3Count} durationMs=${output.durationMs}`
            );
            for (const item of output.top3) {
                console.log(
                    `  - #${item.rank} domain=${item.domain} source=${item.source} score=${item.score} title=${item.title}`
                );
            }
            if (output.warning) {
                console.log(`  warning=${output.warning}`);
            }
        } catch (error) {
            outputs.push({
                id: testCase.id,
                searchArea: testCase.searchArea,
                expectedDomains: testCase.expectedDomains,
                durationMs: 0,
                resultCount: 0,
                top3: [],
                wrongTop3Count: 0,
                passed: false,
                error: error?.message || String(error),
            });
            console.log(`[LEGAL_REGRESSION] FAIL ${testCase.id} error=${error?.message || error}`);
        }
    }

    const wrongDomainFailures = outputs.filter((item) => item.wrongTop3Count > 0).length;
    const emptyCount = outputs.filter((item) => item.resultCount === 0).length;
    const emptyRate = outputs.length > 0 ? emptyCount / outputs.length : 1;
    const passedCount = outputs.filter((item) => item.passed).length;

    console.log(
        `[LEGAL_REGRESSION] summary passed=${passedCount}/${outputs.length} wrongDomainFailures=${wrongDomainFailures} emptyCount=${emptyCount} emptyRate=${emptyRate.toFixed(2)}`
    );

    if (wrongDomainFailures > 0 || emptyRate > EMPTY_RATE_THRESHOLD) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error('[LEGAL_REGRESSION] fatal', error);
    process.exitCode = 1;
});
