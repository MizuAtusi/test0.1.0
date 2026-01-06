-- Allow room owners to delete their rooms (cascade deletes members/messages/etc via FK)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room owner can delete rooms" ON public.rooms;
CREATE POLICY "Room owner can delete rooms"
  ON public.rooms FOR DELETE
  USING (owner_user_id = auth.uid());

