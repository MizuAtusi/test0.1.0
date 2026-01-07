-- Add public handle to profiles and friend requests

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS handle text;

-- Backfill handles for existing profiles
UPDATE public.profiles
SET handle = COALESCE(
  handle,
  'user' || substring(encode(gen_random_bytes(6), 'hex') from 1 for 8)
)
WHERE handle IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique ON public.profiles(handle);

ALTER TABLE public.profiles
ALTER COLUMN handle SET NOT NULL;

-- Allow authenticated users to read profiles
DROP POLICY IF EXISTS "Profiles can be read by owner" ON public.profiles;
CREATE POLICY "Profiles can be read by authenticated users"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Update profile creation trigger to set handle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  name_from_meta text;
  base_handle text;
  final_handle text;
BEGIN
  name_from_meta :=
    COALESCE(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      NULLIF(split_part(new.email, '@', 1), ''),
      'user'
    );

  base_handle :=
    COALESCE(
      new.raw_user_meta_data ->> 'handle',
      NULLIF(split_part(new.email, '@', 1), ''),
      'user'
    );

  final_handle := lower(regexp_replace(base_handle, '[^a-zA-Z0-9_]', '', 'g'));
  IF final_handle = '' THEN
    final_handle := 'user';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE handle = final_handle) THEN
    final_handle := final_handle || '_' || substring(replace(new.id::text, '-', '') from 1 for 6);
  END IF;

  INSERT INTO public.profiles (id, display_name, handle)
  VALUES (new.id, name_from_meta, final_handle)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Friend requests
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (requester_user_id, receiver_user_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Friend requests view" ON public.friend_requests;
CREATE POLICY "Friend requests view"
  ON public.friend_requests FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Friend requests public view accepted" ON public.friend_requests;
CREATE POLICY "Friend requests public view accepted"
  ON public.friend_requests FOR SELECT
  USING (
    status = 'accepted' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Friend requests create" ON public.friend_requests;
CREATE POLICY "Friend requests create"
  ON public.friend_requests FOR INSERT
  WITH CHECK (requester_user_id = auth.uid());

DROP POLICY IF EXISTS "Friend requests update" ON public.friend_requests;
CREATE POLICY "Friend requests update"
  ON public.friend_requests FOR UPDATE
  USING (
    requester_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Friend requests delete" ON public.friend_requests;
CREATE POLICY "Friend requests delete"
  ON public.friend_requests FOR DELETE
  USING (
    requester_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
  );
