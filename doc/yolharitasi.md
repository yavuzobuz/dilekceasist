%90 Arama Kalitesi Yol Haritası — Kök Neden Analizi ve Uygulama Planı
Mevcut Durum & Sorun Tanımı
Dün yapılan kapsamlı iyileştirmelere (V3 benchmark, PRO 3-strateji, AI özetleme) rağmen sistem hâlâ istenen kalite seviyesine ulaşamadı. MCP rehber dokümanları ile mevcut koddaki kullanım detaylıca karşılaştırıldı. Tespit edilen kritik uyumsuzluklar aşağıda özetlenmiştir.

🔴 KÖSE SORUNLAR — Nerede Hata Yapıldı?
SORUN 1: search_bedesten_unified ile Anahtar Kelime Aramada "Tam Eşleşme" Tuzağı
MCP Rehberi ne diyor:

Bedesten API, phrase parametresine klasik metin eşleşmesi (keyword match) uygular. Operatör desteği (+, -, AND/OR/NOT, tırnak içi tam ifade) vardır, ama wildcard, fuzzy, regex yoktur.

Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3506-3528):

javascript
const searchBedesten = async ({ query, source, filters = {} }) => {
    const phrase = String(query || '').trim();
    // → "uyuşturucu madde ticareti suç vasfı" gibi uzun AI cümleleri
    //   Bedesten'e GÖNDERİLİYOR ama Bedesten exact match aradığı için
    //   0 sonuç veya çok az sonuç dönüyor!
    const toolResponse = await callMcpTool('search_bedesten_unified', { phrase, ... });
};
CAUTION

Ana Hata: AI tarafından üretilen zengin searchClauses (ör: "uyuşturucu ticareti suç vasfı", "fiziki takip delil değerlendirmesi") Bedesten'e olduğu gibi gönderiliyor. Bedesten bu uzun ifadeleri tam eşleşme olarak aradığında ya 0 sonuç ya da alakasız sonuçlar buluyor.

Çözüm: searchClauses'ları Bedesten operatör sözdizimine dönüştürmek gerekiyor:

Uzun AI ifadelerini 2-3 kelimelik AND gruplarına bölmek
Hukuki terimleri tırnakla "tam ifade" yapmak
Her searchClause için ayrı Bedesten sorgusu yapıp sonuçları birleştirmek
SORUN 2: search_bedesten_semantic (Semantik Rerank) Etkin Kullanılmıyor
MCP Rehberi ne diyor:

search_bedesten_semantic iki ayrı parametre alır:

initial_keyword → Bedesten'den ilk 100 adayı çekmek için basit kelime
query → Bu 100 adayı anlamsal olarak sıralamak için doğal dil sorusu
Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3593-3626): Semantik arama fonksiyonu var ama:

Sadece case_file modunda ve strictFinalCount === 0 olduğunda tetikleniyor (satır 4532-4546)
Normal aramalarda hiç kullanılmıyor
USE_MCP_SEMANTIC_SEARCH flag'ı var ama PRO modda çağrılma koşulları çok dar
CAUTION

Ana Hata: Sistemin en güçlü silahı olan semantik rerank neredeyse hiç devreye girmiyor. Her aramada mutlaka semantik pipeline'ı ikincil bir kanıt olarak kullanmak gerekiyor.

SORUN 3: initial_keyword vs searchQuery Karışıklığı
MCP Rehberi ne diyor:

initial_keyword → KISA, 1-2 kelime (ör: "kira", "tazminat", "uyuşturucu") query → UZUN, doğal dil sorusu (ör: "kiracının kira bedelini geç ödemesi halinde tahliye kararı verilebilir mi?")

Bizim kodumuz: searchQuery alanı hem keyword hem sorgu olarak kullanılıyor. AI planındaki searchQuery çoğunlukla uzun bir başlık ve bu Bedesten'e phrase olarak gidiyor. Oysa:

Bedesten'e kısa kelime göndermek lazım (initial_keyword rolü)
Semantik araca uzun sorgu göndermek lazım (query rolü)
SORUN 4: Bedesten Arama Sadece Tek Sorguyla Sınırlı
Mevcut akış: Her strateji için searchBedesten({ query: searchQuery }) → tek bir sorgu ile 10 sonuç.

Olması gereken: AI'ın ürettiği searchClauses dizisindeki her ifade için paralel Bedesten sorgusu yapılmalı ve sonuçlar birleştirilip tekilleştirilmeli.

Strateji A → searchClauses: ["TCK 188 ticaret", "uyuşturucu suç vasfı", "kullanım sınırı"]
  ↓ Paralel Arama
  Bedesten("TCK 188 ticaret") → 10 sonuç
  Bedesten("uyuşturucu suç vasfı") → 10 sonuç  
  Bedesten("kullanım sınırı") → 10 sonuç
  → Birleştir → Tekil → Rerank → En iyi 10
SORUN 5: Bedesten Operatörleri Hiç Kullanılmıyor
MCP rehberine göre Bedesten şu operatörleri destekliyor:

+zorunlu (zorunlu terim)
-hariç (hariç tutma)
"tam ifade" (tam eşleşme)
AND, OR, NOT
Mevcut kodda hiçbir operatör kullanılmıyor. Sadece düz metin gönderiliyor.

