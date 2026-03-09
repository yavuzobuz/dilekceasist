import { GoogleGenAI } from '@google/genai';

const DEFAULT_YARGI_MCP_URL = 'https://yargimcp.fastmcp.app/mcp/';
const YARGI_MCP_URL = String(process.env.YARGI_MCP_URL || DEFAULT_YARGI_MCP_URL).trim();
const YARGI_MCP_PROTOCOL_VERSION = process.env.YARGI_MCP_PROTOCOL_VERSION || '2024-11-05';
const YARGI_MCP_TIMEOUT_MS = Math.max(
    15000,
    Math.min(120000, Number(process.env.YARGI_MCP_TIMEOUT_MS || 45000))
);
const LEGAL_RESULT_LIMIT = Math.max(
    5,
    Math.min(50, Number(process.env.LEGAL_RESULT_RETURN_LIMIT || 20))
);
const SEARCH_CACHE_TTL_MS = 60 * 1000;
const DOCUMENT_CACHE_TTL_MS = 60 * 60 * 1000;
const CONTENT_RERANK_TOTAL_LIMIT = Math.max(
    4,
    Math.min(50, Number(process.env.LEGAL_CONTENT_RERANK_TOTAL_LIMIT || 30))
);
const CONTENT_RERANK_PER_SOURCE_LIMIT = Math.max(
    2,
    Math.min(30, Number(process.env.LEGAL_CONTENT_RERANK_PER_SOURCE_LIMIT || 20))
);
const CONTENT_RERANK_BATCH_SIZE = Math.max(
    2,
    Math.min(10, Number(process.env.LEGAL_CONTENT_RERANK_BATCH_SIZE || 5))
);
const CONTENT_RERANK_BATCH_DELAY_MS = Math.max(
    0,
    Math.min(2000, Number(process.env.LEGAL_CONTENT_RERANK_BATCH_DELAY_MS || 250))
);
const CONTENT_RERANK_TRIGGER_SCORE = Math.max(
    20,
    Math.min(60, Number(process.env.LEGAL_CONTENT_RERANK_TRIGGER_SCORE || 34))
);
const USE_MCP_SEMANTIC_SEARCH = process.env.LEGAL_USE_MCP_SEMANTIC !== '0';
const SEMANTIC_TRIGGER_SCORE = Math.max(
    18,
    Math.min(70, Number(process.env.LEGAL_SEMANTIC_TRIGGER_SCORE || 45))
);
const LOCAL_GEMINI_EMBED_MODEL = process.env.LEGAL_GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const LOCAL_SEMANTIC_CANDIDATE_LIMIT = Math.max(
    4,
    Math.min(20, Number(process.env.LEGAL_LOCAL_SEMANTIC_CANDIDATE_LIMIT || 12))
);
const LOCAL_SEMANTIC_DOC_CHAR_LIMIT = Math.max(
    800,
    Math.min(6000, Number(process.env.LEGAL_LOCAL_SEMANTIC_DOC_CHAR_LIMIT || 2600))
);
const DOMAIN_PRIORITY = ['is_hukuku', 'icra', 'aile', 'ticaret', 'ceza', 'idare', 'istinaf', 'anayasa', 'hukuk'];
const normalizeConceptText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
const mergeUniqueConcepts = (...groups) => {
    const ordered = [];
    const seen = new Set();
    for (const group of groups) {
        for (const item of Array.isArray(group) ? group : []) {
            const normalized = normalizeConceptText(item);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            ordered.push(normalized);
        }
    }
    return ordered;
};
const DOMAIN_CONCEPT_LIBRARY = {
    is_hukuku: [
        'ise iade', 'feshin gecersizligi', 'gecersiz fesih', 'hakli fesih', 'gecerli fesih',
        'kidem tazminati', 'ihbar tazminati', 'fazla mesai', 'fazla surelerle calisma', 'hafta tatili ucreti',
        'ulusal bayram genel tatil', 'yillik ucretli izin', 'yillik izin ucreti', 'ucret alacagi', 'prim alacagi',
        'ikramiye alacagi', 'bosta gecen sure ucreti', 'ise baslatmama tazminati', 'sendikal tazminat', 'esit davranma ilkesi',
        'kotu niyet tazminati', 'mobbing tazminati', 'hizmet tespiti', 'is kazasi', 'meslek hastaligi',
        'rucuan tazminat', 'alt isverenlik', 'muvazaali alt isverenlik', 'isyeri devri', 'deneme suresi',
        'ara dinlenmesi', 'denklestirme uygulamasi', 'ibraname', 'savunma alinmasi', 'devamsizlik',
        'performans dusuklugu', 'is guvencesi', 'toplu is sozlesmesi', 'sendikal neden', 'ise baslatmama',
        'hizmet akdi', 'belirsiz sureli is sozlesmesi', 'belirli sureli is sozlesmesi', 'fazla calisma ucreti', 'hafta tatili alacagi',
        'genel tatil ucreti', 'asgari gecim indirimi', 'yol yemek yardimi', 'bakiye sure ucreti', 'rekabet yasagi',
        'calisma kosullarinda esasli degisiklik',
        'is sartlarinda esasli degisiklik',
        'ikale sozlesmesi',
        'istifa baskisi',
        'toplu isci cikarma',
        'hafta tatili calismasi',
        'ulusal bayram ucreti',
        'genel tatil calismasi',
        'savunma alinmadan fesih',
        'deneme suresinde fesih',
        'hakli nedenle derhal fesih',
        'kismi sureli calisma',
        'cagri uzerine calisma',
        'uzaktan calisma',
        'ucretsiz izin',
    ],
    hukuk: [
        'tapu iptal ve tescil', 'muris muvazaasi', 'ortakligin giderilmesi', 'ecrimisil', 'elatmanin onlenmesi',
        'sebepsiz zenginlesme', 'vekaletsiz is gorme', 'haksiz fiil tazminati', 'manevi tazminat', 'maddi tazminat',
        'kira tespiti', 'tahliye davasi', 'tahliye taahhudu', 'kira alacagi', 'temerrut nedeniyle tahliye',
        'eser sozlesmesi', 'ayipli ifa', 'bedel indirimi', 'satim sozlesmesi', 'arac satisi ayip',
        'tuketici kredisi', 'ayipli mal', 'ayipli hizmet', 'trafik kazasi tazminati', 'destekten yoksun kalma',
        'maluliyet tazminati', 'kisilik hakkinin ihlali', 'yayinin durdurulmasi', 'isim hakki', 'kat mulkiyeti',
        'aidat alacagi', 'komsuluk hukuku', 'su basmasi zarari', 'istihkak davasi', 'menkul istihkaki',
        'alacak davasi', 'tespit davasi', 'menfi tespit', 'muvazaa', 'miras paylasimi',
        'vasiyetnamenin iptali', 'tenkis davasi', 'miras sebebiyle istihkak', 'vekalet sozlesmesi', 'simsarlik ucreti',
        'aracilik sozlesmesi', 'sigorta tazminati', 'riziko ihbari', 'ihtiyati tedbir', 'dava sartlari',
        'kira uyarlama davasi',
        'uyarlama davasi',
        'vekalet gorevinin kotuye kullanilmasi',
        'alacagin temliki',
        'kefalet sozlesmesi',
        'ipotek fekki',
        'gaiplik karari',
        'ad degistirme davasi',
        'soyadi degisikligi davasi',
        'kat irtifaki',
        'ortak yer gideri',
        'tespit ve eda davasi',
        'zamanasimi defi',
        'tasinmaz satis vaadi',
        'haksiz ihtiyati tedbir',
    ],
    icra: [
        'ilamli icra', 'ilamsiz icra', 'itirazin iptali', 'itirazin kaldirilmasi', 'borca itiraz',
        'imzaya itiraz', 'yetkiye itiraz', 'menfi tespit', 'istirdat davasi', 'haczedilmezlik sikayeti',
        'kambiyo senedine mahsus haciz yolu', 'kambiyo takibi', 'odeme emri', 'takip talebi', 'takibin iptali',
        'takibin kesinlesmesi', 'icranin geri birakilmasi', 'ihtiyati haciz', 'ihtiyati haczin kaldirilmasi', 'rehnin paraya cevrilmesi',
        'ilamli tahliye', 'tahliye emri', 'tahliye taahhudu', 'maas haczi', 'banka hesabina haciz',
        'haciz ihbarnamesi', 'ucuncu kisi haczi', 'istihkak iddiasi', 'istihkak davasi', 'sira cetveli',
        'paraya cevirme', 'satis talebi', 'kiymet takdiri', 'ihalenin feshi', 'ilamli takip',
        'ilamsiz takip', 'iflas yolu ile takip', 'konkordato muhleti', 'gecici muhlet', 'kesin muhlet',
        'borclunun aciz hali', 'aciz belgesi', 'takas mahsup itirazi', 'faiz itirazi', 'icra inkar tazminati',
        'vekalet ucreti', 'icra emri', 'odeme itirazinin kaldirilmasi', 'gecikmis itiraz', 'takip hukuku',
        'tasarrufun iptali davasi',
        'icra mahkemesi sikayeti',
        'kesin kaldirma',
        'gecici kaldirma',
        'takibin taliki',
        'rehin acigi belgesi',
        'iflas masasi',
        'iflas idaresi',
        'iflas tasfiyesi',
        'satis ilani',
        'tahsil harci',
        'imza incelemesi',
        'borca itirazin kaldirilmasi',
        'ipotegin paraya cevrilmesi',
        'kira alacagi takibi',
    ],
    aile: [
        'bosanma', 'anlasmali bosanma', 'cekismeli bosanma', 'velayet', 'ortak velayet',
        'kisisel iliski', 'tedbir nafakasi', 'yoksulluk nafakasi', 'istirak nafakasi', 'nafakanin artirilmasi',
        'nafakanin kaldirilmasi', 'ziynet alacagi', 'dugunde takilan ziynetler', 'mal rejimi', 'edinilmis mallara katilma alacagi',
        'deger artis payi', 'katki payi alacagi', 'aile konutu', 'aile konutu serhi', 'soybaginin reddi',
        'babalik davasi', 'soybagi kurulmasi', 'dna incelemesi', 'evlat edinme', 'evlenmenin iptali',
        'nisanin bozulmasi', 'maddi tazminat', 'manevi tazminat', 'cocugun teslimi', 'cocukla kisisel iliski',
        'velayetin degistirilmesi', 'velayetin kaldirilmasi', 'vesayet', 'uzaklastirma karari', '6284 sayili kanun',
        'aile ici siddet', 'koruma tedbiri', 'mal ayriligi', 'mal ortakligi', 'paylasmali mal ayriligi',
        'evlilik birliginin sarsilmasi', 'terk nedeniyle bosanma', 'zina nedeniyle bosanma', 'hayata kast', 'onur kirici davranis',
        'akil hastaligi nedeniyle bosanma', 'evlilik birliginin temelinden sarsilmasi', 'nafaka uyarlamasi', 'babalik hukmu', 'soyadi degisikligi',
        'velayetin nezi',
        'kisisel iliskinin kaldirilmasi',
        'kisisel iliskinin yeniden duzenlenmesi',
        'aile konutunun tahsisi',
        'aile konutu serhinin kaldirilmasi',
        'nisan hediyelerinin iadesi',
        'ziynet esyasinin aynen iadesi',
        'bosanmada maddi tazminat',
        'bosanmada manevi tazminat',
        'evlilik birliginin korunmasi',
        'vasi atanmasi',
        'kayyim atanmasi',
        'kisitlama karari',
        'ergin kilinma',
        'cocuk teslimi emri',
        'velayet hakkinin kotuye kullanilmasi',
        'evlat edinmenin kaldirilmasi',
        'nafaka alacaginin tahsili',
        'soybaginin duzeltilmesi',
        'cocugun soyadi',
    ],
    ticaret: [
        'anonim sirket genel kurul karari iptali', 'yonetim kurulu sorumlulugu', 'limited sirket ortakliktan cikma', 'ortakliktan cikarilma', 'pay devri',
        'ticari defterler', 'cari hesap alacagi', 'fatura itirazi', 'cek iptali', 'bonoya itiraz',
        'police sorumlulugu', 'ciranta sorumlulugu', 'aval sorumlulugu', 'kambiyo senedi', 'konkordato',
        'gecici muhlet', 'kesin muhlet', 'iflas', 'kiymetli evrak iptali', 'haksiz rekabet',
        'acentelik sozlesmesi', 'denklestirme tazminati', 'bayilik sozlesmesi', 'franchise sozlesmesi', 'marka lisans sozlesmesi',
        'ticaret unvani', 'sirket birlesmesi', 'sirket bolunmesi', 'tasfiye memuru sorumlulugu', 'yonetici sorumlulugu',
        'tasima sozlesmesi', 'deniz ticareti', 'sigorta tazminati', 'rizikonun gerceklesmesi', 'komisyon sozlesmesi',
        'tellallik ucreti', 'ticari temsilci', 'ticari vekil', 'cari hesap mutabakati', 'teslim ve kabul',
        'ayip ihbari', 'ticari satis', 'ticari faiz', 'ihtarname', 'hamiline cek',
        'nama yazili pay', 'kar payi dagitimi', 'ortaklar kurulu karari', 'sirketten cikma payi', 'sermaye artirimi',
        'limited sirket mudur sorumlulugu',
        'genel kurul cagrisinin iptali',
        'yonetim kurulunun ibra edilmesi',
        'pay sahipligi haklari',
        'hamiline pay senedi',
        'ticari isletme rehni',
        'distributorluk sozlesmesi',
        'mal sigortasi',
        'navlun alacagi',
        'tasiyanin sorumlulugu',
        'police avalisti',
        'bono zamanasimi',
        'cek zamanasimi',
        'ticari teamul',
        'komisyoncunun sorumlulugu',
        'sirket pay devri',
        'sirketten cikma akcesi',
        'kar payi avansi',
        'ortaklar kurulu toplantisi',
        'tasfiye payi',
    ],
    ceza: [
        'kasten oldurme', 'taksirle oldurme', 'kasten yaralama', 'taksirle yaralama', 'hakaret',
        'tehdit', 'santaj', 'hirsizlik', 'yagma', 'dolandiricilik',
        'nitelikli dolandiricilik', 'guveni kotuye kullanma', 'mala zarar verme', 'konut dokunulmazligini ihlal', 'kisilerin huzur ve sukununu bozma',
        'cinsel saldiri', 'cinsel taciz', 'cocuklarin cinsel istismari', 'uyusturucu madde ticareti', 'kullanmak icin uyusturucu bulundurma',
        'resmi belgede sahtecilik', 'ozel belgede sahtecilik', 'parada sahtecilik', 'zimmet', 'irtikap',
        'rusvet', 'gorevi kotuye kullanma', 'iftira', 'suc uydurma', 'suc esyasini satin alma',
        'suc gelirlerinin aklanmasi', 'orgut uyeligi', 'silahli orgut', 'propaganda sucu', 'kisisel verilerin kaydedilmesi',
        'verileri hukuka aykiri verme', 'haberlesmenin gizliligini ihlal', 'ozel hayatin gizliligini ihlal', 'bilisim sistemine girme', 'sistemi engelleme bozma',
        'banka veya kredi kartinin kotuye kullanilmasi', 'sahtecilik', 'tefecilik', 'kacakcilik', 'vergi kacakciligi',
        'trafik guvenligini tehlikeye sokma', 'alkollu arac kullanma', 'tutuklama tedbiri', 'hagb', 'etkin pismanlik',
        'olasi kast',
        'bilincli taksir',
        'mesru mudafaa',
        'zorunluluk hali',
        'zincirleme suc',
        'fikri ictima',
        'sucun tesebbusu',
        'yardim etme',
        'azmettirme',
        'orgut adina suc isleme',
        'nitelikli hirsizlik',
        'kasten oldurmeye tesebbus',
        'adli kontrol',
        'tutuklamaya itiraz',
        'arama ve elkoyma',
        'iletisimin tespiti',
        'dijital delil',
        'delil yasagi',
        'sarkintilik duzeyinde cinsel saldiri',
        'muhafaza gorevini kotuye kullanma',
    ],
    idare: [
        'iptal davasi', 'tam yargi davasi', 'yurutmenin durdurulmasi', 'idari islem', 'idari eylem',
        'imar plani iptali', 'yapi tatil tutanagi', 'yapi tespit ve durdurma zapti', 'imar kanunu 32', 'imar para cezasi',
        'ruhsat iptali', 'ruhsat ve eklerine aykirilik', 'ruhsatli projeye aykirilik', 'ruhsatsiz yapi', 'yikim karari',
        'encumen karari', 'yapi kayit belgesi', 'imar barisi', 'kamulastirma', 'kamulastirmasiz el atma',
        'acele kamulastirma', 'memur disiplin cezasi', 'savunma hakki', 'tebligat usulsuzlugu', 'atama islemi',
        'naklen atama', 'gorevden alma', 'gorevde yukselme', 'kamu ihalelerinden yasaklama', 'ihale iptali',
        'vergi cezasi', 'vergi ziyai cezasi', 'tarhiyat', 'uzlasma', 'odeme emri',
        'yoklama fisi', 'sahte fatura', 'kdv indirimi', 'cevre cezasi', 'idari para cezasi',
        'belediye islemi', 'plan notu', 'imar durumu', 'lisans iptali', 'ogrenci disiplin cezasi',
        'sinav iptali', 'kamu gorevinden cikarma', 'hizmet kusuru', 'tam yargi tazminati', 'idari sozlesme',
        'duzenleyici islem',
        'bireysel islem',
        'idari para cezasi iptali',
        'guvenlik sorusturmasi',
        'pasaport iptali',
        'sinir disi etme',
        'parselasyon islemi',
        '18 uygulamasi',
        'tevhit ve ifraz',
        'yapi kullanma izin belgesi',
        'isyeri acma ruhsati',
        'cevresel etki degerlendirmesi',
        'ceza ihbarnamesi',
        'vergi incelemesi',
        'tahakkuk fisi',
        'ihale komisyonu karari',
        'sinav degerlendirme islemi',
        'universite disiplin cezasi',
        'ogrenci uzaklastirma cezasi',
        'geri alma islemi',
    ],
    istinaf: [
        'istinaf basvurusu', 'sure tutum dilekcesi', 'esastan ret', 'esastan reddi', 'usulden ret',
        'kaldirma karari', 'yeniden esas hakkinda karar', 'durusma acilmasi', 'kesinlik siniri', 'katilma yoluyla istinaf',
        'istinaf sebepleri', 'istinaf dilekcesi', 'bolge adliye mahkemesi', 'bam hukuk dairesi', 'bam ceza dairesi',
        'gerekceli karar', 'istinaf suresi', 'eski hale getirme', 'ilk derece mahkemesi karari', 'istinaf incelemesi',
        'bozma yerine kaldirma', 'dosya uzerinden inceleme', 'durusmali inceleme', 'kesin nitelikte karar', 'istinaf harci',
        'tebligat eksikligi', 'delil degerlendirmesi', 'usuli kazanilmis hak', 'kamu duzeni incelemesi', 'gorevsizlik karari',
        'yetkisizlik karari', 'ihtiyati tedbir istinafi', 'ihtiyati haciz istinafi', 'istinaftan feragat', 'kismen kabul kismen ret',
        'islah talebi', 'sure asimi incelemesi', 'kesinlesme serhi', 'istinaf on inceleme', 'istinaf reddi',
        'taraf teskili', 'istinaf sebebinin genisletilmesi', 'istinaf nedenleriyle baglilik', 'yeniden yargilama', 'delil sunma yasagi',
        'bizzat dinleme', 'tanik dinlenmesi', 'istinaf kesin karari', 'hukuka aykirilik denetimi', 'maddi vaka denetimi',
        'istinaf isteminin reddi',
        'istinaf basvuru sarti',
        'on inceleme durusmasi',
        'ek karar',
        'istinaf harc eksikligi',
        'delil toplanmasi',
        'bilirkisi incelemesi',
        'dosyanin geri cevrilmesi',
        'kaldirma ve gonderme',
        'kismi istinaf',
        'suresinde olmayan istinaf',
        'usul ekonomisi',
        'istinaf kesin suresi',
        'tanigin yeniden dinlenmesi',
        'kararin kaldirilmasi',
    ],
    anayasa: [
        'bireysel basvuru', 'hak ihlali', 'adil yargilanma hakki', 'makul surede yargilanma', 'ifade ozgurlugu',
        'basin ozgurlugu', 'mulkiyet hakki', 'ozel hayata saygi', 'haberlesme hurriyeti', 'din ve vicdan ozgurlugu',
        'toplanti ve gosteri yuruyusu', 'sendika hakki', 'secme ve secilme hakki', 'kisi hurriyeti ve guvenligi', 'tutuklama tedbiri',
        'masumiyet karinesi', 'suc ve cezalarin kanuniligi', 'kanuni hakim guvencesi', 'etkili basvuru hakki', 'gerekceli karar hakki',
        'mahkemeye erisim hakki', 'silahlarin esitligi', 'celismeli yargilama', 'savunma hakki', 'lekelenmeme hakki',
        'unutulma hakki', 'kisisel verilerin korunmasi', 'ayrimcilik yasagi', 'esitlik ilkesi', 'iskence yasagi',
        'kotu muamele yasagi', 'egitim hakki', 'aile hayatinin korunmasi', 'cocugun ustun yarari', 'toplanti ve orgutlenme ozgurlugu',
        'seyahat hurriyeti', 'yerlesme hurriyeti', 'dini inanc aciklama ozgurlugu', 'basvuru yollarinin tuketilmesi', 'kabul edilebilirlik',
        'acik dayanaktan yoksunluk', 'kisi bakimindan yetkisizlik', 'konu bakimindan yetkisizlik', 'sure asimi', 'musadere ve mulkiyet',
        'disiplin cezasinda hak ihlali', 'tutuklulugun makul sureyi asmasi', 'ifade ve basin ozgurlugu dengesi', 'toplanti dagitma', 'kamu gucu islemi',
        'yasam hakki',
        'calisma hakki',
        'sosyal guvenlik hakki',
        'saglik hakki',
        'mulk hakkina mudahale',
        'internet erisiminin engellenmesi',
        'haberlesmenin denetlenmesi',
        'toplanti yasagi',
        'hukuk devleti ilkesi',
        'olcululuk ilkesi',
        'kanuni dayanak',
        'sosyal medya paylasimi nedeniyle ifade ozgurlugu',
        'egitim hakkinin ihlali',
        'mahremiyet hakki',
        'cocuk haklari',
        'basvurunun kabul edilemezligi',
        'sucta ve cezada geriye yurumezlik',
        'bilgi edinme hakki',
        'etkili sorusturma yukumlulugu',
        'kamulastirmasiz el atma nedeniyle mulkiyet hakki',
    ],
};
const getDomainConcepts = (domainId = '', limit = 100) => {
    const concepts = Array.isArray(DOMAIN_CONCEPT_LIBRARY[domainId]) ? DOMAIN_CONCEPT_LIBRARY[domainId] : [];
    return concepts.slice(0, Math.max(0, Number(limit) || concepts.length));
};
const buildDomainHintList = (domainId = '', baseHints = [], limit = 8) =>
    mergeUniqueConcepts(baseHints, getDomainConcepts(domainId, limit)).slice(0, limit);

