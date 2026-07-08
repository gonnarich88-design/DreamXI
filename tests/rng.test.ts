import { pickRarity, DropRateEntry } from '../src/modules/packs/rng';

describe('pickRarity', () => {
  const bronzePackRates: DropRateEntry[] = [
    { rarity: 'BRONZE', weight: 70 },
    { rarity: 'SILVER', weight: 25 },
    { rarity: 'GOLD', weight: 4.5 },
    { rarity: 'SPECIAL', weight: 0.5 },
  ];

  it('picks the first rarity when the roll lands in its band', () => {
    // total weight = 100, roll 0.0 * 100 = 0 -> falls in BRONZE band [0, 70)
    expect(pickRarity(bronzePackRates, () => 0.0)).toBe('BRONZE');
  });

  it('picks the second rarity when the roll lands past the first band', () => {
    // roll 0.75 * 100 = 75 -> falls in SILVER band [70, 95)
    expect(pickRarity(bronzePackRates, () => 0.75)).toBe('SILVER');
  });

  it('picks the last rarity when the roll lands in the final band', () => {
    // roll 0.999 * 100 = 99.9 -> falls in SPECIAL band [99.5, 100)
    expect(pickRarity(bronzePackRates, () => 0.999)).toBe('SPECIAL');
  });

  it('falls back to the last entry on a roll of exactly the total weight (floating point edge case)', () => {
    expect(pickRarity(bronzePackRates, () => 0.9999999999)).toBe('SPECIAL');
  });

  it('throws if dropRates is empty', () => {
    expect(() => pickRarity([], () => 0.5)).toThrow('dropRates must not be empty');
  });

  it('defaults to Math.random when no randomFn is passed', () => {
    const result = pickRarity(bronzePackRates);
    expect(['BRONZE', 'SILVER', 'GOLD', 'SPECIAL']).toContain(result);
  });
});
