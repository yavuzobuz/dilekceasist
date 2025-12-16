import React, { useState, useEffect } from 'react';
import {
    Bell, Plus, Search, Edit2, Trash2, X, Save,
    Clock, CheckCircle, XCircle, Loader2, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'success' | 'error';
    is_active: boolean;
    show_on_login: boolean;
    created_at: string;
    expires_at: string | null;
}

const typeConfig = {
    info: { bg: 'bg-blue-900/30', border: 'border-blue-700/50', text: 'text-blue-400', label: 'Bilgi' },
    warning: { bg: 'bg-yellow-900/30', border: 'border-yellow-700/50', text: 'text-yellow-400', label: 'Uyarı' },
    success: { bg: 'bg-green-900/30', border: 'border-green-700/50', text: 'text-green-400', label: 'Başarı' },
    error: { bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-400', label: 'Hata' }
};

const API_BASE = 'http://localhost:3001';

export const Announcements: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<Announcement> | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Load announcements from API
    useEffect(() => {
        loadAnnouncements();
    }, []);

    const loadAnnouncements = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/api/announcements`);
            if (!response.ok) throw new Error('Failed to fetch announcements');
            const data = await response.json();
            setAnnouncements(data.announcements || []);
        } catch (error: any) {
            console.error('Load announcements error:', error);
            toast.error('Duyurular yüklenemedi: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredAnnouncements = announcements.filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSave = async () => {
        if (!editingAnnouncement || !editingAnnouncement.title || !editingAnnouncement.content) {
            toast.error('Başlık ve içerik gerekli');
            return;
        }

        setSaving(true);
        try {
            const isNew = !editingAnnouncement.id;
            const response = await fetch(`${API_BASE}/api/announcements`, {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingAnnouncement)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save');
            }

            toast.success(isNew ? 'Duyuru oluşturuldu' : 'Duyuru güncellendi');
            setShowModal(false);
            setEditingAnnouncement(null);
            loadAnnouncements();
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error('Kaydetme hatası: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return;

        try {
            const response = await fetch(`${API_BASE}/api/announcements`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!response.ok) throw new Error('Failed to delete');

            toast.success('Duyuru silindi');
            loadAnnouncements();
        } catch (error: any) {
            toast.error('Silme hatası: ' + error.message);
        }
    };

    const handleToggleActive = async (announcement: Announcement) => {
        try {
            const response = await fetch(`${API_BASE}/api/announcements`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: announcement.id, is_active: !announcement.is_active })
            });

            if (!response.ok) throw new Error('Failed to toggle');

            loadAnnouncements();
        } catch (error: any) {
            toast.error('Güncelleme hatası: ' + error.message);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('tr-TR');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Duyuru Yönetimi</h1>
                    <p className="text-gray-400">{announcements.length} duyuru ({announcements.filter(a => a.is_active).length} aktif)</p>
                </div>
                <button
                    onClick={() => {
                        setEditingAnnouncement({
                            title: '',
                            content: '',
                            type: 'info',
                            is_active: true,
                            show_on_login: false,
                            expires_at: null
                        });
                        setShowModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Yeni Duyuru
                </button>
            </div>

            {/* Search */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Duyuru ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    />
                </div>
            </div>

            {/* Announcements List */}
            <div className="space-y-4">
                {filteredAnnouncements.map(announcement => {
                    const config = typeConfig[announcement.type];
                    return (
                        <div
                            key={announcement.id}
                            className={`${config.bg} ${config.border} border rounded-xl p-5 ${!announcement.is_active ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Bell className={`w-5 h-5 ${config.text}`} />
                                        <h3 className="text-lg font-semibold text-white">{announcement.title}</h3>
                                        <span className={`px-2 py-0.5 text-xs rounded ${config.bg} ${config.text} border ${config.border}`}>
                                            {config.label}
                                        </span>
                                        {announcement.show_on_login && (
                                            <span className="px-2 py-0.5 text-xs rounded bg-purple-900/30 text-purple-400 border border-purple-700/50">
                                                Giriş Sayfası
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-300 mb-3">{announcement.content}</p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Oluşturulma: {formatDate(announcement.created_at)}
                                        </span>
                                        {announcement.expires_at && (
                                            <span className="flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Bitiş: {formatDate(announcement.expires_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleActive(announcement)}
                                        className={`p-2 rounded-lg transition-colors ${announcement.is_active
                                            ? 'text-green-400 hover:bg-green-900/30'
                                            : 'text-gray-500 hover:bg-gray-700'
                                            }`}
                                        title={announcement.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                                    >
                                        {announcement.is_active ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingAnnouncement(announcement);
                                            setShowModal(true);
                                        }}
                                        className="p-2 hover:bg-blue-600 rounded-lg text-blue-400 hover:text-white transition-colors"
                                    >
                                        <Edit2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(announcement.id)}
                                        className="p-2 hover:bg-red-600 rounded-lg text-red-400 hover:text-white transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {filteredAnnouncements.length === 0 && (
                    <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700">
                        <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Henüz duyuru yok</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {showModal && editingAnnouncement && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">
                                {editingAnnouncement.id ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Başlık</label>
                                <input
                                    type="text"
                                    value={editingAnnouncement.title || ''}
                                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    placeholder="Duyuru başlığı..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">İçerik</label>
                                <textarea
                                    value={editingAnnouncement.content || ''}
                                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                                    placeholder="Duyuru içeriği..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Tür</label>
                                    <select
                                        value={editingAnnouncement.type || 'info'}
                                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, type: e.target.value as any })}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    >
                                        <option value="info">Bilgi</option>
                                        <option value="warning">Uyarı</option>
                                        <option value="success">Başarı</option>
                                        <option value="error">Hata</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Bitiş Tarihi</label>
                                    <input
                                        type="date"
                                        value={editingAnnouncement.expires_at || ''}
                                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, expires_at: e.target.value || null })}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingAnnouncement.is_active !== false}
                                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, is_active: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-600"
                                    />
                                    <span className="text-gray-300">Aktif</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingAnnouncement.show_on_login || false}
                                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, show_on_login: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-600"
                                    />
                                    <span className="text-gray-300">Giriş sayfasında göster</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Announcements;
