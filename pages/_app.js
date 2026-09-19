import '../styles.css';
import { useState } from 'react';
import { Inter_Tight } from 'next/font/google';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '../lib/wagmi';
import Layout from '../components/Layout';

const font = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export default function App({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className={font.className}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
