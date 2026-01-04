-- Add avatar (icon) fields to characters
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS avatar_scale double precision DEFAULT 1;

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS avatar_offset_x integer DEFAULT 0;

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS avatar_offset_y integer DEFAULT 0;

