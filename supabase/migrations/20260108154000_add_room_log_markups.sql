-- Log markups for replay jump points
CREATE TABLE IF NOT EXISTS public.room_log_markups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (room_id, message_id)
);

ALTER TABLE public.room_log_markups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members can view markups" ON public.room_log_markups;
CREATE POLICY "Room members can view markups"
  ON public.room_log_markups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_log_markups.room_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Room GMs manage markups" ON public.room_log_markups;
CREATE POLICY "Room GMs manage markups"
  ON public.room_log_markups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_log_markups.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_log_markups.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );
