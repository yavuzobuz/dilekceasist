-- =====================================================
-- Hukuk Asistanı - AI Dilekçe Oluşturucu
-- Supabase Database Schema
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES TABLE
-- Kullanıcı profil bilgilerini saklar
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
-- Kullanıcılar sadece kendi profillerini görebilir
CREATE POLICY "Users can view their own profile" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.uid() = id);

-- Kullanıcılar sadece kendi profillerini güncelleyebilir
CREATE POLICY "Users can update their own profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = id);

-- Yeni kullanıcılar için profil oluşturma
CREATE POLICY "Users can insert their own profile" 
    ON public.profiles 
    FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- =====================================================
-- PETITIONS TABLE
-- Oluşturulan dilekçeleri saklar
-- =====================================================

CREATE TABLE IF NOT EXISTS public.petitions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    petition_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT CHECK (status IN ('draft', 'completed')) DEFAULT 'draft',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.petitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for petitions
-- Kullanıcılar sadece kendi dilekçelerini görebilir
CREATE POLICY "Users can view their own petitions" 
    ON public.petitions 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Kullanıcılar yeni dilekçe oluşturabilir
CREATE POLICY "Users can create their own petitions" 
    ON public.petitions 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Kullanıcılar kendi dilekçelerini güncelleyebilir
CREATE POLICY "Users can update their own petitions" 
    ON public.petitions 
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- Kullanıcılar kendi dilekçelerini silebilir
CREATE POLICY "Users can delete their own petitions" 
    ON public.petitions 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- =====================================================
-- INDEXES
-- Performans iyileştirmeleri için indexler
-- =====================================================

-- Petitions tablosu için user_id indexi
CREATE INDEX IF NOT EXISTS petitions_user_id_idx ON public.petitions(user_id);

-- Petitions tablosu için created_at indexi (sıralama için)
CREATE INDEX IF NOT EXISTS petitions_created_at_idx ON public.petitions(created_at DESC);

-- Petitions tablosu için status indexi
CREATE INDEX IF NOT EXISTS petitions_status_idx ON public.petitions(status);

-- =====================================================
-- TRIGGERS
-- Otomatik updated_at güncellemeleri için
-- =====================================================

-- Updated_at otomatik güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles tablosu için trigger
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Petitions tablosu için trigger
DROP TRIGGER IF EXISTS petitions_updated_at ON public.petitions;
CREATE TRIGGER petitions_updated_at
    BEFORE UPDATE ON public.petitions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- AUTOMATIC PROFILE CREATION
-- Yeni kullanıcı kaydolduğunda otomatik profil oluştur
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auth.users tablosuna trigger ekle
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- GRANTS
-- Public schema izinleri
-- =====================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- =====================================================
-- COMMENTS
-- Tablo ve sütun açıklamaları
-- =====================================================

COMMENT ON TABLE public.profiles IS 'Kullanıcı profil bilgileri';
COMMENT ON COLUMN public.profiles.id IS 'Kullanıcı UUID (auth.users tablosuna referans)';
COMMENT ON COLUMN public.profiles.email IS 'Kullanıcı email adresi';
COMMENT ON COLUMN public.profiles.full_name IS 'Kullanıcının tam adı';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Profil fotoğrafı URL';

COMMENT ON TABLE public.petitions IS 'Oluşturulan dilekçeler';
COMMENT ON COLUMN public.petitions.id IS 'Dilekçe UUID';
COMMENT ON COLUMN public.petitions.user_id IS 'Dilekçeyi oluşturan kullanıcı';
COMMENT ON COLUMN public.petitions.title IS 'Dilekçe başlığı';
COMMENT ON COLUMN public.petitions.petition_type IS 'Dilekçe türü (Dava, Cevap, İtiraz, vb.)';
COMMENT ON COLUMN public.petitions.content IS 'Dilekçe içeriği (tam metin)';
COMMENT ON COLUMN public.petitions.status IS 'Dilekçe durumu: draft veya completed';
COMMENT ON COLUMN public.petitions.metadata IS 'Dilekçe oluşturulurken kullanılan tüm bağlam bilgileri (JSON):
- chatHistory: Sohbet geçmişi
- caseDetails: Dava künyesi bilgileri
- parties: Taraflar
- searchKeywords: Arama anahtar kelimeleri
- docContent: Ek metin içeriği
- specifics: Özel talimatlar
- userRole: Kullanıcı rolü
- analysisData: Belge analiz sonuçları (summary, potentialParties, caseDetails, lawyerInfo, contactInfo)
- webSearchResult: Web arama sonuçları (summary, sources)
- lawyerInfo: Vekil bilgileri (name, bar, barNumber, address, phone, email)
- contactInfo: İletişim bilgileri array';
