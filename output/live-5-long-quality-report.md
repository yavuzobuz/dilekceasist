# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 17:28:02

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Secilen sorgu bicimleri: long_fact=5
- Toplam test sayisi: 5

## Genel Ozet

- Genel skor: 0
- Pass: 0/5
- Borderline: 0/5
- Fail: 5/5
- Zero result rate: 1
- Fallback usage rate: 0
- Short issue skoru: 0
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Long Fact: skor=0 | pass=0/5 | zero=1 | fallback=0

## Dal Kirilimlari

### İş Hukuku

- Skor: 0
- Pass: 0/2
- Borderline: 0/2
- Fail: 2/2
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 3547 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - İşe İade ve Geçersiz Fesih [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Ceza

- Skor: 0
- Pass: 0/1
- Borderline: 0/1
- Fail: 1/1
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 2834 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - Uyuşturucu Ticareti mi Bulundurma mi [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Idare

- Skor: 0
- Pass: 0/1
- Borderline: 0/1
- Fail: 1/1
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 2836 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - İmar Para Cezası ve Yıkım [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### İcra ve Alacak Hukuku

- Skor: 0
- Pass: 0/1
- Borderline: 0/1
- Fail: 1/1
- Zero result rate: 1
- Fallback usage rate: 0
- Ortalama sure: 2649 ms
- Ortalama sonuc sayisi: 0

- Ornek sorunlu vakalar:
  - İtirazın İptali ve Cari Hesap [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
