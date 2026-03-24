import { describe, expect, it } from 'vitest';
import { __testables } from '../lib/legal/simpleBedestenService.js';

const {
    scoreDocumentAgainstSignals,
    passesStrictQueryPrecisionGate,
    assessSimpleQuality,
} = __testables;

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
});
