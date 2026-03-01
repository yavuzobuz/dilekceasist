# Ajan Takimi Detayli Teknik Analiz Raporu

Tarih: 2026-03-01  
Proje: `dilekceasist`  
Hazirlayan: Codex (multi-agent analiz modeli)

## 1) Ajan Takimi ve Gorev Dagilimi

| Ajan | Sorumluluk | Cikti |
|---|---|---|
| Ajan-1 Mimari | Klasor yapisi, backend topolojisi, kod tekrar analizi | Mimari risk listesi + sadeletirme plani |
| Ajan-2 Guvenlik | AuthN/AuthZ, CORS, service role key kullanimi, endpoint sertlestirme | P0 guvenlik bulgulari + aksiyon listesi |
| Ajan-3 Kalite | Build/test durumu, test kapsami, kalite kapilari | Kirmizi testler + kalite gate plani |
| Ajan-4 Uygulama Akisi | UI akislari, legal search akisi, modal/veri akisi, dead-code | Bug/regresyon bulgulari + refactor onceligi |
| Ajan-5 Operasyon | Script/CI/CD hazirligi, dogrulama adimlari, release riski | CI kontrol listesi + rollout plani |

## 2) Analiz Yontemi

Calistirilan kontroller:

- `npm run build` (escalated) -> basarili, fakat buyuk bundle uyarisi var.
- `npm run test:run` (escalated) -> 1 test dosyasi, 7 testten 1'i fail.
- Buyuk dosya ve kod kokusu taramasi (`rg`, satir sayisi, endpoint karsilastirmasi).
- API endpoint guvenlik ve yetki kontrolu incelemesi.

## 3) Ozet Sonuc

- **P0 (kritik) guvenlik aciklari mevcut**: admin ve duyuru endpointleri backendde korunmuyor.
- **Mimari ayrisma var**: `server.js` ile `api/*` ayni isi farkli yapiyor, davranis drift riski yuksek.
- **Kalite kapisi zayif**: test sayisi cok dusuk, bir test fail, lint/typecheck scripti yok.
- **Bakim maliyeti yuksek**: 1000+ satirlik birden fazla dosya, duplicate parse/search kodlari mevcut.

## 4) Bulgular (Oncelik Sirali)

## P0-1: Admin ve Announcement endpointleri yetkisiz erisime acik

