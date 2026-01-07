-- Allow public rooms to be shared as templates
ALTER TABLE public.room_public_settings
ADD COLUMN IF NOT EXISTS allow_copy boolean NOT NULL DEFAULT false;
