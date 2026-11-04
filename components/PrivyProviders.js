import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PrivyProvider,
  useConnectWallet,
  useIdentityToken,
  useLinkAccount,
  useLogin,
  useLogout,
  usePrivy,
} from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { http } from 'wagmi';
import { robinhoodChain } from '../lib/config';
import { PRIVY_APP_ID } from '../lib/privyClient';
import { PrivyActionsContext } from './privyActions';
import { refreshProfile } from './useProfile';
import { currentAccount, refreshAccount } from './useStoreAccount';

// Store accounts (PLATFORM_SPEC milestone 1). Privy signs people in with email or a wallet and gives every account
// its own non-custodial wallets (an EVM one if they brought none, and a Solana one); people can link MetaMask, Phantom
// and others too. The site never sees a private key. After each Privy login, PrivySessionSync hands the identity token
// to /api/auth/privy, which sets the site's own cookies, so every existing feature keeps working by wallet.
// Only bundled when NEXT_PUBLIC_PRIVY_APP_ID is set (see pages/_app.js).

const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  ssr: true,
  transports: { [robinhoodChain.id]: http() },
});

const solanaConnectors = toSolanaWalletConnectors();

// Which connected wallet wagmi acts with (checkout, claims, admin): the account's primary wallet when it is connected
// in this browser, otherwise a wallet the person linked themselves, otherwise the embedded one.
function activeWalletForWagmi({ wallets }) {
  const primary = currentAccount()?.primaryWallet;
  return (
    wallets.find((w) => primary && w.address.toLowerCase() === primary) ||
    wallets.find((w) => w.walletClientType !== 'privy') ||
    wallets[0]
  );
}

async function post(identityToken) {
  const res = await fetch('/api/auth/privy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Sign-in failed.');
  return out;
}

function PrivySession({ children }) {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const synced = useRef(null); // the identity token the server last accepted
  const waiting = useRef([]); // login() promises waiting for the server session

  const settle = useCallback((err) => {
    const list = waiting.current;
    waiting.current = [];
    list.forEach(({ resolve, reject }) => (err ? reject(err) : resolve()));
  }, []);

  const sync = useCallback(
    async (token) => {
      synced.current = token;
      try {
        await post(token);
        await Promise.all([refreshProfile(), refreshAccount()]);
        settle(null);
      } catch (err) {
        synced.current = null;
        settle(err);
      }
    },
    [settle]
  );

  // every new identity token (a login, a wallet linked or created, a refresh) updates the server's view of the account
  useEffect(() => {
    if (!ready) return;
    if (authenticated && identityToken && identityToken !== synced.current) sync(identityToken);
    if (!authenticated && synced.current === null && currentAccount()) {
      // Privy's own session ended (expired, or signed out in another tab): end the site's account session too
      fetch('/api/auth/account', { method: 'DELETE' })
        .catch(() => {})
        .then(() => Promise.all([refreshProfile(), refreshAccount()]));
    }
    if (!authenticated) synced.current = null;
  }, [ready, authenticated, identityToken, sync]);

  const { login } = useLogin({
    onError: (err) => settle(new Error(err === 'exited_auth_flow' ? 'Sign-in cancelled.' : 'Sign-in did not finish.')),
  });
  const { logout } = useLogout();
  const { linkWallet, linkEmail } = useLinkAccount();
  const { setActiveWallet } = useSetActiveWallet();
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      // a wallet connected for an action (admin sign-in, checkout) becomes the one wagmi uses
      if (wallet?.type === 'ethereum') setActiveWallet(wallet).catch(() => {});
    },
  });

  const actions = useMemo(
    () => ({
      // resolves once the site's own session is set (so callers can redirect afterwards)
      login: () =>
        new Promise((resolve, reject) => {
          waiting.current.push({ resolve, reject });
          if (authenticated && identityToken) sync(identityToken);
          else login();
        }),
      logout: async () => {
        await logout().catch(() => {});
        synced.current = null;
        await fetch('/api/auth/account', { method: 'DELETE' }).catch(() => {});
        await Promise.all([refreshProfile(), refreshAccount()]);
      },
      linkWallet: () => linkWallet({ walletChainType: 'ethereum-and-solana' }),
      linkEmail: () => linkEmail(),
      connectWallet: () => connectWallet({ walletChainType: 'ethereum-only' }),
    }),
    [authenticated, identityToken, sync, login, logout, linkWallet, linkEmail, connectWallet]
  );

  return <PrivyActionsContext.Provider value={actions}>{children}</PrivyActionsContext.Provider>;
}

export default function PrivyProviders({ queryClient, children }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet'],
        appearance: {
          theme: 'light',
          accentColor: '#0a0a0a',
          // no `logo` here: Privy renders a hidden preload <img> for it that the server render doesn't have, which
          // breaks hydration on every page. Set the logo in the Privy dashboard instead (it loads after hydration).
          walletChainType: 'ethereum-and-solana',
        },
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
        embeddedWallets: {
          // people who sign in with MetaMask already have an EVM wallet; everyone gets a Solana one
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'all-users' },
        },
        externalWallets: { solana: { connectors: solanaConnectors } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={activeWalletForWagmi}>
          <PrivySession>{children}</PrivySession>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
