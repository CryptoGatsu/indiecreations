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
      { source: '/sheep', destination: '/my-favorite-sheep', permanent: false },
      { source: '/snowmoon', destination: '/snowmoon-forever', permanent: false },
    ];
  },
  async rewrites() {
    // Clean URL for the playtest build; the Unity page itself lives in /public/game.
    const rules = [
      { source: '/play', destination: '/game/index.html' },
      // Agentacus at a clean URL; its index.html carries <base href="/agentacus/"> so its files resolve in the folder
      { source: '/agentacus', destination: '/agentacus/index.html' },
      // My Favorite Sheep in the browser, same arrangement (<base href="/my-favorite-sheep/">)
      { source: '/my-favorite-sheep', destination: '/my-favorite-sheep/index.html' },
      // DeathRace3000 (<base href="/deathrace3000/">); its game server is /api/deathrace/*
      { source: '/deathrace3000', destination: '/deathrace3000/index.html' },
      // Don't Worry, You're Safe! (<base href="/youre-safe/">); its API is /api/buddy/* plus the shared game shop routes
      { source: '/youre-safe', destination: '/youre-safe/index.html' },
      // Snowmoon Forever (<base href="/snowmoon-forever/">); its game server is snowmoon-api.indiecreations.fun
      { source: '/snowmoon-forever', destination: '/snowmoon-forever/index.html' },
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
      { source: '/my-favorite-sheep/Build/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/my-favorite-sheep/Build/data-parts.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/my-favorite-sheep/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/youre-safe/Build/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/youre-safe/Build/data-parts.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/youre-safe/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/youre-safe/TemplateData/buddy.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      // Snowmoon Forever's build files keep fixed names: browsers revalidate them (a cheap 304 when unchanged)
      { source: '/snowmoon-forever/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
      // DeathRace3000's build files keep fixed names: browsers revalidate them (a cheap 304 when unchanged)
      { source: '/deathrace3000/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    ];
  },
  experimental: {
    // DeathRace3000's run verifier (a self-contained linux-x64 binary) ships with its API route
    outputFileTracingIncludes: { '/api/deathrace/[...path]': ['./lib/deathrace/bin/**'] },
  },
  webpack: (config) => {
    // Optional deps pulled in by WalletConnect that aren't needed in the browser.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    return config;
  },
};

module.exports = nextConfig;
