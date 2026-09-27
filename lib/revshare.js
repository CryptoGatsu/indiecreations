// Holder revenue share and the public economy numbers. Safe to import in the browser: no secrets here.
//
// How payouts run, with nobody pressing a button (details in the README):
//   1. every day /api/cron/revshare copies new $creations transfers from the chain into Supabase;
//   2. once a month has closed, it adds up that month's revenue from every game. If the revenue since the last payout
//      is still under REVSHARE_MIN_USD, the month is carried into the next one and nothing is paid;
//   3. otherwise REVSHARE_BPS of it becomes the holder pool, split by what each wallet held at random snapshots in
//      the month's last 14 days (seeded by the first block after the month, so nobody can know them in advance);
//   4. the job publishes the new running totals on the RevenueShare contract (contracts/RevenueShare.sol), which pulls
//      the pool from the treasury wallet in the same transaction;
//   5. holders claim on /rewards whenever they like. Unclaimed months add up; nothing expires.
import { isAddress } from 'viem';

// The deployed RevenueShare contract. Until it is set, /rewards explains the programme but has nothing to claim.
const ADDRESS_RAW = process.env.NEXT_PUBLIC_REVSHARE_ADDRESS || '';
export const REVSHARE_ADDRESS = isAddress(ADDRESS_RAW) ? ADDRESS_RAW : null;

// Share of revenue paid to holders, in basis points (2500 = 25%).
export const REVSHARE_BPS = Number(process.env.NEXT_PUBLIC_REVSHARE_BPS || 2500);
export const REVSHARE_PERCENT = REVSHARE_BPS / 100;

// Revenue (in US dollars, from every game) that has to build up before a payout is made. Below it, months carry over.
export const REVSHARE_MIN_USD = Number(process.env.NEXT_PUBLIC_REVSHARE_MIN_USD || 100);

// Snapshots per payout, taken at random moments in the last SNAPSHOT_WINDOW_DAYS of the month.
export const REVSHARE_SNAPSHOTS = 4;
export const SNAPSHOT_WINDOW_DAYS = 14;

// Tokens sent here are gone for good. A burn is any transfer to one of them.
export const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
];

// The on-chain side of each game, on Robinhood Chain MAINNET. Shop sales through /shop are counted from the orders
// table already; these cover games that sell or burn inside the game itself.
//   revenue: contracts whose incoming $creations count as the game's revenue (e.g. its in-game shop)
//   burners: contracts whose burns count as the game's burns (e.g. a spectator pool that burns losing bets)
// Agentacus runs on testnet with test tokens for now: fill in its mainnet contracts on launch day.
export const GAME_CONTRACTS = [{ game: 'Agentacus', revenue: [], burners: [] }];

export const revshareAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'cumulativeAmount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'publish',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'newTotalAllocated', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimed',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'merkleRoot', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'lastPublishedAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalClaimed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // the contract's errors, so a failed call reads as "TooSoon" rather than a bare selector
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'TotalWentDown', inputs: [] },
  { type: 'error', name: 'TooSoon', inputs: [{ name: 'nextAllowedAt', type: 'uint256' }] },
  { type: 'error', name: 'NotFunded', inputs: [{ name: 'needed', type: 'uint256' }, { name: 'available', type: 'uint256' }] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
];
