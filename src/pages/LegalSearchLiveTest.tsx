import React, { useMemo, useState } from 'react';
import { Header } from '../../components/Header';
import {
    compactLegalSearchQuery,
    getLegalDocumentDebug,
    searchLegalDecisionsDebug,
    type LegalDocumentDebugResult,
    type LegalSearchDebugResult,
    type NormalizedLegalDecision,
    type PlanDiagnostics,
} from '../utils/legalSearch';

const SOURCES = [
    { id: 'all', label: 'Tum Kaynaklar' },
    { id: 'yargitay', label: 'Yargitay' },
    { id: 'danistay', label: 'Danistay' },
    { id: 'uyap', label: 'UYAP Emsal' },
    { id: 'anayasa', label: 'Anayasa Mahkemesi' },
] as const;

const LIVE_TEST_CASES = [
    {
        id: 'ise-iade',
        label: 'İş Hukuku - İşe İade',
        source: 'all',
        query:
            'Geçersiz nedenle feshedilen iş sözleşmesi nedeniyle işe iade, boşta geçen süre ücreti ve işe başlatmama tazminatı talebi.',
        note: 'Is hukuku ekseninde fesih ve ise iade aramasini kontrol eder.',
    },
    {
        id: 'fazla-mesai',
        label: 'İş Hukuku - Fazla Mesai',
        source: 'all',
        query:
            'Haftalık 45 saati aşan çalışma nedeniyle fazla mesai alacağı, puantaj kayıtları ve tanık anlatımlarıyla ispat.',
        note: 'Iscilik alacagi ve fazla mesai kararlarini kontrol eder.',
    },
    {
        id: 'uyusturucu',
        label: 'Ceza - Uyuşturucu',
        source: 'all',
        query:
            'Sanığın üzerinde ve evinde arama yapılmasına rağmen satış bedeline, hassas teraziye ya da paketlenmiş satış materyaline rastlanmaması; ele geçen miktarın kullanma sınırları içinde kalması ve dosyada başkaca ticaret ilişkisini gösteren somut delil bulunmaması halinde, uyuşturucu madde ticareti suçu yerine kullanmak için bulundurma ihtimali güçlenir.',
        note: 'Uzun ceza metninde AI plan ve hibrit siralama davranisini kontrol eder.',
    },
    {
        id: 'imar-para-cezasi',
        label: 'İdare - İmar Para Cezası',
        source: 'all',
        query:
            'Ruhsatsız yapı nedeniyle belediye encümenince verilen imar para cezası ile yıkım kararının iptali ve yürütmenin durdurulması talebi.',
        note: 'Danistay ve idari yargi eksenini kontrol eder.',
    },
    {
        id: 'itirazin-iptali',
        label: 'Hukuk - İtirazın İptali',
        source: 'all',
        query:
            'Borca itiraz üzerine açılan itirazın iptali davasında icra takibi, fatura, cari hesap alacağı ve inkar tazminatı talebi.',
        note: 'Icra ve alacak eksenli hukuk kararlarini kontrol eder.',
    },
] as const;

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const formatScore = (value?: number) =>
    Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '-';

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

