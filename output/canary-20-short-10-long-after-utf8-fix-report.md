# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 15:33:59

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Secilen sorgu bicimleri: short_issue=20, long_fact=10
- Toplam test sayisi: 30

## Genel Ozet

- Genel skor: 0.767
- Pass: 22/30
- Borderline: 2/30
- Fail: 6/30
- Zero result rate: 0.2
- Fallback usage rate: 0
- Short issue skoru: 0.875
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Short Issue: skor=0.875 | pass=17/20 | zero=0.1 | fallback=0
- Long Fact: skor=0.55 | pass=5/10 | zero=0.4 | fallback=0

## Dal Kirilimlari

### İş Hukuku

- Skor: 0.688
- Pass: 5/8
- Borderline: 1/8
- Fail: 2/8
- Zero result rate: 0.25
- Fallback usage rate: 0
- Ortalama sure: 45576 ms
- Ortalama sonuc sayisi: 6.5

- Ornek sorunlu vakalar:
  - Fazla Mesai ve Puantaj [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Askerlik Nedeniyle Fesih ve Kıdem [long_fact] => borderline | sonuc=9 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi

### Ceza

- Skor: 0.688
- Pass: 5/8
- Borderline: 1/8
- Fail: 2/8
- Zero result rate: 0.25
- Fallback usage rate: 0
- Ortalama sure: 87909 ms
- Ortalama sonuc sayisi: 7.25

- Ornek sorunlu vakalar:
  - Uyuşturucu Ticareti mi Bulundurma mi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Uyuşturucu Ticareti mi Bulundurma mi [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Arama İşlemi Usulsüzlüğü [short_issue] => borderline | sonuc=8 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi

### Idare

- Skor: 0.857
- Pass: 6/7
- Borderline: 0/7
- Fail: 1/7
- Zero result rate: 0.143
- Fallback usage rate: 0
- Ortalama sure: 55483 ms
- Ortalama sonuc sayisi: 7.86

- Ornek sorunlu vakalar:
  - Yapı Kayıt Belgesi ve Yıkım [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### İcra ve Alacak Hukuku

- Skor: 0.857
- Pass: 6/7
- Borderline: 0/7
- Fail: 1/7
- Zero result rate: 0.143
- Fallback usage rate: 0
- Ortalama sure: 147221 ms
- Ortalama sonuc sayisi: 8.29

- Ornek sorunlu vakalar:
  - Menfi Tespit ve Senet [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
