import React, { useState, useEffect } from 'react';
import { Search, Scale, FileText, X, ChevronDown, Plus, Loader2, AlertCircle } from 'lucide-react';

interface LegalSource {
    id: string;
    name: string;
    description: string;
}

interface SearchResult {
    id?: string;
    documentId?: string;
    title?: string;
    esasNo?: string;
    kararNo?: string;
    tarih?: string;
    daire?: string;
    ozet?: string;
    snippet?: string;
    [key: string]: any;
}

interface LegalSearchPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onAddToPetition: (text: string, resultData?: { title: string; esasNo?: string; kararNo?: string; tarih?: string; daire?: string; ozet?: string }) => void;
    initialKeywords?: string[];
}

const LEGAL_SOURCES: LegalSource[] = [
    { id: 'yargitay', name: 'Yargıtay', description: 'Yargıtay Kararları' },
    { id: 'danistay', name: 'Danıştay', description: 'Danıştay Kararları' },
    { id: 'uyap', name: 'Emsal (UYAP)', description: 'UYAP Emsal Kararları' },
    { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararları' },
    { id: 'kik', name: 'KİK', description: 'Kamu İhale Kurulu Kararları' },
];

const API_BASE_URL = '';

export const LegalSearchPanel: React.FC<LegalSearchPanelProps> = ({
    isOpen,
    onClose,
    onAddToPetition,
    initialKeywords = [],
}) => {
    const [selectedSource, setSelectedSource] = useState<string>('yargitay');
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedResult, setExpandedResult] = useState<string | null>(null);
    const [loadingDocument, setLoadingDocument] = useState<string | null>(null);
    const [documentContent, setDocumentContent] = useState<{ [key: string]: string }>({});

    // Auto-fill keywords when panel opens
    useEffect(() => {
        if (isOpen && initialKeywords.length > 0 && !keyword) {
            setKeyword(initialKeywords.slice(0, 3).join(' '));
        }
    }, [isOpen, initialKeywords]);

    const handleSearch = async () => {
        if (!keyword.trim()) return;

        setIsLoading(true);
        setError(null);
        setResults([]);

        try {
            const response = await fetch(`${API_BASE_URL}/api/legal?action=search-decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: selectedSource,
                    keyword: keyword.trim(),
                }),
            });

            if (!response.ok) {
                throw new Error('Arama sırasında bir hata oluştu');
            }

            const data = await response.json();

            // Handle different response formats
            if (data.results) {
                if (Array.isArray(data.results)) {
                    setResults(data.results);
                } else if (data.results.content) {
                    // MCP returns content array
                    setResults(data.results.content || []);
                } else if (typeof data.results === 'object') {
                    setResults([data.results]);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGetDocument = async (result: SearchResult) => {
        const docId = result.documentId || result.id;
        if (!docId) return;

        setLoadingDocument(docId);

        try {
            const response = await fetch(`${API_BASE_URL}/api/legal?action=get-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: selectedSource,
                    documentId: docId,
                }),
            });

            if (!response.ok) {
                throw new Error('Belge alınamadı');
            }

            const data = await response.json();

            if (data.document) {
                const content = typeof data.document === 'string'
                    ? data.document
                    : data.document.content || JSON.stringify(data.document, null, 2);
                setDocumentContent(prev => ({ ...prev, [docId]: content }));
            }
        } catch (err) {
            console.error('Document fetch error:', err);
        } finally {
            setLoadingDocument(null);
        }
    };

    const formatResultForPetition = (result: SearchResult): string => {
        const parts = [];

        if (result.daire) parts.push(result.daire);
        if (result.esasNo) parts.push(`E. ${result.esasNo}`);
        if (result.kararNo) parts.push(`K. ${result.kararNo}`);
        if (result.tarih) parts.push(`T. ${result.tarih}`);

        const citation = parts.length > 0 ? parts.join(', ') : (result.title || 'İçtihat');
        const summary = result.ozet || result.snippet || '';

        return `\n\n**${citation}**\n${summary}\n`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col border-t sm:border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-lg">
                            <Scale className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-white">İçtihat Arama</h2>
                            <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Yargıtay, Danıştay ve diğer mahkeme kararlarını arayın</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Search Controls */}
                <div className="p-4 sm:p-6 border-b border-gray-700 space-y-3 sm:space-y-4">
                    {/* Source Selection */}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {LEGAL_SOURCES.map((source) => (
                            <button
                                key={source.id}
                                onClick={() => setSelectedSource(source.id)}
                                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${selectedSource === source.id
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                    }`}
                            >
                                {source.name}
                            </button>
                        ))}
                    </div>

                    {/* Search Input */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-gray-400" />
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Anahtar kelime girin..."
                                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors text-sm sm:text-base"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={isLoading || !keyword.trim()}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Search className="w-5 h-5" />
                            )}
                            Ara
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
                            <p className="text-gray-400">Kararlar aranıyor...</p>
                        </div>
                    )}

                    {!isLoading && results.length === 0 && keyword && !error && (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400">Sonuç bulunamadı</p>
                        </div>
                    )}

                    {!isLoading && results.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400 mb-4">
                                {results.length} sonuç bulundu
                            </p>

                            {results.map((result, index) => {
                                const docId = result.documentId || result.id || String(index);
                                const isExpanded = expandedResult === docId;

                                return (
                                    <div
                                        key={docId}
                                        className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors"
                                    >
                                        <div className="p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-white truncate">
                                                        {result.title || result.daire || 'Karar'}
                                                    </h3>
                                                    <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-400">
                                                        {result.esasNo && <span>E. {result.esasNo}</span>}
                                                        {result.kararNo && <span>K. {result.kararNo}</span>}
                                                        {result.tarih && <span>T. {result.tarih}</span>}
                                                    </div>
                                                    {(result.ozet || result.snippet) && (
                                                        <p className="mt-3 text-sm text-gray-300 line-clamp-2">
                                                            {result.ozet || result.snippet}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (!isExpanded && !documentContent[docId]) {
                                                                handleGetDocument(result);
                                                            }
                                                            setExpandedResult(isExpanded ? null : docId);
                                                        }}
                                                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                                                    >
                                                        {loadingDocument === docId ? (
                                                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                                                        ) : (
                                                            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => onAddToPetition(
                                                            formatResultForPetition(result),
                                                            {
                                                                title: result.title || result.daire || 'Karar',
                                                                esasNo: result.esasNo,
                                                                kararNo: result.kararNo,
                                                                tarih: result.tarih,
                                                                daire: result.daire,
                                                                ozet: result.ozet || result.snippet
                                                            }
                                                        )}
                                                        className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                                        title="Dilekçeye Ekle"
                                                    >
                                                        <Plus className="w-5 h-5 text-white" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {isExpanded && documentContent[docId] && (
                                            <div className="border-t border-gray-700 p-4 bg-gray-900/50 max-h-64 overflow-y-auto">
                                                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
                                                    {documentContent[docId]}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
