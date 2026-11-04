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
import { robinhoodChain, robinhoodTestnet } from '../lib/config';
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
  chains: [robinhoodChain, robinhoodTestnet],
  ssr: true,
  transports: { [robinhoodChain.id]: http(), [robinhoodTestnet.id]: http() },
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

const READY_WAIT_MS = 15000;
const TOKEN_WAIT_MS = 12000;
const NOT_READY =
  "The sign-in service didn't load. If this keeps happening, the site's address may be missing from the Privy app's allowed domains.";
const NO_TOKEN =
  'Privy signed you in but sent no identity token. Turn on identity tokens in the Privy dashboard, then try again.';

// Resolves true once check() is true, or false after ms.
function until(check, ms) {
  return new Promise((resolve) => {
    if (check()) return resolve(true);
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        resolve(false);
      }
    }, 200);
  });
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

  // the latest Privy state, for the waits below (closures would see stale values)
  const live = useRef({ ready, authenticated, identityToken });
  live.current = { ready, authenticated, identityToken };
  const tokenTimer = useRef(null);

  const settle = useCallback((err) => {
    clearTimeout(tokenTimer.current);
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

  // Privy signed the person in; the identity token should follow within moments. If it never does, the Privy app
  // isn't set to issue identity tokens, and waiting longer would only leave the button stuck.
  const expectToken = useCallback(() => {
    clearTimeout(tokenTimer.current);
    tokenTimer.current = setTimeout(() => {
      if (waiting.current.length && !live.current.identityToken) settle(new Error(NO_TOKEN));
    }, TOKEN_WAIT_MS);
  }, [settle]);

  const { login } = useLogin({
    onComplete: () => expectToken(),
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
      login: async () => {
        // Privy loads in the background; until it's ready, its login() does nothing at all
        if (!(await until(() => live.current.ready, READY_WAIT_MS))) throw new Error(NOT_READY);
        return new Promise((resolve, reject) => {
          waiting.current.push({ resolve, reject });
          const now = live.current;
          if (now.authenticated && now.identityToken) sync(now.identityToken);
          else if (now.authenticated) expectToken(); // signed in to Privy already, token still to come
          else login();
        });
      },
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
    [sync, expectToken, login, logout, linkWallet, linkEmail, connectWallet]
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
        supportedChains: [robinhoodChain, robinhoodTestnet],
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
