-- =====================================================================
-- ADS Platform — migration à appliquer sur le projet Supabase ADS
-- (SQL Editor du projet ADS, en une seule exécution)
--
-- Contenu :
--   1. profiles.photo_url
--   2. table qr_tokens        (QR dépôt / retrait agent, expiration 15 min)
--   3. table api_partenaires  (clés API hashées + permissions)
--   4. table api_logs
--   5. table transactions_croisees
--   6. fonctions : generer_qr_retrait, verifier_qr_retrait, verifier_qr_depot,
--                  confirmer_depot_agent, valider_retrait_agent
--   7. Realtime sur transactions, qr_tokens, journal, account_validations
-- Idempotent : peut être ré-exécuté sans risque.
-- =====================================================================

-- ------------------------------------------------------------------ 1
alter table public.profiles add column if not exists photo_url text;

-- ------------------------------------------------------------------ 2
create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('depot','retrait')),
  user_id uuid not null references auth.users(id) on delete cascade,
  montant numeric not null check (montant > 0),
  statut text not null default 'actif' check (statut in ('actif','used','expire','annule')),
  agent_id uuid references auth.users(id),
  numero_piece text,
  used_at timestamptz,
  expire_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qr_tokens_user_idx on public.qr_tokens(user_id);
create index if not exists qr_tokens_statut_idx on public.qr_tokens(statut);

grant select, insert, update on public.qr_tokens to authenticated;
grant all on public.qr_tokens to service_role;
alter table public.qr_tokens enable row level security;

drop policy if exists qr_tokens_select_own on public.qr_tokens;
create policy qr_tokens_select_own on public.qr_tokens
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin','agent'))
  );

drop policy if exists qr_tokens_insert_own on public.qr_tokens;
create policy qr_tokens_insert_own on public.qr_tokens
  for insert to authenticated
  with check (user_id = auth.uid() and statut = 'actif');

drop policy if exists qr_tokens_update_agent on public.qr_tokens;
create policy qr_tokens_update_agent on public.qr_tokens
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin','agent'))
  )
  with check (true);

-- ------------------------------------------------------------------ 3
create table if not exists public.api_partenaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  key_prefix text not null,
  key_hash text not null unique,
  permissions jsonb not null default '["read"]'::jsonb,
  actif boolean not null default true,
  rate_limit integer not null default 120,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.api_partenaires to authenticated;
grant all on public.api_partenaires to service_role;
alter table public.api_partenaires enable row level security;

drop policy if exists api_partenaires_admin on public.api_partenaires;
create policy api_partenaires_admin on public.api_partenaires
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- ------------------------------------------------------------------ 4
create table if not exists public.api_logs (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid references public.api_partenaires(id) on delete set null,
  endpoint text not null,
  methode text not null default 'POST',
  statut integer not null default 200,
  duree_ms integer,
  ip text,
  payload jsonb,
  created_at timestamptz not null default now()
);

grant select on public.api_logs to authenticated;
grant all on public.api_logs to service_role;
alter table public.api_logs enable row level security;

