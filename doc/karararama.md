Yol Haritası — yargi-mcp HTTP Entegrasyonu
Genel Mimari
DilekçeAsist (Next.js/Vercel)
        ↓
app/api/legal/search/route.ts    ← tek proxy endpoint
        ↓
https://yargimcp.fastmcp.app/mcp ← yargi-mcp remote
        ↓
Bedesten + UYAP + AYM + KİK...

Dosya Yapısı
lib/legal/
  yargiMcpClient.ts      ← HTTP client (tüm tool çağrıları)
  documentAnalyzer.ts    ← Gemini belge analizi
  decisionReranker.ts    ← Gemini re-rank

app/api/legal/
  search/route.ts        ← arama proxy
  document/route.ts      ← tam metin proxy

components/
  EmsalPanel/
    index.tsx            ← ayrı emsal arama paneli
    DecisionCard.tsx     ← karar kartı
    DecisionModal.tsx    ← tam metin modal

hooks/
  useLegalSearch.ts      ← chat + panel için ortak hook

Adım 1 — yargi-mcp HTTP Client
lib/legal/yargiMcpClient.ts
Bu dosya tüm yargi-mcp tool çağrılarını yapar. Codex bu dosyayı yazarken şu tool'ları implemente etsin:
Tool 1: search_bedesten_unified
En önemli tool. Yargıtay + Danıştay + Yerel + İstinaf + KYB hepsini kapsar.
typescriptinterface BedestenSearchParams {
  phrase: string;          // Arama ifadesi
                           // Normal:  "tahliye kira"
                           // Exact:   "\"tahliye kira\""  (tırnak içi exact match)
                           // Zorunlu: "+tahliye +kira"   (her ikisi zorunlu)
                           // Hariç:   "tahliye -ceza"    (ceza olmasın)
                           // OR:      "tahliye OR kira"

  court_types?: string[];  // Filtre — boş bırakılırsa hepsi
                           // "YARGITAYKARARI" → Yargıtay
                           // "DANISTAYKARAR"  → Danıştay
                           // "YERELHUKUK"     → Asliye/Sulh
                           // "ISTINAFHUKUK"   → Bölge Adliye
                           // "KYB"            → Kanun Yararına Bozma

  birimAdi?: string;       // Daire filtresi — TAM AD yazılmalı
                           // Yargıtay Hukuk:
                           //   "1. Hukuk Dairesi" ... "23. Hukuk Dairesi"
                           //   "Hukuk Genel Kurulu"
                           // Yargıtay Ceza:
                           //   "1. Ceza Dairesi" ... "23. Ceza Dairesi"
                           //   "Ceza Genel Kurulu"
                           // Danıştay:
                           //   "1. Daire" ... "17. Daire"
                           //   "İdari Dava Daireleri Kurulu"
                           //   "Vergi Dava Daireleri Kurulu"

  kararTarihiStart?: string; // ISO 8601: "2020-01-01T00:00:00.000Z"
  kararTarihiEnd?: string;   // ISO 8601: "2024-12-31T23:59:59.000Z"

  pageSize?: number;       // Default: 10, Max: 50
  page?: number;           // Default: 1
}

interface BedestenDecision {
  documentId: string;      // Örn: "1123588300"
  birimAdi: string;        // "3. Hukuk Dairesi"
  esasNo: string;          // "2023/6459"
  kararNo: string;         // "2024/7158"
  kararTarihiStr: string;  // "26.12.2024"
  kararTarihi: string;     // ISO tarihi
  itemType: {
    name: string;          // "YARGITAYKARARI"
    description: string;   // "Yargıtay Kararı"
  };
}
Tool 2: get_bedesten_document_markdown
Tam metin çekme.
typescript// Parametre: { documentId: string }
// Dönüş: { markdownContent: string, sourceUrl: string }
// sourceUrl: "https://mevzuat.adalet.gov.tr/ictihat/1123588300"
Tool 3: search_emsal_detailed_decisions
UYAP emsal kararları.
typescriptinterface EmsalSearchParams {
  keyword: string;
  birimAdi?: string;
  esasYili?: string;    // "2023"
  kararYili?: string;   // "2024"
  pageSize?: number;
}
Tool 4: search_anayasa_unified
AYM kararları.
typescriptinterface AnayasaSearchParams {
  decision_type: "norm_denetimi" | "bireysel_basvuru";
  keywords_all?: string;   // Tüm bu kelimeler geçmeli
  keywords_any?: string;   // Biri geçmeli
  start_date?: string;     // "DD/MM/YYYY"
  end_date?: string;
}
Tool 5: get_anayasa_document_unified
AYM tam metin — sayfalı (her sayfa ~5000 karakter).
typescript// Parametre: { document_url: string, page_number: number }

