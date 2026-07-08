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

  // Check every band except the last. Whatever `roll` remains after that
  // belongs to the last entry by construction -- this is the guaranteed
  // return path for the final band, not a rare edge case: it also absorbs
  // any floating-point rounding drift from the subtractions above, so
  // there is no separate "fallback" branch left untested.
  for (let i = 0; i < dropRates.length - 1; i++) {
    const entry = dropRates[i];
    if (roll < entry.weight) {
      return entry.rarity;
    }
    roll -= entry.weight;
  }

  return dropRates[dropRates.length - 1].rarity;
}
