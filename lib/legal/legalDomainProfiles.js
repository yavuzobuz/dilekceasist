const DOMAIN_IDS = [
    'is_hukuku',
    'ceza',
    'idare',
    'icra',
    'vergi',
    'anayasa',
    'aile',
    'ticaret',
    'miras',
    'tuketici',
    'sigorta',
    'gayrimenkul',
    'borclar',
    'genel_hukuk',
];

export const DEFAULT_DOMAIN_PROFILE_ID = 'genel_hukuk';

export const normalizeDisplayText = (value = '') =>
    String(value || '').replace(/\s+/g, ' ').trim();

export const normalizeMatchText = (value = '') =>
    normalizeDisplayText(value)
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const toAsciiSearchText = (value = '') => normalizeMatchText(value);

const canonicalAliasMap = (pairs = {}) => {
    const mapped = {};
    Object.entries(pairs).forEach(([key, values]) => {
        mapped[normalizeMatchText(key)] = Array.isArray(values) ? values : [];
    });
    return mapped;
};

export const LEGAL_DOMAIN_PROFILES = {
    is_hukuku: {
        id: 'is_hukuku',
        label: 'İş Hukuku',
        primarySources: ['yargitay'],
        secondarySources: ['uyap'],
        preferredBirimCodes: ['H9', 'H22', 'HGK'],
        canonicalConcepts: [
            'işe iade', 'iş sözleşmesi', 'haklı fesih', 'geçersiz fesih',
            'kıdem tazminatı', 'ihbar tazminatı', 'fazla mesai', 'işçilik alacağı',
            'yıllık izin ücreti', 'hafta tatili', 'ulusal bayram genel tatil',
            'mobbing', 'hizmet tespiti', 'sendikal tazminat',
            'iş kazası', 'meslek hastalığı', 'iş güvencesi', 'feshin geçersizliği',
            'alt işveren', 'asıl işveren', 'belirli süreli iş sözleşmesi',
            'toplu iş sözleşmesi', 'grev', 'lokavt', 'eşit davranma ilkesi',
            'asgari ücret', 'ücret alacağı', 'prim alacağı', 'ikramiye',
            'iş sağlığı ve güvenliği', 'işçi tazminatı', 'destekten yoksun kalma',
        ],
        turkishAliases: canonicalAliasMap({
            'işe iade': ['işe başlatmama', 'boşta geçen süre', 'geçersiz fesih', 'iş güvencesi', 'feshin geçersizliği davası', 'İK m.20', 'İK m.21', 'işe iade davası', 'iş mahkemesi'],
            'iş sözleşmesi': ['iş akdi', 'hizmet sözleşmesi', 'çalışma sözleşmesi', 'iş kontratı', 'belirsiz süreli iş sözleşmesi', 'kısmi süreli çalışma', 'deneme süresi', 'alt işveren sözleşmesi', 'mevsimlik iş sözleşmesi'],
            'haklı fesih': ['derhal fesih', 'işçi feshi', 'bildirimsiz fesih', 'İK 25', 'İK m.24', 'İK m.25', 'ahlak ve iyiniyet kurallarına aykırılık', 'zorlayıcı neden', 'sağlık nedeniyle fesih'],
            'geçersiz fesih': ['usulsüz fesih', 'İK 18', 'İK 20', 'İK 21'],
            'kıdem tazminatı': ['kıdem', 'kıdem alacağı', '1475 sayılı kanun', '30 günlük brüt ücret', 'çalışma süresi hesabı', 'kıdem tazminatı tavanı', 'emeklilik nedeniyle kıdem'],
            'ihbar tazminatı': ['ihbar', 'bildirim süresi', 'ihbar öneli', 'ihbar süreleri', '2 haftalık ihbar', '4 haftalık ihbar', '6 haftalık ihbar', '8 haftalık ihbar'],
            'fazla mesai': ['fazla çalışma', 'fazla çalışma ücreti', 'haftalık 45 saat', 'haftalık 45 saati aşan çalışma', 'gece çalışması', 'denkleştirme süresi', 'fazla sürelerle çalışma'],
            'işçilik alacağı': ['ücret alacağı', 'işçi alacağı', 'bakiye alacak', 'brüt ücret', 'net ücret', 'asgari geçim indirimi', 'AGİ', 'ücret hesaplama'],
            'yıllık izin ücreti': ['kullanılmayan izin', 'izin ücreti', 'izin alacağı'],
            'ulusal bayram genel tatil': ['ubgt', 'genel tatil ücreti', 'resmi tatil ücreti'],
            'hizmet tespiti': ['sigortasız çalışma', 'hizmet tespiti davası', 'kayıt dışı çalışma', 'SGK prim borcu', 'geriye dönük sigortalılık', '5510 sayılı kanun'],
            'mobbing': ['psikolojik taciz', 'işyerinde bezdirme', 'yıldırma', 'işyerinde psikolojik şiddet', 'iş yerinde yıldırma', 'sistematik baskı', 'performans baskısı'],
            'iş kazası': ['iş kazası tazminatı', 'kusur tespiti', 'işveren sorumluluğu', 'İSG ihlali', '6331 sayılı kanun', 'iş güvenliği uzmanı', 'risk değerlendirmesi', 'SGK bildirimi', 'iş kazası tespit davası'],
            'meslek hastalığı': ['meslek hastalığı tespit', 'iş göremezlik', 'maluliyet raporu', 'çalışma gücü kaybı', 'SGK iş göremezlik ödeneği'],
            'alt işveren': ['taşeron', 'alt işveren ilişkisi', 'muvazaalı alt işverenlik', 'müşterek ve müteselsil sorumluluk', 'asıl işveren-alt işveren ilişkisi'],
            'toplu iş sözleşmesi': ['TİS', 'sendika', 'grev hakkı', 'toplu sözleşme yetkisi', 'grev oylaması', 'arabuluculuk'],
            'destekten yoksun kalma': ['destek tazminatı', 'ölümlü iş kazası', 'hesaplama yöntemi', 'aktüer raporu', 'PMF tablosu', 'TBK 53', 'destek tazminatı hesabı', 'TRH tablosu', 'bilinen dönem', 'bilinmeyen dönem'],
            'belirli süreli iş sözleşmesi': ['zincirleme sözleşme', 'süreli sözleşme', 'esaslı neden', 'süre bitimi', 'yenileme'],
            'eşit davranma ilkesi': ['ayrımcılık yasağı', 'eşit işe eşit ücret', 'cinsiyet ayrımcılığı', 'ırk ayrımcılığı', 'engelli ayrımcılığı', 'yaş ayrımcılığı'],
        }),
        asciiAliases: canonicalAliasMap({
            'işe iade': ['ise iade', 'ise baslatmama', 'feshin geçersizliği davası', 'İK m.20', 'İK m.21', 'işe iade davası', 'iş mahkemesi'],
            'iş sözleşmesi': ['is sozlesmesi', 'is akdi', 'belirsiz süreli iş sözleşmesi', 'kısmi süreli çalışma', 'deneme süresi', 'alt işveren sözleşmesi', 'mevsimlik iş sözleşmesi'],
            'haklı fesih': ['hakli fesih', 'İK m.24', 'İK m.25', 'ahlak ve iyiniyet kurallarına aykırılık', 'zorlayıcı neden', 'sağlık nedeniyle fesih'],
            'kıdem tazminatı': ['kidem tazminati', '30 günlük brüt ücret', 'çalışma süresi hesabı', 'kıdem tazminatı tavanı', 'emeklilik nedeniyle kıdem'],
            'ihbar tazminatı': ['ihbar tazminati', 'ihbar süreleri', '2 haftalık ihbar', '4 haftalık ihbar', '6 haftalık ihbar', '8 haftalık ihbar'],
            'fazla mesai': ['fazla mesai', 'fazla calisma', 'haftalık 45 saati aşan çalışma', 'gece çalışması', 'denkleştirme süresi', 'fazla sürelerle çalışma'],
            'yıllık izin ücreti': ['yillik izin ucreti'],
            'ulusal bayram genel tatil': ['ubgt', 'genel tatil ucreti'],
            'hizmet tespiti': ['hizmet tespiti', 'sigortasiz calisma', 'SGK prim borcu', 'geriye dönük sigortalılık', '5510 sayılı kanun'],
            'iş kazası': ['is kazasi', 'is kazasi tazminati', '6331 sayılı kanun', 'iş güvenliği uzmanı', 'risk değerlendirmesi', 'SGK bildirimi', 'iş kazası tespit davası'],
            'meslek hastalığı': ['meslek hastaligi', 'maluliyet raporu', 'çalışma gücü kaybı', 'SGK iş göremezlik ödeneği'],
            'alt işveren': ['alt isveren', 'taseron', 'müşterek ve müteselsil sorumluluk', 'asıl işveren-alt işveren ilişkisi'],
            'toplu iş sözleşmesi': ['toplu is sozlesmesi', 'toplu sözleşme yetkisi', 'grev oylaması', 'arabuluculuk'],
            'destekten yoksun kalma': ['destekten yoksun kalma', 'hesaplama yöntemi', 'aktüer raporu', 'PMF tablosu', 'TBK 53', 'destek tazminatı hesabı', 'TRH tablosu', 'bilinen dönem', 'bilinmeyen dönem'],
            'eşit davranma ilkesi': ['esit davranma ilkesi', 'cinsiyet ayrımcılığı', 'ırk ayrımcılığı', 'engelli ayrımcılığı', 'yaş ayrımcılığı'],
            'sendikal tazminat': ['sendikal tazminat', 'sendika üyeliği güvencesi', '6356 sayılı kanun', 'sendikal ayrımcılık'],
        }),
        negativeMarkers: ['bireysel başvuru', 'hak ihlali', 'anayasa mahkemesi', 'ceza genel kurulu'],
        queryTemplates: ['{required}', '{required} {support}', '"{required}" {support}'],
    },
    ceza: {
        id: 'ceza',
        label: 'Ceza',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['CGK'],
        canonicalConcepts: [
            'uyuşturucu madde',
            'kullanmak için bulundurma',
            'uyuşturucu madde ticareti',
            'haksız tahrik',
            'kasten yaralama',
            'kasten öldürme',
            'arama kararı',
            'hukuka aykırı delil',
            'tutuklama',
            'şüpheden sanık yararlanır',
            'nitelikli dolandırıcılık',
            'kamu görevlisine hakaret',
            'taksirle yaralama',
            'tıbbi malpraktis',
            'organ kaybı',
            'bilişim suçu',
            'kişisel verileri hukuka aykırı ele geçirme',
            'şantaj',
            'özel hayatın gizliliğini ihlal',
            'terör örgütü propagandası',
            'basın özgürlüğü',
            'ifade özgürlüğü',
        ],
        turkishAliases: canonicalAliasMap({
            'uyuşturucu madde ticareti': ['satış bedeli', 'hassas terazi', 'paketlenmiş satış materyali'],
            'kullanmak için bulundurma': ['kullanma sınırı', 'kişisel kullanım', 'TCK 191', 'denetimli serbestlik', 'tedavi ve denetimli serbestlik'],
            'arama kararı': ['konutta arama', 'arama işlemi', 'CMK 116', 'CMK 119', 'adli arama', 'önleme araması', 'araç araması'],
            'hukuka aykırı delil': ['hukuka aykırı arama', 'yasak delil', 'özel hayatın gizliliği', 'telefon kaydı', 'gizli dinleme', 'usulsüz arama', 'CMK 206'],
            'nitelikli dolandırıcılık': ['internet ilan dolandırıcılığı', 'sahte ilan', 'dolandırıcılık', 'TCK 158', 'bilişim dolandırıcılığı', 'kredi kartı dolandırıcılığı', 'telefon dolandırıcılığı'],
            'kamu görevlisine hakaret': ['hakaret', 'görevi nedeniyle hakaret'],
            'taksirle yaralama': ['tıbbi hata', 'hekim kusuru', 'komplikasyon', 'malpraktis', 'TCK 89', 'trafik kazası ceza', 'bilinçli taksir', 'taksirle ölüme neden olma'],
            'tıbbi malpraktis': ['hatalı ameliyat', 'cerrahi hata', 'doktor hatası', 'tıbbi müdahale', 'hekim sorumluluğu', 'ameliyat hatası', 'tanı hatası', 'tedavi hatası', 'aydınlatılmış onam'],
            'organ kaybı': ['organ kaybı', 'uzuv kaybı', 'uzuv kaybı', 'fonksiyon kaybı', 'ağır cezayı gerektiren nitelikli hal'],
            'bilişim suçu': ['bilişim sistemine girme', 'yetkisiz erişim', 'veri hırsızlığı', 'TCK 243', 'TCK 244', 'TCK 245', 'kredi kartı kopyalama', 'phishing', 'fidye yazılımı'],
            'kişisel verileri hukuka aykırı ele geçirme': ['KVKK', 'veri ihlali', 'kişisel veri', 'TCK 136', 'veri sızıntısı', 'telefon dinleme', 'gizli kamera'],
            'şantaj': ['tehdit', 'para koparmak', 'TCK 107', 'zorla senet imzalatma', 'tehditle para isteme'],
            'terör örgütü propagandası': ['TMK 7/2', 'terör propagandası', 'TCK 314', 'TMK 7/2', 'örgüt üyeliği', 'örgüte yardım etme', 'silahlı terör örgütü'],
            'basın özgürlüğü': ['gazetecilik', 'haber verme hakkı', 'araştırmacı gazeteci', '5187 sayılı kanun', 'haber verme hakkı', 'eleştiri hakkı', 'kamu yararı', 'basın kartı'],
            'ifade özgürlüğü': ['düşünce açıklama', 'AİHS 10', 'Anayasa m.26', 'AİHS m.10', 'düşünce açıklama hakkı', 'sosyal medya paylaşımı', 'internet sansürü', 'sosyal medya engelleme', 'web sitesi erişim engeli', 'toplantı hakkı'],
        }),
        asciiAliases: canonicalAliasMap({
            'uyuşturucu madde': ['uyusturucu madde', 'esrar', 'metamfetamin', 'kokain', 'eroin', 'sentetik kannabinoid', 'uyuşturucu madde imali'],
            'kullanmak için bulundurma': ['kullanmak icin bulundurma', 'TCK 191', 'denetimli serbestlik', 'tedavi ve denetimli serbestlik'],
            'uyuşturucu madde ticareti': ['uyusturucu madde ticareti'],
            'haksız tahrik': ['haksiz tahrik', 'TCK 29', 'ağır tahrik', 'hafif tahrik', 'meşru savunmada sınır aşma'],
            'arama kararı': ['arama karari', 'CMK 116', 'CMK 119', 'adli arama', 'önleme araması', 'araç araması'],
            'hukuka aykırı delil': ['hukuka aykiri delil', 'özel hayatın gizliliği', 'telefon kaydı', 'gizli dinleme', 'usulsüz arama', 'CMK 206'],
            'şüpheden sanık yararlanır': ['supheden sanik yararlanir', 'in dubio pro reo', 'masumiyet karinesi', 'beraat'],
            'nitelikli dolandırıcılık': ['nitelikli dolandiricilik', 'TCK 158', 'bilişim dolandırıcılığı', 'kredi kartı dolandırıcılığı', 'telefon dolandırıcılığı'],
            'kamu görevlisine hakaret': ['kamu gorevlisine hakaret'],
            'taksirle yaralama': ['taksirle yaralama', 'tibbi hata', 'TCK 89', 'trafik kazası ceza', 'bilinçli taksir', 'taksirle ölüme neden olma'],
            'tıbbi malpraktis': ['tibbi malpraktis', 'hekim sorumluluğu', 'ameliyat hatası', 'tanı hatası', 'tedavi hatası', 'aydınlatılmış onam'],
            'kişisel verileri hukuka aykırı ele geçirme': ['kisisel verileri hukuka aykiri ele gecirme', 'TCK 136', 'veri sızıntısı', 'telefon dinleme', 'gizli kamera'],
            'şantaj': ['santaj', 'TCK 107', 'zorla senet imzalatma', 'tehditle para isteme'],
            'terör örgütü propagandası': ['teror orgutu propagandasi', 'TCK 314', 'TMK 7/2', 'örgüt üyeliği', 'örgüte yardım etme', 'silahlı terör örgütü'],
            'basın özgürlüğü': ['basin ozgurlugu', '5187 sayılı kanun', 'haber verme hakkı', 'eleştiri hakkı', 'kamu yararı', 'basın kartı'],
            'ifade özgürlüğü': ['ifade ozgurlugu', 'Anayasa m.26', 'AİHS m.10', 'düşünce açıklama hakkı', 'sosyal medya paylaşımı', 'internet sansürü', 'sosyal medya engelleme', 'web sitesi erişim engeli', 'toplantı hakkı'],
        }),
        negativeMarkers: ['bireysel başvuru', 'hak ihlali', 'anayasa mahkemesi'],
        queryTemplates: ['{required}', '{required} {support}', '"{required}" {support}'],
    },
    idare: {
        id: 'idare',
        label: 'İdare',
        primarySources: ['danistay'],
        secondarySources: ['yargitay'],
        preferredBirimCodes: [],
        canonicalConcepts: [
            'yürütmenin durdurulması',
            'imar para cezası',
            'yıkım kararı',
            'idari işlem iptali',
            'encümen kararı',
            'yapı kayıt belgesi',
            'kamulaştırmasız el atma',
            'ruhsatsız yapı',
            'idari para cezası',
            'ruhsat iptali',
            'fiili el atma',
            'hukuki el atma',
            'ecrimisil',
            'disiplin cezası',
            'devlet memurluğundan çıkarma',
            'tam yargı davası',
            'mülkiyet hakkı ihlali',
        ],
        turkishAliases: canonicalAliasMap({
            'yürütmenin durdurulması': ['açık hukuka aykırılık', 'telafisi güç zarar', 'İYUK 27', 'ihtiyati tedbir', 'telafisi güç zarar', 'açık hukuka aykırılık'],
            'imar para cezası': ['imar mevzuatı', 'belediye encümeni', '3194 sayılı kanun', 'imar kirliliği', 'kaçak yapı', 'ruhsata aykırı yapı', 'yapı denetim'],
            'yıkım kararı': ['yapı tatil tutanağı', 'ruhsatsız yapı', 'yıkım kararının iptali', 'belediye encümeni kararı', 'yapı tatil zaptı'],
            'yapı kayıt belgesi': ['imar barışı', 'geçici 16', 'imar barışı', 'geçici madde 16', '7143 sayılı kanun', '3194 sayılı kanun'],
            'kamulaştırmasız el atma': ['fiili el atma', 'hukuki el atma', 'kamulaştırma bedeli', 'fiili el koyma', 'hukuki el koyma', 'bedel tespiti', 'kamulaştırma bedelinin tespiti davası', 'tescil davası'],
            'ecrimisil': ['haksız işgal tazminatı', 'ecrimisil bedeli', '2886 sayılı kanun', 'fuzuli işgal', 'hazine arazisi işgali'],
            'disiplin cezası': ['devlet memurluğundan çıkarma', 'ölçülülük ilkesi', '657 sayılı kanun', 'uyarma', 'kınama', 'aylıktan kesme', 'kademe ilerlemesinin durdurulması'],
            'tam yargı davası': ['idari tazminat', 'hizmet kusuru', 'tıbbi malpraktis tazminat', 'İYUK 12', 'İYUK 13', 'idari eylemden doğan zarar', 'kusurlu sorumluluk', 'kusursuz sorumluluk'],
        }),
        asciiAliases: canonicalAliasMap({
            'yürütmenin durdurulması': ['yurutmenin durdurulmasi', 'İYUK 27', 'ihtiyati tedbir', 'telafisi güç zarar', 'açık hukuka aykırılık'],
            'imar para cezası': ['imar para cezasi', '3194 sayılı kanun', 'imar kirliliği', 'kaçak yapı', 'ruhsata aykırı yapı', 'yapı denetim'],
            'yıkım kararı': ['yikim karari', 'yıkım kararının iptali', 'belediye encümeni kararı', 'yapı tatil zaptı'],
            'idari işlem iptali': ['idari islemin iptali', 'İYUK 2', 'iptal davası', 'yetki unsuru', 'şekil unsuru', 'sebep unsuru', 'konu unsuru', 'amaç unsuru'],
            'encümen kararı': ['encumen karari'],
            'yapı kayıt belgesi': ['yapi kayit belgesi', 'imar barisi', 'imar barışı', 'geçici madde 16', '7143 sayılı kanun', '3194 sayılı kanun'],
            'kamulaştırmasız el atma': ['kamulastirmasiz el atma', 'fiili el atma', 'fiili el koyma', 'hukuki el koyma', 'bedel tespiti', 'kamulaştırma bedelinin tespiti davası', 'tescil davası'],
            'ruhsatsız yapı': ['ruhsatsiz yapi'],
            'ecrimisil': ['ecrimisil', '2886 sayılı kanun', 'fuzuli işgal', 'hazine arazisi işgali'],
            'disiplin cezası': ['disiplin cezasi', '657 sayılı kanun', 'uyarma', 'kınama', 'aylıktan kesme', 'kademe ilerlemesinin durdurulması'],
            'tam yargı davası': ['tam yargi davasi', 'İYUK 12', 'İYUK 13', 'idari eylemden doğan zarar', 'kusurlu sorumluluk', 'kusursuz sorumluluk'],
        }),
        negativeMarkers: ['işçilik alacağı', 'kıdem tazminatı', 'ceza genel kurulu'],
        queryTemplates: ['{required}', '{required} {support}', '"{required}" {support}'],
    },
    icra: {
        id: 'icra',
        label: 'İcra ve Alacak Hukuku',
        primarySources: ['yargitay'],
        secondarySources: ['uyap'],
        preferredBirimCodes: ['H12'],
        canonicalConcepts: [
            'itirazın iptali',
            'icra takibi',
            'icra inkar tazminatı',
            'menfi tespit',
            'istirdat davası',
            'kira alacağı',
            'cari hesap alacağı',
            'ticari defter',
            'ayıplı mal',
            'eser sözleşmesi',
            'konkordato',
            'borca batıklık',
            'iflas erteleme',
            'geçici mühlet',
            'alacaklılar toplantısı',
            'iyileştirme projesi',
        ],
        turkishAliases: canonicalAliasMap({
            'itirazın iptali': ['borca itiraz', 'takibe itiraz', 'İİK 67', 'İİK 67', 'alacağın ispatı', 'icra inkâr tazminatı %20'],
            'icra takibi': ['ödeme emri', 'takip talebi', 'ilamsız takip', 'ilamlı takip', 'ilamsız icra', 'ilamlı icra', 'kambiyo senetlerine özgü takip', 'rehnin paraya çevrilmesi'],
            'icra inkar tazminatı': ['inkar tazminatı', 'inkâr tazminatı', 'yüzde yirmi tazminat', 'kötüniyet tazminatı', 'İİK 67/2'],
            'istirdat davası': ['geri alma davası', 'İİK 72', 'fazla ödemenin iadesi', 'İİK 72/7', 'haksız tahsilat'],
            'cari hesap alacağı': ['fatura alacağı', 'ticari alacak'],
            'ticari defter': ['defter kayıtları', 'ba bs kayıtları', 'e-fatura', 'TTK 64', 'defter tutma yükümlülüğü', 'açılış kapanış tasdiki', 'delil olarak kullanma'],
            'eser sözleşmesi': ['yüklenici alacağı', 'iş bedeli', 'TBK 470', 'iş sahibinin seçimlik hakları', 'ayıp ihbarı', 'yüklenicinin sorumluluğu'],
            'konkordato': ['konkordato mühleti', 'adi konkordato', 'iflastan sonra konkordato', 'İİK 285', 'konkordato komiseri', 'kesin mühlet', 'konkordato projesi', 'alacaklılar kurulu'],
            'borca batıklık': ['pasifin aktifi geçmesi', 'teknik iflas', 'aktif pasif dengesi', 'bilançoda borca batıklık', 'muhasebe raporu'],
            'iflas erteleme': ['iflasın ertelenmesi', 'İİK 179', 'iyileştirme projesi sunma', 'kayyım atanması', 'iflas masası'],
            'geçici mühlet': ['kesin mühlet', 'konkordato süreci', '3 aylık geçici mühlet', 'geçici mühlet uzatma', 'İİK 287'],
            'alacaklılar toplantısı': ['konkordato komiseri', 'konkordato tasdiki', 'oy çoğunluğu', 'alacak miktarı çoğunluğu', 'konkordato tasdik şartları'],
            'iyileştirme projesi': ['iflas önleme', 'yeniden yapılandırma', 'konkordato planı', 'borç ödeme takvimi', 'alacaklı grupları'],
            'menfi tespit': ['borçlu olmadığının tespiti', 'İİK 72', 'İİK 72', 'borçlu olmadığının tespiti', 'takipten önce menfi tespit', 'takipten sonra menfi tespit'],
        }),
        asciiAliases: canonicalAliasMap({
            'itirazın iptali': ['itirazin iptali', 'İİK 67', 'alacağın ispatı', 'icra inkâr tazminatı %20'],
            'icra takibi': ['icra takibi', 'ilamsız icra', 'ilamlı icra', 'kambiyo senetlerine özgü takip', 'rehnin paraya çevrilmesi'],
            'icra inkar tazminatı': ['icra inkar tazminati', 'inkar tazminati', 'yüzde yirmi tazminat', 'kötüniyet tazminatı', 'İİK 67/2'],
            'menfi tespit': ['menfi tespit', 'İİK 72', 'borçlu olmadığının tespiti', 'takipten önce menfi tespit', 'takipten sonra menfi tespit'],
            'istirdat davası': ['istirdat davasi', 'fazla ödemenin iadesi', 'İİK 72/7', 'haksız tahsilat'],
            'kira alacağı': ['kira alacagi', 'kira takibi', 'tahliye', 'adi kira', 'hasılat kirası'],
            'cari hesap alacağı': ['cari hesap alacagi', 'fatura alacagi'],
            'ticari defter': ['ticari defter', 'e-fatura', 'ba bs kayitlari', 'TTK 64', 'defter tutma yükümlülüğü', 'açılış kapanış tasdiki', 'delil olarak kullanma'],
            'ayıplı mal': ['ayipli mal', 'TKHK 8', 'gizli ayıp bildirimi', 'açık ayıp bildirimi', '6 ay karine', '2 yıl zamanaşımı', 'onarım hakkı', 'bedelden indirim'],
            'eser sözleşmesi': ['eser sozlesmesi', 'TBK 470', 'iş sahibinin seçimlik hakları', 'ayıp ihbarı', 'yüklenicinin sorumluluğu'],
        }),
        negativeMarkers: ['velayet', 'nafaka', 'boşanma', 'bireysel başvuru'],
        queryTemplates: ['{required}', '{required} {support}', '"{required}" {support}'],
    },
    vergi: {
        id: 'vergi',
        label: 'Vergi',
        primarySources: ['danistay'],
        secondarySources: [],
        preferredBirimCodes: ['VDDK', 'D3', 'D4', 'D7', 'D9'],
        canonicalConcepts: [
            'vergi ziyaı', 'tarhiyat', 'ödeme emri', 'kdv', 'stopaj', 'resen tarh',
            'kurumlar vergisi', 'gelir vergisi', 'katma değer vergisi', 'özel tüketim vergisi',
            'transfer fiyatlandırması', 'örtülü kazanç', 'örtülü sermaye', 'emsal bedel',
            'ikmalen tarh', 'vergi tekniği raporu', 'matrah artışı', 'vergi incelemesi',
            'usulsüzlük cezası', 'sahte fatura', 'muhtasar beyanname', 'e-fatura',
        ],
        turkishAliases: canonicalAliasMap({
            'vergi ziyaı': ['vergi cezası', 'vergi kaybı', 'vergi ziyaı cezası', 'VUK 341', 'vergi kaybı', 'bir kat vergi ziyaı cezası', 'üç kat vergi ziyaı cezası'],
            'tarhiyat': ['ikmalen tarh', 'resen tarh', 'ikmalen vergi tarhiyatı', 're\'sen tarhiyat', 'ikmalen tarhiyat', 'beyana dayanan tarh', 'verginin tarhı'],
            'transfer fiyatlandırması': ['emsallere uygunluk ilkesi', 'OECD rehberi', 'ilişkili şirketler arası', 'KVK 13', 'emsal fiyat', 'ilişkili kişi', 'örtülü kazanç dağıtımı', 'karşılaştırılabilirlik analizi'],
            'örtülü kazanç': ['örtülü kazanç dağıtımı', 'transfer fiyatlandırması yoluyla', 'KVK 13', 'örtülü kazanç dağıtımı', 'transfer fiyatlandırması düzeltmesi'],
            'sahte fatura': ['naylon fatura', 'VUK 359', 'sahte belge düzenleme', 'VUK 359', 'muhteviyatı itibariyle yanıltıcı belge', 'naylon fatura kullanma', 'sahte belge düzenleme suçu'],
            'kdv': ['katma değer vergisi', 'KDV iadesi', 'indirim KDV', 'KDV iade talebi', 'KDV indirimi reddi', 'sahte fatura KDV', 'iade edilecek KDV'],
            'stopaj': ['tevkifat', 'vergi kesintisi', 'gelir vergisi stopajı', 'kurumlar vergisi stopajı', 'KDV tevkifatı'],
            'matrah artışı': ['matrah farkı', 'matrah takdiri', 'komisyon takdiri', 'matrah farkı', 'takdir komisyonu kararı', 'vergi matrahı'],
        }),
        asciiAliases: canonicalAliasMap({
            'vergi ziyaı': ['vergi ziyai', 'VUK 341', 'vergi kaybı', 'bir kat vergi ziyaı cezası', 'üç kat vergi ziyaı cezası'],
            'ödeme emri': ['odeme emri', '6183 sayılı kanun', 'ödeme emrine itiraz', 'haciz', 'amme alacağı'],
            'resen tarh': ['resen tarh'],
            'transfer fiyatlandırması': ['transfer fiyatlandirmasi', 'KVK 13', 'emsal fiyat', 'ilişkili kişi', 'örtülü kazanç dağıtımı', 'karşılaştırılabilirlik analizi'],
            'örtülü kazanç': ['ortulu kazanc', 'KVK 13', 'örtülü kazanç dağıtımı', 'transfer fiyatlandırması düzeltmesi'],
            'kurumlar vergisi': ['kurumlar vergisi', 'KVK', 'kurum kazancı', 'istisnalar', 'indirimler', 'beyanname'],
            'sahte fatura': ['sahte fatura', 'naylon fatura', 'VUK 359', 'muhteviyatı itibariyle yanıltıcı belge', 'naylon fatura kullanma', 'sahte belge düzenleme suçu'],
        }),
        negativeMarkers: ['iş sözleşmesi', 'boşanma', 'bireysel başvuru'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    anayasa: {
        id: 'anayasa',
        label: 'Anayasa',
        primarySources: ['anayasa'],
        secondarySources: ['yargitay'],
        preferredBirimCodes: [],
        canonicalConcepts: [
            'ifade özgürlüğü', 'adil yargılanma', 'hak ihlali', 'mülkiyet hakkı', 'bireysel başvuru',
            'kişi özgürlüğü', 'özel hayata saygı', 'din ve vicdan özgürlüğü', 'eşitlik ilkesi',
            'dernek kurma hakkı', 'toplantı ve gösteri yürüyüşü', 'seçme ve seçilme hakkı',
            'hukuk devleti', 'anayasaya aykırılık', 'temel hak sınırlandırma', 'orantılılık ilkesi',
        ],
        turkishAliases: canonicalAliasMap({
            'ifade özgürlüğü': ['basın özgürlüğü', 'düşünce özgürlüğü', 'AİHS 10', 'Anayasa 26', 'Anayasa m.26', 'AİHS m.10', 'düşünce açıklama hakkı', 'sosyal medya paylaşımı', 'internet sansürü', 'sosyal medya engelleme', 'web sitesi erişim engeli', 'toplantı hakkı'],
            'adil yargılanma': ['makul sürede yargılanma', 'dürüst yargılanma', 'AİHS 6', 'Anayasa 36', 'silahların eşitliği', 'çelişmeli yargılama', 'gerekçeli karar hakkı', 'hukuki dinlenilme hakkı'],
            'hak ihlali': ['anayasa mahkemesi', 'temel hak ihlali', 'AİHM', 'AYM kararı', 'pilot karar', 'tazminat kararı', 'yeniden yargılama'],
            'mülkiyet hakkı': ['mülkiyet hakkı ihlali', 'AİHS Ek Protokol 1', 'Anayasa 35', 'kamulaştırma tazminatı', 'orantısız müdahale', 'mülkiyetin korunması'],
            'bireysel başvuru': ['AYM başvurusu', 'anayasa şikayeti', 'AYM bireysel başvuru', 'başvuru formu', 'kabul edilebilirlik', 'süre aşımı', 'iç hukuk yollarının tüketilmesi'],
            'kişi özgürlüğü': ['kişi güvenliği', 'tutukluluk süresi', 'AİHS 5', 'Anayasa 19', 'haksız tutuklama', 'tutukluluk tazminatı', 'CMK 141', 'özgürlük kısıtlaması'],
            'özel hayata saygı': ['mahremiyet', 'AİHS 8', 'Anayasa 20', 'aile hayatı', 'haberleşme hakkı', 'konut dokunulmazlığı'],
            'orantılılık ilkesi': ['ölçülülük ilkesi', 'demokratik toplum düzeni', 'gereklilik testi', 'elverişlilik', 'orantılılık testi', 'meşru amaç'],
        }),
        asciiAliases: canonicalAliasMap({
            'ifade özgürlüğü': ['ifade ozgurlugu', 'Anayasa m.26', 'AİHS m.10', 'düşünce açıklama hakkı', 'sosyal medya paylaşımı', 'internet sansürü', 'sosyal medya engelleme', 'web sitesi erişim engeli', 'toplantı hakkı'],
            'adil yargılanma': ['adil yargilanma', 'silahların eşitliği', 'çelişmeli yargılama', 'gerekçeli karar hakkı', 'hukuki dinlenilme hakkı'],
            'mülkiyet hakkı': ['mulkiyet hakki', 'kamulaştırma tazminatı', 'orantısız müdahale', 'mülkiyetin korunması'],
            'bireysel başvuru': ['bireysel basvuru', 'AYM bireysel başvuru', 'başvuru formu', 'kabul edilebilirlik', 'süre aşımı', 'iç hukuk yollarının tüketilmesi'],
            'kişi özgürlüğü': ['kisi ozgurlugu', 'haksız tutuklama', 'tutukluluk tazminatı', 'CMK 141', 'özgürlük kısıtlaması'],
            'orantılılık ilkesi': ['orantililik ilkesi', 'olcululuk ilkesi', 'gereklilik testi', 'elverişlilik', 'orantılılık testi', 'meşru amaç'],
        }),
        negativeMarkers: ['icra takibi', 'kıdem tazminatı', 'nitelikli dolandırıcılık'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    aile: {
        id: 'aile',
        label: 'Aile Hukuku',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['H2', 'HGK'],
        canonicalConcepts: [
            'boşanma', 'velayet', 'nafaka', 'ziynet eşyası', 'aile konutu',
            'evlilik birliğinin sarsılması', 'aldatma', 'sadakat yükümlülüğü',
            'edinilmiş mallara katılma', 'mal rejimi', 'katılma alacağı',
            'tedbir nafakası', 'yoksulluk nafakası', 'iştirak nafakası', 'nafaka artırımı',
            'babalık davası', 'soy bağı', 'evlat edinme', 'vesayet',
            'nişanın bozulması', 'nişan hediyelerinin iadesi',
            'ortak velayet', 'kişisel ilişki tesisi', 'çocuk teslimi',
        ],
        turkishAliases: canonicalAliasMap({
            'boşanma': ['evlilik birliğinin sarsılması', 'anlaşmalı boşanma', 'çekişmeli boşanma', 'TMK 166', 'TMK 161 zina', 'TMK 162 hayata kast', 'TMK 163 suç işleme', 'TMK 164 terk', 'TMK 165 akıl hastalığı', 'TMK 166 evlilik birliğinin sarsılması'],
            'nafaka': ['tedbir nafakası', 'yoksulluk nafakası', 'iştirak nafakası', 'nafaka alacağı', 'iştirak nafakası hesaplama', 'nafaka artırım davası', 'nafaka azaltma davası', 'yoksulluk nafakası koşulları'],
            'velayet': ['velayetin değiştirilmesi', 'ortak velayet', 'velayet hakkı', 'çocuğun üstün yararı', 'velayet değişikliği', 'velayet davası', 'çocuk psikologu raporu', 'pedagog raporu'],
            'ziynet eşyası': ['düğün takıları', 'altın iadesi', 'mehir', 'düğün takıları davası', 'ziynet iadesi', 'ispat yükü', 'tanık beyanı'],
            'aile konutu': ['aile konutu şerhi', 'eşin rızası', 'TMK 194', 'aile konutu şerhi kaldırma', 'TMK 194', 'eş rızası olmadan satış'],
            'edinilmiş mallara katılma': ['mal rejimi', 'katılma alacağı', 'artık değer', 'edinilmiş mal', 'kişisel mal', 'değer artış payı', 'TMK 218-241', 'katılma alacağı hesaplama'],
            'aldatma': ['sadakatsizlik', 'sadakat yükümlülüğü', 'zina', 'zina sebebiyle boşanma', 'TMK 161', 'aldatma ispatı', 'özel dedektif', 'telefon kayıtları'],
            'babalık davası': ['soy bağının reddi', 'tanıma', 'DNA testi', 'babalık karinesi', 'soybağının reddi', 'TMK 301'],
            'vesayet': ['vasi tayini', 'kısıtlama', 'kayyım', 'TMK 396', 'TMK 404', 'kısıtlama sebepleri', 'vasi atanması', 'kayyım atanması', 'yasal danışman'],
            'nişanın bozulması': ['nişan bozma', 'hediyelerin iadesi', 'nişan tazminatı', 'maddi tazminat', 'manevi tazminat', 'hediyelerin geri verilmesi'],
            'kişisel ilişki tesisi': ['çocukla görüşme', 'şahsi münasebet', 'kişisel ilişki düzenlemesi', 'çocuk görüşme günleri', 'yaz tatili düzenlemesi'],
        }),
        asciiAliases: canonicalAliasMap({
            'boşanma': ['bosanma', 'anlasmalı bosanma', 'TMK 161 zina', 'TMK 162 hayata kast', 'TMK 163 suç işleme', 'TMK 164 terk', 'TMK 165 akıl hastalığı', 'TMK 166 evlilik birliğinin sarsılması'],
            'velayet': ['velayet', 'ortak velayet', 'çocuğun üstün yararı', 'velayet değişikliği', 'velayet davası', 'çocuk psikologu raporu', 'pedagog raporu'],
            'nafaka': ['nafaka', 'tedbir nafakasi', 'iştirak nafakası hesaplama', 'nafaka artırım davası', 'nafaka azaltma davası', 'yoksulluk nafakası koşulları'],
            'ziynet eşyası': ['ziynet esyasi', 'dugun takilari', 'düğün takıları davası', 'ziynet iadesi', 'ispat yükü', 'tanık beyanı'],
            'aile konutu': ['aile konutu', 'aile konutu şerhi kaldırma', 'TMK 194', 'eş rızası olmadan satış'],
            'edinilmiş mallara katılma': ['edinilmis mallara katilma', 'edinilmiş mal', 'kişisel mal', 'değer artış payı', 'TMK 218-241', 'katılma alacağı hesaplama'],
            'aldatma': ['aldatma', 'sadakatsizlik', 'zina sebebiyle boşanma', 'TMK 161', 'aldatma ispatı', 'özel dedektif', 'telefon kayıtları'],
            'babalık davası': ['babalik davasi', 'DNA testi', 'babalık karinesi', 'soybağının reddi', 'TMK 301'],
            'vesayet': ['vesayet', 'vasi', 'TMK 396', 'TMK 404', 'kısıtlama sebepleri', 'vasi atanması', 'kayyım atanması', 'yasal danışman'],
        }),
        negativeMarkers: ['icra takibi', 'vergi ziyaı', 'imar para cezası'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    ticaret: {
        id: 'ticaret',
        label: 'Ticaret Hukuku',
        primarySources: ['yargitay'],
        secondarySources: ['uyap'],
        preferredBirimCodes: ['H11'],
        canonicalConcepts: [
            'cari hesap', 'fatura alacağı', 'ticari defter', 'anonim şirket', 'limited şirket',
            'haksız rekabet', 'ticari sır', 'rekabet yasağı',
            'marka hakkına tecavüz', 'marka tescili', 'iltibas', 'marka hükümsüzlüğü',
            'banka sorumluluğu', 'yetkisiz işlem', 'mevduatın iadesi',
            'çek iptali', 'çek zıyaı', 'kıymetli evrak',
        ],
        turkishAliases: canonicalAliasMap({
            'cari hesap': ['hesap ekstresi', 'cari hesap bakiyesi', 'hesap kat ihtarnamesi', 'TTK 89', 'faiz hesabı'],
            'fatura alacağı': ['ticari alacak', 'fatura itirazı', 'süresinde itiraz', 'ticari teamül', 'fatura teyidi'],
            'ticari defter': ['ba bs kayıtları', 'e-fatura', 'TTK 64', 'defter tutma yükümlülüğü', 'açılış kapanış tasdiki', 'delil olarak kullanma'],
            'haksız rekabet': ['haksız rekabet tespiti', 'rekabet yasağı ihlali', 'TTK 54', 'haksız rekabet davası', 'maddi tazminat', 'manevi tazminat', 'tespit davası'],
            'marka hakkına tecavüz': ['marka tecavüzü', 'marka ihlali', 'iltibas', 'SMK 7', 'SMK 29', 'marka koruma kapsamı', 'TÜRKPATENT', 'tescilsiz marka'],
            'marka hükümsüzlüğü': ['marka iptali', 'kötüniyetli tescil', 'SMK 25', 'hükümsüzlük davası', 'tanınmış marka', 'markanın kullanılmaması'],
            'banka sorumluluğu': ['bankanın özen yükümlülüğü', 'banka kusuru', 'internet bankacılığı', 'SIM swap', 'BK 20', 'BDDK', 'müşteri bilgilerinin korunması', 'EFT iptali', 'hesaptan çekilen para'],
            'yetkisiz işlem': ['yetkisiz EFT', 'yetkisiz havale', 'internet dolandırıcılığı', 'kart kopyalama', 'hesap çalınması', 'OTP kodu'],
        }),
        asciiAliases: canonicalAliasMap({
            'cari hesap': ['cari hesap', 'cari hesap bakiyesi', 'hesap kat ihtarnamesi', 'TTK 89', 'faiz hesabı'],
            'fatura alacağı': ['fatura alacagi', 'fatura itirazı', 'süresinde itiraz', 'ticari teamül', 'fatura teyidi'],
            'ticari defter': ['ticari defter', 'e-fatura', 'TTK 64', 'defter tutma yükümlülüğü', 'açılış kapanış tasdiki', 'delil olarak kullanma'],
            'anonim şirket': ['anonim sirket', 'genel kurul', 'yönetim kurulu', 'pay devri', 'sermaye artırımı', 'azlık hakları'],
            'limited şirket': ['limited sirket', 'müdür tayini', 'pay devri kısıtlaması', 'TTK 595', 'ortaklar kurulu'],
            'haksız rekabet': ['haksiz rekabet', 'TTK 54', 'haksız rekabet davası', 'maddi tazminat', 'manevi tazminat', 'tespit davası'],
            'marka hakkına tecavüz': ['marka hakkina tecavuz', 'SMK 7', 'SMK 29', 'marka koruma kapsamı', 'TÜRKPATENT', 'tescilsiz marka'],
            'marka hükümsüzlüğü': ['marka hukumsuzlugu', 'SMK 25', 'hükümsüzlük davası', 'tanınmış marka', 'markanın kullanılmaması'],
            'banka sorumluluğu': ['banka sorumlulugu', 'BK 20', 'BDDK', 'müşteri bilgilerinin korunması', 'EFT iptali', 'hesaptan çekilen para'],
            'çek iptali': ['cek iptali', 'TTK 757', 'çek zıyaı davası', 'karşılıksız çek', 'çek yasağı'],
        }),
        negativeMarkers: ['bireysel başvuru', 'velayet', 'tutuklama'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    genel_hukuk: {
        id: 'genel_hukuk',
        label: 'Genel Hukuk',
        primarySources: ['yargitay'],
        secondarySources: ['uyap', 'danistay'],
        preferredBirimCodes: [],
        canonicalConcepts: [
            'tazminat', 'sözleşme', 'haksız fiil', 'alacak', 'maddi tazminat',
            'manevi tazminat', 'sözleşmeye aykırılık', 'borcun ifası', 'temerrüt',
            'müterafik kusur', 'nedensellik bağı', 'zamanaşımı', 'hak düşürücü süre',
            'irade sakatlığı', 'gabin', 'vekalet sözleşmesi', 'vekalet ücreti',
            'sebepsiz zenginleşme', 'istihkak davası', 'hukuki yarar',
        ],
        turkishAliases: canonicalAliasMap({
            'sözleşme': ['sözleşmeye aykırılık', 'akde aykırılık', 'sözleşme özgürlüğü', 'iradi temsil', 'borç doğuran sözleşme', 'tasarruf işlemi'],
            'haksız fiil': ['manevi tazminat', 'haksız fiil tazminatı', 'TBK 49', 'TBK 49', 'hukuka aykırılık', 'kusur', 'zarar', 'illiyet bağı', 'maddi zarar', 'manevi zarar'],
            'tazminat': ['maddi ve manevi tazminat', 'zarar tazmini', 'tam tazmin ilkesi', 'tazminat hesabı', 'tazminat indirimi', 'takdiri indirim'],
            'temerrüt': ['borçlu temerrüdü', 'alacaklı temerrüdü', 'gecikme faizi', 'TBK 117', 'ihtar', 'temerrüt faizi', 'gecikme tazminatı', 'munzam zarar'],
            'zamanaşımı': ['zamanaşımı def\'i', 'zamanaşımı süresi', '1 yıllık zamanaşımı', '2 yıllık zamanaşımı', '5 yıllık zamanaşımı', '10 yıllık zamanaşımı', '20 yıllık zamanaşımı'],
            'irade sakatlığı': ['hata', 'hile', 'ikrah', 'TBK 30-39', 'yanılma', 'aldatma', 'korkutma', 'gabinde yararlanma', 'TBK 30'],
            'gabin': ['aşırı yararlanma', 'TBK 28', 'TBK 28', 'edimler arası oransızlık', 'zor durumdan yararlanma'],
            'sebepsiz zenginleşme': ['haksız iktisap', 'TBK 77', 'TBK 77', 'iade borcu', 'zenginleşmenin iadesi', 'borçlanılmamış edim'],
        }),
        asciiAliases: canonicalAliasMap({
            'sözleşme': ['sozlesme', 'sözleşme özgürlüğü', 'iradi temsil', 'borç doğuran sözleşme', 'tasarruf işlemi'],
            'haksız fiil': ['haksiz fiil', 'TBK 49', 'hukuka aykırılık', 'kusur', 'zarar', 'illiyet bağı', 'maddi zarar', 'manevi zarar'],
            'maddi tazminat': ['maddi tazminat', 'tedavi giderleri', 'kazanç kaybı', 'çalışma gücü kaybı'],
            'manevi tazminat': ['manevi tazminat', 'TBK 56', 'TBK 58', 'acı çekme', 'elem duyma', 'kişilik hakları ihlali'],
            'zamanaşımı': ['zamanasimi', '1 yıllık zamanaşımı', '2 yıllık zamanaşımı', '5 yıllık zamanaşımı', '10 yıllık zamanaşımı', '20 yıllık zamanaşımı'],
            'temerrüt': ['temerrud', 'TBK 117', 'ihtar', 'temerrüt faizi', 'gecikme tazminatı', 'munzam zarar'],
            'sebepsiz zenginleşme': ['sebepsiz zenginlesme', 'TBK 77', 'iade borcu', 'zenginleşmenin iadesi', 'borçlanılmamış edim'],
        }),
        negativeMarkers: ['bireysel başvuru', 'vergi ziyaı'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    miras: {
        id: 'miras',
        label: 'Miras Hukuku',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['H1', 'H7', 'H14', 'HGK'],
        canonicalConcepts: [
            'vasiyetname', 'vasiyetnamenin iptali', 'fiil ehliyeti', 'tenkis davası',
            'saklı pay', 'tereke', 'miras paylaşımı', 'mirasın reddi', 'muris muvazaası',
            'yasal mirasçı', 'atanmış mirasçı', 'mirasın taksimi', 'elbirliği mülkiyeti',
            'ortaklığın giderilmesi', 'veraset ilamı', 'mirasçılıktan çıkarma',
            'art miras', 'ölüme bağlı tasarruf', 'miras sözleşmesi',
        ],
        turkishAliases: canonicalAliasMap({
            'vasiyetnamenin iptali': ['vasiyetname iptali', 'ehliyetsizlik', 'TMK 557', 'TMK 557', 'hukuka aykırılık', 'tasarruf ehliyeti yokluğu', 'irade sakatlığı', 'şekil eksikliği'],
            'fiil ehliyeti': ['ayırt etme gücü', 'Alzheimer', 'bunama', 'demans', 'TMK 9', 'ayırt etme gücü', 'erginlik', 'kısıtlılık', 'akıl hastalığı raporu'],
            'tenkis davası': ['saklı pay ihlali', 'TMK 560', 'TMK 560', 'tenkis sırası', 'sağlar arası kazandırma', 'ölüme bağlı kazandırma'],
            'muris muvazaası': ['mirastan mal kaçırma', 'görünürde işlem', '01.04.1974 İBK', 'danışıklı satış', 'tapu iptali tescil', 'mirastan mal kaçırma davası'],
            'mirasın reddi': ['mirasa feragat', 'reddi miras', 'TMK 605', 'TMK 605', '3 aylık ret süresi', 'mirasçılıktan çıkarma', 'reddin iptali', 'hükmi red'],
            'miras paylaşımı': ['terekenin taksimi', 'paylaşma davası', 'rızai paylaşma', 'kazai paylaşma', 'miras taksim sözleşmesi', 'veraset ilamı'],
            'ortaklığın giderilmesi': ['izale-i şüyu', 'ortaklığın satış yoluyla giderilmesi', 'aynen taksim', 'satış yoluyla taksim', 'İİK 121', 'izale-i şüyu davası'],
            'mirasçılıktan çıkarma': ['ıskat', 'TMK 510', 'TMK 510', 'ağır suç', 'aile hukuku yükümlülüğü ihlali', 'ıskat'],
        }),
        asciiAliases: canonicalAliasMap({
            'vasiyetname': ['vasiyetname', 'el yazılı vasiyetname', 'resmi vasiyetname', 'sözlü vasiyetname', 'TMK 531', 'TMK 532', 'TMK 538'],
            'tenkis davası': ['tenkis davasi', 'TMK 560', 'tenkis sırası', 'sağlar arası kazandırma', 'ölüme bağlı kazandırma'],
            'saklı pay': ['sakli pay', 'saklı pay oranları', 'altsoy saklı payı', 'sağ eş saklı payı', 'TMK 505', 'TMK 506'],
            'muris muvazaası': ['muris muvazaasi', '01.04.1974 İBK', 'danışıklı satış', 'tapu iptali tescil', 'mirastan mal kaçırma davası'],
            'mirasın reddi': ['mirasin reddi', 'reddi miras', 'TMK 605', '3 aylık ret süresi', 'mirasçılıktan çıkarma', 'reddin iptali', 'hükmi red'],
            'ortaklığın giderilmesi': ['ortakligin giderilmesi', 'izale-i suyu', 'aynen taksim', 'satış yoluyla taksim', 'İİK 121', 'izale-i şüyu davası'],
            'mirasçılıktan çıkarma': ['mirasciliktan cikarma', 'TMK 510', 'ağır suç', 'aile hukuku yükümlülüğü ihlali', 'ıskat'],
        }),
        negativeMarkers: ['icra takibi', 'boşanma', 'imar'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    tuketici: {
        id: 'tuketici',
        label: 'Tüketici Hukuku',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['H3', 'H13'],
        canonicalConcepts: [
            'ayıplı mal', 'ayıplı hizmet', 'sözleşmeden dönme', 'ürün değişimi', 'TKHK',
            'garanti süresi', 'sıfır kilometre', 'tüketici hakem heyeti',
            'paket tur', 'paket tur sözleşmesi', 'tatil tazminatı',
            'abonelik sözleşmesi', 'tüketici kredisi', 'mesafeli satış',
            'haksız ticari uygulama', 'garanti belgesi', 'satış sonrası hizmet',
            'konut satış sözleşmesi', 'taksitli satış', 'cayma hakkı',
        ],
        turkishAliases: canonicalAliasMap({
            'ayıplı mal': ['arızalı ürün', 'bozuk araç', 'sıfır km ayıplı', 'fabrikasyon hatası', 'gizli ayıp', 'açık ayıp', 'TKHK 8', 'gizli ayıp bildirimi', 'açık ayıp bildirimi', '6 ay karine', '2 yıl zamanaşımı', 'onarım hakkı', 'bedelden indirim'],
            'ayıplı hizmet': ['kötü hizmet', 'eksik hizmet', 'vaat edilen hizmet', 'hizmet ayıbı', 'TKHK 13', 'tatil hizmeti', 'telekomünikasyon hizmeti', 'abonelik hizmeti'],
            'sözleşmeden dönme': ['bedel iadesi', 'ürün iadesi', 'ücret iadesi', 'TKHK 11', 'TKHK 11', 'seçimlik haklar', 'ücretsiz onarım', 'misliyle değişim', 'ayıp oranında indirim'],
            'paket tur': ['paket tur iptali', 'tatil iptali', 'seyahat acentası', 'boşa harcanan tatil tazminatı', 'TKHK 51', 'paket tur yönetmeliği', 'bilgilendirme formu', 'değişiklik hakkı', 'sorumluluk sınırları'],
            'mesafeli satış': ['internet alışverişi', 'e-ticaret', 'kaptan kapata satış', 'TKHK 48', '14 gün cayma hakkı', 'ön bilgilendirme formu', 'e-ticaret', 'kargo iade'],
            'cayma hakkı': ['14 gün cayma', '14 günlük iade', 'cayma bildirimi', 'TKHK 48', 'cayma bildirim formu', 'kapıdan satış', 'doğrudan satış'],
            'tüketici kredisi': ['kredi kartı', 'dosya masrafı', 'banka komisyon iadesi', 'TKHK 22', 'erken ödeme', 'faiz iadesi', 'masraf iadesi', 'dosya masrafı iadesi'],
            'konut satış sözleşmesi': ['ön ödemeli konut', 'daire teslimi', 'geç teslim', 'TKHK 40', 'ön ödemeli konut satışı', 'teminat', 'teslim süresi', 'devir yasağı'],
        }),
        asciiAliases: canonicalAliasMap({
            'ayıplı mal': ['ayipli mal', 'TKHK 8', 'gizli ayıp bildirimi', 'açık ayıp bildirimi', '6 ay karine', '2 yıl zamanaşımı', 'onarım hakkı', 'bedelden indirim'],
            'ayıplı hizmet': ['ayipli hizmet', 'TKHK 13', 'tatil hizmeti', 'telekomünikasyon hizmeti', 'abonelik hizmeti'],
            'sözleşmeden dönme': ['sozlesmeden donme', 'TKHK 11', 'seçimlik haklar', 'ücretsiz onarım', 'misliyle değişim', 'ayıp oranında indirim'],
            'paket tur': ['paket tur', 'TKHK 51', 'paket tur yönetmeliği', 'bilgilendirme formu', 'değişiklik hakkı', 'sorumluluk sınırları'],
            'mesafeli satış': ['mesafeli satis', 'TKHK 48', '14 gün cayma hakkı', 'ön bilgilendirme formu', 'e-ticaret', 'kargo iade'],
            'cayma hakkı': ['cayma hakki', 'TKHK 48', 'cayma bildirim formu', 'kapıdan satış', 'doğrudan satış'],
            'tüketici hakem heyeti': ['tuketici hakem heyeti', 'parasal sınır', 'ilçe hakem heyeti', 'il hakem heyeti', 'hakem heyeti kararına itiraz'],
        }),
        negativeMarkers: ['icra takibi', 'ceza davası', 'idari işlem'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    sigorta: {
        id: 'sigorta',
        label: 'Sigorta Hukuku',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['H11', 'H17'],
        canonicalConcepts: [
            'kasko', 'hasar tazminatı', 'sigorta tahkim', 'münhasıran',
            'alkollü sürüş', 'riziko', 'poliçe', 'rücu', 'sigorta şirketi',
            'trafik sigortası', 'zorunlu mali sorumluluk', 'prim iadesi',
            'hasar ihbarı', 'eksper raporu', 'değer kaybı', 'pert total',
            'hayat sigortası', 'sağlık sigortası', 'yanlış beyan',
        ],
        turkishAliases: canonicalAliasMap({
            'kasko': ['kasko sigortası', 'kasko hasar', 'kasko poliçesi', 'tam kasko', 'dar kasko', 'kasko teminat kapsamı', 'kasko hasarı bildirimi', 'kasko poliçe şartları'],
            'hasar tazminatı': ['hasar bedeli', 'sigorta tazminatı', 'hasar ödemesi', 'hasar hesaplama', 'sovtaj', 'hasar onarım', 'değer kaybı talebi'],
            'münhasıran': ['münhasıran illiyet', 'salt alkol', 'illiyet bağını kesen', 'salt alkol oranı', 'promil oranı', 'illiyet bağı kesilmesi', 'alkol raporu'],
            'sigorta tahkim': ['tahkim komisyonu', 'sigorta tahkim komisyonu', 'sigorta uyumazlık', 'sigorta tahkim komisyonu başvurusu', 'itiraz hakem heyeti', 'tahkim kararına itiraz'],
            'trafik sigortası': ['zorunlu trafik', 'ZMSS', 'trafik poliçesi', 'zorunlu mali sorumluluk sigortası', 'ZMSS limitleri', 'güvence hesabı', 'rücu davası'],
            'rücu': ['sigorta rücü', 'halefiyeten rücu', 'TTK 1472', 'sigorta rücu hakkı', 'halefiyet', 'rücu alacağı'],
            'pert total': ['ağır hasarlı', 'pert araç', 'tam hasar', 'pert araç satışı', 'pert raporu', 'ekspertiz değeri', 'piyasa değeri'],
            'değer kaybı': ['araç değer kaybı', 'ikinci el değer düşüşü', 'araç değer kaybı hesaplama', 'eksper raporu', 'bilirkişi raporu'],
            'eksper raporu': ['hasar ekspertizi', 'sigorta ekspertizi', 'bağımsız eksper', 'sigorta ekspertiz raporu', 'hasar tespiti'],
        }),
        asciiAliases: canonicalAliasMap({
            'kasko': ['kasko', 'tam kasko', 'dar kasko', 'kasko teminat kapsamı', 'kasko hasarı bildirimi', 'kasko poliçe şartları'],
            'hasar tazminatı': ['hasar tazminati', 'hasar hesaplama', 'sovtaj', 'hasar onarım', 'değer kaybı talebi'],
            'münhasıran': ['munhasiran', 'salt alkol oranı', 'promil oranı', 'illiyet bağı kesilmesi', 'alkol raporu'],
            'sigorta tahkim': ['sigorta tahkim', 'sigorta tahkim komisyonu başvurusu', 'itiraz hakem heyeti', 'tahkim kararına itiraz'],
        }),
        negativeMarkers: ['boşanma', 'icra takibi', 'imar'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
    borclar: {
        id: 'borclar',
        label: 'Borçlar Hukuku',
        primarySources: ['yargitay'],
        secondarySources: [],
        preferredBirimCodes: ['H1', 'H3', 'H4', 'H5', 'H6', 'H15', 'HGK'],
        canonicalConcepts: [
            'kira uyarlama', 'aşırı ifa güçlüğü', 'emprevizyon', 'kira bedeli',
            'haksız fiil', 'sözleşme', 'tazminat', 'tehlike sorumluluğu', 'kusursuz sorumluluk',
            'arsa payı karşılığı inşaat sözleşmesi', 'eser sözleşmesi', 'cezai şart',
            'tapu iptali ve tescil', 'çevre kirliliği',
            'kefalet', 'adi kefalet', 'müteselsil kefalet', 'ipotek', 'rehin',
            'kira sözleşmesi', 'tahliye davası', 'kiracının tahliyesi', 'kira artışı',
            'trafik kazası tazminatı', 'destekten yoksun kalma', 'iş göremezlik',
            'taşınmaz satış vaadi', 'gayrimenkul satışı', 'ön alım hakkı',
            'kat mülkiyeti', 'kat irtifakı', 'yönetim planı', 'ortak alan',
            'vekalet sözleşmesi', 'vekaletin kötüye kullanılması',
            'hizmet kusuru', 'adam çalıştıranın sorumluluğu', 'yapı sahibinin sorumluluğu',
        ],
        turkishAliases: canonicalAliasMap({
            'kira uyarlama': ['kira bedeli uyarlama', 'döviz kira', 'kira indirimi', 'TBK 344', 'kira tespit davası', 'kira artış oranı', 'TÜFE kira artışı', 'TBK 344', 'beş yıllık kira artışı'],
            'aşırı ifa güçlüğü': ['emprevizyon', 'TBK 138', 'işlem temelinin çökmesi', 'uyarlama davası', 'TBK 138', 'beklenmedik hal', 'olağanüstü durum', 'savaş hali', 'pandemi'],
            'tehlike sorumluluğu': ['kusursuz sorumluluk', 'TBK 71', 'objektif sorumluluk', 'TBK 71', 'çevre sorumluluğu', 'yapı sorumluluğu', 'motorlu taşıt sorumluluğu'],
            'arsa payı karşılığı inşaat sözleşmesi': ['kat karşılığı', 'yüklenici', 'müteahhit', 'inşaat sözleşmesi', 'kat karşılığı inşaat', 'müteahhidin temerrüdü', 'bağımsız bölüm devri', 'eksik iş bedeli', 'gecikme tazminatı'],
            'çevre kirliliği': ['toprak kirliliği', 'tehlikeli atık', 'ağır metal kirliliği', 'çevre zararı', 'TBK 71', 'çevre kanunu', 'çevresel etki değerlendirmesi', 'ÇED raporu', 'kirletici öder ilkesi'],
            'kefalet': ['kefil sorumluluğu', 'adi kefalet', 'müteselsil kefalet', 'TBK 583', 'adi kefilin defteri', 'müteselsil kefilin sorumluluğu', 'kefilin rücu hakkı', 'eşin rızası'],
            'kira sözleşmesi': ['kiracı', 'kiralayan', 'konut kirası', 'işyeri kirası', 'konut kira sözleşmesi', 'çatılı işyeri kirası', 'kira süresi', 'kira bedeli tespiti davası'],
            'tahliye davası': ['kiracının tahliyesi', 'tahliye taahhüdü', 'ihtiyaç nedeniyle tahliye', 'TBK 350', 'TBK 351', 'TBK 352', 'ihtiyaç sebebiyle tahliye', 'yeni malikin tahliye talebi', 'tahliye taahhüdü'],
            'trafik kazası tazminatı': ['haksız fiilden tazminat', 'ölümlü kaza', 'yaralanma tazminatı', 'kusur raporu', 'aktüer hesaplama', 'maluliyet raporu', 'sürekli iş göremezlik'],
            'destekten yoksun kalma': ['destek tazminatı', 'ölüm tazminatı', 'hesaplama yöntemi', 'aktüer raporu', 'PMF tablosu', 'TBK 53', 'destek tazminatı hesabı', 'TRH tablosu', 'bilinen dönem', 'bilinmeyen dönem'],
            'taşınmaz satış vaadi': ['satış vaadi tapuya şerh', 'ön sözleşme'],
            'kat mülkiyeti': ['KMK', 'kat malikleri', 'aidat borcu', 'KMK 18', 'ortak gider payı', 'kat malikleri kurulu', 'yönetici seçimi', 'aidat borcu davası'],
            'ipotek': ['ipotek şerhi', 'ipotek fekki', 'ipotek alacağı', 'ipotek tesisi', 'ipotek fekki davası', 'üst sınır ipoteği', 'anapara ipoteği', 'ipotekli alacak'],
            'vekalet sözleşmesi': ['vekil', 'avukatlık vekalet ücreti', 'TBK 502', 'vekilin özen borcu', 'vekilin sadakat borcu', 'vekalet ücreti', 'vekaletsiz iş görme', 'TBK 526', 'vekaletin kötüye kullanımı'],
            'adam çalıştıranın sorumluluğu': ['istihdam edenin sorumluluğu', 'TBK 66', 'TBK 66', 'kurtuluş kanıtı', 'personel seçiminde özen'],
            'yapı sahibinin sorumluluğu': ['bina sahibinin sorumluluğu', 'TBK 69'],
            'cezai şart': ['cayma cezası', 'sözleşme cezası', 'TBK 179', 'TBK 179', 'sözleşme cezası', 'ifaya eklenen cezai şart', 'seçimlik cezai şart'],
            'eser sözleşmesi': ['yüklenici temerrüdü', 'iş bedeli', 'geç teslim', 'TBK 470', 'iş sahibinin seçimlik hakları', 'ayıp ihbarı', 'yüklenicinin sorumluluğu'],
        }),
        asciiAliases: canonicalAliasMap({
            'kira uyarlama': ['kira uyarlama', 'kira tespit davası', 'kira artış oranı', 'TÜFE kira artışı', 'TBK 344', 'beş yıllık kira artışı'],
            'aşırı ifa güçlüğü': ['asiri ifa guclugu', 'TBK 138', 'beklenmedik hal', 'olağanüstü durum', 'savaş hali', 'pandemi'],
            'emprevizyon': ['emprevizyon'],
            'tehlike sorumluluğu': ['tehlike sorumlulugu', 'TBK 71', 'çevre sorumluluğu', 'yapı sorumluluğu', 'motorlu taşıt sorumluluğu'],
            'arsa payı karşılığı inşaat sözleşmesi': ['arsa payi karsiligi insaat sozlesmesi', 'kat karşılığı inşaat', 'müteahhidin temerrüdü', 'bağımsız bölüm devri', 'eksik iş bedeli', 'gecikme tazminatı'],
            'çevre kirliliği': ['cevre kirliligi', 'TBK 71', 'çevre kanunu', 'çevresel etki değerlendirmesi', 'ÇED raporu', 'kirletici öder ilkesi'],
            'cezai şart': ['cezai sart', 'TBK 179', 'sözleşme cezası', 'ifaya eklenen cezai şart', 'seçimlik cezai şart'],
            'kefalet': ['kefalet', 'muteselsil kefalet', 'TBK 583', 'adi kefilin defteri', 'müteselsil kefilin sorumluluğu', 'kefilin rücu hakkı', 'eşin rızası'],
            'tahliye davası': ['tahliye davasi', 'TBK 350', 'TBK 351', 'TBK 352', 'ihtiyaç sebebiyle tahliye', 'yeni malikin tahliye talebi', 'tahliye taahhüdü'],
            'trafik kazası tazminatı': ['trafik kazasi tazminati', 'kusur raporu', 'aktüer hesaplama', 'maluliyet raporu', 'sürekli iş göremezlik'],
            'destekten yoksun kalma': ['destekten yoksun kalma', 'hesaplama yöntemi', 'aktüer raporu', 'PMF tablosu', 'TBK 53', 'destek tazminatı hesabı', 'TRH tablosu', 'bilinen dönem', 'bilinmeyen dönem'],
            'kat mülkiyeti': ['kat mulkiyeti', 'KMK 18', 'ortak gider payı', 'kat malikleri kurulu', 'yönetici seçimi', 'aidat borcu davası'],
            'ipotek': ['ipotek', 'ipotek tesisi', 'ipotek fekki davası', 'üst sınır ipoteği', 'anapara ipoteği', 'ipotekli alacak'],
            'taşınmaz satış vaadi': ['tasinmaz satis vaadi'],
        }),
        negativeMarkers: ['boşanma', 'tutuklama', 'vergi ziyaı'],
        queryTemplates: ['{required}', '{required} {support}'],
    },
};

const DOMAIN_ALIAS_MAP = {
    hukuk: 'genel_hukuk',
    genel_hukuk: 'genel_hukuk',
    is: 'is_hukuku',
    is_hukuku: 'is_hukuku',
    ishukuku: 'is_hukuku',
    ceza: 'ceza',
    ceza_hukuku: 'ceza',
    idare: 'idare',
    idare_hukuku: 'idare',
    vergi: 'vergi',
    vergi_hukuku: 'vergi',
    anayasa: 'anayasa',
    anayasa_hukuku: 'anayasa',
    aile: 'aile',
    aile_hukuku: 'aile',
    ticaret: 'ticaret',
    ticaret_hukuku: 'ticaret',
    icra: 'icra',
    icra_hukuku: 'icra',
    icra_iflas: 'icra',
    icra_iflas_hukuku: 'icra',
    miras: 'miras',
    miras_hukuku: 'miras',
    tuketici: 'tuketici',
    tuketici_hukuku: 'tuketici',
    sigorta: 'sigorta',
    sigorta_hukuku: 'sigorta',
    borclar: 'borclar',
    borclar_hukuku: 'borclar',
    // Sub-domain aliases — AI often returns these specific area names
    saglik: 'ceza',
    saglik_hukuku: 'ceza',
    tibbi_malpraktis: 'ceza',
    tibbi_hukuk: 'ceza',
    kamulastirma: 'idare',
    kamulastirma_hukuku: 'idare',
    bankacilik: 'ticaret',
    bankacilik_hukuku: 'ticaret',
    fikri_ve_sinai_haklar: 'ticaret',
    fikri_mulkiyet: 'ticaret',
    fikri_mulkiyet_hukuku: 'ticaret',
    sinai_mulkiyet: 'ticaret',
    marka_hukuku: 'ticaret',
    patent_hukuku: 'ticaret',
    telif_hakki: 'ticaret',
    deniz_ticaret: 'ticaret',
    deniz_ticaret_hukuku: 'ticaret',
    deniz_hukuku: 'ticaret',
    gayrimenkul: 'borclar',
    gayrimenkul_hukuku: 'borclar',
    insaat_hukuku: 'borclar',
    insaat: 'borclar',
    esya: 'borclar',
    esya_hukuku: 'borclar',
    cevre: 'borclar',
    cevre_hukuku: 'borclar',
    basin: 'ceza',
    basin_hukuku: 'ceza',
    medya_hukuku: 'ceza',
    kisisel_verilerin_korunmasi: 'ceza',
    kvkk: 'ceza',
    bilisim: 'ceza',
    bilisim_hukuku: 'ceza',
    bilisim_suclari: 'ceza',
    siber_suclar: 'ceza',
    sendikal_hukuk: 'is_hukuku',
    sosyal_guvenlik: 'is_hukuku',
    sosyal_guvenlik_hukuku: 'is_hukuku',
    transfer_fiyatlandirmasi: 'vergi',
    dis_ticaret: 'ticaret',
    spor: 'genel_hukuk',
    spor_hukuku: 'genel_hukuk',
    enerji: 'idare',
    enerji_hukuku: 'idare',
    uluslararasi: 'genel_hukuk',
    uluslararasi_hukuk: 'genel_hukuk',
    devletler_hukuku: 'genel_hukuk',
    vatandaslik: 'idare',
    vatandaslik_hukuku: 'idare',
    yabancilar_hukuku: 'idare',
    medeni_hukuk: 'borclar',
    kisiler_hukuku: 'genel_hukuk',
    yargilama_hukuku: 'genel_hukuk',
    usul_hukuku: 'genel_hukuk',
    ceza_muhakemesi: 'ceza',
    medeni_usul: 'genel_hukuk',
    idari_yargilama: 'idare',
    noterlik_hukuku: 'genel_hukuk',
    avukatlik_hukuku: 'genel_hukuk',
    tasima_hukuku: 'ticaret',
    rekabet_hukuku: 'ticaret',
    tuketici_haklari: 'tuketici',
    kira_hukuku: 'borclar',
    tapu_hukuku: 'borclar',
    sirketler_hukuku: 'ticaret',
};

const mergeCanonicalAliasEntries = (base = {}, additions = {}) => {
    const merged = { ...(base || {}) };
    Object.entries(additions || {}).forEach(([key, values]) => {
        const normalizedKey = normalizeMatchText(key);
        if (!normalizedKey) return;
        merged[normalizedKey] = dedupeByMatchKey([
            ...(merged[normalizedKey] || []),
            ...(Array.isArray(values) ? values : []),
        ], 40);
    });
    return merged;
};

const DOMAIN_PROFILE_CANONICAL_EXPANSIONS = {
    ceza: [
        'kasten oldurme', 'cinsel istismar', 'hirsizlik', 'nitelikli hirsizlik',
        'guveni kotuye kullanma', 'resmi belgede sahtecilik', 'tehdit', 'hakaret',
        'silahli orgut', 'orgut propagandasi', 'mala zarar verme', 'yagma',
        'gorevi kotuye kullanma', 'zimmet', 'irtikap', 'rüşvet', 'bilisim dolandiriciligi',
        'dolandiricilik', 'kasten yaralama', 'meskun mahalde ates etme',
    ],
    is_hukuku: [
        'ucret alacagi', 'yillik izin ucreti', 'hafta tatili', 'ubgt',
        'is guvencesi', 'fesih bildirimi', 'performans dusuklugu', 'savunma almama',
        'alt isveren iliskisi', 'hizmet tespiti', 'is kazasi tazminati', 'meslek hastaligi',
        'esit davranma ilkesi', 'sendikal tazminat', 'bosta gecen sure ucreti', 'ise baslatmama tazminati',
    ],
    aile: [
        'evlilik birliginin temelinden sarsilmasi', 'maddi tazminat', 'manevi tazminat', 'istirak nafakasi',
        'yoksulluk nafakasi', 'tedbir nafakasi', 'cocugun ustun yarari', 'aile konutu',
        'soybagi', 'babalik davasi', '6284 sayili kanun', 'mal paylasimi',
        'katilma alacagi', 'aile konutu serhi', 'koruyucu tedbir', 'uzaklastirma',
    ],
    icra: [
        'itirazin kaldirilmasi', 'kambiyo takibi', 'imzaya itiraz', 'haciz',
        'haczedilemezlik', 'ihalenin feshi', 'kiymet takdiri', 'konkordato',
        'ipotegin paraya cevrilmesi', 'takibin iptali', 'borca itiraz', 'sira cetveli',
        'iflas', 'rehnin paraya cevrilmesi', 'maas haczi', 'tahsil harci',
    ],
    vergi: [
        'tarhiyatin iptali', 'vergi cezasi', 'vuk 359', 'sahte belge',
        'muhteviyati itibariyla yaniltici belge', 'uzlasma', 'odeme emri', 'e-defter',
        'e-fatura', 'kurumlar vergisi', 'gelir vergisi', 'kdv iadesi',
    ],
    tuketici: [
        'hakem heyeti karari', 'mesafeli satis', 'garanti belgesi', 'servis kaydi',
        'paket tur', 'abonelik sozlesmesi', 'bedel indirimi', 'urun degisimi',
        'onarim hakki', 'on bilgilendirme', 'konut satisi', 'devre tatil',
    ],
    sigorta: [
        'sigorta tahkim komisyonu', 'eksper raporu', 'riziko', 'pert total',
        'alkollu surus', 'munhasiran illiyet', 'zorunlu mali sorumluluk', 'hasar dosyasi',
        'yangin sigortasi', 'saglik sigortasi', 'hayat sigortasi', 'is durmasi zarari',
        'sovtaj', 'muafiyet', 'sigorta genel sartlari',
    ],
    ticaret: [
        'ortaklar kurulu', 'sermaye artirimi', 'tasfiye', 'tasdik',
        'marka hakki', 'patent hakki', 'ticari faiz', 'cari hesap',
        'kiymetli evrak', 'iflas', 'sira cetveli', 'tasima hukuku',
        'acentelik', 'dis ticaret', 'rekabet yasagi', 'ticari temsilci',
    ],
    gayrimenkul: [
        'tapu iptali ve tescil', 'muris muvazaasi', 'ortakligin giderilmesi', 'elatmanin onlenmesi',
        'ecrimisil', 'kira tahliye', 'kira tespiti', 'kat karsiligi insaat',
        'tasinmaz satis vaadi', 'kat mulkiyeti', 'yonetim plani', 'aidat borcu',
        'ortak alan', 'irtifak hakki', 'komsuluk hukuku', 'muvazaali devir',
        'payli mulkiyet', 'elbirligi mulkiyeti', 'kamulastirmasiz el atma', 'imar uygulamasi',
    ],
    borclar: [
        'borcun ifasi', 'borca aykirilik', 'alacak davasi', 'munzam zarar',
        'menfi zarar', 'muspet zarar', 'vekaletsiz is gorme', 'alacagin temliki',
        'kefalet sozlesmesi', 'cezai sart', 'eser sozlesmesi', 'adi ortaklik',
        'komisyon sozlesmesi', 'sebepsiz zenginlesme iadesi', 'temerrut faizi', 'ticari olmayan faiz',
    ],
    miras: [
        'vasiyetnamenin iptali', 'mirasin paylastirilmasi', 'veraset ilami', 'miras sozlesmesi',
        'mirasciliktan cikarma', 'olume bagli tasarruf', 'fiil ehliyeti', 'sakli pay ihlali',
        'reddi miras', 'paylasma sozlesmesi', 'art mirasci', 'miras payi devri',
    ],
    idare: [
        'idari para cezasi', 'disiplin cezasi', 'ruhsat iptali', 'kamulastirmasiz el atma',
        'savunma hakki', 'yetki unsuru', 'sebep unsuru', 'konu unsuru',
        'amac unsuru', 'sekil unsuru', 'olcululuk ilkesi', 'hukuki guvenlik ilkesi',
        'kazanilmis hak', 'belediye encumeni', 'imar para cezasi', 'yikim karari',
    ],
};

const DOMAIN_PROFILE_TURKISH_ALIAS_EXPANSIONS = {
    gayrimenkul: {
        'tapu iptali ve tescil': ['tapu iptali', 'tescil davasi', 'tapu kaydinin duzeltilmesi', 'yolsuz tescil'],
        'muris muvazaasi': ['mirastan mal kacirma', 'danisikli satis', 'gizli bagis'],
        'ortakligin giderilmesi': ['izalei suyu', 'paydasligin giderilmesi', 'aynen taksim', 'satis suretiyle ortakligin giderilmesi'],
        'elatmanin onlenmesi': ['müdahalenin meni', 'mudahalenin men i', 'fuzuli isgalin onlenmesi', 'tasinmaza mudahalenin onlenmesi'],
        'ecrimisil': ['haksiz isgal tazminati', 'ecrimisil bedeli', 'fuzuli isgal'],
        'kira tahliye': ['tahliye davasi', 'ihtiyac nedeniyle tahliye', 'tahliye taahhudu', 'kiracinin tahliyesi'],
        'kira tespiti': ['kira bedelinin tespiti', 'tbk 344', 'uyarlama kira', 'tufe kira artisi'],
        'kat karsiligi insaat': ['arsa payi karsiligi insaat', 'müteahhidin temerrudu', 'bagimsiz bolum devri'],
        'tasinmaz satis vaadi': ['satis vaadi sozlesmesi', 'tapuya serh', 'on sozlesme'],
        'kat mulkiyeti': ['kat malikleri kurulu', 'yonetici secimi', 'ortak gider', 'yönetim plani'],
    },
};

const DOMAIN_PROFILE_ASCII_ALIAS_EXPANSIONS = {
    gayrimenkul: {
        'tapu iptali ve tescil': ['tapu iptali', 'tescil davasi', 'tapu kaydinin duzeltilmesi', 'yolsuz tescil'],
        'muris muvazaasi': ['muris muvazaasi', 'mirastan mal kacirma', 'danisikli satis', 'gizli bagis'],
        'ortakligin giderilmesi': ['ortakligin giderilmesi', 'izalei suyu', 'aynen taksim', 'satis suretiyle ortakligin giderilmesi'],
        'elatmanin onlenmesi': ['elatmanin onlenmesi', 'mudahalenin meni', 'tasinmaza mudahalenin onlenmesi'],
        'ecrimisil': ['ecrimisil', 'haksiz isgal tazminati', 'fuzuli isgal'],
        'kira tahliye': ['kira tahliye', 'tahliye davasi', 'ihtiyac nedeniyle tahliye', 'tahliye taahhudu'],
        'kira tespiti': ['kira tespiti', 'kira bedelinin tespiti', 'tbk 344', 'uyarlama kira'],
        'kat karsiligi insaat': ['kat karsiligi insaat', 'arsa payi karsiligi insaat', 'muteahhidin temerrudu'],
        'tasinmaz satis vaadi': ['tasinmaz satis vaadi', 'satis vaadi sozlesmesi', 'tapuya serh'],
        'kat mulkiyeti': ['kat mulkiyeti', 'kat malikleri kurulu', 'ortak gider', 'yonetim plani'],
    },
};

const ensureExpandedDomainProfiles = () => {
    if (!LEGAL_DOMAIN_PROFILES.gayrimenkul) {
        LEGAL_DOMAIN_PROFILES.gayrimenkul = {
            id: 'gayrimenkul',
            label: 'Gayrimenkul Hukuku',
            primarySources: ['yargitay'],
            secondarySources: [],
            preferredBirimCodes: ['H1', 'H3', 'H6', 'H14', 'HGK'],
            canonicalConcepts: [],
            turkishAliases: canonicalAliasMap({}),
            asciiAliases: canonicalAliasMap({}),
            negativeMarkers: ['ceza dairesi', 'vergi ziyai', 'uyusturucu', 'bireysel basvuru'],
            queryTemplates: ['{required}', '{required} {support}', '"{required}" {support}'],
        };
    }

    Object.entries(DOMAIN_PROFILE_CANONICAL_EXPANSIONS).forEach(([domainId, concepts]) => {
        const profile = LEGAL_DOMAIN_PROFILES[domainId];
        if (!profile) return;
        profile.canonicalConcepts = dedupeByMatchKey([
            ...(profile.canonicalConcepts || []),
            ...concepts,
        ], 64);
    });

    Object.entries(DOMAIN_PROFILE_TURKISH_ALIAS_EXPANSIONS).forEach(([domainId, aliases]) => {
        const profile = LEGAL_DOMAIN_PROFILES[domainId];
        if (!profile) return;
        profile.turkishAliases = mergeCanonicalAliasEntries(profile.turkishAliases, aliases);
    });

    Object.entries(DOMAIN_PROFILE_ASCII_ALIAS_EXPANSIONS).forEach(([domainId, aliases]) => {
        const profile = LEGAL_DOMAIN_PROFILES[domainId];
        if (!profile) return;
        profile.asciiAliases = mergeCanonicalAliasEntries(profile.asciiAliases, aliases);
    });

    if (!DOMAIN_IDS.includes('gayrimenkul')) {
        DOMAIN_IDS.splice(DOMAIN_IDS.indexOf('borclar'), 0, 'gayrimenkul');
    }
};

Object.assign(DOMAIN_ALIAS_MAP, {
    gayrimenkul: 'gayrimenkul',
    gayrimenkul_hukuku: 'gayrimenkul',
    tapu_hukuku: 'gayrimenkul',
    kira_hukuku: 'gayrimenkul',
    esya_hukuku: 'gayrimenkul',
    esya: 'gayrimenkul',
    insaat_hukuku: 'gayrimenkul',
    insaat: 'gayrimenkul',
    kat_mulkiyeti: 'gayrimenkul',
    tasinmaz_hukuku: 'gayrimenkul',
});

export const normalizeDomainId = (value = '', fallback = '') => {
    const normalized = normalizeMatchText(value).replace(/\s+/g, '_');
    if (!normalized) return fallback;
    return DOMAIN_ALIAS_MAP[normalized] || normalized;
};

export const getDomainProfile = (value = '') =>
    LEGAL_DOMAIN_PROFILES[normalizeDomainId(value, DEFAULT_DOMAIN_PROFILE_ID)] || LEGAL_DOMAIN_PROFILES[DEFAULT_DOMAIN_PROFILE_ID];

export const dedupeByMatchKey = (values = [], limit = Infinity) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : []) {
        const raw = normalizeDisplayText(value);
        const key = normalizeMatchText(raw);
        if (!raw || !key || seen.has(key)) continue;
        seen.add(key);
        unique.push(raw);
        if (unique.length >= limit) break;
    }

    return unique;
};

ensureExpandedDomainProfiles();

const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSignalSet = (profile) => [
    ...(profile?.canonicalConcepts || []),
    ...Object.keys(profile?.turkishAliases || {}).flatMap((key) => [key, ...(profile.turkishAliases[key] || [])]),
    ...Object.keys(profile?.asciiAliases || {}).flatMap((key) => [key, ...(profile.asciiAliases[key] || [])]),
];

const hasSignalMatch = (haystack = '', signal = '') => {
    const normalizedSignal = normalizeMatchText(signal);
    if (!haystack || !normalizedSignal) return false;

    const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedSignal)}(?=$|\\s)`);
    return pattern.test(haystack);
};

export const detectPrimaryDomain = ({ rawText = '', concepts = [] } = {}) => {
    const haystack = normalizeMatchText([rawText, ...(Array.isArray(concepts) ? concepts : [])].join(' '));
    if (!haystack) return DEFAULT_DOMAIN_PROFILE_ID;

    let bestDomain = DEFAULT_DOMAIN_PROFILE_ID;
    let bestScore = 0;

    Object.values(LEGAL_DOMAIN_PROFILES).forEach((profile) => {
        const signals = buildSignalSet(profile);
        const score = signals.reduce((total, signal) => total + (hasSignalMatch(haystack, signal) ? 1 : 0), 0);
        if (score > bestScore) {
            bestScore = score;
            bestDomain = profile.id;
        }
    });

    return bestDomain;
};

export const getConceptVariants = (domainId = DEFAULT_DOMAIN_PROFILE_ID, concept = '') => {
    const raw = normalizeDisplayText(concept);
    if (!raw) return [];
    const profile = getDomainProfile(domainId);
    const key = normalizeMatchText(raw);
    return dedupeByMatchKey([
        raw,
        ...(profile?.turkishAliases?.[key] || []),
        ...(profile?.asciiAliases?.[key] || []),
    ]);
};

export const canonicalizeConcepts = ({ domainId = DEFAULT_DOMAIN_PROFILE_ID, values = [], fallbackConcepts = [], limit = 6 } = {}) => {
    const profile = getDomainProfile(domainId);
    const pool = dedupeByMatchKey([...(Array.isArray(values) ? values : []), ...(Array.isArray(fallbackConcepts) ? fallbackConcepts : [])]);
    const matchedCanonicals = [];
    const seenCanonicals = new Set();

    for (const candidate of pool) {
        const candidateKey = normalizeMatchText(candidate);
        const canonical = (profile.canonicalConcepts || []).find((item) => {
            const variants = getConceptVariants(domainId, item);
            return variants.some((variant) => candidateKey.includes(normalizeMatchText(variant)) || normalizeMatchText(variant).includes(candidateKey));
        });

        const value = canonical || candidate;
        const key = normalizeMatchText(value);
        if (!key || seenCanonicals.has(key)) continue;
        seenCanonicals.add(key);
        matchedCanonicals.push(normalizeDisplayText(value));
        if (matchedCanonicals.length >= limit) break;
    }

    if (matchedCanonicals.length > 0) return matchedCanonicals;
    return dedupeByMatchKey(profile.canonicalConcepts || [], limit);
};

export const getProfileSearchHints = (domainId = DEFAULT_DOMAIN_PROFILE_ID) => {
    const profile = getDomainProfile(domainId);
    return dedupeByMatchKey(profile.canonicalConcepts || [], 8);
};

export const inferSourceTargetsFromDomain = (domainId = DEFAULT_DOMAIN_PROFILE_ID) => {
    const profile = getDomainProfile(domainId);
    return dedupeByMatchKey(profile.primarySources || [], 2);
};

export const getNegativeConceptsForDomain = (domainId = DEFAULT_DOMAIN_PROFILE_ID) => {
    const profile = getDomainProfile(domainId);
    return dedupeByMatchKey(profile.negativeMarkers || [], 6);
};