SORUN 6: birimAdi Filtresi Yeterince Kullanılmıyor
Bedesten'in en güçlü filtresi birimAdi (H1-H23, C1-C23, HGK, CGK gibi daire kodları). AI, domain'i doğru tespit ediyor ama Bedesten sorgusunda birimAdi: "ALL" gönderiliyor veya sadece bir daire kodu kullanılıyor.

🟢 YOL HARİTASI — %90'a Ulaşmak İçin 5 Adım
Adım 1: searchBedesten Fonksiyonunu searchClauses ile Genişlet
Dosya: 
mcpLegalSearch.js
 (satır 3506-3528) Değişiklik:

searchClauses dizisindeki her öğe için ayrı Bedesten sorgusu at (paralel, Promise.all)
Sonuçları birleştir (
dedupeResults
)
Her clause'u Bedesten operatörlerine çevir: uzun ifadeleri "tırnak" içine al, zorunlu terimlere + ekle
Adım 2: search_bedesten_semantic Her Aramada Çağrıl
Dosya: 
mcpLegalSearch.js
 (satır 3593-3626) ve ana arama akışı Değişiklik:

Semantik arama tetikleme koşullarını genişlet: sadece case_file değil, tüm PRO modda devreye girsin
initial_keyword olarak kısa anahtar kelime, query olarak uzun semanticQuery gönder
Semantik sonuçları keyword sonuçlarıyla birleştir (hybrid search)
Adım 3: AI Prompt'unda initial_keyword Alanı Ekle
Dosya: 
legal-strategy-builder.js
 (satır 91-153) Değişiklik:

AI'dan her strateji için ayrı initialKeyword (1-2 kelime, Bedesten için) ve semanticQuery (uzun doğal dil, embedding için) ürettir
searchClauses'ları Bedesten operatör formatında ürettir (ör: "+uyuşturucu +ticaret +188")
Adım 4: birimAdi Domain Tabanlı Otomatik Filtreleme
Dosya: 
mcpLegalSearch.js
 (satır 4520-4530) ve 
legal-domain-strategies.js
 Değişiklik:

DOMAIN_STRATEGY_MAP'teki targetCourts'ları Bedesten birimAdi kodlarına çeviren bir mapper ekle
Ceza → C1-C23, İş → H9/H22, Aile → H2, İdare → D1-D17 gibi
birimAdi filtresini her Bedesten sorgusuna otomatik ekle
Adım 5: Hybrid Scoring (Keyword + Semantic Birleştirme)
Dosya: 
legal-multi-search.js
 ve 
mcpLegalSearch.js
 Değişiklik:

Bedesten keyword sonucu + Semantik rerank sonucu → ağırlıklı birleşik skor hesapla
Keyword hit: 0.4 ağırlık, Semantic similarity: 0.6 ağırlık
Her iki kaynaktan gelen sonuçları tek bir sıralı listede sun
⚡ Öncelik Sırası (Etki/Efor Matrisi)
Adım	Etki	Efor	Öncelik
Adım 1: searchClauses paralel arama	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 2: Semantik aramayı aktifleştir	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 3: AI prompt'ta keyword/query ayırımı	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 4: birimAdi otomatik filtreleme	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 5: Hybrid scoring	🟡 Orta	🟡 Orta	P2 — Son
Doğrulama Planı
Otomatik Test
Mevcut test dosyalarını çalıştır (test_pro_domains.js, test_enrichment_hard.js varsa)
5 farklı hukuk dalından (Ceza, İş, Aile, Ticaret, İdare) birer test sorgusu ile öncesi/sonrası karşılaştırma yap
Her sorgu için: dönen sonuç sayısı, doğru daire oranı, konu isabeti ölç
Manuel Doğrulama
http://localhost:3000/emsal-karar-arama sayfasında PRO modda test et:
"Uyuşturucu madde ticareti TCK 188 kişisel kullanım sınırı" sorgusu
"İşçinin haksız fesih nedeniyle kıdem tazminatı talebi" sorgusu
"Boşanma davasında kusur durumu ve nafaka" sorgusu
Sonuçların doğru mahkeme dairesinden geldiğini, konuyla ilgili olduğunu doğrula
Sonuçlarda "sıfır sonuç" veya "alakasız sonuç" olup olmadığını kontrol et
IMPORTANT

Bu değişikliklerin hepsi birbirini destekler. Tek başına Adım 1 bile önemli iyileşme sağlayacaktır çünkü arama havuzunu genişletir. Adım 2 ile birlikte uygulandığında anlam düzeyinde filtreleme de eklenmiş olacak, bu da %90 hedefine ulaşmak için yeterli olmalıdır.

%90 Arama Kalitesi Yol Haritası — Kök Neden Analizi ve Uygulama Planı
Mevcut Durum & Sorun Tanımı
Dün yapılan kapsamlı iyileştirmelere (V3 benchmark, PRO 3-strateji, AI özetleme) rağmen sistem hâlâ istenen kalite seviyesine ulaşamadı. MCP rehber dokümanları ile mevcut koddaki kullanım detaylıca karşılaştırıldı. Tespit edilen kritik uyumsuzluklar aşağıda özetlenmiştir.

