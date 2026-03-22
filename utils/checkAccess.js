
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const connection = new Connection("https://api.mainnet-beta.solana.com");
const MINT = new PublicKey("8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump");

export async function checkAccess(wallet) {
  try {
    const mintInfo = await getMint(connection, MINT);
    const totalSupply = Number(mintInfo.supply);
    const required = totalSupply * 0.005;

    const ata = await getAssociatedTokenAddress(MINT, wallet);
    const account = await getAccount(connection, ata);

    const balance = Number(account.amount);
    return balance >= required;
  } catch {
    return false;
  }
}
