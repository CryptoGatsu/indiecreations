-- Holder revenue share and the public economy numbers (revenue from every game, tokens burned).
-- Run once in the Supabase SQL editor (or as a migration) for the project the site uses, after supabase/shop.sql.
--
-- Everything here is written ONLY by the site's server (the /api/cron/revshare job) with the service-role key. Row
-- Level Security is on with no policies, so the public "anon" key can neither read nor write these tables; the site
-- publishes what is public through its own API routes.

-- Every $creations Transfer on Robinhood Chain, copied from the chain by the cron job. Balances at any moment, burns
-- and on-chain game revenue are all worked out from this.
create table if not exists public.token_transfers (
  block_number bigint        not null,
  log_index    integer       not null,
  block_time   timestamptz   not null,
  tx_hash      text          not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  from_addr    text          not null check (from_addr ~ '^0x[0-9a-f]{40}$'),
  to_addr      text          not null check (to_addr ~ '^0x[0-9a-f]{40}$'),
  value        numeric(78, 0) not null check (value >= 0),
  primary key (block_number, log_index)
);
create index if not exists token_transfers_time_idx on public.token_transfers (block_time);
create index if not exists token_transfers_to_idx on public.token_transfers (to_addr, block_time);
create index if not exists token_transfers_from_idx on public.token_transfers (from_addr, block_time);

-- How far the copy has got (one row per indexed token).
create table if not exists public.chain_index_state (
  id         text        primary key,
  last_block bigint      not null,
  updated_at timestamptz not null default now()
);

-- One row per month once it has closed.
--   carried:   revenue below the minimum; it rolls into the next month's pool, nothing is paid.
--   computed:  the split is worked out and the claims are stored; the on-chain publish is still to happen.
--   published: live on the contract; holders can claim.
create table if not exists public.revshare_epochs (
  month               text           primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status              text           not null check (status in ('carried', 'computed', 'published')),
  orders              integer        not null default 0,
  revenue_usd_cents   bigint         not null default 0,   -- this month's revenue from every game
  revenue_raw         numeric(78, 0) not null default 0,   -- the same in $creations base units
  pool_raw            numeric(78, 0) not null default 0,   -- holder share of this month + any carried months
  paid_out_raw        numeric(78, 0) not null default 0,   -- pool after rounding each holder down
  holders             integer        not null default 0,
  root                text,
  total_allocated_raw numeric(78, 0),                      -- every holder's running total, summed
  seed_block          bigint,
  seed                text,
  snapshots           jsonb,                               -- the snapshot moments, ISO strings
  tree                jsonb,                               -- the full Merkle tree (StandardMerkleTree dump), public
  tx_hash             text,
  created_at          timestamptz    not null default now(),
  published_at        timestamptz
);

-- What each wallet can claim under a given root: its running total and its Merkle proof.
create table if not exists public.revshare_claims (
  root       text           not null,
  address    text           not null check (address ~ '^0x[0-9a-f]{40}$'),
  cumulative numeric(78, 0) not null,
  proof      jsonb          not null,
  primary key (root, address)
);

alter table public.token_transfers enable row level security;
alter table public.chain_index_state enable row level security;
alter table public.revshare_epochs enable row level security;
alter table public.revshare_claims enable row level security;

-- Token amounts come back as text: they are 256-bit integers and JSON numbers would round them.

-- Every wallet's balance as it stood at moment t (transfers mined at or before t count), positive balances only.
-- Called page by page through the REST API (?limit=&offset=), hence the stable order.
create or replace function public.revshare_balances_at(t timestamptz)
returns table (address text, balance text)
language sql stable as $$
  select address, sum(delta)::text as balance
  from (
    select to_addr as address, value as delta from public.token_transfers where block_time <= t
    union all
    select from_addr as address, -value as delta from public.token_transfers where block_time <= t
  ) moves
  group by address
  having sum(delta) > 0
  order by address
$$;

-- Total value and count of transfers TO any of to_addrs, optionally only FROM from_addrs and inside [t0, t1).
-- Used for burns (to the burn addresses) and on-chain game revenue (to a game's shop contract).
create or replace function public.transfers_total(
  to_addrs text[],
  from_addrs text[] default null,
  t0 timestamptz default null,
  t1 timestamptz default null
)
returns table (total text, transfers bigint)
language sql stable as $$
  select coalesce(sum(value), 0)::text, count(*)
  from public.token_transfers
  where to_addr = any (to_addrs)
    and (from_addrs is null or from_addr = any (from_addrs))
    and (t0 is null or block_time >= t0)
    and (t1 is null or block_time < t1)
$$;

-- Paid shop orders per game, optionally only those paid inside [t0, t1).
create or replace function public.shop_revenue(t0 timestamptz default null, t1 timestamptz default null)
returns table (game text, orders bigint, usd_cents bigint, amount_raw text)
language sql stable as $$
  select game, count(*), coalesce(sum(usd_cents), 0)::bigint, coalesce(sum(amount_raw::numeric), 0)::text
  from public.shop_orders
  where status = 'paid'
    and (t0 is null or paid_at >= t0)
    and (t1 is null or paid_at < t1)
  group by game
  order by game
$$;

-- Keep the functions server-only, like the tables: only the service role (the site's server) may call them.
revoke execute on function public.revshare_balances_at(timestamptz) from public, anon, authenticated;
revoke execute on function public.transfers_total(text[], text[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.shop_revenue(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.revshare_balances_at(timestamptz) to service_role;
grant execute on function public.transfers_total(text[], text[], timestamptz, timestamptz) to service_role;
grant execute on function public.shop_revenue(timestamptz, timestamptz) to service_role;

-- Burns owed from checkout sales (games with `burnBps` in lib/games.js), one row per month and game. The job records
-- the burn when the month closes and sends it from the treasury before that month's payout is published.
--   owed:    worked out, not sent yet (the job burns it through the treasury's allowance, or the treasury burns by hand)
--   sent:    the burn transaction is out; the job waits for its receipt
--   burned:  done (tx_hash is null when the treasury burned by hand and the job found it in token_transfers)
create table if not exists public.revshare_burns (
  month      text           not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  game       text           not null,
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  status     text           not null default 'owed' check (status in ('owed', 'sent', 'burned')),
  tx_hash    text           check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz    not null default now(),
  burned_at  timestamptz,
  primary key (month, game)
);
alter table public.revshare_burns enable row level security;