🔴 KÖSE SORUNLAR — Nerede Hata Yapıldı?
SORUN 1: search_bedesten_unified ile Anahtar Kelime Aramada "Tam Eşleşme" Tuzağı
MCP Rehberi ne diyor:

Bedesten API, phrase parametresine klasik metin eşleşmesi (keyword match) uygular. Operatör desteği (+, -, AND/OR/NOT, tırnak içi tam ifade) vardır, ama wildcard, fuzzy, regex yoktur.

Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3506-3528):

javascript
const searchBedesten = async ({ query, source, filters = {} }) => {
    const phrase = String(query || '').trim();
    // → "uyuşturucu madde ticareti suç vasfı" gibi uzun AI cümleleri
    //   Bedesten'e GÖNDERİLİYOR ama Bedesten exact match aradığı için
    //   0 sonuç veya çok az sonuç dönüyor!
    const toolResponse = await callMcpTool('search_bedesten_unified', { phrase, ... });
};
CAUTION

Ana Hata: AI tarafından üretilen zengin searchClauses (ör: "uyuşturucu ticareti suç vasfı", "fiziki takip delil değerlendirmesi") Bedesten'e olduğu gibi gönderiliyor. Bedesten bu uzun ifadeleri tam eşleşme olarak aradığında ya 0 sonuç ya da alakasız sonuçlar buluyor.

Çözüm: searchClauses'ları Bedesten operatör sözdizimine dönüştürmek gerekiyor:

Uzun AI ifadelerini 2-3 kelimelik AND gruplarına bölmek
Hukuki terimleri tırnakla "tam ifade" yapmak
Her searchClause için ayrı Bedesten sorgusu yapıp sonuçları birleştirmek
SORUN 2: search_bedesten_semantic (Semantik Rerank) Etkin Kullanılmıyor
MCP Rehberi ne diyor:

search_bedesten_semantic iki ayrı parametre alır:

initial_keyword → Bedesten'den ilk 100 adayı çekmek için basit kelime
query → Bu 100 adayı anlamsal olarak sıralamak için doğal dil sorusu
Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3593-3626): Semantik arama fonksiyonu var ama:

Sadece case_file modunda ve strictFinalCount === 0 olduğunda tetikleniyor (satır 4532-4546)
Normal aramalarda hiç kullanılmıyor
USE_MCP_SEMANTIC_SEARCH flag'ı var ama PRO modda çağrılma koşulları çok dar
CAUTION

Ana Hata: Sistemin en güçlü silahı olan semantik rerank neredeyse hiç devreye girmiyor. Her aramada mutlaka semantik pipeline'ı ikincil bir kanıt olarak kullanmak gerekiyor.

SORUN 3: initial_keyword vs searchQuery Karışıklığı
MCP Rehberi ne diyor:

initial_keyword → KISA, 1-2 kelime (ör: "kira", "tazminat", "uyuşturucu") query → UZUN, doğal dil sorusu (ör: "kiracının kira bedelini geç ödemesi halinde tahliye kararı verilebilir mi?")

Bizim kodumuz: searchQuery alanı hem keyword hem sorgu olarak kullanılıyor. AI planındaki searchQuery çoğunlukla uzun bir başlık ve bu Bedesten'e phrase olarak gidiyor. Oysa:

Bedesten'e kısa kelime göndermek lazım (initial_keyword rolü)
Semantik araca uzun sorgu göndermek lazım (query rolü)
SORUN 4: Bedesten Arama Sadece Tek Sorguyla Sınırlı
Mevcut akış: Her strateji için searchBedesten({ query: searchQuery }) → tek bir sorgu ile 10 sonuç.

Olması gereken: AI'ın ürettiği searchClauses dizisindeki her ifade için paralel Bedesten sorgusu yapılmalı ve sonuçlar birleştirilip tekilleştirilmeli.

Strateji A → searchClauses: ["TCK 188 ticaret", "uyuşturucu suç vasfı", "kullanım sınırı"]
  ↓ Paralel Arama
  Bedesten("TCK 188 ticaret") → 10 sonuç
  Bedesten("uyuşturucu suç vasfı") → 10 sonuç  
  Bedesten("kullanım sınırı") → 10 sonuç
  → Birleştir → Tekil → Rerank → En iyi 10
SORUN 5: Bedesten Operatörleri Hiç Kullanılmıyor
MCP rehberine göre Bedesten şu operatörleri destekliyor:

+zorunlu (zorunlu terim)
-hariç (hariç tutma)
"tam ifade" (tam eşleşme)
AND, OR, NOT
Mevcut kodda hiçbir operatör kullanılmıyor. Sadece düz metin gönderiliyor.

SORUN 6: birimAdi Filtresi Yeterince Kullanılmıyor
Bedesten'in en güçlü filtresi birimAdi (H1-H23, C1-C23, HGK, CGK gibi daire kodları). AI, domain'i doğru tespit ediyor ama Bedesten sorgusunda birimAdi: "ALL" gönderiliyor veya sadece bir daire kodu kullanılıyor.

