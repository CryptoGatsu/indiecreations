-- Playtest download log for Indie Creations (the download tracker on /playtest).
-- Applied to the site's Supabase project as the migration "playtest_downloads"; kept here for reference.
--
-- The site writes one row per download a verified holder starts (pages/api/playtest/download.js) and reads totals
-- through playtest_download_stats() (pages/api/playtest/stats.js), always with the service-role key from its server.
-- Row Level Security is on with no policies and the function is service-role only, so the anon key sees nothing.

create table if not exists public.playtest_downloads (
  id          bigint generated always as identity primary key,
  wallet      text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  build       text        not null check (char_length(build) between 1 and 120),
  created_at  timestamptz not null default now()
);

create index if not exists playtest_downloads_build_time_idx on public.playtest_downloads (build, created_at desc);
create index if not exists playtest_downloads_wallet_idx on public.playtest_downloads (wallet, build, created_at desc);

alter table public.playtest_downloads enable row level security;

-- Totals for the public counter (PostgREST can't count distinct on its own).
create or replace function public.playtest_download_stats(p_build text)
returns table (total bigint, holders bigint, last_day bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint,
         count(distinct wallet)::bigint,
         (count(*) filter (where created_at > now() - interval '24 hours'))::bigint
  from public.playtest_downloads
  where build = p_build;
$$;

revoke execute on function public.playtest_download_stats(text) from public, anon, authenticated;
grant execute on function public.playtest_download_stats(text) to service_role;
