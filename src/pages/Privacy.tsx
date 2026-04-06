import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import {
  ShieldCheck,
  Database,
  Scale,
  Globe,
  Lock,
  Mail,
  AlertTriangle,
  UserCheck,
  Cookie,
  FileText
} from 'lucide-react';

export default function Privacy() {
  const navigate = useNavigate();

  const dataCategories = [
    'Kimlik ve iletişim verileri (ad-soyad, e-posta, telefon, hesap bilgileri)',
    'Müşteri işlem verileri (üyelik, abonelik, ödeme/plan geçmişi, destek talepleri)',
    'İşlem güvenliği verileri (IP, oturum kayıtları, cihaz/tarayıcı bilgileri, log kayıtları)',
    'Belge ve içerik verileri (kullanıcının yüklediği belgeler, metinler, istemler, çıktı dosyaları)',
    'Hukuki işlem ve uyum verileri (talep, şikayet, uyuşmazlık, resmi başvuru kayıtları)'
  ];

  const purposes = [
    'Platformun sunulması, üyelik ve oturum süreçlerinin yürütülmesi',
    'Belge oluşturma, metin düzenleme, web arastirmasi ve diğer AI özelliklerinin çalıştırılması',
    'Ödeme, faturalama, abonelik yönetimi ve finansal operasyonların yürütülmesi',
    'Bilgi güvenliği, denetim, hata ayıklama, suistimal önleme ve hizmet sürekliliğinin sağlanması',
    'Hukuki yükümlülüklerin yerine getirilmesi, resmi kurum taleplerinin karşılanması',
    'Kullanıcı desteği, memnuniyet ve hizmet kalitesi iyileştirmeleri'
  ];

  const legalReferences = [
    '6698 sayılı Kişisel Verilerin Korunması Kanunu (özellikle md. 4, 5, 6, 10, 11, 12, 13 ve 9)',
    '12 Mart 2024 tarihli 7499 sayılı Kanun ile KVKK md. 6, 9 ve 18 değişiklikleri (yürürlük: 1 Haziran 2024)',
    'Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik',
    'Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar',
    'Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        <section className="py-16 px-4">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Gizlilik Politikası
            </h1>
            <p className="text-gray-400">
              DilekAI platformunda kişisel verilerin işlenmesine ilişkin aydınlatma metni
            </p>
            <p className="text-sm text-gray-500 mt-2">Son güncelleme: 3 Mart 2026</p>
          </div>
        </section>

        <section className="px-4 mb-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-100 text-sm leading-relaxed">
                  Bu metin, 6698 sayılı KVKK kapsamında genel aydınlatma amacı taşır. Somut olaylarda
                  emredici mevzuat hükümleri, Kurul kararları ve yargı uygulaması önceliklidir.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-6 px-4">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-red-500" />
                1. Veri Sorumlusu ve Kapsam
              </h2>
              <p className="text-gray-300 leading-relaxed">
                Bu politika, DilekAI platformu, web sitesi ve bağlı hizmetler kapsamında gerçekleştirilen
                kişisel veri işleme faaliyetlerini kapsar. DilekAI, ilgili mevzuat çerçevesinde veri sorumlusu
                sıfatıyla hareket eder.
              </p>
              <p className="text-gray-300 leading-relaxed mt-3">
                İletişim: <strong>info@dilekai.com</strong>
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-red-500" />
                2. İşlenen Kişisel Veri Kategorileri
              </h2>
              <ul className="space-y-2 text-gray-300">
                {dataCategories.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Scale className="w-5 h-5 text-red-500" />
                3. İşleme Amaçları ve Hukuki Sebepler
              </h2>
              <ul className="space-y-2 text-gray-300 mb-4">
                {purposes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-gray-300 leading-relaxed">
                Kişisel veriler; KVKK md. 5 ve md. 6 kapsamında açık rıza, sözleşmenin kurulması/ifası,
                hukuki yükümlülüklerin yerine getirilmesi, bir hakkın tesisi-kullanılması-korunması ve meşru
                menfaat hukuki sebeplerine dayanılarak işlenebilir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-red-500" />
                4. Veri Aktarımı (Yurt İçi ve Yurt Dışı)
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Veriler; hizmet sağlayıcıları, altyapı/hosting firmaları, ödeme kuruluşları, danışmanlar,
                yetkili kamu kurumları ve kanunen yetkili özel kişilere, işleme amacıyla sınırlı olmak üzere
                aktarılabilir.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Yurt dışı aktarım süreçleri KVKK md. 9 çerçevesinde yürütülür. 1 Haziran 2024 itibarıyla
                yürürlüğe giren değişiklikler kapsamında yeterlilik kararı, uygun güvenceler (standart sözleşme,
                bağlayıcı şirket kuralları vb.) veya kanuni istisnalar temelinde aktarım yapılır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-red-500" />
                5. Saklama Süresi, İmha ve Güvenlik
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Veriler, işleme amacının gerektirdiği süre kadar ve ilgili mevzuatta öngörülen zamanaşımı,
                ispat ve saklama yükümlülükleri boyunca saklanır. Süre sonunda silme, yok etme veya anonim
                hale getirme yöntemleri uygulanır.
              </p>
              <p className="text-gray-300 leading-relaxed">
                DilekAI; KVKK md. 12 kapsamında idari ve teknik tedbirler uygular. Buna; erişim yetkilendirmesi,
                kayıt izleme, ağ güvenliği, yedekleme, denetim, personel farkındalığı ve tedarikçi kontrolleri dahildir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-red-500" />
                6. İlgili Kişi Hakları ve Başvuru
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                KVKK md. 11 kapsamında; verilerin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme,
                silme/yok etme, aktarılan üçüncü kişileri öğrenme, otomatik işlem sonuçlarına itiraz etme ve
                zarar halinde tazmin talep etme haklarına sahipsiniz.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Başvurularınızı kimlik teyidine elverişli şekilde <strong>info@dilekai.com</strong> adresine iletebilirsiniz.
                Başvurular mevzuata uygun olarak en kısa sürede ve en geç 30 gün içinde sonuçlandırılır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Cookie className="w-5 h-5 text-red-500" />
                7. Çerezler ve Benzeri Teknolojiler
              </h2>
              <p className="text-gray-300 leading-relaxed">
                Çerez kullanımına ilişkin detaylar ayrı Çerez Politikası sayfasında açıklanır. Tarayıcı
                ayarlarınızı değiştirerek bazı çerezleri engelleyebilirsiniz; ancak bu durumda hizmetin bazı
                fonksiyonları sınırlanabilir.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                8. AI Özellikleri ve Kullanıcı Sorumluluğu
              </h2>
              <p className="text-gray-300 leading-relaxed mb-3">
                Belge analizi ve metin üretim özelliklerinde sisteme yüklenen içerik, talebin işlenmesi ve
                çıktının üretilmesi amacıyla işlenir. Kullanıcı, sisteme yüklediği veriler üzerinde işleme yetkisine
                sahip olduğunu kabul eder.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Özel nitelikli kişisel verilerin işlenmesi gereken durumlarda hukuki sebep, ölçülülük ve veri
                minimizasyonu ilkelerine uygun hareket edilmesi kullanıcı ve veri sorumlusu bakımından esastır.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">9. Dayanak Mevzuat (Özet)</h2>
              <ul className="space-y-2 text-gray-300">
                {legalReferences.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-5 h-5 text-blue-300" />
                <h3 className="text-blue-200 font-semibold">10. İletişim ve Güncellemeler</h3>
              </div>
              <p className="text-blue-100/90 text-sm leading-relaxed">
                Bu politika, mevzuat değişiklikleri ve hizmet güncellemeleri doğrultusunda revize edilebilir.
                Güncel sürüm bu sayfada yayımlanır. Gizlilik politikası ile ilgili talepleriniz için
                <strong> info@dilekai.com</strong> üzerinden bize ulaşabilirsiniz.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

