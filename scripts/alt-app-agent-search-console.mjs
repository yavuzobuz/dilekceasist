import readline from 'node:readline/promises';
import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import analyzeHandler from '../backend/gemini/analyze.js';
import searchHandler from '../backend/legal/search-decisions.js';
import getDocumentHandler from '../backend/legal/get-document.js';

export const buildAgentDrivenSearchText = (packet = null, fallbackSummary = '', fallbackText = '') => {
  const searchSeedText = String(packet?.searchSeedText || '').replace(/\s+/g, ' ').trim();
  if (searchSeedText) return searchSeedText;

  const packetFallback = [
    packet?.coreIssue,
    packet?.caseType,
    ...(Array.isArray(packet?.requiredConcepts) ? packet.requiredConcepts.slice(0, 4) : []),
    ...(Array.isArray(packet?.supportConcepts) ? packet.supportConcepts.slice(0, 2) : []),
  ]
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (packetFallback) return packetFallback;
  if (String(fallbackSummary || '').trim()) return String(fallbackSummary || '').trim();
  return String(fallbackText || '').trim();
};

const createMockReq = (body = {}) => ({
  method: 'POST',
  headers: {},
  body,
  aborted: false,
  once() {},
});

const createMockRes = () => ({
  statusCode: 200,
  payload: null,
  writableEnded: false,
  once() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.payload = data;
    return this;
  },
  end() {
    return this;
  },
  setHeader() {},
});

const invokeHandler = async (handler, body = {}) => {
  const req = createMockReq(body);
  const res = createMockRes();
  await handler(req, res);
  return res;
};

const cleanJsonString = (text = '') =>
  String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

const repairMalformedSearchVariantQueries = (text = '') => {
  if (!/"query"\s*:\s*"/.test(text)) return text;

  const queryStartRegex = /"query"\s*:\s*"/g;
  let output = '';
  let cursor = 0;
  let match;

  while ((match = queryStartRegex.exec(text)) !== null) {
    const valueStart = queryStartRegex.lastIndex;
    output += text.slice(cursor, valueStart);

    let endIndex = valueStart;
    let escaped = false;

    while (endIndex < text.length) {
      const char = text[endIndex];

      if (escaped) {
        escaped = false;
        endIndex += 1;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        endIndex += 1;
        continue;
      }

      if (char === '"') {
        let lookAhead = endIndex + 1;
        while (lookAhead < text.length && /\s/.test(text[lookAhead])) {
          lookAhead += 1;
        }

        if (text[lookAhead] === ',' || text[lookAhead] === '}') {
          break;
        }
      }

      endIndex += 1;
    }

    if (endIndex >= text.length) {
      return text;
    }

    const rawValue = text.slice(valueStart, endIndex);
    let repairedValue = '';
    let valueEscaped = false;

    for (const valueChar of rawValue) {
      if (valueEscaped) {
        repairedValue += valueChar;
        valueEscaped = false;
        continue;
      }

      if (valueChar === '\\') {
        repairedValue += valueChar;
        valueEscaped = true;
        continue;
      }

      if (valueChar === '"') {
        repairedValue += '\\"';
        continue;
      }

      repairedValue += valueChar;
    }

    output += repairedValue;
    cursor = endIndex;
    queryStartRegex.lastIndex = endIndex + 1;
  }

  output += text.slice(cursor);
  return output;
};

export const parseAnalyzePayload = (payload = {}) => {
  const rawText = repairMalformedSearchVariantQueries(cleanJsonString(payload?.text || ''));
  if (!rawText) {
    throw new Error(payload?.error || 'Analyze cevabi bos geldi.');
  }

  const parsed = JSON.parse(rawText);
  const legalSearchPacket = parsed?.legalSearchPacket || parsed?.analysisInsights?.precedentSearchPlan || null;

  return {
    raw: parsed,
    summary: String(parsed?.summary || '').trim(),
    legalSearchPacket,
  };
};

const shorten = (value = '', maxLength = 220) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
};

const printTopResults = (results = []) => {
  if (!Array.isArray(results) || results.length === 0) {
    console.log('\nSonuc yok.');
    return;
  }

  console.log(`\nToplam sonuc: ${results.length}`);
  results.slice(0, 5).forEach((item, index) => {
    console.log(`\n${index + 1}. ${item?.title || 'Karar'}`);
    console.log(`   Daire: ${item?.daire || '-'}`);
    console.log(`   Kaynak: ${item?.source || '-'}`);
    console.log(`   Belge ID: ${item?.documentId || item?.id || '-'}`);
    const preview = shorten(item?.summaryText || item?.ozet || item?.snippet || '', 260);
    if (preview) {
      console.log(`   Ozet: ${preview}`);
    }
  });
};

