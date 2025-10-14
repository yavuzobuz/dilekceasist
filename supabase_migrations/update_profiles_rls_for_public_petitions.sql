-- Update profiles RLS policies to allow public read access for shared petition authors
-- This is needed so that users can see the author's name when viewing public petitions

-- Create a new policy to allow anyone to view profile information of users who have shared petitions
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

-- Note: This policy allows viewing only profiles of users who have at least one active public petition
-- Users can still view their own profile due to the existing "Users can view their own profile" policy
