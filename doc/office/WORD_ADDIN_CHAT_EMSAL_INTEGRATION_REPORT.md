# Word Eklentisi -> Chat Asistani -> Emsal Karar Entegrasyonu

## 1. Ozet

Word eklentisindeki mevcut akista kullanici istemi dogrudan `POST /api/gemini/chat` endpoint'ine gidiyor. Bu akista:

- gercek bir web aramasi orkestrasyonu yok,
- gercek bir emsal karar arama orkestrasyonu yok,
- sadece modele "web aramasi yapabilir" ve "emsal karar arayabilir" diyen bir sistem promptu veriliyor.

Bu nedenle Word eklentisi, chat sayfasindaki hukuk asistani gibi davranmiyor. Chat sayfasinda ise emsal karar aramasi, `useLegalSearch` ve `searchLegalDecisionsDetailed` uzerinden gercek servis cagrilariyla yapiliyor. Sorunun kok nedeni budur.

Kisa sonuc:

- Word taskpane bugun "tool-enabled legal copilot" degil, "tek endpointli genel chat paneli" gibi calisiyor.
- Chat sayfasi ise "prompt + web search + legal search + belge baglami" orkestrasyonuna sahip.
- Word eklentisinin emsal karar aramasi yapabilmesi icin prompt degil, ayni orkestrasyon katmanina baglanmasi gerekiyor.

## 2. Incelenen Yapi

### 2.1 Word eklentisi

Ana dosyalar:

- [public/office/word/taskpane.js](c:/Users/Obuzhukuk/Desktop/dilekceasist/public/office/word/taskpane.js)
- [public/office/word/taskpane.html](c:/Users/Obuzhukuk/Desktop/dilekceasist/public/office/word/taskpane.html)
- [manifest.xml](c:/Users/Obuzhukuk/Desktop/dilekceasist/manifest.xml)

Mevcut taskpane davranisi:

- Word secimini okuyor
- opsiyonel olarak tum belge metnini baglam olarak ekliyor
- kullanici mesajini `chatHistory` formatinda hazirliyor
- `POST /api/gemini/chat` cagiriyor
- stream edilen cevabi sadece metin olarak panele basiyor

Quick actions:

- `text-fix`
- `brainstorm`
- `web-search`

Burada `emsal-search` benzeri ayri bir aksiyon veya gercek emsal arama pipeline'i yok.

### 2.2 Chat endpoint

Ana dosya:

- [backend/gemini/chat.js](c:/Users/Obuzhukuk/Desktop/dilekceasist/backend/gemini/chat.js)

Mevcut chat endpoint davranisi:

- Gemini'ye sistem promptu veriyor
- iki function declaration sunuyor:
  - `update_search_keywords`
  - `generate_document`
- ama gercek `search_web` veya `search_legal_precedents` function'u sunmuyor
- gelen `context.webSearchSummary`, `context.legalSummary`, `context.legalSearchResults` gibi alanlar varsa kullaniyor
- bu alanlar yoksa model sadece genel hukuk bilgisiyle cevap veriyor

Yani endpoint:

- arama yapan katman degil
- arama sonuclarini kullanan katman

### 2.3 Chat sayfasi / hukuk asistani

Ana dosyalar:

- [src/pages/ChatPage.tsx](c:/Users/Obuzhukuk/Desktop/dilekceasist/src/pages/ChatPage.tsx)
- [src/hooks/useLegalSearch.ts](c:/Users/Obuzhukuk/Desktop/dilekceasist/src/hooks/useLegalSearch.ts)
- [src/utils/legalSearch.ts](c:/Users/Obuzhukuk/Desktop/dilekceasist/src/utils/legalSearch.ts)
- [backend/legal/search-decisions.js](c:/Users/Obuzhukuk/Desktop/dilekceasist/backend/legal/search-decisions.js)

Chat sayfasinda olan ama Word eklentisinde olmayan seyler:

- `detectLegalSearchIntent(...)` ile emsal karar niyet tespiti
- `useLegalSearch().search(...)` ile gercek arama
- `searchLegalDecisionsDetailed(...)` ile `/api/legal/search-decisions` cagri zinciri
- belgeyi analiz edip `documentAnalyzerResult` uretme
- arama sonucunu chat baglamina geri enjekte etme
- arama sonucunu kullanarak sonraki model cevabini zenginlestirme

## 3. Kopus Noktasi

Word eklentisinin emsal karar aramamasinin asil nedeni:

1. Taskpane tarafi `useLegalSearch` benzeri bir orkestrasyon kullanmiyor.
2. Taskpane sadece `/api/gemini/chat` cagiriyor.
3. `/api/gemini/chat` emsal karar aramasi yapan bir endpoint degil.
4. Sistem promptunda "emsal karar arama yapilir" denmesi, gercek tool execution anlamina gelmiyor.

