import React, { useState } from 'react';
import {
    Globe, Plus, Search, Edit2, Trash2, ExternalLink, RefreshCw,
    CheckCircle, XCircle, Loader2, X, Save
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface LegalSource {
    id: string;
    name: string;
    url: string;
    type: 'yargitay' | 'danistay' | 'anayasa' | 'resmigazete' | 'other';
    active: boolean;
    lastCrawled: string | null;
}

const DEMO_SOURCES: LegalSource[] = [
    { id: '1', name: 'Yargıtay Kararları', url: 'https://karararama.yargitay.gov.tr', type: 'yargitay', active: true, lastCrawled: '2025-12-15' },
    { id: '2', name: 'Danıştay Kararları', url: 'https://danistay.gov.tr', type: 'danistay', active: true, lastCrawled: '2025-12-14' },
    { id: '3', name: 'Anayasa Mahkemesi', url: 'https://anayasa.gov.tr', type: 'anayasa', active: true, lastCrawled: null },
    { id: '4', name: 'Resmi Gazete', url: 'https://resmigazete.gov.tr', type: 'resmigazete', active: true, lastCrawled: '2025-12-16' },
];

export const LegalSources: React.FC = () => {
    const [sources, setSources] = useState<LegalSource[]>(DEMO_SOURCES);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingSource, setEditingSource] = useState<LegalSource | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);

    const filteredSources = sources.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.url.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleRefresh = async (id: string) => {
        setRefreshing(id);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setSources(sources.map(s =>
            s.id === id ? { ...s, lastCrawled: new Date().toISOString().split('T')[0] } : s
        ));
        setRefreshing(null);
        toast.success('Kaynak yenilendi');
    };

    const handleToggleActive = (id: string) => {
        setSources(sources.map(s =>
            s.id === id ? { ...s, active: !s.active } : s
        ));
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('Bu kaynağı silmek istediğinize emin misiniz?')) return;
        setSources(sources.filter(s => s.id !== id));
        toast.success('Kaynak silindi');
    };

    const handleSave = () => {
        if (!editingSource) return;

        if (editingSource.id) {
            setSources(sources.map(s => s.id === editingSource.id ? editingSource : s));
        } else {
            setSources([...sources, { ...editingSource, id: Date.now().toString() }]);
        }

        setShowModal(false);
        setEditingSource(null);
        toast.success('Kaynak kaydedildi');
    };

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            yargitay: 'Yargıtay',
            danistay: 'Danıştay',
            anayasa: 'Anayasa M.',
            resmigazete: 'Resmi Gazete',
            other: 'Diğer'
        };
        return labels[type] || type;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">İçtihat Kaynakları</h1>
                    <p className="text-gray-400">{sources.length} kaynak tanımlı</p>
                </div>
                <button
                    onClick={() => {
                        setEditingSource({
                            id: '',
                            name: '',
                            url: '',
                            type: 'other',
                            active: true,
                            lastCrawled: null
                        });
                        setShowModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Yeni Kaynak
                </button>
            </div>

            {/* Search */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Kaynak ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    />
                </div>
            </div>

            {/* Sources Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSources.map(source => (
                    <div
                        key={source.id}
                        className={`bg-gray-800 rounded-xl border ${source.active ? 'border-gray-700' : 'border-gray-700/50 opacity-60'} p-5`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${source.active ? 'bg-green-900/30' : 'bg-gray-700'}`}>
                                    <Globe className={`w-5 h-5 ${source.active ? 'text-green-400' : 'text-gray-500'}`} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">{source.name}</h3>
                                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                                        {getTypeLabel(source.type)}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleToggleActive(source.id)}
                                className={`p-1.5 rounded-lg transition-colors ${source.active ? 'text-green-400 hover:bg-green-900/30' : 'text-gray-500 hover:bg-gray-700'
                                    }`}
                            >
                                {source.active ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                            </button>
                        </div>

                        <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mb-3"
                        >
                            {source.url}
                            <ExternalLink className="w-3 h-3" />
                        </a>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                            <span className="text-xs text-gray-500">
                                Son güncelleme: {source.lastCrawled || 'Henüz yok'}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleRefresh(source.id)}
                                    disabled={refreshing === source.id}
                                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                                    title="Yenile"
                                >
                                    <RefreshCw className={`w-4 h-4 ${refreshing === source.id ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingSource(source);
                                        setShowModal(true);
                                    }}
                                    className="p-2 hover:bg-blue-600 rounded-lg text-blue-400 hover:text-white transition-colors"
                                    title="Düzenle"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(source.id)}
                                    className="p-2 hover:bg-red-600 rounded-lg text-red-400 hover:text-white transition-colors"
                                    title="Sil"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Modal */}
            {showModal && editingSource && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">
                                {editingSource.id ? 'Kaynağı Düzenle' : 'Yeni Kaynak'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Kaynak Adı</label>
                                <input
                                    type="text"
                                    value={editingSource.name}
                                    onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    placeholder="Örn: Yargıtay Kararları"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">URL</label>
                                <input
                                    type="url"
                                    value={editingSource.url}
                                    onChange={(e) => setEditingSource({ ...editingSource, url: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Tür</label>
                                <select
                                    value={editingSource.type}
                                    onChange={(e) => setEditingSource({ ...editingSource, type: e.target.value as any })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                >
                                    <option value="yargitay">Yargıtay</option>
                                    <option value="danistay">Danıştay</option>
                                    <option value="anayasa">Anayasa Mahkemesi</option>
                                    <option value="resmigazete">Resmi Gazete</option>
                                    <option value="other">Diğer</option>
                                </select>
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
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                            >
                                <Save className="w-4 h-4" />
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LegalSources;
