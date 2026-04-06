import handler from '../backend/legal/search-decisions.js';

const decodePayload = (encoded = '') => {
  const jsonText = Buffer.from(String(encoded || ''), 'base64').toString('utf8');
  return JSON.parse(jsonText);
};

const wordCount = (text = '') =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

const createMockRes = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.payload = data; return this; },
  end() { return this; },
  setHeader() {},
});

const main = async () => {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};

  const encoded = process.argv[2] || '';
  const testCase = decodePayload(encoded);
  const req = {
    method: 'POST',
    headers: {},
    body: {
      source: 'all',
      rawQuery: testCase.rawQuery,
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
    source: item?.source || '',
    title: item?.title || '',
    daire: item?.daire || '',
    matchedKeywordCount: Number(item?.matchedKeywordCount || 0),
    matchedKeywords: Array.isArray(item?.matchedKeywords) ? item.matchedKeywords : [],
    matchedRequiredConcepts: Array.isArray(item?.matchedRequiredConcepts) ? item.matchedRequiredConcepts : [],
    selectionReason: typeof item?.selectionReason === 'string' ? item.selectionReason : (typeof item?.matchReason === 'string' ? item.matchReason : ''),
    retrievalStage: typeof item?.retrievalStage === 'string' ? item.retrievalStage : (typeof item?.matchStage === 'string' ? item.matchStage : ''),
    summaryPreview: String(item?.summaryText || item?.ozet || item?.snippet || '').slice(0, 220),
  }));

  process.stdout.write(JSON.stringify({
    id: testCase.id,
    label: testCase.label,
    expectedSkill: testCase.expectedSkill,
    expectedSource: testCase.expectedSource,
    durationMs,
    wordCount: wordCount(testCase.rawQuery),
    resultCount: results.length,
    searchMode: payload?.searchMode || null,
    detectedSkill: payload?.skillDiagnostics?.primaryDomain || payload?.aiSearchPlan?.legalArea || null,
    skillDiagnostics: payload?.skillDiagnostics || null,
    topResults,
    error: payload?.error || null,
  }));

  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
};

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
