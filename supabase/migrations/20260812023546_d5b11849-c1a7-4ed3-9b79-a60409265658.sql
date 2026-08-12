CREATE OR REPLACE FUNCTION public.detect_duplicate_accounts()
RETURNS TABLE(kind text, value text, account_count bigint, user_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT 'phone'::text, p.phone, count(*), array_agg(p.id)
  FROM public.profiles p WHERE p.phone IS NOT NULL AND p.phone <> ''
  GROUP BY p.phone HAVING count(*) > 1
  UNION ALL
  SELECT 'device'::text, p.device_info, count(*), array_agg(p.id)
  FROM public.profiles p WHERE p.device_info IS NOT NULL AND p.device_info <> ''
  GROUP BY p.device_info HAVING count(*) > 1
  UNION ALL
  SELECT 'ip'::text, p.signup_ip, count(*), array_agg(p.id)
  FROM public.profiles p WHERE p.signup_ip IS NOT NULL AND p.signup_ip <> ''
  GROUP BY p.signup_ip HAVING count(*) > 1;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_overview()
RETURNS TABLE(
  total_transactions bigint, total_deposits numeric, total_withdrawals numeric,
  total_commissions numeric, total_wallet_balance numeric, pending_withdrawals bigint,
  pending_kyc bigint, total_users bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.transactions),
    (SELECT coalesce(sum(d.amount),0) FROM public.deposits d WHERE d.status IN ('approved','completed')),
    (SELECT coalesce(sum(w.amount),0) FROM public.withdrawals w WHERE w.status IN ('approved','completed')),
    (SELECT coalesce(sum(r.commission),0) FROM public.referrals r),
    (SELECT coalesce(sum(wa.balance),0) FROM public.wallets wa),
    (SELECT count(*) FROM public.withdrawals w2 WHERE w2.status = 'pending'),
    (SELECT count(*) FROM public.kyc_submissions k WHERE k.status = 'pending'),
    (SELECT count(*) FROM public.profiles);
END; $$;

REVOKE ALL ON FUNCTION public.detect_duplicate_accounts() FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_accounts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_overview() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_admin_role(uuid, public.admin_role_type) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_any_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(uuid, public.admin_role_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated, service_role;