import { describe, expect, it } from 'vitest';
import { __testables as matrixTestables } from '../scripts/legal-live-matrix.mjs';
import { __testables as smokeTestables } from '../scripts/legal-live-domain-400-safe.mjs';

describe('legal live report scripts', () => {
    it('marks the matrix markdown report as the main health report', () => {
        const markdown = matrixTestables.buildMarkdownReport(
            '14.03.2026 19:00:00',
            {
                total: 4,
                overallScore: 0.8,
                passCount: 3,
                borderlineCount: 1,
                failCount: 0,
                zeroResultRate: 0.05,
                fallbackUsageRate: 0.2,
                shortIssueScore: 0.9,
                targetOverallOk: true,
                branchFloorOk: true,
                zeroResultTargetOk: true,
            },
            [],
            [],
            [],
        );

        expect(markdown).toContain('Rapor tipi: matrix');
        expect(markdown).toContain('ana saglik gostergesidir');
    });

    it('treats explanation traces as a positive signal in the smoke report scorer', () => {
        expect(smokeTestables.hasExplanationSignal({
            matchedKeywords: [],
            matchedRequiredConcepts: [],
            selectionReason: 'Tam metin dogrulamasi gecti.',
            retrievalStage: 'full_text',
        })).toBe(true);

        const score = smokeTestables.toScore({
            detectedSkill: 'aile',
            expectedSkill: 'aile',
            expectedSource: 'yargitay',
            skillDiagnostics: { coreIssue: 'bosanma velayet nafaka' },
            topResults: [
                {
                    source: 'yargitay',
                    matchedKeywordCount: 0,
                    matchedKeywords: [],
                    selectionReason: 'Tam metin dogrulamasi gecti.',
                    retrievalStage: 'full_text',
                },
                { source: 'yargitay' },
                { source: 'yargitay' },
            ],
        });

        expect(score).toBeGreaterThanOrEqual(90);
    });

    it('splits live smoke cases into small batches and marks 429 errors as retryable', () => {
        expect(smokeTestables.chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(smokeTestables.isRetryableLiveErrorMessage('HTTP 429: Too Many Requests')).toBe(true);
        expect(smokeTestables.isRetryableLiveErrorMessage('normal validation error')).toBe(false);
    });

    it('splits live matrix runs into small batches and marks timeout-like errors as retryable', () => {
        expect(matrixTestables.chunkItems(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
        expect(matrixTestables.isRetryableMatrixErrorMessage('timeout')).toBe(true);
        expect(matrixTestables.isRetryableMatrixErrorMessage('EPIPE: broken pipe')).toBe(true);
        expect(matrixTestables.isRetryableMatrixErrorMessage('unexpected schema error')).toBe(false);
    });
});
