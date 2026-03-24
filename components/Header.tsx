import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { AnnouncementBanner } from '../src/components/AnnouncementBanner';
import {
  User,
  PenTool,
  Library,
  BookOpen,
  HelpCircle,
  CreditCard,
  Home,
  Key,
  Sparkles,
  Scroll,
  Scale,
  Menu,
  X
} from 'lucide-react';

interface HeaderProps {
  onShowLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLanding }) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-sm border-b border-red-600/30 sticky top-0 z-50 shadow-lg shadow-red-900/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 min-w-0">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => handleNavigate('/')}>
                <img src="/logo.png" alt="DilekAI Logo" className="h-12 w-12 transform group-hover:scale-110 transition-all duration-300" />
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  Dilek<span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 animate-pulse">AI</span>
                </h1>
              </div>

              {/* Navigation Links - Desktop */}
              <nav className="hidden xl:flex items-center gap-2 min-w-0">
                {/* 1. Araçlarımız */}
                <div className="group relative shrink-0">
                  <button
                    className="relative flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm 2xl:text-base font-semibold rounded-lg"
                  >
                    <span className="relative flex items-center gap-2">
                      <PenTool className="w-4 h-4 text-red-500" />
                      <span>Araçlarımız</span>
                    </span>
                  </button>

                  <div className="invisible bg-gray-900/95 absolute left-0 top-full z-30 mt-1 w-max min-w-[220px] rounded-lg border border-gray-700/70 p-1 opacity-0 translate-y-1 shadow-lg backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    <button onClick={() => handleNavigate('/chat')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <Sparkles className="w-4 h-4 text-red-500" />
                      <span>Yapay Zeka Asistanı</span>
                    </button>
                    {user && (
                      <>
                        <button onClick={() => handleNavigate('/alt-app')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                          <PenTool className="w-4 h-4 text-red-500" />
                          <span>Dilekçe Oluştur</span>
                        </button>
                        <button onClick={() => handleNavigate('/sozlesmeler-ihtarnameler')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                          <Scroll className="w-4 h-4 text-red-500" />
                          <span>Sözleşmeler & İhtarnameler</span>
                        </button>
                      </>
                    )}
                    <button onClick={() => handleNavigate('/sablonlar?category=templates')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <Library className="w-4 h-4 text-red-500" />
                      <span>Şablonlar</span>
                    </button>
                  </div>
                </div>

                {/* 2. Araştırma */}
                <div className="group relative shrink-0">
                  <button
                    className="relative flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm 2xl:text-base font-semibold rounded-lg"
                  >
                    <span className="relative flex items-center gap-2">
                      <Scale className="w-4 h-4 text-red-500" />
                      <span>Araştırma</span>
                    </span>
                  </button>

                  <div className="invisible bg-gray-900/95 absolute left-0 top-full z-30 mt-1 w-max min-w-[220px] rounded-lg border border-gray-700/70 p-1 opacity-0 translate-y-1 shadow-lg backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    <button onClick={() => handleNavigate('/emsal-karar-arama')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <Scale className="w-4 h-4 text-red-500" />
                      <span>Emsal Karar Arama</span>
                    </button>
                    <button onClick={() => handleNavigate('/petition-pool')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <Library className="w-4 h-4 text-red-500" />
                      <span>Dilekçe Havuzu</span>
                    </button>
                  </div>
                </div>

                {/* 3. Kurumsal */}
                <div className="group relative shrink-0">
                  <button
                    className="relative flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm 2xl:text-base font-semibold rounded-lg"
                  >
                    <span className="relative flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-red-500" />
                      <span>Kurumsal</span>
                    </span>
                  </button>

                  <div className="invisible bg-gray-900/95 absolute left-0 top-full z-30 mt-1 w-max min-w-[220px] rounded-lg border border-gray-700/70 p-1 opacity-0 translate-y-1 shadow-lg backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    <button onClick={() => handleNavigate('/about')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <BookOpen className="w-4 h-4 text-red-500" />
                      <span>Hakkında</span>
                    </button>
                    <button onClick={() => handleNavigate('/fiyatlandirma')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <CreditCard className="w-4 h-4 text-red-500" />
                      <span>Fiyatlandırma</span>
                    </button>
                    <button onClick={() => handleNavigate('/faq')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800/95 rounded-md transition-colors">
                      <HelpCircle className="w-4 h-4 text-red-500" />
                      <span>SSS</span>
                    </button>
                  </div>
                </div>
              </nav>
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden xl:flex items-center space-x-3 shrink-0">
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
            <div className="flex xl:hidden items-center space-x-3">
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
          <div className="xl:hidden bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <nav className="container mx-auto px-4 py-4 space-y-2">
              {/* Araçlarımız */}
              <div className="pt-2 pb-1">
                <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Araçlarımız</p>
              </div>
              <button
                onClick={() => handleNavigate('/chat')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Sparkles className="w-5 h-5 text-red-500" />
                Yapay Zeka Asistanı
              </button>
              {user && (
                <>
                  <button
                    onClick={() => handleNavigate('/alt-app')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                  >
                    <PenTool className="w-5 h-5 text-red-500" />
                    Dilekçe Oluştur
                  </button>
                  <button
                    onClick={() => handleNavigate('/sozlesmeler-ihtarnameler')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                  >
                    <Scroll className="w-5 h-5 text-red-500" />
                    Sözleşmeler & İhtarnameler
                  </button>
                </>
              )}
              <button
                onClick={() => handleNavigate('/sablonlar?category=templates')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Library className="w-5 h-5 text-red-500" />
                Şablonlar
              </button>

              {/* Araştırma */}
              <div className="pt-4 pb-1">
                <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Araştırma</p>
              </div>
              <button
                onClick={() => handleNavigate('/emsal-karar-arama')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Scale className="w-5 h-5 text-red-500" />
                Emsal Karar Arama
              </button>
              <button
                onClick={() => handleNavigate('/petition-pool')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Library className="w-5 h-5 text-red-500" />
                Dilekçe Havuzu
              </button>

              {/* Kurumsal */}
              <div className="pt-4 pb-1">
                <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kurumsal</p>
              </div>
              <button
                onClick={() => handleNavigate('/about')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <BookOpen className="w-5 h-5 text-red-500" />
                Hakkında
              </button>
              <button
                onClick={() => handleNavigate('/fiyatlandirma')}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <CreditCard className="w-5 h-5 text-red-500" />
                Fiyatlandırma
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
