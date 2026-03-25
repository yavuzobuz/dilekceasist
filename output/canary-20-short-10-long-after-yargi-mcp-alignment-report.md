# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 11:48:37

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Secilen sorgu bicimleri: short_issue=20, long_fact=10
- Toplam test sayisi: 30

## Genel Ozet

- Genel skor: 0.75
- Pass: 19/30
- Borderline: 7/30
- Fail: 4/30
- Zero result rate: 0.133
- Fallback usage rate: 0
- Short issue skoru: 0.85
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Short Issue: skor=0.85 | pass=15/20 | zero=0.05 | fallback=0
- Long Fact: skor=0.55 | pass=4/10 | zero=0.3 | fallback=0

## Dal Kirilimlari

### �� Hukuku

- Skor: 0.625
- Pass: 5/8
- Borderline: 0/8
- Fail: 3/8
- Zero result rate: 0.375
- Fallback usage rate: 0
- Ortalama sure: 72254 ms
- Ortalama sonuc sayisi: 4.5

- Ornek sorunlu vakalar:
  - Fazla Mesai ve Puantaj [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Askerlik Nedeniyle Fesih ve K�dem [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Ceza

- Skor: 0.688
- Pass: 4/8
- Borderline: 3/8
- Fail: 1/8
- Zero result rate: 0.125
- Fallback usage rate: 0
- Ortalama sure: 86467 ms
- Ortalama sonuc sayisi: 6.5

- Ornek sorunlu vakalar:
  - Uyu�turucu Ticareti mi Bulundurma mi [short_issue] => borderline | sonuc=6 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - Uyu�turucu Ticareti mi Bulundurma mi [long_fact] => borderline | sonuc=1 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - Haks�z Tahrik ve Kasten Yaralama [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Arama ��lemi Usuls�zl��� [short_issue] => borderline | sonuc=9 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi

### Idare

- Skor: 0.929
- Pass: 6/7
- Borderline: 1/7
- Fail: 0/7
- Zero result rate: 0
- Fallback usage rate: 0
- Ortalama sure: 98908 ms
- Ortalama sonuc sayisi: 9.57

- Ornek sorunlu vakalar:
  - �mar Para Cezas� ve Y�k�m [long_fact] => borderline | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire

### �cra ve Alacak Hukuku

- Skor: 0.786
- Pass: 4/7
- Borderline: 3/7
- Fail: 0/7
- Zero result rate: 0
- Fallback usage rate: 0
- Ortalama sure: 52225 ms
- Ortalama sonuc sayisi: 6

- Ornek sorunlu vakalar:
  - Menfi Tespit ve Senet [long_fact] => borderline | sonuc=7 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Ceza Dairesi
  - Istirdat Davasi [short_issue] => borderline | sonuc=2 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - Tahliye Taahhudune Dayali Takip [short_issue] => borderline | sonuc=8 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 3. Hukuk Dairesi

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
