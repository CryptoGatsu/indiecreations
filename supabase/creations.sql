-- Community games (/create, /community): holder-made Three.js games, their versions, the generation log behind the
-- daily allowances, player reports, and who plays them (for the stats under each game).
-- Safe to run again after an update: everything is "if not exists" / "or replace".
-- Run once in the Supabase SQL editor (or as a migration) for the project whose URL / service key the site uses.
--
-- Like the shop tables, these are touched ONLY by the site's server with the service-role key. Row Level Security is
-- on with no policies, so the public "anon" key can neither read nor write them.

create table if not exists public.creations_games (
  id           text        primary key check (id ~ '^[0-9A-Za-z]{10}$'),
  owner        text        not null check (owner ~ '^0x[0-9a-f]{40}$'),
  title        text        not null check (char_length(title) between 1 and 60),
  description  text        not null default '' check (char_length(description) <= 300),
  prompt       text        not null check (char_length(prompt) <= 2000),  -- what the game was first asked to be
  version      integer     not null default 1,                            -- the version being served
  versions     integer     not null default 1,                            -- the newest version number
  published    boolean     not null default false,
  hidden       boolean     not null default false,                        -- taken down by the studio
  plays        bigint      not null default 0,
  reports      integer     not null default 0,
  show_prompts boolean     not null default true,                         -- the prompts that made it, on its page
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- (for databases created before show_prompts existed)
alter table public.creations_games add column if not exists show_prompts boolean not null default true;

create index if not exists creations_games_owner_idx on public.creations_games (owner, created_at);
create index if not exists creations_games_public_idx on public.creations_games (plays desc, created_at desc) where published and not hidden;

-- every version of every game; the server keeps the newest 20 per game
create table if not exists public.creations_versions (
  game_id     text        not null references public.creations_games (id) on delete cascade,
  version     integer     not null,
  request     text        not null check (char_length(request) <= 2000),  -- the prompt or edit that made it
  html        text        not null check (char_length(html) <= 400000),
  created_at  timestamptz not null default now(),
  primary key (game_id, version)
);

-- one row per model call, for the per-wallet and site-wide daily allowances
create table if not exists public.creations_log (
  id       bigint      generated always as identity primary key,
  wallet   text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  game_id  text,
  kind     text        not null check (kind in ('create', 'edit')),
  at       timestamptz not null default now()
);

create index if not exists creations_log_at_idx on public.creations_log (at desc);
create index if not exists creations_log_wallet_at_idx on public.creations_log (wallet, at desc);

create table if not exists public.creations_reports (
  game_id   text        not null references public.creations_games (id) on delete cascade,
  reporter  text        not null check (char_length(reporter) <= 80),     -- a wallet, or a hash of the visitor's IP
  reason    text        not null default '' check (char_length(reason) <= 500),
  at        timestamptz not null default now(),
  primary key (game_id, reporter)
);

-- who plays each public game: the game's page pings once a minute with an anonymous id its browser keeps (no wallet,
-- no IP: a salted hash of it, so at most 3 ids per IP count). Kept for good, for the all-time player count; each
-- accepted ping adds a minute of play time.
create table if not exists public.creations_presence (
  game_id    text        not null references public.creations_games (id) on delete cascade,
  visitor_id text        not null check (visitor_id ~ '^[a-z0-9]{16,40}$'),
  ip_hash    text        not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  minutes    integer     not null default 1,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (game_id, visitor_id)
);
create index if not exists creations_presence_seen_idx on public.creations_presence (game_id, last_seen);

alter table public.creations_games enable row level security;
alter table public.creations_presence enable row level security;
alter table public.creations_versions enable row level security;
alter table public.creations_log enable row level security;
alter table public.creations_reports enable row level security;

-- a play, counted in one statement so concurrent plays don't overwrite each other
create or replace function public.creations_play(gid text) returns void
language sql security definer set search_path = public as $$
  update creations_games set plays = plays + 1 where id = gid and published and not hidden;
$$;

-- a report: one per reporter per game, and the game's count kept in step
create or replace function public.creations_report(gid text, who text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into creations_reports (game_id, reporter, reason) values (gid, who, left(coalesce(why, ''), 500))
    on conflict (game_id, reporter) do nothing;
  if found then
    update creations_games set reports = reports + 1 where id = gid;
  end if;
end;
$$;

-- a ping: a new visitor, or a minute more for one seen over 50 seconds ago (closer pings are ignored)
create or replace function public.creations_ping(gid text, vid text, iph text) returns void
language sql security definer set search_path = public as $$
  insert into creations_presence (game_id, visitor_id, ip_hash) values (gid, vid, iph)
  on conflict (game_id, visitor_id) do update set
    minutes   = creations_presence.minutes + 1,
    last_seen = now(),
    ip_hash   = excluded.ip_hash
  where creations_presence.last_seen < now() - interval '50 seconds';
$$;

-- per game (all games, or just gid): players right now (seen in the last 2 minutes), in the last 24 hours, all time,
-- and minutes played. Player counts take at most 3 visitors per IP hash.
create or replace function public.creations_stats(gid text default null)
returns table (game_id text, playing_now bigint, last_day bigint, players bigint, minutes bigint)
language sql stable security definer set search_path = public as $$
  with per_ip as (
    select p.game_id, p.ip_hash,
      count(*) filter (where p.last_seen > now() - interval '2 minutes') as now_n,
      count(*) filter (where p.last_seen > now() - interval '24 hours')  as day_n,
      count(*) as all_n,
      sum(p.minutes) as mins
    from creations_presence p
    where gid is null or p.game_id = gid
    group by p.game_id, p.ip_hash
  )
  select game_id, sum(least(now_n, 3))::bigint, sum(least(day_n, 3))::bigint, sum(least(all_n, 3))::bigint, sum(mins)::bigint
  from per_ip
  group by game_id
$$;

-- only the server (service role) may call them
revoke execute on function public.creations_play(text) from public, anon, authenticated;
revoke execute on function public.creations_report(text, text, text) from public, anon, authenticated;
revoke execute on function public.creations_ping(text, text, text) from public, anon, authenticated;
revoke execute on function public.creations_stats(text) from public, anon, authenticated;
grant execute on function public.creations_play(text) to service_role;
grant execute on function public.creations_ping(text, text, text) to service_role;
grant execute on function public.creations_stats(text) to service_role;
grant execute on function public.creations_report(text, text, text) to service_role;

-- A generation that needs more than one function run (lib/creationAI.js): what Claude has written so far, so the next
-- run continues from there instead of starting over. Short-lived; finished and abandoned rows are cleared after a day.
create table if not exists public.creations_jobs (
  id           uuid        primary key,
  wallet       text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  game_id      text        references public.creations_games (id) on delete cascade,
  base_version integer,                                                    -- the version an edit started from
  request      text        not null check (char_length(request) <= 2000),
  partial      text        not null default '' check (char_length(partial) <= 400000),
  legs         integer     not null default 1,
  stalls       integer     not null default 0,                           -- runs in a row that added almost nothing
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.creations_jobs add column if not exists stalls integer not null default 0;
create index if not exists creations_jobs_wallet_idx on public.creations_jobs (wallet, created_at desc);
alter table public.creations_jobs enable row level security;
