import React, { useState, useEffect } from 'react';
import { FileText, Search, Filter, ArrowLeft, Loader2, Crown, Users, X, Check, HeartCrack, Banknote, Gavel, Home, Building2, Siren, ClipboardList, Scale, Scroll, UserPlus } from 'lucide-react';
import { ClientManager } from '../components/ClientManager';
import { Client } from '../types';

const IconMap: Record<string, React.FC<any>> = {
    HeartCrack, Banknote, Gavel, Home, Building2, Siren, ClipboardList, Scale, Scroll, FileText
};

interface Template {
    id: string;
    category: string;
    subcategory: string;
    title: string;
    description: string;
    icon: string;
    isPremium: boolean;
    usageCount: number;
    variableCount: number;
}

interface TemplateDetail {
    id: string;
    category: string;
    subcategory: string;
    title: string;
    description: string;
    icon: string;
    content: string;
    variables: Array<{
        key: string;
        label: string;
        type: string;
        placeholder?: string;
        required?: boolean;
    }>;
    isPremium: boolean;
    usageCount: number;
}

interface TemplatesPageProps {
    onBack: () => void;
    onUseTemplate: (content: string) => void;
}

const CATEGORIES = [
    { id: 'all', name: 'Tümü', icon: 'ClipboardList' },
    { id: 'Hukuk', name: 'Hukuk', icon: 'Scale' },
    { id: 'İcra', name: 'İcra', icon: 'Scroll' },
    { id: 'İş Hukuku', name: 'İş Hukuku', icon: 'Briefcase' },
    { id: 'Ceza', name: 'Ceza', icon: 'Siren' },
    { id: 'İdari', name: 'İdari', icon: 'Building2' },
];