const AI_SUBDOMAIN_PROFILES = {
    is_ise_iade: ['is_hukuku', 'hukuk'],
    is_alacak: ['is_hukuku', 'hukuk'],
    aile: ['aile', 'hukuk'],
    ticaret: ['ticaret', 'hukuk'],
    icra: ['icra', 'hukuk'],
    tuketici: ['hukuk'],
    miras: ['hukuk'],
    gayrimenkul: ['hukuk'],
    imar: ['idare'],
    vergi: ['idare'],
    disiplin: ['idare'],
    ihale: ['idare'],
    uyusturucu: ['ceza'],
    hakaret: ['ceza'],
    dolandiricilik: ['ceza'],
    none: [],
};

const DOMAIN_BY_SEARCH_AREA = {
    danistay: 'idare',
    bam: 'istinaf',
};
const DOMAIN_SEARCH_CONFIG = {
    is_hukuku: {
        semanticTriggerScore: 38,
        minScore: 24,
        exactDomainBonus: 26,
        chamberPriorBonus: 14,
        wrongDomainPenalty: 34,
        lowTopicOverlapThreshold: 0.16,
        contentTokenCoverage: 0.18,
        contentPhraseCoverage: 0.10,
        contentDomainAnchorCoverage: 0.14,
        preferredSources: ['yargitay', 'uyap', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['is mahkemesi', 'ise iade', 'feshin gecersizligi', 'isci', 'isveren', 'iscilik', 'kidem', 'ihbar'],
            getDomainConcepts('is_hukuku', 18)
        ),
        chamberPatterns: [/9\.?\s*hukuk/, /22\.?\s*hukuk/, /\bh9\b/, /\bh22\b/],
    },
    hukuk: {
        semanticTriggerScore: 44,
        minScore: 24,
        exactDomainBonus: 18,
        chamberPriorBonus: 10,
        wrongDomainPenalty: 28,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.14,
        contentPhraseCoverage: 0.08,
        contentDomainAnchorCoverage: 0.10,
        preferredSources: ['all', 'uyap', 'yargitay'],
        domainAnchors: mergeUniqueConcepts(
            ['hukuk dairesi', 'asliye hukuk', 'asliye ticaret', 'aile mahkemesi', 'tuketici', 'icra hukuk'],
            getDomainConcepts('hukuk', 18)
        ),
        chamberPatterns: [/\bhukuk dairesi\b/, /\basliye hukuk\b/, /\basliye ticaret\b/],
    },
    icra: {
        semanticTriggerScore: 40,
        minScore: 24,
        exactDomainBonus: 22,
        chamberPriorBonus: 12,
        wrongDomainPenalty: 30,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.16,
        contentPhraseCoverage: 0.09,
        contentDomainAnchorCoverage: 0.14,
        preferredSources: ['yargitay', 'uyap', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['icra hukuk', 'icra takibi', 'itirazin iptali', 'menfi tespit', 'haczedilmezlik', 'kambiyo'],
            getDomainConcepts('icra', 18)
        ),
        chamberPatterns: [/12\.?\s*hukuk/, /\bh12\b/, /\bicra hukuk\b/],
    },
    aile: {
        semanticTriggerScore: 40,
        minScore: 24,
        exactDomainBonus: 22,
        chamberPriorBonus: 12,
        wrongDomainPenalty: 30,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.16,
        contentPhraseCoverage: 0.09,
        contentDomainAnchorCoverage: 0.14,
        preferredSources: ['yargitay', 'uyap', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['aile mahkemesi', 'bosanma', 'velayet', 'nafaka', 'mal rejimi', 'ziynet'],
            getDomainConcepts('aile', 18)
        ),
        chamberPatterns: [/2\.?\s*hukuk/, /\bh2\b/, /\baile mahkemesi\b/],
    },
    ticaret: {
        semanticTriggerScore: 42,
        minScore: 24,
        exactDomainBonus: 22,
        chamberPriorBonus: 12,
        wrongDomainPenalty: 30,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.16,
        contentPhraseCoverage: 0.09,
        contentDomainAnchorCoverage: 0.14,
        preferredSources: ['yargitay', 'uyap', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['asliye ticaret', 'ticari dava', 'anonim sirket', 'genel kurul', 'cari hesap', 'konkordato'],
            getDomainConcepts('ticaret', 18)
        ),
        chamberPatterns: [/11\.?\s*hukuk/, /\bh11\b/, /\basliye ticaret\b/],
    },
    ceza: {
        semanticTriggerScore: 52,
        minScore: 24,
        exactDomainBonus: 24,
        chamberPriorBonus: 12,
        wrongDomainPenalty: 38,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.17,
        contentPhraseCoverage: 0.08,
        contentDomainAnchorCoverage: 0.16,
        preferredSources: ['uyap', 'all', 'yargitay'],
        domainAnchors: mergeUniqueConcepts(
            ['ceza', 'agir ceza', 'ceza dairesi', 'tck', 'tck 188', 'tck 191', 'sanik', 'supheli', 'mahkumiyet', 'beraat'],
            getDomainConcepts('ceza', 18)
        ),
        chamberPatterns: [/\bceza dairesi\b/, /\bagir ceza\b/, /\bc\d{1,2}\b/],
    },
    idare: {
        semanticTriggerScore: 42,
        minScore: 24,
        exactDomainBonus: 24,
        chamberPriorBonus: 12,
        wrongDomainPenalty: 40,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.15,
        contentPhraseCoverage: 0.08,
        contentDomainAnchorCoverage: 0.15,
        preferredSources: ['danistay', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['danistay', 'idare mahkemesi', 'vergi mahkemesi', 'idari islem', 'imar', 'imar kanunu 32', 'yapi tatil tutanagi', 'ruhsat'],
            getDomainConcepts('idare', 18)
        ),
        chamberPatterns: [/\bdanistay\b/, /\bidari dava\b/, /\bvergi dava\b/, /\bvergi mahkemesi\b/],
    },
    istinaf: {
        semanticTriggerScore: 48,
        minScore: 26,
        exactDomainBonus: 24,
        chamberPriorBonus: 10,
        wrongDomainPenalty: 32,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.14,
        contentPhraseCoverage: 0.08,
        contentDomainAnchorCoverage: 0.14,
        preferredSources: ['all', 'uyap', 'yargitay'],
        domainAnchors: mergeUniqueConcepts(
            ['istinaf', 'bam', 'bolge adliye', 'esastan ret', 'esastan reddi', 'istinaf basvurusu'],
            getDomainConcepts('istinaf', 18)
        ),
        chamberPatterns: [/\bistinaf\b/, /\bbolge adliye\b/, /\bbam\b/],
    },
    anayasa: {
        semanticTriggerScore: 56,
        minScore: 28,
        exactDomainBonus: 28,
        chamberPriorBonus: 8,
        wrongDomainPenalty: 32,
        lowTopicOverlapThreshold: 0.12,
        contentTokenCoverage: 0.14,
        contentPhraseCoverage: 0.08,
        contentDomainAnchorCoverage: 0.12,
        preferredSources: ['anayasa', 'all'],
        domainAnchors: mergeUniqueConcepts(
            ['anayasa mahkemesi', 'bireysel basvuru', 'hak ihlali', 'norm denetimi'],
            getDomainConcepts('anayasa', 18)
        ),
        chamberPatterns: [/\banayasa mahkemesi\b/, /\bbireysel basvuru\b/],
    },
};

const SEARCH_CACHE = new Map();
const DOCUMENT_CACHE = new Map();
const MCP_TOOL_CACHE = {
    fetchedAt: 0,
    names: null,
};
const AI_SEARCH_PLAN_MIN_LENGTH = 18;

const LEGAL_SOURCE_OPTIONS = [
    {
        id: 'all',
        name: 'Tum Kaynaklar',
        description: 'Yargitay, Danistay, Istinaf ve UYAP emsal sonuclari',
    },
    {
        id: 'yargitay',
        name: 'Yargitay',
        description: 'Yargitay karar aramasi (MCP Bedesten)',
    },
    {
        id: 'danistay',
        name: 'Danistay',
        description: 'Danistay karar aramasi (MCP Bedesten)',
    },
    {
        id: 'uyap',
        name: 'Emsal (UYAP)',
        description: 'UYAP emsal karar aramasi',
    },
    {
        id: 'anayasa',
        name: 'Anayasa Mahkemesi',
        description: 'AYM norm denetimi ve bireysel basvuru karar aramasi',
    },
];

const SUPPORTED_SOURCES = new Set(LEGAL_SOURCE_OPTIONS.map((item) => item.id));
const MCP_COURT_TYPES_BY_SOURCE = {
    yargitay: ['YARGITAYKARARI'],
    danistay: ['DANISTAYKARAR'],
    all: ['YARGITAYKARARI', 'DANISTAYKARAR', 'ISTINAFHUKUK', 'KYB'],
};
const DECISION_STOPWORDS = new Set([
    've',
    'veya',
    'ile',
    'icin',
    'ama',
    'fakat',
    'gibi',
    'olan',
    'olanlar',
    'olarak',
    'dair',
    'bu',
    'su',
    'bir',
    'iki',
    'uc',
    'de',
    'da',
    'mi',
    'mu',
    'ki',
    'ya',
    'en',
    'son',
    'ilk',
    'her',
    'tum',
    'karar',
    'karari',
    'kararlar',
    'mahkemesi',
    'mahkeme',
    'ise',
    'olan',
    'icin',
    'ile',
    'gibi',
    'kadar',
    'raÃ„Å¸men',
    'ragmen',
    'baska',
    'diger',
    'tum',
    'ancak',
    'ayrica',
    'dolayi',
    'uzere',
    'halen',
    'derhal',
    'isbu',
    'karsi',
    'surekli',
    've',
    'veya',
    'yahut',
    'hangi',
    'nasil',
    'neden',
    'kim',
    'davali',
    'davaci',
    'tarafindan',
    'ait',
    'kayitli',
    'yonelik',
    'tarihinde',
    'soz',
    'bahse',
    'hususunda',
    'ozellikle',
    'gerekmektedir',
    'edilmiÃ…Å¸tir',
    'edilmistir',
    'tanzim',
    'tasinmaz',
    'uzerindeki',
    'sahse',
    'muvekkil',
    'muvekkilin'
]);
const LOW_SIGNAL_QUERY_TOKENS = new Set([
    'madde',
    'sayili',
    'tarafindan',
    'uyarinca',
    'karar',
    'karari',
    'kararlari',
    'talep',
    'talebi',
    'dava',
    'davasi',
    'davasinda',
    'hukuk',
    'ceza',
    'dairesi',
    'mahkemesi',
    'basvuru',
    'incelemesi',
    'amaciyla',
    'kullanmak',
    'gerek',
    'gerekse',
    'oldugu',
    'oldugunun',
    'olmasi',
    'olmadigi',
    'olarak',
    'nedeniyle',
    'hakkinda',
    'ilgili',
    'birlikte',
    'suretiyle',
    'sonucunda',
    'yonundeki',
    'yonunde',
    'vekil',
    'vekili',
    'muvekkil',
    'muvekkilin',
    'iddia',
    'iddiasi',
    'konu',
    'konusu',
    'dair',
    'binaen'
]);
const QUERY_VARIATION_PROFILES = [
    {
        id: 'is_hukuku',
        triggers: mergeUniqueConcepts([
            'ise iade', 'feshin gecersizligi', 'is mahkemesi', 'is akdi', 'is sozlesmesi', 'iscilik alacagi',
            'isci alacagi', 'kidem tazminati', 'ihbar tazminati', 'fazla mesai', 'ucret alacagi', 'hizmet akdi', 'isveren', 'isci'
        ], getDomainConcepts('is_hukuku', 70)),
        hints: buildDomainHintList('is_hukuku', ['is mahkemesi', 'ise iade', 'feshin gecersizligi', 'iscilik alacagi'], 8),
        preferredSources: ['yargitay', 'uyap', 'all'],
    },
    {
        id: 'hukuk',
        triggers: mergeUniqueConcepts([
            'hukuk', 'alacak', 'menfi tespit', 'itirazin iptali', 'ise iade', 'fesih', 'kidem', 'ihbar',
            'kira', 'tapu', 'bosanma', 'velayet', 'nafaka', 'ortakligin giderilmesi', 'ecrimisil', 'ticari dava'
        ], getDomainConcepts('hukuk', 70)),
        hints: buildDomainHintList('hukuk', ['hukuk', 'hukuk dairesi', 'asliye hukuk', 'istinaf hukuk'], 8),
        preferredSources: ['all', 'uyap', 'yargitay', 'danistay'],
    },
    {
        id: 'icra',
        triggers: mergeUniqueConcepts([
            'icra', 'icra takibi', 'itirazin iptali', 'icra inkar tazminati', 'menfi tespit', 'istirdat',
            'haczedilmezlik', 'kambiyo', 'odeme emri', 'haciz'
        ], getDomainConcepts('icra', 70)),
        hints: buildDomainHintList('icra', ['icra hukuk', 'itirazin iptali', 'menfi tespit', 'haczedilmezlik'], 8),
        preferredSources: ['yargitay', 'uyap', 'all'],
    },
    {
        id: 'aile',
        triggers: mergeUniqueConcepts([
            'bosanma', 'velayet', 'nafaka', 'kisisel iliski', 'mal rejimi', 'ziynet', 'katki payi', 'aile konutu', 'soybagi', 'evlat edinme'
        ], getDomainConcepts('aile', 70)),
        hints: buildDomainHintList('aile', ['aile mahkemesi', 'bosanma', 'velayet', 'nafaka'], 8),
        preferredSources: ['yargitay', 'uyap', 'all'],
    },
    {
        id: 'ticaret',
        triggers: mergeUniqueConcepts([
            'ticaret', 'ticari dava', 'asliye ticaret', 'anonim sirket', 'limited sirket', 'genel kurul',
            'ortaklik', 'cek', 'bono', 'cari hesap', 'fatura', 'konkordato'
        ], getDomainConcepts('ticaret', 70)),
        hints: buildDomainHintList('ticaret', ['asliye ticaret', 'ticari dava', 'anonim sirket', 'genel kurul iptali'], 8),
        preferredSources: ['yargitay', 'uyap', 'all'],
    },
    {
        id: 'idare',
        triggers: mergeUniqueConcepts([
            'danistay', 'idare mahkemesi', 'vergi mahkemesi', 'idari islem', 'idari dava', 'imar', 'imar kanunu',
            'yapi tatil tutanagi', 'yapi tespit ve durdurma zapti', 'ruhsatli projeye aykirilik', 'ruhsat ve eklerine aykirilik',
            'imar barisi', 'yapi kayit belgesi', 'yikim karari', 'encumen', 'tebligat', 'savunma hakki', 'ruhsat', 'vergi'
        ], getDomainConcepts('idare', 70)),
        hints: buildDomainHintList('idare', ['danistay', 'idare mahkemesi', 'yapi tatil tutanagi', 'imar kanunu 32', 'ruhsatli projeye aykirilik'], 8),
        preferredSources: ['danistay', 'all'],
    },
    {
        id: 'ceza',
        triggers: mergeUniqueConcepts([
            'ceza', 'sanik', 'supheli', 'mahkumiyet', 'beraat', 'uyusturucu', 'uyusturucu madde ticareti',
            'kullanmak icin bulundurma', 'hirsizlik', 'yaralama', 'tehdit', 'hakaret', 'dolandiricilik', 'nitelikli dolandiricilik',
            'banka hesabi', 'hesap kullandirma', 'kasten', 'taksirle', 'tutuklama', 'tck', 'tck 188', 'tck 191', 'orgut', 'silah', 'yagma'
        ], getDomainConcepts('ceza', 70)),
        hints: buildDomainHintList('ceza', ['ceza', 'ceza dairesi', 'agir ceza', 'tck 188', 'tck 191', 'kullanmak icin bulundurma', 'nitelikli dolandiricilik', 'hesap kullandirma'], 8),
        preferredSources: ['uyap', 'all', 'yargitay'],
    },
    {
        id: 'istinaf',
        triggers: mergeUniqueConcepts([
            'istinaf', 'bam', 'bolge adliye', 'bolge adliye mahkemesi', 'istinaf basvurusu', 'istinaf incelemesi', 'esastan ret', 'esastan reddi'
        ], getDomainConcepts('istinaf', 70)),
        hints: buildDomainHintList('istinaf', ['istinaf', 'bolge adliye mahkemesi', 'bam', 'istinaf hukuk'], 8),
        preferredSources: ['all', 'uyap', 'yargitay'],
    },
    {
        id: 'anayasa',
        triggers: mergeUniqueConcepts([
            'anayasa', 'anayasa mahkemesi', 'bireysel basvuru', 'hak ihlali', 'ifade ozgurlugu', 'adil yargilanma',
            'mulk hakki', 'ozel hayat', 'din ve vicdan', 'masumiyet karinesi', 'esitlik ilkesi'
        ], getDomainConcepts('anayasa', 70)),
        hints: buildDomainHintList('anayasa', ['anayasa mahkemesi', 'bireysel basvuru', 'hak ihlali', 'norm denetimi'], 8),
        preferredSources: ['anayasa', 'all', 'uyap'],
    },
];
const SEARCH_AREA_OPTIONS = new Set(['auto', 'ceza', 'hukuk', 'danistay', 'bam']);
const SEARCH_AREA_CONFIG = {
    ceza: {
        targetSources: ['yargitay', 'uyap'],
        forcedProfiles: ['ceza'],
        courtTypes: ['YARGITAYKARARI'],
    },
    hukuk: {
        targetSources: ['yargitay', 'uyap'],
        forcedProfiles: ['hukuk'],
        courtTypes: ['YARGITAYKARARI'],
    },
    danistay: {
        targetSources: ['danistay'],
        forcedProfiles: ['idare'],
        courtTypes: ['DANISTAYKARAR'],
    },
    bam: {
        targetSources: ['all'],
        forcedProfiles: ['istinaf'],
        courtTypes: ['ISTINAFHUKUK'],
    },
};

