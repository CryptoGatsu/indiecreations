// Server-side only: on-chain balance + signature checks for the holder gate.
import { createPublicClient, erc20Abi, formatUnits, parseUnits } from 'viem';
import { robinhoodChain, TOKEN_ADDRESS, MIN_TOKENS, isAllowlisted } from './config';
import { serverTransport } from './patientFetch';

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  // RPC_URL lets production use a private (e.g. QuickNode) endpoint without exposing the key, with the public RPC
  // behind it; waits out rate limits and batches bursts of reads (lib/patientFetch.js)
  transport: serverTransport(),
});

let cachedDecimals = null;

export async function getDecimals() {
  if (cachedDecimals === null) {
    cachedDecimals = await publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'decimals',
    });
  }
  return cachedDecimals;
}

// Whole $CREATIONS a wallet holds right now, as a number (Infinity for allowlisted studio wallets).
export async function tokenBalance(address) {
  if (isAllowlisted(address)) return Infinity;
  if (!TOKEN_ADDRESS) return 0;
  const [decimals, raw] = await Promise.all([
    getDecimals(),
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
  ]);
  return Number(formatUnits(raw, decimals));
}

// Returns { holder, balance } where balance is a human-readable string.
export async function checkHolder(address) {
  // Allowlisted wallets (the dev wallet) pass without a balance, and without depending on the RPC being up.
  if (isAllowlisted(address)) return { holder: true, balance: 'allowlisted', allowlisted: true };
  if (!TOKEN_ADDRESS) return { holder: false, balance: '0' };

  const [decimals, raw] = await Promise.all([
    getDecimals(),
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }),
  ]);

  return {
    holder: raw >= parseUnits(String(MIN_TOKENS), decimals),
    balance: formatUnits(raw, decimals),
  };
}
