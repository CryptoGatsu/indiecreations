-- Community games (/create, /community): holder-made Three.js games, their versions, the generation log behind the
-- daily allowances, and player reports.
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
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

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

alter table public.creations_games enable row level security;
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

-- only the server (service role) may call them
revoke execute on function public.creations_play(text) from public, anon, authenticated;
revoke execute on function public.creations_report(text, text, text) from public, anon, authenticated;
grant execute on function public.creations_play(text) to service_role;
grant execute on function public.creations_report(text, text, text) to service_role;