const API_BASE_URL = '';

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onBack, onUseTemplate }) => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    // Client Manager State
    const [showClientManager, setShowClientManager] = useState(false);
    const [clientManagerMode, setClientManagerMode] = useState<'manage' | 'select'>('manage');
    const [targetVariablePrefix, setTargetVariablePrefix] = useState<string | null>(null); // e.g., 'DAVACI' to fill DAVACI_AD, DAVACI_TC, etc.

    useEffect(() => {
        fetchTemplates();
    }, [selectedCategory]);

    const fetchTemplates = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const url = selectedCategory === 'all'
                ? `${API_BASE_URL}/api/templates`
                : `${API_BASE_URL}/api/templates?category=${encodeURIComponent(selectedCategory)}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Şablonlar yüklenemedi');

            const data = await response.json();
            setTemplates(data.templates || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bir hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTemplateDetail = async (id: string) => {
        setIsLoadingTemplate(true);

        try {
            // Use query param instead of path param for consolidated API
            const response = await fetch(`${API_BASE_URL}/api/templates?id=${encodeURIComponent(id)}`);
            if (!response.ok) throw new Error('Şablon yüklenemedi');

            const data = await response.json();
            setSelectedTemplate(data.template);
            setVariableValues({});
        } catch (err) {
            console.error('Template fetch error:', err);
        } finally {
            setIsLoadingTemplate(false);
        }
    };

    const handleUseTemplate = async () => {
        if (!selectedTemplate) return;

        setIsGenerating(true);

        try {
            console.log('Sending variables to template:', variableValues);

            // Use POST to consolidated endpoint with id in body
            const response = await fetch(`${API_BASE_URL}/api/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedTemplate.id, variables: variableValues })
            });

            if (!response.ok) throw new Error('Şablon kullanılamadı');

            const data = await response.json();
            onUseTemplate(data.content);
        } catch (err) {
            console.error('Template use error:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    const filteredTemplates = templates.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
            {/* Header */}
            <header className="border-b border-gray-700 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => {
                                    setClientManagerMode('manage');
                                    setShowClientManager(true);
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
                            >
                                <Users className="w-4 h-4 text-red-500" />
                                <span className="hidden sm:inline">Müvekkillerim</span>
                            </button>
                            <div className="hidden sm:block">
                                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                    Şablon Galerisi
                                </h1>
                                <p className="text-sm text-gray-400 hidden md:block">Hazır dilekçe şablonlarından seçin</p>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative w-full sm:w-64 md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Şablon ara..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Categories */}
                <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${selectedCategory === cat.id
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            <span>
                                {(() => {
                                    const Icon = IconMap[cat.icon] || FileText;
                                    return <Icon className="w-5 h-5" />;
                                })()}
                            </span>
                            {cat.name}
                        </button>
                    ))}
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
                        <p className="text-gray-400">Şablonlar yükleniyor...</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
                        {error}
                    </div>
                )}

                {/* Templates Grid */}
                {!isLoading && !error && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredTemplates.map((template) => (
                            <div
                                key={template.id}
                                onClick={() => fetchTemplateDetail(template.id)}
                                className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 cursor-pointer hover:border-red-500 hover:bg-gray-800 transition-all group"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <span className="text-4xl text-red-500">
                                        {(() => {
                                            const Icon = IconMap[template.icon] || FileText;
                                            return <Icon className="w-10 h-10" />;
                                        })()}
                                    </span>
                                    {template.isPremium && (
                                        <span className="flex items-center gap-1 px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
                                            <Crown className="w-3 h-3" />
                                            Premium
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-red-400 transition-colors">
                                    {template.title}
                                </h3>

                                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                                    {template.description}
                                </p>

                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span className="bg-gray-700 px-2 py-1 rounded">
                                        {template.subcategory}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {template.usageCount} kullanım
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && filteredTemplates.length === 0 && (
                    <div className="text-center py-20">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-400 mb-2">Şablon Bulunamadı</h3>
                        <p className="text-gray-500">Farklı bir kategori veya arama terimi deneyin</p>
                    </div>
                )}
            </div>

            {/* Template Detail Modal */}
            {(selectedTemplate || isLoadingTemplate) && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col border-t sm:border border-gray-700 shadow-2xl">
                        {isLoadingTemplate ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
                            </div>
                        ) : selectedTemplate && (
                            <>
                                {/* Modal Header */}
                                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="text-2xl sm:text-3xl text-red-500 flex-shrink-0">
                                            {(() => {
                                                const Icon = IconMap[selectedTemplate.icon] || FileText;
                                                return <Icon className="w-8 h-8 sm:w-10 sm:h-10" />;
                                            })()}
                                        </span>
                                        <div className="min-w-0">
                                            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{selectedTemplate.title}</h2>
                                            <p className="text-xs sm:text-sm text-gray-400">{selectedTemplate.subcategory}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedTemplate(null)}
                                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0 ml-2"
                                    >
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                {/* Modal Content - Variable Form */}
                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                    <p className="text-gray-400 mb-6">{selectedTemplate.description}</p>

                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        <Filter className="w-4 h-4 text-red-500" />
                                        Bilgileri Doldurun
                                    </h3>

                                    {/* Helper function to check if a variable is a person/company name field */}
                                    {/* We will render the selection button directly inside the loop */}
                                    {(() => {
                                        // Define fields that should have a client selector
                                        const isClientField = (key: string) => {
                                            const upperKey = key.toUpperCase();
                                            // Strict check: Must END with _AD or be one of the known role keys
                                            return upperKey.endsWith('_AD') ||
                                                ['SIKAYET_EDEN', 'SUPHELI', 'KIRAYA_VEREN', 'KIRACI', 'BORCLU', 'ALACAKLI', 'VEKIL', 'MÜVEKKİL'].includes(upperKey);
                                        };

                                        return selectedTemplate.variables.map((variable) => (
                                            <div key={variable.key}>
                                                <div className="flex justify-between items-end mb-1">
                                                    <label className="block text-sm font-medium text-gray-300">
                                                        {variable.label}
                                                        {variable.required && <span className="text-red-500 ml-1">*</span>}
                                                    </label>

                                                    {isClientField(variable.key) && (
                                                        <button
                                                            onClick={() => {
                                                                setTargetVariablePrefix(variable.key); // We pass the exact key of the name field
                                                                setClientManagerMode('select');
                                                                setShowClientManager(true);
                                                            }}
                                                            className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors bg-red-900/20 px-2 py-0.5 rounded"
                                                        >
                                                            <UserPlus className="w-3 h-3" />
                                                            Kişi Seç
                                                        </button>
                                                    )}
                                                </div>
                                                {variable.type === 'textarea' ? (
                                                    <textarea
                                                        value={variableValues[variable.key] || ''}
                                                        onChange={(e) => setVariableValues(prev => ({
                                                            ...prev,
                                                            [variable.key]: e.target.value
                                                        }))}
                                                        placeholder={variable.placeholder}
                                                        rows={3}
                                                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                    />
                                                ) : (
                                                    <input
                                                        type={variable.type === 'date' ? 'date' : variable.type === 'number' ? 'number' : 'text'}
                                                        value={variableValues[variable.key] || ''}
                                                        onChange={(e) => setVariableValues(prev => ({
                                                            ...prev,
                                                            [variable.key]: e.target.value
                                                        }))}
                                                        placeholder={variable.placeholder}
                                                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                                                    />
                                                )}
                                            </div>
                                        ))
                                    })()}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-4 sm:p-6 border-t border-gray-700 flex gap-2 sm:gap-3">
                                    <button
                                        onClick={() => setSelectedTemplate(null)}
                                        className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        onClick={handleUseTemplate}
                                        disabled={isGenerating}
                                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Oluşturuluyor...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-5 h-5" />
                                                Dilekçe Oluştur
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {showClientManager && (
                <ClientManager
                    mode={clientManagerMode}
                    onClose={() => setShowClientManager(false)}
                    onSelect={(client: Client) => {
                        if (targetVariablePrefix) {
                            // targetVariablePrefix is the EXACT key of the name field (e.g., 'DAVACI_AD' or 'SIKAYET_EDEN')

                            const updates: Record<string, string> = {};

                            // 1. Fill the Name field
                            updates[targetVariablePrefix] = client.name;

                            // 2. Try to find and fill related fields (TC, Address)
                            // We look for variables in the template that share the same prefix structure

                            // Heuristic A: Prefix is like 'DAVACI_AD' -> Group is 'DAVACI'
                            let groupPrefix = '';
                            if (targetVariablePrefix.endsWith('_AD')) {
                                groupPrefix = targetVariablePrefix.replace('_AD', '');
                            }
                            // Heuristic B: Prefix is like 'SIKAYET_EDEN' -> It IS the group prefix
                            else {
                                groupPrefix = targetVariablePrefix;
                            }

                            // Helper to find a matching variable key in the template
                            const findKey = (suffix: string) => {
                                return selectedTemplate?.variables.find(v =>
                                    v.key === `${groupPrefix}_${suffix}` ||
                                    v.key === `${targetVariablePrefix}_${suffix}` // Try full prefix too
                                )?.key;
                            };

                            // Logic for TC/VKN
                            const tcKey = findKey('TC') || findKey('VKN') || findKey('TC_NO') || findKey('KIMLIK_NO');
                            if (tcKey) updates[tcKey] = client.tc_vk_no || '';

                            // Logic for Address
                            const addressKey = findKey('ADRES');
                            if (addressKey) updates[addressKey] = client.address || '';

                            // Also map phone/email if variables exist
                            const phoneKey = findKey('TELEFON');
                            if (phoneKey) updates[phoneKey] = client.phone || '';

                            setVariableValues(prev => ({ ...prev, ...updates }));
                            setShowClientManager(false);
                            setTargetVariablePrefix(null);
                        }
                    }}
                />
            )}
        </div>
    );
};
