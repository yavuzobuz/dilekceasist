-- =====================================================
-- FINAL COMPLETE SETUP FOR PUBLIC PETITIONS
-- Run this ONCE in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. FIX FOREIGN KEY RELATIONSHIP
-- =====================================================

-- Drop existing foreign key (if it points to wrong table)
ALTER TABLE public.public_petitions 
  DROP CONSTRAINT IF EXISTS public_petitions_user_id_fkey;

-- Add correct foreign key to profiles.id
ALTER TABLE public.public_petitions
  ADD CONSTRAINT public_petitions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- =====================================================
-- 2. ADD PROFILES PUBLIC ACCESS POLICY
-- =====================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Anyone can view profiles of public petition authors" ON public.profiles;

-- Create policy to allow public access to profiles
CREATE POLICY "Anyone can view profiles of public petition authors"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM public.public_petitions 
      WHERE public.public_petitions.user_id = profiles.id 
        AND public.public_petitions.status = 'active'
    )
  );

-- =====================================================
-- 3. CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_petition_views(petition_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.public_petitions
  SET view_count = view_count + 1
  WHERE id = petition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_petition_downloads(petition_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.public_petitions
  SET download_count = download_count + 1
  WHERE id = petition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_petition_views(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_petition_downloads(UUID) TO anon, authenticated;

-- =====================================================
-- 4. VERIFICATION QUERIES
-- =====================================================

-- Check foreign key
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'public_petitions'
  AND kcu.column_name = 'user_id';

-- Check profiles policy
SELECT 
  tablename,
  policyname
FROM pg_policies
WHERE tablename = 'profiles'
  AND policyname = 'Anyone can view profiles of public petition authors';

-- Check functions
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('increment_petition_views', 'increment_petition_downloads');

-- =====================================================
-- ✅ SETUP COMPLETE!
-- =====================================================
-- Expected results:
-- 1. Foreign key: public_petitions.user_id → profiles.id
-- 2. Policy: "Anyone can view profiles of public petition authors"
-- 3. Functions: increment_petition_views, increment_petition_downloads
-- =====================================================
