# Karar Arama Uyarlama Plani

## Durum Ozeti

- `doc/karararama.md` dogru hedefi tarif ediyor: `yargi-mcp` uzerinden karar arama, tam metin getirme, belge temelli arama ve chat entegrasyonu.
- Bu repo Next.js/Vercel degil; Vite + Express kullaniyor.
- Mevcut omurga zaten var:
  - `backend/legal/search-decisions.js`
  - `backend/legal/get-document.js`
  - `lib/legal/mcpLegalSearch.js`
  - `lib/legal/simpleBedestenService.js`
  - `src/utils/legalSearch.ts`
  - `src/components/LegalSearchPanel.tsx`
  - `src/pages/PrecedentSearch.tsx`
  - `src/components/AppMain.tsx`
- Bu nedenle entegrasyon sifirdan yeniden yazilmamali; mevcut contract ve fallback mimarisine uyarlanmalidir.

## Belgeye Gore Ana Karar

### Uygulanacak

- `yargi-mcp` tool tabanli arama ve dokuman getirme mantigi
- belge/metin temelli arama deneyimi
- ortak arama contract'i
- chat icinden hukuki arastirma tetikleme
- test ve smoke dogrulama sirasi

### Birebir Uygulanmayacak

- `app/api/.../route.ts` yapisi
- yeni ve ayrik `yargiMcpClient.ts` kopyasi
- mevcut lazy tam metin modelini bozacak eager top-5 full-text fetch
- mevcut `legalSearchPacket` / `aiSearchPlan` hattini bypass eden yeni analyzer contract'i

## Revize Fazlar

### Faz 1 - `documentAnalyzer` Katmani

- Yeni katman yalnizca belge/metin analizinden sorumlu olacak.
- Amaç:
  - dava konusu
  - hukuki mesele
  - muhtemel kaynak
  - court/daire ipuclari
  - arama ifadeleri
  - ilgili kanunlar
  - must kavramlar
- Bu faz bagimsiz tasarlanacak; mevcut backend route veya mevcut arama akislarini bozmayacak.
- Bu katmanin tek sorumlulugu analiz uretmek olacak; arama cagrisi yapmayacak.

### Faz 2 - `documentAnalyzer -> legalSearchPacket` Donusumu

- `documentAnalyzer` ciktisi yeni bir route contract'i dogurmayacak.
- Bunun yerine mevcut sistemin anladigi `legalSearchPacket` veya gerekirse `aiSearchPlan` formatina cevrilecek.
- Arama icin mevcut endpoint kullanilacak:
  - `/api/legal/search-decisions`
- Yeni route eklenmeyecek.
- Mevcut `backend/legal/search-decisions.js` ustune entegrasyon eklenecek.

### Faz 3 - `useLegalSearch` Hook

- Ortak frontend katmani olarak hafif bir hook eklenecek.
- Bu hook mevcut `src/utils/legalSearch.ts` uzerine kurulacak.
- Hook backend contract'ini degistirmeyecek.
- Hedef:
  - loading/error state ortaklasmasi
  - search + get document akisinin tek yerden kullanilmasi
  - `AppMain`, `LegalSearchPanel`, `PrecedentSearch` tekrarinin azaltilmasi

### Faz 4 - Chat Intent + Emsal Panel

- Chat intent akisi hook'u kullanacak.
- Ayrik yeni backend route yazilmayacak.
- Ayrik yeni MCP client yazilmayacak.
- Lazy full-text fetch korunacak.
- `EmsalPanel` sifirdan yeni backend contract istemeyecek; mevcut hook ve mevcut `legalSearch.ts` contract'i ile calisacak.

## Mimari Uyum Kurallari

- Yeni MCP client yazilmayacak; `lib/legal/mcpLegalSearch.js` merkezde kalacak.
- Yeni arama route'u yazilmayacak; `backend/legal/search-decisions.js` merkezde kalacak.
- Eager tam metin fetch yapilmayacak; mevcut lazy fetch + timeout tasarimi korunacak.
- Analyzer katmani arama katmanindan ayri tutulacak.

## Mimari Uyum Plani

### Faz 0 - Stabilizasyon Baslangici

- Mevcut Express endpoint'lerini resmi giris noktasi olarak koru:
  - `/api/legal/search-decisions`
  - `/api/legal/get-document`
- `lib/legal/mcpLegalSearch.js` dosyasini resmi `yargi-mcp` client katmani olarak kabul et.
- `lib/legal/simpleBedestenService.js` fallback ve HTTP-first guvenilirlik kati olarak korunmali.

### Faz 1A - Bagimsiz Analyzer

- `documentAnalyzer` icin bagimsiz modül ekle.
- Testler:
  - beklenen alanlar donuyor mu
  - bos/eksik cevapta guvenli fallback var mi
  - Gemini hata/429 durumunda bozulmadan donuyor mu

### Faz 1B - Analyzer Ciktisini Packet'e Cevirme

- `search-decisions` icinde belge analizinden gelen veriyi yeni ad-hoc shape yerine mevcut `legalSearchPacket` veya `aiSearchPlan` formatina normalize et.
- Gerekirse `mcpLegalSearch.js` icinde ic helper refactor yap, fakat ikinci bir MCP client olusturma.
- `get-document` contract'ini front-end toleransli alan isimleriyle koru:
  - `document`
  - `document.content`
  - `sourceUrl` / `documentUrl`