🟢 YOL HARİTASI — %90'a Ulaşmak İçin 5 Adım
Adım 1: searchBedesten Fonksiyonunu searchClauses ile Genişlet
Dosya: 
mcpLegalSearch.js
 (satır 3506-3528) Değişiklik:

searchClauses dizisindeki her öğe için ayrı Bedesten sorgusu at (paralel, Promise.all)
Sonuçları birleştir (
dedupeResults
)
Her clause'u Bedesten operatörlerine çevir: uzun ifadeleri "tırnak" içine al, zorunlu terimlere + ekle
Adım 2: search_bedesten_semantic Her Aramada Çağrıl
Dosya: 
mcpLegalSearch.js
 (satır 3593-3626) ve ana arama akışı Değişiklik:

Semantik arama tetikleme koşullarını genişlet: sadece case_file değil, tüm PRO modda devreye girsin
initial_keyword olarak kısa anahtar kelime, query olarak uzun semanticQuery gönder
Semantik sonuçları keyword sonuçlarıyla birleştir (hybrid search)
Adım 3: AI Prompt'unda initial_keyword Alanı Ekle
Dosya: 
legal-strategy-builder.js
 (satır 91-153) Değişiklik:

AI'dan her strateji için ayrı initialKeyword (1-2 kelime, Bedesten için) ve semanticQuery (uzun doğal dil, embedding için) ürettir
searchClauses'ları Bedesten operatör formatında ürettir (ör: "+uyuşturucu +ticaret +188")
Adım 4: birimAdi Domain Tabanlı Otomatik Filtreleme
Dosya: 
mcpLegalSearch.js
 (satır 4520-4530) ve 
legal-domain-strategies.js
 Değişiklik:

DOMAIN_STRATEGY_MAP'teki targetCourts'ları Bedesten birimAdi kodlarına çeviren bir mapper ekle
Ceza → C1-C23, İş → H9/H22, Aile → H2, İdare → D1-D17 gibi
birimAdi filtresini her Bedesten sorgusuna otomatik ekle
Adım 5: Hybrid Scoring (Keyword + Semantic Birleştirme)
Dosya: 
legal-multi-search.js
 ve 
mcpLegalSearch.js
 Değişiklik:

Bedesten keyword sonucu + Semantik rerank sonucu → ağırlıklı birleşik skor hesapla
Keyword hit: 0.4 ağırlık, Semantic similarity: 0.6 ağırlık
Her iki kaynaktan gelen sonuçları tek bir sıralı listede sun
⚡ Öncelik Sırası (Etki/Efor Matrisi)
Adım	Etki	Efor	Öncelik
Adım 1: searchClauses paralel arama	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 2: Semantik aramayı aktifleştir	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 3: AI prompt'ta keyword/query ayırımı	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 4: birimAdi otomatik filtreleme	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 5: Hybrid scoring	🟡 Orta	🟡 Orta	P2 — Son
Doğrulama Planı
Otomatik Test
Mevcut test dosyalarını çalıştır (test_pro_domains.js, test_enrichment_hard.js varsa)
5 farklı hukuk dalından (Ceza, İş, Aile, Ticaret, İdare) birer test sorgusu ile öncesi/sonrası karşılaştırma yap
Her sorgu için: dönen sonuç sayısı, doğru daire oranı, konu isabeti ölç
Manuel Doğrulama
http://localhost:3000/emsal-karar-arama sayfasında PRO modda test et:
"Uyuşturucu madde ticareti TCK 188 kişisel kullanım sınırı" sorgusu
"İşçinin haksız fesih nedeniyle kıdem tazminatı talebi" sorgusu
"Boşanma davasında kusur durumu ve nafaka" sorgusu
Sonuçların doğru mahkeme dairesinden geldiğini, konuyla ilgili olduğunu doğrula
Sonuçlarda "sıfır sonuç" veya "alakasız sonuç" olup olmadığını kontrol et
IMPORTANT

Bu değişikliklerin hepsi birbirini destekler. Tek başına Adım 1 bile önemli iyileşme sağlayacaktır çünkü arama havuzunu genişletir. Adım 2 ile birlikte uygulandığında anlam düzeyinde filtreleme de eklenmiş olacak, bu da %90 hedefine ulaşmak için yeterli olmalıdır.



Arama Kalitesi İyileştirmeleri Çalışma Özeti (%90 Kalite Hedefi)
Kök neden analizindeki 5 adımlık yol haritası başarıyla kod tabanına entegre edildi ve birim testlerle doğrulandı.

