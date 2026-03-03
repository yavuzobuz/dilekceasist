import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

export default function FAQ() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      category: 'Genel Sorular',
      questions: [
        {
          question: 'DilekAI nedir?',
          answer: 'DilekAI; dilekçe, sözleşme ve ihtarname üretimini hızlandıran yapay zeka destekli bir hukuk üretim platformudur. Belge analizi, AI sohbet, emsal karar arama ve çoklu çıktı alma akışlarını tek panelde sunar.',
        },
        {
          question: 'Platform tamamen ücretsiz mi?',
          answer: 'Platformda 14 günlük ücretsiz deneme (trial) bulunur. Trial süresince günlük 10 belge üretim limiti uygulanır. Daha yüksek kullanım için Pro veya Team planlarına geçilebilir.',
        },
        {
          question: 'Kimler kullanabilir?',
          answer: 'Avukatlar, hukuk büroları, stajyerler ve bireysel kullanıcılar kullanabilir. Özellikle standart hukuki belge üretimini hızlandırmak isteyen ekipler için uygundur.',
        },
        {
          question: 'Verilerim güvende mi?',
          answer: 'Kullanıcı verileri yetkilendirme katmanlarıyla korunur. Hesap, belge ve kullanım verileri erişim kontrollü olarak saklanır. Kritik süreçlerde kişisel veri paylaşmadan çalışmanız önerilir.',
        },
      ],
    },
    {
      category: 'Özellikler',
      questions: [
        {
          question: 'Hangi belge türlerini üretebilirim?',
          answer: 'Dava dilekçeleri, cevap/itiraz metinleri, sözleşmeler, ihtarnameler ve benzeri hukuki metinleri üretebilir, düzenleyebilir ve yeniden yazabilirsiniz.',
        },
        {
          question: 'Hangi dosya türlerini yükleyebilirim?',
          answer: 'PDF, UDF, Word belgeleri ve görsel formatları yüklenebilir. Uygulama bu içerikleri analiz ederek özet, bağlam ve belge üretim akışında kullanır.',
        },
        {
          question: 'Emsal karar arama var mı?',
          answer: 'Evet. Uygulama içinde emsal karar araştırma akışı bulunur. Uygun durumlarda Yargıtay/Danıştay odağında karar arama, özetleme ve metne bağlama desteği verilir.',
        },
        {
          question: 'Web araması ve beyin fırtınası desteği var mı?',
          answer: 'Evet. AI sohbet içinde web araması, metin düzeltme, beyin fırtınası ve karar odaklı araştırma akışları kullanılabilir.',
        },
        {
          question: 'Word eklentisi var mı?',
          answer: 'Evet. Word eklentisi ile belge içinden doğrudan chatbot kullanılabilir. Kurulum için “Word Eklentisi” sayfasından manifest veya otomatik kurulum aracı (.bat) indirilebilir.',
        },
      ],
    },
    {
      category: 'Fiyatlandırma ve Limitler',
      questions: [
        {
          question: 'Trial planın güncel kapsamı nedir?',
          answer: 'Trial süresi 14 gündür. Günlük 10 belge üretim limiti vardır. Dilekçe, sözleşme, ihtarname ve chat içinden başlatılan belge üretimleri bu limite dahildir.',
        },
        {
          question: 'Pro plan ücreti nedir?',
          answer: 'Güncel liste fiyatı Pro plan için aylık kullanıcı başına 1490 TL’dir. Yüksek üretim limiti ve öncelikli işlem avantajı sağlar.',
        },
        {
          question: 'Team plan ücreti nedir?',
          answer: 'Güncel Team başlangıç fiyatı aylık 3990 TL’dir. Ekip kullanımı, kurumsal onboarding ve gelişmiş limit/SLA seçenekleri için tasarlanmıştır.',
        },
        {
          question: 'Günlük limit dolunca ne olur?',
          answer: 'Günlük limit dolduğunda yeni belge üretimi durur; bir sonraki gün limit yenilenir. Üretim ihtiyacı arttığında plan yükseltme önerilir.',
        },
      ],
    },
    {
      category: 'Hesap ve Kullanım',
      questions: [
        {
          question: 'Nasıl kayıt olurum?',
          answer: 'Kayıt ol sayfasından e-posta ve şifre ile hesap açabilirsiniz. Plan seçimi trial/pro/team olarak kayıt akışında yönlendirilebilir.',
        },
        {
          question: 'Şifremi unuttum, ne yapmalıyım?',
          answer: 'Giriş sayfasındaki “Şifremi Unuttum” akışını kullanarak e-posta üzerinden şifre sıfırlama bağlantısı alabilirsiniz.',
        },
        {
          question: 'Mobil cihazlarda çalışır mı?',
          answer: 'Evet. Web arayüzü mobil ve masaüstü için uyumludur. Yoğun metin düzenleme için masaüstü deneyimi önerilir.',
        },
        {
          question: 'Belgelerime sonradan erişebilir miyim?',
          answer: 'Hesabınızla oluşturduğunuz içeriklere profil ve ilgili sayfalardan tekrar erişebilir, güncelleyebilir veya indirebilirsiniz.',
        },
      ],
    },
    {
      category: 'İndirme ve Paylaşım',
      questions: [
        {
          question: 'Hangi çıktı formatları destekleniyor?',
          answer: 'Akışa göre UDF, DOCX, PDF ve TXT çıktıları alınabilir. Kullanım senaryosuna göre uygun format seçebilirsiniz.',
        },
        {
          question: 'Dilekçe Havuzu nedir?',
          answer: 'Dilekçe Havuzu; topluluk tarafından paylaşılan örnek metinlere erişebildiğiniz, inceleyip kendi ihtiyacınıza göre uyarlayabildiğiniz alandır.',
        },
        {
          question: 'Dilekçe paylaşımını geri alabilir miyim?',
          answer: 'Evet. Kendi paylaşımlarınızı yönetebilir ve gerektiğinde yayından kaldırabilirsiniz.',
        },
      ],
    },
    {
      category: 'Word Eklentisi',
      questions: [
        {
          question: 'Word eklentisini nasıl kurarım? (Word 2021 ve sonrası)',
          answer: 'Word > Geliştirici > Word Eklentileri > Eklentilerimi Yönet > Dosyadan Yükle adımlarını izleyip manifest.xml dosyasını seçebilirsiniz.',
        },
        {
          question: 'Otomatik kurulum aracı (.bat) ne yapar?',
          answer: 'Windows için hazırlanan kurulum aracı Word’ü kapatır, Office önbelleğini temizler, güncel manifesti indirir ve sideload işlemini tetikler.',
        },
        {
          question: 'Eklentide eski sürüm görünüyorsa ne yapmalıyım?',
          answer: 'Eklentiyi kaldırıp yeniden yükleyin, Word’ü tamamen kapatıp açın ve tek bir manifest kullanın. Gerekirse Office önbelleğini temizleyin.',
        },
      ],
    },
    {
      category: 'Hukuki Uyarılar',
      questions: [
        {
          question: 'Üretilen metinler doğrudan hukuki danışmanlık yerine geçer mi?',
          answer: 'Hayır. Platform bir üretim ve hızlandırma aracıdır. Nihai hukuki sorumluluk kullanıcıdadır; kritik dosyalarda yetkili hukuk profesyoneli kontrolü önerilir.',
        },
        {
          question: 'Platform avukatlık hizmeti sunuyor mu?',
          answer: 'Hayır. Platform doğrudan avukatlık hizmeti sunmaz; hukuki metin hazırlama süreçlerinde yardımcı yazılım olarak konumlanır.',
        },
      ],
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-6">
              <HelpCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">Sıkça Sorulan Sorular</h1>
            <p className="text-xl text-gray-300">Güncel özellikler, planlar ve kurulum akışları hakkında kısa yanıtlar</p>
          </div>
        </section>

        <section className="pb-20 px-4">
          <div className="max-w-4xl mx-auto space-y-12">
            {faqs.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <h2 className="text-2xl font-bold text-white mb-6 pb-2 border-b border-gray-700">
                  {category.category}
                </h2>
                <div className="space-y-4">
                  {category.questions.map((faq, faqIndex) => {
                    const globalIndex = categoryIndex * 100 + faqIndex;
                    const isOpen = openIndex === globalIndex;

                    return (
                      <div
                        key={faqIndex}
                        className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-red-500/50 transition-all"
                      >
                        <button
                          onClick={() => toggleFAQ(globalIndex)}
                          className="w-full px-6 py-4 flex items-center justify-between text-left"
                        >
                          <span className="text-base sm:text-lg font-semibold text-white pr-4">
                            {faq.question}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-5 h-5 text-red-500 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-6 pb-4">
                            <p className="text-gray-300 leading-relaxed">
                              {faq.answer}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 px-4 bg-gray-800/50">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Sorunuz mu var?</h2>
            <p className="text-gray-300 mb-8">
              Burada yanıtını bulamadığınız konular için bizimle iletişime geçebilirsiniz.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:info@dilekai.com"
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
              >
                E-posta Gönder
              </a>
              <button
                onClick={() => navigate('/word-eklentisi')}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all"
              >
                Word Eklentisi Sayfası
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
