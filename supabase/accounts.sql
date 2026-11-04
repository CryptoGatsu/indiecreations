-- Store accounts (PLATFORM_SPEC milestone 1): one account per Privy user, with every wallet linked to it.
-- Run once in the Supabase SQL editor (safe to run again).
--
-- Written only by the site's server with the service-role key; RLS is on with no policies, so the public API keys
-- can't read or write these tables. The site shows what is public through its own API routes.

create table if not exists public.users (
  id             uuid        primary key default gen_random_uuid(),
  privy_id       text        not null unique check (privy_id ~ '^did:privy:[A-Za-z0-9]+$'),
  email          text        check (email is null or char_length(email) <= 320),
  -- stored roles; `admin` is never stored (it comes from ADMIN_WALLETS against the linked wallets)
  roles          text[]      not null default '{player}' check (roles <@ array['player', 'curator', 'developer']::text[]),
  adult_opt_in   boolean     not null default false,
  -- the EVM wallet the site uses for this account's profile, comments and cosmetics (one of its wallets)
  primary_wallet text        check (primary_wallet is null or primary_wallet ~ '^0x[0-9a-f]{40}$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.wallets (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  chain      text        not null check (chain in ('evm', 'solana')),
  -- EVM addresses lowercase; Solana addresses as they are (base58 is case-sensitive)
  address    text        not null check (
    (chain = 'evm' and address ~ '^0x[0-9a-f]{40}$') or
    (chain = 'solana' and address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
  ),
  type       text        not null check (type in ('embedded', 'linked')),
  created_at timestamptz not null default now(),
  -- a wallet belongs to one account at a time (Privy enforces the same)
  unique (chain, address)
);
create index if not exists wallets_user_idx on public.wallets (user_id);

alter table public.users enable row level security;
alter table public.wallets enable row level security;

grant select, insert, update, delete on public.users, public.wallets to service_role;
