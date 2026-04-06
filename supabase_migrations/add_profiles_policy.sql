-- =====================================================
-- ADD PROFILES PUBLIC ACCESS POLICY
-- Allows viewing profile names for public petition authors
-- =====================================================

-- Drop existing policy if it exists (to avoid duplicate error)
DROP POLICY IF EXISTS "Anyone can view profiles of public petition authors" ON public.profiles;

-- Create policy to allow public access to profiles of users who shared petitions
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

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'profiles'
  AND policyname = 'Anyone can view profiles of public petition authors';

-- =====================================================
-- Expected result:
-- You should see one row with the policy details
-- =====================================================
