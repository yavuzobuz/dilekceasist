# Canli Hukuk Arama Test Matrisi Raporu

Tarih: 12.03.2026 09:37:52

## Kapsam

- 4 ana dal korundu: Is Hukuku, Ceza, Idare, Icra ve Alacak Hukuku
- Her temel vakadan 3 sorgu bicimi uretildi: short_issue, long_fact, document_style
- Toplam test sayisi: 240

## Genel Ozet

- Genel skor: 0.419
- Pass: 80/240
- Borderline: 41/240
- Fail: 119/240
- Zero result rate: 0.283
- Fallback usage rate: 0
- Short issue skoru: 0.744
- Kabul >= 0.80: HAYIR
- Dal tabani >= 0.75: HAYIR
- Zero result < 0.10: HAYIR

## Sorgu Bicimi Kirilimlari

- Short Issue: skor=0.744 | pass=57/80 | zero=0.075 | fallback=0
- Long Fact: skor=0.275 | pass=14/80 | zero=0.338 | fallback=0
- Document Style: skor=0.237 | pass=9/80 | zero=0.438 | fallback=0

## Dal Kirilimlari

### İş Hukuku

- Skor: 0.317
- Pass: 15/60
- Borderline: 8/60
- Fail: 37/60
- Zero result rate: 0.367
- Fallback usage rate: 0
- Ortalama sure: 79524 ms
- Ortalama sonuc sayisi: 3.88

- Ornek sorunlu vakalar:
  - İşe İade ve Geçersiz Fesih [short_issue] => borderline | sonuc=9 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - İşe İade ve Geçersiz Fesih [long_fact] => fail | sonuc=10 | ust kaynak=uyap | ust karar=Emsal Bursa 4. Asliye Ticaret Mahkemesi
  - İşe İade ve Geçersiz Fesih [document_style] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Fazla Mesai ve Puantaj [short_issue] => borderline | sonuc=3 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - Fazla Mesai ve Puantaj [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Ceza

- Skor: 0.242
- Pass: 9/60
- Borderline: 11/60
- Fail: 40/60
- Zero result rate: 0.483
- Fallback usage rate: 0
- Ortalama sure: 58368 ms
- Ortalama sonuc sayisi: 2.6

- Ornek sorunlu vakalar:
  - Uyuşturucu Ticareti mi Bulundurma mi [short_issue] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Uyuşturucu Ticareti mi Bulundurma mi [long_fact] => fail | sonuc=1 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Uyuşturucu Ticareti mi Bulundurma mi [document_style] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - Haksız Tahrik ve Kasten Yaralama [long_fact] => fail | sonuc=1 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Haksız Tahrik ve Kasten Yaralama [document_style] => fail | sonuc=0 | ust kaynak=- | ust karar=-

### Idare

- Skor: 0.675
- Pass: 35/60
- Borderline: 11/60
- Fail: 14/60
- Zero result rate: 0.15
- Fallback usage rate: 0
- Ortalama sure: 86151 ms
- Ortalama sonuc sayisi: 7.6

- Ornek sorunlu vakalar:
  - İmar Para Cezası ve Yıkım [long_fact] => fail | sonuc=0 | ust kaynak=- | ust karar=-
  - İmar Para Cezası ve Yıkım [document_style] => fail | sonuc=10 | ust kaynak=uyap | ust karar=Emsal İstanbul Bölge Adliye Mahkemesi 15. Hukuk Dairesi
  - Yapı Kayıt Belgesi ve Yıkım [long_fact] => fail | sonuc=3 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi
  - Yapı Kayıt Belgesi ve Yıkım [document_style] => borderline | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Memur Disiplin Cezasi [document_style] => borderline | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire

### İcra ve Alacak Hukuku

- Skor: 0.442
- Pass: 21/60
- Borderline: 11/60
- Fail: 28/60
- Zero result rate: 0.133
- Fallback usage rate: 0
- Ortalama sure: 91585 ms
- Ortalama sonuc sayisi: 5.65

- Ornek sorunlu vakalar:
  - İtirazın İptali ve Cari Hesap [long_fact] => borderline | sonuc=1 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Hukuk Dairesi
  - İtirazın İptali ve Cari Hesap [document_style] => borderline | sonuc=10 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 12. Hukuk Dairesi
  - Menfi Tespit ve Senet [long_fact] => fail | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Menfi Tespit ve Senet [document_style] => fail | sonuc=10 | ust kaynak=danistay | ust karar=Danıştay Kararı 8. Daire
  - Istirdat Davasi [document_style] => borderline | sonuc=3 | ust kaynak=yargitay | ust karar=Yargıtay Kararı 4. Ceza Dairesi

## Ham Sonuc Dosyasi

- `output/legal-live-matrix-results.json`

## Not

- pass = 1
- borderline = 0.5
- fail = 0
