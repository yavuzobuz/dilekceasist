# 🔄 React Router Sayfa Yenileme Sorunu - Çözüm Kılavuzu

## 🐛 Problem

`/app` veya diğer sayfalarda F5 ile sayfa yenilendiğinde "kaynak kodu" görünüyor veya 404 hatası alınıyor.

## 🎯 Neden Oluyor?

React Router, **client-side routing** kullanır. Yani:
- `/app` linkine tıkladığınızda → JavaScript route değiştirir ✅
- Sayfayı yenilediğinizde → Sunucu `/app` dosyasını aramaya çalışır ❌

## ✅ Çözümler

### 1️⃣ Development Server'ı Yeniden Başlat

En basit çözüm:

```bash
# Sunucuyu durdur (Ctrl+C)
# Tekrar başlat
npm run dev
```

### 2️⃣ Vite Config Kontrol

`vite.config.ts` dosyasında şu satırları kontrol edin:

```typescript
export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        open: true,
        // historyApiFallback otomatik aktif
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // ... diğer ayarlar
    };
});
```

✅ **Not:** Vite'da `historyApiFallback` **varsayılan olarak aktif**tir, ekstra ayar gerekmez.

### 3️⃣ Production Build Testi

Development'ta çalışıyorsa ama production'da sorun varsa:

```bash
# Build al
npm run build

# Preview ile test et
npm run preview
```

Eğer preview'da sorun varsa, deploy ayarlarınızı kontrol edin.

### 4️⃣ Deploy Ayarları

#### **Vercel İçin**

`vercel.json` dosyası oluşturuldu ✅:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### **Netlify İçin**

`public/_redirects` dosyası oluşturuldu ✅:
```
/*    /index.html   200
```

#### **Apache İçin**

`.htaccess` oluşturun:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

#### **Nginx İçin**

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

### 5️⃣ Browser Cache Temizle

Bazen cache sorunu olabilir:

1. **Chrome/Edge:** `Ctrl + Shift + Delete` → "Cached images and files" → Clear
2. **Firefox:** `Ctrl + Shift + Delete` → "Cache" → Clear
3. Veya **Incognito/Private** modda test edin

### 6️⃣ Port Çakışması Kontrol

Başka bir uygulama 3000 portunu kullanıyor olabilir:

```bash
# Windows'ta port kontrolü
netstat -ano | findstr :3000

# Port değiştirmek için vite.config.ts
server: {
  port: 3001,  // Farklı bir port dene
}
```

## 🧪 Test Etme

### Test 1: Ana Sayfa
```
1. http://localhost:3000 → Landing page ✅
2. F5 (yenile) → Landing page ✅
```

### Test 2: App Sayfası
```
1. Ana sayfadan "Başla" tıkla
2. http://localhost:3000/app açılır ✅
3. F5 (yenile) → App sayfası kalmalı ✅
```

### Test 3: Login Sayfası
```
1. http://localhost:3000/login
2. F5 (yenile) → Login sayfası kalmalı ✅
```

### Test 4: Profil Sayfası
```
1. Giriş yap
2. http://localhost:3000/profile
3. F5 (yenile) → Profile sayfası kalmalı ✅
```

## 🔧 Hala Çalışmıyor mu?

### Debug Adımları:

#### 1. Console Logları Kontrol
```
F12 (Developer Tools) → Console
- Kırmızı hata var mı?
- Network tab'da 404 hatası var mı?
```

#### 2. Network Tab Kontrol
```
F12 → Network → F5 ile yenile
- index.html yükleniyor mu?
- Hangi dosyalar 404 veriyor?
```

#### 3. Sunucu Logları
Terminal'de şunları görmeli:
```
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

#### 4. Package.json Scripts Kontrol
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

### Sık Karşılaşılan Hatalar:

#### ❌ "Cannot GET /app"
**Sebep:** Server SPA fallback yapmıyor  
**Çözüm:** Vite config'i kontrol et, sunucuyu yeniden başlat

#### ❌ "404 Not Found"
**Sebep:** index.html bulunamıyor  
**Çözüm:** index.html'in root dizinde olduğundan emin ol

#### ❌ "Blank page"
**Sebep:** JavaScript hatası veya build problemi  
**Çözüm:** Console'da hata kontrol et, `npm install` yap

#### ❌ "Source code görünüyor"
**Sebep:** HTML olarak serve edilmiyor  
**Çözüm:** `index.tsx` doğru yükleniyor mu kontrol et

## 📚 Ek Kaynaklar

- [Vite Server Options](https://vitejs.dev/config/server-options.html)
- [React Router - BrowserRouter](https://reactrouter.com/en/main/router-components/browser-router)
- [Deploying to Vercel](https://vercel.com/docs/frameworks/vite)
- [Deploying to Netlify](https://docs.netlify.com/routing/redirects/)

## 🆘 Acil Çözüm

Hiçbir şey işe yaramazsa:

```bash
# 1. Node modules temizle
rm -rf node_modules package-lock.json

# 2. Yeniden yükle
npm install

# 3. Build temizle (varsa .vite klasörü)
rm -rf .vite

# 4. Sunucuyu başlat
npm run dev
```

---

## ✅ Checklist

Deploy etmeden önce kontrol edin:

- [ ] `vite.config.ts` server ayarları doğru
- [ ] `vercel.json` veya `_redirects` dosyası var
- [ ] `npm run build` hatasız çalışıyor
- [ ] `npm run preview` ile test edildi
- [ ] Tüm route'lar yenilemede çalışıyor
- [ ] Production'da test edildi

---

**Son güncelleme:** 2025-10-14

💡 **İpucu:** Development'ta sorun yoksa ama production'da varsa, deploy platformunuzun dokümantasyonunu kontrol edin!
