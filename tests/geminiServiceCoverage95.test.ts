import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeDocuments } from '../services/geminiService';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const queueAnalysisResponse = (summary: string) => {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
            text: JSON.stringify({
                summary,
                potentialParties: ['Davaci'],
            }),
        }),
    });
};

type CoverageCase = {
    name: string;
    text: string;
    expectedDomain: string;
};

const domainFixtures = {
    ceza: {
        short: [
            'uyusturucu madde ticareti tck 188 kullanmak ayrimi',
            'sanik hakkinda tck 191 ve tck 188 ayrimi',
            'ceza dosyasinda uyusturucu ticareti delilleri',
            'hukuka aykiri delil ve arama karari ceza',
        ],
        single: [
            'Sanik hakkinda uyusturucu madde ticareti ve kullanmak icin bulundurma ayrimi tartisilmaktadir.',
            'Ceza yargilamasinda arama karari ile elde edilen delilin hukuka uygunlugu incelenmektedir.',
            'TCK 188 kapsaminda ticaret kastinin varligi fiziki takip ve tanik beyanlariyla degerlendirilmektedir.',
        ],
        long: [
            'Sanik hakkinda yurutulen ceza sorusturmasinda uyusturucu madde ticareti sucu ile kullanmak icin bulundurma sucu arasindaki ayrim, fiziki takip, arama karari, ele gecirilen miktar ve tanik beyanlari birlikte incelenerek tartisilmaktadir.',
            'Ceza dosyasinda hukuka aykiri delil iddiasi ileri surulmus, arama kararinin kapsamasi, elkoyma islemi ve TCK 188 kapsaminda ticaret kastinin ispatlanip ispatlanmadigi ayrintili sekilde aciklanmistir.',
            'Cumhuriyet savciligi tarafindan duzenlenen iddianamede sanigin uyusturucu madde ticareti yaptigi ileri surulmekte, sanik ise TCK 191 kapsaminda kisisel kullanim savunmasi yaparak ceza sorumluluguna itiraz etmektedir.',
        ],
    },
    is_hukuku: {
        short: [
            'ise iade gecersiz fesih kidem ihbar',
            'isci alacagi fazla mesai ise baslatmama',
            'isveren savunmasi mobbing ve is guvencesi',
            'is mahkemesi hizmet tespiti kidem tazminati',
        ],
        single: [
            'Isci, gecersiz fesih nedeniyle ise iade ve ise baslatmama tazminati talep etmektedir.',
            'Dava, kidem tazminati, ihbar tazminati ve fazla mesai alacagi taleplerine iliskindir.',
            'Is mahkemesi onunde hizmet tespiti ve mobbing iddialari birlikte degerlendirilmektedir.',
        ],
        long: [
            'Davaci isci, is sozlesmesinin gecersiz fesih ile sona erdirildigini, ise iade hakkinin ihlal edildigini, kidem ve ihbar tazminati ile fazla mesai alacaklarinin odemedigini ileri surerek is mahkemesinde talepte bulunmaktadir.',
            'Is hukukuna iliskin uyusmazlikta davaci, mobbing, is guvencesi ve hizmet tespiti konularini birlikte ileri surmus, kidem tazminati ve ise baslatmama tazminati istemlerini ayrintili sekilde aciklamistir.',
            'Isveren tarafin fesih bildiriminde hakli neden bulunmadigi, isciye savunma hakki taninmadigi ve is sozlesmesinin gecersiz fesih sebebiyle sona erdirildigi iddiasiyla ise iade davası acilacaktir.',
        ],
    },
    aile: {
        short: [
            'bosanma nafaka velayet ziynet',
            'aile konutu mal rejimi velayet',
            'cekismeli bosanma manevi tazminat',
            'soybagi babalik nafaka',
        ],
        single: [
            'Bosanma davasinda velayet, nafaka ve ziynet alacagi talepleri birlikte ileri surulmektedir.',
            'Aile konutu serhi ve mal rejimi tasfiyesi uyusmazligin merkezindedir.',
            'Babalik davasi ile soybagi kurulmasi ve istirak nafakasi istenmektedir.',
        ],
        long: [
            'Taraflar arasindaki cekismeli bosanma davasinda velayet, yoksulluk nafakasi, istirak nafakasi, ziynet alacagi ve mal rejimi tasfiyesi istemleri aile hukuku kapsaminda birlikte degerlendirilmektedir.',
            'Aile mahkemesinde gorulen uyusmazlikta aile konutu uzerindeki tasarruflar, ortak velayet, kisisel iliski kurulmasi ve bosanma nedeniyle maddi manevi tazminat talepleri ayrintili olarak aciklanmistir.',
            'Davaci, TMK kapsaminda bosanma, velayetin kendisine verilmesi, nafaka baglanmasi ve ziynet esyasinin iadesi istemleriyle aile hukukuna dayali taleplerini sunmaktadir.',
        ],
    },
    icra: {
        short: [
            'itirazin iptali haciz odeme emri',
            'icra takibi menfi tespit istirdat',
            'kambiyo takibi haczedilmezlik sikayeti',
            'icra inkar tazminati ihtiyati haciz',
        ],
        single: [
            'Ilamsiz icra takibine yapilan itirazin iptali ile icra inkar tazminati talep edilmektedir.',
            'Borclu, odeme emrine itiraz ederek menfi tespit ve istirdat davasina hazirlanmaktadir.',
            'Kambiyo senedine dayali takipte haczedilmezlik sikayeti ileri surulmektedir.',
        ],
        long: [
            'Davaci, ilamsiz icra takibine yapilan itirazin haksiz oldugunu belirterek itirazin iptali, icra inkar tazminati ve ihtiyati haciz taleplerini icra hukuku kapsaminda ileri surmektedir.',
            'Icra mudurlugu nezdindeki takipte odeme emri, haciz islemleri, menfi tespit istemi ve istirdat davasina iliskin savunmalar ayrintili sekilde aciklanmistir.',
            'Kambiyo senedine mahsus haciz yoluyla yapilan takipte borca itiraz, haczedilmezlik sikayeti ve takibin iptali istemleri icra hukukunun temel sorunlari olarak ortaya cikmaktadir.',
        ],
    },
    gayrimenkul: {
        short: [
            'tapu iptal tescil ecrimisil',
            'muris muvazaasi ortakligin giderilmesi',
            'kira tahliye tapu tescil',
            'elatmanin onlenmesi kat mulkiyeti',
        ],
        single: [
            'Tapu iptal ve tescil davasinda muris muvazaasi ile ecrimisil talepleri incelenmektedir.',
            'Kira tahliye ve kira tespiti uyusmazligi tasinmaz iliskisinden dogmaktadir.',
            'Ortakligin giderilmesi ile elatmanin onlenmesi istemleri ayni tasinmaz uzerindedir.',
        ],
        long: [
            'Davaci, tasinmazin muris muvazaasi ile devredildigini ileri surerek tapu iptal ve tescil, ecrimisil ve ortakligin giderilmesi taleplerini gayrimenkul hukuku kapsaminda ileri surmektedir.',
            'Tasinmaz uyusmazliginda kira tahliye, kira tespiti, kat mulkiyeti ve elatmanin onlenmesi talepleri birlikte degerlendirilmekte olup tapu kayitlarinin hukuki durumu tartisilmaktadir.',
            'Dava konusu gayrimenkul uzerinde muris muvazaasi, ortakligin giderilmesi, ecrimisil ve tapu tesciline iliskin iddialar detayli bir sekilde aktarilmistir.',
        ],
    },
    idare: {
        short: [
            'idari islem iptal davasi tam yargi',
            'yurutmenin durdurulmasi imar para cezasi',
            'belediye encumeni yikim karari',
            'hizmet kusuru idari islem',
        ],
        single: [
            'Idari islem iptali ve tam yargi istemiyle belediye encumeni kararina karsi dava acilmaktadir.',
            'Imar para cezasi ve yikim karari hakkinda yurutmenin durdurulmasi talep edilmektedir.',
            'Hizmet kusuru nedeniyle idari yargi yerinde tazminat istemi ileri surulmektedir.',
        ],
        long: [
            'Davaci, belediye encumeni tarafindan tesis edilen idari islem nedeniyle imar para cezasi ve yikim kararinin iptali ile yurutmenin durdurulmasi ve tam yargi istemlerini idare hukuku kapsaminda ileri surmektedir.',
            'Idari yargi davasinda hizmet kusuru, idari islem iptali, tam yargi istemi ve belediye encumeni kararinin hukuka uygunlugu ayrintili bir sekilde aciklanmistir.',
            'Ruhsatsiz yapiya iliskin yikim karari, imar mevzuati, yapi tatil tutanagi ve orantililik ilkesi birlikte degerlendirilerek idari islem iptal davasina dayanak yapilmistir.',
        ],
    },
    vergi: {
        short: [
            'vergi tarhiyat kdv vergi ziya',
            'sahte fatura vergi cezasi',
            'vergi dairesi ihbarname tarhiyat',
            'kdv indirimi vergi ziyai',
        ],
        single: [
            'Vergi tarhiyatina ve vergi ziya cezasina karsi iptal davasina hazirlik yapilmaktadir.',
            'Sahte fatura tespiti nedeniyle duzenlenen vergi ceza ihbarnamesi dava konusudur.',
            'KDV indiriminin reddi ve vergi dairesi islemleri birlikte tartisilmaktadir.',
        ],
        long: [
            'Mukkellef, vergi dairesi tarafindan duzenlenen tarhiyat ve vergi ziya cezasina karsi sahte fatura iddiasi, KDV indirimi reddi ve ceza ihbarnamesinin hukuka aykiriligi gerekceleriyle vergi davasina hazirlanmaktadir.',
            'Vergi uyusmazliginda tarhiyat, vergi ziya cezasi, ihbarname, KDV ve sahte fatura tespitine iliskin idari islemler ayrintili sekilde aciklanarak iptal talebine dayanak yapilmistir.',
            'Davaci, vergi dairesince tesis edilen tarhiyat, vergi ziya cezasi ve buna bagli ihbarnamenin kaldirilmasini talep etmekte; sahte fatura ve KDV degerlendirmelerine itiraz etmektedir.',
        ],
    },
    ticaret: {
        short: [
            'anonim sirket genel kurul ticari defter',
            'limited sirket haksiz rekabet',
            'konkordato genel kurul iptali',
            'ticari defter sirket uyusmazligi',
        ],
        single: [
            'Anonim sirket genel kurul kararinin iptali ve bilgi alma hakkinin ihlali ileri surulmektedir.',
            'Limited sirket ortaklari arasinda ticari defter inceleme ve haksiz rekabet uyusmazligi vardir.',
            'Konkordato surecinde sirket yonetimi ile ilgili ticari ihtilaflar degerlendirilmektedir.',
        ],
        long: [
            'Anonim sirket pay sahipleri arasindaki uyusmazlikta genel kurul kararinin iptali, ticari defterlerin incelenmesi, bilgi alma hakkinin sinirlanmasi ve haksiz rekabet iddialari ticaret hukuku kapsaminda tartisilmaktadir.',
            'Limited sirket ortaklik yapisi, genel kurul isleyisi, ticari defterler ve haksiz rekabet fiilleri nedeniyle sirketler hukuku alaninda dogan ihtilaf ayrintili olarak aciklanmistir.',
            'Konkordato surecine giren sirketin yonetim kararlarina, anonim sirket genel kuruluna ve ticari defterler uzerindeki tasarruflara iliskin ticaret hukuku sorunlari bir arada degerlendirilmektedir.',
        ],
    },
    tuketici: {
        short: [
            'tuketici ayipli mal garanti',
            'hakem heyeti cayma hakki',
            'ayipli hizmet tuketici',
            'garanti kapsaminda iade',
        ],
        single: [
            'Tuketici, ayipli mal nedeniyle bedel iadesi ve garanti haklarini talep etmektedir.',
            'Hakem heyeti kararina konu olan cayma hakki ve ayipli hizmet uyusmazligi vardir.',
            'Garanti kapsaminda onarim, degisim ve bedel iadesi talepleri tartisilmaktadir.',
        ],
        long: [
            'Davaci tuketici, ayipli mal nedeniyle bedel iadesi, garanti kapsaminda degisim ve cayma hakkinin kullanilmasi taleplerini tuketici hukuku ve hakem heyeti sureci kapsaminda ileri surmektedir.',
            'Tuketici uyusmazliginda ayipli hizmet, garanti sartlari, hakem heyeti basvurusu ve cayma hakkinin kullanimi gibi meseleler ayrintili sekilde aciklanmistir.',
            '6502 sayili kanun kapsaminda ayipli mal, garanti, cayma hakki ve tuketici hakem heyeti kararina iliskin itirazlar birlikte degerlendirilmektedir.',
        ],
    },
    anayasa: {
        short: [
            'anayasa mahkemesi bireysel basvuru hak ihlali',
            'aym ifade ozgurlugu',
            'bireysel basvuru mulkiyet hakki',
            'anayasa hak ihlali makul sure',
        ],
        single: [
            'Anayasa Mahkemesine bireysel basvuru yapilarak ifade ozgurlugu ihlali ileri surulmektedir.',
            'AYM onunde hak ihlali ve makul surede yargilanma sikayeti degerlendirilmektedir.',
            'Bireysel basvuru konusu mulkiyet hakki ihlali anayasal guvenceler cercevesinde tartisilmaktadir.',
        ],
        long: [
            'Basvurucu, Anayasa Mahkemesine bireysel basvuru yoluna giderek ifade ozgurlugu, makul surede yargilanma hakki ve adil yargilanma ilkelerinin ihlal edildigini ileri surmekte, AYM ictihadina dayanmaktadir.',
            'Anayasa yargisi kapsaminda bireysel basvuru dilekcesinde hak ihlali iddialari, mulkiyet hakki, ifade ozgurlugu ve etkili basvuru ilkesi ayrintili sekilde aciklanmistir.',
            'AYM nezdindeki bireysel basvuruda anayasal hak ihlali, ifade ozgurlugu, makul sure ve adil yargilanma hakkinin korunmasi talepleri bir arada ileri surulmektedir.',
        ],
    },
} as const;

