import React, { useEffect, useMemo, useState } from 'react';
import {
    Calculator,
    Printer,
    Copy,
    Info,
    Check,
    RefreshCw,
    AlertTriangle,
    Landmark,
    Scale,
    Binoculars,
    Users,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
    HARCLAR_2026,
    AVUKATLIK_UCRET_2026,
    shouldCheckForUpdates,
    type HarcTarifeleri,
    type AvukatlikUcretTarifeleri,
    type MahkemeTipi,
} from '../config/feeTariffs';

type DavaTuru =
    | 'nispi_alacak'
    | 'bosanma_maktu'
    | 'iscilik_alacagi'
    | 'tuketici'
    | 'menfi_tespit'
    | 'kira_tahliye'
    | 'kira_tespit'
    | 'ticari_alacak'
    | 'tazminat_maddi_manevi'
    | 'nafaka'
    | 'ortakligin_giderilmesi'
    | 'kamulastirma_bedel'
    | 'itirazin_iptali'
    | 'istirdat'
    | 'tapu_iptal_tescil'
    | 'ecrimisil'
    | 'velayet'
    | 'mal_rejimi'
    | 'miras_taksim'
    | 'ise_iade'
    | 'hizmet_tespiti'
    | 'delil_tespiti'
    | 'ihtiyati_haciz'
    | 'icra_takibi'
    | 'ceza_katilan'
    | 'idari_iptal'
    | 'vergi_davasi'
    | 'istinaf_basvurusu'
    | 'temyiz_basvurusu'
    | 'anayasa_bireysel_basvuru';

type HarcModu = 'nispi' | 'maktu' | 'icra' | 'sadece_basvuru';

interface DavaTuruConfig {
    label: string;
    aciklama: string;
    requiresValue: boolean;
    harcModu: HarcModu;
    defaultMahkeme: MahkemeTipi;
}

interface HesapKalemi {
    label: string;
    tutar: number;
    aciklama?: string;
    grup: 'harc' | 'gider' | 'vekalet';
}

const MAHKEME_OPTIONS: Array<{ value: MahkemeTipi; label: string; grup: string }> = [
    { value: 'sulh_hukuk', label: 'Sulh Hukuk', grup: 'Adli Yargi' },
    { value: 'asliye_hukuk', label: 'Asliye Hukuk', grup: 'Adli Yargi' },
    { value: 'aile', label: 'Aile Mahkemesi', grup: 'Adli Yargi' },
    { value: 'is', label: 'Is Mahkemesi', grup: 'Adli Yargi' },
    { value: 'tuketici', label: 'Tuketici Mahkemesi', grup: 'Adli Yargi' },
    { value: 'asliye_ticaret', label: 'Asliye Ticaret', grup: 'Adli Yargi' },
    { value: 'icra_hukuk', label: 'Icra Hukuk', grup: 'Adli Yargi' },
    { value: 'asliye_ceza', label: 'Asliye Ceza', grup: 'Adli Yargi' },
    { value: 'agir_ceza', label: 'Agir Ceza', grup: 'Adli Yargi' },
    { value: 'idare', label: 'Idare Mahkemesi', grup: 'Idari Yargi' },
    { value: 'vergi', label: 'Vergi Mahkemesi', grup: 'Idari Yargi' },
    { value: 'bolge_adliye', label: 'Bolge Adliye/Bolge Idare', grup: 'Kanun Yolu' },
    { value: 'yargitay_danistay', label: 'Yargitay/Danistay', grup: 'Kanun Yolu' },
    { value: 'anayasa', label: 'Anayasa Mahkemesi', grup: 'Ozel' },
];