const StatCard = ({
    label,
    value,
    tone = 'text-white',
}: {
    label: string;
    value: React.ReactNode;
    tone?: string;
}) => (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</div>
        <div className={`mt-2 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
);

const Pill = ({ value, tone = 'default' }: { value: string; tone?: 'default' | 'good' | 'warn' }) => {
    const toneClass =
        tone === 'good'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : tone === 'warn'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              : 'border-white/10 bg-black/20 text-gray-200';

    return <span className={`rounded-full border px-3 py-1 text-xs ${toneClass}`}>{value}</span>;
};

type LiveCase = (typeof LIVE_TEST_CASES)[number];

interface LiveCaseResult {
    id: string;
    label: string;
    source: string;
    query: string;
    note: string;
    status: 'success' | 'error';
    durationMs: number;
    resultCount: number;
    firstTitle: string;
    firstSource: string;
    firstStage: string;
    documentLength: number | null;
    error?: string;
}

const statusTone = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    error: 'border-red-500/30 bg-red-500/10 text-red-100',
};

const runLiveCase = async (testCase: LiveCase): Promise<LiveCaseResult> => {
    const startedAt = performance.now();

    try {
        const debug = await searchLegalDecisionsDebug({
            source: testCase.source,
            keyword: compactLegalSearchQuery(testCase.query),
            rawQuery: testCase.query,
        });

        const first = debug.normalizedResults[0] || null;
        let documentLength: number | null = null;

        if (first?.documentId || first?.documentUrl) {
            try {
                const documentDebug = await getLegalDocumentDebug({
                    source: first.source || testCase.source,
                    documentId: first.documentId,
                    documentUrl: first.documentUrl,
                    title: first.title,
                    esasNo: first.esasNo,
                    kararNo: first.kararNo,
                    tarih: first.tarih,
                    daire: first.daire,
                    ozet: first.ozet,
                    snippet: first.snippet,
                });
                documentLength = documentDebug.documentText.length;
            } catch {
                documentLength = null;
            }
        }

        return {
            id: testCase.id,
            label: testCase.label,
            source: testCase.source,
            query: testCase.query,
            note: testCase.note,
            status: debug.normalizedResults.length > 0 ? 'success' : 'error',
            durationMs: Math.round(performance.now() - startedAt),
            resultCount: debug.normalizedResults.length,
            firstTitle: first?.title || '-',
            firstSource: first?.source || '-',
            firstStage: first?.retrievalStage || first?.matchStage || '-',
            documentLength,
            error: debug.normalizedResults.length > 0 ? undefined : 'Sonuc donmedi.',
        };
    } catch (error) {
        return {
            id: testCase.id,
            label: testCase.label,
            source: testCase.source,
            query: testCase.query,
            note: testCase.note,
            status: 'error',
            durationMs: Math.round(performance.now() - startedAt),
            resultCount: 0,
            firstTitle: '-',
            firstSource: '-',
            firstStage: '-',
            documentLength: null,
            error: error instanceof Error ? error.message : 'Canli test patladi.',
        };
    }
};

export default function LegalSearchLiveTest() {
    const [source, setSource] = useState<string>('all');
    const [query, setQuery] = useState<string>(LIVE_TEST_CASES[0].query);
    const [searchDebug, setSearchDebug] = useState<LegalSearchDebugResult | null>(null);
    const [documentDebug, setDocumentDebug] = useState<LegalDocumentDebugResult | null>(null);
    const [selectedResult, setSelectedResult] = useState<NormalizedLegalDecision | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingDocument, setIsLoadingDocument] = useState(false);
    const [suiteResults, setSuiteResults] = useState<LiveCaseResult[]>([]);
    const [isRunningSuite, setIsRunningSuite] = useState(false);

    const compactedKeyword = useMemo(() => compactLegalSearchQuery(query), [query]);
    const rawSearchResponse = searchDebug ? prettyJson(searchDebug.response) : '';
    const rawDocumentResponse = documentDebug ? prettyJson(documentDebug.response) : '';
    const aiSearchPlan = searchDebug?.response?.aiSearchPlan as
        | {
              queryMode?: 'short_issue' | 'long_fact' | 'document_style' | 'case_file';
              allowEvidenceAsCore?: boolean;
              legalArea?: string;
              primaryDomain?: string;
              secondaryDomains?: string[];
              coreIssue?: string;
              searchQuery?: string;
              semanticQuery?: string;
              searchClauses?: string[];
              queryVariantsTurkish?: string[];
              queryVariantsAscii?: string[];
              searchRounds?: Array<{
                  round?: string;
                  clauses?: string[];
                  asciiClauses?: string[];
              }>;
              keywords?: string[];
              retrievalConcepts?: string[];
              requiredConcepts?: string[];
              supportConcepts?: string[];
              evidenceConcepts?: string[];
              negativeConcepts?: string[];
              targetSources?: string[];
              sourceTargets?: string[];
              sourceReason?: string;
              optionalBirimCodes?: string[];
              domainProfileId?: string;
              reasoning?: string;
          }
        | undefined;
    const retrievalDiagnostics = searchDebug?.response?.retrievalDiagnostics as
        | {
              targetSources?: string[];
              queryVariantsTurkish?: string[];
              queryVariantsAscii?: string[];
              primaryDomain?: string;
              secondaryDomains?: string[];
              clauseRuns?: Array<{
                  source?: string;
                  clause?: string;
                  variant?: string;
                  round?: string;
                  count?: number;
                  ok?: boolean;
                  error?: string;
              }>;
              totalCandidates?: number;
              summaryPassedCount?: number;
              fullTextCheckedCount?: number;
              strictFinalCount?: number;
              fallbackFinalCount?: number;
              finalMatchedCount?: number;
              fallbackUsed?: boolean;
              zeroResultReason?: string;
              summaryThresholdCount?: number;
              requiredKeywordCount?: number;
              semanticModel?: string;
              legalArea?: string;
              requiredConcepts?: string[];
              retrievalConcepts?: string[];
              supportConcepts?: string[];
              evidenceConcepts?: string[];
              negativeConcepts?: string[];
          }
        | undefined;
    const planDiagnostics = searchDebug?.response?.planDiagnostics as PlanDiagnostics | undefined;
    const results = searchDebug?.normalizedResults || [];
    const suiteSuccessCount = suiteResults.filter((item) => item.status === 'success').length;
    const suiteErrorCount = suiteResults.filter((item) => item.status === 'error').length;

    const applyTestCase = (testCase: LiveCase) => {
        setSource(testCase.source);
        setQuery(testCase.query);
        setError(null);
        setDocumentError(null);
    };

    const handleLoadDocument = async (result: NormalizedLegalDecision, silent = false) => {
        setSelectedResult(result);
        setIsLoadingDocument(true);
        if (!silent) {
            setDocumentDebug(null);
        }
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
        } catch (nextError) {
            setDocumentDebug(null);
            setDocumentError(
                nextError instanceof Error ? nextError.message : 'Belge metni alinamadi.'
            );
        } finally {
            setIsLoadingDocument(false);
        }
    };

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
            });
            setSearchDebug(debug);

            const firstResult = debug.normalizedResults[0];
            if (firstResult) {
                await handleLoadDocument(firstResult, true);
            }
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Arama hatasi olustu.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleRunSuite = async () => {
        setIsRunningSuite(true);
        setSuiteResults([]);

        const nextResults: LiveCaseResult[] = [];
        for (const testCase of LIVE_TEST_CASES) {
            const result = await runLiveCase(testCase);
            nextResults.push(result);
            setSuiteResults([...nextResults]);
        }

        setIsRunningSuite(false);
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <Header />

            <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8">
                <section className="rounded-[28px] border border-red-600/30 bg-[#09090d] p-6 shadow-[0_0_80px_rgba(185,28,28,0.08)] sm:p-8">
                    <p className="text-xs uppercase tracking-[0.3em] text-red-400">Canli teshis ekrani</p>
                    <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Canli Yargi MCP Test Paneli</h1>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300">
                        Bu ekran artik ayri frontend tahmini gostermiyor. Backendin gercek AI plani,
                        kullandigi kaynaklar, calistirdigi arama cumleleri ve finale hangi kararin neden
                        kaldigi burada gorunuyor.
                    </p>
                    <p className="mt-4 text-xs text-gray-500">Sayfa yolu: /emsal-karar-test</p>
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                    <Panel title="Hazir Canli Testler">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleRunSuite}
                                disabled={isRunningSuite}
                                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900/40"
                            >
                                {isRunningSuite ? 'Canli testler calisiyor...' : 'Tum Canli Testleri Calistir'}
                            </button>
                            <Pill value="Remote Yargi MCP + Gemini hibrit siralama" tone="good" />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            {LIVE_TEST_CASES.map((testCase) => (
                                <button
                                    key={testCase.id}
                                    type="button"
                                    onClick={() => applyTestCase(testCase)}
                                    className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-red-500/40 hover:bg-red-500/5"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-lg font-semibold text-white">{testCase.label}</div>
                                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">{testCase.source}</div>
                                        </div>
                                        <Pill value={testCase.source} />
                                    </div>
                                    <p className="mt-4 text-sm leading-7 text-gray-200">{testCase.query}</p>
                                    <p className="mt-4 text-xs leading-6 text-gray-500">{testCase.note}</p>
                                </button>
                            ))}
                        </div>
                    </Panel>

                    <Panel title="Suite Ozeti">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard label="Basarili" value={suiteSuccessCount} tone="text-emerald-300" />
                            <StatCard label="Hata" value={suiteErrorCount} tone="text-red-300" />
                            <StatCard label="Toplam" value={suiteResults.length} />
                        </div>

                        <div className="mt-5 space-y-3">
                            {suiteResults.length === 0 ? (
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-400">
                                    Suite sonucu henuz yok.
                                </div>
                            ) : (
                                suiteResults.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`rounded-2xl border p-4 ${statusTone[item.status]}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-base font-semibold">{item.label}</div>
                                                <div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-70">{item.source}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/10 px-3 py-1 text-xs">
                                                {item.durationMs} ms
                                            </div>
                                        </div>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            <StatCard label="Sonuc" value={item.resultCount} />
                                            <StatCard label="Ilk Kaynak" value={item.firstSource} />
                                            <StatCard label="Ilk Asama" value={item.firstStage} />
                                            <StatCard label="Belge" value={item.documentLength ?? '-'} />
                                        </div>
                                        <p className="mt-4 text-sm leading-6 opacity-90">{item.firstTitle}</p>
                                        <p className="mt-3 text-xs leading-6 opacity-75">{item.note}</p>
                                        {item.error ? <p className="mt-3 text-xs text-red-200">{item.error}</p> : null}
                                    </div>
                                ))
                            )}
                        </div>
                    </Panel>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
                    <Panel title="Tekli Canli Test">
                        <form className="space-y-4" onSubmit={handleSearch}>
                            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                                <label className="space-y-2 text-sm text-gray-300">
                                    <span>Kaynak</span>
                                    <select
                                        value={source}
                                        onChange={(event) => setSource(event.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition focus:border-red-500/40"
                                    >
                                        {SOURCES.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm text-gray-300">
                                    <span>Ham sorgu</span>
                                    <textarea
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        rows={7}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-7 text-white outline-none transition focus:border-red-500/40"
                                    />
                                </label>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Kisa sorgu</div>
                                <p className="mt-3 text-sm leading-7 text-gray-200">{compactedKeyword || '-'}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={isSearching}
                                    className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900/40"
                                >
                                    {isSearching ? 'Araniyor...' : 'Tekli Canli Testi Baslat'}
                                </button>
                                <Pill value={`Aktif kaynak: ${source}`} />
                            </div>
                        </form>

                        {error ? (
                            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                                {error}
                            </div>
                        ) : null}
                    </Panel>

                    <Panel title="Backend AI Arama Ozeti">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <StatCard label="Ham Sorgu" value={`${query.trim().length} karakter`} />
                            <StatCard label="Normal Kisa Sorgu" value={compactedKeyword || '-'} />
                        </div>

                        <div className="mt-4 space-y-4">
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Backend AI sorgusu</div>
                                <p className="mt-3 text-sm leading-7 text-emerald-100">
                                    {aiSearchPlan?.searchQuery || '-'}
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <StatCard
                                    label="Query mode"
                                    value={aiSearchPlan?.queryMode || '-'}
                                    tone="text-emerald-300"
                                />
                                <StatCard
                                    label="Core issue"
                                    value={aiSearchPlan?.coreIssue || '-'}
                                />
                                <StatCard
                                    label="Semantic tez"
                                    value={aiSearchPlan?.semanticQuery || '-'}
                                />
                                <StatCard
                                    label="Gercek request birim kodu"
                                    value={searchDebug?.request?.filters?.birimAdi || '-'}
                                />
                                <StatCard
                                    label="Hedef kaynaklar"
                                    value={Array.isArray(aiSearchPlan?.targetSources) && aiSearchPlan.targetSources.length > 0
                                        ? aiSearchPlan.targetSources.join(', ')
                                        : '-'}
                                    tone="text-emerald-300"
                                />
                                <StatCard
                                    label="Birim kodlari"
                                    value={Array.isArray(aiSearchPlan?.optionalBirimCodes) && aiSearchPlan.optionalBirimCodes.length > 0
                                        ? aiSearchPlan.optionalBirimCodes.join(', ')
                                        : '-'}
                                />
                            </div>

                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Cekirdek kavramlar</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(aiSearchPlan?.retrievalConcepts || aiSearchPlan?.requiredConcepts || aiSearchPlan?.keywords || []).length > 0 ? (
                                        (aiSearchPlan?.retrievalConcepts || aiSearchPlan?.requiredConcepts || aiSearchPlan?.keywords || []).map((keyword) => (
                                            <Pill key={keyword} value={keyword} tone="good" />
                                        ))
                                    ) : (
                                        <Pill value="AI cekirdek kavram uretmedi" />
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Destek kavramlar</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(aiSearchPlan?.supportConcepts || []).length > 0 ? (
                                        aiSearchPlan?.supportConcepts?.map((keyword) => (
                                            <Pill key={keyword} value={keyword} />
                                        ))
                                    ) : (
                                        <Pill value="Destek kavram yok" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Delil kavramlar</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(aiSearchPlan?.evidenceConcepts || []).length > 0 ? (
                                        aiSearchPlan?.evidenceConcepts?.map((keyword) => (
                                            <Pill key={keyword} value={keyword} tone="warn" />
                                        ))
                                    ) : (
                                        <Pill value="Delil kavram yok" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Calisan arama cumleleri</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(aiSearchPlan?.searchClauses || []).length > 0 ? (
                                        aiSearchPlan?.searchClauses?.map((clause) => (
                                            <Pill key={clause} value={clause} tone="good" />
                                        ))
                                    ) : (
                                        <Pill value="Backend fallback cumlesi kullanildi" tone="warn" />
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Kaynak secim gerekcesi</div>
                                <p className="mt-3 text-sm leading-7 text-gray-200">
                                    {aiSearchPlan?.sourceReason || aiSearchPlan?.reasoning || '-'}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Plan diagnostics</div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                                    <StatCard label="Generation mode" value={planDiagnostics?.generationMode || '-'} />
                                    <StatCard label="Final status" value={planDiagnostics?.finalStatus || '-'} tone="text-emerald-300" />
                                    <StatCard label="Retry count" value={planDiagnostics?.retryCount ?? 0} />
                                    <StatCard label="Review" value={planDiagnostics?.reviewApplied ? 'acik' : 'kapali'} />
                                    <StatCard label="Transport retry" value={planDiagnostics?.transportRetryCount ?? 0} />
                                </div>

                                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                                        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Scout profile</div>
                                        <div className="mt-3 space-y-3 text-sm text-gray-200">
                                            <div className="flex flex-wrap gap-2">
                                                <Pill value={planDiagnostics?.scoutProfile?.queryMode || '-'} />
                                                <Pill value={planDiagnostics?.scoutProfile?.primaryDomain || '-'} tone="good" />
                                                <Pill value={Array.isArray(planDiagnostics?.scoutProfile?.sourceTargets) && planDiagnostics?.scoutProfile?.sourceTargets.length > 0
                                                    ? planDiagnostics?.scoutProfile?.sourceTargets.join(', ')
                                                    : '-'} />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(planDiagnostics?.scoutProfile?.riskTags || []).length > 0 ? (
                                                    planDiagnostics?.scoutProfile?.riskTags?.map((tag: string, index: number) => (
                                                        <Pill key={`${tag}-${index}`} value={tag} tone="warn" />
                                                    ))
                                                ) : (
                                                    <span className="text-gray-400">risk tag yok</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                                        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Few-shot example ids</div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {(planDiagnostics?.fewShotExampleIds || []).length > 0 ? (
                                                planDiagnostics?.fewShotExampleIds?.map((exampleId: string, index: number) => (
                                                    <Pill key={`${exampleId}-${index}`} value={exampleId} />
                                                ))
                                            ) : (
                                                <span className="text-sm text-gray-400">Prompt icin ornek secilmemis.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Validation warnings</div>
                                    <div className="mt-3 space-y-3">
                                        {(planDiagnostics?.validationWarnings || []).length > 0 ? (
                                            planDiagnostics?.validationWarnings?.map((warning, index) => (
                                                <div key={`${warning.term || 'warning'}-${index}`} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Pill value={warning.term || '-'} tone="warn" />
                                                        <Pill value={`${warning.from || '-'} -> ${warning.to || '-'}`} />
                                                        <Pill value={warning.reason || 'validation'} />
                                                        <Pill value={`attempt ${warning.attempt || '-'}`} />
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-400">
                                                Validation warning yok.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Attempt logu</div>
                                    <div className="mt-3 space-y-3">
                                        {(planDiagnostics?.attempts || []).length > 0 ? (
                                            planDiagnostics?.attempts?.map((attempt) => (
                                                <div key={`attempt-${attempt.attempt}`} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Pill value={`attempt ${attempt.attempt}`} tone="good" />
                                                        <Pill value={attempt.stage || '-'} />
                                                        <Pill value={attempt.queryMode || '-'} />
                                                        <Pill value={`${attempt.validationWarnings?.length || 0} warning`} />
                                                        <Pill value={`${attempt.retryForbiddenTerms?.length || 0} retry kisiti`} />
                                                        <Pill value={`${attempt.fewShotExampleIds?.length || 0} ornek`} />
                                                        <Pill value={`${attempt.transportRetryCount ?? 0} transport retry`} />
                                                    </div>
                                                    {(attempt.retryForbiddenTerms || []).length > 0 ? (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {attempt.retryForbiddenTerms?.map((term, index) => (
                                                                <Pill
                                                                    key={`${term.term || 'term'}-${index}`}
                                                                    value={`${term.term || '-'} -> ${term.to || '-'} (${term.reason || 'validation'})`}
                                                                    tone="warn"
                                                                />
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-400">
                                                Attempt kaydi henuz yok.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>

                {searchDebug ? (
                    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                        <Panel title="Retrieval Diagnostics">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <StatCard
                                    label="Taranan kaynaklar"
                                    value={Array.isArray(retrievalDiagnostics?.targetSources) && retrievalDiagnostics.targetSources.length > 0
                                        ? retrievalDiagnostics.targetSources.join(', ')
                                        : searchDebug.response?.source || '-'}
                                />
                                <StatCard
                                    label="Embedding modeli"
                                    value={retrievalDiagnostics?.semanticModel || '-'}
                                />
                                <StatCard
                                    label="Toplam aday"
                                    value={retrievalDiagnostics?.totalCandidates ?? '-'}
                                />
                                <StatCard
                                    label="Ozetten gecen"
                                    value={retrievalDiagnostics?.summaryPassedCount ?? '-'}
                                    tone="text-emerald-300"
                                />
                                <StatCard
                                    label="Tam metin kontrol"
                                    value={retrievalDiagnostics?.fullTextCheckedCount ?? '-'}
                                />
                                <StatCard
                                    label="Strict final"
                                    value={retrievalDiagnostics?.strictFinalCount ?? '-'}
                                />
                                <StatCard
                                    label="Fallback final"
                                    value={retrievalDiagnostics?.fallbackFinalCount ?? '-'}
                                />
                                <StatCard
                                    label="Fallback used"
                                    value={retrievalDiagnostics?.fallbackUsed ? 'evet' : 'hayir'}
                                    tone={retrievalDiagnostics?.fallbackUsed ? 'text-amber-300' : 'text-white'}
                                />
                                <StatCard
                                    label="Zero result reason"
                                    value={retrievalDiagnostics?.zeroResultReason || '-'}
                                />
                                <StatCard
                                    label="Final listede"
                                    value={retrievalDiagnostics?.finalMatchedCount ?? results.length}
                                    tone="text-emerald-300"
                                />
                            </div>

                            <div className="mt-5 space-y-3">
                                {(retrievalDiagnostics?.clauseRuns || []).length > 0 ? (
                                    retrievalDiagnostics?.clauseRuns?.map((run, index) => (
                                        <div key={`${run.source || 'src'}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Pill value={run.source || '-'} tone={run.ok === false ? 'warn' : 'good'} />
                                                <Pill value={run.round || '-'} />
                                                <Pill value={run.variant || '-'} />
                                                <Pill value={`${run.count ?? 0} aday`} />
                                            </div>
                                            <p className="mt-3 text-sm leading-7 text-gray-200">{run.clause || '-'}</p>
                                            {run.error ? <p className="mt-3 text-xs text-red-300">{run.error}</p> : null}
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-400">
                                        Henuz retrieval tanisi yok.
                                    </div>
                                )}
                            </div>
                        </Panel>

                        <Panel title="Normalize Sonuclar">
                            {results.length === 0 ? (
                                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm leading-7 text-red-100">
                                    Final listede sonuc yok. Yukaridaki retrieval diagnostics bolumu, adaylarin hangi asamada elendigini gosterecek.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {results.map((result) => (
                                        <button
                                            type="button"
                                            key={`${result.documentId || result.id || result.title}`}
                                            onClick={() => void handleLoadDocument(result)}
                                            className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-red-500/40 hover:bg-red-500/5"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                <div>
                                                    <div className="text-lg font-semibold text-white">{result.title}</div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <Pill value={result.source || '-'} />
                                                        <Pill value={result.retrievalStage || result.matchStage || '-'} tone="good" />
                                                        <Pill value={`semantic ${formatScore(result.semanticScore)}`} />
                                                        <Pill value={`combo ${formatScore(result.combinedScore)}`} />
                                                        <Pill value={`ozet ${result.summaryKeywordHits ?? 0}`} />
                                                        <Pill value={`tam metin ${result.fullTextKeywordHits ?? 0}`} />
                                                        <Pill value={`alan ${formatScore((result as any).domainConfidence)}`} />
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300">
                                                    {result.documentId || result.documentUrl || '-'}
                                                </div>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                <StatCard label="Esas" value={result.esasNo || '-'} />
                                                <StatCard label="Karar" value={result.kararNo || '-'} />
                                                <StatCard label="Tarih" value={result.tarih || '-'} />
                                                <StatCard label="Daire" value={result.daire || '-'} />
                                            </div>

                                            <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f1015] p-4">
                                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Neden kaldigi</div>
                                                <p className="mt-3 text-sm leading-7 text-gray-200">{result.selectionReason || result.matchReason || '-'}</p>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {(result.matchedKeywords || []).length > 0 ? (
                                                    result.matchedKeywords?.map((keyword) => (
                                                        <Pill key={`${result.documentId || result.title}-${keyword}`} value={keyword} tone="good" />
                                                    ))
                                                ) : (
                                                    <Pill value="Eslesen kavram yok" tone="warn" />
                                                )}
                                            </div>

                                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                                                <div className="rounded-2xl border border-white/10 bg-[#0f1015] p-4">
                                                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Tutulan zorunlu kavramlar</div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {((result as any).matchedRequiredConcepts || []).length > 0 ? (
                                                            ((result as any).matchedRequiredConcepts || []).map((keyword: string) => (
                                                                <Pill key={`${result.documentId || result.title}-required-${keyword}`} value={keyword} tone="good" />
                                                            ))
                                                        ) : (
                                                            <Pill value="Tutulan zorunlu kavram yok" tone="warn" />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-[#0f1015] p-4">
                                                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Eksik zorunlu kavramlar</div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {((result as any).missingRequiredConcepts || []).length > 0 ? (
                                                            ((result as any).missingRequiredConcepts || []).map((keyword: string) => (
                                                                <Pill key={`${result.documentId || result.title}-missing-${keyword}`} value={keyword} tone="warn" />
                                                            ))
                                                        ) : (
                                                            <Pill value="Eksik zorunlu kavram yok" />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-[#0f1015] p-4">
                                                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Negatif kavramlar</div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {((result as any).matchedNegativeConcepts || []).length > 0 ? (
                                                            ((result as any).matchedNegativeConcepts || []).map((keyword: string) => (
                                                                <Pill key={`${result.documentId || result.title}-negative-${keyword}`} value={keyword} tone="warn" />
                                                            ))
                                                        ) : (
                                                            <Pill value="Negatif kavram yakalanmadi" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <p className="mt-4 text-sm leading-7 text-gray-300">{result.snippet || result.ozet || '-'}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Panel>
                    </div>
                ) : null}

                {results.length > 0 ? (
                    <Panel title="Belge Yukleme">
                        <div className="flex flex-wrap items-center gap-3">
                            <Pill value={selectedResult?.title || 'Bir sonuc sec'} tone="good" />
                            <Pill value={selectedResult?.documentId || selectedResult?.documentUrl || '-'} />
                            {documentDebug ? <Pill value={`${documentDebug.durationMs} ms`} /> : null}
                        </div>

                        {isLoadingDocument ? (
                            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
                                Belge metni yukleniyor...
                            </div>
                        ) : null}

                        {documentError ? (
                            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                                {documentError}
                            </div>
                        ) : null}

                        {documentDebug?.documentText ? (
                            <pre className="mt-4 max-h-[700px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-7 text-gray-100 whitespace-pre-wrap">
                                {documentDebug.documentText}
                            </pre>
                        ) : null}
                    </Panel>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Arama Request JSON">
                        <pre className="max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-gray-200 whitespace-pre-wrap">
                            {searchDebug ? prettyJson(searchDebug.request) : 'Henuz request yok.'}
                        </pre>
                    </Panel>
                    <Panel title="Arama Ham Response JSON">
                        <pre className="max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-gray-200 whitespace-pre-wrap">
                            {rawSearchResponse || 'Henuz response yok.'}
                        </pre>
                    </Panel>
                </div>

                {results.length > 0 ? (
                    <Panel title="Belge Ham Response JSON">
                        <pre className="max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-gray-200 whitespace-pre-wrap">
                            {rawDocumentResponse || 'Henuz belge response yok.'}
                        </pre>
                    </Panel>
                ) : null}
            </main>
        </div>
    );
}













