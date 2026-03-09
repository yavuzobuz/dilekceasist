/* global console, process */
import 'dotenv/config';

import { searchLegalDecisionsViaMcp } from '../lib/legal/mcpLegalSearch.js';

const CASE_GROUPS = {
    ceza: {
        source: 'all',
        searchArea: 'ceza',
        expectedDomains: ['ceza'],
        cases: [
            ['hakaret-aleniyet', 'hakaret sucu manevi unsur aleniyet'],
            ['uyusturucu-ayrimi', 'uyusturucu madde ticareti kullanmak icin bulundurma ayrimi'],
            ['yaralama-tahrik', 'kasten yaralama haksiz tahrik indirimi'],
            ['dolandiricilik-hesap', 'nitelikli dolandiricilik banka hesabinin kullandirilmasi'],
            ['tehdit-delil', 'tehdit sucu ses kaydi delil degerlendirmesi'],
            ['mala-zarar', 'mala zarar verme sucu uzlasma kapsaminda mi'],
            ['resmi-belge', 'resmi belgede sahtecilik aldatma yetenegi'],
            ['kart-kotuye-kullanma', 'banka veya kredi kartinin kotuye kullanilmasi zincirleme suc'],
            ['oldurmeye-tesebbus', 'kasten oldurmeye tesebbus olasi kast ayrimi'],
            ['uyusturucu-etkin-pismanlik', 'uyusturucu madde ticareti etkin pismanlik uygulamasi'],
            ['mesru-mudafaa', 'kasten yaralama mesru mudafaa sinirlari'],
            ['adli-kontrol', 'tutuklamaya itiraz adli kontrol olcululuk'],
            ['iletisimin-tespiti', 'iletisimin tespiti hukuka aykiri delil'],
            ['zincirleme-dolandiricilik', 'nitelikli dolandiricilik zincirleme suc hukumleri'],
            ['cinsel-taciz', 'cinsel taciz sucu mesaj icerigi delil degeri'],
        ],
    },
    idare: {
        source: 'all',
        searchArea: 'auto',
        expectedDomains: ['idare'],
        cases: [
            ['imar-plani-iptal', 'imar plani iptal davasi sehircilik ilkeleri'],
            ['yikim-karari', 'belediye encumen yikim karari ruhsatsiz yapi'],
            ['disiplin-savunma', 'memur disiplin cezasi savunma hakki'],
            ['ihale-yasaklama', 'kamu ihalelerinden yasaklama karari olcululuk'],
            ['vergi-cezasi', 'vergi cezasi uzlasma dava acma suresi'],
            ['kamulastirmasiz-el-atma', 'kamulastirmasiz el atma bedel tespiti ve tazminat'],
            ['imar-para-cezasi', 'imar para cezasi ruhsat ve eklerine aykirilik'],
            ['yapi-tatil', 'yapi tatil tutanagi tebligat usulsuzlugu'],
            ['atama-islemi', 'memurun naklen atama islemi aile birligi mazereti'],
            ['ogrenci-disiplin', 'universite ogrencisi disiplin cezasi savunma alinmasi'],
            ['cevre-cezasi', 'cevre kanunu idari para cezasi tutanak hukuka aykirilik'],
            ['ruhsat-iptali', 'isyeri acma ve calisma ruhsati iptali'],
            ['sahte-fatura', 'sahte fatura nedeniyle kdv indiriminin reddi'],
            ['gorevde-yukselme', 'gorevde yukselme sinavi puanlama islemi iptali'],
            ['ihale-iptali', 'ihale isleminin iptali esit muamele ilkesi'],
        ],
    },
    hukuk: {
        source: 'all',
        searchArea: 'hukuk',
        expectedDomains: ['hukuk'],
        cases: [
            ['muris-muvazaasi', 'tapu iptal tescil muris muvazaasi'],
            ['ziynet-alacagi', 'ziynet alacagi ispat yuku'],
            ['eser-sozlesmesi', 'eser sozlesmesi ayipli ifa bedel indirimi'],
            ['trafik-tazminat', 'trafik kazasi maddi tazminat kusur indirimi'],
            ['kira-temerrut', 'kira alacagi tahliye temerrut ihtari'],
            ['ortakligin-giderilmesi', 'ortakligin giderilmesi davasi satis sureci'],
            ['ecrimisil', 'ecrimisil davasi haksiz isgal tazminati'],
            ['tenkis', 'tenkis davasi sakli pay ihlali'],
            ['vekalet-gorevi', 'vekalet gorevinin kotuye kullanilmasi tazminat'],
            ['ayipli-arac', 'ayipli arac satisi misli ile degisim'],
            ['tuketici-kredisi', 'tuketici kredisi erken odeme komisyonu'],
            ['kat-mulkiyeti', 'kat mulkiyeti aidat alacagi ortak gider'],
            ['komsuluk-hukuku', 'komsuluk hukuku su basmasi zarari'],
            ['kisilik-hakki', 'kisilik hakkinin ihlali manevi tazminat internet yayini'],
            ['sigorta-tazminati', 'sigorta tazminati riziko ihbari suresi'],
        ],
    },
    icra: {
        source: 'all',
        searchArea: 'auto',
        expectedDomains: ['icra', 'hukuk'],
        cases: [
            ['itirazin-iptali', 'itirazin iptali icra inkar tazminati'],
            ['menfi-tespit', 'menfi tespit davasi odeme emrine itiraz'],
            ['kambiyo-itiraz', 'kambiyo senedine mahsus haciz yolunda imzaya itiraz'],
            ['istirdat', 'istirdat davasi icra takibinde sebepsiz tahsilat'],
            ['haczedilmezlik', 'haczedilmezlik sikayeti maas haczi'],
            ['tasarrufun-iptali', 'tasarrufun iptali davasi aciz belgesi kosulu'],
            ['itirazin-kaldirilmasi', 'itirazin kaldirilmasi imzaya itiraz incelemesi'],
            ['icranin-geri-birakilmasi', 'icranin geri birakilmasi tehiri icra karari'],
            ['sira-cetveli', 'sira cetveline itiraz derece ve sira'],
            ['ihalenin-feshi', 'ihalenin feshi kiymet takdiri tebligati'],
            ['rehnin-paraya-cevrilmesi', 'rehnin paraya cevrilmesi yolu ile takip'],
            ['haciz-ihbarnamesi', 'haciz ihbarnamesine ucuncu kisinin itirazi'],
            ['gecikmis-itiraz', 'gecikmis itiraz kusursuz engel'],
            ['istihkak', 'istihkak davasi haczedilen malin ucuncu kisiye ait olmasi'],
            ['tahliye-taahhudu', 'tahliye taahhudune dayali ilamli tahliye takibi'],
        ],
    },
    aile: {
        source: 'all',
        searchArea: 'auto',
        expectedDomains: ['aile', 'hukuk'],
        cases: [
            ['bosanma-velayet', 'bosanma davasinda velayet ve kisisel iliski duzenlenmesi'],
            ['ziynet-alacagi', 'ziynet esyasi alacagi ve ispat'],
            ['nafaka-artirim', 'yoksulluk nafakasi artirim davasi'],
            ['mal-rejimi', 'edinilmis mallara katilma alacagi'],
            ['soybagi', 'soybaginin reddi ve dna incelemesi'],
            ['kisisel-iliski-kaldirma', 'cocukla kisisel iliskinin kaldirilmasi'],
            ['uzaklastirma', '6284 sayili kanun kapsaminda uzaklastirma karari'],
            ['babalik', 'babalik davasi dna testi ve ispat'],
            ['aile-konutu', 'aile konutu serhi ve tahsis talebi'],
            ['nisan-hediyeleri', 'nisanin bozulmasi nedeniyle hediyelerin iadesi'],
            ['evlat-edinme', 'evlat edinme sartlari ve cocugun ustun yarari'],
            ['velayet-degisikligi', 'velayetin degistirilmesi cocugun ustun yarari'],
            ['nafaka-kaldirma', 'nafakanin kaldirilmasi gelir durumunun degismesi'],
            ['deger-artis-payi', 'mal rejiminde deger artis payi alacagi'],
            ['cocuk-teslimi', 'cocuk teslimi emri ve icra sureci'],
        ],
    },
    ticaret: {
        source: 'all',
        searchArea: 'auto',
        expectedDomains: ['ticaret', 'hukuk'],
        cases: [
            ['genel-kurul-iptal', 'anonim sirket genel kurul kararinin iptali'],
            ['konkordato', 'konkordato muhleti kesin muhlet sartlari'],
            ['cari-hesap', 'cari hesap alacagi ticari defter delili'],
            ['cek-ciranta', 'cekten dogan sorumluluk ve ciranta'],
            ['acentelik', 'acentelik sozlesmesi denklestirme tazminati'],
            ['yonetim-kurulu', 'yonetim kurulu uyelerinin sorumlulugu zarar tazmini'],
            ['ortakliktan-cikma', 'limited sirket ortakliktan cikma hakli sebep'],
            ['haksiz-rekabet', 'haksiz rekabet nedeniyle maddi ve manevi tazminat'],
            ['pay-devri', 'limited sirket pay devri gecerlilik kosullari'],
            ['bono-zamanasimi', 'bonoda zamanasimi ve takip hakki'],
            ['ticari-isletme-rehni', 'ticari isletme rehni paraya cevirme'],
            ['marka-lisans', 'marka lisans sozlesmesinin ihlali ticari dava'],
            ['sigorta-riziko', 'sigorta hukukunda riziko ihbari ve tazminat'],
            ['tasima-sozlesmesi', 'tasima sozlesmesinde tasiyanin sorumlulugu'],
            ['cari-mutabakat', 'cari hesap mutabakati ve ticari teamul'],
        ],
    },
    danistay: {
        source: 'danistay',
        searchArea: 'danistay',
        expectedDomains: ['idare'],
        cases: [
            ['imar-barisi', 'imar barisi yapi kayit belgesi yikim karari'],
            ['atama-liyakat', 'memur atama iptal davasi liyakat ilkesi'],
            ['kdv-sahte-fatura', 'kdv indirimi sahte fatura vergi mahkemesi'],
            ['ruhsat-iptali', 'isyeri acma ruhsati iptali'],
            ['cevre-cezasi', 'cevre cezasi idari yaptirim tutanagi hukuka aykirilik'],
            ['kamulastirmasiz-el-atma', 'kamulastirmasiz el atma idari yargi gorevi'],
            ['disiplin-cezasi', 'memur disiplin cezasi savunma hakki danistay'],
            ['ihale-iptali', 'kamu ihalesi iptal davasi esit muamele ilkesi'],
            ['yapi-tatil', 'yapi tatil tutanagi ve imar kanunu 32'],
            ['imar-plani', 'imar plani iptali sehircilik ilkeleri danistay'],
            ['vergi-uzlasma', 'vergi cezasi uzlasma sonrasi dava hakki'],
            ['ogrenci-disiplin', 'universite ogrencisi disiplin cezasi iptali'],
            ['gorevde-yukselme', 'gorevde yukselme sinavi iptal davasi'],
            ['lisans-iptali', 'idari lisans iptali olcululuk ilkesi'],
            ['acele-kamulastirma', 'acele kamulastirma islemi yargi denetimi'],
        ],
    },
    bam: {
        source: 'all',
        searchArea: 'bam',
        expectedDomains: ['istinaf'],
        cases: [
            ['esastan-ret', 'istinaf basvurusu esastan ret'],
            ['ihtiyati-tedbir', 'bolge adliye mahkemesi ihtiyati tedbir istinaf incelemesi'],
            ['kesinlik-siniri', 'istinaf kesinlik siniri kismi dava'],
            ['sure-tutum', 'sure tutum dilekcesi istinaf basvurusu'],
            ['kaldirma-yeniden-karar', 'bolge adliye mahkemesi kaldirma yeniden esas hakkinda karar'],
            ['sure-asimi', 'istinaf basvurusunda sure asimi reddi'],
            ['kamu-duzeni', 'istinaf incelemesinde kamu duzeni denetimi hmk 355'],
            ['delil-degerlendirme', 'bolge adliye mahkemesi delil degerlendirmesi ve tanik'],
            ['durusma-acilmasi', 'istinaf incelemesinde durusma acilmasi sartlari'],
            ['eksiklik-giderme', 'istinaf dilekcesindeki eksikligin giderilmesi'],
            ['katilma-yolu', 'katilma yoluyla istinaf basvurusu'],
            ['ceza-istinaf', 'ceza istinaf basvurusu hukuka aykirilik nedenleri'],
            ['hukuk-istinaf', 'hukuk dairesi istinaf incelemesi usul ekonomisi'],
            ['bozma-kaldirma', 'bolge adliye mahkemesi kararinin kaldirilmasi ve yeniden hukum'],
            ['kesin-karar', 'istinaf merciinin kesin nitelikteki karari'],
        ],
    },
};

