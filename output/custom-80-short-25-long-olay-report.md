# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 09:02:54

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Secilen sorgu bicimleri: short_issue=80, long_fact=25
- Toplam test sayisi: 105

## Genel Ozet

- Genel skor: 0.59
- Pass: 58/105
- Borderline: 8/105
- Fail: 39/105
- Zero result rate: 0.162
- Fallback usage rate: 0
- Short issue skoru: 0.7
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Short Issue: skor=0.7 | pass=54/80 | zero=0.087 | fallback=0
- Long Fact: skor=0.24 | pass=4/25 | zero=0.4 | fallback=0

## Dal Kirilimlari

### �� Hukuku

- Skor: 0.5
- Pass: 11/27
- Borderline: 5/27
- Fail: 11/27
- Zero result rate: 0.185
- Fallback usage rate: 0
- Ortalama sure: 78672 ms
- Ortalama sonuc sayisi: 6.22

- Ornek sorunlu vakalar:
  - İ�e İade ve Ge�ersiz Fesih [short_issue] => fail | sonuc=4 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - İ�e İade ve Ge�ersiz Fesih [long_fact] => borderline | sonuc=9 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - Fazla Mesai ve Puantaj [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Askerlik Nedeniyle Fesih ve K�dem [short_issue] => borderline | sonuc=5 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 10. Hukuk Dairesi

### Ceza

- Skor: 0.385
- Pass: 10/26
- Borderline: 0/26
- Fail: 16/26
- Zero result rate: 0.269
- Fallback usage rate: 0
- Ortalama sure: 51893 ms
- Ortalama sonuc sayisi: 6.54

- Ornek sorunlu vakalar:
  - Uyu�turucu Ticareti mi Bulundurma mi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Uyu�turucu Ticareti mi Bulundurma mi [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Haks�z Tahrik ve Kasten Yaralama [long_fact] => fail | sonuc=4 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Me�ru Savunma [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Arama ��lemi Usuls�zl��� [short_issue] => fail | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire

### Idare

- Skor: 0.808
- Pass: 21/26
- Borderline: 0/26
- Fail: 5/26
- Zero result rate: 0.154
- Fallback usage rate: 0
- Ortalama sure: 46577 ms
- Ortalama sonuc sayisi: 7.31

- Ornek sorunlu vakalar:
  - �mar Para Cezas� ve Y�k�m [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Yap� Kay�t Belgesi ve Y�k�m [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Memur Disiplin Cezasi [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Polis Disiplin Cezasi [long_fact] => fail | sonuc=2 | ust kaynak=uyap | ust karar=Emsal İstanbul Bölge Adliye Mahkemesi 8. Hukuk Dairesi
  - ��retmen Atama İptali [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### �cra ve Alacak Hukuku

- Skor: 0.673
- Pass: 16/26
- Borderline: 3/26
- Fail: 7/26
- Zero result rate: 0.038
- Fallback usage rate: 0
- Ortalama sure: 48947 ms
- Ortalama sonuc sayisi: 7.35

- Ornek sorunlu vakalar:
  - İtiraz�n İptali ve Cari Hesap [short_issue] => borderline | sonuc=3 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi
  - Menfi Tespit ve Senet [long_fact] => fail | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Istirdat Davasi [short_issue] => fail | sonuc=5 | ust kaynak=danistay | ust karar=Danıştay Kararı 4. Daire
  - Tahliye Taahhudune Dayali Takip [short_issue] => fail | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 13. Daire
  - Tahliye Taahhudune Dayali Takip [long_fact] => borderline | sonuc=2 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