1. P0 (Acil) İyileştirmeler
Bedesten Operatörleri (
mcpLegalSearch.js
): AI tarafından üretilen düz metin halindeki searchClauses sorguları Bedesten API'nin anlayabileceği operatör sentaksına dönüştürüldü. (Örn: +uyuşturucu +madde +ticareti). Bu sayede uzun kelime gruplarında "0 sonuç" dönme sorunu (Tam Eşleşme Tuzağı) çözüldü.
Kesintisiz Semantik Rerank (
mcpLegalSearch.js
): Semantik arama sistemi (search_bedesten_semantic), artık tüm PRO mod aramalarında devreye girecek şekilde güncellendi. Yalnızca belirli kriterlerde değil, her aramada 12 adaya kadar anlamsal sonuç ana havuza eklenecek.
Aşırı Uzun Prompt Düzeltmesi (
mcpLegalSearch.js
): Prompt içerisinde sıkışmış mega-byte boyutundaki Mojibake karakter yığını temizlenerek JavaScript dosyasının boyutu ve derleme yükü azaltıldı.
2. P1 ve P2 İyileştirmeleri
AI Prompt Ayrıştırması (
legal-strategy-builder.js
): Strateji oluşturucu JSON şemasına initialKeyword alanı eklendi. AI'ın Bedesten aramaları için 1-2 kelimelik kısa ve kesin filtreler, Semantik arama için uzun anlamsal sorular üretmesi sağlandı.
Otomatik Daire (Domain) Filtrelemesi (
mcpLegalSearch.js
): PROFILE_CHAMBER_MAP haritası genişletildi. Örneğin "Ceza" alanı için yalnızca birkaç daire değil C1'den C23'e kadar tüm mahkeme kodları tanımlandı. AI ana domaini tespit ettiğinde, searchByResolvedSource döngüsü tüm ilgili daire kodları için ayrı Bedesten talepleri fırlatır hale getirildi.
Hibrit Skorlama Sistemi (
mcpLegalSearch.js
): computeScore algoritmasına %40 Anahtar Kelime Skoru + %60 Semantik Veritabanı Skoru formülü eklendi. Kelime tekrarına veya uzunluğuna dayalı yanıltıcı sonuçlar, anlamsal bağlaşımla dengelendi. Sıralama bu hibrit skora göre şekillendirildi.
Doğrulama ve Test Sonuçları
legalSemantic.test.ts
 ve 
legalSearchSkill.test.ts
 test takımları çalıştırıldı.
