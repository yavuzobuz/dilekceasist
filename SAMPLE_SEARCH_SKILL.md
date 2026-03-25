# Agentic Legal Search Skill (Arama Yeteneği) Örneği - V2 (Production Ready)

İlk sürüm sadece "Döngü (ReAct)" mantığını anlatmak içindi. Ancak %100 isabet ve hak kaybını önlemek için yapay zekanın elinde **çok daha keskin filtreler** olmalıdır. Aksi halde "İş kazası teselsül" aramasında binlerce alakasız karar içinde boğulabilir.

İşte **Gerçek** ve **Kusursuz** bir Hukuk Ajanı'nın kullanacağı gelişmiş Skill dosyası:

## 1. Sisteme Verilecek Ana Talimat (System Prompt)

```text
Sen Türkiye'nin en iyi içtihat araştırmacısı ve hukuki stratejistisin.
Görevin, kullanıcının hukuki vakasına (veya dilekçe talebine) %100 uyan Yargıtay veya Danıştay Kararlarını bulmaktır.

Sana `search_legal_precedents` adında bir araç (tool) verilmiştir.
Mükemmel kararı bulana kadar bu aracı TEKRAR TEKRAR çağırabilirsin (Maksimum 3 deneme).

ARAMA STRATEJİSİ KURALLARI:
1. İlk aramanda temel hukuki nitelendirmeyi yap (Örn: "Yüklenici temerrüdü tapu iptali").
2. Araç sana kararların özetlerini (veya başarısızlık mesajını) dönecektir.
3. Gelen kararları oku. Eğer çok fazla "alakasız" konu gelmişse, İKİNCİ ARAMANDA `negative_keywords` (hariç tutulacak kelimeler) parametresini kullan. (Örn: "boşanma, ceza" kelimelerini dışla).
4. Eğer Kanun Maddesi zorunluysa `exact_keywords` (kesin eşleşme) parametresini kullan. (Örn: "TMK 1023").
5. Eğer sadece Yargıtay 9. HD kararı istiyorsan `chamber` parametresini "9. Hukuk Dairesi" olarak ayarla.
6. En fazla 3 kere arama yap. Üçüncü denemede de tam örtüşen karar bulamazsan, bulduğun en yakın/kapsayıcı kararları sun ve kullanıcının argümanına nasıl uyarlanabileceğini anlat.
```

## 2. Araca Verilecek Gelişmiş Şema (Function Declaration)

```json
{
  "name": "search_legal_precedents",
  "description": "Yargıtay, Danıştay, UYAP ve AYM veritabanlarında detaylı içtihat araması yapar.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "domain": {
        "type": "STRING",
        "description": "Hukuk dalı (borclar, ceza, idare, is_hukuku, ticaret, aile vb.)"
      },
      "query": {
        "type": "STRING",
        "description": "Ana arama terimleri (Örn: 'haksız fiil destekten yoksun kalma')"
      },
      "exact_keywords": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Metinde KESİNLİKLE GEÇMESİ GEREKEN kanun veya anahtar kelimeler (Örn: ['TMK 1023', 'kötüniyetli'])"
      },
      "negative_keywords": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Sonuçlarda ASLA GEÇMEMESİ GEREKEN kelimeler (Örn: ['boşanma', 'icra takibi'])"
      },
      "chamber": {
        "type": "STRING",
        "description": "Belirli bir Daire veya Mahkeme filtresi (Örn: 'Yargıtay 9. Hukuk Dairesi' veya 'Danıştay İDDK')"
      },
      "date_start": {
        "type": "STRING",
        "description": "Aramanın başlangıç yılı (Örn: '2020')"
      },
      "source": {
        "type": "STRING",
        "description": "yargitay, danistay, anayasa, uyap veya all",
        "default": "all"
      }
    },
    "required": ["domain", "query"]
  }
}
```

## 3. Akıl Yürütme ve Aksiyon Döngüsü Örneği (ReAct Loop)

*Örnek Vaka: "İşçi 2021 yılında fazla mesai alacağı için dava açmış, yerel mahkeme kabul etmiş ama SGK kayıtları eksik."*

**DÖNGÜ 1 (Geniş Arama):**
> 🤖 *"Olay fazla mesai alacağı ve SGK kayıtlarının incelenmesiyle ilgili (İş Hukuku)."*
> ⚙️ **Call Tool:** `search_legal_precedents({ domain: "is_hukuku", query: "fazla mesai ücreti sgk kayıtları" })`
> 📥 **Tool Cevabı:** [Karar 1: Eski tarihli bozma kararı... Karar 2: Hizmet tespiti davasıyla birleşen dosyalar...]
> 🤖 *"Kararlar çok eski tarihli ve hatalı yere odaklanmış (Hizmet tespiti davasına sapmış). İkinci aramamı daha kısıtlayıcı filtrelerle yapmalıyım."*

**DÖNGÜ 2 (Hedefe Yönelik Daraltılmış Arama):**
> 🤖 *"Sadece 9. Hukuk Dairesi'nin yeni tarihli kararlarına ihtiyacım var. 'Hizmet tespiti' davalarını da hariç tutmalıyım."*
> ⚙️ **Call Tool:** 
`search_legal_precedents({`
  `domain: "is_hukuku",`
  `query: "fazla mesai alacağı sgk kayıtları incelenmesi",`
  `chamber: "9. Hukuk Dairesi",`
  `date_start: "2020",`
  `negative_keywords: ["hizmet tespiti"]`
`})`
> 📥 **Tool Cevabı:** [Karar 3: Yarg. 9. HD 2022 Kararı - Sadece SGK kayıtlarına dayanılarak fazla mesai ispatlanamaz, tanık beyanları şarttır...]
> 🤖 *"Mükemmel! Tam aradığım güncel ve noktasal atış karar. Şimdi aracı durdurup dilekçe argümanlarını yazmaya başlayabilirim."*

---
**Sonuç:** Modelin elinde `negative_keywords` (dışlama), `chamber` (daire hedefleme) ve `exact_keywords` (katı kurallar) olduğunda Yargıtay veritabanında adeta bir **ameliyat (cerrahi müdahale)** yapar. Bu sayede %100 uyumlu o tek karara ulaşana kadar filtreleri daraltır/genişletir. Sıfır hak kaybı riski oluşur.
