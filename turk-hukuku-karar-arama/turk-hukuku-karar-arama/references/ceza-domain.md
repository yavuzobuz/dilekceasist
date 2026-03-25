# Ceza Hukuku Domain Kuralları

## retrievalConcepts Kuralı — Ceza long_fact

Ceza davalarında `long_fact` modunda:
- **Maksimum 3 kavram** retrievalConcepts'e girer
- Format: `[TCK maddesi]` + `[suç adı]` + `[kast/amaç]`

```
✅ DOĞRU:
retrievalConcepts: [
  "uyuşturucu madde ticareti",
  "kullanmak için bulundurma",
  "TCK 188"
]

❌ YANLIŞ:
retrievalConcepts: [
  "uyuşturucu madde ticareti",
  "hassas terazi",        ← delil sinyali
  "paketleme",           ← delil sinyali
  "TCK 188",
  "kişisel kullanım"     ← support'a gitmeli
]
```

---

## Uyuşturucu Davaları

### Ticaret mi, Bulundurma mı? Ayrım Kriterleri

retrievalConcepts'e koyulacaklar:
```
"uyuşturucu madde ticareti"
"kullanmak için bulundurma"
"TCK 188" veya "TCK 191"
"ticaret kastı"
"kişisel kullanım sınırı"
```

supportConcepts'e koyulacaklar:
```
"polidrug kullanımı"
"bağımlılık"
"kişisel kullanım miktarı"
"görevsizlik kararı"
"ağır ceza mahkemesi"
```

evidenceConcepts'e koyulacaklar (kesinlikle):
```
"hassas terazi"
"paketleme"
"satışa hazır paket"
"ele geçirilen miktar"
"nakit para"
"HTS kaydı"
```

### Kritik Yargıtay Arama Kombinasyonları

```
+"kullanmak için bulundurma" +"kişisel kullanım sınırı" +"beraat"
+"uyuşturucu madde ticareti" +"görevsizlik" +"ağır ceza"
+"TCK 188" +"TCK 191" +"ayrım"
+"polidrug" +"kullanmak için bulundurma" +"beraat"
+"satışa elverişli" +"paketçik" +"görevsizlik"
+"kullanma sınırı" +"ticaret kastı" +"ispat"
```

### semanticQuery Örnekleri

```
"Sanığın üzerinde ele geçirilen uyuşturucu maddenin miktarı ve
ambalaj şekli ticaret kastını kanıtlamaya yetmez; kişisel kullanım
sınırları içinde kaldığından TCK 191 uygulanmalıdır."

"Birden fazla farklı uyuşturucu madde bulundurulması tek başına
ticaret kastının delili olamaz; polidrug kullanımı tıbbi literatürde
yaygındır."

"Arama sonucu para, terazi veya paketlenmiş satış materyali ele
geçirilememesi, tanık beyanının hayatın olağan akışıyla
bağdaşmadığının somut göstergesidir."
```

---

## Hırsızlık / Yağma Davaları

```
retrievalConcepts: ["hırsızlık", "TCK 141", "nitelikli hırsızlık"]
supportConcepts: ["konut dokunulmazlığı", "gece vakti", "birlikte işleme"]
evidenceConcepts: ["kamera görüntüsü", "parmak izi", "DNA", "tanık beyanı"]
```

Kritik kombinasyonlar:
```
+"hırsızlık" +"konut" +"gece vakti"
+"nitelikli hırsızlık" +"TCK 142" +"beraat"
+"hırsızlık" +"teşebbüs" +"gönüllü vazgeçme"
```

---

## Dolandırıcılık Davaları

```
retrievalConcepts: ["dolandırıcılık", "TCK 157", "aldatma"]
supportConcepts: ["mağdur", "hile", "yanıltma"]
evidenceConcepts: ["banka kaydı", "para transferi", "mesaj", "sözleşme"]
negativeConcepts: ["güveni kötüye kullanma"]  ← TCK 155 ile karışmasın
```

---

## Cinsel Suçlar

```
retrievalConcepts: ["cinsel saldırı", "TCK 102", "rıza"]
supportConcepts: ["mağdur beyanı", "etkin pişmanlık"]
evidenceConcepts: ["adli tıp raporu", "genetik rapor", "mesaj"]
sourceTargets: ["yargitay"]  → mutlaka Yargıtay
```

---

## Terör / Örgüt Davaları

```
retrievalConcepts: ["silahlı terör örgütü", "TCK 314", "üyelik"]
supportConcepts: ["hiyerarşik yapı", "örgüt kastı", "eylem"]
evidenceConcepts: ["dijital materyal", "bylock", "HTS", "tanık"]
negativeConcepts: ["irtibat", "iltisak"]  ← farklı nitelendirme
```

---

## Delil Hukuku / Hukuka Aykırı Delil

Bu durumda `allowEvidenceAsCore = true`:

```json
{
  "allowEvidenceAsCore": true,
  "retrievalConcepts": [
    "hukuka aykırı delil",
    "arama kararı",
    "delil yasakları"
  ],
  "evidenceConcepts": [
    "arama tutanağı",
    "el koyma",
    "iletişimin tespiti"
  ]
}
```

Kombinasyonlar:
```
+"hukuka aykırı delil" +"arama" +"dışlama"
+"arama kararı" +"konut dokunulmazlığı" +"delil"
+"CMK 217" +"hukuka aykırı" +"beraat"
```

---

## Görev / Yetki Sorunları

Uyuşturucu ticaret davalarında sık karşılaşılan:
```
supportConcepts'e ekle: "görevsizlik", "ağır ceza mahkemesi yetkisi"
kombinasyon: +"görevsizlik" +"ağır ceza" +"bozma"
```
