-- ============ ENUMS ============
CREATE TYPE public.admin_role_type AS ENUM ('super_admin','support_admin','kyc_agent','finance_admin');
CREATE TYPE public.severity_level AS ENUM ('low','medium','high');
CREATE TYPE public.email_status AS ENUM ('en_attente','envoye','erreur');

-- ============ ADMIN ROLES ============
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.admin_role_type NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_roles TO authenticated;
GRANT ALL ON public.admin_roles TO service_role;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role public.admin_role_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.admins WHERE user_id = _user_id);
$$;

CREATE POLICY "admin_roles_select" ON public.admin_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "admin_roles_manage_super" ON public.admin_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_admin_roles_updated BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SECURITY LOGS (append-only) ============
CREATE TABLE public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  ip_address text,
  device_info text,
  details jsonb,
  severity public.severity_level NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.security_logs TO authenticated;
GRANT ALL ON public.security_logs TO service_role;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seclogs_select_admin" ON public.security_logs FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));
CREATE POLICY "seclogs_insert_auth" ON public.security_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_security_logs_created ON public.security_logs (created_at DESC);
CREATE INDEX idx_security_logs_user ON public.security_logs (user_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select_own_or_admin" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));
CREATE POLICY "notif_insert_admin" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "notif_update_own_or_admin" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "notif_delete_super" ON public.notifications FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE INDEX idx_notifications_user ON public.notifications (user_id, is_read);

-- ============ EMAILS ENVOYES ============
CREATE TABLE public.emails_envoyes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destinataire text NOT NULL,
  sujet text NOT NULL,
  contenu text,
  type text NOT NULL DEFAULT 'general',
  statut public.email_status NOT NULL DEFAULT 'en_attente',
  erreur text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.emails_envoyes TO authenticated;
GRANT ALL ON public.emails_envoyes TO service_role;
ALTER TABLE public.emails_envoyes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emails_select_admin" ON public.emails_envoyes FOR SELECT TO authenticated
  USING (public.is_any_admin(auth.uid()));

-- ============ ACCESS TOKENS ============
CREATE TABLE public.access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.access_tokens TO authenticated;
GRANT ALL ON public.access_tokens TO service_role;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_admin_all" ON public.access_tokens FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ PROFILES / WITHDRAWALS ENRICHMENT ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_status public.kyc_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawals_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS device_info text,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS member_number text;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text;

-- ============ FRAUD DETECTION HELPERS ============
CREATE OR REPLACE FUNCTION public.detect_duplicate_accounts()
RETURNS TABLE(kind text, value text, account_count bigint, user_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'phone', phone, count(*), array_agg(id)
  FROM public.profiles WHERE phone IS NOT NULL AND phone <> ''
  GROUP BY phone HAVING count(*) > 1
  UNION ALL
  SELECT 'device', device_info, count(*), array_agg(id)
  FROM public.profiles WHERE device_info IS NOT NULL AND device_info <> ''
  GROUP BY device_info HAVING count(*) > 1
  UNION ALL
  SELECT 'ip', signup_ip, count(*), array_agg(id)
  FROM public.profiles WHERE signup_ip IS NOT NULL AND signup_ip <> ''
  GROUP BY signup_ip HAVING count(*) > 1;
$$;
REVOKE ALL ON FUNCTION public.detect_duplicate_accounts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_accounts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finance_overview()
RETURNS TABLE(
  total_transactions bigint, total_deposits numeric, total_withdrawals numeric,
  total_commissions numeric, total_wallet_balance numeric, pending_withdrawals bigint,
  pending_kyc bigint, total_users bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.transactions),
    (SELECT coalesce(sum(amount),0) FROM public.deposits WHERE status IN ('approved','completed')),
    (SELECT coalesce(sum(amount),0) FROM public.withdrawals WHERE status IN ('approved','completed')),
    (SELECT coalesce(sum(commission),0) FROM public.referrals),
    (SELECT coalesce(sum(balance),0) FROM public.wallets),
    (SELECT count(*) FROM public.withdrawals WHERE status = 'pending'),
    (SELECT count(*) FROM public.kyc_submissions WHERE status = 'pending'),
    (SELECT count(*) FROM public.profiles);
$$;
REVOKE ALL ON FUNCTION public.finance_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_overview() TO authenticated, service_role;