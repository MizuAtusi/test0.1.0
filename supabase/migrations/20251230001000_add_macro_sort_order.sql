-- Add sortable order for GM macros (synced across devices)
ALTER TABLE public.macros
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Backfill missing sort orders per room (keep gaps for easy inserts)
WITH ranked AS (
  SELECT
    id,
    (row_number() OVER (PARTITION BY room_id ORDER BY created_at ASC)) * 1000 AS rn
  FROM public.macros
)
UPDATE public.macros m
SET sort_order = ranked.rn
FROM ranked
WHERE m.id = ranked.id
  AND m.sort_order IS NULL;

ALTER TABLE public.macros
ALTER COLUMN sort_order SET DEFAULT 1000;

