-- Fase 1 · Peticiones de empresas. Ejecutar DESPUÉS de schema.sql y 002_ingestion.sql. Es aditivo: no borra nada.
-- Flujo: la empresa publica una petición (queda 'pending') → un administrador la aprueba en #/admin → aparece en el buscador →
-- una persona principiante pulsa «Me interesa» → la empresa ve la solicitud en la app → solo si la ACEPTA se revelan los contactos.

alter table public.opportunities add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists opportunities_owner on public.opportunities (owner_id);

-- ───────── contacto de la empresa (privado) ─────────
create table if not exists public.company_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null check (char_length(company_name) between 2 and 120),
  contact_email text not null check (char_length(contact_email) between 5 and 200),
  updated_at timestamptz not null default now()
);
alter table public.company_contacts enable row level security;

-- ───────── solicitudes de interés ─────────
create table if not exists public.opportunity_interests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  skills text[] not null default '{}',
  level text,
  portfolio_url text check (portfolio_url is null or portfolio_url ~* '^https://'),
  message text not null default '' check (char_length(message) <= 1500),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (opportunity_id, user_id)
);
create index if not exists interests_opp on public.opportunity_interests (opportunity_id);
alter table public.opportunity_interests enable row level security;

-- Correo de la persona principiante: solo ella y, si la empresa acepta, la empresa.
create table if not exists public.interest_contacts (
  interest_id uuid primary key references public.opportunity_interests(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 200)
);
alter table public.interest_contacts enable row level security;

-- ───────── funciones auxiliares (security definer para evitar recursión de RLS) ─────────
create or replace function public.owns_opportunity(opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunities where id = opp and owner_id = (select auth.uid()));
$$;
create or replace function public.can_express_interest(opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunities
    where id = opp and owner_id is not null and owner_id <> (select auth.uid())
      and active = true and review_status = 'approved');
$$;
create or replace function public.interest_accepted_for_owner(i uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunity_interests oi join public.opportunities o on o.id = oi.opportunity_id
    where oi.id = i and oi.status = 'accepted' and o.owner_id = (select auth.uid()));
$$;
create or replace function public.company_revealed_to_me(company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunity_interests oi join public.opportunities o on o.id = oi.opportunity_id
    where oi.user_id = (select auth.uid()) and oi.status = 'accepted' and o.owner_id = company);
$$;
revoke all on function public.owns_opportunity(uuid), public.can_express_interest(uuid),
  public.interest_accepted_for_owner(uuid), public.company_revealed_to_me(uuid) from public;
grant execute on function public.owns_opportunity(uuid), public.can_express_interest(uuid),
  public.interest_accepted_for_owner(uuid), public.company_revealed_to_me(uuid) to authenticated;

-- ───────── políticas ─────────
drop policy if exists "opp_owner_select" on public.opportunities;
create policy "opp_owner_select" on public.opportunities for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "opp_owner_insert" on public.opportunities;
create policy "opp_owner_insert" on public.opportunities for insert to authenticated
  with check (owner_id = (select auth.uid()) and review_status = 'pending' and is_demo = false and source_name = 'First Client Finder');
-- Las empresas NO pueden editar (así no pueden aprobarse solas); cerrar o borrar su petición va por estas funciones.
create or replace function public.close_my_request(opp uuid) returns void
language sql security definer set search_path = public as $$
  update public.opportunities set active = false where id = opp and owner_id = (select auth.uid());
$$;
revoke all on function public.close_my_request(uuid) from public;
grant execute on function public.close_my_request(uuid) to authenticated;

drop policy if exists "contacts_self" on public.company_contacts;
create policy "contacts_self" on public.company_contacts for select to authenticated using (user_id = (select auth.uid()) or public.company_revealed_to_me(user_id));
drop policy if exists "contacts_insert" on public.company_contacts;
create policy "contacts_insert" on public.company_contacts for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "contacts_update" on public.company_contacts;
create policy "contacts_update" on public.company_contacts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "contacts_delete" on public.company_contacts;
create policy "contacts_delete" on public.company_contacts for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "interests_select" on public.opportunity_interests;
create policy "interests_select" on public.opportunity_interests for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_opportunity(opportunity_id));
drop policy if exists "interests_insert" on public.opportunity_interests;
create policy "interests_insert" on public.opportunity_interests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and public.can_express_interest(opportunity_id));
drop policy if exists "interests_delete_own" on public.opportunity_interests;
create policy "interests_delete_own" on public.opportunity_interests for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.respond_interest(interest uuid, accept boolean) returns void
language sql security definer set search_path = public as $$
  update public.opportunity_interests oi
     set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
   where oi.id = interest and public.owns_opportunity(oi.opportunity_id);
$$;
revoke all on function public.respond_interest(uuid, boolean) from public;
grant execute on function public.respond_interest(uuid, boolean) to authenticated;

drop policy if exists "icontacts_select" on public.interest_contacts;
create policy "icontacts_select" on public.interest_contacts for select to authenticated
  using (exists (select 1 from public.opportunity_interests oi where oi.id = interest_id and oi.user_id = (select auth.uid()))
         or public.interest_accepted_for_owner(interest_id));
drop policy if exists "icontacts_insert" on public.interest_contacts;
create policy "icontacts_insert" on public.interest_contacts for insert to authenticated
  with check (exists (select 1 from public.opportunity_interests oi where oi.id = interest_id and oi.user_id = (select auth.uid())));
