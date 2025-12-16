-- =====================================================
-- ADD VEKALET PDF SUPPORT TO CLIENTS
-- Migration: Add vekalet_pdf_url column and storage policies
-- =====================================================

-- Add vekalet_pdf_url column to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS vekalet_pdf_url TEXT;

-- Add comment
COMMENT ON COLUMN public.clients.vekalet_pdf_url IS 'URL of the uploaded power of attorney (vekaletname) PDF';

-- =====================================================
-- STORAGE BUCKET SETUP (Run in Supabase Dashboard)
-- =====================================================
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create new bucket named: client-documents
-- 3. Set bucket as PRIVATE (not public)
-- =====================================================

-- Storage policy to allow authenticated users to upload their own documents
CREATE POLICY "Users can upload their own client documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'client-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy to allow users to read their own documents
CREATE POLICY "Users can view their own client documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'client-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy to allow users to update their own documents
CREATE POLICY "Users can update their own client documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'client-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy to allow users to delete their own documents
CREATE POLICY "Users can delete their own client documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'client-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
