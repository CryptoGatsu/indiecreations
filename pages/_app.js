import '../styles.css';
import { Component as ReactComponent, useState } from 'react';
import { Inter_Tight } from 'next/font/google';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '../lib/wagmi';
import { privyEnabled } from '../lib/privyClient';
import Layout from '../components/Layout';

// Store accounts (Privy) when NEXT_PUBLIC_PRIVY_APP_ID is set. The check is written out here, not imported, so the
// build replaces it with a constant and leaves Privy out of the bundle entirely while it is off.
const PrivyProviders = process.env.NEXT_PUBLIC_PRIVY_APP_ID ? require('../components/PrivyProviders').default : null;

const font = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

// If Privy can't start in this browser, the site carries on with its own wallet sign-in instead of a blank page.
class PrivyFallback extends ReactComponent {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('Store accounts could not start; using wallet sign-in.', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function App({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient());

  const page = (
    <div className={font.className}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </div>
  );
  const plain = (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{page}</QueryClientProvider>
    </WagmiProvider>
  );

  if (!PrivyProviders || !privyEnabled) return plain;
  return (
    <PrivyFallback fallback={plain}>
      <PrivyProviders queryClient={queryClient}>{page}</PrivyProviders>
    </PrivyFallback>
  );
}