const DAVA_TURU_CONFIG: Record<DavaTuru, DavaTuruConfig> = {
    nispi_alacak: {
        label: 'Alacak Davasi (Nispi)',
        aciklama: 'Nispi karar-ilam harci uygular.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    bosanma_maktu: {
        label: 'Bosanma Davasi (Maktu)',
        aciklama: 'Maktu karar harci esas alinir.',
        requiresValue: false,
        harcModu: 'maktu',
        defaultMahkeme: 'aile',
    },
    iscilik_alacagi: {
        label: 'Iscilik Alacagi',
        aciklama: 'Nispi harc ve pesin harc hesaplanir.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'is',
    },
    tuketici: {
        label: 'Tuketici Davasi',
        aciklama: 'Nispi harc + tuketici mahkemesi asgari vekalet.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'tuketici',
    },
    menfi_tespit: {
        label: 'Menfi Tespit Davasi',
        aciklama: 'Nispi harc; borclu olmadiginin tespiti.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    kira_tahliye: {
        label: 'Kira Alacagi / Tahliye',
        aciklama: 'Kira alacagi boyutu icin nispi harc mantigi.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'sulh_hukuk',
    },
    kira_tespit: {
        label: 'Kira Tespit Davasi',
        aciklama: 'Kira tespit taleplerinde nispi/maktu karmasi yerine deger odakli nispi hesap.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'sulh_hukuk',
    },
    ticari_alacak: {
        label: 'Ticari Alacak Davasi',
        aciklama: 'Asliye ticarette nispi harc odagi.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_ticaret',
    },
    tazminat_maddi_manevi: {
        label: 'Maddi / Manevi Tazminat',
        aciklama: 'Talep tutarina gore nispi harc.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    nafaka: {
        label: 'Nafaka Davasi',
        aciklama: 'Aile mahkemesinde maktu agirlikli hesap.',
        requiresValue: false,
        harcModu: 'maktu',
        defaultMahkeme: 'aile',
    },
    ortakligin_giderilmesi: {
        label: 'Ortakligin Giderilmesi',
        aciklama: 'Tasfiye/bedel esasli dosyalarda nispi harc.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'sulh_hukuk',
    },
    kamulastirma_bedel: {
        label: 'Kamulastirma Bedel Artirimi',
        aciklama: 'Bedel farki talebine gore nispi harc.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    itirazin_iptali: {
        label: 'Itirazin Iptali Davasi',
        aciklama: 'Takibe itirazin iptali taleplerinde nispi harc odagi.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    istirdat: {
        label: 'Istirdat Davasi',
        aciklama: 'Icra dosyasi sonrasi iade taleplerinde nispi harc.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    tapu_iptal_tescil: {
        label: 'Tapu Iptal ve Tescil',
        aciklama: 'Tasininmaz degeri uzerinden nispi harc yaklasimi.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    ecrimisil: {
        label: 'Ecrimisil Davasi',
        aciklama: 'Talep bedeli uzerinden nispi harc hesaplanir.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'asliye_hukuk',
    },
    velayet: {
        label: 'Velayet Davasi',
        aciklama: 'Aile mahkemesinde maktu kalem agirlikli dosya.',
        requiresValue: false,
        harcModu: 'maktu',
        defaultMahkeme: 'aile',
    },
    mal_rejimi: {
        label: 'Mal Rejimi Tasfiye',
        aciklama: 'Katilma/alacak taleplerinde deger bazlı nispi harc.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'aile',
    },
    miras_taksim: {
        label: 'Miras Taksim / Ortaklik',
        aciklama: 'Miras paylasimi degerine gore nispi harc odagi.',
        requiresValue: true,
        harcModu: 'nispi',
        defaultMahkeme: 'sulh_hukuk',
    },
    ise_iade: {
        label: 'Ise Iade Davasi',
        aciklama: 'Is mahkemesinde maktu basvuru ve gider odagi.',
        requiresValue: false,
        harcModu: 'maktu',
        defaultMahkeme: 'is',
    },
    hizmet_tespiti: {
        label: 'Hizmet Tespiti Davasi',
        aciklama: 'Is mahkemesinde maktu harc odagi.',
        requiresValue: false,
        harcModu: 'maktu',
        defaultMahkeme: 'is',
    },
    delil_tespiti: {
        label: 'Delil Tespiti',
        aciklama: 'Dava once/icine delil tespiti icin basvurma ve gider kalemleri.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'sulh_hukuk',
    },
    ihtiyati_haciz: {
        label: 'Ihtiyati Haciz Talebi',
        aciklama: 'Talep asamasinda basvurma + gider odakli hesap.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'asliye_ticaret',
    },
    icra_takibi: {
        label: 'Icra Takibi',
        aciklama: 'Icra pesin harci ve tahsil harci senaryolari.',
        requiresValue: true,
        harcModu: 'icra',
        defaultMahkeme: 'icra_hukuk',
    },
    ceza_katilan: {
        label: 'Ceza (Katilan/Sikayetci Vekili)',
        aciklama: 'Basvurma + ceza yargisi vekalet odagi.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'agir_ceza',
    },
    idari_iptal: {
        label: 'Idari Iptal/Tam Yargi',
        aciklama: 'Basvurma + idari yargi vekalet odagi.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'idare',
    },
    vergi_davasi: {
        label: 'Vergi Davasi',
        aciklama: 'Vergi mahkemesi basvurma + gider odagi.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'vergi',
    },
    istinaf_basvurusu: {
        label: 'Istinaf Basvurusu',
        aciklama: 'Bolge adliye/bolge idare basvurma harci odagi.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'bolge_adliye',
    },
    temyiz_basvurusu: {
        label: 'Temyiz Basvurusu',
        aciklama: 'Yargitay/Danistay basvurma harci odagi.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'yargitay_danistay',
    },
    anayasa_bireysel_basvuru: {
        label: 'Anayasa Bireysel Basvuru',
        aciklama: 'AYM basvurma harci + gider kalemlerini baz alir.',
        requiresValue: false,
        harcModu: 'sadece_basvuru',
        defaultMahkeme: 'anayasa',
    },
};

