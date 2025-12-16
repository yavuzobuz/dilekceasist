// Extended Template Library - Part 2: Tüketici, Ticaret, Miras
export const TUKETICI_TEMPLATES = [
    {
        id: '15',
        category: 'Hukuk',
        subcategory: 'Tüketici Hukuku',
        title: 'Tüketici Hakem Heyeti Başvurusu',
        description: 'Ayıplı mal/hizmet için tüketici hakem heyetine başvuru',
        icon: 'ShoppingCart',
        variables: [
            { key: 'HAKEM_HEYETI', label: 'Tüketici Hakem Heyeti', type: 'text', required: true },
            { key: 'BASVURAN_AD', label: 'Başvuran Adı', type: 'text', required: true },
            { key: 'BASVURAN_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'BASVURAN_ADRES', label: 'Adres', type: 'textarea', required: true },
            { key: 'BASVURAN_TEL', label: 'Telefon', type: 'text' },
            { key: 'SATICI_AD', label: 'Satıcı/Firma Adı', type: 'text', required: true },
            { key: 'SATICI_ADRES', label: 'Satıcı Adresi', type: 'textarea' },
            { key: 'URUN_ADI', label: 'Ürün/Hizmet Adı', type: 'text', required: true },
            { key: 'SATIN_ALMA_TARIHI', label: 'Satın Alma Tarihi', type: 'date', required: true },
            { key: 'URUN_BEDELI', label: 'Ürün Bedeli (TL)', type: 'number', required: true },
            { key: 'SIKAYET_KONUSU', label: 'Şikayet Konusu', type: 'textarea', required: true },
        ],
        content: `## {{HAKEM_HEYETI}}'NE

## TÜKETİCİ ŞİKAYET BAŞVURUSU

**BAŞVURAN (TÜKETİCİ):**
Ad Soyad: {{BASVURAN_AD}}
TC Kimlik No: {{BASVURAN_TC}}
Adres: {{BASVURAN_ADRES}}
Telefon: {{BASVURAN_TEL}}

**ŞİKAYET EDİLEN (SATICI):**
Firma Adı: {{SATICI_AD}}
Adres: {{SATICI_ADRES}}

---

**ŞİKAYETE KONU ÜRÜN/HİZMET:**

| Bilgi | Değer |
|-------|-------|
| Ürün/Hizmet | {{URUN_ADI}} |
| Satın Alma Tarihi | {{SATIN_ALMA_TARIHI}} |
| Bedel | {{URUN_BEDELI}} TL |

---

## ŞİKAYET KONUSU

{{SIKAYET_KONUSU}}

---

## TALEP

6502 sayılı Tüketicinin Korunması Hakkında Kanun uyarınca;

1. Ayıplı ürünün/hizmetin bedelinin iadesi,
2. Alternatif olarak ürünün değiştirilmesi veya ücretsiz onarımı,

hususlarında karar verilmesini saygılarımla arz ve talep ederim.

**EKLER:**
1. Fatura/fiş sureti
2. Ürün fotoğrafları
3. Yazışma örnekleri

{{TARIH}}
{{BASVURAN_AD}}
`,
        isPremium: false,
        usageCount: 892
    },
    {
        id: '16',
        category: 'Hukuk',
        subcategory: 'Tüketici Hukuku',
        title: 'Tüketici Mahkemesi Dava Dilekçesi',
        description: 'Tüketici uyuşmazlıkları için dava dilekçesi',
        icon: 'Scale',
        variables: [
            { key: 'MAHKEME', label: 'Tüketici Mahkemesi', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı Adı', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Davacı Adresi', type: 'textarea' },
            { key: 'DAVALI_AD', label: 'Davalı Firma', type: 'text', required: true },
            { key: 'DAVALI_ADRES', label: 'Davalı Adresi', type: 'textarea' },
            { key: 'DAVA_DEGERI', label: 'Dava Değeri (TL)', type: 'number', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'Olayın Açıklaması', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_AD}}
Adres: {{DAVALI_ADRES}}

**KONU:** Tüketici işleminden kaynaklanan tazminat talebimizdir.

**DAVA DEĞERİ:** {{DAVA_DEGERI}} TL

---

## AÇIKLAMALAR

{{OLAY_ACIKLAMASI}}

---

## HUKUKİ SEBEPLER

- 6502 sayılı Tüketicinin Korunması Hakkında Kanun
- 6098 sayılı Türk Borçlar Kanunu

---

## DELİLLER

1. Fatura ve satış belgeleri
2. Sözleşme örnekleri
3. Yazışmalar
4. Tanık beyanları
5. Bilirkişi incelemesi

---

## SONUÇ VE İSTEM

1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte davalıdan tahsiline,
2. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 334
    }
];

export const TICARET_TEMPLATES = [
    {
        id: '17',
        category: 'Hukuk',
        subcategory: 'Ticaret Hukuku',
        title: 'Alacak Davası Dilekçesi (Ticari)',
        description: 'Ticari alacak tahsili için dava dilekçesi',
        icon: 'Briefcase',
        variables: [
            { key: 'MAHKEME', label: 'Asliye Ticaret Mahkemesi', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı Şirket/Kişi', type: 'text', required: true },
            { key: 'DAVACI_VKN', label: 'Vergi/TC No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Adres', type: 'textarea' },
            { key: 'DAVALI_AD', label: 'Davalı Şirket/Kişi', type: 'text', required: true },
            { key: 'DAVALI_ADRES', label: 'Davalı Adresi', type: 'textarea' },
            { key: 'ALACAK_TUTARI', label: 'Alacak Tutarı (TL)', type: 'number', required: true },
            { key: 'ALACAK_KAYNAK', label: 'Alacağın Kaynağı', type: 'textarea', required: true },
            { key: 'VADE_TARIHI', label: 'Vade Tarihi', type: 'date' },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
Vergi/TC No: {{DAVACI_VKN}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_AD}}
Adres: {{DAVALI_ADRES}}

**KONU:** Alacak davası hakkındadır.

**DAVA DEĞERİ:** {{ALACAK_TUTARI}} TL

---

## AÇIKLAMALAR

1. Müvekkilim ile davalı arasında ticari ilişki bulunmaktadır.

2. **Alacağın Kaynağı:**
{{ALACAK_KAYNAK}}

3. Vade tarihi: {{VADE_TARIHI}}

4. Tüm ihtarlara rağmen davalı borcunu ödememiştir.

---

## HUKUKİ SEBEPLER

- 6102 sayılı Türk Ticaret Kanunu
- 6098 sayılı Türk Borçlar Kanunu

---

## DELİLLER

1. Faturalar
2. Sözleşmeler
3. İrsaliyeler
4. Banka kayıtları
5. İhtarname
6. Ticari defterler

---

## SONUÇ VE İSTEM

1. {{ALACAK_TUTARI}} TL alacağın vade tarihinden itibaren avans faiziyle birlikte davalıdan tahsiline,
2. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 445
    },
    {
        id: '18',
        category: 'Hukuk',
        subcategory: 'Ticaret Hukuku',
        title: 'İhtarname (Ödeme)',
        description: 'Ticari borç için ödeme ihtarnamesi',
        icon: 'Mail',
        variables: [
            { key: 'NOTER', label: 'Noter', type: 'text', placeholder: 'İstanbul 5. Noterliği' },
            { key: 'GONDEREN_AD', label: 'Gönderen (Alacaklı)', type: 'text', required: true },
            { key: 'GONDEREN_ADRES', label: 'Alacaklı Adresi', type: 'textarea' },
            { key: 'MUHATAP_AD', label: 'Muhatap (Borçlu)', type: 'text', required: true },
            { key: 'MUHATAP_ADRES', label: 'Borçlu Adresi', type: 'textarea', required: true },
            { key: 'BORC_TUTARI', label: 'Borç Tutarı (TL)', type: 'number', required: true },
            { key: 'BORC_KONUSU', label: 'Borç Konusu', type: 'textarea', required: true },
            { key: 'ODEME_SURESI', label: 'Ödeme Süresi (Gün)', type: 'number', placeholder: '7' },
        ],
        content: `## İHTARNAME

**Keşideci (İhtar Eden):** {{GONDEREN_AD}}
Adres: {{GONDEREN_ADRES}}

**Muhatap (İhtar Edilen):** {{MUHATAP_AD}}
Adres: {{MUHATAP_ADRES}}

---

## İHTARIN KONUSU

Aşağıda belirtilen borcunuzun ödenmesi hakkındadır.

---

**Sayın {{MUHATAP_AD}},**

**1.** Tarafınıza aşağıda detayları verilen alacağımız bulunmaktadır:

**Borç Konusu:** {{BORC_KONUSU}}

**Borç Tutarı:** {{BORC_TUTARI}} TL

**2.** Söz konusu borcunuzu defalarca hatırlatmamıza rağmen hâlâ ödemediniz.

**3.** İşbu ihtarnamenin tarafınıza tebliğinden itibaren **{{ODEME_SURESI}} gün** içinde yukarıda belirtilen borcunuzu ödemenizi,

**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) başvurulacağını, bu durumda doğacak tüm masraf, faiz ve avukatlık ücretlerinin tarafınızdan tahsil edileceğini,

**İHTAR EDERİM.**

{{TARIH}}
{{GONDEREN_AD}}

---

*Bu ihtarname noter kanalıyla tebliğ edilmek üzere hazırlanmıştır.*
`,
        isPremium: false,
        usageCount: 723
    }
];

export const MIRAS_TEMPLATES = [
    {
        id: '19',
        category: 'Hukuk',
        subcategory: 'Miras Hukuku',
        title: 'Mirasçılık Belgesi (Veraset İlamı) Talebi',
        description: 'Sulh hukuk mahkemesinden veraset ilamı talebi',
        icon: 'Users',
        variables: [
            { key: 'MAHKEME', label: 'Sulh Hukuk Mahkemesi', type: 'text', required: true },
            { key: 'DAVACI_AD', label: 'Davacı (Mirasçı)', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Adres', type: 'textarea' },
            { key: 'MURIS_AD', label: 'Murisin (Ölenin) Adı', type: 'text', required: true },
            { key: 'MURIS_TC', label: 'Murisin TC No', type: 'text' },
            { key: 'OLUM_TARIHI', label: 'Ölüm Tarihi', type: 'date', required: true },
            { key: 'OLUM_YERI', label: 'Ölüm Yeri', type: 'text' },
            { key: 'MIRASCILAR', label: 'Diğer Mirasçılar', type: 'textarea' },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**KONU:** Mirasçılık belgesi (veraset ilamı) verilmesi talebimdir.

---

## AÇIKLAMALAR

1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmiştir.

2. Ben müteveffanın mirasçısıyım.

3. Diğer mirasçılar:
{{MIRASCILAR}}

4. Müteveffanın terekesi üzerinde işlem yapabilmek için mirasçılık belgesi alınması gerekmektedir.

---

## HUKUKİ SEBEPLER

- 4721 sayılı Türk Medeni Kanunu m.598 (Mirasçılık belgesi)

---

## DELİLLER

1. Veraset ve intikal vergisi beyannamesi
2. Nüfus kayıt örneği (muris ve mirasçılar)
3. Ölüm belgesi
4. Vukuatlı nüfus kayıt örneği

---

## SONUÇ VE İSTEM

Müteveffa {{MURIS_AD}}'in mirasçılarını ve miras paylarını gösteren **MİRASÇILIK BELGESİ** verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 567
    },
    {
        id: '20',
        category: 'Hukuk',
        subcategory: 'Miras Hukuku',
        title: 'Mirastan Feragat Sözleşmesi',
        description: 'Noterde düzenlenecek mirastan feragat belgesi',
        icon: 'FileX',
        variables: [
            { key: 'NOTER', label: 'Noter', type: 'text' },
            { key: 'FERAGAT_EDEN', label: 'Feragat Eden', type: 'text', required: true },
            { key: 'FERAGAT_EDEN_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'MURIS_AD', label: 'Muris (Miras Bırakan)', type: 'text', required: true },
            { key: 'BEDEL', label: 'Karşılık Bedel (varsa)', type: 'text' },
        ],
        content: `## MİRASTAN FERAGAT SÖZLEŞMESİ

**FERAGAT EDEN:**
Ad Soyad: {{FERAGAT_EDEN}}
TC Kimlik No: {{FERAGAT_EDEN_TC}}

**MURİS:**
Ad Soyad: {{MURIS_AD}}

---

## BEYAN

Ben {{FERAGAT_EDEN}}, {{MURIS_AD}}'ın ileride gerçekleşecek ölümü halinde terekesinden payıma düşecek tüm miras haklarından, TMK m.528 uyarınca, aşağıdaki şartlarla **FERAGAT ETTİĞİMİ** beyan ederim.

**Karşılık:** {{BEDEL}}

**Feragatin Kapsamı:** Tam feragat (hem kendim hem altsoyum adına)

Bu sözleşme, murisin sağlığında, resmi şekilde yapılmış olup, tarafımca özgür iradeyle imzalanmıştır.

---

## HUKUKİ DAYANAK

- 4721 sayılı Türk Medeni Kanunu m.528 (Mirastan feragat sözleşmesi)

---

{{TARIH}}

**Feragat Eden:**
{{FERAGAT_EDEN}}

**Muris:**
{{MURIS_AD}}

---

*Bu sözleşme noter huzurunda düzenleme şeklinde yapılmalıdır.*
`,
        isPremium: true,
        usageCount: 123
    }
];

export default { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES };
