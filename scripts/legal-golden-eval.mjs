import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import handler from '../backend/legal/search-decisions.js';

const rootDir = process.cwd();
const datasetPath = path.join(rootDir, 'scripts', 'legal-golden-set.json');
const outputDir = path.join(rootDir, 'output');
const resultsPath = path.join(outputDir, 'legal-golden-eval-results.json');
const reportPath = path.join(outputDir, 'legal-golden-eval-report.md');

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const safeRatio = (value, total) => total > 0 ? value / total : 0;
const RATE_LIMITED_SIGNAL_RE = /(?:^|\b)(429|too many requests|rate limit|http_429|rate_limited)(?:\b|$)/i;
const GEMINI_FALLBACK_SIGNAL_RE = /gemini query expansion fallback|resource_exhausted/i;
const BEDESTEN_TIMEOUT_SIGNAL_RE = /(simple_bedesten_timeout|simple_http_timeout|yargi_cli_timeout|zaman asimina ugradi)/i;
const TRANSIENT_RETRY_SIGNAL_RE = /(?:429|too many requests|rate limit|http_429|rate_limited|simple_bedesten_timeout|simple_http_timeout|yargi_cli_timeout|fetch failed|timed out|timeout|zaman asimina ugradi)/i;
const GOLDEN_EVAL_MAX_RETRIES = Math.max(0, Number(process.env.LEGAL_GOLDEN_EVAL_MAX_RETRIES || 2));
const GOLDEN_EVAL_RETRY_BASE_DELAY_MS = Math.max(1000, Number(process.env.LEGAL_GOLDEN_EVAL_RETRY_BASE_DELAY_MS || 4500));

const getCooldownMs = (expectedDomain = '') => {
    if (expectedDomain === 'anayasa') return 6500;
    if (expectedDomain === 'idare' || expectedDomain === 'vergi') return 5000;
    if (['borclar', 'icra', 'tuketici', 'ticaret', 'is_hukuku', 'gayrimenkul'].includes(expectedDomain)) {
        return 3500;
    }
    return 2500;
};

const getRetryDelayMs = (retryIndex = 0, expectedDomain = '') =>
    getCooldownMs(expectedDomain) + (retryIndex + 1) * GOLDEN_EVAL_RETRY_BASE_DELAY_MS;

const buildRequestBody = (scenario = {}) => ({
    rawQuery: scenario.query,
    source: scenario.source || 'all',
    mode: 'pro',
    provider: 'auto',
    filters: scenario.filters || {},
    legalSearchPacket: scenario.legalSearchPacket || null,
});

const stringifyLogArg = (value) => {
    if (typeof value === 'string') return value;
    return inspect(value, { depth: 3, breakLength: Infinity, compact: true });
};

const invokeSearchHandler = (body) => new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.body = body;
    req.headers = {};

    const capturedLogs = [];
    const consoleMethods = ['log', 'warn', 'error'];
    const originalConsole = Object.fromEntries(consoleMethods.map((method) => [method, console[method]]));
    let restored = false;
    const restoreConsole = () => {
        if (restored) return;
        restored = true;
        consoleMethods.forEach((method) => {
            console[method] = originalConsole[method];
        });
    };

    consoleMethods.forEach((method) => {
        console[method] = (...args) => {
            capturedLogs.push(args.map(stringifyLogArg).join(' '));
            originalConsole[method].apply(console, args);
        };
    });

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (key, value) => {
        res.headers[key] = value;
    };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (payload) => {
        restoreConsole();
        resolve({ statusCode: res.statusCode, payload, capturedLogs });
    };

    Promise.resolve(handler(req, res)).catch((error) => {
        restoreConsole();
        reject(error);
    });
});

