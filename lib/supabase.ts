import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL ve Anon Key tanımlanmalıdır!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          office_logo_url: string | null;
          corporate_header: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          office_logo_url?: string | null;
          corporate_header?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          office_logo_url?: string | null;
          corporate_header?: string | null;
          updated_at?: string;
        };
      };
      petitions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          petition_type: string;
          content: string;
          status: 'draft' | 'completed';
          metadata: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          petition_type: string;
          content: string;
          status?: 'draft' | 'completed';
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          petition_type?: string;
          content?: string;
          status?: 'draft' | 'completed';
          metadata?: any;
          updated_at?: string;
        };
      };
    };
  };
};

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Petition = Database['public']['Tables']['petitions']['Row'];
