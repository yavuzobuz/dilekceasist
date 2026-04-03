/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { __testables, getLegalSources } from '../lib/legal/mcpLegalSearch.js';
import {
    buildDetailedLegalSearchResult,
    compactLegalSearchQuery,
    getLegalSearchZeroResultMessage,
    normalizeLegalSearchResults,
} from '../src/utils/legalSearch';
describe('legal MCP helpers', () => {
    it('maps Bedesten decisions into the shared UI shape', () => {
        const mapped = __testables.toBedestenDecision({
            documentId: 'bed-1',
            birimAdi: '9. Hukuk Dairesi',
            itemType: { description: 'Yargitay Karari' },
            esasNo: '2024/1',
            kararNo: '2024/2',
            kararTarihiStr: '2024-02-01',
            ozet: 'Ise iade uyusmazligi.',
            relevanceScore: 91,
        }, 0);
        expect(mapped.documentId).toBe('bed-1');
        expect(mapped.source).toBe('yargitay');
        expect(mapped.relevanceScore).toBe(91);
    });
    it('preserves semantic and evidence metadata when normalizing results', () => {
        const normalized = normalizeLegalSearchResults({
            source: 'yargitay',
            results: [
                {
                    documentId: '123',
                    title: 'Ornek Karar',
                    snippet: 'Ornek karar ozeti',
                    relevanceScore: 88,
                    similarityScore: 0.88,
                    semanticScore: 0.77,
                    combinedScore: 0.81,
                    summaryKeywordHits: 2,
                    fullTextKeywordHits: 4,
                    selectionReason: 'Tam metin dogrulamasi gecti.',
                    retrievalStage: 'full_text',
                    matchedKeywords: ['ise iade', 'fesih'],
                    matchedEvidenceConcepts: ['bordro'],
                },
            ],
        });
        expect(normalized).toHaveLength(1);
        expect(normalized[0].semanticScore).toBe(0.77);
        expect(normalized[0].combinedScore).toBe(0.81);
        expect(normalized[0].selectionReason).toContain('Tam metin');
        expect(normalized[0].retrievalStage).toBe('full_text');
        expect(normalized[0].matchedKeywords).toEqual(['ise iade', 'fesih']);
        expect(normalized[0].matchedEvidenceConcepts).toEqual(['bordro']);
    });
    it('compacts long natural language into a small set of strong legal concepts', () => {
        const compacted = compactLegalSearchQuery(
            'Sanigin uzerinde ve evinde arama yapilmasina ragmen satis bedeline, hassas teraziye ya da paketlenmis satis materyaline rastlanmamasi; ele gecen miktarin kullanma sinirlari icinde kalmasi ve dosyada baskaca ticaret iliskisini gosteren somut delil bulunmamasi halinde, uyusturucu madde ticareti sucu yerine kullanmak icin bulundurma ihtimali guclenir.'
        );
        const parts = compacted.split(/\s+/).filter(Boolean);
        expect(parts.length).toBeLessThanOrEqual(14);
        expect(compacted).toContain('uyusturucu madde');
        expect(compacted).toContain('satis bedeli');
        expect(compacted).toContain('hassas terazi');
    });
    it('drops procedural noise from long ceza process text before building the compact query', () => {
        const compacted = compactLegalSearchQuery(
            'Sanigin cocugun cinsel istismari ve kisiyi hurriyetinden yoksun kilma sucundan cezalandirilmasina iliskin 14.09.2022 tarihli 212-318 sayili hukum, istinaf ve temyiz incelemeleri sonrasinda Ceza Genel Kurulunca degerlendirilmistir.'
        );

        expect(compacted).toContain('cinsel istismar');
        expect(compacted).toContain('hurriyetinden yoksun kilma');
        expect(compacted).not.toContain('212-318');
        expect(compacted).not.toContain('14.09.2022');
    });
    it('parses the last JSON payload from multi-line MCP SSE responses', () => {
        const parsed = __testables.parseMcpResponsePayload([
            'event: message',
            'data: {"jsonrpc":"2.0","id":"1","result":{"ok":true}}',
            '',
            'event: message',
            'data: {"jsonrpc":"2.0","id":"2","result":{"content":[]}}',
        ].join('\n'));
        expect(parsed?.id).toBe('2');
    });
    it('builds a dynamic keyword match plan from AI keywords', () => {
        const plan = (__testables.buildKeywordMatchPlan)({
            retrievalConcepts: [
                'uyusturucu madde ticareti',
                'kullanmak icin bulundurma',
                'satis materyali',
                'kullanma sinirlari',
                'somut delil',
            ],
            searchQuery: 'ornek sorgu',
        }, 'ornek sorgu');
        expect(plan?.requiredKeywordCount).toBe(2);
        expect(plan?.summaryThresholdCount).toBe(1);
        expect(plan?.keywords).toHaveLength(5);
    });
    it('resolves target sources from AI plan when source is all', () => {
        const sources = (__testables.resolveTargetSources)({
            resolvedSource: 'all',
            aiSearchPlan: {
                targetSources: ['danistay', 'anayasa', 'uyap'],
            },
        });
        expect(sources).toEqual(['danistay', 'anayasa', 'uyap']);
    });
    it('builds search clauses from AI plan before falling back to raw query', () => {
        const clauses = (__testables.resolveSearchClauses)({
            aiSearchPlan: {
                searchRounds: [
                    { round: 'direct', clauses: ['"ise iade"', '+fesih +isci'], asciiClauses: [] },
                    { round: 'support_concepts', clauses: ['ise iade fesih'], asciiClauses: ['ise iade isci'] },
                ],
                searchQuery: 'ise iade fesih',
            },
            query: 'ise iade davasi',
            matchPlan: {
                keywordDescriptors: [],
            },
        });
        expect(clauses).toEqual({
            turkishClauses: ['"ise iade"', '+fesih +isci', 'ise iade fesih'],
            asciiClauses: ['ise iade isci'],
        });
    });
    it('keeps explicit round information in search rounds', () => {
        const rounds = (__testables.resolveSearchRounds)({
            aiSearchPlan: {
                searchRounds: [
                    { round: 'core_issue', clauses: ['itirazin iptali'], asciiClauses: [] },
                    { round: 'retrieval_concepts', clauses: ['icra takibi cari hesap'], asciiClauses: [] },
                ],
            },
            query: 'itirazin iptali',
        });
        expect(rounds.map((item) => item.round)).toEqual(['core_issue', 'retrieval_concepts']);
    });

    it('fills a matching chamber filter from the legal domain when plan leaves it blank', () => {
        const filters = (__testables.buildSourceSpecificFilters)({
            source: 'yargitay',
            aiSearchPlan: {
                primaryDomain: 'is_hukuku',
                optionalBirimCodes: [],
            },
        });

        expect(filters).toEqual({ birimAdi: 'H9', birimAdiCandidates: ['H9', 'H22'] });
    });
    it('uses only the first chamber code when the AI plan carries multiple hints', () => {
        const filters = (__testables.buildSourceSpecificFilters)({
            source: 'yargitay',
            aiSearchPlan: {
                primaryDomain: 'is_hukuku',
                optionalBirimCodes: ['H9', 'H22', 'HGK'],
            },
        });

        expect(filters).toEqual({ birimAdi: 'H9', birimAdiCandidates: ['H9', 'H22', 'HGK'] });
    });
    it('keeps chamber candidates when source is all so Bedesten fan-out can use them', () => {
        const filters = (__testables.buildSourceSpecificFilters)({
            source: 'all',
            aiSearchPlan: {
                primaryDomain: 'icra',
                optionalBirimCodes: [],
            },
        });

        expect(filters).toEqual({ birimAdi: 'H12', birimAdiCandidates: ['H12'] });
    });
    it('opens semantic fallback for all PRO Bedesten-compatible searches after strict final stays empty', () => {
        expect((__testables.shouldAttemptSemanticFallback)({
            aiSearchPlan: { queryMode: 'case_file' },
            targetSources: ['yargitay'],
            strictDiagnostics: { strictFinalCount: 0 },
        })).toBe(true);
        expect((__testables.shouldAttemptSemanticFallback)({
            aiSearchPlan: { queryMode: 'long_fact' },
            targetSources: ['danistay'],
            strictDiagnostics: { strictFinalCount: 0 },
        })).toBe(true);
        expect((__testables.shouldAttemptSemanticFallback)({
            aiSearchPlan: { queryMode: 'case_file' },
            targetSources: ['uyap'],
            strictDiagnostics: { strictFinalCount: 0 },
        })).toBe(false);
    });

    it('builds semantic fallback payload with keyword initialKeyword and natural-language query', () => {
        const payload = (__testables.buildSemanticFallbackSearchPayload)({
            activePlan: {
                initialKeyword: 'itirazin iptali',
                searchQuery: 'itirazin iptali cari hesap alacagi',
                semanticQuery: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
                coreIssue: 'Itirazin iptali davasi',
            },
            activeQuery: 'ham sorgu',
        });

        expect(payload).toEqual({
            initialKeyword: 'itirazin iptali',
            query: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
        });
    });
    it('softens long semantic initial keywords before semantic candidate fetch', () => {
        const initialKeyword = (__testables.buildSemanticInitialKeyword)(
            'ise iade gecersiz fesih kidem ihbar',
            'Iscinin gecersiz fesih nedeniyle ise iade ve kidem tazminati talepleri tartisilmaktadir.'
        );

        expect(initialKeyword).toBe('ise iade gecersiz fesih');
    });
    it('builds multiple Bedesten phrases from search clauses and keeps phrase variants bounded', () => {
        const phrases = (__testables.buildBedestenSearchPhrases)({
            query: 'itirazin iptali davasi',
            searchClauses: [
                'itirazin iptali icra inkar tazminati',
                'sebepsiz zenginlesme',
            ],
        });

        expect(phrases).toEqual([
            'itirazin iptali icra inkar tazminati',
            '"itirazin iptali icra inkar"',
            '+itirazin +iptali +icra',
            'sebepsiz zenginlesme',
            '"sebepsiz zenginlesme"',
            '+sebepsiz +zenginlesme',
        ]);
    });

    it('stops chamber fan-out immediately when the first chamber already returns enough results', () => {
        expect((__testables.shouldStopChamberFanout)({
            combinedCount: 50,
            chamberIndex: 0,
            strictSkillActive: false,
        })).toBe(true);
    });

    it('keeps chamber fan-out alive for weak first hits but stops after the second chamber when results are sufficient', () => {
        expect((__testables.shouldStopChamberFanout)({
            combinedCount: 8,
            chamberIndex: 0,
            strictSkillActive: false,
        })).toBe(false);

        expect((__testables.shouldStopChamberFanout)({
            combinedCount: 18,
            chamberIndex: 1,
            strictSkillActive: false,
        })).toBe(true);
    });

    it('reuses the same in-flight backend search promise for identical cache keys', async () => {
        const inFlight = new Map();
        let resolvePromise = null;
        const factory = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolvePromise = resolve;
                })
        );

        const first = (__testables.withInFlightCache)(inFlight, 'same-search', factory);
        const second = (__testables.withInFlightCache)(inFlight, 'same-search', factory);

        await vi.waitFor(() => {
            expect(factory).toHaveBeenCalledTimes(1);
            expect(inFlight.size).toBe(1);
        });

        if (!resolvePromise) {
            throw new Error('In-flight resolver kurulmamisti.');
        }

        resolvePromise('ok');

        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(firstResult).toBe('ok');
        expect(secondResult).toBe('ok');
        expect(factory).toHaveBeenCalledTimes(1);
        expect(inFlight.size).toBe(0);
    });

    it('turns an upstream abort into a request-aborted error', async () => {
        const controller = new AbortController();
        const pending = (__testables.withTimeout)(
            (signal: AbortSignal) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        const error = new Error('Aborted');
                        (error as Error & { name: string }).name = 'AbortError';
                        reject(error);
                    }, { once: true });
                }),
            5000,
            'timeout',
            controller.signal
        );

        controller.abort();

        await expect(pending).rejects.toMatchObject({
            code: 'REQUEST_ABORTED',
        });
    });

    it('does not punish H2 aile results as wrong domain in locked aile searches', () => {
        const signals = __testables.buildQuerySignals(
            'bosanma velayet nafaka',
            'TMK 166 kapsaminda bosanma, velayet ve nafaka talepleri.',
            {
                forcedProfiles: ['aile'],
                lockProfiles: true,
                resolvedSource: 'uyap',
            }
        );
        const item = __testables.toEmsalDecision({
            id: 'emsal-aile-1',
            yargiBirimi: 'Yargitay',
            daire: '2. Hukuk Dairesi',
            kararOzeti: 'Bosanma davasinda velayet ve nafaka talepleri incelenmistir.',
        }, 0);

        const alignment = __testables.computeDomainAlignment(item, signals);
        const score = __testables.computeScore(item, signals);

        expect(alignment.chamberHit).toBe(true);
        expect(alignment.explicitWrongDomain).toBe(false);
        expect(score).toBeGreaterThanOrEqual(24);
    });

    it('gives H12 icra results a usable score in locked icra searches', () => {
        const signals = __testables.buildQuerySignals(
            'itirazin iptali icra inkar tazminati',
            'IIK 67 kapsaminda itirazin iptali ve icra inkar tazminati kosullari.',
            {
                forcedProfiles: ['icra'],
                lockProfiles: true,
                resolvedSource: 'uyap',
            }
        );
        const item = __testables.toEmsalDecision({
            id: 'emsal-icra-1',
            yargiBirimi: 'Yargitay',
            daire: '12. Hukuk Dairesi',
            kararOzeti: 'Itirazin iptali ve icra inkar tazminati istemi degerlendirilmistir.',
        }, 0);

        const alignment = __testables.computeDomainAlignment(item, signals);
        const score = __testables.computeScore(item, signals);

        expect(alignment.chamberHit).toBe(true);
        expect(alignment.explicitWrongDomain).toBe(false);
        expect(score).toBeGreaterThanOrEqual(24);
    });
    it('forces content rerank when top strict-mode candidates have no explanation trace', () => {
        expect((__testables.shouldForceContentRerankForTraceability)([
            {
                title: 'Yargitay Karari 2. Hukuk Dairesi',
                ozet: '',
                snippet: '',
                matchedKeywords: [],
                selectionReason: 'MCP arama sonucu',
                retrievalStage: 'summary',
            },
        ])).toBe(true);

        expect((__testables.shouldForceContentRerankForTraceability)([
            {
                title: 'Yargitay Karari 2. Hukuk Dairesi',
                ozet: 'Bosanma davasinda kusur degerlendirilmesi yapildi.',
                snippet: '',
                matchedKeywords: ['bosanma', 'kusur'],
                selectionReason: 'Anahtar kelimeler: bosanma, kusur',
                retrievalStage: 'summary',
            },
        ])).toBe(false);
    });

    it('returns the supported legal source list', () => {
        const payload = getLegalSources();
        expect(payload.sources.map((item) => item.id)).toEqual([
            'all',
            'yargitay',
            'danistay',
            'uyap',
            'anayasa',
        ]);
    });

    it('maps zero-result reasons into short user messages', () => {
        expect(getLegalSearchZeroResultMessage('no_candidates')).toContain('aday karar');
        expect(getLegalSearchZeroResultMessage('summary_gate')).toContain('ozet elemesini');
        expect(getLegalSearchZeroResultMessage('strict_gate')).toContain('son dogrulama');
        expect(getLegalSearchZeroResultMessage('semantic_fallback_empty')).toContain('yedek anlamsal arama');
    });

    it('keeps plan diagnostics and zero-result diagnostics in the detailed response helper', () => {
        const detailed = buildDetailedLegalSearchResult({
            endpoint: '/api/legal/search-decisions',
            request: { source: 'all', keyword: 'uyusturucu' },
            response: {
                results: [],
                aiSearchPlan: {
                    queryMode: 'long_fact',
                    retrievalConcepts: ['uyusturucu madde ticareti'],
                },
                planDiagnostics: {
                    generationMode: 'always',
                    retryCount: 1,
                    finalStatus: 'retried',
                    reviewApplied: true,
                    transportRetryCount: 2,
                    scoutProfile: {
                        queryMode: 'long_fact',
                        primaryDomain: 'ceza',
                        sourceTargets: ['yargitay'],
                        riskTags: ['bucket_risk'],
                    },
                    fewShotExampleIds: ['ceza-long-uyusturucu-good'],
                    validationWarnings: [
                        {
                            term: 'paketleme',
                            from: 'retrievalConcepts',
                            to: 'evidenceConcepts',
                            reason: 'delil_sinyali',
                            attempt: 1,
                        },
                    ],
                    attempts: [
                        {
                            attempt: 1,
                            stage: 'generated',
                            queryMode: 'long_fact',
                            validationWarnings: [],
                            retryForbiddenTerms: [
                                { term: 'paketleme', to: 'evidenceConcepts', reason: 'delil_sinyali' },
                            ],
                        },
                    ],
                },
                retrievalDiagnostics: {
                    zeroResultReason: 'strict_gate',
                    totalCandidates: 4,
                    summaryPassedCount: 1,
                    strictFinalCount: 0,
                },
            },
            durationMs: 42,
        });

        expect(detailed.normalizedResults).toEqual([]);
        expect(detailed.diagnostics.planDiagnostics?.finalStatus).toBe('retried');
        expect(detailed.diagnostics.planDiagnostics?.validationWarnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ term: 'paketleme', to: 'evidenceConcepts' }),
            ])
        );
        expect(detailed.diagnostics.planDiagnostics?.reviewApplied).toBe(true);
        expect(detailed.diagnostics.planDiagnostics?.transportRetryCount).toBe(2);
        expect(detailed.diagnostics.planDiagnostics?.fewShotExampleIds).toEqual(['ceza-long-uyusturucu-good']);
        expect(detailed.diagnostics.zeroResultReason).toBe('strict_gate');
        expect(detailed.diagnostics.zeroResultMessage).toContain('son dogrulama');
    });
});
// @ts-nocheck
