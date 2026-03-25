# Spor ve Aile Hukuku Domain Kuralları

---

## Spor Hukuku Kavram Haritası

```
Sözleşme ihlali   → retrievalConcepts: ["sporcu sözleşmesi", "transfer", "FIFA RSTP"]
Disiplin          → retrievalConcepts: ["disiplin cezası", "ihraç", "TFF Disiplin Talimatı"]
Doping            → retrievalConcepts: ["doping", "WADA", "TAS kararı"]
Kulüp alacak      → retrievalConcepts: ["kulüp alacağı", "sporcu ücreti", "fesih"]
Hakem kararı      → retrievalConcepts: ["hakem kararı", "CAS tahkim", "tanıma tenfiz"]
Federasyon işlemi → retrievalConcepts: ["federasyon kararı", "iptal davası", "idare mahkemesi"]
Lisans            → retrievalConcepts: ["sporcu lisansı", "iptali", "tescil"]
Şike/Teşvik       → retrievalConcepts: ["şike", "teşvik primi", "TCK 236"]
Taraftar disiplin → retrievalConcepts: ["taraftar eylemleri", "seyircisiz oynama", "para cezası"]
```

---

## Kritik Kombinasyonlar — Spor

```
+"sporcu sözleşmesi" +"fesih" +"tazminat"
+"transfer" +"FIFA" +"eğitim tazminatı"
+"doping" +"yasaklı madde" +"ceza"
+"TFF" +"disiplin" +"iptal"
+"sporcu ücreti" +"kulüp" +"alacak"
+"CAS tahkim" +"tanıma" +"tenfiz"
+"şike" +"TCK 236" +"teşvik"
+"federasyon" +"lisans" +"iptal"
+"profesyonel futbolcu" +"sözleşme" +"haksız fesih"
+"kulüp" +"icra" +"sporcu alacağı"
+"antrenör" +"sözleşme" +"tazminat"
+"spor kulübü" +"dernek" +"genel kurul iptali"
```

---

## Spor Hukuku Özel Kurallar

### CAS/TAS Kararları
CAS tahkim kararlarının Türk mahkemelerinde tanıma ve tenfizidir:
```
retrievalConcepts: ["CAS kararı", "tanıma tenfiz", "MÖHUK"]
supportConcepts: ["hakem kararı", "milletlerarası tahkim"]
sourceTargets: ["yargitay"]  → 11. Hukuk Dairesi
```

### TFF Kararlarına İtiraz
TFF kararları idari nitelikte değil, özel hukuk tüzel kişisi kararları:
```
sourceTargets: ["yargitay", "uyap"]  → Adli yargı
NOT: İdare mahkemesine değil adli yargıya gidilir
```

### Şike Davaları
```
retrievalConcepts: ["şike", "TCK 236", "sporda şiddet"]
sourceTargets: ["yargitay"]  → Ceza Daireleri
```

---

## evidenceConcepts — Spor

```
sporcu sözleşmesi, transfer belgesi
kulüp sicil kaydı, lisans belgesi
doping test raporu, numune analizi
disiplin kurulu kararı
maç raporu, hakem raporu
TFF tescil belgesi
banka ödeme belgesi (ücret)
sosyal medya paylaşımı (taraftar eylemleri)
```

---

## sourceTargets — Spor

```json
Sözleşme/alacak uyuşmazlıkları:  ["yargitay", "uyap"]
Şike/TCK:                          ["yargitay"]
Federasyon idari kararı:           ["danistay"]  ← nadir, genellikle adli yargı
CAS tanıma/tenfiz:                 ["yargitay"]
```

---

## Aile Hukuku Kavram Haritası

```
Boşanma           → retrievalConcepts: ["boşanma", "TMK 166", "evlilik birliğinin temelinden sarsılması"]
Nafaka            → retrievalConcepts: ["nafaka", "iştirak nafakası", "yoksulluk nafakası"]
Velayet           → retrievalConcepts: ["velayet", "çocuğun üstün yararı", "TMK 182"]
Mal rejimi        → retrievalConcepts: ["edinilmiş mallara katılma", "tasfiye", "TMK 218"]
Tazminat (boş.)   → retrievalConcepts: ["maddi tazminat", "manevi tazminat", "TMK 174"]
Soybağı           → retrievalConcepts: ["soybağı", "babalık davası", "TMK 301"]
Evlat edinme      → retrievalConcepts: ["evlat edinme", "TMK 305", "mahkeme onayı"]
Aile konutu       → retrievalConcepts: ["aile konutu şerhi", "TMK 194", "tapu"]
Koruma tedbiri    → retrievalConcepts: ["6284 sayılı kanun", "uzaklaştırma", "koruma tedbiri"]
Miras             → retrievalConcepts: ["mirasçılık", "tenkis", "TMK 560"]
```

---

## Kritik Kombinasyonlar — Aile

```
+"boşanma" +"evlilik birliği" +"çekilmezlik"
+"nafaka" +"iştirak" +"artırım"
+"velayet" +"çocuğun üstün yararı" +"değiştirilmesi"
+"kişisel ilişki" +"çocuk" +"düzenleme"
+"edinilmiş mal" +"katkı" +"tasfiye"
+"ziynet eşyası" +"iade" +"boşanma"
+"aile konutu" +"şerh" +"TMK 194"
+"6284" +"uzaklaştırma" +"ihlal"
+"soybağı" +"DNA" +"babalık"
+"tenkis" +"saklı pay" +"mirasçı"
+"miras reddi" +"süre" +"3 ay"
+"ölüme bağlı tasarruf" +"vasiyetname" +"iptal"
```

---

## evidenceConcepts — Aile

```
evlilik cüzdanı, nüfus kaydı
boşanma protokolü
DNA raporu
psikolojik değerlendirme raporu (velayet)
mal varlığı araştırma raporu
tapu kaydı, banka hesabı (mal rejimi)
sosyal inceleme raporu
tanık beyanı (boşanma sebebi)
fotoğraf, mesaj (sadakatsizlik)
```

---

## sourceTargets — Aile

```json
["yargitay", "uyap"]   → Aile hukuku genel
["yargitay"]           → 2. Hukuk Dairesi (boşanma, velayet, nafaka)
```

---

## Özel: 6284 Sayılı Kanun (Aile İçi Şiddet)

```
retrievalConcepts: ["6284 sayılı kanun", "koruyucu tedbir", "uzaklaştırma"]
supportConcepts: ["ihlal", "zorlama hapsi", "tedbir süresi"]
evidenceConcepts: ["tedbir kararı", "polis tutanağı", "adli tıp raporu"]
sourceTargets: ["yargitay", "uyap"]
```
