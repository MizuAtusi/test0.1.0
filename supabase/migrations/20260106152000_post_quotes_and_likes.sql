-- Add quote posts and likes

ALTER TABLE public.profile_posts
ADD COLUMN IF NOT EXISTS quoted_post_id uuid REFERENCES public.profile_posts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.profile_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.profile_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.profile_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post likes view" ON public.profile_post_likes;
CREATE POLICY "Post likes view"
  ON public.profile_post_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Post likes manage" ON public.profile_post_likes;
CREATE POLICY "Post likes manage"
  ON public.profile_post_likes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
