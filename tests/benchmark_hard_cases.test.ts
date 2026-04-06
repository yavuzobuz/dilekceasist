import { test, expect } from 'vitest';
import { buildSearchStrategies } from '../lib/legal/legal-strategy-builder.js';
import { runOrderedSkillSearch } from '../lib/legal/legal-multi-search.js';
import { buildSkillBackedSearchPackage } from '../lib/legal/legal-search-skill.js';
import dotenv from 'dotenv';
dotenv.config();

const runLiveBenchmark = process.env.LEGAL_ENABLE_LIVE_BENCHMARK === '1';
const benchmarkTest = runLiveBenchmark ? test : test.skip;

const HARD_CASE_HINTS = {
  karma_is_ceza: ['hukuk', 'ceza'],
  gizli_borclar: ['hukuk'],
  idare_mobbing: ['danistay', 'idare'],
};

const hardCases = [
  {
    domain: 'karma_is_ceza',
    name: 'Zorlu Senaryo 1: Is Sozlesmesinin Gorevi Kotuye Kullanma Iddiasiyla Feshi',
    text: `Muvekkilim sirket soforu olarak calisirken, mesai saatleri disinda, haftasonu izninde iken sirkete ait ticari araci izinsiz olarak alip sahsi isleri icin memleketine gitmistir. Yolda giderken tamamen kendi kusuru ile araci bir duvara carparak aracta 150.000 TL maddi hasara yol acmistir. Isveren bu durumu ogrenince, muvekkilin davranisinin guveni kotuye kullanma ve hirsizlik boyutunda oldugunu belirterek Is Kanunu 25/II-e bendi uyarinca is sozlesmesini derhal ve tazminatsiz olarak feshetmistir. Ayrica ugratigi zararin tahsili icin de ayri bir icra takibi baslatmistir. Muvekkil, aracin anahtarlarinin zaten personelin erisimine acik masada durdugunu, daha once de bazi personellerin araci acil ozel isleri icin aldiklarinda isverenin ses cikarmadigini, bu nedenle 8 yillik kideminin ve ihbar tazminatinin yanmasinin hakkaniyete aykiri oldugunu iddia etmektedir. Sirketin uyguladigi feshin haksiz oldugunu, en kotu ihtimalle gecerli fesih sayilabilecegini, bu sebeple kidem ve ihbar tazminatlarinin odenmesi gerektigini savunuyoruz.`
  },
  {
    domain: 'gizli_borclar',
    name: 'Zorlu Senaryo 2: Hatali EFT ile Sebepsiz Zenginlesme',
    text: `Muvekkilim, mobil bankacilik uzerinden sirketinin tedarikcisine yuklu bir odeme yapacakken, IBAN numarasinda yaptigi tek bir rakam hatasi nedeniyle 450.000 TL parayi hic tanimadigi davalinin hesabina gondermistir. Durumu 3 gun sonra muhasebe teyidi sirasinda fark edince derhal bankaya basvurmus, ancak banka karsi tarafin onay vermemesi nedeniyle parayi iade edememistir. Davali sahsa ulasildiginda, davali benim kimseye borcum yoktu, hesabima gelen parayi banka promosyonu ya da ikramiye sandim ve hepsini kripto borsasina aktarip kaybettim diyerek parayi iade etmeyi reddetmektedir. Davalinin, hukuki hicbir gecerli sebebi olmamasina ragmen muvekkilin malvarligindan haksiz sekilde kendi malvarligina gecirdigi bu tutarin yasal faiziyle geri odenmesini talep etmek icin dava acmaya hazirlaniyoruz. Olayda iyi niyet iddiasi dinlenemez; yuklu bir meblagin bir anda hesaba gelmesi olagan disidir.`
  },
  {
    domain: 'idare_mobbing',
    name: 'Zorlu Senaryo 3: Kamuda Biktirma ve Tam Yargi',
    text: `Muvekkil, bir devlet universitesinde 15 yillik kadrolu memur olarak gorev yapmaktadir. Rektorluk secimlerinden sonra degisen yeni yonetim, kendi kadrosunu kurmak amaciyla muvekkili once hicbir yasal gerekce gostermeden gorevden alip uzman kadrosuna atamis, ardindan gecen 2 yil icerisinde tam 5 kez farkli uzak ilcelerdeki meslek yuksekokullarina gecici gorevlendirme adi altinda surmustur. Muvekkil, her gorevlendirme isleminin iptali icin Idare Mahkemesine basvurmus ve tum davalari tek tek kazanmistir. Ancak idare, mahkeme kararlarini seklen uygulayip muvekkili eski gorevine iade ettikten birkac gun sonra, sudan bahanelerle tekrar mesnetsiz disiplin sorusturmalari acarak muvekkili yeniden farkli ilcelere gondermis veya aciga almistir. Idarenin bu hukuka aykiri, sistematik ve kasitli bezdiri politikasi yuzunden muvekkilin psikolojisi agir sekilde bozulmus, major depresyon tanisiyla heyet raporu almak zorunda kalmistir. Idare Mahkemesinde, hizmet kusuru teskil eden bu idari eylemler silsilesi nedeniyle idarenin agir hizmet kusuru isledigini belirterek 2.000.000 TL manevi tazminat talepli tam yargi davasi acmayi planliyoruz.`
  }
];

