import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import {
    buildRetryKeywords,
    extractContextFromChatHistory,
    resolveSearchTopicFromMessage,
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
        expect(context).not.toContain('iscilik alacaklari');
    });

    it('does not keep literal web-search command words in retry keywords', () => {
        expect(buildRetryKeywords('web aramasi yap', 6)).toEqual([]);
        expect(buildRetryKeywords('Iscilik alacaklari icin web aramasi yap', 6)).toEqual([
            'iscilik',
            'alacaklari',
        ]);
    });

    it('falls back to prior chat context when the latest message is command-only', () => {
        const messages: ChatMessage[] = [
            { role: 'user', text: 'Fesih 01.01.2024, fazla mesai ve yillik izin alacaklari icin hesap raporu istiyorum.' },
            { role: 'model', text: 'Zaman asimi ve iscilik alacaklari yonunden bakabiliriz.' },
            { role: 'user', text: 'web aramasi yap' },
        ];

        expect(resolveSearchTopicFromMessage('web aramasi yap', messages)).toContain('fazla mesai');
    });

    it('falls back to the prior user facts for generic legal follow-up commands', () => {
        const messages: ChatMessage[] = [
            { role: 'user', text: 'Ahmet Yilmaz 2018-2024 arasinda calisti, haftada 60 saat mesai yapti ve 28 gun izni kaldi.' },
            { role: 'model', text: 'Isterseniz emsal karar ara diyebilirsiniz.' },
            { role: 'user', text: 'Bu konuyla ilgili guclu emsal kararlar bul ve kisa kisa acikla' },
        ];

        expect(resolveSearchTopicFromMessage('Bu konuyla ilgili guclu emsal kararlar bul ve kisa kisa acikla', messages)).toContain('ahmet yilmaz');
        expect(extractContextFromChatHistory(messages)).not.toContain('emsal karar ara');
    });
});
