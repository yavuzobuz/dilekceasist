import React, { useState, useMemo } from 'react';
import { Calculator, Printer, Copy, Info, Check, Briefcase, Calendar, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CalculatorInputs {
    brutMaas: string;
    isBaslangic: string;
    isBitis: string;
    kullanilmayanIzin: string;
    aylikFazlaMesai: string;
    haftaTatiliGun: string;
    genelTatilGun: string;
    isciFesihSekli: 'kidem_ihbar' | 'sadece_kidem' | 'hic' | 'isk_istifa';
}

interface CalculationResult {
    label: string;
    brutTutar: number;
    netTutar: number;
    aciklama?: string;
    highlight?: boolean;
    vergiMuaf?: boolean;
}

// 2025 Vergi Oranları
const DAMGA_VERGISI_ORANI = 0.00759; // Binde 7,59
const GELIR_VERGISI_ORANI = 0.15; // İlk dilim %15 (basitleştirilmiş)

export const LaborReceivablesCalculator: React.FC = () => {
    const [inputs, setInputs] = useState<CalculatorInputs>({
        brutMaas: '',
        isBaslangic: '',
        isBitis: '',
        kullanilmayanIzin: '',
        aylikFazlaMesai: '',
        haftaTatiliGun: '',
        genelTatilGun: '',
        isciFesihSekli: 'kidem_ihbar',
    });
    const [copied, setCopied] = useState(false);

    // 2025 Kıdem tazminatı tavanı (Ocak-Haziran dönemi, güncellenebilir)
    const KIDEM_TAVANI = 35058.58; // 2025 ilk yarı

    const updateInput = (field: keyof CalculatorInputs, value: string) => {
        setInputs(prev => ({ ...prev, [field]: value }));
    };

    // Brütten nete hesaplama (kıdem tazminatı hariç diğer alacaklar için)
    const calculateNet = (brutTutar: number, vergiMuaf: boolean = false): number => {
        if (vergiMuaf) {
            // Kıdem tazminatı sadece damga vergisine tabi
            return brutTutar - (brutTutar * DAMGA_VERGISI_ORANI);
        }
        // Diğer alacaklar: Gelir Vergisi + Damga Vergisi
        const gelirVergisi = brutTutar * GELIR_VERGISI_ORANI;
        const damgaVergisi = brutTutar * DAMGA_VERGISI_ORANI;
        return brutTutar - gelirVergisi - damgaVergisi;
    };

    const calculateWorkDuration = useMemo(() => {
        if (!inputs.isBaslangic || !inputs.isBitis) return { years: 0, months: 0, days: 0, totalDays: 0 };

        const start = new Date(inputs.isBaslangic);
        const end = new Date(inputs.isBitis);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const years = Math.floor(totalDays / 365);
        const remainingDays = totalDays % 365;
        const months = Math.floor(remainingDays / 30);
        const days = remainingDays % 30;

        return { years, months, days, totalDays };
    }, [inputs.isBaslangic, inputs.isBitis]);

    const calculateIzinHakki = (years: number): number => {
        // İş Kanunu md. 53
        if (years < 1) return 0;
        if (years < 5) return 14;
        if (years < 15) return 20;
        return 26; // 15 yıl ve üzeri
    };

    const calculationResults = useMemo((): CalculationResult[] => {
        const brutMaas = parseFloat(inputs.brutMaas) || 0;
        const results: CalculationResult[] = [];

        if (brutMaas === 0) return results;

        const { years, months, days } = calculateWorkDuration;
        const gunlukUcret = brutMaas / 30;
        const saatlikUcret = gunlukUcret / 7.5;

        // Kıdem Tazminatı Hesabı
        if (inputs.isciFesihSekli !== 'hic' && inputs.isciFesihSekli !== 'isk_istifa') {
            // Kıdem tazminatı tavanı kontrolü
            const tavanliMaas = Math.min(brutMaas, KIDEM_TAVANI);
            const kidemYili = years + (months / 12) + (days / 365);
            const kidemTazminatiBrut = tavanliMaas * kidemYili;

            results.push({
                label: 'Kıdem Tazminatı',
                brutTutar: kidemTazminatiBrut,
                netTutar: calculateNet(kidemTazminatiBrut, true), // Gelir vergisinden muaf
                aciklama: `${years} yıl ${months} ay ${days} gün | Vergiden muaf, sadece DV`,
                highlight: true,
                vergiMuaf: true,
            });
        }

        // İhbar Tazminatı Hesabı
        if (inputs.isciFesihSekli === 'kidem_ihbar') {
            let ihbarSuresi = 0; // hafta cinsinden
            const totalMonths = years * 12 + months;

            // İş Kanunu md. 17
            if (totalMonths < 6) {
                ihbarSuresi = 2;
            } else if (totalMonths < 18) {
                ihbarSuresi = 4;
            } else if (totalMonths < 36) {
                ihbarSuresi = 6;
            } else {
                ihbarSuresi = 8;
            }

            const ihbarGun = ihbarSuresi * 7;
            const ihbarTazminatiBrut = gunlukUcret * ihbarGun;

            results.push({
                label: 'İhbar Tazminatı',
                brutTutar: ihbarTazminatiBrut,
                netTutar: calculateNet(ihbarTazminatiBrut, false),
                aciklama: `${ihbarSuresi} hafta (${ihbarGun} gün) | %15 GV + DV`,
                highlight: true,
            });
        }

        // Yıllık İzin Ücreti
        const kullanilmayanIzin = parseFloat(inputs.kullanilmayanIzin) || 0;
        if (kullanilmayanIzin > 0) {
            const izinUcretiBrut = gunlukUcret * kullanilmayanIzin;
            results.push({
                label: 'Kullanılmayan Yıllık İzin Ücreti',
                brutTutar: izinUcretiBrut,
                netTutar: calculateNet(izinUcretiBrut, false),
                aciklama: `${kullanilmayanIzin} gün | %15 GV + DV`,
            });
        }

        // Fazla Mesai Ücreti (Aylık ortalama)
        const aylikFazlaMesai = parseFloat(inputs.aylikFazlaMesai) || 0;
        if (aylikFazlaMesai > 0) {
            // İş Kanunu md. 41 - %50 zamlı
            const fazlaMesaiSaatUcreti = saatlikUcret * 1.5;
            const aylikFazlaMesaiUcretiBrut = fazlaMesaiSaatUcreti * aylikFazlaMesai;

            results.push({
                label: 'Fazla Mesai Ücreti (Aylık)',
                brutTutar: aylikFazlaMesaiUcretiBrut,
                netTutar: calculateNet(aylikFazlaMesaiUcretiBrut, false),
                aciklama: `${aylikFazlaMesai} saat x %150 | %15 GV + DV`,
            });
        }

        // Hafta Tatili Ücreti
        const haftaTatiliGun = parseFloat(inputs.haftaTatiliGun) || 0;
        if (haftaTatiliGun > 0) {
            // Hafta tatilinde çalışma - %100 zamlı (toplam 2 günlük)
            const haftaTatiliUcretiBrut = gunlukUcret * 2 * haftaTatiliGun;

            results.push({
                label: 'Hafta Tatili Ücreti',
                brutTutar: haftaTatiliUcretiBrut,
                netTutar: calculateNet(haftaTatiliUcretiBrut, false),
                aciklama: `${haftaTatiliGun} gün x 2 kat | %15 GV + DV`,
            });
        }

        // Ulusal Bayram ve Genel Tatil Ücreti
        const genelTatilGun = parseFloat(inputs.genelTatilGun) || 0;
        if (genelTatilGun > 0) {
            // UBGT'de çalışma - 1 günlük ücret + 1 günlük ek ücret
            const genelTatilUcretiBrut = gunlukUcret * 2 * genelTatilGun;

            results.push({
                label: 'UBGT Ücreti',
                brutTutar: genelTatilUcretiBrut,
                netTutar: calculateNet(genelTatilUcretiBrut, false),
                aciklama: `${genelTatilGun} gün x 2 kat | %15 GV + DV`,
            });
        }

        return results;
    }, [inputs, calculateWorkDuration, KIDEM_TAVANI]);

    const toplamBrut = useMemo(() => {
        return calculationResults.reduce((acc, r) => acc + r.brutTutar, 0);
    }, [calculationResults]);

    const toplamNet = useMemo(() => {
        return calculationResults.reduce((acc, r) => acc + r.netTutar, 0);
    }, [calculationResults]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 2,
        }).format(value);
    };

    const handleCopy = () => {
        const text = calculationResults
            .map(r => `${r.label}:\n  Brüt: ${formatCurrency(r.brutTutar)}\n  Net: ${formatCurrency(r.netTutar)}`)
            .join('\n\n') + `\n\n${'='.repeat(40)}\nTOPLAM BRÜT: ${formatCurrency(toplamBrut)}\nTOPLAM NET: ${formatCurrency(toplamNet)}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Hesaplama kopyalandı!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrint = () => {
        window.print();
    };

    const calismaYili = calculateWorkDuration.years;
    const hakedilenIzin = calculateIzinHakki(calismaYili);

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Briefcase className="w-6 h-6 text-orange-500" />
                    İşçilik Alacakları Hesaplayıcı
                </h2>
            </div>

            {/* Info Box */}
            <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-3 mb-6">
                <p className="text-sm text-orange-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                        Kıdem tazminatı gelir vergisinden muaftır (sadece damga vergisi ‰7,59). Diğer alacaklar için %15 GV + ‰7,59 DV kesintisi uygulanır. Kıdem tavanı: {formatCurrency(KIDEM_TAVANI)} (2025)
                    </span>
                </p>
            </div>

            {/* Input Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Brüt Maaş */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        <DollarSign className="w-4 h-4 inline mr-1" />
                        Brüt Aylık Maaş (TL)
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
                        <input
                            type="number"
                            value={inputs.brutMaas}
                            onChange={(e) => updateInput('brutMaas', e.target.value)}
                            placeholder="Örn: 50000"
                            className="w-full pl-8 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                        />
                    </div>
                </div>

                {/* Fesih Şekli */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Fesih Şekli
                    </label>
                    <select
                        value={inputs.isciFesihSekli}
                        onChange={(e) => updateInput('isciFesihSekli', e.target.value as CalculatorInputs['isciFesihSekli'])}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                    >
                        <option value="kidem_ihbar">İşveren Feshi (Kıdem + İhbar)</option>
                        <option value="sadece_kidem">Haklı Fesih (Sadece Kıdem)</option>
                        <option value="isk_istifa">İşçi İstifası (İhbarsız)</option>
                        <option value="hic">Kıdem/İhbar Hakkı Yok</option>
                    </select>
                </div>

                {/* İşe Başlangıç Tarihi */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        İşe Başlangıç Tarihi
                    </label>
                    <input
                        type="date"
                        value={inputs.isBaslangic}
                        onChange={(e) => updateInput('isBaslangic', e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* İşten Ayrılış Tarihi */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        İşten Ayrılış Tarihi
                    </label>
                    <input
                        type="date"
                        value={inputs.isBitis}
                        onChange={(e) => updateInput('isBitis', e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* Çalışma Süresi Gösterimi */}
                {inputs.isBaslangic && inputs.isBitis && (
                    <div className="md:col-span-2 bg-gray-900/50 rounded-lg p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="text-gray-400">Çalışma Süresi:</span>
                            <span className="text-white font-semibold">
                                {calculateWorkDuration.years} yıl {calculateWorkDuration.months} ay {calculateWorkDuration.days} gün
                            </span>
                            <span className="text-gray-500">|</span>
                            <span className="text-gray-400">Hak Edilen Yıllık İzin:</span>
                            <span className="text-orange-400 font-semibold">{hakedilenIzin} gün/yıl</span>
                        </div>
                    </div>
                )}

                {/* Kullanılmayan İzin */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Kullanılmayan Yıllık İzin (Gün)
                    </label>
                    <input
                        type="number"
                        value={inputs.kullanilmayanIzin}
                        onChange={(e) => updateInput('kullanilmayanIzin', e.target.value)}
                        placeholder="Örn: 14"
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* Aylık Ortalama Fazla Mesai */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Aylık Fazla Mesai (Saat)
                    </label>
                    <input
                        type="number"
                        value={inputs.aylikFazlaMesai}
                        onChange={(e) => updateInput('aylikFazlaMesai', e.target.value)}
                        placeholder="Örn: 20"
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* Hafta Tatili Çalışması */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Hafta Tatili Çalışması (Gün/Ay)
                    </label>
                    <input
                        type="number"
                        value={inputs.haftaTatiliGun}
                        onChange={(e) => updateInput('haftaTatiliGun', e.target.value)}
                        placeholder="Örn: 4"
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* UBGT Çalışması */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        UBGT Çalışması (Gün/Yıl)
                    </label>
                    <input
                        type="number"
                        value={inputs.genelTatilGun}
                        onChange={(e) => updateInput('genelTatilGun', e.target.value)}
                        placeholder="Örn: 10"
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                </div>
            </div>

            {/* Sonuçlar */}
            {calculationResults.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                        Hesaplama Sonuçları
                    </h3>

                    {/* Tablo Başlıkları */}
                    <div className="grid grid-cols-3 gap-2 pb-2 border-b border-gray-600 mb-2 text-xs font-medium text-gray-400">
                        <div>Alacak Kalemi</div>
                        <div className="text-right">Brüt</div>
                        <div className="text-right">Net</div>
                    </div>

                    <div className="space-y-2">
                        {calculationResults.map((sonuc, index) => (
                            <div
                                key={index}
                                className={`grid grid-cols-3 gap-2 py-2 border-b border-gray-700 last:border-0 ${sonuc.highlight ? 'bg-orange-900/20 rounded px-2 -mx-2' : ''
                                    }`}
                            >
                                <div>
                                    <span className={`${sonuc.highlight ? 'text-orange-300 font-medium' : 'text-gray-300'} text-sm`}>
                                        {sonuc.label}
                                    </span>
                                    {sonuc.aciklama && (
                                        <p className="text-xs text-gray-500">{sonuc.aciklama}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="font-mono text-gray-400 text-sm">
                                        {formatCurrency(sonuc.brutTutar)}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className={`font-mono font-semibold text-sm ${sonuc.vergiMuaf ? 'text-green-400' : 'text-white'}`}>
                                        {formatCurrency(sonuc.netTutar)}
                                    </span>
                                    {sonuc.vergiMuaf && (
                                        <span className="ml-1 text-xs text-green-500">✓</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Toplam Satırları */}
                    <div className="mt-4 pt-4 border-t-2 border-orange-600 space-y-3">
                        <div className="grid grid-cols-3 gap-2 items-center">
                            <span className="text-gray-400 font-medium">TOPLAM BRÜT</span>
                            <div></div>
                            <span className="text-right text-xl font-bold text-gray-300 font-mono">
                                {formatCurrency(toplamBrut)}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 items-center bg-green-900/30 rounded-lg py-3 px-3 -mx-2">
                            <span className="text-green-400 font-bold text-lg">TOPLAM NET</span>
                            <div></div>
                            <span className="text-right text-2xl font-bold text-green-400 font-mono">
                                {formatCurrency(toplamNet)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Sonuç yoksa bilgi mesajı */}
            {calculationResults.length === 0 && (
                <div className="bg-gray-900/50 rounded-lg p-8 mb-4 text-center">
                    <Calculator className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">
                        Hesaplama yapmak için brüt maaş ve tarih bilgilerini girin.
                    </p>
                </div>
            )}

            {/* Aksiyon Butonları */}
            <div className="flex gap-2">
                <button
                    onClick={handleCopy}
                    disabled={calculationResults.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
                >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Kopyalandı!' : 'Kopyala'}
                </button>
                <button
                    onClick={handlePrint}
                    disabled={calculationResults.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
                >
                    <Printer className="w-4 h-4" />
                    Yazdır
                </button>
            </div>

            {/* Yasal Bilgi */}
            <div className="mt-4 p-3 bg-gray-900/50 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-400">
                    <strong>Yasal Dayanak & Vergi Bilgisi:</strong><br />
                    • 4857 sayılı İş Kanunu (md. 17, 41, 44, 46, 53, 54, 55, 56, 57, 59)<br />
                    • 1475 sayılı İş Kanunu md. 14 (Kıdem Tazminatı) - <span className="text-green-400">Gelir vergisinden muaf</span><br />
                    • İhbar, İzin, Fazla Mesai vb.: %15 GV + ‰7,59 DV kesintili<br />
                    • 2025 Kıdem Tavanı: {formatCurrency(KIDEM_TAVANI)}
                </p>
            </div>
        </div>
    );
};

export default LaborReceivablesCalculator;