const collectTop5MatchedSignals = (results = []) => results
    .slice(0, 5)
    .flatMap((result) => [
        ...(Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive : []),
        ...(Array.isArray(result?.contentMatchedFactPattern) ? result.contentMatchedFactPattern : []),
        ...(Array.isArray(result?.contentMatchedQueryCore) ? result.contentMatchedQueryCore : []),
        ...(Array.isArray(result?.contentMatchedQueryTokens) ? result.contentMatchedQueryTokens : []),
        ...(Array.isArray(result?.contentMatchedPhrases) ? result.contentMatchedPhrases : []),
        ...(Array.isArray(result?.matchedSupportConcepts) ? result.matchedSupportConcepts : []),
    ])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const collectTop5FamilyHaystack = (results = []) => normalizeText(
    results
        .slice(0, 5)
        .map((result) => [
            result?.title,
            result?.daire,
            result?.source,
        ].join(' '))
        .join(' ')
);

const hasRateLimitedSignal = ({ payload, retrievalDiagnostics, capturedLogs = [], errorMessage = '' }) => {
    const payloadSignals = [
        payload?.error,
        payload?.message,
        payload?.fallbackReason,
        payload?.retrievalDiagnostics?.fallbackReason,
        retrievalDiagnostics?.sourceCoverageStatus,
        ...capturedLogs,
        errorMessage,
    ].filter(Boolean);

    return payloadSignals.some((value) => RATE_LIMITED_SIGNAL_RE.test(String(value || '')))
        || Number(retrievalDiagnostics?.rateLimitedAttemptCount || 0) > 0;
};

const hasGeminiFallbackSignal = ({ capturedLogs = [], errorMessage = '' }) =>
    [...capturedLogs, errorMessage].some((value) => GEMINI_FALLBACK_SIGNAL_RE.test(String(value || '')));

const hasBedestenTimeoutSignal = ({ payload, retrievalDiagnostics, capturedLogs = [], errorMessage = '' }) => {
    const payloadSignals = [
        payload?.error,
        payload?.message,
        payload?.fallbackReason,
        payload?.retrievalDiagnostics?.fallbackReason,
        retrievalDiagnostics?.sourceCoverageStatus,
        retrievalDiagnostics?.zeroResultReason,
        ...capturedLogs,
        errorMessage,
    ].filter(Boolean);

    return payloadSignals.some((value) => BEDESTEN_TIMEOUT_SIGNAL_RE.test(String(value || '')));
};

