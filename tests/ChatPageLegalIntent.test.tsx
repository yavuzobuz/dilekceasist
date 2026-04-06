import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chatPageMocks = vi.hoisted(() => ({
    searchLegalFromIntent: vi.fn(),
    streamChatResponse: vi.fn(),
    analyzeDocuments: vi.fn(),
    performWebSearch: vi.fn(),
    generatePetition: vi.fn(),
    searchLegalDecisionsDetailed: vi.fn(),
}));

vi.mock('../components/Header', () => ({
    Header: () => <div>Header</div>,
}));

vi.mock('../components/Footer', () => ({
    Footer: () => <div>Footer</div>,
}));

vi.mock('../components/ChatView', () => ({
    ChatView: ({
        messages,
        onSendMessage,
    }: {
        messages: Array<{ role: string; text: string }>;
        onSendMessage: (message: string, files?: File[]) => void;
    }) => (
        <div>
            <button type="button" onClick={() => onSendMessage('emsal ara kira temerrut tahliye')}>
                Send Legal
            </button>
            <button
                type="button"
                onClick={() => onSendMessage(`Daha detayli bir savunma dilekcesi hazirlatmak isterseniz "belge olustur" diyebilir veya bu konuyla ilgili benzer davalarin sonuclarini incelemek icin "emsal karar ara" komutunu verebilirsiniz.\n\nBu konuyu webde derin arastir, guncel mevzuat ve uygulamayi ozetle`)}
            >
                Send Mixed
            </button>
            <button type="button" onClick={() => onSendMessage('Ahmet Yilmaz 2018-2024 arasinda calisti, haftada 60 saat mesai yapti ve 28 gun izni kaldi.')}>
                Send Normal
            </button>
            <button
                type="button"
                onClick={() => onSendMessage('Bu konuyla ilgili guclu emsal kararlar bul ve kisa kisa acikla')}
            >
                Send Generic Legal Followup
            </button>
            {messages.map((message, index) => (
                <div key={`${message.role}-${index}`}>{message.text}</div>
            ))}
        </div>
    ),
}));

vi.mock('../components/Toast', () => ({
    ToastContainer: () => null,
}));

vi.mock('../components/LoadingSpinner', () => ({
    LoadingSpinner: () => null,
}));

vi.mock('../components/Icon', () => ({
    SparklesIcon: () => null,
}));

vi.mock('../services/geminiService', () => ({
    analyzeDocuments: chatPageMocks.analyzeDocuments,
    generateSearchKeywords: vi.fn(),
    performWebSearch: chatPageMocks.performWebSearch,
    streamChatResponse: chatPageMocks.streamChatResponse,
    generatePetition: chatPageMocks.generatePetition,
}));

vi.mock('../src/hooks/useLegalSearch', () => ({
    useLegalSearch: () => ({
        search: chatPageMocks.searchLegalFromIntent,
        fetchFullText: vi.fn(),
        loading: false,
        analysis: null,
        decisions: [],
        error: null,
        fullTextCache: {},
    }),
}));

vi.mock('../src/utils/legalSearch', () => ({
    buildLegalSearchInputs: vi.fn((payload: any) => ({
        keyword: Array.isArray(payload.queryInput) ? payload.queryInput.join(' ') : String(payload.queryInput || ''),
        rawQuery: Array.isArray(payload.queryInput) ? payload.queryInput.join(' ') : String(payload.queryInput || ''),
        legalSearchPacket: payload.legalSearchPacket || null,
    })),
    normalizeLegalSearchResults: vi.fn((payload: any) => payload || []),
    searchLegalDecisionsDetailed: chatPageMocks.searchLegalDecisionsDetailed,
    getLegalDocument: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            upsert: vi.fn(),
            insert: vi.fn(),
        })),
    },
}));

import ChatPage from '../src/pages/ChatPage';

describe('ChatPage legal intent parity', () => {
    beforeEach(() => {
        chatPageMocks.searchLegalFromIntent.mockReset();
        chatPageMocks.streamChatResponse.mockReset();
        chatPageMocks.analyzeDocuments.mockReset();
        chatPageMocks.performWebSearch.mockReset();
        chatPageMocks.generatePetition.mockReset();
        chatPageMocks.searchLegalDecisionsDetailed.mockReset();

        chatPageMocks.searchLegalFromIntent.mockResolvedValue([
            {
                title: 'Yargitay 3. Hukuk Dairesi Karari',
                daire: '3. Hukuk Dairesi',
                esasNo: '2024/10',
                kararNo: '2024/20',
                tarih: '01.01.2024',
                documentId: 'doc-1',
                documentUrl: 'https://example.com/karar/1',
            },
        ]);

        chatPageMocks.streamChatResponse.mockImplementation(async function* streamResponse() {
            yield { text: 'LLM cevabi' };
        });

        chatPageMocks.searchLegalDecisionsDetailed.mockResolvedValue({
            normalizedResults: [],
        });
    });

    it('uses the shared hook and short-circuits normal flow for explicit legal intent', async () => {
        render(
            <MemoryRouter>
                <ChatPage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send legal/i }));

        await waitFor(() => {
            expect(chatPageMocks.searchLegalFromIntent).toHaveBeenCalledWith(expect.objectContaining({
                text: 'kira temerrut tahliye',
            }));
        });

        expect(chatPageMocks.streamChatResponse).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByText(/legal_research_batch/)).toBeInTheDocument();
            expect(screen.getByText(/Yargitay 3\. Hukuk Dairesi Karari/)).toBeInTheDocument();
        });
    }, 10000);

    it('keeps the existing LLM flow when no legal intent is detected', async () => {
        render(
            <MemoryRouter>
                <ChatPage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send normal/i }));

        await waitFor(() => {
            expect(chatPageMocks.streamChatResponse).toHaveBeenCalled();
        });
        expect(chatPageMocks.searchLegalFromIntent).not.toHaveBeenCalled();
    });

    it('prefers the latest web intent when pasted text earlier contains legal-search phrases', async () => {
        chatPageMocks.performWebSearch.mockResolvedValue({
            summary: 'Guncel mevzuat ozeti',
            sources: [{ uri: 'https://example.com', title: 'Kaynak' }],
        });

        render(
            <MemoryRouter>
                <ChatPage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send mixed/i }));

        await waitFor(() => {
            expect(chatPageMocks.streamChatResponse).toHaveBeenCalled();
        });
        expect(chatPageMocks.searchLegalFromIntent).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(chatPageMocks.performWebSearch).toHaveBeenCalled();
        });
    });

    it('does not use the shortcut legal-search path for generic follow-up commands', async () => {
        render(
            <MemoryRouter>
                <ChatPage />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send normal/i }));
        await waitFor(() => {
            expect(chatPageMocks.streamChatResponse).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /send generic legal followup/i }));

        await waitFor(() => {
            expect(chatPageMocks.streamChatResponse).toHaveBeenCalledTimes(2);
        });
        expect(chatPageMocks.searchLegalFromIntent).not.toHaveBeenCalled();
    });

});
