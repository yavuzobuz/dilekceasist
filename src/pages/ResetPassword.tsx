import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Scale, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const ResetPassword: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const checkRecoverySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setIsRecoveryReady(Boolean(session));
      setIsCheckingSession(false);
    };

    checkRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setIsRecoveryReady(Boolean(session));
        setIsCheckingSession(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isRecoveryReady) {
      toast.error('Sifirlama oturumu bulunamadi. Linki e-postadan tekrar acin.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Şifreler eşleşmiyor.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      await supabase.auth.signOut();
      toast.success('Şifreniz güncellendi. Lütfen tekrar giriş yapın.');
      navigate('/login');
    } catch (error: any) {
      console.error('Password update error:', error);
      toast.error(error?.message || 'Şifre güncellenemedi.');
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
          <h1 className="text-3xl font-bold text-white mb-2">Yeni Şifre Belirle</h1>
          <p className="text-gray-400">Hesabınız için yeni şifrenizi girin.</p>
        </div>

        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
          {isCheckingSession ? (
            <p className="text-gray-300 text-center">Sifirlama oturumu kontrol ediliyor...</p>
          ) : (
            <>
              {!isRecoveryReady && (
                <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200 mb-5">
                  Gecerli sifirlama linki bulunamadi. E-postadaki linki tekrar acin.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-2">
                    Yeni Şifre
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-500" />
                    </div>
                    <input
                      id="new-password"
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                      placeholder="En az 6 karakter"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                    Yeni Şifre Tekrar
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-500" />
                    </div>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                      placeholder="Şifrenizi tekrar girin"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !isRecoveryReady}
                  className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Guncelleniyor...' : (
                    <>
                      Şifreyi Güncelle
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <Link to="/sifremi-unuttum" className="text-red-400 hover:text-red-300 transition-colors">
              Tekrar sıfırlama linki iste
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