benchmarkTest('Runs hard / complex legal scenarios benchmark', async () => {
    console.log("==========================================");
    console.log("  ZORLU (HARD) SENARYOLAR BENCHMARK TESTI");
    console.log("==========================================\\n");

    const failures: string[] = [];
    const interceptedErrors: string[] = [];
    const interceptedWarnings: string[] = [];
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args: unknown[]) => {
        interceptedErrors.push(args.map((arg) => String(arg)).join(' '));
        originalConsoleError(...args);
    };
    console.warn = (...args: unknown[]) => {
        interceptedWarnings.push(args.map((arg) => String(arg)).join(' '));
        originalConsoleWarn(...args);
    };

    try {
        for (const testCase of hardCases) {
            console.log("[RUNNING] " + testCase.name);

            const startTime = Date.now();
            const errorCountBefore = interceptedErrors.length;
            const warnCountBefore = interceptedWarnings.length;
            const skillPackage = buildSkillBackedSearchPackage({
                rawText: testCase.text,
                preferredSource: 'all'
            });

            const strategies = await buildSearchStrategies({
                rawText: testCase.text,
                preferredSource: 'all',
                skillPackage: skillPackage as any
            } as any);

            console.log(`[AI DIAGNOSIS] ${strategies[0]?.legalDiagnosis || 'N/A'}`);
            console.log(`[AI KEYWORD] ${strategies[0]?.plan?.initialKeyword || 'N/A'}`);

            const { results, diagnostics, _metadata } = await runOrderedSkillSearch({
                strategies,
                rawQuery: testCase.text,
                limit: 3,
                source: 'all',
                skillContext: (skillPackage?.context || {}) as any
            });

            const duration = Date.now() - startTime;

            console.log("\\n[SUCCESS] Completed in " + duration + "ms");
            console.log("Total Results Returned: " + results?.length);

            if (results && results.length > 0) {
                console.log("Top 3 Results (Zorlu Test):");
                results.slice(0, 3).forEach((r: any, idx: number) => {
                    const matchedKeywords = r.matchedKeywords ? r.matchedKeywords.join(', ') : '';
                    console.log("  " + (idx + 1) + ". Score: " + Math.floor(r.relevanceScore || 0) + " | Daire: " + r.daire + " | Source: " + r.source);
                    console.log("     Title: " + r.title);
                    console.log("     KeyWords: " + matchedKeywords);
                    const snippet = r.ozet || r.summaryText || r.snippet || '';
                    console.log("     Snippet Preview: " + snippet.substring(0, 150).replace(/\\n/g, ' ') + "...");
                });
            } else {
                console.log("  No results found.");
            }

            const timeoutErrors = interceptedErrors
                .slice(errorCountBefore)
                .filter((entry) => entry.includes('strategy_timeout_'));
            if (timeoutErrors.length > 0) {
                failures.push(`${testCase.name}: strategy timeout gordu`);
            }
            if ((Array.isArray(_metadata?.strategyTimeouts) ? _metadata.strategyTimeouts.length : 0) > 0) {
                failures.push(`${testCase.name}: strategy timeout diagnostics dolu`);
            }
            if (diagnostics?.semanticChannelStatus !== 'available') {
                failures.push(`${testCase.name}: semantic kanal aktif degil (${diagnostics?.semanticChannelStatus || 'unknown'})`);
            }
            if (interceptedWarnings.slice(warnCountBefore).some((entry) => entry.includes('search_bedesten_semantic is unavailable'))) {
                failures.push(`${testCase.name}: semantic tool unavailable`);
            }

            if (!strategies?.[0]?.plan?.initialKeyword) {
                failures.push(`${testCase.name}: initialKeyword bos geldi`);
            }
            if (!strategies?.[0]?.legalDiagnosis || /\b(emsal karar|icra takibi|ticari alacak)\b/i.test(strategies[0].legalDiagnosis)) {
                failures.push(`${testCase.name}: legalDiagnosis bos veya jenerik geldi`);
            }

            if (!results || results.length === 0) {
                failures.push(`${testCase.name}: sonuc gelmedi`);
            } else {
                const topResult = results[0];
                const courtText = String(topResult?.daire || topResult?.kurum_dairesi || topResult?.court || '').toLowerCase();
                const sourceText = String(topResult?.source || '').toLowerCase();
                const hints = HARD_CASE_HINTS[testCase.domain as keyof typeof HARD_CASE_HINTS] || [];
                const hasExpectedHint = hints.some((hint) => courtText.includes(hint) || sourceText.includes(hint));
                if (!hasExpectedHint) {
                    failures.push(`${testCase.name}: ust sonuc beklenen daire/kaynak ipucunu tasimiyor`);
                }
            }

            console.log("\\n------------------------------------------\\n");
        }
    } finally {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
    }

    expect(failures).toEqual([]);
}, 300000);
