-- Create public_petitions table for shared petitions
CREATE TABLE IF NOT EXISTS public.public_petitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_petition_id UUID REFERENCES public.petitions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  petition_type TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  is_premium BOOLEAN DEFAULT FALSE,
  price NUMERIC(10, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'reported', 'removed')),
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_public_petitions_user_id ON public.public_petitions(user_id);
CREATE INDEX IF NOT EXISTS idx_public_petitions_petition_type ON public.public_petitions(petition_type);
CREATE INDEX IF NOT EXISTS idx_public_petitions_status ON public.public_petitions(status);
CREATE INDEX IF NOT EXISTS idx_public_petitions_is_premium ON public.public_petitions(is_premium);
CREATE INDEX IF NOT EXISTS idx_public_petitions_created_at ON public.public_petitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_petitions_tags ON public.public_petitions USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE public.public_petitions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all active public petitions
CREATE POLICY "Anyone can view active public petitions"
  ON public.public_petitions
  FOR SELECT
  USING (status = 'active');

-- Policy: Authenticated users can insert their own petitions
CREATE POLICY "Authenticated users can create public petitions"
  ON public.public_petitions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own petitions
CREATE POLICY "Users can update their own public petitions"
  ON public.public_petitions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own petitions
CREATE POLICY "Users can delete their own public petitions"
  ON public.public_petitions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_public_petitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS set_public_petitions_updated_at ON public.public_petitions;
CREATE TRIGGER set_public_petitions_updated_at
  BEFORE UPDATE ON public.public_petitions
  FOR EACH ROW
  EXECUTE FUNCTION update_public_petitions_updated_at();

-- Grant necessary permissions
GRANT SELECT ON public.public_petitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.public_petitions TO authenticated;

COMMENT ON TABLE public.public_petitions IS 'Table storing petitions that users have shared publicly';
COMMENT ON COLUMN public.public_petitions.user_id IS 'ID of the user who shared the petition';
COMMENT ON COLUMN public.public_petitions.original_petition_id IS 'Reference to the original petition in petitions table';
COMMENT ON COLUMN public.public_petitions.description IS 'User-provided description for the shared petition';
COMMENT ON COLUMN public.public_petitions.tags IS 'Array of tags for categorization and search';
COMMENT ON COLUMN public.public_petitions.is_premium IS 'Whether this is a premium petition (future feature)';
COMMENT ON COLUMN public.public_petitions.price IS 'Price for premium petitions (future feature)';
COMMENT ON COLUMN public.public_petitions.status IS 'Status of the petition: active, inactive, reported, or removed';
COMMENT ON COLUMN public.public_petitions.view_count IS 'Number of times this petition has been viewed';
COMMENT ON COLUMN public.public_petitions.download_count IS 'Number of times this petition has been downloaded';
