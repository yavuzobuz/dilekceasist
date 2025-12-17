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
          answer: 'DilekAI, yapay zeka destekli bir dilekçe oluşturma platformudur. Gemini tabanlı AI teknolojisi ile dakikalar içinde profesyonel hukuki dilekçeler hazırlamanızı sağlar. Dava dilekçesi, cevap dilekçesi, itiraz, şikayet gibi 20\'den fazla dilekçe türünü destekliyoruz.'
        },
        {
          question: 'Platform tamamen ücretsiz mi?',
          answer: 'Evet, temel özelliklerimiz tamamen ücretsizdir. Kayıt olduktan sonra dilekçe oluşturabilir, kaydedebilir ve indirebilirsiniz. Gelecekte premium özellikler eklenebilir ancak şu an için tüm özellikler ücretsizdir.'
        },
        {
          question: 'Avukat olmayan birisi kullanabilir mi?',
          answer: 'Kesinlikle! Platform hem avukatlar hem de bireysel kullanıcılar için tasarlanmıştır. Kullanıcı dostu arayüzümüz sayesinde hukuk bilginiz olmasa bile kolayca dilekçe oluşturabilirsiniz. Ancak önemli davalarda mutlaka bir avukata danışmanızı öneririz.'
        },
        {
          question: 'Verilerim güvende mi?',
          answer: 'Evet, verileriniz tamamen güvendedir. Tüm veriler şifreli olarak saklanır ve sadece sizin erişebileceğiniz şekilde korunur. Supabase güvenli altyapısını kullanıyoruz. Verilerinizi asla üçüncü şahıslarla paylaşmıyoruz.'
        }
      ]
    },
    {
      category: 'Dilekçe Oluşturma',
      questions: [
        {
          question: 'Hangi türde dilekçeler oluşturabilirim?',
          answer: 'Dava dilekçesi, cevap dilekçesi, itiraz dilekçesi, şikayet dilekçesi, icra takip dilekçesi, idari dava dilekçesi ve daha fazlası olmak üzere 20+ dilekçe türü desteklenmektedir. Her türlü hukuki ihtiyacınız için uygun şablonlar mevcuttur.'
        },
        {
          question: 'AI dilekçeyi nasıl oluşturuyor?',
          answer: 'GPT-4 tabanlı yapay zeka modelimiz, sizin verdiğiniz bilgileri (taraflar, dava künyesi, olay özeti) analiz ederek hukuki format ve terminolojiye uygun profesyonel bir dilekçe hazırlar. Binlerce hukuki doküman ile eğitilmiş AI, doğru yapıyı ve ifadeleri kullanır.'
        },
        {
          question: 'Oluşturulan dilekçeyi düzenleyebilir miyim?',
          answer: 'Evet, oluşturulan dilekçeyi istediğiniz gibi düzenleyebilirsiniz. Word formatında indirip üzerinde değişiklik yapabilir veya platform üzerinde AI\'ya değişiklik talimatları verebilirsiniz. "Bu paragrafı değiştir" gibi komutlarla dilekçenizi özelleştirebilirsiniz.'
        },
        {
          question: 'Belge yükleyebilir miyim?',
          answer: 'Evet! PDF, Word veya resim formatında belgelerinizi yükleyebilirsiniz. AI, yüklediğiniz belgeleri otomatik olarak analiz eder ve önemli bilgileri (tarihler, tutarlar, taraflar vb.) çıkararak dilekçenize entegre eder. Bu özellik özellikle sözleşme, fatura gibi belgeler için çok kullanışlıdır.'
        },
        {
          question: 'İçtihat eklenebilir mi?',
          answer: 'Evet, platform içtihat arama özelliğine sahiptir. Dava konunuza uygun Yargıtay ve mahkeme kararlarını arayabilir ve dilekçenize ekleyebilirsiniz. Bu, dilekçenizin hukuki dayanağını güçlendirir.'
        }
      ]
    },
    {
      category: 'Hesap ve Kullanım',
      questions: [
        {
          question: 'Nasıl kayıt olabilirim?',
          answer: 'Ana sayfada "Kayıt Ol" butonuna tıklayın. E-posta adresinizi ve güvenli bir şifre belirleyin. E-posta doğrulamasını yaptıktan sonra hemen kullanmaya başlayabilirsiniz.'
        },
        {
          question: 'Dilekçelerim ne kadar süre saklanır?',
          answer: 'Oluşturduğunuz tüm dilekçeler hesabınızda süresiz olarak saklanır. İstediğiniz zaman erişebilir, düzenleyebilir veya silebilirsiniz. Hesabınızı silmeniz durumunda tüm dilekçeleriniz de kalıcı olarak silinir.'
        },
        {
          question: 'Kaç tane dilekçe oluşturabilirim?',
          answer: 'Şu an için dilekçe sayısına bir sınır yoktur. İstediğiniz kadar dilekçe oluşturabilir ve hesabınızda saklayabilirsiniz.'
        },
        {
          question: 'Mobil cihazlardan kullanabilir miyim?',
          answer: 'Evet! Platform responsive tasarıma sahiptir ve tüm cihazlarda (telefon, tablet, bilgisayar) sorunsuz çalışır. Tarayıcınızdan erişerek mobil cihazınızdan da dilekçe oluşturabilirsiniz.'
        }
      ]
    },
    {
      category: 'İndirme ve Paylaşım',
      questions: [
        {
          question: 'Dilekçeyi hangi formatlarda indirebilirim?',
          answer: 'Dilekçelerinizi Word (.docx) veya PDF formatında indirebilirsiniz. Word formatı düzenleme yapmanıza, PDF formatı ise doğrudan yazdırıp kullanmanıza olanak sağlar.'
        },
        {
          question: 'Dilekçe Havuzu nedir?',
          answer: 'Dilekçe Havuzu, kullanıcıların oluşturdukları dilekçeleri toplulukla paylaşabilecekleri bir platformdur. Binlerce örnek dilekçeye göz atabilir, beğendiğinizi hesabınıza kopyalayıp kendi ihtiyaçlarınıza göre düzenleyebilirsiniz.'
        },
        {
          question: 'Dilekçemi nasıl paylaşabilirim?',
          answer: 'Profil sayfanızdan herhangi bir dilekçenin yanındaki "Paylaş" butonuna tıklayın. Açıklama ve etiketler ekleyerek dilekçenizi Dilekçe Havuzu\'nda yayınlayabilirsiniz. Kişisel bilgilerinizi çıkardığınızdan emin olun.'
        },
        {
          question: 'Paylaştığım dilekçeyi geri çekebilir miyim?',
          answer: 'Evet, istediğiniz zaman paylaştığınız dilekçeyi Dilekçe Havuzu\'ndan kaldırabilirsiniz. Dilekçe Havuzu sayfasında kendi dilekçelerinizi yönetebilirsiniz.'
        }
      ]
    },
    {
      category: 'Teknik Sorular',
      questions: [
        {
          question: 'Hangi tarayıcıları destekliyorsunuz?',
          answer: 'Google Chrome, Mozilla Firefox, Safari, Microsoft Edge gibi modern tarayıcıların tümünü destekliyoruz. En iyi deneyim için tarayıcınızı güncel tutmanızı öneririz.'
        },
        {
          question: 'İnternet bağlantısı olmadan kullanabilir miyim?',
          answer: 'Hayır, platform çevrimiçi çalışmaktadır ve aktif bir internet bağlantısı gerektirir. AI işlemleri ve veri senkronizasyonu internet üzerinden gerçekleşir.'
        },
        {
          question: 'Bir hata ile karşılaştım, ne yapmalıyım?',
          answer: 'Bir hata ile karşılaşırsanız, önce sayfayı yenilemeyi deneyin. Sorun devam ederse info@dilekai.com adresinden bizimle iletişime geçin. Hata mesajının ekran görüntüsünü ve detaylarını paylaşırsanız daha hızlı yardımcı olabiliriz.'
        },
        {
          question: 'Şifremi unuttum, ne yapmalıyım?',
          answer: 'Giriş sayfasında "Şifremi Unuttum" linkine tıklayın. E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderilecektir. Bağlantıya tıklayarak yeni bir şifre belirleyebilirsiniz.'
        }
      ]
    },
    {
      category: 'Hukuki Uyarılar',
      questions: [
        {
          question: 'Oluşturulan dilekçeler mahkemede geçerli mi?',
          answer: 'Evet, oluşturulan dilekçeler hukuki format ve terminolojiye uygundur. Ancak her dava kendine özgüdür ve detaylar önemlidir. Önemli davalarda mutlaka bir avukata danışmanızı ve dilekçenizi kontrol ettirmenizi şiddetle tavsiye ederiz.'
        },
        {
          question: 'Platform avukatlık hizmeti mi sunuyor?',
          answer: 'Hayır, DilekAI bir yazılım platformudur ve avukatlık hizmeti sunmamaktadır. Platform, dilekçe hazırlama sürecini kolaylaştırmak için bir araçtır. Hukuki danışmanlık için mutlaka yetkili bir avukata başvurunuz.'
        },
        {
          question: 'Kişisel verilerimin gizliliği nasıl korunuyor?',
          answer: 'KVKK (Kişisel Verilerin Korunması Kanunu) kapsamında tüm verileriniz güvenli şekilde saklanır. Verileriniz şifrelenir ve sadece sizin erişebileceğiniz şekilde korunur. Gizlilik Politikamızı inceleyerek detaylı bilgi alabilirsiniz.'
        },
        {
          question: 'Platform sorumluluk üstleniyor mu?',
          answer: 'Platform, bir yardımcı araç olarak sunulmaktadır. Oluşturulan dilekçelerin kullanımından doğacak sonuçlardan kullanıcı sorumludur. Dilekçenizi mutlaka bir hukuk profesyoneline kontrol ettirmenizi öneririz. Kullanım Şartlarımızı okuyunuz.'
        }
      ]
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-6">
              <HelpCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">
              Sıkça Sorulan Sorular
            </h1>
            <p className="text-xl text-gray-300">
              DilekAI hakkında merak ettikleriniz ve yanıtları
            </p>
          </div>
        </section>

        {/* FAQ Sections */}
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

        {/* Contact CTA */}
        <section className="py-16 px-4 bg-gray-800/50">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Sorunuz mu var?
            </h2>
            <p className="text-gray-300 mb-8">
              Burada yanıtını bulamadığınız sorularınız için bizimle iletişime geçebilirsiniz.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:info@dilekai.com"
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
              >
                E-posta Gönder
              </a>
              <button
                onClick={() => navigate('/about')}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all"
              >
                Hakkında Sayfası
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
