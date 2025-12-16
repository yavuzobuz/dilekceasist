# 📉 Codebase Eksiklik ve Zayıf Yönler Analizi

**Oluşturulma Tarihi:** 15 Aralık 2025
**Analiz Edilen Dosyalar:** `services/geminiService.ts`, `server.js`, `AppRouter.tsx`, proje kök dizini.

Bu rapor, mevcut kod tabanındaki güvenlik risklerini, mimari zayıflıkları ve geliştirilmesi gereken alanları özetler.

## 🚨 1. Güvenlik Zayıflıkları

### ⚠️ İstemci Tarafında API Anahtarı Kullanımı
*   **Sorun:** `services/geminiService.ts` dosyasında `import.meta.env.VITE_GEMINI_API_KEY` kullanılıyor.
*   **Risk:** `VITE_` ön ekiyle başlayan değişkenler derleme sırasında JavaScript bundle'ına gömülür. Kötü niyetli kullanıcılar tarayıcı konsolundan bu anahtarı kolayca çalabilir ve kendi projelerinde kotanızı kullanabilir.
*   **Öneri:** API çağrılarını bir Backend Proxy (örneğin Next.js API Routes veya Supabase Edge Functions) üzerinden yaparak API anahtarını sunucu tarafında saklayın.

### 🔓 Korumasız DOCX Dönüştürme Sunucusu (`server.js`)
*   **Sorun:** `server.js` dosyasındaki `/api/html-to-docx` endpoint'i herhangi bir kimlik doğrulama (Auth) veya yetkilendirme kontrolü yapmıyor.
*   **Risk:** Port 3001 dış dünyaya açıksa, herkes bu servisi kullanarak sunucunuza yük bindirebilir.
*   **Öneri:** Bu endpoint'e basit bir token kontrolü veya Supabase Auth entegrasyonu ekleyin. Ayrıca CORS ayarlarını (`app.use(cors())`) sadece kendi frontend domain'inize izin verecek şekilde kısıtlayın.

## 🏗️ 2. Mimari Zayıflıklar ve Teknik Borçlar

### 🐢 Ayrı Node.js Sunucusu Bağımlılığı
*   **Sorun:** Ana uygulama Vite (Client-side) iken, DOCX dönüşümü için ayrı bir `server.js` scripti çalıştırılması gerekiyor (`npm run server`).
*   **Risk:** Geliştirme ve dağıtım (deployment) karmaşıklaşıyor. `server.js` çökerse uygulamanın belge indirme özelliği çalışmaz hale gelir.
*   **Öneri:** Eğer Vercel gibi bir platform kullanılıyorsa, bu işlemi bir **Serverless Function** (API Route) olarak yeniden yazmak, ayrı bir sunucu yönetme yükünü ortadan kaldırır.

### 🔢 Hardcoded (Gömülü) Değerler
*   **Sorun:** `geminiService.ts` içinde `const model = 'gemini-2.5-flash';` ifadesi birçok fonksiyonda manuel olarak tekrar edilmiş.
*   **Risk:** Model değiştirmek istendiğinde (örn: `gemini-1.5-pro`'ya geçiş), 5-6 farklı yerde değişiklik yapılması gerekir. Hata yapma riski artar.
*   **Öneri:** Model isimlerini ve diğer konfigürasyonları tek bir `config.ts` veya `constants.ts` dosyasında merkezi olarak tanımlayın.

## 🧪 3. Kod Kalitesi ve Test

### ❌ Test Eksikliği
*   **Sorun:** Projede `src` veya kök dizinde herhangi bir birim testi (`.test.ts`, `.spec.ts`) veya entegrasyon testi bulunamadı (sadece `TEST_REFRESH.md` var).
*   **Risk:** Yeni özellikler eklenirken mevcut özelliklerin bozulup bozulmadığını (regresyon) otomatik olarak kontrol etmenin bir yolu yok.
*   **Öneri:** En azından kritik fonksiyonlar (`analyzeDocuments`, `generatePetition`) için Vitest veya Jest ile birim testleri yazılmalı.

### ⚠️ "Any" Tipi Kullanımı
*   **Sorun:** `geminiService.ts` dosyasında `try-catch` bloklarında ve bazı mapping işlemlerinde (`contact: any`) `any` tipi kullanılmış.
*   **Risk:** TypeScript'in tip güvenliği avantajı kaybediliyor. Beklenmedik veri yapıları çalışma zamanı hatalarına (Runtime Error) yol açabilir.
*   **Öneri:** Hata nesneleri ve API yanıtları için daha kesin tipler (örneğin Zod şemaları) kullanılmalı.

## 🚀 4. Eksik Özellikler

*   **Rate Limiting (Hız Sınırlama):** Kullanıcıların yapay zeka servisini art arda suistimal etmesini engelleyen bir mekanizma yok.
*   **Kalıcı Sohbet Geçmişi:** `geminiService.ts` sohbet geçmişini parametre olarak alıyor ancak veritabanına kaydettiğine dair bir kod bu serviste yok (Frontend tarafında yapılıyor olabilir, ancak servis katmanında da yönetilmesi daha güvenli olabilir).
*   **İlerleme Bildirimi (Progress Feedback):** Uzun süren belge analizleri sırasında kullanıcıya detaylı geri bildirim (örn: "OCR yapılıyor", "Avukat bilgileri çıkarılıyor") verecek bir yapı (Stream veya Socket) `analyzeDocuments` fonksiyonunda yok.

## 📋 Özet Tablo

| Kategori | Sorun | Aciliyet | Efor |
| :--- | :--- | :--- | :--- |
| **Güvenlik** | API Key Client-Side'da | 🔴 Yüksek | Orta |
| **Güvenlik** | DOCX Sunucusu Korumasız | 🔴 Yüksek | Düşük |
| **Mimari** | Ayrı Server.js Bağımlılığı | 🟡 Orta | Orta |
| **Kalite** | Test Yok | 🟡 Orta | Yüksek |
| **Kod** | Hardcoded Model İsimleri | 🟢 Düşük | Düşük |
