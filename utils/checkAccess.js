import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const connection = new Connection("https://api.mainnet-beta.solana.com");
const MINT = new PublicKey("8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump");

// 🔥 REQUIRED TOKENS (adjust if needed)
const REQUIRED_TOKENS = 5_000_000;

export async function checkAccess(wallet) {
  try {
    const ata = await getAssociatedTokenAddress(MINT, wallet);
    const account = await getAccount(connection, ata);

    // Raw amount (no decimals applied yet)
    const rawBalance = Number(account.amount);

    // ⚠️ IMPORTANT: most tokens = 6 or 9 decimals
    const DECIMALS = 6; // ← change if needed

    const balance = rawBalance / Math.pow(10, DECIMALS);

    console.log("User balance:", balance);

    return balance >= REQUIRED_TOKENS;
  } catch (err) {
    console.error("Access check failed:", err);
    return false;
  }
}