import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AIJusticeLogo } from './Icon';
import { useAuth } from '../src/contexts/AuthContext';
import { 
  User, 
  LogOut, 
  PenTool, 
  Library, 
  BookOpen, 
  HelpCircle, 
  Home,
  Key,
  Sparkles
} from 'lucide-react';

interface HeaderProps {
  onShowLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLanding }) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  return (
    <header className="bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-sm border-b border-red-600/30 sticky top-0 z-10 shadow-lg shadow-red-900/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => navigate('/')}>
              <div className="relative">
                <div className="absolute inset-0 bg-red-600/20 blur-2xl group-hover:bg-red-500/30 transition-all duration-500"></div>
                <AIJusticeLogo className="h-10 w-10 text-red-500 relative transform group-hover:scale-110 transition-all duration-300" />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Hukuk Asistanı <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 animate-pulse">AI</span>
              </h1>
            </div>
            
            {/* Navigation Links */}
            <nav className="hidden md:flex items-center space-x-2">
              {user && (
                <button
                  onClick={() => navigate('/app')}
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
                onClick={() => navigate('/petition-pool')}
                className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                <span className="relative flex items-center gap-2">
                  <Library className="w-4 h-4 text-red-500 group-hover:rotate-12 group-hover:scale-110 transition-all duration-300" />
                  <span className="group-hover:translate-x-0.5 transition-transform duration-300">Dilekçe Havuzu</span>
                </span>
              </button>
              <button
                onClick={() => navigate('/about')}
                className="group relative px-4 py-2 text-gray-300 hover:text-white transition-all duration-300 text-sm font-medium rounded-lg overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                <span className="relative flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-red-500 group-hover:-rotate-12 group-hover:scale-110 transition-all duration-300" />
                  <span className="group-hover:translate-x-0.5 transition-transform duration-300">Hakkında</span>
                </span>
              </button>
              <button
                onClick={() => navigate('/faq')}
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
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <button
                  onClick={() => navigate('/profile')}
                  className="group relative flex items-center space-x-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <User className="w-4 h-4 text-red-500 relative group-hover:rotate-12 transition-transform duration-300" />
                  <span className="hidden md:inline relative">{profile?.full_name || 'Profil'}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="group relative flex items-center space-x-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/20 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <LogOut className="w-4 h-4 text-red-500 relative group-hover:translate-x-1 transition-transform duration-300" />
                  <span className="hidden md:inline relative">Çıkış</span>
                </button>
              </>
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
                  onClick={() => navigate('/login')}
                  className="group relative px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative flex items-center gap-2">
                    <Key className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform duration-300" />
                    Giriş
                  </span>
                </button>
                <button
                  onClick={() => navigate('/register')}
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
        </div>
      </div>
    </header>
  );
};