const CASES = Object.entries(CASE_GROUPS).flatMap(([category, config]) =>
    config.cases.map(([id, query]) => ({
        id: `${category}-${id}`,
        category,
        source: config.source,
        searchArea: config.searchArea,
        expectedDomains: config.expectedDomains,
        query,
    }))
);

const CATEGORY_FILTER = String(process.env.LEGAL_MATRIX_CATEGORIES || '')
    .split(',')
    .map((item) => item.trim().toLocaleLowerCase('tr-TR'))
    .filter(Boolean);
const ACTIVE_CASES = CATEGORY_FILTER.length
    ? CASES.filter((item) => CATEGORY_FILTER.includes(String(item.category || '').toLocaleLowerCase('tr-TR')))
    : CASES;

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
    if (/icra hukuk|icra mudurlugu|icra takibi|itirazin iptali|menfi tespit|istirdat|haczedilmezlik|odeme emri|kambiyo senedine/.test(haystack)) return 'icra';
    if (/aile mahkemesi|bosanma|velayet|nafaka|kisisel iliski|mal rejimi|ziynet|soybagi|evlat edinme/.test(haystack)) return 'aile';
    if (/asliye ticaret|ticari dava|anonim sirket|limited sirket|genel kurul|konkordato|cari hesap|cek|bono|acentelik/.test(haystack)) return 'ticaret';
    if (/danistay|idare mahkemesi|vergi mahkemesi|idari dava|imar|yapi kayit belgesi|encumen|yikim karari|ihale yasaklama/.test(haystack)) return 'idare';
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
        semantic: Number.isFinite(Number(item?.semanticRawScore)) ? Number(item.semanticRawScore) : null,
        reason: String(item?.matchReason || '').slice(0, 160),
    }));

const runCase = async (testCase) => {
    const startedAt = Date.now();
    const payload = await searchLegalDecisionsViaMcp({
        source: testCase.source,
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
        category: testCase.category,
        source: testCase.source,
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

const summarizeByCategory = (outputs = []) => {
    const categories = [...new Set(outputs.map((item) => item.category))];
    return categories.map((category) => {
        const cases = outputs.filter((item) => item.category === category);
        const passed = cases.filter((item) => item.passed).length;
        const empty = cases.filter((item) => item.resultCount === 0).length;
        const wrong = cases.filter((item) => item.wrongTop3Count > 0).length;
        const avgMs =
            cases.length > 0
                ? Math.round(cases.reduce((sum, item) => sum + Number(item.durationMs || 0), 0) / cases.length)
                : 0;

        return {
            category,
            passed,
            total: cases.length,
            empty,
            wrong,
            avgMs,
        };
    });
};

const main = async () => {
    const outputs = [];

    for (const testCase of ACTIVE_CASES) {
        try {
            const output = await runCase(testCase);
            outputs.push(output);
            console.log(
                `[LEGAL_MATRIX] ${output.passed ? 'PASS' : 'FAIL'} ${output.category}/${output.id} results=${output.resultCount} wrongTop3=${output.wrongTop3Count} durationMs=${output.durationMs}`
            );
            for (const item of output.top3) {
                console.log(
                    `  - #${item.rank} domain=${item.domain} source=${item.source} score=${item.score} semantic=${item.semantic ?? '-'} title=${item.title}`
                );
            }
            if (output.warning) {
                console.log(`  warning=${output.warning}`);
            }
        } catch (error) {
            outputs.push({
                id: testCase.id,
                category: testCase.category,
                source: testCase.source,
                searchArea: testCase.searchArea,
                expectedDomains: testCase.expectedDomains,
                durationMs: 0,
                resultCount: 0,
                top3: [],
                wrongTop3Count: 0,
                passed: false,
                error: error?.message || String(error),
            });
            console.log(`[LEGAL_MATRIX] FAIL ${testCase.category}/${testCase.id} error=${error?.message || error}`);
        }
    }

    const wrongDomainFailures = outputs.filter((item) => item.wrongTop3Count > 0).length;
    const emptyCount = outputs.filter((item) => item.resultCount === 0).length;
    const emptyRate = outputs.length > 0 ? emptyCount / outputs.length : 1;
    const passedCount = outputs.filter((item) => item.passed).length;
    const categorySummary = summarizeByCategory(outputs);

    console.log(
        `[LEGAL_MATRIX] summary passed=${passedCount}/${outputs.length} activeCases=${ACTIVE_CASES.length} wrongDomainFailures=${wrongDomainFailures} emptyCount=${emptyCount} emptyRate=${emptyRate.toFixed(2)}`
    );
    for (const item of categorySummary) {
        console.log(
            `[LEGAL_MATRIX] category=${item.category} passed=${item.passed}/${item.total} empty=${item.empty} wrong=${item.wrong} avgMs=${item.avgMs}`
        );
    }

    console.log(`[LEGAL_MATRIX_JSON] ${JSON.stringify({ outputs, categorySummary })}`);

    if (wrongDomainFailures > 0 || emptyRate > EMPTY_RATE_THRESHOLD) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error('[LEGAL_MATRIX] fatal', error);
    process.exitCode = 1;
});
