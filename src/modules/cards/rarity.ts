export const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'SPECIAL'] as const;
export type Rarity = (typeof TIER_ORDER)[number];

export function isValidRarity(value: string): value is Rarity {
  return (TIER_ORDER as readonly string[]).includes(value);
}

export const DISENCHANT_DUST: Record<Rarity, number> = {
  BRONZE: 5,
  SILVER: 20,
  GOLD: 100,
  SPECIAL: 500,
};

export const FUSION_COST = 10;
