-- Cosmetics shop for Indie Creations: orders paid in $creations and the cosmetics each Steam account owns.
-- Run once in the Supabase SQL editor (or as a migration) for the project whose URL / service key the site uses.
--
-- Like `feedback`, these tables are touched ONLY by the site's server with the service-role key. Row Level Security
-- is on with no policies, so the public "anon" key can neither read nor write them.

create table if not exists public.shop_orders (
  id          uuid        primary key,
  steam_id    text        not null check (steam_id ~ '^[0-9]{17}$'),
  item_id     text        not null check (item_id ~ '^[a-z0-9-]{1,64}$'),
  game        text        not null check (char_length(game) between 1 and 120),
  wallet      text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  usd_cents   integer     not null check (usd_cents > 0),
  price_usd   numeric     not null check (price_usd > 0),          -- $ per token when the quote was made
  amount_raw  text        not null check (amount_raw ~ '^[0-9]+$'), -- exact token amount to pay, in base units (wei)
  treasury    text        not null check (treasury ~ '^0x[0-9a-f]{40}$'),
  status      text        not null default 'pending' check (status in ('pending', 'paid')),
  tx_hash     text        check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  paid_at     timestamptz
);

-- one on-chain payment can only ever settle one order
create unique index if not exists shop_orders_tx_hash_key on public.shop_orders (tx_hash) where tx_hash is not null;
create index if not exists shop_orders_lookup_idx on public.shop_orders (steam_id, item_id, wallet, status);

create table if not exists public.shop_entitlements (
  steam_id    text        not null check (steam_id ~ '^[0-9]{17}$'),
  item_id     text        not null check (item_id ~ '^[a-z0-9-]{1,64}$'),
  game        text        not null,
  order_id    uuid        references public.shop_orders (id),
  created_at  timestamptz not null default now(),
  primary key (steam_id, item_id)
);

create index if not exists shop_entitlements_game_idx on public.shop_entitlements (steam_id, game);

alter table public.shop_orders enable row level security;
alter table public.shop_entitlements enable row level security;
