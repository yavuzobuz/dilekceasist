# Word Add-in Entegrasyon Plani (Copy-Paste'siz AI Duzenleme)

## 1) Hedef
- Word icinde secili metni panelden tek tikla AI ile:
  - `fix`: dil/imla duzeltme
  - `strengthen`: hukuki uslup guclendirme
  - `rewrite`: profesyonel yeniden yazim
- Ciktiyi panoda gostermek ve opsiyonel olarak secime otomatik geri yazmak.
- Kullanicinin metni disariya kopyalamadan akisi tamamlamasi.

## 2) Kapsam (MVP -> V2)

### MVP (bu iterasyonda baslatildi)
- Word taskpane iskeleti (`public/office/word/*`)
- Secili metin oku + AI endpoint cagir + secime geri yaz
- Backend `rewrite` endpointinde mode destegi
- Manifest taslagi ve kurulum notlari

### V2
- Track Changes ile degisiklik isaretleme
- Belirli paragraf/selection chunk'lama ve uzun metin akisi
- Prompt presetleri (kisa, agresif, sade, mahkeme dili)
- Kullanici ayarlari (varsayilan mode, auto replace, custom API URL)
- Audit log (kim, ne zaman, hangi mode)

### V3
- Kurum ici kimlik dogrulama (SSO) ve rol bazli politika
- Belge tipine gore uzman prompt secimi
- Redaksiyon/PII maskesi ve veri guvenligi kontrolleri

## 3) Mimari

### UI katmani (Word Taskpane)
- `Office.onReady` ile host kontrolu
- `Word.run` ile:
  - `getSelection().load('text')` -> secili metin al
  - `insertText(..., Word.InsertLocation.replace)` -> sonucu geri yaz
- API cagrisi: `POST /api/gemini/rewrite` body:
  - `textToRewrite: string`
  - `mode: "fix" | "strengthen" | "rewrite"`

### API katmani
- Endpoint: `POST /api/gemini/rewrite`
- Input dogrulama:
  - bos metin kontrolu
  - uzunluk limiti (20k)
- Mode bazli sistem talimati
- Cikti: `{ text, mode }`

### Dagitim
- Taskpane dosyalari web uygulamasinda `public/office/word`
- Manifestte `SourceLocation` olarak yayinlanan HTTPS adresi
- Sideload: Word > My Add-ins > Upload My Add-in

## 4) Guvenlik ve Uyum Notlari
- Uretimde sadece HTTPS `SourceLocation` kullan.
- `SERVER_API_KEY` aktifse panelde `x-api-key` alani ile gecis.
- V2'de zorunlu:
  - metin loglama politikasini kapatmak/maskelemek
  - denetim izi ve veri saklama suresi

## 5) Kabul Kriterleri
- Word seciminden metin panelde gorunmeli.
- Uc moddan herhangi biri secildiginde API sonucu donmeli.
- Auto-replace aciksa sonuc secime otomatik yazilmali.
- Auto-replace kapaliysa manuel "Secime Uygula" ile yazilmali.
- Hata durumlari panelde okunabilir metinle gorunmeli.

## 6) Test Stratejisi
- Teknik test:
  - endpoint input validation
  - mode fallback (`unknown` -> `rewrite`)
  - bos output handling
- Manuel test:
  - Word Desktop + Word Web
  - kisa, orta, uzun secim metinleri
  - API 4xx/5xx hata senaryolari

## 7) Sonraki Gelistirme Dilimi (onerilen)
1. Track Changes destegiyle "onerilen duzeltme" modu
2. Uzun metinler icin chunk + birlestirme
3. Kurumsal auth + rol politikasi
