import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { AppMain } from './src/components/AppMain';
import AlternativeApp from './src/pages/AlternativeApp';
import Login from './src/pages/Login';
import Register from './src/pages/Register';
import Profile from './src/pages/Profile';
import PetitionPool from './src/pages/PetitionPool';
import About from './src/pages/About';
import FAQ from './src/pages/FAQ';
import Privacy from './src/pages/Privacy';
import Terms from './src/pages/Terms';
import Cookies from './src/pages/Cookies';
import { TemplatesPage } from './src/pages/TemplatesPage';
import ProtectedRoute from './src/components/auth/ProtectedRoute';

// Admin imports
import { AdminLayout } from './src/components/admin/AdminLayout';
import { AdminGuard } from './src/components/admin/AdminGuard';
import {
  AdminDashboard,
  UserManagement,
  TemplateManagement,
  TariffManagement,
  Analytics,
  LegalSources,
  SystemSettings,
  Announcements,
  EmailTemplates,
  SystemLogs
} from './src/pages/admin';

export default function App() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    localStorage.setItem('hasVisited', 'true');
    navigate('/app');
  };

  const handleUseTemplate = (content: string) => {
    // Store template content and navigate to app
    localStorage.setItem('templateContent', content);
    navigate('/app');
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage onGetStarted={handleGetStarted} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <AppMain />
        }
      />
      <Route
        path="/alt-app"
        element={<AlternativeApp />}
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/petition-pool" element={<PetitionPool />} />
      <Route path="/pool" element={<PetitionPool />} /> {/* Legacy route */}
      <Route path="/about" element={<About />} />
      <Route path="/faq" element={<FAQ />} />
      <Route
        path="/sablonlar"
        element={
          <TemplatesPage
            onBack={() => navigate('/')}
            onUseTemplate={handleUseTemplate}
          />
        }
      />

      {/* Legal Pages */}
      <Route path="/gizlilik" element={<Privacy />} />
      <Route path="/kullanim-kosullari" element={<Terms />} />
      <Route path="/cerez-politikasi" element={<Cookies />} />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="templates" element={<TemplateManagement />} />
        <Route path="tariffs" element={<TariffManagement />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="sources" element={<LegalSources />} />
        <Route path="settings" element={<SystemSettings />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="email-templates" element={<EmailTemplates />} />
        <Route path="logs" element={<SystemLogs />} />
      </Route>
    </Routes>
  );
}