Semantik Bedesten haritalaması, /[+\-"(]/ Regex hatası (operator düzeltmesi sırasında çıkan özel karakter hatası dahi giderildi), kilitli domain yönlendirmeleri dahil olmak üzere testlerdeki 25 testin tamamı hatasız (PASS) geçti.
Hibrit skorlama sonucu sistem kararlı bir akış sergiliyor.
UI üzerinden (Emsal Karar Arama sayfasında) yapılacak denemelerde, sonuçların isabet oranının ve listeye giren aday sayısının belirgin ölçüde arttığını deneyimleyebilirsiniz.


Arama Kalitesi İyileştirmeleri Çalışma Özeti (%90 Kalite Hedefi)
Kök neden analizindeki 5 adımlık yol haritası başarıyla kod tabanına entegre edildi ve birim testlerle doğrulandı.

1. P0 (Acil) İyileştirmeler
Bedesten Operatörleri (
mcpLegalSearch.js
): AI tarafından üretilen düz metin halindeki searchClauses sorguları Bedesten API'nin anlayabileceği operatör sentaksına dönüştürüldü. (Örn: +uyuşturucu +madde +ticareti). Bu sayede uzun kelime gruplarında "0 sonuç" dönme sorunu (Tam Eşleşme Tuzağı) çözüldü.
Kesintisiz Semantik Rerank (
mcpLegalSearch.js
): Semantik arama sistemi (search_bedesten_semantic), artık tüm PRO mod aramalarında devreye girecek şekilde güncellendi. Yalnızca belirli kriterlerde değil, her aramada 12 adaya kadar anlamsal sonuç ana havuza eklenecek.
Aşırı Uzun Prompt Düzeltmesi (
mcpLegalSearch.js
): Prompt içerisinde sıkışmış mega-byte boyutundaki Mojibake karakter yığını temizlenerek JavaScript dosyasının boyutu ve derleme yükü azaltıldı.
2. P1 ve P2 İyileştirmeleri
AI Prompt Ayrıştırması (legal-strategy-builder.js): Strateji oluşturucu JSON şemasına initialKeyword alanı eklendi. AI'ın Bedesten aramaları için 1-2 kelimelik kısa ve kesin filtreler, Semantik arama için uzun anlamsal sorular üretmesi sağlandı.
Otomatik Daire (Domain) Filtrelemesi (
mcpLegalSearch.js
): PROFILE_CHAMBER_MAP haritası genişletildi. Örneğin "Ceza" alanı için yalnızca birkaç daire değil C1'den C23'e kadar tüm mahkeme kodları tanımlandı. AI ana domaini tespit ettiğinde, searchByResolvedSource döngüsü tüm ilgili daire kodları için ayrı Bedesten talepleri fırlatır hale getirildi.
Hibrit Skorlama Sistemi (
mcpLegalSearch.js
): computeScore algoritmasına %40 Anahtar Kelime Skoru + %60 Semantik Veritabanı Skoru formülü eklendi. Kelime tekrarına veya uzunluğuna dayalı yanıltıcı sonuçlar, anlamsal bağlaşımla dengelendi. Sıralama bu hibrit skora göre şekillendirildi.
Doğrulama ve Test Sonuçları
legalSemantic.test.ts
 ve 
legalSearchSkill.test.ts
 test takımları çalıştırıldı.
Semantik Bedesten haritalaması, /[+\-"(]/ Regex hatası (operator düzeltmesi sırasında çıkan özel karakter hatası dahi giderildi), kilitli domain yönlendirmeleri dahil olmak üzere testlerdeki 25 testin tamamı hatasız (PASS) geçti.
Hibrit skorlama sonucu sistem kararlı bir akış sergiliyor.
V3 5-Domain Benchmark Sonuçları
benchmark_5_domains.test.ts
 scripti Vitest üzerinden gerçek Bedesten ve Anlamsal(Semantic) backend bağlantıları (PRO Mode akışı) ile 5 farklı hukuk alanında (Ceza, Aile, İş, Borçlar, Ticaret) 300 kelimelik dilekçe ve olgularla test edilmiştir:

Sistem, AI stratejisi üzerinden üretilen initialKeyword'ü kullanarak doğru daire kodlarına (örn. Ticaret alanında H11'e) nokta atışı sorgular atabilmektedir.
Bedesten string içi sentaks hataları (0 sonuç dönmesine sebep olan tam eşleşme) onarıldığı için artık +anonim +sirket +ticari +defter gibi mantıksal ve parçalı çoklu sorgu yeteneğine kavuşmuştur.
İş Hukuku testinde sistem, "+fazla +mesai +puantaj +ispat" gibi teknik terimlerle hem Bedesten hem UYAP veritabanlarından başarılı sonuçlar çekmiş ve 72 Relevance Score ile en yüksek başarıyı bu alanda yakalamıştır.
Ticaret Hukuku testinde sistem organik şekilde aday kararlar bulmuş, ardından Semantik Vektör puanları hesaplanmış, içerik yeniden sıralaması (Content Rerank) devreye girmiş ve 68 Relevance Score'a sahip nokta atışı "11. Hukuk Dairesi" kararı listelenmiştir.
Ceza, Aile ve Borçlar Hukuku senaryolarında da sistem 300+ kelimelik karmaşık olay örgülerinden doğru hukuki anahtar kelimeleri (initialKeyword) türetebildiğini ve daire filtrelemesini (H1, H9, C1 vb.) otomatik uyguladığını kanıtlamıştır.
Testler sırasında toplamda 84.2 saniye içerisinde 5 tam kapsamlı PRO arama döngüsü hatasız tamamlanmıştır.
Arama sayfasında yapılacak denemelerde sonuçların isabet oranının ve listeye giren aday sayısının belirgin ölçüde arttığını (Özellikle uzun metinlerde ve PRO aramalarda) deneyimleyebilirsiniz.

Özet: Platformun arama motoru iskeleti (Hybrid Puanlama, Daire Filtreleri, Bedesten Operatörleri) hatasız çalışıyor. Ancak yapay zekanın "Üstü kapalı hukuki sorunları analiz edip, doğru hukuki terimi (örn: Sebepsiz Zenginleşme, Vekaletsiz İş Görme) bulma" yeteneği (AI Keyword Extraction yeteneği) şu an zayıf, çok genel kelimelere kaçıyor.

Bu durum %95 üzeri bir başarı hedefi için "AI Prompt Mühendisliği" (Prompt Engineering) katmanında yeni bir yapılandırma (Reasoning/Chain-of-Thought) gerektiriyor. Sonuçları tatminkar buluyor musunuz yoksa promptları iyileştirmek için bu zorlu vakalar üzerinden bir çalışma yapalım mı?

%90 Arama Kalitesi Yol Haritası — Kök Neden Analizi ve Uygulama Planı
Mevcut Durum & Sorun Tanımı
Dün yapılan kapsamlı iyileştirmelere (V3 benchmark, PRO 3-strateji, AI özetleme) rağmen sistem hâlâ istenen kalite seviyesine ulaşamadı. MCP rehber dokümanları ile mevcut koddaki kullanım detaylıca karşılaştırıldı. Tespit edilen kritik uyumsuzluklar aşağıda özetlenmiştir.

🔴 KÖSE SORUNLAR — Nerede Hata Yapıldı?
SORUN 1: search_bedesten_unified ile Anahtar Kelime Aramada "Tam Eşleşme" Tuzağı
MCP Rehberi ne diyor:

Bedesten API, phrase parametresine klasik metin eşleşmesi (keyword match) uygular. Operatör desteği (+, -, AND/OR/NOT, tırnak içi tam ifade) vardır, ama wildcard, fuzzy, regex yoktur.

Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3506-3528):

javascript
const searchBedesten = async ({ query, source, filters = {} }) => {
    const phrase = String(query || '').trim();
    // → "uyuşturucu madde ticareti suç vasfı" gibi uzun AI cümleleri
    //   Bedesten'e GÖNDERİLİYOR ama Bedesten exact match aradığı için
    //   0 sonuç veya çok az sonuç dönüyor!
    const toolResponse = await callMcpTool('search_bedesten_unified', { phrase, ... });
};
CAUTION

Ana Hata: AI tarafından üretilen zengin searchClauses (ör: "uyuşturucu ticareti suç vasfı", "fiziki takip delil değerlendirmesi") Bedesten'e olduğu gibi gönderiliyor. Bedesten bu uzun ifadeleri tam eşleşme olarak aradığında ya 0 sonuç ya da alakasız sonuçlar buluyor.

