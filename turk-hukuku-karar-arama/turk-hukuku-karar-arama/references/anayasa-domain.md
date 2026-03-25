# Anayasa Hukuku Domain Kuralları

## İki Ana Yol

```
Norm Denetimi      → Kanun/KHK anayasaya aykırılığı → AYM doğrudan
Bireysel Başvuru   → Temel hak ihlali → AYM (iç yollar tükendikten sonra)
```

---

## Bireysel Başvuru Kavram Haritası

```
Adil yargılanma   → retrievalConcepts: ["adil yargılanma hakkı", "AİHS 6", "Anayasa 36"]
Kişi özgürlüğü   → retrievalConcepts: ["kişi özgürlüğü", "tutukluluğun makullüğü", "Anayasa 19"]
İfade özgürlüğü  → retrievalConcepts: ["ifade özgürlüğü", "AİHS 10", "Anayasa 26"]
Mülkiyet hakkı   → retrievalConcepts: ["mülkiyet hakkı", "orantılılık", "Anayasa 35"]
Özel hayat       → retrievalConcepts: ["özel hayatın gizliliği", "AİHS 8", "Anayasa 20"]
Etkili başvuru   → retrievalConcepts: ["etkili başvuru hakkı", "AİHS 13", "Anayasa 40"]
KHK mağduru      → retrievalConcepts: ["KHK ihracı", "olağanüstü hal", "hak ihlali"]
Uzun yargılama   → retrievalConcepts: ["makul süre", "yargılama süresi", "tazminat"]
```

---

## Kritik Kombinasyonlar — AYM Bireysel Başvuru

```
+"adil yargılanma" +"silahların eşitliği" +"ihlal"
+"tutukluluğun makullüğü" +"tutukluluk süresi" +"ihlal"
+"ifade özgürlüğü" +"basın özgürlüğü" +"ihlal"
+"mülkiyet hakkı" +"kamulaştırmasız el atma" +"ihlal"
+"kişisel veri" +"özel hayat" +"ihlal"
+"makul süre" +"yargılama" +"tazminat"
+"KHK" +"olağanüstü hal" +"orantılılık"
+"etkili başvuru" +"iç hukuk yolu" +"tüketme"
+"örgütlenme özgürlüğü" +"sendika" +"ihlal"
+"din özgürlüğü" +"vicdan" +"ihlal"
```

---

## Norm Denetimi Kombinasyonları

```
+"anayasaya aykırılık" +"kanun" +"iptal"
+"eşitlik ilkesi" +"Anayasa 10" +"ayrımcılık"
+"hukuk devleti" +"belirlilik ilkesi" +"iptal"
+"temel hak sınırlaması" +"orantılılık" +"ölçülülük"
+"yasama yetkisi" +"KHK" +"sınır aşımı"
```

---

## evidenceConcepts — Anayasa

```
başvuru tarihi, iç yolların tüketilme tarihi
yargılama süresi (gün/ay/yıl)
tazminat miktarı
ihraç tarihi, göreve iade tarihi
tutukluluk süresi
```

---

## sourceTargets — Anayasa

```json
["anayasa"]   → Her zaman sadece AYM
```

**Önemli:** AYM kararları `search_anayasa_unified` aracıyla aranır,
`search_bedesten_unified` değil. Bu ayrımı searchClauses'da belirt.

---

## AİHS Madde — Anayasa Maddesi Eşleştirmesi

```
AİHS 2  → Yaşam hakkı          → Anayasa 17
AİHS 3  → İşkence yasağı       → Anayasa 17
AİHS 5  → Özgürlük hakkı       → Anayasa 19
AİHS 6  → Adil yargılanma      → Anayasa 36
AİHS 7  → Kanunilik            → Anayasa 38
AİHS 8  → Özel hayat           → Anayasa 20
AİHS 9  → Din özgürlüğü        → Anayasa 24
AİHS 10 → İfade özgürlüğü      → Anayasa 26
AİHS 11 → Örgütlenme           → Anayasa 33-34
AİHS 13 → Etkili başvuru       → Anayasa 40
AİHS 1P → Mülkiyet             → Anayasa 35
```

---

## Tazminat Türleri (supportConcepts'e ekle)

```
manevi tazminat
maddi tazminat
ihlal tespiti
yeniden yargılama
```
