-- Create public_petitions table for shared petitions
CREATE TABLE IF NOT EXISTS public_petitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  original_petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  petition_type TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  tags TEXT[], -- Array of tags for filtering
  is_premium BOOLEAN DEFAULT FALSE,
  price DECIMAL(10,2) DEFAULT 0.00,
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'reported')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better query performance
CREATE INDEX idx_public_petitions_user_id ON public_petitions(user_id);
CREATE INDEX idx_public_petitions_petition_type ON public_petitions(petition_type);
CREATE INDEX idx_public_petitions_is_premium ON public_petitions(is_premium);
CREATE INDEX idx_public_petitions_created_at ON public_petitions(created_at DESC);
CREATE INDEX idx_public_petitions_status ON public_petitions(status);

-- Create likes table for tracking who liked what
CREATE TABLE IF NOT EXISTS petition_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  petition_id UUID REFERENCES public_petitions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, petition_id)
);

-- Create index for likes
CREATE INDEX idx_petition_likes_petition_id ON petition_likes(petition_id);
CREATE INDEX idx_petition_likes_user_id ON petition_likes(user_id);

-- Enable Row Level Security
ALTER TABLE public_petitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petition_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for public_petitions
-- Everyone can view active petitions
CREATE POLICY "Public petitions are viewable by everyone"
  ON public_petitions FOR SELECT
  USING (status = 'active');

-- Users can insert their own petitions
CREATE POLICY "Users can share their own petitions"
  ON public_petitions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own petitions
CREATE POLICY "Users can update their own petitions"
  ON public_petitions FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own petitions
CREATE POLICY "Users can delete their own petitions"
  ON public_petitions FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for petition_likes
-- Everyone can view likes
CREATE POLICY "Likes are viewable by everyone"
  ON petition_likes FOR SELECT
  USING (true);

-- Users can like petitions
CREATE POLICY "Users can like petitions"
  ON petition_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can unlike petitions
CREATE POLICY "Users can unlike petitions"
  ON petition_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Function to increment views
CREATE OR REPLACE FUNCTION increment_petition_views(petition_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public_petitions
  SET views_count = views_count + 1
  WHERE id = petition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update likes count when like is added/removed
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public_petitions
    SET likes_count = likes_count + 1
    WHERE id = NEW.petition_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public_petitions
    SET likes_count = likes_count - 1
    WHERE id = OLD.petition_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for likes count
CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON petition_likes
FOR EACH ROW
EXECUTE FUNCTION update_likes_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_public_petitions_updated_at
BEFORE UPDATE ON public_petitions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
