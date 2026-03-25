# Delil Sinyali Terimler — Tam Liste

Bu dosyadaki tüm terimler ve varyantları **kesinlikle** `evidenceConcepts`'e girer.
`retrievalConcepts`'e **asla** girmez. `allowEvidenceAsCore=false` ise bu kural mutlaktır.

---

## Paketleme Grubu
```
paketleme, paketlenmiş, paketçik, ambalaj, ambalajlı
folyo, streç, naylon, poşet, ziplock
sarma, sarılı, sarılmış, sargı
gazete kağıdı, kağıda sarılı, kağıt
rulo, silindir şeklinde
bant, bantlı, bantlanmış
kese, torba
```

## Tartı / Ölçüm Grubu
```
hassas terazi, dijital terazi, elektronik terazi
terazi, tartı aleti, baskül, kantar
gram, miligram, kilogram
net ağırlık, brüt ağırlık, toplam ağırlık
miktar, ele geçirilen miktar, bulunan miktar
doz, porsyon
```

## Uyuşturucu Hazırlık Materyali Grubu
```
kesme tahtası, kesme aleti
bıçak (uyuşturucu bağlamında)
cam boru, pipe, tüp
enjektör, şırınga
çakmak, kaşık
folyo tüp, alüminyum folyo
jilet, ustura
```

## Satış / Dağıtım Materyali Grubu
```
satış materyali, satışa hazır materyal
dağıtım materyali, dağıtıma hazır
fiyat listesi, tarife
müşteri listesi, alıcı listesi
randevu notu, sipariş notu
```

## Para / Değer Grubu
```
nakit para, döviz, euro, dolar
altın, değerli maden
para miktarı, nakit miktar
satış bedeli, satış geliri
ele geçirilen para, bulunan para
uhde (para bağlamında)
hakimiyet alanı (para bağlamında)
```

## İletişim / Kayıt Grubu
```
mesaj, whatsapp mesajı, telegram mesajı
SMS, kısa mesaj
arama kaydı, telefon kaydı, HTS kaydı
ses kaydı, görüntülü kayıt
fotoğraf, ekran görüntüsü
sosyal medya paylaşımı
```

## Kamera / Gözetleme Grubu
```
kamera görüntüsü, MOBESE
güvenlik kamerası, iç kamera
kamera kaydı, video kayıt
gözetleme, takip
```

## Kimlik / Konum Grubu
```
adres, ikametgah adresi
konum, GPS koordinatı
depo, depolama yeri
saklama yeri, gizleme yeri
```

## Tanık Grubu
```
tanık beyanı, tanık ifadesi
ihbarcı, muhbir
görgü tanığı
beyan (delil olarak)
```

## Rapor / Tutanak Grubu
```
adli rapor, adli tıp raporu
uyuşturucu analiz raporu, kimyasal analiz
arama tutanağı, el koyma tutanağı
olay yeri tutanağı
materyal mukayese raporu
parmak izi raporu, DNA raporu
trafik raporu, kaza tespit tutanağı
işyeri kayıtları, defter, fatura
```

## Tarih / Süre Grubu
```
suç tarihi, olay tarihi
yakalanma tarihi, gözaltı tarihi
sözleşme tarihi, vade tarihi
```

---

## Özel Not: "Uhde" ve "Hakimiyet Alanı"

Bu iki terim **bağlama göre** değerlendirilir:

- **Para / mal varlığı bağlamında** (ör. "satış bedeli uhdesinde bulunmamıştır") → `evidenceConcepts`
- **Zilyetlik / fiili hakimiyet hukuki teorisi** (ör. "uyuşturucu madde üzerinde hakimiyet kurulması") → `retrievalConcepts` olabilir

Şüpheli durumlarda `evidenceConcepts`'e koy.
