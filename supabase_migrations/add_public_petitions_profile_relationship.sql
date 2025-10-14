-- Add foreign key relationship between public_petitions and profiles table
-- Note: profiles table has 'id' as primary key (not user_id)
-- This links public_petitions.user_id to profiles.id

-- Drop existing foreign key to auth.users if it exists
ALTER TABLE public.public_petitions 
  DROP CONSTRAINT IF EXISTS public_petitions_user_id_fkey;

-- Add foreign key to profiles table (profiles.id is the primary key)
ALTER TABLE public.public_petitions
  ADD CONSTRAINT public_petitions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Create index for better join performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_public_petitions_user_id_profiles 
  ON public.public_petitions(user_id);

COMMENT ON CONSTRAINT public_petitions_user_id_fkey ON public.public_petitions 
  IS 'Links public petitions to user profiles for displaying author information';
