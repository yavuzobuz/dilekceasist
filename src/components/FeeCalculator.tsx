import React, { useState, useMemo, useEffect } from 'react';
import { Calculator, Printer, Copy, Info, Scale, Gavel, FileText, Banknote, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { HARCLAR_2025, AVUKATLIK_UCRET_2025, shouldCheckForUpdates, type HarcTarifeleri, type AvukatlikUcretTarifeleri } from '../config/feeTariffs';

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
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [lastChecked, setLastChecked] = useState<string | null>(
        localStorage.getItem('tariffLastChecked')
    );
    const [updateAvailable, setUpdateAvailable] = useState(false);

    // Use tariffs from config
    const harclar = HARCLAR_2025;
    const avukatlikUcret = AVUKATLIK_UCRET_2025;

    const davaTurleri = [
        { value: 'alacak', label: 'Alacak Davası', icon: Banknote },
        { value: 'bosanma', label: 'Boşanma Davası', icon: Scale },
        { value: 'is', label: 'İş Davası', icon: Gavel },
        { value: 'tuketici', label: 'Tüketici Davası', icon: FileText },
        { value: 'icra', label: 'İcra Takibi', icon: Gavel },
        { value: 'ceza', label: 'Ceza Davası', icon: Scale },
        { value: 'idari', label: 'İdari Dava', icon: FileText },
    ];

    // Check for updates on component mount (if 3 months passed)
    useEffect(() => {
        if (shouldCheckForUpdates(lastChecked)) {
            // Show a subtle notification that update check is due
            const checkDue = document.getElementById('update-check-reminder');
            if (checkDue) checkDue.style.display = 'flex';
        }
    }, [lastChecked]);

    const checkForUpdates = async () => {
        setIsCheckingUpdate(true);
        try {
            const response = await fetch('/api/gemini/web-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '2025 yargı harç tarifesi güncel değişiklik Türkiye resmi gazete',
                    maxResults: 3
                })
            });

            if (response.ok) {
                const data = await response.json();
                const now = new Date().toISOString();
                setLastChecked(now);
                localStorage.setItem('tariffLastChecked', now);

                // Check if response mentions new tariffs
                const responseText = JSON.stringify(data).toLowerCase();
                const hasNewInfo = responseText.includes('2026') ||
                    responseText.includes('yeni tarife') ||
                    responseText.includes('güncellendi');

                if (hasNewInfo) {
                    setUpdateAvailable(true);
                    toast('Yeni tarife bilgisi olabilir! Kontrol edin.', { icon: '⚠️' });
                } else {
                    toast.success('Tarifeler güncel görünüyor.');
                }
            }
        } catch (error) {
            console.error('Update check failed:', error);
            toast.error('Güncelleme kontrolü başarısız');
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const hesaplamaSonuclari = useMemo((): HesaplamaResult[] => {
        const deger = parseFloat(davaDegeri) || 0;
        const results: HesaplamaResult[] = [];

        switch (davaTuru) {
            case 'alacak':
            case 'is': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.asliyeHukuk,
                    aciklama: 'Asliye Hukuk Mahkemesi maktu harç',
                });
                const nispiHarc = Math.max(deger * harclar.nispiHarc.kararIlam, harclar.nispiHarc.asgaritutar);
                results.push({
                    label: 'Nispi Harç (Toplam)',
                    tutar: nispiHarc,
                    aciklama: `Dava değerinin binde 68,31'i`,
                });
                results.push({
                    label: 'Peşin Harç (Dava Açılışında)',
                    tutar: nispiHarc * harclar.nispiHarc.pesinOran,
                    aciklama: 'Nispi harcın 1/4\'ü peşin ödenir',
                });
                results.push({
                    label: 'Vekalet Harcı',
                    tutar: harclar.vekaletHarci,
                });
                results.push({
                    label: 'Vekalet Pulu',
                    tutar: harclar.vekaletPulu,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.asliyeMahkeme,
                    aciklama: '2025-2026 AAÜT tarifesi',
                });
                break;
            }
            case 'bosanma': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.asliyeHukuk,
                });
                results.push({
                    label: 'Maktu Karar Harcı',
                    tutar: harclar.nispiHarc.asgaritutar,
                    aciklama: 'Boşanma davaları maktu harçlıdır',
                });
                results.push({
                    label: 'Vekalet Harcı + Pulu',
                    tutar: harclar.vekaletHarci + harclar.vekaletPulu,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.asliyeMahkeme,
                });
                break;
            }
            case 'tuketici': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.asliyeHukuk,
                });
                const nispiHarc = Math.max(deger * harclar.nispiHarc.kararIlam, harclar.nispiHarc.asgaritutar);
                results.push({
                    label: 'Nispi Harç',
                    tutar: nispiHarc,
                });
                results.push({
                    label: 'Peşin Harç',
                    tutar: nispiHarc * harclar.nispiHarc.pesinOran,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.tuketiciMahkemesi,
                    aciklama: 'Tüketici mahkemesi tarifesi',
                });
                break;
            }
            case 'icra': {
                results.push({
                    label: 'İcraya Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.icra,
                });
                const pesinHarc = deger * harclar.icraPesinHarc;
                results.push({
                    label: 'Peşin Harç (Binde 5)',
                    tutar: pesinHarc,
                    aciklama: 'İlamsız icra takiplerinde',
                });
                results.push({
                    label: 'Tahsil Harcı (Hacizden Önce)',
                    tutar: deger * harclar.icraTahsilHarci.hacizdenOnce,
                    aciklama: '%4,55 - Haciz yapılmadan tahsil',
                });
                results.push({
                    label: 'Tahsil Harcı (Hacizden Sonra)',
                    tutar: deger * harclar.icraTahsilHarci.hacizdenSonra,
                    aciklama: '%9,10 - Haciz sonrası, satıştan önce',
                });
                results.push({
                    label: 'Tahsil Harcı (Satış Sonrası)',
                    tutar: deger * harclar.icraTahsilHarci.satisSonrasi,
                    aciklama: '%11,38 - Satış yoluyla tahsil',
                });
                results.push({
                    label: 'Cezaevi Harcı (%2)',
                    tutar: deger * harclar.cezaeviHarci,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.icraTakibi,
                });
                break;
            }
            case 'ceza': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.asliyeHukuk,
                    aciklama: 'Şikayetçi/Katılan vekili için',
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.agirCeza,
                    aciklama: 'Ağır Ceza Mahkemesi tarifesi',
                });
                break;
            }
            case 'idari': {
                results.push({
                    label: 'Başvurma Harcı',
                    tutar: harclar.basvurmaHarci.asliyeHukuk,
                });
                results.push({
                    label: 'Avukatlık Asgari Ücreti',
                    tutar: avukatlikUcret.idareMahkemesi,
                    aciklama: 'İdare Mahkemesi (duruşmasız)',
                });
                break;
            }
        }

        return results;
    }, [davaTuru, davaDegeri, harclar, avukatlikUcret]);

    const toplamTutar = useMemo(() => {
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
            {/* Header with Update Check */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-red-500" />
                    Harç ve Masraf Hesaplayıcı
                </h2>
                <div className="flex items-center gap-3">
                    {updateAvailable && (
                        <span className="flex items-center gap-1 text-yellow-400 text-xs bg-yellow-900/30 px-2 py-1 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            Güncelleme olabilir
                        </span>
                    )}
                    <button
                        onClick={checkForUpdates}
                        disabled={isCheckingUpdate}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        title="Tarife güncelliğini kontrol et"
                    >
                        <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">
                            {isCheckingUpdate ? 'Kontrol ediliyor...' : 'Güncelleme Kontrol'}
                        </span>
                    </button>
                </div>
            </div>

            {/* Tariff Version Info */}
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Harçlar: {harclar.meta.version} ({new Date(harclar.meta.lastUpdated).toLocaleDateString('tr-TR')})
                </span>
                <span className="hidden sm:inline">•</span>
                <span>AAÜT: {avukatlikUcret.meta.version}</span>
                {lastChecked && (
                    <>
                        <span className="hidden sm:inline">•</span>
                        <span>Son kontrol: {new Date(lastChecked).toLocaleDateString('tr-TR')}</span>
                    </>
                )}
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

            {/* Kaynak Bilgisi */}
            <div className="mt-4 p-3 bg-gray-900/50 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-400">
                    <strong>Kaynaklar:</strong><br />
                    • {harclar.meta.source}<br />
                    • {avukatlikUcret.meta.source}
                </p>
            </div>
        </div>
    );
};

export default FeeCalculator;
