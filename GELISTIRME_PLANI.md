# Geliştirme Planı: Hafif RAG -> Semantic Retrieval

## 1. Amaç
- Mevcut hafif RAG (kelime eşleşmeli retrieval) yapısını koruyarak kaliteyi ölçmek.
- Gerekli olduğunda semantic retrieval (embedding + vektör arama) katmanına kontrollü geçmek.
- Maliyet, gecikme ve kalite dengesini bozmadan belge üretim doğruluğunu artırmak.

## 2. Mevcut Durum
- Backend tarafında hafif RAG aktif:
  - Lexical tokenizasyon + skorlamalı parça seçimi
  - Şablon havuzundan ilgili parça çekme
  - Chat ve dilekçe üretim prompt’una bağlam enjekte etme
- Semantic retrieval henüz aktif değil:
  - Embedding üretimi yok
  - Vektör DB araması yok

## 3. Geçiş Kararı (Go / No-Go)
- Semantic retrieval hemen zorunlu değil.
- Aşağıdaki metrikler 1-2 hafta izlenecek:
  1. Yanıtın bağlamı kaçırma oranı
  2. Yeniden yazdırma/düzeltme oranı
  3. Kullanıcının "alakasız çıktı" geri bildirimi
  4. Belge üretiminde eksik dayanak oranı
- Eşik üstüne çıkarsa semantic fazına geçilecek.

## 4. Fazlı Uygulama Planı

### Faz 0: Ölçüm ve Loglama (hemen)
- Retrieval kaynaklarını logla:
  - Seçilen chunk sayısı
  - Kaynak tipi (template/doc/chat)
  - Prompt’a eklenen toplam karakter
- Prompt sonrasında kalite sinyalleri topla:
  - Retry/rewrite tetiklenmesi
  - Kullanıcı memnuniyetsizliği işaretleri

### Faz 1: Veri Modeli ve Altyapı
- Supabase `pgvector` tablosu:
  - `rag_chunks(id, user_id, source_type, source_id, chunk_text, metadata, embedding, created_at, updated_at)`
- İndeks:
  - `ivfflat` veya `hnsw` (ortama göre)
- RLS:
  - Kullanıcı yalnız kendi chunk’larını görebilir.

### Faz 2: Ingestion Pipeline
- Kaynaklar:
  - Kullanıcı belgeleri
  - Özel şablonlar
  - Sistem şablonları
- Süreç:
  1. Metni normalize et
  2. Chunk’la
  3. Embedding üret
  4. `rag_chunks` tablosuna yaz
- Güncelleme:
  - Belge/şablon değiştiğinde eski chunk’ları revize et.

### Faz 3: Retrieval Servisi
- İstek anında:
  1. Sorgu embedding üret
  2. Vektör benzerliği ile `top-k` chunk çek
  3. Mevcut lexical sonuçlarla birleştir (hybrid retrieval)
  4. Prompt bütçesine göre yeniden sırala/kırp

### Faz 4: Güvenlik ve Fallback
- Embedding servisi hata verirse otomatik lexical fallback.
- Vektör arama boş dönerse lexical sonuçları kullan.
- Token/karakter limiti aşımında chunk azalt.

### Faz 5: A/B Test ve Değerlendirme
- A Grubu: mevcut hafif RAG
- B Grubu: hybrid semantic + lexical
- Karşılaştırma:
  - Kullanıcı düzeltme oranı
  - Cevap alaka puanı
  - Ortalama yanıt süresi
  - Maliyet/istek

## 5. Başarı Kriterleri
- Alakasız çıktı oranında anlamlı düşüş
- Yeniden yazdırma ihtiyacında düşüş
- Gecikmede kabul edilebilir artış
- İstek başı maliyette kontrol edilebilir artış

## 6. Riskler ve Önlemler
- Risk: Maliyet artışı  
  - Önlem: Sadece gerekli kaynaklara embedding, gecikmeli batch ingestion
- Risk: Yanıt süresi artışı  
  - Önlem: `top-k` sınırı, cache, fallback
- Risk: Yanlış/dağınık bağlam  
  - Önlem: hybrid ranking ve prompt bütçesi kontrolü

## 7. Önerilen Yol Haritası
- Hafta 1: Faz 0 (ölçüm) + karar metrikleri
- Hafta 2: Faz 1-2 (schema + ingestion)
- Hafta 3: Faz 3-4 (hybrid retrieval + fallback)
- Hafta 4: Faz 5 (A/B test), sonuç raporu ve kalıcı geçiş kararı

## 8. Karar Notu
- Şu an aktif yaklaşım: hafif RAG ile devam.
- Semantic retrieval: metrikler kalite sorunu gösterirse devreye alınacak.
