import React, { useMemo, useState } from 'react';
import { Header } from '../../components/Header';
import {
    compactLegalSearchQuery,
    getLegalDocumentDebug,
    searchLegalDecisionsDebug,
    type LegalDocumentDebugResult,
    type LegalSearchDebugResult,
    type NormalizedLegalDecision,
} from '../utils/legalSearch';

const SOURCES = [
    { id: 'all', label: 'Tum Kaynaklar' },
    { id: 'yargitay', label: 'Yargitay' },
    { id: 'danistay', label: 'Danistay' },
    { id: 'uyap', label: 'UYAP Emsal' },
    { id: 'anayasa', label: 'Anayasa Mahkemesi' },
];
const SEARCH_AREAS = [
    { id: 'auto', label: 'Otomatik' },
    { id: 'ceza', label: 'Ceza' },
    { id: 'hukuk', label: 'Hukuk' },
    { id: 'danistay', label: 'Danistay' },
    { id: 'bam', label: 'BAM / Istinaf' },
];

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const Panel = ({
    title,
    children,
    className = '',
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) => (
    <section className={`rounded-2xl border border-white/10 bg-[#121216] ${className}`}>
        <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">{title}</div>
        <div className="p-4">{children}</div>
    </section>
);

export default function LegalSearchLiveTest() {
    const [source, setSource] = useState('all');
    const [searchArea, setSearchArea] = useState('auto');
    const [query, setQuery] = useState('ise iade feshin gecersizligi');
    const [searchDebug, setSearchDebug] = useState<LegalSearchDebugResult | null>(null);
    const [documentDebug, setDocumentDebug] = useState<LegalDocumentDebugResult | null>(null);
    const [selectedResult, setSelectedResult] = useState<NormalizedLegalDecision | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingDocument, setIsLoadingDocument] = useState(false);

    const compactedKeyword = useMemo(() => compactLegalSearchQuery(query), [query]);
    const rawSearchResponse = searchDebug ? prettyJson(searchDebug.response) : '';
    const rawDocumentResponse = documentDebug ? prettyJson(documentDebug.response) : '';

    const handleSearch = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        setError(null);
        setDocumentError(null);
        setSearchDebug(null);
        setDocumentDebug(null);
        setSelectedResult(null);

        try {
            const debug = await searchLegalDecisionsDebug({
                source,
                keyword: compactedKeyword,
                rawQuery: query,
                filters: { searchArea },
            });
            setSearchDebug(debug);
        } catch (searchError) {
            const message =
                searchError instanceof Error ? searchError.message : 'Canli arama sirasinda hata olustu.';
            setError(message);
        } finally {
            setIsSearching(false);
        }
    };

    const handleLoadDocument = async (result: NormalizedLegalDecision) => {
        setSelectedResult(result);
        setIsLoadingDocument(true);
        setDocumentDebug(null);
        setDocumentError(null);

        try {
            const debug = await getLegalDocumentDebug({
                source: result.source || source,
                documentId: result.documentId,
                documentUrl: result.documentUrl,
                title: result.title,
                esasNo: result.esasNo,
                kararNo: result.kararNo,
                tarih: result.tarih,
                daire: result.daire,
                ozet: result.ozet,
                snippet: result.snippet,
            });
            setDocumentDebug(debug);
        } catch (docError) {
            const message =
                docError instanceof Error ? docError.message : 'Belge canli olarak alinamadi.';
            setDocumentError(message);
        } finally {
            setIsLoadingDocument(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0b0b0d] text-gray-200">
            <Header />
            <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6">
                <div className="mb-8 rounded-3xl border border-red-500/20 bg-gradient-to-br from-[#17171d] via-[#101014] to-black p-6">
                    <h1 className="text-3xl font-bold text-white">Canli Karar Arama Testi</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-400">
                        Bu ekran test icin. Giden request, gelen ham JSON, normalize edilen karar listesi ve secilen kararin belge cevabi ayni yerde gorunur.
                    </p>
                </div>

                <Panel title="Canli Arama">
                    <form className="grid gap-4" onSubmit={handleSearch}>
                        <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
                            <label className="grid gap-2 text-sm text-gray-300">
                                <span>Kaynak</span>
                                <select
                                    className="rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-3 text-white outline-none"
                                    value={source}
                                    onChange={(event) => setSource(event.target.value)}
                                >
                                    {SOURCES.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="grid gap-2 text-sm text-gray-300">
                                <span>Arama Alani</span>
                                <select
                                    className="rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-3 text-white outline-none"
                                    value={searchArea}
                                    onChange={(event) => setSearchArea(event.target.value)}
                                >
                                    {SEARCH_AREAS.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="grid gap-2 text-sm text-gray-300">
                                <span>Sorgu</span>
                                <textarea
                                    className="min-h-[120px] rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-3 text-white outline-none"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-700"
                                disabled={isSearching || !query.trim()}
                                type="submit"
                            >
                                {isSearching ? 'Canli Araniyor...' : 'Canli Testi Baslat'}
                            </button>
                            <div className="rounded-xl border border-white/10 bg-[#0c0c10] px-4 py-3 text-xs text-gray-400">
                                compacted keyword: <span className="text-gray-200">{compactedKeyword || '-'}</span>
                            </div>
                        </div>
                    </form>
                </Panel>

                {error ? (
                    <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                {searchDebug ? (
                    <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="grid gap-6">
                            <Panel title="Arama Ozeti">
                                <div className="grid gap-3 md:grid-cols-4">
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-xs text-gray-500">Sure</div>
                                        <div className="mt-1 text-lg font-semibold text-white">{searchDebug.durationMs} ms</div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-xs text-gray-500">Normalize Sonuc</div>
                                        <div className="mt-1 text-lg font-semibold text-white">{searchDebug.normalizedResults.length}</div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-xs text-gray-500">Endpoint</div>
                                        <div className="mt-1 break-all text-xs text-gray-200">{searchDebug.endpoint}</div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-xs text-gray-500">Source</div>
                                        <div className="mt-1 text-lg font-semibold text-white">{source}</div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                        <div className="text-xs text-gray-500">Arama Alani</div>
                                        <div className="mt-1 text-lg font-semibold text-white">{searchArea}</div>
                                    </div>
                                </div>
                            </Panel>

                            <Panel title="Normalize Sonuclar">
                                <div className="grid gap-3">
                                    {searchDebug.normalizedResults.map((result, index) => (
                                        <button
                                            key={`${result.documentId || result.title || index}`}
                                            className={`rounded-2xl border p-4 text-left transition ${
                                                selectedResult?.documentId === result.documentId
                                                    ? 'border-red-500/60 bg-red-500/10'
                                                    : 'border-white/10 bg-black/20 hover:border-white/20'
                                            }`}
                                            onClick={() => handleLoadDocument(result)}
                                            type="button"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-white">{result.title || 'Baslik yok'}</div>
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        {result.source || source} | {result.documentId || 'documentId yok'}
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-white/10 px-2 py-1 text-xs text-gray-300">
                                                    score: {result.relevanceScore ?? '-'}
                                                </div>
                                            </div>
                                            {result.matchReason ? (
                                                <div className="mt-3 text-xs text-amber-200">{result.matchReason}</div>
                                            ) : null}
                                            {result.ozet ? (
                                                <div className="mt-3 line-clamp-4 text-sm text-gray-300">{result.ozet}</div>
                                            ) : null}
                                        </button>
                                    ))}
                                    {searchDebug.normalizedResults.length === 0 ? (
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-400">
                                            Normalize sonuc yok.
                                        </div>
                                    ) : null}
                                </div>
                            </Panel>
                        </div>

                        <div className="grid gap-6">
                            <Panel title="Arama Request JSON">
                                <pre className="max-h-[360px] overflow-auto rounded-xl bg-[#09090c] p-3 text-xs text-gray-300">
                                    {prettyJson(searchDebug.request)}
                                </pre>
                            </Panel>

                            <Panel title="Arama Ham Response JSON">
                                <pre className="max-h-[720px] overflow-auto rounded-xl bg-[#09090c] p-3 text-xs text-gray-300">
                                    {rawSearchResponse}
                                </pre>
                            </Panel>
                        </div>
                    </div>
                ) : null}

                {(selectedResult || documentDebug || documentError) ? (
                    <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="grid gap-6">
                            <Panel title="Belge Yukleme">
                                <div className="text-sm text-gray-300">
                                    {selectedResult ? (
                                        <>
                                            <div className="font-semibold text-white">{selectedResult.title || 'Baslik yok'}</div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                {selectedResult.documentId || 'documentId yok'}
                                            </div>
                                        </>
                                    ) : (
                                        'Bir sonuc sec.'
                                    )}
                                </div>
                                {isLoadingDocument ? (
                                    <div className="mt-4 text-sm text-gray-400">Belge canli olarak aliniyor...</div>
                                ) : null}
                                {documentError ? (
                                    <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                        {documentError}
                                    </div>
                                ) : null}
                                {documentDebug ? (
                                    <div className="mt-4 grid gap-3 text-sm">
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                            <div className="text-xs text-gray-500">Belge Endpoint</div>
                                            <div className="mt-1 break-all text-xs text-gray-200">{documentDebug.endpoint}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                            <div className="text-xs text-gray-500">Sure</div>
                                            <div className="mt-1 text-lg font-semibold text-white">{documentDebug.durationMs} ms</div>
                                        </div>
                                    </div>
                                ) : null}
                            </Panel>

                            {documentDebug ? (
                                <Panel title="Belge Request JSON">
                                    <pre className="max-h-[280px] overflow-auto rounded-xl bg-[#09090c] p-3 text-xs text-gray-300">
                                        {prettyJson(documentDebug.request)}
                                    </pre>
                                </Panel>
                            ) : null}

                            {documentDebug ? (
                                <Panel title="Belge Ham Response JSON">
                                    <pre className="max-h-[440px] overflow-auto rounded-xl bg-[#09090c] p-3 text-xs text-gray-300">
                                        {rawDocumentResponse}
                                    </pre>
                                </Panel>
                            ) : null}
                        </div>

                        {documentDebug ? (
                            <Panel title="Belge Metni">
                                <pre className="max-h-[980px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#09090c] p-4 text-xs leading-6 text-gray-200">
                                    {documentDebug.documentText || 'Belge metni bos dondu.'}
                                </pre>
                            </Panel>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
