# İdare ve Vergi Hukuku Domain Kuralları

## İdare Hukuku Kavram Haritası

```
İptal davası      → retrievalConcepts: ["idari işlem iptali", "yetki aşımı", "hukuka aykırılık"]
Tam yargı         → retrievalConcepts: ["tam yargı davası", "idari eylem", "tazminat"]
İmar              → retrievalConcepts: ["imar para cezası", "ruhsata aykırı yapı", "yıkım kararı"]
Kamulaştırma      → retrievalConcepts: ["kamulaştırma", "kamulaştırmasız el atma", "bedel tespiti"]
Disiplin          → retrievalConcepts: ["disiplin cezası", "ihraç", "memurluk"]
Ruhsat/İzin       → retrievalConcepts: ["ruhsat iptali", "faaliyet durdurma", "lisans"]
KHK/Olağanüstü    → retrievalConcepts: ["KHK ihracı", "olağanüstü hal", "bireysel başvuru"]
```

---

## Kritik Kombinasyonlar — İdare

```
+"idari işlem" +"iptal" +"yetki aşımı"
+"imar para cezası" +"orantılılık" +"iptal"
+"kamulaştırmasız el atma" +"tazminat" +"bedel"
+"disiplin cezası" +"savunma hakkı" +"iptal"
+"tam yargı davası" +"idari eylem" +"kusur"
+"ruhsat iptali" +"orantılılık" +"hukuki güvenlik"
+"idarenin takdir yetkisi" +"yargısal denetim" +"iptal"
+"idari sözleşme" +"fesih" +"tazminat"
+"ihale iptal" +"kamu ihale" +"usul"
+"çevre izni" +"ÇED" +"iptal"
```

---

## evidenceConcepts — İdare

```
idari işlem tarihi, tebliğ tarihi
idari para cezası miktarı
yapı ruhsatı, inşaat ruhsatı
proje, mimari proje
yapı denetim raporu, teknik rapor
kadastro kararı, tapu kaydı
encümen kararı, belediye meclis kararı
kamu görevlisi kimliği
ihbar ihbarcı (idari bağlam)
```

---

## sourceTargets — İdare

```json
["danistay"]           → Her türlü idari uyuşmazlık
["danistay", "uyap"]   → Yerel idare mahkemesi + Danıştay birlikte
```

Danıştay Daire Hedefleme:
```
İmar, çevre, ruhsat      → 6. Daire, 14. Daire
Memur, disiplin          → 2. Daire, 12. Daire
Vergi                    → 3. Daire, 4. Daire, 7. Daire, VDDK
Kamu ihale               → 13. Daire
Kamulaştırma             → 6. Daire
```

---

## Vergi Hukuku Kavram Haritası

```
Vergi tarhiyatı   → retrievalConcepts: ["vergi tarhiyatı", "cezalı tarhiyat", "vergi ziyaı"]
KDV uyuşmazlık    → retrievalConcepts: ["KDV", "sahte fatura", "indirim reddi"]
Gelir vergisi     → retrievalConcepts: ["gelir vergisi", "ticari kazanç", "stopaj"]
Kurumlar vergisi  → retrievalConcepts: ["kurumlar vergisi", "transfer fiyatlandırması", "örtülü kazanç"]
Vergi cezası      → retrievalConcepts: ["vergi ziyaı cezası", "usulsüzlük cezası", "uzlaşma"]
Gümrük            → retrievalConcepts: ["gümrük vergisi", "ithalat", "eksik beyan"]
```

---

## Kritik Kombinasyonlar — Vergi

```
+"sahte fatura" +"KDV indirimi" +"red"
+"vergi ziyaı" +"kasıt" +"ceza"
+"transfer fiyatlandırması" +"örtülü kazanç dağıtımı" +"tarhiyat"
+"vergi incelemesi" +"uzlaşma" +"tahakkuk"
+"gümrük" +"eksik beyan" +"ceza"
+"re'sen tarhiyat" +"ispat yükü" +"mükellef"
+"özel usulsüzlük cezası" +"belge" +"iptal"
```

---

## evidenceConcepts — Vergi

```
fatura, e-fatura, serbest meslek makbuzu
defter kaydı, muhasebe kaydı
banka hareketi, hesap özeti
vergi levhası, vergi kimlik numarası
inceleme raporu, vergi inceleme raporu
tarhiyat ihbarnamesi, ödeme emri
```

---

## Zamanaşımı Kuralları (supportConcepts'e ekle)

```
Genel vergi zamanaşımı: 5 yıl
Kaçakçılık: 8 yıl
Düzeltme zamanaşımı: 5 yıl

Kombinasyon:
+"vergi" +"zamanaşımı" +"5 yıl"
+"vergi kaçakçılığı" +"zamanaşımı" +"8 yıl"
```
