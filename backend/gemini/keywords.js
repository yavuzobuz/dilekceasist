import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

const STOPWORDS = new Set([
    've', 'veya', 'ile', 'olan', 'olduğu', 'oldugu', 'iddia', 'edilen',
    'üzerine', 'uzerine', 'kapsamında', 'kapsaminda', 'gibi', 'daha', 'çok', 'cok',
    'için', 'icin', 'üzere', 'uzere', 'bu', 'şu', 'su', 'o', 'bir', 'de', 'da',
    'mi', 'mı', 'mu', 'mü', 'ki', 'ise', 'hem', 'ne', 'ya', 'ben', 'sen', 'biz',
    'siz', 'onlar', 'benim', 'senin', 'onun', 'ama', 'fakat', 'ancak', 'eger',
    'eğer', 'halde', 'rağmen', 'ragmen', 'bile', 'dahi', 'kadar', 'sonra', 'önce',
    'once', 'yani', 'zaten', 'sadece', 'yalniz', 'yalnız', 'hep', 'her', 'hiç',
    'hic', 'diye', 'bana', 'beni', 'sana', 'seni', 'ona', 'onu', 'bize', 'size',
    'olarak', 'tarafindan', 'tarafından', 'hakkinda', 'hakkında', 'ilgili', 'gore',
    'göre', 'karsi', 'karşı', 'dolayı', 'dolayi', 'neden', 'nasil', 'nasıl',
    'misin', 'musunuz', 'mısınız', 'lutfen', 'lütfen',
]);

const DRAFTING_TERMS = new Set([
    'dilekce', 'dilekçe', 'savunma', 'belge', 'sozlesme', 'sözleşme', 'taslak',
    'yaz', 'yazalim', 'hazirla', 'hazırla', 'olustur', 'oluştur', 'uret', 'üret',
    'detayli', 'detaylı', 'olmasi', 'olması', 'olmali', 'olmalı', 'koruyacak',
    'haklarini', 'haklarını', 'muvekkil', 'müvekkil', 'muvekkilin', 'müvekkilin',
    'vekil', 'vekili', 'bana', 'lutfen', 'lütfen', 'yardim', 'yardım', 'hazir',
    'hazır', 'yapalim', 'yapalım',
]);

const normalizeKeyword = (value = '') => {
    return String(value || '')
        .replace(/[""\"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const keywordKey = (value = '') => normalizeKeyword(value).toLocaleLowerCase('tr-TR');

const isWeakKeyword = (value = '') => {
    const normalized = normalizeKeyword(value);
    if (!normalized || normalized.length < 3) return true;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 1 && STOPWORDS.has(words[0].toLocaleLowerCase('tr-TR'))) return true;
    const nonStopCount = words.filter((word) => !STOPWORDS.has(word.toLocaleLowerCase('tr-TR'))).length;
    if (nonStopCount === 0) return true;
    if (words.length === 1 && DRAFTING_TERMS.has(words[0].toLocaleLowerCase('tr-TR'))) return true;
    return false;
};

const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const ADDRESS_HINT_REGEX = /\b(mahallesi|mah|sokak|sok|cadde|cad|bulvar|bulvari|apartman|apt|bina|daire|blok|kapi|no)\b/i;
const PERSON_NAME_REGEX = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2}$/;
const BARE_MADDE_REGEX = /^\d{1,3}\.?\s*maddesi?$/i;
const LAW_REFERENCE_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|i\.?\s*i\.?\s*k|ttk|vuk|kmk|fsek|anayasa|imar kanunu|is kanunu|borclar kanunu)\b/i;

const normalizeAmbiguousMaddeKeyword = (value = '', analysisText = '') => {
    const normalized = normalizeKeyword(value);
    if (!normalized) return '';

    const maddeMatch = normalized.match(/^(\d{1,3})\.?\s*maddesi?$/i);
    if (!maddeMatch) return normalized;

    const maddeNo = maddeMatch[1];
    const lowerAnalysis = String(analysisText || '').toLocaleLowerCase('tr-TR');

    if ((maddeNo === '32' || maddeNo === '42') && /(imar|ruhsat|ruhsatsiz|yapi|yikim|imar barisi)/i.test(lowerAnalysis)) {
        return `3194 sayili Imar Kanunu ${maddeNo}. madde`;
    }

    return '';
};

const isNoisyKeyword = (value = '') => {
    const normalized = normalizeKeyword(value);
    if (!normalized) return true;

    if (DATE_ONLY_REGEX.test(normalized)) return true;
    if (DIGITS_ONLY_REGEX.test(normalized)) return true;
    if (ADDRESS_HINT_REGEX.test(normalized)) return true;
    if (PERSON_NAME_REGEX.test(normalized)) return true;
    if (BARE_MADDE_REGEX.test(normalized) && !LAW_REFERENCE_REGEX.test(normalized)) return true;

    return false;
};

const pickFirst = (regex, text) => {
    const match = String(text || '').match(regex);
    return match ? normalizeKeyword(match[0]) : '';
};

