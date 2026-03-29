import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appMainMocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    searchLegalFromChat: vi.fn(),
    streamChatResponse: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('../src/contexts/AuthContext', () => ({
    useAuth: appMainMocks.useAuth,
}));

vi.mock('../services/geminiService', () => ({
    analyzeDocuments: vi.fn(),
    generateSearchKeywords: vi.fn(),
    performWebSearch: vi.fn(),
    generatePetition: vi.fn(),
    streamChatResponse: appMainMocks.streamChatResponse,
    rewriteText: vi.fn(),
    reviewPetition: vi.fn(),
}));

vi.mock('../src/hooks/useLegalSearch', () => ({
    useLegalSearch: () => ({
        search: appMainMocks.searchLegalFromChat,
        fetchFullText: vi.fn(),
        loading: false,
        analysis: null,
        decisions: [],
        error: null,
        fullTextCache: {},
    }),
}));

vi.mock('../components/Header', () => ({
    Header: () => <div>Header</div>,
}));

vi.mock('../components/InputPanel', () => ({
    InputPanel: ({ legalSearchResults }: { legalSearchResults: Array<{ title: string }> }) => (
        <div>
            {legalSearchResults.map((result) => (
                <div key={result.title}>{result.title}</div>
            ))}
        </div>
    ),
}));

vi.mock('../components/OutputPanel', () => ({
    OutputPanel: ({
        onSendMessage,
        chatMessages,
    }: {
        onSendMessage: (message: string, files?: File[]) => void;
        chatMessages: Array<{ text: string }>;
    }) => (
        <div>
            <button type="button" onClick={() => onSendMessage('emsal ara kira temerrut tahliye')}>
                Send Legal
            </button>
            <button type="button" onClick={() => onSendMessage('normal sohbet mesaji')}>
                Send Normal
            </button>
            {chatMessages.map((message, index) => (
                <div key={`${message.text}-${index}`}>{message.text}</div>
            ))}
        </div>
    ),
}));

vi.mock('../components/PetitionView', () => ({
    PetitionView: () => null,
}));

vi.mock('../components/ProgressSummary', () => ({
    ProgressSummary: () => null,
}));

vi.mock('../components/Toast', () => ({
    ToastContainer: () => null,
}));

vi.mock('../src/components/LegalSearchPanel', () => ({
    LegalSearchPanel: () => null,
}));

vi.mock('../components/LoadingSpinner', () => ({
    LoadingSpinner: () => null,
}));

vi.mock('../components/Icon', () => ({
    SparklesIcon: () => null,
}));

vi.mock('../lib/supabase', () => ({
    Petition: {},
    supabase: {
        from: vi.fn(() => ({
            upsert: vi.fn(async () => ({ error: null })),
        })),
    },
}));

vi.mock('react-hot-toast', () => ({
    toast: {
        success: appMainMocks.toastSuccess,
        error: appMainMocks.toastError,
    },
}));

import { AppMain } from '../src/components/AppMain';

describe('AppMain legal intent wiring', () => {
    beforeEach(() => {
        appMainMocks.useAuth.mockReturnValue({
            user: { id: 'user-1' },
            profile: null,
            loading: false,
        });
        appMainMocks.searchLegalFromChat.mockReset();
        appMainMocks.streamChatResponse.mockReset();
        appMainMocks.toastSuccess.mockReset();
        appMainMocks.toastError.mockReset();

        appMainMocks.searchLegalFromChat.mockResolvedValue([
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
        appMainMocks.streamChatResponse.mockImplementation(async function* streamResponse() {
            yield { text: 'LLM cevabi' };
        });
    });

    it('runs the shared hook for legal intent messages and appends the batch message', async () => {
        render(
            <MemoryRouter>
                <AppMain />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send legal/i }));

        await waitFor(() => {
            expect(appMainMocks.searchLegalFromChat).toHaveBeenCalledWith(expect.objectContaining({
                text: 'emsal ara kira temerrut tahliye',
            }));
        });

        await waitFor(() => {
            expect(screen.getAllByText('Yargitay 3. Hukuk Dairesi Karari').length).toBeGreaterThan(0);
        });
        expect(appMainMocks.streamChatResponse).not.toHaveBeenCalled();
        expect(screen.getByText(/legal_research_batch/i)).toBeInTheDocument();
    });

    it('keeps the normal chat flow unchanged when there is no legal intent', async () => {
        render(
            <MemoryRouter>
                <AppMain />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /send normal/i }));

        await waitFor(() => {
            expect(appMainMocks.streamChatResponse).toHaveBeenCalled();
        });
        expect(appMainMocks.searchLegalFromChat).not.toHaveBeenCalled();
    });
});
