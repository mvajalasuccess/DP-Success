CREATE OR REPLACE FUNCTION public.ensure_user_setup(_full_name TEXT DEFAULT NULL, _email TEXT DEFAULT NULL)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing public.app_role;
  _assigned public.app_role;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (_uid, _full_name, _email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        email = COALESCE(EXCLUDED.email, public.profiles.email);

  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    _assigned := 'administrador';
  ELSE
    _assigned := 'consulta';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _assigned;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_setup(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_setup(TEXT, TEXT) TO authenticated;