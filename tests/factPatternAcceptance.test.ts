// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { __testables } from '../lib/legal/simpleBedestenService.js';

const {
    buildDocumentRerankSignals,
    scoreDocumentAgainstSignals,
    passesStrictQueryPrecisionGate,
    assessSimpleQuality,
} = __testables;

const normalizeConcepts = (values) =>
    (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').toLocaleLowerCase('tr-TR'));

describe('fact-pattern acceptance', () => {
    it('penalizes procedural shell documents that only repeat the offense label', () => {
        const signals = {
            phraseSignals: ['uyusturucu madde ticareti'],
            queryCorePhraseSignals: ['uyusturucu madde ticareti'],
            substantiveSignals: ['uyusturucu madde ticareti', 'tck 188'],
            evidenceSignals: ['metamfetamin', 'hassas terazi'],
            factPatternSignals: ['yakalama sonrasi', 'metamfetamin', 'hassas terazi'],
            tokenSignals: ['uyusturucu', 'ticareti', '188', 'metamfetamin', 'terazi'],
            queryCoreTokenSignals: ['uyusturucu', 'ticareti', '188'],
            negativeSignals: [],
        };

        const shellScore = scoreDocumentAgainstSignals({
            primaryDomain: 'ceza',
            signals,
            documentText: `
                SUC: Uyusturucu madde ticareti yapma.
                HUKUM: Istinaf basvurusunun esastan reddi.
                TEMYIZ ISTEMLERININ ESASTAN REDDI ILE HUKMUN ONANMASINA.
            `,
        });

        const factualScore = scoreDocumentAgainstSignals({
            primaryDomain: 'ceza',
            signals,
            documentText: `
                Olay tarihinde yapilan fiziki takip sonucu sanigin diger saniga bir sey verdigi gorulmustur.
                Yakalama sonrasi uzerinde metamfetamin bulunmus, ikamet aramasinda hassas terazi ele gecirilmistir.
                Bu nedenle uyusturucu madde ticareti sucu kapsaminda TCK 188 uygulanmistir.
            `,
        });

        expect(shellScore.factPatternHits).toHaveLength(0);
        expect(shellScore.proceduralHits.length).toBeGreaterThan(0);
        expect(factualScore.factPatternHits.length).toBeGreaterThan(0);
        expect(factualScore.score).toBeGreaterThan(shellScore.score);
    });

    it('rejects procedural shell results in strict precision gate without fact-pattern support', () => {
        const shellResult = {
            source: 'yargitay',
            daire: '10. Ceza Dairesi',
            summaryText: 'Uyuşturucu madde ticareti yapma suçu nedeniyle temyiz isteminin esastan reddi ile hükmün onanmasına.',
            contentScore: 240,
            queryCoreSignalCount: 1,
            queryTokenSignalCount: 3,
            contentMatchedQueryCore: ['uyusturucu madde ticareti'],
            contentMatchedQueryTokens: ['uyusturucu', 'ticareti', '188'],
            matchedRequiredConcepts: ['uyusturucu madde ticareti'],
            contentMatchedSubstantive: ['uyusturucu madde ticareti'],
            contentProceduralHits: ['istinaf basvurusunun esastan reddi', 'temyiz istemlerinin esastan reddi'],
        };

        const factualResult = {
            ...shellResult,
            summaryText: 'Yakalama sonrasi metamfetamin ele gecirildigi, ikamet aramasinda hassas terazi bulundugu ve fiziki takip yapildigi degerlendirilmistir.',
            matchedEvidenceConcepts: ['metamfetamin', 'hassas terazi'],
            matchedSupportConcepts: ['fiziki takip'],
            contentMatchedFactPattern: ['metamfetamin', 'hassas terazi', 'yakalama sonrasi'],
            contentProceduralHits: ['istinaf basvurusunun esastan reddi'],
        };

        expect(passesStrictQueryPrecisionGate({
            result: shellResult,
            primaryDomain: 'ceza',
            subdomain: 'ceza_uyusturucu',
            strictMatchMode: 'query_core',
        })).toBe(false);

        expect(passesStrictQueryPrecisionGate({
            result: factualResult,
            primaryDomain: 'ceza',
            subdomain: 'ceza_uyusturucu',
            strictMatchMode: 'query_core',
        })).toBe(true);
    });

    it('lowers quality score for shell-heavy top results and rewards factual similarity', () => {
        const shellQuality = assessSimpleQuality({
            primaryDomain: 'ceza',
            results: [
                {
                    source: 'yargitay',
                    daire: '10. Ceza Dairesi',
                    summaryText: 'Temyiz isteminin esastan reddi ile hukmun onanmasina.',
                    matchedRequiredConcepts: ['uyusturucu madde ticareti'],
                    contentMatchedSubstantive: ['uyusturucu madde ticareti'],
                    contentProceduralHits: ['istinaf basvurusunun esastan reddi', 'temyiz istemlerinin esastan reddi'],
                },
            ],
        });

        const factualQuality = assessSimpleQuality({
            primaryDomain: 'ceza',
            results: [
                {
                    source: 'yargitay',
                    daire: '10. Ceza Dairesi',
                    summaryText: 'Yapilan arama sonucu metamfetamin ve hassas terazi ele gecirildigi, fiziki takip yapildigi degerlendirilmistir.',
                    matchedRequiredConcepts: ['uyusturucu madde ticareti'],
                    matchedSupportConcepts: ['fiziki takip'],
                    matchedEvidenceConcepts: ['metamfetamin', 'hassas terazi'],
                    contentMatchedSubstantive: ['uyusturucu madde ticareti'],
                    contentMatchedFactPattern: ['metamfetamin', 'hassas terazi', 'yapilan arama sonucu'],
                    contentProceduralHits: ['istinaf basvurusunun esastan reddi'],
                },
            ],
        });

        expect(shellQuality.reasons).toContain('missing_fact_pattern');
        expect(shellQuality.reasons).toContain('procedural_shell_bias');
        expect(factualQuality.topFactPatternHitCount).toBeGreaterThan(shellQuality.topFactPatternHitCount);
        expect(factualQuality.score).toBeGreaterThan(shellQuality.score);
    });

    it('penalizes TCK 191-only content when semantic intent is TCK 188 trade', () => {
        const signals = {
            phraseSignals: ['uyusturucu madde ticareti', 'ticaret kasti'],
            queryCorePhraseSignals: ['tck 188', 'uyusturucu madde ticareti'],
            substantiveSignals: ['tck 188', 'uyusturucu madde ticareti', 'ticaret kasti'],
            evidenceSignals: ['paketleme', 'hassas terazi'],
            factPatternSignals: ['fiziki takip', 'paketleme', 'hassas terazi'],
            tokenSignals: ['uyusturucu', 'ticaret', '188', 'terazi'],
            queryCoreTokenSignals: ['uyusturucu', 'ticaret', '188'],
            mustSignals: ['tck 188', 'uyusturucu madde ticareti'],
            contrastSignals: ['tck 191', 'kullanmak icin bulundurma'],
            negativeSignals: [],
        };

        const tradeScore = scoreDocumentAgainstSignals({
            primaryDomain: 'ceza',
            signals,
            documentText: `
                Sanigin eyleminin TCK 188 kapsaminda uyusturucu madde ticareti oldugu,
                fiziki takip, paketleme ve hassas terazi delilleriyle birlikte degerlendirilmistir.
            `,
        });

        const possessionScore = scoreDocumentAgainstSignals({
            primaryDomain: 'ceza',
            signals,
            documentText: `
                Sanik hakkinda TCK 191 kapsaminda kullanmak icin bulundurma sucu nedeniyle
                kisisel kullanim siniri tartisilmistir.
            `,
        });

        expect(tradeScore.mustHits).toEqual(expect.arrayContaining(['tck 188', 'uyusturucu madde ticareti']));
        expect(possessionScore.contrastHits).toEqual(expect.arrayContaining(['tck 191', 'kullanmak icin bulundurma']));
        expect(tradeScore.score).toBeGreaterThan(possessionScore.score);
    });

    it('penalizes generic kira results missing tahliye and temerrut anchors', () => {
        const signals = {
            phraseSignals: ['kira', 'temerrut', 'tahliye'],
            queryCorePhraseSignals: ['temerrut', 'tahliye'],
            substantiveSignals: ['kira', 'temerrut', 'tahliye', 'tbk 315'],
            evidenceSignals: ['ihtarname'],
            factPatternSignals: ['ihtar', 'odememe', 'kira bedeli'],
            tokenSignals: ['kira', 'temerrut', 'tahliye', 'tbk', '315'],
            queryCoreTokenSignals: ['temerrut', 'tahliye', '315'],
            mustSignals: ['temerrut', 'tahliye'],
            contrastSignals: ['kira tespiti', 'kira artisi'],
            negativeSignals: [],
        };

        const tahliyeScore = scoreDocumentAgainstSignals({
            primaryDomain: 'borclar',
            signals,
            documentText: `
                Kiracinin kira bedelini odememesi nedeniyle temerrut olustugu,
                TBK 315 uyarinca ihtarname ve tahliye kosullarinin degerlendirildigi belirtilmistir.
            `,
        });

        const kiraTespitScore = scoreDocumentAgainstSignals({
            primaryDomain: 'borclar',
            signals,
            documentText: `
                Uyuşmazlik kira tespiti ve kira artisi istemine iliskindir.
                Rayic bedel ve TUFE artisi uzerinden inceleme yapilmistir.
            `,
        });

        expect(tahliyeScore.mustHits).toEqual(expect.arrayContaining(['temerrut', 'tahliye']));
        expect(kiraTespitScore.contrastHits).toEqual(expect.arrayContaining(['kira tespiti', 'kira artisi']));
        expect(tahliyeScore.score).toBeGreaterThan(kiraTespitScore.score);
    });

    it('suppresses broad static ceza signals when agentic must/contrast signals are available', async () => {
        const signals = await buildDocumentRerankSignals({
            primaryDomain: 'ceza',
            querySeedText: 'TCK 188 uyusturucu madde ticareti',
            rawText: 'Ticareti yapma veya saglama sucunun TCK 188 kapsamindaki unsurlari nelerdir?',
            skillPlan: {
                retrievalConcepts: ['TCK 188', 'uyusturucu madde ticareti', 'ticaret kasti'],
                supportConcepts: ['saglama'],
                evidenceConcepts: ['paketleme'],
                negativeConcepts: ['kisisel kullanim'],
                mustConcepts: ['TCK 188', 'uyusturucu madde ticareti'],
                contrastConcepts: ['TCK 191', 'kullanmak icin bulundurma'],
            },
        });

        expect(normalizeConcepts(signals.mustSignals)).toEqual(expect.arrayContaining(['tck 188', 'uyusturucu madde ticareti']));
        expect(normalizeConcepts(signals.contrastSignals)).toEqual(expect.arrayContaining(['tck 191', 'kullanmak icin bulundurma']));
        expect(normalizeConcepts(signals.substantiveSignals)).not.toContain('kullanmak icin bulundurma');
        expect(normalizeConcepts(signals.substantiveSignals)).not.toContain('tck 191');
    });

    it('suppresses broad static borclar signals when agentic kira tahliye signals are available', async () => {
        const signals = await buildDocumentRerankSignals({
            primaryDomain: 'borclar',
            querySeedText: 'kira temerrut tahliye',
            rawText: 'Kiracim kirasini odemiyor, tahliye etmek istiyorum.',
            skillPlan: {
                retrievalConcepts: ['kira', 'temerrut', 'tahliye'],
                supportConcepts: ['TBK 315', 'ihtarname'],
                negativeConcepts: ['bosanma', 'nafaka'],
                mustConcepts: ['temerrut', 'tahliye'],
                contrastConcepts: ['kira tespiti', 'kira artisi'],
            },
        });

        expect(normalizeConcepts(signals.mustSignals)).toEqual(expect.arrayContaining(['temerrut', 'tahliye']));
        expect(normalizeConcepts(signals.contrastSignals)).toEqual(expect.arrayContaining(['kira tespiti', 'kira artisi']));
        expect(normalizeConcepts(signals.substantiveSignals)).not.toContain('kira tespiti');
    });
});