const maybePrintDocuments = async (results = []) => {
  const docs = results.slice(0, 3);
  for (const item of docs) {
    if (!item?.documentId && !item?.documentUrl) continue;
    const res = await invokeHandler(getDocumentHandler, {
      source: item?.source || 'all',
      documentId: item?.documentId,
      documentUrl: item?.documentUrl,
      title: item?.title,
      esasNo: item?.esasNo,
      kararNo: item?.kararNo,
      tarih: item?.tarih,
      daire: item?.daire,
      ozet: item?.ozet,
      snippet: item?.snippet,
    });

    const text = shorten(res?.payload?.document || '', 600);
    if (!text) continue;
    console.log(`\nTam metin onizleme: ${item?.title || item?.documentId}`);
    console.log(text);
  }
};

export const runAltAppAgentSearchConsole = async ({
  inputText = '',
  withDocs = false,
} = {}) => {
  const cleanedInput = String(inputText || '').trim();
  if (!cleanedInput) {
    throw new Error('Arama icin metin gerekli.');
  }

  const analyzeRes = await invokeHandler(analyzeHandler, {
    uploadedFiles: [],
    udfTextContent: cleanedInput,
    wordTextContent: '',
  });

  if (analyzeRes.statusCode >= 400) {
    throw new Error(analyzeRes?.payload?.error || 'Analyze asamasi basarisiz oldu.');
  }

  const analysis = parseAnalyzePayload(analyzeRes.payload);
  const searchText = buildAgentDrivenSearchText(
    analysis.legalSearchPacket,
    analysis.summary,
    cleanedInput
  );

  const searchRes = await invokeHandler(searchHandler, {
    source: 'all',
    keyword: searchText,
    rawQuery: searchText,
    legalSearchPacket: analysis.legalSearchPacket,
    filters: {},
    searchMode: 'auto',
  });

  if (searchRes.statusCode >= 400) {
    throw new Error(searchRes?.payload?.error || 'Karar aramasi basarisiz oldu.');
  }

  const results = Array.isArray(searchRes?.payload?.results) ? searchRes.payload.results : [];
  const diagnostics = searchRes?.payload?.retrievalDiagnostics || {};

  console.log('\nAgent cikti ozeti');
  console.log(`- Search seed: ${analysis?.legalSearchPacket?.searchSeedText || '-'}`);
  console.log(`- Alan: ${analysis?.legalSearchPacket?.primaryDomain || '-'}`);
  console.log(`- Dava tipi: ${analysis?.legalSearchPacket?.caseType || '-'}`);
  console.log(`- Gonderilen arama: ${diagnostics?.searchPhrase || searchText || '-'}`);
  console.log(`- Arama kaynagi: ${diagnostics?.searchPhraseSource || '-'}`);
  console.log(`- Provider: ${diagnostics?.provider || diagnostics?.upstream || '-'}`);
  if (Array.isArray(analysis?.legalSearchPacket?.requiredConcepts) && analysis.legalSearchPacket.requiredConcepts.length > 0) {
    console.log(`- Zorunlu kavramlar: ${analysis.legalSearchPacket.requiredConcepts.join(', ')}`);
  }
  if (Array.isArray(analysis?.legalSearchPacket?.searchVariants) && analysis.legalSearchPacket.searchVariants.length > 0) {
    console.log('- Agent varyantlari:');
    analysis.legalSearchPacket.searchVariants.forEach((item, index) => {
      console.log(`  ${index + 1}. [${item?.mode || '-'}] ${item?.query || '-'}`);
    });
  }

  printTopResults(results);

  if (withDocs && results.length > 0) {
    await maybePrintDocuments(results);
  }

  return {
    analysis,
    searchText,
    diagnostics,
    results,
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const withDocs = args.includes('--docs');
  const inlineText = args.filter((item) => item !== '--docs').join(' ').trim();

  let inputText = inlineText;
  if (!inputText) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      inputText = (await rl.question('Metni gir: ')).trim();
    } finally {
      rl.close();
    }
  }

  await runAltAppAgentSearchConsole({
    inputText,
    withDocs,
  });
};

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryUrl && import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error('\nTest hatasi:', error?.message || error);
    process.exitCode = 1;
  });
}
