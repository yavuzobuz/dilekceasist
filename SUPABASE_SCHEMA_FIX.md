# 🔧 Supabase Schema Hata Çözümü

## ❌ Aldığınız Hata

```
ERROR: 42710: policy "..." already exists
```

## 🎯 Sebep

SQL dosyasını **ikinci kez** çalıştırmaya çalıştınız. Policies, triggers veya tablolar zaten var olduğu için hata veriyor.

## ✅ Çözüm

### Seçenek 1: İdempotent SQL Dosyası Kullan (ÖNERİLEN)

Yeni oluşturduğumuz `supabase_schema_idempotent.sql` dosyasını kullanın. Bu dosya:
- ✅ **Birden fazla kez çalıştırılabilir**
- ✅ Var olan policy'leri önce siler, sonra oluşturur
- ✅ Tablolar için `IF NOT EXISTS` kullanır
- ✅ Triggers için `CREATE OR REPLACE` kullanır

**Kullanım:**
```
1. Supabase Dashboard → SQL Editor
2. supabase_schema_idempotent.sql içeriğini kopyala
3. Paste → Run
4. ✅ Başarılı! (Kaç kez çalıştırırsanız çalıştırın)
```

### Seçenek 2: Eski Policies'i Manuel Sil

Eğer sadece policies sorunu varsa:

```sql
-- Petition favorites policies'i sil
DROP POLICY IF EXISTS "Anyone can view petition favorites" ON petition_favorites;
DROP POLICY IF EXISTS "Users can manage their own favorites" ON petition_favorites;

-- Tüm policies'i listele
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

### Seçenek 3: Tabloyu Komple Sil ve Yeniden Oluştur (DİKKAT: VERİ SİLİNİR!)

⚠️ **SADECE TEST/DEV ORTAMINDA KULLANIN!**

```sql
-- Petition favorites tablosunu sil
DROP TABLE IF EXISTS public.petition_favorites CASCADE;

-- Şimdi yeniden oluştur
-- (migration dosyanızdaki create table komutunu çalıştırın)
```

## 📋 Hangi Dosyayı Kullanmalıyım?

| Dosya | Açıklama | Ne Zaman Kullan |
|-------|----------|----------------|
| `supabase_schema.sql` | Orijinal schema | İlk kurulum (bir kez) |
| `supabase_schema_idempotent.sql` | Güvenli schema | Her zaman (tekrar çalıştırılabilir) |

## 🔍 Migration Klasörü Kontrolü

Eğer `supabase_migrations/` klasöründe birçok dosya varsa:

```
supabase_migrations/
├── FINAL_SETUP.sql                              ❌ Birden fazla dosya
├── add_favorites_feature.sql                     ❌ Karışık
├── create_public_petitions_table.sql             ❌ Çakışıyor
└── ...
```

**Çözüm:**
1. Bu klasörü yedekleyin
2. `supabase_schema_idempotent.sql` kullanın
3. Eski migration dosyalarını silip temiz başlayın

## 🧪 Test Etme

Schema'nın doğru çalıştığını test edin:

```sql
-- 1. Tabloları kontrol et
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';

-- Beklenen: profiles, petitions

-- 2. Policies'i kontrol et
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';

-- 3. Triggers'ı kontrol et
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

## ✅ Başarı Kontrol Listesi

Schema doğru kurulduysa:

- [ ] `profiles` tablosu var
- [ ] `petitions` tablosu var
- [ ] RLS policies aktif
- [ ] Triggers çalışıyor
- [ ] Yeni kullanıcı kaydında otomatik profil oluşuyor
- [ ] Kullanıcılar sadece kendi verilerini görebiliyor

## 🚨 Yaygın Hatalar

### Hata 1: "relation already exists"
```
ERROR: relation "profiles" already exists
```

**Çözüm:** `CREATE TABLE IF NOT EXISTS` kullanın (idempotent dosyada zaten var)

### Hata 2: "policy already exists"
```
ERROR: policy "..." already exists
```

**Çözüm:** Önce `DROP POLICY IF EXISTS` (idempotent dosyada zaten var)

### Hata 3: "trigger already exists"
```
ERROR: trigger "..." already exists
```

**Çözüm:** `CREATE OR REPLACE TRIGGER` kullanın (idempotent dosyada zaten var)

## 💡 Best Practices

1. **Her zaman idempotent SQL yazın**
   - `IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE` kullanın

2. **Migration dosyalarını versiyonlayın**
   - `001_create_tables.sql`
   - `002_add_columns.sql`
   - vb.

3. **Production'da dikkatli olun**
   - Her zaman yedek alın
   - `DROP` komutlarını dikkatli kullanın
   - Test ortamında önce deneyin

4. **Schema değişikliklerini dökümante edin**
   - Ne değişti, neden değişti
   - Rollback planı hazırlayın

## 📚 İlgili Dosyalar

- `supabase_schema.sql` - Orijinal schema (bir kez çalıştırılır)
- `supabase_schema_idempotent.sql` - Güvenli schema (tekrar çalıştırılabilir) ✅
- `SUPABASE_SETUP.md` - Genel kurulum kılavuzu
- `QUICK_FIX.md` - Hızlı sorun giderme

## 🆘 Hala Sorun mu Var?

### Debug Komutları:

```sql
-- Tüm public tabloları listele
\dt public.*

-- Tüm policies listele
\dp public.*

-- Tüm functions listele
\df public.*

-- Tüm triggers listele
SELECT * FROM information_schema.triggers 
WHERE trigger_schema = 'public';
```

### Sıfırdan Başlama (Son Çare):

⚠️ **TÜM VERİLER SİLİNİR!**

```sql
-- Tüm public tabloları sil
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Şimdi idempotent schema'yı çalıştır
-- (supabase_schema_idempotent.sql)
```

---

**Son güncelleme:** 2025-10-14

💡 **İpucu:** Production'da her zaman `supabase_schema_idempotent.sql` kullanın!
