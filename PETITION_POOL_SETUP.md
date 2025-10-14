# Dilekçe Havuzu Kurulumu 📚

## ✅ Tamamlanan Adımlar

Aşağıdaki dosyalar başarıyla oluşturuldu:

1. **Database Migration** - `supabase/migrations/create_public_petitions.sql`
2. **PetitionPool Sayfası** - `src/pages/PetitionPool.tsx`
3. **ShareModal Komponenti** - `src/components/ShareModal.tsx`
4. **Header Güncellendi** - Dilekçe Havuzu menü öğesi eklendi
5. **Router Güncellendi** - `/pool` route'u eklendi

## 🔧 Kurulum Adımları

### 1. Supabase Migration'ı Çalıştır

Supabase Dashboard'a gidin ve SQL Editor'ı açın:

1. **https://supabase.com** → Projenizi seçin
2. **SQL Editor** → **New Query**
3. `supabase/migrations/create_public_petitions.sql` dosyasının içeriğini kopyalayıp yapıştırın
4. **Run** butonuna tıklayın

Bu işlem şunları oluşturacak:
- `public_petitions` tablosu
- `petition_likes` tablosu
- Gerekli indeksler
- RLS (Row Level Security) politikaları
- Trigger'lar (likes_count, views_count güncellemek için)

### 2. Dev Server'ı Yeniden Başlat

Terminal'de:

```bash
# Dev server'ı durdur (Ctrl+C)
# Sonra yeniden başlat:
npm run dev:all
```

## 🎯 Özellikler

### Kullanıcı Özellikleri:
- ✅ Dilekçeleri havuza paylaşabilme
- ✅ Paylaşılan dilekçeleri görüntüleme
- ✅ Arama ve filtreleme (tür, etiket)
- ✅ Dilekçeyi beğenme (❤️)
- ✅ Dilekçeyi önizleme (👁️)
- ✅ Dilekçeyi kendi hesabına kopyalama (📥)
- ✅ İstatistikler (beğeni, görüntüleme, indirme sayısı)

### Gelecek Özellikler (Hazır Altyapı):
- ⭐ Premium dilekçeler (ücretli)
- 💰 Fiyatlandırma sistemi
- 🏆 Popüler dilekçeler sıralaması
- 👤 Kullanıcı profil sayfaları
- 💬 Yorum sistemi

## 📖 Kullanım

### Dilekçe Paylaşma:
1. **Profile** sayfasına git
2. Bir dilekçenin yanındaki **"Paylaş"** butonuna tıkla
3. Açıklama ve etiketler ekle
4. **"Paylaş"** butonuna tıkla

### Dilekçe Havuzuna Göz Atma:
1. Header'daki **"📚 Dilekçe Havuzu"** menüsüne tıkla
2. Dilekçeleri incele, filtrele, ara
3. Beğen veya kendi hesabına kopyala

## 🗂️ Veritabanı Yapısı

### public_petitions
- `id` - UUID (Primary Key)
- `user_id` - UUID (Foreign Key → auth.users)
- `original_petition_id` - UUID (Foreign Key → petitions)
- `title` - TEXT
- `petition_type` - TEXT
- `content` - TEXT
- `description` - TEXT (nullable)
- `tags` - TEXT[] (array)
- `is_premium` - BOOLEAN
- `price` - DECIMAL(10,2)
- `likes_count` - INTEGER
- `views_count` - INTEGER
- `downloads_count` - INTEGER
- `status` - TEXT (active, hidden, reported)
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

### petition_likes
- `id` - UUID (Primary Key)
- `user_id` - UUID (Foreign Key → auth.users)
- `petition_id` - UUID (Foreign Key → public_petitions)
- `created_at` - TIMESTAMP
- UNIQUE constraint (user_id, petition_id)

## 🔐 Güvenlik

- **RLS (Row Level Security)** aktif
- Herkes paylaşılan dilekçeleri görebilir
- Sadece sahibi kendi dilekçesini düzenleyebilir/silebilir
- Beğeniler ve görüntülemeler herkes tarafından görülebilir

## 🚀 İyileştirme Fikirleri

1. **Arama Geliştirme**: PostgreSQL Full-Text Search
2. **Kategorizasyon**: Alt kategoriler ekle
3. **Raporlama**: Uygunsuz içerik bildirme
4. **Moderasyon**: Admin paneli
5. **Sıralama**: Popülerlik, tarih, beğeni
6. **Sosyal**: Takip sistemi, bildirimler

## ⚠️ Önemli Notlar

- Kişisel bilgi içeren dilekçeleri paylaşmayın uyarısı mevcut
- Premium özellikler şu an deaktif (yakında aktif edilecek)
- Tüm paylaşılan dilekçeler herkese açık

## 📞 Destek

Sorun yaşarsanız:
1. Browser console'da hata kontrol edin (F12)
2. Supabase Dashboard'da SQL query'nin başarılı olduğundan emin olun
3. Network tab'de API çağrılarını kontrol edin
