// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
    buildAgentDrivenSearchText,
    parseAnalyzePayload,
} from '../scripts/alt-app-agent-search-console.mjs';

describe('alt-app agent search console helpers', () => {
    it('prefers searchSeedText when packet provides it', () => {
        const text = buildAgentDrivenSearchText(
            {
                searchSeedText: 'Ise iade gecersiz fesih',
                coreIssue: 'Bunu kullanma',
                caseType: 'Ise iade',
                requiredConcepts: ['fesih'],
            },
            'ozet',
            'ham metin'
        );

        expect(text).toBe('Ise iade gecersiz fesih');
    });

    it('falls back to packet concepts when searchSeedText is empty', () => {
        const text = buildAgentDrivenSearchText(
            {
                searchSeedText: '',
                coreIssue: 'Aranacak asli mesele',
                caseType: 'Tazminat',
                requiredConcepts: ['haksiz fesih'],
                supportConcepts: ['isveren'],
            },
            'ozet',
            'ham metin'
        );

        expect(text).toContain('Aranacak asli mesele');
        expect(text).toContain('Tazminat');
        expect(text).toContain('haksiz fesih');
    });

    it('parses analyze response and extracts legalSearchPacket', () => {
        const payload = parseAnalyzePayload({
            text: `\`\`\`json
${JSON.stringify({
    summary: 'Ozet',
    legalSearchPacket: {
        searchSeedText: 'TCK 188 uyusturucu madde ticareti',
    },
}, null, 2)}
\`\`\``,
        });

        expect(payload.summary).toBe('Ozet');
        expect(payload.legalSearchPacket?.searchSeedText).toBe('TCK 188 uyusturucu madde ticareti');
    });
    it('repairs malformed searchVariants queries while parsing analyze response', () => {
        const payload = parseAnalyzePayload({
            text: '{"summary":"Ozet","legalSearchPacket":{"searchSeedText":"TCK 188 uyusturucu madde ticareti","searchVariants":[{"query":"+"uyu?turucu madde ticareti" +"TCK 188"","mode":"strict"}]}}',
        });

        expect(payload.legalSearchPacket?.searchVariants?.[0]).toEqual({
            query: '+"uyu?turucu madde ticareti" +"TCK 188"',
            mode: 'strict',
        });
    });
});
