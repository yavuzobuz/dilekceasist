import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
    AlertCircle,
    ArrowUpRight,
    Check,
    ClipboardCopy,
    FileText,
    Loader2,
    Paperclip,
    Scale,
    Search,
    X,
} from 'lucide-react';
import { useLegalSearch } from '../../hooks/useLegalSearch';
import type { NormalizedLegalDecision } from '../../utils/legalSearch';

const getDecisionKey = (decision: Partial<NormalizedLegalDecision>, fallback = '') => (
    String(decision.documentId || decision.id || fallback || '').trim()
);

const inferMimeType = (file: File): string => {
    if (file.type) return file.type;
    const name = file.name.toLocaleLowerCase('tr-TR');
    if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (name.endsWith('.doc')) return 'application/msword';
    return 'application/pdf';
};

const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? (result.split(',')[1] || '') : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Dosya okunamadi.'));
        reader.readAsDataURL(file);
    });

const SummaryField = ({
    label,
    value,
}: {
    label: string;
    value: string;
}) => (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{label}</div>
        <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
);

export default function EmsalPanel() {
    const {
        search,
        fetchFullText,
        loading,
        analysis,
        decisions,
        error,
        fullTextCache,
    } = useLegalSearch();

    const [searchText, setSearchText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDecision, setSelectedDecision] = useState<NormalizedLegalDecision | null>(null);
    const [modalText, setModalText] = useState('');
    const [modalLoading, setModalLoading] = useState(false);
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
    const [searchInFlight, setSearchInFlight] = useState(false);
    const [searchVariants, setSearchVariants] = useState<string[]>([]);
    const [activeSearchVariant, setActiveSearchVariant] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fetchFullTextRef = useRef(fetchFullText);

    const normalizeQuery = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

    const extractCoreTerms = (value: string) => {
        const text = normalizeQuery(value);
        if (!text) return [];

        const stopWords = new Set([
            've', 'veya', 'ile', 'da', 'de', 'bir', 'bu', 'şu', 'o', 'mi', 'mı', 'mu', 'mü',
            'olan', 'olarak', 'için', 'gibi', 'ancak', 'fakat', 'lakin', 'ise', 'davacı', 'davalı',
            'dosyada', 'tarafından', 'hakkında', 'sonra', 'önce', 'sonunda', 'olarak',
        ]);

        return text
            .split(/[,\.\n;:]+|\s{2,}/g)
            .flatMap((chunk) => chunk.split(/\s+/g))
            .map((token) => token.replace(/[“”"'+()\-]/g, '').trim())
            .filter((token) => token && !stopWords.has(token.toLocaleLowerCase('tr-TR')))
            .filter((token) => token.length >= 3)
            .slice(0, 8);
    };

    const buildSearchVariants = (value: string) => {
        const base = normalizeQuery(value);
        const segments = base
            .split(/[.!?\n]+|(?:\s{2,})/g)
            .map((segment) => normalizeQuery(segment))
            .filter(Boolean);

        const coreTerms = extractCoreTerms(base);
        const firstFocus = normalizeQuery(segments[0] || base);
        const secondFocus = normalizeQuery(segments[1] || segments[0] || base);
        const thirdFocus = normalizeQuery(segments[2] || segments.at(-1) || base);

        const plusJoinedVariant = coreTerms.slice(0, 6).map((term) => `+${term}`).join(' ').trim();
        const phraseVariant = coreTerms.slice(2, 6).map((term) => `"${term}"`).join(' ').trim();
        const focusVariant = [secondFocus, thirdFocus].filter(Boolean).join(' ').trim() || base;

        return Array.from(new Set([
            firstFocus,
            plusJoinedVariant || focusVariant,
            phraseVariant || focusVariant,
        ].filter(Boolean))).slice(0, 3);
    };

    const runSearch = async (queryText: string) => {
        const text = normalizeQuery(queryText);
        if (!text && !selectedFile) return;

        if (selectedFile) {
            const mimeType = inferMimeType(selectedFile);
            const base64 = await readFileAsBase64(selectedFile);
            await search({
                text: text || undefined,
                documentBase64: base64,
                mimeType,
            });
            return;
        }

        await search({ text });
    };

    useEffect(() => {
        fetchFullTextRef.current = fetchFullText;
    }, [fetchFullText]);

    const selectedDecisionKey = useMemo(
        () => (selectedDecision ? getDecisionKey(selectedDecision) : ''),
        [selectedDecision]
    );

    useEffect(() => {
        if (!isModalOpen || !selectedDecisionKey) return;

        const cachedText = fullTextCache[selectedDecisionKey];
        if (Object.prototype.hasOwnProperty.call(fullTextCache, selectedDecisionKey)) {
            setModalText(cachedText || 'Tam metin getirilemedi.');
            setModalLoading(false);
            return;
        }

        let isActive = true;
        setModalLoading(true);
        setCopyState('idle');

        fetchFullTextRef.current(selectedDecisionKey)
            .then((text) => {
                if (!isActive) return;
                setModalText(text || 'Tam metin getirilemedi.');
            })
            .finally(() => {
                if (isActive) {
                    setModalLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [isModalOpen, selectedDecisionKey, fullTextCache]);

    const handleSearch = async () => {
        if (loading || searchInFlight) return;

        const text = normalizeQuery(searchText);
        if (!text && !selectedFile) return;

        setSelectedDecision(null);
        setIsModalOpen(false);
        setModalText('');
        setModalLoading(false);
        setCopyState('idle');
        setSearchVariants([]);
        setActiveSearchVariant(0);

        setSearchInFlight(true);
        try {
            const variants = buildSearchVariants(text);
            setSearchVariants(variants);
            setActiveSearchVariant(0);
            await runSearch(variants[0] || text);
        } finally {
            setSearchInFlight(false);
        }
    };

    const handleVariantSearch = async (variantIndex: number) => {
        if (loading || searchInFlight) return;

        const variant = searchVariants[variantIndex];
        if (!variant) return;

        setSearchInFlight(true);
        try {
            setActiveSearchVariant(variantIndex);
            await runSearch(variant);
        } finally {
            setSearchInFlight(false);
        }
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        event.target.value = '';
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openDecision = (decision: NormalizedLegalDecision) => {
        setSelectedDecision(decision);
        setIsModalOpen(true);
        setCopyState('idle');
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedDecision(null);
        setModalText('');
        setModalLoading(false);
        setCopyState('idle');
    };

    const handleCopy = async () => {
        if (!modalText.trim()) return;

        try {
            await navigator.clipboard.writeText(modalText);
            setCopyState('copied');
            window.setTimeout(() => setCopyState('idle'), 1200);
        } catch {
            setCopyState('idle');
        }
    };

    const analyzerResult = analysis?.documentAnalyzerResult;
    const laws = Array.isArray(analyzerResult?.ilgiliKanunlar)
        ? analyzerResult.ilgiliKanunlar
        : [];
    const summaryCaseTitle =
        analysis?.caseDetails?.caseTitle
        || analysis?.analysisInsights?.caseType
        || analyzerResult?.davaKonusu
        || '-';
    const summaryDaire = analyzerResult?.birimAdi || decisions[0]?.daire || '-';

    return (
        <div className="w-full rounded-3xl border border-white/10 bg-[#0f1115] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-red-600/20 p-3 text-red-300">
                        <Scale className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Emsal Paneli</h2>
                        <p className="mt-1 text-sm text-gray-400">
                            Metin ya da belge yükleyin, analiz alın ve tam metni gerektiğinde çağırın.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]">
                <section className="space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
                        <label htmlFor="emsal-search-text" className="mb-2 block text-sm font-medium text-gray-200">
                            Arama Metni
                        </label>
                        <textarea
                            id="emsal-search-text"
                            aria-label="Emsal arama metni"
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            placeholder="Kira temerrüt tahliye, işe iade, imar para cezası..."
                            rows={7}
                            className="w-full rounded-2xl border border-white/10 bg-[#11141a] px-4 py-3 text-sm leading-6 text-white placeholder:text-gray-500 outline-none transition focus:border-red-500/60"
                        />

                        <div
                            className={`mt-4 rounded-2xl border border-dashed p-4 transition ${
                                isDraggingFile
                                    ? 'border-red-500/60 bg-red-500/10'
                                    : selectedFile
                                        ? 'border-emerald-500/40 bg-emerald-500/10'
                                        : 'border-white/10 bg-[#11141a]'
                            }`}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setIsDraggingFile(true);
                            }}
                            onDragLeave={() => setIsDraggingFile(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setIsDraggingFile(false);
                                const file = event.dataTransfer.files?.[0];
                                if (!file) return;
                                setSelectedFile(file);
                            }}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-white">Belge Yükle</div>
                                    <div className="mt-1 text-xs text-gray-500">
                                        PDF veya Word yükleyin. İsterseniz metinle birlikte aynı aramada kullanılır.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Paperclip className="h-4 w-4" />
                                    Dosya Seç
                                </button>
                            </div>

                            {selectedFile ? (
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-white">{selectedFile.name}</div>
                                        <div className="mt-1 text-xs text-gray-500">
                                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearSelectedFile}
                                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleSearch}
                                disabled={loading || searchInFlight || (!searchText.trim() && !selectedFile)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-white/10"
                            >
                                {loading || searchInFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                {selectedFile ? 'Belgeyle Emsal Ara' : 'Emsal Ara'}
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={loading || searchInFlight}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Paperclip className="h-4 w-4" />
                                PDF / Word Yükle
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                aria-label="Emsal belge yükle"
                                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>

                        {searchVariants.length > 1 ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {searchVariants.map((variant, index) => (
                                    <button
                                        key={`${variant}-${index}`}
                                        type="button"
                                        onClick={() => handleVariantSearch(index)}
                                        disabled={loading || searchInFlight}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                            activeSearchVariant === index
                                                ? 'border-red-500/40 bg-red-500/15 text-red-100'
                                                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {index + 1}. arama
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <p className="mt-3 text-xs text-gray-500">
                            Yüklenen dosya base64'e çevrilir ve mevcut analiz akışına gönderilir.
                        </p>
                    </div>

                    {error ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>{error}</div>
                        </div>
                    ) : null}

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-white">Analiz Özeti</h3>
                                <p className="text-xs text-gray-500">Dava konusu, daire ve kanun referansları</p>
                            </div>
                            {loading ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    İşleniyor
                                </span>
                            ) : null}
                        </div>

                        {analyzerResult ? (
                            <div className="grid gap-3 md:grid-cols-3">
                                <SummaryField label="Dava Konusu" value={summaryCaseTitle} />
                                <SummaryField label="Daire" value={summaryDaire} />
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Kanunlar</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {laws.length > 0 ? (
                                            laws.map((law) => (
                                                <span
                                                    key={law}
                                                    className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100"
                                                >
                                                    {law}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-sm text-gray-400">Yok</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-gray-500">
                                Henüz bir analiz yok.
                            </div>
                        )}
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-white">Kararlar</h3>
                                <p className="text-xs text-gray-500">{decisions.length} sonuç</p>
                            </div>
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            ) : null}
                        </div>

                        <div className="space-y-3">
                            {!loading && decisions.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-gray-500">
                                    Arama sonucu bekleniyor.
                                </div>
                            ) : null}

                            {decisions.map((decision, index) => {
                                const key = getDecisionKey(decision, `decision-${index}`);
                                const sourceUrl = String(decision.documentUrl || decision.sourceUrl || '').trim();

                                return (
                                    <article
                                        key={key}
                                        className="rounded-2xl border border-white/10 bg-[#11141a] p-4 transition hover:border-red-500/30"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-red-300" />
                                                    <h4 className="truncate text-sm font-semibold text-white">
                                                        {decision.title || 'Karar'}
                                                    </h4>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                                                    {decision.daire ? <span>{decision.daire}</span> : null}
                                                    {decision.esasNo ? <span>E. {decision.esasNo}</span> : null}
                                                    {decision.kararNo ? <span>K. {decision.kararNo}</span> : null}
                                                    {decision.tarih ? <span>T. {decision.tarih}</span> : null}
                                                </div>
                                            </div>

                                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                                                <button
                                                    type="button"
                                                    onClick={() => openDecision(decision)}
                                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                                >
                                                    Tam Metin
                                                </button>
                                                {sourceUrl ? (
                                                    <a
                                                        href={sourceUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                                                    >
                                                        Kaynak
                                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                                    </a>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-500">
                                                        Kaynak
                                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>

            {isModalOpen && selectedDecision ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={closeModal}
                >
                    <div
                        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d1015] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div className="min-w-0">
                                <h3 className="truncate text-lg font-semibold text-white">
                                    {selectedDecision.title || 'Tam Metin'}
                                </h3>
                                <p className="mt-1 text-xs text-gray-500">
                                    {selectedDecision.daire ? `Daire: ${selectedDecision.daire}` : ''}
                                    {selectedDecision.esasNo ? `${selectedDecision.daire ? ' · ' : ''}E. ${selectedDecision.esasNo}` : ''}
                                    {selectedDecision.kararNo ? `${selectedDecision.esasNo || selectedDecision.daire ? ' · ' : ''}K. ${selectedDecision.kararNo}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {modalLoading ? (
                                <div className="flex min-h-[24rem] items-center justify-center text-gray-400">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Tam metin getiriliyor...
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-200">
                                    {modalText || 'Tam metin getirilemedi.'}
                                </pre>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                            <div className="text-xs text-gray-500">
                                {Object.prototype.hasOwnProperty.call(fullTextCache, selectedDecisionKey) ? 'Cache kullanildi' : 'Lazy fetch'}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    disabled={!modalText.trim()}
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {copyState === 'copied' ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                                    {copyState === 'copied' ? 'Kopyalandı' : 'Kopyala'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                                >
                                    Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