const scoreScenario = ({
    scenario,
    payload,
    statusCode,
    durationMs,
    cooldownAppliedMs,
    capturedLogs = [],
    errorMessage = '',
    attemptCount = 1,
    retryCount = 0,
}) => {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const retrievalDiagnostics = payload?.retrievalDiagnostics || payload?.diagnostics || {};
    const detectedDomain = String(retrievalDiagnostics?.primaryDomain || '').trim() || null;
    const selectedBirimAdi = String(retrievalDiagnostics?.selectedBirimAdi || '').trim() || null;
    const acceptedTopResultDaireler = Array.isArray(retrievalDiagnostics?.acceptedTopResultDaireler)
        ? retrievalDiagnostics.acceptedTopResultDaireler.filter(Boolean)
        : [];
    const top5MatchedSignals = collectTop5MatchedSignals(results);
    const top5MatchedHaystack = normalizeText(top5MatchedSignals.join(' '));
    const top5FamilyHaystack = collectTop5FamilyHaystack(results);

    const mustConcepts = Array.isArray(scenario.mustConcepts) ? scenario.mustConcepts : [];
    const forbiddenConcepts = Array.isArray(scenario.forbiddenConcepts) ? scenario.forbiddenConcepts : [];
    const mustHits = mustConcepts.filter((concept) => top5MatchedHaystack.includes(normalizeText(concept)));
    const forbiddenHits = forbiddenConcepts.filter((concept) => top5MatchedHaystack.includes(normalizeText(concept)));
    const mustHitRate = safeRatio(mustHits.length, mustConcepts.length);

    const domainPass = detectedDomain === scenario.expected?.domain;
    const birimPass = scenario.expected?.birim ? selectedBirimAdi === scenario.expected.birim : true;
    const familyPass = scenario.expected?.family
        ? acceptedTopResultDaireler.some((value) => normalizeText(value).includes(normalizeText(scenario.expected.family)))
            || top5FamilyHaystack.includes(normalizeText(scenario.expected.family))
        : true;
    const forbiddenLeak = forbiddenHits.length > 0;
    const sourceCoverageStatus = retrievalDiagnostics?.sourceCoverageStatus || null;
    const rateLimited = hasRateLimitedSignal({ payload, retrievalDiagnostics, capturedLogs, errorMessage });
    const geminiFallback = hasGeminiFallbackSignal({ capturedLogs, errorMessage });
    const bedestenTimeout = hasBedestenTimeoutSignal({ payload, retrievalDiagnostics, capturedLogs, errorMessage });
    const zeroResultReason = retrievalDiagnostics?.zeroResultReason || null;

    const status = rateLimited
        ? 'partial'
        : bedestenTimeout
            ? 'partial'
        : results.length === 0
            ? 'fail'
            : (domainPass && birimPass && familyPass && mustHitRate >= 0.67 && !forbiddenLeak ? 'pass' : 'partial');

    return {
        id: scenario.id,
        query: scenario.query,
        expected: scenario.expected,
        statusCode,
        status,
        durationMs,
        cooldownAppliedMs,
        attemptCount,
        retryCount,
        detectedDomain,
        retrievalDiagnostics: {
            primaryDomain: retrievalDiagnostics?.primaryDomain || null,
            selectedBirimAdi,
            acceptedTopResultDaireler,
            sourceCoverageStatus,
            rateLimitedAttemptCount: retrievalDiagnostics?.rateLimitedAttemptCount || 0,
            zeroResultReason,
            simpleQualityScore: retrievalDiagnostics?.simpleQualityScore ?? null,
        },
        top5MatchedSignals,
        resultCount: results.length,
        topResults: results.slice(0, 5).map((result) => ({
            title: result?.title || null,
            daire: result?.daire || null,
            source: result?.source || null,
            contentScore: result?.contentScore ?? null,
            contentMergedScore: result?.contentMergedScore ?? null,
            contentEmbeddingScore: result?.contentEmbeddingScore ?? null,
            contentMatchedSubstantive: Array.isArray(result?.contentMatchedSubstantive) ? result.contentMatchedSubstantive : [],
            contentMatchedFactPattern: Array.isArray(result?.contentMatchedFactPattern) ? result.contentMatchedFactPattern : [],
            contentMatchedQueryCore: Array.isArray(result?.contentMatchedQueryCore) ? result.contentMatchedQueryCore : [],
            contentMatchedQueryTokens: Array.isArray(result?.contentMatchedQueryTokens) ? result.contentMatchedQueryTokens : [],
            contentMatchedPhrases: Array.isArray(result?.contentMatchedPhrases) ? result.contentMatchedPhrases : [],
            matchedSupportConcepts: Array.isArray(result?.matchedSupportConcepts) ? result.matchedSupportConcepts : [],
            summaryPreview: String(result?.summaryText || result?.ozet || result?.snippet || '').slice(0, 240) || null,
        })),
        mustConcepts,
        mustHits,
        mustHitRate,
        forbiddenConcepts,
        forbiddenHits,
        checks: {
            domainPass,
            birimPass,
            familyPass,
            forbiddenLeak,
            rateLimited,
            geminiFallback,
            bedestenTimeout,
            hasResults: results.length > 0,
            allMustCovered: mustHitRate === 1,
        },
        capturedRateLimitSignals: rateLimited
            ? capturedLogs.filter((line) => RATE_LIMITED_SIGNAL_RE.test(line)).slice(0, 8)
            : [],
        capturedGeminiFallbackSignals: geminiFallback
            ? capturedLogs.filter((line) => GEMINI_FALLBACK_SIGNAL_RE.test(line)).slice(0, 8)
            : [],
        capturedBedestenTimeoutSignals: bedestenTimeout
            ? capturedLogs.filter((line) => BEDESTEN_TIMEOUT_SIGNAL_RE.test(line)).slice(0, 8)
            : [],
    };
};

