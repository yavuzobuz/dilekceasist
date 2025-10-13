
import React from 'react';
import { ScaleIcon } from './Icon';

interface HeaderProps {
  onShowLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLanding }) => {
  return (
    <header className="bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-sm border-b border-red-600/30 sticky top-0 z-10 shadow-lg shadow-red-900/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-red-600/20 blur-xl rounded-full group-hover:bg-red-500/30 transition-all duration-500"></div>
              <ScaleIcon className="h-8 w-8 text-red-500 relative transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Hukuk Asistanı <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 animate-pulse">AI</span>
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {onShowLanding && (
              <button
                onClick={onShowLanding}
                className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 hover:border-red-500 rounded-lg text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 active:scale-95"
              >
                Ana Sayfa
              </button>
            )}
            <div className="hidden md:flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                <div className="h-2 w-2 bg-red-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                <div className="h-2 w-2 bg-red-300 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              </div>
              <span className="text-xs text-gray-300 ml-2">Yapay Zeka Aktif</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
};
