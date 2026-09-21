-- RiderOS Supabase schema
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query) for your
-- project (the one whose URL/anon key are in .env), or via `supabase db push` if you
-- use the Supabase CLI. Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: one row per Supabase Auth user, auto-created on signup (trigger below)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operational tables (mirrors the previous SQLite schema in src/services/localDb.js)
-- ---------------------------------------------------------------------------
create table if not exists public.platforms (
  id text primary key default ('platform_' || gen_random_uuid()),
  name text not null,
  category text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.places (
  id text primary key default ('place_' || gen_random_uuid()),
  name text not null,
  type text not null,
  address text,
  latitude double precision,
  longitude double precision,
  platform_id text references public.platforms(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.riders (
  id text primary key default ('rider_' || gen_random_uuid()),
  name text not null,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key default ('ord_' || gen_random_uuid()),
  code text not null,
  platform_id text references public.platforms(id) on delete set null,
  rider_id text references public.riders(id) on delete set null,
  status text not null default 'Allocated',
  pickup_place_id text references public.places(id) on delete set null,
  pickup_address text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  drop_address text,
  drop_latitude double precision,
  drop_longitude double precision,
  earning numeric not null default 0,
  distance_km numeric not null default 0,
  duration_min numeric not null default 0,
  payment_type text not null default 'PREPAID',
  cod_amount numeric not null default 0,
  notes text,
  accepted_at timestamptz,
  arrived_pickup_at timestamptz,
  picked_up_at timestamptz,
  arrived_customer_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id text primary key default ('trip_' || gen_random_uuid()),
  name text not null,
  rider_id text references public.riders(id) on delete set null,
  status text not null default 'Planned',
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_orders (
  trip_id text not null references public.trips(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  sequence_no integer not null,
  phase text not null,
  primary key (trip_id, order_id)
);

create table if not exists public.gps_events (
  id text primary key default ('gps_' || gen_random_uuid()),
  order_id text references public.orders(id) on delete cascade,
  trip_id text references public.trips(id) on delete set null,
  event_type text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  captured_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id text primary key default ('goal_' || gen_random_uuid()),
  name text not null,
  target numeric not null,
  saved numeric not null default 0,
  deadline date,
  rule text not null,
  rule_value numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key default ('pay_' || gen_random_uuid()),
  order_id text references public.orders(id) on delete cascade,
  amount numeric not null,
  method text not null,
  upi_reference text,
  status text not null,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_places_platform on public.places(platform_id);
create index if not exists idx_orders_platform on public.orders(platform_id);
create index if not exists idx_orders_pickup_place on public.orders(pickup_place_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_code on public.orders(code);
create index if not exists idx_gps_events_order on public.gps_events(order_id);
create index if not exists idx_gps_events_captured_at on public.gps_events(captured_at);
create index if not exists idx_payments_order on public.payments(order_id);

-- ---------------------------------------------------------------------------
-- Row Level Security. RiderOS is a single-business cockpit: any signed-in
-- (authenticated) user can read/write every operational table. Tighten these
-- later if you add multiple riders/owners who should only see their own slice.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platforms enable row level security;
alter table public.places enable row level security;
alter table public.riders enable row level security;
alter table public.orders enable row level security;
alter table public.trips enable row level security;
alter table public.trip_orders enable row level security;
alter table public.gps_events enable row level security;
alter table public.goals enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['platforms','places','riders','orders','trips','trip_orders','gps_events','goals','payments']
  loop
    execute format('drop policy if exists "authenticated_all" on public.%I;', table_name);
    execute format(
      'create policy "authenticated_all" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new Auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
