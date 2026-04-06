import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appMainMocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
    useLegalSearch: vi.fn(),
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
    useLegalSearch: appMainMocks.useLegalSearch,
}));

vi.mock('../src/components/EmsalPanel', () => ({
    default: () => <div>Emsal Panel Mock</div>,
}));

vi.mock('../components/Header', () => ({
    Header: () => <div>Header</div>,
}));

vi.mock('../components/InputPanel', () => ({
    InputPanel: () => <div>Input Panel</div>,
}));

vi.mock('../components/OutputPanel', () => ({
    OutputPanel: () => <div>Output Panel</div>,
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

describe('AppMain Emsal panel placement', () => {
    beforeEach(() => {
        appMainMocks.useAuth.mockReturnValue({
            user: { id: 'user-1' },
            profile: null,
            loading: false,
        });
        appMainMocks.useLegalSearch.mockReturnValue({
            search: vi.fn(),
            fetchFullText: vi.fn(),
            loading: false,
            analysis: null,
            decisions: [],
            error: null,
            fullTextCache: {},
        });
        appMainMocks.streamChatResponse.mockImplementation(async function* streamResponse() {
            yield { text: 'ok' };
        });
        appMainMocks.toastSuccess.mockReset();
        appMainMocks.toastError.mockReset();
    });

    it('toggles the emsal panel open and closed in the dilekce flow', async () => {
        render(
            <MemoryRouter>
                <AppMain />
            </MemoryRouter>
        );

        expect(screen.queryByText('Emsal Panel Mock')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /emsal ara/i }));

        await waitFor(() => {
            expect(screen.getByText('Emsal Panel Mock')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /^kapat$/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^kapat$/i }));

        await waitFor(() => {
            expect(screen.queryByText('Emsal Panel Mock')).not.toBeInTheDocument();
        });
    });
});
