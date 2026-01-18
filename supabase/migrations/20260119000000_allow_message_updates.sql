-- Allow KP and owned PC holders to update messages (log edits)
DROP POLICY IF EXISTS "Room members can update messages" ON public.messages;
CREATE POLICY "Room members can update messages"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
    OR EXISTS (
      SELECT 1 FROM public.characters c
      WHERE c.room_id = messages.room_id
        AND c.owner_user_id = auth.uid()
        AND c.name = messages.speaker_name
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
    OR EXISTS (
      SELECT 1 FROM public.characters c
      WHERE c.room_id = messages.room_id
        AND c.owner_user_id = auth.uid()
        AND c.name = messages.speaker_name
    )
  );
