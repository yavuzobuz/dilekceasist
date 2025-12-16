import React, { useState, useMemo } from 'react';
import { Calculator, Printer, Copy, Info, Scale, Gavel, FileText, Banknote, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

// 2025 Harç Tarifeleri (1 Ocak 2025 - Resmî Gazete)
const HARCLAR_2025 = {
    // Başvurma Harçları (Maktu)
    basvurmaHarci: {
        sulhHukuk: 281.80,
        asliyeHukuk: 615.40,
        bolgeAdliye: 945.40,
        anayasaMahkemesi: 5064.40,
        icra: 615.40,
    },
    // Nispi Harç Oranları
    nispiHarc: {
        kararIlam: 0.06831, // binde 68,31
        pesinOran: 0.25, // nispi harcın 1/4'ü peşin
        asgaritutar: 427.60,
    },
    // İcra Tahsil Harçları
    icraTahsilHarci: {
        hacizdenOnce: 0.0455, // %4,55
        hacizdenSonra: 0.0910, // %9,10
        satisSonrasi: 0.1138, // %11,38
    },
    // İcra Peşin Harç
    icraPesinHarc: 0.005, // binde 5
    // Cezaevi Harcı
    cezaeviHarci: 0.02, // %2
    // Diğer Maktu Harçlar
    vekaletHarci: 87.50,
    vekaletPulu: 138.00,
    kesifHarci: 4361.50,
};

// 2025-2026 Avukatlık Asgari Ücret Tarifesi (4 Kasım 2025)
const AVUKATLIK_UCRET_2025 = {
    asliyeMahkeme: 45000,
    sulhHukuk: 30000,
    tuketiciMahkemesi: 22500,
    icraTakibi: 9000,
    icraTahliye: 20000,
    agirCeza: 65000,
    idareMahkemesi: 30000,
};

type DavaTuru = 'alacak' | 'bosanma' | 'is' | 'tuketici' | 'icra' | 'ceza' | 'idari';

interface HesaplamaResult {
    label: string;
    tutar: number;
    aciklama?: string;
}

export const FeeCalculator: React.FC = () => {
    const [davaTuru, setDavaTuru] = useState<DavaTuru>('alacak');
    const [davaDegeri, setDavaDegeri] = useState<string>('');
    const [copied, setCopied] = useState(false);

    const davaTurleri = [
        { value: 'alacak', label: 'Alacak Davası', icon: Banknote },
        { value: 'bosanma', label: 'Boşanma Davası', icon: Scale },
        { value: 'is', label: 'İş Davası', icon: Gavel },
        { value: 'tuketici', label: 'Tüketici Davası', icon: FileText },
        { value: 'icra', label: 'İcra Takibi', icon: Gavel },
        { value: 'ceza', label: 'Ceza Davası', icon: Scale },
        { value: 'idari', label: 'İdari Dava', icon: FileText },
    ];

    const hesaplamaSonuclari = useMemo((): HesaplamaResult[] => {
        const deger = parseFloat(davaDegeri) || 0;
        const results: HesaplamaResult[] = [];

        switch (davaTuru) {
            case 'alacak':
            case 'is': {
                // Başvurma Harcı
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.asliyeHukuk,
                    aciklama: 'Asliye Hukuk Mahkemesi maktu harç',
                });
                // Nispi Harç (Karar İlam)
                const nispiHarc = Math.max(deger * HARCLAR_2025.nispiHarc.kararIlam, HARCLAR_2025.nispiHarc.asgaritutar);
                results.push({
                    label: 'Nispi Harç (Toplam)',
                    tutar: nispiHarc,
                    aciklama: `Dava değerinin binde 68,31'i`,
                });
                // Peşin Harç
                results.push({
                    label: 'Peşin Harç (Dava Açılışında)',
                    tutar: nispiHarc * HARCLAR_2025.nispiHarc.pesinOran,
                    aciklama: 'Nispi harcın 1/4\'ü peşin ödenir',
                });
                // Vekalet Harcı
                results.push({
                    label: 'Vekalet Harcı',
                    tutar: HARCLAR_2025.vekaletHarci,
                });
                // Vekalet Pulu
                results.push({
                    label: 'Vekalet Pulu',
                    tutar: HARCLAR_2025.vekaletPulu,
                });
                // Avukatlık Ücreti
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: davaTuru === 'is' ? AVUKATLIK_UCRET_2025.asliyeMahkeme : AVUKATLIK_UCRET_2025.asliyeMahkeme,
                    aciklama: '2025-2026 AAÜT tarifesi',
                });
                break;
            }
            case 'bosanma': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.asliyeHukuk,
                });
                results.push({
                    label: 'Maktu Karar Harcı',
                    tutar: HARCLAR_2025.nispiHarc.asgaritutar,
                    aciklama: 'Boşanma davaları maktu harçlıdır',
                });
                results.push({
                    label: 'Vekalet Harcı + Pulu',
                    tutar: HARCLAR_2025.vekaletHarci + HARCLAR_2025.vekaletPulu,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: AVUKATLIK_UCRET_2025.asliyeMahkeme,
                });
                break;
            }
            case 'tuketici': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.asliyeHukuk,
                });
                const nispiHarc = Math.max(deger * HARCLAR_2025.nispiHarc.kararIlam, HARCLAR_2025.nispiHarc.asgaritutar);
                results.push({
                    label: 'Nispi Harç',
                    tutar: nispiHarc,
                });
                results.push({
                    label: 'Peşin Harç',
                    tutar: nispiHarc * HARCLAR_2025.nispiHarc.pesinOran,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: AVUKATLIK_UCRET_2025.tuketiciMahkemesi,
                    aciklama: 'Tüketici mahkemesi tarifesi',
                });
                break;
            }
            case 'icra': {
                // İcra Başvurma
                results.push({
                    label: 'İcraya Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.icra,
                });
                // Peşin Harç (İlamsız takip)
                const pesinHarc = deger * HARCLAR_2025.icraPesinHarc;
                results.push({
                    label: 'Peşin Harç (Binde 5)',
                    tutar: pesinHarc,
                    aciklama: 'İlamsız icra takiplerinde',
                });
                // Tahsil Harçları
                results.push({
                    label: 'Tahsil Harcı (Hacizden Önce)',
                    tutar: deger * HARCLAR_2025.icraTahsilHarci.hacizdenOnce,
                    aciklama: '%4,55 - Haciz yapılmadan tahsil',
                });
                results.push({
                    label: 'Tahsil Harcı (Hacizden Sonra)',
                    tutar: deger * HARCLAR_2025.icraTahsilHarci.hacizdenSonra,
                    aciklama: '%9,10 - Haciz sonrası, satıştan önce',
                });
                results.push({
                    label: 'Tahsil Harcı (Satış Sonrası)',
                    tutar: deger * HARCLAR_2025.icraTahsilHarci.satisSonrasi,
                    aciklama: '%11,38 - Satış yoluyla tahsil',
                });
                // Cezaevi Harcı
                results.push({
                    label: 'Cezaevi Harcı (%2)',
                    tutar: deger * HARCLAR_2025.cezaeviHarci,
                });
                // Avukatlık
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: AVUKATLIK_UCRET_2025.icraTakibi,
                });
                break;
            }
            case 'ceza': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.asliyeHukuk,
                    aciklama: 'Şikayetçi/Katılan vekili için',
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: AVUKATLIK_UCRET_2025.agirCeza,
                    aciklama: 'Ağır Ceza Mahkemesi tarifesi',
                });
                break;
            }
            case 'idari': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: HARCLAR_2025.basvurmaHarci.asliyeHukuk,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: AVUKATLIK_UCRET_2025.idareMahkemesi,
                    aciklama: 'İdare Mahkemesi (duruşmasız)',
                });
                break;
            }
        }

        return results;
    }, [davaTuru, davaDegeri]);

    const toplamTutar = useMemo(() => {
        // Dava açılışında ödenecekler (tahsil harçları hariç)
        return hesaplamaSonuclari
            .filter(r => !r.label.includes('Tahsil Harcı'))
            .reduce((acc, r) => acc + r.tutar, 0);
    }, [hesaplamaSonuclari]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 2,
        }).format(value);
    };

    const handleCopy = () => {
        const text = hesaplamaSonuclari
            .map(r => `${r.label}: ${formatCurrency(r.tutar)}`)
            .join('\n') + `\n\nTOPLAM: ${formatCurrency(toplamTutar)}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Hesaplama kopyalandı!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-red-500" />
                    Harç ve Masraf Hesaplayıcı
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Info className="w-4 h-4" />
                    2025 Güncel Tarife
                </div>
            </div>

            {/* Dava Türü Seçimi */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dava / İşlem Türü
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {davaTurleri.map((tur) => {
                        const Icon = tur.icon;
                        return (
                            <button
                                key={tur.value}
                                onClick={() => setDavaTuru(tur.value as DavaTuru)}
                                className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${davaTuru === tur.value
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-red-500'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="text-sm">{tur.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Dava Değeri */}
            {['alacak', 'is', 'tuketici', 'icra'].includes(davaTuru) && (
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Dava Değeri / Takip Tutarı (TL)
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
                        <input
                            type="number"
                            value={davaDegeri}
                            onChange={(e) => setDavaDegeri(e.target.value)}
                            placeholder="Örn: 100000"
                            className="w-full pl-8 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                        />
                    </div>
                </div>
            )}

            {/* Sonuçlar */}
            <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                    Hesaplama Sonuçları
                </h3>
                <div className="space-y-2">
                    {hesaplamaSonuclari.map((sonuc, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                        >
                            <div>
                                <span className="text-gray-300">{sonuc.label}</span>
                                {sonuc.aciklama && (
                                    <p className="text-xs text-gray-500">{sonuc.aciklama}</p>
                                )}
                            </div>
                            <span className="font-mono text-white font-semibold">
                                {formatCurrency(sonuc.tutar)}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Toplam */}
                <div className="mt-4 pt-4 border-t-2 border-red-600 flex items-center justify-between">
                    <span className="text-lg font-bold text-white">TOPLAM (Tahmini)</span>
                    <span className="text-2xl font-bold text-red-500">
                        {formatCurrency(toplamTutar)}
                    </span>
                </div>
            </div>

            {/* Aksiyon Butonları */}
            <div className="flex gap-2">
                <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Kopyalandı!' : 'Kopyala'}
                </button>
                <button
                    onClick={handlePrint}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                    <Printer className="w-4 h-4" />
                    Yazdır
                </button>
            </div>

            {/* Uyarı */}
            <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                <p className="text-xs text-yellow-300">
                    <strong>Not:</strong> Bu hesaplama tahmini olup, güncel harç tarifelerine göre hazırlanmıştır.
                    Kesin tutarlar için ilgili mahkeme veya icra dairesinden bilgi alınız.
                    Tarife: 1 Ocak 2025 (96 Seri No.lu Harçlar Kanunu Genel Tebliği) ve
                    AAÜT 2025-2026 (4 Kasım 2025 Resmî Gazete).
                </p>
            </div>
        </div>
    );
};

export default FeeCalculator;
