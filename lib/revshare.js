// Holder revenue share: a cut of every cosmetic sale goes back to $creations holders, paid from the treasury and split
// by what they held at random snapshots in the last two weeks of each month. Holders do not lock or stake anything.
//
// How it runs (details in the README):
//   1. after a month closes, `node scripts/revshare-epoch.mjs --month YYYY-MM` adds up that month's paid shop orders,
//      takes REVSHARE_BPS of it as the pool, and splits the pool by each wallet's balances at random snapshots in the
//      month's last 14 days (seeded by the first block after the month, so they cannot be known in advance);
//   2. it rewrites public/revshare/tree.json (every wallet's running total + the Merkle tree) and appends the month to
//      public/revshare/epochs.json - commit both, so anyone can check the numbers;
//   3. the owner publishes the root on the RevenueShare contract (contracts/RevenueShare.sol), which pulls the pool
//      from the treasury wallet;
//   4. holders claim on /rewards whenever they like. Unclaimed months add up; nothing expires.
import { encodeAbiParameters, isAddress, keccak256 } from 'viem';

// The deployed RevenueShare contract. Until it is set, /rewards explains the programme but has nothing to claim.
const ADDRESS_RAW = process.env.NEXT_PUBLIC_REVSHARE_ADDRESS || '';
export const REVSHARE_ADDRESS = isAddress(ADDRESS_RAW) ? ADDRESS_RAW : null;

// Share of cosmetic revenue paid to holders, in basis points (2500 = 25%). Keep in step with the epoch script.
export const REVSHARE_BPS = Number(process.env.NEXT_PUBLIC_REVSHARE_BPS || 2500);
export const REVSHARE_PERCENT = REVSHARE_BPS / 100;

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
    name: 'claimed',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'merkleRoot', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
];

// Same leaf encoding as the contract and OpenZeppelin's StandardMerkleTree(['address', 'uint256']).
export const leafHash = (account, cumulativeAmount) =>
  keccak256(keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account, cumulativeAmount])));

// Finds `account` in a StandardMerkleTree dump (public/revshare/tree.json) and returns
// { cumulative: bigint, proof: `0x${string}`[] }, or null when the wallet has earned nothing yet.
// The dump stores the tree as a flat array: node i has its sibling at i +/- 1 and its parent at (i - 1) / 2.
export function findClaim(dump, account) {
  if (!dump || !account) return null;
  const want = account.toLowerCase();
  const entry = dump.values.find((v) => String(v.value[0]).toLowerCase() === want);
  if (!entry) return null;

  const cumulative = BigInt(entry.value[1]);
  // refuse a dump that does not match its own leaves rather than send a claim that will revert
  if (dump.tree[entry.treeIndex] !== leafHash(entry.value[0], cumulative)) return null;

  const proof = [];
  for (let i = entry.treeIndex; i > 0; i = Math.floor((i - 1) / 2)) {
    proof.push(dump.tree[i % 2 === 1 ? i + 1 : i - 1]);
  }
  return { cumulative, proof };
}
