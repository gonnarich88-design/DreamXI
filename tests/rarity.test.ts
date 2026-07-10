import { TIER_ORDER, DISENCHANT_DUST, FUSION_COST, isValidRarity } from '../src/modules/cards/rarity';

describe('rarity constants', () => {
  it('orders tiers from lowest to highest', () => {
    expect(TIER_ORDER).toEqual(['BRONZE', 'SILVER', 'GOLD', 'SPECIAL']);
  });

  it('maps each tier to its disenchant dust value', () => {
    expect(DISENCHANT_DUST.BRONZE).toBe(5);
    expect(DISENCHANT_DUST.SILVER).toBe(20);
    expect(DISENCHANT_DUST.GOLD).toBe(100);
    expect(DISENCHANT_DUST.SPECIAL).toBe(500);
  });

  it('fusion always costs 10 cards (no Level-based discount in this plan)', () => {
    expect(FUSION_COST).toBe(10);
  });

  it('validates rarity strings', () => {
    expect(isValidRarity('GOLD')).toBe(true);
    expect(isValidRarity('PLATINUM')).toBe(false);
  });
});