Bu nedenle kullanici Word eklentisinde:

- "web aramasi yap" dediginde bile pratikte daha cok prompt tabanli cevap aliyor,
- "emsal karar ara" dediginde ise chat sayfasindaki gercek hukuk arama boru hattina hic girmiyor.

## 4. Hedef Mimarinin Net Tanimi

Word eklentisi, chat sayfasindaki asistanin hafif bir kopyasi olmamali. Aksine:

- ayni intent tespiti
- ayni legal search orkestrasyonu
- ayni web search orkestrasyonu
- ayni chat endpoint

uzerinden calismali.

Onerilen hedef:

`Word Taskpane -> Shared Assistant Orchestrator -> web/legal search -> /api/gemini/chat`

Burada model son adim olmali; arama ve veri toplama modeli bekleyen prompt seviyesinde kalmamali.

## 5. Onerilen Entegrasyon Modeli

### 5.1 Kisa vadeli dogru cozum

Taskpane icine su akisi eklenmeli:

1. Kullanici istemi alinir
2. `detectLegalSearchIntent` benzeri niyet tespiti yapilir
3. Gerekirse belge secimi ve tum belge metni ile analyzer girdisi hazirlanir
4. Emsal karar gerekiyorsa `/api/legal/search-decisions` zinciri calistirilir
5. Web aramasi gerekiyorsa mevcut web search zinciri calistirilir
6. Bu sonuclar `context.legalSearchResults`, `context.legalSummary`, `context.searchSummary`, `context.webSources` olarak chat endpoint'ine gecilir
7. `/api/gemini/chat` yalnizca nihai cevabi uretir

Bu model, mevcut backend'i buyuk olcude yeniden yazmadan Word eklentisini chat asistaniyla hizalar.

### 5.2 En dogru mimari cozum

Frontend tarafinda ortak bir paylasilabilir orkestrasyon modulu olusturulmali.

Onerilen yeni ortak moduller:

- `src/lib/assistant/intentRouting.ts`
- `src/lib/assistant/legalSearchOrchestrator.ts`
- `src/lib/assistant/webSearchOrchestrator.ts`
- `src/lib/assistant/chatContextBuilder.ts`

Bu moduller:

- ChatPage
- AlternativeApp
- AppMain
- Word Taskpane

tarafindan ortak kullanilmali.

Boylece ayni isteme her yuzeyde ayni davranis verilir.

## 6. Uygulanabilir Teknik Plan

### Asama 1: Word taskpane'e gercek legal search ekle

Taskpane tarafinda su degisiklikler yapilmali:

- `web-search` yanina `precedent-search` veya `emsal-search` quick action eklenmeli
- `detectLegalSearchIntent` benzeri niyet tespiti eklenmeli
- `searchLegalDecisionsDetailed` mantigi taskpane tarafinda yeniden yazilmak yerine ortak module tasinmali
- taskpane, emsal arama sonucunu ayrica gostermeli

Bu asamada Word paneli yalnizca final text donmesin; su veri katmanlarini da tutsun:

- `legalSearchResults`
- `legalSummary`
- `webSearchSummary`
- `documentAnalyzerResult`

### Asama 2: Ortak assistant orchestrator cikar

ChatPage icindeki asagidaki mantiklar ortak modullere alinmali:

- intent tespiti
- explicit web search tespiti
- legal search trigger
- belge analizi -> legal packet uretilmesi
- chat context'e search sonuclarini ekleme

Bu sayede Word panelinde ayni davranis copy-paste ile degil, ortak kodla elde edilir.

### Asama 3: Word icin iki asamali UX

Word eklentisinde tek textarea'li yapidan daha iyi bir arayuz kurulmali:

1. `Arama ve Hazirlik`
2. `Asistan Cevabi`

Ilk bolumde:

- secili metin
- belge baglami
- tespit edilen anahtar kavramlar
- bulunan emsal karar sayisi
- bulunan web kaynak sayisi

gosterilmeli.

Ikinci bolumde:

- model cevabi
- Word'e uygula
- emsal karar ozetlerini ekle
- sadece hukuki analiz uret

aksiyonlari olmali.

## 7. UI/UX Iyilestirme Onerileri

### Mevcut sorunlar

- "Web Aramasi" butonu, gercek arama ile prompt tabanli cevap arasindaki farki kullaniciya gostermiyor
- Emsal kararlar icin hic gorunur aksiyon yok
- Sonucun hangi kaynaklarla uretildigi taskpane'de anlasilmiyor
- Word icindeki hukuk kullanim senaryosunda "metin duzeltme" ile "hukuki arastirma" ayni panelde ama farkli modlar olarak tasarlanmamis

### Onerilen UI

Word panelinde butonlar su sekilde ayrilmali:

- `Metin Duzelt`
- `Hukuki Strateji`
- `Web Arastir`
- `Emsal Karar Ara`
- `Arastir + Cevap Yaz`