const buildErroredScenarioResult = ({
    scenario,
    errorMessage = '',
    durationMs = 0,
    cooldownAppliedMs = 0,
    attemptCount = 1,
    retryCount = 0,
}) => {
    const rateLimited = RATE_LIMITED_SIGNAL_RE.test(errorMessage);
    const bedestenTimeout = BEDESTEN_TIMEOUT_SIGNAL_RE.test(errorMessage);
    const geminiFallback = GEMINI_FALLBACK_SIGNAL_RE.test(errorMessage);
    return {
        id: scenario.id,
        query: scenario.query,
        expected: scenario.expected,
        statusCode: 500,
        status: rateLimited || bedestenTimeout ? 'partial' : 'fail',
        durationMs,
        cooldownAppliedMs,
        attemptCount,
        retryCount,
        detectedDomain: null,
        retrievalDiagnostics: {
            primaryDomain: null,
            selectedBirimAdi: null,
            acceptedTopResultDaireler: [],
            sourceCoverageStatus: rateLimited
                ? 'rate_limited'
                : (bedestenTimeout ? 'dependency_timeout' : 'dependency_error'),
            rateLimitedAttemptCount: rateLimited ? 1 : 0,
            zeroResultReason: null,
            simpleQualityScore: null,
        },
        top5MatchedSignals: [],
        resultCount: 0,
        topResults: [],
        mustConcepts: scenario.mustConcepts || [],
        mustHits: [],
        mustHitRate: 0,
        forbiddenConcepts: scenario.forbiddenConcepts || [],
        forbiddenHits: [],
        checks: {
            domainPass: false,
            birimPass: false,
            familyPass: false,
            forbiddenLeak: false,
            rateLimited,
            geminiFallback,
            bedestenTimeout,
            hasResults: false,
            allMustCovered: false,
        },
        capturedRateLimitSignals: rateLimited ? [errorMessage] : [],
        capturedGeminiFallbackSignals: geminiFallback ? [errorMessage] : [],
        capturedBedestenTimeoutSignals: bedestenTimeout ? [errorMessage] : [],
        error: errorMessage,
    };
};

const shouldRetryScenario = ({ scored = null, errorMessage = '' } = {}) =>
    Boolean(scored?.checks?.rateLimited || scored?.checks?.bedestenTimeout)
    || TRANSIENT_RETRY_SIGNAL_RE.test(String(errorMessage || ''));

