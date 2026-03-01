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

const createGuidedCezaTemplate = (def) => ({
    id: def.id,
    category: 'Ceza',
    subcategory: def.subcategory,
    title: def.title,
    description: def.description,
    icon: def.icon || 'Siren',
    variables: [
        { key: 'SAVCILIK', label: 'Cumhuriyet Bassavciligi', type: 'text', required: true, placeholder: 'Ankara Cumhuriyet Bassavciligi' },
        { key: 'SIKAYETCI_AD', label: 'Sikayetci Ad Soyad', type: 'text', required: true },
        { key: 'SIKAYETCI_TC', label: 'Sikayetci TC Kimlik No', type: 'text', required: true },
        { key: 'SIKAYETCI_ADRES', label: 'Sikayetci Adres', type: 'textarea', required: true },
        { key: 'SUPHELI_AD', label: 'Supheli Ad Soyad/Unvan', type: 'text', required: true },
        { key: 'SUPHELI_BILGI', label: 'Supheli Bilgileri', type: 'textarea', required: true },
        { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
        { key: 'OLAY_YERI', label: 'Olay Yeri', type: 'text', required: true },
        { key: 'OLAY_ANLATIMI', label: 'Olay Anlatimi', type: 'textarea', required: true, placeholder: 'Olaylari tarih sirasina gore yazin' },
        { key: 'OZEL_ACIKLAMA', label: 'Olaya Ozel Aciklama', type: 'textarea', placeholder: 'Bu suca ozgu kritik detaylar' },
        { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
        { key: 'TANIKLAR', label: 'Taniklar', type: 'textarea' },
        { key: 'TALEPLER', label: 'Savciliktan Talepler', type: 'textarea', required: true },
        { key: 'EKLER', label: 'Ekler', type: 'textarea' },
    ],
    content: `## {{SAVCILIK}}'NA

## SUC DUYURUSU VE SIKAYET DILEKCESI

**SIKAYETCI:** {{SIKAYETCI_AD}}
TC Kimlik No: {{SIKAYETCI_TC}}
Adres: {{SIKAYETCI_ADRES}}

**SUPHELI:** {{SUPHELI_AD}}
Bilgiler: {{SUPHELI_BILGI}}

**IDDIA EDILEN SUC:** ${def.sucBasligi}
**OLAY TARIHI:** {{OLAY_TARIHI}}
**OLAY YERI:** {{OLAY_YERI}}

---

## OLAYLAR

{{OLAY_ANLATIMI}}

---

## OLAYA OZEL ACIKLAMA

${def.ozelNot}

{{OZEL_ACIKLAMA}}

---

## DELILLER

{{DELILLER}}

## TANIKLAR

{{TANIKLAR}}

---

## HUKUKI NEDENLER

${def.hukukiDayanak}

---

## SONUC VE ISTEM

Yukarida aciklanan nedenlerle;

{{TALEPLER}}

hususlarinda gereginin yapilmasini saygilarimla arz ve talep ederim.

**EKLER:**
{{EKLER}}

{{TARIH}}
{{SIKAYETCI_AD}}
`,
    isPremium: false,
    usageCount: 0,
});

const EXTRA_CEZA_TEMPLATES = [
    {
        id: '25',
        subcategory: 'Hakaret',
        title: 'Hakaret Sucu Sikayet Dilekcesi',
        description: 'Sozlu, yazili veya dijital hakaret eylemlerine iliskin detayli sikayet sablonu',
        icon: 'Siren',
        sucBasligi: 'Hakaret (TCK m.125)',
        hukukiDayanak: '- 5237 sayili TCK m.125\n- 5271 sayili CMK m.158 ve m.160',
        ozelNot: 'Hakaretin nerede, kimlerin huzurunda ve hangi ifadelerle gerceklestigi acikca belirtilmelidir.',
    },
    {
        id: '26',
        subcategory: 'Tehdit',
        title: 'Tehdit Sucu Sikayet Dilekcesi',
        description: 'Can, mal veya sair haklara yonelik tehdit eylemleri icin sikayet sablonu',
        icon: 'Siren',
        sucBasligi: 'Tehdit (TCK m.106)',
        hukukiDayanak: '- 5237 sayili TCK m.106\n- 5271 sayili CMK m.158 ve m.160',
        ozelNot: 'Tehdit icerigi, tehdit araci (mesaj/ses kaydi/yuz yuze) ve olusan korku acikca anlatilmalidir.',
    },
    {
        id: '27',
        subcategory: 'Dolandiricilik',
        title: 'Dolandiricilik Sucu Sikayet Dilekcesi',
        description: 'Aldatma yoluyla menfaat teminine iliskin eylemler icin sikayet sablonu',
        icon: 'Gavel',
        sucBasligi: 'Dolandiricilik / Nitelikli Dolandiricilik (TCK m.157-158)',
        hukukiDayanak: '- 5237 sayili TCK m.157 ve m.158\n- 5271 sayili CMK m.158',
        ozelNot: 'Odemeler, banka transfer kayitlari, ilan ve yazisma delilleri kronolojik olarak siralanmalidir.',
    },
    {
        id: '28',
        subcategory: 'Guveni Kotuye Kullanma',
        title: 'Guveni Kotuye Kullanma Sikayet Dilekcesi',
        description: 'Emanet edilen malin iade edilmemesi veya amaci disinda kullanilmasi hallerinde sikayet sablonu',
        icon: 'Gavel',
        sucBasligi: 'Guveni Kotuye Kullanma (TCK m.155)',
        hukukiDayanak: '- 5237 sayili TCK m.155\n- 5271 sayili CMK m.158',
        ozelNot: 'Malin teslim sekli, teslim tarihi ve iade taleplerine ragmen iade edilmedigi hususu aciklanmalidir.',
    },
    {
        id: '29',
        subcategory: 'Siber Suclar',
        title: 'Dijital Dolandiricilik Sikayet Dilekcesi',
        description: 'Sosyal medya, e-ticaret veya mesajlasma uygulamalari uzerinden gerceklesen dolandiricilik eylemlerine yonelik sablon',
        icon: 'Siren',
        sucBasligi: 'Bilisim sistemleri kullanilarak dolandiricilik (TCK m.158/1-f)',
        hukukiDayanak: '- 5237 sayili TCK m.158/1-f\n- 5271 sayili CMK m.160',
        ozelNot: 'URL, kullanici adi, IP bilgisi (varsa), ekran goruntusu ve odeme dekontlari mutlaka eklenmelidir.',
    },
    {
        id: '30',
        subcategory: 'Mala Zarar Verme',
        title: 'Mala Zarar Verme Sikayet Dilekcesi',
        description: 'Tasinir veya tasinmaz mala verilen zararlara iliskin ceza sikayet sablonu',
        icon: 'Siren',
        sucBasligi: 'Mala Zarar Verme (TCK m.151-152)',
        hukukiDayanak: '- 5237 sayili TCK m.151 ve m.152\n- 5271 sayili CMK m.158',
        ozelNot: 'Hasarin boyutu, ekspertiz/onarim faturasi ve olay yeri goruntuleri belirtilmelidir.',
    },
    {
        id: '31',
        subcategory: 'Kasten Yaralama',
        title: 'Kasten Yaralama Sikayet Dilekcesi',
        description: 'Fiziksel mudahale ve darp olaylarina iliskin sikayet ve sorusturma talep sablonu',
        icon: 'Siren',
        sucBasligi: 'Kasten Yaralama (TCK m.86-87)',
        hukukiDayanak: '- 5237 sayili TCK m.86 ve m.87\n- 5271 sayili CMK m.158',
        ozelNot: 'Darp raporu, hastane kayitlari, olay ani kamerasi ve tanik anlatimlari ayrintili sunulmalidir.',
    },
    {
        id: '32',
        subcategory: 'Kisi Hurriyeti',
        title: 'Kisiyi Hurriyetinden Yoksun Kilma Sikayet Dilekcesi',
        description: 'Kisinin iradesi disinda bir yerde tutulmasi veya hareket ozgurlugunun kisitlanmasina dair sikayet sablonu',
        icon: 'Gavel',
        sucBasligi: 'Kisiyi Hurriyetinden Yoksun Kilma (TCK m.109)',
        hukukiDayanak: '- 5237 sayili TCK m.109\n- 5271 sayili CMK m.160',
        ozelNot: 'Kisitlama suresi, nerede tutuldugu ve nasil kurtuldugu/ulasildigi bilgileri net yazilmalidir.',
    },
    {
        id: '33',
        subcategory: 'Sorusturma',
        title: 'Sorusturma Dosyasina Delil Sunma Dilekcesi',
        description: 'Devam eden sorusturma dosyasina yeni delil ve tanik sunmak icin kullanilan dilekce sablonu',
        icon: 'FileText',
        sucBasligi: 'Sorusturmaya Konu Suclar',
        hukukiDayanak: '- 5271 sayili CMK m.160\n- 5271 sayili CMK m.170',
        ozelNot: 'Bu sablon, mevcut sorusturma dosyasina ek delil/tanik bildirmek icin duzenlenmistir.',
    },
    {
        id: '34',
        subcategory: 'Uzlastirma',
        title: 'Uzlastirma Surecinde Beyan ve Talep Dilekcesi',
        description: 'Uzlastirmaya tabi suclarda dosyaya beyan ve talep sunmaya yonelik sablon',
        icon: 'Scale',
        sucBasligi: 'Uzlastirmaya Tabi Suclar Kapsaminda Beyan',
        hukukiDayanak: '- 5271 sayili CMK m.253\n- Ilgili Uzlastirma Yonetmeligi',
        ozelNot: 'Uzlasma sartlari, talep edilen maddi/manevi giderim ve odeme sekli acikca belirtilmelidir.',
    },
].map(createGuidedCezaTemplate);

export const CEZA_TEMPLATES = [
    {
        id: '21',
        category: 'Ceza',
        subcategory: 'Sikayet',
        title: 'Detayli Suc Duyurusu ve Sikayet Dilekcesi',
        description: 'Olay ozeti, kronoloji, delil ve talep basliklarini adim adim doldurabileceginiz suc duyurusu sablonu',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet Bassavciligi', type: 'text', required: true, placeholder: 'Istanbul Anadolu Cumhuriyet Bassavciligi' },
            { key: 'MUSTEKI_AD', label: 'Sikayetci Ad Soyad', type: 'text', required: true },
            { key: 'MUSTEKI_TC', label: 'Sikayetci TC Kimlik No', type: 'text', required: true },
            { key: 'MUSTEKI_ADRES', label: 'Sikayetci Adres', type: 'textarea', required: true },
            { key: 'MUSTEKI_TEL', label: 'Sikayetci Telefon', type: 'text', placeholder: '05xx xxx xx xx' },
            { key: 'MUSTEKI_EPOSTA', label: 'Sikayetci E-posta', type: 'text' },
            { key: 'VEKIL_AD', label: 'Vekil Avukat Ad Soyad', type: 'text', placeholder: 'Yoksa bos birakabilirsiniz' },
            { key: 'VEKIL_BARO', label: 'Vekil Baro Sicil No', type: 'text' },
            { key: 'VEKIL_ADRES', label: 'Vekil Tebligat Adresi', type: 'textarea' },
            { key: 'SUPHELI_AD', label: 'Supheli Ad Soyad/Unvan', type: 'text', required: true, placeholder: 'Kimligi tam bilinmiyorsa tarif edin' },
            { key: 'SUPHELI_BILGI', label: 'Supheliye Ait Bilinen Bilgiler', type: 'textarea', required: true, placeholder: 'Adres, telefon, plaka, sosyal medya hesabi vb.' },
            { key: 'SUC_TIPI', label: 'Iddia Edilen Suc Tipi', type: 'text', required: true, placeholder: 'Hakaret, tehdit, dolandiricilik vb.' },
            { key: 'SUC_TARIHI', label: 'Suc Tarihi', type: 'date', required: true },
            { key: 'SUC_YERI', label: 'Suc Yeri', type: 'text', required: true, placeholder: 'Il/Ilce/Acik adres veya dijital ortam bilgisi' },
            { key: 'OGRENME_TARIHI', label: 'Sucun Ogrenilme Tarihi', type: 'date', required: true },
            { key: 'OLAY_OZETI', label: 'Kisa Olay Ozeti', type: 'textarea', required: true, placeholder: '3-5 cumlede ne oldugunu yazin' },
            { key: 'KRONOLOJI', label: 'Detayli Olay Kronolojisi', type: 'textarea', required: true, placeholder: 'Tarih sirasina gore olaylari yazin' },
            { key: 'TANIKLAR', label: 'Taniklar', type: 'textarea', placeholder: 'Ad soyad, iletisim, hangi hususa tanik oldugu' },
            { key: 'DELIL_LISTESI', label: 'Delil Listesi', type: 'textarea', required: true, placeholder: 'WhatsApp ekran goruntuleri, kamera kaydi, ses kaydi vb.' },
            { key: 'MADDI_ZARAR', label: 'Maddi Zarar Aciklamasi', type: 'textarea', placeholder: 'Varsa zarar kalemlerini yazin' },
            { key: 'MANEVI_ZARAR', label: 'Manevi Zarar Aciklamasi', type: 'textarea' },
            { key: 'TALEP_EDILEN_ISLEMLER', label: 'Savciliktan Talep Edilen Islemler', type: 'textarea', required: true, placeholder: 'Suphelinin ifadesinin alinmasi, kamera kayitlarinin celbi vb.' },
            { key: 'EKLER_LISTESI', label: 'Ekler Listesi', type: 'textarea', placeholder: '1-... 2-... 3-...' },
        ],
        content: `## {{SAVCILIK}}'NA

## SUC DUYURUSU VE SIKAYET DILEKCESI

**SIKAYETCI (MUSTEKI):** {{MUSTEKI_AD}}
TC Kimlik No: {{MUSTEKI_TC}}
Adres: {{MUSTEKI_ADRES}}
Telefon: {{MUSTEKI_TEL}}
E-posta: {{MUSTEKI_EPOSTA}}

**VEKIL (varsa):** {{VEKIL_AD}}
Baro Sicil No: {{VEKIL_BARO}}
Adres: {{VEKIL_ADRES}}

**SUPHELI:** {{SUPHELI_AD}}
Bilinen Bilgiler: {{SUPHELI_BILGI}}

**IDDIA EDILEN SUC:** {{SUC_TIPI}}
**SUC TARIHI:** {{SUC_TARIHI}}
**SUC YERI:** {{SUC_YERI}}
**SUCUN OGRENILME TARIHI:** {{OGRENME_TARIHI}}

---

## KISA OLAY OZETI

{{OLAY_OZETI}}

---

## DETAYLI KRONOLOJI

{{KRONOLOJI}}

---

## TANIKLAR

{{TANIKLAR}}

---

## DELILLER

{{DELIL_LISTESI}}

---

## ZARAR BILGISI

**Maddi Zarar:**
{{MADDI_ZARAR}}

**Manevi Zarar:**
{{MANEVI_ZARAR}}

---

## HUKUKI NEDENLER

- 5271 sayili Ceza Muhakemesi Kanunu m.158 (ihbar ve sikayet)
- 5271 sayili Ceza Muhakemesi Kanunu m.160 (savcinin maddi gercegi arastirma gorevi)
- 5237 sayili Turk Ceza Kanunu ve ilgili diger mevzuat

---

## SONUC VE ISTEM

Yukarida aciklanan nedenlerle;

1. Supheli/supheliler hakkinda etkili bir sorusturma yapilmasini,
2. Asagidaki islemlerin gecikmeksizin yerine getirilmesini:
{{TALEP_EDILEN_ISLEMLER}}
3. Toplanan deliller dogrultusunda kamu adina dava acilmasini,

saygilarimla arz ve talep ederim.

**EKLER:**
{{EKLER_LISTESI}}

{{TARIH}}
{{MUSTEKI_AD}}
`,
        isPremium: false,
        usageCount: 0
    },
    {
        id: '22',
        category: 'Ceza',
        subcategory: 'KYOK Itiraz',
        title: 'Detayli KYOK Kararina Itiraz Dilekcesi',
        description: 'CMK 173 kapsaminda sure, delil eksigi ve hukuki hata basliklariyla detayli itiraz sablonu',
        icon: 'Gavel',
        variables: [
            { key: 'SULH_CEZA_HAKIMLIGI', label: 'Sulh Ceza Hakimligi', type: 'text', required: true, placeholder: 'Istanbul Anadolu 3. Sulh Ceza Hakimligi' },
            { key: 'KARARI_VEREN_SAVCILIK', label: 'Karari Veren Savcilik', type: 'text', required: true },
            { key: 'SORUSTURMA_NO', label: 'Sorusturma No', type: 'text', required: true },
            { key: 'KARAR_NO', label: 'KYOK Karar No', type: 'text', required: true },
            { key: 'ITIRAZ_EDEN_AD', label: 'Itiraz Eden Ad Soyad', type: 'text', required: true },
            { key: 'ITIRAZ_EDEN_TC', label: 'TC Kimlik No', type: 'text' },
            { key: 'ITIRAZ_EDEN_ADRES', label: 'Adres', type: 'textarea', required: true },
            { key: 'ITIRAZ_EDEN_TEL', label: 'Telefon', type: 'text' },
            { key: 'VEKIL_AD', label: 'Vekil Avukat Ad Soyad', type: 'text' },
            { key: 'VEKIL_BARO', label: 'Vekil Baro Sicil No', type: 'text' },
            { key: 'VEKIL_ADRES', label: 'Vekil Tebligat Adresi', type: 'textarea' },
            { key: 'KYOK_TARIHI', label: 'KYOK Karar Tarihi', type: 'date', required: true },
            { key: 'TEBLIG_TARIHI', label: 'Teblig Tarihi', type: 'date', required: true },
            { key: 'SUC_TIPI', label: 'Suca Iliskin Nitelendirme', type: 'text', required: true, placeholder: 'Nitelikli dolandiricilik, hakaret vb.' },
            { key: 'OLAY_OZETI', label: 'Olay Ozeti', type: 'textarea', required: true, placeholder: 'Sikayete konu olayin ozeti' },
            { key: 'KYOK_OZETI', label: 'KYOK Gerekcesinin Ozeti', type: 'textarea', required: true, placeholder: 'Savciligin ret gerekcesini yazin' },
            { key: 'DELIL_EKSIKLERI', label: 'Toplanmayan / Degerlendirilmeyen Deliller', type: 'textarea', required: true },
            { key: 'HUKUKI_HATALAR', label: 'Hukuki Degerlendirme Hatalari', type: 'textarea', required: true },
            { key: 'YENI_DELILLER', label: 'Yeni Deliller veya Arastirma Talepleri', type: 'textarea' },
            { key: 'TALEP_SONUCU', label: 'Hakimlikten Talep Sonucu', type: 'textarea', required: true, placeholder: 'KYOK kaldirilsin, sorusturma genisletilsin vb.' },
            { key: 'EKLER_LISTESI', label: 'Ekler Listesi', type: 'textarea', placeholder: '1- KYOK karari 2- Teblig mazbatasi 3- Delil ciktilari' },
        ],
        content: `## {{SULH_CEZA_HAKIMLIGI}}'NE

**GONDERILMEK UZERE**
{{KARARI_VEREN_SAVCILIK}}'NA

## KOVUSTURMAYA YER OLMADIGINA DAIR KARARA ITIRAZ DILEKCESI

**ITIRAZ EDEN (SUCTAN ZARAR GOREN):** {{ITIRAZ_EDEN_AD}}
TC Kimlik No: {{ITIRAZ_EDEN_TC}}
Adres: {{ITIRAZ_EDEN_ADRES}}
Telefon: {{ITIRAZ_EDEN_TEL}}

**VEKIL (varsa):** {{VEKIL_AD}}
Baro Sicil No: {{VEKIL_BARO}}
Adres: {{VEKIL_ADRES}}

**SORUSTURMA NO:** {{SORUSTURMA_NO}}
**KARAR NO:** {{KARAR_NO}}
**KYOK KARAR TARIHI:** {{KYOK_TARIHI}}
**TEBLIG TARIHI:** {{TEBLIG_TARIHI}}
**SUC NITELENDIRMESI:** {{SUC_TIPI}}

---

## OLAY OZETI

{{OLAY_OZETI}}

---

## KYOK GEREKCESININ OZETI

{{KYOK_OZETI}}

---

## ITIRAZ NEDENLERI (DELIL VE HUKUK YONUNDEN)

**A) Toplanmayan / Degerlendirilmeyen Deliller:**
{{DELIL_EKSIKLERI}}

**B) Hukuki Degerlendirme Hatalari:**
{{HUKUKI_HATALAR}}

**C) Yeni Deliller ve Sorusturma Talepleri:**
{{YENI_DELILLER}}

Not: Isbu itiraz, teblig tarihinden itibaren yasal sure icinde (CMK m.173) sunulmaktadir.

---

## HUKUKI NEDENLER

- 5271 sayili Ceza Muhakemesi Kanunu m.173
- 5271 sayili Ceza Muhakemesi Kanunu m.172

---

## SONUC VE ISTEM

Yukarida aciklanan nedenlerle;

{{TALEP_SONUCU}}

karar verilmesini saygilarimla arz ve talep ederim.

**EKLER:**
{{EKLER_LISTESI}}

{{TARIH}}
{{ITIRAZ_EDEN_AD}}
        `,
        isPremium: false,
        usageCount: 0
    },
    ...EXTRA_CEZA_TEMPLATES
];

const createGuidedIdariIptalTemplate = (def) => ({
    id: def.id,
    category: '\u0130dari',
    subcategory: 'Iptal Davasi',
    title: def.title,
    description: def.description,
    icon: def.icon || 'Building2',
    variables: [
        { key: 'MAHKEME', label: 'Idare Mahkemesi', type: 'text', required: true, placeholder: '... Nobetci Idare Mahkemesi' },
        { key: 'DAVACI_AD', label: 'Davaci Ad Soyad', type: 'text', required: true },
        { key: 'DAVACI_TC', label: 'Davaci TC Kimlik No', type: 'text', required: true },
        { key: 'DAVACI_ADRES', label: 'Davaci Adres', type: 'textarea', required: true },
        { key: 'DAVALI_IDARE', label: 'Davali Idare', type: 'text', required: true },
        { key: 'ISLEM_TARIHI', label: 'Islem Tarihi', type: 'date', required: true },
        { key: 'ISLEM_SAYISI', label: 'Islem Sayisi', type: 'text' },
        { key: 'TEBLIG_TARIHI', label: 'Teblig Tarihi', type: 'date', required: true },
        { key: 'OLAY_OZETI', label: 'Olay Ozeti', type: 'textarea', required: true },
        { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka Aykirilik Nedenleri', type: 'textarea', required: true },
        { key: 'YD_GEREKCESI', label: 'Yurutmenin Durdurulmasi Gerekcesi', type: 'textarea', required: true },
        { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
        { key: 'SONUC_TALEBI', label: 'Sonuc ve Talep', type: 'textarea', required: true },
    ],
    content: `## {{MAHKEME}} BASKANLIGINA

## YURUTMENIN DURDURULMASI TALEPLIDIR

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_IDARE}}

**DAVA KONUSU:** ${def.davaKonusu}

**ISLEM TARIHI/SAYISI:** {{ISLEM_TARIHI}} / {{ISLEM_SAYISI}}
**TEBLIG TARIHI:** {{TEBLIG_TARIHI}}

---

## OLAY OZETI

{{OLAY_OZETI}}

---

## HUKUKA AYKIRILIK NEDENLERI

${def.ozelNot}

{{HUKUKA_AYKIRILIK}}

---

## YD GEREKCESI

{{YD_GEREKCESI}}

---

## HUKUKI NEDENLER

${def.hukukiDayanak}

---

## DELILLER

{{DELILLER}}

---

## SONUC VE ISTEM

{{SONUC_TALEBI}}

{{TARIH}}
{{DAVACI_AD}}
`,
    isPremium: false,
    usageCount: 0,
});

const createGuidedIdariTamYargiTemplate = (def) => ({
    id: def.id,
    category: '\u0130dari',
    subcategory: 'Tam Yargi',
    title: def.title,
    description: def.description,
    icon: def.icon || 'Scale',
    variables: [
        { key: 'MAHKEME', label: 'Idare Mahkemesi', type: 'text', required: true, placeholder: '... Nobetci Idare Mahkemesi' },
        { key: 'DAVACI_AD', label: 'Davaci Ad Soyad', type: 'text', required: true },
        { key: 'DAVACI_TC', label: 'Davaci TC Kimlik No', type: 'text', required: true },
        { key: 'DAVACI_ADRES', label: 'Davaci Adres', type: 'textarea', required: true },
        { key: 'DAVALI_IDARE', label: 'Davali Idare', type: 'text', required: true },
        { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
        { key: 'ISLEM_EYLEM_BILGISI', label: 'Hukuka Aykiri Islem/Eylem Bilgisi', type: 'textarea', required: true },
        { key: 'ILLIYET_BAGI', label: 'Illiyet Bagi Aciklamasi', type: 'textarea', required: true },
        { key: 'ZARAR_KALEMLERI', label: 'Zarar Kalemleri', type: 'textarea', required: true },
        { key: 'TALEP_TUTARI', label: 'Toplam Talep Tutari (TL)', type: 'number', required: true },
        { key: 'FAIZ_TALEBI', label: 'Faiz Talebi', type: 'text', placeholder: 'Yasal faiz/avans faizi + baslangic tarihi' },
        { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
        { key: 'SONUC_TALEBI', label: 'Sonuc ve Talep', type: 'textarea', required: true },
    ],
    content: `## {{MAHKEME}} BASKANLIGINA

## TAM YARGI DAVASI DILEKCESI

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**DAVALI:** {{DAVALI_IDARE}}

**DAVA KONUSU:** ${def.davaKonusu}

---

## OLAY VE HUKUKA AYKIRILIK

Tarih: {{OLAY_TARIHI}}

{{ISLEM_EYLEM_BILGISI}}

---

## ILLIYET BAGI

{{ILLIYET_BAGI}}

---

## ZARAR KALEMLERI

${def.ozelNot}

{{ZARAR_KALEMLERI}}

Toplam talep: {{TALEP_TUTARI}} TL
Faiz talebi: {{FAIZ_TALEBI}}

---

## HUKUKI NEDENLER

${def.hukukiDayanak}

---

## DELILLER

{{DELILLER}}

---

## SONUC VE ISTEM

{{SONUC_TALEBI}}

{{TARIH}}
{{DAVACI_AD}}
`,
    isPremium: false,
    usageCount: 0,
});

const EXTRA_IDARI_TEMPLATES = [
    {
        id: '35',
        title: 'Imar Para Cezasi Iptal Davasi Dilekcesi',
        description: 'Belediye tarafindan kesilen imar para cezasinin iptali icin rehberli sablon',
        icon: 'Building2',
        davaKonusu: 'Belediye tarafindan tesis edilen imar para cezasi isleminin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2, m.7, m.27\n- 3194 sayili Imar Kanunu ilgili maddeleri',
        ozelNot: 'Cezanin dayanak tutanagi, metrekare hesabi ve usul teblig sartlari ozellikle irdelenmelidir.',
        type: 'iptal',
    },
    {
        id: '36',
        title: 'Yapi Tatil Tutanagi ve Yikim Karari Iptal Davasi',
        description: 'Yapi tatil tutanagi ve yikim kararina karsi idari iptal davasi sablonu',
        icon: 'Building2',
        davaKonusu: 'Yapi tatil tutanagi ile buna bagli yikim kararinin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2, m.7, m.27\n- 3194 sayili Imar Kanunu m.32 ve ilgili mevzuat',
        ozelNot: 'Yapinin ruhsat durumu, tutanak duzenleme usulu ve savunma hakki ihlali detaylandirilmalidir.',
        type: 'iptal',
    },
    {
        id: '37',
        title: 'Memur Disiplin Cezasi Iptal Davasi Dilekcesi',
        description: 'Uyarma, kinama, ayliktan kesme vb. disiplin cezalarinin iptaline yonelik sablon',
        icon: 'Scale',
        davaKonusu: 'Davaciya verilen disiplin cezasinin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2 ve m.7\n- 657 sayili Devlet Memurlari Kanunu ilgili disiplin hukumleri',
        ozelNot: 'Savunma alinmadan ceza verilmesi, fiilin sabit olmamasi ve olcululuk ilkesi ihlali aciklanmalidir.',
        type: 'iptal',
    },
    {
        id: '38',
        title: 'Universite Ogrenci Disiplin Cezasi Iptal Davasi',
        description: 'Uzaklastirma veya cikari lma cezasina karsi idari dava sablonu',
        icon: 'Scale',
        davaKonusu: 'Universite ogrenci disiplin kurulunca tesis edilen ceza isleminin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2 ve m.7\n- Yuksekogretim mevzuati ve disiplin yonetmelikleri',
        ozelNot: 'Disiplin sorusturmasinda usul, savunma hakki ve delillerin degerlendirilmesi ayrintili yazilmalidir.',
        type: 'iptal',
    },
    {
        id: '39',
        title: 'Kamu Ihalesinden Yasaklama Karari Iptal Davasi',
        description: 'Ihalelerden yasaklama kararina karsi acilabilecek iptal davasi sablonu',
        icon: 'Gavel',
        davaKonusu: 'Kamu ihalelerinden yasaklama kararinin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2, m.7, m.27\n- 4734 sayili Kamu Ihale Kanunu ilgili maddeleri',
        ozelNot: 'Yasaklama kararinin dayanagi, sure ve usul yonunden hukuka uygunlugu somut olarak tartisilmalidir.',
        type: 'iptal',
    },
    {
        id: '40',
        title: 'Atama/Nakil Islemi Iptal Davasi Dilekcesi',
        description: 'Kamu gorevlisinin atama veya nakil islemlerine karsi iptal davasi sablonu',
        icon: 'Building2',
        davaKonusu: 'Davaci hakkinda tesis edilen atama/nakil isleminin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2 ve m.7\n- 657 sayili Kanun ve ilgili personel mevzuati',
        ozelNot: 'Hizmet gerekleri, kariyer-liyakat ilkesi ve aile birligi gibi olculer yonunden hukuka aykirilik gosterilmelidir.',
        type: 'iptal',
    },
    {
        id: '41',
        title: 'Ecrimisil Ihbarnamesi Iptal Davasi Dilekcesi',
        description: 'Hazine tasinmazlarina iliskin ecrimisil ihbarnamelerinin iptaline yonelik sablon',
        icon: 'Building2',
        davaKonusu: 'Davalı idarece duzenlenen ecrimisil ihbarnamesinin iptali istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.2 ve m.7\n- 2886 sayili Devlet Ihale Kanunu ve ilgili mevzuat',
        ozelNot: 'Kullanim suresi, tasinmazin fiili durumu ve ecrimisil hesaplamasindaki hatalar ayrintilandirilmalidir.',
        type: 'iptal',
    },
    {
        id: '42',
        title: 'Hizmet Kusuru Nedeniyle Tam Yargi Davasi',
        description: 'Kamu hizmetinin kotu veya gec islemesi nedeniyle olusan zararin tazmini sablonu',
        icon: 'Scale',
        davaKonusu: 'Davalı idarenin hizmet kusuru nedeniyle dogan zararin tazmini istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.12\n- Anayasa m.125 ve idarenin sorumluluguna iliskin ictihatlar',
        ozelNot: 'Zarar kalemleri faturalar, uzman raporlari ve resmi belgelerle tek tek desteklenmelidir.',
        type: 'tamYargi',
    },
    {
        id: '43',
        title: 'Idari Eylem Nedeniyle Bedensel Zarar Tam Yargi Davasi',
        description: 'Idarenin eylemi sonucu bedensel zarara ugrayan kisinin tazminat talebi icin sablon',
        icon: 'Scale',
        davaKonusu: 'Idari eylem sonucu olusan bedensel zararlara iliskin maddi-manevi tazminat istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.12 ve m.13\n- Turk Borclar Kanunu genel ilkeleri',
        ozelNot: 'Tedavi giderleri, isgucu kaybi ve manevi tazminat gerekceleri ayri basliklarda hesaplanmalidir.',
        type: 'tamYargi',
    },
    {
        id: '44',
        title: 'Kamulastirmasiz El Atma Nedeniyle Tam Yargi Davasi',
        description: 'Idarenin tasinmaza fiilen el atmasi nedeniyle bedel ve tazminat talebine yonelik sablon',
        icon: 'Scale',
        davaKonusu: 'Kamulastirmasiz el atma nedeniyle tasinmaz bedeli ve zararlarin tazmini istemidir.',
        hukukiDayanak: '- 2577 sayili IYUK m.12\n- 2942 sayili Kamulastirma Kanunu ve ilgili ictihatlar',
        ozelNot: 'Tasinmaz bilgileri, kesif-bilirkisi ihtiyaci ve emsal degerler ayrintili sekilde belirtilmelidir.',
        type: 'tamYargi',
    },
].map(def => (def.type === 'tamYargi'
    ? createGuidedIdariTamYargiTemplate(def)
    : createGuidedIdariIptalTemplate(def)));

export const IDARI_TEMPLATES = [
    {
        id: '23',
        category: '\u0130dari',
        subcategory: 'Iptal Davasi',
        title: 'Detayli Idari Islem Iptal Davasi (YD Talepli)',
        description: 'Yetki-sekil-sebep-konu-maksat analizine gore adim adim doldurulan iptal davasi sablonu',
        icon: 'Building2',
        variables: [
            { key: 'MAHKEME', label: 'Idare Mahkemesi', type: 'text', required: true, placeholder: 'Ankara Nobetci Idare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davaci Ad Soyad', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Davaci Adresi', type: 'textarea', required: true },
            { key: 'DAVACI_TEL', label: 'Davaci Telefon', type: 'text' },
            { key: 'DAVACI_EPOSTA', label: 'Davaci E-posta', type: 'text' },
            { key: 'VEKIL_AD', label: 'Vekil Avukat Ad Soyad', type: 'text' },
            { key: 'VEKIL_BARO', label: 'Vekil Baro Sicil No', type: 'text' },
            { key: 'VEKIL_ADRES', label: 'Vekil Tebligat Adresi', type: 'textarea' },
            { key: 'DAVALI_IDARE', label: 'Davali Idare', type: 'text', required: true, placeholder: '... Belediye Baskanligi' },
            { key: 'ISLEM_ADI', label: 'Dava Konusu Islemin Adi', type: 'text', required: true, placeholder: 'Ruhsat iptali, disiplin cezasi, atama islemi vb.' },
            { key: 'ISLEM_TARIHI', label: 'Islem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_SAYISI', label: 'Islem Sayisi', type: 'text' },
            { key: 'TEBLIG_TARIHI', label: 'Teblig Tarihi', type: 'date', required: true },
            { key: 'MENFAAT_IHLALI', label: 'Kisisel Menfaat Ihlali Aciklamasi', type: 'textarea', required: true },
            { key: 'ON_BASVURU_BILGISI', label: 'Idari Basvuru Bilgisi (IYUK m.11)', type: 'textarea', placeholder: 'Basvuru yapildiysa tarih/sayi/cevap yazin' },
            { key: 'YETKI_HATA', label: 'Yetki Yonunden Aykirilik', type: 'textarea', required: true },
            { key: 'SEKIL_HATA', label: 'Sekil/Usul Yonunden Aykirilik', type: 'textarea', required: true },
            { key: 'SEBEP_HATA', label: 'Sebep Yonunden Aykirilik', type: 'textarea', required: true },
            { key: 'KONU_HATA', label: 'Konu Yonunden Aykirilik', type: 'textarea', required: true },
            { key: 'MAKSAT_HATA', label: 'Maksat Yonunden Aykirilik', type: 'textarea', required: true },
            { key: 'YD_GEREKCESI', label: 'Yurutmenin Durdurulmasi Gerekcesi', type: 'textarea', required: true, placeholder: 'Telafisi guc zarar + acik hukuka aykirilik aciklamasi' },
            { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
            { key: 'SONUC_TALEBI', label: 'Sonuc ve Talep Metni', type: 'textarea', required: true, placeholder: 'YD kabul, islem iptali, giderler vb.' },
        ],
        content: `## {{MAHKEME}} BASKANLIGINA

## YURUTMENIN DURDURULMASI TALEPLIDIR

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}
Telefon: {{DAVACI_TEL}}
E-posta: {{DAVACI_EPOSTA}}

**VEKIL (varsa):** {{VEKIL_AD}}
Baro Sicil No: {{VEKIL_BARO}}
Adres: {{VEKIL_ADRES}}

**DAVALI:** {{DAVALI_IDARE}}

**DAVA KONUSU:** {{DAVALI_IDARE}} tarafindan tesis edilen {{ISLEM_TARIHI}} tarihli ve {{ISLEM_SAYISI}} sayili "{{ISLEM_ADI}}" isleminin oncelikle yurutmesinin durdurulmasi, esasen iptali istemidir.

**TEBLIG TARIHI:** {{TEBLIG_TARIHI}}

---

## MENFAAT IHLALI

{{MENFAAT_IHLALI}}

---

## ON BASVURU BILGISI (varsa)

{{ON_BASVURU_BILGISI}}

---

## HUKUKA AYKIRILIK NEDENLERI

**1) Yetki Yonunden:**
{{YETKI_HATA}}

**2) Sekil/Usul Yonunden:**
{{SEKIL_HATA}}

**3) Sebep Yonunden:**
{{SEBEP_HATA}}

**4) Konu Yonunden:**
{{KONU_HATA}}

**5) Maksat Yonunden:**
{{MAKSAT_HATA}}

---

## YURUTMENIN DURDURULMASI GEREKCESI (IYUK m.27)

{{YD_GEREKCESI}}

---

## HUKUKI NEDENLER

- 2577 sayili Idari Yargilama Usulu Kanunu m.2, m.3, m.7 ve m.27
- 2577 sayili Kanun m.11 (idari basvuru ve sure etkisi, uygulanabilir oldugu olculerde)
- 2709 sayili Turkiye Cumhuriyeti Anayasasi ve ilgili mevzuat

---

## DELILLER

{{DELILLER}}

---

## SONUC VE ISTEM

{{SONUC_TALEBI}}

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 0
    },
    {
        id: '24',
        category: '\u0130dari',
        subcategory: 'Tam Yargi',
        title: 'Detayli Tam Yargi Davasi Dilekcesi',
        description: 'Zarar kalemleri, illiyet bagi ve faiz talebini ayrintili toplayan tazminat odakli tam yargi sablonu',
        icon: 'Scale',
        variables: [
            { key: 'MAHKEME', label: 'Idare Mahkemesi', type: 'text', required: true, placeholder: 'Istanbul Nobetci Idare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davaci Ad Soyad', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'TC Kimlik No', type: 'text', required: true },
            { key: 'DAVACI_ADRES', label: 'Davaci Adresi', type: 'textarea', required: true },
            { key: 'DAVACI_TEL', label: 'Davaci Telefon', type: 'text' },
            { key: 'VEKIL_AD', label: 'Vekil Avukat Ad Soyad', type: 'text' },
            { key: 'VEKIL_BARO', label: 'Vekil Baro Sicil No', type: 'text' },
            { key: 'VEKIL_ADRES', label: 'Vekil Tebligat Adresi', type: 'textarea' },
            { key: 'DAVALI_IDARE', label: 'Davali Idare', type: 'text', required: true },
            { key: 'HUKUKA_AYKIRI_EYLEM_ISLEM', label: 'Hukuka Aykiri Islem/Eylem', type: 'textarea', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay/Islem Tarihi', type: 'date', required: true },
            { key: 'TEBLIG_TARIHI', label: 'Teblig Tarihi (varsa)', type: 'date' },
            { key: 'ON_BASVURU_BILGISI', label: 'Idareye Basvuru Bilgisi', type: 'textarea', placeholder: 'IYUK m.11/m.13 kapsaminda basvuru yapildiysa yazin' },
            { key: 'ILLIYET_ACIKLAMASI', label: 'Idarenin Fiili ile Zarar Arasindaki Illiyet Bagi', type: 'textarea', required: true },
            { key: 'MADDI_ZARAR_KALEMLERI', label: 'Maddi Zarar Kalemleri', type: 'textarea', required: true, placeholder: 'Tedavi, gelir kaybi, onarim, ek masraf vb.' },
            { key: 'MADDI_ZARAR_TUTARI', label: 'Maddi Zarar Tutari (TL)', type: 'number', required: true },
            { key: 'MANEVI_ZARAR_GEREKCESI', label: 'Manevi Zarar Gerekcesi', type: 'textarea' },
            { key: 'MANEVI_ZARAR_TUTARI', label: 'Manevi Zarar Tutari (TL)', type: 'number' },
            { key: 'TOPLAM_TALEP_TUTARI', label: 'Toplam Tazminat Talebi (TL)', type: 'number', required: true },
            { key: 'FAIZ_TURU', label: 'Faiz Turu', type: 'text', placeholder: 'Yasal faiz / avans faizi' },
            { key: 'FAIZ_BASLANGIC_TARIHI', label: 'Faiz Baslangic Tarihi', type: 'date' },
            { key: 'DELILLER', label: 'Deliller', type: 'textarea', required: true },
            { key: 'SONUC_TALEBI', label: 'Sonuc ve Talep Metni', type: 'textarea', required: true, placeholder: 'Toplam bedelin faiziyle tahsili, giderler vb.' },
        ],
        content: `## {{MAHKEME}} BASKANLIGINA

## TAM YARGI DAVASI DILEKCESI

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}
Telefon: {{DAVACI_TEL}}

**VEKIL (varsa):** {{VEKIL_AD}}
Baro Sicil No: {{VEKIL_BARO}}
Adres: {{VEKIL_ADRES}}

**DAVALI:** {{DAVALI_IDARE}}

**DAVA KONUSU:** Davali idarenin hukuka aykiri islem/eylemi nedeniyle dogan zararin toplam {{TOPLAM_TALEP_TUTARI}} TL olarak tazmini istemidir.

---

## ACIKLAMALAR

1. Hukuka aykiri oldugu ileri surulen islem/eylem:
{{HUKUKA_AYKIRI_EYLEM_ISLEM}}

2. Olay/Islem tarihi: {{OLAY_TARIHI}}
Teblig tarihi (varsa): {{TEBLIG_TARIHI}}

3. Idareye on basvuru sureci:
{{ON_BASVURU_BILGISI}}

4. Illiyet bagi aciklamasi:
{{ILLIYET_ACIKLAMASI}}

5. Maddi zarar kalemleri:
{{MADDI_ZARAR_KALEMLERI}}
Toplam maddi zarar: {{MADDI_ZARAR_TUTARI}} TL

6. Manevi zarar gerekcesi:
{{MANEVI_ZARAR_GEREKCESI}}
Talep edilen manevi zarar: {{MANEVI_ZARAR_TUTARI}} TL

7. Toplam tazminat talebi: {{TOPLAM_TALEP_TUTARI}} TL

---

## HUKUKI NEDENLER

- 2577 sayili Idari Yargilama Usulu Kanunu m.12
- 2577 sayili Idari Yargilama Usulu Kanunu m.7, m.11 ve m.13 (uygulanabilir oldugu olculerde)
- Turk Borclar Kanunu genel ilkeleri ve ilgili sair mevzuat

---

## DELILLER

{{DELILLER}}

---

## SONUC VE ISTEM

{{SONUC_TALEBI}}

Talep edilen tutara {{FAIZ_TURU}} uygulanarak {{FAIZ_BASLANGIC_TARIHI}} tarihinden itibaren faiziyle birlikte tahsiline karar verilmesini saygilarimla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
        `,
        isPremium: false,
        usageCount: 0
    },
    ...EXTRA_IDARI_TEMPLATES
];

export default {
    TUKETICI_TEMPLATES,
    TICARET_TEMPLATES,
    MIRAS_TEMPLATES,
    CEZA_TEMPLATES,
    IDARI_TEMPLATES,
};
