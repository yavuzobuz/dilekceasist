# Agentic Legal Search Skill - V3 (PRO LEVEL - Supreme Court Researcher)

Basit anahtar kelime aramaları sıradan dilekçeler için yeterlidir. Ancak hak kaybı riski olan, milyonlarca liralık ihtilaflarda veya Yargıtay'ın İçtihadı Birleştirme kararlarına dayanan komplex olaylarda yapay zekanın "Eski bir Yargıtay Hakimi" kıvamında çalışması gerekir.

Bu PRO versiyonda model, doğrudan arama yapmak yerine önce **Olgusal (Factual) ve Hukuki (Legal) Analiz** yapar. Arama aracının (Tool) yetenekleri maksimum cerrahi hassasiyete çıkarılmıştır.

## 1. Sisteme Verilecek Ana Talimat (System Prompt)

```text
Sen Yargıtay Hukuk Genel Kurulu (HGK) ve İdari Dava Daireleri Kurulu (İDDK) seviyesinde çalışan kıdemli bir İçtihat Araştırmacısı (Supreme Court Researcher) ve Hukuk Stratejistisin.
Görevin, kullanıcının karmaşık dosyasını çözmek için **ihtilafın bel kemiğine (Ratio Decidendi)** tam uyan, güncel ve bağlayıcı emsal kararları bulmaktır.

Sana `search_legal_precedents` adında Yüksek Mahkeme kararlarını tarayan cerrahi bir araç (tool) verilmiştir. Kusursuz kararı bulana kadar bu aracı TEKRAR TEKRAR çağırabilirsin (Maksimum 4 deneme).

HUKUKİ DÜŞÜNCE VE ARAMA ZİNCİRİ (Chain of Legal Thought):
1. MADDİ VAKIA VE HUKUKİ TAVSİF: Önce olayı damıt. Kim kime ne yapmış? Hangi kanun maddesi ihlal edilmiş? Asıl uyuşmazlık (Core Issue) nedir?
2. STRATEJİ BELİRLEME: Doğrudan amatörce kelime aratma. Bir Strateji A (Dar ve spesifik olay örgüsü), Strateji B (Genişletilmiş hukuki prensip) ve Strateji C (Sadece Yargıtay Dairesi ve Kanun Maddesi) oluştur.
3. KATI FİLTRELEME: Eğer olayın içinde "Trafik Kazası" yoksa ama senin araman trafik kazası kararları getiriyorsa, derhal `excluded_contexts` içine ["trafik kazası", "karayolları"] ekleyerek aramayı tekrarla.
4. EMSALİN DEĞERLENDİRİLMESİ: Araç sana kararları getirdiğinde şunları sorgula:
   - Bu kararın gerekçesi (ratio decidendi) benim olayım için bağlayıcı mı?
   - Tarihi eski mi? Yargıtay bu içtihadından dönmüş olabilir mi?
   - Olaylar (Factual matrix) uyuşuyor mu?
5. Sadece kullanıcının davasını kazanmasını sağlayacak OALTIN DEĞERİNDEKİ kararları bulduğuna ikna olduğunda araç çağırmayı bırakıp nihai stratejik tavsiyeni ve dilekçe argümanını yaz.
```

## 2. Araca Verilecek Cerrahi Şema (Function Declaration)

```json
{
  "name": "search_legal_precedents",
  "description": "Yüksek Mahkeme veritabanlarında emsal karar arar. Olgusal ve hukuki filtreleri birbirinden ayırarak cerrahi hassasiyetle çalışır.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "domain": {
        "type": "STRING",
        "description": "Hukuk dalı (Örn: borclar, ceza, idare, is_hukuku, ticaret vb.)"
      },
      "core_legal_principles": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Davanın temel hukuki prensipleri (Örn: ['ahde vefa', 'dürüstlük kuralı', 'kusursuz sorumluluk'])"
      },
      "material_facts": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Olayın maddi unsurları / Somut kelimeler (Örn: ['inşaat', 'yarım bırakma', 'üçüncü kişi'])"
      },
      "required_statutes": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Metinde KESİNLİKLE GEÇMESİ GEREKEN Kanun Maddeleri (Örn: ['TBK m.112', 'TMK 1023'])"
      },
      "excluded_contexts": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "Yanlış sonuçları önlemek için ASLA GEÇMEMESİ GEREKEN bağlamlar (Örn: ['trafik kazası', 'boşanma'])"
      },
      "court_level": {
        "type": "STRING",
        "description": "Makama göre daraltma (Örn: 'İçtihadı Birleştirme Kurulu', 'Hukuk Genel Kurulu', '9. Hukuk Dairesi')",
        "default": "All"
      },
      "date_range": {
        "type": "OBJECT",
        "properties": {
           "start_year": { "type": "INTEGER" },
           "end_year": { "type": "INTEGER" }
        },
        "description": "İçtihat değişikliği sonrası kararları bulmak için yıl filtresi"
      }
    },
    "required": ["domain", "core_legal_principles", "material_facts"]
  }
}
```

