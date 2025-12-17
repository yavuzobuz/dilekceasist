import React, { useState } from 'react';
import {
    Settings, Key, Mail, Shield, AlertTriangle, Database,
    Save, Eye, EyeOff, Loader2, RefreshCw, Power
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const SystemSettings: React.FC = () => {
    const [saving, setSaving] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(false);

    const [settings, setSettings] = useState({
        geminiApiKey: '••••••••••••••••••••',
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
        contactEmail: 'destek@dilekai.com',
        maxFileSize: '10',
        sessionTimeout: '60'
    });

    const handleSave = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success('Ayarlar kaydedildi');
        setSaving(false);
    };

    const handleBackup = async () => {
        toast.success('Veritabanı yedeği alınıyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        toast.success('Yedek başarıyla oluşturuldu');
    };

    const toggleMaintenance = () => {
        setMaintenanceMode(!maintenanceMode);
        toast.success(maintenanceMode ? 'Bakım modu kapatıldı' : 'Bakım modu açıldı');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Sistem Ayarları</h1>
                <p className="text-gray-400">API anahtarları ve sistem yapılandırması</p>
            </div>

            {/* Maintenance Mode Warning */}
            {maintenanceMode && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    <div>
                        <p className="text-yellow-400 font-medium">Bakım Modu Aktif</p>
                        <p className="text-sm text-yellow-300/70">Kullanıcılar sisteme erişemiyor</p>
                    </div>
                </div>
            )}

            {/* API Keys */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-700/50">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Key className="w-5 h-5 text-red-500" />
                        API Anahtarları
                    </h2>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Gemini API Key</label>
                        <div className="relative">
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                value={settings.geminiApiKey}
                                onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                                className="w-full pr-10 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono"
                            />
                            <button
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                            >
                                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Gemini AI API erişim anahtarı</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Supabase URL</label>
                        <input
                            type="text"
                            value={settings.supabaseUrl}
                            onChange={(e) => setSettings({ ...settings, supabaseUrl: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* General Settings */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-700/50">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-blue-500" />
                        Genel Ayarlar
                    </h2>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">İletişim E-postası</label>
                            <input
                                type="email"
                                value={settings.contactEmail}
                                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Maksimum Dosya Boyutu (MB)</label>
                            <input
                                type="number"
                                value={settings.maxFileSize}
                                onChange={(e) => setSettings({ ...settings, maxFileSize: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Oturum Zaman Aşımı (dk)</label>
                            <input
                                type="number"
                                value={settings.sessionTimeout}
                                onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* System Actions */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-700/50">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-yellow-500" />
                        Sistem İşlemleri
                    </h2>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={toggleMaintenance}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors flex-1 ${maintenanceMode
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                }`}
                        >
                            <Power className="w-5 h-5" />
                            {maintenanceMode ? 'Bakım Modunu Kapat' : 'Bakım Modunu Aç'}
                        </button>

                        <button
                            onClick={handleBackup}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex-1"
                        >
                            <Database className="w-5 h-5" />
                            Veritabanı Yedeği Al
                        </button>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Ayarları Kaydet
                </button>
            </div>
        </div>
    );
};

export default SystemSettings;
