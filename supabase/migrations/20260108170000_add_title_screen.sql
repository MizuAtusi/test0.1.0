-- Title screen config stored on room
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS title_screen jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS title_screen_visible boolean NOT NULL DEFAULT false;
