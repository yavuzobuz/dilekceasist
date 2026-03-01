import React, { useState, useEffect } from 'react';
import { Search, Scale, FileText, X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { getLegalDocument, searchLegalDecisions } from '../utils/legalSearch';

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
    relevanceScore?: number;
    [key: string]: any;
}

interface LegalSearchPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onAddToPetition: (text: string, resultData?: { title: string; esasNo?: string; kararNo?: string; tarih?: string; daire?: string; ozet?: string }) => void;
    initialKeywords?: string[];
}

const LEGAL_SOURCES: LegalSource[] = [
    { id: 'yargitay', name: 'Yargitay', description: 'Yargitay Kararlari' },
    { id: 'danistay', name: 'Danistay', description: 'Danistay Kararlari' },
    { id: 'uyap', name: 'Emsal (UYAP)', description: 'UYAP Emsal Kararlari' },
    { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararlari' },
    { id: 'kik', name: 'KIK', description: 'Kamu Ihale Kurulu Kararlari' },
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
    const [loadingDocument, setLoadingDocument] = useState<string | null>(null);
    const [documentContent, setDocumentContent] = useState<{ [key: string]: string }>({});

    const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
    const [selectedDecision, setSelectedDecision] = useState<SearchResult | null>(null);
    const [selectedDecisionContent, setSelectedDecisionContent] = useState('');
    const [isDecisionContentLoading, setIsDecisionContentLoading] = useState(false);

    useEffect(() => {
        if (isOpen && initialKeywords.length > 0 && !keyword) {
            setKeyword(initialKeywords.slice(0, 3).join(' '));
        }
    }, [isOpen, initialKeywords, keyword]);

    const getResultId = (result: SearchResult, fallback: string) => {
        return result.documentId || result.id || fallback;
    };

    const handleSearch = async () => {
        if (!keyword.trim()) return;

        setIsLoading(true);
        setError(null);
        setResults([]);

        try {
            const parsedResults = await searchLegalDecisions({
                source: selectedSource,
                keyword: keyword.trim(),
                apiBaseUrl: API_BASE_URL,
            });
            setResults(parsedResults);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bilinmeyen bir hata olustu');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGetDocument = async (result: SearchResult, fallbackId: string): Promise<string> => {
        const docId = getResultId(result, fallbackId);

        if (documentContent[docId]) {
            return documentContent[docId];
        }

        setLoadingDocument(docId);

        try {
            const content = await getLegalDocument({
                source: selectedSource,
                documentId: docId,
                title: result.title,
                esasNo: result.esasNo,
                kararNo: result.kararNo,
                tarih: result.tarih,
                daire: result.daire,
                ozet: result.ozet,
                snippet: result.snippet,
                apiBaseUrl: API_BASE_URL,
            });

            if (content) {
                setDocumentContent(prev => ({ ...prev, [docId]: content }));
                return content;
            }
            return '';
        } catch (err) {
            console.error('Document fetch error:', err);
            return '';
        } finally {
            setLoadingDocument(null);
        }
    };

    const openDecisionModal = async (result: SearchResult, index: number) => {
        const fallbackId = `search-${index}`;
        setSelectedDecision(result);
        setIsDecisionModalOpen(true);
        setIsDecisionContentLoading(true);

        const content = await handleGetDocument(result, fallbackId);
        setSelectedDecisionContent(content || result.ozet || result.snippet || 'Tam metin getirilemedi.');
        setIsDecisionContentLoading(false);
    };

    const formatResultForPetition = (result: SearchResult): string => {
        const parts = [];

        if (result.daire) parts.push(result.daire);
        if (result.esasNo) parts.push(`E. ${result.esasNo}`);
        if (result.kararNo) parts.push(`K. ${result.kararNo}`);
        if (result.tarih) parts.push(`T. ${result.tarih}`);

        const citation = parts.length > 0 ? parts.join(', ') : (result.title || 'Ictihat');
        const summary = result.ozet || result.snippet || '';

        return `\n\n**${citation}**\n${summary}\n`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col border-t sm:border border-gray-700 shadow-2xl">
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600 rounded-lg">
                            <Scale className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-white">Ictihat Arama</h2>
                            <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Yargitay, Danistay ve diger mahkeme kararlarini arayin</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-4 sm:p-6 border-b border-gray-700 space-y-3 sm:space-y-4">
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
                            <p className="text-gray-400">Kararlar araniyor...</p>
                        </div>
                    )}

                    {!isLoading && results.length === 0 && keyword && !error && (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400">Sonuc bulunamadi</p>
                        </div>
                    )}

                    {!isLoading && results.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400 mb-4">
                                {results.length} sonuc bulundu
                            </p>

                            {results.map((result, index) => {
                                const docId = getResultId(result, String(index));
                                const score = typeof result.relevanceScore === 'number'
                                    ? Math.round(result.relevanceScore)
                                    : null;

                                return (
                                    <button
                                        key={docId}
                                        onClick={() => openDecisionModal(result, index)}
                                        className="w-full text-left bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-red-500/50 transition-colors"
                                    >
                                        <div className="p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <h3 className="font-semibold text-white truncate">
                                                            {result.title || result.daire || 'Karar'}
                                                        </h3>
                                                        {score !== null && (
                                                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                                                                Skor: {score}/100
                                                            </span>
                                                        )}
                                                    </div>
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
                                                    {loadingDocument === docId && (
                                                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                                                    )}
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onAddToPetition(
                                                                formatResultForPetition(result),
                                                                {
                                                                    title: result.title || result.daire || 'Karar',
                                                                    esasNo: result.esasNo,
                                                                    kararNo: result.kararNo,
                                                                    tarih: result.tarih,
                                                                    daire: result.daire,
                                                                    ozet: result.ozet || result.snippet,
                                                                }
                                                            );
                                                        }}
                                                        className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                                        title="Dilekceye Ekle"
                                                    >
                                                        <Plus className="w-5 h-5 text-white" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {isDecisionModalOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setIsDecisionModalOpen(false)}
                >
                    <div
                        className="w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-700">
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-white truncate">{selectedDecision?.title || 'Karar Detayi'}</h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    {selectedDecision?.esasNo ? `E. ${selectedDecision.esasNo} ` : ''}
                                    {selectedDecision?.kararNo ? `K. ${selectedDecision.kararNo} ` : ''}
                                    {selectedDecision?.tarih ? `T. ${selectedDecision.tarih}` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsDecisionModalOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-300" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[72vh]">
                            {isDecisionContentLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                                    <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                    Tam metin yukleniyor...
                                </div>
                            ) : (
                                <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">
                                    {selectedDecisionContent}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
