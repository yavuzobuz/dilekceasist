import React, { useMemo, useState } from 'react';
import { Header } from '../../components/Header';

type KarakaziResult = {
    documentId?: string;
    sourceUrl?: string;
    title?: string;
    snippet?: string;
    kararNo?: string;
    esasNo?: string;
    daire?: string;
    mahkeme?: string;
    kararTarihi?: string;
    documentHtml?: string;
    documentText?: string;
};

type KarakaziPayload = {
    keywords: string[];
    query: string;
    queryCandidates?: string[];
    results: KarakaziResult[];
    diagnostics?: Record<string, unknown>;
};

const formatKeyword = (value: string) => value.trim();

export default function KarakaziPage() {
    const [input, setInput] = useState('');
    const [keywords, setKeywords] = useState<string[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<KarakaziResult[]>([]);
    const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
    const [queryCandidates, setQueryCandidates] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const keywordChips = useMemo(
        () => keywords.map(formatKeyword).filter(Boolean),
        [keywords]
    );

    const runSearch = async () => {
        if (!input.trim()) {
            setError('Metin giriniz.');
            return;
        }
        setLoading(true);
        setError('');
        setResults([]);
        setDiagnostics(null);

        try {
            const response = await fetch('/api/legal/karakazi-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: input }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || 'Karakazi arama hatası.');
            }

            const payload = (await response.json()) as KarakaziPayload;
            setKeywords(payload.keywords || []);
            setQuery(payload.query || '');
            setQueryCandidates(payload.queryCandidates || []);
            setResults(payload.results || []);
            setDiagnostics(payload.diagnostics || null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0b0b10] text-white">
            <Header />
            <main className="mx-auto max-w-6xl px-6 py-10">
                <div className="mb-8">
                    <p className="text-xs uppercase tracking-[0.3em] text-red-400">Karakazi</p>
                    <h1 className="mt-2 text-3xl font-semibold text-white">Emsal Karar Arama (Playwright)</h1>
                    <p className="mt-3 max-w-3xl text-sm text-gray-300">
                        Uzun metni ver, model 5 anahtar kelime üretsin. Ardından mevzuat.adalet.gov.tr üzerinde
                        otomatik arama yapıp sonuçları getiriyoruz.
                    </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-1">
                    <section className="rounded-2xl border border-white/10 bg-[#121216] p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-white">Metin Girişi</h2>
                            <span className="text-xs text-gray-500">{input.length} karakter</span>
                        </div>
                        <textarea
                            className="mt-4 h-72 min-h-72 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-gray-100 focus:border-red-400 focus:outline-none"
                            placeholder="Uzun metni buraya yapıştır..."
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                        />
                        {error ? (
                            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                {error}
                            </div>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-3">
                            <button
                                className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                                onClick={runSearch}
                                disabled={loading}
                            >
                                {loading ? 'Aranıyor...' : 'Anahtar Kelime Çıkar + Ara'}
                            </button>
                            <button
                                className="rounded-full border border-white/15 px-4 py-2 text-xs text-gray-300 transition hover:border-white/30"
                                onClick={() => {
                                    setInput('');
                                    setKeywords([]);
                                    setQuery('');
                                    setQueryCandidates([]);
                                    setResults([]);
                                    setDiagnostics(null);
                                    setError('');
                                }}
                            >
                                Temizle
                            </button>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-[#121216] p-5">
                        <h2 className="text-sm font-semibold text-white">Anahtar Kelimeler</h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {keywordChips.length > 0 ? (
                                keywordChips.map((keyword) => (
                                    <span
                                        key={keyword}
                                        className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-gray-200"
                                    >
                                        {keyword}
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-gray-500">Henüz anahtar kelime yok.</span>
                            )}
                        </div>
                        <div className="mt-6">
                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Arama Sorgusu</div>
                            <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200">
                                {query || 'Sorgu oluşmadı.'}
                            </div>
                            {queryCandidates.length > 1 ? (
                                <div className="mt-3 space-y-2">
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Aday Sorgular</div>
                                    <div className="flex flex-wrap gap-2">
                                        {queryCandidates.map((candidate) => (
                                            <span
                                                key={candidate}
                                                className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-gray-300"
                                            >
                                                {candidate}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        {diagnostics ? (
                            <div className="mt-6">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Diagnostics</div>
                                <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-gray-300">
                                    {JSON.stringify(diagnostics, null, 2)}
                                </pre>
                            </div>
                        ) : null}
                    </section>
                </div>

                <section className="mt-8 rounded-2xl border border-white/10 bg-[#121216] p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">Sonuçlar</h2>
                        <span className="text-xs text-gray-500">{results.length} sonuç</span>
                    </div>
                    <div className="mt-4 grid gap-4">
                        {results.length === 0 ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-400">
                                Sonuç yok. Metni kısaltıp tekrar deneyin.
                            </div>
                        ) : (
                            results.map((item, index) => (
                                <article
                                    key={`${item.documentId || item.sourceUrl || index}`}
                                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                                >
                                    <div className="text-sm font-semibold text-white">
                                        {item.title || `Karar ${index + 1}`}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-400">
                                        {item.documentId ? `Belge ID: ${item.documentId}` : 'Belge ID bulunamadı'}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-400">
                                        {[item.esasNo, item.mahkeme, item.kararTarihi].filter(Boolean).join(' | ') || 'Satır özeti yok'}
                                    </div>
                                    {item.snippet ? (
                                        <p className="mt-3 text-sm text-gray-200">{item.snippet}</p>
                                    ) : null}
                                    {item.documentText ? (
                                        <details className="mt-3 rounded-lg border border-white/10 bg-black/30">
                                            <summary className="cursor-pointer px-3 py-2 text-xs text-red-300">
                                                Belge metnini göster
                                            </summary>
                                            <div className="border-t border-white/10 px-3 py-3 text-xs leading-6 text-gray-200">
                                                {item.documentText}
                                            </div>
                                        </details>
                                    ) : null}
                                    {item.sourceUrl ? (
                                        <a
                                            href={item.sourceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-3 inline-flex text-xs text-red-400 hover:text-red-300"
                                        >
                                            Kaynağa git
                                        </a>
                                    ) : null}
                                </article>
                            ))
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
