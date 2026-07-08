export interface DropRateEntry {
  rarity: string;
  weight: number;
}

export function pickRarity(
  dropRates: DropRateEntry[],
  randomFn: () => number = Math.random,
): string {
  if (dropRates.length === 0) {
    throw new Error('dropRates must not be empty');
  }

  const totalWeight = dropRates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = randomFn() * totalWeight;

  for (const entry of dropRates) {
    if (roll < entry.weight) {
      return entry.rarity;
    }
    roll -= entry.weight;
  }

  // Floating point rounding can leave `roll` fractionally over the last
  // band's upper edge — fall back to the last entry rather than throw.
  return dropRates[dropRates.length - 1].rarity;
}
