-- Allow GMs to manage public settings (without changing owner)

DROP POLICY IF EXISTS "Room GMs view public settings" ON public.room_public_settings;
CREATE POLICY "Room GMs view public settings"
  ON public.room_public_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_public_settings.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );

DROP POLICY IF EXISTS "Room GMs update public settings" ON public.room_public_settings;
CREATE POLICY "Room GMs update public settings"
  ON public.room_public_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_public_settings.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Room GMs insert public settings" ON public.room_public_settings;
CREATE POLICY "Room GMs insert public settings"
  ON public.room_public_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_public_settings.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
    AND owner_user_id = (
      SELECT r.owner_user_id FROM public.rooms r
      WHERE r.id = room_public_settings.room_id
    )
  );