const SYNTHETIC_DOCUMENT_ID_REGEX = /^(search-|legal-|ai-summary|sem-)/i;

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeSource = (value, fallback = 'all') => {
    const normalized = normalizeText(value);
    if (SUPPORTED_SOURCES.has(normalized)) {
        return normalized;
    }
    return fallback;
};

const normalizeSearchArea = (value = 'auto') => {
    const normalized = normalizeText(value);
    if (SEARCH_AREA_OPTIONS.has(normalized)) {
        return normalized;
    }
    return 'auto';
};

const getLegalAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

const buildCacheKey = (prefix, value) => `${prefix}:${JSON.stringify(value)}`;

const getCacheEntry = (cache, key, ttlMs) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

const setCacheEntry = (cache, key, value, maxEntries = 200) => {
    if (cache.size >= maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(key, { timestamp: Date.now(), value });
};

const parseMaybeJson = (input = '') => {
    const text = String(input || '').trim();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        // noop
    }

    const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        // noop
    }

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            // noop
        }
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch {
            // noop
        }
    }

    return null;
};

const parseMcpResponsePayload = (rawText = '') => {
    const text = String(rawText || '').trim();
    if (!text) return null;

    const dataLines = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

    if (dataLines.length === 0) {
        return parseMaybeJson(text);
    }

    return parseMaybeJson(dataLines.join('\n'));
};

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const CURRENT_DECISION_YEAR = new Date().getFullYear();
const PROFILE_SIGNAL_RULES = {
    is_hukuku: {
        positive:
            /ise iade|feshin gecersizligi|is mahkemesi|isci|isveren|iscilik|is sozlesmesi|hizmet akdi|kidem|ihbar|fazla mesai|ucret alacagi|sendika/,
        negative:
            /ticaret|asliye ticaret|tuketici|aile mahkemesi|kadastro|vergi|idare mahkemesi|ceza|agir ceza|icra hukuk/,
    },
    hukuk: {
        positive:
            /hukuk dairesi|asliye hukuk|asliye ticaret|ticaret|aile mahkemesi|tuketici|kadastro|icra hukuk|alacak|menfi tespit|itirazin iptali/,
        negative:
            /ceza|agir ceza|ceza dairesi|cumhuriyet bassavciligi|savcilik|tck|danistay|idare mahkemesi|vergi mahkemesi|istinaf|bam|bolge adliye|anayasa mahkemesi/,
    },
    icra: {
        positive:
            /icra hukuk|icra takibi|itirazin iptali|menfi tespit|istirdat|haczedilmezlik|kambiyo|odeme emri|haciz/,
        negative:
            /ceza|agir ceza|danistay|idare mahkemesi|anayasa mahkemesi/,
    },
    aile: {
        positive:
            /aile mahkemesi|bosanma|velayet|nafaka|kisisel iliski|mal rejimi|ziynet|soybagi|evlat edinme/,
        negative:
            /ceza|agir ceza|danistay|idare mahkemesi|vergi mahkemesi/,
    },
    ticaret: {
        positive:
            /asliye ticaret|ticari dava|anonim sirket|limited sirket|genel kurul|cari hesap|fatura|konkordato|cek|bono/,
        negative:
            /ceza|agir ceza|danistay|idare mahkemesi|anayasa mahkemesi/,
    },
    ceza: {
        positive:
            /ceza|agir ceza|sanik|mahkumiyet|beraat|cumhuriyet bassavciligi|tck|hagb|tutuklama|uyusturucu|hakaret|tehdit|yaralama|dolandiricilik|nitelikli dolandiricilik|kullanmak icin bulundurma|hesap kullandirma|banka hesabi/,
        negative:
            /hukuk|ticaret|asliye hukuk|is mahkemesi|iscilik|kidem|ihbar|aile mahkemesi|danistay|idare mahkemesi|vergi mahkemesi|anayasa mahkemesi/,
    },
    idare: {
        positive:
            /danistay|idare mahkemesi|vergi mahkemesi|idari dava|idari islem|imar|imar barisi|yapi kayit belgesi|yikim karari|encumen|ruhsat|vergi/,
        negative:
            /ceza|agir ceza|sanik|tck|hukuk dairesi|asliye hukuk|asliye ticaret|is mahkemesi|istinaf|bam|anayasa mahkemesi/,
    },
    istinaf: {
        positive: /istinaf|bolge adliye|bam|esastan ret|esastan reddi|kaldirilarak/,
        negative: /danistay|anayasa mahkemesi|yargitay/,
    },
    anayasa: {
        positive: /anayasa mahkemesi|anayasa|bireysel basvuru|hak ihlali|norm denetimi/,
        negative: /yargitay|danistay|asliye hukuk|asliye ticaret|agir ceza/,
    },
};

const SEARCH_AREA_RESULT_RULES = {
    ceza: {
        allow: /ceza|agir ceza|ceza dairesi|cumhuriyet bassavciligi|savcilik|cbs|ceza mahkemesi/,
        deny: /hukuk|hukuk dairesi|asliye hukuk|asliye ticaret|ticaret|is mahkemesi|aile mahkemesi|tuketici|kadastro|icra hukuk|istinaf hukuk|danistay|idare mahkemesi|vergi mahkemesi|anayasa mahkemesi/,
    },
    hukuk: {
        allow: /hukuk|hukuk dairesi|asliye hukuk|asliye ticaret|ticaret|is mahkemesi|aile mahkemesi|tuketici|kadastro|icra hukuk/,
        deny: /ceza|agir ceza|ceza dairesi|cumhuriyet bassavciligi|savcilik|cbs|ceza mahkemesi|danistay|idare mahkemesi|vergi mahkemesi|istinaf|bolge adliye|bam|anayasa mahkemesi/,
    },
    danistay: {
        allow: /danistay|idare mahkemesi|vergi mahkemesi|idari dava|vergi dava/,
        deny: /yargitay|ceza|agir ceza|hukuk dairesi|asliye hukuk|asliye ticaret|istinaf/,
    },
    bam: {
        allow: /istinaf|bolge adliye|bam/,
        deny: /danistay|anayasa mahkemesi/,
    },
};

const withTimeout = async (promiseFactory, timeoutMs, timeoutMessage) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await promiseFactory(controller.signal);
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(timeoutMessage);
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const wait = (delayMs) =>
    new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
    });

const normalizeMcpUrl = () => {
    if (!YARGI_MCP_URL) {
        throw new Error('YARGI_MCP_URL tanimli degil.');
    }
    return YARGI_MCP_URL.endsWith('/') ? YARGI_MCP_URL : `${YARGI_MCP_URL}/`;
};

const postMcp = async (payload, sessionId = '') => {
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
    };
    if (sessionId) {
        headers['mcp-session-id'] = sessionId;
    }

    const response = await withTimeout(
        (signal) =>
            fetch(normalizeMcpUrl(), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal,
            }),
        YARGI_MCP_TIMEOUT_MS,
        `Yargi MCP istegi zaman asimina ugradi (${Math.round(YARGI_MCP_TIMEOUT_MS / 1000)} sn).`
    );

    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
        throw new Error(`Yargi MCP HTTP ${response.status}: ${responseText.slice(0, 400)}`);
    }

    const parsed = parseMcpResponsePayload(responseText);
    if (parsed?.error) {
        throw new Error(parsed.error?.message || 'Yargi MCP tool hatasi.');
    }

    return {
        parsed,
        text: responseText,
        sessionId: response.headers.get('mcp-session-id') || sessionId,
    };
};

const closeMcpSession = async (sessionId = '') => {
    if (!sessionId) return;
    try {
        await withTimeout(
            (signal) =>
                fetch(normalizeMcpUrl(), {
                    method: 'DELETE',
                    headers: { 'mcp-session-id': sessionId },
                    signal,
                }),
            5000,
            'Yargi MCP session kapatma zaman asimi'
        );
    } catch {
        // best effort
    }
};

const callMcpTool = async (name, args = {}, attempt = 0) => {
    let sessionId = '';
    try {
        const initResponse = await postMcp({
            jsonrpc: '2.0',
            id: `init-${Date.now()}`,
            method: 'initialize',
            params: {
                protocolVersion: YARGI_MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: {
                    name: 'dilekceasist',
                    version: 'clean-legal-search',
                },
            },
        });
        sessionId = initResponse.sessionId;
        if (!sessionId) {
            throw new Error('Yargi MCP session id alinamadi.');
        }

        await postMcp(
            {
                jsonrpc: '2.0',
                method: 'notifications/initialized',
                params: {},
            },
            sessionId
        );

        const toolResponse = await postMcp(
            {
                jsonrpc: '2.0',
                id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                method: 'tools/call',
                params: {
                    name,
                    arguments: args,
                },
            },
            sessionId
        );

        const content = Array.isArray(toolResponse.parsed?.result?.content)
            ? toolResponse.parsed.result.content
            : Array.isArray(toolResponse.parsed?.content)
                ? toolResponse.parsed.content
                : [];

        const textParts = content
            .map((item) => String(item?.text || '').trim())
            .filter(Boolean);
        const text = textParts.join('\n\n').trim() || toolResponse.text || '';
        const parsed = textParts
            .map((item) => parseMaybeJson(item))
            .find(Boolean) || toolResponse.parsed?.result || toolResponse.parsed;

        return { parsed, text };
    } catch (error) {
        const message = String(error?.message || '');
        if (attempt < 2 && /session not found/i.test(message)) {
            await wait(150 * (attempt + 1));
            return callMcpTool(name, args, attempt + 1);
        }
        throw error;
    } finally {
        await closeMcpSession(sessionId);
    }
};

const listMcpTools = async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && Array.isArray(MCP_TOOL_CACHE.names) && now - MCP_TOOL_CACHE.fetchedAt < 60 * 1000) {
        return MCP_TOOL_CACHE.names;
    }

    let sessionId = '';
    try {
        const initResponse = await postMcp({
            jsonrpc: '2.0',
            id: `init-tools-${Date.now()}`,
            method: 'initialize',
            params: {
                protocolVersion: YARGI_MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: {
                    name: 'dilekceasist',
                    version: 'tool-snapshot',
                },
            },
        });
        sessionId = initResponse.sessionId;
        if (!sessionId) {
            throw new Error('Yargi MCP session id alinamadi.');
        }

        await postMcp(
            {
                jsonrpc: '2.0',
                method: 'notifications/initialized',
                params: {},
            },
            sessionId
        );

        const toolsResponse = await postMcp(
            {
                jsonrpc: '2.0',
                id: `tools-${Date.now()}`,
                method: 'tools/list',
                params: {},
            },
            sessionId
        );

        const tools = Array.isArray(toolsResponse.parsed?.result?.tools)
            ? toolsResponse.parsed.result.tools
            : Array.isArray(toolsResponse.parsed?.tools)
                ? toolsResponse.parsed.tools
                : [];
        const toolNames = tools
            .map((item) => String(item?.name || '').trim())
            .filter(Boolean);

        MCP_TOOL_CACHE.fetchedAt = now;
        MCP_TOOL_CACHE.names = toolNames;
        return toolNames;
    } finally {
        await closeMcpSession(sessionId);
    }
};

const hasMcpTool = async (toolName) => {
    const toolNames = await listMcpTools(false);
    return toolNames.includes(String(toolName || '').trim());
};

