import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const OUTPUT_PATH = path.resolve('output/legal-live-domain-400-safe.json');
const RUNNER_PATH = path.resolve('scripts/legal-live-single-runner.mjs');
const REPORT_TYPE = 'smoke_probe';
const CLI_ARGS = process.argv.slice(2);

const parseCliIntArg = (prefix, fallback, minimum = 0) => {
  const raw = CLI_ARGS.find((arg) => arg.startsWith(`${prefix}=`));
  const parsed = Number.parseInt(String(raw || '').split('=')[1] || '', 10);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};

const chunkItems = (items, size) => {
  const safeSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableLiveErrorMessage = (value = '') => /429|too many requests|rate limit|epipe|broken pipe/i.test(String(value || ''));

const CASE_TIMEOUT_MS = parseCliIntArg('--timeout', 30000, 10000);
const BATCH_SIZE = parseCliIntArg('--batch-size', 3, 1);
const PAUSE_MS = parseCliIntArg('--pause-ms', 1500, 0);
const RETRY_COUNT = parseCliIntArg('--retry-count', 2, 0);
const RETRY_BACKOFF_MS = parseCliIntArg('--retry-backoff-ms', 2500, 250);
const REQUESTED_IDS = new Set(
  CLI_ARGS
    .filter((arg) =>
      !arg.startsWith('--timeout=') &&
      !arg.startsWith('--batch-size=') &&
      !arg.startsWith('--pause-ms=') &&
      !arg.startsWith('--retry-count=') &&
      !arg.startsWith('--retry-backoff-ms=')
    )
    .map((arg) => String(arg || '').trim())
    .filter(Boolean)
);

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

const hasExplanationSignal = (result = {}) =>
  (Array.isArray(result?.matchedKeywords) && result.matchedKeywords.filter(Boolean).length > 0) ||
  (Array.isArray(result?.matchedRequiredConcepts) && result.matchedRequiredConcepts.filter(Boolean).length > 0) ||
  (typeof result?.selectionReason === 'string' && result.selectionReason.trim().length > 0) ||
  (typeof result?.retrievalStage === 'string' && result.retrievalStage.trim() === 'full_text');

const makeLongText = (seed, filler, minWords = 400) => {
  let text = String(seed || '').trim();
  while (wordCount(text) < minWords) {
    text = `${text} ${filler}`.trim();
  }
  return text;
};

const buildRelevanceScore = (result = {}, diagnostics = {}) => {
  const summaryText = normalizeText([
    result?.title,
    result?.daire,
    result?.summaryPreview,
    ...(Array.isArray(result?.matchedKeywords) ? result.matchedKeywords : []),
  ].join(' '));
  const coreIssue = normalizeText(diagnostics?.coreIssue || '');
  const expectedTerms = Array.from(new Set(coreIssue.split(' ').filter((token) => token.length >= 4))).slice(0, 8);
  if (!summaryText || expectedTerms.length === 0) {
    return 0;
  }

  const hits = expectedTerms.filter((term) => summaryText.includes(term)).length;
  return Number((hits / expectedTerms.length).toFixed(2));
};

const toScore = ({ detectedSkill, expectedSkill, topResults, expectedSource, skillDiagnostics }) => {
  let score = 0;
  if (detectedSkill === expectedSkill) score += 35;
  if ((topResults[0]?.source || '') === expectedSource) score += 25;
  if (topResults.some((item) => item.source === expectedSource)) score += 10;

  const topRelevance = buildRelevanceScore(topResults[0], skillDiagnostics);
  if ((topResults[0]?.matchedKeywordCount || 0) >= 3 || topRelevance >= 0.45 || hasExplanationSignal(topResults[0])) score += 20;
  if (topResults.length >= 3) score += 10;

  return Math.min(score, 100);
};

const CASES = [
  {
    id: 'ceza',
    label: 'Ceza',
    expectedSkill: 'ceza',
    expectedSource: 'yargitay',
    seed: 'Cumhuriyet başsavcılığı iddianamesinde sanığın TCK 188 kapsamında uyuşturucu ticaretiyle suçlandığı, ev aramasında satışa hazır paketler, hassas terazi, telefon inceleme tutanağı, WhatsApp yazışmaları ve kullanıcı tanık beyanlarının bulunduğu, savunmanın ise kişisel kullanım sınırı ve şüpheden sanık yararlanır ilkesine dayandığı anlatılmaktadır.',
    filler: 'Ceza dosyasında suç vasfı, ticaret kastı, kişisel kullanım ayrımı, delil yeterliliği, paketleme, telefon delili, parmak izi ve kullanıcı tanık başlıkları birlikte tartışılmaktadır.',
  },
  {
    id: 'is_hukuku',
    label: 'İş Hukuku',
    expectedSkill: 'is_hukuku',
    expectedSource: 'yargitay',
    seed: 'Davacı işçi, iş sözleşmesinin geçersiz nedenle feshedildiğini, fesih bildiriminin soyut kaldığını, puantaj kayıtlarının fazla mesaiyi gizlediğini, bordroların gerçek çalışma düzenini yansıtmadığını ve işe iade ile işçilik alacaklarının birlikte değerlendirilmesi gerektiğini ileri sürmektedir.',
    filler: 'Uyuşmazlıkta işe iade, geçersiz fesih, kıdem tazminatı, ihbar tazminatı, fazla mesai, puantaj, bordro, tanık ve SGK kayıtları iş hukuku ekseninde tekrarlanmaktadır.',
  },
  {
    id: 'aile',
    label: 'Aile Hukuku',
    expectedSkill: 'aile',
    expectedSource: 'yargitay',
    seed: 'Davacı eş, TMK 166 kapsamında evlilik birliğinin temelinden sarsıldığını, sadakat yükümlülüğüne aykırı davranışlar ile şiddet ve hakaret nedeniyle ortak hayatın çekilmez hale geldiğini, velayet ve nafaka değerlendirmesinde çocuğun üstün yararının gözetilmesi gerektiğini açıklamaktadır.',
    filler: 'Dosyada boşanma, velayet, nafaka, kişisel ilişki, ziynet eşyası, sosyal inceleme raporu, kusur ve aile konutu başlıkları aile hukuku çerçevesinde tekrar edilmektedir.',
  },
  {
    id: 'icra',
    label: 'İcra Hukuku',
    expectedSkill: 'icra',
    expectedSource: 'yargitay',
    seed: 'Davacı alacaklı, cari hesaba dayalı ilamsız takip başlattığını, borçlunun haksız itirazla takibi durdurduğunu, fatura ve banka kayıtlarıyla alacağın sabit olduğunu, İİK 67 kapsamında itirazın iptali ve icra inkar tazminatı verilmesi gerektiğini savunmaktadır.',
    filler: 'Metinde icra takibi, ödeme emri, itirazın iptali, menfi tespit, haciz, kambiyo, tebligat, icra dosyası ve icra inkar tazminatı kavramları birlikte geçmektedir.',
  },
  {
    id: 'borclar',
    label: 'Borçlar Hukuku',
    expectedSkill: 'borclar',
    expectedSource: 'yargitay',
    seed: 'Davacı, sözleşmeye aykırı ve ayıplı ifa nedeniyle zarara uğradığını, bilirkişi raporuyla onarım bedelinin ve değer kaybının saptandığını, TBK 112 ve TBK 49 çerçevesinde hem sözleşmeye aykırılık hem de haksız fiil hükümleri bakımından tazminat değerlendirmesi yapılması gerektiğini ileri sürmektedir.',
    filler: 'Uyuşmazlıkta sözleşme, ayıplı ifa, tazminat, kusur, nedensellik bağı, temerrüt, banka hareketi, tanık ve bilirkişi raporu borçlar hukuku ekseninde tekrar edilmektedir.',
  },
  {
    id: 'ticaret',
    label: 'Ticaret Hukuku',
    expectedSkill: 'ticaret',
    expectedSource: 'yargitay',
    seed: 'Davacı ortak, anonim şirket genel kurul kararının usulsüz çağrıyla alındığını, sermaye artırımında bilgi alma hakkının ihlal edildiğini, ticari defterlerin paylaşılmadığını ve yönetim kurulu üyelerinin şirket zararından sorumluluğunun doğduğunu savunmaktadır.',
    filler: 'Metinde anonim şirket, limited şirket, genel kurul, ortaklar kurulu, ticari defter, çek, bono, cari hesap, ticari faiz ve şirket sorumluluğu başlıkları birlikte işlenmektedir.',
  },
  {
    id: 'idare',
    label: 'İdare Hukuku',
    expectedSkill: 'idare',
    expectedSource: 'danistay',
    seed: 'Davacı şirket, belediye encümeni tarafından verilen imar para cezası ve yıkım kararının hukuka aykırı olduğunu, savunma alınmadan işlem kurulduğunu, ölçülülük ve hukuki güvenlik ilkelerinin ihlal edildiğini, iptal ve tam yargı taleplerinin birlikte değerlendirilmesi gerektiğini açıklamaktadır.',
    filler: 'Dosyada idari işlem, iptal davası, tam yargı, ruhsat iptali, imar para cezası, belediye encümeni, ölçülülük ve hukuki güvenlik kavramları tekrar edilmektedir.',
  },
  {
    id: 'vergi',
    label: 'Vergi Hukuku',
    expectedSkill: 'vergi',
    expectedSource: 'danistay',
    seed: 'Davacı mükellef, KDV tarhiyatı ve vergi ziyaı cezasına dayanak yapılan inceleme raporunun varsayımsal olduğunu, fatura, banka hareketi ve stok kayıtlarının gerçek mal teslimini doğruladığını, sahte fatura tespitinin yeterli somut delile dayanmadığını savunmaktadır.',
    filler: 'Metinde vergi tarhiyatı, vergi ziyaı cezası, KDV indirimi, sahte fatura, inceleme raporu, tarhiyat ihbarnamesi ve ispat yükü vergi hukuku ekseninde tekrar edilmektedir.',
  },
  {
    id: 'tuketici',
    label: 'Tüketici Hukuku',
    expectedSkill: 'tuketici',
    expectedSource: 'yargitay',
    seed: 'Davacı tüketici, satın aldığı elektronik cihazın kısa sürede tekrar arızalandığını, servis kayıtlarının kronik ayıbı gösterdiğini, garanti süresi içinde çözüm sağlanmadığını ve tüketici hakem heyeti kararına rağmen bedel iadesi yapılmadığını anlatmaktadır.',
    filler: 'Uyuşmazlıkta tüketici sözleşmesi, ayıplı mal, ayıplı hizmet, cayma hakkı, garanti belgesi, servis kaydı, bedel iadesi ve hakem heyeti kavramları tekrar edilmektedir.',
  },
  {
    id: 'sigorta',
    label: 'Sigorta Hukuku',
    expectedSkill: 'sigorta',
    expectedSource: 'yargitay',
    seed: 'Davacı araç sahibi, trafik kazası sonrası eksper raporuyla belirlenen onarım bedeli ve değer kaybının sigorta şirketince eksik ödendiğini, poliçe teminatının dar yorumlandığını, kusur oranının hatalı belirlendiğini ve rizikonun kapsam içinde kaldığını savunmaktadır.',
    filler: 'Metinde sigorta poliçesi, hasar dosyası, eksper raporu, trafik kazası, kasko, değer kaybı, riziko, rücu ve teminat kapsamı kavramları birlikte yer almaktadır.',
  },
  {
    id: 'miras',
    label: 'Miras Hukuku',
    expectedSkill: 'miras',
    expectedSource: 'yargitay',
    seed: 'Davacılar, murisin taşınmazlarını görünürde satışla tek mirasçıya devrettiğini, gerçekte bağış iradesinin bulunduğunu, bedelin ödenmediğini ve muris muvazaası ile saklı pay ihlali nedeniyle tenkis ve tapu iptali taleplerinin değerlendirilmesi gerektiğini belirtmektedir.',
    filler: 'Metinde miras, muris muvazaası, tenkis, saklı pay, vasiyetname, tereke, veraset ilamı ve tapu kaydı kavramları miras hukuku çerçevesinde tekrar edilmektedir.',
  },
  {
    id: 'anayasa',
    label: 'Anayasa Hukuku',
    expectedSkill: 'anayasa',
    expectedSource: 'anayasa',
    seed: 'Başvurucu, bireysel başvuruda makul sürede yargılanma, ifade özgürlüğü ve etkili başvuru haklarının ihlal edildiğini, derece mahkemesi kararlarında yeterli gerekçe bulunmadığını ve Anayasa Mahkemesinin ihlal kararı vermesi gerektiğini ileri sürmektedir.',
    filler: 'Metinde Anayasa Mahkemesi, bireysel başvuru, adil yargılanma hakkı, ifade özgürlüğü, etkili başvuru, ölçülülük ve hak ihlali değerlendirmesi tekrar edilmektedir.',
  },
];

const runCaseOnce = async (testCase) => {
  const rawQuery = makeLongText(testCase.seed, testCase.filler, 400);
  const encoded = Buffer.from(JSON.stringify({
    ...testCase,
    rawQuery,
  }), 'utf8').toString('base64');

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [RUNNER_PATH, encoded],
      {
        cwd: process.cwd(),
        timeout: CASE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 4,
      }
    );

      const parsed = JSON.parse(String(stdout || '{}'));
    const score = toScore({
      detectedSkill: parsed.detectedSkill,
      expectedSkill: testCase.expectedSkill,
      topResults: parsed.topResults || [],
      expectedSource: testCase.expectedSource,
      skillDiagnostics: parsed.skillDiagnostics || {},
    });

    return {
      ...parsed,
      score,
    };
  } catch (error) {
    return {
      id: testCase.id,
      label: testCase.label,
      expectedSkill: testCase.expectedSkill,
      expectedSource: testCase.expectedSource,
      detectedSkill: null,
      durationMs: CASE_TIMEOUT_MS,
      wordCount: wordCount(rawQuery),
      resultCount: 0,
      score: 0,
      searchMode: null,
      skillDiagnostics: null,
      topResults: [],
      error: error.killed || error.signal === 'SIGTERM' ? 'timeout' : String(error.message || error),
    };
  }
};

