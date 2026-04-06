import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import {
    buildRetryKeywords,
    extractContextFromChatHistory,
    stripSearchCommandPhrases,
} from '../src/utils/chatSearchContext';

describe('chat search context helpers', () => {
    it('strips generic web search commands and keeps the actual topic', () => {
        expect(stripSearchCommandPhrases('Iscilik alacaklari hesaplamasini web aramasi yaparak dogrula'))
            .toBe('iscilik alacaklari hesaplamasini');
    });

    it('uses prior messages as context when the latest message is only a search command', () => {
        const messages: ChatMessage[] = [
            { role: 'user', text: 'Muvekkilin fazla mesai ve kidem tazminati hesabini anlattim.' },
            { role: 'model', text: 'Detaylari aldim, iscilik alacaklari ekseninde inceleyebiliriz.' },
            { role: 'user', text: 'web aramasi yap' },
        ];

        const context = extractContextFromChatHistory(messages);
        expect(context).toContain('fazla mesai');
        expect(context).toContain('iscilik alacaklari');
    });

    it('does not keep literal web-search command words in retry keywords', () => {
        expect(buildRetryKeywords('web aramasi yap', 6)).toEqual([]);
        expect(buildRetryKeywords('Iscilik alacaklari icin web aramasi yap', 6)).toEqual([
            'iscilik',
            'alacaklari',
        ]);
    });
});
