import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchLegalDecisionsViaSimpleBedesten } from '../lib/legal/simpleBedestenService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASET_PATH = path.resolve(__dirname, 'yargi-cli-longform-20.json');
const OUTPUT_JSON = path.resolve('output/yargi-cli-longform-20-results.json');
const OUTPUT_MD = path.resolve('output/yargi-cli-longform-20-report.md');

const normalizeText = (value = '') =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0131/g, 'i')
    .replace(/\u0130/g, 'i')
    .replace(/\u015f|\u015e/g, 's')
    .replace(/\u011f|\u011e/g, 'g')
    .replace(/\u00fc|\u00dc/g, 'u')
    .replace(/\u00f6|\u00d6/g, 'o')
    .replace(/\u00e7|\u00c7/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();

const searchAreaForDomain = (domain = '') =>
  normalizeText(domain) === 'ceza' ? 'ceza' : 'hukuk';

const familyMatch = (result = {}, expectedFamily = '') => {
  const haystack = normalizeText([
    result?.source,
    result?.daire,
    result?.birimAdi,
    result?.title,
    result?.summaryText,
    result?.ozet,
    result?.snippet,
  ].filter(Boolean).join(' '));
  const expected = normalizeText(expectedFamily);
  if (expected === 'danistay') {
    return haystack.includes('danistay') || haystack.includes(' daire');
  }
  return expected && haystack.includes(expected);
};

const topResultShape = (result = {}) => ({
  source: result?.source || null,
  daire: result?.daire || result?.birimAdi || null,
  title: result?.title || null,
  selectionReason: result?.selectionReason || result?.matchReason || null,
  summaryPreview: String(result?.summaryText || result?.ozet || result?.snippet || '').slice(0, 240),
});

const aggregate = (records = []) => {
  const total = records.length || 1;
  const domainMatches = records.filter((item) => item.domainMatch).length;
  const familyMatches = records.filter((item) => item.top1FamilyMatch).length;
  const top15FamilyMatches = records.filter((item) => item.top15FamilyHit).length;
  const zeroResults = records.filter((item) => item.zeroResult).length;
  const avgDurationMs = Math.round(records.reduce((sum, item) => sum + item.durationMs, 0) / total);

  return {
    total: records.length,
    domainAccuracy: Number(((domainMatches / total) * 100).toFixed(1)),
    top1FamilyAccuracy: Number(((familyMatches / total) * 100).toFixed(1)),
    top15FamilyHitRate: Number(((top15FamilyMatches / total) * 100).toFixed(1)),
    zeroResultRate: Number(((zeroResults / total) * 100).toFixed(1)),
    avgDurationMs,
  };
};

const toMarkdown = ({ summary, records }) => {
  const lines = [
    '# Yargi CLI Longform 20 Eval',
    '',
    `- Total: ${summary.total}`,
    `- Domain accuracy: %${summary.domainAccuracy}`,
    `- Top1 family accuracy: %${summary.top1FamilyAccuracy}`,
    `- Top15 family hit rate: %${summary.top15FamilyHitRate}`,
    `- Zero-result rate: %${summary.zeroResultRate}`,
    `- Avg duration: ${summary.avgDurationMs} ms`,
    '',
    '## Cases',
    '',
  ];

  for (const item of records) {
    lines.push(`### ${item.id}`);
    lines.push(`- Label: ${item.label}`);
    lines.push(`- Expected domain: ${item.expectedDomain}`);
    lines.push(`- Detected domain: ${item.detectedDomain || 'n/a'}`);
    lines.push(`- Domain match: ${item.domainMatch ? 'yes' : 'no'}`);
    lines.push(`- Expected family: ${item.expectedFamily}`);
    lines.push(`- Top1 family match: ${item.top1FamilyMatch ? 'yes' : 'no'}`);
    lines.push(`- Top15 family hit: ${item.top15FamilyHit ? 'yes' : 'no'}`);
    lines.push(`- Result count: ${item.resultCount}`);
    lines.push(`- Duration: ${item.durationMs} ms`);
    lines.push(`- Selected query: ${item.selectedQueryVariant || 'n/a'}`);
    lines.push(`- Selected chamber: ${item.selectedBirimAdi || 'n/a'}`);
    lines.push(`- Top1: ${item.topResults[0]?.daire || item.topResults[0]?.title || 'n/a'}`);
    lines.push('');
  }

  return lines.join('\n');
};

const main = async () => {
  const dataset = JSON.parse(await fs.readFile(DATASET_PATH, 'utf8'));
  const records = [];

  for (const scenario of dataset) {
    const startedAt = Date.now();
    let payload = null;
    let error = null;

    try {
      payload = await searchLegalDecisionsViaSimpleBedesten({
        source: scenario.source || 'all',
        rawQuery: scenario.rawQuery,
        keyword: '',
        searchMode: 'pro',
        provider: 'http',
        filters: {
          topK: 10,
          searchArea: searchAreaForDomain(scenario.expectedDomain),
        },
      });
    } catch (caught) {
      error = String(caught?.message || caught || 'unknown_error');
    }

    const durationMs = Date.now() - startedAt;
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const diagnostics = payload?.retrievalDiagnostics || {};
    const detectedDomain = normalizeText(diagnostics?.primaryDomain || '');
    const top1 = results[0] || null;
    const top15FamilyHit = results.slice(0, 15).some((item) => familyMatch(item, scenario.expectedFamily));

    const record = {
      id: scenario.id,
      label: scenario.label,
      expectedDomain: scenario.expectedDomain,
      expectedFamily: scenario.expectedFamily,
      detectedDomain: detectedDomain || null,
      domainMatch: detectedDomain === normalizeText(scenario.expectedDomain),
      top1FamilyMatch: familyMatch(top1, scenario.expectedFamily),
      top15FamilyHit,
      zeroResult: results.length === 0,
      resultCount: results.length,
      durationMs,
      selectedQueryVariant: diagnostics?.selectedQueryVariant || null,
      selectedBirimAdi: diagnostics?.selectedBirimAdi || null,
      qualityWarnings: Array.isArray(diagnostics?.qualityWarnings) ? diagnostics.qualityWarnings : [],
      error,
      topResults: results.slice(0, 15).map((item) => topResultShape(item)),
    };

    records.push(record);
    process.stdout.write(`${record.id}: results=${record.resultCount} domain=${record.detectedDomain || 'n/a'} top1=${record.topResults[0]?.daire || 'n/a'}\n`);
  }

  const summary = aggregate(records);
  const report = toMarkdown({ summary, records });

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify({ summary, records }, null, 2), 'utf8');
  await fs.writeFile(OUTPUT_MD, report, 'utf8');

  process.stdout.write(`\nSummary: ${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Artifacts:\n- ${OUTPUT_JSON}\n- ${OUTPUT_MD}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
