import { describe, expect, it } from 'vitest';
import { __testables } from '../lib/legal/legalSearchRerank.js';
const { buildQueryModeConfig, canPassSummary, canPassFinal, buildZeroResultReason } = __testables;
describe('legalSearchRerank helpers', () => {
    it('lets case_file summaries pass with one core hit only when semantic score is strong enough', () => {
        const config = buildQueryModeConfig('case_file', 3);
        expect(canPassSummary({
            queryMode: 'case_file',
            summaryKeywordHits: 1,
            semanticScore: 0.55,
            config,
        })).toBe(true);
        expect(canPassSummary({
            queryMode: 'case_file',
            summaryKeywordHits: 1,
            semanticScore: 0.54,
            config,
        })).toBe(false);
    });
    it('keeps case_file final gate stricter than the summary gate', () => {
        const config = buildQueryModeConfig('case_file', 3);
        expect(canPassFinal({
            selectionMode: 'strict',
            queryMode: 'case_file',
            retrievalHits: 1,
            supportHits: 0,
            semanticScore: 0.60,
            config,
        })).toBe(true);
        expect(canPassFinal({
            selectionMode: 'strict',
            queryMode: 'case_file',
            retrievalHits: 1,
            supportHits: 0,
            semanticScore: 0.59,
            config,
        })).toBe(false);
    });
    it('only allows semantic fallback with very strong semantic score plus core or support support', () => {
        const config = buildQueryModeConfig('case_file', 3);
        expect(canPassFinal({
            selectionMode: 'semantic_fallback',
            queryMode: 'case_file',
            retrievalHits: 0,
            supportHits: 2,
            semanticScore: 0.66,
            config,
        })).toBe(true);
        expect(canPassFinal({
            selectionMode: 'semantic_fallback',
            queryMode: 'case_file',
            retrievalHits: 0,
            supportHits: 1,
            semanticScore: 0.8,
            config,
        })).toBe(false);
    });
    it('reports why zero results happened', () => {
        expect(buildZeroResultReason({
            selectionMode: 'strict',
            totalCandidates: 10,
            summaryPassedCount: 3,
            fullTextCheckedCount: 2,
            finalMatchedCount: 0,
        })).toBe('strict_gate');
        expect(buildZeroResultReason({
            selectionMode: 'semantic_fallback',
            totalCandidates: 10,
            summaryPassedCount: 3,
            fullTextCheckedCount: 2,
            finalMatchedCount: 0,
        })).toBe('fallback_gate');
    });
});