const MAHKEME_DAVA_TURU_MAP: Record<MahkemeTipi, DavaTuru[]> = {
    sulh_hukuk: ['kira_tahliye', 'kira_tespit', 'ortakligin_giderilmesi', 'miras_taksim', 'delil_tespiti'],
    asliye_hukuk: ['nispi_alacak', 'menfi_tespit', 'tazminat_maddi_manevi', 'kamulastirma_bedel', 'itirazin_iptali', 'istirdat', 'tapu_iptal_tescil', 'ecrimisil'],
    aile: ['bosanma_maktu', 'nafaka', 'velayet', 'mal_rejimi'],
    is: ['iscilik_alacagi', 'ise_iade', 'hizmet_tespiti'],
    tuketici: ['tuketici'],
    asliye_ticaret: ['ticari_alacak', 'ihtiyati_haciz', 'menfi_tespit', 'itirazin_iptali'],
    icra_hukuk: ['icra_takibi'],
    idare: ['idari_iptal'],
    vergi: ['vergi_davasi'],
    asliye_ceza: ['ceza_katilan'],
    agir_ceza: ['ceza_katilan'],
    bolge_adliye: ['istinaf_basvurusu'],
    yargitay_danistay: ['temyiz_basvurusu'],
    anayasa: ['anayasa_bireysel_basvuru'],
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toMoney = (value: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
};

const toCount = (value: string): number => {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
};

const sanitizeCountInput = (value: string, max = 99): string =>
    String(Math.min(toCount(value), max));

const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2,
    }).format(value);

const getVekaletAsgari = (
    davaTuru: DavaTuru,
    avukatlik: AvukatlikUcretTarifeleri,
    mahkemeTipi: MahkemeTipi
): number => {
    if (davaTuru === 'kira_tahliye') return avukatlik.icraTahliye;
    if (davaTuru === 'icra_takibi') return avukatlik.icraTakibi;
    if (davaTuru === 'tuketici') return avukatlik.tuketiciMahkemesi;
    if (davaTuru === 'ceza_katilan' || mahkemeTipi === 'agir_ceza') return avukatlik.agirCeza;
    if (davaTuru === 'anayasa_bireysel_basvuru' || mahkemeTipi === 'anayasa') return avukatlik.idareMahkemesi;
    if (davaTuru === 'idari_iptal' || mahkemeTipi === 'idare' || mahkemeTipi === 'vergi') return avukatlik.idareMahkemesi;
    if (mahkemeTipi === 'sulh_hukuk') return avukatlik.sulhHukuk;
    return avukatlik.asliyeMahkeme;
};

