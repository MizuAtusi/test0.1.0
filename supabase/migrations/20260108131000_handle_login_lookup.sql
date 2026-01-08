-- Allow login by handle (ID)
CREATE OR REPLACE FUNCTION public.get_email_for_handle(handle_input text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.handle = handle_input
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_for_handle(text) TO anon, authenticated;
