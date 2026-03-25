# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 09:54:39

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Secilen sorgu bicimleri: short_issue=20, long_fact=10
- Toplam test sayisi: 30

## Genel Ozet

- Genel skor: 0
- Pass: 0/30
- Borderline: 0/30
- Fail: 30/30
- Zero result rate: 1
- Fallback usage rate: 0
- Short issue skoru: 0
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Short Issue: skor=0 | pass=0/20 | zero=1 | fallback=0
- Long Fact: skor=0 | pass=0/10 | zero=1 | fallback=0

## Dal Kirilimlari

### �� Hukuku

- Skor: 0
- Pass: 0/8
- Borderline: 0/8
- Fail: 8/8
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 3139 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - İ�e İade ve Ge�ersiz Fesih [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - İ�e İade ve Ge�ersiz Fesih [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Askerlik Nedeniyle Fesih ve K�dem [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Ceza

- Skor: 0
- Pass: 0/8
- Borderline: 0/8
- Fail: 8/8
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 3044 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - Uyu�turucu Ticareti mi Bulundurma mi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Uyu�turucu Ticareti mi Bulundurma mi [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Haks�z Tahrik ve Kasten Yaralama [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Haks�z Tahrik ve Kasten Yaralama [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Me�ru Savunma [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Idare

- Skor: 0
- Pass: 0/7
- Borderline: 0/7
- Fail: 7/7
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 2883 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - �mar Para Cezas� ve Y�k�m [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - �mar Para Cezas� ve Y�k�m [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Yap� Kay�t Belgesi ve Y�k�m [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Yap� Kay�t Belgesi ve Y�k�m [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Memur Disiplin Cezasi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### �cra ve Alacak Hukuku

- Skor: 0
- Pass: 0/7
- Borderline: 0/7
- Fail: 7/7
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 2762 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - İtiraz�n İptali ve Cari Hesap [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - İtiraz�n İptali ve Cari Hesap [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Menfi Tespit ve Senet [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Menfi Tespit ve Senet [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Istirdat Davasi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
