# ⚡ Vekil Bilgileri - Hızlı Başlangıç

## 🎯 Ne Yaptık?

Artık yüklediğiniz belgelerden **avukat/vekil bilgileri** otomatik olarak çıkarılıp dilekçeye ekleniyor!

## 🚀 Nasıl Kullanılır?

### 1. Belge Yükle
Vekil bilgilerini içeren bir belge yükleyin:
```
✅ PDF (vekaletname, önceki dilekçe)
✅ Resim (kartvizit, belge fotoğrafı)
✅ Word belgesi
```

### 2. Otomatik Çıkarma
AI aşağıdaki bilgileri otomatik bulur:
- ✅ Avukat adı
- ✅ Baro bilgisi
- ✅ Adres
- ✅ Telefon
- ✅ Email

### 3. Dilekçede Göster
Dilekçe oluşturulduğunda vekil bilgileri otomatik eklenir!

## 📋 Örnek

### Belgede:
```
Av. Mehmet YILMAZ
Ankara Barosu
Baro Sicil No: 12345
Adres: Kızılay Mah. Atatürk Bulvarı No:10/5 Çankaya/ANKARA
Tel: (0312) 456 78 90
Email: m.yilmaz@example.com
```

### Dilekçede:
```
                        VEKİL

Adı Soyadı          : Av. Mehmet YILMAZ
Baro                : Ankara Barosu
Baro Sicil No       : 12345
Adresi              : Kızılay Mah. Atatürk Bulvarı No:10/5 Çankaya/ANKARA
Telefon             : (0312) 456 78 90
E-posta             : m.yilmaz@example.com
```

## ⚙️ Teknik Değişiklikler

### Yeni Tipler
```typescript
// types.ts
interface LawyerInfo {
    name: string;
    bar: string;
    barNumber: string;
    address: string;
    phone: string;
    email: string;
    title: string;
    tcNo?: string;
}

interface ContactInfo {
    name: string;
    address: string;
    phone: string;
    email: string;
    tcNo?: string;
}
```

### Güncellenmiş Fonksiyonlar
- ✅ `analyzeDocuments()` - Vekil bilgilerini çıkarır
- ✅ `generatePetition()` - Vekil bilgilerini dilekçeye ekler
- ✅ `reviewPetition()` - İncelemede vekil bilgilerini kontrol eder

## 📦 Dosyalar

### Yeni Dosyalar:
- ✅ `LAWYER_INFO_FEATURE.md` - Detaylı dokümantasyon
- ✅ `LAWYER_INFO_QUICKSTART.md` - Bu dosya

### Güncellenen Dosyalar:
- ✅ `types.ts` - Yeni tipler eklendi
- ✅ `services/geminiService.ts` - Vekil bilgisi çıkarma eklendi

## 🧪 Test Etme

1. Bir avukat kartviziti veya vekaletname yükleyin
2. Belge analizi sonuçlarını kontrol edin (Console'da görünür)
3. Dilekçe oluştururken vekil bilgilerinin eklendiğini doğrulayın

## 💡 İpuçları

- Belgeler **net ve okunaklı** olmalı
- PDF'ler **metin içermeli** (sadece resim değil)
- Standart **avukat formatı** kullanın ("Av." prefix)

## 🐛 Sorun Giderme

### Vekil bilgisi bulunamadı:
- Belgenin kalitesini kontrol edin
- "Av." veya "Avukat" kelimesinin olduğundan emin olun
- Manuel olarak "Özel Talimatlar"a ekleyin

### Yanlış bilgi çıkarıldı:
- Chat ile düzeltin
- Daha net belge yükleyin

## 📚 Daha Fazla Bilgi

- Detaylı dokümantasyon: `LAWYER_INFO_FEATURE.md`
- Supabase kurulumu: `SUPABASE_SETUP.md`
- Genel README: `README.md`

---

**Özellik versiyonu:** 1.0.0  
**Tarih:** 2025-10-14