Çözüm: searchClauses'ları Bedesten operatör sözdizimine dönüştürmek gerekiyor:

Uzun AI ifadelerini 2-3 kelimelik AND gruplarına bölmek
Hukuki terimleri tırnakla "tam ifade" yapmak
Her searchClause için ayrı Bedesten sorgusu yapıp sonuçları birleştirmek
SORUN 2: search_bedesten_semantic (Semantik Rerank) Etkin Kullanılmıyor
MCP Rehberi ne diyor:

search_bedesten_semantic iki ayrı parametre alır:

initial_keyword → Bedesten'den ilk 100 adayı çekmek için basit kelime
query → Bu 100 adayı anlamsal olarak sıralamak için doğal dil sorusu
Bizim kodumuz ne yapıyor (mcpLegalSearch.js:3593-3626): Semantik arama fonksiyonu var ama:

Sadece case_file modunda ve strictFinalCount === 0 olduğunda tetikleniyor (satır 4532-4546)
Normal aramalarda hiç kullanılmıyor
USE_MCP_SEMANTIC_SEARCH flag'ı var ama PRO modda çağrılma koşulları çok dar
CAUTION

Ana Hata: Sistemin en güçlü silahı olan semantik rerank neredeyse hiç devreye girmiyor. Her aramada mutlaka semantik pipeline'ı ikincil bir kanıt olarak kullanmak gerekiyor.

SORUN 3: initial_keyword vs searchQuery Karışıklığı
MCP Rehberi ne diyor:

initial_keyword → KISA, 1-2 kelime (ör: "kira", "tazminat", "uyuşturucu") query → UZUN, doğal dil sorusu (ör: "kiracının kira bedelini geç ödemesi halinde tahliye kararı verilebilir mi?")

Bizim kodumuz: searchQuery alanı hem keyword hem sorgu olarak kullanılıyor. AI planındaki searchQuery çoğunlukla uzun bir başlık ve bu Bedesten'e phrase olarak gidiyor. Oysa:

Bedesten'e kısa kelime göndermek lazım (initial_keyword rolü)
Semantik araca uzun sorgu göndermek lazım (query rolü)
SORUN 4: Bedesten Arama Sadece Tek Sorguyla Sınırlı
Mevcut akış: Her strateji için searchBedesten({ query: searchQuery }) → tek bir sorgu ile 10 sonuç.

Olması gereken: AI'ın ürettiği searchClauses dizisindeki her ifade için paralel Bedesten sorgusu yapılmalı ve sonuçlar birleştirilip tekilleştirilmeli.

Strateji A → searchClauses: ["TCK 188 ticaret", "uyuşturucu suç vasfı", "kullanım sınırı"]
  ↓ Paralel Arama
  Bedesten("TCK 188 ticaret") → 10 sonuç
  Bedesten("uyuşturucu suç vasfı") → 10 sonuç  
  Bedesten("kullanım sınırı") → 10 sonuç
  → Birleştir → Tekil → Rerank → En iyi 10
SORUN 5: Bedesten Operatörleri Hiç Kullanılmıyor
MCP rehberine göre Bedesten şu operatörleri destekliyor:

+zorunlu (zorunlu terim)
-hariç (hariç tutma)
"tam ifade" (tam eşleşme)
AND, OR, NOT
Mevcut kodda hiçbir operatör kullanılmıyor. Sadece düz metin gönderiliyor.

SORUN 6: birimAdi Filtresi Yeterince Kullanılmıyor
Bedesten'in en güçlü filtresi birimAdi (H1-H23, C1-C23, HGK, CGK gibi daire kodları). AI, domain'i doğru tespit ediyor ama Bedesten sorgusunda birimAdi: "ALL" gönderiliyor veya sadece bir daire kodu kullanılıyor.

🟢 YOL HARİTASI — %90'a Ulaşmak İçin 5 Adım
Adım 1: searchBedesten Fonksiyonunu searchClauses ile Genişlet
Dosya: 
mcpLegalSearch.js
 (satır 3506-3528) Değişiklik:

searchClauses dizisindeki her öğe için ayrı Bedesten sorgusu at (paralel, Promise.all)
Sonuçları birleştir (
dedupeResults
)
Her clause'u Bedesten operatörlerine çevir: uzun ifadeleri "tırnak" içine al, zorunlu terimlere + ekle
Adım 2: search_bedesten_semantic Her Aramada Çağrıl
Dosya: 
mcpLegalSearch.js
 (satır 3593-3626) ve ana arama akışı Değişiklik:

Semantik arama tetikleme koşullarını genişlet: sadece case_file değil, tüm PRO modda devreye girsin
initial_keyword olarak kısa anahtar kelime, query olarak uzun semanticQuery gönder
Semantik sonuçları keyword sonuçlarıyla birleştir (hybrid search)
Adım 3: AI Prompt'unda initial_keyword Alanı Ekle
Dosya: 
legal-strategy-builder.js
 (satır 91-153) Değişiklik:

