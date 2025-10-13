# UDF Export Özelliği Dokümantasyonu

## 🎯 UDF Nedir?

**UDF (Universal Document Format)**, Türkiye'de yaygın olarak kullanılan bir yasal belge formatıdır. Özellikle:
- E-Devlet sistemleri
- UYAP (Ulusal Yargı Ağı Projesi)
- Hukuki belge arşivleme

sistemlerinde kullanılır.

## 📦 UDF Dosya Yapısı

UDF dosyaları aslında bir **ZIP arşividir** ve içinde:

```
dilekce.udf (ZIP arşivi)
├── content.xml      # Belge içeriği (XML formatında)
└── mimetype         # MIME type tanımı
```

### content.xml Örneği:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <title>Dilekçe</title>
    <author>Hukuk Asistanı AI</author>
    <date>2025-10-13T22:18:26.000Z</date>
  </metadata>
  <content>
    <![CDATA[
      ... Dilekçe metni buraya gelir ...
    ]]>
  </content>
</document>
```

## 🔄 İçe Aktarma vs Dışa Aktarma

### İçe Aktarma (App.tsx - Satır 119-145)

**UDF → Metin Çıkarma:**
```typescript
// 1. UDF dosyası ZIP olarak açılır
const loadedZip = await zip.loadAsync(file);

// 2. İçindeki XML dosyası bulunur
for (const fileName in loadedZip.files) {
    if (fileName.toLowerCase().endsWith('.xml')) {
        xmlFile = fileObject;
        break;
    }
}

// 3. XML içeriği okunur
xmlContent = await xmlFile.async('string');
```

### Dışa Aktarma (PetitionView.tsx - Satır 199-239)

**Metin → UDF Oluşturma:**
```typescript
// 1. HTML'den düz metin çıkar
const textContent = tempDiv.innerText || tempDiv.textContent;

// 2. XML formatında yapılandır
const xmlContent = `<?xml version="1.0"?>
<document>
  <metadata>...</metadata>
  <content><![CDATA[${textContent}]]></content>
</document>`;

// 3. ZIP arşivi oluştur
const zip = new JSZip();
zip.file('content.xml', xmlContent);
zip.file('mimetype', 'application/vnd.udf');

// 4. .udf olarak kaydet
const zipBlob = await zip.generateAsync({ type: 'blob' });
saveAs(zipBlob, 'dilekce.udf');
```

## ✨ Eklenen Özellikler

### 1. handleDownloadUdf() Fonksiyonu

**Lokasyon:** `components/PetitionView.tsx` (Satır 199-239)

**Ne Yapar:**
1. ✅ HTML içeriğini düz metne dönüştürür
2. ✅ XML yapısı oluşturur (metadata + content)
3. ✅ JSZip ile ZIP arşivi oluşturur
4. ✅ `.udf` uzantısıyla indirir

**Avantajlar:**
- 📦 E-Devlet/UYAP ile uyumlu
- 🔒 Standart format
- 📅 Metadata (tarih, yazar) içerir
- 🌐 UTF-8 Türkçe karakter desteği

### 2. İndirme Menüsü Güncellemesi

**4 Format Artık Destekleniyor:**

| Format | İkon | Açıklama |
|--------|------|----------|
| PDF | 📕 | Evrensel belge formatı |
| DOCX | 📘 | Microsoft Word |
| UDF | 📄 | E-Devlet/UYAP formatı |
| TXT | 📝 | Düz metin |

## 🚀 Kullanım

```bash
# Uygulamayı başlat
npm run dev:all

# Tarayıcıda
1. Dilekçe oluştur
2. "İndir" butonuna tıkla
3. "📄 UDF olarak indir" seç
4. dilekce.udf dosyası indirilir
```

## 🔍 Test Senaryosu

### UDF Döngüsü Testi:

1. **Dışa Aktar:**
   - Dilekçe oluştur → UDF olarak indir

2. **İçe Aktar:**
   - İndirilen UDF'yi sisteme yükle
   - Sistem XML'i parse etsin
   - Metin çıkartılsın

3. **Karşılaştır:**
   - Orijinal metin ≈ Çıkartılan metin ✅

## 📋 Teknik Detaylar

### Kullanılan Kütüphaneler:

```json
{
  "jszip": "3.10.1",      // ZIP arşivi oluşturma
  "file-saver": "2.0.5"   // Dosya indirme
}
```

### XML Yapısı:

```xml
<document>
  <metadata>
    <title>        # Belge başlığı
    <author>       # Oluşturan: "Hukuk Asistanı AI"
    <date>         # ISO 8601 formatında tarih
  </metadata>
  <content>
    <![CDATA[      # Karakter escape problemi yok
      ...metin...
    ]]>
  </content>
</document>
```

### MIME Type:

```
application/vnd.udf
```

## ⚠️ Önemli Notlar

1. **UDF = ZIP:** 
   - `.udf` uzantısını `.zip` yapıp açabilirsiniz
   - İçindeki XML'i görebilirsiniz

2. **Format Uyumluluğu:**
   - E-Devlet sistemleri için standart
   - UYAP ile uyumlu yapı
   - Farklı UDF versiyonları olabilir

3. **Encoding:**
   - UTF-8 kullanılıyor
   - Türkçe karakterler sorunsuz

## 🎓 Eğitim Materyali

### Örnek UDF Dosyası Oluşturma (Manuel):

```bash
# 1. content.xml oluştur
echo '<?xml version="1.0"?><document>...</document>' > content.xml

# 2. mimetype dosyası
echo 'application/vnd.udf' > mimetype

# 3. ZIP olarak arşivle
zip -r belge.udf content.xml mimetype

# 4. .udf dosyası hazır!
```

## 📊 Sonuç

✅ UDF dışa aktarma başarıyla eklendi  
✅ JSZip kullanılarak standart format  
✅ Metadata bilgileri dahil  
✅ E-Devlet/UYAP uyumlu  
✅ Türkçe karakter desteği  

---

**Geliştirici:** Hukuk Asistanı AI Projesi  
**Tarih:** 2025-10-13  
**Versiyon:** 1.0
