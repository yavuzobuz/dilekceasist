/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildSkillBackedSearchPackage } from '../lib/legal/legal-search-skill.js';
import { buildSearchStrategies } from '../lib/legal/legal-strategy-builder.js';
import { resolveLegalSearchContract } from '../lib/legal/legal-search-packet-adapter.js';
import { extractLegalSearchDiagnostics } from '../src/utils/legalSearch';
import { sanitizeLegalInput } from '../lib/legal/legal-text-utils.js';

describe('legal search skill integration', () => {
    it('builds a ceza long_fact skill package for long iddianame-style drug files', async () => {
        const rawText = `
T.C. ELAZIG CUMHURIYET BASSAVCILIGI HAZIRLIK BUROSU
Supheli hakkinda TCK 188/3 kapsaminda uyusturucu veya uyarici madde ticareti yapma veya saglama sucu nedeniyle kamu davasi acilmasi talep edilmektedir.
Dosyada paketleme materyali, telefon inceleme tutanagi, parmak izi ekspertiz raporu, tanik beyanlari ve kriminal rapor bulunmaktadir.
Sanik ise ele gecen maddenin kisisel kullanim amacli oldugunu ve ticaret kastinin bulunmadigini savunmaktadir.
        `.repeat(8);

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('ceza');
        expect(skillPackage?.queryMode).toBe('case_file');
        expect(skillPackage?.strategies).toHaveLength(3);

        const strategyA = skillPackage?.strategies?.[0]?.plan;
        expect(strategyA?.retrievalConcepts?.length).toBeLessThanOrEqual(3);
        expect(strategyA?.retrievalConcepts).toEqual(expect.arrayContaining([
            'uyusturucu madde ticareti',
        ]));
        expect(strategyA?.retrievalConcepts).not.toEqual(expect.arrayContaining([
            'paketleme',
            'tanik',
        ]));
        expect(strategyA?.evidenceConcepts).toEqual(expect.arrayContaining([
            'paketleme',
            'telefon incelemesi',
            'parmak izi',
            'tanik',
        ]));
        expect(strategyA?.primaryBirimCodes).toEqual(['C10']);
        expect(strategyA?.secondaryBirimCodes).toEqual(expect.arrayContaining(['C8', 'C20']));
    });

    it('routes hakaret dosyalarini 4. ceza dairesi odakli skill ile kurar', () => {
        const rawText = `
Sanik hakkinda kamu gorevlisine hakaret, cumhurbaskanina hakaret ve gorevi yaptirmamak icin direnme
suclarindan ceza davasi acilmistir. Sosyal medya paylasimlari, tanik anlatimlari ve mesaj icerikleri tartisilmaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('ceza');
        expect(skillPackage?.context?.subdomain).toBe('ceza_hakaret_kamu_duzeni');
        expect(skillPackage?.context?.suggestedCourt).toBe('4. Ceza Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['C4']);
    });

    it('routes cinsel istismar dosyalarini 9. ceza dairesi odakli skill ile kurar', () => {
        const rawText = `
Sanik hakkinda TCK 103 kapsaminda cocuklarin cinsel istismari sucu nedeniyle kamu davasi acilmistir.
Magdur beyani, adli tip raporu ve psikolog gorusu dosyada degerlendirilmektedir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('ceza');
        expect(skillPackage?.context?.subdomain).toBe('ceza_cinsel');
        expect(skillPackage?.context?.suggestedCourt).toBe('9. Ceza Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['C9']);
    });

    it('routes kacakcilik dosyalarini 7. ceza dairesi odakli skill ile kurar', () => {
        const rawText = `
Sanik hakkinda akaryakit kacakciligi ve gumruk kacakciligi suclariyla ilgili ceza davasinda
arama tutanaklari, irsaliyeler ve faturalar tartisilmaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('ceza');
        expect(skillPackage?.context?.subdomain).toBe('ceza_kacakcilik_bankacilik');
        expect(skillPackage?.context?.suggestedCourt).toBe('7. Ceza Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['C7']);
    });

    it('routes trafik taksir dosyalarini 12. ceza dairesi odakli skill ile kurar', () => {
        const rawText = `
Sanik hakkinda taksirle oldurme ve trafik guvenligini tehlikeye sokma suclari nedeniyle acilan ceza davasinda
bilirkişi raporu, trafik tutanagi ve kusur dagilimi tartisilmaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('ceza');
        expect(skillPackage?.context?.subdomain).toBe('ceza_taksir_ozel_hayat_trafik');
        expect(skillPackage?.context?.suggestedCourt).toBe('12. Ceza Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['C12']);
    });

    it('routes aile metinlerini aile skilline yonlendirir', () => {
        const rawText = `
Davaci, TMK 166 kapsaminda bosanma, nafaka ve velayet talebinde bulunmaktadir.
Cocugun ustun yarari, kisisel iliski duzeni ve sosyal inceleme raporu dosyada tartisilmaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('aile');
        expect(skillPackage?.context?.domainLabel).toBe('Aile hukuku');
        expect(skillPackage?.context?.strictResultMode).toBe(true);
        expect(skillPackage?.context?.subdomain).toBe('aile_bosanma');
        expect(skillPackage?.context?.suggestedCourt).toBe('2. Hukuk Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H2']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('hard_primary');
        expect(skillPackage?.strategies?.map((item) => item.plan.strategyCode)).toEqual(['A', 'B', 'C']);
        expect(skillPackage?.strategies?.[0]?.plan?.retrievalConcepts).toEqual(expect.arrayContaining([
            'bosanma',
            'tmk 166',
        ]));
        expect(skillPackage?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('+"bosanma"');
    });

    it('routes ticari icra itirazin iptali metinlerini 11. hukuk odakli alt skill ile kurar', () => {
        const rawText = `
Davaci, cari hesap alacagindan kaynaklanan itirazin iptali davasinda alacagin ispatini, icra inkar tazminatini,
IIK 67 kapsamindaki kosullari, ticari defterleri, faturalar ile mutabakat kayitlarini tartismaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('icra');
        expect(skillPackage?.context?.strictResultMode).toBe(true);
        expect(skillPackage?.context?.subdomain).toBe('icra_ticari_itirazin_iptali');
        expect(skillPackage?.context?.suggestedCourt).toBe('11. Hukuk Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H11']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['H19']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
        expect(skillPackage?.strategies?.[0]?.plan?.searchClauses).toEqual(expect.arrayContaining([
            'itirazin iptali cari hesap alacagi icra inkar tazminati',
            'menfi tespit istirdat icra takibi',
            'IIK 67 itirazin iptali',
        ]));
        expect(skillPackage?.strategies?.[0]?.plan?.negativeConcepts).toEqual(expect.arrayContaining([
            'nafaka',
            'velayet',
            'bosanma',
        ]));
    });

    it('keeps icra mahkemesi ve haciz odakli metinleri 12. hukuk odakli skillde tutar', () => {
        const rawText = `
Davaci, icra mahkemesinde haczedilemezlik sikayeti, maas haczi, odeme emrine itiraz ve itirazin kaldirilmasi
sebepleriyle takip hukukuna iliskin sikayetlerini ileri surmustur.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('icra');
        expect(skillPackage?.context?.subdomain).toBe('icra_itirazin_kaldirilmasi_sikayet');
        expect(skillPackage?.context?.suggestedCourt).toBe('12. Hukuk Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H12']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('hard_primary');
    });

    it('routes idare metinlerini idare skilline yonlendirir', () => {
        const rawText = `
Davaci, imar para cezasi, yikim karari ve ruhsat iptali nedeniyle tam yargi davasinda
orantililik ilkesinin, kazanilmis hak iddiasinin ve belediye islemlerinin sonuclarini tartismaktadir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('idare');
        expect(skillPackage?.context?.domainLabel).toBe('Idare hukuku');
        expect(skillPackage?.context?.subdomain).toBe('idare_imar');
        expect(skillPackage?.sourceTargets).toEqual(expect.arrayContaining(['danistay']));
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['D6']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('hard_primary');
        expect(skillPackage?.strategies?.[0]?.plan?.retrievalConcepts).toEqual(expect.arrayContaining([
            'imar para cezasi',
        ]));
        expect(skillPackage?.strategies?.[0]?.plan?.negativeConcepts).toEqual(expect.arrayContaining([
            'ceza dairesi',
            'hukuk dairesi',
        ]));
    });

    it('routes marka iltibas metinlerini ticaret skilline yonlendirir', () => {
        const rawText = `
Davaci, tescilli markasina iltibas olusturan kullanim nedeniyle marka hakkina tecavuzun tespiti,
haksiz rekabetin durdurulmasi ve markanin hukumsuzlugu taleplerini ileri surmektedir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe('ticaret');
        expect(skillPackage?.context?.subdomain).toBe('ticaret_marka_iltibas');
        expect(skillPackage?.context?.suggestedCourt).toBe('11. Hukuk Dairesi');
        expect(skillPackage?.strategies?.[0]?.plan?.searchClauses).toEqual(expect.arrayContaining([
            '+\"marka\" +\"karistirilma ihtimali\" +\"haksiz rekabet\"',
        ]));
    });

    it('does not let mismatched ai plan overwrite an explicit ticaret packet', () => {
        const { legalSearchPacket } = resolveLegalSearchContract({
            rawText: '',
            preferredSource: 'all',
            explicitPacket: {
                primaryDomain: 'ticaret',
                preferredSource: 'yargitay',
                searchSeedText: 'marka tescil iltibas hukumsuzluk haksiz rekabet',
                requiredConcepts: ['marka hakki', 'haksiz rekabet', 'iltibas'],
                supportConcepts: ['tescil', 'hukumsuzluk', 'tecavuz'],
            },
            aiSearchPlan: {
                primaryDomain: 'gayrimenkul',
                decisionType: 'gayrimenkul_tapu',
                retrievalConcepts: ['tapu iptali', 'tescil'],
                supportConcepts: ['muris muvazaasi'],
                searchClauses: ['+\"tapu iptali\" +\"tescil\" +\"muris muvazaasi\"'],
            },
        });

        expect(legalSearchPacket?.primaryDomain).toBe('ticaret');
        expect(legalSearchPacket?.caseType).not.toBe('gayrimenkul_tapu');
        expect((legalSearchPacket?.searchVariants || []).some((item) => item.query.includes('tapu iptali'))).toBe(false);
    });

    it('repairs mojibake text before planning', () => {
        const repaired = sanitizeLegalInput('MÃ¼vekkil hatalÄ± EFT nedeniyle parayi geri alamadi.');
        expect(repaired.encodingRepaired).toBe(true);
        expect(repaired.text).toContain('Müvekkil');
        expect(repaired.text).toContain('hatalı EFT');
    });

    it('routes kamudaki mobbing ve tam yargi metinlerini idareye zorlar', () => {
        const rawText = `
Muvekkil bir devlet universitesinde kadrolu memurdur. Rektorluk degisimi sonrasinda gecici gorevlendirme ile farkli ilcelere surulmus,
Idare Mahkemesinde bu islemlerin iptali icin davalar acmis, hizmet kusuru ve tam yargi davasina konu olacak sistematik mobbing yasamistir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('idare');
        expect(skillPackage?.sourceTargets).toEqual(expect.arrayContaining(['danistay']));
    });

    it('repairs generic hard-case diagnosis into the real legal institution', async () => {
        const rawText = `
Muvekkilim, mobil bankacilik uzerinden sirketinin tedarikcisine odeme yapacakken IBAN numarasinda yaptigi hata nedeniyle
450.000 TL parayi tanimadigi bir kisinin hesabina gondermistir. Karsi taraf parayi iade etmemektedir.
        `;

        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        const strategies = await buildSearchStrategies({
            rawText,
            preferredSource: 'all',
            skillPackage,
        });

        expect(strategies[0].legalDiagnosis).toContain('sebepsiz zenginlesme');
        expect(strategies[0].plan.initialKeyword).toContain('sebepsiz');
        expect(strategies[0].plan.requestedRelief).toBeTruthy();
        expect(strategies[0].plan.diagnosisConfidence).toBeGreaterThan(0.5);
    });

    it('keeps strategy order and ceza negatives when skill package is passed into strategy builder', async () => {
        const rawText = 'TCK 191 kapsaminda kullanmak icin uyusturucu madde bulundurma sucunda kisisel kullanim siniri ve kullanici tanik beyaninin delil degeri.';
        const skillPackage = buildSkillBackedSearchPackage({
            rawText,
            preferredSource: 'all',
        });

        const strategies = await buildSearchStrategies({
            rawText,
            preferredSource: 'all',
            skillPackage,
        });

        expect(strategies.map((item) => item.plan.strategyCode)).toEqual(['A', 'B', 'C']);
        expect(strategies[0].plan.primaryDomain).toBe('ceza');
        expect(strategies[0].plan.initialKeyword).toContain('uyusturucu');
        expect(strategies[0].plan.negativeConcepts).toEqual(expect.arrayContaining([
            'hukuk dairesi',
            '4. hukuk dairesi',
            'danistay',
        ]));
        expect(strategies[0].plan.searchClauses).toEqual(expect.arrayContaining([
            '+\"kullanmak icin bulundurma\" +\"kisisel kullanim siniri\" +\"beraat\"',
        ]));
        expect(strategies[0].plan.suggestedCourt).toContain('10. Ceza Dairesi');
    });

    it('splits anayasa bireysel basvuru ile norm denetimini ayri skill planlarina ayirir', () => {
        const bireyselText = `
Basvurucu, adil yargilanma hakkinin ve makul sure ilkesinin ihlal edildigini, ic hukuk yollarini tukettigini
ve bireysel basvuru kapsaminda yeniden yargilama ile manevi tazminat talep ettigini belirtmistir.
        `;
        const normText = `
Mahkeme, kanun hukmunun Anayasa'ya aykiriligi itirazini ciddi bulmus; esitlik ilkesi, belirlilik ilkesi
ve olcululuk yonunden norm denetimi yoluna gidilmesini tartismistir.
        `;

        const bireyselPackage = buildSkillBackedSearchPackage({
            rawText: bireyselText,
            preferredSource: 'all',
        });
        const normPackage = buildSkillBackedSearchPackage({
            rawText: normText,
            preferredSource: 'all',
        });

        expect(bireyselPackage?.primaryDomain).toBe('anayasa');
        expect(bireyselPackage?.context?.subdomain).toBe('anayasa_bireysel_basvuru_makul_sure');
        expect(bireyselPackage?.context?.decisionType).toBe('bireysel_basvuru');
        expect(bireyselPackage?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('+"bireysel basvuru"');

        expect(normPackage?.primaryDomain).toBe('anayasa');
        expect(normPackage?.context?.subdomain).toBe('anayasa_norm_denetimi');
        expect(normPackage?.context?.decisionType).toBe('norm_denetimi');
        expect(normPackage?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('+"anayasaya aykirilik"');
    });

    it('prefers H11 only for ticaret genel kurul and keeps marka routing separate', () => {
        const genelKurulPackage = buildSkillBackedSearchPackage({
            rawText: 'Anonim sirket genel kurul kararinin iptali, TTK 445 ve TTK 446 kapsaminda pay sahipligi ve cagri usulsuzlugu tartisilmaktadir.',
            preferredSource: 'all',
        });
        const markaPackage = buildSkillBackedSearchPackage({
            rawText: 'Tescilli markaya iltibas olusturan kullanim nedeniyle marka tecavuzu, hukumsuzluk ve haksiz rekabet iddialari tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(genelKurulPackage?.context?.subdomain).toBe('ticaret_genel_kurul');
        expect(genelKurulPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H11']);
        expect(genelKurulPackage?.strategies?.[0]?.plan?.denyConcepts).toEqual(expect.arrayContaining(['icra', 'kambiyo']));

        expect(markaPackage?.context?.subdomain).toBe('ticaret_marka_iltibas');
        expect(markaPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H11']);
        expect(markaPackage?.strategies?.[0]?.plan?.denyConcepts).toEqual(expect.arrayContaining(['tapu', 'cari hesap']));
    });

    it('builds routing profile with anayasa source-first policy and D3 tax chamber group', () => {
        const anayasaContract = resolveLegalSearchContract({
            rawText: 'Anayasa Mahkemesi bireysel basvurusunda makul surede yargilanma hakkinin ihlali nedeniyle manevi tazminat talep edilmektedir.',
            preferredSource: 'all',
            explicitPacket: {
                primaryDomain: 'anayasa',
                preferredSource: 'anayasa',
            },
        });
        const vergiContract = resolveLegalSearchContract({
            rawText: 'Sahte fatura nedeniyle KDV indirimi reddi, vergi ziya cezasi ve resen tarhiyat islemine karsi acilan vergi davasi.',
            preferredSource: 'all',
            explicitPacket: {
                primaryDomain: 'vergi',
                preferredSource: 'danistay',
            },
        });

        expect(anayasaContract.legalSearchPacket?.caseType).toBe('anayasa_bireysel_basvuru_makul_sure');
        expect(anayasaContract.routingProfile?.sourcePolicy).toBe('anayasa');
        expect(anayasaContract.routingProfile?.routingMode).toBe('source_first');
        expect(anayasaContract.routingProfile?.primaryBirimCodes).toEqual([]);
        expect(anayasaContract.routingProfile?.strictMatchMode).toBe('must_support');
        expect(anayasaContract.routingProfile?.mustConcepts).toEqual(expect.arrayContaining(['bireysel basvuru', 'makul sure']));

        expect(vergiContract.legalSearchPacket?.caseType).toBe('vergi_kdv_sahte_fatura');
        expect(vergiContract.routingProfile?.primaryBirimCodes).toEqual(['D3']);
        expect(vergiContract.routingProfile?.secondaryBirimCodes).toEqual(['VDDK']);
        expect(vergiContract.routingProfile?.routingMode).toBe('primary_secondary');
    });

    it('routes borclar kira metinlerini H3 primary with H12 and H11 secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Kira sozlesmesinden dogan tahliye, kira artisi, tahliye taahhudu ve finansal kiralama savunmalari birlikte tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('borclar');
        expect(skillPackage?.context?.subdomain).toBe('borclar_kira');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H3']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['H12', 'H11']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('routes gayrimenkul tapu ve muris muvazaasi metinlerini H1 hard primary ile kurar', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Yolsuz tescil nedeniyle tapu iptali ve tescil istemiyle tapu kaydi, tasinmaz devri ve mulkiyet iliskisi tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('gayrimenkul');
        expect(skillPackage?.context?.subdomain).toBe('gayrimenkul_tapu');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H1']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual([]);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('hard_primary');
    });

    it('routes konkordato ve iflas metinlerini H6 primary with H23 legacy secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Konkordato tasdiki, iflas, sira cetveli ve kayit kabul-terkin istemleri ayni ticari uyusmazlikta tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('ticaret');
        expect(skillPackage?.context?.subdomain).toBe('ticaret_konkordato_iflas');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H6']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['H23']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('routes tuketici ayipli mal metinlerini H3 hard primary ile kurar', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Ayipli mal nedeniyle bedel iadesi, degisim, garanti ve tuketici hakem heyeti karari tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('tuketici');
        expect(skillPackage?.context?.subdomain).toBe('tuketici_ayipli_mal');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H3']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('hard_primary');
    });

    it('routes sigorta trafik uyusmazliklarini H4 primary with H11 secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Trafik kazasi nedeniyle deger kaybi, destekten yoksun kalma ve sigorta sirketinin tazminat sorumlulugu tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('sigorta');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H4']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['H11']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('routes miras muris muvazaasi metinlerini H1 primary with H7 secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Muris muvazaasi nedeniyle tapu iptali ve tescil istemiyle sakli pay, mirascilik ve tenkis sorunlari birlikte ileri surulmektedir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('miras');
        expect(skillPackage?.context?.subdomain).toBe('miras_muris_muvazaasi');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H1']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['H7']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('routes idare disiplin metinlerini D12 primary with D2 and D5 secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: '657 sayili Kanun kapsaminda memura verilen kademe ilerlemesinin durdurulmasi cezasi, disiplin kurulu karari ve memurluk statusu idari yargida tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('idare');
        expect(skillPackage?.context?.subdomain).toBe('idare_disiplin');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['D12']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['D2', 'D5']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('routes vergi gumruk otv metinlerini D7 primary with VDDK secondary support', () => {
        const skillPackage = buildSkillBackedSearchPackage({
            rawText: 'Ithalatta alinan OTV ve gumruk vergilerine iliskin tarhiyat, gumruk idaresi islemleri ve ithalat rejimi ihtilaflari tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(skillPackage?.primaryDomain).toBe('vergi');
        expect(skillPackage?.context?.subdomain).toBe('vergi_gumruk_otv');
        expect(skillPackage?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['D7']);
        expect(skillPackage?.strategies?.[0]?.plan?.secondaryBirimCodes).toEqual(['VDDK']);
        expect(skillPackage?.strategies?.[0]?.plan?.routingMode).toBe('primary_secondary');
    });

    it('surfaces skill diagnostics and zero-result messaging to the frontend helper', () => {
        const diagnostics = extractLegalSearchDiagnostics({
            results: [],
            skillDiagnostics: {
                active: true,
                skillId: 'turk-hukuku-karar-arama',
                primaryDomain: 'ceza',
                domainLabel: 'Ceza',
                attemptedStrategies: ['A', 'B', 'C'],
                fallbackAttempted: true,
                zeroResultReason: 'skill_no_match',
                zeroResultMessage: 'Ceza skill dogru alani aradi ama uygun karar bulamadi.',
            },
        }, []);

        expect(diagnostics.skillDiagnostics?.active).toBe(true);
        expect(diagnostics.zeroResultReason).toBe('skill_no_match');
        expect(diagnostics.zeroResultMessage).toBe('Ceza skill dogru alani aradi ama uygun karar bulamadi.');
    });

    it('splits icra wave-1 intents into menfi tespit, meskeniyet, and ihalenin feshi variants', () => {
        const menfiTespit = buildSkillBackedSearchPackage({
            rawText: 'Davali, IIK 72 kapsaminda menfi tespit ve icra inkar tazminati savunmasi ileri surmektedir.',
            preferredSource: 'all',
        });
        const meskeniyet = buildSkillBackedSearchPackage({
            rawText: 'Haczedilemezlik ve meskeniyet sikayeti ile haline munasip ev oldugu ileri surulmektedir.',
            preferredSource: 'all',
        });
        const ihaleFeshi = buildSkillBackedSearchPackage({
            rawText: 'Ihalenin feshi isteminde kiymet takdiri, satis ilani ve usulsuzluk iddialari tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(menfiTespit?.primaryDomain).toBe('icra');
        expect(menfiTespit?.context?.subdomain).toBe('icra_menfi_tespit');
        expect(menfiTespit?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('IIK 72');

        expect(meskeniyet?.primaryDomain).toBe('icra');
        expect(meskeniyet?.context?.subdomain).toBe('icra_meskeniyet');
        expect(meskeniyet?.strategies?.[0]?.plan?.primaryBirimCodes).toEqual(['H12']);

        expect(ihaleFeshi?.primaryDomain).toBe('icra');
        expect(ihaleFeshi?.context?.subdomain).toBe('icra_ihalenin_feshi');
        expect(ihaleFeshi?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('kiymet takdiri');
    });

    it('splits is hukuku wave-1 intents into fazla mesai, 270 saat, hizmet tespiti, and is kazasi rucu variants', () => {
        const fazlaMesai = buildSkillBackedSearchPackage({
            rawText: 'Fazla mesai alacagi icin puantaj, bordro ve ucret hesap pusulasi birlikte tartisilmaktadir.',
            preferredSource: 'all',
        });
        const ikiYuzYetmisSaat = buildSkillBackedSearchPackage({
            rawText: 'Yillik 270 saat uzeri fazla calisma yapildigi, bordro ve devam cizelgeleri ile ileri surulmektedir.',
            preferredSource: 'all',
        });
        const hizmetTespiti = buildSkillBackedSearchPackage({
            rawText: 'Hizmet tespiti davasinda SGK kayitlari, 5510 sayili Kanun ve prim bildirimi tartisilmaktadir.',
            preferredSource: 'all',
        });
        const isKazasiRucu = buildSkillBackedSearchPackage({
            rawText: 'Is kazasi nedeniyle SGK rucu ve kusur payi ile meslek hastaligi tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(fazlaMesai?.context?.subdomain).toBe('is_hukuku_fazla_mesai_puantaj');
        expect(fazlaMesai?.strategies?.[0]?.plan?.retrievalConcepts).toEqual(expect.arrayContaining([
            'fazla mesai',
            'fazla calisma',
        ]));

        expect(ikiYuzYetmisSaat?.context?.subdomain).toBe('is_hukuku_fazla_calisma_270_saat');
        expect(ikiYuzYetmisSaat?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('270 saat');

        expect(hizmetTespiti?.context?.subdomain).toBe('is_hukuku_hizmet_tespiti_sgk');
        expect(hizmetTespiti?.strategies?.[0]?.plan?.retrievalConcepts).toEqual(expect.arrayContaining([
            'hizmet tespiti',
            'sigortalilik tespiti',
        ]));

        expect(isKazasiRucu?.context?.subdomain).toBe('is_hukuku_is_kazasi_rucu');
        expect(isKazasiRucu?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('is kazasi');
    });

    it('splits ceza uyuşturucu wave-1 intents into usage-defense and packaging variants', () => {
        const kullanmaSavunmasi = buildSkillBackedSearchPackage({
            rawText: 'Sanik, kullanmak icin bulundurma ve kisisel kullanim siniri savunmasi ile TCK 191 uygulanmasini istemektedir.',
            preferredSource: 'all',
        });
        const paketleme = buildSkillBackedSearchPackage({
            rawText: 'Dosyada paketleme, hassas terazi ve ele gecirilen miktar TCK 188 kastini tartismaktadir.',
            preferredSource: 'all',
        });

        expect(kullanmaSavunmasi?.primaryDomain).toBe('ceza');
        expect(kullanmaSavunmasi?.context?.subdomain).toBe('ceza_uyusturucu_kullanma_savunmasi');
        expect(kullanmaSavunmasi?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('TCK 191');

        expect(paketleme?.primaryDomain).toBe('ceza');
        expect(paketleme?.context?.subdomain).toBe('ceza_uyusturucu_paketleme');
        expect(paketleme?.strategies?.[0]?.plan?.evidenceConcepts).toEqual(expect.arrayContaining([
            'paketleme',
            'hassas terazi',
        ]));
    });

    it('splits borclar wave-1 intents into kira ihtiyaci and arsa payi karsiligi insaat variants', () => {
        const kiraIhtiyac = buildSkillBackedSearchPackage({
            rawText: 'TBK 350 kapsamında ihtiyac nedeniyle tahliye, konut ihtiyaci ve samimi gereksinim tartisilmaktadir.',
            preferredSource: 'all',
        });
        const arsaPayi = buildSkillBackedSearchPackage({
            rawText: 'Arsa payi karsiligi insaat sozlesmesinde yuklenici, bagimsiz bolum ve eksik imalat ile gecikme tazminati tartisilmaktadir.',
            preferredSource: 'all',
        });

        expect(kiraIhtiyac?.primaryDomain).toBe('borclar');
        expect(kiraIhtiyac?.context?.subdomain).toBe('borclar_kira_ihtiyac');
        expect(kiraIhtiyac?.strategies?.[0]?.plan?.searchClauses?.[0]).toContain('TBK 350');

        expect(arsaPayi?.primaryDomain).toBe('borclar');
        expect(arsaPayi?.context?.subdomain).toBe('borclar_arsa_payi_karsiligi_insaat');
        expect(arsaPayi?.strategies?.[0]?.plan?.retrievalConcepts).toEqual(expect.arrayContaining([
            'arsa payi karsiligi insaat',
            'yuklenici',
        ]));
    });
});
