// Server-side only: on-chain balance + signature checks for the holder gate.
import { createPublicClient, http, erc20Abi, formatUnits, parseUnits } from 'viem';
import { robinhoodChain, TOKEN_ADDRESS, MIN_TOKENS, isAllowlisted } from './config';

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  // RPC_URL lets production use a private (e.g. Alchemy) endpoint without exposing the key.
  transport: http(process.env.RPC_URL || undefined),
});

let cachedDecimals = null;

async function getDecimals() {
  if (cachedDecimals === null) {
    cachedDecimals = await publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'decimals',
    });
  }
  return cachedDecimals;
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
