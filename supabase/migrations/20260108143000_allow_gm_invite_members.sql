-- Allow GMs to add room members (invite)
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room GMs can add members" ON public.room_members;
CREATE POLICY "Room GMs can add members"
  ON public.room_members FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_members.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );
