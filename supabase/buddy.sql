-- Don't Worry, You're Safe! (/youre-safe): cloud saves and the Inner Voice's usage log.
-- Run once in the Supabase SQL editor (or as a migration) for the project whose URL / service key the site uses.
-- Purchases need nothing new: they are ordinary rows in shop_orders / shop_entitlements (supabase/shop.sql), owned by
-- the paying wallet, with game = 'Don''t Worry, You''re Safe!' and item ids ys-<item>.
--
-- Like the shop tables, these are touched ONLY by the site's server with the service-role key. Row Level Security is
-- on with no policies, so the public "anon" key can neither read nor write them.

create table if not exists public.buddy_saves (
  wallet      text        primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  version     integer     not null check (version between 1 and 1000),  -- the game's save format version
  state       jsonb       not null check (pg_column_size(state) <= 300000),
  updated_at  timestamptz not null default now()
);

-- one row per Inner Voice line written, for the per-wallet daily allowance
create table if not exists public.buddy_voice_log (
  id      bigint      generated always as identity primary key,
  wallet  text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  kind    text        not null check (kind in ('journal', 'greet')),
  at      timestamptz not null default now()
);

create index if not exists buddy_voice_log_wallet_at_idx on public.buddy_voice_log (wallet, at desc);

alter table public.buddy_saves enable row level security;
alter table public.buddy_voice_log enable row level security;
