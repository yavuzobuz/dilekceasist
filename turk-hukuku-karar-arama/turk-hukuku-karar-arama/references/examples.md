# Örnek Girdi / Çıktı Çiftleri

---

## Örnek 1 — Ceza / Uyuşturucu (short_issue)

**Girdi:**
```
Müvekkilin üzerinde 3.2 gram esrar bulundu. Satıcı mı, kullanıcı mı?
```

**Çıktı:**
```json
{
  "queryMode": "short_issue",
  "primaryDomain": "ceza",
  "coreIssue": "Ele geçirilen esrar miktarının kişisel kullanım sınırları içinde kalıp kalmadığı ve TCK 188 mi TCK 191 mi uygulanacağı meselesi.",
  "allowEvidenceAsCore": false,
  "retrievalConcepts": ["kullanmak için bulundurma", "TCK 191", "kişisel kullanım sınırı"],
  "supportConcepts": ["esrar", "bağımlılık", "ticaret kastı yokluğu"],
  "evidenceConcepts": ["3.2 gram", "ele geçirilen miktar"],
  "negativeConcepts": ["uyuşturucu ticareti", "TCK 188"],
  "searchClauses": [
    "+"kullanmak için bulundurma" +"kişisel kullanım sınırı" +"beraat"",
    "+"TCK 191" +"esrar" +"miktar""
  ],
  "semanticQuery": "Sanığın üzerinde ele geçirilen esrar miktarı kişisel kullanım sınırları içinde kaldığından ticaret kastı ispat edilemez ve TCK 191 uygulanmalıdır.",
  "sourceTargets": ["yargitay"]
}
```

---

## Örnek 2 — Ceza / Uyuşturucu (long_fact)

**Girdi:**
```
Müvekkil Ahmet'in ikametgahında yapılan aramada 29.3 gram esrar
5 parça halinde bulundu. Bir kısmı 4 paket halinde satışa hazır,
bir kısmı gazete kağıdına sarılı poşet içinde. Hassas terazi de
ele geçirildi. Savcı TCK 188'den dava açtı.
```

**Çıktı:**
```json
{
  "queryMode": "long_fact",
  "primaryDomain": "ceza",
  "coreIssue": "29.3 gram esrarın farklı ambalajlarda ve hassas teraziyle birlikte ele geçirilmesi karşısında TCK 188 ticaret kastının ispatlanıp ispatlanamayacağı.",
  "allowEvidenceAsCore": false,
  "retrievalConcepts": ["uyuşturucu madde ticareti", "TCK 188", "ticaret kastı"],
  "supportConcepts": ["kişisel kullanım sınırı", "görevsizlik kararı"],
  "evidenceConcepts": ["hassas terazi", "paketleme", "satışa hazır paket", "29.3 gram", "gazete kağıdı"],
  "negativeConcepts": ["TCK 191"],
  "searchClauses": [
    "+"uyuşturucu madde ticareti" +"görevsizlik" +"ağır ceza"",
    "+"satışa elverişli" +"paketçik" +"bozma"",
    "+"TCK 188" +"ticaret kastı" +"ispat""
  ],
  "semanticQuery": "Uyuşturucu maddenin satışa hazır paketler halinde ve hassas teraziyle birlikte ele geçirilmesi ticaret kastının göstergesi sayılabilir mi ve görevsizlik kararı verilmesi gerekip gerekmediği.",
  "sourceTargets": ["yargitay"]
}
```

---

## Örnek 3 — İş Hukuku (short_issue)

**Girdi:**
```
İşçi fazla mesai yaptığını iddia ediyor ama bordro imzalamış.
```

**Çıktı:**
```json
{
  "queryMode": "short_issue",
  "primaryDomain": "is_hukuku",
  "coreIssue": "İmzalı bordronun fazla mesai alacağı talebini ortadan kaldırıp kaldırmayacağı ve ispat yükünün kime ait olduğu.",
  "allowEvidenceAsCore": false,
  "retrievalConcepts": ["fazla mesai", "bordro", "ispat yükü"],
  "supportConcepts": ["imzalı belge", "ihtirazi kayıt", "zamanaşımı"],
  "evidenceConcepts": ["bordro", "puantaj kaydı", "ücret pusulası"],
  "negativeConcepts": [],
  "searchClauses": [
    "+"fazla mesai" +"bordro" +"ispat yükü"",
    "+"fazla çalışma" +"ihtirazi kayıt" +"alacak""
  ],
  "semanticQuery": "İşçinin imzaladığı bordroda fazla mesai ücretinin ödendiği görünse de ihtirazi kayıt konulmadan imzalanan bordronun fazla mesai alacağını sona erdirip erdirmeyeceği.",
  "sourceTargets": ["yargitay", "uyap"]
}
```

---

## Örnek 4 — İdare (document_style)

**Girdi:**
```
Sayın Mahkeme Başkanlığına,
Davacı ... adına ... tarihli imar para cezasına itiraz ediyoruz.
Söz konusu yapı ruhsata aykırı olmayıp mevzuata uygundur.
```

**Çıktı:**
```json
{
  "queryMode": "document_style",
  "primaryDomain": "idare",
  "coreIssue": "Ruhsata aykırı olmadığı ileri sürülen yapı için kesilen imar para cezasının iptali talebi.",
  "allowEvidenceAsCore": false,
  "retrievalConcepts": ["imar para cezası", "ruhsata aykırı yapı", "iptal davası"],
  "supportConcepts": ["orantılılık ilkesi", "idarenin takdir yetkisi"],
  "evidenceConcepts": ["yapı ruhsatı", "proje", "yapı denetim raporu"],
  "negativeConcepts": ["yıkım kararı"],
  "searchClauses": [
    "+"imar para cezası" +"ruhsata aykırı" +"iptal"",
    "+"imar cezası" +"orantılılık" +"bozma""
  ],
  "semanticQuery": "Ruhsata aykırı olmadığı savunulan yapı için kesilen imar para cezasının orantılılık ilkesi ve hukuka uygunluk denetimi kapsamında iptali.",
  "sourceTargets": ["danistay"]
}
```

---

## Örnek 5 — Delil Hukuku (allowEvidenceAsCore = true)

**Girdi:**
```
Müvekkilin telefonu arama kararı olmadan incelendi.
Bu delil mahkumiyete esas alınabilir mi?
```

**Çıktı:**
```json
{
  "queryMode": "short_issue",
  "primaryDomain": "ceza",
  "coreIssue": "Arama kararı olmaksızın elde edilen dijital delil hukuka aykırı sayılır mı ve mahkumiyete esas alınabilir mi.",
  "allowEvidenceAsCore": true,
  "retrievalConcepts": ["hukuka aykırı delil", "dijital delil", "CMK 217"],
  "supportConcepts": ["arama kararı", "delil yasakları", "dışlama kuralı"],
  "evidenceConcepts": ["telefon incelemesi", "dijital materyal", "arama tutanağı"],
  "negativeConcepts": [],
  "searchClauses": [
    "+"hukuka aykırı delil" +"dijital" +"dışlama"",
    "+"CMK 217" +"arama kararı" +"beraat""
  ],
  "semanticQuery": "Hâkim kararı olmaksızın elde edilen telefon içeriğinin hukuka aykırı delil niteliği taşıyıp taşımadığı ve yargılamada kullanılıp kullanılamayacağı.",
  "sourceTargets": ["yargitay"]
}
```
