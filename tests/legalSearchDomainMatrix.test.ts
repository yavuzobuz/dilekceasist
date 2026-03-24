import { describe, expect, it } from 'vitest';
import { buildSkillBackedSearchPackage } from '../lib/legal/legal-search-skill.js';

const wordCount = (text: string): number =>
    String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length;

const makeLongText = (seed: string, filler: string): string => {
    let text = seed.trim();
    while (wordCount(text) < 250) {
        text = `${text} ${filler}`.trim();
    }
    return text;
};

type DomainCase = {
    name: string;
    domain: string;
    label: string;
    expectedSource: string;
    text: string;
};

const buildCases = (
    domain: string,
    label: string,
    expectedSource: string,
    filler: string,
    seeds: string[],
): DomainCase[] => seeds.map((seed, index) => ({
    name: `${domain}-${index + 1}`,
    domain,
    label,
    expectedSource,
    text: makeLongText(seed, filler),
}));

const domainCases: DomainCase[] = [
    ...buildCases(
        'ceza',
        'Ceza',
        'yargitay',
        'Soruşturma evrakında sanık, şüpheli, iddianame, kriminal rapor, tanık beyanı, telefon inceleme tutanağı, paketleme materyali, ele geçirilen miktar ve TCK uygulaması birlikte tartışılmaktadır. Mahkeme delil yeterliliği, suç vasfı, ticaret kastı, kişisel kullanım sınırı ve şüpheden sanık yararlanır ilkesi yönünden ayrı değerlendirme yapmaktadır.',
        [
            'Cumhuriyet Başsavcılığı tarafından düzenlenen iddianamede sanığın TCK 188/3 kapsamında uyuşturucu veya uyarıcı madde ticareti yapmakla suçlandığı, ev aramasında metamfetamin, hassas terazi, çok sayıda kilitli poşet, WhatsApp yazışmaları ve parmak izi incelemesinin bulunduğu, sanığın ise maddelerin kişisel kullanım amacıyla bulundurulduğunu savunduğu ayrıntılı biçimde anlatılmıştır.',
            'Asliye Ceza Mahkemesine sunulan savunmada şüpheli hakkında TCK 191 kapsamında kullanmak için uyuşturucu madde bulundurma suçundan işlem yapıldığı, ele geçen maddenin gramajı, kullanım sıklığı, kullanıcı tanık beyanları, adli raporlar ve kolluk tutanaklarının kişisel kullanım sınırını aşıp aşmadığı tartışılmaktadır.',
            'Dosyada sanığın telefon görüşmeleri, fiziki takip tutanakları, gizli soruşturmacı beyanları, seri numaralı banknotlar ve satışa hazır şekilde paketlenmiş uyuşturucu maddeler yer almakta olup savcılık bu delillerle ticaret kastını ispat etmeye çalışmakta, savunma ise CMK kapsamında hukuka aykırı delil ve delil yetersizliği itirazı ileri sürmektedir.',
            'Yaralama ve tehdit eylemleri yanında ruhsatsız silah ve uyuşturucu kullanımına dair birden fazla soruşturma dosyasının birleştirildiği ceza yargılamasında sanığın kastı, olay yeri kamera kayıtları, tanık anlatımları, bilirkişi raporları ve beraat talebinin şartları ceza hukuku ilkeleri çerçevesinde tartışılmaktadır.',
            'Ceza mahkemesine gönderilen mütalaada sanığın uyuşturucu madde ticareti ile kullanmak için bulundurma arasındaki sınır bakımından TCK 188 ve TCK 191 hükümlerinin karşılaştırıldığı, ele geçen kokain, sentetik kannabinoid, materyal mukayese tutanağı, telefon inceleme raporu ve arama kararı içeriğinin suç vasfına etkisinin değerlendirildiği belirtilmiştir.',
        ],
    ),
    ...buildCases(
        'is_hukuku',
        'Is hukuku',
        'yargitay',
        'İşçi, işveren, fesih bildirimi, puantaj kaydı, bordro, fazla mesai, kıdem tazminatı, ihbar tazminatı, işe iade ve geçerli neden başlıkları aynı olay örgüsü içinde tekrar tekrar açıklanmakta; tanık, SGK kaydı ve yazılı delil birlikte değerlendirilmektedir.',
        [
            'Davacı işçi, belirsiz süreli iş sözleşmesinin haksız ve geçersiz şekilde sona erdirildiğini, performans düşüklüğü savunmasının gerçeği yansıtmadığını, fesih bildiriminin soyut olduğunu, işyerinde otuzdan fazla çalışan bulunduğunu ve 4857 sayılı İş Kanunu kapsamında işe iade ile boşta geçen süre ücretine karar verilmesi gerektiğini ileri sürmektedir.',
            'İşçilik alacağı davasında davacı, uzun yıllar boyunca fazla mesai yaptığını, ulusal bayram ve genel tatil günlerinde çalıştığını, bordroların gerçeği yansıtmadığını, puantaj kayıtlarının işveren tarafından tek taraflı tutulduğunu ve kıdem ile ihbar tazminatının eksik hesaplandığını ayrıntılı olarak anlatmaktadır.',
            'Mobbing nedeniyle manevi tazminat ve haklı fesih talepli dosyada işçi, yöneticisinin sürekli küçük düşürücü sözler kullandığını, görev tanımı dışındaki işlerin verildiğini, tanıkların bunu doğruladığını, psikolojik tedavi gördüğünü ve işyerinde maruz kaldığı baskının iş sözleşmesini sürdürmeyi çekilmez hale getirdiğini ileri sürmektedir.',
            'Alt işverenlik ilişkisinin muvazaalı olduğu iddiasıyla açılan davada işçi, asıl işverenin yönetim hakkını fiilen kullandığını, ücretlerin aynı merkezden ödendiğini, işe giriş çıkış talimatlarının ana şirketten geldiğini, SGK kayıtları ile tanık anlatımlarının bu hususu desteklediğini ve tüm işçilik alacaklarından müşterek sorumluluk talep ettiğini açıklamaktadır.',
            'Toplu işten çıkarma ve sendikal fesih iddialarının bulunduğu uyuşmazlıkta davacı işçi, sendika üyeliği nedeniyle hedef alındığını, performans değerlendirmesinin yapay biçimde düşürüldüğünü, benzer durumda olmayan işçilerin korunup kendisinin işten çıkarıldığını ve geçerli neden savunmasının dürüstlük kuralına aykırı olduğunu ileri sürmektedir.',
        ],
    ),
    ...buildCases(
        'aile',
        'Aile hukuku',
        'yargitay',
        'Boşanma, velayet, nafaka, kişisel ilişki, ziynet eşyası, mal rejimi, aile konutu, sosyal inceleme raporu ve çocuğun üstün yararı başlıkları aynı anlatım içinde ayrıntılı biçimde tekrarlanmakta, taraf beyanları ile tanık ve mesaj kayıtları birlikte değerlendirilmektedir.',
        [
            'Taraflar arasındaki boşanma davasında davacı eş, evlilik birliğinin temelinden sarsıldığını, davalının sadakat yükümlülüğüne aykırı davrandığını, ortak yaşamın çekilmez hale geldiğini, mesaj kayıtları ve tanık anlatımları ile kusurun ispatlandığını, TMK 166 kapsamında boşanma ile maddi ve manevi tazminata karar verilmesi gerektiğini savunmaktadır.',
            'Velayet ve iştirak nafakası talepli dosyada anne, çocuğun eğitim düzeninin kendi yanında oturduğu çevrede kurulduğunu, babanın düzensiz gelir ve konut koşullarının yetersiz olduğunu, sosyal inceleme raporunun çocuğun üstün yararının anne yanında kalmasını desteklediğini ve kişisel ilişkinin buna göre düzenlenmesi gerektiğini ileri sürmektedir.',
            'Ziynet eşyalarının iadesi ve mal rejiminin tasfiyesi istemli aile hukuku uyuşmazlığında davacı kadın, düğünde takılan altınların koca tarafından alındığını, aile baskısı nedeniyle bunları geri isteyemediğini, banka hareketleri ve tanık anlatımlarıyla ziynetlerin bozdurulduğunu, ayrıca edinilmiş mallara katılma rejimi çerçevesinde katılma alacağı talep ettiğini belirtmektedir.',
            '6284 sayılı Kanun kapsamında koruyucu ve önleyici tedbir istenen olayda başvuran eş, eşinin tehdit, hakaret ve fiziksel şiddet uyguladığını, ortak konutun aile konutu niteliğinde olduğunu, uzaklaştırma, iletişim yasağı ve müşterek çocuğa yönelik güvenlik tedbirlerinin derhal uygulanması gerektiğini detaylı şekilde anlatmaktadır.',
            'Soybağının reddi ve babalık iddialarının aynı dosyada tartışıldığı aile mahkemesi yargılamasında taraflar, DNA raporu, doğum kayıtları, birlikte yaşama olgusu, çocukla kurulan kişisel ilişki ve nafaka yükümlülüğünün geleceği bakımından soybağı hükümlerinin nasıl uygulanması gerektiğini uzun uzun açıklamaktadır.',
        ],
    ),
    ...buildCases(
        'icra',
        'Icra hukuku',
        'yargitay',
        'İcra takibi, ödeme emri, haciz, kambiyo senedi, menfi tespit, itirazın iptali, tebligat tarihi, icra dosya numarası ve icra inkar tazminatı kavramları aynı uyuşmazlıkta tekrar edilmektedir. Borçluluk, süre ve takip hukuku kuralları birlikte anlatılmaktadır.',
        [
            'Davacı alacaklı, cari hesap alacağına dayalı ilamsız takip başlattığını, borçlunun haksız itirazı nedeniyle takibin durduğunu, fatura ve teslim belgeleriyle alacağın sabit olduğunu, İİK 67 kapsamında itirazın iptali ile icra inkar tazminatına hükmedilmesi gerektiğini ayrıntılı olarak açıklamaktadır.',
            'Menfi tespit ve istirdat davasında davacı, imzanın kendisine ait olmayan bir bonoya dayanılarak kambiyo takibi yapıldığını, borç doğurucu ilişkinin hiç kurulmadığını, ödeme tehdidi altında bedel ödediğini ve takibin haksızlığı nedeniyle ödediği paranın geri verilmesini talep ettiğini anlatmaktadır.',
            'Haczedilemezlik şikayetinde borçlu, emekli maaşına ve tek konut niteliğindeki taşınmaza haciz konulduğunu, geçimini yalnızca bu gelirle sağladığını, icra müdürlüğünün işleminin İİK hükümlerine aykırı olduğunu ve haczin kaldırılması gerektiğini ayrıntılı biçimde ileri sürmektedir.',
            'İhalenin feshi istemli icra dosyasında başvuran, satış ilanının usulüne uygun tebliğ edilmediğini, kıymet takdiri raporunun güncel olmadığını, ihalenin çok düşük bedelle yapıldığını, artırma şartlarının şeffaf yürütülmediğini ve fesat niteliğinde davranışlar nedeniyle ihalenin iptalini talep etmektedir.',
            'Kambiyo senetlerine mahsus takipte borçlu, takip dayanağı çekin teminat çeki olduğunu, vade ve keşide tarihleri arasındaki uyumsuzlukların bulunduğunu, yetkisiz icra dairesinde takip başlatıldığını, ödeme emrinin yanlış adrese tebliğ edildiğini ve tüm bu sebeplerle takibin iptal edilmesi gerektiğini savunmaktadır.',
        ],
    ),
    ...buildCases(
        'borclar',
        'Borclar hukuku',
        'yargitay',
        'Sözleşme, borç, ifa, temerrüt, tazminat, haksız fiil, kusur, nedensellik bağı, kira ilişkisi, banka hareketi, tanık ve bilirkişi raporu kavramları borçlar hukuku uyuşmazlığının merkezinde tekrar edilmektedir.',
        [
            'Taraflar arasındaki eser sözleşmesinde davacı iş sahibi, yüklenicinin işi ayıplı ve eksik teslim ettiğini, teslim sonrası ortaya çıkan kusurların bilirkişi raporuyla tespit edildiğini, TBK hükümleri gereğince bedel indirimi ile zararının tazminini talep ettiğini ve sözleşmeye aykırılığın ağır olduğunu ileri sürmektedir.',
            'Haksız fiil kaynaklı maddi ve manevi tazminat davasında davacı, davalının kusurlu davranışı nedeniyle işyerinin zarar gördüğünü, müşteri kaybı oluştuğunu, nedensellik bağının kamera kayıtları ve uzman raporlarıyla sabit olduğunu, TBK 49 çerçevesinde hem doğrudan zarar hem de yoksun kalınan kar için tazminat istediğini açıklamaktadır.',
            'Kira sözleşmesine dayalı tahliye ve alacak davasında kiraya veren, kiracının kira bedellerini sürekli geciktirdiğini, iki haklı ihtara rağmen ödeme yapmadığını, taşınmazı sözleşmeye aykırı kullandığını, komşuların şikayetlerinin bulunduğunu ve TBK kapsamında tahliye ile birikmiş kira alacağının tahsilini talep etmektedir.',
            'Sebepsiz zenginleşme davasında davacı, yanlış hesaba yaptığı yüksek tutarlı ödemenin iade edilmediğini, bankacılık kayıtlarının hatayı ortaya koyduğunu, davalının bu parayı haklı bir sebep olmadan kullandığını ve TBK hükümleri uyarınca iade borcunun doğduğunu ayrıntılı biçimde ileri sürmektedir.',
            'Vekalet sözleşmesinden kaynaklanan sorumluluk davasında müvekkil, vekilin gerekli özeni göstermeden satış işlemi yaptığını, piyasa değerinin çok altında bedelle devir gerçekleştirdiğini, banka dekontları ve tapu kayıtlarının bunu gösterdiğini, sadakat ve özen borcuna aykırılık nedeniyle tazminat talep ettiğini anlatmaktadır.',
        ],
    ),
    ...buildCases(
        'ticaret',
        'Ticaret hukuku',
        'yargitay',
        'Anonim şirket, limited şirket, genel kurul, ortaklar kurulu, ticari defter, çek, bono, cari hesap, konkordato, haksız rekabet ve ticari faiz kavramları aynı olay dizisinde tekrar edilmekte; şirket içi kararlar ve ticari belgeler birlikte değerlendirilmektedir.',
        [
            'Anonim şirket genel kurul kararının iptali istemli davada davacı ortak, toplantı çağrısının usulsüz yapıldığını, gündeme aykırı şekilde sermaye artırımı kararı alındığını, pay sahiplerinin bilgi alma hakkının ihlal edildiğini, yönetim kurulu raporlarının eksik olduğunu ve TTK hükümleri gereğince genel kurul kararının hükümsüz sayılması gerektiğini savunmaktadır.',
            'Limited şirket müdürünün sorumluluğuna ilişkin ticaret mahkemesi dosyasında şirket ortağı, müdürün şirket varlıklarını bağlı şirkete kaydırdığını, ticari defter kayıtlarını gerçeğe aykırı düzenlediğini, cari hesap hareketlerinin olağan akışa aykırı olduğunu ve şirkete verilen zararın tazminini talep etmektedir.',
            'Haksız rekabet ve marka hakkına tecavüz iddiasıyla açılan davada davacı şirket, davalının ayırt edilemeyecek derecede benzer marka ve ambalaj kullandığını, müşteri kitlesinin karıştırıldığını, internet satış sayfalarında yanıltıcı beyanların yer aldığını ve haksız rekabetin durdurulması ile maddi manevi tazminat gerektiğini belirtmektedir.',
            'Çek bedeline dayalı ticari alacak uyuşmazlığında davacı, çekin mal teslimine dayandığını, karşılıksız çıktığını, ticari defterlerle sevk irsaliyelerinin birbirini doğruladığını, temerrüt tarihinden itibaren avans faizi uygulanması gerektiğini ve borçlunun ticari teamüllere aykırı davrandığını ayrıntılı şekilde açıklamaktadır.',
            'Konkordato mühleti sürecinde alacaklı şirket, borçlunun gerçek mali durumunu gizlediğini, iyileştirme projesinin inandırıcı olmadığını, ilişkili şirketlere kaynak aktarıldığını, banka yazıları ve uzman incelemeleriyle bunun ortaya çıktığını, bu nedenle tasdik talebinin reddedilmesi gerektiğini ileri sürmektedir.',
        ],
    ),
    ...buildCases(
        'gayrimenkul',
        'Gayrimenkul hukuku',
        'yargitay',
        'Tapu kaydi, tescil, ecrimisil, elatmanin onlenmesi, muris muvazaasi, ortakligin giderilmesi, kat karsiligi insaat, kira tahliye ve yonetim plani kavramlari tasinmaz uyusmazliginin farkli yuzleri olarak metin boyunca tekrar edilmektedir.',
        [
            'Davacilar, murisin tasinmazi gorunuste satis gibi gosterip gercekte bagis amaciyla tek mirasciya devrettigini, bedel odemesi bulunmadigini, tapu kayitlari ile banka hareketlerinin bunu destekledigini ve muris muvazaasi nedeniyle tapu iptali ve tescil karari verilmesi gerektigini ileri surmektedir.',
            'Ortakligin giderilmesi davasinda paydaslar, birden fazla parsel uzerinde payli mulkiyet iliskisinin surdugunu, aynen taksimin mumkun olmadigini, satis suretiyle ortakligin giderilmesinin hak ve nesafete uygun olacagini ve tapu kayitlariyla bilirkisi raporlarinin bunu destekledigini anlatmaktadir.',
            'Davaci malikler, komsu parsel malikinin siniri asarak tasinmazi kullandigini, bahce duvarini ve ortak gecis alanini kapattigini, bu nedenle elatmanin onlenmesi ile ecrimisil talep ettiklerini, kesif ve bilirkisi raporunun haksiz isgali ortaya koydugunu aciklamaktadir.',
            'Kiraya veren, konut ihtiyaci nedeniyle tahliye talebinde bulundugunu, ihtarnamelerin suresinde gonderildigini, kiracinin odemelerini duzensiz yaptigini, kira bedelinin de rayice gore guncellenmesi gerektigini ve hem tahliye hem kira tespiti yonunden karar verilmesini istemektedir.',
            'Arsa payi karsiligi insaat sozlesmesinden dogan davada arsa sahipleri, muteahhidin teslim suresini asmasi, bagimsiz bolumleri eksik ve ayipli teslim etmesi, yonetim plani ile bagimsiz bolum devri yukumluluklerini yerine getirmemesi nedeniyle tapu devrinin durdurulmasi ile tazminat istediklerini belirtmektedir.',
        ],
    ),
    ...buildCases(
        'idare',
        'Idare hukuku',
        'danistay',
        'İdari işlem, iptal davası, tam yargı, belediye encümeni, ruhsat iptali, imar para cezası, kamu gücü, ölçülülük, hukuki güvenlik ve tebligat tarihi kavramları aynı dosyada tekrar tekrar vurgulanmaktadır.',
        [
            'Davacı şirket, belediye encümeni tarafından tesis edilen imar para cezası ve yıkım kararının hukuka aykırı olduğunu, yapı ruhsatına uygun inşaat yaptığını, savunma alınmadan işlem kurulduğunu, ölçülülük ve hukuki güvenlik ilkelerinin ihlal edildiğini, bu nedenle idari işlemin iptalini ve uğranılan zararın tazminini istemektedir.',
            'Kamu görevlisinin atama işleminin iptali istemli davada davacı, liyakat ve kariyer ilkelerine aykırı biçimde görev yerinin değiştirildiğini, disiplin soruşturması sonucu beklenmeden işlem kurulduğunu, hizmet gereklerinin somut gösterilmediğini ve Danıştay içtihatlarına göre işlemin iptali gerektiğini ileri sürmektedir.',
            'Tam yargı davasında başvuran, idarenin yol bakım hizmetini zamanında yapmaması sebebiyle aracının ciddi zarar gördüğünü, olay yeri fotoğrafları, bilirkişi raporu ve resmi tutanaklarla hizmet kusurunun sabit olduğunu, kamu hizmetinin kötü işlemesi nedeniyle maddi tazminata hükmedilmesini talep etmektedir.',
            'Ruhsat iptali ve faaliyetten men işlemlerine karşı açılan davada işletme sahibi, idarenin denetim sırasında tutanakları eksik düzenlediğini, eksikliklerin giderilmesi için makul süre vermediğini, kapatma işleminin orantısız olduğunu ve kazanılmış hak ilkesinin göz ardı edildiğini açıklamaktadır.',
            'Kamulaştırmasız el atma nedeniyle açılan davada davacılar, taşınmazlarının imar planında yol ve park alanında bırakıldığını, fiilen kullanılamaz hale geldiğini, idarenin uzun yıllar işlem yapmadığını, mülkiyet hakkına ağır müdahale oluştuğunu ve tam yargı kapsamında bedel ödenmesi gerektiğini savunmaktadır.',
        ],
    ),
    ...buildCases(
        'vergi',
        'Vergi hukuku',
        'danistay',
        'Vergi tarhiyatı, vergi ziyaı cezası, KDV indirimi, sahte fatura, inceleme raporu, tarhiyat ihbarnamesi, mükellef kayıtları, banka hareketi ve ispat yükü kavramları vergi uyuşmazlığında tekrar edilmektedir.',
        [
            'Mükellef şirket, KDV indiriminin reddi ve vergi ziyaı cezası içeren tarhiyat ihbarnamesine karşı açtığı davada, alış faturalarının gerçek mal teslimine dayandığını, banka hareketleri ile sevk irsaliyelerinin bunu doğruladığını, inceleme raporunun varsayıma dayalı olduğunu ve tarhiyatın kaldırılması gerektiğini savunmaktadır.',
            'Sahte fatura kullanma iddiasına dayalı tarhiyat uyuşmazlığında davacı, mal giriş çıkış kayıtlarının bulunduğunu, depo sayımlarının teslimleri doğruladığını, tedarikçi firmayla yapılan yazışmaların gerçek ticari ilişkiyi gösterdiğini, VUK kapsamında ceza kesilmesi için somut ispat gerektiğini ileri sürmektedir.',
            'Gelir vergisi ve kurumlar vergisi tarhiyatına ilişkin dosyada mükellef, gider yazdığı ödemelerin ticari faaliyetin doğal sonucu olduğunu, transferlerin banka kanalıyla yapıldığını, inceleme raporunda emsal karşılaştırmasının hatalı olduğunu ve vergi idaresinin takdir yetkisini ölçüsüz kullandığını ayrıntılı olarak açıklamaktadır.',
            'Özel usulsüzlük cezasına karşı açılan davada davacı, e-fatura ve e-arşiv kayıtlarının sistemsel arıza nedeniyle geç yüklendiğini, kastının bulunmadığını, kusur oranının değerlendirilmediğini, uygulanan cezanın orantısız olduğunu ve vergi hukukunda dürüst mükellef davranışının göz önünde bulundurulması gerektiğini savunmaktadır.',
            'Vergi mahkemesine sunulan dilekçede davacı, uzlaşma sürecinin usule uygun yürütülmediğini, tarhiyat öncesi savunma hakkının kısıtlandığını, inceleme elemanının dayandığı tespitlerin bir kısmının başka mükellef dosyalarından aktarıldığını ve bu nedenle cezalı tarhiyatın iptali gerektiğini ileri sürmektedir.',
        ],
    ),
    ...buildCases(
        'tuketici',
        'Tuketici hukuku',
        'yargitay',
        'Tüketici sözleşmesi, ayıplı mal, ayıplı hizmet, cayma hakkı, garanti belgesi, servis kaydı, bedel iadesi, hakem heyeti ve satıcı sorumluluğu başlıkları uzun olay örgüsünde tekrar edilmektedir.',
        [
            'Davacı tüketici, satın aldığı elektronik cihazın kısa süre içinde arızalandığını, yetkili servisin aynı sorunu defalarca gideremediğini, garanti kapsamındaki onarımın sonuç vermediğini, tüketici hakem heyeti kararına rağmen bedel iadesinin yapılmadığını ve ayıplı mal nedeniyle bedel iadesi ile yargılama gideri istediğini açıklamaktadır.',
            'Mesafeli satış sözleşmesinden doğan uyuşmazlıkta tüketici, cayma hakkını süresi içinde kullandığını, ürünü iade ettiğini, satıcının bedeli geri ödemediğini, sözleşmede yer alan ağır şartların haksız şart niteliğinde olduğunu ve TKHK hükümleri gereğince iade ile faiz talep ettiğini ileri sürmektedir.',
            'Ayıplı hizmet iddiasına dayalı davada davacı, özel eğitim ve danışmanlık paketinin vaat edilen içerikte sunulmadığını, reklam ve tanıtım metinlerinin gerçeği yansıtmadığını, hizmetten beklenen yararın sağlanmadığını ve tüketici hukukuna göre ücretin iadesi ile tazminat gerektiğini savunmaktadır.',
            'Konut satışına ilişkin tüketici davasında alıcı, teslim edilen dairede projeye aykırı imalat, eksik sosyal alan ve gizli ayıplar bulunduğunu, ekspertiz ve teknik raporlarla bunların saptandığını, satıcının teslim öncesi farklı vaatlerde bulunduğunu ve seçimlik haklardan bedel indirimi ile giderim talep ettiğini anlatmaktadır.',
            'Abonelik sözleşmesine bağlı otomatik yenileme tartışmasında tüketici, iptal talebine rağmen üyeliğin uzatıldığını, kredi kartından birden fazla tahsilat yapıldığını, bilgilendirme yükümlülüğünün yerine getirilmediğini, haksız şart ve açık rıza sorunları bulunduğunu ve tahsil edilen bedellerin iadesini istediğini ayrıntılı şekilde belirtmektedir.',
        ],
    ),
    ...buildCases(
        'sigorta',
        'Sigorta hukuku',
        'yargitay',
        'Sigorta poliçesi, hasar dosyası, eksper raporu, trafik kazası, kasko, değer kaybı, riziko, rücu, kusur oranı ve teminat kapsamı kavramları uyuşmazlığın bütününde tekrar edilmektedir.',
        [
            'Kasko sigortasına dayalı tazminat davasında davacı araç sahibi, trafik kazası sonrası eksper raporuyla ağır hasarın tespit edildiğini, poliçe teminatının bunu kapsadığını, sigorta şirketinin eksik ödeme yaptığını, aracın değer kaybı ve ikame araç mahrumiyeti zararlarının da poliçe ve genel şartlar kapsamında karşılanması gerektiğini savunmaktadır.',
            'Zorunlu trafik sigortası uyuşmazlığında davacı, kazada kusur oranının karşı tarafta olduğunu, hasar dosyası ve kaza tespit tutanağının bunu açıkça gösterdiğini, sigorta şirketinin teminat dışı savunmasının yerinde olmadığını ve maddi hasar ile değer kaybı bedelinin tam ödenmesi gerektiğini ileri sürmektedir.',
            'Rücu davasında sigorta şirketi, sigortalıya ödeme yaptıktan sonra gerçek sorumlu sürücüye döndüğünü, alkollü araç kullanımı nedeniyle poliçe kapsamında rücu hakkının doğduğunu, ceza dosyası, alkol raporu ve hasar ödemesi belgelerinin bu hakkı desteklediğini ayrıntılı biçimde açıklamaktadır.',
            'Yangın sigortası kapsamında açılan davada işyeri sahibi, rizikonun gerçekleştiği tarihte poliçenin yürürlükte olduğunu, eksper raporlarının gerçek zararı ortaya koyduğunu, sigortacının eksik inceleme yaptığını ve emtia kaybı ile iş durması zararının poliçe hükümlerine göre karşılanması gerektiğini anlatmaktadır.',
            'Sağlık sigortası sözleşmesinden doğan ihtilafta davacı, ameliyat giderlerinin poliçe özel şartları içinde kaldığını, önceki hastalık istisnasının somut olayda uygulanamayacağını, hastane kayıtları ile doktor raporlarının bunu doğruladığını ve reddedilen masrafın faiziyle ödenmesini talep etmektedir.',
        ],
    ),
    ...buildCases(
        'miras',
        'Miras hukuku',
        'yargitay',
        'Miras, tenkis, muris muvazaası, saklı pay, vasiyetname, tereke, veraset ilamı, tapu kaydı ve mirasçılık ilişkisi kavramları uzun anlatım boyunca tekrar edilmektedir. Tasarruf özgürlüğü ile saklı pay dengesi birlikte tartışılmaktadır.',
        [
            'Muris muvazaası nedeniyle tapu iptali ve tescil davasında davacılar, murisin sağlığında taşınmazı görünüşte satış gibi göstererek bir mirasçıya devrettiğini, gerçekte bağış iradesinin bulunduğunu, bedel ödenmediğini, tanık anlatımları ve banka kayıtlarının muvazaayı ortaya koyduğunu ileri sürmektedir.',
            'Tenkis davasında saklı pay sahibi mirasçı, murisin ölümünden kısa süre önce yaptığı bağışlarla terekenin önemli bölümünü elden çıkardığını, bu işlemlerin saklı payını zedelediğini, veraset ilamı ve bilirkişi hesaplarıyla ihlalin netleştiğini ve TMK hükümleri uyarınca tenkis yapılması gerektiğini savunmaktadır.',
            'Vasiyetnamenin iptali istemli dosyada davacılar, murisin düzenleme tarihinde fiil ehliyetinin bulunmadığını, ileri yaş ve ağır hastalık nedeniyle iradesinin zayıfladığını, tıbbi raporlar ile tanık anlatımlarının bunu gösterdiğini ve vasiyetnamenin geçersiz sayılması gerektiğini ileri sürmektedir.',
            'Mirasın reddi ve tereke borçlarının tespiti tartışılan davada başvuran mirasçılar, murisin çok sayıda icra takibi ve banka borcu bıraktığını, aktiflerin pasifleri karşılamadığını, ölüm tarihindeki mali tablonun bunu doğruladığını ve süresinde yapılan ret beyanının hukuken geçerli olduğunun tespitini talep etmektedir.',
            'Ortaklığın giderilmesi ve miras payının belirlenmesi uyuşmazlığında taraflar, birden fazla taşınmazın terekeye dahil olduğunu, bazı tapu kayıtlarının muris muvazaası şüphesi taşıdığını, veraset ilamı ile nüfus kayıtlarının mirasçılık durumunu gösterdiğini ve paylaştırmanın buna göre yapılması gerektiğini uzun uzun açıklamaktadır.',
        ],
    ),
    ...buildCases(
        'anayasa',
        'Anayasa hukuku',
        'anayasa',
        'Anayasa Mahkemesi, bireysel başvuru, adil yargılanma hakkı, ifade özgürlüğü, mülkiyet hakkı, etkili başvuru, orantılılık ve hak ihlali değerlendirmesi metin boyunca tekrar edilmektedir. İç hukuk yollarının tüketilmesi ve ihlal sonucunun giderimi birlikte ele alınmaktadır.',
        [
            'Başvurucu, uzun tutukluluk ve makul sürede yargılanmama nedeniyle Anayasa Mahkemesine bireysel başvuruda bulunduğunu, ceza yargılamasının yıllarca sürdüğünü, savunma hakkının kısıtlandığını, kişi özgürlüğü ile güvenliği hakkının ve adil yargılanma hakkının ihlal edildiğini ayrıntılı biçimde ileri sürmektedir.',
            'İfade özgürlüğüne ilişkin bireysel başvuruda gazeteci başvurucu, bir haber ve köşe yazısı nedeniyle hakkında mahkumiyet kurulduğunu, kamu yararına ilişkin tartışmaya katkı sunduğunu, uygulanan yaptırımın caydırıcı etki yarattığını ve Anayasa nın 26. maddesi kapsamında ihlal kararı verilmesi gerektiğini savunmaktadır.',
            'Mülkiyet hakkı şikayetinde başvurucu, imar planı ve kamusal müdahaleler nedeniyle taşınmazını yıllarca kullanamadığını, kamulaştırma yapılmadan ağır sınırlama getirildiğini, iç hukukta etkili giderim bulunmadığını ve Anayasa Mahkemesinin mülkiyet hakkı ile etkili başvuru hakkı yönünden ihlal tespiti yapmasını talep etmektedir.',
            'Toplantı ve gösteri yürüyüşü hakkına ilişkin başvuruda başvuranlar, barışçıl gösteriye yapılan müdahalenin gereksiz ve orantısız olduğunu, kolluk kuvvetlerinin güç kullanımının ölçüsüz kaldığını, idari ve yargısal mercilerin bu şikayetleri etkili şekilde incelemediğini ve temel hak ihlali kararı verilmesi gerektiğini anlatmaktadır.',
            'Özel hayata saygı hakkı kapsamında yapılan başvuruda başvurucu, kişisel verilerinin rızası dışında işlendiğini, kamu makamlarının yeterli koruma sağlamadığını, mahkemelerin şikayetlerini yüzeysel gerekçelerle reddettiğini, bu nedenle hem özel hayat hem de etkili başvuru hakkının ihlal edildiğini ayrıntılı şekilde açıklamaktadır.',
        ],
    ),
];

describe('legal search routed domain matrix', () => {
    it.each(domainCases)('routes $name to $domain skill', ({ domain, label, expectedSource, text }) => {
        expect(wordCount(text)).toBeGreaterThanOrEqual(250);

        const skillPackage = buildSkillBackedSearchPackage({
            rawText: text,
            preferredSource: 'all',
        });

        expect(skillPackage?.active).toBe(true);
        expect(skillPackage?.primaryDomain).toBe(domain);
        expect(skillPackage?.queryMode).toBe('long_fact');
        expect(skillPackage?.strategies).toHaveLength(3);
        expect(skillPackage?.context?.domainLabel).toBe(label);
        expect(skillPackage?.sourceTargets).toEqual(expect.arrayContaining([expectedSource]));
    });
});
