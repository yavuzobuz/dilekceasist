
import React from 'react';
import { ScaleIcon } from './Icon';

export const Header: React.FC = () => {
  return (
    <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 backdrop-blur-sm border-b border-blue-500/20 sticky top-0 z-10 shadow-lg shadow-blue-500/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full group-hover:bg-blue-400/30 transition-all duration-500"></div>
              <ScaleIcon className="h-8 w-8 text-blue-400 relative transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100 tracking-tight">
              Hukuk Asistanı <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 animate-pulse">AI</span>
            </h1>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <div className="flex space-x-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="h-2 w-2 bg-purple-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
            <span className="text-xs text-gray-400 ml-2">Yapay Zeka Aktif</span>
          </div>
        </div>
      </div>
    </header>
  );
};
