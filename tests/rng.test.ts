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
    // roll 0.999 * 100 = 99.9 -> falls in SPECIAL band [99.5, 100). The loop
    // only checks bands 1..n-1 (BRONZE, SILVER, GOLD); the last band
    // (SPECIAL) is always returned unconditionally after that, so this
    // exercises that guaranteed final-entry return path.
    expect(pickRarity(bronzePackRates, () => 0.999)).toBe('SPECIAL');
  });

  it('returns the last entry even with a roll close to 1 against weights that have floating-point summation drift', () => {
    // 0.1 + 0.2 + 0.7 !== 1 exactly in IEEE754 (sums to
    // 1.0000000000000002). Because the last band is an unconditional
    // fallthrough rather than a `roll < weight` check, any accumulated
    // drift from the loop's subtractions cannot cause a missed match or
    // an out-of-range roll here -- the last entry is always returned.
    const driftRates: DropRateEntry[] = [
      { rarity: 'A', weight: 0.1 },
      { rarity: 'B', weight: 0.2 },
      { rarity: 'C', weight: 0.7 },
    ];
    expect(pickRarity(driftRates, () => 0.9999999999999999)).toBe('C');
  });

  it('throws if dropRates is empty', () => {
    expect(() => pickRarity([], () => 0.5)).toThrow('dropRates must not be empty');
  });

  it('defaults to Math.random when no randomFn is passed', () => {
    const result = pickRarity(bronzePackRates);
    expect(['BRONZE', 'SILVER', 'GOLD', 'SPECIAL']).toContain(result);
  });
});
