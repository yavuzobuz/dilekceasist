# Emsal Karar Arama MCP İyileştirme Raporu

Tarih: 2026-03-06

## 1. Yönetici özeti

Mevcut yapı "tek katmanlı keyword arama + sınırlı dense rerank" seviyesinde kalıyor. Bu yüzden:

- UYAP Emsal tarafında sonuç havuzu dar kalıyor.
- Bedesten tarafında semantik arama var ama aday toplama ve rerank derinliği sınırlı.
- Serbest metin kullanıcı sorgusu daha en başta agresif biçimde sıkıştırılıyor.
- Son aşamada sert tam metin eşleşme filtresi bazı doğru kararları eliyor.

Kod incelemesine göre temel problem, "daha iyi embedding" eksikliğinden çok, retrieval pipeline'ın eksik olmasıdır. Daha güçlü bir arama için en doğru yön, çok-aşamalı bir hukuk arama mimarisine geçmektir:

1. Query understanding
2. Geniş aday toplama
3. Hybrid retrieval
4. Cross-encoder rerank
5. Alan-spesifik filtreleme ve açıklanabilir sonuç üretimi

## 2. İncelenen kod alanları

### Yerel uygulama

- `src/pages/PrecedentSearch.tsx`
- `src/utils/legalSearch.ts`
- `api/legal/[action].js`

### MCP / kaynak repo

- `yargi-mcp/mcp_server_main.py`
- `yargi-mcp/emsal_mcp_module/client.py`
- `yargi-mcp/emsal_mcp_module/models.py`
- `yargi-mcp/semantic_search/embedder.py`
- `yargi-mcp/semantic_search/vector_store.py`
- `yargi-mcp/semantic_search/processor.py`
- `yargi-mcp/README.md`

## 3. Mevcut mimari nasıl çalışıyor

### 3.1 Frontend katmanı

Kullanıcı serbest metin girebiliyor; fakat arama öncesi metin `compactLegalSearchQuery()` ile sıkıştırılıyor. Bu davranış `src/pages/PrecedentSearch.tsx` içinde doğrudan kullanılıyor ve sonuçta uzun olgusal bağlam, dava türü, usul aşaması ve ayrıştırıcı sinyallerin bir bölümü kaybolabiliyor.

### 3.2 Uygulama backend'i

`api/legal/[action].js` üç farklı yol izliyor:

- Bedesten'i doğrudan HTTP ile arıyor.
- UYAP Emsal'i MCP üzerinden arıyor.
- Bedesten için ek olarak MCP semantik aramasını çağırıyor.

Yani semantik katman uygulama tarafında "tüm kaynaklara yayılan ortak retrieval motoru" değil; Bedesten'e bağlı bir ek yol.

### 3.3 `yargi-mcp` tarafı

UYAP Emsal araması `search_emsal_detailed_decisions` ile UYAP endpoint'ine oldukça ince bir sarmalayıcı olarak bağlanıyor. `page_size` 10 ile sınırlı. Buna karşılık `search_bedesten_semantic`:

- önce Bedesten'den aday topluyor,
- belge içeriklerini çekiyor,
- embedding üretiyor,
- in-memory cosine similarity ile sıralıyor.

Bu yaklaşım faydalı ama halen "ilk nesil semantic rerank" düzeyinde.

## 4. Kod tabanında tespit edilen ana sorunlar

### P1. UYAP Emsal araması pas-through kalmış, aday havuzu çok dar

Kanıt:

- `yargi-mcp/emsal_mcp_module/models.py`: `page_size` üst sınırı `10`
- `yargi-mcp/mcp_server_main.py`: `page_size = 10` sabitlenmiş
- `api/legal/[action].js`: `searchEmsalViaMcp()` yalnızca MCP sonucunu normalize ediyor; ek retrieval/rerank yok

Etki:

- UYAP tarafında tek sayfalık arama davranışı oluşuyor.
- Query zor veya genişse, doğru karar ilk 10 içinde değilse sistem onu hiç görmüyor.
- Sonraki katmanların iyileştirme şansı kalmıyor.

### P1. Semantik arama yalnızca Bedesten akışına bağlı

Kanıt:

- `yargi-mcp/mcp_server_main.py`: `search_bedesten_semantic`
- `api/legal/[action].js`: `searchSemanticViaMcp()` sadece `search_bedesten_semantic` tool'unu çağırıyor

