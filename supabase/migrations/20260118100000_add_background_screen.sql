ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS background_screen jsonb DEFAULT '{}'::jsonb;
