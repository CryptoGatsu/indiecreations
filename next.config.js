/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/supporter', destination: '/playtest', permanent: true },
      { source: '/dashboard', destination: '/reviews', permanent: true },
    ];
  },
  async rewrites() {
    // Clean URL for the playtest build; the Unity page itself lives in /public/game.
    return [{ source: '/play', destination: '/game/index.html' }];
  },
  webpack: (config) => {
    // Optional deps pulled in by WalletConnect that aren't needed in the browser.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    return config;
  },
};

module.exports = nextConfig;
