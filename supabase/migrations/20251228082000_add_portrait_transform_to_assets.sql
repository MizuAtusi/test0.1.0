-- Add portrait transform settings to assets table
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS scale double precision DEFAULT 1;

ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS offset_x integer DEFAULT 0;

ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS offset_y integer DEFAULT 0;

