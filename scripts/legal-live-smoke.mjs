import 'dotenv/config';
import process from 'node:process';
import { EventEmitter } from 'node:events';

import handler from '../backend/legal/search-decisions.js';

const DEFAULT_QUERIES = [
  'kiracı kira ödemiyor, tahliye istiyorum',
  'TCK 188 uyuşturucu ticareti, ele geçirme',
];

if (typeof process.stdout?.setDefaultEncoding === 'function') {
  process.stdout.setDefaultEncoding('utf8');
}
if (typeof process.stderr?.setDefaultEncoding === 'function') {
  process.stderr.setDefaultEncoding('utf8');
}

const createMockReq = (rawQuery) => {
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.body = {
    rawQuery,
    source: 'all',
    mode: 'pro',
  };
  return req;
};

const createMockRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.payload = null;
  res.writableEnded = false;
  res.setHeader = () => {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    res.writableEnded = true;
    return res;
  };
  res.end = () => {
    res.writableEnded = true;
    return res;
  };
  return res;
};

const formatScore = (value) => (typeof value === 'number' ? value.toFixed(3) : 'YOK');

const printPayload = (query, payload = {}) => {
  const top3 = Array.isArray(payload?.results) ? payload.results.slice(0, 3) : [];

  console.log(`\n=== SORGU: ${query}`);
  console.log(`Toplam: ${Array.isArray(payload?.results) ? payload.results.length : 0}`);
  top3.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item?.birimAdi || item?.daire || 'YOK'} | ${item?.esasNo || 'YOK'} | merged: ${formatScore(item?.contentMergedScore)}`
    );
  });
  console.log(`embeddingQuery: ${payload?.retrievalDiagnostics?.embeddingQuery || 'YOK'}`);
  console.log(`agentDomain: ${payload?.retrievalDiagnostics?.agentDomain || 'YOK'}`);
  console.log(`selectedQueryVariant: ${payload?.retrievalDiagnostics?.selectedQueryVariant || 'YOK'}`);
  console.log(`totalCandidates: ${payload?.retrievalDiagnostics?.totalCandidates ?? 'YOK'}`);
};

const runQuery = async (query) => {
  const req = createMockReq(query);
  const res = createMockRes();
  await handler(req, res);
  printPayload(query, res.payload);
};

const args = process.argv.slice(2);
const echoOnly = args.includes('--echo-only');
const queries = args.filter((arg) => arg !== '--echo-only');
const targets = queries.length > 0 ? queries : DEFAULT_QUERIES;

if (echoOnly) {
  targets.forEach((query) => console.log(query));
  process.exit(0);
}

for (const query of targets) {
  await runQuery(query);
}
