-- Player profiles: a wallet that signed in (the free sign-in message) can set a display name, a bio, a picture and
-- favourite games, and comment under games. Run once in the Supabase SQL editor (or as a migration).
--
-- Written only by the site's server with the service-role key; RLS is on with no policies. The site shows what is
-- public through its own API routes.

create table if not exists public.profiles (
  address        text        primary key check (address ~ '^0x[0-9a-f]{40}$'),
  display_name   text        check (display_name ~ '^[A-Za-z0-9 _.-]{3,24}$'),
  bio            text        check (char_length(bio) <= 280),
  favorite_games text[]      not null default '{}',
  avatar_version bigint,                                  -- set when a picture is uploaded; part of its URL
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- names are unique, whatever the capitals
create unique index if not exists profiles_display_name_key on public.profiles (lower(display_name)) where display_name is not null;

-- The picture itself: a small square image (resized in the browser), base64.
create table if not exists public.profile_avatars (
  address    text        primary key references public.profiles (address) on delete cascade,
  mime       text        not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  data       text        not null check (char_length(data) <= 140000),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_comments (
  id         uuid        primary key default gen_random_uuid(),
  game       text        not null check (game ~ '^[a-z0-9-]{1,64}$'),
  address    text        not null check (address ~ '^0x[0-9a-f]{40}$'),
  body       text        not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);
create index if not exists game_comments_game_idx on public.game_comments (game, created_at desc) where deleted_at is null;
create index if not exists game_comments_author_idx on public.game_comments (address, created_at desc);

alter table public.profiles enable row level security;
alter table public.profile_avatars enable row level security;
alter table public.game_comments enable row level security;

-- How many signed-in players marked each game as a favourite.
create or replace function public.game_favorite_counts()
returns table (game text, favorites bigint)
language sql stable as $$
  select g, count(*) from public.profiles, unnest(favorite_games) as g group by g
$$;
revoke execute on function public.game_favorite_counts() from public, anon, authenticated;
grant execute on function public.game_favorite_counts() to service_role;
