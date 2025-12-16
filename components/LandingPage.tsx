import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SparklesIcon, AIJusticeLogo, DocumentPlusIcon, KeyIcon, LinkIcon } from './Icon';
import { Header } from './Header';
import { Footer } from './Footer';
import { BookOpen, HelpCircle } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();

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
      <Header onShowLanding={() => { }} />

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
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 animate-pulse" style={{ animationDuration: '3s' }}></div>
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
                  <span className="text-red-500">S:</span>
                  {faq.q}
                </h3>
                <p className="text-gray-400 pl-6">
                  <span className="text-red-500 font-bold">C:</span> {faq.a}
                </p>
              </div>
            ))}
          </div>

          {/* CTA to About and FAQ */}
          <div className="text-center mt-12">
            <p className="text-gray-400 mb-6">Daha fazla soru mu var?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/about')}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-semibold flex items-center gap-2"
              >
                <BookOpen className="w-5 h-5" /> Hakkında
              </button>
              <button
                onClick={() => navigate('/faq')}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold flex items-center gap-2"
              >
                <HelpCircle className="w-5 h-5" /> Tüm SSS'leri Gör
              </button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
