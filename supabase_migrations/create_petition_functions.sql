-- =====================================================
-- CREATE HELPER FUNCTIONS FOR PUBLIC PETITIONS
-- =====================================================

-- Function to increment view count for a petition
CREATE OR REPLACE FUNCTION increment_petition_views(petition_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.public_petitions
  SET view_count = view_count + 1
  WHERE id = petition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment download count for a petition
CREATE OR REPLACE FUNCTION increment_petition_downloads(petition_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.public_petitions
  SET download_count = download_count + 1
  WHERE id = petition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION increment_petition_views(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_petition_downloads(UUID) TO anon, authenticated;

-- Comments
COMMENT ON FUNCTION increment_petition_views IS 'Increments the view count for a public petition';
COMMENT ON FUNCTION increment_petition_downloads IS 'Increments the download count for a public petition';

-- =====================================================
-- Verify functions were created
-- =====================================================
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('increment_petition_views', 'increment_petition_downloads');

-- =====================================================
-- Expected result: Two rows showing both functions
-- =====================================================
