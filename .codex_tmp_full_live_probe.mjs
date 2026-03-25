import handler from './backend/legal/search-decisions.js';
const rawQuery = 'uyusmazlik dosyasi icinde davaci ile davali arasindaki uyusmazlikta olaylar daginik sekilde anlatilmistir. gecersiz nedenle feshedilen is sozlesmesi nedeniyle ise iade, bos gecen sure ucreti ve ise baslatmama tazminati talebi. uyusmazlik dosyasi kapsaminda beyanlar, kayitlar ve mevcut evrak bir arada degerlendirilmekte olup mesele ayni hukuki cekirdekte toplanmaktadir. Bu nedenle ayni hukuki cekirdegi tasiyan emsal kararlarin taranmasi talep edilmektedir.';
const req = { method: 'POST', headers: { origin: 'http://localhost:5173' }, body: { source: 'all', rawQuery, keyword: rawQuery.split(/[.,;:]/)[0].trim().slice(0, 140), filters: { topK: 5 } } };
const res = { statusCode: 200, payload: null, status(code){ this.statusCode = code; return this; }, json(data){ this.payload = data; return this; }, end(){ return this; }, setHeader(){} };
await handler(req, res);
const payload = res.payload || {};
const results = Array.isArray(payload.results) ? payload.results.slice(0, 5) : [];
console.log(JSON.stringify({
  statusCode: res.statusCode,
  planDiagnostics: payload.planDiagnostics,
  aiSearchPlan: payload.aiSearchPlan,
  retrievalDiagnostics: payload.retrievalDiagnostics,
  topResults: results.map((item, index) => ({
    index: index + 1,
    source: item?.source,
    title: item?.title,
    daire: item?.daire,
    mahkeme: item?.mahkeme,
    matchedKeywordCount: item?.matchedKeywordCount,
    semanticScore: item?.semanticScore,
  })),
}, null, 2));
