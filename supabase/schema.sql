-- First Client Finder — esquema de Supabase.
-- Ejecuta este archivo en el SQL Editor de tu proyecto (o como migración).
-- Principio: cada usuario solo ve y modifica SUS filas (RLS). Las oportunidades
-- las gestiona el administrador (service role) y son de solo lectura para clientes.

-- ───────── perfiles ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  lang text,
  level text not null default 'none' check (level in ('none','junior','mid','senior')),
  skills text[] not null default '{}',
  services text[] not null default '{}',
  has_portfolio boolean not null default false,
  portfolio_url text not null default '',
  goals text[] not null default '{}',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────── suscripciones (el plan NO lo puede cambiar el cliente) ─────────
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  updated_at timestamptz not null default now()
);

-- ───────── oportunidades (fuentes autorizadas; solo lectura para usuarios) ─────────
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  client_name text,
  budget_min numeric,
  budget_max numeric,
  currency text default 'EUR',
  budget_type text default 'fixed' check (budget_type in ('fixed','hourly')),
  skills text[] not null default '{}',
  category text not null default 'other',
  experience text not null default 'junior' check (experience in ('none','junior','mid','senior')),
  complexity smallint not null default 3 check (complexity between 1 and 5),
  portfolio_required boolean not null default false,
  needs text[] not null default '{}',
  posted_at timestamptz,
  verified_at timestamptz,
  source_name text not null,
  source_url text,                 -- enlace a la fuente original
  license_note text,               -- permiso/licencia con la que se usa la fuente
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists opportunities_active_posted on public.opportunities (active, posted_at desc);

-- ───────── seguimiento personal ─────────
create table if not exists public.tracked_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null,    -- id de la oportunidad (texto: también admite ids demo)
  status text not null default 'saved' check (status in ('new','saved','preparing','sent','replied','won','lost')),
  notes jsonb not null default '[]',
  dates jsonb not null default '{}',
  follow_up_at date,
  snapshot jsonb,                  -- copia de la oportunidad al guardarla
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.opportunities enable row level security;
alter table public.tracked_opportunities enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
-- Sin políticas de insert/update: solo el service role (webhooks de pago futuros) puede escribir.

drop policy if exists "opportunities_read_active" on public.opportunities;
create policy "opportunities_read_active" on public.opportunities for select to anon, authenticated
  using (active = true);
-- Sin políticas de escritura: las inserciones las hace el administrador con service role.

drop policy if exists "tracked_own" on public.tracked_opportunities;
create policy "tracked_own" on public.tracked_opportunities for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ───────── fila de suscripción gratuita al registrarse ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (user_id, plan) values (new.id, 'free') on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
