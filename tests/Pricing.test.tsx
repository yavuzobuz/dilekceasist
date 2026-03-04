import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pricing from '../src/pages/Pricing';

const { mockedUseAuth, mockedNavigate, mockedGetSession, mockedAssign, mockedToastError } = vi.hoisted(() => ({
    mockedUseAuth: vi.fn(),
    mockedNavigate: vi.fn(),
    mockedGetSession: vi.fn(),
    mockedAssign: vi.fn(),
    mockedToastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
    };
});

vi.mock('../src/contexts/AuthContext', () => ({
    useAuth: mockedUseAuth,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: mockedGetSession,
        },
    },
}));

vi.mock('react-hot-toast', () => ({
    toast: {
        error: mockedToastError,
    },
}));

vi.mock('../components/Header', () => ({
    Header: () => <div>Header</div>,
}));

vi.mock('../components/Footer', () => ({
    Footer: () => <div>Footer</div>,
}));

describe('Pricing page plan routing', () => {
    beforeEach(() => {
        localStorage.clear();
        mockedNavigate.mockReset();
        mockedUseAuth.mockReset();
        mockedGetSession.mockReset();
        mockedAssign.mockReset();
        mockedToastError.mockReset();

        vi.stubGlobal('fetch', vi.fn());
        Object.defineProperty(window, 'location', {
            writable: true,
            value: {
                ...window.location,
                assign: mockedAssign,
            },
        });
    });

    it('starts Stripe checkout for authenticated users on paid plan selection', async () => {
        mockedUseAuth.mockReturnValue({ user: { id: 'u1' } });
        mockedGetSession.mockResolvedValue({
            data: {
                session: { access_token: 'token-123' },
            },
        });
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ url: 'https://checkout.stripe.com/c/pay_test' }),
        } as Response);

        render(
            <MemoryRouter>
                <Pricing />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /Pro Plan Sec/i }));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/billing/create-checkout-session', expect.objectContaining({
                method: 'POST',
            }));
        });

        expect(localStorage.getItem('selected_plan')).toBe('pro');
        expect(mockedAssign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_test');
        expect(mockedNavigate).not.toHaveBeenCalled();
    });

    it('redirects unauthenticated users to login on paid plan selection', () => {
        mockedUseAuth.mockReturnValue({ user: null });

        render(
            <MemoryRouter>
                <Pricing />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /Pro Plan Sec/i }));

        expect(localStorage.getItem('selected_plan')).toBe('pro');
        expect(mockedNavigate).toHaveBeenCalledWith('/login?redirect=%2Ffiyatlandirma');
    });
});