Etki:

- UYAP Emsal, özellikle yerel/istinaf kararları için semantic recall kazanamıyor.
- Bedesten ve UYAP iki ayrı retrieval adası gibi kalıyor.

### P1. Semantic pipeline tek-vektör dense rerank seviyesinde

Kanıt:

- `yargi-mcp/semantic_search/vector_store.py`: in-memory cosine similarity
- `yargi-mcp/mcp_server_main.py`: adaylar embedding ile sıralanıyor
- multi-vector, sparse, field-aware fusion yok

Etki:

- Anahtar hukuki terimler, kanun maddeleri, istisna kelimeleri ve usul ifadeleri dense modele bırakılıyor.
- Hukukta kritik olan exact/lexical eşleşme gücü yeterince kullanılmıyor.

### P1. Query çok erken sıkıştırılıyor

Kanıt:

- `src/pages/PrecedentSearch.tsx`: arama öncesi `compactLegalSearchQuery(searchQuery)`
- `src/utils/legalSearch.ts`: uzun metinlerde phrase anchor ve token kısaltması

Etki:

- "olgu + hukukî sorun + usul aşaması + istisna" içeren karmaşık sorgular sadeleşiyor.
- Retrieval için faydalı bağlamın bir kısmı kayboluyor.

### P1. Son aşama tam metin filtresi aşırı sert

Kanıt:

- `api/legal/[action].js`: `tokenCoverage >= 0.7 || (phraseHitCount >= 2 && tokenCoverage >= 0.5)`
- aynı dosyada `LEGAL_MIN_MATCH_SCORE = 50`

Etki:

- Semantik olarak çok doğru fakat farklı lafızla kurulmuş kararlar elenebiliyor.
- Özellikle Danıştay ve yerel mahkeme kararlarında dil varyasyonu yüksek olduğunda precision artarken recall düşüyor.

### P2. Semantik arama dokümantasyonu ile kod uyuşmuyor

Kanıt:

- `yargi-mcp/README.md`: `OPENROUTER_API_KEY` ile etkinleştiği yazıyor
- `yargi-mcp/semantic_search/embedder.py`: gerçekte `GEMINI_API_KEY` aranıyor
- `yargi-mcp/mcp_server_main.py`: semantik tool görünürlüğü `GEMINI_API_KEY` ile kontrol ediliyor

Etki:

- Kullanıcı doğru env'i verse bile tool görünmeyebilir.
- "MCP beklediğim gibi cevap vermiyor" şikayetinin bir kısmı yanlış konfigürasyondan da geliyor olabilir.

### P2. TLS doğrulaması kapalı kullanılıyor

Kanıt:

- `yargi-mcp/emsal_mcp_module/client.py`: `verify=False`

Etki:

- Üretim güvenliği ve hata ayıklama açısından riskli.
- Arama kalitesini doğrudan bozmaz ama operasyonel kaliteyi düşürür.

## 5. Neden sonuçlar kullanıcı beklentisini karşılamıyor

Sistemin bugünkü hali şu mantıkla çalışıyor:

1. Uzun sorguyu kısalt
2. Keyword araması yap
3. Az sonuç varsa küçük bir semantik ek arama yap
4. Sonuçları tekrar katı kelime filtresinden geçir

Bu akış hukuk araması için ters sırada kurulmuş. Güçlü hukuk aramasında önce recall büyütülür, sonra precision artırılır. Mevcut akışta ise recall erken daralıyor.

## 6. Daha iyi ve daha kompleks arama mimarisi

### Seviye 1: Hızlı kazanımlar

#### 6.1 Dual query yaklaşımı

Tek query yerine iki query kullanın:

- `raw_query`: kullanıcının tam ifadesi
- `retrieval_query`: arama için optimize edilmiş kısa sürüm

Kurallar:

- retrieval için kısaltılmış query kullanılsın
- rerank ve explanation için ham query korunsun
- filtre ve istisna ifadeleri kaybolmasın

#### 6.2 UYAP için çok sayfalı aday toplama

`page_size=10` yerine:

- ilk 3 ila 5 sayfa çekilsin
- toplam 30-50 aday toplanabilsin
- duplicate temizliği sonrası rerank yapılsın

