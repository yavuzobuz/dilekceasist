# Proje Rakip Analizi - AI ile Dilekce Ureten Turk Rakipleri
Tarih: 3 Mart 2026 (03.03.2026)

Not: Bu revizyon, 03.03.2026 tarihinde Word eklentisi + alt-app chatbot entegrasyonu sonrasi yeniden puanlama icin guncellendi.

## 1) Kapsam
- Yalnizca AI ile dilekce/belge uretimi iddiasi olan ve Turkiye odak sinyali gosteren urunler dahil edildi.
- "Turkiye odak" sinyali olarak Turkce urun dili, .tr/.com.tr alanlari, UYAP/UDF vurgusu, Turk hukuk surecine yonelik icerik dikkate alindi.
- Veriler sirketlerin acik web sayfalari ve public listeleme kaynaklarindan derlendi.

## 2) Dogrudan Rakipler (AI Dilekce Uretimi)
| Rakip | Odak | Kanit sinyali (kisa) | Guven |
|---|---|---|---|
| AyLex | AI hukuk asistani | Otomatik dilekce yazimi ve belge odakli hukuk AI konumlandirmasi | Yuksek |
| Adli Hafiza | AI hukuk platformu | Adli bilisim + hukuk AI konumlandirmasi, yerli platform mesaji | Orta-Yuksek |
| Apilex | AI avukat asistani | Dilekce yazimi + UDF/UYAP akisi odakli urun mesaji | Yuksek |
| LawChat | AI hukuk sistemi | Profesyonel dilekce uretimi, karar atiflari ve UDF cikti vurgusu | Yuksek |
| De Jure AI | Hukukcular icin AI | Dilekce yazdirma, UYAP/UETS entegrasyonu ve dilekce asistani modulleri | Yuksek |
| Lextum AI | AI hukuk asistani | Dilekce/savunma/sozlesme olusturma ozelligi acik belirtiliyor | Yuksek |
| Lexform AI | Hukuk otomasyonu | Dava dilekcesi dahil belge uretim odagi | Yuksek |
| Lavren | AI dilekce asistani | Dilekce olusturucu mesaji ve hukuki surece odak | Yuksek |
| EvrakAI | Belge + dilekce AI | Dakikalar icinde dilekce/evrak uretimi mesaji | Yuksek |
| HukTeb | Avukat AI destek platformu | Dilekce hazirlama ve hukuk burosu surecleri vurgusu | Yuksek |
| Nobi Law | Hukuk otomasyon paketi | Dilekce robotu / AI avukat asistani paketleri | Yuksek |
| Lawly | Avukat verimlilik araci | Hazir dilekce ve AI metin olusturma ozellikleri | Orta-Yuksek |
| UzmanLEX | AI hukuk asistani | Dilekce olusturma ozelligi ve Turk hukuk odagi | Orta-Yuksek |
| LexDoc.pro | Dilekce AI platformu | AI destekli dilekce yazimi, TR odakli mesajlar | Yuksek |
| dilekce.ai | Genel dilekce asistani | Turkce AI dilekce uretimi (kullanici odakli) | Orta-Yuksek |
| DavaHukuk (yapayzekadava.com) | Dava/dilekce otomasyonu | AI ile dilekce olusturma ve dava sureci yardimi | Orta |

## 3) En Onemli Rakipler (Kullanici Onceligi)
1. Adli Hafiza
2. Apilex
3. LawChat
4. De Jure AI

## 4) Bizim Proje ile En Yakindan Rekabet Edenler (Ikinci Oncelik)
1. AyLex
2. Lextum AI
3. Lexform AI
4. Lavren
5. EvrakAI

Neden:
- Dilekce uretimi urunun merkezinde.
- Turkiye hukuk sureclerine dogrudan mesaj veriyorlar.
- "Kullaniciya hazir metin cikarmasi" deger onerisi bizim urunle en fazla ortusuyor.

## 5) Hizli Pazar Okumasi
- Pazar ikiye bolunuyor: (a) dogrudan dilekce ureten AI urunleri, (b) hukuk operasyon yonetimi icine AI ekleyen urunler.
- Dilekce uretiminde hiz + dogruluk + mevzuat/guncellik algisi kritik farklastirici.
- UYAP/UDF ve burolara uygun is akislarini acik gosteren urunler daha guclu algi olusturuyor.

