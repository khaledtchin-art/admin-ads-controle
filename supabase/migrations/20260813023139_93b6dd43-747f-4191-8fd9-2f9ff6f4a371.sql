CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role admin_role_type NOT NULL DEFAULT 'support_admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_profiles TO authenticated;
GRANT ALL ON public.admin_profiles TO service_role;

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_profile_super(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE POLICY "admin_profiles_select_self_or_super"
ON public.admin_profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin_profile_super(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "admin_profiles_manage_super"
ON public.admin_profiles FOR ALL TO authenticated
USING (public.is_admin_profile_super(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_admin_profile_super(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_admin_profiles_updated
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(NEW.email) = 'admin@ads.app' THEN
    INSERT INTO public.admin_profiles (user_id, email, role)
    VALUES (NEW.id, NEW.email, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', email = EXCLUDED.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_admin_user_created ON auth.users;
CREATE TRIGGER on_auth_admin_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_user();

INSERT INTO public.admin_profiles (user_id, email, role)
SELECT u.id, u.email, 'super_admin'
FROM auth.users u
WHERE lower(u.email) = 'admin@ads.app'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
