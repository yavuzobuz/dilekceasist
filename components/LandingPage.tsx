import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CreditCard, Download, HelpCircle } from 'lucide-react';
import { DocumentPlusIcon, KeyIcon, LinkIcon, SparklesIcon } from './Icon';
import { Footer } from './Footer';
import { Header } from './Header';

interface LandingPageProps {
  onGetStarted: () => void;
}

type FeatureItem = {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
};

const features: FeatureItem[] = [
  {
    icon: <DocumentPlusIcon className="h-8 w-8" />,
    title: 'UDF + Word + PDF Analizi',
    description: 'PDF, Word, UDF, TIFF ve görsel dosyaları tek akışta analiz edin.',
    color: 'from-red-600 to-red-500',
  },
  {
    icon: <SparklesIcon className="h-8 w-8" />,
    title: 'Seri Dilekçe Üretimi',
    description: 'Excel/CSV ile toplu dilekçe paketleri oluşturun.',
    color: 'from-gray-600 to-gray-500',
  },
  {
    icon: <LinkIcon className="h-8 w-8" />,
    title: 'Sözleşme ve İhtarname',
    description: 'Şablonlarla sözleşme ve ihtarname akışını yönetin.',
    color: 'from-red-500 to-red-400',
  },
  {
    icon: <KeyIcon className="h-8 w-8" />,
    title: 'AI Chat ile Belge Üretimi',
    description: 'Sohbetten belge oluşturun, yeniden yazın ve güçlendirin.',
    color: 'from-gray-700 to-gray-600',
  },
  {
    icon: <DocumentPlusIcon className="h-8 w-8" />,
    title: 'Emsal Karar Arama',
    description: 'Yargıtay/Danıştay kararlarını bağlama ekleyin.',
    color: 'from-red-600 to-red-500',
  },
  {
    icon: <SparklesIcon className="h-8 w-8" />,
    title: 'UDF Uyumlu Çıktı',
    description: 'Tekil akışta UDF, DOCX, PDF ve TXT çıktı alın.',
    color: 'from-gray-600 to-gray-500',
  },
];

const stats = [
  { value: '45', label: 'Maks. yükleme (15x3)' },
  { value: 'XLSX/CSV', label: 'Seri üretim' },
  { value: 'UDF', label: 'UYAP uyumlu çıktı' },
  { value: '14 Gün', label: 'Ücretsiz deneme' },
];

const faqItems = [
  {
    q: 'Ücretsiz deneme nasıl çalışır?',
    a: 'Ücretsiz deneme 14 gündür. Trial süresinde günlük belge üretim limiti uygulanır.',
  },
  {
    q: 'Seri dilekçe üretimi var mı?',
    a: 'Evet. Excel/CSV yükleyip kolon eşleştirmesiyle toplu paket oluşturabilirsiniz.',
  },
  {
    q: 'Sözleşme ve ihtarname oluşturabilir miyim?',
    a: 'Evet. Sözleşmeler ve ihtarnameler için ayrı şablon akışımız bulunur.',
  },
  {
    q: 'UDF destekliyor musunuz?',
    a: 'Evet. UDF dosyası analizini destekler ve tekil akışta UDF çıktı alabilirsiniz.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white overflow-hidden relative">
      <Header onShowLanding={() => {}} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      <div className="relative z-10">
        <section className={`container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="text-center space-y-8">
            <div className="flex justify-center">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
                <img src="/logo.png" alt="DilekAI Logo" className="relative h-24 w-24 rounded-2xl border border-red-500/40 bg-black/40 p-2" />
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="block">DilekAI</span>
              <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-red-500">
                AI Hukuk Üretim Platformu
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-400 max-w-4xl mx-auto leading-relaxed">
              Dilekçe, sözleşme ve ihtarname süreçlerini tek merkezde yönetin.
              Belge analizi, emsal arama, seri üretim ve UDF uyumlu çıktıyı bir arada kullanın.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <button
                onClick={onGetStarted}
                className="group relative px-8 py-4 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:via-red-600 hover:to-red-500 rounded-xl font-bold text-lg shadow-2xl shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
              >
                <span className="relative flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5" />
                  14 Gün Ücretsiz Dene
                </span>
              </button>
              <button
                onClick={() => navigate('/fiyatlandirma')}
                className="px-8 py-4 bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-700 hover:border-red-500 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Fiyatlandırma
              </button>
              <button
                onClick={() => navigate('/word-eklentisi')}
                className="px-8 py-4 bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-700 hover:border-red-500 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
              >
                <Download className="w-5 h-5" /> Word Eklentisi
              </button>
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-700 hover:border-red-500 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105"
              >
                Özellikleri Keşfet
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 max-w-4xl mx-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-gradient-to-br from-gray-900/80 to-black/80 p-6 rounded-2xl border border-gray-800/60">
                  <div className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400 mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">
                Üründe Neler Var
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Codebase tarafında aktif kullandığınız temel kabiliyetleri öne çıkardık.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="h-full bg-gradient-to-br from-gray-900/80 to-black/80 p-8 rounded-2xl border border-gray-800/50 hover:border-red-600/50 transition-all duration-300">
                <div className={`inline-flex p-4 rounded-xl bg-gradient-to-r ${feature.color} mb-6`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Nasıl Çalışır?</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              3 adımda belge hazırlama akışınız tamamlanır.
            </p>
          </div>
          <div className="max-w-4xl mx-auto space-y-8">
            {[
              { step: '1', title: 'Belge yükle veya şablon seç', description: 'UDF/PDF/Word dosyalarını analiz ettirin veya hazır şablonla başlayın.' },
              { step: '2', title: 'AI ile geliştir ve emsal ekle', description: 'Chat, rewrite/review ve emsal karar aramasıyla metni güçlendirin.' },
              { step: '3', title: 'Seri veya tekil çıktı alın', description: 'UDF, DOCX, PDF, TXT ya da Excel/CSV tabanlı seri paket oluşturun.' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-6">
                <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-r from-red-600 to-red-500 rounded-full flex items-center justify-center text-2xl font-bold">
                  {item.step}
                </div>
                <div className="flex-1 bg-gradient-to-br from-gray-900/60 to-black/60 p-6 rounded-xl border border-gray-800/50">
                  <h3 className="text-2xl font-bold mb-2">{item.title}</h3>
                  <p className="text-gray-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-gray-900 to-red-700 opacity-90" />
            <div className="relative px-8 py-16 text-center">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Fiyatlandırma Modeli</h2>
              <p className="text-xl text-gray-200 max-w-3xl mx-auto mb-8">
                14 günlük trial + günlük üretim limiti ile başlayın, ihtiyacınıza göre paket seçin.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate('/fiyatlandirma')}
                  className="px-8 py-4 bg-white text-red-600 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors"
                >
                  Paketleri Gör
                </button>
                <button
                  onClick={onGetStarted}
                  className="px-8 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-lg transition-colors"
                >
                  Ücretsiz Başla
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Sıkça Sorulan Sorular</h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {faqItems.map((faq) => (
              <div key={faq.q} className="bg-gradient-to-br from-gray-900/60 to-black/60 p-6 rounded-xl border border-gray-800/50">
                <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                <p className="text-gray-400">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
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
                <HelpCircle className="w-5 h-5" /> Tüm SSS
              </button>
              <button
                onClick={() => navigate('/fiyatlandirma')}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-semibold flex items-center gap-2"
              >
                <CreditCard className="w-5 h-5" /> Fiyatlandırma
              </button>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
};

