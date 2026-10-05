-- Creator stores: the creator of a community game (/community) sells items for it, paid in $CREATIONS through the
-- site's own checkout (lib/shop.js). Every payment goes to the treasury; the order records who sold it and their cut
-- (seller_bps, 2000 = 20%). That cut is added to the seller's running total in the next monthly payout on the
-- RevenueShare contract (lib/revshareJob.js), and only the rest counts as revenue for the holder share.
-- Run after supabase/shop.sql, supabase/revshare.sql and supabase/creations.sql. Safe to run again.
--
-- Like the other tables, touched ONLY by the site's server with the service-role key: RLS on, no policies.

create table if not exists public.creations_items (
  id          text        primary key check (id ~ '^ci-[a-z0-9]{10}$'),
  game_id     text        not null references public.creations_games (id),
  name        text        not null check (char_length(name) between 1 and 40),
  description text        not null default '' check (char_length(description) <= 200),
  usd_cents   integer     not null check (usd_cents between 50 and 10000),
  available   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists creations_items_game_idx on public.creations_items (game_id, created_at);
alter table public.creations_items enable row level security;

-- who sold an order and their cut; null / 0 for the studio's own cosmetics
alter table public.shop_orders add column if not exists seller text check (seller ~ '^0x[0-9a-f]{40}$');
alter table public.shop_orders add column if not exists seller_bps integer not null default 0 check (seller_bps between 0 and 10000);
create index if not exists shop_orders_seller_idx on public.shop_orders (seller, paid_at) where seller is not null;
create index if not exists shop_orders_game_idx on public.shop_orders (game, status);

-- (div: integer division rounding down, the same as the server's BigInt maths, so not a wei differs.)
-- Revenue per game is now what the studio keeps: a creator's cut is not the studio's revenue, so it is left out.
create or replace function public.shop_revenue(t0 timestamptz default null, t1 timestamptz default null)
returns table (game text, orders bigint, usd_cents bigint, amount_raw text)
language sql stable set search_path = public as $$
  select game,
    count(*),
    coalesce(sum(usd_cents - div(usd_cents::numeric * seller_bps, 10000)), 0)::bigint,
    coalesce(sum(amount_raw::numeric - div(amount_raw::numeric * seller_bps, 10000)), 0)::text
  from shop_orders
  where status = 'paid'
    and (t0 is null or paid_at >= t0)
    and (t1 is null or paid_at < t1)
  group by game
  order by game
$$;

-- What creators earned from paid orders in [t0, t1), optionally for one seller: their cut, in cents and base units.
create or replace function public.creator_earnings(t0 timestamptz default null, t1 timestamptz default null, who text default null)
returns table (seller text, orders bigint, usd_cents bigint, earned_raw text)
language sql stable set search_path = public as $$
  select seller,
    count(*),
    coalesce(sum(div(usd_cents::numeric * seller_bps, 10000)), 0)::bigint,
    coalesce(sum(div(amount_raw::numeric * seller_bps, 10000)), 0)::text
  from shop_orders
  where status = 'paid' and seller is not null and seller_bps > 0
    and (t0 is null or paid_at >= t0)
    and (t1 is null or paid_at < t1)
    and (who is null or seller = who)
  group by seller
  order by seller
$$;

revoke execute on function public.shop_revenue(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.creator_earnings(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.shop_revenue(timestamptz, timestamptz) to service_role;
grant execute on function public.creator_earnings(timestamptz, timestamptz, text) to service_role;

-- each payout month also records what it paid creators
alter table public.revshare_epochs add column if not exists creators_raw numeric(78, 0) not null default 0;
alter table public.revshare_epochs add column if not exists creators integer not null default 0;
