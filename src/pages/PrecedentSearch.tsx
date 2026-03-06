import React, { useState, useEffect, useRef } from 'react';
import {
    Search,
    Info,
    CheckCircle,
    Scale,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
    AlertCircle,
    Copy,
    Check,
    Sparkles,
    BrainCircuit,
} from 'lucide-react';
import { Header } from '../../components/Header';
import {
    compactLegalSearchQuery,
    searchLegalDecisions,
    type NormalizedLegalDecision,
} from '../utils/legalSearch';

// Component to handle floating copy button for selected text
const SelectableText = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    const [showCopyButton, setShowCopyButton] = useState(false);
    const [buttonPos, setButtonPos] = useState({ top: 0, left: 0 });
    const [isCopied, setIsCopied] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleSelection = () => {
            const selection = window.getSelection();
            if (
                selection &&
                selection.toString().trim().length > 0 &&
                textRef.current &&
                textRef.current.contains(selection.anchorNode)
            ) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Position button above the selection
                setButtonPos({
                    top: rect.top + window.scrollY - 40,
                    left: rect.left + window.scrollX + rect.width / 2 - 50,
                });
                setShowCopyButton(true);
            } else {
                if (!isCopied) {
                    setShowCopyButton(false);
                }
            }
        };

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, [isCopied]);

    const handleCopySelection = async () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            await navigator.clipboard.writeText(selection.toString());
            setIsCopied(true);
            setTimeout(() => {
                setIsCopied(false);
                setShowCopyButton(false);
                window.getSelection()?.removeAllRanges(); // Clear selection after copy
            }, 1500);
        }
    };

    return (
        <>
            <div ref={textRef} className={className}>
                {children}
            </div>
            {showCopyButton && (
                <button
                    onClick={handleCopySelection}
                    style={{ top: `${buttonPos.top}px`, left: `${buttonPos.left}px` }}
                    className="absolute z-50 flex items-center gap-1.5 bg-[#1A1A1D] border border-red-500/30 text-white px-3 py-1.5 rounded-lg shadow-2xl text-xs font-medium cursor-pointer transition-all animate-in fade-in zoom-in-95 hover:bg-[#25252A] hover:border-red-500/50"
                >
                    {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                        <Copy className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span>{isCopied ? 'Kopyalandı' : 'Kopyala'}</span>

                    {/* Tooltip arrow */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-red-500/30"></div>
                </button>
            )}
        </>
    );
};

export default function PrecedentSearch() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const [results, setResults] = useState<NormalizedLegalDecision[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | number | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set());
    const [isGuideOpen, setIsGuideOpen] = useState(false);

    const toggleExpand = (id: string | number) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [searchQuery]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setHasResults(false);
        setError(null);
        setResults([]);
        setExpandedIds(new Set());

        try {
            // Dual query yaklaşımı: retrieval için kısaltılmış, rerank/routing için ham sorgu
            const compactedKeyword = compactLegalSearchQuery(searchQuery);
            const apiResults = await searchLegalDecisions({
                keyword: compactedKeyword,
                rawQuery: searchQuery,
                source: 'all',
            });

            setResults(apiResults || []);
            setHasResults(true);
        } catch (err: any) {
            console.error('Legal search error:', err);
            setError(err.message || 'Karar aranırken bir hata oluştu.');
            setHasResults(true); // show error message area
        } finally {
            setIsSearching(false);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setHasResults(false);
        setResults([]);
        setError(null);
    };

    const insertExample = (text: string) => {
        setSearchQuery(text);
    };

    const handleCopyFull = async (content: string, id: string | number | undefined) => {
        if (!content || !id) return;
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-[#0F0F11] font-sans flex flex-col text-gray-300">
            <Header />

            {/* Header section with brand colors */}
            <div className="bg-gradient-to-br from-[#111113] via-[#0A0A0B] to-black text-white pt-16 pb-20 px-4 sm:px-6 relative overflow-hidden border-b border-white/5">
                {/* Subtle background decoration */}
                <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-red-600/10 to-transparent pointer-events-none"></div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="relative max-w-4xl mx-auto text-center space-y-6">
                    <div className="inline-flex items-center justify-center p-3 bg-[#1A1A1D] border border-white/10 rounded-full mb-4 shadow-lg shadow-red-500/10">
                        <Scale className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                        Emsal Karar Arama
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-light">
                        Yargıtay, Danıştay ve İstinaf Mahkemeleri emsal kararları içerisinde detaylı
                        arama yapın.
                    </p>
                </div>
            </div>

            {/* Main Search Bar - Pulled up to overlap header */}
            <div className="relative z-10 -mt-10 px-4 sm:px-6 w-full max-w-5xl mx-auto">
                <div className="bg-[#1A1A1D] rounded-2xl shadow-2xl p-4 border border-white/10 flex flex-col sm:flex-row gap-4 items-center transition-all duration-300 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500/40">
                    <div className="flex-1 w-full relative group flex flex-col justify-center">
                        <div className="absolute top-4 left-4 flex items-center pointer-events-none">
                            <Search
                                className={`w-5 h-5 transition-colors duration-300 ${searchQuery ? 'text-red-500' : 'text-gray-500'}`}
                            />
                        </div>
                        <form onSubmit={handleSearch} className="w-full">
                            <textarea
                                ref={textareaRef}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSearch(e as unknown as React.FormEvent);
                                    }
                                }}
                                rows={1}
                                placeholder='Örn: +"itirazın iptali" +"zaman aşımı" veya dava metnini yapıştırın...'
                                className="w-full pl-12 pr-12 py-4 bg-[#111113] border border-white/5 rounded-xl text-white placeholder-gray-600 text-lg focus:outline-none focus:ring-0 focus:border-white/10 transition-colors resize-none overflow-y-auto min-h-[60px] max-h-[300px]"
                                style={{ height: 'auto' }}
                            />
                        </form>
                        {searchQuery && (
                            <button
                                onClick={clearSearch}
                                className="absolute top-4 right-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
                                type="button"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    <div className="w-full sm:w-auto shrink-0 flex items-center pr-2">
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !searchQuery.trim()}
                            className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium py-4 px-8 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 border border-white/5"
                        >
                            {isSearching ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Aranıyor...</span>
                                </>
                            ) : (
                                <>
                                    <span>Karar Bul</span>
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Search Guide Button */}
                <div className="mt-5 flex justify-center">
                    <button
                        onClick={() => setIsGuideOpen(true)}
                        className="text-gray-400 hover:text-red-400 flex items-center gap-2 text-sm font-medium transition-colors bg-[#111113]/80 backdrop-blur border border-white/5 px-4 py-2 rounded-full hover:border-red-500/30 shadow-lg shadow-black/20 hover:shadow-red-500/10"
                    >
                        <Info className="w-4 h-4 text-red-500" />
                        Gelişmiş Arama Nasıl Yapılır? Rehberi Aç
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-12 space-y-10">
                {/* AI Semantic Search Explanation Banner */}
                <div className="bg-gradient-to-r from-red-900/20 to-black/40 rounded-2xl p-6 border border-red-500/20 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <BrainCircuit className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                        <div className="bg-[#1A1A1D] p-3 rounded-xl shadow-inner border border-white/5 shrink-0">
                            <Sparkles className="w-8 h-8 text-red-500" />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-lg font-bold text-white tracking-tight">
                                Yapay Zeka Destekli Semantik Arama Devrede
                            </h3>
                            <p className="text-gray-400 leading-relaxed text-sm lg:text-base max-w-3xl">
                                Aramalarınız sadece anahtar kelime eşleşmesine bakmaz. Yapay zeka
                                (AI) sistemimiz sonuçları{' '}
                                <strong>anlamsal olarak analiz eder</strong>, girdiğiniz konuyla
                                hukuki anlamda en yüksek eşleşen kararları tespit edip{' '}
                                <strong className="text-gray-200">
                                    kapsamlı bir metin analiziyle sıralar
                                </strong>
                                . İlgi alaka skoru en yüksek olanlar en üstte gösterilir.
                            </p>
                        </div>
                    </div>
                </div>

                {hasResults ? (
                    /* Search Results Area - Premium Look */
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {error ? (
                            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center shadow-lg">
                                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <h3 className="text-white font-semibold mb-1">Arama Hatası</h3>
                                <p className="text-gray-400 text-sm">{error}</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="bg-[#1A1A1D] border border-white/5 rounded-xl p-8 text-center shadow-lg">
                                <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                                <h3 className="text-white font-semibold mb-1">Kayıt Bulunamadı</h3>
                                <p className="text-gray-400 text-sm">
                                    Girdiğiniz arama terimleriyle eşleşen bir karar bulunamadı.
                                    Lütfen farklı kelimelerle veya rehberdeki kurallara göre tekrar
                                    deneyin.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Search className="w-5 h-5 text-red-500" />
                                        Arama Sonuçları
                                        <span className="text-sm font-normal text-gray-500 ml-2">
                                            ({results.length} sonuç bulundu)
                                        </span>
                                    </h2>
                                </div>

                                {/* Premium Result Cards List */}
                                <div className="space-y-8">
                                    {results.map((result, index) => {
                                        const uniqueId = result.id || `res-${index}`;
                                        const isThisCopied = copiedId === uniqueId;

                                        const score =
                                            result.relevanceScore != null
                                                ? Math.round(result.relevanceScore)
                                                : 100;
                                        // Skora göre renk belirleme mantığı (görsel zenginlik için)
                                        let scoreColorClass =
                                            'bg-green-900/40 text-green-400 border-green-500/20';
                                        if (score < 75)
                                            scoreColorClass =
                                                'bg-amber-900/40 text-amber-400 border-amber-500/20';
                                        if (score < 60)
                                            scoreColorClass =
                                                'bg-red-900/40 text-red-400 border-red-500/20';

                                        const contentToDisplay =
                                            result.snippet || result.ozet || 'İçerik bulunamadı.';
                                        const esasKarar = `Esas No: ${result.esasNo || '-'} — Karar No: ${result.kararNo || '-'}`;

                                        return (
                                            <div
                                                key={uniqueId}
                                                className="bg-[#1A1A1D] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col transition-all hover:border-red-500/30"
                                            >
                                                {/* Card Header */}
                                                <div className="bg-[#111113] border-b border-white/5 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div>
                                                        <div className="flex items-center flex-wrap gap-3 mb-1">
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gray-800 text-gray-300 border border-white/5 tracking-wide">
                                                                {result.daire ||
                                                                    result.source ||
                                                                    'Mahkeme'}
                                                            </span>
                                                            {result.tarih && (
                                                                <span className="text-sm font-medium text-gray-400">
                                                                    {result.tarih}
                                                                </span>
                                                            )}
                                                            <span
                                                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border cursor-help ${scoreColorClass}`}
                                                                title="Yapay Zeka Uyum Skoru"
                                                            >
                                                                Skor: {score}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-lg font-bold text-white mt-1">
                                                            {result.title &&
                                                            result.title !== result.daire
                                                                ? result.title
                                                                : esasKarar}
                                                        </h3>
                                                        {result.title &&
                                                            result.title !== result.daire && (
                                                                <div className="text-sm font-medium text-red-400/80 mt-0.5">
                                                                    {esasKarar}
                                                                </div>
                                                            )}
                                                    </div>
                                                    <div className="shrink-0 flex items-center gap-2 mt-2 sm:mt-0">
                                                        <button
                                                            onClick={() =>
                                                                handleCopyFull(
                                                                    `T.C. ${result.daire || result.source || 'Mahkeme'}\n${result.title || esasKarar}\nTarih: ${result.tarih || '-'}\n\n${contentToDisplay}`,
                                                                    uniqueId
                                                                )
                                                            }
                                                            className="flex items-center gap-2 px-4 py-2 bg-[#25252A] hover:bg-[#2D2D33] border border-white/10 text-white rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto justify-center"
                                                        >
                                                            {isThisCopied ? (
                                                                <Check className="w-4 h-4 text-green-400" />
                                                            ) : (
                                                                <Copy className="w-4 h-4 text-red-400" />
                                                            )}
                                                            <span className="shrink-0">
                                                                {isThisCopied
                                                                    ? 'Kopyalandı'
                                                                    : 'Tümünü Kopyala'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Card Body */}
                                                <div className="p-6">
                                                    <SelectableText className="prose prose-invert max-w-none text-gray-300 text-[15px] leading-relaxed selection:bg-red-500/30 selection:text-white">
                                                        <div className="whitespace-pre-wrap font-serif text-justify">
                                                            {(() => {
                                                                const isExpanded =
                                                                    expandedIds.has(uniqueId);
                                                                const words =
                                                                    contentToDisplay.split(/\s+/);
                                                                const isLong = words.length > 250;
                                                                const textToShow =
                                                                    !isLong || isExpanded
                                                                        ? contentToDisplay
                                                                        : words
                                                                              .slice(0, 250)
                                                                              .join(' ') + '...';

                                                                return (
                                                                    <>
                                                                        <p>{textToShow}</p>
                                                                        {isLong && (
                                                                            <button
                                                                                onClick={() =>
                                                                                    toggleExpand(
                                                                                        uniqueId
                                                                                    )
                                                                                }
                                                                                className="mt-4 flex items-center justify-center w-full py-2 bg-[#25252A] hover:bg-[#2D2D33] border border-white/10 text-gray-300 rounded-lg text-sm font-medium transition-colors"
                                                                            >
                                                                                {isExpanded ? (
                                                                                    <>
                                                                                        <span>
                                                                                            Metni
                                                                                            Daralt
                                                                                        </span>
                                                                                        <ChevronUp className="w-4 h-4 ml-2" />
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <span>
                                                                                            Devamını
                                                                                            Oku (Tüm
                                                                                            Metin)
                                                                                        </span>
                                                                                        <ChevronDown className="w-4 h-4 ml-2" />
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </SelectableText>
                                                </div>

                                                {/* Card Footer Hint */}
                                                <div className="bg-[#0A0A0B] px-6 py-3 border-t border-white/5 flex items-center gap-2 text-xs text-gray-500">
                                                    <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    <span>
                                                        İpucu: Sadece kullanmak istediğiniz
                                                        paragrafı fare ile basılı tutup seçerek
                                                        kopyalayabilirsiniz.
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    /* Empty state when no results yet */
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-[#1A1A1D] rounded-full flex items-center justify-center border border-white/5 shadow-inner">
                            <Scale className="w-8 h-8 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-white">Karar Aramaya Başlayın</h3>
                        <p className="text-gray-500 max-w-sm">
                            Yapay zeka asistanı, yazdığınız senaryoya en uygun Yargıtay kararlarını
                            saniyeler içinde anlamsal olarak bularak listeler.
                        </p>
                    </div>
                )}
            </div>

            {/* Guide Modal Overlay */}
            {isGuideOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-[#0F0F11] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col disable-scrollbars">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-[#0F0F11]/95 backdrop-blur border-b border-white/10 p-4 sm:p-6 flex items-center justify-between z-10 shadow-sm">
                            <div className="flex items-center gap-3">
                                <Info className="w-6 h-6 text-red-500" />
                                <h2 className="text-xl font-semibold text-white">
                                    Arama Kriterleri Rehberi
                                </h2>
                            </div>
                            <button
                                onClick={() => setIsGuideOpen(false)}
                                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-4 sm:p-6">
                            {/* Guide Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Card I */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            I
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Geniş Arama (VEYA Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelimeler arasına boşluk konularak arama
                                                yapıldığında yazılan kelimelerin{' '}
                                                <strong className="text-gray-200">
                                                    herhangi birinin
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() => insertExample('arsa payı')}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-red-500" />
                                                    <code className="text-sm font-semibold text-red-400">
                                                        arsa payı
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    İçeriğinde{' '}
                                                    <strong className="text-gray-300">arsa</strong>{' '}
                                                    VEYA{' '}
                                                    <strong className="text-gray-300">payı</strong>{' '}
                                                    kelimelerinden biri geçen evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card II */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            II
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Tam İfade Araması
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Çift tırnak içerisine yazılarak arama yapıldığında
                                                tırnak içerisinde yer alan{' '}
                                                <strong className="text-gray-200">
                                                    kelime öbeğinin aynen
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() => insertExample('"arsa payı"')}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-green-500" />
                                                    <code className="text-sm font-semibold text-green-400">
                                                        &quot;arsa payı&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    kelime öbeğinin bütün olarak geçtiği evrakları
                                                    getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card III */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            III
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Çoklu İfade Araması (VEYA Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Çift tırnak içerisinde birden fazla kelime öbeği
                                                yazıldığında, yazılan kelime öbeklerinin{' '}
                                                <strong className="text-gray-200">
                                                    herhangi birini
                                                </strong>{' '}
                                                içeren evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('"arsa payı" "bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-indigo-400" />
                                                    <code className="text-sm font-semibold text-indigo-400">
                                                        &quot;arsa payı&quot; &quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    VEYA{' '}
                                                    <strong className="text-gray-300">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    öbeklerinden biri geçen evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card IV */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-red-500/30 shadow-lg ring-1 ring-red-500/10 relative overflow-hidden">
                                    {/* Highlight ribbon */}
                                    <div className="absolute top-0 right-0 bg-red-600/90 text-white text-[10px] uppercase font-bold px-3 py-1 pb-1.5 rounded-bl-lg">
                                        Tavsiye Edilen
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="bg-red-900/40 border border-red-500/20 p-2.5 rounded-lg shrink-0 text-red-400 font-bold text-sm">
                                            IV
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-white flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-red-500" />
                                                Kesişim Araması (VE Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelimelerin başına{' '}
                                                <strong className="text-red-400 bg-red-900/30 px-1 rounded border border-red-500/20">
                                                    + (artı)
                                                </strong>{' '}
                                                işareti konularak arama yapıldığında,{' '}
                                                <strong className="text-gray-200">
                                                    kelimelerin hepsinin aynı anda
                                                </strong>{' '}
                                                geçtiği evrakları getirir.
                                            </p>
                                            <div
                                                className="bg-red-900/10 p-4 rounded-lg border border-red-500/20 mt-2 hover:bg-red-900/20 cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('+"arsa payı" +"bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-red-500" />
                                                    <code className="text-sm font-bold text-red-400">
                                                        +&quot;arsa payı&quot; +&quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    İçeriğinde HEM{' '}
                                                    <strong className="text-gray-200">
                                                        arsa payı
                                                    </strong>{' '}
                                                    HEM DE{' '}
                                                    <strong className="text-gray-200">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    kelime öbeklerini{' '}
                                                    <span className="underline decoration-red-500/50 underline-offset-2">
                                                        birlikte
                                                    </span>{' '}
                                                    içeren evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card V */}
                                <div className="bg-[#1A1A1D] rounded-xl p-6 border border-white/10 shadow-lg hover:border-white/20 transition-colors md:col-span-2 lg:col-span-1">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-[#111113] border border-white/5 p-2.5 rounded-lg shrink-0 text-white font-bold text-sm">
                                            V
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-medium text-white">
                                                Dışlama Araması (HARİÇ Mantığı)
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Kelime öbeklerinin başına{' '}
                                                <strong className="text-red-400 bg-red-900/30 px-1 rounded border border-red-500/20">
                                                    - (eksi)
                                                </strong>{' '}
                                                işareti konularak aranan evrakların{' '}
                                                <strong className="text-gray-200">
                                                    o kelimeyi içermemesi
                                                </strong>{' '}
                                                sağlanır.
                                            </p>
                                            <div
                                                className="bg-[#111113] p-4 rounded-lg border border-white/5 mt-2 hover:bg-[#25252A] cursor-pointer transition-colors"
                                                onClick={() =>
                                                    insertExample('+"arsa payı" -"bozma sebebi"')
                                                }
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Search className="w-4 h-4 text-rose-500" />
                                                    <code className="text-sm font-semibold text-rose-400">
                                                        +&quot;arsa payı&quot; -&quot;bozma
                                                        sebebi&quot;
                                                    </code>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    İçeriğinde{' '}
                                                    <strong className="text-gray-300">
                                                        arsa payı
                                                    </strong>{' '}
                                                    geçen AMA{' '}
                                                    <strong className="text-rose-400">
                                                        bozma sebebi
                                                    </strong>{' '}
                                                    kelime öbeği{' '}
                                                    <span className="font-bold">geçmeyen</span>{' '}
                                                    evrakları getirir.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Helper alert */}
                                <div className="bg-amber-900/10 rounded-xl p-6 border border-amber-500/20 shadow-lg md:col-span-2 lg:col-span-1 flex flex-col justify-center">
                                    <div className="flex gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                                        <div>
                                            <h3 className="font-medium text-amber-500 mb-2">
                                                Önemli İpucu
                                            </h3>
                                            <p className="text-sm text-gray-400 leading-relaxed">
                                                Arama kutusuna kopyala-yapıştır yaparken tırnak
                                                işaretlerinin doğru formatta ({' '}
                                                <strong className="text-white">" "</strong> )
                                                olduğuna dikkat edin. Akıllı tırnaklar ( “ ” ) arama
                                                sistemini yanıltabilir.
                                            </p>
                                            <p className="text-sm text-amber-400/80 mt-2 font-medium">
                                                Yukarıdaki örnek kutulara tıklayarak arama çubuğuna
                                                otomatik ekleyebilirsiniz.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
