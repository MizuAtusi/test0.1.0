ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS scale_left numeric,
ADD COLUMN IF NOT EXISTS offset_x_left integer,
ADD COLUMN IF NOT EXISTS offset_y_left integer,
ADD COLUMN IF NOT EXISTS scale_center numeric,
ADD COLUMN IF NOT EXISTS offset_x_center integer,
ADD COLUMN IF NOT EXISTS offset_y_center integer,
ADD COLUMN IF NOT EXISTS scale_right numeric,
ADD COLUMN IF NOT EXISTS offset_x_right integer,
ADD COLUMN IF NOT EXISTS offset_y_right integer;