Ek gorunumler:

- `Bulunan Emsal Kararlar`
- `Bulunan Web Kaynaklari`
- `Asistan Cevabi`
- `Word'e Uygulanacak Son Metin`

Bu ayrim, kullanicinin "su an prompt cevabi mi aliyorum, yoksa gercek arama sonucu mu?" sorusunu ortadan kaldirir.

## 8. Veri ve Prompt Katmani Icin Oneriler

### Problem

Su an Word taskpane, modele fazla erken gidiyor. Arama ve retrieval olmadan modelden "emsal kararli cevap" bekleniyor.

### Oneri

Chat endpoint'ine giden context su alanlari standartlastirmali:

- `searchKeywords`
- `searchSummary`
- `webSources`
- `legalSummary`
- `legalSearchResults`
- `docContent`
- `specifics`
- `documentAnalyzerResult`

Boylece chat endpoint tek bir standart baglam kontratiyla calisir.

### Daha saglam prompt davranisi

Prompta su bilgi de eklenmeli:

- `legalSearchResults.length`
- `webSources.length`
- `hangi veri gercek arama sonucu, hangi veri kullanici metni`

Bu, modelin arama yapilmis gibi davranip veri uydurmasini azaltir.

## 9. Riskler

### Dusuk risk

- Word paneline yeni quick action eklemek
- taskpane'de yeni durum state'leri tutmak
- mevcut legal search endpoint'ini yeniden kullanmak

### Orta risk

- ChatPage mantigini ortak modullere tasimak
- browser tabani ile Office webview arasinda ortak kod kullanimini dengelemek

### Yuksek risk

- Word taskpane'i tamamen yeni bir mini-frontend'e cevirmek
- taskpane icine gereksiz buyuk React runtime tasimak

Bu nedenle tavsiye:

- ilk etapta vanilla taskpane korunmali
- ama arka planda ortak JS/TS modulleriyle zenginlestirilmeli

## 10. En Dogru Uygulama Sirasi

1. Word taskpane icin "emsal karar ara" aksiyonu ekle
2. Taskpane'e gercek legal search request katmani ekle
3. ChatPage'deki intent + legal search orkestrasyonunu ortak module tasi
4. Word taskpane'i bu ortak modulu kullanir hale getir
5. Son olarak web search ve legal search sonuclarini taskpane UI'da ayri bloklarda goster

## 11. Somut Gelistirme Onerileri

### Oneri A

`public/office/word/taskpane.js` icine dogrudan legal search fetch mantigi eklenebilir.

Artisi:

- hizli teslim

Eksisi:

- ChatPage ile tekrarli kod olusur

### Oneri B

`src/utils/legalSearch.ts` ve `src/hooks/useLegalSearch.ts` icindeki browser-safe bolumler ortak modullere ayrilip taskpane tarafinda kullanilir.

Artisi:

- dogru mimari
- davranis birligi

Eksisi:

- biraz daha fazla ilk iscilik

### Oneri C

Word taskpane icin ayri bir backend orchestrator endpoint yazilir:

- `POST /api/word-assistant/respond`

Bu endpoint:

- intent tespiti yapar
- gerekirse web search yapar
- gerekirse legal search yapar
- sonra Gemini chat cevabini uretir

Artisi:

- frontend hafif kalir
- Word taskpane daha stabil olur

Eksisi:

- backend orchestration katmani buyur

## 12. Tavsiye Edilen Nihai Yol

Bu repo icin en dengeli yol:

### Birincil tavsiye

`Oneri B + Oneri C'nin hafif versiyonu`

Yani:

- once taskpane'e gercek legal search ekle
- sonra ortak orchestration modulu cikar
- backend'e sadece gerekli oldugunda Word'e ozel hafif bir facade endpoint ekle

Bu sayede:

- hizli kazanim elde edilir
- mimari tekrar azalir
- Word eklentisi ile chat asistani ayni akli kullanmaya baslar

## 13. Sonuc

Bugunku durumda Word eklentisi ile chat sayfasi ayni asistan degil.

Word eklentisi:

- prompt odakli
- tek endpointli
- retrieval'siz

Chat sayfasi ise:

- intent aware
- retrieval destekli
- emsal karar ve web aramasi yapan

bir yapida.

Bu fark kapatilmak isteniyorsa cozum promptu guclendirmek degil, Word eklentisini chat sayfasinin kullandigi gercek orchestration hattina baglamaktir.

Bu rapora gore en dogru sonraki teknik hedef:

- Word taskpane istemini chat sayfasindaki legal/web search orchestration hattina baglamak
- `emsal karar ara` yetenegini prompt seviyesinden gercek servis seviyesine indirmek
- taskpane sonucunu "arama yapildi / yapilmadi" seffafligiyla gostermek

