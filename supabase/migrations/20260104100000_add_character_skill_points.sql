ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS skill_points jsonb NOT NULL DEFAULT '{"occupation":{},"interest":{},"other":{}}'::jsonb;

