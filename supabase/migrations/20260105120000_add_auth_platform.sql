-- Auth-based platform foundation (Supabase Auth)
-- - profiles: account display name
-- - room_members: membership + role (GM/PL)
-- - rooms.owner_user_id: room creator
-- - participants.user_id: online presence per session
-- - characters.owner_user_id: ownership across devices

-- 1) Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles can be read by owner" ON public.profiles;
CREATE POLICY "Profiles can be read by owner"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles can be updated by owner" ON public.profiles;
CREATE POLICY "Profiles can be updated by owner"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create a profile row on sign-up / first login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  name_from_meta text;
BEGIN
  name_from_meta :=
    COALESCE(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      NULLIF(split_part(new.email, '@', 1), ''),
      'user'
    );

  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, name_from_meta)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2) Room ownership + membership
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.room_members (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'PL' CHECK (role IN ('PL', 'GM')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members can view their own row" ON public.room_members;
CREATE POLICY "Room members can view their own row"
  ON public.room_members FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Room members can view same room" ON public.room_members;
CREATE POLICY "Room members can view same room"
  ON public.room_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_members.room_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can join rooms as themselves" ON public.room_members;
CREATE POLICY "Users can join rooms as themselves"
  ON public.room_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      role = 'PL'
      OR EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = room_members.room_id
          AND r.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Room owner can update member roles" ON public.room_members;
CREATE POLICY "Room owner can update member roles"
  ON public.room_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id
        AND r.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Room owner can delete members" ON public.room_members;
CREATE POLICY "Room owner can delete members"
  ON public.room_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id
        AND r.owner_user_id = auth.uid()
    )
  );

-- 3) Online presence (participants) linked to auth users
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4) Character ownership across devices
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5) Replace permissive RLS with member-based rules
-- rooms
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;

CREATE POLICY "Authenticated users can view rooms"
  ON public.rooms FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

CREATE POLICY "Room owner can update rooms"
  ON public.rooms FOR UPDATE
  USING (owner_user_id = auth.uid());

-- Migration helper: allow the first authenticated claimant to become the owner
-- (only when the room has no owner yet and no members exist).
DROP POLICY IF EXISTS "First claimant can set room owner" ON public.rooms;
CREATE POLICY "First claimant can set room owner"
  ON public.rooms FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND owner_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = rooms.id
    )
  )
  WITH CHECK (owner_user_id = auth.uid());

-- participants (presence)
DROP POLICY IF EXISTS "Anyone can view participants" ON public.participants;
DROP POLICY IF EXISTS "Anyone can join as participant" ON public.participants;
DROP POLICY IF EXISTS "Anyone can update participants" ON public.participants;
DROP POLICY IF EXISTS "Anyone can leave" ON public.participants;

CREATE POLICY "Room members can view participants"
  ON public.participants FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = participants.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can create their own participant presence"
  ON public.participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = participants.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own participant presence"
  ON public.participants FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can delete their own participant presence"
  ON public.participants FOR DELETE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- messages
DROP POLICY IF EXISTS "Anyone can view messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can create messages" ON public.messages;

CREATE POLICY "Room members can view messages"
  ON public.messages FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can create messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- stage_states
DROP POLICY IF EXISTS "Anyone can view stage states" ON public.stage_states;
DROP POLICY IF EXISTS "Anyone can create stage states" ON public.stage_states;
DROP POLICY IF EXISTS "Anyone can update stage states" ON public.stage_states;

CREATE POLICY "Room members can view stage states"
  ON public.stage_states FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = stage_states.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can create stage states"
  ON public.stage_states FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = stage_states.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- NOTE: allow any room member to update for now (players can change their portraits).
CREATE POLICY "Room members can update stage states"
  ON public.stage_states FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = stage_states.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- characters
DROP POLICY IF EXISTS "Anyone can view characters" ON public.characters;
DROP POLICY IF EXISTS "Anyone can create characters" ON public.characters;
DROP POLICY IF EXISTS "Anyone can update characters" ON public.characters;
DROP POLICY IF EXISTS "Anyone can delete characters" ON public.characters;

CREATE POLICY "Room members can view characters"
  ON public.characters FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = characters.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can create their own characters"
  ON public.characters FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = characters.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update their own characters"
  ON public.characters FOR UPDATE
  USING (auth.uid() IS NOT NULL AND owner_user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

CREATE POLICY "Owners can delete their own characters"
  ON public.characters FOR DELETE
  USING (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

-- assets
DROP POLICY IF EXISTS "Anyone can view assets" ON public.assets;
DROP POLICY IF EXISTS "Anyone can create assets" ON public.assets;
DROP POLICY IF EXISTS "Anyone can update assets" ON public.assets;
DROP POLICY IF EXISTS "Anyone can delete assets" ON public.assets;

CREATE POLICY "Room members can view assets"
  ON public.assets FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = assets.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can create assets"
  ON public.assets FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = assets.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can update assets"
  ON public.assets FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = assets.room_id
        AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (true);

CREATE POLICY "Room members can delete assets"
  ON public.assets FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = assets.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- macros (GM tools)
DROP POLICY IF EXISTS "Anyone can view macros" ON public.macros;
DROP POLICY IF EXISTS "Anyone can create macros" ON public.macros;
DROP POLICY IF EXISTS "Anyone can update macros" ON public.macros;
DROP POLICY IF EXISTS "Anyone can delete macros" ON public.macros;

CREATE POLICY "Room members can view macros"
  ON public.macros FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = macros.room_id
        AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room GMs can manage macros"
  ON public.macros FOR ALL
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = macros.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = macros.room_id
        AND rm.user_id = auth.uid()
        AND rm.role = 'GM'
    )
  );
