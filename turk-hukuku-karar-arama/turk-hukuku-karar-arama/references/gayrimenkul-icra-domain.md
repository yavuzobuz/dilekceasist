# Gayrimenkul ve İcra Hukuku Domain Kuralları

---

## Gayrimenkul Hukuku Kavram Haritası

```
Tapu iptali       → retrievalConcepts: ["tapu iptali tescil", "muvazaa", "TMK 1025"]
Kat mülkiyeti     → retrievalConcepts: ["kat mülkiyeti", "ortak alan", "KMK 19"]
Ön alım hakkı     → retrievalConcepts: ["önalım hakkı", "şufa", "TMK 732"]
Müdahalenin men   → retrievalConcepts: ["müdahalenin men'i", "el atmanın önlenmesi", "TMK 683"]
Ecrimisil         → retrievalConcepts: ["ecrimisil", "haksız işgal", "tazminat"]
Kamulaştırma      → retrievalConcepts: ["kamulaştırma bedeli", "değer tespiti", "Kamulaştırma K. 10"]
İmar uyuşmazlık   → retrievalConcepts: ["imar planı iptali", "yapı ruhsatı", "inşaat"]
Kat karşılığı     → retrievalConcepts: ["kat karşılığı inşaat", "arsa payı", "teslim yükümlülüğü"]
Kooperatif        → retrievalConcepts: ["kooperatif", "ortaklıktan çıkarma", "Kooperatifler K."]
Kira (gayrimenkul)→ retrievalConcepts: ["kiracı tahliye", "kira tespiti", "TBK 347"]
Miras (taşınmaz) → retrievalConcepts: ["mirasçı", "tenkis", "TMK 560"]
```

---

## Kritik Kombinasyonlar — Gayrimenkul

```
+"tapu iptali" +"muvazaa" +"hısım"
+"tapu iptali" +"ölünceye kadar bakma" +"tescil"
+"kat karşılığı" +"daire teslimi" +"gecikme tazminatı"
+"ön alım hakkı" +"paylı mülkiyet" +"kullanım"
+"ecrimisil" +"haksız işgal" +"kira bedeli"
+"kat mülkiyeti" +"ortak gider" +"aidat"
+"müdahalenin men'i" +"komşuluk hukuku" +"TMK 737"
+"kamulaştırma bedeli" +"bilirkişi" +"değer tespiti"
+"kooperatif" +"ortaklıktan çıkarma" +"usul"
+"inşaat sözleşmesi" +"ayıp" +"garanti"
+"imar planı" +"iptal" +"kazanılmış hak"
+"bağımsız bölüm" +"arsa payı" +"düzeltme"
```

---

## evidenceConcepts — Gayrimenkul

```
tapu kaydı, tapu senedi
kadastro kararı, aplikasyon krokisi
imar planı, parselasyon planı
inşaat ruhsatı, yapı kullanma izni
kira sözleşmesi
bilirkişi değerleme raporu, ekspertiz
bağımsız bölüm listesi, yönetim planı
kooperatif üyelik belgesi
noter satış vaadi sözleşmesi
```

---

## sourceTargets — Gayrimenkul

```json
["yargitay"]           → Tapu, mülkiyet, kira (1-3. Hukuk, 14. Hukuk)
["danistay"]           → İmar planı, kamulaştırma (idari boyut)
["yargitay", "uyap"]   → Kapsamlı arama
```

---

## İcra Hukuku Kavram Haritası

```
İtiraz            → retrievalConcepts: ["itirazın iptali", "İİK 67", "icra inkâr tazminatı"]
Menfi tespit      → retrievalConcepts: ["menfi tespit davası", "borçsuzluk", "İİK 72"]
İstirdat          → retrievalConcepts: ["istirdat davası", "ödenen borç", "İİK 72"]
Haciz             → retrievalConcepts: ["haciz", "haczedilemezlik", "İİK 82"]
Tahliye           → retrievalConcepts: ["icra yoluyla tahliye", "kira", "İİK 272"]
Kambiyo           → retrievalConcepts: ["kambiyo senetleri", "çek", "itiraz"]
İpoteğin paraya   → retrievalConcepts: ["ipoteğin paraya çevrilmesi", "İİK 150"]
Konkordato        → retrievalConcepts: ["konkordato", "mühlet", "alacaklı"]
İflas             → retrievalConcepts: ["iflas", "masaya dahil", "İİK 193"]
Sıra cetveli      → retrievalConcepts: ["sıra cetveli", "alacaklılar", "haciz sırası"]
```

---

## Kritik Kombinasyonlar — İcra

```
+"itirazın iptali" +"icra inkâr tazminatı" +"İİK 67"
+"menfi tespit" +"takip öncesi" +"İİK 72"
+"haciz" +"haczedilemezlik" +"İİK 82"
+"maaş haczi" +"sınır" +"dörtte bir"
+"kambiyo" +"bono" +"itiraz süresi"
+"çek" +"karşılıksız" +"borçlu itirazı"
+"ipoteğin paraya çevrilmesi" +"ihale" +"fesih"
+"konkordato" +"mühlet" +"alacaklı toplantısı"
+"iflas" +"masaya giren alacak" +"sıra"
+"icra yoluyla tahliye" +"kira" +"ödeme emri"
+"ihalenin feshi" +"artırma" +"kıymet takdiri"
+"imzaya itiraz" +"kambiyo" +"inceleme"
```

---

## evidenceConcepts — İcra

```
ödeme emri tebliğ tarihi, itiraz süresi
senet tarihi, vade tarihi, tutar
icra dosya numarası
kıymet takdir raporu
ihale tutanağı
maaş bordrosu (haciz bağlamında)
banka hesap dökümü
tapu kaydı (ipotekli gayrimenkul)
```

---

## Zamanaşımı ve Süreler (supportConcepts)

```
İtiraz süresi: tebliğden 7 gün (genel), 5 gün (kambiyo)
Menfi tespit: takip öncesi her zaman, takip sonrası 1 yıl
İhalenin feshi: 7 gün
İcra inkâr tazminatı: asıl alacağın %20'si

Kombinasyonlar:
+"itiraz süresi" +"7 gün" +"İİK 62"
+"kambiyo" +"5 günlük itiraz" +"süre aşımı"
+"ihalenin feshi" +"7 gün" +"süre"
```

---

## sourceTargets — İcra

```json
["yargitay"]   → 12. Hukuk Dairesi (icra uyuşmazlıkları)
["uyap"]       → İcra mahkemesi kararları
```
