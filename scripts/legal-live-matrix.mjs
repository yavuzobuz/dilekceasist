import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import handler from '../backend/legal/search-decisions.js';

const DEFAULT_VARIANTS = ['short_issue', 'long_fact', 'document_style'];
const VARIANT_LABELS = {
  short_issue: 'Short Issue',
  long_fact: 'Long Fact',
  document_style: 'Document Style',
};

function parseNonNegativeIntEnv(name) {
  const raw = process.env[name];
  if (raw == null || raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseVariantList(value) {
  const variants = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => DEFAULT_VARIANTS.includes(item));
  return variants.length > 0 ? Array.from(new Set(variants)) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunkItems(items, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
}

function isRetryableMatrixErrorMessage(value = '') {
  return /429|too many requests|rate limit|epipe|broken pipe|timeout/i.test(String(value || ''));
}

const MATRIX_CONFIG = {
  enabledVariants: parseVariantList(process.env.LEGAL_MATRIX_VARIANTS) || [...DEFAULT_VARIANTS],
  variantLimits: {
    short_issue: parseNonNegativeIntEnv('LEGAL_MATRIX_SHORT_COUNT'),
    long_fact: parseNonNegativeIntEnv('LEGAL_MATRIX_LONG_COUNT'),
    document_style: parseNonNegativeIntEnv('LEGAL_MATRIX_DOCUMENT_COUNT'),
  },
  concurrency: Math.max(1, Math.min(8, parseNonNegativeIntEnv('LEGAL_MATRIX_CONCURRENCY') || 2)),
  batchSize: Math.max(1, Math.min(24, parseNonNegativeIntEnv('LEGAL_MATRIX_BATCH_SIZE') || 6)),
  pauseMs: Math.max(0, parseNonNegativeIntEnv('LEGAL_MATRIX_PAUSE_MS') || 1500),
  retryCount: Math.max(0, Math.min(5, parseNonNegativeIntEnv('LEGAL_MATRIX_RETRY_COUNT') || 1)),
  retryBackoffMs: Math.max(250, parseNonNegativeIntEnv('LEGAL_MATRIX_RETRY_BACKOFF_MS') || 2500),
};

const OUTPUT_PREFIX = process.env.LEGAL_MATRIX_OUTPUT_PREFIX
  ? path.resolve(process.env.LEGAL_MATRIX_OUTPUT_PREFIX)
  : path.resolve('output/legal-live-matrix');
const OUTPUT_JSON = `${OUTPUT_PREFIX}-results.json`;
const OUTPUT_MD = `${OUTPUT_PREFIX}-report.md`;
const REPORT_TYPE = 'matrix';

const BRANCHES = [
  {
    id: 'is_hukuku',
    label: 'Is Hukuku',
    expectedSources: ['yargitay'],
    expectedMarkers: ['hukuk'],
    minMatched: 2,
    cases: [
      { id: 'ise-iade-gecersiz-fesih', label: 'Ise iade ve gecersiz fesih', rawQuery: 'Gecersiz nedenle feshedilen is sozlesmesi nedeniyle ise iade, bos gecen sure ucreti ve ise baslatmama tazminati talebi.' },
      { id: 'fazla-mesai-puantaj', label: 'Fazla mesai ve puantaj', rawQuery: 'Haftalik 45 saati asan calisma nedeniyle fazla mesai alacagi, puantaj kayitlari ve tanik anlatimlariyla ispat.' },
      { id: 'kidem-askerlik', label: 'Askerlik nedeniyle fesih ve kidem', rawQuery: 'Askerlik hizmeti nedeniyle is sozlesmesini sona erdiren iscinin kidem tazminati talebi.' },
      { id: 'ihbar-haksiz-fesih', label: 'Haksiz fesih ve ihbar tazminati', rawQuery: 'Isveren tarafindan bildirimsiz ve haksiz sekilde feshedilen is sozlesmesi nedeniyle ihbar tazminati talebi.' },
      { id: 'yillik-izin', label: 'Yillik izin ucreti', rawQuery: 'Kullanilmayan yillik izin surelerine iliskin ucret alacaginin fesih sonrasi talebi.' },
      { id: 'hafta-tatili', label: 'Hafta tatili ucreti', rawQuery: 'Hafta tatillerinde calistirilan iscinin hafta tatili ucreti alacagi talebi.' },
      { id: 'ubgt', label: 'Ulusal bayram genel tatil ucreti', rawQuery: 'Ulusal bayram ve genel tatil gunlerinde yapilan calisma karsiligi ucret alacagi talebi.' },
      { id: 'mobbing-fesih', label: 'Mobbing nedeniyle hakli fesih', rawQuery: 'Isyerinde psikolojik baski ve sistematik mobbing nedeniyle isci tarafindan yapilan hakli feshe dayali kidem tazminati talebi.' },
      { id: 'eksik-ucret', label: 'Eksik ucret odemesi', rawQuery: 'Banka hesap hareketlerine gore eksik odendigi ileri surulen aylik ucret farki alacagi.' },
      { id: 'hizmet-tespiti', label: 'Sigortasiz calisma ve hizmet tespiti', rawQuery: 'Sigortasiz calistirildigini ileri suren davacinin hizmet tespiti istemi.' },
      { id: 'sendikal-tazminat', label: 'Sendikal tazminat', rawQuery: 'Sendikal faaliyet nedeniyle is sozlesmesi feshedilen iscinin sendikal tazminat talebi.' },
      { id: 'esit-davranma', label: 'Esit davranma borcu', rawQuery: 'Ayni nitelikteki isciler arasinda farkli ucret uygulanmasi nedeniyle esit davranma borcuna aykirilik tazminati.' },
      { id: 'prim-alacagi', label: 'Prim alacagi', rawQuery: 'Satis hedeflerine bagli prim sisteminde odenmeyen prim alacaginin tahsili talebi.' },
      { id: 'bonus-hedef', label: 'Bonus ve performans primi', rawQuery: 'Yillik hedeflere bagli bonus odemesinin yapilmamasi nedeniyle alacak talebi.' },
      { id: 'ikale-gecersiz', label: 'Ikale gecerliligi', rawQuery: 'Ikale sozlesmesinin irade fesadina dayandigi iddiasiyla ise iade ve iscilik alacaklari talebi.' },
      { id: 'baskiyla-istifa', label: 'Baski ile alinan istifa', rawQuery: 'Isverence baski altinda alindigi ileri surulen istifa dilekcesinin gecersizligi ve kidem ihbar tazminati talebi.' },
      { id: 'ise-baslatmama', label: 'Ise baslatmama tazminati', rawQuery: 'Ise iade karari sonrasinda ise baslatilmayan iscinin ise baslatmama tazminati ve bos gecen sure ucreti talebi.' },
      { id: 'yemek-yol', label: 'Yemek ve yol yardimi', rawQuery: 'Ucrete ek niteligindeki yemek ve yol yardimlarinin eksik odenmesi nedeniyle alacak talebi.' },
      { id: 'cagri-merkezi-gece', label: 'Gece vardiyasi ve uzun mesai', rawQuery: 'Cagri merkezinde gece vardiyasinda haftada 6 gun 12 saat calistigini, puantajlarin eksik tutuldugunu ileri suren iscinin fazla mesai ve hafta tatili alacagi talebi.' },
      { id: 'market-mudur-fazla-mesai', label: 'Unvanli iscide fazla mesai', rawQuery: 'Zincir markette vardiya muduru unvaniyla calisan kisinin yonetici sayilip sayilmayacagi ve fazla mesai alacagi talebi.' },
    ],
  },
  {
    id: 'ceza',
    label: 'Ceza',
    expectedSources: ['yargitay'],
    expectedMarkers: ['ceza'],
    minMatched: 2,
    cases: [
      { id: 'uyusturucu-kullanma-ticaret', label: 'Uyusturucu ticareti mi bulundurma mi', rawQuery: 'Sanigin uzerinde ve evinde arama yapilmasina ragmen satis bedeline, hassas teraziye ya da paketlenmis satis materyaline rastlanmamasi; ele gecen miktarin kullanma sinirlari icinde kalmasi ve dosyada baskaca ticaret iliskisini gosteren somut delil bulunmamasi halinde, uyusturucu madde ticareti sucu yerine kullanmak icin bulundurma ihtimali guclenir.', specific: true },
      { id: 'haksiz-tahrik-yaralama', label: 'Haksiz tahrik ve kasten yaralama', rawQuery: 'Ani gelisen kavga ortaminda haksiz tahrik altinda islenen kasten yaralama sucunda tahrik indirimi uygulanip uygulanmayacagi.' },
      { id: 'mesru-savunma', label: 'Mesru savunma', rawQuery: 'Sanigin kendisine yonelen haksiz saldiri karsisinda mesru savunma sinirlari icinde hareket edip etmedigi.' },
      { id: 'arama-usulsuzluk', label: 'Arama islemi usulsuzlugu', rawQuery: 'Konutta yapilan aramada hakim karari ve gecikmesinde sakinca bulunmayan hal kosullarinin bulunmamasi nedeniyle elde edilen delilin hukuka uygunlugu.' },
      { id: 'tutuklama-olcululuk', label: 'Tutuklama olcululugu', rawQuery: 'Kuvvetli suphe ve kacma delil karartma tehlikesi bulunup bulunmadigi acisindan tutuklama tedbirinin olcululugu.' },
      { id: 'nitelikli-dolandiricilik', label: 'Internet ilan dolandiriciligi', rawQuery: 'Internet uzerinden sahte ilan verilerek para alinmasi halinde nitelikli dolandiricilik sucu unsurlari.' },
      { id: 'basit-yaralama-karsilikli', label: 'Karsilikli kavga yaralama', rawQuery: 'Karsilikli kavga halinde taraflarin birbirini yaralamasi durumunda haksiz tahrik ve karsilikli yaralama degerlendirmesi.' },
      { id: 'tehdit-hakaret-whatsapp', label: 'Whatsapp tehdit ve hakaret', rawQuery: 'Whatsapp mesajlariyla islenen tehdit ve hakaret sucunda ekran goruntusu ve mesaj kayitlarinin delil degeri.' },
      { id: 'belgede-sahtecilik', label: 'Resmi belgede sahtecilik', rawQuery: 'Resmi belgenin aldatma kabiliyeti tasiyip tasimadigi ve sahtecilik sucunun olusup olusmadigi.' },
      { id: 'direnme-sucu', label: 'Gorevi yaptirmamak icin direnme', rawQuery: 'Kamu gorevlisine gorevini yaptirmamak icin cebir veya tehdit kullanilmasi halinde direnme sucu unsurlari.' },
      { id: 'hirsizlik-tesebbus', label: 'Hirsizlik ve tesebbus', rawQuery: 'Malin bulunduğu yerden alinmadan once yakalanma halinde hirsizlik sucunda tesebbus degerlendirmesi.' },
      { id: 'mala-zarar', label: 'Mala zarar verme', rawQuery: 'Basit kasten mala zarar verme sucunda zarar miktari ve manevi unsur degerlendirmesi.' },
      { id: 'ozel-hayat-kayit', label: 'Ozel hayatin gizliligi', rawQuery: 'Riza olmaksizin ses veya goruntu kaydi alinmasi halinde ozel hayatin gizliligini ihlal sucu.' },
      { id: 'alkollu-arac', label: 'Trafik guvenligini tehlikeye sokma', rawQuery: 'Alkollu arac kullanma nedeniyle trafik guvenligini tehlikeye sokma sucunun unsurlari.' },
      { id: 'taksirli-is-kazasi', label: 'Taksirle yaralama is kazasi', rawQuery: 'Is guvenligi onlemlerinin alinmamasi nedeniyle meydana gelen kazada taksirle yaralama sorumlulugu.' },
      { id: 'kasten-oldurmeye-tesebbus', label: 'Oldurmeye tesebbus mu yaralama mi', rawQuery: 'Hayati bolgelere yonelen bicak darbelerinde kastin oldurmeye yonelik olup olmadigi ve tesebbus degerlendirmesi.' },
      { id: 'cinsel-saldiri-delil', label: 'Cinsel saldiri delil degerlendirmesi', rawQuery: 'Cinsel saldiri sucunda beyan, adli tip bulgulari ve yan delillerin birlikte degerlendirilmesi.' },
      { id: 'orgut-uyeligi-delil', label: 'Orgut uyeligi delilleri', rawQuery: 'Orgut uyeligi sucunda sureklilik cesitlilik ve yogunluk gosteren faaliyetlerin aranmasi.' },
      { id: 'kamera-goruntusu-hirsizlik', label: 'Kamera goruntusu ve supheden sanik', rawQuery: 'Market guvenlik kamerasi goruntulerine dayali hirsizlik iddiasinda kimlik tespiti kesin degilse supheden sanik yararlanir ilkesi uygulanir mi?' },
      { id: 'hakaret-kamu-gorevlisi', label: 'Kamu gorevlisine hakaret', rawQuery: 'Kamu gorevlisine gorevi nedeniyle hakaret sucunda soylemin ifade ozgurlugu sinirlari icinde kalip kalmadigi.' },
    ],
  },
  {
    id: 'idare',
    label: 'Idare',
    expectedSources: ['danistay'],
    expectedMarkers: ['danıştay', 'danistay'],
    minMatched: 2,
    cases: [
      { id: 'imar-para-cezasi', label: 'Imar para cezasi ve yikim', rawQuery: 'Ruhsatsiz yapi nedeniyle belediye encumenince verilen imar para cezasi ile yikim kararinin iptali ve yurutmenin durdurulmasi talebi.' },
      { id: 'yapi-kayit-yikim', label: 'Yapi kayit belgesi ve yikim', rawQuery: 'Yapi kayit belgesi bulunan tasinmaz hakkinda verilen yikim kararinin iptali istemi.' },
      { id: 'memur-disiplin', label: 'Memur disiplin cezasi', rawQuery: 'Devlet memuruna verilen ayliktan kesme disiplin cezasinin iptali istemi.' },
      { id: 'polis-disiplin', label: 'Polis disiplin cezasi', rawQuery: 'Polis memuruna verilen meslekten cikarilma disiplin cezasinin iptali istemi.' },
      { id: 'ogretmen-atama', label: 'Ogretmen atama iptali', rawQuery: 'Ogretmenin hizmet puani esasli yer degistirme isleminin iptali istemi.' },
      { id: 'ruhsat-iptali', label: 'Isyeri ruhsat iptali', rawQuery: 'Belediye tarafindan verilen isyeri acma ve calisma ruhsatinin iptaline iliskin islemin iptali.' },
      { id: 'cevre-cezasi', label: 'Cevre idari para cezasi', rawQuery: 'Cevre mevzuatina aykirilik nedeniyle kesilen idari para cezasinin iptali istemi.' },
      { id: 'kamulastirmasiz-el-atma', label: 'Kamulastirmasiz el atma', rawQuery: 'Idarenin fiili el atmasi nedeniyle kamulastirmasiz el atmaya dayali tazminat istemi.' },
      { id: 'yd-kosullari', label: 'Yurutmenin durdurulmasi', rawQuery: 'Acik hukuka aykirilik ve telafisi guc zarar kosullarinda yurutmenin durdurulmasi talebi.' },
      { id: 'encumen-iptal', label: 'Encumen karari iptali', rawQuery: 'Belediye encumeninin para cezasi kararinin yetki ve sekil yonunden hukuka aykiriligi.' },
      { id: 'ecrimisil', label: 'Ecrimisil islemi iptali', rawQuery: 'Hazine tasinmazina iliskin ecrimisil duzenlenmesine dair islemin iptali ve tahsilin durdurulmasi.' },
      { id: 'ogrenci-disiplin', label: 'Ogrenci disiplin cezasi', rawQuery: 'Universite ogrencisine verilen uzaklastirma disiplin cezasinin iptali istemi.' },
      { id: 'naklen-atama', label: 'Naklen atama islemi', rawQuery: 'Kamu gorevlisinin mazereti dikkate alinmadan yapilan naklen atama isleminin iptali.' },
      { id: 'zabita-cezasi', label: 'Zabita para cezasi', rawQuery: 'Belediye zabitasinca duzenlenen idari para cezasinin hukuka aykiriligi.' },
      { id: 'ruhsatsiz-prefabrik', label: 'Tarim arazisinde prefabrik yapi', rawQuery: 'Tarim arazisine kurulan ruhsatsiz prefabrik yapi nedeniyle verilen belediye encumen para cezasi ve yikim kararinin iptali.', specific: true },
      { id: 'kiyi-kenar-yikim', label: 'Kiyi kenar cizgisi ve yikim', rawQuery: 'Kiyi kenar cizgisi icinde kalan tasinmaz icin tesis edilen yikim ve ecrimisil islemlerinin iptali.' },
      { id: 'sit-alani', label: 'Sit alani yapilasma', rawQuery: 'Sit alaninda ruhsatsiz yapilasma nedeniyle tesis edilen idari islemlerin iptali.' },
      { id: 'belediye-ihale-yasaklama', label: 'Ihale yasaklama islemi', rawQuery: 'Kamu ihalelerine katilmaktan yasaklama isleminin hukuka aykiriligi.' },
      { id: 'imar-plani-iptal', label: 'Imar plani iptali', rawQuery: 'Parsel bazinda duzenleme yapan imar plani degisikliginin kamu yararina aykiriligi nedeniyle iptali.' },
      { id: 'isyeri-kapatma', label: 'Isyeri kapatma islemi', rawQuery: 'Ruhsatsizlik gerekcesiyle tesis edilen isyeri kapatma isleminin iptali ve yurutmenin durdurulmasi.' },
    ],
  },
  {
    id: 'icra_hukuk',
    label: 'Icra ve Alacak Hukuku',
    expectedSources: ['yargitay'],
    expectedMarkers: ['hukuk'],
    minMatched: 2,
    cases: [
      { id: 'itirazin-iptali-cari', label: 'Itirazin iptali ve cari hesap', rawQuery: 'Borca itiraz uzerine acilan itirazin iptali davasinda icra takibi, fatura, cari hesap alacagi ve inkar tazminati talebi.' },
      { id: 'menfi-tespit-senet', label: 'Menfi tespit ve senet', rawQuery: 'Borclu olmadiginin tespiti istemiyle acilan menfi tespit davasinda bononun bedelsiz oldugu savunmasi.' },
      { id: 'istirdat', label: 'Istirdat davasi', rawQuery: 'Ihtirazi kayit olmaksizin odendigi iddia edilen borcun geri alinmasi icin istirdat davasi kosullari.' },
      { id: 'tahliye-taahhudu', label: 'Tahliye taahhudune dayali takip', rawQuery: 'Gecerliligi tartismali tahliye taahhudune dayali icra takibinde tahliye kosullari.' },
      { id: 'kira-inkar', label: 'Kira alacagi ve inkar tazminati', rawQuery: 'Odenmeyen kira alacagi icin baslatilan takipte itirazin iptali ve icra inkar tazminati talebi.' },
      { id: 'kambiyo-itiraz', label: 'Kambiyo senedine itiraz', rawQuery: 'Kambiyo senedine dayali takipte imzaya ve borca itiraz nedenleri.' },
      { id: 'bono-zamanasimi', label: 'Bono ve zamanaşimi', rawQuery: 'Bonoya dayali alacakta zamanaşimi savunmasinin degerlendirilmesi.' },
      { id: 'fatura-alacagi', label: 'Fatura alacagi', rawQuery: 'Teslim edilen mallara iliskin odenmeyen fatura bedelinin tahsili ve itirazin iptali.' },
      { id: 'ticari-defter', label: 'Ticari defter delili', rawQuery: 'Ticari defter ve kayitlarla ispatlanan alacakta itirazin iptali ve inkar tazminati kosullari.' },
      { id: 'alacagin-temliki', label: 'Alacagin temliki', rawQuery: 'Temlik edilen alacaga dayali takipte aktif husumet ve itirazin iptali sorunu.' },
      { id: 'sebepsiz-zenginlesme', label: 'Sebepsiz zenginlesme', rawQuery: 'Haksiz odeme nedeniyle sebepsiz zenginlesmeye dayali alacak davasinda geri alma kosullari.' },
      { id: 'ayipli-mal', label: 'Ayipli mal bedel iadesi', rawQuery: 'Ayipli mal satisi nedeniyle bedel iadesi ve tazminat talepleri.' },
      { id: 'eser-sozlesmesi', label: 'Eser sozlesmesi alacagi', rawQuery: 'Yuklenicinin eser sozlesmesinden kaynaklanan bakiye is bedeli alacagi talebi.' },
      { id: 'vekalet-ucreti', label: 'Vekalet ucreti alacagi', rawQuery: 'Avukatlik ucret sozlesmesine dayali vekalet ucreti alacaginin tahsili.' },
      { id: 'cek-alacagi', label: 'Ceke dayali alacak', rawQuery: 'Karsiliksiz cek nedeniyle kambiyo takibi ve borca itiraz savunmalari.' },
      { id: 'takas-savunmasi', label: 'Takas ve mahsup', rawQuery: 'Itirazin iptali davasinda takas mahsup savunmasinin degerlendirilmesi.' },
      { id: 'e-fatura-bsba', label: 'E-fatura ve BA BS kayitlari', rawQuery: 'E-fatura ve BA BS kayitlariyla ispatlanan ticari alacakta itirazin iptali ve icra inkar tazminati talebi.', specific: true },
      { id: 'irsaliye-cari-hesap', label: 'Sevk irsaliyesi ve cari hesap', rawQuery: 'Sevk irsaliyesi ve cari hesap ekstresine dayali itirazin iptali davasinda alacagin ispatı.' },
      { id: 'teminat-icranin-geri', label: 'Teminatla icranin geri birakilmasi', rawQuery: 'Menfi tespit davasinda ihtiyati tedbir ve teminat karsiliginda icranin geri birakilmasi kosullari.' },
      { id: 'haksiz-fesih-sozlesme', label: 'Sozlesmeye aykirilik tazminati', rawQuery: 'Ticari sozlesmenin haksiz feshi nedeniyle munzam zarar ve cezai sart talebi.' },
    ],
  },
];

const TURKISH_REPLACEMENTS = [
  [/\bise iade\b/gi, 'işe iade'],
  [/\bise baslatmama\b/gi, 'işe başlatmama'],
  [/\biscinin\b/gi, 'işçinin'],
  [/\bisci\b/gi, 'işçi'],
  [/\bisciler\b/gi, 'işçiler'],
  [/\bisveren\b/gi, 'işveren'],
  [/\bisyerinde\b/gi, 'işyerinde'],
  [/\bisyeri\b/gi, 'işyeri'],
  [/\bis sozlesmesi\b/gi, 'iş sözleşmesi'],
  [/\bis akdi\b/gi, 'iş akdi'],
  [/\bhakli\b/gi, 'haklı'],
  [/\bgecersiz\b/gi, 'geçersiz'],
  [/\bkidem\b/gi, 'kıdem'],
  [/\byillik\b/gi, 'yıllık'],
  [/\bucreti\b/gi, 'ücreti'],
  [/\bucret\b/gi, 'ücret'],
  [/\bcalistirilan\b/gi, 'çalıştırılan'],
  [/\bcalisma\b/gi, 'çalışma'],
  [/\bcalistigini\b/gi, 'çalıştığını'],
  [/\bcalistirildigini\b/gi, 'çalıştırıldığını'],
  [/\bbos gecen sure\b/gi, 'boş geçen süre'],
  [/\buyusturucu\b/gi, 'uyuşturucu'],
  [/\bsanigin\b/gi, 'sanığın'],
  [/\buzerinde\b/gi, 'üzerinde'],
  [/\bsatis\b/gi, 'satış'],
  [/\bpaketlenmis\b/gi, 'paketlenmiş'],
  [/\bele gecen\b/gi, 'ele geçen'],
  [/\bsinirlari\b/gi, 'sınırları'],
  [/\biliskisini\b/gi, 'ilişkisini'],
  [/\bgosteren\b/gi, 'gösteren'],
  [/\bguclenir\b/gi, 'güçlenir'],
  [/\bimar para cezasi\b/gi, 'imar para cezası'],
  [/\byikim\b/gi, 'yıkım'],
  [/\byurutmenin durdurulmasi\b/gi, 'yürütmenin durdurulması'],
  [/\bencumen\b/gi, 'encümen'],
  [/\bruhsatsiz\b/gi, 'ruhsatsız'],
  [/\byapi\b/gi, 'yapı'],
  [/\bogretmen\b/gi, 'öğretmen'],
  [/\bkamulastirmasiz\b/gi, 'kamulaştırmasız'],
  [/\bodeme emri\b/gi, 'ödeme emri'],
  [/\bitirazin iptali\b/gi, 'itirazın iptali'],
  [/\binkar tazminati\b/gi, 'inkar tazminatı'],
  [/\balacagi\b/gi, 'alacağı'],
  [/\bayipli\b/gi, 'ayıplı'],
  [/\bsozlesmesi\b/gi, 'sözleşmesi'],
  [/\bsozlesmenin\b/gi, 'sözleşmenin'],
  [/\bzamanaşimi\b/gi, 'zamanaşımı'],
  [/\bdolandiricilik\b/gi, 'dolandırıcılık'],
  [/\bgorevlisine\b/gi, 'görevlisine'],
  [/\bozgurlugu\b/gi, 'özgürlüğü'],
  [/\bmesru\b/gi, 'meşru'],
  [/\bkulllanmak icin bulundurma\b/gi, 'kullanmak için bulundurma'],
  [/\bicin\b/gi, 'için'],
  [/\bmahkumiyet\b/gi, 'mahkumiyet'],
  [/\bsupheden\b/gi, 'şüpheden'],
  [/\bgoruntusu\b/gi, 'görüntüsü'],
  [/\bgorev\b/gi, 'görev'],
  [/\bogrenci\b/gi, 'öğrenci'],
  [/\buniversite\b/gi, 'üniversite'],
  [/\bacik\b/gi, 'açık'],
  [/\baykirilik\b/gi, 'aykırılık'],
  [/\btelafisi guc\b/gi, 'telafisi güç'],
  [/\bihale\b/gi, 'ihale'],
  [/\btemlik\b/gi, 'temlik'],
  [/\birsaliyesi\b/gi, 'irsaliyesi'],
  [/\binternet\b/gi, 'İnternet'],
  [/\bdolandiriciligi\b/gi, 'dolandırıcılığı'],
  [/\bdolandiricilik\b/gi, 'dolandırıcılık'],
  [/\bhaksiz\b/gi, 'haksız'],
  [/\bkarsilikli\b/gi, 'karşılıklı'],
  [/\bislemi\b/gi, 'işlemi'],
  [/\busulsuzlugu\b/gi, 'usulsüzlüğü'],
  [/\bolcululugu\b/gi, 'ölçülülüğü'],
  [/\bhirsizlik\b/gi, 'hırsızlık'],
  [/\bgizliligi\b/gi, 'gizliliği'],
  [/\bdegerlendirmesi\b/gi, 'değerlendirmesi'],
  [/\boldurmeye\b/gi, 'öldürmeye'],
  [/\btesebbus\b/gi, 'teşebbüs'],
  [/\bugretmen\b/gi, 'öğretmen'],
  [/\borgut\b/gi, 'örgüt'],
  [/\buyeligi\b/gi, 'üyeliği'],
  [/\bdelilleri\b/gi, 'delilleri'],
  [/\bkayit\b/gi, 'kayıt'],
  [/\bkayitlari\b/gi, 'kayıtları'],
  [/\bispati\b/gi, 'ispatı'],
  [/\bispatı\b/gi, 'ispatı'],
];

function toTurkishLegalText(value = '') {
  let output = String(value || '');
  for (const [pattern, replacement] of TURKISH_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  const secondPassReplacements = [
    [/\bArama islemi usulsuzlugu\b/g, 'Arama işlemi usulsüzlüğü'],
    [/\bTutuklama olcululugu\b/g, 'Tutuklama ölçülülüğü'],
    [/\bInternet ilan dolandiriciligi\b/g, 'İnternet ilan dolandırıcılığı'],
    [/\bKarsilikli kavga yaralama\b/g, 'Karşılıklı kavga yaralama'],
    [/\bGorevi yaptirmamak icin direnme\b/g, 'Görevi yaptırmamak için direnme'],
    [/\bHirsizlik ve tesebbus\b/g, 'Hırsızlık ve teşebbüs'],
    [/\bOzel hayatin gizliligi\b/g, 'Özel hayatın gizliliği'],
    [/\bOrgut uyeligi delilleri\b/g, 'Örgüt üyeliği delilleri'],
    [/\bOldurmeye tesebbus mu yaralama mi\b/g, 'Öldürmeye teşebbüs mü yaralama mı'],
    [/\bKamera goruntusu ve supheden sanik\b/g, 'Kamera görüntüsü ve şüpheden sanık'],
    [/\bImar para cezasi ve yikim\b/g, 'İmar para cezası ve yıkım'],
    [/\bYapi kayit belgesi ve yikim\b/g, 'Yapı kayıt belgesi ve yıkım'],
    [/\bKamu gorevlisine hakaret\b/g, 'Kamu görevlisine hakaret'],
  ];

  for (const [pattern, replacement] of secondPassReplacements) {
    output = output.replace(pattern, replacement);
  }

  const wordLevelReplacements = [
    [/\bGorevi\b/g, 'Görevi'],
    [/\bgorevi\b/g, 'görevi'],
    [/\bOzel\b/g, 'Özel'],
    [/\bozel\b/g, 'özel'],
    [/\bhayatin\b/g, 'hayatın'],
    [/\bKarsilikli\b/g, 'Karşılıklı'],
    [/\bkarsilikli\b/g, 'karşılıklı'],
    [/\bHirsizlik\b/g, 'Hırsızlık'],
    [/\bhirsizlik\b/g, 'hırsızlık'],
    [/\bOrgut\b/g, 'Örgüt'],
    [/\borgut\b/g, 'örgüt'],
    [/\bOldurmeye\b/g, 'Öldürmeye'],
    [/\boldurmeye\b/g, 'öldürmeye'],
    [/\bYapi\b/g, 'Yapı'],
    [/\byapi\b/g, 'yapı'],
    [/\byaptirmamak\b/g, 'yaptırmamak'],
    [/\btesebbus\b/g, 'teşebbüs'],
  ];

  for (const [pattern, replacement] of wordLevelReplacements) {
    output = output.replace(pattern, replacement);
  }

  return output.replace(/\s+/g, ' ').trim();
}

const TURKISH_LABEL_SMALL_WORDS = new Set(['ve', 'veya', 'ile', 'için', 'mi', 'mı', 'mu', 'mü']);

function capitalizeTurkishWord(value = '') {
  const text = String(value || '');
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

function toTurkishLegalLabel(value = '') {
  const original = String(value || '').trim();
  const exactLabelOverrides = new Map([
    ['Is Hukuku', 'İş Hukuku'],
    ['Icra ve Alacak Hukuku', 'İcra ve Alacak Hukuku'],
    ['Arama islemi usulsuzlugu', 'Arama İşlemi Usulsüzlüğü'],
    ['Tutuklama olcululugu', 'Tutuklama Ölçülülüğü'],
    ['Internet ilan dolandiriciligi', 'İnternet İlan Dolandırıcılığı'],
    ['Karsilikli kavga yaralama', 'Karşılıklı Kavga Yaralama'],
    ['Gorevi yaptirmamak icin direnme', 'Görevi Yaptırmamak İçin Direnme'],
    ['Hirsizlik ve tesebbus', 'Hırsızlık ve Teşebbüs'],
    ['Ozel hayatin gizliligi', 'Özel Hayatın Gizliliği'],
    ['Orgut uyeligi delilleri', 'Örgüt Üyeliği Delilleri'],
    ['Oldurmeye tesebbus mu yaralama mi', 'Öldürmeye Teşebbüs mü Yaralama mı'],
    ['Kamera goruntusu ve supheden sanik', 'Kamera Görüntüsü ve Şüpheden Sanık'],
    ['Imar para cezasi ve yikim', 'İmar Para Cezası ve Yıkım'],
    ['Yapi kayit belgesi ve yikim', 'Yapı Kayıt Belgesi ve Yıkım'],
  ]);

  if (exactLabelOverrides.has(original)) {
    return exactLabelOverrides.get(original);
  }

  let output = toTurkishLegalText(original);
  const finalLabelReplacements = [
    [/\böldürmeye teşebbüs mu yaralama mi\b/gi, 'öldürmeye teşebbüs mü yaralama mı'],
    [/\bşüpheden sanik\b/gi, 'şüpheden sanık'],
  ];

  for (const [pattern, replacement] of finalLabelReplacements) {
    output = output.replace(pattern, replacement);
  }

  return output
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('tr-TR');
      if (index > 0 && TURKISH_LABEL_SMALL_WORDS.has(lower)) {
        return lower;
      }
      return capitalizeTurkishWord(lower);
    })
    .join(' ')
    .trim();
}

function normalizeText(value = '') {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKeywordSeed(rawQuery = '') {
  return String(rawQuery || '').split(/[.,;:]/)[0].trim().slice(0, 140);
}

function resolveBranchRoles(branch) {
  if (branch.id === 'ceza') {
    return {
      firstParty: 'sanik',
      secondParty: 'sorusturma mercileri',
      fileLabel: 'dosya',
      closing: 'Bu nedenle ayni hukuki tezi tasiyan emsal ceza kararlarinin aranmasi istenmektedir.',
    };
  }

  if (branch.id === 'idare') {
    return {
      firstParty: 'basvurucu',
      secondParty: 'idare',
      fileLabel: 'islem dosyasi',
      closing: 'Bu nedenle ayni idari islem eksenindeki emsal kararlarin taranmasi talep edilmektedir.',
    };
  }

  return {
    firstParty: 'davaci',
    secondParty: 'davali',
    fileLabel: 'uyusmazlik dosyasi',
    closing: 'Bu nedenle ayni hukuki cekirdegi tasiyan emsal kararlarin taranmasi talep edilmektedir.',
  };
}

function buildVariantQuery(branch, testCase, queryVariant) {
  const baseText = toTurkishLegalText(testCase.rawQuery);
  const shortIssueText = toTurkishLegalText(testCase.shortIssueQuery || toTurkishLegalLabel(testCase.label));
  const roles = resolveBranchRoles(branch);

  if (queryVariant === 'short_issue') {
    return shortIssueText;
  }

  if (queryVariant === 'long_fact') {
    return [
      `${roles.fileLabel} icinde ${roles.firstParty} ile ${roles.secondParty} arasindaki uyusmazlikta olaylar dağinik sekilde anlatilmistir.`,
      `${baseText}`,
      `${roles.fileLabel} kapsaminda beyanlar, kayitlar ve mevcut evrak bir arada degerlendirilmekte olup mesele ayni hukuki cekirdekte toplanmaktadir.`,
      roles.closing,
    ].join(' ');
  }

  return [
    'Sayin ilgili merciye,',
    `${roles.fileLabel} kapsaminda yapilan incelemede ${roles.firstParty} tarafindan ileri surulen iddianin hukuki cekirdegi asagidadaki sekildedir:`,
    `${baseText}`,
    `${roles.fileLabel} icerigindeki bilgi ve belgeler birlikte degerlendirilerek bu konuya iliskin emsal kararlarin arastirilmasi talep olunur.`,
  ].join(' ');
}

function buildExpandedCases() {
  let originalOrder = 0;

  return BRANCHES.flatMap((branch) => branch.cases.flatMap((testCase) => (
    DEFAULT_VARIANTS.map((queryVariant) => ({
      branch,
      testCase,
      queryVariant,
      variantLabel: VARIANT_LABELS[queryVariant] || queryVariant,
      rawQuery: buildVariantQuery(branch, testCase, queryVariant),
      originalOrder: originalOrder++,
    }))
  )));
}

function selectCasesForVariant(cases, limit) {
  if (!Number.isFinite(limit)) return cases;
  if (limit <= 0) return [];

  const buckets = BRANCHES.map((branch) => ({
    branchId: branch.id,
    items: cases.filter((item) => item.branch.id === branch.id),
  }));
  const cursors = new Map(buckets.map((bucket) => [bucket.branchId, 0]));
  const selected = [];

  while (selected.length < limit) {
    let added = false;

    for (const bucket of buckets) {
      const cursor = cursors.get(bucket.branchId) || 0;
      if (cursor >= bucket.items.length) continue;
      selected.push(bucket.items[cursor]);
      cursors.set(bucket.branchId, cursor + 1);
      added = true;
      if (selected.length >= limit) break;
    }

    if (!added) break;
  }

  return selected;
}

function expandCases() {
  const allCases = buildExpandedCases().filter((item) =>
    MATRIX_CONFIG.enabledVariants.includes(item.queryVariant)
  );
  const selected = [];

  for (const queryVariant of MATRIX_CONFIG.enabledVariants) {
    const variantCases = allCases.filter((item) => item.queryVariant === queryVariant);
    const limit = MATRIX_CONFIG.variantLimits[queryVariant];
    selected.push(...selectCasesForVariant(variantCases, limit));
  }

  return selected
    .sort((left, right) => left.originalOrder - right.originalOrder)
    .map(({ originalOrder, ...item }) => item);
}

function toScoreValue(verdict) {
  if (verdict === 'pass') return 1;
  if (verdict === 'borderline') return 0.5;
  return 0;
}

async function runCaseOnce(branch, testCase, queryVariant, variantLabel, rawQuery) {
  const effectiveRawQuery = toTurkishLegalText(rawQuery);

  const req = {
    method: 'POST',
    headers: {},
    body: {
      source: 'all',
      rawQuery: effectiveRawQuery,
      keyword: buildKeywordSeed(effectiveRawQuery),
      filters: { topK: 10 },
    },
  };

  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; },
    end() { return this; },
    setHeader() {},
  };

  const startedAt = Date.now();
  await handler(req, res);
  const durationMs = Date.now() - startedAt;
  const payload = res.payload || {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const top = results[0] || null;
  const topText = normalizeText([top?.title, top?.daire, top?.mahkeme].filter(Boolean).join(' '));
  const topSource = normalizeText(top?.source || '');
  const sourceOk = branch.expectedSources.includes(topSource);
  const markerOk = branch.expectedMarkers.length === 0 || branch.expectedMarkers.some((marker) => topText.includes(normalizeText(marker)));
  const matchedOk = Number(top?.matchedKeywordCount || 0) >= branch.minMatched;

  let verdict = 'fail';
  if (results.length > 0 && sourceOk && markerOk && matchedOk) verdict = 'pass';
  else if (results.length > 0 && sourceOk) verdict = 'borderline';

  const displayLabel = toTurkishLegalLabel(testCase.label);
  const displayBranchLabel = toTurkishLegalLabel(branch.label);
  const scoreValue = toScoreValue(verdict);
  const zeroResult = results.length === 0;
  const fallbackUsed = Boolean(payload.retrievalDiagnostics?.fallbackUsed);

  return {
    branchId: branch.id,
    branchLabel: displayBranchLabel,
    displayBranchLabel,
    ...testCase,
    originalLabel: testCase.label,
    originalRawQuery: testCase.rawQuery,
    label: displayLabel,
    displayLabel,
    queryVariant,
    variantLabel,
    rawQuery: effectiveRawQuery,
    effectiveRawQuery,
    durationMs,
    statusCode: res.statusCode,
    verdict,
    scoreValue,
    zeroResult,
    fallbackUsed,
    aiLegalArea: payload.aiSearchPlan?.legalArea || null,
    queryMode: payload.aiSearchPlan?.queryMode || null,
    coreIssue: payload.aiSearchPlan?.coreIssue || null,
    searchQuery: payload.aiSearchPlan?.searchQuery || null,
    semanticQuery: payload.aiSearchPlan?.semanticQuery || null,
    retrievalConcepts: payload.aiSearchPlan?.retrievalConcepts || payload.aiSearchPlan?.requiredConcepts || [],
    requiredConcepts: payload.aiSearchPlan?.requiredConcepts || [],
    supportConcepts: payload.aiSearchPlan?.supportConcepts || [],
    evidenceConcepts: payload.aiSearchPlan?.evidenceConcepts || [],
    targetSources: payload.aiSearchPlan?.targetSources || [],
    readerApplied: Boolean(payload.planDiagnostics?.readerApplied),
    readerProfile: payload.planDiagnostics?.readerProfile || null,
    planFinalStatus: payload.planDiagnostics?.finalStatus || null,
    planAttempts: payload.planDiagnostics?.attempts || [],
    resultCount: results.length,
    topResult: top ? {
      source: top.source,
      title: top.title,
      daire: top.daire,
      matchedKeywordCount: top.matchedKeywordCount,
      matchedKeywords: top.matchedKeywords || [],
      semanticScore: top.semanticScore,
      retrievalStage: top.retrievalStage,
    } : null,
    diagnostics: payload.retrievalDiagnostics || null,
    error: payload.error || null,
  };
}

async function runCase(branch, testCase, queryVariant, variantLabel, rawQuery) {
  for (let attempt = 0; attempt <= MATRIX_CONFIG.retryCount; attempt += 1) {
    const result = await runCaseOnce(branch, testCase, queryVariant, variantLabel, rawQuery);
    const retryable = isRetryableMatrixErrorMessage(result?.error);
    const attemptCount = attempt + 1;

    if (!retryable || attempt >= MATRIX_CONFIG.retryCount) {
      return {
        ...result,
        attempts: attemptCount,
      };
    }

    const waitMs = MATRIX_CONFIG.retryBackoffMs * attemptCount;
    console.log(`${result.displayBranchLabel || branch.label} | ${result.displayLabel || testCase.label} | retry=${attemptCount}/${MATRIX_CONFIG.retryCount + 1} | sebep=${result.error} | bekleme=${waitMs}ms`);
    await sleep(waitMs);
  }

  return runCaseOnce(branch, testCase, queryVariant, variantLabel, rawQuery);
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

function summarizeCases(cases) {
  const total = cases.length;
  const passCount = cases.filter((item) => item.verdict === 'pass').length;
  const borderlineCount = cases.filter((item) => item.verdict === 'borderline').length;
  const failCount = cases.filter((item) => item.verdict === 'fail').length;
  const totalPoints = Number(cases.reduce((sum, item) => sum + (Number(item.scoreValue) || 0), 0).toFixed(2));
  const overallScore = Number((totalPoints / Math.max(total, 1)).toFixed(3));
  const avgDuration = Math.round(cases.reduce((sum, item) => sum + item.durationMs, 0) / Math.max(total, 1));
  const avgResults = Number((cases.reduce((sum, item) => sum + item.resultCount, 0) / Math.max(total, 1)).toFixed(2));
  const zeroResultRate = Number((cases.filter((item) => item.zeroResult).length / Math.max(total, 1)).toFixed(3));
  const fallbackUsageRate = Number((cases.filter((item) => item.fallbackUsed).length / Math.max(total, 1)).toFixed(3));
  const sampleFails = cases.filter((item) => item.verdict !== 'pass').slice(0, 5);

  return {
    total,
    passCount,
    borderlineCount,
    failCount,
    totalPoints,
    overallScore,
    avgDuration,
    avgResults,
    zeroResultRate,
    fallbackUsageRate,
    sampleFails,
  };
}

function summarizeBranch(branch, cases) {
  return {
    branchId: branch.id,
    branchLabel: branch.label,
    displayBranchLabel: toTurkishLegalLabel(branch.label),
    ...summarizeCases(cases),
  };
}

function summarizeVariant(queryVariant, cases) {
  return {
    queryVariant,
    variantLabel: cases[0]?.variantLabel || queryVariant,
    ...summarizeCases(cases),
  };
}

function buildOverallSummary(results, branchSummaries, variantSummaries) {
  const base = summarizeCases(results);
  const shortIssueScore = variantSummaries.find((item) => item.queryVariant === 'short_issue')?.overallScore ?? 0;
  const branchFloorOk = branchSummaries.every((item) => item.overallScore >= 0.75);

  return {
    ...base,
    shortIssueScore,
    branchFloorOk,
    targetOverallOk: base.overallScore >= 0.8,
    zeroResultTargetOk: base.zeroResultRate < 0.1,
  };
}

function buildMarkdownReport(runAt, overallSummary, branchSummaries, variantSummaries, results) {
  const lines = [];
  lines.push('# Canli Hukuk Arama Test Matrisi Raporu');
  lines.push('');
  lines.push(`Tarih: ${runAt}`);
  lines.push('');
  lines.push(`Rapor tipi: ${REPORT_TYPE}`);
  lines.push('');
  lines.push('## Kapsam');
  lines.push('');
  lines.push('- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku');
  lines.push('- Bu rapor ana saglik gostergesidir; kucuk smoke test raporlariyla ayni seviyede yorumlanmaz.');
  lines.push(`- Secilen sorgu bicimleri: ${MATRIX_CONFIG.enabledVariants.map((variant) => {
    const limit = MATRIX_CONFIG.variantLimits[variant];
    return Number.isFinite(limit) ? `${variant}=${limit}` : variant;
  }).join(', ')}`);
  lines.push(`- Toplam test sayisi: ${overallSummary.total}`);
  lines.push('');
  lines.push('## Genel Ozet');
  lines.push('');
  lines.push(`- Genel skor: ${overallSummary.overallScore}`);
  lines.push(`- Pass: ${overallSummary.passCount}/${overallSummary.total}`);
  lines.push(`- Borderline: ${overallSummary.borderlineCount}/${overallSummary.total}`);
  lines.push(`- Fail: ${overallSummary.failCount}/${overallSummary.total}`);
  lines.push(`- Zero result rate: ${overallSummary.zeroResultRate}`);
  lines.push(`- Fallback usage rate: ${overallSummary.fallbackUsageRate}`);
  lines.push(`- Short issue skoru: ${overallSummary.shortIssueScore}`);
  lines.push(`- Kabul >= 0.80: ${overallSummary.targetOverallOk ? 'EVET' : 'HAYIR'}`);
  lines.push(`- Dal tabani >= 0.75: ${overallSummary.branchFloorOk ? 'EVET' : 'HAYIR'}`);
  lines.push(`- Zero result < 0.10: ${overallSummary.zeroResultTargetOk ? 'EVET' : 'HAYIR'}`);
  lines.push('');
  lines.push('## Sorgu Bicimi Kirilimlari');
  lines.push('');

  for (const summary of variantSummaries) {
    lines.push(`- ${summary.variantLabel}: skor=${summary.overallScore} | pass=${summary.passCount}/${summary.total} | zero=${summary.zeroResultRate} | fallback=${summary.fallbackUsageRate}`);
  }
  lines.push('');
  lines.push('## Dal Kirilimlari');
  lines.push('');

  for (const summary of branchSummaries) {
    lines.push(`### ${summary.displayBranchLabel || summary.branchLabel}`);
    lines.push('');
    lines.push(`- Skor: ${summary.overallScore}`);
    lines.push(`- Pass: ${summary.passCount}/${summary.total}`);
    lines.push(`- Borderline: ${summary.borderlineCount}/${summary.total}`);
    lines.push(`- Fail: ${summary.failCount}/${summary.total}`);
    lines.push(`- Zero result rate: ${summary.zeroResultRate}`);
    lines.push(`- Fallback usage rate: ${summary.fallbackUsageRate}`);
    lines.push(`- Ortalama sure: ${summary.avgDuration} ms`);
    lines.push(`- Ortalama sonuc sayisi: ${summary.avgResults}`);
    lines.push('');

    if (summary.sampleFails.length > 0) {
      lines.push('- Ornek sorunlu vakalar:');
      for (const item of summary.sampleFails) {
        lines.push(`  - ${item.displayLabel || item.label} [${item.queryVariant}] => ${item.verdict} | sonuc=${item.resultCount} | ust kaynak=${item.topResult?.source || '-'} | ust karar=${item.topResult?.title || '-'}`);
      }
      lines.push('');
    }
  }

  lines.push('## Ham Sonuc Dosyasi');
  lines.push('');
  lines.push('- `output/legal-live-matrix-results.json`');
  lines.push('');
  lines.push('## Not');
  lines.push('');
  lines.push('- pass = 1');
  lines.push('- borderline = 0.5');
  lines.push('- fail = 0');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const expandedCases = expandCases();
  const batches = chunkItems(expandedCases, MATRIX_CONFIG.batchSize);
  console.log(`Canli matrix ayari: ${MATRIX_CONFIG.enabledVariants.map((variant) => {
    const limit = MATRIX_CONFIG.variantLimits[variant];
    return Number.isFinite(limit) ? `${variant}=${limit}` : variant;
  }).join(', ')} | concurrency=${MATRIX_CONFIG.concurrency} | batch=${MATRIX_CONFIG.batchSize} | pause=${MATRIX_CONFIG.pauseMs}ms | retry=${MATRIX_CONFIG.retryCount}`);
  console.log(`Toplam ${expandedCases.length} canli test basliyor...`);

  const results = [];
  let processedCount = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`Batch ${batchIndex + 1}/${batches.length} basliyor | vaka=${batch.length}`);

    const batchResults = await runWithConcurrency(batch, MATRIX_CONFIG.concurrency, async ({ branch, testCase, queryVariant, variantLabel, rawQuery }, index) => {
      const result = await runCase(branch, testCase, queryVariant, variantLabel, rawQuery);
      console.log(`${processedCount + index + 1}/${expandedCases.length} | ${result.displayBranchLabel || branch.label} | ${result.displayLabel || testCase.label} | ${queryVariant} | ${result.verdict} | sonuc=${result.resultCount} | deneme=${result.attempts || 1}`);
      return result;
    });

    results.push(...batchResults);
    processedCount += batch.length;

    if (batchIndex < batches.length - 1 && MATRIX_CONFIG.pauseMs > 0) {
      console.log(`Batch arasi bekleme: ${MATRIX_CONFIG.pauseMs}ms`);
      await sleep(MATRIX_CONFIG.pauseMs);
    }
  }

  const branchSummaries = BRANCHES.map((branch) => summarizeBranch(branch, results.filter((item) => item.branchId === branch.id)));
  const variantSummaries = MATRIX_CONFIG.enabledVariants.map((queryVariant) => summarizeVariant(queryVariant, results.filter((item) => item.queryVariant === queryVariant)));
  const overallSummary = buildOverallSummary(results, branchSummaries, variantSummaries);
  const runAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify({ reportType: REPORT_TYPE, runAt, matrixConfig: MATRIX_CONFIG, overallSummary, summaries: branchSummaries, branchSummaries, variantSummaries, results }, null, 2), 'utf8');
  await fs.writeFile(OUTPUT_MD, buildMarkdownReport(runAt, overallSummary, branchSummaries, variantSummaries, results), 'utf8');

  console.log('');
  console.log('Rapor yazildi:');
  console.log(OUTPUT_MD);
  console.log(OUTPUT_JSON);
}

export const __testables = {
  buildMarkdownReport,
  chunkItems,
  isRetryableMatrixErrorMessage,
};

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