const extractQuotedPhrases = (value = '') => {
    const matches = String(value || '').match(/"([^"]+)"/g) || [];
    return matches
        .map((item) => normalizeText(item.replace(/"/g, '')))
        .filter(Boolean);
};

const buildQueryPhrases = (keyword = '') => {
    const orderedTokens = normalizeText(keyword)
        .split(' ')
        .map((item) => item.trim())
        .filter((item) => item.length > 1);

    const phrases = [];
    for (let size = 3; size >= 2; size -= 1) {
        for (let index = 0; index <= orderedTokens.length - size; index += 1) {
            const phrase = orderedTokens.slice(index, index + size).join(' ').trim();
            if (!phrase || phrase.length < 8) continue;
            if (phrases.includes(phrase)) continue;
            phrases.push(phrase);
            if (phrases.length >= 10) {
                return phrases;
            }
        }
    }

    return phrases;
};

const buildCezaSupplementalSignals = (keyword = '', rawQuery = '') => {
    const haystack = normalizeText(`${keyword} ${rawQuery}`.trim());
    if (!haystack) {
        return {
            tokens: [],
            anchorTokens: [],
            phrases: [],
            domainAnchorTokens: [],
        };
    }

    const phraseSet = new Set();
    const domainSet = new Set();
    const tokenSet = new Set();
    const pushPhrase = (value = '') => {
        const normalized = normalizeText(value);
        if (!normalized || normalized.length < 4) return;
        phraseSet.add(normalized);
        domainSet.add(normalized);
        for (const token of normalized.split(' ')) {
            if (token.length >= 4) tokenSet.add(token);
        }
    };

    if (haystack.includes('uyusturucu') && (haystack.includes('ticaret') || haystack.includes('bulundurma') || haystack.includes('kullanmak'))) {
        pushPhrase('uyusturucu madde ticareti');
        pushPhrase('kullanmak icin bulundurma');
        pushPhrase('tck 188');
        pushPhrase('tck 191');
    }

    if (haystack.includes('dolandiricilik') && (haystack.includes('banka') || haystack.includes('hesap') || haystack.includes('kulland'))) {
        pushPhrase('nitelikli dolandiricilik');
        pushPhrase('banka hesabini kullandirma');
        pushPhrase('hesap kullandirma');
        pushPhrase('komisyon karsiligi');
        pushPhrase('hesap hareketleri');
    }

    if (haystack.includes('hakaret')) {
        pushPhrase('hakaret sucu');
        if (haystack.includes('aleniyet')) pushPhrase('hakaret aleniyet');
    }

    if (haystack.includes('tehdit')) {
        pushPhrase('tehdit sucu');
        if (haystack.includes('ses kaydi')) pushPhrase('ses kaydi');
    }

    if (haystack.includes('yaralama')) {
        pushPhrase('kasten yaralama');
        if (haystack.includes('tahrik')) pushPhrase('haksiz tahrik');
    }

    return {
        tokens: Array.from(tokenSet).slice(0, 12),
        anchorTokens: Array.from(tokenSet).slice(0, 12),
        phrases: Array.from(phraseSet).slice(0, 10),
        domainAnchorTokens: Array.from(domainSet).slice(0, 12),
    };
};

const buildIcraSupplementalSignals = (keyword = '', rawQuery = '') => {
    const haystack = normalizeText(`${keyword} ${rawQuery}`.trim());
    if (!haystack) {
        return {
            tokens: [],
            anchorTokens: [],
            phrases: [],
            domainAnchorTokens: [],
        };
    }

    const phraseSet = new Set();
    const domainSet = new Set();
    const tokenSet = new Set();
    const pushPhrase = (value = '') => {
        const normalized = normalizeText(value);
        if (!normalized || normalized.length < 4) return;
        phraseSet.add(normalized);
        domainSet.add(normalized);
        for (const token of normalized.split(' ')) {
            if (token.length >= 4) tokenSet.add(token);
        }
    };

    if (haystack.includes('itirazin iptali')) {
        pushPhrase('itirazin iptali');
        pushPhrase('icra inkar tazminati');
    }

    if (haystack.includes('menfi tespit')) {
        pushPhrase('menfi tespit davasi');
        if (haystack.includes('odeme emri')) pushPhrase('odeme emrine itiraz');
    }

    if (haystack.includes('haczedilmezlik')) {
        pushPhrase('haczedilmezlik sikayeti');
        if (haystack.includes('maas')) pushPhrase('maas haczi');
    }

    if (haystack.includes('istirdat')) {
        pushPhrase('istirdat davasi');
        pushPhrase('icra takibi');
    }

    if (haystack.includes('kambiyo')) {
        pushPhrase('kambiyo senedine mahsus haciz yolu');
        pushPhrase('kambiyo takibi');
        if (haystack.includes('imzaya') && haystack.includes('itiraz')) pushPhrase('imzaya itiraz');
        if (haystack.includes('borca') && haystack.includes('itiraz')) pushPhrase('borca itiraz');
        if (haystack.includes('senet')) pushPhrase('kambiyo senedi');
    }

    return {
        tokens: Array.from(tokenSet).slice(0, 14),
        anchorTokens: Array.from(tokenSet).slice(0, 14),
        phrases: Array.from(phraseSet).slice(0, 12),
        domainAnchorTokens: Array.from(domainSet).slice(0, 14),
    };
};

const buildIdareSupplementalSignals = (keyword = '', rawQuery = '') => {
    const haystack = normalizeText(`${keyword} ${rawQuery}`.trim());
    if (!haystack) {
        return {
            tokens: [],
            anchorTokens: [],
            phrases: [],
            domainAnchorTokens: [],
        };
    }

    const phraseSet = new Set();
    const domainSet = new Set();
    const tokenSet = new Set();
    const pushPhrase = (value = '') => {
        const normalized = normalizeText(value);
        if (!normalized || normalized.length < 4) return;
        phraseSet.add(normalized);
        domainSet.add(normalized);
        for (const token of normalized.split(' ')) {
            if (token.length >= 4) tokenSet.add(token);
        }
    };

    if (haystack.includes('imar')) {
        pushPhrase('imar mevzuati');
        pushPhrase('imar kanunu 32');
    }

    if (haystack.includes('yapi') && (haystack.includes('tatil') || haystack.includes('tutanak') || haystack.includes('durdurma') || haystack.includes('zapti'))) {
        pushPhrase('yapi tatil tutanagi');
        pushPhrase('yapi tespit ve durdurma zapti');
        pushPhrase('muhurlenme');
        pushPhrase('imar kanunu 32');
    }

    if (haystack.includes('ruhsat')) {
        pushPhrase('ruhsat ve eklerine aykirilik');
        pushPhrase('ruhsatli projeye aykirilik');
        pushPhrase('ruhsatsiz yapi');
    }

    if (haystack.includes('yikim') || haystack.includes('encumen')) {
        pushPhrase('yikim karari');
        pushPhrase('encumen karari');
    }

    if (haystack.includes('tebligat')) {
        pushPhrase('tebligat usulu');
    }

    if (haystack.includes('savunma') || haystack.includes('hakki')) {
        pushPhrase('savunma hakki');
    }

    if (haystack.includes('bahce') && haystack.includes('mesafe')) {
        pushPhrase('bahce mesafesi');
    }

    if (haystack.includes('kamulastirmasiz') && haystack.includes('el atma')) {
        pushPhrase('kamulastirmasiz el atma');
        pushPhrase('kamulastirma');
        pushPhrase('idari yargi gorevi');
        pushPhrase('tam yargi davasi');
        if (
            haystack.includes('imar') ||
            haystack.includes('plani') ||
            haystack.includes('kisitlama') ||
            haystack.includes('idari') ||
            haystack.includes('belediye')
        ) {
            pushPhrase('kamulastirmasiz hukuki el atma');
        }
    }

    if (haystack.includes('ogrenci') && haystack.includes('disiplin')) {
        pushPhrase('ogrenci disiplin cezasi');
        pushPhrase('yuksekogretim kurumlari ogrenci disiplin');
        pushPhrase('universite ogrencisi disiplin cezasi');
    }

    if (
        haystack.includes('sahte fatura') ||
        haystack.includes('kdv') ||
        haystack.includes('vergi') ||
        haystack.includes('tarhiyat')
    ) {
        pushPhrase('sahte fatura');
        pushPhrase('kdv indiriminin reddi');
        pushPhrase('vergi mahkemesi');
        pushPhrase('vergi ziyai cezasi');
        pushPhrase('tarhiyat');
    }

    return {
        tokens: Array.from(tokenSet).slice(0, 14),
        anchorTokens: Array.from(tokenSet).slice(0, 14),
        phrases: Array.from(phraseSet).slice(0, 12),
        domainAnchorTokens: Array.from(domainSet).slice(0, 14),
    };
};

const detectQueryProfiles = (keyword = '', rawQuery = '') => {
    const haystack = normalizeText(`${keyword} ${rawQuery}`.trim());
    if (!haystack) return [];

    const detectedProfiles = QUERY_VARIATION_PROFILES.filter((profile) =>
        profile.triggers.some((trigger) => haystack.includes(normalizeText(trigger)))
    );

    const detectedIds = new Set(detectedProfiles.map((item) => item.id));
    const hasStrongIcraSignal = /icra|haciz|odeme emri|takip|itiraz|haczedilmezlik|kambiyo senedine mahsus/.test(haystack);
    const hasStrongTicaretSignal = /anonim sirket|limited sirket|genel kurul|cari hesap|fatura|konkordato|acentelik|ticari defter/.test(haystack);
    const hasStrongIdareSignal =
        /danistay|idare mahkemesi|vergi mahkemesi|idari dava|idari islem|vergi|kdv|tarhiyat|uzlasma|vergi ziyai|sahte fatura|ogrenci disiplin|universite ogrencisi|yuksekogretim|disiplin cezasi|savunma hakki|imar|ruhsat|yapi tatil|encumen|ihale|idari para cezasi|kamulastirmasiz el atma/.test(
            haystack
        );
    const hasStrictIdareSignal =
        /vergi|kdv|tarhiyat|uzlasma|vergi ziyai|sahte fatura|ogrenci disiplin|universite ogrencisi|yuksekogretim|disiplin cezasi|savunma hakki|imar|ruhsat|yapi tatil|encumen|ihale|idari para cezasi/.test(
            haystack
        );

    let filteredProfiles = detectedProfiles;

    if (hasStrongIcraSignal && detectedIds.has('icra') && detectedIds.has('ticaret') && !hasStrongTicaretSignal) {
        filteredProfiles = filteredProfiles.filter((profile) => profile.id !== 'ticaret');
    }

    if (hasStrongIdareSignal && detectedIds.has('idare') && detectedIds.has('ticaret')) {
        filteredProfiles = filteredProfiles.filter((profile) => profile.id !== 'ticaret');
    }

    if (hasStrongIdareSignal && detectedIds.has('idare') && detectedIds.has('is_hukuku')) {
        filteredProfiles = filteredProfiles.filter((profile) => profile.id !== 'is_hukuku');
    }

    if (hasStrictIdareSignal && detectedIds.has('idare') && detectedIds.has('hukuk')) {
        filteredProfiles = filteredProfiles.filter((profile) => profile.id !== 'hukuk');
    }

    return filteredProfiles;
};

const matchesSearchArea = (item = {}, searchArea = 'auto') => {
    const area = normalizeSearchArea(searchArea);
    if (area === 'auto') return true;

    const rules = SEARCH_AREA_RESULT_RULES[area];
    if (!rules) return true;

    const sourceKey = normalizeSource(item?.source, '');
    const haystack = normalizeText([item?.title, item?.daire, item?.ozet, item?.snippet].join(' '));

    if (area === 'danistay') {
        return sourceKey === 'danistay' || rules.allow.test(haystack);
    }

    if (area === 'bam') {
        return rules.allow.test(haystack);
    }

    const hasAllowSignal = rules.allow.test(haystack);
    const hasDenySignal = rules.deny.test(haystack);

    if (hasDenySignal && !hasAllowSignal) return false;
    return hasAllowSignal;
};

const applySearchAreaFilters = (results = [], searchArea = 'auto') => {
    const area = normalizeSearchArea(searchArea);
    if (area === 'auto' || !Array.isArray(results) || results.length === 0) {
        return results;
    }
    return results.filter((item) => matchesSearchArea(item, area));
};

const reconcileResolvedSourceWithSignals = (resolvedSource = 'all', signals = {}, fullQuery = '') => {
    const currentSource = normalizeSource(resolvedSource, 'all');
    const primaryDomainId = String(signals?.primaryDomainId || '').trim();
    const haystack = normalizeText(fullQuery);

    if (primaryDomainId !== 'idare') {
        return currentSource;
    }

    if (
        /vergi|kdv|tarhiyat|uzlasma|vergi ziyai|sahte fatura|ogrenci disiplin|universite ogrencisi|yuksekogretim|disiplin cezasi|savunma hakki|imar|ruhsat|yapi tatil|encumen|ihale|idari para cezasi|gorevde yukselme|atama/.test(
            haystack
        )
    ) {
        return 'danistay';
    }

    if (/kamulastirmasiz el atma/.test(haystack) && currentSource === 'yargitay') {
        return 'all';
    }

    return currentSource;
};

const buildSearchVariants = (signals = {}, resolvedSource = 'all') => {
    const variants = [];
    const seen = new Set([normalizeText(signals.original || '')]);

    // Uzun paragraflardaki ardi isik 3 kelime (or: "madde gerek muvekkilin") genelde aranabilir ifade cikarmaz
    const isLongQuery = (signals.tokens || []).length > 8;

    // Eger kisa bir aramaysa (kullanici belli kelimeleri girmisse), phrase'leri varyant yap.
    // Eger uzun paragrafa dondurulse, sadece kullanicinin ozellikle "tirnak icine aldigi" seyleri phrase olarak kullan.
    const phraseSeeds = [
        ...(signals.aiPhrases || []),
        ...(signals.supplementalPhrases || []),
        ...(signals.quotedPhrases || []),
        ...(isLongQuery ? [] : signals.phrases || []),
    ].filter(Boolean);

    // Uzun sorgularda bile ilk 3 anlamli/uzun kelime, iyi bir Bedesten aramasidir ("uyusturucu madde iddianameye" vb)
    const anchorPair = (signals.anchorTokens || []).slice(0, 3).join(' ').trim();

    const pushVariant = (value = '') => {
        const compact = String(value || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeText(compact);
        if (!compact || compact.length < 4 || normalized.length < 4 || seen.has(normalized)) return;
        seen.add(normalized);
        variants.push(compact);
    };

    for (const phrase of phraseSeeds.slice(0, 3)) {
        pushVariant(phrase);
    }

    // Uzun paragraflar icin, ozel phrase cikaramadiysak, en guclu 3 kelimeyi varyant listesinin basina ekle
    if (isLongQuery && anchorPair && anchorPair.split(' ').length >= 2) {
        pushVariant(anchorPair);
    }

    if (!signals.lockProfiles) {
        for (const profileId of signals.matchedProfileIds || []) {
            const profile = QUERY_VARIATION_PROFILES.find((item) => item.id === profileId);
            if (!profile) continue;

            for (const hint of profile.hints.slice(0, 3)) {
                if (phraseSeeds[0]) pushVariant(`${phraseSeeds[0]} ${hint}`);
                if (phraseSeeds[1]) pushVariant(`${phraseSeeds[1]} ${hint}`);
                if (anchorPair) pushVariant(`${anchorPair} ${hint}`);
            }
        }
    }

    if (
        !signals.lockProfiles &&
        resolvedSource === 'all' &&
        (signals.matchedProfileIds || []).includes('anayasa')
    ) {
        if (phraseSeeds[0]) pushVariant(`${phraseSeeds[0]} anayasa mahkemesi`);
        if (anchorPair) pushVariant(`${anchorPair} hak ihlali`);
    }

    return variants.slice(0, 6);
};

const buildPreferredSources = (matchedProfileIds = [], resolvedSource = 'all') => {
    const ordered = [];
    const pushSource = (value = '') => {
        const normalized = normalizeSource(value, '');
        if (!normalized || ordered.includes(normalized)) return;
        ordered.push(normalized);
    };

    if (resolvedSource !== 'all') {
        pushSource(resolvedSource);
        return ordered;
    }

    for (const profileId of matchedProfileIds) {
        const profile = QUERY_VARIATION_PROFILES.find((item) => item.id === profileId);
        for (const source of profile?.preferredSources || []) {
            pushSource(source);
        }
    }

    for (const source of ['all', 'uyap', 'yargitay', 'danistay', 'anayasa']) {
        pushSource(source);
    }

    return ordered;
};

const getDomainConfig = (domainId = '') =>
    DOMAIN_SEARCH_CONFIG[domainId] || DOMAIN_SEARCH_CONFIG.hukuk;

const resolvePrimaryDomainId = (matchedProfileIds = [], searchArea = 'auto', resolvedSource = 'all') => {
    const normalizedArea = normalizeSearchArea(searchArea);
    if (DOMAIN_BY_SEARCH_AREA[normalizedArea]) {
        return DOMAIN_BY_SEARCH_AREA[normalizedArea];
    }
    if (resolvedSource === 'danistay') return 'idare';
    if (resolvedSource === 'anayasa') return 'anayasa';

    for (const domainId of DOMAIN_PRIORITY) {
        if (matchedProfileIds.includes(domainId)) {
            return domainId;
        }
    }

    return 'hukuk';
};

const buildDomainAnchorTokens = (matchedProfileIds = [], primaryDomainId = 'hukuk') => {
    const ordered = [];
    const seen = new Set();
    for (const domainId of [primaryDomainId, ...matchedProfileIds]) {
        const config = getDomainConfig(domainId);
        for (const token of config.domainAnchors || []) {
            const normalized = normalizeText(token);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            ordered.push(normalized);
        }
    }
    return ordered.slice(0, 14);
};

const STRICT_IMAR_INTENT_PHRASES = [
    'imar barisi',
    'yapi kayit belgesi',
    'yapi tatil tutanagi',
    'yapi tespit ve durdurma zapti',
    'yikim karari',
    'encumen karari',
    'imar kanunu 32',
    'imar kanunu 42',
    'ruhsata aykirilik',
    'ruhsat ve eklerine aykirilik',
    'ruhsatsiz yapi',
    'kacak yapi',
    'sit alani',
    'bahce mesafesi',
];
const STRICT_IMAR_MATCH_TOKENS = new Set([
    'imar',
    'yikim',
    'encumen',
    'tatil',
    'ruhsatsiz',
    'kacak',
    'aykirilik',
    'bahce',
    'mesafesi',
    '3194',
]);

const HIGH_SIGNAL_IMAR_TOKENS = new Set([
    'yikim',
    'encumen',
    'tatil',
    'ruhsatsiz',
    'kacak',
    'aykirilik',
    'bahce',
    'mesafesi',
    '3194',
]);
const hasStrictImarIntent = (signals = {}) => {
    if (String(signals?.primaryDomainId || '') !== 'idare') return false;
    const combinedText = normalizeText([
        signals?.original,
        ...(signals?.phrases || []),
        ...(signals?.anchorTokens || []),
        ...(signals?.tokens || []),
        ...(signals?.domainAnchorTokens || []),
    ].join(' '));
    if (!combinedText) return false;
    if (STRICT_IMAR_INTENT_PHRASES.some((phrase) => combinedText.includes(phrase))) {
        return true;
    }
    let tokenHits = 0;
    for (const token of STRICT_IMAR_MATCH_TOKENS) {
        if (combinedText.includes(token)) tokenHits += 1;
        if (tokenHits >= 2) return true;
    }
    return false;
};
const hasStrictImarDocumentMatch = (metrics = {}) => {
    const matchedPhrases = Array.isArray(metrics?.matchedPhrases) ? metrics.matchedPhrases : [];
    const haystack = normalizeText(metrics?.haystack || '');
    const haystackTokens = new Set(
        Array.isArray(metrics?.haystackTokens)
            ? metrics.haystackTokens.map((token) => normalizeText(token)).filter(Boolean)
            : []
    );

    if (matchedPhrases.some((phrase) => STRICT_IMAR_INTENT_PHRASES.includes(normalizeText(phrase)))) {
        return true;
    }

    if (haystack.includes('3194 sayili imar kanunu')) {
        return true;
    }

    const strictTokenHits = new Set();
    const highSignalHits = new Set();
    for (const token of STRICT_IMAR_MATCH_TOKENS) {
        if (!haystackTokens.has(token)) continue;
        strictTokenHits.add(token);
        if (HIGH_SIGNAL_IMAR_TOKENS.has(token)) {
            highSignalHits.add(token);
        }
    }

    if (highSignalHits.size >= 1 && strictTokenHits.size >= 2) {
        return true;
    }

    return haystack.includes('imar') && haystack.includes('yapi kayit belgesi');
};
const buildQuerySignals = (keyword = '', rawQuery = '', options = {}) => {
    const fullQuery = String(rawQuery || keyword || '').trim();
    const normalized = normalizeText(fullQuery);
    const normalizedKeyword = normalizeText(keyword || fullQuery);
    const matchedProfiles = detectQueryProfiles(keyword, rawQuery);
    const forcedProfiles = Array.isArray(options.forcedProfiles) ? options.forcedProfiles : [];
    const lockProfiles = Boolean(options.lockProfiles);
    const searchArea = normalizeSearchArea(options.searchArea);
    const primaryTokenText =
        normalizedKeyword.length >= 12 && normalized.length > normalizedKeyword.length * 2
            ? normalizedKeyword
            : normalized;
    const tokens = primaryTokenText
        .split(' ')
        .map((item) => item.trim())
        .filter((item) => item.length > 1 && !DECISION_STOPWORDS.has(item) && !/^\d+$/.test(item));
    const keywordTokens = normalizedKeyword
        .split(' ')
        .map((item) => item.trim())
        .filter((item) => item.length > 1 && !DECISION_STOPWORDS.has(item) && !/^\d+$/.test(item));
    const quotedPhrases = extractQuotedPhrases(fullQuery);
    const basePhrases = buildQueryPhrases(keyword || fullQuery);
    const matchedProfileIds = Array.from(
        new Set(lockProfiles ? forcedProfiles : [...forcedProfiles, ...matchedProfiles.map((item) => item.id)])
    );
    const primaryDomainId = resolvePrimaryDomainId(
        matchedProfileIds,
        searchArea,
        String(options.resolvedSource || '')
    );
    const cezaSupplementalSignals = matchedProfileIds.includes('ceza') || primaryDomainId === 'ceza'
        ? buildCezaSupplementalSignals(keyword, rawQuery)
        : { tokens: [], anchorTokens: [], phrases: [], domainAnchorTokens: [] };
    const icraSupplementalSignals = matchedProfileIds.includes('icra') || primaryDomainId === 'icra'
        ? buildIcraSupplementalSignals(keyword, rawQuery)
        : { tokens: [], anchorTokens: [], phrases: [], domainAnchorTokens: [] };
    const idareSupplementalSignals = matchedProfileIds.includes('idare') || primaryDomainId === 'idare'
        ? buildIdareSupplementalSignals(keyword, rawQuery)
        : { tokens: [], anchorTokens: [], phrases: [], domainAnchorTokens: [] };
    const supplementalSignals = {
        tokens: [...(cezaSupplementalSignals.tokens || []), ...(icraSupplementalSignals.tokens || []), ...(idareSupplementalSignals.tokens || [])],
        anchorTokens: [...(cezaSupplementalSignals.anchorTokens || []), ...(icraSupplementalSignals.anchorTokens || []), ...(idareSupplementalSignals.anchorTokens || [])],
        phrases: [...(cezaSupplementalSignals.phrases || []), ...(icraSupplementalSignals.phrases || []), ...(idareSupplementalSignals.phrases || [])],
        domainAnchorTokens: [...(cezaSupplementalSignals.domainAnchorTokens || []), ...(icraSupplementalSignals.domainAnchorTokens || []), ...(idareSupplementalSignals.domainAnchorTokens || [])],
    };
    const uniqueTokens = Array.from(new Set([...tokens, ...(supplementalSignals.tokens || [])])).slice(0, 24);
    const anchorTokens = Array.from(
        new Set([
            ...keywordTokens.filter((item) => item.length >= 4 && !LOW_SIGNAL_QUERY_TOKENS.has(item)),
            ...(supplementalSignals.anchorTokens || []),
        ])
    ).slice(0, 20);
    const phrases = Array.from(new Set([...basePhrases, ...(supplementalSignals.phrases || [])])).slice(0, 14);
    const domainAnchorTokens = Array.from(
        new Set([
            ...buildDomainAnchorTokens(matchedProfileIds, primaryDomainId),
            ...(supplementalSignals.domainAnchorTokens || []),
        ])
    ).slice(0, 18);

    return {
        original: fullQuery,
        normalized,
        tokens: uniqueTokens,
        anchorTokens,
        quotedPhrases,
        phrases,
        supplementalPhrases: supplementalSignals.phrases || [],
        searchArea,
        lockProfiles,
        matchedProfileIds,
        primaryDomainId,
        domainAnchorTokens,
    };
};

const getTextMatchMetrics = (value = '', signals = {}) => {
    const haystack = normalizeText(value);
    if (!haystack) {
        return {
            haystack: '',
            haystackTokens: [],
            matchedPhrases: [],
            matchedTokens: [],
            matchedAnchorTokens: [],
            matchedDomainAnchorTokens: [],
            phraseCoverage: 0,
            tokenCoverage: 0,
            queryTokenCoverage: 0,
            anchorCoverage: 0,
            domainAnchorCoverage: 0,
            lexicalOverlap: 0,
        };
    }

    const haystackTokens = Array.from(
        new Set(
            haystack
                .split(' ')
                .map((item) => item.trim())
                .filter((item) => item.length > 1 && !DECISION_STOPWORDS.has(item))
        )
    );
    const phraseList = Array.from(
        new Set([...(signals.quotedPhrases || []), ...(signals.phrases || [])])
    );
    const matchedPhrases = phraseList.filter((phrase) => phrase && haystack.includes(phrase));
    const matchedTokens = Array.isArray(signals.tokens)
        ? signals.tokens.filter((token) => token && haystack.includes(token))
        : [];
    const matchedAnchorTokens = Array.isArray(signals.anchorTokens)
        ? signals.anchorTokens.filter((token) => token && haystack.includes(token))
        : [];
    const matchedDomainAnchorTokens = Array.isArray(signals.domainAnchorTokens)
        ? signals.domainAnchorTokens.filter((token) => token && haystack.includes(token))
        : [];
    const lexicalUnion = new Set([...(signals.tokens || []), ...haystackTokens]);

    return {
        haystack,
        haystackTokens,
        matchedPhrases,
        matchedTokens,
        matchedAnchorTokens,
        matchedDomainAnchorTokens,
        phraseCoverage:
            phraseList.length > 0
                ? matchedPhrases.length / phraseList.length
                : 0,
        tokenCoverage:
            Array.isArray(signals.tokens) && signals.tokens.length > 0
                ? matchedTokens.length / signals.tokens.length
                : 0,
        queryTokenCoverage:
            Array.isArray(signals.tokens) && signals.tokens.length > 0
                ? matchedTokens.length / signals.tokens.length
                : 0,
        anchorCoverage:
            Array.isArray(signals.anchorTokens) && signals.anchorTokens.length > 0
                ? matchedAnchorTokens.length / signals.anchorTokens.length
                : 0,
        domainAnchorCoverage:
            Array.isArray(signals.domainAnchorTokens) && signals.domainAnchorTokens.length > 0
                ? matchedDomainAnchorTokens.length / signals.domainAnchorTokens.length
                : 0,
        lexicalOverlap:
            lexicalUnion.size > 0
                ? matchedTokens.length / lexicalUnion.size
                : 0,
    };
};

const DOMAIN_PATTERNS = {
    anayasa: /anayasa mahkemesi|bireysel basvuru|hak ihlali|norm denetimi/,
    istinaf: /istinaf|bolge adliye|bam|esastan ret|esastan reddi/,
    idare: /danistay|idare mahkemesi|vergi mahkemesi|idari dava|idari islem|imar|imar barisi|yapi kayit belgesi|yikim karari|encumen|ruhsat|vergi/,
    ceza: /ceza|agir ceza|ceza dairesi|cumhuriyet bassavciligi|savcilik|cbs|mahkumiyet|beraat|tck|hakaret|uyusturucu/,
    is_hukuku: /is mahkemesi|ise iade|feshin gecersizligi|iscilik|isci|isveren|kidem|ihbar|fazla mesai|ucret alacagi/,
    hukuk: /hukuk dairesi|asliye hukuk|asliye ticaret|ticaret|aile mahkemesi|tuketici|kadastro|icra hukuk|alacak|menfi tespit|itirazin iptali/,
};

const getDecisionMetadataText = (item = {}) =>
    [
        item?.title,
        item?.daire,
        item?.mahkeme,
        item?.ozet,
        item?.snippet,
        item?.courtType,
        item?.metadataText,
    ]
        .filter(Boolean)
        .join(' ');
const extractDecisionYear = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return null;
    const directMatch = text.match(/(?:19|20|21|22|30|40|50|60)\d{2}/g);
    if (Array.isArray(directMatch) && directMatch.length > 0) {
        const year = Number(directMatch[directMatch.length - 1]);
        return Number.isFinite(year) ? year : null;
    }
    const dottedMatch = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!dottedMatch) return null;
    const year = Number(dottedMatch[3]);
    return Number.isFinite(year) ? year : null;
};
const hasSuspiciousDecisionDate = (item = {}) => {
    const year = extractDecisionYear(item?.tarih || '');
    if (!Number.isFinite(year)) return false;
    return year < 1900 || year > CURRENT_DECISION_YEAR + 1;
};

const detectDomainsInText = (text = '') => {
    const domains = new Set();
    const haystack = normalizeText(text);
    if (!haystack) return domains;

    for (const [domainId, pattern] of Object.entries(DOMAIN_PATTERNS)) {
        if (pattern.test(haystack)) {
            domains.add(domainId);
        }
    }

    return domains;
};

const resolveDetectedPrimaryDomain = ({
    sourceKey = '',
    headerDomains = new Set(),
    contextDomains = new Set(),
}) => {
    if (sourceKey === 'anayasa' || headerDomains.has('anayasa')) return 'anayasa';
    if (sourceKey === 'danistay' || headerDomains.has('idare')) return 'idare';
    if (sourceKey === 'all' && headerDomains.has('istinaf')) return 'istinaf';
    if (headerDomains.has('ceza')) return 'ceza';
    if (headerDomains.has('is_hukuku')) return 'is_hukuku';
    if (headerDomains.has('hukuk')) return 'hukuk';
    if (headerDomains.has('istinaf')) return 'istinaf';
    if (contextDomains.has('anayasa')) return 'anayasa';
    if (contextDomains.has('idare')) return 'idare';
    if (contextDomains.has('ceza')) return 'ceza';
    if (contextDomains.has('is_hukuku')) return 'is_hukuku';
    if (contextDomains.has('hukuk')) return 'hukuk';
    if (contextDomains.has('istinaf')) return 'istinaf';
    return '';
};

const detectResultDomains = (item = {}) => {
    const sourceKey = normalizeSource(item?.source, '');
    const headerText = normalizeText(
        [
            item?.source,
            item?.title,
            item?.daire,
            item?.mahkeme,
            item?.courtType,
        ].filter(Boolean).join(' ')
    );
    const contextText = normalizeText(
        [
            item?.ozet,
            item?.snippet,
            item?.metadataText,
        ].filter(Boolean).join(' ')
    );
    const headerDomains = detectDomainsInText(headerText);
    const contextDomains = detectDomainsInText(contextText);
    const domains = new Set([...headerDomains, ...contextDomains]);

    if (sourceKey === 'anayasa') domains.add('anayasa');
    if (sourceKey === 'danistay') domains.add('idare');

    return {
        sourceKey,
        headerText,
        contextText,
        haystack: `${headerText} ${contextText}`.trim(),
        headerDomains,
        contextDomains,
        domains,
        primaryDetectedDomain: resolveDetectedPrimaryDomain({ sourceKey, headerDomains, contextDomains }),
    };
};

const computeDomainAlignment = (item = {}, signals = {}) => {
    const primaryDomainId = signals?.primaryDomainId || 'hukuk';
    const config = getDomainConfig(primaryDomainId);
    const classification = detectResultDomains(item);
    const metadataMetrics = getTextMatchMetrics(getDecisionMetadataText(item), signals);
    const domainMatched =
        classification.primaryDetectedDomain === primaryDomainId ||
        classification.domains.has(primaryDomainId) ||
        (primaryDomainId === 'hukuk' &&
            (classification.primaryDetectedDomain === 'is_hukuku' || classification.domains.has('is_hukuku')));
    const explicitWrongDomain =
        Boolean(classification.primaryDetectedDomain) &&
        !domainMatched &&
        DOMAIN_PRIORITY.includes(classification.primaryDetectedDomain);
    const chamberHit = (config.chamberPatterns || []).some((pattern) => pattern.test(classification.headerText || classification.haystack));
    const lexicalTopicOverlap = Math.max(
        metadataMetrics.queryTokenCoverage,
        metadataMetrics.anchorCoverage,
        metadataMetrics.lexicalOverlap
    );
    const lowTopicOverlap = lexicalTopicOverlap < config.lowTopicOverlapThreshold;

    let bonus = 0;
    let penalty = 0;

    if (domainMatched) {
        bonus += config.exactDomainBonus;
    }
    if (chamberHit) {
        bonus += config.chamberPriorBonus || 0;
    }
    if ((config.preferredSources || []).includes(classification.sourceKey)) {
        bonus += 6;
    }
    if (explicitWrongDomain) {
        penalty += config.wrongDomainPenalty;
    }
    if (explicitWrongDomain && lowTopicOverlap) {
        penalty += 10;
    }

    return {
        primaryDomainId,
        primaryDetectedDomain: classification.primaryDetectedDomain,
        domainMatched,
        explicitWrongDomain,
        chamberHit,
        lexicalTopicOverlap,
        lowTopicOverlap,
        queryTokenCoverage: metadataMetrics.queryTokenCoverage,
        phraseCoverage: metadataMetrics.phraseCoverage,
        domainAnchorCoverage: metadataMetrics.domainAnchorCoverage,
        bonus,
        penalty,
        shouldFilter:
            explicitWrongDomain &&
            lowTopicOverlap &&
            !chamberHit &&
            metadataMetrics.matchedPhrases.length === 0 &&
            metadataMetrics.matchedDomainAnchorTokens.length === 0,
    };
};

const getSemanticTriggerScore = (signals = {}, resolvedSource = 'all') => {
    const primaryDomainId = resolvePrimaryDomainId(
        signals?.matchedProfileIds || [],
        signals?.searchArea || 'auto',
        resolvedSource
    );
    return getDomainConfig(primaryDomainId).semanticTriggerScore || SEMANTIC_TRIGGER_SCORE;
};

const getMinimumResultScore = (signals = {}) =>
    getDomainConfig(signals?.primaryDomainId || 'hukuk').minScore || 24;

const getDecisionIdentity = (item = {}) =>
    String(item.documentId || '').trim() ||
    [
        String(item.source || '').trim(),
        String(item.title || '').trim(),
        String(item.esasNo || '').trim(),
        String(item.kararNo || '').trim(),
        String(item.tarih || '').trim(),
    ].join('|');

const dedupeDecisions = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = getDecisionIdentity(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const mergeSemanticResults = (baseResults = [], semanticResults = []) => {
    const merged = new Map();

    for (const item of dedupeDecisions(baseResults)) {
        merged.set(getDecisionIdentity(item), { ...item });
    }

    for (const item of dedupeDecisions(semanticResults)) {
        const key = getDecisionIdentity(item);
        if (!key) continue;

        const current = merged.get(key);
        if (!current) {
            merged.set(key, { ...item });
            continue;
        }

        merged.set(key, {
            ...current,
            ...item,
            id: current.id || item.id,
            documentId: current.documentId || item.documentId,
            documentUrl: current.documentUrl || item.documentUrl,
            sourceUrl: current.sourceUrl || item.sourceUrl || item.documentUrl || current.documentUrl,
            ozet: String(item.ozet || '').trim() || current.ozet || '',
            snippet: String(item.snippet || '').trim() || current.snippet || '',
            relevanceScore: Math.max(Number(current.relevanceScore || 0), Number(item.relevanceScore || 0)) || undefined,
            semanticRawScore: Number.isFinite(Number(item.semanticRawScore))
                ? Number(item.semanticRawScore)
                : current.semanticRawScore,
            matchReason: item.matchReason || current.matchReason,
            matchHighlights: Array.isArray(item.matchHighlights) && item.matchHighlights.length > 0
                ? item.matchHighlights
                : current.matchHighlights,
        });
    }

    return Array.from(merged.values());
};

const getBedestenSource = (itemType = '') => {
    const normalized = normalizeText(itemType);
    if (normalized.includes('yargitay')) return 'yargitay';
    if (normalized.includes('danistay')) return 'danistay';
    return 'all';
};

const toBedestenDecision = (item, index) => {
    const safe = item || {};
    const esasNo =
        safe.esasNo ||
        safe.esas_no ||
        (safe.esasYili && safe.esasSiraNo ? `${safe.esasYili}/${safe.esasSiraNo}` : '');
    const kararNo =
        safe.kararNo ||
        safe.karar_no ||
        (safe.kararYili && safe.kararSiraNo ? `${safe.kararYili}/${safe.kararSiraNo}` : '');
    const daire = safe.birimAdi || safe.birim || '';
    const mahkeme = safe.itemType?.description || safe.mahkeme || '';
    const courtType = safe.itemType?.name || safe.itemType?.description || '';
    const title = `${mahkeme} ${daire}`.trim() || safe.title || `Karar ${index + 1}`;
    const ozet = safe.ozet || safe.kararOzeti || safe.summary || '';

    return {
        id: safe.documentId || safe.id || `bedesten-${index + 1}`,
        documentId: safe.documentId || safe.id || '',
        title,
        esasNo,
        kararNo,
        tarih: safe.kararTarihiStr || safe.kararTarihi || safe.tarih || '',
        daire,
        ozet,
        snippet: safe.snippet || ozet,
        mahkeme,
        courtType,
        metadataText: [courtType, daire, mahkeme, safe.kararOzeti, safe.summary].filter(Boolean).join(' '),
        source: getBedestenSource(safe.itemType?.description || safe.itemType?.name || mahkeme),
        relevanceScore: Number.isFinite(Number(safe.relevanceScore ?? safe.score))
            ? Number(safe.relevanceScore ?? safe.score)
            : undefined,
    };
};

const toEmsalDecision = (item, index) => {
    const safe = item || {};
    const title =
        `${safe.yargiBirimi || safe.mahkeme || 'Emsal'} ${safe.daire || ''}`.trim() ||
        `Emsal Karar ${index + 1}`;

    return {
        id: safe.id || `emsal-${index + 1}`,
        documentId: safe.id || '',
        title,
        esasNo: safe.esasNo || '',
        kararNo: safe.kararNo || '',
        tarih: safe.kararTarihi || safe.tarih || '',
        daire: safe.daire || safe.yargiBirimi || '',
        mahkeme: safe.mahkeme || safe.yargiBirimi || '',
        courtType: 'UYAP',
        ozet: safe.kararOzeti || safe.ozet || '',
        snippet: safe.kararOzeti || safe.ozet || '',
        metadataText: [safe.yargiBirimi, safe.mahkeme, safe.daire].filter(Boolean).join(' '),
        source: 'uyap',
    };
};

const toAnayasaDecision = (item, decisionType, index) => {
    const safe = item || {};
    const title =
        safe.title ||
        safe.decision_reference_no ||
        `Anayasa Mahkemesi Karari ${index + 1}`;
    const summaryParts = [
        safe.application_subject_summary,
        safe.decision_outcome_summary,
        safe.applicant_summary,
        safe.application_type_summary,
        safe.decision_type_summary,
    ].filter(Boolean);
    const ozet = summaryParts.join(' - ');

    return {
        id: safe.decision_page_url || `anayasa-${decisionType}-${index + 1}`,
        documentId: '',
        documentUrl: safe.decision_page_url || '',
        title,
        esasNo: decisionType === 'bireysel_basvuru' ? safe.decision_reference_no || '' : '',
        kararNo: decisionType === 'norm_denetimi' ? safe.decision_reference_no || '' : '',
        tarih: safe.decision_date_summary || '',
        daire:
            safe.decision_making_body ||
            (decisionType === 'norm_denetimi'
                ? 'Anayasa Mahkemesi Norm Denetimi'
                : 'Anayasa Mahkemesi'),
        ozet,
        snippet: ozet,
        source: 'anayasa',
        relevanceScore: Math.max(0, 96 - index * 4),
    };
};

const toSemanticBedestenDecision = (item, index) => {
    const safe = item || {};
    const metadata = safe.metadata || {};
    const daire = metadata.birim_adi || safe.daire || '';
    const title = String(safe.title || `${daire || 'Semantik Karar'} ${index + 1}`).trim();
    const preview = String(safe.preview || safe.text || '').trim();
    const similarityScore = Number(safe.similarity_score);
    const courtType = String(metadata.court_type || safe.courtType || '').trim();

    return {
        id: safe.document_id || safe.id || `semantic-${index + 1}`,
        documentId: safe.document_id || safe.id || '',
        title,
        esasNo: metadata.esas_no || safe.esasNo || '',
        kararNo: metadata.karar_no || safe.kararNo || '',
        tarih: metadata.karar_tarihi || safe.tarih || '',
        daire,
        courtType,
        ozet: preview,
        snippet: preview,
        metadataText: [
            courtType,
            metadata.birim_adi,
            metadata.esas_no,
            metadata.karar_no,
            metadata.karar_tarihi,
        ].filter(Boolean).join(' '),
        source: getBedestenSource(metadata.court_type || title),
        sourceUrl: safe.source_url || '',
        documentUrl: safe.source_url || '',
        semanticRawScore: Number.isFinite(similarityScore)
            ? clampScore(similarityScore * 100)
            : undefined,
        relevanceScore: Number.isFinite(similarityScore)
            ? clampScore(similarityScore * 100)
            : Math.max(0, 90 - index * 4),
    };
};

const buildMatchReason = (item, signals) => {
    const metrics = getTextMatchMetrics(
        [item.title, item.daire, item.ozet, item.snippet].join(' '),
        signals
    );
    const matchedPhrases = metrics.matchedPhrases;
    if (matchedPhrases.length > 0) {
        return `Tam ifade eslesmesi: ${matchedPhrases[0]}`;
    }

    const matchedTokens = metrics.matchedTokens;
    if (matchedTokens.length > 0) {
        return `Anahtar kelimeler: ${matchedTokens.slice(0, 4).join(', ')}`;
    }

    return 'MCP arama sonucu';
};

const GENERIC_MATCH_HIGHLIGHTS = new Set([
    'ceza',
    'agir ceza',
    'aÃ„Å¸Ã„Â±r ceza',
    'uyusturucu',
    'uyuÃ…Å¸turucu',
    'ticaret',
    'ticareti',
    'madde',
    'kullanici',
    'kullanÃ„Â±cÃ„Â±',
    'sanik',
    'sanÃ„Â±k',
]);

const mergeMatchHighlights = (...groups) => {
    const merged = [];
    const seen = new Set();

    for (const group of groups) {
        if (!Array.isArray(group)) continue;
        for (const item of group) {
            const value = normalizeText(item);
            if (!value || value.length < 2) continue;
            const key = value.toLocaleLowerCase('tr-TR');
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(value);
        }
    }

    const filtered = merged.filter((value, _, allValues) => {
        const normalizedValue = value.toLocaleLowerCase('tr-TR');
        const wordCount = normalizedValue.split(/\s+/).filter(Boolean).length;

        if (GENERIC_MATCH_HIGHLIGHTS.has(normalizedValue)) {
            return allValues.some((otherValue) => {
                const normalizedOtherValue = otherValue.toLocaleLowerCase('tr-TR');
                return (
                    normalizedOtherValue !== normalizedValue &&
                    normalizedOtherValue.includes(normalizedValue) &&
                    normalizedOtherValue.split(/\s+/).filter(Boolean).length > wordCount
                );
            }) ? false : wordCount > 1;
        }

        return !allValues.some((otherValue) => {
            const normalizedOtherValue = otherValue.toLocaleLowerCase('tr-TR');
            return (
                normalizedOtherValue !== normalizedValue &&
                normalizedOtherValue.length > normalizedValue.length &&
                normalizedOtherValue.includes(normalizedValue) &&
                normalizedOtherValue.split(/\s+/).filter(Boolean).length >= wordCount
            );
        });
    });

    return filtered.slice(0, 12);
};

const buildMatchHighlightsFromMetrics = (metrics = {}) =>
    mergeMatchHighlights(
        metrics.matchedPhrases,
        metrics.matchedAnchorTokens,
        metrics.matchedDomainAnchorTokens,
        metrics.matchedTokens,
    );

const buildResultMatchHighlights = (item, signals) => {
    const titleMetrics = getTextMatchMetrics([item.title, item.daire].join(' '), signals);
    const summaryMetrics = getTextMatchMetrics(
        [item.ozet, item.snippet, item.metadataText, item.courtType].join(' '),
        signals
    );

    return mergeMatchHighlights(
        titleMetrics.matchedPhrases,
        summaryMetrics.matchedPhrases,
        titleMetrics.matchedAnchorTokens,
        summaryMetrics.matchedAnchorTokens,
        titleMetrics.matchedDomainAnchorTokens,
        summaryMetrics.matchedDomainAnchorTokens,
        titleMetrics.matchedTokens,
        summaryMetrics.matchedTokens,
    );
};

const hasProfileSignal = (item, profileId = '') => {
    const rules = PROFILE_SIGNAL_RULES[profileId];
    if (!rules) return false;
    const haystack = normalizeText(
        [item?.title, item?.daire, item?.ozet, item?.snippet, item?.mahkeme].join(' ')
    );
    if (!haystack) return false;
    return rules.positive.test(haystack);
};

const computeScore = (item, signals) => {
    if (!matchesSearchArea(item, signals?.searchArea || 'auto')) {
        return 0;
    }

    const title = normalizeText(item.title);
    const daireText = normalizeText(item.daire);
    const rawScore = Number(item.relevanceScore);
    const summaryText = [item.daire, item.ozet, item.snippet, item.metadataText, item.courtType].join(' ');
    const summaryMetrics = getTextMatchMetrics(summaryText, signals);
    const titleMetrics = getTextMatchMetrics(title, signals);
    const combinedMatchedTokens = new Set([
        ...titleMetrics.matchedTokens,
        ...summaryMetrics.matchedTokens,
    ]);
    const combinedAnchorTokens = new Set([
        ...titleMetrics.matchedAnchorTokens,
        ...summaryMetrics.matchedAnchorTokens,
    ]);
    const combinedMatchedPhrases = new Set([
        ...titleMetrics.matchedPhrases,
        ...summaryMetrics.matchedPhrases,
    ]);
    const combinedDomainAnchors = new Set([
        ...titleMetrics.matchedDomainAnchorTokens,
        ...summaryMetrics.matchedDomainAnchorTokens,
    ]);
    const metadataLength =
        String(item?.title || '').trim().length +
        String(item?.daire || '').trim().length +
        String(item?.ozet || '').trim().length +
        String(item?.snippet || '').trim().length +
        String(item?.metadataText || '').trim().length;
    const hasTextEvidence =
        combinedMatchedTokens.size > 0 ||
        combinedMatchedPhrases.size > 0 ||
        combinedAnchorTokens.size > 0 ||
        combinedDomainAnchors.size > 0;

    if (signals.tokens.length === 0 && signals.quotedPhrases.length === 0) {
        return Number.isFinite(rawScore) ? clampScore(rawScore) : 60;
    }

    let score = 0;
    score += titleMetrics.phraseCoverage * 34;
    score += summaryMetrics.phraseCoverage * 24;
    score += summaryMetrics.tokenCoverage * 52;
    score += titleMetrics.tokenCoverage * 28;
    score += summaryMetrics.anchorCoverage * 36;
    score += titleMetrics.anchorCoverage * 18;
    score += summaryMetrics.lexicalOverlap * 32;
    score += titleMetrics.lexicalOverlap * 18;
    score += summaryMetrics.domainAnchorCoverage * 40;
    score += titleMetrics.domainAnchorCoverage * 18;

    if (titleMetrics.matchedPhrases.length > 0) score += 10;
    if (summaryMetrics.matchedPhrases.length > 0) score += 8;
    if (combinedMatchedTokens.size >= 2) score += 8;
    if (combinedMatchedTokens.size >= 4) score += 10;
    if (combinedAnchorTokens.size >= 1) score += 10;
    if (combinedAnchorTokens.size >= 2) score += 14;
    if (combinedDomainAnchors.size >= 1) score += 12;
    if (combinedDomainAnchors.size >= 2) score += 16;

    if (title && signals.normalized && title.includes(signals.normalized)) {
        score += 12;
    }

    if (Number.isFinite(rawScore) && rawScore > 0) {
        if (hasTextEvidence) {
            score = score * 0.70 + clampScore(rawScore) * 0.30;
        } else if (metadataLength >= 40) {
            score = Math.max(score, clampScore(rawScore) * 0.50);
        } else {
            score = Math.max(score, clampScore(rawScore) * 0.35);
        }
    }

    // MCP API bu sonucu dondurduyse, metadata olmasa bile bir baseline skor ver
    // Ancak cok yuksek verme ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â content rerank ile dogrulanacak
    if (!hasTextEvidence && score < 30) {
        const isFromApi = Boolean(item?.source && item?.documentId);
        if (isFromApi) {
            score = Math.max(score, 30);
        }
    }

    const domainAlignment = computeDomainAlignment(item, signals);
    if (domainAlignment.shouldFilter) {
        return 0;
    }

    if (Number.isFinite(Number(item?.semanticRawScore))) {
        const semanticRawScore = clampScore(Number(item.semanticRawScore));
        const semanticHybrid = clampScore(
            semanticRawScore * 0.68 +
            summaryMetrics.lexicalOverlap * 34 +
            summaryMetrics.queryTokenCoverage * 24 +
            summaryMetrics.domainAnchorCoverage * 20 +
            titleMetrics.queryTokenCoverage * 12
        );
        score = Math.max(score, semanticHybrid);
        if (semanticRawScore >= 72) score += 6;
        if (semanticRawScore >= 84) score += 4;
        if (domainAlignment.domainMatched) score += 8;
        if (domainAlignment.explicitWrongDomain) score -= 24;
        if (domainAlignment.lowTopicOverlap) score -= 18;
    }

    score += domainAlignment.bonus;
    score -= domainAlignment.penalty;

    const matchedProfiles = new Set(signals.matchedProfileIds || []);
    const titleHaystack = `${title} ${daireText}`.trim();

    if (matchedProfiles.has('ceza')) {
        if (/ceza|agir ceza|cumhuriyet bassavciligi|ceza dairesi/.test(titleHaystack)) score += 16;
        if (/hukuk|ticaret|asliye hukuk/.test(titleHaystack)) score -= 28;
    }
    if (matchedProfiles.has('is_hukuku')) {
        const laborHaystack = `${titleHaystack} ${normalizeText(summaryText)}`.trim();
        const sourceKey = normalizeSource(item?.source, '');
        if (PROFILE_SIGNAL_RULES.is_hukuku.positive.test(laborHaystack)) score += 24;
        if (/is mahkemesi|ise iade|feshin gecersizligi/.test(laborHaystack)) score += 18;
        if (/yargitay|uyap|istinaf|bolge adliye|bam/.test(titleHaystack) || sourceKey === 'yargitay' || sourceKey === 'uyap') {
            score += 10;
        }
        if (PROFILE_SIGNAL_RULES.is_hukuku.negative.test(laborHaystack)) score -= 36;
        if (sourceKey === 'danistay' || sourceKey === 'anayasa') score -= 24;
    }
    if (matchedProfiles.has('hukuk')) {
        if (/hukuk|asliye hukuk|is mahkemesi|hukuk dairesi/.test(titleHaystack)) score += 12;
        if (!matchedProfiles.has('is_hukuku') && /ticaret|asliye ticaret/.test(titleHaystack)) score += 10;
        if (/ceza|agir ceza|ceza dairesi|danistay|idare mahkemesi|vergi mahkemesi|istinaf|bam/.test(titleHaystack)) score -= 22;
    }
    if (matchedProfiles.has('idare')) {
        if (/danistay|idare mahkemesi|vergi mahkemesi|imar|yapi kayit belgesi|encumen|yikim karari/.test(titleHaystack)) score += 18;
        if (/ceza|agir ceza|hukuk dairesi|asliye hukuk|istinaf|bam/.test(titleHaystack)) score -= 28;
    }
    if (matchedProfiles.has('istinaf')) {
        if (/istinaf|bolge adliye|bam/.test(titleHaystack)) score += 16;
        if (/danistay|anayasa mahkemesi|yargitay ceza|yargitay hukuk/.test(titleHaystack)) score -= 24;
    }
    if (matchedProfiles.has('anayasa')) {
        if (normalizeSource(item?.source, '') === 'anayasa' || /anayasa|bireysel basvuru|hak ihlali/.test(titleHaystack)) {
            score += 24;
        } else {
            score -= 18;
        }
    }

    if (hasSuspiciousDecisionDate(item)) {
        score -= 24;
    }

    return clampScore(score);
};

const applyProfileSpecificFilters = (results = [], signals = {}, options = {}) => {
    if (!Array.isArray(results) || results.length === 0) return results;
    const contentVerified = Boolean(options.contentVerified);
    const matchedProfiles = new Set(signals.matchedProfileIds || []);
    const minScore = getMinimumResultScore(signals);

    const filtered = results.filter((item) => {
        const score = Number(item?.relevanceScore || 0);
        const alignment = computeDomainAlignment(item, signals);
        const isDocumentVerified = /tam metinde/i.test(String(item?.matchReason || ''));
        const hasSignal = Array.from(matchedProfiles).some((profileId) => hasProfileSignal(item, profileId));

        if (alignment.shouldFilter) return false;
        if (alignment.explicitWrongDomain && !alignment.domainMatched) {
            if (contentVerified || isDocumentVerified) {
                return alignment.domainAnchorCoverage >= 0.10 && alignment.queryTokenCoverage >= 0.10;
            }
            return score >= minScore + 18;
        }
        if (contentVerified || isDocumentVerified) {
            if (hasStrictImarIntent(signals)) {
                const strictMetrics = getTextMatchMetrics(getDecisionMetadataText(item), signals);
                if (!hasStrictImarDocumentMatch(strictMetrics)) {
                    return false;
                }
            }
            return alignment.domainMatched || hasSignal || score >= Math.max(18, minScore - 4);
        }
        if (alignment.domainMatched) {
            return score >= Math.max(16, minScore - 6);
        }
        if (alignment.lowTopicOverlap && !hasSignal) {
            return score >= minScore + 10;
        }
        return hasSignal || score >= minScore;
    });

    console.log(
        `[LEGAL_SEARCH] Profile filter: ${results.length} -> ${filtered.length} results (profiles: ${Array.from(matchedProfiles).join(',')}, contentVerified=${contentVerified})`
    );

    if (contentVerified) {
        return filtered;
    }

    if (filtered.length > 0) {
        return filtered;
    }

    return results.filter((item) => Number(item?.relevanceScore || 0) >= Math.max(12, minScore - 8));
};

const buildBuckets = (results = []) => {
    const strong = results.filter((item) => Number(item.relevanceScore || 0) >= 70);
    const fallbackStrong = strong.length > 0 ? strong : results.slice(0, Math.min(5, results.length));
    const strongKeys = new Set(fallbackStrong.map((item) => getDecisionIdentity(item)));
    const related = results.filter((item) => !strongKeys.has(getDecisionIdentity(item)));

    return {
        strong: fallbackStrong,
        related,
        combined: [...fallbackStrong, ...related],
    };
};

// Profil bazlÃ„Â± daire hedefleme - belirli hukuk alanlarÃ„Â± iÃƒÂ§in doÃ„Å¸ru daireye yÃƒÂ¶nlendir
const PROFILE_CHAMBER_MAP = {
    // Resmi daire is bolumu metinlerinde is hukuku icin 9. HD one cikiyor.
    is_hukuku: ['H9'],
    // Icra hukukunda 12. HD uygulamada ana dairelerden biri.
    icra: ['H12'],
    // Aile uyusmazliklari agirlikli olarak 2. HD ictihatlarinda toplanir.
    aile: ['H2'],
    // Ticari uyusmazliklarda 11. HD tipik merkez dairelerden biri.
    ticaret: ['H11'],
};

const searchByResolvedSource = async ({
    resolvedSource = 'all',
    query = '',
    filters = {},
    warningParts = [],
    signals = {},
}) => {
    const searchPromises = [];
    const matchedProfileIds = signals.matchedProfileIds || [];
    const searchArea = normalizeSearchArea(filters?.searchArea);
    const onlyBedestenSearch =
        searchArea === 'bam' ||
        (Array.isArray(filters?.courtTypesOverride) && filters.courtTypesOverride.length > 0);

    if (resolvedSource === 'all' || resolvedSource === 'yargitay' || resolvedSource === 'danistay') {
        // Profil bazlÃ„Â± daire hedefleme kontrol
        const hasChamberTargeting = matchedProfileIds.some((pid) => PROFILE_CHAMBER_MAP[pid]);
        const allowChamberTargeting =
            hasChamberTargeting &&
            resolvedSource !== 'danistay' &&
            signals.primaryDomainId !== 'idare' &&
            !matchedProfileIds.includes('idare');

        if (allowChamberTargeting) {
            // Daire-hedefli aramalar - genel ALL aramasÃ„Â± YAPILMAZ (alakasÃ„Â±z daireler gelmesin)
            for (const profileId of matchedProfileIds) {
                const chambers = PROFILE_CHAMBER_MAP[profileId];
                if (!chambers) continue;
                for (const birimAdi of chambers) {
                    console.log(`[LEGAL_SEARCH] Chamber-targeted Bedesten: profile=${profileId}, birimAdi=${birimAdi}`);
                    // YargÃ„Â±tay daire aramasÃ„Â±
                    searchPromises.push(
                        searchBedesten({
                            query,
                            source: 'yargitay',
                            filters: { ...filters, birimAdi },
                        }).catch((error) => {
                            console.warn(`[LEGAL_SEARCH] Chamber search (${birimAdi}) failed:`, error?.message || error);
                            return [];
                        })
                    );
                }
            }
        } else {
            // Profil eÃ…Å¸leÃ…Å¸mesi yok - genel ALL aramasÃ„Â±
            searchPromises.push(
                searchBedesten({ query, source: resolvedSource, filters }).catch((error) => {
                    console.warn(`[LEGAL_SEARCH] Bedesten search failed for query="${query}":`, error?.message || error);
                    warningParts.push(error?.message || 'Bedesten aramasi basarisiz oldu.');
                    return [];
                })
            );
        }
    }
    if (!onlyBedestenSearch && (resolvedSource === 'all' || resolvedSource === 'uyap')) {
        searchPromises.push(
            searchEmsal({ query, filters }).catch((error) => {
                console.warn(`[LEGAL_SEARCH] UYAP Emsal search failed for query="${query}":`, error?.message || error);
                warningParts.push(error?.message || 'UYAP emsal aramasi basarisiz oldu.');
                return [];
            })
        );
    }
    if (
        resolvedSource === 'anayasa' ||
        (resolvedSource === 'all' && matchedProfileIds.includes('anayasa'))
    ) {
        searchPromises.push(
            searchAnayasa({ query }).catch((error) => {
                warningParts.push(error?.message || 'Anayasa Mahkemesi aramasi basarisiz oldu.');
                return [];
            })
        );
    }

    if (searchPromises.length === 0) {
        const error = new Error(`Desteklenmeyen kaynak: ${resolvedSource}`);
        error.status = 400;
        throw error;
    }

    return Promise.all(searchPromises);
};

const scoreDecisionResults = (items = [], signals = {}) =>
    dedupeDecisions(items)
        .map((item) => {
            const relevanceScore = computeScore(item, signals);
            const domainAlignment = computeDomainAlignment(item, signals);
            return {
                ...item,
                relevanceScore,
                matchTier: relevanceScore >= 70 ? 'strong' : 'related',
                matchReason: buildMatchReason(item, signals),
                matchHighlights: buildResultMatchHighlights(item, signals),
                detectedDomains: Array.from(detectResultDomains(item).domains),
                primaryDetectedDomain: domainAlignment.primaryDetectedDomain || '',
            };
        })
        .sort((left, right) => Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0));

const buildDocumentMatchReason = (matchedPhrases = [], matchedTokens = [], verification = null, semanticRawScore = null) => {
    const hasSemanticSupport = Number.isFinite(Number(semanticRawScore)) && Number(semanticRawScore) >= 65;
    const semanticPrefix = hasSemanticSupport ? 'Semantik olarak yakin ve ' : '';
    if (matchedPhrases.length > 0) {
        return `${semanticPrefix}tam metinde ifade eslesmesi: ${matchedPhrases[0]}`;
    }
    if (matchedTokens.length > 0) {
        return `${semanticPrefix}tam metinde anahtar kelimeler: ${matchedTokens.slice(0, 5).join(', ')}`;
    }
    if (verification) {
        return `${semanticPrefix}tam metin dogrulandi (token=${verification.queryTokenCoverage}, phrase=${verification.phraseCoverage}, domain=${verification.domainAnchorCoverage})`;
    }
    return hasSemanticSupport ? 'Semantik olarak yakin ve tam metin dogrulandi' : 'Tam metin dogrulandi';
};

const computeVerifiedBlendScore = (item, rerank) => {
    const weightedParts = [
        {
            score: clampScore(Number(item?.relevanceScore || 0)),
            weight: 0.28,
        },
        {
            score: clampScore(Number(rerank?.score || 0)),
            weight: 0.47,
        },
    ];
    const semanticRawScore = Number(item?.semanticRawScore);
    if (Number.isFinite(semanticRawScore)) {
        weightedParts.push({
            score: clampScore(semanticRawScore),
            weight: 0.25,
        });
    }

    const totalWeight = weightedParts.reduce((sum, part) => sum + part.weight, 0);
    let blendedScore = weightedParts.reduce((sum, part) => sum + part.score * part.weight, 0) / Math.max(totalWeight, 1);
    if (Number(rerank?.score || 0) >= 82) blendedScore += 4;
    if (Number(item?.semanticRawScore || 0) >= 78) blendedScore += 6;

    return clampScore(blendedScore);
};

const selectContentRerankCandidates = (results = [], resolvedSource = 'all', signals = {}) => {
    const grouped = new Map();
    const rankedResults = [...results].sort((left, right) => {
        const leftSemantic = Number(left?.semanticRawScore || 0);
        const rightSemantic = Number(right?.semanticRawScore || 0);
        if (leftSemantic !== rightSemantic) return rightSemantic - leftSemantic;
        return Number(right?.relevanceScore || 0) - Number(left?.relevanceScore || 0);
    });

    for (const item of rankedResults) {
        const sourceKey = normalizeSource(item?.source, resolvedSource === 'all' ? 'all' : resolvedSource);
        const current = grouped.get(sourceKey) || [];
        if (current.length >= CONTENT_RERANK_PER_SOURCE_LIMIT) continue;
        if (!String(item?.documentId || item?.documentUrl || '').trim()) continue;
        current.push(item);
        grouped.set(sourceKey, current);
    }

    const ordered = [];
    const sourceOrder =
        resolvedSource === 'all'
            ? buildPreferredSources(signals.matchedProfileIds || [], resolvedSource)
            : [resolvedSource, 'all', 'uyap', 'anayasa', 'yargitay', 'danistay'];

    for (const sourceKey of sourceOrder) {
        const items = grouped.get(sourceKey) || [];
        for (const item of items) {
            ordered.push(item);
            if (ordered.length >= CONTENT_RERANK_TOTAL_LIMIT) {
                return ordered;
            }
        }
    }

    return ordered.slice(0, CONTENT_RERANK_TOTAL_LIMIT);
};

const shouldRerankByContent = (results = [], signals = {}) => {
    if (!Array.isArray(results) || results.length === 0) return false;
    const topScore = Number(results[0]?.relevanceScore || 0);
    const topTen = results.slice(0, 10);
    const strongCount = topTen.filter((item) => Number(item?.relevanceScore || 0) >= 50).length;
    const topHasSemantic = topTen.some((item) => Number.isFinite(Number(item?.semanticRawScore)));
    const topHasDomainMismatch = topTen.some((item) => computeDomainAlignment(item, signals).explicitWrongDomain);

    // Rerank: ozet/snippet bos olan sonuclar varsa hep yap (tam metin gerekli)
    const hasEmptyMetadata = topTen.some((item) => {
        const ozetLen = String(item?.ozet || '').trim().length;
        const snippetLen = String(item?.snippet || '').trim().length;
        return ozetLen === 0 && snippetLen === 0;
    });
    if (hasEmptyMetadata) return true;

    // Rerank: top skor dusukse VEYA guclu eslesme sayisi azsa
    return topScore < CONTENT_RERANK_TRIGGER_SCORE || strongCount < 3 || topHasSemantic || topHasDomainMismatch;
};

const rerankResultsByDocumentContent = async ({
    results = [],
    signals,
    resolvedSource = 'all',
}) => {
    const areaFilteredResults = applySearchAreaFilters(results, signals?.searchArea || 'auto');
    const candidates = selectContentRerankCandidates(areaFilteredResults, resolvedSource, signals);
    if (candidates.length === 0) {
        return {
            applied: false,
            results: areaFilteredResults,
            verifiedCount: 0,
        };
    }

    const rerankedCandidates = [];
    for (let index = 0; index < candidates.length; index += CONTENT_RERANK_BATCH_SIZE) {
        const batch = candidates.slice(index, index + CONTENT_RERANK_BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (item) => {
                try {
                    const documentPayload = await getLegalDocumentViaMcp({
                        source: item?.source || resolvedSource,
                        documentId: item?.documentId || '',
                        documentUrl: item?.documentUrl || item?.sourceUrl || '',
                    });
                    const content = String(documentPayload?.document?.content || '').trim();
                    if (!content) return null;

                    const metrics = getTextMatchMetrics(content, signals);
                    const domainConfig = getDomainConfig(signals?.primaryDomainId || 'hukuk');
                    const anchorCount = Array.isArray(signals?.anchorTokens) ? signals.anchorTokens.length : 0;
                    // Formul: < 3 kelime -> 1,  3-5 kelime -> 2,  6-8 kelime -> 3,  >8 kelime -> 4 eslesme gerekir.
                    const minimumAnchorHits = Math.max(1, Math.min(4, Math.ceil(anchorCount * 0.4)));
                    const verification = {
                        queryTokenCoverage: Number(metrics.queryTokenCoverage.toFixed(3)),
                        phraseCoverage: Number(metrics.phraseCoverage.toFixed(3)),
                        domainAnchorCoverage: Number(metrics.domainAnchorCoverage.toFixed(3)),
                    };
                    const syntheticContentItem = {
                        ...item,
                        ozet: content.slice(0, 1600),
                        snippet: content.slice(0, 1600),
                        metadataText: `${item?.metadataText || ''} ${content.slice(0, 600)}`.trim(),
                    };
                    const domainAlignment = computeDomainAlignment(syntheticContentItem, signals);
                    const hasCoverageGate =
                        metrics.phraseCoverage >= domainConfig.contentPhraseCoverage ||
                        metrics.queryTokenCoverage >= domainConfig.contentTokenCoverage ||
                        metrics.matchedAnchorTokens.length >= minimumAnchorHits;
                    const hasDomainGate =
                        (signals?.domainAnchorTokens || []).length === 0 ||
                        metrics.domainAnchorCoverage >= domainConfig.contentDomainAnchorCoverage ||
                        metrics.matchedPhrases.length > 0 ||
                        metrics.matchedDomainAnchorTokens.length > 0;
                    const requiresStrictImarMatch = hasStrictImarIntent(signals);
                    const hasStrictImarGate = !requiresStrictImarMatch || hasStrictImarDocumentMatch(metrics);
                    const hasHit = !domainAlignment.shouldFilter && hasCoverageGate && hasDomainGate && hasStrictImarGate;

                    const score = clampScore(
                        metrics.phraseCoverage * 28 +
                        metrics.tokenCoverage * 42 +
                        metrics.anchorCoverage * 26 +
                        metrics.domainAnchorCoverage * 24 +
                        metrics.lexicalOverlap * 18 +
                        (metrics.matchedTokens.length >= 2 ? 8 : 0) +
                        (metrics.matchedTokens.length >= 4 ? 10 : 0) +
                        (metrics.matchedAnchorTokens.length >= 1 ? 8 : 0) +
                        (metrics.matchedAnchorTokens.length >= 2 ? 10 : 0) +
                        (metrics.matchedDomainAnchorTokens.length >= 1 ? 10 : 0) +
                        (metrics.matchedPhrases.length > 0 ? 10 : 0) +
                        domainAlignment.bonus -
                        domainAlignment.penalty
                    );

                    return {
                        key: getDecisionIdentity(item),
                        hasHit,
                        score,
                        matchedPhrases: metrics.matchedPhrases,
                        matchedTokens: metrics.matchedTokens,
                        matchHighlights: buildMatchHighlightsFromMetrics(metrics),
                        verification,
                        snippet: content.replace(/[#*_>|\-\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
                    };
                } catch {
                    return null;
                }
            })
        );
        rerankedCandidates.push(...batchResults);
        if (index + CONTENT_RERANK_BATCH_SIZE < candidates.length && CONTENT_RERANK_BATCH_DELAY_MS > 0) {
            await wait(CONTENT_RERANK_BATCH_DELAY_MS);
        }
    }

    const rerankMap = new Map(
        rerankedCandidates.filter(Boolean).map((item) => [item.key, item])
    );
    const verifiedMatches = rerankedCandidates.filter((item) => item?.hasHit);

    if (verifiedMatches.length === 0) {
        return {
            applied: false,
            results: areaFilteredResults,
            verifiedCount: 0,
        };
    }

    const updatedResults = areaFilteredResults
        .map((item) => {
            const rerank = rerankMap.get(getDecisionIdentity(item));
            if (!rerank) return item;

            const boostedScore = rerank.hasHit
                ? computeVerifiedBlendScore(item, rerank)
                : Number(item?.relevanceScore || 0);

            return {
                ...item,
                relevanceScore: clampScore(boostedScore),
                matchTier: boostedScore >= 70 ? 'strong' : 'related',
                matchReason: rerank.hasHit
                    ? buildDocumentMatchReason(
                        rerank.matchedPhrases,
                        rerank.matchedTokens,
                        rerank.verification,
                        item?.semanticRawScore
                    )
                    : item.matchReason,
                matchHighlights: rerank.hasHit
                    ? mergeMatchHighlights(rerank.matchHighlights, item.matchHighlights)
                    : item.matchHighlights || [],
                // Bos ozet/snippet varsa belge metninden snippet ekle
                ozet: String(item?.ozet || '').trim() || rerank.snippet || '',
                snippet: String(item?.snippet || '').trim() || rerank.snippet || '',
                contentVerification: rerank.verification || item.contentVerification || null,
            };
        })
        .sort((left, right) => {
            const leftRerank = rerankMap.get(getDecisionIdentity(left));
            const rightRerank = rerankMap.get(getDecisionIdentity(right));
            const leftHit = leftRerank?.hasHit ? 1 : 0;
            const rightHit = rightRerank?.hasHit ? 1 : 0;
            if (leftHit !== rightHit) return rightHit - leftHit;

            const scoreDiff = Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0);
            if (scoreDiff !== 0) return scoreDiff;

            const semanticDiff = Number(right.semanticRawScore || 0) - Number(left.semanticRawScore || 0);
            if (semanticDiff !== 0) return semanticDiff;

            return Number(rightRerank?.score || 0) - Number(leftRerank?.score || 0);
        });

    // Tam metinle dogrulanan kararlar varsa once yalnizca bunlari dondur.
    // Aksi halde zayif ama yuksek skorlu adaylar tekrar listeyi kirletiyor.
    const verifiedResults = updatedResults.filter((item) => {
        const key = getDecisionIdentity(item);
        const rerank = rerankMap.get(key);
        return rerank?.hasHit === true;
    });

    console.log(`[LEGAL_SEARCH] Content rerank: ${updatedResults.length} checked, ${verifiedMatches.length} verified, ${verifiedResults.length} kept`);

    return {
        applied: true,
        results: verifiedResults.length > 0
            ? verifiedResults.slice(0, LEGAL_RESULT_LIMIT)
            : updatedResults.slice(0, LEGAL_RESULT_LIMIT),
        verifiedCount: verifiedMatches.length,
    };
};

const searchBedesten = async ({ query, source, filters = {} }) => {
    const phrase = String(query || '').trim();
    console.log(`[LEGAL_SEARCH] Bedesten search: phrase="${phrase}", source=${source}`);
    const courtTypesOverride =
        Array.isArray(filters?.courtTypesOverride) && filters.courtTypesOverride.length > 0
            ? filters.courtTypesOverride
            : null;

    const toolResponse = await callMcpTool('search_bedesten_unified', {
        phrase,
        court_types: courtTypesOverride || MCP_COURT_TYPES_BY_SOURCE[source] || MCP_COURT_TYPES_BY_SOURCE.all,
        pageNumber: Math.max(1, Number(filters.pageNumber) || 1),
        birimAdi: String(filters.birimAdi || 'ALL').trim() || 'ALL',
        ...(filters.kararTarihiStart ? { kararTarihiStart: filters.kararTarihiStart } : {}),
        ...(filters.kararTarihiEnd ? { kararTarihiEnd: filters.kararTarihiEnd } : {}),
    });

    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : parseMaybeJson(toolResponse.text) || {};
    const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];
    console.log(`[LEGAL_SEARCH] Bedesten returned ${decisions.length} decisions for phrase="${phrase}"`);
    return decisions.map((item, index) => toBedestenDecision(item, index));
};

