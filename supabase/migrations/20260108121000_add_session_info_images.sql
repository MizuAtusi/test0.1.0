-- Session info image attachments
CREATE TABLE IF NOT EXISTS public.session_info_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  info_id uuid NOT NULL REFERENCES public.session_infos(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.session_info_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members can view info images" ON public.session_info_images;
CREATE POLICY "Room members can view info images"
  ON public.session_info_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_images.info_id
        AND rm.user_id = auth.uid()
        AND (
          rm.role = 'GM'
          OR si.visibility = 'public'
          OR (si.visibility = 'restricted' AND auth.uid() = ANY(si.allowed_user_ids))
        )
    )
  );

DROP POLICY IF EXISTS "Room GMs manage info images" ON public.session_info_images;
CREATE POLICY "Room GMs manage info images"
  ON public.session_info_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_images.info_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_images.info_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );
