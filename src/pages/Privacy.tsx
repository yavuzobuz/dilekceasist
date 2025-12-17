import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { Shield, Database, Eye, Lock, Mail, FileText, Users, Server, Clock, AlertTriangle } from 'lucide-react';

export default function Privacy() {
    const navigate = useNavigate();

    const dataCategories = [
        { icon: <Users className="w-5 h-5" />, title: 'Kimlik Verileri', items: ['Ad, soyad', 'T.C. Kimlik Numarası (dilekçelerde kullanılması halinde)'] },
        { icon: <Mail className="w-5 h-5" />, title: 'İletişim Verileri', items: ['E-posta adresi', 'Telefon numarası (opsiyonel)'] },
        { icon: <FileText className="w-5 h-5" />, title: 'Yapay Zeka İşlem Verileri', items: ['Yüklenen belgeler (PDF, Word, resim)', 'Sohbet mesajları (prompt metinleri)', 'Oluşturulan dilekçeler (model çıktıları)', 'Arama sorguları ve anahtar kelimeler'] },
        { icon: <Server className="w-5 h-5" />, title: 'Teknik Veriler', items: ['IP adresi', 'Tarayıcı ve cihaz bilgileri', 'Oturum tanımlayıcıları', 'Çerez verileri'] },
    ];

    const userRights = [
        'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
        'Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme',
        'Kişisel verilerin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme',
        'Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme',
        'Kişisel verilerin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme',
        'KVKK\'nın 7. maddesi çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme',
        'İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
        'Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme',
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col">
            <Header onShowLanding={() => navigate('/')} />

            <main className="flex-grow">
                {/* Hero */}
                <section className="py-16 px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            Kişisel Verilerin Korunması Hakkında Aydınlatma Metni
                        </h1>
                        <p className="text-gray-400">
                            6698 Sayılı Kişisel Verilerin Korunması Kanunu (KVKK) Kapsamında
                        </p>
                        <p className="text-sm text-gray-500 mt-2">Son güncelleme: 17 Aralık 2024</p>
                    </div>
                </section>

                {/* Content */}
                <section className="py-8 px-4">
                    <div className="max-w-4xl mx-auto space-y-12">

                        {/* Giriş */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Eye className="w-5 h-5 text-red-500" />
                                1. Giriş
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                İşbu Aydınlatma Metni, <strong>DilekAI</strong> platformu ("Platform") olarak,
                                6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verilerinizin
                                işlenmesi hakkında sizleri bilgilendirmek amacıyla hazırlanmıştır.
                            </p>
                            <p className="text-gray-300 leading-relaxed mt-4">
                                Platformumuz, kişisel verilerinizin korunmasına büyük önem vermekte, verilerinizi
                                Anayasa ve uluslararası sözleşmeler ile KVKK başta olmak üzere ilgili mevzuata uygun
                                olarak işlemekte ve muhafaza etmektedir.
                            </p>
                        </div>

                        {/* Veri Sorumlusu */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Database className="w-5 h-5 text-red-500" />
                                2. Veri Sorumlusunun Kimliği
                            </h2>
                            <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                                <p className="text-gray-300"><strong>Veri Sorumlusu:</strong> DilekAI</p>
                                <p className="text-gray-300"><strong>E-posta:</strong> info@dilekai.com</p>
                                <p className="text-gray-300"><strong>Adres:</strong> İstanbul, Türkiye</p>
                            </div>
                        </div>

                        {/* İşlenen Veri Kategorileri */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-red-500" />
                                3. İşlenen Kişisel Veri Kategorileri
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {dataCategories.map((category, index) => (
                                    <div key={index} className="bg-gray-900/50 rounded-lg p-4">
                                        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                                            <span className="text-red-500">{category.icon}</span>
                                            {category.title}
                                        </h3>
                                        <ul className="space-y-1">
                                            {category.items.map((item, i) => (
                                                <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                                <p className="text-yellow-300 text-sm flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>
                                        <strong>Önemli:</strong> Platforma yüklediğiniz belgelerde yer alan kişisel veriler
                                        (örn. T.C. Kimlik No, adres, telefon) yalnızca dilekçe oluşturma amacıyla işlenir
                                        ve üçüncü şahıslarla paylaşılmaz.
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* İşleme Amaçları */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Eye className="w-5 h-5 text-red-500" />
                                4. Kişisel Verilerin İşlenme Amaçları
                            </h2>
                            <ul className="space-y-3 text-gray-300">
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                                    <span>Üyelik hesabınızın oluşturulması ve yönetilmesi</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                                    <span>Yapay zeka destekli dilekçe oluşturma hizmetinin sunulması</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                                    <span>Yüklenen belgelerin analiz edilmesi ve içerik çıkarılması</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                                    <span>İçtihat ve mevzuat araştırması yapılması</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">5</span>
                                    <span>Platform güvenliğinin sağlanması ve hata izleme</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">6</span>
                                    <span>Yasal yükümlülüklerin yerine getirilmesi</span>
                                </li>
                            </ul>
                        </div>

                        {/* Hukuki Sebepler */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-red-500" />
                                5. Kişisel Verilerin İşlenmesinin Hukuki Sebepleri
                            </h2>
                            <p className="text-gray-300 mb-4">
                                Kişisel verileriniz, KVKK'nın 5. ve 6. maddelerinde belirtilen şartlar kapsamında aşağıdaki
                                hukuki sebeplere dayanarak işlenmektedir:
                            </p>
                            <ul className="space-y-2 text-gray-300">
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                    <span><strong>Sözleşmenin ifası:</strong> Üyelik sözleşmesi kapsamında hizmet sunulması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                    <span><strong>Hukuki yükümlülük:</strong> 5651 sayılı Kanun ve ilgili mevzuat gereği</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                    <span><strong>Meşru menfaat:</strong> Platform güvenliği ve hizmet kalitesinin sağlanması</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                    <span><strong>Açık rıza:</strong> Pazarlama ve analitik çerezler için</span>
                                </li>
                            </ul>
                        </div>

                        {/* Veri Aktarımı */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Server className="w-5 h-5 text-red-500" />
                                6. Kişisel Verilerin Aktarılması
                            </h2>
                            <p className="text-gray-300 mb-4">
                                Kişisel verileriniz, yukarıda belirtilen amaçlar doğrultusunda aşağıdaki alıcı gruplarına
                                aktarılabilmektedir:
                            </p>
                            <div className="space-y-3">
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <h4 className="text-white font-medium mb-2">Yapay Zeka Hizmet Sağlayıcıları</h4>
                                    <p className="text-gray-400 text-sm">
                                        Google AI (Gemini API) - Dilekçe oluşturma, belge analizi ve sohbet fonksiyonları için.
                                        Bu aktarım yurt dışı transferi içerebilir.
                                    </p>
                                </div>
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <h4 className="text-white font-medium mb-2">Veritabanı Hizmet Sağlayıcıları</h4>
                                    <p className="text-gray-400 text-sm">
                                        Supabase - Hesap bilgileri ve dilekçelerinizin güvenli saklanması için.
                                    </p>
                                </div>
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <h4 className="text-white font-medium mb-2">Yetkili Kamu Kurum ve Kuruluşları</h4>
                                    <p className="text-gray-400 text-sm">
                                        Kanunlardan kaynaklanan yükümlülükler gereği, talep üzerine yetkili mercilere.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* İlgili Kişi Hakları */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-red-500" />
                                7. İlgili Kişinin Hakları (KVKK Madde 11)
                            </h2>
                            <p className="text-gray-300 mb-4">
                                KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:
                            </p>
                            <ul className="space-y-2">
                                {userRights.map((right, index) => (
                                    <li key={index} className="flex items-start gap-2 text-gray-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                        <span>{right}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Başvuru */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-red-500" />
                                8. Başvuru Yöntemi
                            </h2>
                            <p className="text-gray-300 mb-4">
                                Yukarıda belirtilen haklarınıza ilişkin taleplerinizi aşağıdaki yöntemlerle iletebilirsiniz:
                            </p>
                            <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                                <p className="text-gray-300"><strong>E-posta:</strong> kvkk@dilekai.com</p>
                                <p className="text-gray-400 text-sm mt-4">
                                    Başvurularınız, talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde
                                    ücretsiz olarak sonuçlandırılacaktır.
                                </p>
                            </div>
                        </div>

                        {/* Saklama Süresi */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-red-500" />
                                9. Veri Saklama Süresi
                            </h2>
                            <p className="text-gray-300">
                                Kişisel verileriniz, ilgili mevzuatta öngörülen veya işleme amaçlarımız için gerekli olan
                                süre kadar muhafaza edilmektedir. Hesabınızı silmeniz halinde, kanunen saklama zorunluluğu
                                bulunan haller saklı kalmak üzere, verileriniz silinir veya anonim hale getirilir.
                            </p>
                        </div>

                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
