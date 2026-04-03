// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
    __testables,
    generateLegalSearchPlanWithDiagnostics,
    normalizeAiLegalSearchPlan,
} from '../backend/gemini/legal-search-plan-core.js';
import {
    collectFewShotExampleIds,
    selectFewShotExamples,
} from '../backend/gemini/legal-search-plan-fewshot.js';

const {
    classifyQueryMode,
    buildRetryConstraintInstruction,
    buildRetryForbiddenTerms,
    buildSearchQuery,
    buildSearchRounds,
    buildSemanticQuery,
    validateAndRepairPlan,
} = __testables;

describe('legal search plan normalization', () => {
    it('classifies short and long legal texts into different query modes', () => {
        expect(classifyQueryMode('ise iade gecersiz fesih')).toBe('short_issue');
        expect(
            classifyQueryMode(
                'Davaci, uzun suredir ayni isyerinde calistigini, dosya kapsaminda puantaj ve bordrolarin eksik tutuldugunu, fazla mesai ile hafta tatili alacaklarinin da odenmedigini belirterek alacak talebinde bulunmustur.'
            )
        ).toBe('long_fact');
    });

    it('detects document-style legal language correctly', () => {
        expect(
            classifyQueryMode(
                'Sayin Mahkeme, dosya kapsaminda sunulan dilekce iceriginde davaci tarafin talepleri ve hukuki dayanaklari ayrintili olarak arz ve talep olunur.'
            )
        ).toBe('document_style');
    });

    it('selects same-domain few-shot examples before cross-domain ones', () => {
        const selected = selectFewShotExamples({
            primaryDomain: 'ceza',
            queryMode: 'long_fact',
            riskTags: ['bucket_risk', 'source_target_risk'],
            stage: 'planner',
            maxExamples: 4,
        });
        const ids = collectFewShotExampleIds(selected);

        expect(ids).toContain('ceza-long-uyusturucu-good');
        expect(ids).toContain('ceza-long-bucket-wrong');
        expect(ids.slice(0, 2).every((id) => id.startsWith('ceza-'))).toBe(true);
    });

    it('selects the lower-court-history anti-example when UYAP risk appears in long ceza queries', () => {
        const selected = selectFewShotExamples({
            primaryDomain: 'ceza',
            queryMode: 'long_fact',
            riskTags: ['source_target_risk', 'lower_court_risk'],
            stage: 'planner',
            maxExamples: 5,
        });
        const ids = collectFewShotExampleIds(selected);

        expect(ids).toContain('ceza-long-lower-court-history-wrong');
    });

    it('demotes evidence-like concepts out of the core retrieval set', () => {
        const plan = normalizeAiLegalSearchPlan({
            primaryDomain: 'ceza',
            coreIssue: 'Uyusturucu madde ticareti ile kullanmak icin bulundurma ayrimi',
            retrievalConcepts: ['uyusturucu madde ticareti', 'hassas terazi', 'paketlenmis satis materyali'],
            supportConcepts: ['somut delil'],
            evidenceConcepts: ['HTS kayitlari'],
            sourceTargets: ['yargitay'],
        }, 'all');
        expect(plan.queryMode).toBe('short_issue');
        expect(plan.retrievalConcepts).toContain('uyusturucu madde ticareti');
        expect(plan.retrievalConcepts).not.toContain('hassas terazi');
        expect(plan.requiredConcepts).toEqual(plan.retrievalConcepts);
        expect(plan.evidenceConcepts).toEqual(expect.arrayContaining([
            'hassas terazi',
            'HTS kayitlari',
        ]));
    });

    it('keeps evidence-centric concepts in the core set when the dispute is about unlawful evidence', () => {
        const plan = normalizeAiLegalSearchPlan({
            primaryDomain: 'ceza',
            coreIssue: 'Usulsuz arama nedeniyle hukuka aykiri delilin degerlendirilmesi',
            retrievalConcepts: ['usulsuz arama', 'arama tutanagi'],
            supportConcepts: ['elkoyma'],
            evidenceConcepts: ['telefon inceleme tutanagi'],
            sourceTargets: ['yargitay'],
        }, 'all');
        expect(plan.allowEvidenceAsCore).toBe(true);
        expect(plan.retrievalConcepts).toEqual(expect.arrayContaining(['usulsuz arama', 'arama tutanagi']));
    });

    it('resets allowEvidenceAsCore when the dispute only uses proof language but is not about unlawful evidence', () => {
        const plan = normalizeAiLegalSearchPlan({
            queryMode: 'long_fact',
            primaryDomain: 'is_hukuku',
            allowEvidenceAsCore: true,
            coreIssue: 'Haftalik 45 saati asan fazla calisma alacaginin puantaj kayitlari ve tanik beyanlari ile ispatlanmasi tartisilmaktadir.',
            retrievalConcepts: ['fazla mesai alacagi', 'puantaj kayitlari'],
            supportConcepts: ['tanik beyanlari'],
            evidenceConcepts: ['isyeri giris cikis kayitlari'],
            sourceTargets: ['yargitay'],
        }, 'all');

        expect(plan.allowEvidenceAsCore).toBe(false);
        expect(plan.retrievalConcepts).toEqual(['fazla mesai alacagi']);
        expect(plan.evidenceConcepts).toEqual(expect.arrayContaining([
            'puantaj kayitlari',
            'tanik beyanlari',
            'isyeri giris cikis kayitlari',
        ]));
    });

    it('limits ceza long_fact retrieval concepts to three core items when evidence is not core', () => {
        const plan = normalizeAiLegalSearchPlan({
            queryMode: 'long_fact',
            primaryDomain: 'ceza',
            allowEvidenceAsCore: false,
            coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
            retrievalConcepts: [
                'uyusturucu madde ticareti',
                'kullanmak icin bulundurma',
                'tck 188',
                'ticaret kasti',
                'hassas terazi',
                'paketleme',
            ],
            supportConcepts: ['kisisel kullanim siniri'],
            evidenceConcepts: ['ele gecirilen miktar'],
            sourceTargets: ['yargitay'],
        }, 'all');

        expect(plan.queryMode).toBe('long_fact');
        expect(plan.retrievalConcepts).toEqual([
            'uyusturucu madde ticareti',
            'kullanmak icin bulundurma',
            'tck 188',
        ]);
        expect(plan.supportConcepts).toEqual(expect.arrayContaining([
            'kisisel kullanim siniri',
            'ticaret kasti',
        ]));
        expect(plan.evidenceConcepts).toEqual(expect.arrayContaining([
            'hassas terazi',
            'paketleme',
            'ele gecirilen miktar',
        ]));
    });

    it('builds round-based search clauses for case files without using evidence as first-pass query text', () => {
        const searchRounds = buildSearchRounds({
            queryMode: 'long_fact',
            coreIssue: 'itirazin iptali davasi',
            retrievalConcepts: ['itirazin iptali', 'icra takibi'],
            supportConcepts: ['cari hesap alacagi', 'ticari defter'],
            searchQuery: 'itirazin iptali',
        });
        expect(searchRounds.map((item) => item.round)).toEqual([
            'core_issue',
            'retrieval_concepts',
            'support_concepts',
        ]);
        expect(searchRounds[0].clauses[0]).toContain('itirazin iptali');
    });


    it('keeps searchQuery keyword-like and semanticQuery natural-language after normalization', () => {
        const plan = normalizeAiLegalSearchPlan({
            queryMode: 'long_fact',
            primaryDomain: 'ceza',
            coreIssue: 'Somut olayda ticaret mi yoksa kullanmak icin bulundurma mi oldugu tartisilmaktadir.',
            retrievalConcepts: ['uyusturucu madde ticareti', 'kullanmak icin bulundurma', 'suc vasfinin belirlenmesi'],
            supportConcepts: ['kisisel kullanim siniri'],
            searchQuery: 'Somut olayda ticaret mi yoksa kullanmak icin bulundurma mi oldugu tartisilmaktadir.',
            semanticQuery: 'uyusturucu ticareti kullanmak icin bulundurma',
            sourceTargets: ['yargitay'],
        }, 'all');

        expect(plan.searchQuery).toContain('uyusturucu madde ticareti');
        expect(plan.searchQuery).toContain(',');
        expect(plan.searchQuery).not.toContain('Somut olayda');
        expect(plan.searchQuery).not.toBe(plan.coreIssue);
        expect(plan.searchQuery.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(6);
        expect(plan.semanticQuery).toBe('Somut olayda ticaret mi yoksa kullanmak icin bulundurma mi oldugu tartisilmaktadir.');
    });

    it('uses keyword searchQuery as the first case-like search clause', () => {
        const searchQuery = buildSearchQuery({
            queryMode: 'long_fact',
            coreIssue: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
            retrievalConcepts: ['itirazin iptali davasi', 'cari hesap alacagi'],
            supportConcepts: ['icra inkar tazminati'],
            fallback: 'uzun ham metin',
        });
        const semanticQuery = buildSemanticQuery({
            semanticQuery: 'itirazin iptali cari hesap alacagi',
            coreIssue: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
            rawText: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
            searchQuery,
        });
        const searchRounds = buildSearchRounds({
            queryMode: 'long_fact',
            coreIssue: 'Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.',
            retrievalConcepts: ['itirazin iptali davasi', 'cari hesap alacagi'],
            supportConcepts: ['icra inkar tazminati'],
            searchQuery,
        });

        expect(searchQuery).toBe('itirazin iptali, cari hesap alacagi');
        expect(semanticQuery).toBe('Cari hesap alacagina dayali itirazin iptali davasinda alacagin ispat ve inkar tazminati kosullari tartisilmaktadir.');
        expect(searchRounds[0].clauses[0]).toBe(searchQuery);
        expect(searchRounds[0].clauses[0]).not.toContain('kosullari tartisilmaktadir');
    });

    it('keeps UYAP only when the text explicitly asks for lower-court style precedent', () => {
        const plan = normalizeAiLegalSearchPlan({
            primaryDomain: 'icra',
            retrievalConcepts: ['itirazin iptali', 'icra takibi'],
            supportConcepts: ['ticari defter'],
            sourceTargets: ['yargitay', 'uyap'],
            searchQuery: 'itirazin iptali bam emsal karar',
            semanticQuery: 'BAM emsal kararlarinda itirazin iptali ve ticari defter delili nasil degerlendiriliyor?',
        }, 'all');
        expect(plan.targetSources).toEqual(['yargitay', 'uyap']);
    });

    it('adds a fitting chamber hint for non-ceza domains when AI leaves it empty', () => {
        const plan = normalizeAiLegalSearchPlan({
            primaryDomain: 'is_hukuku',
            coreIssue: 'Gecersiz fesih nedeniyle ise iade talebi',
            retrievalConcepts: ['gecersiz fesih', 'ise iade'],
            supportConcepts: ['is guvencesi'],
            sourceTargets: ['yargitay'],
        }, 'all');

        expect(plan.optionalBirimCodes).toEqual(expect.arrayContaining(['H9']));
    });

    it('emits structured validation warnings when evidence terms move buckets and source drifts', () => {
        const result = validateAndRepairPlan({
            plan: {
                queryMode: 'long_fact',
                primaryDomain: 'ceza',
                allowEvidenceAsCore: false,
                coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                retrievalConcepts: ['uyusturucu madde ticareti', 'paketleme'],
                supportConcepts: ['hassas terazi'],
                evidenceConcepts: [],
                sourceTargets: ['yargitay', 'danistay'],
                negativeConcepts: [],
            },
            rawText: 'Sanigin uzerinde paketleme ve hassas terazi bulunmasi.',
            attempt: 1,
        });

        expect(result.validationWarnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    term: 'paketleme',
                    from: 'retrievalConcepts',
                    to: 'evidenceConcepts',
                    reason: 'delil_sinyali',
                    attempt: 1,
                }),
                expect.objectContaining({
                    term: 'hassas terazi',
                    from: 'supportConcepts',
                    to: 'evidenceConcepts',
                    reason: 'delil_sinyali',
                    attempt: 1,
                }),
                expect.objectContaining({
                    reason: 'source_target_domain_mismatch',
                    attempt: 1,
                }),
            ])
        );
    });

    it('builds retry forbidden terms from validation warnings without duplicates', () => {
        const forbidden = buildRetryForbiddenTerms([
            { term: 'paketleme', from: 'retrievalConcepts', to: 'evidenceConcepts', reason: 'delil_sinyali' },
            { term: 'paketleme', from: 'retrievalConcepts', to: 'evidenceConcepts', reason: 'delil_sinyali' },
            { term: 'hassas terazi', from: 'supportConcepts', to: 'evidenceConcepts', reason: 'delil_sinyali' },
            { term: 'TCK 158', from: 'retrievalConcepts', to: 'supportConcepts', reason: 'statute_noise_risk' },
            { term: 'ham metin', from: 'evidenceConcepts', to: 'supportConcepts', reason: 'ignore' },
        ]);

        expect(forbidden).toEqual([
            { term: 'paketleme', to: 'evidenceConcepts', reason: 'delil_sinyali' },
            { term: 'hassas terazi', to: 'evidenceConcepts', reason: 'delil_sinyali' },
            { term: 'TCK 158', to: 'supportConcepts', reason: 'statute_noise_risk' },
        ]);
        expect(buildRetryConstraintInstruction(forbidden)).toContain('Asagidaki kavramlari retrievalConcepts alanina koyma');
        expect(buildRetryConstraintInstruction(forbidden)).toContain('paketleme (delil_sinyali) -> evidenceConcepts');
    });

    it('runs scout then planner then retry then reviewer and accepts the repaired plan', async () => {
        const stages: string[] = [];
        const instructions: string[] = [];
        const mockGenerateStructuredJson = async ({ systemInstruction }: { systemInstruction: string }) => {
            instructions.push(systemInstruction);
            stages.push(systemInstruction.split('\n')[0]);

            if (stages.length === 1) {
                return {
                    cleanedText: 'Somut olayda uyusturucu madde ticareti ile kullanmak icin bulundurma ayrimi tartisilmaktadir.',
                    coreIssueHint: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                    retrievalHints: ['uyusturucu madde ticareti', 'kullanmak icin bulundurma'],
                    evidenceHints: ['paketleme'],
                    primaryDomainHint: 'ceza',
                    queryModeHint: 'long_fact',
                    lowerCourtMentionMode: 'history_only',
                    ignoredPhrases: ['dosya kapsaminda'],
                };
            }
            if (stages.length === 2) {
                return {
                    queryMode: 'long_fact',
                    primaryDomain: 'ceza',
                    sourceTargets: ['yargitay'],
                    riskTags: ['bucket_risk', 'statute_noise_risk'],
                    allowEvidenceAsCore: false,
                };
            }
            if (stages.length === 3) {
                return {
                    queryMode: 'long_fact',
                    primaryDomain: 'ceza',
                    coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                    retrievalConcepts: ['uyusturucu madde ticareti', 'paketleme'],
                    supportConcepts: ['somut delil'],
                    evidenceConcepts: [],
                    sourceTargets: ['yargitay'],
                };
            }
            if (stages.length === 4) {
                return {
                    queryMode: 'long_fact',
                    primaryDomain: 'ceza',
                    coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                    retrievalConcepts: ['uyusturucu madde ticareti', 'kullanmak icin bulundurma', 'tck 188'],
                    supportConcepts: ['somut delil'],
                    evidenceConcepts: ['paketleme'],
                    sourceTargets: ['yargitay'],
                };
            }

            return {
                queryMode: 'long_fact',
                primaryDomain: 'ceza',
                coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                retrievalConcepts: ['uyusturucu madde ticareti', 'kullanmak icin bulundurma', 'suc vasfinin belirlenmesi'],
                supportConcepts: ['somut delil'],
                evidenceConcepts: ['paketleme'],
                sourceTargets: ['yargitay'],
            };
        };

        const result = await generateLegalSearchPlanWithDiagnostics({
            rawText: 'Sanigin uzerinde paketleme bulunmayan ancak kullanim siniri tartismasi iceren uzun ceza metni. '.repeat(8),
            preferredSource: 'all',
            generateStructuredJsonImpl: mockGenerateStructuredJson,
        });

        expect(stages).toEqual(['STAGE: reader', 'STAGE: scout', 'STAGE: planner', 'STAGE: planner', 'STAGE: reviewer']);
        expect(result.planDiagnostics.retryCount).toBe(1);
        expect(result.planDiagnostics.finalStatus).toBe('retried');
        expect(result.planDiagnostics.readerApplied).toBe(true);
        expect(result.planDiagnostics.reviewApplied).toBe(true);
        expect(result.plan.evidenceConcepts).toContain('paketleme');
        expect(result.plan.retrievalConcepts).not.toContain('paketleme');
        expect(result.planDiagnostics.attempts.find((attempt) => attempt.stage === 'generated')?.retryForbiddenTerms).toEqual([
            { term: 'paketleme', to: 'evidenceConcepts', reason: 'delil_sinyali' },
        ]);
        expect(instructions[0]).toContain('Sen uzun Turk hukuku metnini arama oncesi ayiklayan AI okuyucusun.');
        expect(instructions[2]).toContain('searchQuery alani Yargi MCPdeki initial_keyword rolunu tasir');
        expect(instructions[2]).toContain('virgulle ayir');
        expect(instructions[2]).toContain('Olay anlatiminda yerel mahkeme, ilk derece, istinaf sureci veya onceki karar gecmesi tek basina uyap secme nedeni degildir.');
        expect(instructions[2]).toContain('optionalBirimCodes alanini yalnizca alan cok netse doldur');
        expect(instructions[3]).toContain('Asagidaki kavramlari retrievalConcepts alanina koyma');
        expect(instructions[3]).toContain('paketleme (delil_sinyali) -> evidenceConcepts');
        expect(instructions[4]).toContain('Review kontrolu: searchQuery uzunsa veya cumle halindeyse retrievalConcepts uzerinden kisalt.');
        expect(instructions[4]).toContain('Review kontrolu: yerel mahkeme veya istinaf gecmisi sadece olay anlatimindaysa uyapi sourceTargets icinden cikar.');
        expect(instructions[4]).toContain('"searchQuery"');
        expect(instructions[4]).toContain('"semanticQuery"');
        expect(result.planDiagnostics.fewShotExampleIds.length).toBeGreaterThan(0);
    });

    it('lets reviewer fix source drift for short_issue plans without adding hard-coded rewrite', async () => {
        const stages: string[] = [];
        const mockGenerateStructuredJson = async ({ systemInstruction }: { systemInstruction: string }) => {
            stages.push(systemInstruction.split('\n')[0]);

            if (stages.length === 1) {
                return {
                    queryMode: 'short_issue',
                    primaryDomain: 'is_hukuku',
                    sourceTargets: ['yargitay'],
                    riskTags: ['source_target_risk'],
                    allowEvidenceAsCore: false,
                };
            }
            if (stages.length === 2 || stages.length === 3) {
                return {
                    queryMode: 'short_issue',
                    primaryDomain: 'is_hukuku',
                    coreIssue: 'Gecersiz fesih nedeniyle ise iade talebi',
                    retrievalConcepts: ['gecersiz fesih', 'ise iade davasi'],
                    supportConcepts: ['is guvencesi'],
                    evidenceConcepts: ['fesih bildirimi'],
                    sourceTargets: ['yargitay', 'danistay'],
                };
            }

            return {
                queryMode: 'short_issue',
                primaryDomain: 'is_hukuku',
                coreIssue: 'Gecersiz fesih nedeniyle ise iade talebi',
                retrievalConcepts: ['gecersiz fesih', 'ise iade davasi', 'is guvencesi'],
                supportConcepts: ['gecerli neden ispat yuku'],
                evidenceConcepts: ['fesih bildirimi'],
                sourceTargets: ['yargitay'],
            };
        };

        const result = await generateLegalSearchPlanWithDiagnostics({
            rawText: 'Gecersiz nedenle feshedilen is sozlesmesi nedeniyle ise iade talebi.',
            preferredSource: 'all',
            generateStructuredJsonImpl: mockGenerateStructuredJson,
        });

        expect(stages).toEqual(['STAGE: scout', 'STAGE: planner', 'STAGE: planner', 'STAGE: reviewer']);
        expect(result.plan.targetSources).toEqual(['yargitay']);
        expect(result.planDiagnostics.reviewApplied).toBe(true);
        expect(result.planDiagnostics.validationWarnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ reason: 'source_target_domain_mismatch' }),
            ])
        );
    });

    it('counts transient transport retries without changing prompt behavior', async () => {
        let scoutFailuresLeft = 2;
        let callCount = 0;
        const mockGenerateStructuredJson = async ({ systemInstruction }: { systemInstruction: string }) => {
            callCount += 1;
            if (systemInstruction.startsWith('STAGE: scout') && scoutFailuresLeft > 0) {
                scoutFailuresLeft -= 1;
                throw new Error('fetch failed sending request');
            }

            if (systemInstruction.startsWith('STAGE: scout')) {
                return {
                    queryMode: 'short_issue',
                    primaryDomain: 'icra',
                    sourceTargets: ['yargitay'],
                    riskTags: [],
                    allowEvidenceAsCore: false,
                };
            }

            return {
                queryMode: 'short_issue',
                primaryDomain: 'icra',
                coreIssue: 'Itirazin iptali davasinda cari hesap alacagi talebi',
                retrievalConcepts: ['itirazin iptali davasi', 'icra takibi', 'cari hesap alacagi'],
                supportConcepts: ['icra inkar tazminati'],
                evidenceConcepts: ['fatura'],
                sourceTargets: ['yargitay'],
            };
        };

        const result = await generateLegalSearchPlanWithDiagnostics({
            rawText: 'Borca itiraz uzerine acilan itirazin iptali davasinda cari hesap alacagi talebi.',
            preferredSource: 'all',
            generateStructuredJsonImpl: mockGenerateStructuredJson,
        });

        expect(callCount).toBe(4);
        expect(result.planDiagnostics.transportRetryCount).toBe(2);
        expect(result.planDiagnostics.finalStatus).toBe('accepted');
    });

    it('falls back to a minimal safe plan after retry and review still fail', async () => {
        let stageIndex = 0;
        const mockGenerateStructuredJson = async () => {
            stageIndex += 1;
            if (stageIndex === 1) {
                return {
                    queryMode: 'long_fact',
                    primaryDomain: 'ceza',
                    sourceTargets: ['yargitay'],
                    riskTags: ['bucket_risk'],
                    allowEvidenceAsCore: false,
                };
            }

            return {
                queryMode: 'long_fact',
                primaryDomain: 'ceza',
                coreIssue: 'Uyusturucu madde ticareti sucu ile kullanmak icin bulundurma ayrimi',
                retrievalConcepts: ['paketleme', 'hassas terazi'],
                supportConcepts: ['ele gecirilen miktar'],
                evidenceConcepts: [],
                sourceTargets: ['yargitay'],
            };
        };

        const result = await generateLegalSearchPlanWithDiagnostics({
            rawText: 'Uyusturucu madde ticareti ile kullanmak icin bulundurma ayrimi ve dosya kapsaminda paketleme ile terazi detaylari tartisilmaktadir. '.repeat(8),
            preferredSource: 'all',
            generateStructuredJsonImpl: mockGenerateStructuredJson,
        });

        expect(result.planDiagnostics.finalStatus).toBe('fallback');
        expect(result.planDiagnostics.retryCount).toBe(1);
        expect(result.plan.retrievalConcepts.length).toBeGreaterThan(0);
        expect(result.plan.retrievalConcepts).not.toEqual(expect.arrayContaining(['paketleme', 'hassas terazi']));
        expect(result.plan.evidenceConcepts).toEqual(expect.arrayContaining(['paketleme', 'hassas terazi', 'ele gecirilen miktar']));
    });
});
