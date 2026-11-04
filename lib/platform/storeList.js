// Server-side only: the store's published games for the store and home pages (getStaticProps, refreshed every minute).
// Adult games are never in these lists; opted-in players see them on their own pages.
export async function storeGamesForPages() {
  const { persistent } = await import('../supabase');
  if (!persistent) return [];
  try {
    const { liveGames } = await import('./storeGames');
    return (await liveGames({ adult: false })).map(({ description, screenshots, ...card }) => card);
  } catch (err) {
    console.error('store games for pages failed:', err.message);
    return [];
  }
}
