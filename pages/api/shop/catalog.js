import { CATALOG } from '../../../lib/catalog';
import { getTokenPriceUsd } from '../../../lib/price';
import { shopStatus, tokensForUsd, listOwned } from '../../../lib/shop';
import { STEAM_COOKIE, readSteamToken } from '../../../lib/session';

// GET -> everything the shop page needs: the items, the live price, what this Steam account owns, and whether
// checkout is open.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const steam = await readSteamToken(req.cookies[STEAM_COOKIE]);

  const [price, owned] = await Promise.all([
    getTokenPriceUsd().catch((err) => {
      console.error('price lookup failed:', err);
      return null;
    }),
    steam
      ? listOwned(steam.steamId).catch((err) => {
          console.error('owned lookup failed:', err);
          return [];
        })
      : [],
  ]);

  return res.status(200).json({
    status: shopStatus(),
    priceUsd: price ? price.usd : null,
    steam: steam ? { steamId: steam.steamId, name: steam.name, avatar: steam.avatar } : null,
    items: CATALOG.map((item) => ({
      id: item.id,
      game: item.game,
      name: item.name,
      description: item.description || '',
      usd: item.usd,
      image: item.image || null,
      available: item.available !== false,
      // an estimate for the card; the binding amount comes from the quote at checkout
      tokens: price ? tokensForUsd(item.usd, price.usd) : null,
      owned: owned.includes(item.id),
    })),
  });
}
