import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { FileText, AlertTriangle, Scale, Shield, User, Ban, Edit, Globe, Gavel, Clock } from 'lucide-react';

export default function Terms() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col">
            <Header onShowLanding={() => navigate('/')} />

            <main className="flex-grow">
                {/* Hero */}
                <section className="py-16 px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl">
                            <FileText className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            Kullanım Koşulları
                        </h1>
                        <p className="text-gray-400">
                            Hukuk Asistanı AI Platformu Kullanım Şartları ve Sorumluluk Reddi Beyanı
                        </p>
                        <p className="text-sm text-gray-500 mt-2">Son güncelleme: 17 Aralık 2024</p>
                    </div>
                </section>

                {/* Kritik Uyarı */}
                <section className="px-4 mb-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-red-900/30 border-2 border-red-600/50 rounded-xl p-6">
                            <div className="flex items-start gap-4">
                                <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
                                <div>
                                    <h2 className="text-xl font-bold text-red-400 mb-3">
                                        ⚠️ ÖNEMLİ UYARI - MUTLAKA OKUYUN
                                    </h2>
                                    <div className="space-y-3 text-gray-200">
                                        <p>
                                            <strong>Bu platform yapay zeka tarafından desteklenmektedir.</strong> Oluşturulan dilekçeler ve
                                            sağlanan bilgiler <strong>HUKUKİ TAVSİYE NİTELİĞİ TAŞIMAZ.</strong>
                                        </p>
                                        <p>
                                            <strong>Platformda oluşturulan dilekçelerin kullanımından doğacak tüm sorumluluk
                                                KULLANICIYA AİTTİR.</strong>
                                        </p>
                                        <p>
                                            Hukuki işlemleriniz için mutlaka <strong>bir avukata danışmanızı</strong> şiddetle tavsiye ederiz.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Content */}
                <section className="py-8 px-4">
                    <div className="max-w-4xl mx-auto space-y-8">

                        {/* 1. Giriş */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-red-500" />
                                1. Giriş ve Kabul
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                İşbu Kullanım Koşulları ("Koşullar"), <strong>Hukuk Asistanı AI</strong> platformunu
                                ("Platform") kullanımınızı düzenlemektedir. Platformu kullanarak bu Koşulları
                                okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş olursunuz.
                            </p>
                            <p className="text-gray-300 leading-relaxed mt-4">
                                Bu Koşulları kabul etmiyorsanız, lütfen Platformu kullanmayınız.
                            </p>
                        </div>

                        {/* 2. Hizmet Tanımı */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Scale className="w-5 h-5 text-red-500" />
                                2. Hizmet Tanımı
                            </h2>
                            <p className="text-gray-300 leading-relaxed mb-4">
                                Platform, yapay zeka teknolojisi kullanarak aşağıdaki hizmetleri sunmaktadır:
                            </p>
                            <ul className="space-y-2 text-gray-300">
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Dilekçe taslağı oluşturma</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Belge analizi ve içerik çıkarma</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>İçtihat ve mevzuat araştırması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Hukuki sohbet asistanı</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Dilekçe şablonları</span>
                                </li>
                            </ul>
                        </div>

                        {/* 3. Sorumluluk Reddi */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-red-500" />
                                3. Sorumluluk Reddi Beyanı
                            </h2>

                            <div className="space-y-4">
                                <div className="bg-gray-900/50 rounded-lg p-4 border-l-4 border-red-500">
                                    <h3 className="text-white font-medium mb-2">3.1. Hukuki Tavsiye Değildir</h3>
                                    <p className="text-gray-300 text-sm">
                                        Platform tarafından oluşturulan dilekçeler, verilen bilgiler ve yapılan analizler
                                        <strong> hukuki tavsiye, mütalaa veya görüş niteliği taşımaz.</strong> Bu çıktılar,
                                        yalnızca genel bilgilendirme amaçlıdır ve avukat-müvekkil ilişkisi oluşturmaz.
                                    </p>
                                </div>

                                <div className="bg-gray-900/50 rounded-lg p-4 border-l-4 border-red-500">
                                    <h3 className="text-white font-medium mb-2">3.2. Yapay Zeka Sınırlılıkları</h3>
                                    <p className="text-gray-300 text-sm">
                                        Yapay zeka modelleri hata yapabilir, güncel olmayan bilgiler sunabilir veya
                                        bağlama uygun olmayan çıktılar üretebilir. Platform, <strong>AI çıktılarının
                                            doğruluğunu, eksiksizliğini veya güncelliğini garanti etmez.</strong>
                                    </p>
                                </div>

                                <div className="bg-gray-900/50 rounded-lg p-4 border-l-4 border-red-500">
                                    <h3 className="text-white font-medium mb-2">3.3. Kullanıcı Sorumluluğu</h3>
                                    <p className="text-gray-300 text-sm">
                                        Platform üzerinden oluşturulan dilekçelerin kullanımından, mahkemelere veya
                                        resmi kurumlara sunulmasından ve bunların sonuçlarından
                                        <strong> TÜM SORUMLULUK KULLANICIYA AİTTİR.</strong> Platform, bu kullanımdan
                                        doğabilecek hiçbir zarar, kayıp veya olumsuz sonuçtan sorumlu tutulamaz.
                                    </p>
                                </div>

                                <div className="bg-gray-900/50 rounded-lg p-4 border-l-4 border-yellow-500">
                                    <h3 className="text-white font-medium mb-2">3.4. Profesyonel Danışmanlık Tavsiyesi</h3>
                                    <p className="text-gray-300 text-sm">
                                        Hukuki işlemleriniz için <strong>mutlaka bir avukata danışmanızı</strong> şiddetle
                                        tavsiye ederiz. Platform, avukat danışmanlığının yerini tutmaz ve tutması
                                        amaçlanmamıştır.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 4. Kullanıcı Yükümlülükleri */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-red-500" />
                                4. Kullanıcı Yükümlülükleri
                            </h2>
                            <p className="text-gray-300 mb-4">Kullanıcı olarak aşağıdaki yükümlülükleri kabul edersiniz:</p>
                            <ul className="space-y-2 text-gray-300">
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Platformu yalnızca yasal amaçlarla kullanmak</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Doğru ve güncel bilgiler sağlamak</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Üçüncü kişilerin haklarını ihlal etmemek</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Platformun güvenliğini tehlikeye atmamak</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Oluşturulan dilekçeleri kullanmadan önce kontrol etmek ve gerekirse uzman görüşü almak</span>
                                </li>
                            </ul>
                        </div>

                        {/* 5. Yasaklı Kullanımlar */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Ban className="w-5 h-5 text-red-500" />
                                5. Yasaklı Kullanımlar
                            </h2>
                            <p className="text-gray-300 mb-4">Aşağıdaki kullanımlar kesinlikle yasaktır:</p>
                            <ul className="space-y-2 text-gray-300">
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Sahte veya yanıltıcı belgeler oluşturmak</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Dolandırıcılık veya suç amaçlı kullanım</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Platformun otomatik araçlarla kötüye kullanımı</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Başka kullanıcıların hesaplarına yetkisiz erişim</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <span>Zararlı yazılım veya kod yüklenmesi</span>
                                </li>
                            </ul>
                        </div>

                        {/* 6. Fikri Mülkiyet */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Edit className="w-5 h-5 text-red-500" />
                                6. Fikri Mülkiyet Hakları
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                Platform, tasarımı, logoları, yazılımı ve içerikleri dahil olmak üzere tüm fikri
                                mülkiyet hakları saklıdır. Kullanıcılar, Platform üzerinden oluşturdukları
                                dilekçelerin kişisel kullanım haklarına sahiptir ancak Platform'un kaynak kodunu,
                                tasarımını veya diğer unsurlarını kopyalayamaz, değiştiremez veya dağıtamaz.
                            </p>
                        </div>

                        {/* 7. Hizmet Değişiklikleri */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-red-500" />
                                7. Hizmet Değişiklikleri ve Fesih
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                Platform, önceden bildirimde bulunmaksızın hizmetlerini değiştirme, askıya alma
                                veya sonlandırma hakkını saklı tutar. Bu Koşulların ihlali durumunda kullanıcı
                                hesabı askıya alınabilir veya kalıcı olarak kapatılabilir.
                            </p>
                        </div>

                        {/* 8. Güncellemeler */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-red-500" />
                                8. Koşulların Güncellenmesi
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                İşbu Koşullar zaman zaman güncellenebilir. Önemli değişiklikler Platform
                                üzerinden veya e-posta yoluyla duyurulur. Değişikliklerden sonra Platformu
                                kullanmaya devam etmeniz, güncellenmiş Koşulları kabul ettiğiniz anlamına gelir.
                            </p>
                        </div>

                        {/* 9. Uygulanacak Hukuk */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Gavel className="w-5 h-5 text-red-500" />
                                9. Uygulanacak Hukuk ve Yetkili Mahkeme
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                İşbu Koşullar, <strong>Türkiye Cumhuriyeti kanunlarına</strong> tabi olup,
                                Koşullardan doğabilecek her türlü uyuşmazlıkta <strong>İstanbul Mahkemeleri
                                    ve İcra Daireleri</strong> yetkilidir.
                            </p>
                        </div>

                        {/* Son Not */}
                        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6 text-center">
                            <p className="text-blue-300">
                                Bu Koşulları kabul ederek Platformu kullandığınızda, tüm hükümleri okuduğunuzu
                                ve anladığınızı beyan etmiş olursunuz.
                            </p>
                            <p className="text-gray-400 text-sm mt-4">
                                Sorularınız için: <strong>info@hukukasistani.com</strong>
                            </p>
                        </div>

                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
