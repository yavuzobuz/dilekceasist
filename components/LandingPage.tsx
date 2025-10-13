import React, { useState, useEffect } from 'react';
import { SparklesIcon, ScaleIcon, DocumentPlusIcon, KeyIcon, LinkIcon } from './Icon';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const features = [
    {
      icon: <DocumentPlusIcon className="h-8 w-8" />,
      title: "Akıllı Belge Analizi",
      description: "PDF, Word, UDF ve görsel dosyalarınızı AI ile otomatik analiz edin",
      color: "from-red-600 to-red-500"
    },
    {
      icon: <KeyIcon className="h-8 w-8" />,
      title: "Otomatik Anahtar Kelime",
      description: "Davanız için en uygun hukuki anahtar kelimeleri yapay zeka ile oluşturun",
      color: "from-gray-600 to-gray-500"
    },
    {
      icon: <LinkIcon className="h-8 w-8" />,
      title: "Web Araştırması",
      description: "İlgili içtihatlar ve hukuki kaynakları otomatik olarak bulun",
      color: "from-red-500 to-red-400"
    },
    {
      icon: <SparklesIcon className="h-8 w-8" />,
      title: "Profesyonel Dilekçe",
      description: "Hukuki gerekliliklere uygun, profesyonel dilekçeler oluşturun",
      color: "from-gray-700 to-gray-600"
    }
  ];

  const stats = [
    { value: "AI", label: "Güçlü Yapay Zeka" },
    { value: "10+", label: "Dilekçe Türü" },
    { value: "7/24", label: "Erişilebilir" },
    { value: "∞", label: "Sınırsız Kullanım" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-gray-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '2s' }}></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <div className={`container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="text-center space-y-8">
            {/* Logo/Icon */}
            <div className="flex justify-center mb-8">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 rounded-full blur-2xl opacity-50 group-hover:opacity-75 transition-opacity duration-500"></div>
                <div className="relative bg-gradient-to-br from-black to-gray-900 p-6 rounded-full border-2 border-red-600/50 shadow-2xl transform group-hover:scale-110 transition-all duration-500">
                  <ScaleIcon className="h-16 w-16 text-red-500" />
                </div>
              </div>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="block text-white">
                Hukuk Asistanı
              </span>
              <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-red-500 animate-gradient-x">
                AI Dilekçe Oluşturucu
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Yapay zeka destekli hukuki asistanınız. Dilekçelerinizi dakikalar içinde oluşturun, 
              belgelerinizi analiz edin ve hukuki araştırmanızı otomatikleştirin.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <button
                onClick={onGetStarted}
                className="group relative px-8 py-4 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:via-red-600 hover:to-red-500 rounded-xl font-bold text-lg shadow-2xl shadow-red-500/50 hover:shadow-red-400/70 transition-all duration-500 transform hover:scale-105 active:scale-95 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                <span className="relative flex items-center gap-2">
                  <SparklesIcon className="h-6 w-6 animate-spin" style={{ animationDuration: '3s' }} />
                  Hemen Başla
                  <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
              
              <button
                onClick={() => {
                  const featuresSection = document.getElementById('features');
                  featuresSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm border-2 border-gray-700 hover:border-red-500 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95"
              >
                Özellikleri Keşfet
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-16 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className="transform transition-all duration-500 hover:scale-110"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="bg-gradient-to-br from-gray-900/80 to-black/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300 shadow-xl hover:shadow-red-900/30">
                    <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 mb-2">
                      {stat.value}
                    </div>
                    <div className="text-sm text-gray-400">
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">
                Güçlü Özellikler
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Hukuki süreçlerinizi hızlandıran yapay zeka destekli araçlar
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group transform transition-all duration-500 hover:scale-105 animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="h-full bg-gradient-to-br from-gray-900/80 to-black/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-red-900/30">
                  <div className={`inline-flex p-4 rounded-xl bg-gradient-to-r ${feature.color} mb-6 transform group-hover:rotate-6 transition-transform duration-300`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white">
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-white">
                Nasıl Çalışır?
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              3 basit adımda profesyonel dilekçeniz hazır
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-12">
            {[
              { step: "1", title: "Belgelerinizi Yükleyin", description: "PDF, Word veya görsel belgelerinizi sisteme yükleyin" },
              { step: "2", title: "AI Analizi", description: "Yapay zeka belgelerinizi analiz eder ve önerilerde bulunur" },
              { step: "3", title: "Dilekçeyi Alın", description: "Profesyonel, hukuki gerekliliklere uygun dilekçeniz hazır" }
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-6 group animate-fade-in-up"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-r from-red-600 to-red-500 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg group-hover:shadow-red-500/50 transition-all duration-300 transform group-hover:scale-110">
                  {item.step}
                </div>
                <div className="flex-1 bg-gradient-to-br from-gray-900/50 to-black/50 backdrop-blur-sm p-6 rounded-xl border border-gray-800/50 group-hover:border-red-600/50 transition-all duration-300">
                  <h3 className="text-2xl font-bold mb-2 text-white">{item.title}</h3>
                  <p className="text-gray-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-gray-900 to-red-600 opacity-90"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/50 via-gray-800/50 to-red-600/50 animate-pulse"></div>
            <div className="relative px-8 py-20 text-center">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Hemen Başlamaya Hazır mısınız?
              </h2>
              <p className="text-xl mb-8 text-gray-200 max-w-2xl mx-auto">
                Yapay zeka destekli hukuk asistanınızla tanışın ve dilekçelerinizi dakikalar içinde oluşturun
              </p>
              <button
                onClick={onGetStarted}
                className="group relative px-10 py-5 bg-white text-red-600 hover:bg-gray-100 rounded-xl font-bold text-xl shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/0 via-red-600/10 to-red-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                <span className="relative flex items-center gap-3">
                  <SparklesIcon className="h-6 w-6" />
                  Ücretsiz Başla
                  <svg className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-gray-800">
          <div className="text-center text-gray-500">
            <p>© 2025 Hukuk Asistanı AI. Tüm hakları saklıdır.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
