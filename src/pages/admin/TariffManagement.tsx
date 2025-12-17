import React, { useState } from 'react';
import {
    Calculator, Save, RefreshCw, History, Download, Upload,
    AlertCircle, CheckCircle, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { HARCLAR_2025, AVUKATLIK_UCRET_2025 } from '../../config/feeTariffs';

export const TariffManagement: React.FC = () => {
    const [harclar, setHarclar] = useState(HARCLAR_2025);
    const [avukatlik, setAvukatlik] = useState(AVUKATLIK_UCRET_2025);
    const [saving, setSaving] = useState(false);
    const [checking, setChecking] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            // In production, this would save to database
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success('Tarifeler kaydedildi (demo)');
        } catch (error) {
            toast.error('Kaydetme başarısız');
        } finally {
            setSaving(false);
        }
    };

    const handleCheckUpdates = async () => {
        setChecking(true);
        try {
            const response = await fetch('/api/gemini/web-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: '2025 yargı harç tarifesi resmi gazete güncel'
                })
            });

            if (response.ok) {
                toast.success('Güncel tarife arandı. Sonuçlar için konsolu kontrol edin.');
            }
        } catch (error) {
            toast.error('Arama başarısız');
        } finally {
            setChecking(false);
        }
    };

    const handleExport = () => {
        const data = {
            harclar,
            avukatlik,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tarifeler-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Tarifeler dışa aktarıldı');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tarife Yönetimi</h1>
                    <p className="text-gray-400">Harç ve avukatlık ücret tarifelerini yönetin</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCheckUpdates}
                        disabled={checking}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                        Güncelleme Ara
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Dışa Aktar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Kaydet
                    </button>
                </div>
            </div>

            {/* Version Info */}
            <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                    <p className="text-green-400 font-medium">Tarifeler Güncel</p>
                    <p className="text-sm text-green-300/70">
                        Harçlar: {harclar.meta.version} • AAÜT: {avukatlik.meta.version}
                    </p>
                </div>
            </div>

            {/* Harç Tarifeleri */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-700/50">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-red-500" />
                        Yargı Harçları
                    </h2>
                    <p className="text-sm text-gray-400">Kaynak: {harclar.meta.source}</p>
                </div>
                <div className="p-6 space-y-6">
                    {/* Başvurma Harçları */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-3">Başvurma Harçları (Maktu)</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(harclar.basvurmaHarci).map(([key, value]) => (
                                <div key={key}>
                                    <label className="block text-xs text-gray-500 mb-1 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1')}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₺</span>
                                        <input
                                            type="number"
                                            value={value}
                                            onChange={(e) => setHarclar({
                                                ...harclar,
                                                basvurmaHarci: {
                                                    ...harclar.basvurmaHarci,
                                                    [key]: parseFloat(e.target.value)
                                                }
                                            })}
                                            className="w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Nispi Harç */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-3">Nispi Harç Oranları</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Karar İlam Harcı</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.00001"
                                        value={harclar.nispiHarc.kararIlam}
                                        onChange={(e) => setHarclar({
                                            ...harclar,
                                            nispiHarc: { ...harclar.nispiHarc, kararIlam: parseFloat(e.target.value) }
                                        })}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                                        (binde {(harclar.nispiHarc.kararIlam * 1000).toFixed(2)})
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Peşin Harç Oranı</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={harclar.nispiHarc.pesinOran}
                                    onChange={(e) => setHarclar({
                                        ...harclar,
                                        nispiHarc: { ...harclar.nispiHarc, pesinOran: parseFloat(e.target.value) }
                                    })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Asgari Tutar (₺)</label>
                                <input
                                    type="number"
                                    value={harclar.nispiHarc.asgaritutar}
                                    onChange={(e) => setHarclar({
                                        ...harclar,
                                        nispiHarc: { ...harclar.nispiHarc, asgaritutar: parseFloat(e.target.value) }
                                    })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* İcra Tahsil Harçları */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-3">İcra Tahsil Harçları</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {Object.entries(harclar.icraTahsilHarci).map(([key, value]) => (
                                <div key={key}>
                                    <label className="block text-xs text-gray-500 mb-1 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.0001"
                                            value={value}
                                            onChange={(e) => setHarclar({
                                                ...harclar,
                                                icraTahsilHarci: {
                                                    ...harclar.icraTahsilHarci,
                                                    [key]: parseFloat(e.target.value)
                                                }
                                            })}
                                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                                            %{((value as number) * 100).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Avukatlık Ücret Tarifesi */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-700/50">
                    <h2 className="text-lg font-semibold text-white">Avukatlık Asgari Ücret Tarifesi</h2>
                    <p className="text-sm text-gray-400">Kaynak: {avukatlik.meta.source}</p>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(avukatlik)
                            .filter(([key]) => key !== 'meta')
                            .map(([key, value]) => (
                                <div key={key}>
                                    <label className="block text-xs text-gray-500 mb-1 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1')}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₺</span>
                                        <input
                                            type="number"
                                            value={value as number}
                                            onChange={(e) => setAvukatlik({
                                                ...avukatlik,
                                                [key]: parseFloat(e.target.value)
                                            })}
                                            className="w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TariffManagement;
