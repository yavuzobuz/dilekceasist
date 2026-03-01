import React, { useState, useEffect } from 'react';
import {
    FileText, Plus, Search, Edit2, Trash2, Eye, X, Save,
    ChevronDown, Loader2, AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Template types from templates-part files
interface TemplateVariable {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
}

interface Template {
    id: string;
    category: string;
    subcategory: string;
    title: string;
    description: string;
    icon: string;
    variables: TemplateVariable[];
    content: string;
    isPremium: boolean;
    usageCount: number;
    variableCount?: number;
}

const CATEGORIES = ['Hukuk', 'İcra', 'İş Hukuku', 'Ceza', 'İdari'];

export const TemplateManagement: React.FC = () => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/templates');
            if (response.ok) {
                const data = await response.json();
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            toast.error('Şablonlar yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const filteredTemplates = templates.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const handleDelete = async (id: string) => {
        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;

        toast.success('Şablon silindi (demo)');
        setTemplates(templates.filter(t => t.id !== id));
    };

    const handleSave = async () => {
        if (!editingTemplate) return;

        toast.success('Şablon kaydedildi (demo)');
        setShowModal(false);
        setEditingTemplate(null);
        loadTemplates();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Şablon Yönetimi</h1>
                    <p className="text-gray-400">{templates.length} şablon mevcut</p>
                </div>
                <button
                    onClick={() => {
                        setEditingTemplate({
                            id: '',
                            category: 'Hukuk',
                            subcategory: '',
                            title: '',
                            description: '',
                            icon: 'FileText',
                            variables: [],
                            content: '',
                            isPremium: false,
                            usageCount: 0
                        });
                        setShowModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Yeni Şablon
                </button>
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Şablon ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                    >
                        <option value="all">Tüm Kategoriler</option>
                        {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Templates Grid */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                    </div>
                ) : filteredTemplates.length === 0 ? (
                    <div className="text-center py-16">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Şablon bulunamadı</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700 bg-gray-700/50">
                                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Şablon</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Kategori</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Değişkenler</th>
                                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Kullanım</th>
                                    <th className="text-right px-6 py-4 text-sm font-medium text-gray-300">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredTemplates.map((template) => (
                                    <tr key={template.id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="text-white font-medium">{template.title}</p>
                                                <p className="text-sm text-gray-500 truncate max-w-[250px]">
                                                    {template.description}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-gray-600 rounded text-sm text-gray-300">
                                                {template.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-gray-300">
                                                {template.variableCount ?? template.variables?.length ?? 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-gray-300">{template.usageCount}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setPreviewTemplate(template)}
                                                    className="p-2 hover:bg-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                                                    title="Önizle"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingTemplate(template);
                                                        setShowModal(true);
                                                    }}
                                                    className="p-2 hover:bg-blue-600 rounded-lg text-blue-400 hover:text-white transition-colors"
                                                    title="Düzenle"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(template.id)}
                                                    className="p-2 hover:bg-red-600 rounded-lg text-red-400 hover:text-white transition-colors"
                                                    title="Sil"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {showModal && editingTemplate && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">
                                {editingTemplate.id ? 'Şablonu Düzenle' : 'Yeni Şablon'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setEditingTemplate(null);
                                }}
                                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Başlık</label>
                                    <input
                                        type="text"
                                        value={editingTemplate.title}
                                        onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Kategori</label>
                                    <select
                                        value={editingTemplate.category}
                                        onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                    >
                                        {CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Açıklama</label>
                                <input
                                    type="text"
                                    value={editingTemplate.description}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">İçerik</label>
                                <textarea
                                    value={editingTemplate.content}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                                    rows={10}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-sm"
                                    placeholder="{{DEGISKEN_ADI}} formatında değişkenler kullanabilirsiniz"
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingTemplate.isPremium}
                                        onChange={(e) => setEditingTemplate({ ...editingTemplate, isPremium: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-600"
                                    />
                                    <span className="text-gray-300">Premium Şablon</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setEditingTemplate(null);
                                }}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                <Save className="w-4 h-4" />
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {previewTemplate && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">{previewTemplate.title}</h2>
                            <button
                                onClick={() => setPreviewTemplate(null)}
                                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-400 mb-4">{previewTemplate.description}</p>
                            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <p className="text-sm text-gray-500 mb-2">Önizleme için şablon detayına bakın (API'den alınacak)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplateManagement;