const searchEmsal = async ({ query, filters = {} }) => {
    const keyword = String(query || '').trim();
    console.log(`[LEGAL_SEARCH] UYAP Emsal search: keyword="${keyword}"`);

    const toolResponse = await callMcpTool('search_emsal_detailed_decisions', {
        keyword,
        ...(filters.kararTarihiStart ? { baslangicTarihi: filters.kararTarihiStart } : {}),
        ...(filters.kararTarihiEnd ? { bitisTarihi: filters.kararTarihiEnd } : {}),
    });

    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : parseMaybeJson(toolResponse.text) || {};
    const results = payload?.data?.data || payload?.data || payload?.decisions || [];
    const decisions = Array.isArray(results) ? results : [];
    console.log(`[LEGAL_SEARCH] UYAP Emsal returned ${decisions.length} decisions for keyword="${keyword}"`);
    return decisions.map((item, index) => toEmsalDecision(item, index));
};

const searchAnayasa = async ({ query }) => {
    const [normResponse, bireyselResponse] = await Promise.all([
        callMcpTool('search_anayasa_unified', {
            decision_type: 'norm_denetimi',
            keywords: [String(query || '').trim()],
            keywords_all: [String(query || '').trim()],
            page_to_fetch: 1,
        }).catch(() => ({ parsed: { decisions: [] }, text: '' })),
        callMcpTool('search_anayasa_unified', {
            decision_type: 'bireysel_basvuru',
            keywords: [String(query || '').trim()],
            page_to_fetch: 1,
        }).catch(() => ({ parsed: { decisions: [] }, text: '' })),
    ]);

    const normPayload = normResponse.parsed && typeof normResponse.parsed === 'object'
        ? normResponse.parsed
        : parseMaybeJson(normResponse.text) || {};
    const bireyselPayload = bireyselResponse.parsed && typeof bireyselResponse.parsed === 'object'
        ? bireyselResponse.parsed
        : parseMaybeJson(bireyselResponse.text) || {};

    const normDecisions = Array.isArray(normPayload?.decisions) ? normPayload.decisions : [];
    const bireyselDecisions = Array.isArray(bireyselPayload?.decisions)
        ? bireyselPayload.decisions
        : [];

    return [
        ...normDecisions.map((item, index) => toAnayasaDecision(item, 'norm_denetimi', index)),
        ...bireyselDecisions.map((item, index) =>
            toAnayasaDecision(item, 'bireysel_basvuru', index)
        ),
    ];
};

