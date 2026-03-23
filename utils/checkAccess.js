import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=abe30281-08a6-4f68-921b-4da93db84835");
const MINT = new PublicKey("8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump");

export async function checkAccess(wallet) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    console.log("=== ALL TOKEN ACCOUNTS ===");

    accounts.value.forEach((acc) => {
      const info = acc.account.data.parsed.info;

      console.log("Mint:", info.mint);
      console.log("Amount:", info.tokenAmount.uiAmount);
      console.log("----------------------");
    });

    return false; // TEMP
  } catch (err) {
    console.error(err);
    return false;
  }
}