- Kanit:
  - `server.js:2938` `GET /api/admin-users`
  - `server.js:3068` `POST /api/announcements`
  - `server.js:3105` `PUT /api/announcements`
  - `server.js:3136` `DELETE /api/announcements`
  - `api/admin-users.js:1` ve `api/announcements.js:1` (serverless varyantlari da auth'suz)
- Etki:
  - Yetkisiz kullanici user listesi cekebilir.
  - Announcement CRUD islemleri public olarak cagrilabilir.
  - Supabase service role key ile calisan endpointler kritik veri degisimi yapar.
- Oneri:
  - Tum admin endpointlerine zorunlu auth middleware + role kontrolu (`admin` claim).
  - Service-role endpointlerini internal-only hale getir veya signed server-to-server token zorunlulugu getir.
  - API seviyesinde audit log + IP bazli rate limit ekle.

## P0-2: Service role key fallback modeli riskli

- Kanit:
  - `server.js:2941`, `server.js:3071` -> `SUPABASE_SERVICE_ROLE_KEY || VITE_SUPABASE_SERVICE_ROLE_KEY`
  - `api/admin-users.js:19`, `api/announcements.js:15` benzer pattern.
- Etki:
  - `VITE_*` namespace kullanimi operational olarak key yonetim hatasina acik.
  - Yanlis env konfigde gizli keylerin istemciye tasinmasi riski artar.
- Oneri:
  - Service role key icin sadece `SUPABASE_SERVICE_ROLE_KEY` kullan.
  - `VITE_*` fallbacklerini kaldir.
  - Key rotasyonu + secret scan pipeline zorunlu hale getir.

## P1-1: Backend topolojisi ikiye bolunmus ve drift riski yuksek

- Kanit:
  - `server.js` icinde tam API seti var.
  - `api/gemini/*`, `api/legal/index.js`, `api/templates.js` ile ayni domenler serverless tarafinda tekrar yazilmis.
  - Model farklari:
    - `config.js:6` -> `gemini-3.1-pro-preview`
    - `api/gemini/analyze.js:4` -> `gemini-3-pro-preview`
    - `api/legal/index.js:4` -> `gemini-2.5-pro`
- Etki:
  - Dev/prod davranisi ortami gore farkli olabilir.
  - Hata ayiklama ve regression tespiti zorlasir.
- Oneri:
  - Tek kaynak backend stratejisi belirle (`Express` veya `serverless`, ikisi birden degil).
  - Ortak servis katmani olustur (tek logic, farkli adapter).
  - Model secimini tek config kaynagindan enjekte et.

## P1-2: Test suiti kirmizi (1 fail) ve beklenti eski endpointe bagli

- Kanit:
  - `tests/geminiService.test.ts:44-46` beklenen URL: `http://localhost:3001/api/gemini/analyze`
  - Gercek servis: `services/geminiService.ts:3` ve `:39` -> `/api/gemini/analyze`
- Etki:
  - CI'da kirmizi pipeline.
  - Mevcut kod ile test bekentisi uyumsuz.
- Oneri:
  - Testi yeni base path'e uyarlayip mock beklentisini guncelle.
  - API base URL'i env-driven hale getirip testte deterministic inject et.

## P1-3: Dead code mevcut (ulasilamaz blok)

- Kanit:
  - `src/components/AppMain.tsx:335` erken `return`.
  - `src/components/AppMain.tsx:337-363` sonraki fetch blogu ulasilamaz.
- Etki:
  - Bakim zorlugu, yanlis guven hissi, kod okunurlugunun dusmesi.
- Oneri:
  - Ulasilamaz blogu kaldir.
  - Tek legal arama yolu (`searchLegalDecisions`) uzerinde standardize et.

## P1-4: Encoding/Mojibake bozulmasi genis alana yayilmis

- Kanit:
  - `server.js` boyunca cok sayida bozuk karakterli string (ornek: `server.js:75`, `server.js:93`, `server.js:1356`).
  - Test ve servis dosyalarinda da benzer bozulmalar.
- Etki:
  - Prompt kalitesi duser, UI metinleri bozulur, hukuki metin kalitesi etkilenir.
- Oneri:
  - Tum kaynaklari UTF-8 standardina normalize et.
  - Pre-commit encoding kontrolu ekle.
  - Metin varliklarini ayrik locale dosyalarina tasi.

## P1-5: API CORS ve auth politikasi tutarsiz

- Kanit:
  - `server.js:29-49` kisitli origin politikasi var.
  - `api/legal/index.js:188` ve bircok `api/*` dosyasinda `Access-Control-Allow-Origin: *`.
- Etki:
  - Ortama gore farkli guvenlik seviyesi.
  - Public endpoint suistimali riski.
- Oneri:
  - Ortak CORS policy modulune gec.
  - Her endpointte zorunlu auth patterni uygula.

## P2-1: Dosya boyutlari yuksek, modulerlik dusuk

- Kanit:
  - `src/pages/AlternativeApp.tsx` ~1610 satir
  - `src/pages/Profile.tsx` ~1330 satir
  - `src/pages/TemplatesPage.tsx` ~1122 satir
  - `server.js` ~2743 satir
- Etki:
  - Refactor/migration maliyeti yuksek.
  - Lokal degisikliklerin regressiona donusme ihtimali artar.
- Oneri:
  - Feature bazli bolme: `hooks/`, `services/`, `sections/` ayir.
  - 300-400 satir ustu dosyalar icin parcali component/pipeline hedefi koy.

## P2-2: Legal search normalize/parsing logic tekrarli

- Kanit:
  - `src/pages/AlternativeApp.tsx:63` `normalizeLegalSearchResults`
  - `src/utils/legalSearch.ts:53` benzer `normalizeLegalSearchResults`
  - `extractResultsFromText` iki yerde tekrar.
- Etki:
  - Davranis farki ve bug ihtimali artar.
- Oneri:
  - Tek parse/normalize kaynagina in.
  - UI sadece util katmanini kullansin.

## P2-3: Klasor koklerinde karisik import yapisi

- Kanit:
  - `AppRouter.tsx:3` -> `./components/...`
  - `AppRouter.tsx:4-20` -> `./src/...`
- Etki:
  - Kod haritasi zorlasir, yeni gelisen ekipte onboard maliyeti artar.
- Oneri:
  - Tek source root (`src`) standardi.
  - `components/` (root) kalanlari `src/components/` altina tasiyip importlari normalize et.

## 5) Aksiyon Backlogu (Ajan Bazli)

## Sprint-0 (Acil / 1-2 gun)

1. [Ajan-2] Admin + announcement endpointlerine zorunlu auth/role guard ekle.
2. [Ajan-2] `VITE_SUPABASE_SERVICE_ROLE_KEY` fallbackini kaldir.
3. [Ajan-3] Kirmizi testi duzelt (`tests/geminiService.test.ts`).

## Sprint-1 (Kisa vade / 3-5 gun)

1. [Ajan-1] `server.js` vs `api/*` backend stratejisini birlestir.
2. [Ajan-4] `AppMain` dead code temizligi ve legal search tek yol.
3. [Ajan-3] `lint` + `typecheck` scriptleri ekle, pre-push gate yap.

## Sprint-2 (Orta vade / 1-2 hafta)

1. [Ajan-4] `AlternativeApp`, `Profile`, `TemplatesPage` dosya bolme.
2. [Ajan-1] Ortak i18n/locale metin katmani ile encoding temizligi.
3. [Ajan-5] CI pipeline: build + test + security checks + secret scan.

## 6) Basari Kriterleri (Definition of Done)

- Admin endpointleri auth'suz cagirilamiyor.
- Service role key sadece server-secret env ile kullaniliyor.
- Test suiti yesil (`npm run test:run`).
- Tek backend execution path net (veya adapter katmani ile tek business logic).
- `AppMain` icinde ulasilamaz kod kalmadi.
- Mojibake metinler temizlendi, UTF-8 standardi enforce edildi.

## 7) Ek Notlar

- Build su an basarili, ancak chunk boyutu uyarisi var (bundle optimizasyonu gerekli).
- Test kapsami su an yalnizca `tests/geminiService.test.ts` ile sinirli (kritik akislar testlenmiyor).
