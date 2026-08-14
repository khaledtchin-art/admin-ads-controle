CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(NEW.email) IN ('admin@ads.app', 'kaledtchindo7@gmail.com') THEN
    INSERT INTO public.admin_profiles (user_id, email, role)
    VALUES (NEW.id, NEW.email, 'super_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', email = EXCLUDED.email;
  END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO public.admin_profiles (user_id, email, role)
SELECT u.id, u.email, 'super_admin'::admin_role_type
FROM auth.users u
WHERE lower(u.email) IN ('admin@ads.app', 'kaledtchindo7@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', email = EXCLUDED.email;