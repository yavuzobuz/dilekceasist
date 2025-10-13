# TIFF Dosya İşleme Sorun Giderme

## 🖼️ TIFF Dosyası Neden Okunmuyor?

### Yaygın Nedenler:

1. **Browser Cache Sorunu**
   - Eski kod hala cache'de olabilir
   - Çözüm: Hard refresh (`Ctrl + Shift + R`)

2. **TIFF Formatı Uyumsuz**
   - Bazı TIFF alt formatları desteklenmeyebilir
   - Özellikle sıkıştırılmış TIFF'ler sorun çıkarabilir

3. **Dosya Bozuk**
   - TIFF dosyası hasar görmüş olabilir
   - Başka bir TIFF dosyasıyla test edin

4. **tiff.js Kütüphanesi Sorunu**
   - Kütüphane yüklenmemiş olabilir
   - Node modules güncel değil

## 🔍 Hata Tespiti

### 1. Tarayıcı Konsolunu Açın (F12)

TIFF yüklediğinizde şu logları göreceksiniz:

```
✅ Başarılı:
Processing TIFF file: dosya.tif, size: 123456 bytes
ArrayBuffer loaded, length: 123456
TIFF object created, width: 2480, height: 3508
Canvas created: 2480x3508
✅ TIFF processed successfully: dosya.tif

❌ Hatalı:
Processing TIFF file: dosya.tif, size: 123456 bytes
❌ Error processing TIFF file dosya.tif: [hata mesajı]
```

### 2. Hata Mesajlarını Kontrol Edin

| Hata | Neden | Çözüm |
|------|-------|-------|
| `Cannot read property 'width'` | TIFF parse edilemedi | Dosya formatını kontrol edin |
| `Invalid TIFF` | Geçersiz format | Dosyayı dönüştürün |
| `Out of memory` | Dosya çok büyük | Dosya boyutunu küçültün |
| `Undefined buffer` | ArrayBuffer yüklenemedi | Tarayıcıyı yeniden başlatın |

## 🛠️ Çözüm Adımları

### Adım 1: Hard Refresh
```bash
# Tarayıcıda:
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

### Adım 2: Cache Temizleme
```bash
# F12 → Application → Clear Storage → Clear site data
```

### Adım 3: Node Modules Kontrolü
```bash
# tiff.js kurulu mu?
npm list tiff.js

# Çıktı:
# tiff.js@1.0.0
```

### Adım 4: Sunucuları Yeniden Başlat
```bash
# Ctrl+C ile durdur
npm run dev:all
```

### Adım 5: TIFF Dosyasını Test Et

**Alternatif TIFF oluşturma:**
1. Herhangi bir görüntüyü açın (Paint, Photoshop, vb.)
2. "Save As" → TIFF formatı seçin
3. Sıkıştırma: "None" seçin (önemli!)
4. Kaydedip test edin

## 📋 Desteklenen TIFF Formatları

### ✅ Desteklenen:
- Uncompressed TIFF
- LZW compressed
- PackBits compressed
- Grayscale TIFF
- RGB TIFF

### ❌ Desteklenmeyen:
- JPEG compressed TIFF (TIFF-JPEG)
- CCITT Group 3/4 compressed
- Multi-page TIFF (sadece ilk sayfa)
- CMYK TIFF

## 🔄 TIFF Dönüştürme

### Windows (Paint ile):
```
1. TIFF dosyasını Paint ile aç
2. File → Save As → PNG
3. PNG dosyasını kullan
```

### Online Araçlar:
- https://convertio.co/tif-png/
- https://www.zamzar.com/convert/tif-to-png/

### ImageMagick (Komut Satırı):
```bash
# TIFF → PNG
magick convert input.tif output.png

# TIFF sıkıştırmayı kaldır
magick convert input.tif -compress none output_uncompressed.tif
```

## 🐛 Debug Modu

### Console'da TIFF Bilgilerini Görün

Tarayıcı konsolunda (F12) şu logları göreceksiniz:

```javascript
// Başarılı işlem:
Processing TIFF file: mahkeme_karari.tif, size: 2456789 bytes
ArrayBuffer loaded, length: 2456789
TIFF object created, width: 2480, height: 3508
Canvas created: 2480x3508
✅ TIFF processed successfully: mahkeme_karari.tif

// Bu bilgiler:
// - Dosya adı
// - Dosya boyutu
// - Görüntü boyutu (width x height)
// - İşlem durumu
```

## ⚠️ runtime.lastError Hatası

Bu hata TIFF ile **alakasız**:

```
Unchecked runtime.lastError: The message port closed before a response was received.
```

**Neden:**
- Bir **browser extension** (eklenti) hata veriyor
- Örn: Password manager, ad blocker, vb.

**Çözüm:**
- **İgnore edin** (uygulamanızı etkilemez)
- Veya gizli pencere (Incognito) kullanın
- Veya extensions'ları devre dışı bırakın

**Test:**
```
1. Incognito mode aç (Ctrl+Shift+N)
2. http://localhost:3000
3. TIFF yükle
4. Hata hala varsa asıl sorun TIFF ile ilgilidir
```

## 📊 Test TIFF Dosyası Oluşturma

### Python ile:
```python
from PIL import Image
import numpy as np

# Basit TIFF oluştur
img = Image.new('RGB', (800, 600), color='white')
img.save('test.tif', compression='none')
print("Test TIFF created: test.tif")
```

### Node.js ile:
```javascript
const sharp = require('sharp');

sharp({
  create: {
    width: 800,
    height: 600,
    channels: 3,
    background: { r: 255, g: 255, b: 255 }
  }
})
.tiff({ compression: 'none' })
.toFile('test.tif')
.then(() => console.log('Test TIFF created'))
.catch(err => console.error(err));
```

## ✅ Başarılı Test

Şunları görmelisiniz:

1. **Console:**
   ```
   Processing TIFF file: ...
   ✅ TIFF processed successfully: ...
   ```

2. **UI:**
   - "Belge analizi başarıyla tamamlandı"
   - Hata mesajı YOK

3. **Network:**
   - API'ye TIFF data gönderildi
   - 200 OK response

## 🆘 Hala Çalışmıyor mu?

### Son Çare Çözümler:

1. **TIFF'i PNG'ye çevir ve PNG kullan**
   ```bash
   # Online: convertio.co
   # veya Paint ile aç → Save As PNG
   ```

2. **tiff.js'i yeniden yükle**
   ```bash
   npm uninstall tiff.js
   npm install tiff.js@1.0.0
   npm run dev:all
   ```

3. **Node modules'u temizle**
   ```bash
   rm -r -force node_modules
   npm install
   npm run dev:all
   ```

4. **Başka TIFF kütüphanesi dene**
   - Gerekirse `tiff.js` yerine `utif` kullanılabilir
   - Kod değişikliği gerektirir

## 📞 Destek

Sorun devam ediyorsa:

1. **Konsol logunu** kopyalayın
2. **TIFF dosya özelliklerini** kontrol edin:
   - Sıkıştırma türü
   - Bit derinliği
   - Boyut (width x height)
3. **Farklı bir TIFF** dosyasıyla test edin

---

**Güncelleme:** 2025-10-13  
**Versiyon:** 1.0
