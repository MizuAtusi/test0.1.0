-- Private chat threads
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  color text NOT NULL DEFAULT '#7c3aed',
  member_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat members can view threads" ON public.chat_threads;
CREATE POLICY "Chat members can view threads"
  ON public.chat_threads FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = ANY(member_user_ids)
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = chat_threads.room_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat members can create threads" ON public.chat_threads;
CREATE POLICY "Chat members can create threads"
  ON public.chat_threads FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = ANY(member_user_ids)
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = chat_threads.room_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat members can update threads" ON public.chat_threads;
CREATE POLICY "Chat members can update threads"
  ON public.chat_threads FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = ANY(member_user_ids)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = ANY(member_user_ids)
  );

-- Link messages to threads
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_room_id ON public.chat_threads(room_id);

-- Update message policies to honor thread membership for chat channel
DROP POLICY IF EXISTS "Room members can view messages" ON public.messages;
CREATE POLICY "Room members can view messages"
  ON public.messages FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
    )
    AND (
      messages.channel <> 'chat'
      OR messages.thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.chat_threads ct
        WHERE ct.id = messages.thread_id
          AND auth.uid() = ANY(ct.member_user_ids)
      )
    )
  );

DROP POLICY IF EXISTS "Room members can create messages" ON public.messages;
CREATE POLICY "Room members can create messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
    )
    AND (
      messages.channel <> 'chat'
      OR messages.thread_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.chat_threads ct
        WHERE ct.id = messages.thread_id
          AND auth.uid() = ANY(ct.member_user_ids)
      )
    )
  );