- Mevcut timeout ve abort davranisini bozma:
  - global 55s safety timeout korunacak
  - client-side timeout sonrasi retry patlamasi olmayacak

### Faz 2 - Ortak Frontend Arama Katmani

- Bu repoya uygun ortak hook yaz:
  - `src/hooks/useLegalSearch.ts` veya benzeri
- Hook, `src/utils/legalSearch.ts` ustune ince bir state sarmali olmali.
- Bu hook asagidaki yuzeylerde tekrarli orchestrasyonu azaltmali:
  - `src/components/LegalSearchPanel.tsx`
  - `src/pages/PrecedentSearch.tsx`
  - `src/components/AppMain.tsx`

### Faz 3 - Panel Stratejisi

- Ayrik yeni `EmsalPanel` sifirdan yazilmayacak.
- Mevcut iki yuzey arasinda rol dagilimi netlestirilecek:
  - `LegalSearchPanel`: hizli modal arama
  - `PrecedentSearch`: belge-temelli zengin arama ve teshis
- Ihtiyac varsa `PrecedentSearch` icindeki belge-analizi + grouped-results mantigi parcali reusable hale getirilecek.

### Faz 3 - Chat Entegrasyonu

- Yeni `legal_research_batch` mesaj tipi simdilik eklenmeyecek.
- En dusuk riskli yol:
  - chat intent tespiti
  - `AppMain.handleSendChatMessage` icinde `searchLegalDecisionsDetailed(...)` cagrisi
  - sonucari mevcut `legalSearchResults` state'ine merge etme
  - `precedentContext` uzerinden chat baglamina dogal akitma
- Normal chat akisi korunacak; sadece hukuki arastirma intent'inde ilave retrieval cagrisi yapilacak.

### Faz 4 - Panel / UI Uyarlamasi

- `LegalSearchPanel` ve/veya `PrecedentSearch` ortak hook'u kullanacak sekilde sadeleştirilecek.
- `EmsalPanel` gerekiyorsa mevcut panel mantigi uzerine kurulacak.
- Lazy full-text modal davranisi korunacak.

### Faz 5 - Test Kapatma

- Yeni testler asagidaki bosluklari hedeflemeli:
  - dogrudan `yargi-mcp` tool contract testi
  - analyzer output -> `legalSearchPacket` contract testi
  - UI modal cache davranisi
  - chat intent tetikleme ve normal akisin korunmasi
  - PDF upload -> search tetikleme

## Is Dagilimi

### Planner

- Belgeyi mevcut mimariye uyarlama kararlarini netlestirir
- acceptance criteria'yi repo-gercekleriyle esler
- rollout ve smoke sirasini olusturur

### Coder

- backend contract hizalama
- ortak frontend hook cikarma
- chat intent entegrasyonu
- hedefli test ekleme

### Reviewer

- fallback zincirinin bozulmadigini kontrol eder
- mevcut UI akislarinin regresyona girmedigini denetler
- eksik test ve residual riskleri siniflandirir

## Oncelikli Uygulama Sirasi

1. `documentAnalyzer` modülünü ekle ve izole testlerini yaz.
2. Analyzer ciktisini `legalSearchPacket` hattina bagla.
3. Ortak `useLegalSearch` hook'unu cikar.
4. `AppMain` icine chat intent tabanli retrieval ekle.
5. Panel/UI katmanini hook uzerinden birlestir.
6. UI regression testlerini ekle.
7. `/emsal-karar-test` ile manuel smoke kos.
8. Remote ortam hazirsa live smoke ve rapor scriptlerini kos.

## Dogrulama Sonuclari

Asagidaki test gruplari calistirildi ve gecti:

- `tests/simpleBedestenService.test.ts`
- `tests/legalGetDocumentHandler.test.ts`
- `tests/legalSearchProFallback.test.ts`
- `tests/searchDecisionsSourceRouting.test.ts`
- `tests/queryExpansion.test.ts`
- `tests/legalSearchSkill.test.ts`
- `tests/domainInferenceFallback.test.ts`
- `tests/legalSemantic.test.ts`
- `tests/legalSearchClientRetry.test.ts`

Toplam:

- 9 test dosyasi
- 78 test
- hepsi gecti

## Acik Riskler

- UI/chat acceptance criteria icin otomatik test kapsami zayif.
- Dogrudan `search_bedesten_unified` / `get_bedesten_document_markdown` arguman ve parse sozlesmesini kilitleyen test yok.
- Calisma agaci kirli; ozellikle `backend/legal/*` ve `lib/legal/*` degisiklikleri ezilmeden ilerlenmeli.
- Eager tam metin modeli kullanilmamali; lazy fetch korunmali.

## Tamamlanma Kriteri

Asagidaki maddeler birlikte saglandiginda entegrasyon guvenli sekilde ayaga kalkmis sayilacak:

- backend contract mevcut endpoint'lerle calisiyor
- `documentAnalyzer` ciktisi mevcut `legalSearchPacket` formatina guvenli cevriliyor
- ortak frontend retrieval hook'u tekrarli mantigi azaltiyor
- chat intent hukuki arastirmayi tetikliyor
- mevcut fallback zinciri bozulmuyor
- hedefli backend testleri ve yeni UI/chat testleri yesil
- `/emsal-karar-test` smoke senaryolari manuel olarak dogrulaniyor