const normalizeEmbeddingVector = (values = []) => {
    const vector = Array.isArray(values) ? values.map((value) => Number(value) || 0) : [];
    if (vector.length === 0) return [];

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
        return vector.map(() => 0);
    }

    return vector.map((value) => value / magnitude);
};

const cosineSimilarity = (left = [], right = []) => {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
        return 0;
    }

    const size = Math.min(left.length, right.length);
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
        sum += (Number(left[index]) || 0) * (Number(right[index]) || 0);
    }
    return sum;
};

const embedTextsWithGemini = async (ai, texts = [], taskType = 'RETRIEVAL_DOCUMENT') => {
    const cleanTexts = (Array.isArray(texts) ? texts : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);

    if (!ai || cleanTexts.length === 0) return [];

    const candidateModels = Array.from(new Set([
        LOCAL_GEMINI_EMBED_MODEL,
        'gemini-embedding-001',
    ].filter(Boolean)));

    let lastError = null;
    for (const model of candidateModels) {
        try {
            const response = await ai.models.embedContent({
                model,
                contents: cleanTexts,
                config: {
                    taskType,
                },
            });

            const embeddings = Array.isArray(response?.embeddings) ? response.embeddings : [];
            if (embeddings.length > 0) {
                return embeddings.map((item) => normalizeEmbeddingVector(item?.values || []));
            }
        } catch (error) {
            lastError = error;
            console.warn(`[LEGAL_SEARCH] Gemini embed model failed (${model}):`, error?.message || error);
        }
    }

    throw lastError || new Error('Gemini embedding uretilemedi.');
};

