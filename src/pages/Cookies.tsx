import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { Cookie, Settings, BarChart3, Shield, Lock, HelpCircle } from 'lucide-react';

export default function Cookies() {
    const navigate = useNavigate();

    const cookieTypes = [
        {
            icon: <Lock className="w-6 h-6" />,
            title: 'Zorunlu Çerezler',
            description: 'Platform\'un temel işlevselliği için gerekli çerezlerdir. Oturum yönetimi, güvenlik ve kimlik doğrulama için kullanılır.',
            required: true,
            examples: ['Oturum tanımlayıcıları', 'Kimlik doğrulama çerezleri', 'Güvenlik çerezleri']
        },
        {
            icon: <Settings className="w-6 h-6" />,
            title: 'İşlevsellik Çerezleri',
            description: 'Tercihlerinizi hatırlamak ve size daha iyi bir deneyim sunmak için kullanılır.',
            required: false,
            examples: ['Dil tercihi', 'Tema ayarları', 'Son görüntülenen sayfalar']
        },
        {
            icon: <BarChart3 className="w-6 h-6" />,
            title: 'Analitik Çerezler',
            description: 'Platform kullanımını analiz etmek ve hizmetlerimizi iyileştirmek için kullanılır.',
            required: false,
            examples: ['Sayfa görüntüleme istatistikleri', 'Kullanıcı davranış analizi', 'Performans ölçümleri']
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col">
            <Header onShowLanding={() => navigate('/')} />

            <main className="flex-grow">
                {/* Hero */}
                <section className="py-16 px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full mb-6 shadow-xl">
                            <Cookie className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                            Çerez Politikası
                        </h1>
                        <p className="text-gray-400">
                            DilekAI Platformu Çerez Kullanımı Hakkında Bilgilendirme
                        </p>
                        <p className="text-sm text-gray-500 mt-2">Son güncelleme: 17 Aralık 2024</p>
                    </div>
                </section>

                {/* Content */}
                <section className="py-8 px-4">
                    <div className="max-w-4xl mx-auto space-y-8">

                        {/* Çerez Nedir */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <HelpCircle className="w-5 h-5 text-red-500" />
                                Çerez Nedir?
                            </h2>
                            <p className="text-gray-300 leading-relaxed">
                                Çerezler, web sitelerinin veya uygulamaların tarayıcınız aracılığıyla cihazınıza
                                yerleştirdiği küçük metin dosyalarıdır. Bu dosyalar, sizi tanımamıza, tercihlerinizi
                                hatırlamamıza ve size daha iyi bir deneyim sunmamıza yardımcı olur.
                            </p>
                        </div>

                        {/* Çerez Türleri */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                                <Cookie className="w-5 h-5 text-red-500" />
                                Kullandığımız Çerez Türleri
                            </h2>

                            <div className="space-y-6">
                                {cookieTypes.map((cookie, index) => (
                                    <div key={index} className="bg-gray-900/50 rounded-lg p-5 border border-gray-700/50">
                                        <div className="flex items-start gap-4">
                                            <div className="text-red-500 mt-1">{cookie.icon}</div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-white font-semibold">{cookie.title}</h3>
                                                    {cookie.required ? (
                                                        <span className="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded-full border border-red-600/30">
                                                            Zorunlu
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-gray-600/20 text-gray-400 text-xs rounded-full border border-gray-600/30">
                                                            İsteğe Bağlı
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-400 text-sm mb-3">{cookie.description}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {cookie.examples.map((example, i) => (
                                                        <span key={i} className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded">
                                                            {example}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Üçüncü Taraf Çerezleri */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-red-500" />
                                Üçüncü Taraf Çerezleri
                            </h2>
                            <p className="text-gray-300 leading-relaxed mb-4">
                                Platformumuz, hizmet kalitesini artırmak için aşağıdaki üçüncü taraf hizmetlerini
                                kullanabilir:
                            </p>
                            <ul className="space-y-3 text-gray-300">
                                <li className="flex items-start gap-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <div>
                                        <strong>Supabase:</strong> Kimlik doğrulama ve oturum yönetimi için
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2" />
                                    <div>
                                        <strong>Vercel:</strong> Platform barındırma ve performans izleme için
                                    </div>
                                </li>
                            </ul>
                        </div>

                        {/* Çerez Yönetimi */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Settings className="w-5 h-5 text-red-500" />
                                Çerez Tercihlerinizi Yönetme
                            </h2>
                            <p className="text-gray-300 leading-relaxed mb-4">
                                Çerez tercihlerinizi aşağıdaki yöntemlerle yönetebilirsiniz:
                            </p>

                            <div className="space-y-4">
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <h3 className="text-white font-medium mb-2">Tarayıcı Ayarları</h3>
                                    <p className="text-gray-400 text-sm">
                                        Tarayıcınızın ayarlar menüsünden çerezleri engelleyebilir veya silebilirsiniz.
                                        Ancak bu durumda Platform'un bazı özellikleri düzgün çalışmayabilir.
                                    </p>
                                </div>

                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <h3 className="text-white font-medium mb-2">Popüler Tarayıcılarda Çerez Ayarları</h3>
                                    <ul className="space-y-2 text-sm text-gray-400">
                                        <li>• <strong>Chrome:</strong> Ayarlar → Gizlilik ve güvenlik → Çerezler</li>
                                        <li>• <strong>Firefox:</strong> Seçenekler → Gizlilik ve Güvenlik → Çerezler</li>
                                        <li>• <strong>Safari:</strong> Tercihler → Gizlilik → Çerezler</li>
                                        <li>• <strong>Edge:</strong> Ayarlar → Gizlilik → Çerezler</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Çerez Süresi */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4">Çerez Saklama Süreleri</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Çerez Türü</th>
                                            <th className="text-left py-3 px-4 text-gray-400 font-medium">Saklama Süresi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-300">
                                        <tr className="border-b border-gray-700/50">
                                            <td className="py-3 px-4">Oturum Çerezleri</td>
                                            <td className="py-3 px-4">Tarayıcı kapanana kadar</td>
                                        </tr>
                                        <tr className="border-b border-gray-700/50">
                                            <td className="py-3 px-4">Kimlik Doğrulama</td>
                                            <td className="py-3 px-4">7 gün</td>
                                        </tr>
                                        <tr className="border-b border-gray-700/50">
                                            <td className="py-3 px-4">Tercih Çerezleri</td>
                                            <td className="py-3 px-4">1 yıl</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4">Analitik Çerezler</td>
                                            <td className="py-3 px-4">2 yıl</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* İletişim */}
                        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6 text-center">
                            <p className="text-blue-300">
                                Çerez politikamız hakkında sorularınız için bizimle iletişime geçebilirsiniz.
                            </p>
                            <p className="text-gray-400 text-sm mt-2">
                                E-posta: <strong>info@dilekai.com</strong>
                            </p>
                        </div>

                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