HTTP çağrı kodu:
typescriptconst YARGI_MCP_URL = 'https://yargimcp.fastmcp.app/mcp';

async function callYargiMcp(toolName: string, args: object) {
  const res = await fetch(YARGI_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now()
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));

  // MCP response → içerik çıkar
  const textBlock = data.result?.content?.find((c: any) => c.type === 'text');
  if (!textBlock) return null;

  try { return JSON.parse(textBlock.text); }
  catch { return textBlock.text; }
}

Adım 2 — Gemini Belge Analizi
lib/legal/documentAnalyzer.ts
Kullanıcının metninden arama parametrelerini otomatik çıkarır.
typescriptconst ANALIZ_PROMPT = `
Sen deneyimli bir Türk hukuk asistanısın.
Aşağıdaki metni analiz et ve Yargıtay/Danıştay kararı aramak için
parametreleri çıkar.

METİN:
"""
{{METIN}}
"""

KURALLAR:
1. Sadece bu metinle ilgili kavramlar — başka dava tipi kavramı yazma
2. Bedesten'e gönderilecek phrase'ler 2-5 kelime olsun
3. Operatör kullanma (+, ", AND) — sadece düz kelimeler
4. Kanun maddesi formatı: "TBK 315", "İİK 67", "TCK 188"
5. Daire tam adını yaz: "3. Hukuk Dairesi" (kısa kod değil)

DAİRE SEÇİM REHBERİ:
Tapu/mülkiyet → "1. Hukuk Dairesi", court: YARGITAYKARARI
Kira/taşınmaz → "3. Hukuk Dairesi", court: YARGITAYKARARI
Borç/tazminat → "3. Hukuk Dairesi", court: YARGITAYKARARI
Aile/boşanma  → "2. Hukuk Dairesi", court: YARGITAYKARARI
Miras         → "1. Hukuk Dairesi", court: YARGITAYKARARI
İş hukuku     → "9. Hukuk Dairesi", court: YARGITAYKARARI
İş kazası     → "10. Hukuk Dairesi", court: YARGITAYKARARI
Ticaret       → "11. Hukuk Dairesi", court: YARGITAYKARARI
İcra/iflas    → "12. Hukuk Dairesi", court: YARGITAYKARARI
Tüketici      → "17. Hukuk Dairesi", court: YARGITAYKARARI
Uyuşturucu ticaret → "10. Ceza Dairesi", court: YARGITAYKARARI
Uyuşturucu kullanma → "8. Ceza Dairesi", court: YARGITAYKARARI
Dolandırıcılık → "8. Ceza Dairesi", court: YARGITAYKARARI
İmar/ruhsat   → "6. Daire", court: DANISTAYKARAR
Vergi/KDV     → "3. Daire", court: DANISTAYKARAR
Kamu personeli → "2. Daire", court: DANISTAYKARAR
Temel hak ihlali → AYM bireysel_basvuru

YANIT — sadece JSON:
{
  "davaKonusu": "kısa dava konusu",
  "hukukiMesele": "temel hukuki problem bir cümle",
  "kaynak": "bedesten" | "emsal" | "anayasa",
  "courtTypes": ["YARGITAYKARARI"],
  "birimAdi": "3. Hukuk Dairesi",
  "aramaIfadeleri": [
    "kira temerrüt tahliye",
    "kiracı kira ödememesi",
    "TBK 315 ihtarname",
    "mecur tahliye temerrüt",
    "kira bedeli ödenmemesi tahliye"
  ],
  "ilgiliKanunlar": ["TBK 315", "TBK 350"],
  "mustKavramlar": ["tahliye", "temerrüt", "kira"]
}
`;

