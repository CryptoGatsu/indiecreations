/** @type {import('next').NextConfig} */

// Agent Arena's game server (agent API, live fights, wallet sign-in). When set, /v1/* on this site is proxied to it so
// the browser build in /public/arena talks to its own origin (same-origin wallet sign-in, no CORS). Unset: the arena
// runs its offline exhibition bouts.
const ARENA_API_ORIGIN = (process.env.ARENA_API_ORIGIN || '').replace(/\/+$/, '');

const nextConfig = {
  async redirects() {
    return [
      { source: '/supporter', destination: '/playtest', permanent: true },
      { source: '/dashboard', destination: '/reviews', permanent: true },
      // the Unity page loads its files relative to itself, so it has to be opened by its full path
      { source: '/arena', destination: '/arena/index.html', permanent: false },
      { source: '/agent-arena', destination: '/games/agent-arena', permanent: false },
    ];
  },
  async rewrites() {
    // Clean URL for the playtest build; the Unity page itself lives in /public/game.
    const rules = [{ source: '/play', destination: '/game/index.html' }];
    if (ARENA_API_ORIGIN) rules.push({ source: '/v1/:path*', destination: `${ARENA_API_ORIGIN}/v1/:path*` });
    return rules;
  },
  async headers() {
    return [
      // Agent Arena build files are content-hashed: cache them for good. The page and its config stay revalidated.
      { source: '/arena/Build/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/arena/Build/data-parts.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/arena/config.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
  webpack: (config) => {
    // Optional deps pulled in by WalletConnect that aren't needed in the browser.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    return config;
  },
};

module.exports = nextConfig;
