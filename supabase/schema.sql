-- Diário de Trades com Psicologia — schema inicial (Supabase / Postgres)
-- Rode isso no SQL editor do seu projeto Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asset         text not null,
  side          text not null check (side in ('compra','venda')),
  quantity      numeric not null check (quantity > 0),
  entry_price   numeric not null check (entry_price > 0),
  exit_price    numeric check (exit_price > 0),
  stop_loss     numeric,
  take_profit   numeric,
  entry_at      timestamptz not null,
  exit_at       timestamptz,
  emotion_before text,
  emotion_after  text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists trades_user_id_idx on public.trades (user_id);
create index if not exists trades_entry_at_idx on public.trades (entry_at);

alter table public.trades enable row level security;

drop policy if exists "Users manage their own trades" on public.trades;
create policy "Users manage their own trades"
  on public.trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Regras de disciplina configuráveis por usuário (tamanho máx. de posição,
-- janela de horário permitido, limiar do score que conta pro streak).
create table if not exists public.user_settings (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  max_position_size   numeric,
  trading_start_time  time,
  trading_end_time    time,
  discipline_threshold integer not null default 80 check (discipline_threshold between 0 and 100),
  updated_at          timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users manage their own settings" on public.user_settings;
create policy "Users manage their own settings"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