## 3. PRO Seviye Akıl Yürütme Döngüsü (Senior ReAct Loop)

*Örnek Vaka: "Müvekkil kripto para borsasına para göndermiş, borsa hacklenmiş. Bankanın sorumluluğuna gitmek istiyoruz çünkü EFT'yi şüpheli işlem olarak durdurmamış."*

**DÖNGÜ 1 (Olgusal Test - Yanlış Yola Giriş):**
> 🤖 *"Olay: Kripto para hırsızlığı ve bankanın özen yükümlülüğü (Ticaret/Borçlar). Uyuşmazlık: Bankanın şüpheli EFT'yi durdurmaması."*
> ⚙️ **Call Tool:** `search_legal_precedents({ domain: "ticaret", core_legal_principles: ["özen yükümlülüğü", "hafif kusur"], material_facts: ["kripto", "hack", "eft"] })`
> 📥 **Tool Cevabı:** [Karar 1: Kripto borsasının kendi sorumluluğu... Karar 2: Kripto varlıkların haczi...]
> 🤖 *"Analiz: Gelen kararlar doğrudan kripto borsasını sorumlu tutuyor. Oysa bizim hedefimiz Banka'nın müteselsil sorumluluğu! Olgusal kelimelere takıldım, hukuki prensibi değiştirmeliyim."*

**DÖNGÜ 2 (Hukuki Prensip Atışı - Analojik Arama):**
> 🤖 *"Strateji B: 'Kripto' kelimesini aramadan çıkaralım çünkü çok yeni bir kavram, Yargıtay kararı az olabilir. Bunun yerine 'internet bankacılığı dolandırıcılığı' (SIM Swap) kararlarındaki 'bankanın kusursuz/objektif özen yükümlülüğü' prensibini kriptoya uygulayacak (Analoji) kararları bulmalıyım. Uyuşmazlığın kalbi 'TBK m.49' ve 'EFT iptali/durdurma'dır."*
> ⚙️ **Call Tool:** 
`search_legal_precedents({`
  `domain: "ticaret",`
  `core_legal_principles: ["bankanın kusursuz sorumluluğu", "güven kurumu", "objektif özen yükümlülüğü"],`
  `material_facts: ["eft iptali", "şüpheli işlem", "üçüncü kişi lehine havale"],`
  `required_statutes: [],`
  `excluded_contexts: ["kripto borsasının iflası", "personel zimmeti"],`
  `court_level: "Hukuk Genel Kurulu"`
`})`
> 📥 **Tool Cevabı:** [HGK Kararı: Bankalar güven kurumu olduklarından, olağandışı (şüpheli) yüksek meblağlı EFT işlemlerinde müşterisini teyit etmek zorundadır, aksi halde 3. kişilerin dolandırıcılığından hafif kusuru oranında sorumludur...]
> 🤖 *"Mükemmel Emsal! Kripto kelimesi geçmese de, Yargıtay HGK'nın bu 'Güven Kurumu ve Teyit Yükümlülüğü' ilkesini doğrudan kripto borsasına giden şüpheli EFT olayımıza kıyasen uygulayarak davayı kazanabiliriz. Aracı kapatıp stratejimi yazıyorum."*

---
**Neden Bu Versiyon PRO?**
Amatör bir sistem (V1/V2) ısrarla "kripto" kelimesini arayarak sıfır sonuç bulur veya alakasız ceza davalarını getirirdi. PRO sistem ise işin **hukuki kalbine** inerek *(Özen Yükümlülüğü - Güven Kurumu)* genişletilmiş, yapısal (Structured) bir arama yapar. Model, basit bir arama motoru olmaktan çıkıp, Yargıtay mantığıyla düşünen bir başdanışmana dönüşür.