const aggregate = (results = [], { totalAttemptCount = 0, bedestenTimeoutAttemptCount = 0 } = {}) => {
    const total = results.length;
    const rateLimitedCount = results.filter((item) => item.checks.rateLimited).length;
    const geminiFallbackCount = results.filter((item) => item.checks.geminiFallback).length;
    const bedestenTimeoutCaseCount = results.filter((item) => item.checks.bedestenTimeout).length;
    const evaluatedResults = results.filter((item) => !item.checks.rateLimited);
    const evaluatedTotal = evaluatedResults.length;
    const passCount = results.filter((item) => item.status === 'pass').length;
    const partialCount = results.filter((item) => item.status === 'partial').length;
    const failCount = results.filter((item) => item.status === 'fail').length;
    const domainPassCount = evaluatedResults.filter((item) => item.checks.domainPass).length;
    const birimPassCount = evaluatedResults.filter((item) => item.checks.birimPass).length;
    const familyPassCount = evaluatedResults.filter((item) => item.checks.familyPass).length;
    const allMustCoveredCount = evaluatedResults.filter((item) => item.checks.allMustCovered).length;
    const forbiddenLeakCount = evaluatedResults.filter((item) => item.checks.forbiddenLeak).length;
    const zeroResultCount = evaluatedResults.filter((item) => !item.checks.hasResults).length;
    const avgMustHitRate = evaluatedTotal > 0
        ? evaluatedResults.reduce((sum, item) => sum + Number(item.mustHitRate || 0), 0) / evaluatedTotal
        : 0;

    const byDomain = Object.values(results.reduce((acc, item) => {
        const key = item.expected?.domain || 'unknown';
        acc[key] ||= {
            domain: key,
            total: 0,
            evaluated: 0,
            pass: 0,
            partial: 0,
            fail: 0,
            domainPass: 0,
            birimPass: 0,
            familyPass: 0,
            allMustCovered: 0,
            forbiddenLeak: 0,
            rateLimited: 0,
            zeroResults: 0,
            avgMustHitRate: 0,
        };
        const bucket = acc[key];
        bucket.total += 1;
        bucket[item.status] += 1;
        if (item.checks.rateLimited) bucket.rateLimited += 1;
        if (!item.checks.rateLimited) {
            bucket.evaluated += 1;
            if (item.checks.domainPass) bucket.domainPass += 1;
            if (item.checks.birimPass) bucket.birimPass += 1;
            if (item.checks.familyPass) bucket.familyPass += 1;
            if (item.checks.allMustCovered) bucket.allMustCovered += 1;
            if (item.checks.forbiddenLeak) bucket.forbiddenLeak += 1;
            if (!item.checks.hasResults) bucket.zeroResults += 1;
            bucket.avgMustHitRate += Number(item.mustHitRate || 0);
        }
        return acc;
    }, {})).map((bucket) => ({
        ...bucket,
        avgMustHitRate: safeRatio(bucket.avgMustHitRate, bucket.evaluated),
    })).sort((left, right) => left.domain.localeCompare(right.domain, 'tr'));

    return {
        total,
        totalAttemptCount,
        evaluatedTotal,
        excludedRateLimitedCount: rateLimitedCount,
        geminiFallbackCount,
        bedestenTimeoutCaseCount,
        bedestenTimeoutAttemptCount,
        passCount,
        partialCount,
        failCount,
        domainAccuracy: safeRatio(domainPassCount, evaluatedTotal),
        birimAccuracy: safeRatio(birimPassCount, evaluatedTotal),
        familyAccuracy: safeRatio(familyPassCount, evaluatedTotal),
        allMustCoveredRate: safeRatio(allMustCoveredCount, evaluatedTotal),
        avgMustHitRate,
        forbiddenLeakRate: safeRatio(forbiddenLeakCount, evaluatedTotal),
        rateLimitedRate: safeRatio(rateLimitedCount, total),
        geminiFallbackRate: safeRatio(geminiFallbackCount, total),
        bedestenTimeoutCaseRate: safeRatio(bedestenTimeoutCaseCount, total),
        bedestenTimeoutAttemptRate: safeRatio(bedestenTimeoutAttemptCount, totalAttemptCount),
        zeroResultRate: safeRatio(zeroResultCount, evaluatedTotal),
        byDomain,
    };
};

