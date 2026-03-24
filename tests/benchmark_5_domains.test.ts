import { test, expect } from 'vitest';
import { buildDetailedLegalSearchResult } from '../src/utils/legalSearch';
import dotenv from 'dotenv';
dotenv.config();

const runLiveBenchmark = process.env.LEGAL_ENABLE_LIVE_BENCHMARK === '1';
const benchmarkTest = runLiveBenchmark ? test : test.skip;

const DOMAIN_COURT_HINTS = {
  ceza: ['ceza'],
  is_hukuku: ['hukuk', '9. hukuk', '22. hukuk'],
  aile: ['2. hukuk', 'hukuk'],
  borclar: ['hukuk'],
  ticaret: ['11. hukuk', 'hukuk'],
};

const testCases = [
  {
    domain: 'ceza',
    text: `Müvekkil Ahmet Yılmaz, 15.08.2023 tarihinde rutin bir trafik kontrolü sırasında aracında yapılan aramada arka koltuğun altında şeffaf poşetler içerisinde toplam 45 gram esrar maddesi ile yakalanmıştır. Yapılan adli tıp incelemesinde maddenin esrar olduğu kesinleşmiştir. Müvekkil, kolluk aşamasında ve savcılık sorgusunda söz konusu maddenin kendisine ait olduğunu, uzun süredir madde bağımlısı olduğunu ve bu maddeyi sadece kendi kişisel kullanımı için bir torbacıdan satın aldığını samimi olarak itiraf etmiştir. Araçta hassas terazi, kilitli poşet, çok sayıda boş paketleme malzemesi veya uyuşturucu satışından elde edildiği düşünülebilecek yüksek miktarda nakit para bulunmamıştır. Müvekkilin telefon HTS kayıtları incelendiğinde, herhangi bir uyuşturucu madde ticareti organizasyonu ile irtibatı görülmemiş, yalnızca madde temin etmek için bir şahısla kısa görüşmeleri tespit edilmiştir. Buna rağmen, miktar gözetilerek Cumhuriyet Savcısı tarafından TCK madde 188 (Uyuşturucu veya Uyarıcı Madde İmal ve Ticareti) kapsamında iddianame düzenlenerek Ağır Ceza Mahkemesinde kamu davası açılmıştır. Biz savunma makamı olarak, olayda TCK 188. maddedeki unsurların (ticaret, sevk, nakletme maksadı) kesinlikle oluşmadığını, somut herhangi bir delil olmadığını (satış anına dair kamera kaydı, fiziki takip veya tanık beyanı bulunmadığını) iddia ediyoruz. Müvekkildeki madde miktarının Yargıtay Ceza Genel Kurulunun belirlediği "yıllık kullanım sınırı" olan miktar çerçevesinde olduğu değerlendirilmelidir. Şüpheden sanık yararlanır ilkesi gereği, mevcut şüpheli durumun sanık aleyhine değil lehine yorumlanarak, suç vasfının TCK madde 191 (Kullanmak İçin Uyuşturucu veya Uyarıcı Madde Satın Almak, Kabul Etmek veya Bulundurmak) olarak değiştirilmesi ve buna göre hüküm kurulması gerekmektedir. Ticaret kastına dair her türlü şüpheden uzak, kesin ve inandırıcı bir delil dosyada mevcut değildir.`
  },
  {
    domain: 'is_hukuku',
    text: `Müvekkil Ayşe Demir, davalı X Tekstil Sanayi ve Ticaret A.Ş. unvanlı işyerinde 10.02.2015 tarihinden iş sözleşmesinin haksız olarak feshedildiği 25.11.2023 tarihine kadar kesintisiz olarak "Üretim Sorumlusu" pozisyonunda çalışmıştır. Müvekkil, yaklaşık 8,5 yıl boyunca görevini sadakat ve özenle yerine getirmiş, hiçbir disiplin cezası almamıştır. Ancak, şirkete yeni atanan fabrika müdürü tarafından müvekkile karşı sistematik bir psikolojik taciz (mobbing) süreci başlatılmıştır. Müvekkil, uzmanlık alanı olmayan görevlere zorlanmış, diğer çalışanların önünde sık sık aşağılanmış, nedensiz yere vardiya saatleri sürekli değiştirilmiş ve işyerindeki odası alınarak kapı girişindeki küçük bir masaya yerleştirilmiştir. Bu haksız uygulamalar nedeniyle müvekkil büyük bir stres yaşamış ve psikolojik tedavi görmek zorunda kalmıştır (hastane kayıtları dilekçe ekindedir). Müvekkil, 20.11.2023 tarihinde insan kaynakları departmanına mobbing şikayetinde bulunmuş, ancak bu şikayetinden 5 gün sonra "işveren vekillerine hakaret ettiği ve işyeri düzenini bozduğu" gibi asılsız ve soyut iddialarla, 4857 sayılı İş Kanunu'nun 25/II numaralı bendi (Ahlak ve iyi niyet kurallarına uymayan haller) gerekçe gösterilerek tazminatsız ve bildirimsiz olarak işten çıkarılmıştır. Yapılan fesih açıkça haksız ve kötü niyetlidir. İşverenin dayandığı iddiaların hiçbiri somut bir delille (tutanak, kamera kaydı vb.) ispatlanmamıştır. Tam tersine, asıl mağdur olan müvekkildir. Bu nedenlerle, müvekkilin iş sözleşmesinin haklı bir neden olmaksızın feshedildiğinin tespiti ile, kıdem tazminatı, ihbar tazminatı, ödenmeyen fazla mesai ücretleri ve kullandırılmayan yıllık izin ücretlerinin, ayrıca uğradığı psikolojik şiddet (mobbing) nedeniyle Türk Borçlar Kanunu madde 417 ve 4857 sayılı yasanın ilgili hükümleri çerçevesinde manevi tazminatın davalı işverenden tahsiline karar verilmesini talep etme zorunluluğumuz doğmuştur.`
  },
  {
    domain: 'aile',
    text: `Müvekkil Fatma Kara ile davalı Mehmet Kara 12.05.2010 tarihinde evlenmiş olup, bu evlilikten 2012 doğumlu Ali ve 2015 doğumlu Ayşe isimli iki müşterek çocukları bulunmaktadır. Tarafların evliliği başlangıçta normal seyrinde ilerlese de, son 4-5 yıldır davalının eve geç gelmesi, maddi olarak ailesini ihmal etmesi ve sürekli asabi tavırlar sergilemesi nedeniyle çekilmez bir hal almıştır. Davalı eş, düzenli bir işi olmasına rağmen maaşının büyük bir kısmını şans oyunları ve bahislere harcamakta, evin elektrik, su gibi temel faturalarını dahi ödememektedir. Müvekkil, ev hanımı olmasına rağmen ailesinin desteğiyle çocukların masraflarını karşılamaya çalışmaktadır. Ek olarak, davalı son bir yıldır alkol problemleri yaşamaya başlamış, haftanın en az 3-4 günü eve alkollü gelerek müvekkile çocukların gözü önünde hakaret etmiş ve psikolojik şiddet uygulamıştır. Hatta 10.09.2023 tarihinde yaşanan tartışma sırasında davalı eş müvekkili itekleyerek yere düşürmüş, buna dair hastaneden alınan darp raporu da mevcuttur. Evlilik birliği, tamamen davalının ağır kusurlu davranışları (ekonomik şiddet, psikolojik şiddet ve fiziksel şiddet) neticesinde temelinden sarsılmıştır ve müvekkil açısından bu evliliği sürdürme beklentisi kalmamıştır. MK madde 166/1 uyarınca, tarafların şiddetli geçimsizlik nedeniyle boşanmalarına, müşterek çocukların yaşları, eğitim durumları ve anne şefkatine olan ihtiyaçları gözetilerek velayetlerinin müvekkil anneye verilmesine karar verilmesi talep edilmektedir. Ayrıca, müşterek çocukların iştirak nafakası ile müvekkilin yoksulluk durumuna düşecek olması nedeniyle kendisi lehine yoksulluk nafakasına hükmedilmesini, evlilik içinde davalının kusurlu davranışlarıyla müvekkilin yaşadığı elem ve kederin bir nebze olsun telafisi için 500.000 TL manevi tazminat ile 500.000 TL maddi tazminatın yasal faiziyle davalıdan tahsiline karar verilmesi talep olunur.`
  },
  {
    domain: 'borclar',
    text: `Müvekkil şirket ABC İnşaat Taahhüt San. Tic. A.Ş., davalı XYZ Malzeme Tedarik Ltd. Şti. ile 01.03.2023 tarihinde, İstanbul Başakşehir'deki 200 konutluk inşaat projesinin seramik ve ıslak zemin malzemelerinin temini konusunda 4.500.000 TL bedelli geniş kapsamlı bir ticari alım-satım sözleşmesi imzalamıştır. Sözleşmenin "Teslim Şartları" başlıklı 5. maddesine göre, davalı satıcının malzemelerin %50'sini (ikinci parti) 15.06.2023 tarihinde, kalan %50'sini ise en geç 15.08.2023 tarihinde şantiye alanına eksiksiz teslim etmesi kararlaştırılmıştır. Müvekkil şirket, üzerine düşen edimi yerine getirerek sözleşme bedelinin %40'ı olan 1.800.000 TL peşinatı sözleşme tarihinde davalının banka hesabına havale etmiştir. Ancak davalı firma, 15.06.2023 tarihindeki ilk teslimatı sadece %20 oranında (eksik parti) gerçekleştirmiş, 15.08.2023 tarihindeki ikinci teslimatı ise hiçbir haklı mazeret bildirmeksizin ve defalarca gönderilen e-posta ve noter ihtarnamelerine rağmen hiç gerçekleştirmemiştir. Davalının bu ağır temerrüdü (6098 sayılı TBK md. 117 vd.) nedeniyle, müvekkil şirketin inşaat projesinin ince işçilik aşaması durmak zorunda kalmış, taşeron firmalara cezai şart ödenmiş ve nihai daire alıcılarına karşı teslim tarihi gecikmiştir. Davalı firma, piyasadaki malzeme fiyatlarındaki artışı bahane ederek sözleşme bedelini haksız yere revize etmeye, aksi halde mal vermemeye çalışarak dürüstlük kuralına aykırı hareket etmiştir (TBK md. 2). Bu çerçevede, taraflar arasındaki sözleşmeden dönme hakkımızı kullanarak, sözleşmenin haklı nedenle feshinin tespitini, müvekkil tarafından ödenen 1.800.000 TL peşinatın (teslim edilen kısım mahsup edildikten sonra kalan iadesi gereken tutarın) en yüksek ticari temerrüt faiziyle birlikte iadesini talep ediyoruz. Ayrıca, müvekkilin davalının borcuna aykırı davranması nedeniyle uğradığı menfi ve müspet zararların, sözleşmede yer alan %10 cezai şart bedeli ile taşeronlara ödenen tazminatların bilirkişi marifetiyle hesaplanarak TBK md. 112 vd. hükümleri gereği tazmin edilmesini talep ederiz.`
  },
  {
    domain: 'ticaret',
    text: `Müvekkil anonim şirket Kırmızı Teknoloji A.Ş., yazılım sektöründe 15 yıldır faaliyet gösteren yurt çapında tanınmış bir firmadır. Davalı Mavi Bilişim A.Ş. ise, yaklaşık 1 yıl önce müvekkil şirketten ayrılan iki eski yönetici (Yönetim Kurulu eski üyeleri) tarafından aynı sektörde faaliyet göstermek üzere kurulmuştur. Davalı şirket yöneticileri, TTK madde 396'da düzenlenen rekabet yasağına aykırı davranarak, müvekkil şirkette çalıştıkları dönemde elde ettikleri gizli müşteri listelerini, fiyatlandırma politikalarını, AR-GE süreçlerine dair gizli yazılım kaynak kodlarını ve ihale hazırlık dosyalarını izinsiz olarak kopyalamış ve yeni kurdukları şirkette haksız şekilde kullanmışlardır. Söz konusu durum, firmamıza ait bilgisayarlarda yapılan IT incelemelerinde veri transferi (USB bellek ve bulut yüklemeleri) log kayıtlarıyla sabitlenmiştir (Ek-1 İnceleme Raporu). Davalı şirket bu sayede, müvekkilin yıllardır çalıştığı 5 büyük ana müşterisine, müvekkil şirketin sunduğu fiyatların kasıtlı olarak bir miktar altında teklifler sunarak haksız avantaj sağlamış ve bu müşterilerle müvekkil arasındaki ticari sözleşmelerin yenilenmemesine sebep olmuştur. Davalıların bu eylemleri, sadece sır saklama yükümlülüğünün ihlali değil, aynı zamanda 6102 sayılı Türk Ticaret Kanunu'nun 54. ve devamı maddelerinde tanımlanan "Haksız Rekabet"in (iş sırlarından yararlanma, çalışanları ve müşterileri ayartma) en tipik örneğidir. Olayda rakipler arasındaki dürüstlüğe aykırı davranışlarla müvekkil şirket açık biçimde zarara uğratılmıştır. İşbu davada TTK md. 56 uyarınca; haksız rekabetin tespitini, söz konusu haksız eylemlerin süratle men edilmesini (ihtiyati tedbir taleplidir), haksız rekabet neticesi oluşan bugünkü haksız durumun ortadan kaldırılmasını ve davalıların müvekkile ait gizli bilgileri kullanarak elde ettikleri kazancın tespit edilerek şimdilik 2.500.000 TL maddi tazminatın ticari avans faiziyle birlikte müştereken ve müteselsilen davalılardan tahsilini talep ediyoruz. Kurumsal itibarın sarsılması sebebiyle de 1.000.000 TL manevi tazminat talebimiz bulunmaktadır.`
  }
];

