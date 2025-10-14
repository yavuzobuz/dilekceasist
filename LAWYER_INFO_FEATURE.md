# 📋 Vekil ve İletişim Bilgileri Otomatik Çıkarma Özelliği

## 🎯 Özellik Açıklaması

Artık yüklediğiniz belgelerden **avukat/vekil bilgileri** ve **iletişim bilgileri** otomatik olarak çıkarılır ve dilekçeye eklenir!

## ✨ Neler Çıkarılıyor?

### 1. **Vekil Bilgileri** (Lawyer Info)
- ✅ Ad Soyad
- ✅ Baro Adı (örn: "Ankara Barosu")
- ✅ Baro Sicil Numarası
- ✅ İş Adresi
- ✅ Telefon Numarası
- ✅ Email Adresi
- ✅ TC Kimlik No (varsa)
- ✅ Unvan (örn: "Avukat")

### 2. **İletişim Bilgileri** (Contact Info)
- ✅ Tarafların Adları
- ✅ Adresler
- ✅ Telefon Numaraları
- ✅ Email Adresleri
- ✅ TC Kimlik Numaraları (varsa)

## 📄 Nasıl Çalışır?

### Adım 1: Belgelerinizi Yükleyin
Aşağıdaki belge tiplerinden herhangi birini yükleyebilirsiniz:
- PDF dosyaları
- Resim dosyaları (JPG, PNG)
- Word belgeleri (.docx)
- UDF dosyaları

### Adım 2: Otomatik Analiz
Gemini AI, belgelerinizi analiz ederek:
1. Vekil/avukat bilgilerini bulur
2. Tarafların iletişim bilgilerini çıkarır
3. Bu bilgileri yapılandırılmış formatta kaydeder

### Adım 3: Dilekçeye Otomatik Ekleme
Dilekçe oluşturulurken:
- **Vekil bilgileri** dilekçenin sonunda imza kısmına eklenir
- **İletişim bilgileri** dilekçe başlığında ve taraflar kısmında kullanılır

## 💡 Örnek Kullanım

### Belgede Şu Bilgiler Varsa:
```
Av. Mehmet Yılmaz
Ankara Barosu
Baro Sicil No: 12345
Adres: Kızılay Mah. Atatürk Bulvarı No:10/5 Çankaya/ANKARA
Tel: (0312) 456 78 90
Email: m.yilmaz@example.com
```

### Dilekçede Şöyle Görünür:
```
                        VEKİL

Adı Soyadı          : Av. Mehmet YILMAZ
Baro                : Ankara Barosu
Baro Sicil No       : 12345
Adresi              : Kızılay Mah. Atatürk Bulvarı No:10/5 Çankaya/ANKARA
Telefon             : (0312) 456 78 90
E-posta             : m.yilmaz@example.com

                                                    (İmza)
```

## 🔍 Hangi Bilgiler Çıkarılır?

### ✅ Başarıyla Çıkarılabilir:
- Standart avukat bilgileri (Ad, baro, sicil no)
- Adres bilgileri (mahalle, cadde, ilçe, il)
- Telefon numaraları (sabit ve cep)
- Email adresleri
- TC Kimlik numaraları
- Firma/şirket bilgileri

### ⚠️ Dikkat Edilmesi Gerekenler:
- Belgeler **okunaklı** olmalı
- El yazısı yerine **basılı/dijital** metin tercih edilmeli
- PDF'ler **metin içermeli** (sadece görüntü değil)
- Bilgiler **düzenli formatta** olmalı

## 📊 Çıkarılan Bilgilerin Yapısı

### TypeScript Tipleri:
```typescript
// Vekil Bilgisi
interface LawyerInfo {
    name: string;           // "Av. Mehmet Yılmaz"
    bar: string;            // "Ankara Barosu"
    barNumber: string;      // "12345"
    address: string;        // Tam adres
    phone: string;          // "(0312) 456 78 90"
    email: string;          // "m.yilmaz@example.com"
    title: string;          // "Avukat"
    tcNo?: string;          // "12345678901" (opsiyonel)
}

// İletişim Bilgisi
interface ContactInfo {
    name: string;           // Kişi/Kurum adı
    address: string;        // Adres
    phone: string;          // Telefon
    email: string;          // Email
    tcNo?: string;          // TC No (opsiyonel)
}
```

## 🚀 Kullanım İpuçları

### 1. **Kaliteli Belgeler Yükleyin**
- Yüksek çözünürlüklü taramalar kullanın
- Bulanık olmayan fotoğraflar çekin
- PDF'lerin metin katmanı olsun

### 2. **Standart Format Kullanın**
Belgelerinizde avukat bilgileri şu formatta olmalı:
```
Av. [Ad Soyad]
[Baro Adı] Barosu
Baro Sicil No: [Numara]
Adres: [Tam Adres]
Tel: [Telefon]
E-posta: [Email]
```

### 3. **Eksik Bilgileri Tamamlayın**
Eğer bazı bilgiler çıkarılamadıysa:
- Chat ile asistana sorun
- Manuel olarak "Özel Talimatlar" kısmına ekleyin

## 🔧 Teknik Detaylar

### Analiz Süreci:
1. **Belge Yükleme**: PDF/Resim/Word yükle
2. **OCR ve Metin Çıkarma**: Gemini AI içeriği okur
3. **Bilgi Çıkarma**: Yapılandırılmış JSON'a dönüştürür
4. **Doğrulama**: Eksik alanları kontrol eder
5. **Dilekçe Entegrasyonu**: Uygun yerlere ekler

### API Response Örneği:
```json
{
  "summary": "...",
  "potentialParties": ["..."],
  "caseDetails": { ... },
  "lawyerInfo": {
    "name": "Av. Mehmet Yılmaz",
    "bar": "Ankara Barosu",
    "barNumber": "12345",
    "address": "Kızılay Mah. Atatürk Bulvarı No:10/5 Çankaya/ANKARA",
    "phone": "(0312) 456 78 90",
    "email": "m.yilmaz@example.com",
    "title": "Avukat"
  },
  "contactInfo": [
    {
      "name": "ABC Şirketi",
      "address": "...",
      "phone": "...",
      "email": "..."
    }
  ]
}
```

## ❓ Sık Sorulan Sorular

### S: Birden fazla avukat varsa ne olur?
**C:** Şu an ilk bulunan avukat bilgisi kullanılır. İleriki güncellemelerde çoklu vekil desteği eklenecek.

### S: Vekil bilgisi bulunamazsa ne olur?
**C:** Dilekçe normal şekilde oluşturulur, sadece vekil kısmı boş kalır veya "Vekil bilgisi sağlanmadı" mesajı görünür.

### S: Manuel olarak vekil bilgisi ekleyebilir miyim?
**C:** Evet! "Özel Talimatlar" bölümünden manuel olarak ekleyebilirsiniz:
```
Vekil Bilgileri:
- Ad: Av. Ayşe Demir
- Baro: İstanbul Barosu
- Sicil No: 54321
- Adres: ...
```

### S: Hangi dillerde çalışır?
**C:** Şu an sadece **Türkçe** belgeler destekleniyor.

## 🎨 Dilekçe Formatı

Vekil bilgileri dilekçenin sonunda şöyle görünür:

```
                        VEKİL

Adı Soyadı          : [name]
Baro                : [bar]
Baro Sicil No       : [barNumber]
Adresi              : [address]
Telefon             : [phone]
E-posta             : [email]

Tarih: [tarih]

                                                    (İmza)
                                              [name]
```

## 🔄 Gelecek Güncellemeler

- [ ] Çoklu vekil desteği
- [ ] Vekaletname bilgisi çıkarma
- [ ] İmza ve kaşe algılama
- [ ] Otomatik adres formatlaması
- [ ] Yabancı dil desteği

## 📞 Destek

Sorun yaşarsanız veya öneriniz varsa:
- GitHub Issues'da bildirin
- Dokümantasyonu okuyun: `README.md`
- Hızlı çözüm için: `QUICK_FIX.md`

---

**Son güncelleme:** 2025-10-14
**Özellik versiyonu:** 1.0.0
