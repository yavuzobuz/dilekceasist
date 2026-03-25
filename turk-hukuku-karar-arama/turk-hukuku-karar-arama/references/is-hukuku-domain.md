# İş Hukuku Domain Kuralları

## Temel Kavram Haritası

```
İşe iade → retrievalConcepts: ["işe iade", "geçersiz fesih", "İş K. 18"]
Kıdem    → retrievalConcepts: ["kıdem tazminatı", "haklı fesih", "İş K. 14"]
Fazla mesai → retrievalConcepts: ["fazla mesai", "fazla çalışma ücreti", "İş K. 41"]
Mobbing  → retrievalConcepts: ["mobbing", "psikolojik taciz", "haklı fesih"]
Askerlik → retrievalConcepts: ["askerlik nedeniyle fesih", "kıdem tazminatı", "İş K. 31"]
```

---

## Kritik Kombinasyonlar

```
+"işe iade" +"geçersiz fesih" +"ispat yükü"
+"kıdem tazminatı" +"haklı fesih" +"iş göremezlik"
+"fazla mesai" +"puantaj" +"ispat"
+"mobbing" +"psikolojik baskı" +"haklı fesih"
+"yıllık izin ücreti" +"zamanaşımı" +"5 yıl"
+"ihbar tazminatı" +"haksız fesih" +"bildirim süresi"
+"iş kazası" +"kusur" +"tazminat"
+"ücret alacağı" +"zamanaşımı" +"5 yıl"
```

---

## evidenceConcepts — İş Hukuku

```
puantaj kaydı, bordro, ücret pusulası
iş sözleşmesi, toplu iş sözleşmesi
fesih bildirimi, ihtar
devamsızlık tutanağı, devamsızlık formu
tanık (işyeri çalışanı)
güvenlik kamerası (işyeri)
```

---

## sourceTargets

İş hukuku için her zaman:
```json
["yargitay", "uyap"]
```
9. Hukuk Dairesi (eski) ve 10. Hukuk Dairesi (yeni) kararları hedefle.
