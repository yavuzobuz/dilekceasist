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
const cloneTemplateVariables = (variables = []) => variables.map(variable => ({ ...variable }));

const IS_HUKUKU_DAVA_ORTAK_VARIABLES = [
    { key: 'MAHKEME', label: 'Is Mahkemesi', type: 'text', required: true },
    { key: 'DAVACI_AD', label: 'Davaci (Isci)', type: 'text', required: true },
    { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
    { key: 'DAVACI_ADRES', label: 'Davaci Adresi', type: 'textarea', required: true },
    { key: 'DAVALI_AD', label: 'Davali (Isveren)', type: 'text', required: true },
    { key: 'DAVALI_ADRES', label: 'Davali Adresi', type: 'textarea', required: true },
    { key: 'ISE_GIRIS_TARIHI', label: 'Ise Giris Tarihi', type: 'date', required: true },
    { key: 'ISTEN_CIKIS_TARIHI', label: 'Isten Cikis Tarihi', type: 'date' },
    { key: 'GOREV_UNVAN', label: 'Gorev/Unvan', type: 'text', required: true },
    { key: 'ARABULUCULUK_DOSYA_NO', label: 'Arabuluculuk Dosya No', type: 'text', required: true },
    { key: 'ARABULUCULUK_TUTANAK_TARIHI', label: 'Son Tutanak Tarihi', type: 'date', required: true },
    { key: 'OLAY_ACIKLAMASI', label: 'Olay Aciklamasi', type: 'textarea', required: true },
    { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
];

const formatLegalReasons = (reasons = []) => {
    if (!Array.isArray(reasons) || reasons.length === 0) {
        return '- 4857 sayili Is Kanunu\n- 6100 sayili HMK\n- 7036 sayili Is Mahkemeleri Kanunu';
    }
    return reasons.map(reason => `- ${reason}`).join('\n');
};

const formatResultRequests = (requests = []) => {
    if (!Array.isArray(requests) || requests.length === 0) {
        return '1. Davanin kabulune,\n2. Yargilama giderleri ile vekalet ucretinin davaliya yukletilmesine,';
    }
    return requests.map((request, index) => `${index + 1}. ${request}`).join('\n');
};

const createIsDavasiTemplate = ({
    id,
    subcategory,
    title,
    description,
    icon,
    konu,
    davaDegeri,
    ozelBilgiler,
    extraVariables = [],
    hukukiSebepler = [],
    sonucIstemleri = [],
    usageCount = 100,
}) => ({
    id,
    category: 'Is Hukuku',
    subcategory,
    title,
    description,
    icon,
    variables: [
        ...cloneTemplateVariables(IS_HUKUKU_DAVA_ORTAK_VARIABLES),
        ...cloneTemplateVariables(extraVariables),
    ],
    content: `## {{MAHKEME}} BASKANLIGINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_AD}}
Adres: {{DAVALI_ADRES}}

**KONU:** ${konu}

**DAVA DEGERI:** ${davaDegeri}

---

## ACIKLAMALAR

1. Davaci, davaliya ait isyerinde {{ISE_GIRIS_TARIHI}} - {{ISTEN_CIKIS_TARIHI}} tarihleri arasinda {{GOREV_UNVAN}} olarak calismistir.
2. Dava sarti arabuluculuk basvurusu {{ARABULUCULUK_DOSYA_NO}} dosya numarasi ile yapilmis, {{ARABULUCULUK_TUTANAK_TARIHI}} tarihli son tutanak ile anlasma saglanamamistir.
3. Uyuşmazlığa ilişkin olay özeti:
{{OLAY_ACIKLAMASI}}

---

## DAVA TURUNE OZGU BILGILER

${ozelBilgiler}

---

## HUKUKI SEBEPLER

${formatLegalReasons(hukukiSebepler)}

---

## DELILLER

{{DELILLER}}

---

## SONUC VE ISTEM

${formatResultRequests(sonucIstemleri)}

karar verilmesini saygilarimla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
    isPremium: false,
    usageCount,
});

const IS_HUKUKU_EK_DAVA_TEMPLATES = [
    createIsDavasiTemplate({
        id: '45',
        subcategory: 'Tazminat',
        title: 'Kidem Tazminati Fark Alacagi Davasi',
        description: 'Eksik odenen kidem tazminati farkinin tahsili talebi',
        icon: 'Banknote',
        konu: 'Kidem tazminati fark alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Son giydirilmis brut ucret: {{SON_GIYDIRILMIS_BRUT_UCRET}} TL
- Kidem hesabi aciklamasi: {{KIDEM_HESAP_ACIKLAMASI}}
- Talep edilen kidem farki: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'SON_GIYDIRILMIS_BRUT_UCRET', label: 'Son Giydirilmis Brut Ucret (TL)', type: 'number', required: true },
            { key: 'KIDEM_HESAP_ACIKLAMASI', label: 'Kidem Hesabi Aciklamasi', type: 'textarea', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Kidem Farki (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '1475 sayili Is Kanunu m.14',
            '4857 sayili Is Kanunu m.32',
            '7036 sayili Is Mahkemeleri Kanunu',
        ],
        sonucIstemleri: [
            'Kidem tazminati fark alacaginin fesih tarihinden itibaren en yuksek banka mevduat faizi ile tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 301,
    }),
    createIsDavasiTemplate({
        id: '46',
        subcategory: 'Tazminat',
        title: 'Ihbar Tazminati Davasi',
        description: 'Ihbar suresine uyulmaksizin yapilan fesih nedeniyle tazminat talebi',
        icon: 'Scale',
        konu: 'Ihbar tazminatinin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Fesih bildiriminin sekli: {{FESIH_BILDIRIM_SEKLI}}
- Uygulanmasi gereken ihbar suresi: {{IHBAR_SURESI}}
- Talep edilen ihbar tazminati: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'FESIH_BILDIRIM_SEKLI', label: 'Fesih Bildirim Sekli', type: 'text', required: true },
            { key: 'IHBAR_SURESI', label: 'Ihbar Suresi (Hafta)', type: 'text', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Ihbar Tazminati (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.17',
            '4857 sayili Is Kanunu m.32',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Ihbar tazminatinin yasal faizi ile birlikte davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 287,
    }),
    createIsDavasiTemplate({
        id: '47',
        subcategory: 'Iscilik Alacaklari',
        title: 'Odenmeyen Ucret Alacagi Davasi',
        description: 'Ucreti odeme gununde veya tam olarak odenmeyen isci alacagi davasi',
        icon: 'Banknote',
        konu: 'Odenmeyen ucret alacaklarinin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Odenmeyen ucret donemi: {{ODENMEYEN_UCRET_DONEMI}}
- Aylik net/brut ucret: {{AYLIK_UCRET}} TL
- Talep edilen toplam ucret alacagi: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'ODENMEYEN_UCRET_DONEMI', label: 'Odenmeyen Ucret Donemi', type: 'text', required: true },
            { key: 'AYLIK_UCRET', label: 'Aylik Ucret (TL)', type: 'number', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Ucret Alacagi (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.32',
            '4857 sayili Is Kanunu m.34',
            '6098 sayili TBK m.117 ve devami',
        ],
        sonucIstemleri: [
            'Odenmeyen ucret alacaklarinin mevduata uygulanan en yuksek faiz ile tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 354,
    }),
    createIsDavasiTemplate({
        id: '48',
        subcategory: 'Fazla Mesai',
        title: 'Fazla Calisma Ucreti Davasi',
        description: 'Fazla mesai ucreti alacaginin tahsili icin dava dilekcesi',
        icon: 'Clock',
        konu: 'Fazla calisma ucreti alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Fazla mesai donemi: {{FAZLA_MESAI_DONEMI}}
- Haftalik ortalama fazla mesai: {{HAFTALIK_FAZLA_MESAI_SAATI}} saat
- Talep edilen fazla mesai alacagi: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'FAZLA_MESAI_DONEMI', label: 'Fazla Mesai Donemi', type: 'text', required: true },
            { key: 'HAFTALIK_FAZLA_MESAI_SAATI', label: 'Haftalik Fazla Mesai Saati', type: 'number', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Fazla Mesai Ucreti (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.41',
            '4857 sayili Is Kanunu m.32',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Fazla mesai alacaginin yasal faizi ile birlikte davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 333,
    }),
    createIsDavasiTemplate({
        id: '49',
        subcategory: 'Iscilik Alacaklari',
        title: 'Hafta Tatili Ucreti Alacagi Davasi',
        description: 'Hafta tatilinde calisma karsiligi ucret alacagi davasi',
        icon: 'Calendar',
        konu: 'Hafta tatili ucreti alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Hafta tatili calisma donemi: {{HAFTA_TATILI_DONEMI}}
- Calisilan hafta tatili gun sayisi: {{CALISILAN_HAFTA_TATILI_GUN_SAYISI}}
- Talep edilen hafta tatili ucreti: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'HAFTA_TATILI_DONEMI', label: 'Hafta Tatili Calisma Donemi', type: 'text', required: true },
            { key: 'CALISILAN_HAFTA_TATILI_GUN_SAYISI', label: 'Calisilan Hafta Tatili Gun Sayisi', type: 'number', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Hafta Tatili Ucreti (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.46',
            '4857 sayili Is Kanunu m.32',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Hafta tatili ucreti alacaginin yasal faizi ile birlikte tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 264,
    }),
    createIsDavasiTemplate({
        id: '50',
        subcategory: 'Iscilik Alacaklari',
        title: 'Ulusal Bayram ve Genel Tatil Ucreti Davasi',
        description: 'UBGT gunlerinde calisma karsiligi alacak davasi',
        icon: 'Calendar',
        konu: 'Ulusal bayram ve genel tatil ucreti alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- UBGT calisma donemi: {{UBGT_DONEMI}}
- Calisilan UBGT gun sayisi: {{UBGT_GUN_SAYISI}}
- Talep edilen UBGT alacagi: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'UBGT_DONEMI', label: 'UBGT Calisma Donemi', type: 'text', required: true },
            { key: 'UBGT_GUN_SAYISI', label: 'Calisilan UBGT Gun Sayisi', type: 'number', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen UBGT Ucreti (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.47',
            '4857 sayili Is Kanunu m.32',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'UBGT ucreti alacaginin yasal faizi ile birlikte davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 258,
    }),
    createIsDavasiTemplate({
        id: '51',
        subcategory: 'Iscilik Alacaklari',
        title: 'Yillik Izin Ucreti Alacagi Davasi',
        description: 'Kullanilmayan yillik izin surelerine iliskin ucret alacagi davasi',
        icon: 'Calendar',
        konu: 'Kullanilmayan yillik izin ucreti alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Kullanilmayan izin gun sayisi: {{KULLANILMAYAN_IZIN_GUN_SAYISI}}
- Son gunluk ucret: {{GUNLUK_UCRET}} TL
- Talep edilen yillik izin ucreti: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'KULLANILMAYAN_IZIN_GUN_SAYISI', label: 'Kullanilmayan Izin Gun Sayisi', type: 'number', required: true },
            { key: 'GUNLUK_UCRET', label: 'Gunluk Ucret (TL)', type: 'number', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Yillik Izin Ucreti (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.57',
            '4857 sayili Is Kanunu m.59',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Yillik izin ucreti alacaginin fesih tarihinden itibaren isleyecek faiz ile tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 275,
    }),
    createIsDavasiTemplate({
        id: '52',
        subcategory: 'Iscilik Alacaklari',
        title: 'Prim ve Ikramiye Alacagi Davasi',
        description: 'Sozlesme/isyeri uygulamasindan dogan prim ve ikramiye alacagi davasi',
        icon: 'Banknote',
        konu: 'Prim ve ikramiye alacaginin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Prim/ikramiye turu: {{PRIM_IKRAMIYE_TURU}}
- Alacak donemi: {{ALACAK_DONEMI}}
- Talep edilen prim/ikramiye alacagi: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'PRIM_IKRAMIYE_TURU', label: 'Prim/Ikramiye Turu', type: 'text', required: true },
            { key: 'ALACAK_DONEMI', label: 'Alacak Donemi', type: 'text', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Prim/Ikramiye Alacagi (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.32',
            '6098 sayili TBK m.401 ve devami',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Prim ve ikramiye alacaginin yasal faizi ile birlikte tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 231,
    }),
    createIsDavasiTemplate({
        id: '53',
        subcategory: 'Ayrimcilik',
        title: 'Esit Davranmama Tazminati Davasi',
        description: 'Ayrimcilik yasagi ihlali nedeniyle tazminat talebi',
        icon: 'Scale',
        konu: 'Esit davranma borcuna aykirilik nedeniyle tazminat talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Ayrimcilik nedeni: {{AYRIMCILIK_NEDENI}}
- Ayrimcilik eylemi: {{AYRIMCILIK_EYLEMI}}
- Talep edilen tazminat: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'AYRIMCILIK_NEDENI', label: 'Ayrimcilik Nedeni', type: 'text', required: true },
            { key: 'AYRIMCILIK_EYLEMI', label: 'Ayrimcilik Eylemi', type: 'textarea', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Tazminat (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.5',
            '6701 sayili Turkiye Insan Haklari ve Esitlik Kurumu Kanunu',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Ayrimcilik tazminatinin davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 198,
    }),
    createIsDavasiTemplate({
        id: '54',
        subcategory: 'Sendikal Haklar',
        title: 'Sendikal Tazminat Davasi',
        description: 'Sendikal nedenle fesih veya ayrimcilik halinde sendikal tazminat talebi',
        icon: 'Users',
        konu: 'Sendikal nedenle ayrimcilik/fesih nedeniyle sendikal tazminat talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Uye olunan sendika: {{SENDIKA_ADI}}
- Sendikal faaliyet aciklamasi: {{SENDIKAL_FAALIYET}}
- Talep edilen sendikal tazminat: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'SENDIKA_ADI', label: 'Sendika Adi', type: 'text', required: true },
            { key: 'SENDIKAL_FAALIYET', label: 'Sendikal Faaliyet Aciklamasi', type: 'textarea', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Sendikal Tazminat (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '6356 sayili Sendikalar ve Toplu Is Sozlesmesi Kanunu m.25',
            '4857 sayili Is Kanunu m.18-21',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Sendikal tazminatin davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 176,
    }),
    createIsDavasiTemplate({
        id: '55',
        subcategory: 'Tazminat',
        title: 'Kotuniyet Tazminati Davasi',
        description: 'Isverenin kotuniyetli feshi nedeniyle tazminat talebi',
        icon: 'ShieldX',
        konu: 'Kotuniyet tazminatinin tahsili talebimizdir.',
        davaDegeri: '{{TALEP_TUTARI}} TL',
        ozelBilgiler: `- Kotuniyet gostergesi olaylar: {{KOTUNIYET_GOSTERGELERI}}
- Fesih bildirimi sekli: {{FESIH_BILDIRIM_SEKLI}}
- Talep edilen kotuniyet tazminati: {{TALEP_TUTARI}} TL`,
        extraVariables: [
            { key: 'KOTUNIYET_GOSTERGELERI', label: 'Kotuniyet Gostergeleri', type: 'textarea', required: true },
            { key: 'FESIH_BILDIRIM_SEKLI', label: 'Fesih Bildirim Sekli', type: 'text', required: true },
            { key: 'TALEP_TUTARI', label: 'Talep Edilen Kotuniyet Tazminati (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '4857 sayili Is Kanunu m.17/6',
            '6098 sayili TBK m.2 (Durustluk kurali)',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Kotuniyet tazminatinin yasal faizi ile birlikte davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 149,
    }),
    createIsDavasiTemplate({
        id: '56',
        subcategory: 'Sosyal Guvenlik',
        title: 'Hizmet Tespiti Davasi',
        description: 'SGK kayitlarinda eksik veya bildirilmeyen hizmetlerin tespiti davasi',
        icon: 'FileText',
        konu: 'Bildirilmeyen hizmet surelerinin tespiti talebimizdir.',
        davaDegeri: 'Belirsiz alacak/tespit davasidir.',
        ozelBilgiler: `- SGK sicil no: {{ISYERI_SGK_SICIL_NO}}
- Tespiti istenen hizmet donemi: {{TALEP_EDILEN_HIZMET_DONEMI}}
- Bildirim eksikligine iliskin aciklama: {{HIZMET_EKSIKLIGI_ACIKLAMASI}}`,
        extraVariables: [
            { key: 'ISYERI_SGK_SICIL_NO', label: 'Isyeri SGK Sicil No', type: 'text', required: true },
            { key: 'TALEP_EDILEN_HIZMET_DONEMI', label: 'Tespiti Istenen Hizmet Donemi', type: 'text', required: true },
            { key: 'HIZMET_EKSIKLIGI_ACIKLAMASI', label: 'Hizmet Eksikligi Aciklamasi', type: 'textarea', required: true },
        ],
        hukukiSebepler: [
            '5510 sayili Kanun m.86/9',
            '7036 sayili Is Mahkemeleri Kanunu',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Davacinin bildirilmeyen hizmetlerinin tespitine ve SGK kayitlarina islenmesine,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 266,
    }),
    createIsDavasiTemplate({
        id: '57',
        subcategory: 'Is Kazasi',
        title: 'Is Kazasi Nedeniyle Maddi ve Manevi Tazminat Davasi',
        description: 'Is kazasindan dogan zararlar icin maddi-manevi tazminat talebi',
        icon: 'Siren',
        konu: 'Is kazasi nedeniyle maddi ve manevi tazminat talebimizdir.',
        davaDegeri: '{{MADDI_TAZMINAT}} TL + {{MANEVI_TAZMINAT}} TL',
        ozelBilgiler: `- Is kazasi tarihi: {{IS_KAZASI_TARIHI}}
- Kaza aciklamasi: {{IS_KAZASI_ACIKLAMASI}}
- Talep edilen maddi tazminat: {{MADDI_TAZMINAT}} TL
- Talep edilen manevi tazminat: {{MANEVI_TAZMINAT}} TL`,
        extraVariables: [
            { key: 'IS_KAZASI_TARIHI', label: 'Is Kazasi Tarihi', type: 'date', required: true },
            { key: 'IS_KAZASI_ACIKLAMASI', label: 'Kaza Aciklamasi', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Talebi (TL)', type: 'number', required: true },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Talebi (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '5510 sayili Kanun m.13',
            '6331 sayili Is Sagligi ve Guvenligi Kanunu',
            '6098 sayili TBK m.49 ve m.56',
        ],
        sonucIstemleri: [
            'Maddi ve manevi tazminat alacaklarinin davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 214,
    }),
    createIsDavasiTemplate({
        id: '58',
        subcategory: 'Meslek Hastaligi',
        title: 'Meslek Hastaligi Nedeniyle Tazminat Davasi',
        description: 'Meslek hastaligi nedeniyle dogan zararlarin tazmini talebi',
        icon: 'Siren',
        konu: 'Meslek hastaligi nedeniyle maddi ve manevi tazminat talebimizdir.',
        davaDegeri: '{{MADDI_TAZMINAT}} TL + {{MANEVI_TAZMINAT}} TL',
        ozelBilgiler: `- Meslek hastaligi tespit tarihi: {{MESLEK_HASTALIGI_TESPIT_TARIHI}}
- Hastalik ve maruziyet aciklamasi: {{HASTALIK_ACIKLAMASI}}
- Talep edilen maddi tazminat: {{MADDI_TAZMINAT}} TL
- Talep edilen manevi tazminat: {{MANEVI_TAZMINAT}} TL`,
        extraVariables: [
            { key: 'MESLEK_HASTALIGI_TESPIT_TARIHI', label: 'Meslek Hastaligi Tespit Tarihi', type: 'date', required: true },
            { key: 'HASTALIK_ACIKLAMASI', label: 'Hastalik Aciklamasi', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Talebi (TL)', type: 'number', required: true },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Talebi (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '5510 sayili Kanun m.14',
            '6331 sayili Is Sagligi ve Guvenligi Kanunu',
            '6098 sayili TBK m.49 ve m.56',
        ],
        sonucIstemleri: [
            'Meslek hastaligi nedeniyle maddi ve manevi tazminat alacaklarinin tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 187,
    }),
    createIsDavasiTemplate({
        id: '59',
        subcategory: 'Mobbing',
        title: 'Mobbing Nedeniyle Manevi Tazminat Davasi',
        description: 'Isyerinde psikolojik taciz (mobbing) nedeniyle manevi tazminat talebi',
        icon: 'AlertTriangle',
        konu: 'Isyerinde psikolojik taciz nedeniyle manevi tazminat talebimizdir.',
        davaDegeri: '{{MANEVI_TAZMINAT}} TL',
        ozelBilgiler: `- Mobbing donemi: {{MOBBING_DONEMI}}
- Mobbing eylemleri: {{MOBBING_EYLEMLERI}}
- Talep edilen manevi tazminat: {{MANEVI_TAZMINAT}} TL`,
        extraVariables: [
            { key: 'MOBBING_DONEMI', label: 'Mobbing Donemi', type: 'text', required: true },
            { key: 'MOBBING_EYLEMLERI', label: 'Mobbing Eylemleri', type: 'textarea', required: true },
            { key: 'MANEVI_TAZMINAT', label: 'Talep Edilen Manevi Tazminat (TL)', type: 'number', required: true },
        ],
        hukukiSebepler: [
            '6098 sayili TBK m.417',
            '4721 sayili TMK m.24-25',
            '6100 sayili HMK',
        ],
        sonucIstemleri: [
            'Mobbing nedeniyle manevi tazminatin davalidan tahsiline,',
            'Yargilama giderleri ve vekalet ucretinin davaliya yukletilmesine,',
        ],
        usageCount: 173,
    }),
];

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
    },
    ...IS_HUKUKU_EK_DAVA_TEMPLATES
];

export default { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES };
