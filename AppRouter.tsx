import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { AppMain } from './src/components/AppMain';
import AlternativeApp from './src/pages/AlternativeApp';
import Login from './src/pages/Login';
import Register from './src/pages/Register';
import ForgotPassword from './src/pages/ForgotPassword';
import ResetPassword from './src/pages/ResetPassword';
import Profile from './src/pages/Profile';
import PetitionPool from './src/pages/PetitionPool';
import About from './src/pages/About';
import FAQ from './src/pages/FAQ';
import WordAddin from './src/pages/WordAddin';
import Pricing from './src/pages/Pricing';
import Privacy from './src/pages/Privacy';
import Terms from './src/pages/Terms';
import Cookies from './src/pages/Cookies';
import { TemplatesPage, type TemplateTransferContext } from './src/pages/TemplatesPage';
import PrecedentSearch from './src/pages/PrecedentSearch';
import LegalSearchLiveTest from './src/pages/LegalSearchLiveTest';
import EmsalAraPage from './src/pages/EmsalAraPage';
import KarakaziPage from './src/pages/KarakaziPage';
import ProtectedRoute from './src/components/auth/ProtectedRoute';
import { PageEntrance } from './src/components/PageEntrance';
import ChatPage from './src/pages/ChatPage';

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
    navigate('/alt-app');
  };

  const handleUseTemplate = (content: string, context?: TemplateTransferContext) => {
    // Store template content and navigate to app
    sessionStorage.setItem('templateContent', content);
    if (context) {
      sessionStorage.setItem('templateContext', JSON.stringify(context));
    } else {
      sessionStorage.removeItem('templateContext');
    }
    navigate('/alt-app');
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage onGetStarted={handleGetStarted} />} />
      <Route path="/login" element={<PageEntrance><Login /></PageEntrance>} />
      <Route path="/register" element={<PageEntrance><Register /></PageEntrance>} />
      <Route path="/sifremi-unuttum" element={<PageEntrance><ForgotPassword /></PageEntrance>} />
      <Route path="/forgot-password" element={<PageEntrance><ForgotPassword /></PageEntrance>} />
      <Route path="/sifre-sifirla" element={<PageEntrance><ResetPassword /></PageEntrance>} />
      <Route path="/reset-password" element={<PageEntrance><ResetPassword /></PageEntrance>} />
      <Route
        path="/app"
        element={
          <PageEntrance>
            <AppMain />
          </PageEntrance>
        }
      />
      <Route
        path="/alt-app"
        element={
          <PageEntrance>
            <AlternativeApp />
          </PageEntrance>
        }
      />
      <Route
        path="/profile"
        element={
          <PageEntrance>
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          </PageEntrance>
        }
      />
      <Route path="/petition-pool" element={<PageEntrance><PetitionPool /></PageEntrance>} />
      <Route path="/pool" element={<PageEntrance><PetitionPool /></PageEntrance>} /> {/* Legacy route */}
      <Route path="/about" element={<PageEntrance><About /></PageEntrance>} />
      <Route path="/faq" element={<PageEntrance><FAQ /></PageEntrance>} />
      <Route path="/word-eklentisi" element={<PageEntrance><WordAddin /></PageEntrance>} />
      <Route path="/word-addin" element={<PageEntrance><WordAddin /></PageEntrance>} />
      <Route path="/fiyatlandirma" element={<PageEntrance><Pricing /></PageEntrance>} />
      <Route path="/pricing" element={<PageEntrance><Pricing /></PageEntrance>} />
      <Route path="/emsal-ara" element={<PageEntrance><EmsalAraPage /></PageEntrance>} />
      <Route path="/emsal-karar-arama" element={<PageEntrance><PrecedentSearch /></PageEntrance>} />
      <Route path="/karakazi" element={<PageEntrance><KarakaziPage /></PageEntrance>} />
      <Route
        path="/emsal-karar-test"
        element={
          <PageEntrance>
            <LegalSearchLiveTest />
          </PageEntrance>
        }
      />
      <Route path="/chat" element={<PageEntrance><ChatPage /></PageEntrance>} />
      <Route
        path="/sablonlar"
        element={
          <PageEntrance>
            <TemplatesPage
              onBack={() => navigate('/')}
              onUseTemplate={handleUseTemplate}
            />
          </PageEntrance>
        }
      />
      <Route
        path="/sozlesmeler-ihtarnameler"
        element={
          <PageEntrance>
            <TemplatesPage
              onBack={() => navigate('/')}
              onUseTemplate={handleUseTemplate}
            />
          </PageEntrance>
        }
      />

      {/* Legal Pages */}
      <Route path="/gizlilik" element={<PageEntrance><Privacy /></PageEntrance>} />
      <Route path="/kullanim-kosullari" element={<PageEntrance><Terms /></PageEntrance>} />
      <Route path="/cerez-politikasi" element={<PageEntrance><Cookies /></PageEntrance>} />

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
