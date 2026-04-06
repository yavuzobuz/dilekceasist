import fs from 'node:fs/promises';
import path from 'node:path';
import handler from '../backend/legal/search-decisions.js';

const OUTPUT_PATH = path.resolve('output/legal-live-domain-400.json');

const wordCount = (text = '') =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

const normalizeText = (value = '') =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const makeLongText = (seed, filler, minWords = 400) => {
  let text = String(seed || '').trim();
  while (wordCount(text) < minWords) {
    text = `${text} ${filler}`.trim();
  }
  return text;
};

const CASES = [
  {
    id: 'ceza',
    label: 'Ceza',
    expectedSource: 'yargitay',
    expectedSkill: 'ceza',
    seed: 'Cumhuriyet Başsavcılığı tarafından düzenlenen iddianamede sanığın TCK 188/3 kapsamında uyuşturucu veya uyarıcı madde ticareti yapmakla suçlandığı, ev aramasında paketlenmiş metamfetamin, hassas terazi, kilitli poşetler, telefon inceleme tutanağı, WhatsApp yazışmaları, kullanıcı tanık beyanları ve parmak izi raporunun bulunduğu anlatılmaktadır. Sanık ise ele geçen maddenin kişisel kullanım amacıyla tutulduğunu, satış kastının olmadığını, kullanıcı tanık beyanlarının çelişkili olduğunu, kolluğun fiziki takip notlarının tek başına yeterli sayılamayacağını, CMK ve TCK hükümleri uyarınca şüpheden sanık yararlanır ilkesinin uygulanması gerektiğini savunmaktadır.',
    filler: 'Soruşturma evrakında kriminal rapor, adli rapor, arama kararı, ele geçirilen miktar, suç vasfı, kişisel kullanım sınırı, ticaret kastı, delil yeterliliği ve ceza yargılaması ilkeleri birlikte tartışılmaktadır.',
  },
  {
    id: 'is_hukuku',
    label: 'İş Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'is_hukuku',
    seed: 'Davacı işçi, 4857 sayılı İş Kanunu kapsamında belirsiz süreli iş sözleşmesinin geçersiz nedenle feshedildiğini, performans düşüklüğü savunmasının soyut kaldığını, fesih bildiriminin yeterli açıklama içermediğini, aynı dönemde başka işçilerin benzer davranışlarına rağmen işten çıkarılmadığını, puantaj kayıtları ile bordroların fazla mesaiyi gizlediğini ve işe iade, boşta geçen süre ücreti, işe başlatmama tazminatı ile kıdem ve ihbar tazminatı taleplerinin birlikte değerlendirilmesi gerektiğini ileri sürmektedir.',
    filler: 'Dosyada işçi, işveren, fesih bildirimi, puantaj kaydı, fazla mesai, bordro, SGK kaydı, tanık anlatımı, geçerli neden, haklı fesih ve işçilik alacakları ayrıntılı biçimde tartışılmaktadır.',
  },
  {
    id: 'aile',
    label: 'Aile Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'aile',
    seed: 'Taraflar arasındaki aile mahkemesi dosyasında davacı eş, TMK 166 uyarınca evlilik birliğinin temelinden sarsıldığını, sadakat yükümlülüğüne aykırı davranışlar, sürekli hakaret, ekonomik baskı ve fiziksel şiddet nedeniyle ortak hayatın çekilmez hale geldiğini, çocukların eğitim düzeni ve sosyal çevresi dikkate alınarak velayetin kendisine bırakılması gerektiğini, iştirak nafakası ile yoksulluk nafakasının gelir dengesi gözetilerek belirlenmesini, ayrıca ziynet eşyalarının iadesi ve mal rejiminin tasfiyesinin de değerlendirilmesini talep etmektedir.',
    filler: 'Boşanma, velayet, nafaka, kişisel ilişki, sosyal inceleme raporu, aile konutu, ziynet, kusur, maddi tazminat ve çocuğun üstün yararı başlıkları aynı olay örgüsünde tekrar edilmektedir.',
  },
  {
    id: 'icra',
    label: 'İcra Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'icra',
    seed: 'Davacı alacaklı, cari hesap ve düzenli mal teslimlerine dayalı alacağın tahsili için ilamsız icra takibi başlattığını, borçlunun haksız şekilde itiraz ederek takibi durdurduğunu, sevk irsaliyeleri, e-fatura kayıtları, BA BS formları, ticari defter özetleri ve banka hareketleriyle alacağın sabit olduğunu, İİK 67 kapsamında itirazın iptali ile icra inkar tazminatına hükmedilmesi gerektiğini, menfi tespit savunmasının somut destekten yoksun kaldığını, ödeme emri tebliğinin usulüne uygun yapıldığını ve takibin devamına karar verilmesi gerektiğini ayrıntılı olarak açıklamaktadır.',
    filler: 'İcra takibi, ödeme emri, itirazın iptali, menfi tespit, haciz, kambiyo takibi, tebligat tarihi, icra dosya numarası, inkar tazminatı ve takip hukuku kuralları tekrar edilmektedir.',
  },
  {
    id: 'borclar',
    label: 'Borçlar Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'borclar',
    seed: 'Taraflar arasındaki borçlar hukuku uyuşmazlığında davacı, davalının sözleşmeye aykırı davranarak ayıplı ifada bulunduğunu, teslim edilen işin eksik ve kusurlu olduğunu, bilirkişi raporuyla onarım bedeli ve değer kaybının saptandığını, banka dekontları ile ek ödeme kalemlerinin doğrulandığını, TBK 112 ve TBK 49 çerçevesinde hem sözleşmeye aykırılıktan doğan zararların hem de haksız fiil niteliği taşıyan ek davranışların birlikte değerlendirilmesi gerektiğini, tazminat, temerrüt faizi ve gerektiğinde manevi tazminat taleplerinin göz önünde bulundurulmasını istediğini açıklamaktadır.',
    filler: 'Sözleşme, tazminat, kusur, nedensellik bağı, temerrüt, kira ilişkisi, vekalet, eser sözleşmesi, banka hareketi, tanık ve bilirkişi raporu kavramları borçlar hukuku ekseninde tekrar edilmektedir.',
  },
  {
    id: 'ticaret',
    label: 'Ticaret Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'ticaret',
    seed: 'Ticaret mahkemesine sunulan dilekçede davacı ortak, anonim şirket genel kurul kararının usulsüz çağrı ile alındığını, sermaye artırımı ve yönetim kurulu ibra oylamasında bilgi alma hakkının ihlal edildiğini, şirketin ticari defter ve finansal tablolarının ortaklarla paylaşılmadığını, buna ek olarak bağlı şirkete kaynak aktarımı nedeniyle müdür ve yönetim kurulu üyelerinin sorumluluğunun doğduğunu, TTK hükümleri uyarınca genel kurul kararının iptali, ticari defter incelemesi ve şirkete verilen zararın tazmini gerektiğini ayrıntılı biçimde savunmaktadır.',
    filler: 'Anonim şirket, limited şirket, genel kurul, ortaklar kurulu, ticari defter, cari hesap, çek, bono, konkordato, haksız rekabet ve ticari faiz kavramları ticaret hukuku bağlamında tekrar edilmektedir.',
  },
  {
    id: 'idare',
    label: 'İdare Hukuku',
    expectedSource: 'danistay',
    expectedSkill: 'idare',
    seed: 'Davacı şirket, belediye encümeni tarafından tesis edilen imar para cezası ve yıkım kararının hukuka aykırı olduğunu, ruhsat dosyası ve teknik raporların dikkate alınmadığını, savunma alınmadan işlem kurulduğunu, ölçülülük ilkesine aykırı biçimde faaliyetin durdurulduğunu, ruhsat iptali sonucunu doğuracak ağırlıkta bir ihlal bulunmadığını, bu nedenle idari işlemin iptali ile yürütmenin durdurulmasına karar verilmesi gerektiğini, ayrıca tam yargı boyutunda uğranılan ticari zararın tazminini de talep ettiğini ayrıntılı olarak açıklamaktadır.',
    filler: 'İdari işlem, iptal davası, tam yargı, ruhsat iptali, imar para cezası, belediye encümeni, kamu gücü, hukuki güvenlik, ölçülülük ve tebligat tarihi kavramları idare hukuku ekseninde tekrar edilmektedir.',
  },
  {
    id: 'vergi',
    label: 'Vergi Hukuku',
    expectedSource: 'danistay',
    expectedSkill: 'vergi',
    seed: 'Davacı mükellef şirket, vergi inceleme raporuna dayanılarak düzenlenen KDV tarhiyatı ve vergi ziyaı cezasına karşı açtığı davada, faturaların gerçek mal teslimine dayandığını, sevk irsaliyeleri, banka hareketleri, stok kayıtları ve karşı taraf yazışmalarının bunu açıkça doğruladığını, inceleme elemanının varsayımsal değerlendirmeyle sahte fatura sonucuna ulaştığını, VUK hükümleri gereğince ispat yükünün somut delille yerine getirilmesi gerektiğini, tarhiyat ihbarnamesi ile ceza ihbarnamesinin hukuka aykırı olduğunu ve işlemlerin iptal edilmesini talep ettiğini açıklamaktadır.',
    filler: 'Vergi tarhiyatı, vergi ziyaı cezası, KDV indirimi, sahte fatura, inceleme raporu, tarhiyat ihbarnamesi, mükellef kayıtları, banka hareketi, ispat yükü ve Danıştay denetimi kavramları tekrar edilmektedir.',
  },
  {
    id: 'tuketici',
    label: 'Tüketici Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'tuketici',
    seed: 'Davacı tüketici, internet üzerinden satın aldığı elektronik cihazın kısa sürede aynı arızayı tekrar ettiğini, yetkili servis kayıtlarının sorunun kronik olduğunu gösterdiğini, garanti süresi içinde yapılan onarımların sonuç vermediğini, satıcının bedel iadesi ve değişim taleplerini reddettiğini, tüketici hakem heyeti kararına rağmen ödeme yapılmadığını, TKHK hükümleri uyarınca ayıplı mal nedeniyle bedel iadesi, faiz ve yargılama giderlerinin tahsilini talep ettiğini, ayrıca tanıtım içeriklerinin yanıltıcı nitelik taşıdığını ayrıntılı şekilde anlatmaktadır.',
    filler: 'Tüketici sözleşmesi, ayıplı mal, ayıplı hizmet, cayma hakkı, garanti belgesi, servis kaydı, bedel iadesi, hakem heyeti ve satıcı sorumluluğu başlıkları tüketici hukuku çerçevesinde tekrar edilmektedir.',
  },
  {
    id: 'sigorta',
    label: 'Sigorta Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'sigorta',
    seed: 'Davacı araç sahibi, trafik kazası sonrası kasko ve zorunlu trafik sigortası kapsamında hasar dosyası açıldığını, eksper raporlarının onarım bedeli ile değer kaybını ortaya koyduğunu, sigorta şirketinin poliçe teminatını dar yorumlayarak eksik ödeme yaptığını, kusur oranının yanlış belirlendiğini, kazanın riziko kapsamında kaldığını, aracın uzun süre serviste kalması nedeniyle mahrumiyet zararının doğduğunu ve poliçe genel şartları ile KTK hükümleri gereğince tazminatın tam olarak ödenmesi gerektiğini ayrıntılı biçimde savunmaktadır.',
    filler: 'Sigorta poliçesi, hasar dosyası, eksper raporu, trafik kazası, kasko, değer kaybı, riziko, rücu, kusur oranı ve teminat kapsamı kavramları sigorta hukukunda tekrar edilmektedir.',
  },
  {
    id: 'miras',
    label: 'Miras Hukuku',
    expectedSource: 'yargitay',
    expectedSkill: 'miras',
    seed: 'Davacılar, murisin sağlığında taşınmazlarını görünüşte satış gibi göstererek tek mirasçıya devrettiğini, gerçekte bağış iradesi bulunduğunu, satış bedelinin ödenmediğini, bankacılık kayıtları ve tanık anlatımlarının muris muvazaasını gösterdiğini, ayrıca yapılan bazı temliklerin saklı payı zedelediğini, veraset ilamı ve tereke kayıtları üzerinden tenkis hesabı yapılması gerektiğini, vasiyetname hükümlerinin de murisin ehliyeti ve irade serbestisi yönünden değerlendirilmesini talep ettiklerini ayrıntılı biçimde anlatmaktadır.',
    filler: 'Miras, tenkis, muris muvazaası, saklı pay, vasiyetname, tereke, veraset ilamı, tapu kaydı ve mirasçılık ilişkisi kavramları miras hukuku içinde tekrar edilmektedir.',
  },
  {
    id: 'anayasa',
    label: 'Anayasa Hukuku',
    expectedSource: 'anayasa',
    expectedSkill: 'anayasa',
    seed: 'Başvurucu, Anayasa Mahkemesine yaptığı bireysel başvuruda makul sürede yargılanma hakkının, ifade özgürlüğünün ve etkili başvuru hakkının ihlal edildiğini, ilk derece ve istinaf mercilerinin kararlarında yeterli gerekçe bulunmadığını, kamu makamlarının eleştirel açıklamaları cezalandırıcı biçimde yorumladığını, uzun süren yargılama nedeniyle ciddi manevi zarara uğradığını, iç hukuk yollarını usulüne uygun tükettiğini ve Anayasa nın 26 ve 36. maddeleri ile adil yargılanma ilkesi gereğince ihlal kararı verilmesi gerektiğini ayrıntılı biçimde ileri sürmektedir.',
    filler: 'Anayasa Mahkemesi, bireysel başvuru, adil yargılanma hakkı, ifade özgürlüğü, mülkiyet hakkı, etkili başvuru, orantılılık ve hak ihlali değerlendirmesi anayasa hukuku ekseninde tekrar edilmektedir.',
  },
];

const toScore = ({ detectedSkill, expectedSkill, topResults, expectedSource }) => {
  let score = 0;
  if (detectedSkill === expectedSkill) score += 35;
  if ((topResults[0]?.source || '') === expectedSource) score += 25;
  if (topResults.some((item) => item.source === expectedSource)) score += 10;
  if ((topResults[0]?.matchedKeywordCount || 0) >= 3) score += 20;
  if (topResults.length >= 3) score += 10;
  return Math.min(score, 100);
};

const createMockRes = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.payload = data; return this; },
  end() { return this; },
  setHeader() {},
});

const runCase = async (testCase) => {
  const rawQuery = makeLongText(testCase.seed, testCase.filler, 400);
  const req = {
    method: 'POST',
    headers: {},
    body: {
      source: 'all',
      rawQuery,
      keyword: '',
      searchMode: 'pro',
      filters: { topK: 10, skipEnrichment: true },
    },
  };

  const res = createMockRes();
  const startedAt = Date.now();
  await handler(req, res);
  const durationMs = Date.now() - startedAt;

  const payload = res.payload || {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const topResults = results.slice(0, 3).map((item) => ({
    source: normalizeText(item?.source || ''),
    title: item?.title || '',
    daire: item?.daire || '',
    matchedKeywordCount: Number(item?.matchedKeywordCount || 0),
    matchedKeywords: item?.matchedKeywords || [],
  }));

  const detectedSkill = payload?.skillDiagnostics?.primaryDomain || payload?.aiSearchPlan?.legalArea || null;
  const score = toScore({
    detectedSkill,
    expectedSkill: testCase.expectedSkill,
    topResults,
    expectedSource: testCase.expectedSource,
  });

  return {
    id: testCase.id,
    label: testCase.label,
    expectedSkill: testCase.expectedSkill,
    detectedSkill,
    expectedSource: testCase.expectedSource,
    durationMs,
    wordCount: wordCount(rawQuery),
    resultCount: results.length,
    score,
    searchMode: payload?.searchMode || null,
    skillDiagnostics: payload?.skillDiagnostics || null,
    aiSearchPlan: payload?.aiSearchPlan || null,
    topResults,
    error: payload?.error || null,
  };
};

const main = async () => {
  const results = [];

  for (const testCase of CASES) {
    const result = await runCase(testCase);
    results.push(result);
    console.log(`${result.label} | skor=${result.score} | sonuc=${result.resultCount} | skill=${result.detectedSkill || '-'} | sure=${result.durationMs}ms`);
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    averageScore: Number((results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1)).toFixed(2)),
    results,
  }, null, 2));

  console.log(`Rapor yazildi: ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
