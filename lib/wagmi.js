import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { robinhoodChain } from './config';

// WalletConnect (mobile wallets, incl. Robinhood Wallet) turns on once a free
// project id from https://cloud.reown.com is set.
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  ssr: true,
  connectors: [
    injected(),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  ],
  transports: {
    [robinhoodChain.id]: http(),
  },
});
