-- =====================================================
-- CHECK AND FIX PUBLIC_PETITIONS TABLE
-- Run this to diagnose and fix the relationship issue
-- =====================================================

-- 1. Check if public_petitions table exists
SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'public_petitions';

-- 2. Check existing foreign keys on public_petitions
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'public_petitions';

-- 3. If the table exists but foreign key is wrong, fix it:

-- Drop existing foreign key if it exists
ALTER TABLE public.public_petitions 
  DROP CONSTRAINT IF EXISTS public_petitions_user_id_fkey;

-- Add correct foreign key to profiles.id
ALTER TABLE public.public_petitions
  ADD CONSTRAINT public_petitions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- 4. Verify the relationship was created
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'public_petitions';

-- =====================================================
-- If you see a row showing:
-- constraint_name: public_petitions_user_id_fkey
-- table_name: public_petitions
-- column_name: user_id
-- foreign_table_name: profiles
-- foreign_column_name: id
-- 
-- Then it's working! ✅
-- =====================================================