#### 6.3 UYAP sonuçlarına da tam metin tabanlı rerank ekleyin

Şu an UYAP normalize edilip dönüyor. Bunun yerine:

- belge içerikleri çekilsin
- aynı scoring/rerank katmanına girsin
- mümkünse semantic rerank'e ortak aday havuzu sağlasın

#### 6.4 Sert filtre yerine fusion uygulayın

`tokenCoverage >= 0.7` gibi hard cutoff yerine:

- lexical score
- dense score
- metadata score
- field boost

birleşsin ve sonuçlar RRF veya weighted fusion ile sıralansın.

### Seviye 2: Doğru retrieval stack

Önerilen üretim mimarisi:

1. Query parser
2. Candidate generation
3. Hybrid retrieval
4. Cross-encoder reranker
5. Diversification
6. Explainability

#### 6.5 Query parser

Çıkarması gereken alanlar:

- mahkeme türü
- daire/kurul
- esas/karar no
- tarih aralığı
- kanun maddeleri
- dava tipi
- usul aşaması
- olumlu/olumsuz terimler
- zorunlu exact phrase'ler

#### 6.6 Candidate generation

Tek kaynaktan değil, paralel kaynaklardan aday üretin:

- Bedesten lexical
- UYAP lexical
- sparse retrieval
- dense retrieval
- gerekiyorsa query expansion varyantları

#### 6.7 Hybrid retrieval

Bu katmanda önerim:

- BM25 veya eşdeğeri lexical indeks
- dense embedding retrieval
- sparse retrieval
- RRF ile fusion

Pratik aday modeller:

- dense + sparse + multi-vector için `BAAI/bge-m3`
- cross-encoder rerank için `BAAI/bge-reranker-v2-m3`
- daha yüksek kalite için ColBERT tarzı late interaction katmanı

#### 6.8 Cross-encoder reranker

En büyük kalite sıçramasını çoğu zaman bu katman verir. Çünkü query ile karar aynı anda değerlendirilir. Özellikle:

- "itirazın iptali" ama hangi bağlam?
- "kaçak yapı" mı "kaçak elektrik" mi?
- "iptal" idari işlem iptali mi sözleşme iptali mi?

gibi ayrımlar burada daha iyi yapılır.

#### 6.9 Field-aware scoring

Karar metni tek blok olmamalı. Ayrıştırılabiliyorsa ayrı alanlar üretin:

- başlık
- mahkeme / daire
- esas no
- karar no
- tarih
- özet / konu
- tam metin
- atıf yapılan kanunlar

Sonra alan bazlı ağırlık verin. Örneğin:

- exact phrase title/summary eşleşmesi > full text eşleşmesi
- kanun maddesi eşleşmesi güçlü sinyal
- tarih yakınlığı opsiyonel boost

### Seviye 3: Hukuk alanına özel akıllı katman

#### 6.10 Hukuki varlık çıkarımı

Her karar için yapılandırılmış metadata üretin:

- dava türü
- kurum
- yaptırım türü
- kanun/madde
- usul pozisyonu
- sonuç tipi

Bu, "yalnızca semantik benzer" değil "aynı hukuki probleme ait" sonuçlar getirir.

#### 6.11 Decision graph / citation graph

Kararlar arası atıfları yakalarsanız:

- merkezî içtihatları yükseltebilirsiniz
- mükerrer ama zayıf kararları aşağı çekebilirsiniz
- öncü kararı ve onu izleyen kararları birlikte gösterebilirsiniz

#### 6.12 Sonuç çeşitlendirme

İlk 10 sonucun hepsi aynı daireden gelmemeli. Diversification katmanı:

- aynı karar ailesini cluster'lar
- farklı daire/mahkeme ve tarihlerden örnek verir
- kullanıcıya daha dengeli içtihat seti sunar

## 7. Önerilen teknik yol haritası

### Faz A - 1 haftalık iyileştirme

- `README` env anahtarı tutarsızlığını düzelt
- UYAP için çok sayfalı toplama ekle
- UYAP sonuçlarını tam metin rerank katmanına sok
- `raw_query` ve `retrieval_query` ayrımını ekle
- sert `tokenCoverage` filtresini warning fallback yerine skor bileşeni yap

Beklenen kazanım:

- ilk sonuç sayfasında daha ilgili sonuçlar
- "hiç bulamıyor" şikayetinde belirgin azalma