Adım 3 — API Routes
app/api/legal/search/route.ts
typescriptexport async function POST(req: NextRequest) {
  const { text, documentBase64, mimeType, manualParams } = await req.json();

  // 1. Analiz — metin veya manuel parametre
  let analysis;
  if (manualParams) {
    analysis = manualParams; // Kullanıcı kendisi parametre girdiyse
  } else {
    const docText = text || await extractTextFromPDF(documentBase64, mimeType);
    analysis = await analyzeDocument(docText);
  }

  // 2. Paralel arama — tüm varyantları aynı anda at
  const searchPromises = analysis.aramaIfadeleri
    .slice(0, 5)
    .map((phrase: string) =>
      callYargiMcp('search_bedesten_unified', {
        phrase,
        court_types: analysis.courtTypes,
        birimAdi: analysis.birimAdi,
        pageSize: 20,
      }).catch(() => null)
    );

  const results = await Promise.all(searchPromises);

  // 3. Deduplicate
  const seen = new Set<string>();
  const allDecisions = results
    .flatMap(r => r?.decisions || [])
    .filter(d => {
      if (seen.has(d.documentId)) return false;
      seen.add(d.documentId);
      return true;
    });

  // 4. Gemini re-rank
  const top5 = await rerankDecisions(allDecisions, analysis);

  // 5. Top 5'in tam metnini çek — paralel, max 5
  const withFullText = await Promise.all(
    top5.map(async (d: any) => {
      try {
        const doc = await callYargiMcp('get_bedesten_document_markdown', {
          documentId: d.documentId
        });
        return {
          ...d,
          fullText: doc?.markdownContent || '',
          sourceUrl: `https://mevzuat.adalet.gov.tr/ictihat/${d.documentId}`
        };
      } catch {
        return { ...d, fullText: '', sourceUrl: '' };
      }
    })
  );

  return NextResponse.json({
    analysis,
    decisions: withFullText,
    totalFound: allDecisions.length
  });
}
app/api/legal/document/route.ts
typescript// Lazy tam metin çekme — modal açılınca çağrılır
export async function POST(req: NextRequest) {
  const { documentId } = await req.json();

  const doc = await callYargiMcp('get_bedesten_document_markdown', { documentId });

  return NextResponse.json({
    documentId,
    fullText: doc?.markdownContent || '',
    sourceUrl: `https://mevzuat.adalet.gov.tr/ictihat/${documentId}`
  });
}

Adım 4 — Ortak Hook
hooks/useLegalSearch.ts
Hem chat hem panel bu hook'u kullanır — kod tekrarı yok.
typescriptexport const useLegalSearch = () => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState(null);

  // Metin veya belgeyle arama
  const search = async (params: {
    text?: string;
    documentBase64?: string;
    mimeType?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/legal/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      setAnalysis(data.analysis);
      setDecisions(data.decisions);
      return data;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Lazy tam metin çek
  const fetchFullText = async (documentId: string) => {
    const res = await fetch('/api/legal/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId })
    });
    const data = await res.json();
    return data.fullText;
  };

  return { search, fetchFullText, loading, analysis, decisions, error };
};

