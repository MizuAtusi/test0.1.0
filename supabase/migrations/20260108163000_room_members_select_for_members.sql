-- Allow room members to view member lists (non-recursive via security definer)

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid, p_user_id uuid)
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
  );
$$;

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members can view all members" ON public.room_members;
CREATE POLICY "Room members can view all members"
  ON public.room_members FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.is_room_member(room_members.room_id, auth.uid())
  );