import { buildSearchStrategies } from '../lib/legal/legal-strategy-builder.js';
import { runOrderedSkillSearch } from '../lib/legal/legal-multi-search.js';
import { buildSkillBackedSearchPackage } from '../lib/legal/legal-search-skill.js';

benchmarkTest('Runs hybrid scoring benchmark across 5 diverse legal domains', async () => {
    console.log("==========================================");
    console.log("  5-DOMAIN BENCHMARK: 300-WORD CASES");
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
        for (const testCase of testCases) {
            console.log("[RUNNING] Domain: " + testCase.domain.toUpperCase());
            console.log("Length: " + testCase.text.split(' ').length + " words");

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

            const { results, diagnostics, _metadata } = await runOrderedSkillSearch({
                strategies,
                rawQuery: testCase.text,
                limit: 3,
                source: 'all',
                skillContext: (skillPackage?.context || {}) as any
            });

            const duration = Date.now() - startTime;

            console.log("\\n[SUCCESS] " + testCase.domain.toUpperCase() + " completed in " + duration + "ms");
            console.log("Total Results Returned: " + results?.length);

            if (results && results.length > 0) {
                console.log("Top 3 Results:");
                results.slice(0, 3).forEach((r: any, idx: number) => {
                    const matchedKeywords = r.matchedKeywords ? r.matchedKeywords.join(', ') : '';
                    console.log("  " + (idx + 1) + ". Score: " + Math.floor(r.relevanceScore || 0) + " | Daire: " + r.daire + " | Type: " + (r.courtType || 'N/A') + " | Source: " + r.source);
                    console.log("     Title: " + r.title);
                    console.log("     KeyWords: " + matchedKeywords);
                });
            } else {
                console.log("  No results found.");
            }

            const timeoutErrors = interceptedErrors
                .slice(errorCountBefore)
                .filter((entry) => entry.includes('strategy_timeout_'));
            if (timeoutErrors.length > 0) {
                failures.push(`${testCase.domain}: strategy timeout gordu`);
            }
            if ((Array.isArray(_metadata?.strategyTimeouts) ? _metadata.strategyTimeouts.length : 0) > 0) {
                failures.push(`${testCase.domain}: strategy timeout diagnostics dolu`);
            }
            if (diagnostics?.semanticChannelStatus !== 'available') {
                failures.push(`${testCase.domain}: semantic kanal aktif degil (${diagnostics?.semanticChannelStatus || 'unknown'})`);
            }
            if (interceptedWarnings.slice(warnCountBefore).some((entry) => entry.includes('search_bedesten_semantic is unavailable'))) {
                failures.push(`${testCase.domain}: semantic tool unavailable`);
            }

            if (!strategies?.[0]?.plan?.initialKeyword) {
                failures.push(`${testCase.domain}: initialKeyword bos geldi`);
            }

            if (!results || results.length === 0) {
                failures.push(`${testCase.domain}: sonuc gelmedi`);
            } else {
                const topResult = results[0];
                const courtText = String(topResult?.daire || topResult?.kurum_dairesi || topResult?.court || '').toLowerCase();
                const sourceText = String(topResult?.source || '').toLowerCase();
                const hints = DOMAIN_COURT_HINTS[testCase.domain as keyof typeof DOMAIN_COURT_HINTS] || [];
                const hasExpectedHint = hints.some((hint) => courtText.includes(hint) || sourceText.includes(hint));
                if (!hasExpectedHint) {
                    failures.push(`${testCase.domain}: ust sonuc beklenen daire/kaynak ipucunu tasimiyor`);
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
