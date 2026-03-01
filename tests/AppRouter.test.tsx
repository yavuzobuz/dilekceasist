import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../AppRouter';

vi.mock('../components/LandingPage', () => ({
    LandingPage: ({ onGetStarted }: { onGetStarted: () => void }) => (
        <button onClick={onGetStarted}>Start Flow</button>
    ),
}));

vi.mock('../src/components/AppMain', () => ({
    AppMain: () => <div>App Main</div>,
}));

vi.mock('../src/pages/AlternativeApp', () => ({
    default: () => <div>Alternative App</div>,
}));

vi.mock('../src/pages/Login', () => ({ default: () => <div>Login Page</div> }));
vi.mock('../src/pages/Register', () => ({ default: () => <div>Register Page</div> }));
vi.mock('../src/pages/Profile', () => ({ default: () => <div>Profile Page</div> }));
vi.mock('../src/pages/PetitionPool', () => ({ default: () => <div>Pool Page</div> }));
vi.mock('../src/pages/About', () => ({ default: () => <div>About Page</div> }));
vi.mock('../src/pages/FAQ', () => ({ default: () => <div>FAQ Page</div> }));
vi.mock('../src/pages/Privacy', () => ({ default: () => <div>Privacy Page</div> }));
vi.mock('../src/pages/Terms', () => ({ default: () => <div>Terms Page</div> }));
vi.mock('../src/pages/Cookies', () => ({ default: () => <div>Cookies Page</div> }));

vi.mock('../src/pages/TemplatesPage', () => ({
    TemplatesPage: ({ onUseTemplate }: { onUseTemplate: (content: string) => void }) => (
        <button onClick={() => onUseTemplate('mock-template-content')}>Use Mock Template</button>
    ),
}));

vi.mock('../src/components/auth/ProtectedRoute', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../src/components/admin/AdminLayout', () => ({
    AdminLayout: () => <div>Admin Layout</div>,
}));

vi.mock('../src/components/admin/AdminGuard', () => ({
    AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../src/pages/admin', () => ({
    AdminDashboard: () => <div>Admin Dashboard</div>,
    UserManagement: () => <div>User Management</div>,
    TemplateManagement: () => <div>Template Management</div>,
    TariffManagement: () => <div>Tariff Management</div>,
    Analytics: () => <div>Analytics</div>,
    LegalSources: () => <div>Legal Sources</div>,
    SystemSettings: () => <div>System Settings</div>,
    Announcements: () => <div>Announcements</div>,
    EmailTemplates: () => <div>Email Templates</div>,
    SystemLogs: () => <div>System Logs</div>,
}));

describe('AppRouter', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should navigate from landing page to alt-app and set hasVisited', () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText('Start Flow'));

        expect(screen.getByText('Alternative App')).toBeInTheDocument();
        expect(localStorage.getItem('hasVisited')).toBe('true');
    });

    it('should save template content and navigate to alt-app from /sablonlar', () => {
        render(
            <MemoryRouter initialEntries={['/sablonlar']}>
                <App />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText('Use Mock Template'));

        expect(screen.getByText('Alternative App')).toBeInTheDocument();
        expect(localStorage.getItem('templateContent')).toBe('mock-template-content');
    });
});

