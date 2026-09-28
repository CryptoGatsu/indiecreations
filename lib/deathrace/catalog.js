// What DeathRace3000's wallet pays for: cars and paints (sold by its CosmeticShop contract, 100% to the treasury) and the
// heat entry. Item ids and prices MUST match the game (Assets/Game/Scripts/Economy.cs: paint i -> item 100 + i,
// car c -> item 200 + c).
import { drConfig } from './config';
import { getTokenPriceUsd } from '../price';

export const HEAT_ENTRY_USD = 5;

const PAINTS = [
  ['Blood Red', 0], ['Hellfire Orange', 0.75], ['Toxic Green', 0.75], ['Cobalt Blue', 0], ['Bone White', 0.75],
  ['Hot Pink', 0.75], ['Purple Haze', 0.75], ['Matte Black', 0], ['Rust Bucket', 1.0], ['Gunmetal', 1.25],
  ['Mirror Chrome', 2.0], ['Solid Gold', 2.0],
];

// Cars: item 200 + car index (Economy.CarItemBase / CarUsd). RAMPAGE (0) is the free starter.
const CARS = [['VIPER', 3.0], ['JUGGERNAUT', 3.0], ['HELLCAT', 4.0], ['SPECTRE', 5.0], ['WARDOG', 4.0], ['REAPER', 5.0]];

export const COSMETICS = [
  ...PAINTS.map(([name, usd], i) => ({ id: 100 + i, kind: 'paint', index: i, name, usd })).filter((c) => c.usd > 0),
  ...CARS.map(([name, usd], i) => ({ id: 201 + i, kind: 'car', index: i + 1, name, usd })),
];

/** CosmeticShop item that unlocks car index `car` (0 = the free starter, needs nothing). */
export const carItem = (car) => (car > 0 ? 200 + car : 0);

export const cosmetic = (id) => COSMETICS.find((c) => c.id === Number(id)) || null;

/** { usd, sources } or null when there's no price we're willing to charge at. Testnet: the fixed test price. */
export async function tokenPrice() {
  const cfg = drConfig();
  if (cfg.usdPerToken) return { usd: cfg.usdPerToken, sources: ['fixed test price'] };
  return getTokenPriceUsd();
}

/** Whole tokens (as 18-decimal raw units) worth `usd`, rounded up. */
export const usdToRaw = (usd, usdPerToken) => BigInt(Math.ceil(usd / usdPerToken)) * 10n ** 18n;