const buildLocalSemanticDocumentText = (item = {}, content = '') => {
    const header = [
        item?.title,
        item?.daire,
        item?.mahkeme,
        item?.esasNo ? `E. ${item.esasNo}` : '',
        item?.kararNo ? `K. ${item.kararNo}` : '',
        item?.tarih ? `T. ${item.tarih}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    const cleanedContent = String(content || '')
        .replace(/[#>*_`|-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, LOCAL_SEMANTIC_DOC_CHAR_LIMIT);

    return [header, cleanedContent].filter(Boolean).join('\n');
};

const searchSemanticBedestenWithGemini = async ({
    initialKeyword = '',
    semanticQuery = '',
    source = 'all',
    filters = {},
    topK = 10,
}) => {
    const ai = getLegalAiClient();
    if (!ai) {
        throw new Error('Gemini anahtari bulunamadigi icin yerel semantik arama calistirilamadi.');
    }

    const semanticSeed = String(initialKeyword || semanticQuery || '').trim();
    const semanticFullQuery = String(semanticQuery || initialKeyword || '').trim();
    const semanticSignals = buildQuerySignals(semanticSeed, semanticFullQuery, {
        searchArea: normalizeSearchArea(filters?.searchArea),
        resolvedSource: normalizeSource(source, 'all'),
    });
    const seedQueries = [
        semanticSeed,
        semanticFullQuery,
        ...buildSearchVariants(semanticSignals, normalizeSource(source, 'all')).slice(0, 3),
    ].filter(Boolean);
    const querySeen = new Set();
    const candidateQueries = [];
    for (const value of seedQueries) {
        const compact = String(value || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeText(compact);
        if (!compact || normalized.length < 4 || querySeen.has(normalized)) continue;
        querySeen.add(normalized);
        candidateQueries.push(compact);
        if (candidateQueries.length >= 4) break;
    }

    const chamberTargets = (semanticSignals.matchedProfileIds || [])
        .flatMap((profileId) => PROFILE_CHAMBER_MAP[profileId] || [])
        .filter(Boolean);
    const searchTasks = [];

    for (const queryText of candidateQueries) {
        if (chamberTargets.length > 0) {
            for (const birimAdi of chamberTargets) {
                searchTasks.push(
                    searchBedesten({
                        query: queryText,
                        source,
                        filters: { ...filters, birimAdi },
                    }).catch(() => [])
                );
            }
            continue;
        }

        searchTasks.push(
            searchBedesten({
                query: queryText,
                source,
                filters,
            }).catch(() => [])
        );
    }

    const candidates = (await Promise.all(searchTasks)).flat();
    const limitedCandidates = dedupeDecisions(candidates).slice(0, LOCAL_SEMANTIC_CANDIDATE_LIMIT);
    const hydrated = [];

    for (const candidate of limitedCandidates) {
        const fallbackText = [
            candidate?.ozet,
            candidate?.snippet,
            candidate?.metadataText,
            candidate?.title,
            candidate?.daire,
            candidate?.mahkeme,
        ]
            .filter(Boolean)
            .join(' ')
            .trim();

        try {
            const payload = await getLegalDocumentViaMcp({
                source: candidate?.source || source,
                documentId: candidate?.documentId || '',
                documentUrl: candidate?.documentUrl || candidate?.sourceUrl || '',
            });
            const content = String(payload?.document?.content || '').trim();
            if (content) {
                hydrated.push({
                    candidate,
                    text: buildLocalSemanticDocumentText(candidate, content),
                });
                continue;
            }
        } catch (error) {
            console.warn('[LEGAL_SEARCH] Local Gemini semantic fetch failed:', error?.message || error);
        }

        if (fallbackText) {
            hydrated.push({
                candidate,
                text: buildLocalSemanticDocumentText(candidate, fallbackText),
            });
        }
    }

    if (hydrated.length === 0) {
        throw new Error('Yerel Gemini semantik arama icin yeterli karar metni alinmadi.');
    }

    const [queryEmbeddings, documentEmbeddings] = await Promise.all([
        embedTextsWithGemini(ai, [String(semanticQuery || initialKeyword || '').trim()], 'RETRIEVAL_QUERY'),
        embedTextsWithGemini(ai, hydrated.map((item) => item.text), 'RETRIEVAL_DOCUMENT'),
    ]);

    const queryVector = queryEmbeddings[0] || [];
    if (queryVector.length === 0) {
        throw new Error('Gemini semantik sorgu embedding olusturulamadi.');
    }

    return hydrated
        .map((item, index) => {
            const similarity = cosineSimilarity(queryVector, documentEmbeddings[index] || []);
            const score = clampScore(similarity * 100);
            return {
                ...item.candidate,
                semanticProvider: 'local-gemini',
                semanticRawScore: score,
                relevanceScore: Math.max(Number(item.candidate?.relevanceScore || 0), score),
                matchReason: `Yerel Gemini semantik eslesme skoru: ${score}/100`,
            };
        })
        .sort((left, right) => Number(right.semanticRawScore || 0) - Number(left.semanticRawScore || 0))
        .slice(0, Math.max(1, Math.min(20, Number(topK) || 10)));
};

const searchSemanticBedesten = async ({
    initialKeyword = '',
    semanticQuery = '',
    source = 'all',
    filters = {},
    topK = 10,
}) => {
    const semanticToolAvailable = await hasMcpTool('search_bedesten_semantic').catch(() => false);

    if (!semanticToolAvailable) {
        console.warn(`[LEGAL_SEARCH] search_bedesten_semantic is unavailable on ${normalizeMcpUrl()}; falling back to local Gemini semantic rerank.`);
        return searchSemanticBedestenWithGemini({
            initialKeyword,
            semanticQuery,
            source,
            filters,
            topK,
        });
    }

    const courtTypesOverride =
        Array.isArray(filters?.courtTypesOverride) && filters.courtTypesOverride.length > 0
            ? filters.courtTypesOverride
            : null;
    const toolResponse = await callMcpTool('search_bedesten_semantic', {
        initial_keyword: String(initialKeyword || '').trim(),
        query: String(semanticQuery || initialKeyword || '').trim(),
        court_types: courtTypesOverride || MCP_COURT_TYPES_BY_SOURCE[source] || MCP_COURT_TYPES_BY_SOURCE.all,
        top_k: Math.max(1, Math.min(20, Number(topK) || 10)),
    });

    console.log(`[LEGAL_SEARCH] search_bedesten_semantic called for "${String(semanticQuery).slice(0, 30)}..."`);
    console.log(`[LEGAL_SEARCH] search_bedesten_semantic response:`, String(toolResponse.text).slice(0, 500));

    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : parseMaybeJson(toolResponse.text) || {};
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.map((item, index) => toSemanticBedestenDecision(item, index));
};
export const getLegalSources = () => ({ sources: LEGAL_SOURCE_OPTIONS });

const shouldUseAiPhraseExtraction = (queryText = '') => {
    const normalized = String(queryText || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const tokenCount = normalizeText(normalized).split(' ').filter(Boolean).length;
    const hasSentenceMarkers = /[,:;.!?]/.test(normalized);
    return normalized.length >= 220 || tokenCount >= 28 || (normalized.length >= 140 && hasSentenceMarkers);
};

const buildAiKeywordQuery = (phrases = [], fallbackQuery = '') => {
    const ordered = [];
    const seen = new Set();
    for (const phrase of Array.isArray(phrases) ? phrases : []) {
        const compact = String(phrase || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeText(compact);
        if (!compact || compact.length < 4 || seen.has(normalized)) continue;
        seen.add(normalized);
        ordered.push(compact);
        if (ordered.length >= 3) break;
    }

    const merged = ordered.join(' ').trim();
    if (merged.length >= 12) {
        return merged.slice(0, 96).trim();
    }

    return String(fallbackQuery || '').replace(/\s+/g, ' ').trim();
};

export const extractSearchPhrasesWithAI = async (queryText) => {
    try {
        const ai = getLegalAiClient();
        if (!ai) {
            console.log('[LEGAL_SEARCH] GEMINI_API_KEY/VITE_GEMINI_API_KEY is missing, skipping AI phrase extraction.');
            return [];
        }

        console.log(`[LEGAL_SEARCH] Extracting semantic phrases with Gemini for long query: "${String(queryText).slice(0, 50)}..."`);

        const prompt = `Sen Turk hukukunda emsal karar aramasi icin anahtar ifade cikarim uzmansin.
Gorev: Asagidaki metinden yuksek yargi kararlarinda gecme ihtimali yuksek, hukuken guclu ve arama icin yararli 10 ifade cikar.
Kurallar:
- Sadece ifade ver, aciklama verme.
- Her ifadeyi yeni satira yaz.
- Kisi adi, sirket adi, koy/mahalle/ada/parsel, tarih, dosya no, rakam agirlikli detaylari alma.
- Olay hikayesini degil hukuki cekirdegi cikar.
- Dava turu, hukuki kurum, resmi islem, sucta tip, koruma tedbiri, idari islem, sozlesme tipi gibi ifadeleri tercih et.
- Su dallarin hepsini dusun: ceza, is hukuku, icra, aile, ticaret, genel hukuk, idare, vergi, imar, anayasa, istinaf.
- MÃƒÂ¼mkÃƒÂ¼nse karar diline yakin resmi ifadeler kullan: or. "yapi tatil tutanagi", "nitelikli dolandiricilik", "feshin gecersizligi", "itirazin iptali", "genel kurul iptali", "velayet", "tebligat usulsuzlugu".
- Tek kelime verme; mumkun oldugunca 2-5 kelimelik hukuki ifade ver.

Metin:
"${queryText}"`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.1,
            }
        });

        const resultText = response.text || '';
        const phrases = resultText
            .split('\n')
            .map(line => line.replace(/^[-\*0-9.\s]+/, '').trim().toLowerCase())
            .filter(line => line.length >= 4 && line.includes(' '));

        console.log(`[LEGAL_SEARCH] Gemini extracted phrases:`, phrases);
        return phrases.slice(0, 10);
    } catch (e) {
        console.error('[LEGAL_SEARCH] Error extracting AI phrases:', e.message);
        return [];
    }
};