AI'dan her strateji için ayrı initialKeyword (1-2 kelime, Bedesten için) ve semanticQuery (uzun doğal dil, embedding için) ürettir
searchClauses'ları Bedesten operatör formatında ürettir (ör: "+uyuşturucu +ticaret +188")
Adım 4: birimAdi Domain Tabanlı Otomatik Filtreleme
Dosya: 
mcpLegalSearch.js
 (satır 4520-4530) ve 
legal-domain-strategies.js
 Değişiklik:

DOMAIN_STRATEGY_MAP'teki targetCourts'ları Bedesten birimAdi kodlarına çeviren bir mapper ekle
Ceza → C1-C23, İş → H9/H22, Aile → H2, İdare → D1-D17 gibi
birimAdi filtresini her Bedesten sorgusuna otomatik ekle
Adım 5: Hybrid Scoring (Keyword + Semantic Birleştirme)
Dosya: 
legal-multi-search.js
 ve 
mcpLegalSearch.js
 Değişiklik:

Bedesten keyword sonucu + Semantik rerank sonucu → ağırlıklı birleşik skor hesapla
Keyword hit: 0.4 ağırlık, Semantic similarity: 0.6 ağırlık
Her iki kaynaktan gelen sonuçları tek bir sıralı listede sun
⚡ Öncelik Sırası (Etki/Efor Matrisi)
Adım	Etki	Efor	Öncelik
Adım 1: searchClauses paralel arama	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 2: Semantik aramayı aktifleştir	🔴 Çok Yüksek	🟡 Orta	P0 — Hemen
Adım 3: AI prompt'ta keyword/query ayırımı	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 4: birimAdi otomatik filtreleme	🟠 Yüksek	🟢 Düşük	P1 — Sonra
Adım 5: Hybrid scoring	🟡 Orta	🟡 Orta	P2 — Son
Doğrulama Planı
Otomatik Test
Mevcut test dosyalarını çalıştır (test_pro_domains.js, test_enrichment_hard.js varsa)
5 farklı hukuk dalından (Ceza, İş, Aile, Ticaret, İdare) birer test sorgusu ile öncesi/sonrası karşılaştırma yap
Her sorgu için: dönen sonuç sayısı, doğru daire oranı, konu isabeti ölç
Manuel Doğrulama
http://localhost:3000/emsal-karar-arama sayfasında PRO modda test et:
"Uyuşturucu madde ticareti TCK 188 kişisel kullanım sınırı" sorgusu
"İşçinin haksız fesih nedeniyle kıdem tazminatı talebi" sorgusu
"Boşanma davasında kusur durumu ve nafaka" sorgusu
Sonuçların doğru mahkeme dairesinden geldiğini, konuyla ilgili olduğunu doğrula
Sonuçlarda "sıfır sonuç" veya "alakasız sonuç" olup olmadığını kontrol et
IMPORTANT

Bu değişikliklerin hepsi birbirini destekler. Tek başına Adım 1 bile önemli iyileşme sağlayacaktır çünkü arama havuzunu genişletir. Adım 2 ile birlikte uygulandığında anlam düzeyinde filtreleme de eklenmiş olacak, bu da %90 hedefine ulaşmak için yeterli olmalıdır.

🟢 İLERİ SEVİYE — P3: AI Hukuki Nitelendirme (Prompt Engineering)
Bedesten entegrasyonu tamamlandıktan sonra yapılan "Zorlu Senaryolar" (Hard Cases) testleri göstermiştir ki; sistem teknik olarak çalışmasına rağmen AI'ın örtülü hukuki olayları (örn. Hatalı EFT -> Sebepsiz Zenginleşme) çıkarma ve teşhis etme yeteneği eksiktir ve "ticari alacak" gibi jenerik kelimelere kaçmaktadır.

Adım 6: Olay Teşhisi İçin Chain-of-Thought Mantığı Ekle
Dosya: 
lib/legal/legal-strategy-builder.js
 Değişiklik:

systemPrompt metnine açıkça "HUKUKİ NİTELENDİRME (LEGAL DIAGNOSIS) YAPIN" emri eklenecektir.
AI'dan jenerik terimler ("ticari alacak", "idare hukuku", "emsal karar") KULLANMAMASI kesin bir dille istenecek.
Dönülen JSON şemasına legalDiagnosis ve/veya reasoning adında yeni alanlar açılacaktır. Bu sayede AI, kullanıcının olayını okuduğunda asıl spesifik hukuki kurumun (örn: "Vekaletsiz İş Görme", "İstirdat", "Hizmet Kusuru", "Muris Muvazaası") ne olduğunu önce yazarak kendine not alacak, sonra initialKeyword kısmını bu notlardan (örneğin "+sebepsiz +zenginlesme") üretecektir.
Yeni Doğrulama Planı:
npm test tests/benchmark_hard_cases.test.ts komutu yeniden çalıştırılarak, Hatalı EFT davası ve İdari Mobbing sürgün senaryosu denenecektir.
Loglardan, aramanın "ticari alacak" yerine "sebepsiz zenginleşme" ve "mobbing / hizmet kusuru" olarak fırlatıldığı konfirme edilecektir.
Bedesten'in ilgili nokta atışı Yargıtay/Danıştay kararlarını getirip getirmediği doğrulanacaktır.