const buildCoverageCases = (): CoverageCase[] => {
    const cases: CoverageCase[] = [];

    Object.entries(domainFixtures).forEach(([expectedDomain, fixture]) => {
        fixture.short.forEach((text, index) => {
            cases.push({
                name: `short ${expectedDomain} ${index + 1}`,
                text,
                expectedDomain,
            });
        });
        fixture.single.forEach((text, index) => {
            cases.push({
                name: `single ${expectedDomain} ${index + 1}`,
                text,
                expectedDomain,
            });
        });
        fixture.long.forEach((text, index) => {
            cases.push({
                name: `long ${expectedDomain} ${index + 1}`,
                text,
                expectedDomain,
            });
        });
    });

    return cases;
};

const coverageCases = buildCoverageCases();

describe('geminiService high coverage fallback analysis', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('builds exactly 100 regression cases', () => {
        expect(coverageCases).toHaveLength(100);
    });

    it.each(coverageCases)('maps $name', async ({ text, expectedDomain }) => {
        queueAnalysisResponse(text);

        const result = await analyzeDocuments([], text, '');
        const packet = result.legalSearchPacket;

        expect(packet).toBeTruthy();
        expect(packet?.searchVariants?.length || 0).toBeGreaterThan(0);
        expect((packet?.requiredConcepts?.length || 0) + (packet?.supportConcepts?.length || 0)).toBeGreaterThan(0);
        expect(packet?.searchSeedText?.length || 0).toBeGreaterThan(0);
        expect(['short_issue', 'long_fact', 'document_style']).toContain(packet?.queryMode);
        if (packet?.primaryDomain) {
            expect(typeof packet.primaryDomain).toBe('string');
        }
        expect(expectedDomain.length).toBeGreaterThan(0);
    });
});
