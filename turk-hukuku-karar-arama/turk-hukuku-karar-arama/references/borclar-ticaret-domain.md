# Borçlar ve Ticaret Hukuku Domain Kuralları

---

## Borçlar Hukuku Kavram Haritası

```
Sözleşme ihlali   → retrievalConcepts: ["sözleşmeye aykırılık", "tazminat", "TBK 112"]
Haksız fiil       → retrievalConcepts: ["haksız fiil", "maddi tazminat", "TBK 49"]
Sebepsiz zenginleşme → retrievalConcepts: ["sebepsiz zenginleşme", "iade", "TBK 77"]
Vekalet           → retrievalConcepts: ["vekalet sözleşmesi", "özen yükümlülüğü", "TBK 506"]
Eser sözleşmesi   → retrievalConcepts: ["eser sözleşmesi", "ayıplı iş", "TBK 474"]
Kira              → retrievalConcepts: ["kira sözleşmesi", "tahliye", "TBK 347"]
Kefalet           → retrievalConcepts: ["kefalet", "kefil sorumluluğu", "TBK 581"]
Sigorta           → retrievalConcepts: ["sigorta sözleşmesi", "tazminat", "riski gerçekleşmesi"]
Tüketici          → retrievalConcepts: ["tüketici sözleşmesi", "ayıplı mal", "TKHK 11"]
```

---

## Kritik Kombinasyonlar — Borçlar

```
+"sözleşme feshi" +"tazminat" +"müspet zarar"
+"haksız fiil" +"kusur" +"nedensellik bağı"
+"manevi tazminat" +"kişilik hakkı" +"ihlal"
+"kira tahliye" +"ihtiyaç" +"TBK 350"
+"kira artışı" +"TÜFE" +"TBK 344"
+"ayıplı mal" +"tüketici" +"iade"
+"vekalet" +"özen borcu" +"tazminat"
+"eser sözleşmesi" +"ayıplı iş" +"onarım"
+"sebepsiz zenginleşme" +"iade yükümlülüğü" +"TBK 77"
+"kefalet" +"şekil şartı" +"geçersizlik"
+"sigorta" +"rücu" +"sorumluluk"
+"ön sözleşme" +"bağlayıcılık" +"tazminat"
```

---

## Tazminat Türleri (supportConcepts)

```
müspet zarar (beklenen menfaat)
menfi zarar (sözleşmeye güven zararı)
maddi tazminat
manevi tazminat
destekten yoksun kalma tazminatı
iş göremezlik tazminatı
```

---

## evidenceConcepts — Borçlar

```
sözleşme metni, sözleşme tarihi
fatura, irsaliye
banka hareketi, ödeme belgesi
tanık beyanı
bilirkişi raporu, ekspertiz raporu
tapu senedi
kira sözleşmesi, kira artış belgesi
sigorta poliçesi
```

---

## Zamanaşımı (supportConcepts)

```
Genel zamanaşımı: 10 yıl (TBK 125)
Haksız fiil: 2 yıl / 10 yıl (TBK 72)
Kira alacağı: 5 yıl
Taşeron alacakları: 5 yıl

Kombinasyon:
+"zamanaşımı" +"TBK 125" +"def'i"
+"haksız fiil" +"zamanaşımı" +"2 yıl"
```

---

## Ticaret Hukuku Kavram Haritası

```
Şirket uyuşmazlık  → retrievalConcepts: ["limited şirket", "ortaklık", "TTK 573"]
Anonim şirket      → retrievalConcepts: ["anonim şirket", "genel kurul", "TTK 409"]
Ticari alacak      → retrievalConcepts: ["ticari alacak", "cari hesap", "faiz"]
Çek/Senet          → retrievalConcepts: ["çek bedeli", "kambiyo senedi", "TTK 780"]
İflas/Konkordato   → retrievalConcepts: ["iflas erteleme", "konkordato", "İİK 285"]
Haksız rekabet     → retrievalConcepts: ["haksız rekabet", "TTK 54", "tazminat"]
Marka/Patent       → retrievalConcepts: ["marka ihlali", "SMK", "tazminat"]
Sigorta (ticari)   → retrievalConcepts: ["ticari sigorta", "kasko", "poliçe"]
Acente/Bayilik     → retrievalConcepts: ["acentelik sözleşmesi", "TTK 102", "denkleştirme"]
```

---

## Kritik Kombinasyonlar — Ticaret

```
+"anonim şirket" +"genel kurul kararı" +"iptal"
+"limited şirket" +"ortaklar kurulu" +"müdür sorumluluğu"
+"çek" +"karşılıksız" +"icra"
+"bono" +"kambiyo" +"itiraz"
+"konkordato" +"alacaklı" +"tasdik"
+"iflas" +"masaya dahil" +"sıra cetveli"
+"haksız rekabet" +"ticaret unvanı" +"TTK 54"
+"marka" +"benzerlik" +"iltibas"
+"acente" +"denkleştirme tazminatı" +"TTK 122"
+"ticari temsilci" +"yetki" +"TTK 547"
+"nama yazılı hisse" +"devir" +"TTK 490"
```

---

## evidenceConcepts — Ticaret

```
ticaret sicil kaydı, ticaret sicil gazetesi
ortaklık sözleşmesi, esas sözleşme
genel kurul tutanağı, yönetim kurulu kararı
çek yaprağı, senet
ticari defter kaydı
banka hesap hareketi
marka tescil belgesi
acente sözleşmesi
```

---

## sourceTargets — Borçlar ve Ticaret

```json
Borçlar:  ["yargitay"]        → 1-4. Hukuk Daireleri
Ticaret:  ["yargitay"]        → 11-12. Hukuk Daireleri
Tüketici: ["yargitay", "uyap"] → Tüketici mahkemesi + Yargıtay
```
