-- Add public scope to room_public_settings and allow read-only public viewing

ALTER TABLE public.room_public_settings
ADD COLUMN IF NOT EXISTS public_scope text NOT NULL DEFAULT 'overview' CHECK (public_scope IN ('overview', 'read_only'));

-- Allow public read-only viewers (authenticated) to read room contents
DROP POLICY IF EXISTS "Public read-only can view messages" ON public.messages;
CREATE POLICY "Public read-only can view messages"
  ON public.messages FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_public_settings rps
      WHERE rps.room_id = messages.room_id
        AND rps.is_public = true
        AND rps.public_scope = 'read_only'
    )
  );

DROP POLICY IF EXISTS "Public read-only can view stage states" ON public.stage_states;
CREATE POLICY "Public read-only can view stage states"
  ON public.stage_states FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_public_settings rps
      WHERE rps.room_id = stage_states.room_id
        AND rps.is_public = true
        AND rps.public_scope = 'read_only'
    )
  );

DROP POLICY IF EXISTS "Public read-only can view characters" ON public.characters;
CREATE POLICY "Public read-only can view characters"
  ON public.characters FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_public_settings rps
      WHERE rps.room_id = characters.room_id
        AND rps.is_public = true
        AND rps.public_scope = 'read_only'
    )
  );

DROP POLICY IF EXISTS "Public read-only can view assets" ON public.assets;
CREATE POLICY "Public read-only can view assets"
  ON public.assets FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_public_settings rps
      WHERE rps.room_id = assets.room_id
        AND rps.is_public = true
        AND rps.public_scope = 'read_only'
    )
  );

-- Allow GMs (room_members.role='GM') to view/update join requests
DROP POLICY IF EXISTS "Join requests view for GMs" ON public.room_join_requests;
CREATE POLICY "Join requests view for GMs"
  ON public.room_join_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_join_requests.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );

DROP POLICY IF EXISTS "Join requests update by GMs" ON public.room_join_requests;
CREATE POLICY "Join requests update by GMs"
  ON public.room_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_join_requests.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (true);