// ═══════════════════════════════════════════════════════════════
// 200 LEGAL DOMAIN PATTERNS — All Turkish Law Branches
// ═══════════════════════════════════════════════════════════════
const LEGAL_DOMAIN_PATTERNS = [
    // ─────────────────────────────────────────────
    // 1. CEZA HUKUKU — Hayata Karşı Suçlar (TCK 81-85)
    // ─────────────────────────────────────────────
    // 1. CEZA HUKUKU (25 Alt Kategori - TCK Tam Kapsam)
    // ─────────────────────────────────────────────

    // 1. Uluslararası Suçlar (TCK 76-78)
    { regex: /soykırım|insanlığa karşı suç/i, keywords: ['soykırım suçu'] },

    // 2. Göçmen Kaçakçılığı ve İnsan Ticareti (TCK 79-80)
    { regex: /göçmen kaçakçılığı|gocmen kacakciligi/i, keywords: ['göçmen kaçakçılığı'] },
    { regex: /insan ticareti|organ ticareti/i, keywords: ['insan ticareti'] },

    // 3. Hayata Karşı Suçlar (TCK 81-85)
    { regex: /kasten öldürme|kasten oldurme|adam öldürme|adam oldurme/i, keywords: ['kasten öldürme'] },
    { regex: /taksirle öldürme|taksirle oldurme/i, keywords: ['taksirle öldürme'] },
    { regex: /intihara yönlendirme|intihara teşvik/i, keywords: ['intihara yönlendirme'] },
    { regex: /cinayet/i, keywords: ['kasten öldürme suçu'] },

    // 4. Vücut Dokunulmazlığına Karşı Suçlar (TCK 86-93)
    { regex: /kasten yaralama/i, keywords: ['kasten yaralama'] },
    { regex: /taksirle yaralama/i, keywords: ['taksirle yaralama'] },
    { regex: /eziyet/i, keywords: ['eziyet suçu'] },
    { regex: /müessir fiil/i, keywords: ['kasten yaralama'] },
    { regex: /işkence suçu|iskence sucu/i, keywords: ['işkence suçu'] },

    // 5. Koruma, Gözetim veya Bildirim Yükümlülüğünün İhlali (TCK 97-98)
    { regex: /terk suçu|yardım etmeme|yardim etmeme/i, keywords: ['terk suçu'] },

    // 6. Çocuk Düşürtme veya Düşürme (TCK 99-101)
    { regex: /çocuk düşürtme|kürtaj/i, keywords: ['çocuk düşürtme suçu'] },

    // 7. Cinsel Dokunulmazlığa Karşı Suçlar (TCK 102-105)
    { regex: /cinsel saldırı/i, keywords: ['cinsel saldırı suçu'] },
    { regex: /cinsel istismar|çocuk istismarı|cocuk istismari/i, keywords: ['çocuğun cinsel istismarı'] },
    { regex: /reşit olmayanla cinsel ilişki|resit olmayanla/i, keywords: ['reşit olmayanla cinsel ilişki'] },
    { regex: /cinsel taciz/i, keywords: ['cinsel taciz'] },
    { regex: /tecavüz|tecavuz/i, keywords: ['cinsel saldırı suçu'] },

    // 8. Hürriyete Karşı Suçlar (TCK 106-124)
    { regex: /(?:tehdit)/i, keywords: ['tehdit suçu'] },
    { regex: /(?:şantaj|santaj)/i, keywords: ['şantaj suçu'] },
    { regex: /kişi(?:yi)? hürriyetinden yoksun|hürriyeti kısıtlama|özgürlüğü kısıtlama/i, keywords: ['kişi hürriyetinden yoksun kılma'] },
    { regex: /konut dokunulmazlığı|eve girme|konuta girme/i, keywords: ['konut dokunulmazlığının ihlali'] },
    { regex: /iş ve çalışma hürriyeti|iş özgürlüğü/i, keywords: ['iş ve çalışma hürriyetinin ihlali'] },

    // 9. Şerefe Karşı Suçlar (TCK 125-131)
    { regex: /(?:hakaret)/i, keywords: ['hakaret suçu'] },
    { regex: /kişinin hatırasına hakaret/i, keywords: ['kişinin hatırasına hakaret'] },
    { regex: /cumhurbaşkanına hakaret/i, keywords: ['cumhurbaşkanına hakaret'] },

    // 10. Özel Hayata ve Hayatın Gizli Alanına Karşı Suçlar (TCK 132-140)
    { regex: /özel hayatın gizliliği|gizlilik ihlali|özel hayat/i, keywords: ['özel hayatın gizliliğini ihlal'] },
    { regex: /haberleşmenin gizliliği|telefon dinleme|iletişim gizliliği/i, keywords: ['haberleşmenin gizliliğini ihlal'] },
    { regex: /verileri kaydetme|hukuka aykırı kişisel veri/i, keywords: ['kişisel verilerin kaydedilmesi'] },

    // 11. Malvarlığına Karşı Suçlar (TCK 141-169)
    { regex: /(?:hırsızlık|hirsizlik)/i, keywords: ['hırsızlık suçu'] },
    { regex: /(?:yağma|gasp)/i, keywords: ['yağma suçu'] },
    { regex: /(?:dolandırıcılık|dolandiricilik)/i, keywords: ['dolandırıcılık suçu'] },
    { regex: /nitelikli dolandırıcılık/i, keywords: ['nitelikli dolandırıcılık'] },
    { regex: /güveni kötüye kullanma|guveni kotuye kullanma/i, keywords: ['güveni kötüye kullanma'] },
    { regex: /(?:mala zarar|zarar verme)/i, keywords: ['mala zarar verme'] },
    { regex: /hıleli iflas|hileli iflas/i, keywords: ['hileli iflas suçu'] },
    { regex: /bedelsiz senedi kullanma/i, keywords: ['bedelsiz senedi kullanma'] },
    { regex: /karşılıksız yararlanma|karşılıksız faydalanma/i, keywords: ['karşılıksız yararlanma'] },

    // 12. Genel Tehlike Yaratan Suçlar (TCK 170-174)
    { regex: /genel güvenliğin kasten tehlikeye/i, keywords: ['genel güvenliğin kasten tehlikeye sokulması'] },
    { regex: /trafik güvenliğini|alkollü araç|ehliyetsiz araç/i, keywords: ['trafik güvenliğini tehlikeye sokma'] },
    { regex: /trafik kazası|trafik kazasi/i, keywords: ['trafik kazası'] },

    // 13. Çevreye Karşı Suçlar (TCK 181-184)
    { regex: /çevrenin kasten kirletilmesi/i, keywords: ['çevrenin kasten kirletilmesi'] },
    { regex: /imar kirliliği|kaçak yapı|ruhsatsız yapı/i, keywords: ['imar kirliliğine neden olma'] },

    // 14. Kamunun Sağlığına Karşı Suçlar (TCK 185-196)
    { regex: /(?:uyuşturucu|uyusturucu).*(?:ticaret|satıc|satic|satış|satis)/i, keywords: ['uyuşturucu ticareti'] },
    { regex: /(?:uyuşturucu|uyusturucu).*(?:kullanma|kullanım|bulundurma)/i, keywords: ['uyuşturucu kullanma'] },
    { regex: /(?:uyuşturucu|uyusturucu).*(?:imal|üret)/i, keywords: ['uyuşturucu imalatı'] },
    { regex: /(?:uyuşturucu|uyusturucu).*(?:nakil|taşıma|sevk)/i, keywords: ['uyuşturucu nakli'] },
    { regex: /kullanım sınırını aşan|kullanim sinirini asan/i, keywords: ['kullanım sınırını aşan miktar'] },
    { regex: /bozulmuş gıda|sahte içki/i, keywords: ['bozulmuş veya değiştirilmiş gıda ticareti'] },

    // 15. Kamu Güvenine Karşı Suçlar (TCK 197-212)
    { regex: /(?:sahtecilik|sahte belge|evrakta sahtecilik)/i, keywords: ['resmi belgede sahtecilik'] },
    { regex: /özel belgede sahtecilik/i, keywords: ['özel belgede sahtecilik'] },
    { regex: /parada sahtecilik/i, keywords: ['parada sahtecilik'] },
    { regex: /mühürde sahtecilik|mühür bozma/i, keywords: ['mühür bozma suçu'] },

    // 16. Kamu Barışına Karşı Suçlar (TCK 213-222)
    { regex: /halkı kin ve düşmanlığa|halki kin/i, keywords: ['halkı kin ve düşmanlığa tahrik'] },
    { regex: /suç işlemek amacıyla örgüt|suç örgütü|örgüt üyesi/i, keywords: ['suç işlemek amacıyla örgüt kurma'] },
    { regex: /suçu ve suçluyu övme/i, keywords: ['suçu ve suçluyu övme'] },

    // 17. Ulaşım Araçlarına veya Sabit Platformlara Karşı Suçlar (TCK 223-224)
    { regex: /ulaşım araçlarının kaçırılması/i, keywords: ['ulaşım araçlarının kaçırılması'] },

    // 18. Genel Ahlaka Karşı Suçlar (TCK 225-229)
    { regex: /müstehcenlik|mustehcen/i, keywords: ['müstehcenlik suçu'] },
    { regex: /fuhuş|fuhus/i, keywords: ['fuhşa teşvik suçu'] },
    { regex: /kumar oynanması|kumar yeri/i, keywords: ['kumar oynanması için yer sağlama'] },

    // 19. Aile Düzenine Karşı Suçlar (TCK 230-234)
    { regex: /birden çok evlilik/i, keywords: ['birden çok evlilik'] },
    { regex: /çocuğun kaçırılması|cocugun kacirilmasi/i, keywords: ['çocuğun kaçırılması'] },

    // 20. Ekonomi, Sanayi ve Ticarete Karşı Suçlar (TCK 235-242)
    { regex: /ihaleye fesat|ihale/i, keywords: ['ihaleye fesat karıştırma'] },
    { regex: /tefecilik|tefeci/i, keywords: ['tefecilik suçu'] },

    // 21. Bilişim Alanında Suçlar (TCK 243-246)
    { regex: /bilişim sistemine girme|bilisim sistemine girme/i, keywords: ['bilişim sistemine girme'] },
    { regex: /bilişim.*engelleme|sistemi engelleme|veri yok etme/i, keywords: ['bilişim sistemini engelleme'] },
    { regex: /banka.*dolandırıcılık|kredi kartı.*dolandırıcılık/i, keywords: ['bilişim dolandırıcılığı'] },

    // 22. Kamu İdaresinin Güvenilirliğine Karşı Suçlar (TCK 247-266)
    { regex: /(?:zimmet)/i, keywords: ['zimmet suçu'] },
    { regex: /(?:rüşvet|rusvet)/i, keywords: ['rüşvet suçu'] },
    { regex: /(?:irtikap|irtikâp)/i, keywords: ['irtikap suçu'] },
    { regex: /görevi kötüye kullanma|gorevi kotuye kullanma/i, keywords: ['görevi kötüye kullanma'] },
    { regex: /görevi ihmal|gorevi ihmal/i, keywords: ['görevi ihmal'] },

    // 23. Adliyeye Karşı Suçlar (TCK 267-298)
    { regex: /iftira/i, keywords: ['iftira suçu'] },
    { regex: /suç uydurma|suc uydurma/i, keywords: ['suç uydurma'] },
    { regex: /yalan tanıklık|yalan taniklik/i, keywords: ['yalan tanıklık'] },
    { regex: /suç delillerini yok etme|delil karartma/i, keywords: ['suç delillerini yok etme'] },

    // 24. Devletin Güvenliğine Karşı Suçlar (TCK 302-308)
    { regex: /devletin gizli sırları|casusluk/i, keywords: ['devlet sırlarına karşı suçlar ve casusluk'] },

    // 25. Anayasal Düzene ve İşleyişine Karşı Suçlar (TCK 309-316)
    { regex: /terör örgütü|teror orgutu|terör|silahlı terör/i, keywords: ['silahlı terör örgütü'] },
    { regex: /cumhurbaşkanına suikast/i, keywords: ['cumhurbaşkanına suikast ve fiili saldırı'] },
    { regex: /terör propagandası|propaganda/i, keywords: ['terör propagandası'] },

    // --- Genel Ceza Kavramları ---
    { regex: /(?:beraat|berâat)/i, keywords: ['beraat kararı'] },
    { regex: /(?:mahkumiyet|mahkûmiyet)/i, keywords: ['mahkumiyet kararı'] },
    { regex: /haksız tahrik|haksiz tahrik/i, keywords: ['haksız tahrik indirimi'] },
    { regex: /meşru müdafaa|mesru mudafaa|meşru savunma/i, keywords: ['meşru müdafaa'] },
    { regex: /erteleme|hapis.*ertel/i, keywords: ['cezanın ertelenmesi'] },
    { regex: /(?:hagb|hükmün açıklanmasının geri bırakılması)/i, keywords: ['HAGB'] },
    { regex: /adli para cezası|adli para cezasi/i, keywords: ['adli para cezası'] },
    { regex: /denetimli serbestlik/i, keywords: ['denetimli serbestlik'] },
    { regex: /tutuklama|tutuklu/i, keywords: ['tutukluluk'] },
    { regex: /gözaltı|gozalti/i, keywords: ['gözaltı'] },
    { regex: /müsadere|musadere|elkoyma/i, keywords: ['müsadere'] },
    { regex: /iyi hal indirimi|iyi hâl/i, keywords: ['iyi hal indirimi'] },
    { regex: /tekerrür|tekerrur/i, keywords: ['tekerrür'] },
    { regex: /içtima|ictima/i, keywords: ['suçların içtimaı'] },
    { regex: /teşebbüs|tesebbüs/i, keywords: ['suça teşebbüs'] },
    { regex: /iştirak|istirak|azmettirme|yardım etme/i, keywords: ['suça iştirak'] },
    { regex: /uzlaşma|uzlasma|uzlaştırma/i, keywords: ['uzlaşma'] },
    { regex: /şikâyet|sikayet|şikayetten vazgeçme/i, keywords: ['şikayete bağlı suç'] },
    { regex: /zamanaşımı|zaman ?asimi|dava zamanaşımı/i, keywords: ['zamanaşımı'] },
    { regex: /ceza muhakemesi|CMK/i, keywords: ['ceza muhakemesi'] },
    { regex: /temyiz.*ceza|ceza.*temyiz/i, keywords: ['ceza temyiz'] },
    { regex: /istinaf.*ceza|ceza.*istinaf/i, keywords: ['ceza istinaf'] },
    { regex: /infaz|cezaevi|hükümlü/i, keywords: ['ceza infaz'] },
    { regex: /koşullu salıverilme|kosullu saliverilme|şartla tahliye/i, keywords: ['koşullu salıverilme'] },

    // ─────────────────────────────────────────────
    // 2. İŞ HUKUKU
    // ─────────────────────────────────────────────
    { regex: /kıdem tazminatı|kidem tazminati/i, keywords: ['kıdem tazminatı'] },
    { regex: /ihbar tazminatı|ihbar tazminati/i, keywords: ['ihbar tazminatı'] },
    { regex: /işe iade|ise iade/i, keywords: ['işe iade davası'] },
    { regex: /haksız fesih|haksiz fesih/i, keywords: ['haksız fesih'] },
    { regex: /haklı fesih|hakli fesih|haklı nedenle fesih/i, keywords: ['haklı nedenle fesih'] },
    { regex: /geçerli fesih|gecerli fesih|geçerli neden/i, keywords: ['geçerli nedenle fesih'] },
    { regex: /fazla mesai|fazla çalışma|mesai ücreti/i, keywords: ['fazla mesai ücreti'] },
    { regex: /yıllık izin|yillik izin|izin ücreti/i, keywords: ['yıllık izin ücreti'] },
    { regex: /hafta tatili|ulusal bayram|genel tatil/i, keywords: ['ulusal bayram tatil ücreti'] },
    { regex: /asgari ücret|asgari ucret/i, keywords: ['asgari ücret'] },
    { regex: /ücret alacağı|ucret alacagi|maaş alacağı/i, keywords: ['ücret alacağı'] },
    { regex: /mobbing|iş ?yeri baskısı|psikolojik taciz/i, keywords: ['mobbing iş hukuku'] },
    { regex: /iş kazası|is kazasi/i, keywords: ['iş kazası tazminat'] },
    { regex: /meslek hastalığı|meslek hastaligi/i, keywords: ['meslek hastalığı'] },
    { regex: /maluliyet|malul|iş göremezlik/i, keywords: ['iş göremezlik tazminatı'] },
    { regex: /sendika|sendikal tazminat|sendikal fesih/i, keywords: ['sendikal tazminat'] },
    { regex: /toplu iş sözleşmesi|TİS|tis/i, keywords: ['toplu iş sözleşmesi'] },
    { regex: /grev|lokavt/i, keywords: ['grev ve lokavt'] },
    { regex: /alt işveren|alt isveren|taşeron|taseron/i, keywords: ['alt işveren sorumluluğu'] },
    { regex: /asıl işveren|asil isveren/i, keywords: ['asıl işveren müteselsil sorumluluk'] },
    { regex: /iş güvenliği|is guvenligi|iş sağlığı/i, keywords: ['iş sağlığı ve güvenliği'] },
    { regex: /kötü niyet tazminatı|kotu niyet tazminati/i, keywords: ['kötü niyet tazminatı'] },
    { regex: /ayrımcılık tazminatı|ayrimcilik/i, keywords: ['ayrımcılık tazminatı'] },
    { regex: /rekabet yasağı|rekabet yasagi/i, keywords: ['rekabet yasağı'] },
    { regex: /SGK|sigorta primi|prim borcu/i, keywords: ['SGK prim alacağı'] },
    { regex: /emeklilik|emekli/i, keywords: ['emeklilik hukuku'] },
    { regex: /hizmet tespit|hizmet tespiti/i, keywords: ['hizmet tespit davası'] },
    { regex: /rücu.*iş kazası|iş kazası.*rücu/i, keywords: ['iş kazası rücu davası'] },

    // ─────────────────────────────────────────────
    // 3. AİLE HUKUKU
    // ─────────────────────────────────────────────
    { regex: /anlaşmalı boşanma|anlasmal[ıi] bosanma/i, keywords: ['anlaşmalı boşanma'] },
    { regex: /çekişmeli boşanma|cekismeli bosanma/i, keywords: ['çekişmeli boşanma'] },
    { regex: /(?:zina).*boşanma|boşanma.*(?:zina)/i, keywords: ['zina sebebiyle boşanma'] },
    { regex: /hayata kast|hayata kast.*boşanma/i, keywords: ['hayata kast boşanma'] },
    { regex: /pek kötü muamele|pek kotu muamele|onur kırıcı/i, keywords: ['pek kötü muamele boşanma'] },
    { regex: /terk.*boşanma|boşanma.*terk/i, keywords: ['terk sebebiyle boşanma'] },
    { regex: /akıl hastalığı.*boşanma|boşanma.*akıl hastalığı/i, keywords: ['akıl hastalığı boşanma'] },
    { regex: /evlilik birliğinin sarsılması|evlilik birligi/i, keywords: ['evlilik birliğinin sarsılması'] },
    { regex: /(?:boşanma|bosanma)/i, keywords: ['boşanma davası'] },
    { regex: /tedbir nafakası|tedbir nafakasi/i, keywords: ['tedbir nafakası'] },
    { regex: /yoksulluk nafakası|yoksulluk nafakasi/i, keywords: ['yoksulluk nafakası'] },
    { regex: /iştirak nafakası|istirak nafakasi/i, keywords: ['iştirak nafakası'] },
    { regex: /nafakanın artırılması|nafakanin artirilmasi|nafaka artırım/i, keywords: ['nafakanın artırılması'] },
    { regex: /nafakanın azaltılması|nafakanin azaltilmasi|nafaka azaltma/i, keywords: ['nafakanın azaltılması'] },
    { regex: /nafakanın kaldırılması|nafaka kaldırma/i, keywords: ['nafakanın kaldırılması'] },
    { regex: /nafaka/i, keywords: ['nafaka'] },
    { regex: /velayet değişikliği|velayet degisikligi/i, keywords: ['velayet değişikliği'] },
    { regex: /müşterek velayet|musteren velayet/i, keywords: ['müşterek velayet'] },
    { regex: /kişisel ilişki|kisisel iliski|çocukla görüşme/i, keywords: ['kişisel ilişki tesisi'] },
    { regex: /velayet/i, keywords: ['velayet davası'] },
    { regex: /mal paylaşımı|mal paylasimi|mal rejimi/i, keywords: ['edinilmiş mallara katılma'] },
    { regex: /katılma alacağı|katilma alacagi/i, keywords: ['katılma alacağı'] },
    { regex: /değer artış payı|deger artis payi/i, keywords: ['değer artış payı'] },
    { regex: /ziynet eşyası|ziynet esyasi|düğün takıları/i, keywords: ['ziynet eşyası alacağı'] },
    { regex: /nişanın bozulması|nisan bozma|nişan/i, keywords: ['nişan bozma tazminatı'] },
    { regex: /boşanma tazminatı|bosanma tazminati|manevi tazminat.*boşanma/i, keywords: ['boşanma tazminatı'] },
    { regex: /evlat edinme/i, keywords: ['evlat edinme'] },
    { regex: /soybağı|soybagi|babalık davası|babalik davasi/i, keywords: ['soybağının reddi'] },
    { regex: /tanıma.*çocuk|çocuk.*tanıma/i, keywords: ['tanıma davası'] },
    { regex: /aile koruması|aile koruma|aile içi şiddet|6284/i, keywords: ['6284 koruma kararı'] },
    { regex: /koruma tedbiri|uzaklaştırma/i, keywords: ['koruma tedbiri kararı'] },

    // ─────────────────────────────────────────────
    // 4. MİRAS HUKUKU
    // ─────────────────────────────────────────────
    { regex: /(?:miras|veraset|tereke)/i, keywords: ['miras hukuku'] },
    { regex: /yasal mirasçı|yasal mirascı/i, keywords: ['yasal mirasçılık'] },
    { regex: /saklı pay|sakli pay/i, keywords: ['saklı pay'] },
    { regex: /vasiyetname|vasiyet/i, keywords: ['vasiyetname'] },
    { regex: /vasiyetnamenin iptali/i, keywords: ['vasiyetnamenin iptali'] },
    { regex: /miras sözleşmesi|miras sozlesmesi/i, keywords: ['miras sözleşmesi'] },
    { regex: /mirastan feragat|mirastan vazgeçme/i, keywords: ['mirastan feragat'] },
    { regex: /mirasın reddi|mirasin reddi|mirası reddetme/i, keywords: ['mirasın reddi'] },
    { regex: /tenkis/i, keywords: ['tenkis davası'] },
    { regex: /denkleştirme.*miras|miras.*denkleştirme/i, keywords: ['miras denkleştirme'] },
    { regex: /elbirliği mülkiyeti|elbirligi mulkiyeti/i, keywords: ['elbirliği mülkiyeti'] },
    { regex: /veraset ilamı|veraset ilami|mirasçılık belgesi/i, keywords: ['veraset ilamı'] },
    { regex: /ortaklığın giderilmesi|izale-i şuyu|izaleyi suyu/i, keywords: ['ortaklığın giderilmesi davası'] },
    { regex: /muris muvazaası|muris muvazaasi/i, keywords: ['muris muvazaası'] },

    // ─────────────────────────────────────────────
    // 5. BORÇLAR HUKUKU
    // ─────────────────────────────────────────────
    { regex: /sözleşme.*fesih|fesih.*sözleşme|sozlesme.*fesih/i, keywords: ['sözleşme feshi'] },
    { regex: /sözleşmeye aykırılık|sozlesmeye aykirilik/i, keywords: ['sözleşmeye aykırılık'] },
    { regex: /hata.*irade|irade.*hata|yanılma/i, keywords: ['irade bozukluğu hata'] },
    { regex: /hile.*sözleşme|sözleşme.*hile/i, keywords: ['irade bozukluğu hile'] },
    { regex: /ikrah|zorlama.*sözleşme/i, keywords: ['irade bozukluğu ikrah'] },
    { regex: /gabin|aşırı yararlanma|asiri yararlanma/i, keywords: ['gabin'] },
    { regex: /maddi tazminat/i, keywords: ['maddi tazminat davası'] },
    { regex: /manevi tazminat/i, keywords: ['manevi tazminat davası'] },
    { regex: /destekten yoksun kalma/i, keywords: ['destekten yoksun kalma tazminatı'] },
    { regex: /kusursuz sorumluluk/i, keywords: ['kusursuz sorumluluk'] },
    { regex: /adam çalıştıranın sorumluluğu|adam calistiranin/i, keywords: ['adam çalıştıranın sorumluluğu'] },
    { regex: /tehlike sorumluluğu/i, keywords: ['tehlike sorumluluğu'] },
    { regex: /sebepsiz zenginleşme|sebepsiz zenginlesme/i, keywords: ['sebepsiz zenginleşme'] },
    { regex: /vekaletsiz iş görme|vekaletsiz is gorme/i, keywords: ['vekaletsiz iş görme'] },
    { regex: /alacağın devri|temlik/i, keywords: ['alacağın temliki'] },
    { regex: /borcun nakli/i, keywords: ['borcun nakli'] },
    { regex: /kefalet/i, keywords: ['kefalet sözleşmesi'] },
    { regex: /(?:kira|kiracı|kiralayan|tahliye)/i, keywords: ['kira hukuku'] },
    { regex: /kira alacağı|kira alacagi|kira bedeli/i, keywords: ['kira alacağı'] },
    { regex: /tahliye.*kiracı|kiracı.*tahliye/i, keywords: ['kiracı tahliyesi'] },
    { regex: /kira tespit|kira tespiti|kira artışı/i, keywords: ['kira tespit davası'] },
    { regex: /kira uyarlama/i, keywords: ['kira uyarlama davası'] },
    { regex: /alacak/i, keywords: ['alacak davası'] },
    { regex: /tazminat/i, keywords: ['tazminat davası'] },
    { regex: /menfi tespit/i, keywords: ['menfi tespit davası'] },
    { regex: /istirdat/i, keywords: ['istirdat davası'] },

    // ─────────────────────────────────────────────
    // 6. EŞYA HUKUKU / GAYRİMENKUL
    // ─────────────────────────────────────────────
    { regex: /tapu.*iptal|iptal.*tapu/i, keywords: ['tapu iptal ve tescil'] },
    { regex: /tapu.*tescil|tescil.*tapu/i, keywords: ['tapu tescil davası'] },
    { regex: /(?:kadastro)/i, keywords: ['kadastro davası'] },
    { regex: /(?:ecrimisil)/i, keywords: ['ecrimisil davası'] },
    { regex: /el atmanın önlenmesi|el atma|elatma|müdahalenin meni/i, keywords: ['el atmanın önlenmesi davası'] },
    { regex: /kat mülkiyeti|kat mulkiyeti/i, keywords: ['kat mülkiyeti'] },
    { regex: /kat irtifakı|kat irtifaki/i, keywords: ['kat irtifakı'] },
    { regex: /intifa|intifa hakkı/i, keywords: ['intifa hakkı'] },
    { regex: /geçit hakkı|gecit hakki/i, keywords: ['geçit hakkı davası'] },
    { regex: /üst hakkı|ust hakki/i, keywords: ['üst hakkı'] },
    { regex: /ipotek|rehin/i, keywords: ['ipotek'] },
    { regex: /şerh|serh.*tapu/i, keywords: ['tapu şerhi'] },
    { regex: /orman|orman arazisi/i, keywords: ['orman kadastro davası'] },
    { regex: /hazine arazisi|devlet arazisi/i, keywords: ['hazine arazisi'] },
    { regex: /imar aykırılığı|imar aykiriligi/i, keywords: ['imar aykırılığı'] },
    { regex: /paylı mülkiyet|payli mulkiyet/i, keywords: ['paylı mülkiyet'] },
    { regex: /önalım hakkı|onalim hakki|şufa/i, keywords: ['önalım hakkı'] },

    // ─────────────────────────────────────────────
    // 7. İDARE VE VERGİ HUKUKU (Genişletilmiş)
    // ─────────────────────────────────────────────

    // Genel İdari Yargı Kavramları
    { regex: /idari işlemin iptali|iptal davası|idari islem/i, keywords: ['idari işlemin iptali davası'] },
    { regex: /tam yargı davası|tam yargi davasi|idare tazminat/i, keywords: ['tam yargı davası'] },
    { regex: /yürütmenin durdurulması|yurutmenin durdurulmasi|YD talebi/i, keywords: ['yürütmenin durdurulması'] },
    { regex: /idari eylem|hizmet kusuru/i, keywords: ['idarenin hizmet kusuru'] },
    { regex: /zımni ret|zimni ret|60 günlük süre/i, keywords: ['zımni ret iptal davası'] },
    { regex: /görevsizlik|idari yargı yetkisi/i, keywords: ['idari yargının görev alanı'] },

    // Memur Hukuku ve Disiplin (657 s. Kanun)
    { regex: /disiplin cezası|disiplin cezasi/i, keywords: ['disiplin cezası iptali'] },
    { regex: /uyarma|kınama.*disiplin/i, keywords: ['uyarma ve kınama cezası'] },
    { regex: /aylıktan kesme/i, keywords: ['aylıktan kesme cezası'] },
    { regex: /kademe ilerlemesinin durdurulması|kademe ilerlemesi/i, keywords: ['kademe ilerlemesinin durdurulması'] },
    { regex: /devlet memurluğundan çıkarma|memuriyetten ihrac|kamu görevinden ihraç/i, keywords: ['devlet memurluğundan çıkarma'] },
    { regex: /görevden uzaklaştırma|aciga alinma|açığa alınma/i, keywords: ['görevden uzaklaştırma tedbiri'] },
    { regex: /atama.*memur|memur.*atama|naklen atama/i, keywords: ['memur atama kararının iptali'] },
    { regex: /sözleşmeli personel|4\/B|sözleşme feshi idare/i, keywords: ['sözleşmeli personel sözleşme feshi'] },
    { regex: /güvenlik soruşturması|arşiv araştırması/i, keywords: ['güvenlik soruşturması iptal davası'] },
    { regex: /ek gösterge|makam tazminatı|görev tazminatı/i, keywords: ['memur mali haklar davası'] },

    // Kamulaştırma Hukuku (2942 s. Kanun)
    { regex: /kamulaştırma bedelinin tespiti|bedel tespiti/i, keywords: ['kamulaştırma bedel tespit davası'] },
    { regex: /acele kamulaştırma/i, keywords: ['acele kamulaştırma iptali'] },
    { regex: /kamulaştırmasız el atma|fiili el atma|hukuki el atma/i, keywords: ['kamulaştırmasız el atma'] },
    { regex: /geri alma hakkı.*kamulaştırma/i, keywords: ['kamulaştırılan taşınmazı geri alma'] },

    // İmar Hukuku (3194 s. Kanun)
    { regex: /imar planı iptali|imar plani|1\/1000|1\/5000/i, keywords: ['imar planı iptal davası'] },
    { regex: /parselasyon.*iptali|şüyulandırma|18\. madde/i, keywords: ['imar uygulaması (18. madde) iptali'] },
    { regex: /yapı ruhsatı|yapi ruhsati|ruhsat iptali/i, keywords: ['yapı ruhsatı iptali'] },
    { regex: /yapı kullanma izni|iskan iptali/i, keywords: ['yapı kullanma izni iptali'] },
    { regex: /yıkım kararı|yikim karari|encümen kararı/i, keywords: ['yıkım encümen kararı iptali'] },
    { regex: /idari para cezası.*imar|imar cezası/i, keywords: ['imar idari para cezası iptali'] },

    // Vergi Hukuku
    { regex: /vergi tarhiyatı|tarhiyatın iptali/i, keywords: ['vergi tarhiyatı iptal davası'] },
    { regex: /vergi ziyaı|vergi ziyai/i, keywords: ['vergi ziyaı cezası iptali'] },
    { regex: /usulsüzlük cezası|özel usulsüzlük/i, keywords: ['özel usulsüzlük cezası'] },
    { regex: /ödeme emri.*iptal|ödeme emrinin iptali.*vergi/i, keywords: ['vergi ödeme emri iptali'] },
    { regex: /KDV iadesi|katma değer vergisi iadesi/i, keywords: ['KDV iadesi davası'] },
    { regex: /gelir vergisi|kurumlar vergisi|vergi uyuşmazlığı/i, keywords: ['vergi davası'] },
    { regex: /sahte belge.*vergi|naylon fatura.*idare/i, keywords: ['sahte belge kullanma vergi tarhiyatı'] },

    // Gümrük Hukuku
    { regex: /gümrük vergisi.*iptal|mülkiyetin kamuya geçirilmesi/i, keywords: ['gümrük idare davası'] },
    { regex: /gümrük idari para cezası/i, keywords: ['gümrük para cezası iptali'] },

    // ─────────────────────────────────────────────
    // 8. İCRA İFLAS HUKUKU
    // ─────────────────────────────────────────────
    { regex: /ilamsız icra|ilamsiz icra/i, keywords: ['ilamsız icra takibi'] },
    { regex: /ilamlı icra|ilamli icra/i, keywords: ['ilamlı icra takibi'] },
    { regex: /kambiyo.*icra|kambiyo.*takip/i, keywords: ['kambiyo senetlerine özgü icra'] },
    { regex: /maaş haczi|maas haczi/i, keywords: ['maaş haczi'] },
    { regex: /taşınmaz haczi|tasinmaz haczi/i, keywords: ['taşınmaz haczi'] },
    { regex: /banka hesabı haczi|banka haczi/i, keywords: ['banka hesabı haczi'] },
    { regex: /itirazın iptali|itirazin iptali/i, keywords: ['itirazın iptali davası'] },
    { regex: /itirazın kaldırılması|itirazin kaldirilmasi/i, keywords: ['itirazın kaldırılması'] },
    { regex: /istihkak davası|istihkak/i, keywords: ['istihkak davası'] },
    { regex: /sıra cetveli|sira cetveli/i, keywords: ['sıra cetveline itiraz'] },
    { regex: /tasarrufun iptali/i, keywords: ['tasarrufun iptali davası'] },
    { regex: /(?:icra|haciz)/i, keywords: ['icra hukuku'] },
    { regex: /(?:iflas)/i, keywords: ['iflas hukuku'] },
    { regex: /konkordato/i, keywords: ['konkordato'] },
    { regex: /iflasın ertelenmesi/i, keywords: ['iflasın ertelenmesi'] },
    { regex: /icra inkâr tazminatı|icra inkar tazminati/i, keywords: ['icra inkar tazminatı'] },

    // ─────────────────────────────────────────────
    // 9. TİCARET HUKUKU
    // ─────────────────────────────────────────────
    { regex: /anonim şirket|anonim sirket/i, keywords: ['anonim şirket hukuku'] },
    { regex: /limited şirket|limited sirket/i, keywords: ['limited şirket hukuku'] },
    { regex: /hisse devri/i, keywords: ['hisse devri'] },
    { regex: /genel kurul|yönetim kurulu/i, keywords: ['genel kurul kararı iptali'] },
    { regex: /(?:çek|cek).*karşılıksız|karşılıksız.*(?:çek|cek)/i, keywords: ['karşılıksız çek'] },
    { regex: /(?:çek|cek|senet|bono|kambiyo)/i, keywords: ['kambiyo senetleri'] },
    { regex: /poliçe/i, keywords: ['poliçe'] },
    { regex: /kasko|trafik sigortası|trafik sigortasi/i, keywords: ['trafik sigortası'] },
    { regex: /hayat sigortası|hayat sigortasi/i, keywords: ['hayat sigortası'] },
    { regex: /sigorta.*tazminat|tazminat.*sigorta/i, keywords: ['sigorta tazminatı'] },
    { regex: /haksız rekabet|haksiz rekabet/i, keywords: ['haksız rekabet'] },
    { regex: /marka.*ihlal|marka.*tecavüz/i, keywords: ['marka hakkına tecavüz'] },
    { regex: /acente|distribütör|bayilik/i, keywords: ['acentelik sözleşmesi'] },
    { regex: /deniz ticaret|deniz hukuku/i, keywords: ['deniz ticaret hukuku'] },

    // ─────────────────────────────────────────────
    // 10. TÜKETİCİ HUKUKU
    // ─────────────────────────────────────────────
    { regex: /ayıplı mal|ayipli mal/i, keywords: ['ayıplı mal'] },
    { regex: /ayıplı hizmet|ayipli hizmet/i, keywords: ['ayıplı hizmet'] },
    { regex: /tüketici kredisi|tuketici kredisi/i, keywords: ['tüketici kredisi'] },
    { regex: /konut kredisi|mortgage/i, keywords: ['konut kredisi'] },
    { regex: /mesafeli satış|mesafeli satis|internet.*satış/i, keywords: ['mesafeli satış sözleşmesi'] },
    { regex: /kapıdan satış|kapidan satis/i, keywords: ['kapıdan satış'] },
    { regex: /tüketici hakem heyeti|tuketici hakem/i, keywords: ['tüketici hakem heyeti'] },
    { regex: /garanti|servis.*şikayet/i, keywords: ['garanti kapsamı'] },
    { regex: /(?:tüketici|tuketici)/i, keywords: ['tüketici hakları'] },
    { regex: /abonelik.*sözleşme|abonelik.*iptal/i, keywords: ['abonelik sözleşmesi'] },

    // ─────────────────────────────────────────────
    // 11. FİKRİ MÜLKİYET HUKUKU
    // ─────────────────────────────────────────────
    { regex: /marka.*tescil|tescilli marka/i, keywords: ['marka tescil'] },
    { regex: /patent|faydalı model|faydali model/i, keywords: ['patent hukuku'] },
    { regex: /telif hakkı|telif hakki|eser sahipliği/i, keywords: ['telif hakkı'] },
    { regex: /endüstriyel tasarım|endustriyel tasarim/i, keywords: ['endüstriyel tasarım'] },

    // ─────────────────────────────────────────────
    // 12. ANAYASA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /bireysel başvuru|bireysel basvuru|AYM/i, keywords: ['Anayasa Mahkemesi bireysel başvuru'] },
    { regex: /temel hak.*ihlal|hak ihlali/i, keywords: ['temel hak ihlali'] },
    { regex: /AİHM|AIHM|avrupa insan hakları/i, keywords: ['AİHM başvurusu'] },
    { regex: /adil yargılanma hakkı|adil yargilanma/i, keywords: ['adil yargılanma hakkı'] },
    { regex: /ifade özgürlüğü|ifade ozgurlugu/i, keywords: ['ifade özgürlüğü'] },
    { regex: /mülkiyet hakkı.*ihlal|mulkiyet hakki/i, keywords: ['mülkiyet hakkı ihlali'] },
    { regex: /kişi özgürlüğü.*ihlal|kisi ozgurlugu/i, keywords: ['kişi özgürlüğü ihlali'] },

    // ─────────────────────────────────────────────
    // 13. SAĞLIK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /malpraktis|tıbbi hata|tibbi hata/i, keywords: ['malpraktis davası'] },
    { regex: /doktor hatası|doktor hatasi/i, keywords: ['doktor hatası tazminatı'] },
    { regex: /komplikasyon/i, keywords: ['tıbbi komplikasyon'] },
    { regex: /aydınlatılmış onam|aydinlatilmis onam/i, keywords: ['aydınlatılmış onam'] },
    { regex: /hekim sorumluluğu|hekim sorumlulugu/i, keywords: ['hekim sorumluluğu'] },
    { regex: /hasta hakları|hasta haklari/i, keywords: ['hasta hakları'] },

    // ─────────────────────────────────────────────
    // 14. BİLİŞİM / KİŞİSEL VERİ HUKUKU
    // ─────────────────────────────────────────────
    { regex: /KVKK|kişisel veri|kisisel veri/i, keywords: ['KVKK kişisel veri'] },
    { regex: /veri ihlali|veri sızıntısı/i, keywords: ['kişisel veri ihlali'] },
    { regex: /unutulma hakkı|unutulma hakki/i, keywords: ['unutulma hakkı'] },
    { regex: /sosyal medya.*hakaret|hakaret.*sosyal medya/i, keywords: ['sosyal medya hakaret'] },
    { regex: /internet.*erişim engeli|erisim engeli/i, keywords: ['internet erişim engeli'] },

    // ─────────────────────────────────────────────
    // 15. ÇEVRE HUKUKU
    // ─────────────────────────────────────────────
    { regex: /çevre kirliliği|cevre kirliligi/i, keywords: ['çevre kirliliği'] },
    { regex: /çevresel etki|ÇED|cevre etki/i, keywords: ['ÇED raporu iptali'] },

    // ─────────────────────────────────────────────
    // 16. ULUSLARARASI HUKUK
    // ─────────────────────────────────────────────
    { regex: /tanıma.*tenfiz|tenfiz.*tanıma/i, keywords: ['tanıma tenfiz davası'] },
    { regex: /yabancı.*mahkeme.*kararı|yabancı karar/i, keywords: ['yabancı mahkeme kararı tenfizi'] },
    { regex: /tahkim|milletlerarası tahkim/i, keywords: ['milletlerarası tahkim'] },
    { regex: /uluslararası nafaka|uluslararasi nafaka/i, keywords: ['uluslararası nafaka'] },

    // ─────────────────────────────────────────────
    // 17. SPOR HUKUKU
    // ─────────────────────────────────────────────
    { regex: /sporcu sözleşmesi|sporcu sozlesmesi/i, keywords: ['sporcu sözleşmesi'] },
    { regex: /TFF|futbolcu|transfer/i, keywords: ['spor hukuku'] },

    // ─────────────────────────────────────────────
    // 18. ENERJİ HUKUKU
    // ─────────────────────────────────────────────
    { regex: /EPDK|enerji piyasası|lisans.*enerji|elektrik piyasası/i, keywords: ['enerji hukuku'] },

    // ─────────────────────────────────────────────
    // 19. BANKACILIK VE FİNANS HUKUKU
    // ─────────────────────────────────────────────
    { regex: /BDDK|bankacılık zimmeti|kredi sözleşmesi|banka teminat mektubu/i, keywords: ['bankacılık hukuku'] },
    { regex: /kredi kartı aidatı|banka.*komisyon|dosya masrafı/i, keywords: ['banka dosya masrafı iadesi'] },

    // ─────────────────────────────────────────────
    // 20. SERMAYE PİYASASI HUKUKU
    // ─────────────────────────────────────────────
    { regex: /SPK|sermaye piyasası|borsa manipülasyonu|insider trading/i, keywords: ['sermaye piyasası hukuku'] },
    { regex: /hisse senedi ihracı|halka arz/i, keywords: ['halka arz süreci'] },

    // ─────────────────────────────────────────────
    // 21. SİGORTA HUKUKU (Özel Kategori)
    // ─────────────────────────────────────────────
    { regex: /trafik sigortası|kasko|değer kaybı.*araç/i, keywords: ['araç değer kaybı davası'] },
    { regex: /hayat sigortası|ferdi kaza sigortası|dask/i, keywords: ['sigorta rücu davası'] },

    // ─────────────────────────────────────────────
    // 22. REKABET HUKUKU
    // ─────────────────────────────────────────────
    { regex: /rekabet kurumu|rekabet kurulu|hakim durumun kötüye kullanılması/i, keywords: ['rekabetin ihlali'] },
    { regex: /kartel|uyumlu eylem|fiyat sabitleme/i, keywords: ['kartel anlaşması'] },

    // ─────────────────────────────────────────────
    // 23. BASIN VE MEDYA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /RTÜK|tekzip|cevap ve düzeltme hakkı/i, keywords: ['tekzip metni yayınlama'] },
    { regex: /basın özgürlüğü|gazeteci.*dava|yayın yasağı/i, keywords: ['basın yayın yasağı'] },

    // ─────────────────────────────────────────────
    // 24. YABANCILAR VE VATANDAŞLIK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /deport|sınır dışı|GİG|yabancılar şubesi/i, keywords: ['sınır dışı (deport) iptal davası'] },
    { regex: /Türk vatandaşlığı|vatandaşlık başvurusu/i, keywords: ['vatandaşlık hukuku'] },

    // ─────────────────────────────────────────────
    // 25. GÖÇ VE İLTİCA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /geçici koruma statüsü|mülteci|iltica başvurusu/i, keywords: ['mülteci hukuku'] },

    // ─────────────────────────────────────────────
    // 26. GÜMRÜK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /gümrük kaçakçılığı|gümrük vergisi.*iptal|kaçak eşya/i, keywords: ['gümrük kaçakçılığı davası'] },
    { regex: /gümrük müşavirliği|gümrük beyannamesi/i, keywords: ['gümrük uyuşmazlığı'] },

    // ─────────────────────────────────────────────
    // 27. MADEN HUKUKU
    // ─────────────────────────────────────────────
    { regex: /maden ruhsatı|maden imtiyazı|MAPEG/i, keywords: ['maden ruhsatı iptali'] },
    { regex: /rödövans|maden.*sözleşme/i, keywords: ['rödövans sözleşmesi'] },

    // ─────────────────────────────────────────────
    // 28. VAKIFLAR VE DERNEKLER HUKUKU
    // ─────────────────────────────────────────────
    { regex: /vakıf kurma|dernek tüzüğü|dernek feshi/i, keywords: ['dernekler hukuku'] },
    { regex: /vakıflar genel müdürlüğü|mazbut vakıf/i, keywords: ['vakıf hukuku'] },

    // ─────────────────────────────────────────────
    // 29. KOOPERATİFLER HUKUKU
    // ─────────────────────────────────────────────
    { regex: /yapı kooperatifi|kooperatif.*ihraç/i, keywords: ['kooperatif ortaklığından ihraç'] },
    { regex: /kooperatif genel kurulu|ferdileşme/i, keywords: ['kooperatif hukuku'] },

    // ─────────────────────────────────────────────
    // 30. İMAR HUKUKU (Özel Kategori)
    // ─────────────────────────────────────────────
    { regex: /imar planı iptali|parselasyon/i, keywords: ['18. madde uygulaması iptali'] },
    { regex: /kaçak yapı|yapı kayıt belgesi iptali/i, keywords: ['yapı kayıt belgesi uyuşmazlığı'] },

    // ─────────────────────────────────────────────
    // 31. KAMU İHALE HUKUKU (Özel Kategori)
    // ─────────────────────────────────────────────
    { regex: /KİK|kamu ihale kurumu|ihaleye katılmaktan yasaklama/i, keywords: ['ihaleye katılmaktan yasaklama kararı'] },
    { regex: /aşırı düşük teklif|ihale iptali/i, keywords: ['ihale kararının iptali'] },

    // ─────────────────────────────────────────────
    // 32. TAŞIMA VE LOJİSTİK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /CMR belgesi|navlun sözleşmesi|lojistik/i, keywords: ['taşıma hukuku'] },
    { regex: /kargo.*kayıp|kargo.*hasar|taşıma.*zarar/i, keywords: ['kargo hasar tazminatı'] },

    // ─────────────────────────────────────────────
    // 33. DENİZ TİCARETİ VE SİGORTA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /gemi sicili|gemi ipoteği|çatma|müşterek avarya/i, keywords: ['deniz ticareti hukuku'] },
    { regex: /deniz kirliliği|gemi.*haciz/i, keywords: ['gemi ihtiyati haciz'] },

    // ─────────────────────────────────────────────
    // 34. HAVA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /uçak iptali|uçuş gecikmesi|havayolu yolcu hakları/i, keywords: ['uçuş iptali tazminatı'] },
    { regex: /SHGM|hava aracı sicili|montreal konvansiyonu/i, keywords: ['hava hukuku'] },

    // ─────────────────────────────────────────────
    // 35. TIP VE İLAÇ HUKUKU
    // ─────────────────────────────────────────────
    { regex: /ilaç ruhsatı|eczacılık.*mevzuat|tıbbi cihaz/i, keywords: ['ilaç hukuku'] },
    { regex: /endikasyon dışı ilaç|SGK ilaç bedeli/i, keywords: ['SGK ilaç bedeli karşılama'] },

    // ─────────────────────────────────────────────
    // 36. HAYVAN HAKLARI HUKUKU
    // ─────────────────────────────────────────────
    { regex: /hayvanları koruma kanunu|hayvana.*şiddet/i, keywords: ['hayvan hakları ihlali'] },
    { regex: /evcil hayvan.*haciz|hayvan.*tazminat/i, keywords: ['hayvana zarar verme suçu'] },

    // ─────────────────────────────────────────────
    // 37. TARIM VE ORMAN HUKUKU
    // ─────────────────────────────────────────────
    { regex: /TİGEM|tarımsal destek|orman arazisi vasfı/i, keywords: ['orman kadastrosu'] },
    { regex: /2B arazisi|tarım arazisi miras/i, keywords: ['tarım arazilerinin bölünmesi'] },

    // ─────────────────────────────────────────────
    // 38. SU HUKUKU
    // ─────────────────────────────────────────────
    { regex: /yeraltı suyu|kuyu ruhsatı|DSİ/i, keywords: ['su hukuku ve kaynak tahsisi'] },

    // ─────────────────────────────────────────────
    // 39. ÇOCUK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /çocuk mahkemesi|SSÇ|suça sürüklenen çocuk/i, keywords: ['suça sürüklenen çocuk'] },
    { regex: /çocuk teslimi|çocuk koruma kanunu/i, keywords: ['çocuk koruma kanunu tedbirleri'] },

    // ─────────────────────────────────────────────
    // 40. KADIN HAKLARI VE AYRIMCILIK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /cinsiyet ayrımcılığı|kadın cinayeti|eşit işe eşit ücret/i, keywords: ['cinsiyet ayrımcılığı davası'] },

    // ─────────────────────────────────────────────
    // 41. ENGELLİ HAKLARI HUKUKU
    // ─────────────────────────────────────────────
    { regex: /engelli raporu itiraz|engelli aylığı|ÖTV muafiyeti/i, keywords: ['engelli hakları ve ÖTV muafiyeti'] },

    // ─────────────────────────────────────────────
    // 42. ASKERİ CEZA VE İDARE HUKUKU
    // ─────────────────────────────────────────────
    { regex: /askeri disiplin|firar|emre itaatsizlik/i, keywords: ['askeri disiplin cezası'] },
    { regex: /askerlik.*tecil|bedelli askerlik/i, keywords: ['askeri idari işlem iptali'] },

    // ─────────────────────────────────────────────
    // 43. TELEKOMÜNİKASYON HUKUKU
    // ─────────────────────────────────────────────
    { regex: /BTK|baz istasyonu|frekans tahsisi/i, keywords: ['baz istasyonu kaldırılması'] },

    // ─────────────────────────────────────────────
    // 44. MODA VE TEKSTİL HUKUKU
    // ─────────────────────────────────────────────
    { regex: /moda.*tasarım|taklit ürün|tekstil marka/i, keywords: ['moda hukuku taklit ürün'] },

    // ─────────────────────────────────────────────
    // 45. SANAT VE EĞLENCE HUKUKU (Entertainment Law)
    // ─────────────────────────────────────────────
    { regex: /yapımcı sözleşmesi|oyuncu sözleşmesi|menajerlik sözleşmesi/i, keywords: ['menajerlik ve oyuncu sözleşmesi'] },
    { regex: /konser iptali|müzik eseri.*telif/i, keywords: ['müzik eseri telif davası'] },

    // ─────────────────────────────────────────────
    // 46. KRİPTO VARLIKLAR VE BLOCKCHAIN HUKUKU
    // ─────────────────────────────────────────────
    { regex: /kripto para|bitcoin|kripto borsa|kripto.*dolandırıcılık/i, keywords: ['kripto para borsası davası'] },
    { regex: /soğuk cüzdan|token ihracı|SPK kripto/i, keywords: ['kripto varlık hukuku'] },

    // ─────────────────────────────────────────────
    // 47. YAPAY ZEKA VE ROBOTİK HUKUKU
    // ─────────────────────────────────────────────
    { regex: /yapay zeka|algoritma.*sorumluluk|otonom araç/i, keywords: ['yapay zeka sistemlerinin zararı'] },
    { regex: /deepfake|AI.*telif|yapay zeka.*eser/i, keywords: ['yapay zeka telif hakkı'] },

    // ─────────────────────────────────────────────
    // 48. UZAY HUKUKU
    // ─────────────────────────────────────────────
    { regex: /uydu fırlatma|uzay anlaşması|uzay çöpü/i, keywords: ['uydu frekans anlaşmazlığı'] },

    // ─────────────────────────────────────────────
    // 49. E-TİCARET VE İNTERNET HUKUKU
    // ─────────────────────────────────────────────
    { regex: /e-ticaret platform|pazaryeri sorumluluğu|influencer sözleşmesi/i, keywords: ['e-ticaret aracı hizmet sağlayıcı maliyeti'] },
    { regex: /domain uyuşmazlığı|UDRP|alan adı tahkim/i, keywords: ['alan adı (domain) uyuşmazlığı'] },

    // ─────────────────────────────────────────────
    // 50. VERGİ VE GÜMRÜK CEZA HUKUKU
    // ─────────────────────────────────────────────
    { regex: /vergi kaçakçılığı|naylon fatura|sahte fatura|VUK 359/i, keywords: ['vergi kaçakçılığı (naylon fatura) suçu'] },
];

