-- Holder reviews for Indie Creations playtests.
-- Run once in the Supabase SQL editor (or as a migration) for the project whose URL / service key the site uses.
--
-- The site talks to this table ONLY from its server (pages/api/feedback.js) with the service-role key, after it has
-- verified the wallet's holder session. Row Level Security is on with no policies, so the public "anon" key can
-- neither read nor write it.

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  wallet      text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  game        text        not null check (char_length(game) between 1 and 120),
  rating      smallint    not null check (rating between 1 and 5),
  feedback    text        not null check (char_length(feedback) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- one review per wallet per build: posting again edits it, so nobody can stuff the average
  unique (wallet, game)
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
