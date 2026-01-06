-- Fix: avoid infinite recursion in RLS policies on room_members
-- Postgres does not allow room_members RLS policies that query room_members itself.

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- Remove the recursive policy (if present)
DROP POLICY IF EXISTS "Room members can view same room" ON public.room_members;

-- Replace with a non-recursive policy: room owner can view all members in their room.
DROP POLICY IF EXISTS "Room owner can view room members" ON public.room_members;
CREATE POLICY "Room owner can view room members"
  ON public.room_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id
        AND r.owner_user_id = auth.uid()
    )
  );

