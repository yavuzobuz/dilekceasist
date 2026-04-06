-- =====================================================
-- ADD OFFICE BRANDING TO PROFILES
-- Migration: Add office_logo_url and corporate_header columns
-- =====================================================

-- Add office_logo_url column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS office_logo_url TEXT;

-- Add corporate_header column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS corporate_header TEXT;

-- Add comments
COMMENT ON COLUMN public.profiles.office_logo_url IS 'URL of the uploaded office/firm logo';
COMMENT ON COLUMN public.profiles.corporate_header IS 'Corporate header text to display on petitions';

-- =====================================================
-- STORAGE BUCKET POLICIES (Run in Supabase Dashboard SQL Editor)
-- =====================================================

-- Note: The 'office-logos' bucket must be created first (Public: true)

-- Storage policy to allow authenticated users to upload their own logos
-- Using insert for new files
CREATE POLICY "Users can upload their own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'office-logos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy to allow public read access
CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'office-logos');

-- Storage policy to allow users to update their own logos
CREATE POLICY "Users can update their own logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'office-logos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy to allow users to delete their own logos
CREATE POLICY "Users can delete their own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'office-logos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