drop policy if exists api_logs_admin_read on public.api_logs;
create policy api_logs_admin_read on public.api_logs
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- ------------------------------------------------------------------ 5
create table if not exists public.transactions_croisees (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid references public.api_partenaires(id) on delete set null,
  reference_externe text,
  user_id uuid references auth.users(id),
  montant numeric not null check (montant > 0),
  devise text not null default 'XOF',
  statut text not null default 'pending' check (statut in ('pending','completed','failed','annule')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.transactions_croisees to authenticated;
grant all on public.transactions_croisees to service_role;
alter table public.transactions_croisees enable row level security;

drop policy if exists tc_read on public.transactions_croisees;
create policy tc_read on public.transactions_croisees
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
  );

-- ------------------------------------------------------------------ 6
-- Génère un QR de retrait chez un agent : code WTD-XXXXXX, 15 minutes.
create or replace function public.generer_qr_retrait(p_montant numeric)
returns table(code text, expire_at timestamptz, montant numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_solde numeric;
  v_jour numeric;
  v_code text;
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide';
  end if;

  select coalesce(p.solde, 0) into v_solde from public.profiles p where p.id = v_user;
  if v_solde < p_montant then
    raise exception 'Solde insuffisant';
  end if;

  select coalesce(sum(q.montant), 0) into v_jour
  from public.qr_tokens q
  where q.user_id = v_user
    and q.type = 'retrait'
    and q.statut in ('actif','used')
    and q.created_at >= date_trunc('day', now());

  if v_jour + p_montant > 500000 then
    raise exception 'Limite de 500 000 FCFA par jour dépassée';
  end if;

  -- un seul QR retrait actif à la fois
  update public.qr_tokens
     set statut = 'annule', updated_at = now()
   where user_id = v_user and type = 'retrait' and statut = 'actif';

  v_code := 'WTD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qr_tokens (code, type, user_id, montant, statut, expire_at)
  values (v_code, 'retrait', v_user, p_montant, 'actif', now() + interval '15 minutes');

  return query
    select v_code, (now() + interval '15 minutes')::timestamptz, p_montant;
end;
$$;

grant execute on function public.generer_qr_retrait(numeric) to authenticated;

-- Lecture d'un QR (retrait / dépôt) par l'agent.
create or replace function public.verifier_qr_retrait(qr_code text)
returns table(
  success boolean, message text, code text, montant numeric, statut text,
  user_id uuid, nom text, numero_membre text, photo_url text, expire_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  select q.*, p.nom as p_nom, p.numero_membre as p_num, p.photo_url as p_photo
    into r
  from public.qr_tokens q
  left join public.profiles p on p.id = q.user_id
  where q.code = qr_code and q.type = 'retrait';

  if not found then
    return query select false, 'QR introuvable', qr_code, 0::numeric, 'inconnu', null::uuid, null, null, null, null::timestamptz;
    return;
  end if;

  return query select
    (r.statut = 'actif' and r.expire_at > now()),
    case when r.statut = 'used' then 'Déjà utilisé'
         when r.expire_at <= now() then 'Code expiré'
         when r.statut <> 'actif' then 'Code annulé'
         else 'Retrait à remettre' end,
    r.code, r.montant, r.statut, r.user_id, r.p_nom, r.p_num, r.p_photo, r.expire_at;
end;
$$;

grant execute on function public.verifier_qr_retrait(text) to authenticated;

create or replace function public.verifier_qr_depot(qr_code text)
returns table(
  success boolean, message text, code text, montant numeric, statut text,
  user_id uuid, nom text, numero_membre text, photo_url text, expire_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  select q.*, p.nom as p_nom, p.numero_membre as p_num, p.photo_url as p_photo
    into r
  from public.qr_tokens q
  left join public.profiles p on p.id = q.user_id
  where q.code = qr_code and q.type = 'depot';

  if not found then
    return query select false, 'QR introuvable', qr_code, 0::numeric, 'inconnu', null::uuid, null, null, null, null::timestamptz;
    return;
  end if;

  return query select
    (r.statut = 'actif' and r.expire_at > now()),
    case when r.statut = 'used' then 'Déjà utilisé'
         when r.expire_at <= now() then 'Code expiré'
         else 'Dépôt à recevoir' end,
    r.code, r.montant, r.statut, r.user_id, r.p_nom, r.p_num, r.p_photo, r.expire_at;
end;
$$;

grant execute on function public.verifier_qr_depot(text) to authenticated;

-- L'agent encaisse l'argent du membre (dépôt en agence) : crédite le solde.
create or replace function public.confirmer_depot_agent(qr_code text, agent_id uuid, numero_piece text)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare r public.qr_tokens;
begin
  select * into r from public.qr_tokens where code = qr_code and type = 'depot' for update;
  if not found then return query select false, 'QR introuvable'; return; end if;
  if r.statut = 'used' then return query select false, 'Dépôt déjà encaissé'; return; end if;
  if r.expire_at <= now() then return query select false, 'Code expiré'; return; end if;
  if numero_piece is null or length(trim(numero_piece)) < 3 then
    return query select false, 'Pièce d''identité obligatoire'; return;
  end if;

  update public.qr_tokens
     set statut = 'used', used_at = now(), agent_id = confirmer_depot_agent.agent_id,
         numero_piece = confirmer_depot_agent.numero_piece, updated_at = now()
   where id = r.id;

  update public.profiles set solde = coalesce(solde, 0) + r.montant where id = r.user_id;

  insert into public.transactions (user_id, type, montant, statut, description)
  values (r.user_id, 'depot_agent', r.montant, 'completed', 'Dépôt en agence ' || r.code);

  insert into public.journal (user_id, action, description)
  values (confirmer_depot_agent.agent_id, 'depot_agent',
          r.code || ' · ' || r.montant || ' FCFA · pièce ' || numero_piece);

  return query select true, 'Dépôt de ' || r.montant || ' FCFA encaissé';
end;
$$;

grant execute on function public.confirmer_depot_agent(text, uuid, text) to authenticated;

-- L'agent remet l'argent au membre (retrait en agence) : débite le solde.
create or replace function public.valider_retrait_agent(qr_code text, agent_id uuid, numero_piece text)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.qr_tokens;
  v_solde numeric;
begin
  select * into r from public.qr_tokens where code = qr_code and type = 'retrait' for update;
  if not found then return query select false, 'QR introuvable'; return; end if;
  if r.statut = 'used' then return query select false, 'Retrait déjà remis'; return; end if;
  if r.expire_at <= now() then return query select false, 'Code expiré'; return; end if;
  if numero_piece is null or length(trim(numero_piece)) < 3 then
    return query select false, 'Pièce d''identité obligatoire'; return;
  end if;

  select coalesce(solde, 0) into v_solde from public.profiles where id = r.user_id;
  if v_solde < r.montant then return query select false, 'Solde insuffisant'; return; end if;

  update public.qr_tokens
     set statut = 'used', used_at = now(), agent_id = valider_retrait_agent.agent_id,
         numero_piece = valider_retrait_agent.numero_piece, updated_at = now()
   where id = r.id;

  update public.profiles set solde = coalesce(solde, 0) - r.montant where id = r.user_id;

  insert into public.retraits (user_id, montant, statut, methode)
  values (r.user_id, r.montant, 'completed', 'agent');

  insert into public.transactions (user_id, type, montant, statut, description)
  values (r.user_id, 'retrait_agent', r.montant, 'completed', 'Retrait chez un agent ' || r.code);

  insert into public.journal (user_id, action, description)
  values (valider_retrait_agent.agent_id, 'retrait_agent',
          r.code || ' · ' || r.montant || ' FCFA · pièce ' || numero_piece);

  return query select true, 'Retrait de ' || r.montant || ' FCFA remis au membre';
end;
$$;

grant execute on function public.valider_retrait_agent(text, uuid, text) to authenticated;

-- ------------------------------------------------------------------ 7
alter table public.qr_tokens replica identity full;
alter table public.transactions replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.qr_tokens'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.transactions'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.journal'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.account_validations'; exception when duplicate_object then null; end;
end $$;
