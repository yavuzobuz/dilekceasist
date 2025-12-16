import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { AIJusticeLogo } from '../../components/Icon';
import {
  Scale,
  Sparkles,
  FileText,
  Search,
  Upload,
  Download,
  CheckCircle,
  Clock,
  Shield,
  Users,
  ArrowRight,
  ClipboardList,
  Edit3,
  MessageSquare,
  HelpCircle,
  Lightbulb,
  FileCheck
} from 'lucide-react';

export default function About() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: 'Yapay Zeka Desteği',
      description: 'GPT-4 tabanlı AI ile profesyonel dilekçeler oluşturun. Yapay zeka, hukuki terminolojiyi ve formatları bilir.'
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: 'Çoklu Dilekçe Türü',
      description: 'Dava dilekçesi, cevap dilekçesi, itiraz, şikayet ve daha fazlası. 20+ dilekçe türü destekliyoruz.'
    },
    {
      icon: <Search className="w-8 h-8" />,
      title: 'İçtihat Araması',
      description: 'Dilekçenize güç katmak için ilgili içtihatları otomatik olarak bulun ve ekleyin.'
    },
    {
      icon: <Upload className="w-8 h-8" />,
      title: 'Belge Analizi',
      description: 'PDF, Word belgelerinizi yükleyin. AI otomatik olarak analiz edip önemli bilgileri çıkarır.'
    },
    {
      icon: <Download className="w-8 h-8" />,
      title: 'Anında İndirme',
      description: 'Dilekçelerinizi Word veya PDF formatında anında indirin. Yazdırıp kullanmaya hazır.'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Dilekçe Havuzu',
      description: 'Topluluk tarafından paylaşılan binlerce dilekçeyi inceleyin ve kendi işinize uyarlayın.'
    }
  ];

  const howItWorks = [
    {
      step: '1',
      title: 'Dilekçe Türünü Seçin',
      description: 'İhtiyacınız olan dilekçe türünü seçin. Dava, cevap, itiraz, şikayet vb.'
    },
    {
      step: '2',
      title: 'Bilgileri Girin',
      description: 'Taraflar, dava künyesi ve olay özetini girin. Belge yükleyebilir veya metin girebilirsiniz.'
    },
    {
      step: '3',
      title: 'AI Oluştursun',
      description: 'Yapay zeka, girdiğiniz bilgilere göre profesyonel bir dilekçe hazırlar.'
    },
    {
      step: '4',
      title: 'İnceleyin ve Düzenleyin',
      description: 'Oluşturulan dilekçeyi inceleyin, gerekirse düzenlemeler yapın.'
    },
    {
      step: '5',
      title: 'İndirin ve Kullanın',
      description: 'Dilekçenizi Word veya PDF formatında indirin. Artık kullanıma hazır!'
    }
  ];

  const benefits = [
    { icon: <Clock className="w-6 h-6" />, text: 'Saatlerce süren iş dakikalara iniyor' },
    { icon: <CheckCircle className="w-6 h-6" />, text: 'Hukuki format ve terminoloji garantisi' },
    { icon: <Shield className="w-6 h-6" />, text: 'Verileriniz güvende, şifreli saklama' },
    { icon: <Scale className="w-6 h-6" />, text: 'Avukat kontrolünde hazırlanmış şablonlar' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl shadow-red-900/50">
              <AIJusticeLogo className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">
              Hukuk Asistanı Hakkında
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Yapay zeka destekli dilekçe oluşturma platformumuz, hukuki süreçlerinizi kolaylaştırmak ve
              zamandan tasarruf etmenizi sağlamak için tasarlandı. Profesyonel dilekçeler artık dakikalar içinde!
            </p>
          </div>
        </section>

        {/* Özellikler */}
        <section className="py-16 px-4 bg-gray-800/50">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
              Neler Sunuyoruz?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:border-red-500 transition-all duration-300"
                >
                  <div className="text-red-500 mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Nasıl Çalışır */}
        <section className="py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
              Nasıl Çalışır?
            </h2>
            <div className="relative space-y-8">
              {howItWorks.map((item, index) => (
                <div key={index} className="relative flex gap-6">
                  {/* Timeline connecting line */}
                  {index !== howItWorks.length - 1 && (
                    <div
                      className="absolute left-6 top-12 bottom-[-32px] w-0.5 bg-gray-700 -ml-[1px]"
                      aria-hidden="true"
                    />
                  )}

                  {/* Step Circle */}
                  <div className="relative flex-shrink-0 z-10">
                    <div className="flex items-center justify-center w-12 h-12 bg-red-600 text-white font-bold text-xl rounded-full shadow-lg shadow-red-900/50 ring-4 ring-gray-900">
                      {item.step}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-grow pt-2">
                    <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-gray-400 leading-relaxed text-base">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Avantajlar */}
        <section className="py-16 px-4 bg-gray-800/50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
              Neden Hukuk Asistanı?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-4 bg-gray-900 border border-gray-700 rounded-lg p-6"
                >
                  <div className="text-red-500">{benefit.icon}</div>
                  <span className="text-gray-200">{benefit.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Kullanım Kılavuzu */}
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-white text-center mb-12">
              Detaylı Kullanım Kılavuzu
            </h2>

            <div className="space-y-8">
              {/* Adım 1 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">1</span>
                  Kayıt Olun veya Giriş Yapın
                </h3>
                <p className="text-gray-300 ml-14">
                  Platformumuzu kullanmak için ücretsiz bir hesap oluşturun. E-posta adresiniz ve bir şifre yeterli.
                  Dilekçeleriniz güvenli bir şekilde hesabınızda saklanır.
                </p>
              </div>

              {/* Adım 2 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">2</span>
                  Dilekçe Türünü Seçin
                </h3>
                <p className="text-gray-300 ml-14 mb-4">
                  Ana sayfadan "Dilekçe Oluştur" butonuna tıklayın. Karşınıza çıkan dilekçe türleri arasından
                  ihtiyacınıza uygun olanı seçin:
                </p>
                <ul className="list-none text-gray-400 ml-14 space-y-3">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> <strong className="text-white">Dava Dilekçesi:</strong> Yeni bir dava açmak için</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> <strong className="text-white">Cevap Dilekçesi:</strong> Aleyhte açılan davaya cevap için</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> <strong className="text-white">İtiraz Dilekçesi:</strong> Bir karara itiraz için</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> <strong className="text-white">Şikayet Dilekçesi:</strong> Resmi makama şikayet için</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /> <strong className="text-white">İcra Takibi:</strong> İcra takibi başlatmak için</li>
                </ul>
              </div>

              {/* Adım 3 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">3</span>
                  Gerekli Bilgileri Girin
                </h3>
                <p className="text-gray-300 ml-14 mb-6">
                  AI'nin size en iyi dilekçeyi hazırlayabilmesi için şu bilgileri sağlayın:
                </p>
                <div className="ml-14 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/30">
                    <h4 className="text-white font-semibold mb-2 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-red-400" /> Dava Künyesi:</h4>
                    <p className="text-gray-400 text-sm">Mahkeme adı, dosya numarası, esas numarası gibi bilgiler.</p>
                  </div>
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/30">
                    <h4 className="text-white font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-red-400" /> Taraflar:</h4>
                    <p className="text-gray-400 text-sm">Davacı, davalı bilgileri. İsim, adres, T.C. kimlik numarası.</p>
                  </div>
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/30">
                    <h4 className="text-white font-semibold mb-2 flex items-center gap-2"><Edit3 className="w-4 h-4 text-red-400" /> Olay Özeti:</h4>
                    <p className="text-gray-400 text-sm">Davanın konusu ve olayların özet açıklaması. Ne oldu, ne istiyorsunuz?</p>
                  </div>
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/30">
                    <h4 className="text-white font-semibold mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-red-400" /> Belgeler (Opsiyonel):</h4>
                    <p className="text-gray-400 text-sm">Sözleşme, fatura, dekont gibi belgeleri yükleyebilirsiniz.</p>
                  </div>
                </div>
              </div>

              {/* Adım 4 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">4</span>
                  AI İle Sohbet Edin
                </h3>
                <p className="text-gray-300 ml-14">
                  Dilekçe oluştururken AI asistanımızla sohbet edebilirsiniz. Sorularınızı sorun,
                  ek bilgi isteyin. AI, dilekçenizi adım adım şekillendirecektir.
                  <br /><br />
                  <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-lg">
                    <em className="text-blue-300 not-italic flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-1 flex-shrink-0" />
                      "Bu davada zamanaşımı süresi ne kadar?", "Hangi içtihatları ekleyebilirim?",
                      "Maddi tazminat talebimi nasıl gerekçelendirebilirim?"
                    </em>
                  </div>
                </p>
              </div>

              {/* Adım 5 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">5</span>
                  Dilekçeyi İnceleyin
                </h3>
                <p className="text-gray-300 ml-14">
                  AI dilekçenizi hazırladıktan sonra, önizleme panelinde görüntüleyin.
                  Profesyonel format, hukuki terminoloji ve düzenli yapı ile karşınıza çıkacak.
                  Gerekirse düzeltmeler yapabilir, AI'dan değişiklik isteyebilirsiniz.
                </p>
              </div>

              {/* Adım 6 */}
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 hover:border-red-500/30 transition-all duration-300 shadow-lg">
                <h3 className="text-2xl font-semibold text-white mb-4 flex items-center">
                  <span className="bg-gradient-to-br from-red-600 to-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center mr-4 text-sm shadow-red-900/30 shadow-lg">6</span>
                  İndirin ve Kaydedin
                </h3>
                <p className="text-gray-300 ml-14 mb-4">
                  Dilekçeniz hazır! Şimdi yapabilecekleriniz:
                </p>
                <div className="ml-14 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg"><Download className="w-5 h-5 text-green-400" /> <span className="text-gray-300">Word formatında indirin</span></div>
                  <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg"><FileCheck className="w-5 h-5 text-red-400" /> <span className="text-gray-300">PDF olarak kaydedin</span></div>
                  <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg"><CheckCircle className="w-5 h-5 text-blue-400" /> <span className="text-gray-300">Hesabınızda saklayın</span></div>
                  <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg"><Users className="w-5 h-5 text-purple-400" /> <span className="text-gray-300">Dilekçe havuzunda paylaşın</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* İpuçları */}
        <section className="py-16 px-4 bg-gray-800/50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-white text-center mb-12 flex items-center justify-center gap-3">
              <Lightbulb className="w-8 h-8 text-yellow-500" /> Kullanım İpuçları
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:border-green-500/50 transition-all duration-300 group">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" /> Net ve Açık Olun
                </h3>
                <p className="text-gray-400">
                  AI'a bilgi verirken mümkün olduğunca detaylı ve net olun. Ne kadar çok bilgi, o kadar iyi dilekçe.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:border-blue-500/50 transition-all duration-300 group">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" /> Belge Yükleyin
                </h3>
                <p className="text-gray-400">
                  Sözleşme, fatura gibi belgeleriniz varsa mutlaka yükleyin. AI bunları analiz edip önemli bilgileri çıkarır.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:border-purple-500/50 transition-all duration-300 group">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <Search className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" /> İçtihat Kullanın
                </h3>
                <p className="text-gray-400">
                  İçtihat arama özelliğini kullanarak dilekçenize güç katın. İlgili Yargıtay ve mahkeme kararlarını ekleyin.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:border-yellow-500/50 transition-all duration-300 group">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" /> AI'ya Soru Sorun
                </h3>
                <p className="text-gray-400">
                  Aklınıza takılan her şeyi AI'ya sorabilirsiniz. Hukuki terim açıklamaları, süreç bilgileri vb.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Hazır mısınız?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Dakikalar içinde profesyonel dilekçeler oluşturmaya başlayın!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/register')}
                className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                Ücretsiz Başlayın
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate('/petition-pool')}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all"
              >
                Dilekçe Havuzuna Göz Atın
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
