import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIJusticeLogo } from './Icon';
import { useAuth } from '../src/contexts/AuthContext';
import { AnnouncementBanner } from '../src/components/AnnouncementBanner';
import {
  User,
  LogOut,
  PenTool,
  Library,
  BookOpen,
  HelpCircle,
  Home,
  Key,
  Sparkles,
  Menu,
  X
} from 'lucide-react';

interface HeaderProps {
  onShowLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLanding }) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-sm border-b border-red-600/30 sticky top-0 z-50 shadow-lg shadow-red-900/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => handleNavigate('/')}>
                <div className="relative">
                  <div className="absolute inset-0 bg-red-600/20 blur-2xl group-hover:bg-red-500/30 transition-all duration-500"></div>
                  <AIJusticeLogo className="h-10 w-10 text-red-500 relative transform group-hover:scale-110 transition-all duration-300" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  Hukuk Asistanı <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 animate-pulse">AI</span>
                </h1>
              </div>

              {/* Navigation Links - Desktop */}
              <nav className="hidden md:flex items-center space-x-2">
                {user && (
                  <button
                    onClick={() => handleNavigate('/app')}
                    className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative flex items-center gap-2">
                      <PenTool className="w-4 h-4 text-red-500 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" />
                      <span className="group-hover:translate-x-0.5 transition-transform duration-300">Dilekçe Oluştur</span>
                    </span>
                  </button>
                )}
                <button
                  onClick={() => handleNavigate('/petition-pool')}
                  className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative flex items-center gap-2">
                    <Library className="w-4 h-4 text-red-500 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-300">Dilekçe Havuzu</span>
                  </span>
                </button>
                <button
                  onClick={() => handleNavigate('/sablonlar')}
                  className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative flex items-center gap-2">
                    <Library className="w-4 h-4 text-red-500 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-300">Şablonlar</span>
                  </span>
                </button>
                <button
                  onClick={() => handleNavigate('/about')}
                  className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-red-500 group-hover:-rotate-12 group-hover:scale-110 transition-all duration-300" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-300">Hakkında</span>
                  </span>
                </button>
                <button
                  onClick={() => handleNavigate('/faq')}
                  className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-red-500 group-hover:scale-125 group-hover:rotate-[360deg] transition-all duration-500" />
                    <span className="group-hover:translate-x-0.5 transition-transform duration-300">SSS</span>
                  </span>
                </button>
              </nav>
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              {user ? (
                <button
                  onClick={() => handleNavigate('/profile')}
                  className="group relative flex items-center space-x-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <User className="w-4 h-4 text-red-500 relative group-hover:rotate-12 transition-transform duration-300" />
                  <span className="relative">{profile?.full_name || 'Profil'}</span>
                </button>
              ) : (
                <>
                  {onShowLanding && (
                    <button
                      onClick={onShowLanding}
                      className="group relative px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                      <span className="relative flex items-center gap-2">
                        <Home className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform duration-300" />
                        Ana Sayfa
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => handleNavigate('/login')}
                    className="group relative px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative flex items-center gap-2">
                      <Key className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform duration-300" />
                      Giriş
                    </span>
                  </button>
                  <button
                    onClick={() => handleNavigate('/register')}
                    className="group relative px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-red-900/50 hover:shadow-red-800/60 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-white group-hover:rotate-[360deg] transition-transform duration-500" />
                      Kayıt Ol
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center space-x-3">
              {user && (
                <button
                  onClick={() => handleNavigate('/profile')}
                  className="p-2 bg-gray-800/50 border border-gray-600 rounded-lg text-white"
                >
                  <User className="w-5 h-5 text-red-500" />
                </button>
              )}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 bg-gray-800/50 border border-gray-600 rounded-lg text-white hover:bg-gray-700/50 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-gray-900/95 backdrop-blur-lg border-t border-gray-800">
            <nav className="container mx-auto px-4 py-4 space-y-2">
              {user && (
                <button
                  onClick={() => handleNavigate('/app')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                >
                  <PenTool className="w-5 h-5 text-red-500" />
                  Dilekçe Oluştur
                </button>
              )}
              <button
                onClick={() => handleNavigate('/petition-pool')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Library className="w-5 h-5 text-red-500" />
                Dilekçe Havuzu
              </button>
              <button
                onClick={() => handleNavigate('/sablonlar')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Library className="w-5 h-5 text-red-500" />
                Şablonlar
              </button>
              <button
                onClick={() => handleNavigate('/about')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <BookOpen className="w-5 h-5 text-red-500" />
                Hakkında
              </button>
              <button
                onClick={() => handleNavigate('/faq')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <HelpCircle className="w-5 h-5 text-red-500" />
                SSS
              </button>

              {/* Divider */}
              <div className="border-t border-gray-700 my-3"></div>

              {/* Auth Section */}
              {user ? (
                <button
                  onClick={() => handleNavigate('/profile')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-colors"
                >
                  <User className="w-5 h-5 text-red-500" />
                  {profile?.full_name || 'Profil'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleNavigate('/login')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-colors"
                  >
                    <Key className="w-5 h-5 text-red-500" />
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => handleNavigate('/register')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-medium"
                  >
                    <Sparkles className="w-5 h-5" />
                    Kayıt Ol
                  </button>
                </>
              )}
            </nav>
          </div>
        )}
      </header>
      <AnnouncementBanner />
    </>
  );
};
