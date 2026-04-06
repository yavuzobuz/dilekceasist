import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import {
  FileText,
  AlertTriangle,
  Scale,
  User,
  Ban,
  Bot,
  CreditCard,
  Shield,
  Gavel,
  RefreshCw,
  KeyRound,
  Mail
} from 'lucide-react';

export default function Terms() {
  const navigate = useNavigate();

  const prohibitedUses = [
    'Sahte, yanıltıcı veya hukuka aykırı belge üretmek ya da yaymak',
    'Platformu dolandırıcılık, kimlik avı, tehdit, taciz veya suç teşkil eden faaliyetlerde kullanmak',
    'Yetkisiz erişim girişimi, güvenlik zafiyeti denemesi, tersine mühendislik veya servis sürekliliğini bozma',
    'Üçüncü kişilerin kişisel verilerini hukuka aykırı şekilde sisteme yüklemek veya işlemek',
    'Fikri mülkiyet haklarını ihlal edecek şekilde içerik kopyalamak, çoğaltmak veya dağıtmak'
  ];

  const pricingRules = [
    'Ücretli planlar, güncel Fiyatlandırma sayfasındaki koşullara tabidir.',
    'Deneme/trial, kampanya ve promosyon koşulları dönemsel olarak değiştirilebilir.',
    'Ödeme, fatura ve abonelik işlemleri ilgili ödeme altyapısının kurallarıyla birlikte yürütülür.',
    'Mevzuattan doğan tüketici hakları saklıdır; emredici hükümlere aykırı yorum yapılamaz.'
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        <section className="py-16 px-4">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Kullanım Koşulları
            </h1>
            <p className="text-gray-400">
              DilekAI platformu kullanımına ilişkin şartlar, sorumluluk sınırları ve yasal çerçeve
            </p>
            <p className="text-sm text-gray-500 mt-2">Son güncelleme: 3 Mart 2026</p>
          </div>
        </section>

        <section className="px-4 mb-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-red-900/25 border border-red-700/50 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-7 h-7 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-red-100 space-y-2">
                  <p className="font-semibold">Önemli Uyarı</p>
                  <p className="text-sm leading-relaxed">
                    Platformda üretilen içerikler otomatik sistemler ve yapay zeka modelleri tarafından oluşturulabilir.
                    Bu içerikler hukuki danışmanlık, avukat görüşü veya kesin sonuç garantisi olarak yorumlanamaz.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-6 px-4">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Scale className="w-5 h-5 text-red-500" />
                1. Taraflar, Kapsam ve Kabul
              </h2>
              <p className="text-gray-300 leading-relaxed">
                Bu Kullanım Koşulları, DilekAI web sitesi, Word eklentisi ve bağlı hizmetlerin kullanımına uygulanır.
                Platformu kullanmanız, bu koşulları okuduğunuz ve kabul ettiğiniz anlamına gelir.
              </p>
              <p className="text-gray-300 leading-relaxed mt-3">
                Koşulları kabul etmiyorsanız platformu kullanmamanız gerekir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Bot className="w-5 h-5 text-red-500" />
                2. Hizmetin Niteliği ve Kapsamı
              </h2>
              <p className="text-gray-300 leading-relaxed">
                DilekAI; belge oluşturma, metin düzenleme, karar/mevzuat arama, web araması, beyin fırtınası,
                doküman analizi ve benzeri dijital üretim araçları sunar. Hizmet kapsamı teknik gereklilikler,
                mevzuat değişiklikleri ve ürün geliştirmeleri doğrultusunda güncellenebilir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-red-500" />
                3. Hesap ve Kullanıcı Yükümlülükleri
              </h2>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Hesap bilgilerinin doğru, güncel ve eksiksiz tutulması kullanıcı sorumluluğundadır.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Şifre ve oturum bilgilerinin gizliliği kullanıcı tarafından korunur.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Kullanıcı, sisteme yüklediği içerik üzerinde gerekli izin ve yetkiye sahip olduğunu beyan eder.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Hukuki başvurularda kullanılacak nihai metnin kontrolü ve uygunluğu kullanıcıya aittir.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-red-500" />
                4. Ücretlendirme, Abonelik ve Ödemeler
              </h2>
              <ul className="space-y-2 text-gray-300 mb-4">
                {pricingRules.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-gray-300 leading-relaxed">
                6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamına
                giren işlemlerde, tüketiciye tanınan bilgilendirme ve başvuru hakları saklıdır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" />
                5. Yasaklı Kullanımlar
              </h2>
              <ul className="space-y-2 text-gray-300">
                {prohibitedUses.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                6. Yapay Zeka Çıktıları ve Sorumluluk Reddi
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Platform çıktıları; model hatası, güncellik farkı veya bağlam eksikliği içerebilir. DilekAI,
                üretilen çıktının her durumda hatasız, eksiksiz veya belirli bir amaca kesin uygun olduğunu garanti etmez.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Kullanıcı, resmi mercilere sunulacak içerikleri bağımsız olarak doğrulamakla yükümlüdür ve gerekli
                durumlarda avukat desteği almalıdır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-500" />
                7. Fikri Mülkiyet Hakları
              </h2>
              <p className="text-gray-300 leading-relaxed">
                Platform yazılımı, arayüzü, marka unsurları, veri tabanları ve tüm özgün içerikler üzerindeki haklar
                DilekAI veya lisans verenlerine aittir. Bu haklar, kullanıcıya yalnızca hizmetten yararlanmak için sınırlı,
                devredilemez ve münhasır olmayan bir kullanım izni verir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-red-500" />
                8. Hizmetin Değiştirilmesi, Askıya Alınması ve Feshi
              </h2>
              <p className="text-gray-300 leading-relaxed">
                DilekAI; güvenlik, yasal uyum, teknik gereklilik veya ticari sebeplerle hizmetin tamamını ya da bir
                kısmını değiştirebilir, askıya alabilir veya sonlandırabilir. Koşulların ihlali halinde hesap erişimi
                geçici veya kalıcı olarak sınırlandırılabilir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />
                9. Sorumluluğun Sınırlandırılması
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                DilekAI, hukuken izin verilen ölçüde; dolaylı zarar, kar kaybı, veri kaybı, itibar kaybı ve üçüncü
                taraf taleplerinden doğan zararlardan sorumlu tutulamaz.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Bu sınırlandırma, tüketici mevzuatı ve diğer emredici hükümler ile ağır kusur/kasıt hallerinde
                uygulanmaz; ilgili mevzuatın zorunlu hükümleri saklıdır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Gavel className="w-5 h-5 text-red-500" />
                10. Uygulanacak Hukuk ve Uyuşmazlık Çözümü
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Tüketici işlemlerinde, tüketicinin yerleşim
                yerindeki tüketici hakem heyeti ve tüketici mahkemesi dahil kanunen yetkili mercilere başvuru hakkı saklıdır.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Ticari nitelikteki uyuşmazlıklarda, aksine emredici kural bulunmadıkça İstanbul (Merkez) Mahkeme
                ve İcra Daireleri yetkilidir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">11. İlgili Mevzuat (Özet)</h2>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>6502 sayılı Tüketicinin Korunması Hakkında Kanun</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Mesafeli Sözleşmeler Yönetmeliği</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                  <span>6698 sayılı Kişisel Verilerin Korunması Kanunu ve ikincil düzenlemeler</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-5 h-5 text-blue-300" />
                <h3 className="text-blue-200 font-semibold">12. İletişim ve Koşulların Güncellenmesi</h3>
              </div>
              <p className="text-blue-100/90 text-sm leading-relaxed">
                DilekAI, işbu koşulları mevzuat ve ürün değişikliklerine göre güncelleyebilir. Güncel metin bu
                sayfada yayımlanır. Sorularınız için <strong>info@dilekai.com</strong> adresi üzerinden iletişime geçebilirsiniz.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
