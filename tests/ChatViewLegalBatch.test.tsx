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

    it('renders raw numbered batch text as cards instead of plain text', () => {
        const batchMessage = [
            'legal_research_batch',
            '',
            '1. 7. Hukuk Dairesi 2013/12849 E. 2013/19293 K.',
            'Daire: 7. Hukuk Dairesi | E. 2013/12849 | K. 2013/19293 | T. 14.11.2013',
            '[Kaynak ↗](https://mevzuat.adalet.gov.tr/ictihat/84216200)',
        ].join('\n');

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

        expect(screen.getByText('7. Hukuk Dairesi 2013/12849 E. 2013/19293 K.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /karari gor/i })).toBeInTheDocument();
        expect(screen.queryByText(/^legal_research_batch$/i)).not.toBeInTheDocument();
    });
});
