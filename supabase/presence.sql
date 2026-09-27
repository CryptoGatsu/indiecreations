-- Who is playing each browser game, for the "playing now" counts. Run once in the Supabase SQL editor (or as a
-- migration) for the project the site uses.
--
-- Each browser that has a game loaded and in front pings /api/presence once a minute with a random id it keeps in
-- localStorage. No wallet, no IP: only a salted hash of the IP, so one person inventing many ids cannot inflate the
-- counts (at most 3 ids per IP count). Written only by the site's server with the service-role key; RLS on, no policies.

create table if not exists public.game_presence (
  game       text        not null check (game ~ '^[a-z0-9-]{1,64}$'),
  visitor_id text        not null check (visitor_id ~ '^[a-z0-9]{16,40}$'),
  ip_hash    text        not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (game, visitor_id)
);
create index if not exists game_presence_seen_idx on public.game_presence (game, last_seen);
alter table public.game_presence enable row level security;

-- Per game: players right now (seen in the last 2 minutes), in the last 24 hours and in the last 30 days.
-- Every window counts at most 3 visitors per IP hash.
create or replace function public.game_player_counts()
returns table (game text, playing_now bigint, last_day bigint, last_month bigint)
language sql stable as $$
  with per_ip as (
    select game, ip_hash,
      count(*) filter (where last_seen > now() - interval '2 minutes') as now_n,
      count(*) filter (where last_seen > now() - interval '24 hours')  as day_n,
      count(*) filter (where last_seen > now() - interval '30 days')   as month_n
    from public.game_presence
    where last_seen > now() - interval '30 days'
    group by game, ip_hash
  )
  select game, sum(least(now_n, 3))::bigint, sum(least(day_n, 3))::bigint, sum(least(month_n, 3))::bigint
  from per_ip
  group by game
  order by game
$$;

revoke execute on function public.game_player_counts() from public, anon, authenticated;
grant execute on function public.game_player_counts() to service_role;
