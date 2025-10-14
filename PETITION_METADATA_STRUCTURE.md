# 📦 Dilekçe Metadata Yapısı

## 🎯 Genel Bakış

Dilekçeler Supabase'de `petitions` tablosunda saklanır. Her dilekçe, oluşturulurken kullanılan **tüm bağlam bilgilerini** `metadata` sütununda JSONB formatında saklar. Bu sayede:

✅ Profil sayfasından dilekçeyi tekrar düzenleyebilirsiniz  
✅ Dilekçeyi iyileştirebilirsiniz (Review)  
✅ Tüm bağlam bilgilerine erişebilirsiniz  

## 📋 Metadata Yapısı

### TypeScript Interface

```typescript
interface PetitionMetadata {
  // Sohbet geçmişi
  chatHistory: ChatMessage[];
  
  // Dava künyesi
  caseDetails: CaseDetails;
  
  // Taraflar
  parties: { [key: string]: string };
  
  // Arama anahtar kelimeleri
  searchKeywords: string[];
  
  // Ek metin içeriği
  docContent: string;
  
  // Özel talimatlar
  specifics: string;
  
  // Kullanıcı rolü
  userRole: UserRole;
  
  // Belge analiz sonuçları
  analysisData: AnalysisData;
  
  // Web arama sonuçları
  webSearchResult: WebSearchResult;
  
  // Vekil bilgileri
  lawyerInfo?: LawyerInfo;
  
  // İletişim bilgileri
  contactInfo?: ContactInfo[];
}
```

### JSON Örneği

```json
{
  "chatHistory": [
    { "role": "user", "text": "Dilekçeye şunu ekle..." },
    { "role": "model", "text": "Elbette, ekledim..." }
  ],
  "caseDetails": {
    "court": "Ankara 5. Asliye Hukuk Mahkemesi",
    "fileNumber": "2024/123",
    "decisionNumber": "2024/456",
    "decisionDate": "15.06.2024"
  },
  "parties": {
    "plaintiff": "Ahmet Yılmaz",
    "defendant": "ABC Şirketi"
  },
  "searchKeywords": [
    "haksız fesih tazminatı",
    "işe iade davası",
    "Yargıtay 9. Hukuk Dairesi"
  ],
  "docContent": "Ek metin içeriği...",
  "specifics": "Özel talimatlar...",
  "userRole": "Davacı",
  "analysisData": {
    "summary": "Belge analiz özeti...",
    "potentialParties": ["Ahmet Yılmaz", "ABC Şirketi"],
    "caseDetails": { ... },
    "lawyerInfo": {
      "name": "Av. Mehmet Yılmaz",
      "bar": "Ankara Barosu",
      "barNumber": "12345",
      "address": "Kızılay Mah...",
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
  },
  "webSearchResult": {
    "summary": "Yargıtay kararları özeti...",
    "sources": [
      {
        "uri": "https://karararama.yargitay.gov.tr/...",
        "title": "Yargıtay 9. HD, E:2023/1234"
      }
    ]
  },
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
      "address": "İstanbul, Türkiye",
      "phone": "(0212) 123 45 67",
      "email": "info@abc.com",
      "tcNo": "1234567890"
    }
  ]
}
```

## 🔄 Veri Akışı

### 1. Dilekçe Oluşturma
```typescript
// AppMain.tsx - savePetitionToSupabase()
await supabase.from('petitions').insert([{
  user_id: user.id,
  title: "Dava Dilekçesi - 14.10.2025",
  petition_type: "Dava Dilekçesi",
  content: "Dilekçe tam metni...",
  metadata: {
    chatHistory,
    caseDetails,
    parties,
    searchKeywords,
    docContent,
    specifics,
    userRole,
    analysisData,
    webSearchResult,
    lawyerInfo: analysisData?.lawyerInfo,
    contactInfo: analysisData?.contactInfo,
  }
}]);
```

### 2. Profil Sayfasından Yükleme
```typescript
// AppMain.tsx - useEffect
const metadata = petitionFromState.metadata;
if (metadata) {
  if (metadata.caseDetails) setCaseDetails(metadata.caseDetails);
  if (metadata.parties) setParties(metadata.parties);
  if (metadata.searchKeywords) setSearchKeywords(metadata.searchKeywords);
  if (metadata.docContent) setDocContent(metadata.docContent);
  if (metadata.specifics) setSpecifics(metadata.specifics);
  if (metadata.userRole) setUserRole(metadata.userRole);
  if (metadata.analysisData) setAnalysisData(metadata.analysisData);
  if (metadata.webSearchResult) setWebSearchResult(metadata.webSearchResult);
  if (metadata.chatHistory) setChatMessages(metadata.chatHistory);
}
```

### 3. Dilekçe İyileştirme (Review)
```typescript
// AppMain.tsx - handleReviewPetition()
const result = await reviewPetition({
  currentPetition: generatedPetition,
  userRole,
  petitionType,
  caseDetails,
  analysisSummary: analysisData.summary,
  webSearchResult: webSearchResult?.summary || '',
  docContent,
  specifics,
  chatHistory: chatMessages,
  parties,
  lawyerInfo: analysisData.lawyerInfo,
  contactInfo: analysisData.contactInfo,
});
```

