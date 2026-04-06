import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatView } from '../components/ChatView';
import { buildLegalResearchBatchMessage } from '../lib/legal/chatLegalIntent';

vi.mock('../components/VoiceInputButton', () => ({
    VoiceInputButton: () => null,
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ChatView legal research batch', () => {
    it('renders legal_research_batch messages as decision cards', () => {
        const batchMessage = buildLegalResearchBatchMessage([
            {
                title: 'Yargitay 3. Hukuk Dairesi Karari',
                daire: '3. Hukuk Dairesi',
                esasNo: '2024/10',
                kararNo: '2024/20',
                tarih: '01.01.2024',
                documentUrl: 'https://example.com/karar/1',
            },
        ]);

        render(
            <ChatView
                messages={[{ role: 'model', text: batchMessage }]}
                onSendMessage={() => undefined}
                isLoading={false}
                statusText=""
                searchKeywords={[]}
                setSearchKeywords={() => undefined}
                webSearchResult={null}
                setWebSearchResult={() => null}
                precedentContext=""
                setPrecedentContext={() => undefined}
                docContent=""
                setDocContent={() => undefined}
                specifics=""
                setSpecifics={() => undefined}
            />
        );

        expect(screen.getByText('Yargitay 3. Hukuk Dairesi Karari')).toBeInTheDocument();
        expect(screen.getByText('3. Hukuk Dairesi')).toBeInTheDocument();
        expect(screen.getByText('E. 2024/10')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /kaynak/i })).toHaveAttribute('href', 'https://example.com/karar/1');
    });

    it('renders multi-line guide card copy for party-based search examples', () => {
        render(
            <ChatView
                messages={[]}
                onSendMessage={() => undefined}
                isLoading={false}
                statusText=""
                searchKeywords={[]}
                setSearchKeywords={() => undefined}
                webSearchResult={null}
                setWebSearchResult={() => null}
                precedentContext=""
                setPrecedentContext={() => undefined}
                docContent=""
                setDocContent={() => undefined}
                specifics=""
                setSpecifics={() => undefined}
                guideCards={[
                    {
                        title: 'Ne İstediğinizi Net Söyleyin',
                        description: '"Web araması yap", "emsal karar ara" veya "bunu düzelt" gibi kısa komutlar kullanabilirsiniz.\nTaraf bazlı arama istiyorsanız "sanık lehine karar ara", "davacı lehine emsal karar ara" ya da "davalı lehine web araması yap" diye yazabilirsiniz.',
                    },
                ]}
            />
        );

        expect(screen.getByText('Ne İstediğinizi Net Söyleyin')).toBeInTheDocument();
        expect(screen.getByText(/sanık lehine karar ara/i)).toBeInTheDocument();
        expect(screen.getByText(/davacı lehine emsal karar ara/i)).toBeInTheDocument();
        expect(screen.getByText(/davalı lehine web araması yap/i)).toBeInTheDocument();
    });
});
