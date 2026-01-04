-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);

-- Storage policies for uploads bucket
CREATE POLICY "Anyone can view uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

CREATE POLICY "Anyone can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Anyone can update uploads"
ON storage.objects FOR UPDATE
USING (bucket_id = 'uploads');

CREATE POLICY "Anyone can delete uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'uploads');

-- Add theme settings to rooms table
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS house_rules text DEFAULT '';

-- Update assets table for expression variants
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tag text DEFAULT '';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- Create index for tag lookups
CREATE INDEX IF NOT EXISTS idx_assets_character_tag ON public.assets(character_id, tag);