Adım 5 — Ayrı Emsal Panel
components/EmsalPanel/index.tsx
tsx'use client';
export default function EmsalPanel() {
  const { search, fetchFullText, loading, analysis, decisions } = useLegalSearch();
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullTextCache, setFullTextCache] = useState<Record<string, string>>({});

  const handleSearch = () => search({ text });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    search({ documentBase64: base64, mimeType: file.type });
  };

  const handleOpenModal = async (documentId: string) => {
    setSelectedId(documentId);
    if (!fullTextCache[documentId]) {
      const text = await fetchFullText(documentId);
      setFullTextCache(prev => ({ ...prev, [documentId]: text }));
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Emsal Karar Ara</h2>

      {/* Giriş alanı */}
      <textarea
        className="w-full h-40 border rounded p-2 text-sm mb-2"
        placeholder="Dilekçe metnini veya dava özetini yapıştırın..."
        value={text}
        onChange={e => setText(e.target.value)}
      />

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleSearch}
          disabled={loading || !text}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? 'Aranıyor...' : 'Emsal Ara'}
        </button>
        <label className="px-4 py-2 bg-gray-100 border rounded cursor-pointer text-sm">
          PDF / Word Yükle
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Analiz özeti */}
      {analysis && (
        <div className="mb-4 p-3 bg-blue-50 rounded text-sm border border-blue-100">
          <p><strong>Dava:</strong> {analysis.hukukiMesele}</p>
          <p><strong>Daire:</strong> {analysis.birimAdi}</p>
          <p><strong>Kanunlar:</strong> {analysis.ilgiliKanunlar?.join(', ')}</p>
          <p className="text-gray-400 text-xs mt-1">
            {decisions.length} karar bulundu
          </p>
        </div>
      )}

      {/* Karar kartları */}
      {decisions.map((d: any, i: number) => (
        <div key={d.documentId} className="mb-3 p-3 border rounded hover:border-blue-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-sm">
                {i + 1}. {d.birimAdi}
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                {d.esasNo} • {d.kararTarihiStr}
              </p>
            </div>
            <div className="flex gap-2">
              
                href={d.sourceUrl}
                target="_blank"
                className="text-xs px-2 py-1 bg-gray-50 border rounded text-gray-600"
              >
                Kaynak ↗
              </a>
              <button
                onClick={() => handleOpenModal(d.documentId)}
                className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 rounded text-blue-700"
              >
                Tam Metin
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Tam metin modal */}
      {selectedId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold">
                {decisions.find((d: any) => d.documentId === selectedId)?.birimAdi}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(fullTextCache[selectedId] || '');
                  }}
                  className="text-sm px-3 py-1 bg-gray-100 rounded"
                >
                  Kopyala
                </button>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-sm px-3 py-1 bg-red-50 text-red-600 rounded"
                >
                  Kapat
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {fullTextCache[selectedId] ? (
                <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                  {fullTextCache[selectedId]}
                </pre>
              ) : (
                <p className="text-center text-gray-400 py-8">Yükleniyor...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Adım 6 — Chat Entegrasyonu
Chat'te "emsal ara", "derin araştır" gibi ifade gelince mevcut chat akışına hook:
lib/legal/chatLegalIntent.ts
typescript// Chat mesajında hukuki araştırma niyeti var mı?
const LEGAL_INTENT_PATTERNS = [
  /emsal\s*(ara|bul|getir)/i,
  /içtihat\s*(ara|bul)/i,
  /karar\s*(ara|bul)/i,
  /derin\s*araştır/i,
  /detaylı\s*araştır/i,
  /yargıtay.*karar/i,
  /danıştay.*karar/i,
];

export const detectLegalIntent = (message: string): boolean => {
  return LEGAL_INTENT_PATTERNS.some(p => p.test(message));
};

// Chat mesajından arama parametresi çıkar
export const extractSearchTextFromChat = (
  message: string,
  conversationContext: string
): string => {
  // Conversation context + son mesaj → Gemini'ye ver → arama metni üret
  return conversationContext + '\n' + message;
};
Chat akışına ekleme (ChatPage.tsx):
typescript// Mesaj gönderilmeden önce:
if (detectLegalIntent(userMessage)) {
  const legalResults = await fetch('/api/legal/search', {
    method: 'POST',
    body: JSON.stringify({ text: userMessage + ' ' + petitionContext })
  });
  const data = await legalResults.json();

  // Chat'e research batch mesajı ekle
  addMessage({
    messageType: 'legal_research_batch',
    researchBatch: {
      batchId: Date.now().toString(),
      query: userMessage,
      decisions: data.decisions,
      analysis: data.analysis
    }
  });
  return; // Normal LLM akışına gitme
}
```

---

## Codex'e Verilecek İş Sırası
```
1. lib/legal/yargiMcpClient.ts     → HTTP client
2. lib/legal/documentAnalyzer.ts   → Gemini analiz
3. app/api/legal/search/route.ts   → arama proxy
4. app/api/legal/document/route.ts → tam metin proxy
5. hooks/useLegalSearch.ts         → ortak hook
6. components/EmsalPanel/index.tsx → ayrı panel
7. lib/legal/chatLegalIntent.ts    → chat entegrasyonu
8. ChatPage.tsx patch              → chat akışına ekle
```

Her adımda test yaz, bir sonrakine geç.

---

## Acceptance Criteria
```
1. yargiMcpClient.ts:
   - search_bedesten_unified çalışıyor
   - get_bedesten_document_markdown çalışıyor
   - Timeout 30s, graceful error

2. documentAnalyzer.ts:
   - "kiracı kira ödemiyor" → H3 + TBK 315 + doğru varyantlar
   - Gemini 429 → fallback (boş analiz, hata mesajı)

3. API route:
   - 5 varyant paralel atılıyor
   - Deduplicate çalışıyor
   - Top 5 tam metin geliyor
   - Timeout 45s

4. EmsalPanel:
   - Metin girince arama çalışıyor
   - PDF yükleyince arama çalışıyor
   - Tam metin modalda açılıyor
   - İkinci açılışta cache'den geliyor
   - Kaynak linkine tıklanabiliyor

5. Chat:
   - "emsal ara" → research batch tetikliyor
   - Normal mesaj → eski akış korunuyor

6. Tüm mevcut testler yeşil