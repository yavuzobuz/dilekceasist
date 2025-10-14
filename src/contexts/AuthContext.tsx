import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (signed in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Profil yoksa oluştur
        if (error.code === 'PGRST116') {
          console.log('Profil bulunamadı, yeni profil oluşturuluyor...');
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            const { data: newProfile, error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                email: user.email || '',
                full_name: user.user_metadata?.full_name || null,
                avatar_url: user.user_metadata?.avatar_url || null,
              })
              .select()
              .single();

            if (insertError) throw insertError;
            setProfile(newProfile);
            return;
          }
        }
        throw error;
      }
      setProfile(data);
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast.error('Profil yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        toast.success('Kayıt başarılı! Lütfen email adresinizi doğrulayın.');
      }
    } catch (error: any) {
      console.error('Error signing up:', error);
      toast.error(error.message || 'Kayıt olurken bir hata oluştu');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        toast.success('Giriş başarılı!');
      }
    } catch (error: any) {
      console.error('Error signing in:', error);
      
      // Farklı hata tipleri için özel mesajlar
      if (error.message?.includes('Email not confirmed')) {
        toast.error('❌ Email adresiniz doğrulanmamış! Lütfen email kutunuzu kontrol edin ve doğrulama linkine tıklayın.');
      } else if (error.message?.includes('Invalid login credentials')) {
        toast.error('❌ Email veya şifre hatalı! Lütfen tekrar deneyin.');
      } else if (error.message?.includes('Email not found')) {
        toast.error('❌ Bu email adresi ile kayıtlı kullanıcı bulunamadı.');
      } else {
        toast.error(error.message || 'Giriş yapılırken bir hata oluştu');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Çıkış yapıldı');
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast.error(error.message || 'Çıkış yapılırken bir hata oluştu');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('Kullanıcı oturum açmamış');

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      toast.success('Profil güncellendi');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Profil güncellenirken bir hata oluştu');
      throw error;
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;

      toast.success('✅ Doğrulama emaili tekrar gönderildi! Lütfen email kutunuzu kontrol edin.');
    } catch (error: any) {
      console.error('Error resending confirmation email:', error);
      toast.error(error.message || 'Email gönderilirken bir hata oluştu');
      throw error;
    }
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    resendConfirmationEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
