import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection("https://api.mainnet-beta.solana.com");
const MINT = new PublicKey("8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump");

// 5M tokens with 6 decimals
const REQUIRED_RAW = 5_000_000 * 1_000_000;

export async function checkAccess(wallet) {
  try {
    // 🔥 Get ALL token accounts for wallet
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: MINT,
    });

    let totalBalance = 0;

    accounts.value.forEach((acc) => {
      const amount =
        acc.account.data.parsed.info.tokenAmount.amount;

      totalBalance += Number(amount);
    });

    console.log("Total Raw Balance:", totalBalance);
    console.log("Required:", REQUIRED_RAW);

    return totalBalance >= REQUIRED_RAW;
  } catch (err) {
    console.error("Access check failed:", err);
    return false;
  }
}