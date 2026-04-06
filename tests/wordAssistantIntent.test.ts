import { describe, expect, it } from 'vitest';
import { resolveWordAssistantIntent } from '../lib/assistant/intent-routing.js';

describe('resolveWordAssistantIntent', () => {
    it('enables legal search for precedent mode', () => {
        expect(resolveWordAssistantIntent({ mode: 'precedent_search', message: '' })).toEqual({
            appliedIntent: 'precedent_search',
            allowWebSearch: false,
            allowLegalSearch: true,
        });
    });

    it('enables both searches for research and answer mode', () => {
        expect(resolveWordAssistantIntent({ mode: 'research_and_answer', message: 'bosanma sureci' })).toEqual({
            appliedIntent: 'research_and_answer',
            allowWebSearch: true,
            allowLegalSearch: true,
        });
    });

    it('keeps brainstorm local unless the prompt explicitly asks for search', () => {
        expect(resolveWordAssistantIntent({ mode: 'brainstorm', message: 'bu konu icin strateji oner' })).toEqual({
            appliedIntent: 'brainstorm',
            allowWebSearch: false,
            allowLegalSearch: false,
        });
    });

    it('detects explicit legal search language inside brainstorm mode', () => {
        expect(resolveWordAssistantIntent({ mode: 'brainstorm', message: 'bu konu icin emsal karar ara' })).toEqual({
            appliedIntent: 'brainstorm_research',
            allowWebSearch: false,
            allowLegalSearch: true,
        });
    });
});