const buildMarkdownReport = ({ generatedAt, summary, results }) => {
    const failLike = results.filter((item) => item.status !== 'pass');
    const lines = [
        '# Legal Golden Eval Report',
        '',
        `- Generated at: ${generatedAt}`,
        `- Total cases: ${summary.total}`,
        `- Total attempts: ${summary.totalAttemptCount}`,
        `- Evaluated cases (excluding rate-limited): ${summary.evaluatedTotal}`,
        `- Excluded rate-limited cases: ${summary.excludedRateLimitedCount}`,
        `- Pass / Partial / Fail: ${summary.passCount} / ${summary.partialCount} / ${summary.failCount}`,
        `- Domain accuracy: ${(summary.domainAccuracy * 100).toFixed(1)}%`,
        `- Birim accuracy: ${(summary.birimAccuracy * 100).toFixed(1)}%`,
        `- Family accuracy: ${(summary.familyAccuracy * 100).toFixed(1)}%`,
        `- Avg mustConcept hit rate (substantive + factPattern + queryCore + queryTokens + phrases + support): ${(summary.avgMustHitRate * 100).toFixed(1)}%`,
        `- All must concepts covered in top 5: ${(summary.allMustCoveredRate * 100).toFixed(1)}%`,
        `- Forbidden leak rate: ${(summary.forbiddenLeakRate * 100).toFixed(1)}%`,
        `- Rate-limited rate: ${(summary.rateLimitedRate * 100).toFixed(1)}%`,
        `- Gemini 429 fallback count: ${summary.geminiFallbackCount}/${summary.total}`,
        `- Bedesten timeout cases: ${summary.bedestenTimeoutCaseCount}/${summary.total}`,
        `- Bedesten timeout attempts: ${summary.bedestenTimeoutAttemptCount}/${summary.totalAttemptCount}`,
        `- Zero-result rate: ${(summary.zeroResultRate * 100).toFixed(1)}%`,
        '',
        '## By domain',
        '',
        '| Domain | Total | Eval | RL | Pass | Partial | Fail | Domain | Birim | Family | Must hit | All must | Forbidden leak | Zero |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...summary.byDomain.map((bucket) => `| ${bucket.domain} | ${bucket.total} | ${bucket.evaluated} | ${bucket.rateLimited} | ${bucket.pass} | ${bucket.partial} | ${bucket.fail} | ${(safeRatio(bucket.domainPass, bucket.evaluated) * 100).toFixed(0)}% | ${(safeRatio(bucket.birimPass, bucket.evaluated) * 100).toFixed(0)}% | ${(safeRatio(bucket.familyPass, bucket.evaluated) * 100).toFixed(0)}% | ${(bucket.avgMustHitRate * 100).toFixed(0)}% | ${(safeRatio(bucket.allMustCovered, bucket.evaluated) * 100).toFixed(0)}% | ${(safeRatio(bucket.forbiddenLeak, bucket.evaluated) * 100).toFixed(0)}% | ${(safeRatio(bucket.zeroResults, bucket.evaluated) * 100).toFixed(0)}% |`),
        '',
        '## Partial / fail cases',
        '',
        ...failLike.flatMap((item) => [
            `### ${item.id} (${item.status})`,
            `- Query: ${item.query}`,
            `- Expected: ${item.expected?.domain || 'n/a'} / ${item.expected?.birim || 'n/a'} / ${item.expected?.family || 'n/a'}`,
            `- Got: ${item.detectedDomain || 'n/a'} / ${item.retrievalDiagnostics?.selectedBirimAdi || 'n/a'}`,
            `- Must hits: ${item.mustHits.length}/${item.mustConcepts.length} -> ${(item.mustHitRate * 100).toFixed(0)}%`,
            `- Rate limited: ${item.checks.rateLimited ? 'yes' : 'no'}`,
            `- Gemini fallback: ${item.checks.geminiFallback ? 'yes' : 'no'}`,
            `- Bedesten timeout: ${item.checks.bedestenTimeout ? 'yes' : 'no'}`,
            `- Forbidden hits: ${item.forbiddenHits.length > 0 ? item.forbiddenHits.join(', ') : 'none'}`,
            `- Source coverage: ${item.retrievalDiagnostics?.sourceCoverageStatus || 'n/a'}`,
            `- Zero result reason: ${item.retrievalDiagnostics?.zeroResultReason || 'n/a'}`,
            ...(item.capturedRateLimitSignals?.length ? [`- Rate-limit signals: ${item.capturedRateLimitSignals.join(' | ')}`] : []),
            ...(item.capturedGeminiFallbackSignals?.length ? [`- Gemini fallback signals: ${item.capturedGeminiFallbackSignals.join(' | ')}`] : []),
            ...(item.capturedBedestenTimeoutSignals?.length ? [`- Bedesten timeout signals: ${item.capturedBedestenTimeoutSignals.join(' | ')}`] : []),
            '',
        ]),
    ];
    return `${lines.join('\n').trim()}\n`;
};

