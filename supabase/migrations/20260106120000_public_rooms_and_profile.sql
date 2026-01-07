-- Public rooms, join requests, and profile posts/replies

-- Extend profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio text DEFAULT ''::text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Public room settings (template + metadata)
CREATE TABLE IF NOT EXISTS public.room_public_settings (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT ''::text,
  description text NOT NULL DEFAULT ''::text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  thumbnail_url text,
  snapshot jsonb,
  published_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.room_public_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public room settings view" ON public.room_public_settings;
CREATE POLICY "Public room settings view"
  ON public.room_public_settings FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (is_public = true OR owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Room owners manage public settings" ON public.room_public_settings;
CREATE POLICY "Room owners manage public settings"
  ON public.room_public_settings FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Join requests (pending/approved/rejected)
CREATE TABLE IF NOT EXISTS public.room_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (room_id, requester_user_id)
);

ALTER TABLE public.room_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Join requests view" ON public.room_join_requests;
CREATE POLICY "Join requests view"
  ON public.room_join_requests FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_join_requests.room_id
        AND r.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Join requests create" ON public.room_join_requests;
CREATE POLICY "Join requests create"
  ON public.room_join_requests FOR INSERT
  WITH CHECK (requester_user_id = auth.uid());

DROP POLICY IF EXISTS "Join requests update by owner" ON public.room_join_requests;
CREATE POLICY "Join requests update by owner"
  ON public.room_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_join_requests.room_id
        AND r.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- Profile posts
CREATE TABLE IF NOT EXISTS public.profile_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT ''::text,
  thumbnail_url text,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile posts view" ON public.profile_posts;
CREATE POLICY "Profile posts view"
  ON public.profile_posts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profile posts manage" ON public.profile_posts;
CREATE POLICY "Profile posts manage"
  ON public.profile_posts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Profile replies
CREATE TABLE IF NOT EXISTS public.profile_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.profile_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile replies view" ON public.profile_replies;
CREATE POLICY "Profile replies view"
  ON public.profile_replies FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profile replies create" ON public.profile_replies;
CREATE POLICY "Profile replies create"
  ON public.profile_replies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profile replies delete" ON public.profile_replies;
CREATE POLICY "Profile replies delete"
  ON public.profile_replies FOR DELETE
  USING (user_id = auth.uid());

