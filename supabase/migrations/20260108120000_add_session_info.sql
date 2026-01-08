-- Session info library
CREATE TABLE IF NOT EXISTS public.session_infos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'restricted', 'gm_only')),
  list_visibility text NOT NULL DEFAULT 'title' CHECK (list_visibility IN ('hidden', 'title')),
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_info_contents (
  info_id uuid PRIMARY KEY REFERENCES public.session_infos(id) ON DELETE CASCADE,
  content text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_info_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  info_id uuid NOT NULL REFERENCES public.session_infos(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_info_note_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.session_info_notes(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.session_infos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_info_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_info_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_info_note_comments ENABLE ROW LEVEL SECURITY;

-- session_infos: list visibility rules
DROP POLICY IF EXISTS "Room members can view info list" ON public.session_infos;
CREATE POLICY "Room members can view info list"
  ON public.session_infos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = session_infos.room_id
        AND rm.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = session_infos.room_id
          AND rm.user_id = auth.uid()
          AND rm.role = 'GM'
      )
      OR visibility = 'public'
      OR (visibility = 'restricted' AND (list_visibility = 'title' OR auth.uid() = ANY(allowed_user_ids)))
      OR (visibility = 'gm_only' AND list_visibility = 'title')
    )
  );

DROP POLICY IF EXISTS "Room GMs manage info list" ON public.session_infos;
CREATE POLICY "Room GMs manage info list"
  ON public.session_infos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = session_infos.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = session_infos.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );

-- session_info_contents: only visible if permitted
DROP POLICY IF EXISTS "Room members can view info contents" ON public.session_info_contents;
CREATE POLICY "Room members can view info contents"
  ON public.session_info_contents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_contents.info_id
        AND rm.user_id = auth.uid()
        AND (
          rm.role = 'GM'
          OR si.visibility = 'public'
          OR (si.visibility = 'restricted' AND auth.uid() = ANY(si.allowed_user_ids))
        )
    )
  );

DROP POLICY IF EXISTS "Room GMs manage info contents" ON public.session_info_contents;
CREATE POLICY "Room GMs manage info contents"
  ON public.session_info_contents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_contents.info_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_contents.info_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );

-- notes
DROP POLICY IF EXISTS "Members can view notes" ON public.session_info_notes;
CREATE POLICY "Members can view notes"
  ON public.session_info_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_notes.info_id
        AND rm.user_id = auth.uid()
    )
    AND (
      session_info_notes.author_user_id = auth.uid()
      OR session_info_notes.visibility = 'shared'
    )
  );

DROP POLICY IF EXISTS "Members can create notes" ON public.session_info_notes;
CREATE POLICY "Members can create notes"
  ON public.session_info_notes FOR INSERT
  WITH CHECK (
    session_info_notes.author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.session_infos si
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE si.id = session_info_notes.info_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can update notes" ON public.session_info_notes;
CREATE POLICY "Authors can update notes"
  ON public.session_info_notes FOR UPDATE
  USING (session_info_notes.author_user_id = auth.uid())
  WITH CHECK (session_info_notes.author_user_id = auth.uid());

DROP POLICY IF EXISTS "Authors can delete notes" ON public.session_info_notes;
CREATE POLICY "Authors can delete notes"
  ON public.session_info_notes FOR DELETE
  USING (session_info_notes.author_user_id = auth.uid());

-- note comments
DROP POLICY IF EXISTS "Members can view note comments" ON public.session_info_note_comments;
CREATE POLICY "Members can view note comments"
  ON public.session_info_note_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_info_notes n
      JOIN public.session_infos si ON si.id = n.info_id
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE n.id = session_info_note_comments.note_id
        AND rm.user_id = auth.uid()
        AND (
          n.visibility = 'shared'
          OR n.author_user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Members can create note comments" ON public.session_info_note_comments;
CREATE POLICY "Members can create note comments"
  ON public.session_info_note_comments FOR INSERT
  WITH CHECK (
    session_info_note_comments.author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.session_info_notes n
      JOIN public.session_infos si ON si.id = n.info_id
      JOIN public.room_members rm ON rm.room_id = si.room_id
      WHERE n.id = session_info_note_comments.note_id
        AND rm.user_id = auth.uid()
        AND (
          n.visibility = 'shared'
          OR n.author_user_id = auth.uid()
        )
    )
  );