## 🗄️ Veritabanı Şeması

### Petitions Tablosu

```sql
CREATE TABLE public.petitions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    petition_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT CHECK (status IN ('draft', 'completed')) DEFAULT 'draft',
    metadata JSONB,  -- 👈 Tüm bağlam bilgileri burada
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### Metadata İçeriği

| Alan | Tip | Açıklama |
|------|-----|----------|
| `chatHistory` | Array | Sohbet geçmişi |
| `caseDetails` | Object | Dava künyesi bilgileri |
| `parties` | Object | Taraflar (key-value) |
| `searchKeywords` | Array | Arama anahtar kelimeleri |
| `docContent` | String | Ek metin içeriği |
| `specifics` | String | Özel talimatlar |
| `userRole` | String | Kullanıcı rolü (Davacı, Davalı, vb.) |
| `analysisData` | Object | Belge analiz sonuçları |
| `webSearchResult` | Object | Web arama sonuçları |
| `lawyerInfo` | Object | Vekil bilgileri |
| `contactInfo` | Array | İletişim bilgileri |

## ✅ Neler Kaydediliyor?

### ✅ Kaydedilen Bilgiler:
- ✅ Sohbet geçmişi (tüm kullanıcı-AI iletişimi)
- ✅ Dava künyesi (mahkeme, dosya no, karar no, tarih)
- ✅ Taraflar (davacı, davalı, vb.)
- ✅ Arama anahtar kelimeleri
- ✅ Ek metin içeriği
- ✅ Özel talimatlar
- ✅ Kullanıcı rolü
- ✅ Belge analiz özeti ve detayları
- ✅ Web arama sonuçları (özet + kaynaklar)
- ✅ **Vekil bilgileri** (ad, baro, sicil no, adres, telefon, email)
- ✅ **İletişim bilgileri** (tarafların adresleri, telefonları)

### ❌ Kaydedilmeyen Bilgiler:
- ❌ Yüklenen dosyaların ham içeriği (çok büyük olduğu için)
- ❌ Base64 encoded dosya verileri
- ❌ API anahtarları veya hassas veriler

## 🔧 Kullanım Senaryoları

### Senaryo 1: Dilekçeyi Profil Sayfasından Düzenleme
1. Kullanıcı profil sayfasından bir dilekçeye tıklar
2. `AppMain` component'i `location.state` ile dilekçeyi alır
3. `metadata` içinden tüm bağlam bilgileri yüklenir
4. Kullanıcı dilekçeyi düzenleyebilir veya iyileştirebilir

### Senaryo 2: Dilekçeyi İyileştirme (Review)
1. Kullanıcı "Dilekçeyi İyileştir" butonuna tıklar
2. `handleReviewPetition` fonksiyonu çağrılır
3. Metadata'dan alınan tüm bilgiler `reviewPetition` API'sine gönderilir
4. AI, bağlamla birlikte dilekçeyi iyileştirir

### Senaryo 3: Yeni Dilekçe Oluşturma
1. Kullanıcı belgelerini yükler ve adımları tamamlar
2. "Dilekçe Oluştur" butonuna tıklar
3. `generatePetition` API'si çağrılır
4. Oluşturulan dilekçe + metadata Supabase'e kaydedilir

## 🐛 Sorun Giderme

### Problem: Profil sayfasından yüklenen dilekçe düzenlenemiyor

**Sebep:** Metadata eksik veya yüklenmemiş.

**Çözüm:**
1. Console'da metadata'yı kontrol edin:
   ```javascript
   console.log('Petition metadata:', petitionFromState.metadata);
   ```
2. Eksik alanları kontrol edin
3. Eski dilekçeleri yeniden oluşturun (güncellenmiş metadata ile)

### Problem: Review yaparken hata alıyorum

**Sebep:** `analysisData` veya `webSearchResult` eksik.

**Çözüm:**
1. Metadata'da bu alanların varlığını kontrol edin
2. İlk dilekçeyi oluştururken tüm adımları tamamlayın
3. Eski dilekçeleri yeniden oluşturun

## 📚 İlgili Dosyalar

- `src/components/AppMain.tsx` - Ana uygulama mantığı
- `lib/supabase.ts` - Veritabanı tipleri
- `types.ts` - TypeScript interface tanımları
- `supabase_schema.sql` - Veritabanı şeması

## 🔄 Versiyon Notları

### v1.1.0 (2025-10-14)
- ✅ Vekil bilgileri (`lawyerInfo`) metadata'ya eklendi
- ✅ İletişim bilgileri (`contactInfo`) metadata'ya eklendi
- ✅ `reviewPetition` fonksiyonuna yeni alanlar eklendi
- ✅ Profil sayfasından yükleme düzeltildi

### v1.0.0 (Başlangıç)
- ✅ Temel metadata yapısı oluşturuldu
- ✅ Supabase entegrasyonu tamamlandı

---

**Son güncelleme:** 2025-10-14
