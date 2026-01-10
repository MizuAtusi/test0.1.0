-- Room invites for GM-initiated invitations
CREATE TABLE IF NOT EXISTS public.room_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'cancelled')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (room_id, invitee_user_id)
);

ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room invites view" ON public.room_invites;
CREATE POLICY "Room invites view"
  ON public.room_invites FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (inviter_user_id = auth.uid() OR invitee_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Room invites create by GMs" ON public.room_invites;
CREATE POLICY "Room invites create by GMs"
  ON public.room_invites FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND inviter_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_invites.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );

DROP POLICY IF EXISTS "Room invites accept by invitee" ON public.room_invites;
CREATE POLICY "Room invites accept by invitee"
  ON public.room_invites FOR UPDATE
  USING (
    invitee_user_id = auth.uid()
  )
  WITH CHECK (invitee_user_id = auth.uid());
