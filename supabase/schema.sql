-- Casa Viva — schema (Supabase / Postgres)
-- Rode isso no SQL editor do seu projeto Supabase.
--
-- ATENÇÃO: este arquivo assume um projeto novo (ou que você já apagou as
-- tabelas antigas do Diário de Trades). Se ainda existirem `trades` e
-- `user_settings` de um projeto anterior, rode antes:
--   drop table if exists public.trades cascade;
--   drop table if exists public.user_settings cascade;

create extension if not exists "pgcrypto";

-- ---------- Casas ----------
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Minha casa',
  created_at timestamptz not null default now()
);

-- ---------- Membros de cada casa ----------
create table if not exists public.household_members (
  household_id       uuid not null references public.households(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  income_percentage   numeric check (income_percentage >= 0 and income_percentage <= 100),
  created_at          timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Função auxiliar (security definer, evita recursão de RLS): checa se o
-- usuário logado pertence à casa informada.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = auth.uid()
  );
$$;

-- ---------- Órgãos financeiros (categorias) ----------
create table if not exists public.categories (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  name              text not null,
  budget_amount     numeric check (budget_amount >= 0), -- o "acordo" mensal (renegociável)
  threshold_yellow  integer not null default 80 check (threshold_yellow between 0 and 200),
  threshold_red     integer not null default 100 check (threshold_red between 0 and 200),
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------- Gastos ----------
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount          numeric not null check (amount > 0),
  expense_date    date not null default current_date,
  description     text,
  payment_method  text check (payment_method in ('dinheiro','debito','credito','pix','transferencia','outro')),
  created_at      timestamptz not null default now()
);

create index if not exists household_members_user_id_idx on public.household_members (user_id);
create index if not exists categories_household_id_idx on public.categories (household_id);
create index if not exists expenses_household_id_idx on public.expenses (household_id);
create index if not exists expenses_category_id_idx on public.expenses (category_id);
create index if not exists expenses_date_idx on public.expenses (expense_date);

-- ---------- RLS ----------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Authenticated users can create a household" on public.households;
create policy "Authenticated users can create a household"
  on public.households for insert
  with check (auth.uid() is not null);

drop policy if exists "Members can view their household" on public.households;
create policy "Members can view their household"
  on public.households for select
  using (public.is_household_member(id));

drop policy if exists "Members can update their household" on public.households;
create policy "Members can update their household"
  on public.households for update
  using (public.is_household_member(id));

drop policy if exists "Members can view co-members" on public.household_members;
create policy "Members can view co-members"
  on public.household_members for select
  using (public.is_household_member(household_id));

drop policy if exists "Users can add themselves to a household" on public.household_members;
create policy "Users can add themselves to a household"
  on public.household_members for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own membership" on public.household_members;
create policy "Users can update their own membership"
  on public.household_members for update
  using (user_id = auth.uid());

drop policy if exists "Members manage categories of their household" on public.categories;
create policy "Members manage categories of their household"
  on public.categories for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "Members manage expenses of their household" on public.expenses;
create policy "Members manage expenses of their household"
  on public.expenses for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
