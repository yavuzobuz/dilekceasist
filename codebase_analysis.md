# 🕵️ Codebase Analizi ve Uygulama Mantığı

Bu belge, **Hukuk Asistanı: AI Dilekçe Oluşturucu** projesinin kod tabanı, mimarisi ve çalışma mantığı üzerine yapılan analizi içerir.

## 🎯 Uygulamanın Amacı
Bu uygulama, kullanıcıların hukuki dilekçeleri (dava dilekçesi, cevap dilekçesi vb.) yapay zeka desteğiyle hızlı ve doğru bir şekilde oluşturmasını sağlayan bir web platformudur. 

**Temel Özellikler:**
*   **AI Destekli Yazım:** Kullanıcının girdiği bilgilere göre Gemini AI modeli kullanılarak profesyonel dilekçe metinleri oluşturulur.
*   **Otomatik Belge Analizi:** Yüklenen PDF, Resim veya UDF dosyalarından avukat ve iletişim bilgileri otomatik olarak çıkarılır.
*   **Dilekçe Havuzu:** Hazır şablonlar ve topluluk tarafından paylaşılan dilekçeler.
*   **Format Desteği:** Oluşturulan dilekçeler DOCX formatında indirilebilir.

## 🏗️ Mimari ve Teknoloji Yığını

Proje, ağırlıklı olarak **Client-Side (İstemci Taraflı)** çalışan ve servis tabanlı bir mimariye sahiptir.

### 1. Frontend (İstemci)
*   **Framework:** React 19 (Vite ile derlenmiş)
*   **Dil:** TypeScript
*   **Styling:** Muhtemelen Tailwind CSS veya özel CSS (`styles.css`).
*   **Routing:** React Router v7 (`AppRouter.tsx`).
*   **State Management:** React Context (`AuthContext.tsx`).

### 2. Backend & Servisler
*   **AI Motoru:** Google Gemini API (`@google/genai`). Tüm zeka mantığı `services/geminiService.ts` içinde yönetilir.
*   **Veritabanı & Kimlik Doğrulama:** Supabase. (`lib/supabase.ts`, `supabase/` klasörü).
*   **Utility Sunucusu:** Node.js + Express (`server.js`). Bu sunucu sadece **HTML -> DOCX** dönüşümü gibi istemci tarafında zor olan işlemler için kullanılır.

## 📁 Önemli Dosyalar ve Klasörler

### `src/` (Ana Uygulama Kodu)
*   **`AppRouter.tsx`**: Uygulamanın rota yapılandırması. 
    *   `/` -> `LandingPage` (Tanıtım Sayfası)
    *   `/app` -> `AppMain` (Ana Dilekçe Editörü)
    *   `/petition-pool` -> `PetitionPool` (Dilekçe Havuzu)
*   **`components/AppMain.tsx`**: Uygulamanın kalbi. Kullanıcının dilekçe oluşturduğu, chat arayüzünün bulunduğu ana bileşen.
*   **`services/geminiService.ts`**: Yapay zeka servis katmanı.
    *   `analyzeDocuments`: Belge analizi ve OCR.
    *   `generatePetition`: Dilekçe taslağı oluşturma.
    *   `streamChatResponse`: Chat botu ile etkileşim.
    *   `performWebSearch`: (Muhtemelen) Güncel hukuki bilgiler veya emsal kararlar için web araması.
*   **`lib/supabase.ts`**: Supabase istemci yapılandırması.

### Kök Dizin
*   **`server.js`**: HTML içeriğini DOCX formatına çevirmek için basit bir Express sunucusu. `html-to-docx` kütüphanesini kullanır.
*   **`LAWYER_INFO_FEATURE.md`**: Belge analiz özelliğinin detaylı teknik dokümantasyonu.

## 🔄 Veri Akışı ve Çalışma Mantığı

1.  **Dilekçe Oluşturma Süreci:**
    *   Kullanıcı `/app` sayfasına girer (`AppMain`).
    *   Gerekli bilgileri forma girer veya chat üzerinden anlatır.
    *   Varsa elindeki belgeleri yükler.
    *   **Frontend**, `geminiService.calculate` fonksiyonlarını çağırır.
    *   **Gemini Service**, belge varsa analiz eder (`analyzeDocuments`), içindeki metinleri çıkarır.
    *   Tüm veriler (kullanıcı girdisi + analiz sonuçları) bir prompt (istemi) haline getirilir.
    *   Gemini API'ye gönderilir ve oluşturulan dilekçe metni döner.

2.  **Belge İndirme:**
    *   Oluşturulan dilekçe HTML formatında görüntülenir.
    *   "İndir" butonuna basıldığında, HTML içeriği `server.js`'deki `/api/html-to-docx` endpoint'ine gönderilir.
    *   Sunucu DOCX dosyasını oluşturup geri gönderir.

3.  **Kullanıcı Yönetimi:**
    *   Supabase Auth ile kayıt/giriş işlemleri yapılır.
    *   Kullanıcı profili ve kaydedilen dilekçeler Supabase veritabanında saklanır.

## 💡 Tespit Edilen Önemli Mantıksal Yapılar
*   **Prompt Mühendisliği:** `geminiService.ts` içinde `formatClaudePrompt` (isim eski kalmış olabilir, Claude referansı var) gibi fonksiyonlarla AI'ya giden veriler yapılandırılıyor.
*   **Hibrid Yapı:** Uygulama "Serverless" gibi davranıyor (Supabase + Gemini) ama dosya dönüşümü için ufak bir sunucuya (`server.js`) bağımlı.

## ✅ Sonuç
Proje, modern AI ve Web teknolojilerini birleştiren, hukuki süreçleri otomatize etmeyi hedefleyen, iyi yapılandırılmış bir React uygulamasıdır. Kod tabanı modülerdir ve servisler (AI, Auth) ana uygulama mantığından ayrılmıştır.