const main = async () => {
    const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
    const results = [];
    let totalAttemptCount = 0;
    let bedestenTimeoutAttemptCount = 0;

    for (let index = 0; index < dataset.length; index += 1) {
        const scenario = dataset[index];
        const body = buildRequestBody(scenario);
        console.log(`[golden-eval] ${index + 1}/${dataset.length} ${scenario.id} start`);
        let finalRecord = null;

        for (let attempt = 0; attempt <= GOLDEN_EVAL_MAX_RETRIES; attempt += 1) {
            const startedAt = Date.now();
            totalAttemptCount += 1;
            try {
                const { statusCode, payload, capturedLogs } = await invokeSearchHandler(body);
                const durationMs = Date.now() - startedAt;
                const cooldownAppliedMs = getCooldownMs(scenario.expected?.domain);
                const scored = scoreScenario({
                    scenario,
                    payload,
                    statusCode,
                    durationMs,
                    cooldownAppliedMs,
                    capturedLogs,
                    attemptCount: attempt + 1,
                    retryCount: attempt,
                });

                if (scored.checks.bedestenTimeout) {
                    bedestenTimeoutAttemptCount += 1;
                }

                if (attempt < GOLDEN_EVAL_MAX_RETRIES && shouldRetryScenario({ scored })) {
                    const retryDelayMs = getRetryDelayMs(attempt, scenario.expected?.domain);
                    console.warn(
                        `[golden-eval] ${scenario.id} retry=${attempt + 1} rateLimited=${scored.checks.rateLimited} timeout=${scored.checks.bedestenTimeout} delay=${retryDelayMs}ms`
                    );
                    await sleep(retryDelayMs);
                    continue;
                }

                finalRecord = scored;
                break;
            } catch (error) {
                const cooldownAppliedMs = getCooldownMs(scenario.expected?.domain);
                const errorMessage = String(error?.message || error);
                const erroredRecord = buildErroredScenarioResult({
                    scenario,
                    errorMessage,
                    durationMs: Date.now() - startedAt,
                    cooldownAppliedMs,
                    attemptCount: attempt + 1,
                    retryCount: attempt,
                });

                if (erroredRecord.checks.bedestenTimeout) {
                    bedestenTimeoutAttemptCount += 1;
                }

                if (attempt < GOLDEN_EVAL_MAX_RETRIES && shouldRetryScenario({ scored: erroredRecord, errorMessage })) {
                    const retryDelayMs = getRetryDelayMs(attempt, scenario.expected?.domain);
                    console.warn(
                        `[golden-eval] ${scenario.id} retry=${attempt + 1} error=${errorMessage} delay=${retryDelayMs}ms`
                    );
                    await sleep(retryDelayMs);
                    continue;
                }

                finalRecord = erroredRecord;
                console.error(`[golden-eval] ${scenario.id} error: ${error?.message || error}`);
                break;
            }
        }

        results.push(finalRecord);
        await mkdir(outputDir, { recursive: true });
        await writeFile(path.join(outputDir, 'tmp-legal-eval-results.json'), JSON.stringify(results, null, 2), 'utf8');
        console.log(
            `[golden-eval] ${scenario.id} done status=${finalRecord.status} results=${finalRecord.resultCount} must=${(finalRecord.mustHitRate * 100).toFixed(0)}% retries=${finalRecord.retryCount}`
        );
        if (index < dataset.length - 1 && finalRecord.cooldownAppliedMs > 0) {
            await sleep(finalRecord.cooldownAppliedMs);
        }
    }

    const generatedAt = new Date().toISOString();
    const summary = aggregate(results, { totalAttemptCount, bedestenTimeoutAttemptCount });
    const report = buildMarkdownReport({ generatedAt, summary, results });

    await mkdir(outputDir, { recursive: true });
    await writeFile(resultsPath, JSON.stringify({ generatedAt, summary, results }, null, 2), 'utf8');
    await writeFile(reportPath, report, 'utf8');

    console.log(JSON.stringify({ generatedAt, resultsPath, reportPath, summary }, null, 2));
};

await main();
