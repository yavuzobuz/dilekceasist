import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, selectedPlan?: string) => Promise<void>;
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
        // Profil yoksa oluÅŸtur
        if (error.code === 'PGRST116') {
          if (import.meta.env.DEV) {
            console.warn('Profil bulunamadÄ±, yeni profil oluÅŸturuluyor...');
          }
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
      toast.error('Profil yÃ¼klenirken hata oluÅŸtu: ' + (error.message || 'Bilinmeyen hata'));
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, selectedPlan = 'trial') => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            selected_plan: selectedPlan,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        toast.success('KayÄ±t baÅŸarÄ±lÄ±! LÃ¼tfen email adresinizi doÄŸrulayÄ±n.');
      }
    } catch (error: any) {
      console.error('Error signing up:', error);
      toast.error(error.message || 'KayÄ±t olurken bir hata oluÅŸtu');
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
        toast.success('GiriÅŸ baÅŸarÄ±lÄ±!');
      }
    } catch (error: any) {
      console.error('Error signing in:', error);
      
      // FarklÄ± hata tipleri iÃ§in Ã¶zel mesajlar
      if (error.message?.includes('Email not confirmed')) {
        toast.error('âŒ Email adresiniz doÄŸrulanmamÄ±ÅŸ! LÃ¼tfen email kutunuzu kontrol edin ve doÄŸrulama linkine tÄ±klayÄ±n.');
      } else if (error.message?.includes('Invalid login credentials')) {
        toast.error('âŒ Email veya ÅŸifre hatalÄ±! LÃ¼tfen tekrar deneyin.');
      } else if (error.message?.includes('Email not found')) {
        toast.error('âŒ Bu email adresi ile kayÄ±tlÄ± kullanÄ±cÄ± bulunamadÄ±.');
      } else {
        toast.error(error.message || 'GiriÅŸ yapÄ±lÄ±rken bir hata oluÅŸtu');
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
      toast.success('Ã‡Ä±kÄ±ÅŸ yapÄ±ldÄ±');
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast.error(error.message || 'Ã‡Ä±kÄ±ÅŸ yapÄ±lÄ±rken bir hata oluÅŸtu');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('KullanÄ±cÄ± oturum aÃ§mamÄ±ÅŸ');

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      toast.success('Profil gÃ¼ncellendi');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Profil gÃ¼ncellenirken bir hata oluÅŸtu');
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

      toast.success('âœ… DoÄŸrulama emaili tekrar gÃ¶nderildi! LÃ¼tfen email kutunuzu kontrol edin.');
    } catch (error: any) {
      console.error('Error resending confirmation email:', error);
      toast.error(error.message || 'Email gÃ¶nderilirken bir hata oluÅŸtu');
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


