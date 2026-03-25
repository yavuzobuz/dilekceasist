# Hukuk Arama Sistemi Durum Raporu

Tarih: 11 Mart 2026

## Genel Puan

Su anki durum: **10 uzerinden 7.5**

Bu puani vermemin nedeni su:

- Sistem artik sorgunun hangi hukuk alanina ait oldugunu buyuk oranda anlayabiliyor.
- AI, sorgu icin zorunlu ve destek kavramlar uretiyor.
- Sonuclar sadece kaba kelime aramasina gore degil, karar metninde bu kavramlar gercekten var mi diye kontrol edilerek eleniyor.
- Daha once ceza sorgusunda hukuk/ticaret kararlarinin ustte gelmesi gibi hatalar ciddi sekilde azaldi.

Ama hala 9-10 demiyorum. Cunku:

- Uzak Yargi MCP kaynagi cogu zaman zayif baslik veya bos ozet donuyor.
- Bu nedenle sistem dogru karari bulmak icin daha cok tam metin acmak zorunda kaliyor.
- Bu da bazen hizi dusurebilir.
- Bazi sorgularda AI kavramlari hala biraz fazla resmi veya uzun kurabiliyor.

## Su An Sistem Nasil Calisiyor

Mevcut mantik su:

1. Kullanici sorgu yazar.
2. AI once bunun hangi hukuk alanina ait oldugunu anlar.
3. Sonra o dosya icin:
   - `zorunlu kavramlar`
   - `destek kavramlar`
   uretir.
4. Remote Yargi MCP aday kararlari getirir.
5. Sistem bu adaylarin:
   - once ozet/baslik bilgisini,
   - gerekirse tam metnini
   kontrol eder.
6. Zorunlu kavramlarla yeterli eslesme yoksa karar elenir.
7. Eslesen kararlar listelenir.

Yani artik mantik daha cok suya dondu:

> AI konu ne onu anla, o konuya uygun aranacak kelimeleri cikar, bu kelimeler kararda yoksa karari at.

## Neler Iyi Calisiyor

### 1. Alan ayirma daha iyi

Sistem su alanlari artik daha dogru ayiriyor:

- Is hukuku
- Ceza
- Idare
- Icra / alacak

### 2. Sacma karisimlar azaldi

Once:

- Ceza sorgusunda ticaret veya hukuk kararlari ustte cikabiliyordu.
- Idare sorgusunda Yargitay hukuk kararlari ustte gelebiliyordu.

Simdi bu sorunlar ciddi sekilde azaldi.

### 3. Tam metin kontrolu geldi

Bu en buyuk duzeltme oldu.

Sorun suydu:

- Yargi MCP bazen sadece `Yargitay Karari 9. Hukuk Dairesi` gibi genel bir baslik getiriyor
- ozet ve snippet bos olabiliyor

Bu durumda eski mantik dogru karari daha tam metne bakmadan eleyebiliyordu.

Simdi:

- baslik/ozet zayifsa
- ust adaylarin tam metni aciliyor
- asil eslesme tam metinde araniyor

Bu kaliteyi ciddi arttirdi.

## Hala Orta Seviyede Olan Yerler

### 1. Hiz

Baslik ve ozet zayif geldiginde sistem tam metin aciyor.
Bu kaliteyi artiriyor ama bazen daha yavas hissettirebilir.

### 2. AI kavram dili

Bazi sorgularda AI kavramlari hala biraz fazla resmi kurabiliyor.
Bu onceye gore daha iyi, ama tamamen kusursuz degil.

### 3. Uzak servis bagimliligi

Sistem public Yargi MCP ve Gemini ile calistigi icin:

- uzak servis yavaslarsa
- gecici hata verirse

kalite veya hiz etkilenebilir.

## Canli Test Sonuclari

Asagidaki 5 senaryo canli olarak denendi:

### 1. Ise iade

- Sonuc: **8 karar**
- Ustte gelen alan: **Yargitay 9. Hukuk Dairesi**
- Durum: **iyi**

### 2. Fazla mesai

- Sonuc: **10 karar**
- Ustte gelen alan: **Yargitay 9. Hukuk Dairesi**
- Durum: **iyi**

### 3. Uyusturucu ticareti / kullanmak icin bulundurma

- Sonuc: **12 karar**
- Ustte gelen alan: **Ceza Genel Kurulu**
- Durum: **iyi**

### 4. Imar para cezasi

- Sonuc: **4 karar**
- Ustte gelen alan: **Danistay 6. Daire**
- Durum: **iyi**

### 5. Itirazin iptali

- Sonuc: **7 karar**
- Ustte gelen alan: **Yargitay 11. Hukuk Dairesi**
- Durum: **iyi**

## Kisa Ozet

Su an sistem:

- bozuk degil
- kullanilabilir durumda
- onceye gore bariz daha iyi
- senin istedigin mantiga cok daha yakin

Ama hala gelistirilebilir.

## Su Anda En Dogru Dort Acik Tespit

### Guclu taraf

AI artik sorguyu sadece kisaltmiyor; hukuki konuya gore anlamlandirip sonuc filtrelemeye yardim ediyor.

### En buyuk kazanim

Tam metin dogrulama eklendigi icin dogru kararlar gereksiz yere cope gitmiyor.

### En buyuk kalan risk

Yargi MCP'nin zayif ozet donmesi yuzunden sistem bazi aramalarda daha cok tam metin okumak zorunda kaliyor.

### Genel yargi

**Uretim oncesi guclu beta seviyesi** diyebilirim.

## Sonraki Mantikli Iyilestirme

Eger bir sonraki adimi sececek olursak en mantiklisi su olur:

- her sonuc icin
  - hangi zorunlu kavram tuttu
  - hangi zorunlu kavram tutmadi
  bilgisini ekranda gostermek

Bu sayede neden listelendi veya neden elendi, gozle daha net takip edilir.
