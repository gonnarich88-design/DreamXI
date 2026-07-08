import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAYERS: Array<{ name: string; team: string; position: string; rarity: string }> = [
  // BRONZE
  { name: 'Sample Player B1', team: 'Placeholder United', position: 'DEF', rarity: 'BRONZE' },
  { name: 'Sample Player B2', team: 'Placeholder United', position: 'MID', rarity: 'BRONZE' },
  { name: 'Sample Player B3', team: 'Placeholder City', position: 'FWD', rarity: 'BRONZE' },
  { name: 'Sample Player B4', team: 'Placeholder City', position: 'GK', rarity: 'BRONZE' },
  // SILVER
  { name: 'Sample Player S1', team: 'Placeholder United', position: 'DEF', rarity: 'SILVER' },
  { name: 'Sample Player S2', team: 'Placeholder United', position: 'MID', rarity: 'SILVER' },
  { name: 'Sample Player S3', team: 'Placeholder City', position: 'FWD', rarity: 'SILVER' },
  { name: 'Sample Player S4', team: 'Placeholder City', position: 'GK', rarity: 'SILVER' },
  // GOLD
  { name: 'Sample Player G1', team: 'Placeholder United', position: 'DEF', rarity: 'GOLD' },
  { name: 'Sample Player G2', team: 'Placeholder United', position: 'MID', rarity: 'GOLD' },
  { name: 'Sample Player G3', team: 'Placeholder City', position: 'FWD', rarity: 'GOLD' },
  { name: 'Sample Player G4', team: 'Placeholder City', position: 'GK', rarity: 'GOLD' },
  // SPECIAL
  { name: 'Sample Player X1', team: 'Placeholder United', position: 'FWD', rarity: 'SPECIAL' },
  { name: 'Sample Player X2', team: 'Placeholder City', position: 'MID', rarity: 'SPECIAL' },
  { name: 'Sample Player X3', team: 'Placeholder Rovers', position: 'FWD', rarity: 'SPECIAL' },
  { name: 'Sample Player X4', team: 'Placeholder Athletic', position: 'DEF', rarity: 'SPECIAL' },
];

const PACK_TYPES: Array<{
  name: string;
  priceLP: number | null;
  pricePP: number | null;
  pityThreshold: number | null;
  pityGuaranteedRarity: string | null;
  dropRates: Array<{ rarity: string; weight: number }>;
}> = [
  {
    name: 'BRONZE',
    priceLP: 10,
    pricePP: null,
    pityThreshold: null,
    pityGuaranteedRarity: null,
    dropRates: [
      { rarity: 'BRONZE', weight: 90 },
      { rarity: 'SILVER', weight: 10 },
    ],
  },
  {
    name: 'SILVER',
    priceLP: 45,
    pricePP: null,
    pityThreshold: 20,
    pityGuaranteedRarity: 'SILVER',
    dropRates: [
      { rarity: 'BRONZE', weight: 40 },
      { rarity: 'SILVER', weight: 55 },
      { rarity: 'GOLD', weight: 5 },
    ],
  },
  {
    name: 'GOLD',
    priceLP: null,
    pricePP: 5, // TBD per design doc — placeholder pending real AOV data
    pityThreshold: 30,
    pityGuaranteedRarity: 'GOLD',
    dropRates: [
      { rarity: 'SILVER', weight: 50 },
      { rarity: 'GOLD', weight: 45 },
      { rarity: 'SPECIAL', weight: 5 },
    ],
  },
  {
    name: 'SPECIAL',
    priceLP: null,
    pricePP: 15, // TBD per design doc — placeholder pending real AOV data
    pityThreshold: 10,
    pityGuaranteedRarity: 'SPECIAL',
    dropRates: [
      { rarity: 'GOLD', weight: 60 },
      { rarity: 'SPECIAL', weight: 40 },
    ],
  },
];

async function main(): Promise<void> {
  for (const player of PLAYERS) {
    await prisma.player.create({ data: player });
  }

  for (const packType of PACK_TYPES) {
    await prisma.packType.create({
      data: {
        name: packType.name,
        priceLP: packType.priceLP,
        pricePP: packType.pricePP,
        pityThreshold: packType.pityThreshold,
        pityGuaranteedRarity: packType.pityGuaranteedRarity,
        dropRates: { create: packType.dropRates },
      },
    });
  }

  console.log(`Seeded ${PLAYERS.length} players and ${PACK_TYPES.length} pack types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
