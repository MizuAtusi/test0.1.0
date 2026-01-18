ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS background_screens jsonb DEFAULT '[]'::jsonb;
