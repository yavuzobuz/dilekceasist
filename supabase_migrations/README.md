# Supabase Migrations - Public Petitions Feature

## 🎯 Amaç
Bu migration, kullanıcıların dilekçelerini herkese açık olarak paylaşabilmesi için gerekli veritabanı yapısını oluşturur.

## 📋 Migration Dosyası

**Dosya:** `complete_public_petitions_setup.sql`

Bu tek dosya tüm kurulumu içerir:
- ✅ `public_petitions` tablosu
- ✅ İndeksler (performans optimizasyonu)
- ✅ Row Level Security (RLS) politikaları
- ✅ Foreign key ilişkileri
- ✅ Trigger'lar (otomatik updated_at)
- ✅ Profiles tablosu için public access

## 🚀 Kurulum Adımları

### 1. Supabase Dashboard'a gidin
```
https://app.supabase.com
```

### 2. Projenizi seçin
- Sol üstte doğru projeyi seçtiğinizden emin olun

### 3. SQL Editor'ü açın
- Sol menüden **"SQL Editor"** seçeneğine tıklayın

### 4. Migration'ı çalıştırın
1. **"New query"** butonuna tıklayın
2. `complete_public_petitions_setup.sql` dosyasını açın
3. Tüm içeriği kopyalayın
4. SQL Editor'e yapıştırın
5. **"Run"** (▶️) butonuna tıklayın

### 5. Başarıyı doğrulayın
✅ "Success. No rows returned" mesajı görmelisiniz

### 6. Tabloyu kontrol edin
- Sol menüden **"Table Editor"** seçin
- `public_petitions` tablosunu göreceksiniz

## 📊 Tablo Yapısı

### `public_petitions` Tablosu

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | UUID | Benzersiz dilekçe ID (otomatik) |
| `user_id` | UUID | Paylaşan kullanıcı (profiles.id) |
| `original_petition_id` | UUID | Orijinal dilekçe referansı |
| `title` | TEXT | Dilekçe başlığı |
| `petition_type` | TEXT | Dilekçe türü |
| `content` | TEXT | Dilekçe içeriği |
| `description` | TEXT | Kullanıcı açıklaması |
| `tags` | TEXT[] | Etiketler (arama için) |
| `is_premium` | BOOLEAN | Premium dilekçe mi? |
| `price` | NUMERIC | Fiyat (gelecek özellik) |
| `status` | TEXT | active/inactive/reported/removed |
| `view_count` | INTEGER | Görüntülenme sayısı |
| `download_count` | INTEGER | İndirilme sayısı |
| `created_at` | TIMESTAMPTZ | Oluşturulma zamanı |
| `updated_at` | TIMESTAMPTZ | Güncellenme zamanı |

## 🔐 Güvenlik Politikaları

### `public_petitions` için:
- ✅ **Herkes** aktif dilekçeleri okuyabilir
- ✅ **Giriş yapmış kullanıcılar** dilekçe paylaşabilir
- ✅ **Sadece sahibi** kendi dilekçelerini güncelleyebilir/silebilir

### `profiles` için:
- ✅ **Herkes** paylaşım yapan kullanıcıların profillerini görebilir
- ✅ Bu sayede yazar adı görünür olur

## 📁 Diğer Dosyalar

Migration dizininde başka dosyalar da var ama **sadece `complete_public_petitions_setup.sql` dosyasını çalıştırmanız yeterli**. Diğerleri referans amaçlı bırakıldı.

## ✅ Test

Migration başarılı olduktan sonra:

1. **Profil sayfanıza** gidin
2. Bir dilekçenin yanındaki **yeşil "Paylaş" butonuna** tıklayın
3. Açıklama ve etiketler ekleyin
4. **"Paylaş"** butonuna tıklayın
5. **"Petition Pool"** sayfasına gidin
6. Paylaştığınız dilekçeyi görmelisiniz! 🎉

## 🐛 Sorun Giderme

### "Table already exists" hatası
✅ Normal, zaten oluşturulmuş demektir. Devam edin.

### "Policy already exists" hatası
✅ Normal, zaten var demektir. Sorun değil.

### "Could not find relationship" hatası
❌ Migration tam çalışmamış. Scripti tekrar çalıştırın.

### "Permission denied" hatası
❌ Supabase projenizde yönetici yetkisi olmayabilir.

## 📞 Destek

Sorun yaşarsanız console hatalarını kontrol edin:
- Browser Developer Tools → Console
- Hata mesajlarını not alın
- Supabase Dashboard → SQL Editor → Query History kontrol edin

---

**Not:** Bu migration bir kere çalıştırılmalıdır. Tekrar çalıştırmak sorun çıkarmaz (IF NOT EXISTS kontrolleri var).