const shouldUseAiSearchPlanner = (queryText = '', requestedSource = 'all') => {
    const normalized = String(queryText || '').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length < AI_SEARCH_PLAN_MIN_LENGTH) return false;
    const tokenCount = normalizeText(normalized).split(' ').filter(Boolean).length;
    if (normalizeSource(requestedSource, 'all') === 'all') return true;
    return tokenCount >= 6 || normalized.length >= 60;
};

const normalizeAiDomainToProfiles = (domain = '') => {
    const normalized = normalizeText(domain);
    if (!normalized) return [];
    if (normalized.includes('is hukuku') || normalized.includes('is_hukuku')) return ['is_hukuku', 'hukuk'];
    if (normalized.includes('ceza')) return ['ceza'];
    if (normalized.includes('anayasa')) return ['anayasa'];
    if (normalized.includes('istinaf')) return ['istinaf'];
    if (normalized.includes('idare') || normalized.includes('danistay') || normalized.includes('vergi')) return ['idare'];
    if (normalized.includes('hukuk')) return ['hukuk'];
    return [];
};

const normalizeAiSubdomainToProfiles = (subdomain = '') => {
    const normalized = normalizeText(subdomain);
    if (!normalized) return [];
    for (const [key, profiles] of Object.entries(AI_SUBDOMAIN_PROFILES)) {
        if (normalized === normalizeText(key) || normalized.includes(normalizeText(key))) {
            return Array.isArray(profiles) ? profiles : [];
        }
    }
    return [];
};

const planSearchWithAI = async (queryText = '', requestedSource = 'all') => {
    try {
        const ai = getLegalAiClient();
        if (!ai || !shouldUseAiSearchPlanner(queryText, requestedSource)) {
            return null;
        }

        const prompt = `Sen Turk hukukunda emsal karar aramasi yapan uzman bir arama planlayicisisin. Yalnizca gecerli JSON don.
Gorevin: uzun veya daginik kullanici metnini, hukuki cekirdege indirgemek ve en dogru yargi kolunu secmek.
Kurallar:
- source sadece "yargitay", "danistay", "uyap", "anayasa", "all"
- domain sadece "ceza", "hukuk", "is_hukuku", "idare", "anayasa", "istinaf", "karma"
- subdomain sadece su listeden biri olsun: "icra", "aile", "ticaret", "tuketici", "miras", "gayrimenkul", "vergi", "imar", "disiplin", "ihale", "uyusturucu", "hakaret", "dolandiricilik", "is_ise_iade", "is_alacak", "none"
- shortQuery en fazla 14 kelime olsun
- keywordPhrases en fazla 10 adet olsun
- Kisi adi, sirket adi, adres, ada/parsel, tarih, belge no gibi detaylari shortQuery'ye alma.
- Olay hikayesini degil dava turunu, hukuki kurumu, resmi islemi veya suc tipini one cikar.
- Metinde bulunmayan yeni bir hukuki iddia, suc vasfi veya talep uretme. Sadece metinde acikca bulunan veya cok yakin hukuki es anlamli karsiliklari kullan.
- Ceza / tck / sanik / tutuklama / uyusturucu / dolandiricilik agirlikli sorgularda source genelde yargitay veya uyap sec.
- Is hukuku / ise iade / kidem / ihbar / fazla mesai agirlikli sorgularda source genelde yargitay sec.
- Aile / bosanma / velayet / nafaka / ziynet agirlikli sorgularda source genelde yargitay sec.
- Ticaret / asliye ticaret / genel kurul / anonim sirket / cek / bono / konkordato agirlikli sorgularda source genelde yargitay sec.
- Icra / itirazin iptali / menfi tespit / haczedilmezlik / istirdat agirlikli sorgularda source genelde yargitay veya uyap sec.
- Idari / vergi / imar / ruhsat / yikim / encumen / disiplin / ihale sorgularinda source genelde danistay sec.
- "sahte fatura", "KDV indirimi", "tarhiyat", "vergi ziyai" geciyorsa bunu ticaret degil vergi/idare olarak yorumla; source genelde danistay sec.
- "universite ogrencisi", "yuksekogretim", "ogrenci disiplin cezasi" geciyorsa bunu idare/disiplin olarak yorumla; source genelde danistay sec.
- "kamulastirmasiz el atma" sorgularinda gorev ayrimi karisabilir: imar plani, kamu hizmeti, idari yargi, hukuki el atma sinyali varsa danistay; sadece bedel/tazminat odakliysa ve ayrim net degilse source all sec.
- Hak ihlali / bireysel basvuru / anayasa mahkemesi sorgularinda source anayasa sec.
- Istinaf usulu / BAM / bolge adliye agirlikli sorgularda domain istinaf sec; source gerekirse all olabilir.
- Emin degilsen source all sec.
- shortQuery karar aramada gecmesi muhtemel resmi hukuki ifadelerden kurulsun.

JSON:
{
  "source": "yargitay|danistay|uyap|anayasa|all",
  "domain": "ceza|hukuk|is_hukuku|idare|anayasa|istinaf|karma",
  "subdomain": "icra|aile|ticaret|tuketici|miras|gayrimenkul|vergi|imar|disiplin|ihale|uyusturucu|hakaret|dolandiricilik|is_ise_iade|is_alacak|none",
  "shortQuery": "kisa arama sorgusu",
  "keywordPhrases": ["ifade 1", "ifade 2", "ifade 3"],
  "reason": "kisa aciklama"
}

Sorgu:
"""${String(queryText || '').trim()}"""`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.1,
            },
        });

        const parsed = parseMaybeJson(response.text || '');
        if (!parsed || typeof parsed !== 'object') return null;

        return {
            source: normalizeSource(parsed.source, 'all'),
            domain: String(parsed.domain || '').trim(),
            subdomain: String(parsed.subdomain || '').trim(),
            shortQuery: String(parsed.shortQuery || '').replace(/\s+/g, ' ').trim(),
            keywordPhrases: Array.isArray(parsed.keywordPhrases)
                ? parsed.keywordPhrases
                    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean)
                    .slice(0, 10)
                : [],
            reason: String(parsed.reason || '').trim(),
        };
    } catch (error) {
        console.error('[LEGAL_SEARCH] Error planning search with AI:', error?.message || error);
        return null;
    }
};

export const searchLegalDecisionsViaMcp = async ({
    source = 'all',
    keyword = '',
    rawQuery = '',
    filters = {},
} = {}) => {
    let resolvedSource = normalizeSource(source, 'all');
    const originalQuery = String(keyword || rawQuery || '').trim();
    const fullQuery = String(rawQuery || keyword || '').trim();
    let query = originalQuery;
    const searchArea = normalizeSearchArea(filters?.searchArea);
    const effectiveFilters = { ...(filters || {}) };
    let forcedProfiles = [];
    let aiPlan = null;
    let aiExtractedPhrases = [];

    console.log(`[LEGAL_SEARCH] === Search Start ===`);
    console.log(`[LEGAL_SEARCH] source=${resolvedSource}, keyword="${keyword}", rawQuery="${rawQuery}"`);
    console.log(`[LEGAL_SEARCH] query="${query}", fullQuery="${fullQuery}"`);

    if (query.length < 2) {
        const error = new Error('Arama kelimesi en az 2 karakter olmalidir.');
        error.status = 400;
        throw error;
    }

    const cacheKey = buildCacheKey('search', {
        source: resolvedSource,
        query,
        rawQuery: fullQuery,
        filters,
    });
    const cached = getCacheEntry(SEARCH_CACHE, cacheKey, SEARCH_CACHE_TTL_MS);
    if (cached) return cached;

    const warningParts = [];

    if (searchArea !== 'auto' && SEARCH_AREA_CONFIG[searchArea]) {
        const areaConfig = SEARCH_AREA_CONFIG[searchArea];
        forcedProfiles = [...areaConfig.forcedProfiles];
        if (resolvedSource === 'all') {
            resolvedSource = areaConfig.targetSources[0] || resolvedSource;
        }
        if (Array.isArray(areaConfig.courtTypes) && areaConfig.courtTypes.length > 0) {
            effectiveFilters.courtTypesOverride = areaConfig.courtTypes;
        }
        warningParts.push(`Arama alani kullanici secimi ile sinirlandi: ${searchArea}.`);
    } else {
        aiPlan = await planSearchWithAI(fullQuery, resolvedSource);
        if (aiPlan?.source && resolvedSource === 'all' && aiPlan.source !== 'all') {
            resolvedSource = aiPlan.source;
        }
        forcedProfiles = Array.from(new Set([
            ...normalizeAiDomainToProfiles(aiPlan?.domain || ''),
            ...normalizeAiSubdomainToProfiles(aiPlan?.subdomain || ''),
        ]));
        aiExtractedPhrases = Array.isArray(aiPlan?.keywordPhrases) ? aiPlan.keywordPhrases : [];

        if (aiExtractedPhrases.length === 0 && shouldUseAiPhraseExtraction(fullQuery)) {
            aiExtractedPhrases = await extractSearchPhrasesWithAI(fullQuery);
        }

        const aiKeywordQuery = buildAiKeywordQuery(
            aiExtractedPhrases,
            String(aiPlan?.shortQuery || query || '').trim()
        );
        if (aiKeywordQuery && normalizeText(aiKeywordQuery) !== normalizeText(query)) {
            query = aiKeywordQuery;
            warningParts.push('Sorgu AI ile arama odakli anahtar ifadelere indirgenerek arandi.');
            console.log(`[LEGAL_SEARCH] AI keyword query="${query}"`);
        }
        if (aiPlan?.reason) {
            warningParts.push(`AI plan: ${aiPlan.reason}`);
        }
    }

    const signals = buildQuerySignals(query, fullQuery, {
        forcedProfiles,
        lockProfiles: searchArea !== 'auto',
        searchArea,
        resolvedSource,
    });
    if (searchArea === 'auto') {
        const adjustedSource = reconcileResolvedSourceWithSignals(resolvedSource, signals, fullQuery);
        if (adjustedSource !== resolvedSource) {
            resolvedSource = adjustedSource;
            warningParts.push(`Kaynak sinyallere gore yeniden dengelendi: ${resolvedSource}.`);
        }
    }
    if (aiExtractedPhrases.length > 0) {
        signals.aiPhrases = aiExtractedPhrases.slice(0, 8);
    }
    const decisionGroups = await searchByResolvedSource({
        resolvedSource,
        query,
        filters: effectiveFilters,
        warningParts,
        signals,
    });
    let rawResults = applySearchAreaFilters(decisionGroups.flat(), searchArea);
    console.log(`[LEGAL_SEARCH] Raw results from sources: ${rawResults.length} (Bedesten+UYAP+etc.)`);
    let scoredResults = scoreDecisionResults(rawResults, signals);
    console.log(`[LEGAL_SEARCH] After scoring: ${scoredResults.length} results, top score: ${scoredResults[0]?.relevanceScore || 0}, sources: ${[...new Set(scoredResults.map(r => r.source))].join(',')}`);

    const topScore = Number(scoredResults[0]?.relevanceScore || 0);
    const variantQueries = buildSearchVariants(signals, resolvedSource).slice(0, 4);

    if (topScore < 18 && variantQueries.length > 0) {
        const variantGroups = await Promise.all(
            variantQueries.map((variantQuery) =>
                searchByResolvedSource({
                    resolvedSource,
                    query: variantQuery,
                    filters: effectiveFilters,
                    warningParts,
                    signals,
                }).then((groups) => groups.flat())
            )
        );
        rawResults = dedupeDecisions([...rawResults, ...variantGroups.flat()]);
        rawResults = applySearchAreaFilters(rawResults, searchArea);
        scoredResults = scoreDecisionResults(rawResults, signals);
        warningParts.push('Anahtar ifade varyantlariyla ek MCP aramasi yapildi.');
    }

    const postVariantTopScore = Number(scoredResults[0]?.relevanceScore || 0);
    const semanticTriggerScore = getSemanticTriggerScore(signals, resolvedSource);
    if (
        USE_MCP_SEMANTIC_SEARCH &&
        resolvedSource !== 'anayasa' &&
        postVariantTopScore < semanticTriggerScore
    ) {
        try {
            const semanticResults = await searchSemanticBedesten({
                initialKeyword: query,
                semanticQuery: fullQuery,
                source: resolvedSource,
                filters: effectiveFilters,
                topK: Math.min(LEGAL_RESULT_LIMIT, 12),
            });

            if (semanticResults.length > 0) {
                rawResults = mergeSemanticResults(rawResults, semanticResults);
                rawResults = applySearchAreaFilters(rawResults, searchArea);
                scoredResults = scoreDecisionResults(rawResults, signals);
                const usedLocalSemantic = semanticResults.some((item) => item?.semanticProvider === 'local-gemini');
                warningParts.push(
                    usedLocalSemantic
                        ? 'Yerel Gemini semantik arama ile ek adaylar toplandi.'
                        : 'MCP semantik arama ile ek adaylar toplandi.'
                );
            }
        } catch (error) {
            warningParts.push(error?.message || 'MCP semantik aramasi kullanilamadi.');
        }
    }

    let normalizedResults = scoredResults;
    let contentVerified = false;

    if (shouldRerankByContent(scoredResults, signals)) {
        console.log(`[LEGAL_SEARCH] Content rerank triggered (${scoredResults.length} candidates)`);
        const reranked = await rerankResultsByDocumentContent({
            results: scoredResults,
            signals,
            resolvedSource,
        });

        if (reranked.applied) {
            normalizedResults = reranked.results;
            contentVerified = true;
            console.log(`[LEGAL_SEARCH] Content rerank applied: ${reranked.verifiedCount} verified matches`);
            warningParts.push(
                `Sonuclar tam metin dogrulamasi ile yeniden siralandi (${reranked.verifiedCount} karar).`
            );
        } else {
            console.log(`[LEGAL_SEARCH] Content rerank NOT applied (no verified matches)`);
        }
    } else {
        console.log(`[LEGAL_SEARCH] Content rerank skipped`);
    }

    // Profil filtresi (daire/mahkeme/baslik tabanli heuristik filtreleme):
    // Eger sonuclar zaten metin analizi ile dogrulandiysa (contentVerified=true),
    // heuristik filtrelemeye gerek yoktur, dogrulanmis sonuclar kesindir. (SKIP)
    normalizedResults = applyProfileSpecificFilters(normalizedResults, signals, { contentVerified });
    normalizedResults = applySearchAreaFilters(normalizedResults, searchArea).slice(0, LEGAL_RESULT_LIMIT);

    const hasVerifiedTopicalMatch = normalizedResults.some((item) => {
        const reason = String(item?.matchReason || '').trim();
        return reason && reason !== 'MCP arama sonucu' && Number(item?.relevanceScore || 0) >= 24;
    });

    if (normalizedResults.length > 0 && !hasVerifiedTopicalMatch) {
        warningParts.push('Sonuclar arasinda guclu konu eslesmesi bulunamadi. Sonuclar referans amacli gosteriliyor.');
    }

    const resultBuckets = buildBuckets(normalizedResults);
    const responsePayload = {
        success: true,
        source: resolvedSource,
        provider: 'yargi-mcp',
        keyword: query,
        originalKeyword: originalQuery,
        aiExtractedPhrases,
        results: resultBuckets.combined,
        resultBuckets,
        warningParts: Array.from(new Set(warningParts)).filter(Boolean),
        routing: {
            requestedSource: normalizeSource(source, 'all'),
            resolvedSource,
            usedSource: resolvedSource,
            searchArea,
            aiPlan,
        },
    };

    if (responsePayload.warningParts.length > 0) {
        responsePayload.warning = responsePayload.warningParts.join(' ');
    }

    setCacheEntry(SEARCH_CACHE, cacheKey, responsePayload);
    return responsePayload;
};

export const getLegalDocumentViaMcp = async ({
    source = 'all',
    documentId = '',
    documentUrl = '',
} = {}) => {
    const resolvedSource = normalizeSource(source, 'all');
    const safeDocumentId = String(documentId || '').trim();
    const safeDocumentUrl = String(documentUrl || '').trim();

    if (!safeDocumentId && !safeDocumentUrl) {
        const error = new Error('documentId veya documentUrl gereklidir.');
        error.status = 400;
        throw error;
    }

    if (safeDocumentId && SYNTHETIC_DOCUMENT_ID_REGEX.test(safeDocumentId)) {
        const error = new Error('Sadece MCP kaynakli documentId ile karar metni getirilebilir.');
        error.status = 400;
        throw error;
    }

    const cacheKey = buildCacheKey('document', {
        source: resolvedSource,
        documentId: safeDocumentId,
        documentUrl: safeDocumentUrl,
    });
    const cached = getCacheEntry(DOCUMENT_CACHE, cacheKey, DOCUMENT_CACHE_TTL_MS);
    if (cached) return cached;

    let toolName = '';
    let toolArgs = {};

    if (resolvedSource === 'uyap') {
        toolName = 'get_emsal_document_markdown';
        toolArgs = { id: safeDocumentId };
    } else if (resolvedSource === 'anayasa') {
        toolName = 'get_anayasa_document_unified';
        toolArgs = {
            document_url: safeDocumentUrl,
            page_number: 1,
        };
    } else {
        toolName = 'get_bedesten_document_markdown';
        toolArgs = { documentId: safeDocumentId };
    }

    const toolResponse = await callMcpTool(toolName, toolArgs);
    const payload = toolResponse.parsed && typeof toolResponse.parsed === 'object'
        ? toolResponse.parsed
        : parseMaybeJson(toolResponse.text) || {};

    const contentCandidates = [
        payload?.markdown_content,
        payload?.markdown_chunk,
        payload?.content,
        payload?.text,
        toolResponse.text,
    ];
    const content = contentCandidates.find(
        (value) => typeof value === 'string' && value.trim().length > 0
    );

    if (!content) {
        const error = new Error('MCP kaynaginda karar metni bulunamadi.');
        error.status = 404;
        throw error;
    }

    const responsePayload = {
        success: true,
        source: resolvedSource,
        provider: 'yargi-mcp',
        document: {
            content: String(content).trim(),
            mimeType: 'text/markdown',
            documentId: safeDocumentId,
            documentUrl: safeDocumentUrl || payload?.source_url || '',
        },
    };

    setCacheEntry(DOCUMENT_CACHE, cacheKey, responsePayload, 500);
    return responsePayload;
};












