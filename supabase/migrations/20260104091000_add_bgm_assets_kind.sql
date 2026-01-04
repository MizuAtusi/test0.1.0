DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assets_kind_check'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets DROP CONSTRAINT assets_kind_check;
  END IF;
END $$;

ALTER TABLE public.assets
ADD CONSTRAINT assets_kind_check
CHECK (kind IN ('portrait', 'background', 'se', 'bgm'));

