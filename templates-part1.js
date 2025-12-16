// Extended Template Library - Part 1: İcra Hukuku Templates
export const ICRA_TEMPLATES = [
    {
        id: '7',
        category: 'İcra',
        subcategory: 'İcra Takibi',
        title: 'İlamsız İcra Takip Talebi',
        description: 'Genel haciz yoluyla ilamsız icra takibi başlatma talebi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_DAIRESI', label: 'İcra Dairesi', type: 'text', required: true, placeholder: 'İstanbul 1. İcra Dairesi' },
            { key: 'ALACAKLI_AD', label: 'Alacaklı Adı Soyadı', type: 'text', required: true },
            { key: 'ALACAKLI_TC', label: 'Alacaklı TC No', type: 'text', required: true },
            { key: 'ALACAKLI_ADRES', label: 'Alacaklı Adresi', type: 'textarea', required: true },
            { key: 'BORCLU_AD', label: 'Borçlu Adı Soyadı', type: 'text', required: true },
            { key: 'BORCLU_TC', label: 'Borçlu TC No', type: 'text' },
            { key: 'BORCLU_ADRES', label: 'Borçlu Adresi', type: 'textarea', required: true },
            { key: 'ALACAK_TUTARI', label: 'Alacak Tutarı (TL)', type: 'number', required: true },
            { key: 'ALACAK_NEDENI', label: 'Alacağın Nedeni', type: 'textarea', required: true },
            { key: 'VADE_TARIHI', label: 'Vade Tarihi', type: 'date' },
        ],
        content: `## {{ICRA_DAIRESI}}'NE

## TAKİP TALEBİ

**ALACAKLI:** {{ALACAKLI_AD}}
TC Kimlik No: {{ALACAKLI_TC}}
Adres: {{ALACAKLI_ADRES}}

**BORÇLU:** {{BORCLU_AD}}
TC Kimlik No: {{BORCLU_TC}}
Adres: {{BORCLU_ADRES}}

---

**TAKİP KONUSU ALACAK:**

| Açıklama | Tutar |
|----------|-------|
| Asıl Alacak | {{ALACAK_TUTARI}} TL |
| Faiz (Vade Tarihinden İtibaren) | Hesaplanacak |
| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |

**ALACAĞIN NEDENİ:** {{ALACAK_NEDENI}}

**VADE TARİHİ:** {{VADE_TARIHI}}

---

## TALEP

Yukarıda belirtilen alacağımın tahsili için borçlu aleyhine **genel haciz yoluyla ilamsız icra takibi** başlatılmasını talep ederim.

{{TARIH}}
{{ALACAKLI_AD}}
`,
        isPremium: false,
        usageCount: 523
    },
    {
        id: '8',
        category: 'İcra',
        subcategory: 'İcra Takibi',
        title: 'Kambiyo Senedi İcra Takibi',
        description: 'Çek, senet veya poliçe ile icra takibi başlatma',
        icon: 'Receipt',
        variables: [
            { key: 'ICRA_DAIRESI', label: 'İcra Dairesi', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacaklı Adı', type: 'text', required: true },
            { key: 'ALACAKLI_ADRES', label: 'Alacaklı Adresi', type: 'textarea', required: true },
            { key: 'BORCLU_AD', label: 'Borçlu Adı', type: 'text', required: true },
            { key: 'BORCLU_ADRES', label: 'Borçlu Adresi', type: 'textarea', required: true },
            { key: 'SENET_TURU', label: 'Senet Türü', type: 'text', placeholder: 'Bono / Çek / Poliçe' },
            { key: 'SENET_TARIHI', label: 'Senet Tarihi', type: 'date', required: true },
            { key: 'SENET_TUTARI', label: 'Senet Tutarı (TL)', type: 'number', required: true },
            { key: 'VADE_TARIHI', label: 'Vade Tarihi', type: 'date', required: true },
        ],
        content: `## {{ICRA_DAIRESI}}'NE

## KAMBİYO SENETLERİNE MAHSUS HACİZ YOLUYLA TAKİP TALEBİ

**ALACAKLI:** {{ALACAKLI_AD}}
Adres: {{ALACAKLI_ADRES}}

**BORÇLU:** {{BORCLU_AD}}
Adres: {{BORCLU_ADRES}}

---

**TAKİBE KONU KAMBİYO SENEDİ:**

| Bilgi | Değer |
|-------|-------|
| Senet Türü | {{SENET_TURU}} |
| Düzenleme Tarihi | {{SENET_TARIHI}} |
| Vade Tarihi | {{VADE_TARIHI}} |
| Senet Tutarı | {{SENET_TUTARI}} TL |

---

## TALEP

Ekte sunulan kambiyo senedine dayalı olarak, İİK m.167 ve devamı maddeleri uyarınca borçlu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** başlatılmasını talep ederim.

**EKLER:**
1. Kambiyo senedi aslı
2. Protesto belgesi (varsa)

{{TARIH}}
{{ALACAKLI_AD}}
`,
        isPremium: false,
        usageCount: 412
    },
    {
        id: '9',
        category: 'İcra',
        subcategory: 'İcra İtiraz',
        title: 'Borca İtiraz Dilekçesi',
        description: 'İcra takibine karşı borca itiraz',
        icon: 'ShieldX',
        variables: [
            { key: 'ICRA_DAIRESI', label: 'İcra Dairesi', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'İcra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'Borçlu (İtiraz Eden)', type: 'text', required: true },
            { key: 'BORCLU_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'BORCLU_ADRES', label: 'Adres', type: 'textarea', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacaklı', type: 'text', required: true },
            { key: 'ITIRAZ_NEDENI', label: 'İtiraz Nedeni', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_DAIRESI}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**İTİRAZ EDEN (BORÇLU):** {{BORCLU_AD}}
TC Kimlik No: {{BORCLU_TC}}
Adres: {{BORCLU_ADRES}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** Ödeme emrine itirazımdır.

---

## AÇIKLAMALAR

1. Müdürlüğünüzün yukarıda numarası yazılı dosyasından tarafıma ödeme emri tebliğ edilmiştir.

2. **İTİRAZ NEDENİM:**
{{ITIRAZ_NEDENI}}

3. Bu nedenlerle söz konusu takibe süresinde itiraz ediyorum.

---

## HUKUKİ DAYANAK

- 2004 sayılı İcra ve İflas Kanunu m.62 (İtiraz)
- 2004 sayılı İcra ve İflas Kanunu m.66 (İtirazın hükümleri)

---

## SONUÇ VE İSTEM

**BORCA İTİRAZ EDİYORUM.**

Takibin durdurulmasını saygılarımla arz ve talep ederim.

{{TARIH}}
{{BORCLU_AD}}
`,
        isPremium: false,
        usageCount: 678
    },
    {
        id: '10',
        category: 'İcra',
        subcategory: 'İcra İtiraz',
        title: 'İmzaya İtiraz Dilekçesi',
        description: 'Kambiyo senedindeki imzaya itiraz',
        icon: 'PenOff',
        variables: [
            { key: 'ICRA_MAHKEMESI', label: 'İcra Mahkemesi', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'İcra Dosya No', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı (Borçlu)', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalı (Alacaklı)', type: 'text', required: true },
            { key: 'SENET_BILGI', label: 'Senet Bilgileri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MAHKEMESI}} BAŞKANLIĞINA

**DOSYA NO:** {{DOSYA_NO}}

**DAVACI (BORÇLU):** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI (ALACAKLI):** {{DAVALI_AD}}

**KONU:** Kambiyo senedindeki imzaya itiraz hakkındadır.

---

## AÇIKLAMALAR

1. Davalı tarafından aleyhime başlatılan icra takibinde dayanak gösterilen senedin bilgileri aşağıdaki gibidir:
{{SENET_BILGI}}

2. **Söz konusu senetteki imza tarafıma ait değildir.**

3. Senedin altındaki imza ile benim gerçek imzam arasında açık fark bulunmakta olup, bu husus bilirkişi incelemesiyle de ortaya konulacaktır.

---

## HUKUKİ SEBEPLER

- 2004 sayılı İcra ve İflas Kanunu m.170 (İmzaya itiraz)
- 6100 sayılı HMK m.211 (İmza incelemesi)

---

## DELİLLER

1. İcra dosyası
2. Senet aslı
3. İmza örnekleri
4. Bilirkişi incelemesi
5. Nüfus kayıt örneği

---

## SONUÇ VE İSTEM

1. **Senetteki imzanın tarafıma ait olmadığının tespitine,**
2. İcra takibinin iptaline,
3. %20 oranında kötüniyet tazminatına hükmedilmesine,
4. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 234
    },
    {
        id: '11',
        category: 'İcra',
        subcategory: 'Haciz',
        title: 'Haciz Kaldırma Talebi',
        description: 'Haczedilen mal üzerindeki haczin kaldırılması talebi',
        icon: 'Unlock',
        variables: [
            { key: 'ICRA_DAIRESI', label: 'İcra Dairesi', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'Dosya No', type: 'text', required: true },
            { key: 'TALEP_EDEN', label: 'Talep Eden', type: 'text', required: true },
            { key: 'HACIZLI_MAL', label: 'Haczedilen Mal/Eşya', type: 'textarea', required: true },
            { key: 'KALDIRMA_NEDENI', label: 'Haczin Kaldırılma Nedeni', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE

**DOSYA NO:** {{DOSYA_NO}}

**TALEP EDEN:** {{TALEP_EDEN}}

**KONU:** Haciz kaldırma talebimdir.

---

## AÇIKLAMALAR

1. Müdürlüğünüzün yukarıda numarası yazılı dosyasında aşağıda belirtilen mal/eşya üzerine haciz konulmuştur:

**HACZEDİLEN MAL/EŞYA:**
{{HACIZLI_MAL}}

2. **HACZİN KALDIRILMASI GEREKÇESİ:**
{{KALDIRMA_NEDENI}}

---

## HUKUKİ DAYANAK

- 2004 sayılı İcra ve İflas Kanunu m.82 (Haczedilemezlik)
- 2004 sayılı İcra ve İflas Kanunu m.85 (Taşınır haczi)

---

## SONUÇ VE İSTEM

Yukarıda açıklanan nedenlerle, söz konusu mal/eşya üzerindeki haczin kaldırılmasını saygılarımla talep ederim.

{{TARIH}}
{{TALEP_EDEN}}
`,
        isPremium: false,
        usageCount: 189
    },
    {
        id: '12',
        category: 'İcra',
        subcategory: 'Haciz',
        title: 'İstihkak Davası Dilekçesi',
        description: 'Haczedilen malın üçüncü kişiye ait olduğunun tespiti',
        icon: 'FileWarning',
        variables: [
            { key: 'ICRA_MAHKEMESI', label: 'İcra Mahkemesi', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'İcra Dosya No', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı (3. Kişi)', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalı (Alacaklı)', type: 'text', required: true },
            { key: 'HACIZLI_MAL', label: 'Haczedilen Mal', type: 'textarea', required: true },
            { key: 'MULKIYET_DELILI', label: 'Mülkiyet Delilleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MAHKEMESI}} BAŞKANLIĞINA

**DOSYA NO:** {{DOSYA_NO}}

**DAVACI (3. KİŞİ):** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI (ALACAKLI):** {{DAVALI_AD}}

**KONU:** İstihkak davası hakkındadır.

---

## AÇIKLAMALAR

1. Davalı tarafından yürütülen icra takibinde, borçlunun evinde/işyerinde yapılan haciz işlemi sırasında **bana ait olan** aşağıdaki mal haczedilmiştir:

**HACZEDİLEN MAL:**
{{HACIZLI_MAL}}

2. **Bu mal bana aittir ve borçlu ile hiçbir ilgisi yoktur.**

3. Mülkiyetimi ispatlayan deliller:
{{MULKIYET_DELILI}}

---

## HUKUKİ SEBEPLER

- 2004 sayılı İcra ve İflas Kanunu m.96-99 (İstihkak davası)

---

## DELİLLER

1. Fatura ve satış belgeleri
2. Banka kayıtları
3. Tanık beyanları
4. Bilirkişi incelemesi
5. Diğer yasal deliller

---

## SONUÇ VE İSTEM

1. **Haczedilen malın tarafıma ait olduğunun tespitine,**
2. Söz konusu mal üzerindeki haczin kaldırılmasına,
3. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 156
    }
];

// İş Hukuku Templates
export const IS_HUKUKU_TEMPLATES = [
    {
        id: '13',
        category: 'İş Hukuku',
        subcategory: 'İşe İade',
        title: 'İşe İade Davası Dilekçesi',
        description: 'Haksız fesih nedeniyle işe iade talebi',
        icon: 'UserCheck',
        variables: [
            { key: 'MAHKEME', label: 'İş Mahkemesi', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı (İşçi)', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Adres', type: 'textarea', required: true },
            { key: 'DAVALI_AD', label: 'Davalı (İşveren)', type: 'text', required: true },
            { key: 'DAVALI_ADRES', label: 'İşveren Adresi', type: 'textarea', required: true },
            { key: 'ISE_GIRIS_TARIHI', label: 'İşe Giriş Tarihi', type: 'date', required: true },
            { key: 'FESIH_TARIHI', label: 'Fesih Tarihi', type: 'date', required: true },
            { key: 'GOREV', label: 'Görevi/Pozisyonu', type: 'text', required: true },
            { key: 'FESIH_GEREKCESI', label: 'İşverenin Fesih Gerekçesi', type: 'textarea' },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_AD}}
Adres: {{DAVALI_ADRES}}

**KONU:** Feshin geçersizliği ve işe iade talebimizdir.

---

## AÇIKLAMALAR

1. Müvekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar davalı işyerinde **{{GOREV}}** olarak çalışmıştır.

2. İş sözleşmesi {{FESIH_TARIHI}} tarihinde işveren tarafından **haksız ve geçersiz şekilde** feshedilmiştir.

3. İşverenin ileri sürdüğü fesih gerekçesi:
{{FESIH_GEREKCESI}}

4. Bu gerekçe gerçeği yansıtmamakta olup, fesih haksız ve geçersizdir.

---

## HUKUKİ SEBEPLER

- 4857 sayılı İş Kanunu m.18 (Feshin geçerli sebebe dayandırılması)
- 4857 sayılı İş Kanunu m.20 (Fesih bildirimine itiraz)
- 4857 sayılı İş Kanunu m.21 (Geçersiz sebeple feshin sonuçları)

---

## DELİLLER

1. İş sözleşmesi
2. Bordro ve SGK kayıtları
3. Fesih bildirimi
4. Tanık beyanları
5. İşyeri dosyası

---

## SONUÇ VE İSTEM

1. **Feshin geçersizliğine ve işe iadeye,**
2. İşe başlatmama halinde 4-8 aylık brüt ücret tutarında tazminata,
3. Boşta geçen süre ücretinin (4 aya kadar) ödenmesine,
4. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 445
    },
    {
        id: '14',
        category: 'İş Hukuku',
        subcategory: 'Tazminat',
        title: 'Kıdem ve İhbar Tazminatı Davası',
        description: 'İş akdi feshi sonrası tazminat talebi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'İş Mahkemesi', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı (İşçi)', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalı (İşveren)', type: 'text', required: true },
            { key: 'ISE_GIRIS', label: 'İşe Giriş Tarihi', type: 'date', required: true },
            { key: 'CIKIS_TARIHI', label: 'İşten Çıkış Tarihi', type: 'date', required: true },
            { key: 'SON_UCRET', label: 'Giydirilmiş Brüt Ücret (TL)', type: 'number', required: true },
            { key: 'KIDEM_TAZMINATI', label: 'Kıdem Tazminatı Talebi (TL)', type: 'number' },
            { key: 'IHBAR_TAZMINATI', label: 'İhbar Tazminatı Talebi (TL)', type: 'number' },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Kıdem ve ihbar tazminatı talebimizdir.

**DAVA DEĞERİ:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL

---

## AÇIKLAMALAR

1. Müvekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri arasında davalı işyerinde çalışmıştır.

2. **Son aylık giydirilmiş brüt ücreti:** {{SON_UCRET}} TL

3. İş akdi işveren tarafından haksız olarak feshedilmiş, ancak tazminatları ödenmemiştir.

---

## TALEP EDİLEN ALACAKLAR

| Alacak Kalemi | Tutar |
|---------------|-------|
| Kıdem Tazminatı | {{KIDEM_TAZMINATI}} TL |
| İhbar Tazminatı | {{IHBAR_TAZMINATI}} TL |
| **TOPLAM** | Hesaplanacak |

---

## HUKUKİ SEBEPLER

- 1475 sayılı İş Kanunu m.14 (Kıdem tazminatı)
- 4857 sayılı İş Kanunu m.17 (Süreli fesih / İhbar)

---

## SONUÇ VE İSTEM

1. **{{KIDEM_TAZMINATI}} TL kıdem tazminatının** fesih tarihinden itibaren en yüksek mevduat faiziyle birlikte,
2. **{{IHBAR_TAZMINATI}} TL ihbar tazminatının** yasal faiziyle birlikte davalıdan tahsiline,
3. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 567
    }
];

export default { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES };
