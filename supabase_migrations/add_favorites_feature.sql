-- =====================================================
-- ADD FAVORITES FEATURE
-- Allows users to favorite/bookmark petitions
-- =====================================================

-- =====================================================
-- 1. CREATE PETITION_FAVORITES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.petition_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  petition_id UUID NOT NULL REFERENCES public.public_petitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, petition_id) -- Prevent duplicate favorites
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_petition_favorites_user_id ON public.petition_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_petition_favorites_petition_id ON public.petition_favorites(petition_id);
CREATE INDEX IF NOT EXISTS idx_petition_favorites_created_at ON public.petition_favorites(created_at DESC);

-- =====================================================
-- 2. ADD FAVORITE_COUNT COLUMN TO PUBLIC_PETITIONS
-- =====================================================

-- Add column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'public_petitions' 
    AND column_name = 'favorite_count'
  ) THEN
    ALTER TABLE public.public_petitions ADD COLUMN favorite_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create index for sorting by favorites
CREATE INDEX IF NOT EXISTS idx_public_petitions_favorite_count ON public.public_petitions(favorite_count DESC);

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.petition_favorites ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. CREATE RLS POLICIES
-- =====================================================

-- Users can view all favorites (to see counts)
CREATE POLICY "Anyone can view petition favorites"
  ON public.petition_favorites
  FOR SELECT
  USING (true);

-- Authenticated users can add favorites
CREATE POLICY "Authenticated users can add favorites"
  ON public.petition_favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete their own favorites"
  ON public.petition_favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 5. CREATE FUNCTIONS
-- =====================================================

-- Function to toggle favorite (add or remove)
CREATE OR REPLACE FUNCTION toggle_petition_favorite(
  p_petition_id UUID,
  p_user_id UUID
)
RETURNS TABLE(is_favorited BOOLEAN, new_count INTEGER) AS $$
DECLARE
  v_exists BOOLEAN;
  v_count INTEGER;
BEGIN
  -- Check if favorite exists
  SELECT EXISTS(
    SELECT 1 FROM public.petition_favorites
    WHERE user_id = p_user_id AND petition_id = p_petition_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove favorite
    DELETE FROM public.petition_favorites
    WHERE user_id = p_user_id AND petition_id = p_petition_id;
    
    -- Decrement count
    UPDATE public.public_petitions
    SET favorite_count = GREATEST(favorite_count - 1, 0)
    WHERE id = p_petition_id;
    
    -- Get new count
    SELECT favorite_count INTO v_count
    FROM public.public_petitions
    WHERE id = p_petition_id;
    
    RETURN QUERY SELECT false, v_count;
  ELSE
    -- Add favorite
    INSERT INTO public.petition_favorites (user_id, petition_id)
    VALUES (p_user_id, p_petition_id);
    
    -- Increment count
    UPDATE public.public_petitions
    SET favorite_count = favorite_count + 1
    WHERE id = p_petition_id;
    
    -- Get new count
    SELECT favorite_count INTO v_count
    FROM public.public_petitions
    WHERE id = p_petition_id;
    
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user favorited a petition
CREATE OR REPLACE FUNCTION is_petition_favorited(
  p_petition_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.petition_favorites
    WHERE user_id = p_user_id AND petition_id = p_petition_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's favorite petitions with details
CREATE OR REPLACE FUNCTION get_user_favorites(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  title TEXT,
  petition_type TEXT,
  content TEXT,
  description TEXT,
  tags TEXT[],
  is_premium BOOLEAN,
  price NUMERIC,
  favorite_count INTEGER,
  view_count INTEGER,
  download_count INTEGER,
  created_at TIMESTAMPTZ,
  favorited_at TIMESTAMPTZ,
  author_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pp.id,
    pp.user_id,
    pp.title,
    pp.petition_type,
    pp.content,
    pp.description,
    pp.tags,
    pp.is_premium,
    pp.price,
    pp.favorite_count,
    pp.view_count,
    pp.download_count,
    pp.created_at,
    pf.created_at as favorited_at,
    p.full_name as author_name
  FROM public.petition_favorites pf
  JOIN public.public_petitions pp ON pf.petition_id = pp.id
  LEFT JOIN public.profiles p ON pp.user_id = p.id
  WHERE pf.user_id = p_user_id
    AND pp.status = 'active'
  ORDER BY pf.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON public.petition_favorites TO anon, authenticated;
GRANT INSERT, DELETE ON public.petition_favorites TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_petition_favorite(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_petition_favorited(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_favorites(UUID) TO authenticated;

-- =====================================================
-- 7. UPDATE EXISTING FAVORITE COUNTS
-- =====================================================

-- Recalculate favorite counts for existing petitions
UPDATE public.public_petitions
SET favorite_count = (
  SELECT COUNT(*)
  FROM public.petition_favorites
  WHERE petition_id = public.public_petitions.id
);

-- =====================================================
-- 8. COMMENTS
-- =====================================================

COMMENT ON TABLE public.petition_favorites IS 'User favorites/bookmarks for public petitions';
COMMENT ON COLUMN public.petition_favorites.user_id IS 'User who favorited the petition';
COMMENT ON COLUMN public.petition_favorites.petition_id IS 'The favorited petition';
COMMENT ON FUNCTION toggle_petition_favorite IS 'Toggle favorite status and return new state and count';
COMMENT ON FUNCTION is_petition_favorited IS 'Check if a user has favorited a petition';
COMMENT ON FUNCTION get_user_favorites IS 'Get all favorited petitions for a user with full details';

-- =====================================================
-- ✅ FAVORITES FEATURE SETUP COMPLETE!
-- =====================================================
-- Users can now:
-- - Favorite/unfavorite petitions
-- - See favorite counts
-- - View their favorited petitions
-- =====================================================