### Faz B - 2 ila 4 hafta

- ortak retrieval candidate havuzu kur
- Bedesten + UYAP için hibrit indeks oluştur
- `bge-m3` veya benzeri modelle dense+sparse retrieval dene
- `bge-reranker-v2-m3` ile top-50 -> top-10 rerank uygula
- cache katmanı ekle

Beklenen kazanım:

- recall artışı
- farklı lafızlarla yazılmış ama aynı hukuki konuya ait kararların bulunması

### Faz C - 1 ila 2 ay

- nightly ingest / incremental indexing
- field-aware schema
- hukuk domain etiketleme
- değerlendirme veri seti ve offline benchmark
- click / selection telemetry ile online tuning

Beklenen kazanım:

- sistematik kalite artışı
- regresyonların ölçülebilir hale gelmesi

## 8. Ölçmeden iyileştirme yapılamaz: önerilen kalite metrikleri

Her sorgu için elle etiketlenmiş küçük ama kaliteli bir benchmark set kurun.

Önerilen metrikler:

- Recall@20
- nDCG@10
- MRR@10
- Top-5 içinde doğru karar var mı
- Ortalama ilk sonuç gecikmesi
- Tam metin fetch başarı oranı
- UYAP ve Bedesten ayrı başarı oranları

Özellikle şu query sınıflarında ayrı skor tutun:

- iş hukuku
- icra/itirazın iptali
- imar/idari işlem
- ceza
- kira/tapu/miras
- yerel mahkeme / istinaf

## 9. Benim net teknik önerim

Eğer amaç "hızlıca biraz daha iyi olsun" ise:

1. UYAP çok sayfa + tam metin rerank
2. raw query korunması
3. hard cutoff yerine hybrid skor

Eğer amaç "gerçekten güçlü hukuk araması" ise:

1. Bedesten + UYAP unified candidate store
2. BM25 + dense + sparse hybrid retrieval
3. top-100 için cross-encoder rerank
4. hukuk metadata extraction
5. offline benchmark + sürekli tuning

Ben olsam doğrudan şu hedef mimariye giderdim:

- Candidate retrieval: BM25 + dense + sparse
- Fusion: RRF
- Final ranking: `bge-reranker-v2-m3`
- Gelişmiş kalite opsiyonu: ColBERT / late interaction

Bu kombinasyon hem Türkçe hukuk dilindeki exact terimleri korur, hem de lafız farklılıklarını yakalar.

## 10. Dış araştırma ile desteklenen teknik referanslar

- Gemini embeddings dokümanı, query/document task type ayrımı ve 768/1536/3072 boyut önerileri:
  https://ai.google.dev/gemini-api/docs/embeddings
- Qdrant hybrid queries ve RRF:
  https://qdrant.tech/documentation/concepts/hybrid-queries/
- BM25 temel lexical ranking:
  https://lucene.apache.org/core/10_2_2/core/org/apache/lucene/search/similarities/BM25Similarity.html
- BGE-M3 model card; dense + sparse + multi-vector retrieval desteği:
  https://huggingface.co/BAAI/bge-m3
- BGE multilingual reranker:
  https://huggingface.co/BAAI/bge-reranker-v2-m3
- ColBERT / late interaction yaklaşımı:
  https://github.com/stanford-futuredata/ColBERT

## 11. Sonuç

Bugünkü yapı "arama kalitesini artırmak için çeşitli fallback'ler eklenmiş" bir sistem; fakat hâlâ gerçek anlamda retrieval system değil. Sorun tek bir noktada değil:

- query understanding eksik,
- candidate generation dar,
- hybrid retrieval yok,
- UYAP semantic dışı kalıyor,
- final ranker sert eşiklerle recall kaybettiriyor.

Arama kalitesini belirgin biçimde artırmak için en yüksek ROI veren sıra şudur:

1. UYAP çoklu sayfa ve ortak rerank
2. raw query koruma
3. hybrid scoring
4. multilingual reranker
5. unified hukuk retrieval index

Bu beş adım uygulandığında "beklediğim gibi cevap vermiyor" sorunu büyük ölçüde kalite probleminden ölçülebilir retrieval problemine dönüşür; bu da sistemi gerçekten iyileştirilebilir hale getirir.
