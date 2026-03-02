import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { useAuth } from '../contexts/AuthContext';

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleStartTrial = () => {
    localStorage.setItem('selected_plan', 'trial');
    if (user) {
      navigate('/alt-app');
      return;
    }
    navigate('/register?plan=trial');
  };

  const handleChoosePaid = (plan: 'pro' | 'team') => {
    localStorage.setItem('selected_plan', plan);
    navigate('/register?plan=' + plan);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <Header onShowLanding={() => navigate('/')} />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <section className="text-center max-w-4xl mx-auto mb-14">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Fiyatlandırma ve Kullanım Politikası
          </h1>
          <p className="text-lg text-gray-400">
            Ücretsiz trial ile hemen başlayın. Üretim hacmi arttıkça Pro veya Team plana geçin.
          </p>
        </section>

        <section className="grid lg:grid-cols-3 gap-6 mb-12">
          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-gray-700 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <Sparkles className="w-5 h-5" />
              <span className="font-semibold">Ücretsiz Deneme</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">0 TL</h2>
            <p className="text-gray-400 mb-6">14 gün boyunca dene</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Günlük 10 belge üretim limiti</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Dilekçe + sözleşme + ihtarname dahil</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Chat içinden belge üretimi de limite dahildir</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> UDF, DOCX, PDF ve TXT çıktı</li>
            </ul>
            <button
              onClick={handleStartTrial}
              className="mt-auto px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold transition-colors"
            >
              Ücretsiz Dene
            </button>
          </article>

          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-red-500/40 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-3 right-3 text-xs bg-red-600 text-white px-2 py-1 rounded-full">
              Önerilen
            </div>
            <div className="flex items-center gap-2 mb-4 text-red-300">
              <CreditCard className="w-5 h-5" />
              <span className="font-semibold">Pro</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">1490 TL</h2>
            <p className="text-gray-400 mb-6">Aylık / kullanıcı</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Trial limiti kalkar</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Yüksek üretim limiti ve öncelikli işlem</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Seri dilekçe akışlarında tam kullanım</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Standart destek</li>
            </ul>
            <button
              onClick={() => handleChoosePaid('pro')}
              className="mt-auto px-4 py-3 rounded-xl bg-white text-red-700 hover:bg-gray-100 font-semibold transition-colors"
            >
              Pro Plan Seç
            </button>
          </article>

          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-gray-700 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <ShieldCheck className="w-5 h-5" />
              <span className="font-semibold">Team</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">3990 TL</h2>
            <p className="text-gray-400 mb-6">Aylık / ekip başlangıç</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Çoklu kullanıcı ve ekip yönetimi</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Kurumsal onboarding</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Özel limit ve SLA seçenekleri</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Öncelikli destek</li>
            </ul>
            <button
              onClick={() => handleChoosePaid('team')}
              className="mt-auto px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold transition-colors"
            >
              Team Plan Seç
            </button>
          </article>
        </section>

        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-2xl font-bold mb-4">Politika Özeti</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>Trial süresi: 14 takvim günü (ilk trial kullanımından itibaren).</li>
            <li>Trial günlük limit: 10 belge üretimi.</li>
            <li>Belge üretimi kapsamında: dilekçe, sözleşme ve ihtarname bulunur.</li>
            <li>Chat içinde belge oluşturma denemeleri de günlük limite dahil edilir.</li>
            <li>Limit aşımında sistem yeni belge üretimine izin vermez, bir sonraki günde limit yenilenir.</li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
