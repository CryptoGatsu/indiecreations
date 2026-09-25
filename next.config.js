/** @type {import('next').NextConfig} */

// Agentacus' game server (agent API, live fights, wallet sign-in). When set, /v1/* on this site is proxied to it so
// the browser build in /public/agentacus talks to its own origin (same-origin wallet sign-in, no CORS). Unset: the arena
// runs its offline exhibition bouts.
const ARENA_API_ORIGIN = (process.env.ARENA_API_ORIGIN || '').replace(/\/+$/, '');

const nextConfig = {
  async redirects() {
    return [
      { source: '/supporter', destination: '/playtest', permanent: true },
      { source: '/dashboard', destination: '/reviews', permanent: true },
      // Agentacus (first published as Agent Arena at /arena/index.html)
      { source: '/arena', destination: '/agentacus', permanent: true },
      { source: '/arena/index.html', destination: '/agentacus', permanent: true },
      { source: '/games/agent-arena', destination: '/games/agentacus', permanent: true },
      { source: '/agent-arena', destination: '/games/agentacus', permanent: true },
    ];
  },
  async rewrites() {
    // Clean URL for the playtest build; the Unity page itself lives in /public/game.
    const rules = [
      { source: '/play', destination: '/game/index.html' },
      // Agentacus at a clean URL; its index.html carries <base href="/agentacus/"> so its files resolve in the folder
      { source: '/agentacus', destination: '/agentacus/index.html' },
    ];
    if (ARENA_API_ORIGIN) rules.push({ source: '/v1/:path*', destination: `${ARENA_API_ORIGIN}/v1/:path*` });
    return rules;
  },
  async headers() {
    return [
      // Agentacus build files are content-hashed: cache them for good. The page and its config stay revalidated.
      { source: '/agentacus/Build/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/agentacus/Build/data-parts.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/agentacus/config.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
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