## 6) Kaynaklar
- https://www.aylex.ai/
- https://adlihafiza.com/
- https://adlihafiza.com/documents/Adli_Haf%C4%B1za_Tant%C4%B1mm.pdf
- https://www.apilex.ai/
- https://www.lawchat.com.tr/
- https://www.dejure.ai/
- https://lextum.ai/
- https://www.lexform.com.tr/
- https://lavren.net/
- https://evrakai.com/
- https://www.hukteb.com/
- https://nobilaw.com/
- https://lawly.tr/
- https://www.uzmanlex.com/
- https://lexdoc.pro/
- https://dilekce.ai/
- https://www.yapayzekadava.com/
- (Dahili urun kaniti) public/manifest.xml
- (Dahili urun kaniti) doc/office/WORD_ADDIN_INTEGRATION_PLAN.md
- (Dahili urun kaniti) src/pages/AlternativeApp.tsx

## 7) Kod Tabanina Dayali Ozellik Kaniti (Bizim Urun)
| Ozellik | Kod kaniti | Durum |
|---|---|---|
| Word eklentisi taskpane | `public/office/word/taskpane.html`, `public/office/word/taskpane.js`, `public/office/word/manifest.xml` | Aktif |
| Eklenti icinde karar arama/beyin firtinasi/web arama hizli komutlari | `public/office/word/taskpane.js` icindeki `QUICK_PROMPTS` (`decision-search`, `brainstorm`, `web-search`) | Aktif |
| Eklenti -> chatbot entegrasyonu | `taskpane.js` icinde `/api/gemini/chat` cagrisi | Aktif |
| Alt-app sohbet ve dilekce olusturma akisi | `src/pages/AlternativeApp.tsx` | Aktif |
| Karar arama endpointi + fallback | `api/legal/index.js` (`search-decisions`, `get-document`) ve `AlternativeApp.tsx` fallback cagrilari | Aktif |
| Web aramasi destekli AI yanitlari | `api/gemini/web-search.js`, `api/gemini/chat.js` (Google Search tool) | Aktif |
| Dilekce uretimi + revizyon | `api/gemini/generate-petition.js`, `api/gemini/rewrite.js`, `api/gemini/review.js` | Aktif |

## 8) Kod Tabanina Dayali Puanlama Metodolojisi (100 Uzerinden)
Not: Rakipler icin kaynaklar acik web sinyali; bizim urun puani ise dogrudan kod tabani kanitina gore verildi.

Puan kriterleri:
- Ozellik kapsami ve aktivasyon kaniti (35)
- Uc uca entegrasyon derinligi (Word + chat + karar + web) (25)
- Uretim hazirligi (API ayrimi, fallback, auth akislari) (20)
- Testlenebilirlik ve kalite sinyali (10)
- Surdurulebilirlik (modulerlik, dosya boyutu/teknik borc) (10)

## 9) Kod Tabanina Gore Bizim Uygulama Puani
Toplam: **88/100**

Kirilm:
- Ozellik kapsami ve aktivasyon kaniti: **33/35**
  - Word add-in, chat, karar arama, web arama, beyin firtinasi, dilekce uretimi kodda aktif.
- Uc uca entegrasyon derinligi: **23/25**
  - Word taskpane -> `/api/gemini/chat` -> alt-app/chat baglami guclu.
- Uretim hazirligi: **17/20**
  - Endpoint fallbackleri mevcut, ancak bazi akislar halen buyuk dosya bagimliliginda.
- Testlenebilirlik ve kalite sinyali: **7/10**
  - `tests/geminiService.test.ts` ve `tests/legalSearch.test.ts` var; Word taskpane icin dogrudan test yok.
- Surdurulebilirlik: **8/10**
  - Teknik borc sinyali: `server.js` (~3301 satir), `AlternativeApp.tsx` (~2573 satir).

## 10) Yeniden Rekabet Puanlamasi (Kod Tabanli Bizim Skor + Pazar Skoru Rakipler)
| Urun | Puan | Gerekce |
|---|---:|---|
| Bizim Uygulama | 88 | Kodda dogrulanan Word eklentisi + alt-app chatbot + karar/web arama zinciri |
| De Jure AI | 86 | Guclu entegrasyon iddiasi ve pazar sinyalleri |
| LawChat | 84 | Karar atfi ve UDF cikti odagi |
| Apilex | 83 | UYAP/UDF akislarinda guclu konum |
| Adli Hafiza | 82 | Yerli hukuk AI platform konumlandirmasi |
| AyLex | 80 | Dilekce otomasyon odagi belirgin |

## 11) Kisa Sonuc
- Codebase kanitina gore urun "lider banda" yaklasmis durumda; puan **91 -> 88** olarak normalize edildi.
- Dusus nedeni ozellik eksigi degil; teknik borc ve test kapsami agirligi.
- Sonraki puan artisi icin en hizli kaldirac: Word eklenti e2e testleri + `AlternativeApp`/`server.js` modulerlestirme.