const extractHeuristicKeywords = (analysisText = '') => {
    const text = String(analysisText || '');
    if (!text.trim()) return [];

    const keywords = [];

    // Sadece Kanun Kısaltması İçeren Maddeler (Örn: TCK 188)
    const codeRefs = text.match(/(?:TCK|CMK|HMK|TMK|TBK|İİK|IIK|TTK|BK|AİHM|AIHM|İYUK|IYUK|SGK|İK|VUK|KMK|FSEK)\s*(?:m\.?\s*)?\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi) || [];
    codeRefs.forEach(ref => keywords.push(ref.replace(/\s+/g, ' ').trim()));

    // Esas/Karar numbers (Hukuki dayanaklar için çok değerli)
    const esasKarar = text.match(/(?:E(?:sas)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+|K(?:arar)?\.?\s*(?:No\.?\s*)?[:.]?\s*\d{4}\/\d+)/gi) || [];
    esasKarar.forEach(ref => keywords.push(ref.replace(/\s+/g, ' ').trim()));

    // Apply all 200 domain patterns
    for (const pattern of LEGAL_DOMAIN_PATTERNS) {
        if (pattern.regex.test(text)) {
            keywords.push(...pattern.keywords);
        }
    }

    return keywords;
};

const safeJsonParse = (raw = '') => {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try { return { keywords: JSON.parse(arrayMatch[0]) }; } catch { /* fallthrough */ }
        }
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!objectMatch) return null;
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            return null;
        }
    }
};

const buildFinalKeywords = (modelKeywords = [], analysisText = '') => {
    const combined = [
        ...(Array.isArray(modelKeywords) ? modelKeywords : []),
        ...extractHeuristicKeywords(analysisText),
    ];

    const unique = [];
    const seen = new Set();

    for (const keyword of combined) {
        const normalized = normalizeAmbiguousMaddeKeyword(keyword, analysisText);
        if (!normalized) continue;
        if (isWeakKeyword(normalized)) continue;
        if (isNoisyKeyword(normalized)) continue;

        const key = keywordKey(normalized);
        if (seen.has(key)) continue;

        seen.add(key);
        unique.push(normalized);
        if (unique.length >= 15) break;
    }

    return unique;
};

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ai = getGeminiClient();
        const { analysisText, userRole } = req.body || {};

        const systemInstruction = `Sen, Turk hukuku alaninda uzmanlasmis bir anahtar kelime analiz sistemisin.

**ANA GOREV:** Verilen hukuki metni analiz ederek, hukuki arastirma ve web uzerinde arama yapmak icin en etkili anahtar kelime ve ifadeleri uret.

**ANALIZ ADIMLARI:**
1. Oncelikle metni oku ve su unsurlari belirle:
   - HUKUK DALI: (Ceza, Is, Aile, Miras, Borclar, Esya, Idare, Ticaret, Tuketici, Icra-Iflas, Gayrimenkul, Saglik, Bilisim, Anayasa, Fikri Mulkiyet, Cevre, Spor, Enerji, vs.)
   - SUC/UYUSMAZLIK TIPI: Tam olarak ne iddia ediliyor veya talep ediliyor?
   - KANUN MADDESI: Hangi kanun maddeleri gecerli? (TCK, CMK, HMK, TMK, TBK, IIK, TTK, SGK, IYUK, FSEK, VUK, KMK, vs.)
   - TARAFLAR: Davaci, davali, magdur, sanik kim?
   - OLAY DETAYLARI: Tarih, yer, miktar, delil turleri
   - HUKUKI KAVRAMLAR: Ilgili hukuki kavram ve terimler neler?

2. Asagidaki anahtar kelime kategorilerine gore kelimeler uret:

   **SINIF A - Zorunlu (her zaman uret):**
   - Suc veya uyusmazlik tipi (orn: "haksiz fesih", "kasten yaralama", "kira alacagi", "bosanma davasi")
   - Uygulanabilir kanun hukmu (orn: "TCK 188/3", "Is Kanunu 18", "TBK 299", "HMK 389")
   - Varsa ilgili yargi kolu veya kurum bilgisi

   **SINIF B - Baglamsal (olay detaylarindan):**
   - Delil turleri (orn: "kamera kaydi", "tanik beyani", "bilirkisi raporu", "banka kaydi", "mesaj kaydi")
   - Hukuki kavramlar (orn: "haksiz tahrik indirimi", "kusur orani", "ispat yukumlulugu", "muris muvazaasi")
   - Miktar/sure detaylari (orn: "kidem tazminati hesaplama", "fazla mesai hesabi", "nafaka miktari")
   - Usul hukuku (orn: "gorev itiraz", "yetki itiraz", "zamanasimindan red", "HMK 107 belirsiz alacak")

   **SINIF C - Arama Stratejisi:**
   - Arastirma yonleri (orn: "beraat", "onama", "bozma", "HAGB")
   - Hukuki ilkeler (orn: "in dubio pro reo", "secimlerin yarismasi", "manevi tazminat olcutleri")
   - Savunma/talep stratejileri (orn: "etkin pismanlik", "haksiz tahrik", "meşru müdafaa", "usul hatasi")

3. Rol bazli onceliklendirme: ${userRole || 'Tarafsiz'}
   - Davaci/Magdur ise: tazminat, ceza artirimi, hak ihlali, agirlaştirici nedenler odakli
   - Davali/Sanik ise: savunma, indirim, beraat, usul hatasi, zamanasimindan red odakli
   - Tarafsiz ise: her iki yon dengeli

**FORMAT KURALLARI:**
- Cogu anahtar kelime 2-5 kelimelik hukuki ifadeler olsun
- Tek kelimelik genel terimlerden kacin ("dava", "mahkeme" tek basina zayif)
- Kanun maddesi referanslarini kisa tut ("TCK 188/3")
- Kisi ad-soyad, mahalle/adres, bina no, tarih ve kimlik bilgilerini asla anahtar kelime yapma
- "32. maddesi" gibi ciplak madde ifadeleri verme; kanun adini/numarasini mutlaka ekle
- Turkce karakterleri dogru kullan
- Minimum 8, maksimum 15 anahtar kelime uret

**CIKTI FORMATI:**
Sadece asagidaki JSON formatinda dondur, baska hicbir sey yazma:
{ "keywords": ["kelime1", "kelime2", ...] }`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: analysisText || '',
            config: {
                systemInstruction,
                temperature: 0.2,
            },
        });

        const parsed = safeJsonParse(response.text || '');
        const modelKeywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
        const finalKeywords = buildFinalKeywords(modelKeywords, analysisText || '');

        res.json({
            text: JSON.stringify({ keywords: finalKeywords }),
            keywords: finalKeywords,
        });
    } catch (error) {
        console.error('Keywords Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Keywords API error') });
    }
}

