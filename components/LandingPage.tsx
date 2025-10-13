import React, { useState, useEffect } from 'react';
import { SparklesIcon, AIJusticeLogo, DocumentPlusIcon, KeyIcon, LinkIcon } from './Icon';

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
      description: "PDF, Word, UDF, TIFF, PNG, JPG ve diğer görsel dosyalarınızı AI ile otomatik analiz edin",
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

  const benefits = [
    {
      title: "Zaman Tasarrufu",
      description: "Saatlerce süren dilekçe hazırlama işlemini dakikalara indirin",
      icon: "⏱️"
    },
    {
      title: "Profesyonel Kalite",
      description: "Hukuki gerekliliklere %100 uygun, profesyonel dilekçeler",
      icon: "⚖️"
    },
    {
      title: "Kolay Kullanım",
      description: "KarŞık teknik bilgiye gerek yok, sade ve anlaşılır arayüz",
      icon: "🚀"
    },
    {
      title: "Güvenli Veri",
      description: "Verileriniz güvenli, gizlilik politikalarımıza uygun şekilde işlenir",
      icon: "🔒"
    }
  ];

  const testimonials = [
    {
      name: "Av. Mehmet Y.",
      role: "Avukat",
      comment: "İş yükümü %40 oranında azalttı. Dilekçe hazırlama sürecim inanılmaz hızlandı.",
      rating: 5
    },
    {
      name: "Ayşe K.",
      role: "Hukuk Bürosu Sahibi",
      comment: "Müşterilerime daha hızlı hizmet verebiliyorum. Kalite de oldukça yüksek.",
      rating: 5
    },
    {
      name: "Ahmet D.",
      role: "Stajyer Avukat",
      comment: "Oğrenme sürecimde bana çok yardımcı oldu. Dilekçe formatını daha iyi anlıyorum.",
      rating: 5
    }
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
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 animate-pulse" style={{animationDuration: '3s'}}></div>
                <div className="relative bg-gradient-to-br from-black via-gray-900 to-black p-8 rounded-2xl border-2 border-red-600/30 shadow-2xl transform group-hover:scale-105 transition-all duration-500">
                  <AIJusticeLogo className="h-24 w-24 text-red-500" />
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

        {/* Benefits Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-white">Neden Bizi Seçmelisiniz?</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Hukuki süreçlerinizde size zaman ve kalite kazanç sağlarız
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="group bg-gradient-to-br from-gray-900/80 to-black/80 backdrop-blur-sm p-6 rounded-xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-red-900/30 transform hover:scale-105 animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="text-4xl mb-4">{benefit.icon}</div>
                <h3 className="text-xl font-bold mb-3 text-white">
                  {benefit.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 bg-gradient-to-br from-gray-900/50 to-black/50">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">
                Kullanıcılarımız Ne Diyor?
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Binlerce hukuk profesyonelinin tercihi
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-900/80 to-black/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300 shadow-xl animate-fade-in-up"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="flex mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.comment}"</p>
                <div className="border-t border-gray-800 pt-4">
                  <p className="font-bold text-white">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-white">Sıkça Sorulan Sorular</span>
            </h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                q: "Hukuk Asistanı AI nasıl çalışır?",
                a: "Belgelerinizi yükleyin, yapay zeka analiz eder ve size profesyonel bir dilekçe tasarı hazırlar. Süreç tamamen otomatiktir."
              },
              {
                q: "Verilerim güvende mi?",
                a: "Evet, tüm verileriniz şifrelenir ve gizlilik politikalarımıza uygun şekilde işlenir. Verileriniz üçüncü şahıslarla paylaşılmaz."
              },
              {
                q: "Hangi dilekçe türlerini destekliyorsunuz?",
                a: "Dava, cevap, istinaf, temyiz, şikayet, itiraz ve daha fazlası. 10'dan fazla dilekçe türünü destekliyoruz."
              },
              {
                q: "Yapay zeka avukatın yerini alır mı?",
                a: "Hayır, AI bir yardımcı araçtır. Nihai kontrol ve onay her zaman hukuk profesyoneline aittir."
              }
            ].map((faq, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-900/50 to-black/50 backdrop-blur-sm p-6 rounded-xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-red-500">Q:</span>
                  {faq.q}
                </h3>
                <p className="text-gray-400 pl-6">
                  <span className="text-red-500 font-bold">A:</span> {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-black border-t border-gray-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              {/* Logo ve Açıklama */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <AIJusticeLogo className="h-12 w-12 text-red-500" />
                  <h3 className="text-xl font-bold text-white">Hukuk Asistanı AI</h3>
                </div>
                <p className="text-gray-400 mb-4 max-w-md">
                  Yapay zeka destekli hukuki asistanınız. Dilekçelerinizi hızlı, kolay ve profesyonel bir şekilde hazırlayın.
                </p>
                <div className="flex gap-4">
                  <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                  <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                    </svg>
                  </a>
                </div>
              </div>

              {/* Hızlı Bağlantılar */}
              <div>
                <h4 className="text-white font-bold mb-4">Hızlı Bağlantılar</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Hakkımızda</a></li>
                  <li><a href="#features" className="text-gray-400 hover:text-red-500 transition-colors">Özellikler</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Fiyatlandırma</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Blog</a></li>
                </ul>
              </div>

              {/* Destek */}
              <div>
                <h4 className="text-white font-bold mb-4">Destek</h4>
                <ul className="space-y-2">
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Yardım Merkezi</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">İletişim</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Gizlilik Politikası</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-red-500 transition-colors">Kullanım Koşulları</a></li>
                </ul>
              </div>
            </div>

            {/* Copyright */}
            <div className="border-t border-gray-800 pt-8 text-center">
              <p className="text-gray-500">
                © 2025 Hukuk Asistanı AI. Tüm hakları saklıdır. Yapay zeka destekli hukuki yardımcınız.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
