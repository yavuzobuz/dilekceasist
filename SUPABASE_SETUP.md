# Supabase Kurulum Kılavuzu

## 📋 Adım Adım Kurulum

### 1️⃣ Veritabanı Tablolarını Oluşturun

1. [Supabase Dashboard](https://app.supabase.com) sayfanıza gidin
2. Projenizi seçin
3. Sol menüden **SQL Editor**'ı açın
4. `supabase_schema.sql` dosyasındaki tüm SQL kodlarını kopyalayın
5. SQL Editor'a yapıştırın ve **Run** butonuna tıklayın

✅ Tablolar başarıyla oluşturuldu!

---

### 2️⃣ Email Doğrulama Ayarlarını Yapılandırın

#### Seçenek A: Email Doğrulamayı Kapat (Geliştirme İçin - ÖNERİLEN)

1. **Authentication** → **Providers** menüsüne gidin
2. **Email** provider'ı bulun
3. **"Confirm email"** seçeneğini **KAPATIN** (disable edin)
4. **Save** butonuna tıklayın

#### Seçenek B: Email Doğrulamayı Aç (Production İçin)

1. **Authentication** → **Providers** → **Email**
2. **"Confirm email"** seçeneğini **AÇIK** bırakın
3. Email şablonlarını özelleştirin (isteğe bağlı)
4. **Save** butonuna tıklayın

**Not:** Email doğrulama açıksa, kullanıcılar kayıt olduktan sonra email kutularına gelen doğrulama linkine tıklamalıdır.

---

### 3️⃣ Mevcut Kullanıcı Sorunlarını Düzeltin

Eğer zaten kayıtlı bir kullanıcınız varsa ama giriş yapamıyorsanız:

#### Profil Eksikse:
1. **Table Editor** → **profiles** tablosuna gidin
2. Tablonun boş olup olmadığını kontrol edin
3. Boşsa endişelenmeyin - uygulama otomatik oluşturacak

#### Email Doğrulanmamışsa:
1. **Authentication** → **Users** menüsüne gidin
2. Kullanıcınızı bulun
3. Sağ taraftaki **"..."** (üç nokta) menüsüne tıklayın
4. **"Confirm email"** seçeneğini seçin
5. Tekrar giriş yapmayı deneyin

#### Kullanıcıyı Silip Yeniden Başlatın:
1. **Authentication** → **Users**
2. Kullanıcıyı seçin ve **Delete** ile silin
3. Uygulamadan yeniden kayıt olun

---

## 🔧 Environment Variables

`.env.local` dosyanızda şunlar tanımlı olmalı:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
```

**Not:** Supabase anahtarlarınızı şu yerlerden bulabilirsiniz:
- **Settings** → **API** → **Project URL** (VITE_SUPABASE_URL)
- **Settings** → **API** → **Project API keys** → **anon/public** (VITE_SUPABASE_ANON_KEY)

---

## 🐛 Sık Karşılaşılan Hatalar ve Çözümleri

### ❌ "Email not confirmed" hatası

**Sorun:** Kullanıcı email doğrulaması yapmamış.

**Çözüm:**
- Email kutunuzu kontrol edin ve doğrulama linkine tıklayın
- VEYA yukarıdaki **Seçenek A** ile email doğrulamayı kapatın
- VEYA Dashboard'dan manuel doğrulama yapın

---

### ❌ "Invalid login credentials" hatası

**Sorun:** Email/şifre yanlış veya kullanıcı bulunamıyor.

**Çözüm:**
1. Email ve şifreyi kontrol edin (büyük/küçük harf duyarlı)
2. Kullanıcının kayıtlı olduğundan emin olun: **Authentication** → **Users**
3. Şifreniz en az 6 karakter olmalı
4. Gerekirse kullanıcıyı silip yeniden oluşturun

---

### ❌ "PGRST116: Cannot coerce result to single JSON object" hatası

**Sorun:** Profil tablosu boş veya profil bulunamıyor.

**Çözüm:**
- Endişelenmeyin! Uygulama artık otomatik profil oluşturacak
- Sayfayı yenileyin veya tekrar giriş yapın
- Hala sorun varsa SQL kodlarını tekrar çalıştırın

---

### ❌ "Profiles" tablosu bulunamıyor

**Sorun:** SQL kodları düzgün çalışmamış.

**Çözüm:**
1. **SQL Editor**'a gidin
2. `supabase_schema.sql` dosyasındaki kodları tekrar çalıştırın
3. Hata varsa console'da göreceksiniz
4. Hataları düzeltin ve tekrar deneyin

---

## ✅ Test Etme

Kurulumun doğru çalıştığını test edin:

1. **Yeni kullanıcı oluşturun:**
   - Uygulamayı başlatın: `npm run dev`
   - Register sayfasına gidin
   - Email, şifre ve tam ad ile kayıt olun

2. **Giriş yapın:**
   - Email doğrulaması kapalıysa direkt giriş yapabilirsiniz
   - Email doğrulaması açıksa önce emailinizi doğrulayın

3. **Profil kontrol:**
   - Başarılı giriş sonrası profile sayfasına gidin
   - Adınızın ve emailinizin göründüğünü kontrol edin

4. **Dilekçe oluşturun:**
   - Ana uygulamaya gidin
   - Bir test dilekçesi oluşturun
   - Profile sayfasında dilekçenin listelendiğini kontrol edin

---

## 📚 Ek Kaynaklar

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🆘 Yardım

Sorun devam ederse:

1. Browser console'u açın (F12)
2. Hatayı tam olarak kopyalayın
3. Supabase Dashboard'daki **Logs** bölümünü kontrol edin
4. SQL Editor'da tabloların oluşturulduğunu doğrulayın:
   ```sql
   SELECT * FROM profiles LIMIT 10;
   SELECT * FROM petitions LIMIT 10;
   ```

---

**Son güncelleme:** 2025-10-14
