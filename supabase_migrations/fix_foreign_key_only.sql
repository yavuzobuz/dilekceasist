-- =====================================================
-- FIX FOREIGN KEY RELATIONSHIP ONLY
-- Run this if table already exists
-- =====================================================

-- Drop existing foreign key (if it points to auth.users)
ALTER TABLE public.public_petitions 
  DROP CONSTRAINT IF EXISTS public_petitions_user_id_fkey;

-- Add correct foreign key to profiles.id
ALTER TABLE public.public_petitions
  ADD CONSTRAINT public_petitions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Verify it worked
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

-- =====================================================
-- Expected result:
-- constraint_name          | column_name | foreign_table_name | foreign_column_name
-- public_petitions_user_id | user_id     | profiles           | id
-- =====================================================
