import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=abe30281-08a6-4f68-921b-4da93db84835"
);

const MINT = new PublicKey("8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump");

// 5M tokens (no raw math needed now)
const REQUIRED = 5_000_000;

export async function checkAccess(wallet) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    let totalBalance = 0;

    accounts.value.forEach((acc) => {
      const info = acc.account.data.parsed.info;

      if (info.mint === MINT.toString()) {
        totalBalance += info.tokenAmount.uiAmount;
      }
    });

    console.log("Final Balance:", totalBalance);

    return totalBalance >= REQUIRED;
  } catch (err) {
    console.error(err);
    return false;
  }
}