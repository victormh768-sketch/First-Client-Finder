-- Ingesta de oportunidades reales + panel de administración.
-- Migración ADITIVA e idempotente: no borra tablas, columnas ni filas. Requiere haber ejecutado schema.sql.
-- Las oportunidades que ya existieran quedan como 'approved' (siguen visibles como antes).

-- ───────── administradores (nadie puede hacerse admin desde el cliente) ─────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins for select to authenticated using ((select auth.uid()) = user_id);
-- Sin políticas de escritura. Para añadir un admin, desde el SQL Editor:
--   insert into public.admins (user_id) select id from auth.users where email = 'tu@correo.com';

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ───────── fuentes ─────────
create table if not exists public.sources (
  id text primary key,
  name text not null,
  platform text not null,
  legal_status text not null default 'blocked' check (legal_status in ('open','terms','approved','approval','blocked')),
  enabled boolean not null default false,
  config jsonb not null default '{}',
  min_interval_hours int not null default 12,
  max_age_days int not null default 45,
  notes text,
  last_sync_at timestamptz,
  last_status text check (last_status in ('ok','error','skipped')),
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.sources enable row level security;
drop policy if exists "sources_admin_select" on public.sources;
create policy "sources_admin_select" on public.sources for select to authenticated using (public.is_admin());
drop policy if exists "sources_admin_update" on public.sources;
create policy "sources_admin_update" on public.sources for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Las filas las crea la Edge Function (service role) a partir del registro de fuentes.

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  source_id text not null references public.sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb not null default '{}',
  error text
);
create index if not exists sync_runs_source_started on public.sync_runs (source_id, started_at desc);
alter table public.sync_runs enable row level security;
drop policy if exists "sync_runs_admin_select" on public.sync_runs;
create policy "sync_runs_admin_select" on public.sync_runs for select to authenticated using (public.is_admin());

-- ───────── columnas nuevas en opportunities ─────────
alter table public.opportunities
  add column if not exists platform text,
  add column if not exists external_id text,
  add column if not exists source_id text references public.sources(id) on delete set null,
  add column if not exists review_status text not null default 'approved',   -- lo existente sigue publicado
  add column if not exists verification text not null default 'unverified',
  add column if not exists last_checked_at timestamptz,
  add column if not exists fingerprint text,
  add column if not exists duplicate_of text,
  add column if not exists duplicate_info jsonb,
  add column if not exists reasons text[] not null default '{}',
  add column if not exists estimated text[] not null default '{}',
  add column if not exists fit_score smallint,
  add column if not exists analysis jsonb,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Lo que se importe a partir de ahora NO se publica hasta que un administrador lo apruebe.
alter table public.opportunities alter column review_status set default 'pending';

do $$ begin
  alter table public.opportunities add constraint opportunities_review_status_chk
    check (review_status in ('pending','approved','rejected','duplicate','expired'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_verification_chk
    check (verification in ('unverified','link_ok','reviewed','expired'));
exception when duplicate_object then null; end $$;

-- Único (no parcial) para que sirva a ON CONFLICT; los NULL no chocan entre sí, así que las filas manuales no se ven afectadas.
create unique index if not exists opportunities_source_external on public.opportunities (source_id, external_id);
create index if not exists opportunities_review on public.opportunities (review_status, posted_at desc);
create index if not exists opportunities_fingerprint on public.opportunities (fingerprint);

-- Lectura pública: SOLO aprobadas y activas.
drop policy if exists "opportunities_read_active" on public.opportunities;
create policy "opportunities_read_active" on public.opportunities for select to anon, authenticated
  using (active = true and review_status = 'approved');

-- Administradores: ver todo, revisar (update) y añadir manualmente (insert). Sin delete: se rechaza, no se borra.
drop policy if exists "opportunities_admin_select" on public.opportunities;
create policy "opportunities_admin_select" on public.opportunities for select to authenticated using (public.is_admin());
drop policy if exists "opportunities_admin_update" on public.opportunities;
create policy "opportunities_admin_update" on public.opportunities for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "opportunities_admin_insert" on public.opportunities;
create policy "opportunities_admin_insert" on public.opportunities for insert to authenticated with check (public.is_admin());

-- ───────── programación (opcional) ─────────
-- Tras desplegar la función `sync-sources` y definir el secreto CRON_SECRET, puedes programarla cada 12 h
-- con pg_cron + pg_net (Database → Extensions). Sustituye <PROJECT_REF> y <CRON_SECRET>:
--
-- select cron.schedule('sync-sources', '0 */12 * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-sources',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--     body := '{}'::jsonb);
-- $$);
