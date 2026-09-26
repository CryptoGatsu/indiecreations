import { CATALOG } from '../../../lib/catalog';
import { getTokenPriceUsd } from '../../../lib/price';
import { shopStatus, tokensForUsd, listOwned } from '../../../lib/shop';
import { readPlayerWallet } from '../../../lib/session';

// GET ?game=<name> -> the in-game shop for a browser game: its items, the live price, what the signed-in wallet owns,
// and whether checkout is open. Token amounts are estimates for the shelf; the quote at checkout is binding.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const game = typeof req.query.game === 'string' ? req.query.game.slice(0, 120) : '';
  const wallet = await readPlayerWallet(req.cookies);
  const [price, owned] = await Promise.all([
    getTokenPriceUsd().catch((err) => {
      console.error('price lookup failed:', err);
      return null;
    }),
    wallet
      ? listOwned(wallet, game || undefined).catch((err) => {
          console.error('owned lookup failed:', err);
          return [];
        })
      : [],
  ]);

  return res.status(200).json({
    status: shopStatus(),
    priceUsd: price ? price.usd : null,
    address: wallet,
    items: CATALOG.filter((item) => !game || item.game === game).map((item) => ({
      id: item.id,
      name: item.name,
      usd: item.usd,
      available: item.available !== false,
      tokens: price ? tokensForUsd(item.usd, price.usd) : null,
      owned: owned.includes(item.id),
    })),
  });
}
