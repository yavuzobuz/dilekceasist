import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Mail, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/sifre-sifirla`,
      });

      if (error) throw error;

      setIsSent(true);
      toast.success('Sifre sifirlama baglantisi gonderildi.');
    } catch (error: any) {
      console.error('Password reset request error:', error);
      toast.error(error?.message || 'Sifirlama baglantisi gonderilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-br from-red-600 to-red-700 p-3 rounded-xl shadow-lg">
              <Scale className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Sifremi Unuttum</h1>
          <p className="text-gray-400">E-posta adresinize sifre yenileme baglantisi gonderelim.</p>
        </div>

        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                E-posta Adresi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="ornek@email.com"
                />
              </div>
            </div>

            {isSent && (
              <div className="rounded-lg border border-green-600/40 bg-green-900/20 px-4 py-3 text-sm text-green-200">
                Sifirlama baglantisi gonderildi. E-posta kutunuzu kontrol edin.
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Gonderiliyor...' : (
                <>
                  Sifirlama Linki Gonder
                  <ArrowRight className="ml-2 w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-red-400 hover:text-red-300 transition-colors">
              Giris sayfasina don
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

