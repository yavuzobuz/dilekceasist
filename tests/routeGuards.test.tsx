import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '../src/components/auth/ProtectedRoute';
import { AdminGuard } from '../src/components/admin/AdminGuard';

const { mockedUseAuth } = vi.hoisted(() => ({
    mockedUseAuth: vi.fn(),
}));

vi.mock('../src/contexts/AuthContext', () => ({
    useAuth: mockedUseAuth,
}));

describe('route guards', () => {
    beforeEach(() => {
        mockedUseAuth.mockReset();
    });

    it('ProtectedRoute should show loading state', () => {
        mockedUseAuth.mockReturnValue({ user: null, loading: true });

        render(
            <MemoryRouter initialEntries={['/private']}>
                <Routes>
                    <Route
                        path="/private"
                        element={
                            <ProtectedRoute>
                                <div>Secret Area</div>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Yükleniyor/i)).toBeInTheDocument();
    });

    it('ProtectedRoute should redirect unauthenticated users to login', () => {
        mockedUseAuth.mockReturnValue({ user: null, loading: false });

        render(
            <MemoryRouter initialEntries={['/private']}>
                <Routes>
                    <Route
                        path="/private"
                        element={
                            <ProtectedRoute>
                                <div>Secret Area</div>
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<div>Login Page</div>} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('ProtectedRoute should render children for authenticated users', () => {
        mockedUseAuth.mockReturnValue({
            user: { id: 'u1', email: 'user@example.com' },
            loading: false,
        });

        render(
            <MemoryRouter initialEntries={['/private']}>
                <Routes>
                    <Route
                        path="/private"
                        element={
                            <ProtectedRoute>
                                <div>Secret Area</div>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Secret Area')).toBeInTheDocument();
    });

    it('AdminGuard should redirect unauthenticated users to login', () => {
        mockedUseAuth.mockReturnValue({ user: null, loading: false });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminGuard>
                                <div>Admin Panel</div>
                            </AdminGuard>
                        }
                    />
                    <Route path="/login" element={<div>Login Page</div>} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('AdminGuard should block authenticated non-admin users', () => {
        mockedUseAuth.mockReturnValue({
            user: { id: 'u2', email: 'normal@example.com' },
            loading: false,
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminGuard>
                                <div>Admin Panel</div>
                            </AdminGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Erişim Reddedildi/i)).toBeInTheDocument();
        expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    });

    it('AdminGuard should allow configured admin email', () => {
        mockedUseAuth.mockReturnValue({
            user: { id: 'u3', email: 'kibrit74@gmail.com' },
            loading: false,
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminGuard>
                                <div>Admin Panel</div>
                            </AdminGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });
});

