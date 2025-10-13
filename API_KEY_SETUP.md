# API Key Kurulum Rehberi

## ⚠️ Sorun: "API key not valid" Hatası

Bu hata, Gemini API key'inin doğru yapılandırılmadığını gösterir.

## ✅ Çözüm Adımları

### 1. API Key'i Alın

**Google AI Studio'dan yeni bir API key alın:**
- 🔗 https://aistudio.google.com/app/apikey
- "Create API Key" butonuna tıklayın
- Oluşturulan key'i kopyalayın

### 2. `.env` Dosyasını Kontrol Edin

`.env` dosyası **MUTLAKA** şu formatta olmalı:

```bash
VITE_GEMINI_API_KEY=AIzaSy...your_actual_key_here
```

**ÖNEMLİ:**
- ✅ `VITE_` prefix'i **ZORUNLU** (Vite için)
- ✅ Key'den önce/sonra boşluk YOK
- ✅ Tırnak işareti YOK
- ✅ Dosya adı tam olarak `.env`

### 3. Sunucuları Yeniden Başlatın

API key değişikliği için **mutlaka** yeniden başlatın:

```bash
# Mevcut sunucuları durdurun (Ctrl+C)
# Sonra tekrar başlatın:
npm run dev:all
```

### 4. Tarayıcıyı Yenileyin

- `Ctrl + Shift + R` (Hard refresh)
- veya Developer Tools → Application → Clear Storage

## 🔍 Test Etme

### Konsol Kontrolü

Tarayıcı konsolunu açın (F12) ve şunu kontrol edin:

```javascript
console.log(import.meta.env.VITE_GEMINI_API_KEY)
```

**Beklenen sonuç:** API key görünmeli (gizlenmemiş)

### Hata Mesajları

Eğer konsolda şunu görüyorsanız:
```
⚠️ VITE_GEMINI_API_KEY not found in environment variables!
```

**Çözüm:**
1. `.env` dosyasının proje kök dizininde olduğundan emin olun
2. `VITE_` prefix'ini kontrol edin
3. Sunucuları yeniden başlatın

## 📋 Doğru Dosya Yapısı

```
hukuk-asistanı_-ai-dilekçe-oluşturucu/
├── .env                    ← Burası! (VITE_GEMINI_API_KEY=...)
├── .env.example            ← Şablon
├── package.json
├── vite.config.ts          ← API key tanımı
├── services/
│   └── geminiService.ts    ← API key kullanımı
└── ...
```

## 🛠️ Manuel Test (PowerShell)

```powershell
# .env dosyasını görüntüle
Get-Content .env

# Beklenen çıktı:
# VITE_GEMINI_API_KEY=AIzaSy...

# Eğer farklıysa düzelt:
"VITE_GEMINI_API_KEY=YOUR_ACTUAL_KEY_HERE" | Out-File -FilePath .env -Encoding UTF8
```

## 🔐 API Key Doğrulama

API key'in çalıştığını test etmek için:

```bash
# PowerShell
$key = "YOUR_API_KEY"
Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models?key=$key" -Method GET
```

**Başarılı ise:** Model listesi döner  
**Başarısız ise:** 400 veya 403 hatası (key geçersiz)

## 📝 Vite Environment Variables Kuralları

Vite'da client-side environment variables için:

1. ✅ **Prefix:** `VITE_` ile başlamalı
2. ✅ **Erişim:** `import.meta.env.VITE_*` ile erişilir
3. ✅ **Restart:** `.env` değiştiğinde sunucu yeniden başlatılmalı
4. ✅ **Build Time:** Değerler build anında gömülür

## ❌ Yaygın Hatalar

| Hata | Neden | Çözüm |
|------|-------|-------|
| `undefined` | `VITE_` prefix yok | Prefix ekle |
| `not valid` | Key yanlış/süresi dolmuş | Yeni key al |
| Değişiklik yansımıyor | Sunucu yeniden başlatılmamış | Restart yap |
| Dosya bulunamıyor | `.env` yanlış konumda | Kök dizine taşı |

## 🎯 Hızlı Çözüm

```bash
# 1. Yeni API key al
# 2. .env dosyasını oluştur/güncelle
echo "VITE_GEMINI_API_KEY=YOUR_NEW_KEY" > .env

# 3. Sunucuları yeniden başlat
npm run dev:all

# 4. Tarayıcıyı yenile (Ctrl+Shift+R)
```

## 📞 Hala Çalışmıyor mu?

1. **API Key'i Kontrol Et:**
   - https://aistudio.google.com/app/apikey
   - Key'in aktif olduğundan emin olun
   - Gerekirse yeni key oluşturun

2. **Dosya İzinlerini Kontrol Et:**
   ```bash
   # Windows
   icacls .env
   ```

3. **Node Modules'u Temizle:**
   ```bash
   rm -r node_modules
   npm install
   ```

4. **Vite Cache'i Temizle:**
   ```bash
   rm -r node_modules/.vite
   npm run dev:all
   ```

## ✅ Başarılı Kurulum Kontrolü

Şunları görmelisiniz:

1. **Konsol (F12):**
   - ✅ API key warning YOK
   - ✅ `VITE_GEMINI_API_KEY` tanımlı

2. **Network Tab:**
   - ✅ `generativelanguage.googleapis.com` istekleri 200 OK

3. **Uygulama:**
   - ✅ Belge analizi çalışıyor
   - ✅ "API key not valid" hatası YOK

---

**Son Güncelleme:** 2025-10-13  
**İletişim:** Sorun devam ederse yeni API key alın ve `.env` dosyasını yeniden oluşturun.
