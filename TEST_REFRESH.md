# 🧪 Sayfa Yenileme Testi

## ⚡ Hızlı Çözüm (En Etkili)

### Adım 1: Sunucuyu Tamamen Durdur
```powershell
# Tüm node process'lerini durdur
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

# Veya Terminal'de Ctrl+C
```

### Adım 2: Port Temizle
```powershell
# 3000 portunu kullanan process'i bul
netstat -ano | findstr :3000

# Eğer birşey bulursa, process ID'yi not et ve durdur
# Örnek: Stop-Process -Id 12345 -Force
```

### Adım 3: Cache Temizle
```powershell
# .vite klasörünü sil (varsa)
Remove-Item -Recurse -Force .vite -ErrorAction SilentlyContinue

# dist klasörünü sil (varsa)
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
```

### Adım 4: Yeniden Başlat
```powershell
npm run dev
```

### Adım 5: Browser'da Test
```
1. Yeni incognito pencere aç (Ctrl+Shift+N)
2. http://localhost:3000 git
3. "Başla" tıkla → /app sayfasına git
4. F5 yap → Çalışmalı! ✅
```

---

## 🔍 Detaylı Debug

### Test 1: Hangi Port Açık?
```powershell
netstat -ano | findstr :3000
```

**Beklenen:** 
```
TCP    0.0.0.0:3000      0.0.0.0:0     LISTENING    12345
```

### Test 2: Server Çalışıyor mu?
Terminal'de şunu görmelisiniz:
```
  VITE v6.2.0  ready in 1234 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

### Test 3: Browser Console
```
F12 → Console → Hata var mı?
```

**Eğer "runtime.lastError" görüyorsanız:**
- Bu **browser extension** hatası (Chrome/Edge)
- Uygulamanızı etkilemez
- Görmezden gelebilirsiniz veya extensions'ları devre dışı bırakın

---

## 🎯 Spesifik Test Senaryoları

### Senaryo 1: Ana Sayfa
```
URL: http://localhost:3000/
F5 yap → Ana sayfa kalmalı ✅
```

### Senaryo 2: App Sayfası (ASIL TEST)
```
URL: http://localhost:3000/app
F5 yap → App sayfası kalmalı ✅

❌ Eğer kaynak kodu görüyorsanız:
→ index.html yerine index.tsx serve ediliyor
→ Vite config sorunu
```

### Senaryo 3: Login Sayfası
```
URL: http://localhost:3000/login
F5 yap → Login sayfası kalmalı ✅
```

---

## 🐛 "runtime.lastError" Hatası

Bu hata **zararsızdır** ve şunlardan kaynaklanır:
- Chrome/Edge extensions
- React DevTools
- Redux DevTools
- Diğer browser eklentileri

### Çözüm 1: Görmezden Gel
Uygulamanızı etkilemiyorsa sorun değil.

### Çözüm 2: Extensions'ı Kapat
```
1. Chrome/Edge → chrome://extensions/
2. Tüm extension'ları kapat
3. Sayfayı yenile
4. Hata gitmeli
```

### Çözüm 3: Incognito Kullan
```
Ctrl+Shift+N → Incognito mode
Extension'lar varsayılan olarak kapalı
```

---

## 🚨 Eğer Hala "Kaynak Kodu" Görünüyorsa

### Problem: index.tsx Serve Ediliyor

**Sebep:** Vite, TypeScript dosyasını HTML olarak serve ediyor.

**Çözüm:**

#### 1. package.json Scripts Kontrol
```json
{
  "scripts": {
    "dev": "vite",  // ✅ Doğru
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### 2. index.html Kontrol
```html
<!DOCTYPE html>
<html>
<head>
  <base href="/" />  <!-- ✅ Eklendi -->
  <title>...</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/index.tsx"></script>  <!-- ✅ type="module" -->
</body>
</html>
```

#### 3. Dosya Yapısı Kontrol
```
hukuk-asistanı/
├── index.html          ✅ Root'ta olmalı
├── index.tsx           ✅ Root'ta olmalı
├── vite.config.ts      ✅ Root'ta olmalı
├── App.tsx
└── src/
    └── ...
```

#### 4. Hard Reset
```powershell
# Herşeyi temizle
Remove-Item -Recurse -Force node_modules, package-lock.json, .vite, dist

# Yeniden yükle
npm install

# Başlat
npm run dev
```

---

## ✅ Başarı Kriterleri

### ✅ Çalışıyor:
- Ana sayfa yükleniyor
- /app'e tıklayınca geçiş yapıyor
- F5 yapınca aynı sayfa kalıyor
- Console'da critical hata yok

### ❌ Çalışmıyor:
- F5 sonrası beyaz sayfa
- F5 sonrası kaynak kodu görünüyor
- F5 sonrası 404 hatası
- Console'da route hatası

---

## 🎬 Adım Adım Video Gibi Test

```powershell
# 1. Temizlik
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .vite -ErrorAction SilentlyContinue

# 2. Başlat
npm run dev

# 3. Browser'da
# - http://localhost:3000 aç
# - "Başla" tıkla
# - Adres çubuğunda "localhost:3000/app" görünmeli
# - F5 yap
# - Hala app sayfasında olmalısın ✅
```

---

## 📊 Sonuç Raporu

Test yaptıktan sonra doldurun:

- [ ] Ana sayfa (/) yenileme çalışıyor
- [ ] App sayfası (/app) yenileme çalışıyor ← **EN ÖNEMLİ**
- [ ] Login sayfası (/login) yenileme çalışıyor
- [ ] Profile sayfası (/profile) yenileme çalışıyor
- [ ] runtime.lastError görmezden geliniyor
- [ ] Incognito modda test edildi
- [ ] Production build test edildi (`npm run build && npm run preview`)

---

**Hala sorun varsa screenshot alın ve paylaşın!**

📸 Screenshot alın:
1. F12 → Console tab
2. Network tab
3. Hata mesajları
