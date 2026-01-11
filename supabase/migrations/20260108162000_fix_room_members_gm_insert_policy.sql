-- Fix recursive RLS: allow GMs to add members without querying room_members directly in policy

CREATE OR REPLACE FUNCTION public.is_room_gm(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members rm
    WHERE rm.room_id = p_room_id
      AND rm.user_id = p_user_id
      AND rm.role = 'GM'
  );
$$;

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- Ensure recursive policy is removed if still present
DROP POLICY IF EXISTS "Room members can view same room" ON public.room_members;

DROP POLICY IF EXISTS "Room GMs can add members" ON public.room_members;
CREATE POLICY "Room GMs can add members"
  ON public.room_members FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_room_gm(room_members.room_id, auth.uid())
  );
