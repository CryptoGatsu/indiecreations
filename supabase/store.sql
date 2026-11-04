-- Indie Creations Store (PLATFORM_SPEC milestones 2 to 4): developer applications, burns, games, builds, library.
-- Run after supabase/accounts.sql. Safe to run again.
--
-- Written only by the site's server with the service-role key; RLS is on with no policies. Every row that touches the
-- chain carries its chain_id, so testnet and mainnet never mix.

-- A burn the server has priced: the exact $CREATIONS amount one wallet must send to the burn address within 10 minutes.
create table if not exists public.burn_quotes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  purpose     text        not null check (purpose in ('dev_apply', 'new_game')),
  chain_id    integer     not null,
  token       text        not null check (token ~ '^0x[0-9a-f]{40}$'),
  wallet      text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  -- text, not numeric: the REST API returns numeric as a JSON number, which loses wei
  amount_raw  text        not null check (amount_raw ~ '^[1-9][0-9]{0,77}$'),
  usd_cents   integer     not null check (usd_cents > 0),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_tx     text        unique
);
create index if not exists burn_quotes_user_idx on public.burn_quotes (user_id, created_at desc);

-- Every verified burn. A transaction counts once, ever.
create table if not exists public.burns (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  purpose    text        not null check (purpose in ('dev_apply', 'new_game')),
  quote_id   uuid        references public.burn_quotes (id),
  chain_id   integer     not null,
  token      text        not null,
  from_addr  text        not null,
  amount_raw text        not null check (amount_raw ~ '^[1-9][0-9]{0,77}$'),
  usd_cents  integer     not null,
  tx         text        not null unique check (tx ~ '^0x[0-9a-f]{64}$'),
  block      bigint      not null,
  used       boolean     not null default false, -- spent on an application or a game
  created_at timestamptz not null default now()
);

create table if not exists public.dev_profiles (
  user_id           uuid        primary key references public.users (id) on delete cascade,
  studio_name       text        not null check (char_length(studio_name) between 2 and 60),
  links             text[]      not null default '{}',
  contact_email     text        check (contact_email is null or char_length(contact_email) <= 320),
  past_work         text        check (past_work is null or char_length(past_work) <= 2000),
  payout_wallet_evm text        check (payout_wallet_evm is null or payout_wallet_evm ~ '^0x[0-9a-f]{40}$'),
  payout_wallet_sol text,
  status            text        not null default 'applied' check (status in ('applied', 'approved', 'rejected', 'suspended')),
  updated_at        timestamptz not null default now()
);

create table if not exists public.dev_applications (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references public.users (id) on delete cascade,
  profile_snapshot   jsonb       not null,
  burn_id            uuid        references public.burns (id),
  burn_tx            text,
  status             text        not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  rejection_codes    text[]      not null default '{}',
  note               text,
  resubmission       boolean     not null default false, -- the free resubmission after a rejection
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  decided_by         text
);
create index if not exists dev_applications_user_idx on public.dev_applications (user_id, created_at desc);
-- at most one application waiting per account
create unique index if not exists dev_applications_one_open on public.dev_applications (user_id) where status = 'submitted';

create table if not exists public.games (
  id              uuid        primary key default gen_random_uuid(),
  slug            text        not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  dev_id          uuid        not null references public.users (id),
  burn_id         uuid        references public.burns (id),
  -- the approved store page (what players see); a pending build carries its own copy until it is approved
  listing         jsonb,
  price_usd_cents integer     not null default 0 check (price_usd_cents = 0 or price_usd_cents >= 99),
  adult           boolean     not null default false,
  status          text        not null default 'draft' check (status in ('draft', 'live', 'abandoned', 'removed')),
  current_build   uuid,
  created_at      timestamptz not null default now(),
  last_update_at  timestamptz,
  abandoned_at    timestamptz
);
create index if not exists games_dev_idx on public.games (dev_id);
create index if not exists games_live_idx on public.games (status, last_update_at desc);

create table if not exists public.builds (
  id              uuid        primary key default gen_random_uuid(),
  game_id         uuid        not null references public.games (id) on delete cascade,
  version         integer     not null,
  listing         jsonb       not null default '{}', -- the store page submitted with this build
  storage_prefix  text        not null,
  entry_url       text,
  file_count      integer,
  size_bytes      bigint,
  status          text        not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'superseded', 'withdrawn')),
  rejection_codes text[]      not null default '{}',
  reviewer_notes  text,
  created_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     text,
  unique (game_id, version)
);
create index if not exists builds_queue_idx on public.builds (status, submitted_at);
-- one draft and one waiting build per game at a time
create unique index if not exists builds_one_open on public.builds (game_id) where status in ('draft', 'submitted');

alter table public.games drop constraint if exists games_current_build_fk;
alter table public.games add constraint games_current_build_fk foreign key (current_build) references public.builds (id);

-- What an account owns or saved: free games added, and (with checkout) games bought.
create table if not exists public.library (
  user_id    uuid        not null references public.users (id) on delete cascade,
  game_id    uuid        not null references public.games (id) on delete cascade,
  source     text        not null check (source in ('free', 'purchase', 'developer')),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

-- Every admin decision on the store (PLATFORM_SPEC 20: log every admin action).
create table if not exists public.admin_log (
  id         bigint      generated always as identity primary key,
  actor      text        not null,
  action     text        not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

alter table public.burn_quotes enable row level security;
alter table public.burns enable row level security;
alter table public.dev_profiles enable row level security;
alter table public.dev_applications enable row level security;
alter table public.games enable row level security;
alter table public.builds enable row level security;
alter table public.library enable row level security;
alter table public.admin_log enable row level security;

grant select, insert, update, delete on public.burn_quotes, public.burns, public.dev_profiles, public.dev_applications,
  public.games, public.builds, public.library, public.admin_log to service_role;
