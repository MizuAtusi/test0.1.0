-- Public stats for landing page
CREATE TABLE IF NOT EXISTS public.public_stats (
  id integer PRIMARY KEY DEFAULT 1,
  users_count bigint NOT NULL DEFAULT 0,
  rooms_count bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.public_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view public stats" ON public.public_stats;
CREATE POLICY "Public can view public stats"
  ON public.public_stats FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.refresh_public_stats()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.public_stats (id, users_count, rooms_count, updated_at)
  VALUES (
    1,
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.rooms),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET users_count = EXCLUDED.users_count,
        rooms_count = EXCLUDED.rooms_count,
        updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.public_stats_on_user_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_public_stats();
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_stats_on_room_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_public_stats();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS public_stats_users_change ON auth.users;
CREATE TRIGGER public_stats_users_change
AFTER INSERT OR DELETE ON auth.users
FOR EACH STATEMENT EXECUTE PROCEDURE public.public_stats_on_user_change();

DROP TRIGGER IF EXISTS public_stats_rooms_change ON public.rooms;
CREATE TRIGGER public_stats_rooms_change
AFTER INSERT OR DELETE ON public.rooms
FOR EACH STATEMENT EXECUTE PROCEDURE public.public_stats_on_room_change();

ALTER TABLE public.public_stats REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_stats;

SELECT public.refresh_public_stats();
