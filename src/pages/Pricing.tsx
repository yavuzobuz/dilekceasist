import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkoutPlanLoading, setCheckoutPlanLoading] = React.useState<'pro' | 'team' | null>(null);

  const handleStartTrial = () => {
    localStorage.setItem('selected_plan', 'trial');
    if (user) {
      navigate('/alt-app');
      return;
    }
    navigate('/register?plan=trial');
  };

  const handleChoosePaid = async (plan: 'pro' | 'team') => {
    localStorage.setItem('selected_plan', plan);

    if (!user) {
      navigate('/login?redirect=' + encodeURIComponent('/fiyatlandirma'));
      return;
    }

    try {
      setCheckoutPlanLoading(plan);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate('/login?redirect=' + encodeURIComponent('/fiyatlandirma'));
        return;
      }

      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = [payload?.error, payload?.details]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(': ');
        throw new Error(message || `Odeme oturumu baslatilamadi (HTTP ${response.status}).`);
      }

      if (!payload?.url || typeof payload.url !== 'string') {
        throw new Error('Stripe odeme adresi alinamadi.');
      }

      window.location.assign(payload.url);
    } catch (error: any) {
      console.error('Stripe checkout start error:', error);
      toast.error(error?.message || 'Odeme sayfasi acilamadi.');
    } finally {
      setCheckoutPlanLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <Header onShowLanding={() => navigate('/')} />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <section className="text-center max-w-4xl mx-auto mb-14">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Fiyatlandirma ve Kullanim Politikasi
          </h1>
          <p className="text-lg text-gray-400">
            Ucretsiz trial ile hemen baslayin. Uretim hacmi arttikca Pro veya Team plana gecin.
          </p>
        </section>

        <section className="grid lg:grid-cols-3 gap-6 mb-12">
          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-gray-700 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <Sparkles className="w-5 h-5" />
              <span className="font-semibold">Ucretsiz Deneme</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">0 TL</h2>
            <p className="text-gray-400 mb-6">14 gun boyunca dene</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Gunluk 10 belge uretim limiti</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Dilekce + sozlesme + ihtarname dahil</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Chat icinden belge uretimi de limite dahildir</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> UDF, DOCX, PDF ve TXT cikti</li>
            </ul>
            <button
              onClick={handleStartTrial}
              className="mt-auto px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold transition-colors"
            >
              Ucretsiz Dene
            </button>
          </article>

          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-red-500/40 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-3 right-3 text-xs bg-red-600 text-white px-2 py-1 rounded-full">
              Onerilen
            </div>
            <div className="flex items-center gap-2 mb-4 text-red-300">
              <CreditCard className="w-5 h-5" />
              <span className="font-semibold">Pro</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">1490 TL</h2>
            <p className="text-gray-400 mb-6">Aylik / kullanici</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Trial limiti kalkar</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Yuksek uretim limiti ve oncelikli islem</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Seri dilekce akislarinda tam kullanim</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Standart destek</li>
            </ul>
            <button
              onClick={() => handleChoosePaid('pro')}
              disabled={checkoutPlanLoading !== null}
              className="mt-auto px-4 py-3 rounded-xl bg-white text-red-700 hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-500 font-semibold transition-colors"
            >
              {checkoutPlanLoading === 'pro' ? 'Yonlendiriliyor...' : 'Pro Plan Sec'}
            </button>
          </article>

          <article className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-gray-700 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <ShieldCheck className="w-5 h-5" />
              <span className="font-semibold">Team</span>
            </div>
            <h2 className="text-3xl font-bold mb-1">3990 TL</h2>
            <p className="text-gray-400 mb-6">Aylik / ekip baslangic</p>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Coklu kullanici ve ekip yonetimi</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Kurumsal onboarding</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Ozel limit ve SLA secenekleri</li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-green-400" /> Oncelikli destek</li>
            </ul>
            <button
              onClick={() => handleChoosePaid('team')}
              disabled={checkoutPlanLoading !== null}
              className="mt-auto px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700 disabled:text-gray-500 font-semibold transition-colors"
            >
              {checkoutPlanLoading === 'team' ? 'Yonlendiriliyor...' : 'Team Plan Sec'}
            </button>
          </article>
        </section>

        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-2xl font-bold mb-4">Politika Ozeti</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>Trial suresi: 14 takvim gunu (ilk trial kullanimindan itibaren).</li>
            <li>Trial gunluk limit: 10 belge uretimi.</li>
            <li>Belge uretimi kapsaminda: dilekce, sozlesme ve ihtarname bulunur.</li>
            <li>Chat icinde belge olusturma denemeleri de gunluk limite dahil edilir.</li>
            <li>Limit asiminda sistem yeni belge uretimine izin vermez, bir sonraki gunde limit yenilenir.</li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