const buildIcraTahsilKalemleri = (deger: number, harclar: HarcTarifeleri): HesapKalemi[] => {
    if (deger <= 0) return [];
    return [
        {
            label: 'Tahsil Harci Senaryo A (Hacizden Once)',
            tutar: round2(deger * harclar.icraTahsilHarci.hacizdenOnce),
            aciklama: '%4.55',
            grup: 'harc',
        },
        {
            label: 'Tahsil Harci Senaryo B (Hacizden Sonra)',
            tutar: round2(deger * harclar.icraTahsilHarci.hacizdenSonra),
            aciklama: '%9.10',
            grup: 'harc',
        },
        {
            label: 'Tahsil Harci Senaryo C (Satis Sonrasi)',
            tutar: round2(deger * harclar.icraTahsilHarci.satisSonrasi),
            aciklama: '%11.38',
            grup: 'harc',
        },
    ];
};

export const FeeCalculator: React.FC = () => {
    const harclar = HARCLAR_2026;
    const avukatlikUcret = AVUKATLIK_UCRET_2026;

    const [davaTuru, setDavaTuru] = useState<DavaTuru>('nispi_alacak');
    const [mahkemeTipi, setMahkemeTipi] = useState<MahkemeTipi>('asliye_hukuk');
    const [davaDegeri, setDavaDegeri] = useState('');
    const [bilirkisiAdedi, setBilirkisiAdedi] = useState('1');
    const [kesifAdedi, setKesifAdedi] = useState('0');
    const [kesifBirimTutari, setKesifBirimTutari] = useState(String(harclar.kesifHarci));
    const [tanikAdedi, setTanikAdedi] = useState('0');
    const [ekTebligatAdedi, setEkTebligatAdedi] = useState('0');
    const [ekTebligatBirimTutari, setEkTebligatBirimTutari] = useState('106');
    const [copied, setCopied] = useState(false);
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [lastChecked, setLastChecked] = useState<string | null>(
        localStorage.getItem('tariffLastChecked')
    );
    const [updateAvailable, setUpdateAvailable] = useState(false);

    const davaTurleriForMahkeme = useMemo(
        () => MAHKEME_DAVA_TURU_MAP[mahkemeTipi] || [],
        [mahkemeTipi]
    );

    useEffect(() => {
        if (davaTurleriForMahkeme.length === 0) return;
        if (!davaTurleriForMahkeme.includes(davaTuru)) {
            setDavaTuru(davaTurleriForMahkeme[0]);
        }
    }, [davaTuru, davaTurleriForMahkeme]);

    const aktifDavaConfig = DAVA_TURU_CONFIG[davaTuru];

    useEffect(() => {
        if (!shouldCheckForUpdates(lastChecked)) return;
        toast('Tarife guncelleme kontrolu onerilir.');
    }, [lastChecked]);

    const checkForUpdates = async () => {
        setIsCheckingUpdate(true);
        try {
            const response = await fetch('/api/gemini/web-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '2026 yargı harçları bilirkişi asgari ücret gider avansı tanıklık ücreti resmi gazete',
                    maxResults: 5
                })
            });

            if (response.ok) {
                const data = await response.json();
                const now = new Date().toISOString();
                setLastChecked(now);
                localStorage.setItem('tariffLastChecked', now);

                const responseText = JSON.stringify(data).toLowerCase();
                const hasNewInfo = responseText.includes('2027') || responseText.includes('guncellendi');
                setUpdateAvailable(hasNewInfo);

                if (hasNewInfo) {
                    toast('Yeni tarife bilgisi olabilir. Kontrol edin.', { icon: '!' });
                } else {
                    toast.success('Tarife verileri guncel gorunuyor.');
                }
            } else {
                toast.error('Guncelleme kontrolu yanit vermedi.');
            }
        } catch (error) {
            console.error('Tariff update check failed:', error);
            toast.error('Guncelleme kontrolu basarisiz.');
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const hesaplama = useMemo(() => {
        const deger = toMoney(davaDegeri);
        const bilirkisiCount = toCount(bilirkisiAdedi);
        const kesifCount = toCount(kesifAdedi);
        const tanikCount = toCount(tanikAdedi);
        const tebligatCount = toCount(ekTebligatAdedi);

        const kesifBirim = toMoney(kesifBirimTutari);
        const tebligatBirim = toMoney(ekTebligatBirimTutari);

        const kalemler: HesapKalemi[] = [];
        const tahsilSenaryolari: HesapKalemi[] = [];

        const basvurmaHarci = harclar.mahkemeBazliBasvurmaHarci[mahkemeTipi] || harclar.basvurmaHarci.asliyeHukuk;
        kalemler.push({
            label: 'Basvurma Harci',
            tutar: basvurmaHarci,
            aciklama: `${MAHKEME_OPTIONS.find(m => m.value === mahkemeTipi)?.label || 'Mahkeme'} maktu basvurma harci`,
            grup: 'harc',
        });

        if (aktifDavaConfig.harcModu === 'nispi') {
            const nispiToplam = Math.max(deger * harclar.nispiHarc.kararIlam, harclar.nispiHarc.asgaritutar);
            kalemler.push({
                label: 'Nispi Karar-Ilam Harci (Toplam)',
                tutar: round2(nispiToplam),
                aciklama: `Oran: binde ${(harclar.nispiHarc.kararIlam * 1000).toFixed(2)}`,
                grup: 'harc',
            });
            kalemler.push({
                label: 'Pesin Harc (Dava Acilisinda)',
                tutar: round2(nispiToplam * harclar.nispiHarc.pesinOran),
                aciklama: `Nispi harcin %${(harclar.nispiHarc.pesinOran * 100).toFixed(0)}'i`,
                grup: 'harc',
            });
        }

        if (aktifDavaConfig.harcModu === 'maktu') {
            kalemler.push({
                label: 'Maktu Karar Harci',
                tutar: harclar.nispiHarc.asgaritutar,
                aciklama: 'Maktu dosya turleri icin asgari karar harci',
                grup: 'harc',
            });
        }

        if (aktifDavaConfig.harcModu === 'icra') {
            const pesinIcraHarci = round2(deger * harclar.icraPesinHarc);
            kalemler.push({
                label: 'Icra Pesin Harci',
                tutar: pesinIcraHarci,
                aciklama: `Oran: binde ${(harclar.icraPesinHarc * 1000).toFixed(2)}`,
                grup: 'harc',
            });
            kalemler.push({
                label: 'Cezaevi Harci',
                tutar: round2(deger * harclar.cezaeviHarci),
                aciklama: `Oran: %${(harclar.cezaeviHarci * 100).toFixed(2)}`,
                grup: 'harc',
            });
            tahsilSenaryolari.push(...buildIcraTahsilKalemleri(deger, harclar));
        }

        kalemler.push({
            label: 'HMK Dosya Gider Avansi',
            tutar: harclar.hukukGiderAvansi,
            aciklama: 'Hukuk mahkemeleri 2026 temel dosya avansi',
            grup: 'gider',
        });

        if (tebligatCount > 0 && tebligatBirim > 0) {
            kalemler.push({
                label: 'Ek Tebligat Gideri',
                tutar: round2(tebligatCount * tebligatBirim),
                aciklama: `${tebligatCount} adet x ${formatCurrency(tebligatBirim)}`,
                grup: 'gider',
            });
        }

        const bilirkisiBirim = harclar.mahkemeBazliBilirkisiUcreti[mahkemeTipi] || 0;
        if (bilirkisiCount > 0 && bilirkisiBirim > 0) {
            kalemler.push({
                label: 'Bilirkişi Ücreti',
                tutar: round2(bilirkisiCount * bilirkisiBirim),
                aciklama: `${bilirkisiCount} adet x ${formatCurrency(bilirkisiBirim)} (mahkeme bazlı)`,
                grup: 'gider',
            });
        }

        if (kesifCount > 0 && kesifBirim > 0) {
            kalemler.push({
                label: 'Kesif Gideri',
                tutar: round2(kesifCount * kesifBirim),
                aciklama: `${kesifCount} adet x ${formatCurrency(kesifBirim)}`,
                grup: 'gider',
            });
        }

        const tanikAltToplam = round2(tanikCount * harclar.tanikUcretAraligi.min);
        const tanikUstToplam = round2(tanikCount * harclar.tanikUcretAraligi.max);

        const vekaletAsgari = getVekaletAsgari(davaTuru, avukatlikUcret, mahkemeTipi);
        kalemler.push({
            label: 'Vekalet Harci',
            tutar: harclar.vekaletHarci,
            grup: 'vekalet',
        });
        kalemler.push({
            label: 'Vekalet Pulu',
            tutar: harclar.vekaletPulu,
            grup: 'vekalet',
        });
        kalemler.push({
            label: 'Avukatlik Asgari Ucreti',
            tutar: vekaletAsgari,
            aciklama: 'AAUT referans minimumu',
            grup: 'vekalet',
        });

        const araToplam = round2(kalemler.reduce((sum, item) => sum + item.tutar, 0));
        const toplamAlt = round2(araToplam + tanikAltToplam);
        const toplamUst = round2(araToplam + tanikUstToplam);

        return {
            deger,
            kalemler,
            tahsilSenaryolari,
            tanikCount,
            tanikAltToplam,
            tanikUstToplam,
            toplamAlt,
            toplamUst,
        };
    }, [
        davaDegeri,
        bilirkisiAdedi,
        kesifAdedi,
        kesifBirimTutari,
        tanikAdedi,
        ekTebligatAdedi,
        ekTebligatBirimTutari,
        harclar,
        avukatlikUcret,
        mahkemeTipi,
        aktifDavaConfig.harcModu,
        davaTuru,
    ]);

    const requiresValueWarning = aktifDavaConfig.requiresValue && hesaplama.deger <= 0;
    const tanikPreviewCount = toCount(tanikAdedi);
    const tanikPreviewAlt = round2(tanikPreviewCount * harclar.tanikUcretAraligi.min);
    const tanikPreviewUst = round2(tanikPreviewCount * harclar.tanikUcretAraligi.max);

    const handleCopy = () => {
        const lines = [
            `Dava Turu: ${aktifDavaConfig.label}`,
            `Mahkeme: ${MAHKEME_OPTIONS.find(m => m.value === mahkemeTipi)?.label || '-'}`,
            '',
            ...hesaplama.kalemler.map(item => `${item.label}: ${formatCurrency(item.tutar)}`),
        ];

        if (hesaplama.tanikCount > 0) {
            lines.push(`Tanik Sayisi: ${hesaplama.tanikCount}`);
            lines.push(`Tanik Ucreti (Alt): ${formatCurrency(hesaplama.tanikAltToplam)}`);
            lines.push(`Tanik Ucreti (Ust): ${formatCurrency(hesaplama.tanikUstToplam)}`);
        }

        if (hesaplama.tahsilSenaryolari.length > 0) {
            lines.push('');
            lines.push('Icra Tahsil Harci Senaryolari:');
            lines.push(...hesaplama.tahsilSenaryolari.map(item => `${item.label}: ${formatCurrency(item.tutar)}`));
        }

        lines.push('');
        lines.push(`Toplam (Alt): ${formatCurrency(hesaplama.toplamAlt)}`);
        lines.push(`Toplam (Ust): ${formatCurrency(hesaplama.toplamUst)}`);

        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        toast.success('Hesaplama panoya kopyalandi.');
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-gray-900 via-[#101318] to-gray-900 p-5 sm:p-6 shadow-[0_24px_60px_-28px_rgba(220,38,38,0.55)]">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                        <Calculator className="h-6 w-6 text-red-400" />
                        Harc - Gider Hesap Merkezi (2026)
                    </h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Mahkeme, dava tipi, bilirkişi, keşif ve tanık kalemlerini birlikte hesaplar.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {updateAvailable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Tarife guncellemesi olabilir
                        </span>
                    )}
                    <button
                        onClick={checkForUpdates}
                        disabled={isCheckingUpdate}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        {isCheckingUpdate ? 'Kontrol...' : 'Guncelleme Kontrol'}
                    </button>
                </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Dava / Islem Turu
                    </label>
                    <select
                        value={davaTuru}
                        onChange={(event) => setDavaTuru(event.target.value as DavaTuru)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
                    >
                        {davaTurleriForMahkeme.map((value) => (
                            <option key={value} value={value}>{DAVA_TURU_CONFIG[value].label}</option>
                        ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-500">{aktifDavaConfig.aciklama}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Mahkeme
                    </label>
                    <select
                        value={mahkemeTipi}
                        onChange={(event) => setMahkemeTipi(event.target.value as MahkemeTipi)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
                    >
                        {MAHKEME_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{`${option.label} (${option.grup})`}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-1 block text-xs text-gray-400">Dava Degeri (TL)</label>
                    <input
                        type="number"
                        value={davaDegeri}
                        onChange={(event) => setDavaDegeri(event.target.value)}
                        placeholder="Orn: 250000"
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-1 block text-xs text-gray-400">Bilirkişi Adedi</label>
                    <input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={bilirkisiAdedi}
                        onChange={(event) => setBilirkisiAdedi(sanitizeCountInput(event.target.value, 10))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-1 block text-xs text-gray-400">Kesif Adedi</label>
                    <input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={kesifAdedi}
                        onChange={(event) => setKesifAdedi(sanitizeCountInput(event.target.value, 10))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                    <label className="mt-2 block text-[11px] text-gray-500">Kesif birim tutari</label>
                    <input
                        type="number"
                        min={0}
                        value={kesifBirimTutari}
                        onChange={(event) => setKesifBirimTutari(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-1 block text-xs text-gray-400">Tanik Adedi</label>
                    <input
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        value={tanikAdedi}
                        onChange={(event) => setTanikAdedi(sanitizeCountInput(event.target.value, 30))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                    {tanikPreviewCount > 0 ? (
                        <p className="mt-2 text-xs text-indigo-300">
                            Tanik etkisi: {tanikPreviewCount} adet icin {formatCurrency(tanikPreviewAlt)} - {formatCurrency(tanikPreviewUst)}
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-gray-500">Tanik gideri hesaba dahil etmek icin adet girin.</p>
                    )}
                    <label className="mt-2 block text-[11px] text-gray-500">Ek tebligat adedi / birim</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            min={0}
                            max={200}
                            step={1}
                            value={ekTebligatAdedi}
                            onChange={(event) => setEkTebligatAdedi(sanitizeCountInput(event.target.value, 200))}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                        <input
                            type="number"
                            min={0}
                            value={ekTebligatBirimTutari}
                            onChange={(event) => setEkTebligatBirimTutari(event.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {requiresValueWarning && (
                <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                    Bu dava turu icin dava/takip degeri zorunludur. Sifir degerde nispi harc asgari tutardan hesaplanir.
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300">
                        <Scale className="h-4 w-4 text-red-400" />
                        Harc ve Vekalet Kalemleri
                    </h3>
                    <div className="space-y-2">
                        {hesaplama.kalemler.filter(item => item.grup !== 'gider').map((item, index) => (
                            <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
                                <div>
                                    <p className="text-sm text-gray-200">{item.label}</p>
                                    {item.aciklama && <p className="text-xs text-gray-500">{item.aciklama}</p>}
                                </div>
                                <p className="text-sm font-semibold text-white">{formatCurrency(item.tutar)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300">
                        <Binoculars className="h-4 w-4 text-red-400" />
                        Bilirkişi - Keşif - Diğer Giderler
                    </h3>
                    <div className="space-y-2">
                        {hesaplama.kalemler.filter(item => item.grup === 'gider').map((item, index) => (
                            <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
                                <div>
                                    <p className="text-sm text-gray-200">{item.label}</p>
                                    {item.aciklama && <p className="text-xs text-gray-500">{item.aciklama}</p>}
                                </div>
                                <p className="text-sm font-semibold text-white">{formatCurrency(item.tutar)}</p>
                            </div>
                        ))}

                        <div className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                            <p className="text-xs font-semibold text-indigo-200">Tanik Ucreti Araligi</p>
                            <p className="mt-1 text-xs text-indigo-200/90">Tanik sayisi: {hesaplama.tanikCount}</p>
                            <p className="mt-1 text-sm text-indigo-100">
                                Alt: {formatCurrency(hesaplama.tanikAltToplam)} | Ust: {formatCurrency(hesaplama.tanikUstToplam)}
                            </p>
                            <p className="mt-1 text-[11px] text-indigo-200/80">
                                Bir tanik icin {formatCurrency(harclar.tanikUcretAraligi.min)} - {formatCurrency(harclar.tanikUcretAraligi.max)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {hesaplama.tahsilSenaryolari.length > 0 && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300">
                        <Landmark className="h-4 w-4 text-red-400" />
                        Icra Tahsil Harci Senaryolari (Bilgilendirme)
                    </h3>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {hesaplama.tahsilSenaryolari.map(item => (
                            <div key={item.label} className="rounded-lg border border-gray-700 bg-gray-900/70 p-3">
                                <p className="text-xs text-gray-400">{item.label}</p>
                                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(item.tutar)}</p>
                                <p className="mt-1 text-[11px] text-gray-500">{item.aciklama}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-5 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-950/30 via-red-900/20 to-red-950/30 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-red-300">Toplam Tahmini Yuk</p>
                        <p className="text-sm text-gray-300">Tanik ucret araligi nedeniyle alt/ust toplam gosterilir.</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-red-200">Alt Toplam: <span className="font-bold text-white">{formatCurrency(hesaplama.toplamAlt)}</span></p>
                        <p className="text-sm text-red-200">Ust Toplam: <span className="font-bold text-white">{formatCurrency(hesaplama.toplamUst)}</span></p>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Kopyalandi' : 'Hesabi Kopyala'}
                </button>
                <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
                >
                    <Printer className="h-4 w-4" />
                    Yazdir
                </button>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-gray-400">
                <p className="mb-2 flex items-center gap-1 text-gray-300">
                    <Info className="h-3.5 w-3.5" />
                    Kaynaklar ve Notlar
                </p>
                <p>Harc versiyonu: {harclar.meta.version} ({new Date(harclar.meta.lastUpdated).toLocaleDateString('tr-TR')})</p>
                <p>AAUT versiyonu: {avukatlikUcret.meta.version}</p>
                {lastChecked && <p>Son guncelleme kontrolu: {new Date(lastChecked).toLocaleDateString('tr-TR')}</p>}
                <div className="animate-breathe-attention mt-3 rounded-xl border border-amber-400/45 bg-amber-500/12 p-3 sm:p-4">
                    <p className="flex items-start gap-2 text-sm sm:text-base font-semibold text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <span>
                            Mahkeme bazlı bilirkişi kalemleri asgari tarifeye göre hesaplanır. Dosya kapsamında mahkeme ek gider avansı talep edebilir.
                        </span>
                    </p>
                </div>
                {Array.isArray(harclar.meta.references) && harclar.meta.references.length > 0 && (
                    <div className="mt-2 space-y-1">
                        {harclar.meta.references.map((ref) => (
                            <p key={ref} className="truncate">- {ref}</p>
                        ))}
                    </div>
                )}
            </div>

            <div id="update-check-reminder" className="mt-3 hidden items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                <Users className="h-3.5 w-3.5" />
                Tarife kontrol suresi dolmus olabilir; resmi kaynaklari tekrar dogrulayin.
            </div>
        </div>
    );
};

export default FeeCalculator;
