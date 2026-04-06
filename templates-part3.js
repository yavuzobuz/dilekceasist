// Additional 30 Templates covering Contracts (Sözleşmeler) and Notices (İhtarnameler) 

export const SOZLESME_VE_IHTARNAME_TEMPLATES = [
    {
        "id": "c1",
        "category": "Sözleşmeler",
        "subcategory": "Kira",
        "title": "Konut Kira Sözleşmesi",
        "description": "Mesken olarak kullanılacak taşınmazlar için kira sözleşmesi",
        "icon": "Home",
        "variables": [
            {
                "key": "KIRAYA_VEREN",
                "label": "Kiraya Veren",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRAYA_VEREN_TC",
                "label": "Kiraya Veren TC",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI",
                "label": "Kiracı",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI_TC",
                "label": "Kiracı TC",
                "type": "text",
                "required": true
            },
            {
                "key": "MECUR_ADRES",
                "label": "Kiralanan Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KIRA_BASLANGIC",
                "label": "Kira Başlangıç Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "KIRA_SURESI",
                "label": "Kira Süresi (Örn: 1 Yıl)",
                "type": "text",
                "required": true
            },
            {
                "key": "AYLIK_KIRA",
                "label": "Aylık Kira Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "YILLIK_KIRA",
                "label": "Yıllık Kira Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "DEPOZITO",
                "label": "Depozito Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ODEME_SEKLI",
                "label": "Aylık Ödeme Günü (Örn: Her ayın 1.-5. günü)",
                "type": "text",
                "required": true
            },
            {
                "key": "IBAN",
                "label": "Banka IBAN",
                "type": "text",
                "required": true
            }
        ],
        "content": "## KİRA SÖZLEŞMESİ (KONUT)\n\n**1. TARAFLAR**\n\n**KİRAYA VEREN:** {{KIRAYA_VEREN}} (TC: {{KIRAYA_VEREN_TC}})\n**KİRACI:** {{KIRACI}} (TC: {{KIRACI_TC}})\n\n**2. KİRALANAN MÜLKÜN BİLGİLERİ**\n\n**Adres:** {{MECUR_ADRES}}\n**Kullanım Amacı:** Konut\n\n**3. KİRA BEDELİ VE ÖDEME ŞEKLİ**\n\n**Aylık Kira Bedeli:** {{AYLIK_KIRA}} TL\n**Yıllık Kira Bedeli:** {{YILLIK_KIRA}} TL\n**Kira Ödeme Zamanı:** {{ODEME_SEKLI}} günleri arası\n**Ödeme Şekli (IBAN):** {{IBAN}}\n\n**4. SÜRE VE BAŞLANGIÇ**\n\n**Kira Süresi:** {{KIRA_SURESI}}\n**Başlangıç Tarihi:** {{KIRA_BASLANGIC}}\n\n**5. DEPOZİTO VE GÜVENCE BEDELİ**\n\nKiracı, kiralanana ve demirbaşlara verebileceği zararların güvencesi olarak kiraya verene **{{DEPOZITO}} TL** depozito (güvence bedeli) ödemiştir.\n\n**6. ÖZEL ŞARTLAR**\n\n1. Kiracı, kiralanan mülkü özenle kullanmak, komşulara saygı göstermek ve apartman/site kurallarına uymakla yükümlüdür.\n2. Kiracı, kiralananı kısmen veya tamamen alt kiracıya devredemez, alt kira sözleşmesi yapamaz.\n3. Kiralananda yapılacak kalıcı esaslı onarımlar/tadilatlar kiraya verenin yazılı onayına tabidir.\n4. Kira bedelinin geç ödenmesi durumunda, ödenmeyen kira ayları muacceliyet kesbedecektir.\n5. Taraf değişikliğinde yeni kira bedeli, TÜFE on iki aylık ortalamaları oranında artırılacaktır (Yasal sınır olan geçici oranlar saklı kalmak kaydıyla).\n\nİşbu sözleşme iki nüsha halinde tanzim edilerek taraflarca imzalanmıştır.\n\n{{KIRA_BASLANGIC}}\n\n**Kiraya Veren**\n{{KIRAYA_VEREN}}\n\n**Kiracı**\n{{KIRACI}}",
        "isPremium": false,
        "usageCount": 1450
    },
    {
        "id": "c2",
        "category": "Sözleşmeler",
        "subcategory": "Kira",
        "title": "İşyeri Kira Sözleşmesi",
        "description": "Ticari faaliyet yürütülecek taşınmazlar için kira sözleşmesi",
        "icon": "Briefcase",
        "variables": [
            {
                "key": "KIRAYA_VEREN",
                "label": "Kiraya Veren",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI_SIRKET",
                "label": "Kiracı Şirket/Kişi",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI_VKN",
                "label": "Vergi No",
                "type": "text",
                "required": true
            },
            {
                "key": "MECUR_ADRES",
                "label": "İşyeri Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "FAALIYET_KONUSU",
                "label": "Faaliyet Konusu",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRA_BASLANGIC",
                "label": "Kira Başlangıç",
                "type": "date",
                "required": true
            },
            {
                "key": "KIRA_SURESI",
                "label": "Kira Süresi",
                "type": "text",
                "required": true
            },
            {
                "key": "AYLIK_NET_KIRA",
                "label": "Aylık Net Kira (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "STOPAJ",
                "label": "Stopaj Durumu (Var/Yok)",
                "type": "text",
                "required": true
            },
            {
                "key": "DEPOZITO",
                "label": "Depozito",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İŞYERİ KİRA SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**KİRAYA VEREN:** {{KIRAYA_VEREN}}\n**KİRACI:** {{KIRACI_SIRKET}} (VKN: {{KIRACI_VKN}})\n\n**2. KİRALANAN İŞYERİ BİLGİLERİ**\n\n**Adres:** {{MECUR_ADRES}}\n**Faaliyet Konusu:** {{FAALIYET_KONUSU}}\n\n**3. KİRA BEDELİ VE ÖDEME**\n\n**Aylık Net Kira:** {{AYLIK_NET_KIRA}} TL\n**Stopaj/Vergi Durumu:** {{STOPAJ}}\n**Kira Başlangıcı:** {{KIRA_BASLANGIC}}\n**Kira Süresi:** {{KIRA_SURESI}}\n\n**4. DEPOZİTO**\n\n**Güvence Bedeli:** {{DEPOZITO}}\n\n**5. ÖZEL ŞARTLAR**\n\n1. Kiracı, işyerini ancak belirtilen faaliyet konusu ({{FAALIYET_KONUSU}}) dâhilinde kullanabilir. Amacının dışına çıkamaz.\n2. İşyeri kira artışları, TUIK tarafından açıklanan 12 aylık TÜFE ortalamalarına göre belirlenecektir.\n3. Ruhsat, vergi, belediye harçları ve ortak gider/aidat borçları kiralandığı tarihten itibaren kiracıya aittir.\n\nİşbu sözleşme tarafların hür iradeleri ile okunup imzalanmıştır.\n\n**Kiraya Veren**\n{{KIRAYA_VEREN}}\n\n**Kiracı**\n{{KIRACI_SIRKET}}",
        "isPremium": false,
        "usageCount": 980
    },
    {
        "id": "c3",
        "category": "Sözleşmeler",
        "subcategory": "İş Hukuku",
        "title": "Belirsiz Süreli İş Sözleşmesi",
        "description": "Standart işçi-işveren personel sözleşmesi",
        "icon": "FileText",
        "variables": [
            {
                "key": "ISVEREN",
                "label": "İşveren/Şirket",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI",
                "label": "İşçi Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI_TC",
                "label": "İşçi TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "IS_BASLANGIC",
                "label": "İşe Başlama Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "GOREV",
                "label": "Görevi/Unvanı",
                "type": "text",
                "required": true
            },
            {
                "key": "UCRET",
                "label": "Aylık Net/Brüt Ücret (TL)",
                "type": "text",
                "required": true
            },
            {
                "key": "DENEME_SURESI",
                "label": "Deneme Süresi (Maks 2 Ay)",
                "type": "text"
            }
        ],
        "content": "## BELİRSİZ SÜRELİ İŞ SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**İŞVEREN:** {{ISVEREN}}\n**İŞÇİ:** {{ISCI}} (TC: {{ISCI_TC}})\n\n**2. İŞİN KONUSU VE SÜRESİ**\n\n**Başlama Tarihi:** {{IS_BASLANGIC}}\n**Sözleşme Türü:** Belirsiz Süreli\n**Deneme Süresi:** {{DENEME_SURESI}}\n**Personelin Görevi:** {{GOREV}}\n\n**3. ÜCRET VE ÖDEME**\n\nİşverenin işçiye ödeyeceği temel ücret **{{UCRET}}**'dir. Ücretler her ayın takip eden ilk haftası içinde banka hesabına yatırılır.\n\n**4. ÇALIŞMA SÜRELERİ**\n\nHaftalık normal çalışma süresi 45 saattir. Fazla mesai durumunda İş Kanunu hükümleri uygulanır.\n\n**5. FESİH VE TAZMİNAT**\n\nSözleşmenin taraflarca haklı veya bildirimli (ihbar) feshinde 4857 sayılı İş Kanunu hükümleri saklıdır.\n\n{{IS_BASLANGIC}}\n\n**İşveren**\n{{ISVEREN}}\n\n**İşçi**\n{{ISCI}}",
        "isPremium": false,
        "usageCount": 2150
    },
    {
        "id": "c4",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret",
        "title": "Gizlilik Sözleşmesi (NDA)",
        "description": "Ticari bilgilerin korunması amacıyla Non-Disclosure Agreement",
        "icon": "Lock",
        "variables": [
            {
                "key": "ACIKLAYAN",
                "label": "Açıklayan Taraf (Şirket)",
                "type": "text",
                "required": true
            },
            {
                "key": "ALAN",
                "label": "Gizli Bilgi Alan Taraf",
                "type": "text",
                "required": true
            },
            {
                "key": "PROJE",
                "label": "Proje/İşbirliği Konusu",
                "type": "text",
                "required": true
            },
            {
                "key": "TARIH",
                "label": "Tarih",
                "type": "date",
                "required": true
            }
        ],
        "content": "## GİZLİLİK SÖZLEŞMESİ (NDA)\n\n**1. TARAFLAR**\n\n**Bilgi Açıklayan:** {{ACIKLAYAN}}\n**Bilgi Alan:** {{ALAN}}\n\n**2. SÖZLEŞMENİN AMACI**\n\nTaraflar, **{{PROJE}}** projesi/işbirliği kapsamında görüşmeler yapmakta olup, Bilgi Açıklayan'ın mülkiyetindeki bir takım gizli bilgilerin korunması işbu sözleşmenin amacıdır.\n\n**3. GİZLİ BİLGİNİN TANIMI VE KORUNMASI**\n\n- Ürünler, maliyetler, müşteri listeleri, teknik veriler, algoritmalar ve ticari sırlar \"Gizli Bilgi\" kabul edilir.\n- Bilgi Alan, bu bilgileri kesinlikle üçüncü kişilerle paylaşmamayı ve sadece yetkili personeline ifşa etmeyi taahhüt eder.\n\n**4. CEZAİ ŞART VE İHLAL**\n\nGizlilik yükümlülüğünün ihlali halinde, Bilgi Alan taraf, sebep olduğu tüm doğrudan ve dolaylı zararları tazmin etmeyi kabul eder.\n\n**5. YÜRÜRLÜK VE SÜRE**\n\nİşbu sözleşme {{TARIH}} tarihinde imzalanmış olup, taraflar arasındaki ticari ilişki bitse dahi 5 (beş) yıl süreyle geçerliliğini koruyacaktır.\n\n**Bilgi Açıklayan**\n{{ACIKLAYAN}}\n\n**Bilgi Alan**\n{{ALAN}}",
        "isPremium": true,
        "usageCount": 850
    },
    {
        "id": "c5",
        "category": "Sözleşmeler",
        "subcategory": "Alım-Satım",
        "title": "Araç Satış Vaadi Sözleşmesi",
        "description": "İkinci el veya sıfır araç için noter öncesi satış sözleşmesi/kapora belgesi",
        "icon": "Car",
        "variables": [
            {
                "key": "SATICI",
                "label": "Satıcı Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_TC",
                "label": "Satıcı TC",
                "type": "text",
                "required": true
            },
            {
                "key": "ALICI",
                "label": "Alıcı Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "ARAC_PLAKA",
                "label": "Araç Plakası",
                "type": "text",
                "required": true
            },
            {
                "key": "ARAC_MARKA",
                "label": "Araç Marka/Model",
                "type": "text",
                "required": true
            },
            {
                "key": "ARAC_YIL",
                "label": "Araç Model Yılı",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIS_BEDELI",
                "label": "Toplam Satış Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KAPORA",
                "label": "Verilen Kapora (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "NOTER_TARIHI",
                "label": "Noter Devir Tarihi",
                "type": "date",
                "required": true
            }
        ],
        "content": "## ARAÇ SATIŞ VAADİ VE KAPORA SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**SATICI:** {{SATICI}} (TC: {{SATICI_TC}})\n**ALICI:** {{ALICI}}\n\n**2. ARACA İLİŞKİN BİLGİLER**\n\n**Plaka:** {{ARAC_PLAKA}}\n**Marka/Model:** {{ARAC_MARKA}}\n**Model Yılı:** {{ARAC_YIL}}\n\n**3. SATIŞ ŞARTLARI VE KAPORA**\n\nTaraflar, yukarıda özellikleri belirtilen aracın **{{SATIS_BEDELI}} TL** bedel karşılığında satılması konusunda anlaşmışlardır.\nAlıcı, aracın satın alınmasını teminen **{{KAPORA}} TL** kapora bedelini satıcıya nakden / havale yoluyla ödemiştir. Bakiye tutar noterde devir anında ödenecektir.\n\n**4. DEVİR TESLİM VE VAZGEÇME**\n\n1. Aracın resmi satışı ve noter devri **{{NOTER_TARIHI}}** tarihine kadar yapılacaktır.\n2. Alıcı bu satıştan vazgeçerse verdiği kaporayı yitirir.\n3. Satıcı araç satışından vazgeçerse kaporanın iki katını alıcıya iade etmekle yükümlüdür.\n\nİşbu sözleşme taraflarca okunarak imzalanmıştır.\n\n**Satıcı**\n{{SATICI}}\n\n**Alıcı**\n{{ALICI}}",
        "isPremium": false,
        "usageCount": 1100
    },
    {
        "id": "c6",
        "category": "Sözleşmeler",
        "subcategory": "Alım-Satım",
        "title": "Gayrimenkul Satış Vaadi Sözleşmesi",
        "description": "Ev, arsa, dükkan gibi taşınmazlar için devir vaadi",
        "icon": "Building",
        "variables": [
            {
                "key": "SATICI",
                "label": "Satıcı Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_TC",
                "label": "Satıcı TC/VKN",
                "type": "text",
                "required": true
            },
            {
                "key": "ALICI",
                "label": "Alıcı Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "GAYRIMENKUL_IL",
                "label": "İl / İlçe",
                "type": "text",
                "required": true
            },
            {
                "key": "ADA_PARSEL",
                "label": "Ada / Parsel",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIS_BEDELI",
                "label": "Satış Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "PESINAT",
                "label": "Peşinat (Kapora) (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KALAN_BEDEL",
                "label": "Kalan Bedel (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "DEVIR_TARIHI",
                "label": "Tapu Devir Tarihi",
                "type": "date",
                "required": true
            }
        ],
        "content": "## GAYRİMENKUL SATIŞ VAADİ SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**SATICI:** {{SATICI}} (TC/VKN: {{SATICI_TC}})\n**ALICI:** {{ALICI}}\n\n**2. SÖZLEŞMEYE KONU GAYRİMENKUL**\n\n**İl/İlçe:** {{GAYRIMENKUL_IL}}\n**Ada/Parsel/Bağımsız Bölüm:** {{ADA_PARSEL}}\nYukarıda tapu bilgileri verilen gayrimenkulün satışı hususunda taraflar anlaşmıştır.\n\n**3. SATIŞ BEDELİ VE ÖDEME ŞEKLİ**\n\n**Satış Bedeli:** {{SATIS_BEDELI}} TL\n**Alınan Peşinat:** {{PESINAT}} TL\n**Kalan Bakiye:** {{KALAN_BEDEL}} TL\nSatıcı, işbu peşinatı nakden/hesaben teslim almıştır.\n\n**4. TAPU DEVRİ**\n\n1. Kalan {{KALAN_BEDEL}} TL bakiye, tapu devrinin yapılacağı **{{DEVIR_TARIHI}}** tarihinde eşzamanlı olarak ödenecektir.\n2. Tapu harçları ve masraflar aksi kararlaştırılmadıkça taraflarca yarı yarıya karşılanacaktır.\n3. Gayrimenkul üzerinde devir anında hiçbir haciz, ipotek veya takyidat bulunmayacaktır.\n\n**5. CAYMA AKÇESİ VE CEZAİ ŞART**\n\nTaraflardan biri sözleşmeden haksız olarak dönerse, TBK cezai şart ve kapora (cayma akçesi) hükümleri uygulanır.\n\n**Satıcı**\n{{SATICI}}\n\n**Alıcı**\n{{ALICI}}",
        "isPremium": false,
        "usageCount": 1205
    },
    {
        "id": "c7",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret",
        "title": "Tedarik Sözleşmesi",
        "description": "Ticari mal alım satımı ve düzenli tedarik için B2B sözleşmesi",
        "icon": "Truck",
        "variables": [
            {
                "key": "ALICI_FIRMA",
                "label": "Alıcı Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "TEDARIKCI",
                "label": "Tedarikçi Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "TEDARIKCI_VKN",
                "label": "Tedarikçi VKN",
                "type": "text",
                "required": true
            },
            {
                "key": "URUN_CENSI",
                "label": "Tedarik Edilecek Ürün/Mal",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BIRIM_FIYAT",
                "label": "Birim Fiyat Bilgisi",
                "type": "text",
                "required": true
            },
            {
                "key": "TESLIM_YERI",
                "label": "Teslim Yeri/Şartı (Exw, Fob, Adres)",
                "type": "text",
                "required": true
            },
            {
                "key": "VADE",
                "label": "Ödeme Vadesi (Örn: Fatura kesiminden X gün sonra)",
                "type": "text",
                "required": true
            }
        ],
        "content": "## MAL TEDARİK SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**ALICI:** {{ALICI_FIRMA}}\n**TEDARİKÇİ:** {{TEDARIKCI}} (VKN: {{TEDARIKCI_VKN}})\n\n**2. SÖZLEŞMENİN KONUSU**\n\nİşbu sözleşmenin konusu, Tedarikçi'nin Alıcı'ya **{{URUN_CENSI}}** cinsi malları aşağıda belirtilen şartlarla sürekli veya belirli aralıklarla satması ve teslim etmesidir.\n\n**3. SİPARİŞ VE TESLİMAT**\n\n1. Siparişler, Alıcı tarafından yazılı/e-posta yoluyla bildirilecektir.\n2. Teslimatlar **{{TESLIM_YERI}}** şartı ile yapılacaktır. Nakliye sigortası tarafların aksine anlaşması olmadıkça Tedarikçi/Alıcı uhdesindedir.\n\n**4. FİYAT VE ÖDEME KOŞULLARI**\n\n**Birim Fiyat Anlaşması:** {{BIRIM_FIYAT}}\n**Ödeme Vadesi:** {{VADE}}\nÖdemeler banka havalesi ile Tedarikçi'nin bildireceği hesaba yapılacaktır.\n\n**5. AYIP İHBARI VE GARANTİ**\n\nTeslim alınan ürünlerdeki açık ayıplar TTK m.23 uyarınca süresi içinde bildirilecektir. Gizli ayıp halinde Tedarikçi, ürünü derhal yenisi ile değiştirmeyi taahhüt eder.\n\n**Tedarikçi Firma**\n{{TEDARIKCI}}\n\n**Alıcı Firma**\n{{ALICI_FIRMA}}",
        "isPremium": true,
        "usageCount": 650
    },
    {
        "id": "c8",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret",
        "title": "Bayilik (Franchise) Sözleşmesi",
        "description": "Marka kullanım hakkı ve bayilik (Franchise) verme",
        "icon": "Store",
        "variables": [
            {
                "key": "MARKA_SAHIBI",
                "label": "Franchisor (Marka Sahibi)",
                "type": "text",
                "required": true
            },
            {
                "key": "BAYI",
                "label": "Franchisee (Bayi)",
                "type": "text",
                "required": true
            },
            {
                "key": "MARKA_ADI",
                "label": "Acente/Marka Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "BAYILIK_BOLGESI",
                "label": "Bayilik Verilen Bölge (İl/İlçe)",
                "type": "text",
                "required": true
            },
            {
                "key": "GIRIS_BEDELI",
                "label": "Sisteme Giriş (Franchise) Bedeli",
                "type": "number",
                "required": true
            },
            {
                "key": "SURE",
                "label": "Sözleşme Süresi (Yıl)",
                "type": "text",
                "required": true
            }
        ],
        "content": "## BAYİLİK (FRANCHISE) SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**FRANCHISOR (Marka Sahibi):** {{MARKA_SAHIBI}}\n**FRANCHISEE (Bayi):** {{BAYI}}\n\n**2. SÖZLEŞMENİN KONUSU VE KAPSAMI**\n\nİşbu sözleşmenin konusu, **{{MARKA_ADI}}** markasının ve işletme sisteminin aşağıda belirtilen bölge sınırları içerisinde belli şarlar dahilinde kullanılması hakkının Bayi'ye verilmesidir.\n\n**3. BAYİLİK BÖLGESİ**\n\nFranchise faaliyetlerinin yürütüleceği inhisari bölge: **{{BAYILIK_BOLGESI}}**\n\n**4. MALİ HÜKÜMLER**\n\n**Sisteme Giriş (Franchise Ücreti):** {{GIRIS_BEDELI}} TL + KDV\n**Royalty / Ciro Primi:** Taraflar arasında ek protokolle belirlenen aylık ciro payı Marka Sahibine fatura karşılığı ödenecektir.\n\n**5. MARKA SAHİBİNİN YÜKÜMLÜLÜKLERİ**\n\nMarka kullanım haklarını kullandırmak, başlangıç eğitimlerini vermek, know-how transferini sağlamak ve denetim yapmaktır.\n\n**6. BAYİNİN YÜKÜMLÜLÜKLERİ**\n\nMarkanın itibarına zarar vermemek, sadece onaylı tedarikçilerden ürün çekmek ve kurumsal kimlik standartlarına %100 uymaktır.\n\n**7. SÜRE**\n\nSözleşme süresi **{{SURE}} yıl** olup, taraflar aksini bildirmedikçe şartlar yeniden değerlendirilmek suretiyle uzatılabilecektir.\n\n**Franchisor**\n{{MARKA_SAHIBI}}\n\n**Franchisee (Bayi)**\n{{BAYI}}",
        "isPremium": true,
        "usageCount": 510
    },
    {
        "id": "c9",
        "category": "Sözleşmeler",
        "subcategory": "İş Hukuku",
        "title": "Belirli Süreli İş Sözleşmesi",
        "description": "Proje veya sezon bazlı süresi belirli personel çalışma sözleşmesi",
        "icon": "CalendarClock",
        "variables": [
            {
                "key": "ISVEREN",
                "label": "İşveren/Şirket",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI",
                "label": "İşçi Ad Soyad",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI_TC",
                "label": "İşçi TC",
                "type": "text",
                "required": true
            },
            {
                "key": "IS_BASLANGIC",
                "label": "İşe Başlama Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "IS_BITIS",
                "label": "Sözleşme Bitiş Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OBJEKTIF_NEDEN",
                "label": "Belirli Süreli Yapılma Nedeni (Örn: Kampanya süreci)",
                "type": "textarea"
            },
            {
                "key": "GOREV",
                "label": "Görevi/Pozisyonu",
                "type": "text",
                "required": true
            },
            {
                "key": "UCRET",
                "label": "Ücret (Net/Brüt TL)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## BELİRLİ SÜRELİ İŞ SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**İŞVEREN:** {{ISVEREN}}\n**İŞÇİ:** {{ISCI}} (TC: {{ISCI_TC}})\n\n**2. İŞİN KONUSU, SÜRESİ VE NEDENİ**\n\n**Personelin Görevi:** {{GOREV}}\n**İşin Başlangıcı:** {{IS_BASLANGIC}}\n**İşin Bitişi:** {{IS_BITIS}}\n**Belirli Süreli Yapılmasının Objektif Nedeni:** {{OBJEKTIF_NEDEN}}\n\n*(İş Kanunu m.11 uyarınca, belirli süreli işlerde objektif koşul olmadan sözleşme belirli süreli sayılamaz.)*\n\n**3. ÜCRET**\n\nİşçinin temel ücreti aylık **{{UCRET}} TL** olarak belirlenmiştir.\n\n**4. FESİH VE SONUÇLARI**\n\nSözleşme {{IS_BITIS}} tarihinde hiçbir ihbara gerek kalmaksızın KENDİLİĞİNDEN SONA ERER. Taraflar haklı bir sebep olmadan süresinden önce sözleşmeyi feshederlerse TBK/İş Kanunu uyarınca zararı tazmin veya bakiye süre ücretini talep hakları saklıdır.\n\nİşbu belirli süreli iş sözleşmesi taraflarca okunarak ıslak imza altına alınmıştır.\n\n**İşveren**\n{{ISVEREN}}\n\n**İşçi**\n{{ISCI}}",
        "isPremium": false,
        "usageCount": 945
    },
    {
        "id": "c10",
        "category": "Sözleşmeler",
        "subcategory": "İnşaat/Eser",
        "title": "Eser (İstisna) Sözleşmesi",
        "description": "Mobilya imalatı, yazılım, inşaat, tadilat gibi eserlerin meydana getirilmesi",
        "icon": "Hammer",
        "variables": [
            {
                "key": "IS_SAHIBI",
                "label": "İş Sahibi (Müşteri)",
                "type": "text",
                "required": true
            },
            {
                "key": "YUKLENICI",
                "label": "Yüklenici (Müteahhit/Usta)",
                "type": "text",
                "required": true
            },
            {
                "key": "ESER_KONUSU",
                "label": "Yapılacak Eserin/İşin Konusu",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TESLIM_TARIHI",
                "label": "Teslim/Bitiş Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "ESER_BEDELI",
                "label": "Toplam Bedel (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "CEZAI_SART",
                "label": "Gecikme Halinde Günlük Ceza (TL)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## ESER (İSTİSNA) SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**İŞ SAHİBİ (Sipariş Veren):** {{IS_SAHIBI}}\n**YÜKLENİCİ (Eseri Meydana Getiren):** {{YUKLENICI}}\n\n**2. SÖZLEŞMENİN KONUSU**\n\nİşbu sözleşmenin konusu, **{{ESER_KONUSU}}** işinin Yüklenici tarafından malzeme ve işçiliği karşılanarak tamamlanması ve İş Sahibine teslim edilmesidir.\n\n**3. SÜRE VE TESLİM**\n\nYüklenici eseri eksiksiz, ayıpsız ve tam çalışır/kullanılır durumda en geç **{{TESLIM_TARIHI}}** tarihinde İş Sahibine teslim etmekle yükümlüdür.\n\n**4. BEDEL VE ÖDEME**\n\nTaraflar işin toplam bedelini **{{ESER_BEDELI}} TL** (KDV Dahil/Hariç) olarak kararlaştırmıştır. Taraflar, avans ve ödeme takvimini ek bir vade tablosuyla belirleyebilir.\n\n**5. GECİKME CEZASI (CEZAİ ŞART)**\n\nYüklenici, eseri haklı / mücbir bir sebep olmaksızın teslim tarihinde teslim etmezse; gecikilen her gün için İş Sahibine **{{CEZAI_SART}} TL** gecikme cezası (cezai şart) ödemeyi kabul ve taahhüt eder.\n\n**6. HUKUKİ DAYANAK**\n\nİşbu sözleşme 6098 Sayılı Türk Borçlar Kanunu'nun (m.470 vd.) Eser Sözleşmesi hükümlerine tabidir.\n\n**İş Sahibi**\n{{IS_SAHIBI}}\n\n**Yüklenici**\n{{YUKLENICI}}",
        "isPremium": false,
        "usageCount": 1820
    },
    {
        "id": "c11",
        "category": "Sözleşmeler",
        "subcategory": "İnşaat/Eser",
        "title": "Taşeron Sözleşmesi",
        "description": "Ana yüklenici ile alt yüklenici (Taşeron) arasına iş devir sözleşmesi",
        "icon": "HardHat",
        "variables": [
            {
                "key": "MUTEAHHIT",
                "label": "Müteahhit (Ana Yüklenici)",
                "type": "text",
                "required": true
            },
            {
                "key": "TASERON",
                "label": "Taşeron Firma/Şahıs",
                "type": "text",
                "required": true
            },
            {
                "key": "ISIN_KONUSU",
                "label": "İşin Konusu (Yapılacak Bölüm)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "SANTIYE",
                "label": "Şantiye / İş Adresi",
                "type": "text",
                "required": true
            },
            {
                "key": "TESLIM_TARIHI",
                "label": "İşin Bitiş Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Taşeronluk Bedeli (TL)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## ALTYÜKLENİCİ (TAŞERON) SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**MÜTEAHHİT (Ana Yüklenici):** {{MUTEAHHIT}}\n**TAŞERON (Alt Yüklenici):** {{TASERON}}\n\n**2. İŞİN KONUSU VE KAPSAMI**\n\nMüteahhit'in taahhüdü altındaki **{{SANTIYE}}** şantiye adresindeki projenin, **{{ISIN_KONUSU}}** kısmının malzeme ve işçilik dahil / hariç Taşeron tarafından Ana Sözleşme ve teknik şartnamelere uygun olarak yapılmasıdır.\n\n**3. SÜRE VE TESLİMAT**\n\nTaşeron işi eksiksiz, ayıpsız olarak **{{TESLIM_TARIHI}}** tarihine kadar bitirmekle yükümlüdür.\n\n**4. BEDEL VE ÖDEME ALTYAPISI**\n\n**Toplam Taşeronluk Bedeli:** {{BEDEL}} TL (+ KDV)\nÖdemeler hakediş usulü ile % ... nakit / çek şeklinde yapılacak olup, işçilerin SGK prim borçları Taşerona aittir ve Taşeron hakediş faturalarına SGK borcu yoktur belgesi eklemek zorundadır.\n\n**5. İŞ GÜVENLİĞİ VE İŞÇİ ALACAKLARI**\n\nTaşeron kendi işçilerinden 6331 İSG Kanunu, 4857 İş Kanunu kapsamında fiilen, hukuken ve cezai olarak tek yetkili ve sorumludur.\n\n**Müteahhit Firma**\n{{MUTEAHHIT}}\n\n**Taşeron**\n{{TASERON}}",
        "isPremium": true,
        "usageCount": 680
    },
    {
        "id": "c12",
        "category": "Sözleşmeler",
        "subcategory": "Şirketler Hukuku",
        "title": "Hissedarlar (Pay Sahipleri) Sözleşmesi",
        "description": "Anonim/Limited şirket ortakları arası şirketin yönetimi ve pay devri sınırları",
        "icon": "Users",
        "variables": [
            {
                "key": "SIRKET",
                "label": "Şirket Unvanı",
                "type": "text",
                "required": true
            },
            {
                "key": "ORTAK_A",
                "label": "Ortak A",
                "type": "text",
                "required": true
            },
            {
                "key": "PAY_A",
                "label": "Ortak A Pay Oranı (%)",
                "type": "text",
                "required": true
            },
            {
                "key": "ORTAK_B",
                "label": "Ortak B",
                "type": "text",
                "required": true
            },
            {
                "key": "PAY_B",
                "label": "Ortak B Pay Oranı (%)",
                "type": "text",
                "required": true
            },
            {
                "key": "YONETIM",
                "label": "Yönetim Kurulu Dağılımı",
                "type": "textarea",
                "required": true
            },
            {
                "key": "HAKEM",
                "label": "Uyuşmazlık Hakemi (Opsiyonel)",
                "type": "text"
            }
        ],
        "content": "## PAY SAHİPLERİ (HİSSEDARLAR) SÖZLEŞMESİ\n\n**1. TARAFLAR VE ŞİRKET**\n\nİşbu sözleşme, Merkezi sicil/ticaret odasına kayıtlı **{{SIRKET}}** şirketinin kurucu/mevcut pay sahipleri:\n**A:** {{ORTAK_A}} (Sermaye Oranı: %{{PAY_A}})\n**B:** {{ORTAK_B}} (Sermaye Oranı: %{{PAY_B}})\narasında akdedilmiştir.\n\n**2. SÖZLEŞMENİN AMACI**\n\nŞirketin yönetimi, hisse devir kısıtlamaları, temettü (kâr) dağıtımı ve ortaklıktan ayrılma koşullarını tarafların rızası dahilinde belirlemektir.\n\n**3. ŞİRKETİN YÖNETİMİ**\n\nŞirket ana sözleşmesi hükümlerinden bağımsız olarak, taraflar aralarında yönetim ilkelerini şu şekilde belirlemiştir: {{YONETIM}}\n\n**4. HİSSE DEVRİ (DRAG-ALONG / TAG-ALONG)**\n\n1. Herhangi bir taraf paylarını devretmek isterse; ilk alım teklif hakkı daima diğer ortaklara aittir.\n2. Birlikte Satma / Birlikte Satılmaya Zorlama hükümleri devreye girebilir.\n\n**5. REKABET YASAĞI**\n\nOrtaklar doğrudan ya da dolaylı olarak Şirket faaliyet alanında 3. kişilerle rakip şirket kuramaz, faaliyette bulunamaz.\n\n**6. ÇÖZÜM VE HAKEM**\n\nOlası uyuşmazlıklarda **{{HAKEM}}** tahkim/hakem kurumu olarak tayin edilmiş olup işbu sözleşme taraflarca okunup imzalanmıştır.\n\n**Sözleşmeyi İmzalayan Pay Sahipleri:**\n{{ORTAK_A}}   -   {{ORTAK_B}}",
        "isPremium": true,
        "usageCount": 425
    },
    {
        "id": "c13",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret - Borçlar",
        "title": "Ariyet (Kullanım Ödüncü) Sözleşmesi",
        "description": "Herhangi bir taşıtın, bilgisayarın veya ekipmanın ücretsiz geçici süreli devri",
        "icon": "RefreshCcw",
        "variables": [
            {
                "key": "ODUNC_VEREN",
                "label": "Ariyet Veren",
                "type": "text",
                "required": true
            },
            {
                "key": "ODUNC_ALAN",
                "label": "Ariyet Alan",
                "type": "text",
                "required": true
            },
            {
                "key": "MAL",
                "label": "Ariyet Konusu Eşya/Araç",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VERILIS_AMACI",
                "label": "Kullanım Amacı",
                "type": "text",
                "required": true
            },
            {
                "key": "SURE",
                "label": "Ne Zaman İade Edilecek?",
                "type": "date",
                "required": true
            }
        ],
        "content": "## ARİYET (KULLANIM ÖDÜNCÜ) SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**Kullanım Ödüncü Veren:** {{ODUNC_VEREN}}\n**Kullanım Ödüncü Alan:** {{ODUNC_ALAN}}\n\n**2. SÖZLEŞMENİN KONUSU**\n\nİşbu sözleşme uyarınca, vasıfları **{{MAL}}** olan menkul mal, hiçbir bedel alınmaksızın Ariyet Alan'a tahsis edilmiş ve fiilen teslim edilmiştir.\n\n**3. KULLANIM AMACI VE İADE**\n\nAriyet Alan bu malı **{{VERILIS_AMACI}}** doğrultusunda, özenle ve olağan kullanımına uygun olarak kullanacaktır. \nAriyet sözleşmesi **{{SURE}}** tarihine kadar geçerli olup bu tarihte ilgili mal aynı sağlamlıkta ve temizlikte iade edilecektir.\n\n**4. ZARAR, KAYIP VE ÇALINMA**\n\nAriyet Alan'ın zilliyetliğinde bulunduğu sürede ortaya çıkabilecek trafik cezaları, cihaz/mal hasarı, kayıp ve çalınması hallerinden Ariyet Alan Borçlar Kanunu hükümlerince kusursuz dahi olsa doğrudan tüm bedeli tazminle yükümlüdür.\n\nİşbu sözleşme tarafların iradesi ile imzalanmıştır.\n\n**Ariyet Veren**\n{{ODUNC_VEREN}}\n\n**Ariyet Alan**\n{{ODUNC_ALAN}}",
        "isPremium": false,
        "usageCount": 610
    },
    {
        "id": "c14",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret - Borçlar",
        "title": "Kefalet Sözleşmesi",
        "description": "Bir borcun (Kira/Ticari vs) ödenmesini şahsen garanti eden sözleşme",
        "icon": "ShieldCheck",
        "variables": [
            {
                "key": "ALACAKLI",
                "label": "Alacaklı",
                "type": "text",
                "required": true
            },
            {
                "key": "ASIL_BORCLU",
                "label": "Asıl Borçlu",
                "type": "text",
                "required": true
            },
            {
                "key": "KEFIL",
                "label": "Müteselsil / Adi Kefil",
                "type": "text",
                "required": true
            },
            {
                "key": "KEFIL_TC",
                "label": "Kefil TC",
                "type": "text",
                "required": true
            },
            {
                "key": "AZAMI_TUTAR",
                "label": "Kefalet Üst Limiti (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KEFALET_TARIHI",
                "label": "Kefalet İmzası ve Bitiş Süresi",
                "type": "date",
                "required": true
            }
        ],
        "content": "## KEFALET SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**ALACAKLI:** {{ALACAKLI}}\n**ASIL BORÇLU:** {{ASIL_BORCLU}}\n**KEFİL:** {{KEFIL}} (TC: {{KEFIL_TC}})\n\n**2. BEYAN VE KEFALETİN TÜRÜ**\n\nAsıl Borçlu'nun Alacaklı'ya karşı doğmuş ve doğacak borçlarına, işbu sözleşmeyi imzalayan Kefil, Türk Borçlar Kanunu çerçevesinde **Müteselsil Kefil** (veya Adi Kefil) sıfatıyla kefil olduğunu kendi EL YAZISIYLA yazarak ve onaylayarak beyan eder.\n\n**3. KEFALETİN LİMİTİ VE SÜRESİ**\n\nKefil'in sorumlu olacağı azami tutar **{{AZAMI_TUTAR}} TL** olarak (el yazısı ile bedel yazılarak) limitlenmiş olup, kefalet sözleşmesi en geç **{{KEFALET_TARIHI}}** tarihine kadar geçerlidir.\n\n*(Bilgi Notu: Kefalet Sözleşmelerinin TBK 583 uyarıca; kefilin kefil olma iradesini, üstlendiği azami miktarı ve kefalet tarihini bizzat KENDİ EL YAZISI ile belgesine dökmesi kuraldır)*\n\n**Kefil Adı Soyadı:** {{KEFIL}}\n\n**(El Yazısı İle):** \".... tutarına kadar ..... süre için kefil oluyorum\"\n\n**İmza**",
        "isPremium": false,
        "usageCount": 820
    },
    {
        "id": "c15",
        "category": "Sözleşmeler",
        "subcategory": "Ticaret",
        "title": "Çiğ Süt Alım-Satım Sözleşmesi",
        "description": "Gıda/Hayvancılık sektörü ve kooperatifler nezdinde T.C. onayı taşıyan sözleşme",
        "icon": "Milk",
        "variables": [
            {
                "key": "URETICI",
                "label": "Üretici/Çiftçi/Kooperatif",
                "type": "text",
                "required": true
            },
            {
                "key": "ALICI",
                "label": "Alıcı/Süt İşletmesi",
                "type": "text",
                "required": true
            },
            {
                "key": "MIKTAR",
                "label": "Günlük/Aylık Tahmini Litre",
                "type": "number",
                "required": true
            },
            {
                "key": "FIYAT",
                "label": "USK / Referans Litre Fiyatı",
                "type": "text",
                "required": true
            }
        ],
        "content": "## ÇİĞ SÜT ALIM-SATIM SÖZLEŞMESİ\n\n**1. TARAFLAR**\n\n**Süt Üreticisi (Satıcı):** {{URETICI}}\n**Süt İşletmesi (Alıcı):** {{ALICI}}\n\n**2. SÖZLEŞMENİN KONUSU**\n\nTarım ve Orman Bakanlığı Çiğ Sütün Sözleşmeli Usulde Alım Satımı Hakkında Yönetmelik gereğince; Üretici'nin ürettiği inek çiğ sütünün Alıcı tarafından aşağıda belirlenen fiyat, kalite ve miktar şartlarında satın alınmasıdır.\n\n**3. MİKTAR VE KALİTE STANDARTLARI**\n\n1. Teslim Edilecek Miktar (Tahmini): **{{MIKTAR}} Litre/Dönem**.\n2. Alınan çiğ sütün; Tarım Bakanlığı Kalite Kriterleri, Soğutulmuş Çiğ Süt Tebliğine uygun olması ve içerisinde antibiyotik vb. kalıntı barındırmaması zorunludur.\n\n**4. FİYAT VE ÖDEME**\n\nUlusal Süt Konseyi (USK) güncel tavsiye referans / serbest piyasa birim fiyatı üzerinden **{{FIYAT}} TL/Lt** ödeme mutabakatına varılmıştır. Ödemeler müstahsil makbuzu / fatura karşılığında takip eden ayın .. günü hesabına yapılacaktır.\n\nİşbu sözleşmenin bir nüshası ilgili İlçe Tarım Orman Müdürlüğüne kayıt amaçlı verilecektir.\n\n**Üretici Onay**\n{{URETICI}}\n\n**Alıcı Onay**\n{{ALICI}}",
        "isPremium": false,
        "usageCount": 115
    },
    {
        "id": "n1",
        "category": "İhtarnameler",
        "subcategory": "Kira",
        "title": "Kiracı Tahliye İhtarnamesi (Temerrüt/Ödememe)",
        "description": "Kira bedelinin ödenmemesi durumunda 30 günlük fesih/tahliye ihtarı",
        "icon": "Home",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter Adı",
                "type": "text",
                "placeholder": "Bursa 4. Noterliği"
            },
            {
                "key": "KIRAYA_VEREN",
                "label": "İhtar Eden (Kiraya Veren)",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRAYA_VEREN_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRAYA_VEREN_ADRES",
                "label": "Adres",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KIRACI",
                "label": "Muhatap (Kiracı)",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI_ADRES",
                "label": "Kiralık Konut Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ODENMEYEN_AYLAR",
                "label": "Ödenmeyen Aylar (Örn: Mart, Nisan 2026)",
                "type": "text",
                "required": true
            },
            {
                "key": "TOPLAM_BORC",
                "label": "Toplam Kira Borcu (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "IBAN",
                "label": "Ödeme Yapılacak IBAN",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{KIRAYA_VEREN}} (TC: {{KIRAYA_VEREN_TC}})\n**ADRES:** {{KIRAYA_VEREN_ADRES}}\n\n**MUHATAP:** {{KIRACI}}\n**ADRES:** {{KIRACI_ADRES}}\n\n**KONU:** Ödenmeyen {{ODENMEYEN_AYLAR}} ayları kira bedellerinin {{SURE|30}} gün içinde ödenmesi, ödenmediği takdirde hakkınızda TBK m.315 uyarınca tahliye kararı ile yasal takibe geçileceğinin ihtarıdır.\n\n---\n\n**AÇIKLAMALAR:**\n\nSayın Muhatap;\n\nMülkiyeti tarafıma ait olan ve yukarıda adresiniz olarak belirtilen ({{KIRACI_ADRES}}) taşınmazda aylık kira bedeli ile kiracı olarak bulunmaktasınız.\n\nKira sözleşmemiz uyarınca peşin olarak ödemeniz gereken **{{ODENMEYEN_AYLAR}}** dönemine ait toplam **{{TOPLAM_BORC}} TL** kira borcunuzu ödemediğiniz tespit edilmiştir.\n\nİşbu ihtarnamenin tarafınıza tebliğinden itibaren **Yasal 30 (Otuz) günlük süre içerisinde** birikmiş toplam **{{TOPLAM_BORC}} TL** kira bedelini aşağıda belirtilen banka hesabıma yatırmanızı,\n\nAksi takdirde; herhangi bir ihbara gerek kalmaksızın kira sözleşmenizin **temerrüt (TBK m.315) nedeni ile feshedileceğini** ve taşınmazı **TAHLİYE ETMENİZ İÇİN** aleyhinizde İcra Tahliye ve dava yollarına başvuracağımı, Mahkeme Masrafları ve Avukatlık Ücretlerinin tarafınıza yükleneceğini ihtaren bildiririm.\n\n**Banka:** ... \n**IBAN:** {{IBAN}}\n\n**İhtar Eden:**\n{{KIRAYA_VEREN}}",
        "isPremium": false,
        "usageCount": 2100
    },
    {
        "id": "n2",
        "category": "İhtarnameler",
        "subcategory": "Kira",
        "title": "Kiracı Tahliye İhtarnamesi (İhtiyaç Sebebiyle)",
        "description": "Kendisi veya yakınının konut ihtiyacı sebebiyle dönemsel fesih bildirimi",
        "icon": "ArrowRightSquare",
        "variables": [
            {
                "key": "KIRAYA_VEREN",
                "label": "İhtar Eden",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI",
                "label": "Muhatap (Kiracı)",
                "type": "text",
                "required": true
            },
            {
                "key": "KIRACI_ADRES",
                "label": "Kiralık Konut Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "IHTIYAC_SAHIBI",
                "label": "İhtiyacı Olan Kişi (Örn: Kendim, Oğlum)",
                "type": "text",
                "required": true
            },
            {
                "key": "SOZLESME_BITIS",
                "label": "Sözleşme Bitiş/Yenileme Tarihi",
                "type": "date",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{KIRAYA_VEREN}}\n**MUHATAP:** {{KIRACI}}\n\n**KONU:** TBK madde 350 uyarınca ihtiyaç sebebiyle {{SOZLESME_BITIS}} tarihli kira sözleşmesinin süresinin uzatılmayarak feshi ve gayrimenkulün tahliyesi ihtarına ilişkindir.\n\n---\n\nSayın {{KIRACI}};\n\nYeni dönem olan **{{SOZLESME_BITIS}}** tarihinden itibaren mülkiyeti şahsıma ait olan {{KIRACI_ADRES}} adresindeki eve, **{{IHTIYAC_SAHIBI}}**'nin zorunlu ve samimi barınma / konut ihtiyacı doğmuştur.\n\nTürk Borçlar Kanunu Madde 350 uyarınca ihtiyacın gerçek, samimi ve zorunlu olması hali söz konusudur. Bu sebeplerden ötürü, kiracısı olduğunuz taşınmazı sözleşme bitim tarihi olan {{SOZLESME_BITIS}} tarihinde veya en geç bitimden itibaren yasal 1 aylık süre dolmadan ihtilafsız olarak boş ve hasarsız şekilde teslim etmenizi;\n\nEğer teslim etmez ve evimi tarafıma tahliye etmez iseniz; sözleşme süresinin sonundan itibaren **Tahliye Davası** ikame edeceğimi, bu durumda yargılama gideri ve avukatlık ücretlerinin tarafınıza tahsil edileceğini ihtaren bildiririm.\n\n**İhtar Eden:**\n{{KIRAYA_VEREN}}",
        "isPremium": false,
        "usageCount": 1850
    },
    {
        "id": "n3",
        "category": "İhtarnameler",
        "subcategory": "İş Hukuku",
        "title": "İşveren Tarafından Fesih İhtarnamesi (Haklı Neden/Devamsızlık)",
        "description": "Ardı ardına 2 veya ayda 3 gün mazeretsiz işe gelmeyenin sözleşmesinin feshi",
        "icon": "UserX",
        "variables": [
            {
                "key": "ISVEREN",
                "label": "İhtar Eden İşveren",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI",
                "label": "Muhatap İşçi",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI_ADRES",
                "label": "Muhatap İşçi Adresi",
                "type": "text",
                "required": true
            },
            {
                "key": "DEVAMSIZ_TARIHLER",
                "label": "Devamsızlık Tarihleri (Örn: 10-11 Mayıs 2026)",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{ISVEREN}}\n**MUHATAP İŞÇİ:** {{ISCI}}\n\n**KONU:** 4857 Sayılı Kanun M:25/II-g uyarınca İş Sözleşmesinin haklı feshi.\n\n---\n\nSayın {{ISCI}};\n\nİşyerimizdeki görevine **{{DEVAMSIZ_TARIHLER}}** günlerinde, hiçbir makbuz, haber veya mazeret göstermeksizin ardı ardına izinsiz olarak işe gelmediğin tutanak altına alınmıştır.\n\nİşyerinize izinsiz ve mazeretsiz gelmemeniz sebebiyle 4857 sayılı İş Kanununun 25/II-g maddesi olan “İşçinin işverenden izin almaksızın veya haklı bir sebebe dayanmaksızın ardı ardına iki iş günü devamsızlık yapması” maddesine dayanarak;\n\nİş akdinizin İŞVERENLİĞİMİZCE **tek taraflı ve tazminatsız (haklı nedenle)** DERO (Fesih) edildiğini, \n\nVarsa içeride kalan maktu maaş ve diğer hak ve alacaklarınızı ihbar süresi beklemeksizin şirket muhasebesinden banka aracılığıyla alabileceğinizi bilgilerinize ihtaren bildiririz.\n\n**İşveren Şirket Yetkilisi**\n{{ISVEREN}}",
        "isPremium": false,
        "usageCount": 1150
    },
    {
        "id": "n4",
        "category": "İhtarnameler",
        "subcategory": "İş Hukuku",
        "title": "İşveren Fesih İhtarnamesi (Performans/Geçerli Neden)",
        "description": "İşçinin yetersizliği / işletme küçülmesine bağlı tazminatlı bildirimli fesih",
        "icon": "Users",
        "variables": [
            {
                "key": "ISVEREN",
                "label": "İşveren",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI",
                "label": "İşçi",
                "type": "text",
                "required": true
            },
            {
                "key": "GECERLI_NEDEN",
                "label": "Geçerli Neden (Performans düşük/Bölüm kapandı vb.)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "IHBAR_SURESI",
                "label": "Kullanılacak İhbar Süresi (Hafta)",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN İŞVEREN:** {{ISVEREN}}\n**MUHATAP:** {{ISCI}}\n\n**KONU:** 4857 Sayılı Kanun Madde 17 ve 18 Uyarınca Geçerli Nedenle Fesih İhtarıdır.\n\n---\n\nSayın {{ISCI}};\n\nKurumumuz nezdinde çalışmakta olduğunuz pozisyonda, son dönemki performans değerlendirme raporlarınız ve işletme içi organizasyonel süreçlerimiz neticesinde; **{{GECERLI_NEDEN}}** sebepleriyle iş akdinizin devamı şirketimiz açısından olanaksız duruma gelmiştir.\n\nAçıklanan geçerli nedenlere dayanarak İş Kanunu Md 17, 18 uyarınca iş sözleşmeniz feshedilmektedir.\n\nKanuni ihbar süreniz olan **{{IHBAR_SURESI}} hafta** boyunca yeni iş arama izinlerinizi (günde en az 2 saat) toplu olarak mı yoksa peyderpey mi kullanacağınızı yazılı bildirmenizi; \nSüre bitiminde kıdem tazminatınızın tüm yasal kesintiler yapıldıktan sonra banka hesabınıza yatırılacağını ihtaren tebliğ ederiz.\n\n**İşveren**\n{{ISVEREN}}",
        "isPremium": true,
        "usageCount": 540
    },
    {
        "id": "n5",
        "category": "İhtarnameler",
        "subcategory": "İş Hukuku",
        "title": "İşçi Tarafından Haklı Fesih İhtarnamesi",
        "description": "Maaş ödenmemesi, eksik SGK veya mobbing nedeniyle işçinin haklı istifası",
        "icon": "LogOut",
        "variables": [
            {
                "key": "ISCI",
                "label": "İhtar Eden İşçi",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI_TC",
                "label": "İşçi TC",
                "type": "text",
                "required": true
            },
            {
                "key": "ISCI_IBAN",
                "label": "Banka IBAN",
                "type": "text",
                "required": true
            },
            {
                "key": "ISVEREN",
                "label": "Muhatap İşveren",
                "type": "text",
                "required": true
            },
            {
                "key": "ISVEREN_ADRES",
                "label": "İşyeri Adresi",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_NEDENI",
                "label": "Haklı Fesih Nedeni (Maaşımın 2 aydır ödenmemesi vb.)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "FESIH_TARIHI",
                "label": "Hangi tarih itibariyle iş bırakılıyor?",
                "type": "date",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{ISCI}} (TC: {{ISCI_TC}})\n**MUHATAP ŞİRKET/İŞVEREN:** {{ISVEREN}}\n**ADRES:** {{ISVEREN_ADRES}}\n\n**KONU:** İş Sözleşmesinin 4857 s. İş Kanunu Madde 24/II Uyarınca Haklı Nedenlerle Feshi ve Kıdem Tazminatı, Ücret Alacaklarının Bildirimi\n\n---\n\nSayın Muhatap İşveren,\n\nŞirketiniz emrinde uzun süreden beridir emek vermekteyim. Ancak, **{{FESIH_NEDENI}}**.\n\nYukarıda açıkladığım bu hususlar, İş Kanunu madde 24/II bendi kapsamında (İşverenin ahlak ve iyi niyet kurallarına uymayan halleri ve benzerleri) işçiye haklı nedenle fesih yetkisi vermektedir.\n\nBu nedenle;\n1. İhbar sürelerini beklemeksizin derhal iş sözleşmemi **haklı olarak {{FESIH_TARIHI}} tarihi itibariyle TEK TARAFLI FESHEDİYORUM.**\n2. Tarafımın Kıdem Tazminatı, içeride kalan maaş ve asgari geçim/fazla mesai, yıllık ücretli izin alacaklarımın tamamının bu ihtarın tarafınıza tebliğinden itibaren 3 gün içinde aşağıda belirttiğim hesabıma ödenmesini;\n3. Aksi takdirde tüm yasal yollara müracaat edileceğini, arabuluculuk ve mahkeme süreçlerinin işletilerek yargılama gideri ile vekâlet ücretlerinin şirketinize yükleneceğini ihtaren bildiririm.\n\n**IBAN Numarası:** {{ISCI_IBAN}}\n\n**İhtar Eden İşçi**\n{{ISCI}}",
        "isPremium": false,
        "usageCount": 2605
    },
    {
        "id": "n6",
        "category": "İhtarnameler",
        "subcategory": "Alacak",
        "title": "Açık Hesap / Fatura Bakiyesi Ödeme İhtarnamesi",
        "description": "Ticari ilişkiden veya faturadan doğan alacağın tahsili için ihtar",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ALACAKLI_FIRMA",
                "label": "İhtar Eden Alacaklı",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_FIRMA",
                "label": "Muhatap Borçlu",
                "type": "text",
                "required": true
            },
            {
                "key": "FATURA_NO_TARIH",
                "label": "Fatura No ve Tarihleri",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TOPLAM_ALACAK",
                "label": "Toplam Bakiye (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ODEME_SURESI",
                "label": "Ödeme Süresi (Örn: 7)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAKLI_IBAN",
                "label": "Ödeme Yapılacak IBAN",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{ALACAKLI_FIRMA}}\n**MUHATAP:** {{BORCLU_FIRMA}}\n\n**KONU:** Ticari ilişkiden / Açık hesaptan kaynaklanan bakiye {{TOPLAM_ALACAK}} TL borcun ödenmesi ihtarıdır.\n\n---\n\nSayın Muhatap,\n\nŞirketimiz ile aranızdaki ticari faaliyetler neticesinde cari hesabınızda mutabakat sağlanan ve aşağıdaki faturalara dayanan borç bakiyesi bulunmaktadır:\n\n**Faturalar:** {{FATURA_NO_TARIH}}\n**Toplam Borç Bakiyesi:** {{TOPLAM_ALACAK}} TL\n\nSöz konusu borcu bugüne kadar yapılan sözlü uyarılara karşın ödemediğiniz tespit edilmiştir.\n\nİşbu ihtarnamenin tarafınıza tebliğinden itibaren **{{ODEME_SURESI}} GÜN** içinde, toplam **{{TOPLAM_ALACAK}} TL** açık hesap borcunuzu aşağıda belirtilmiş olan şirket banka hesabımıza nakden ve defaten ödemenizi;\n\nÖdenmediği takdirde, alacağın tahsili için aleyhinize icra takibi başlatılacağını, fazlaya ilişkin her türlü dava haklarımız saklı kalmak kaydıyla, doğacak asıl alacak, temerrüt faizi, yasal icra masrafları ve avukatlık ücretlerinin tarafınıza yükleneceğini ihtaren bildiririz.\n\n**Banka ve IBAN:** {{ALACAKLI_IBAN}}\n\n**İhtar Eden**\n{{ALACAKLI_FIRMA}}",
        "isPremium": false,
        "usageCount": 3500
    },
    {
        "id": "n7",
        "category": "İhtarnameler",
        "subcategory": "Tüketici",
        "title": "Ayıplı Mal İadesi/Değişim İhtarnamesi",
        "description": "Bozuk çıkan ürünün bedel iadesi veya 0 yenisiyle değişimi",
        "icon": "PackageX",
        "variables": [
            {
                "key": "TUKETICI",
                "label": "Tüketici (İhtar Eden)",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI",
                "label": "Satıcı Firma (Muhatap)",
                "type": "text",
                "required": true
            },
            {
                "key": "URUN",
                "label": "Ayıplı Ürün Modeli/Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Ödenen Bedel (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALIM_TARIHI",
                "label": "Satın Alma Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "AYIP_TANIMI",
                "label": "Üründeki Arıza/Ayıp",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TALEP",
                "label": "Tüketici Talebi",
                "type": "text",
                "placeholder": "Bedel İadesi VEYA Ayıpsız Misliyle Değişim",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{TUKETICI}}\n**MUHATAP BEDEL:** {{SATICI}}\n\n**KONU:** Ayıplı mal nedeniyle seçimlik hakların kullanılması ve **{{TALEP}}** ihtarıdır.\n\n---\n\nSayın Muhatap,\n\nFirmanızın mağazasından/internet sitesinden {{ALIM_TARIHI}} tarihinde **{{BEDEL}} TL** bedel ödeyerek **{{URUN}}** isimli ürünü satın aldım.\n\nÜrünü kullanmaya başladıktan kısa bir süre sonra, üründe aşağıda belirtilen üretim hataları/arızalar (Gizli veya Açık Ayıp) meydana gelmiş ve tarafımdan beklenen fayda ortadan kalkmıştır.\n**Ayıp Nedir:** {{AYIP_TANIMI}}\n\n**TKHK Madde 11 (Tüketicinin Seçimlik Hakları)** uyarınca;\n1. Satılanı geri vermeye hazır olduğumu bildirerek sözleşmeden dönme / **{{TALEP}}** hakkımı kullanıyorum.\n2. İşbu ihtarnamenin tebliğinden itibaren yasal 3 (üç) iş günü içinde malın yenisi ile değiştirilmesini VEYA bedelinin tarafıma fatura üzerinden iadesini bekliyorum.\n\nBedel ödemesi / Değişim yapılmadığı takdirde, yasal gecikme faiziyle birlikte Tüketici Hakem Heyetine ve Tüketici Mahkemelerine müracaat ederek tüm yargılama maliyetini tarafınıza yükleyeceğimi ihtaren bildiririm.\n\n**İhtar Eden Tüketici**\n{{TUKETICI}}",
        "isPremium": false,
        "usageCount": 1340
    },
    {
        "id": "n8",
        "category": "İhtarnameler",
        "subcategory": "Tüketici",
        "title": "Ayıplı Hizmet Bedel İadesi İhtarnamesi",
        "description": "Kusurlu ifa edilen veya eksik bırakılan danışmanlık/estetik/hizmet için ihtar",
        "icon": "Ban",
        "variables": [
            {
                "key": "MUSTERI",
                "label": "Müşteri (İhtar Eden)",
                "type": "text",
                "required": true
            },
            {
                "key": "HIZMET_SAGLAYICI",
                "label": "Hizmet Sağlayıcı (Firma)",
                "type": "text",
                "required": true
            },
            {
                "key": "HIZMET_KONUSU",
                "label": "Hizmetin Türü (Örn: Güzellik merkezi, Tamir, vs)",
                "type": "text",
                "required": true
            },
            {
                "key": "HIZMET_BEDELI",
                "label": "Ödenen Bedel (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "SORUN_TANIMI",
                "label": "Beklentiyi Karşılamayan veya Yarım Kalan Kusur Nedir?",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TALEP",
                "label": "Talep Edilen Husus",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{MUSTERI}}\n**MUHATAP:** {{HIZMET_SAGLAYICI}}\n\n**KONU:** Ayıplı hizmet sebebiyle sözleşmenin feshi ve **{{TALEP}}** ihtarıdır.\n\n---\n\nSayın Muhatap,\n\nKurumunuzla yapılan görüşmeler neticesinde tarafıma **{{HIZMET_KONUSU}}** hizmetinin eksiksiz ve taahhüt edilen kalitede verileceği garantisi ile **{{HIZMET_BEDELI}} TL** peşin ödeme yapılmıştır.\n\nNe var ki, yerine getirilen hizmet sırasında: \n**{{SORUN_TANIMI}}** \nşeklinde sorunlarla karşılaşılmış, hizmet kalitesi açıkça yetersiz kalmış ve vaat edilen standartlara katiyen uyulmamıştır.\n\n6502 Sayılı Tüketicinin Korunması Hakkında Kanun uyarınca hizmette ayıp olduğu açıktır. \nBu bağlamda;\n\nHizmet sözleşmemizi haklı nedenle iptal ettiğimi belirtir, kusurlu ifa sebebiyle **{{TALEP}}**'imi işbu ihtarnamenin tarafınıza ulaşmasından itibaren 5 gün içerisinde banka hesabıma transfer etmenizi talep ederim. Talebim karşılanmadığı takdirde tazminat haklarımla birlikte icra ve mahkeme yoluna başvuracağımı, maddi manevi zararımın giderilmesi için Tüketici Mahkemesinde dava açılacağını ihtar ederim.\n\n**İhtar Eden Müşteri**\n{{MUSTERI}}",
        "isPremium": false,
        "usageCount": 975
    },
    {
        "id": "n9",
        "category": "İhtarnameler",
        "subcategory": "Ticaret",
        "title": "Sözleşmeye Aykırılığın Giderilmesi (İfa) İhtarnamesi",
        "description": "Sözleşmeden doğan teslimat, devir veya yükümlülük şartlarının yerine getirilmesi için ek süre ",
        "icon": "AlertTriangle",
        "variables": [
            {
                "key": "IHTAR_EDEN",
                "label": "İhtar Eden Taraf",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP",
                "label": "Muhatap (Kusurlu Taraf)",
                "type": "text",
                "required": true
            },
            {
                "key": "SOZLESME_TARIH",
                "label": "Sözleşme Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "AYKIRILIK",
                "label": "Yerine Getirilmeyen Şartlar",
                "type": "textarea",
                "required": true
            },
            {
                "key": "EK_SURE",
                "label": "Verilen Ek Süre (Gün)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{IHTAR_EDEN}}\n**MUHATAP:** {{MUHATAP}}\n\n**KONU:** {{SOZLESME_TARIH}} tarihli sözleşmeye aykırılığın giderilerek ifanın tamamlanması adına TBK m.123 uyarınca mehil (süre) verilmesi ihtarıdır.\n\n---\n\nSayın Muhatap,\n\nŞirketimiz ile aranızda imzalanan **{{SOZLESME_TARIH}}** tarihli Ana Sözleşme kapsamında birtakım ticari taahhütler altına girildiği malumunuzdur.\n\nFakat gelinen süreçte tarafınızın sözleşmeden kaynaklı yükümlülüklerini kusurlu şekilde ihlal ettiği görülmektedir: \n**İhlal Konusu:** {{AYKIRILIK}}\n\nİşbu ihtarnamenin tarafınıza tebliğinden itibaren **{{EK_SURE}} ({{EK_SURE}}) GÜN** içerisinde, yukarıda açıklanan aykırılıkların sözleşme ruhuna ve taraf taahhütlerine uygun bir şekilde DERHAL GİDERİLMESİNİ, temerrüt olgusunun ortadan kaldırılmasını bekliyoruz.\n\nAksi takdirde, söz konusu ihlaller sürdükçe şirketimiz uğradığı ticari zararın tazmini ile birlikte doğrudan sözleşmeyi feshetme (dönme/fesih) haklarını ve cezai şartları tereddütsüz kullanacaktır. Gereğini önemle bilgilerinize sunarız.\n\n**İhtar Eden**\n{{IHTAR_EDEN}}",
        "isPremium": true,
        "usageCount": 855
    },
    {
        "id": "n10",
        "category": "İhtarnameler",
        "subcategory": "Gayrimenkul",
        "title": "Site Yönetimi Uyarı (KMK) İhtarnamesi",
        "description": "Ortak alan işgali, kaçak bina eklentisi veya aidat ihlali nedeniyle son ihtar",
        "icon": "Building2",
        "variables": [
            {
                "key": "YONETIM",
                "label": "Site Yöneticisi/Yönetim Kurulu",
                "type": "text",
                "required": true
            },
            {
                "key": "KAT_MALIKI",
                "label": "Muhatap (Kat Maliki veya Kiracı)",
                "type": "text",
                "required": true
            },
            {
                "key": "BLOK_DAIRE",
                "label": "Bağımsız Bölüm (Örn: A Blok D:12)",
                "type": "text",
                "required": true
            },
            {
                "key": "IHLAL",
                "label": "İhlal Edilen Kural (Ortak Alana Eşya Koyma vb.)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRILACAK_SURE",
                "label": "Düzeltme İçin Süre (Gün)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN SİTE:** {{YONETIM}}\n**MUHATAP MALİK/KİRACI:** {{KAT_MALIKI}} (Bölüm: {{BLOK_DAIRE}})\n\n**KONU:** Kat Mülkiyeti Kanunu ve Site Yönetim Planı hükümlerine açıkça aykırı hareketlerinizin durdurulması ihtarıdır.\n\n---\n\nSayın Kat Maliki/Kiracı,\n\nBulunduğunuz ve yaşamaya iştirak ettiğiniz apartmanımızda / sitemizde **{{IHLAL}}** şeklinde Yönetim Planı'na ve Komşuluk haklarına tamamen aykırı davrandığınız site ortak kullanım alanını gasp / işgal / ihlal ettiğiniz tespit edilmiştir.\n\n634 Sayılı Kat Mülkiyeti Kanunu'nun (Madde 18) \"Kat malikleri gerek bağımsız bölümlerini, gerek eklentileri ve ortak yerleri kullanırken doğruluk kaidelerine uymak, dürüstlükle ve bilhassa birbirini rahatsız etmemek ve birbirinin haklarına saygı göstermekle karşılıklı olarak yükümlüdürler\" şeklindeki amir hükmü karşısında eyleminiz tamamen haksızdır.\n\nİşbu ihtarnamenin tebliğinden itibaren en fazla **{{KALDIRILACAK_SURE}} gün** içinde, site yönetim planına aykırı **{{IHLAL}}** durumuna bizzat KENDİLİĞİNİZDEN son vermenizi, ihlali ve işgali ortadan kaldırmanızı bekliyoruz.\n\nBelirtilen yasal süre içerisinde bu eylemlere son vermemeniz halinde, yasal olarak müdahalenin men'i davası ikame edilip savcılığa suç duyurusunda bulunulacağını ve ilgili masrafların apartman aidat hanenize yansıtılacağını bilmenizi rica ve ihtar ederiz.\n\n**Site Yönetimi**\n{{YONETIM}}",
        "isPremium": false,
        "usageCount": 1100
    },
    {
        "id": "n11",
        "category": "İhtarnameler",
        "subcategory": "Ticaret - Tüketici",
        "title": "Banka Kredi Borcu Yapılandırma / İtiraz İhtarnamesi",
        "description": "Artan faize veya yapılandırma talebine dair bankaya ihtar",
        "icon": "Landmark",
        "variables": [
            {
                "key": "MUSTERI",
                "label": "İhtar Eden (Müşteri)",
                "type": "text",
                "required": true
            },
            {
                "key": "BANKA",
                "label": "Muhatap (Banka Şubesi)",
                "type": "text",
                "required": true
            },
            {
                "key": "KREDI_NO",
                "label": "Kredi Sözleşmesi No",
                "type": "text",
                "required": true
            },
            {
                "key": "KREDI_TURU",
                "label": "Kredi Türü (Konut/Tüketici)",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "İtiraz / Yapılandırma Nedeni (Örn: Faiz artışı hatası, İşsizlik)",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN MÜŞTERİ:** {{MUSTERI}}\n**MUHATAP BANKA:** {{BANKA}}\n\n**KONU:** {{KREDI_NO}} numaralı {{KREDI_TURU}} Sözleşmesinden doğan borcun ihtilafı ve yapılandırma / faiz iptali talebine ilişkindir.\n\n---\n\nSayın Muhatap Banka;\n\nŞubeniz nezdinde kullanmış olduğum **{{KREDI_NO}}** referans numaralı {{KREDI_TURU}} tahtında, tarafıma tahakkuk ettirilen faiz / ana para borcu veya gecikme temerrüt faizleri ile ilgili olarak tespit ettiğim hata ve uyuşmazlığa dair hususlar şöyledir:\n\n**{{ITIRAZ_NEDENI}}**\n\n6502 Sayılı Tüketicinin Korunması Kanunu ve Bankalar Birliği Müşteri Hakları Bildirgesi uyarınca; tarafıma haksız olarak yansıtılan ücretlerin veya hatalı işletilen faizin işbu ihtarnamenin tebliğinden itibaren EN GEÇ 5 (BEŞ) GÜN İÇİNDE düzeltilmesini, haksız kesilen meblağların tarafıma iadesini;\n\nDüzeltim yapılmaması Halinde, Tüketici Hakem Heyetleri ile BDDK'ya müracaat edileceğini, gerektiğinde yasal her türlü ceza ve dava haklarımın kullanılarak avukatlık ücretleri dahil masrafların bankanıza yansıtılacağını bilvekale/asaleten İHTAR VE TEBLİĞ EDERİM.\n\n**İhtar Eden**\n{{MUSTERI}}",
        "isPremium": true,
        "usageCount": 625
    },
    {
        "id": "n12",
        "category": "İhtarnameler",
        "subcategory": "İş Hukuku",
        "title": "İş Kazası Maddi / Manevi Tazminat İhtarnamesi",
        "description": "Meydana gelen iş kazası sebebiyle destekten yoksun kalma veya maluliyet zararı bildirimi",
        "icon": "Stethoscope",
        "variables": [
            {
                "key": "ISCI",
                "label": "İhtar Eden İşçi (veya Mirasçısı)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISVEREN",
                "label": "Muhatap İşveren",
                "type": "text",
                "required": true
            },
            {
                "key": "KAZA_TARIHI",
                "label": "İş Kazası Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OLAY_OZETI",
                "label": "Kazanın Özeti ve Kusur",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TALEP_EDILEN_TAZMINAT",
                "label": "Talep Edilen Tazminat Bedeli (Maddi/Manevi Toplam TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ISCI_IBAN",
                "label": "Banka IBAN No",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN:** {{ISCI}}\n**MUHATAP ŞİRKET/İŞVEREN:** {{ISVEREN}}\n\n**KONU:** İş Kazası nedeni ile maddi ve manevi tazminat ile 6098 s. TBK m. 49 ve 417 vd. hükümleri uyarınca rücuen/doğrudan zarar ödeme ihtarıdır.\n\n---\n\nSayın Muhatap;\n\nŞirketiniz bünyesinde ... Sicil No ile çalışmakta iken **{{KAZA_TARIHI}}** tarihinde, bütünüyle şantiyede/işletmedeki koruyucu donanım yetersizliğinden ve şirketinizin gerekli İSG (İş Sağlığı ve Güvenliği) önlemlerini almamasından kaynaklanan ihmali neticesinde kaza meydana gelmiştir.\n\n**Olay Özeti:** {{OLAY_OZETI}}\n\nOluşan bu iş kazası nedeniyle müvekkilin bedensel/meslekte kazanma gücü kaybı (maluliyet oranları) ve derin acı hissi telafi edilemez boyutlardadır. Borçlar Kanunu madde 417 ve 6331 sayılı İş Sağlığı Güvenliği Kanunu muvacehesinde kusursuz ve kusurlu sorumluluğunuz açıktır.\n\nİşbu tebligatın tarafınıza ulaşmasından itibaren **YASAL 7 (YEDİ) GÜN İÇİNDE**, fazlaya ilişkin her türlü SGK rücu, manevi ve maddi (destekten yoksun kalma / işgöremezlik vb) dava haklarımız SAKLI KALMAK KAYDIYLA; asgari zararımızı karşılayacak olan toplam **{{TALEP_EDILEN_TAZMINAT}} TL** maddi/manevi meblağın aşağıda belirtilen avukat / şahıs hesabıma RIZAEN ödenmesini bekliyoruz.\n\nAksi halde arabuluculuk kurumu ardından İş Mahkemesinde rücuen/tazminat davaları açılacak olup çıkacak bilirkişi hesapları eşliğinde mahkeme harç ve icra avukatlık ücretlerinin tarafınıza yükleneceğini İHTAR EDERİM.\n\n**IBAN Numarası:** {{ISCI_IBAN}}\n\n**İhtar Eden / Vekili**\n{{ISCI}}",
        "isPremium": true,
        "usageCount": 1400
    },
    {
        "id": "n13",
        "category": "İhtarnameler",
        "subcategory": "İş Hukuku",
        "title": "Mobbing (Psikolojik Taciz) Nedeniyle İhtar ve Fesih",
        "description": "Sistematik psikolojik baskı / mobbing yüzünden işçinin noterden ihtarı",
        "icon": "Frown",
        "variables": [
            {
                "key": "ISCI",
                "label": "İhtar Eden İşçi",
                "type": "text",
                "required": true
            },
            {
                "key": "ISVEREN",
                "label": "Muhatap Şirket/İşveren",
                "type": "text",
                "required": true
            },
            {
                "key": "MOBBING_DAVRANIS",
                "label": "Mobbing Konusu Davranışlar (Neler yaşandı?)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "FESIH_VAR_MI",
                "label": "Sözleşmeyi Fashedecek Misiniz? (Evet/Hayır)",
                "type": "text",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "Talep Edilen Tazminat ve Alacaklar (TL/Açıklama)",
                "type": "text",
                "required": true
            },
            {
                "key": "IBAN",
                "label": "IBAN No",
                "type": "text",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN İŞÇİ:** {{ISCI}}\n**MUHATAP İŞVEREN:** {{ISVEREN}}\n\n**KONU:** İşyerinde tarafıma uygulanan sistematik mobbing, baskı ve eşit işlem borcuna aykırılık teşkil eden kötüniyetli hareketler nedeniyle yasal ihtarda bulunulması ve/veya Haklı Nedenle Derhal Fesih irademin (**{{FESIH_VAR_MI}}**) sunulmasıdır.\n\n---\n\nSayın Muhatap;\n\nŞirketiniz bordrolu personeli olarak uzun süredir şirketinize katkı sağlamaktayım. Lakin son aylarda/yıllarda doğrudan amirlerim yahut şirket ortaklarınca sistematik şekilde yıpratılmaktayım.\n\nAmacınız beni istifaya zorlamak suretiyle kıdem ve ihbar ödemelerimden kurtulmaktır. Bu durumu şu olaylardan gözlemlemek mümkündür:\n**{{MOBBING_DAVRANIS}}**\n\nMeydana gelen süreç, Yargıtay 9. Hukuk Dairesinin şaşmaz kararlarında da tespit edildiği üzere AÇIK BİR MOBBİNG (Psikolojik Taciz) fiilidir. Anayasa'nın angarya yasağına ve eşit davranma ilkesine (İş Kanunu m.5) katı suretle aykırıdır.\n\nİşbu ihtarnamenin tarafınıza tebliğinden itibaren ilgili hukuksuz hareketlere son verilmesini talep ediyor ve şayet sözleşmeyi fashetmişsem; çalışma hayatıma bu şartlarda devam etmem mümkün olmadığından **iş sözleşmemi İş Kanunu M:24/II (Ahlak ve İyiniyet) bentlerine dayanarak DERHAL VE HAKLI SONLANDIRIYORUM.**\n\nTüm İşçi Kıdem ve İhbar Tazminatlarım (Cezasız, eşitliğe aykırı indirim yapılmaksızın) , manevi baskı nedeni ile doğan manevi tazminat ve boşta geçen / asgari geçim borçlarınız bedeli olan {{KIDEM_TAZMINATI}} TL tutarın tarafıma **3 (üç)** gün içinde defaten ödenmesini;\nBelirtilen İban numarasına ödenmemesi halinde haklı yasal süre dolmadan arabulucu vasıtasıyla adliyeye ve İş Mahkemesine intikal ettirileceğini ihtar ederim.\n\n**IBAN Numarası:** {{IBAN}}\n\n**İhtar Eden İşçi:**\n{{ISCI}}\n",
        "isPremium": true,
        "usageCount": 1150
    },
    {
        "id": "n14",
        "category": "İhtarnameler",
        "subcategory": "Ticaret - Fikri Mülkiyet",
        "title": "Marka/Patent Hakkına Tecavüzün Durdurulması İhtarı",
        "description": "Taklit marka/ürün kullanımı, isim benzerliği veya tasarım hırsızlığına karşı noter ihtarı",
        "icon": "ShieldAlert",
        "variables": [
            {
                "key": "HAK_SAHIBI",
                "label": "Hak Sahibi (İhtar Eden)",
                "type": "text",
                "required": true
            },
            {
                "key": "HAK_SAHIBI_TC",
                "label": "Hak Sahibi VKN/TC",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP",
                "label": "Muhatap/İhlal Eden Kişi veya Kurum",
                "type": "text",
                "required": true
            },
            {
                "key": "MARKA_ADI",
                "label": "Tescilli Marka/Tasarım/Patent Adı ve Nosu",
                "type": "text",
                "required": true
            },
            {
                "key": "TECAVUZ_NEDENI",
                "label": "İhlalin şekli (E-ticaret ilanı, Taklit site, Aynı tabela vs)",
                "type": "textarea",
                "required": true
            },
            {
                "key": "EK_SURE",
                "label": "Sökme/Kaldırma Süresi (Örn: 3 gün)",
                "type": "number",
                "required": true
            }
        ],
        "content": "## İHTARNAME (Cease and Desist / Dur ve Bırak)\n\n**İHTAR EDEN HAK SAHİBİ:** {{HAK_SAHIBI}} (VKN/TC: {{HAK_SAHIBI_TC}})\n**MUHATAP:** {{MUHATAP}}\n\n**KONU:** Tarafımıza ait SMK (Sınai Mülkiyet Kanunu) m.7 uyarınca tescilli sınai haklarımıza tecavüzün durdurulması, haksız rekabetin önlenmesi ile ilan, marka ve tabelalarınızın kaldırılması ihtarıdır.\n\n---\n\nSayın Muhatap;\n\nTürk Patent ve Marka Kurumu nezdinde **{{MARKA_ADI}}** tescil numarası/ismi ile şirketimiz mülkiyetine ait olan alametiferika/marka haklarımız mevcuttur.\n\nTarafınızca yetkisiz ve haksız bir surette; \n**{{TECAVUZ_NEDENI}}**\nşekilde bir marka veya tasarım kullanımı yaparak tüketiciler nezdinde irtibat/karışıklık (iltibas) yarattığınız ve Şirketimizin fikri mülkiyet ve şöhretinden izinsiz ve bedelsiz olarak faydalandığınız görülmüş, delillendirilmiştir.\n\n6769 Sayılı Sınai Mülkiyet Kanunu 29. Maddeleri uyarınca bu eyleminiz açık ve net bir MARKA/PATENT HAKKINA TECAVÜZ ve HAKSIZ REKABET suçudur. Hapis ve Adli para cezaları mevcuttur.\n\nİşbu tebligatı aldığınız tarihten itibaren en geç **{{EK_SURE}} ({{EK_SURE}}) gün içinde**: Tescilli markamıza benzeyen yahut bizzat kendisi olan her tür logo, amblem, ilan, e-ticaret satışı, afiş ve tabelayı SÖKMENİZİ / KALDIRMANIZI, alan adlarınızı (varsa) devretmenizi ve izinsiz kullanıma derhal dur demenizi (Cease and Desist);\n\nAksi halde, arabuluculuk yoluyla dahi uzlaşmaya gidilmeden hakkınızda Sınai Mülkiyet Mahkemelerinde/Ticaret Mahkemelerinde doğrudan ihtiyati tedbir (kapatma/toplatma) talepli Maddi ve manevi (Yoksun kalınan Kazanç / İtibar zedelenmesi) tazminat davaları açılacağını ve Cumhuriyet Başsavcılığına SMK 30 uyarınca ceza şikayetinde bulunacağımızı İHTAREN BİLDİRİRİZ.\n\n**Hak Sahibi**\n{{HAK_SAHIBI}}",
        "isPremium": true,
        "usageCount": 420
    },
    {
        "id": "n15",
        "category": "İhtarnameler",
        "subcategory": "Ticaret - Ortaklık",
        "title": "Adi Ortaklık Fesih İhtarnamesi",
        "description": "Ortaklar arası anlaşmazlık durumunda adi veya ticari şirketin feshi/ortaklıktan çıkma",
        "icon": "LogOut",
        "variables": [
            {
                "key": "GONDEREN_ORTAK",
                "label": "İhtar Eden Ortak",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP_ORTAK",
                "label": "Muhatap (Kalan Ortaklar/Şirket)",
                "type": "text",
                "required": true
            },
            {
                "key": "ORTAKLIK_KONUSU",
                "label": "Ortaklık Konusu (Market İşletmesi vs)",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_SEBEBI",
                "label": "Ortaklığın Haklı Nedenle Fesih Sebebi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "TALEP",
                "label": "Tasfiye, Kâr Payı veya Devir Talebi (TL)",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## İHTARNAME\n\n**İHTAR EDEN ORTAK:** {{GONDEREN_ORTAK}}\n**MUHATAP ORTAK(LAR):** {{MUHATAP_ORTAK}}\n\n**KONU:** Aramızdaki {{ORTAKLIK_KONUSU}} konulu Adi Ortaklığın TBK 639. vd maddeleri uyarınca ve Haklı Neden (veya bildirimli fesih süresi gözetilerek) feshi ihtarına ilişkindir.\n\n---\n\nSayın Muhata(P) / Ortak(lar),\n\nBirlikte kurmuş olduğumuz ve şifahi/yazılı anlaşma ile süregelen {{ORTAKLIK_KONUSU}} ortaklığımızda gelinen son aşamada, karşılıklı güven zedelenmiş ve taraflar üzerine düşen sermaye/emek mükellefiyetlerini yerine getiremez hale gelmiştir.\n\nBunun neticesinde tarafımca şu tespitler yapılmış olup, ortaklığın sürdürülebilirliği ortadan kalkmıştır:\n**Haklı Neden Fesih Sebepleri:** {{FESIH_SEBEBI}}\n\nYukarıda açıkladığım haklı nedenlere istinaden ve Türk Borçlar Kanunu Madde 639 (ve ticari sözleşmeyse bağlı hükümler) çerçevesinde; müşterek işletmemizin / ortaklığımızın tek taraflı olarak **BUGÜN İTİBARI İLE FESHEDİLDİĞİNİ (SONLANDIRILDIĞINI)** bildiriyorum.\n\nSiz muhataplara, işbu tebliğden ihtibaren şirket hisse, hesap, kar ve defterlerinin bilançolarının 7 GÜN içerisinde çıkarımını beklediğimi;\nTasfiye süreci sonucunda tarafıma düşecek olan veya hesaplanan şirket / ticarethane özkaynaklarındaki payımın ({{TALEP}}) tarafıma derhal ödenmesi ile şahsımın işletmeden çıkarılmasını, aksi takdirde Asliye Ticaret (veya Sulh/Asliye Hukuk) mahkemelerinde şerefiye/kar payı/mal varlığı tasfiyesi ve Ortaklık Giderilmesi/Fesih davası ikame edilerek avukatlık masraflarının size yükleneceğini ihtaren beyan ederim.\n\n**İhtar Eden Ortak**\n{{GONDEREN_ORTAK}}",
        "isPremium": false,
        "usageCount": 780
    }
];