const runCase = async (testCase) => {
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt += 1) {
    const result = await runCaseOnce(testCase);
    const attemptCount = attempt + 1;
    const retryable = isRetryableLiveErrorMessage(result?.error);
    if (!retryable || attempt >= RETRY_COUNT) {
      return {
        ...result,
        attempts: attemptCount,
      };
    }

    const waitMs = RETRY_BACKOFF_MS * attemptCount;
    console.log(`${testCase.label} | retry=${attemptCount}/${RETRY_COUNT + 1} | sebep=${result.error} | bekleme=${waitMs}ms`);
    await sleep(waitMs);
  }

  return runCaseOnce(testCase);
};

const main = async () => {
  const selectedCases = REQUESTED_IDS.size > 0
    ? CASES.filter((testCase) => REQUESTED_IDS.has(testCase.id))
    : CASES;
  const results = [];
  const batches = chunkItems(selectedCases, BATCH_SIZE);

  console.log(`Smoke config | batch=${BATCH_SIZE} | pause=${PAUSE_MS}ms | retry=${RETRY_COUNT} | retryBackoff=${RETRY_BACKOFF_MS}ms | timeout=${CASE_TIMEOUT_MS}ms`);

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`Batch ${batchIndex + 1}/${batches.length} basliyor | vakalar=${batch.map((item) => item.id).join(', ')}`);

    for (const testCase of batch) {
      const result = await runCase(testCase);
      results.push(result);
      console.log(`${result.label} | skor=${result.score} | sonuc=${result.resultCount} | skill=${result.detectedSkill || '-'} | sure=${result.durationMs}ms | deneme=${result.attempts || 1} | hata=${result.error || '-'}`);
    }

    if (batchIndex < batches.length - 1 && PAUSE_MS > 0) {
      console.log(`Batch arasi bekleme: ${PAUSE_MS}ms`);
      await sleep(PAUSE_MS);
    }
  }

  const averageScore = Number((results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1)).toFixed(2));
  const reportPayload = {
    reportType: REPORT_TYPE,
    scopeLabel: 'smoke_test',
    generatedAt: new Date().toISOString(),
    caseTimeoutMs: CASE_TIMEOUT_MS,
    batchSize: BATCH_SIZE,
    pauseMs: PAUSE_MS,
    retryCount: RETRY_COUNT,
    retryBackoffMs: RETRY_BACKOFF_MS,
    totalCases: results.length,
    requestedIds: Array.from(REQUESTED_IDS),
    averageScore,
    results,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(reportPayload, null, 2));

  console.log(`Rapor yazildi: ${OUTPUT_PATH}`);
};

export const __testables = {
  hasExplanationSignal,
  toScore,
  chunkItems,
  isRetryableLiveErrorMessage,
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
