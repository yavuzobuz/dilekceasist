# ⭐ Favoriler Özelliği - Kurulum Rehberi

## 🎯 Özellik Özeti

Kullanıcılar artık:
- ✅ Dilekçeleri favorilerine ekleyebilir/çıkarabilir
- ✅ Favori sayılarını görebilir (⭐ simgesi ile)
- ✅ Kendi favorilerini görüntüleyebilir
- ✅ Favori dilekçelerini indirebilir

---

## 📋 Kurulum Adımları

### 1️⃣ ÖNCE: Önceki Migration'ları Tamamlayın

Eğer henüz yapmadıysanız, önce bu migration'ı çalıştırın:
- `FINAL_SETUP.sql` - Public petitions için foreign key ve fonksiyonlar

### 2️⃣ Favorites Migration'ı Çalıştırın

**Supabase SQL Editor:**
1. https://app.supabase.com → Projeniz → SQL Editor
2. New query
3. `add_favorites_feature.sql` dosyasını açın
4. Tüm içeriği kopyala/yapıştır
5. **Run** (▶️) tıklayın

---

## 🗄️ Oluşturulan Tablolar ve Fonksiyonlar

### Tablo: `petition_favorites`
```sql
- id (UUID)
- user_id (UUID) → profiles.id
- petition_id (UUID) → public_petitions.id
- created_at (TIMESTAMPTZ)
- UNIQUE(user_id, petition_id) - Çift favorilemeyi engeller
```

### Kolon: `public_petitions.favorite_count`
- Dilekçenin toplam favori sayısını tutar
- Otomatik güncellenir

### Fonksiyonlar:
1. **`toggle_petition_favorite(petition_id, user_id)`**
   - Favori ekler veya çıkarır
   - Favori sayısını günceller
   - Yeni durumu döndürür (is_favorited, new_count)

2. **`is_petition_favorited(petition_id, user_id)`**
   - Kullanıcının favorilediğini kontrol eder
   - Boolean döndürür

3. **`get_user_favorites(user_id)`**
   - Kullanıcının tüm favorilerini döndürür
   - Dilekçe detayları ile birlikte
   - Yazar adı dahil

---

## 🎨 Frontend Değişiklikleri

### `PetitionPool.tsx` Güncellemeleri:

#### 1. Interface Değişiklikleri
```typescript
interface PublicPetition {
  // ...
  favorite_count: number;  // ✅ Eklendi
  is_favorited?: boolean;  // ✅ Eklendi
}
```

#### 2. State Yönetimi
```typescript
const [favoritedPetitions, setFavoritedPetitions] = useState<Set<string>>(new Set());
```

#### 3. Yeni Fonksiyonlar
- `fetchUserFavorites()` - Kullanıcının favorilerini yükler
- `handleToggleFavorite()` - Favori ekler/çıkarır

#### 4. UI Değişiklikleri
- ⭐ Favori butonu eklendi (sarı/gri renk değişimi)
- 📊 Stats'ta favori sayısı gösteriliyor
- 🎨 Favorilenen butonlar sarı renkte

---

## 🧪 Test Senaryoları

### Test 1: Favori Ekleme
1. Petition Pool sayfasına git
2. Bir dilekçenin **⭐ butonuna** tıkla
3. ✅ Buton **sarı** olmalı
4. ✅ Favori sayısı **1 artmalı**
5. ✅ "Favorilere eklendi! ⭐" mesajı görünmeli

### Test 2: Favori Çıkarma
1. Favorilenen bir dilekçenin **⭐ butonuna** tekrar tıkla
2. ✅ Buton **gri** olmalı
3. ✅ Favori sayısı **1 azalmalı**
4. ✅ "Favorilerden çıkarıldı" mesajı görünmeli

### Test 3: Sayfa Yenileme
1. Bazı dilekçeleri favorile
2. Sayfayı **yenile** (F5)
3. ✅ Favori durumlar **korunmalı**
4. ✅ Sarı butonlar **aynı kalmalı**

### Test 4: Giriş Yapmadan Test
1. **Çıkış yap**
2. Petition Pool'a git
3. ⭐ butonuna tıkla
4. ✅ "Favorilere eklemek için giriş yapmalısınız" mesajı görünmeli
5. ✅ Login sayfasına yönlendirilmeli

---

## 📊 Veritabanı RLS Politikaları

### `petition_favorites` Tablosu:

✅ **Okuma (SELECT):** Herkes görüntüleyebilir (sayılar için)  
✅ **Ekleme (INSERT):** Sadece authenticated kullanıcılar  
✅ **Silme (DELETE):** Sadece kendi favorilerini  
❌ **Güncelleme (UPDATE):** Yok (gerek yok)

---

## 🎯 Sonraki Özellikler (Opsiyonel)

### Favorilerim Sayfası (Planlanan)
Kullanıcının tüm favori dilekçelerini listeleyecek ayrı bir sayfa:
- 📁 `/favorites` route
- 🔍 Arama ve filtreleme
- 📊 Sıralama seçenekleri
- 💾 Toplu indirme

### Profil Sayfasında Favoriler Bölümü
Profile sayfasına "Favorilerim" sekmesi eklenebilir.

---

## ✅ Kontrol Listesi

Kurulum tamamlandıktan sonra kontrol edin:

- [ ] `FINAL_SETUP.sql` çalıştırıldı mı?
- [ ] `add_favorites_feature.sql` çalıştırıldı mı?
- [ ] `petition_favorites` tablosu oluşturuldu mu?
- [ ] `favorite_count` kolonu `public_petitions`'da var mı?
- [ ] Fonksiyonlar çalışıyor mu? (SQL Editor'de test edin)
- [ ] PetitionPool'da ⭐ butonlar görünüyor mu?
- [ ] Favori ekleme/çıkarma çalışıyor mu?
- [ ] Favori sayıları doğru güncelleniy or mu?
- [ ] Sayfa yenilendiğinde favoriler korunuyor mu?

---

## 🐛 Sorun Giderme

### "Function does not exist" hatası
❌ **Sorun:** `toggle_petition_favorite` fonksiyonu bulunamıyor  
✅ **Çözüm:** `add_favorites_feature.sql` scriptini tekrar çalıştırın

### Favori sayısı güncellen miyor
❌ **Sorun:** Buton tıklanıyor ama sayı değişmiyor  
✅ **Çözüm:** 
1. Browser console'u kontrol edin
2. `favorite_count` kolonunun olduğundan emin olun
3. RPC fonksiyonunun doğru çalıştığını test edin

### "Permission denied" hatası
❌ **Sorun:** RLS politikası engelleniyor  
✅ **Çözüm:**
1. Kullanıcının giriş yaptığından emin olun
2. RLS politikalarını kontrol edin (SQL Editor)
3. GRANT komutlarının çalıştığını doğrulayın

---

## 📞 Destek

Sorun yaşarsanız:
1. Browser console'da hataları kontrol edin
2. Supabase SQL Editor'de fonksiyonları manuel test edin
3. RLS politikalarını gözden geçirin

---

**🎉 Favoriler özelliği hazır! Kullanıcılarınız artık beğendikleri dilekçeleri kaydedebilir!**
