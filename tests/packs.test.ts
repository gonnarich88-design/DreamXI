import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { creditLP, creditPendingPP, confirmPP, getOrCreateBalance } from '../src/modules/currency/currency.service';
import { openPack, PackTypeNotFoundError } from '../src/modules/packs/packs.service';

describe('packs.service openPack', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: { email: 'packs@example.com', passwordHash: 'x' },
    });
    userId = user.id;

    await prisma.player.create({
      data: { name: 'Only Bronze Player', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    await prisma.player.create({
      data: { name: 'Only Silver Player', team: 'Test FC', position: 'FWD', rarity: 'SILVER' },
    });

    await prisma.packType.create({
      data: {
        name: 'BRONZE',
        priceLP: 10,
        pricePP: null,
        pityThreshold: null,
        pityGuaranteedRarity: null,
        dropRates: {
          create: [{ rarity: 'BRONZE', weight: 100 }],
        },
      },
    });

    await prisma.packType.create({
      data: {
        name: 'GOLD',
        priceLP: null,
        pricePP: 5,
        pityThreshold: 2,
        pityGuaranteedRarity: 'SILVER',
        dropRates: {
          create: [{ rarity: 'BRONZE', weight: 100 }],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('throws PackTypeNotFoundError for an unknown pack name', async () => {
    await creditLP(userId, 100, 'daily_login');
    await expect(openPack(userId, 'NOT_A_PACK')).rejects.toThrow(PackTypeNotFoundError);
  });

  it('debits LP, awards a card, and does not trigger pity when threshold is not configured', async () => {
    await creditLP(userId, 10, 'daily_login');

    const result = await openPack(userId, 'BRONZE');

    expect(result.player.rarity).toBe('BRONZE');
    expect(result.pityTriggered).toBe(false);

    const balance = await getOrCreateBalance(userId);
    expect(balance.lp).toBe(0);

    const userCard = await prisma.userCard.findFirst({ where: { userId } });
    expect(userCard?.quantity).toBe(1);
  });

  it('increments quantity when the same player is awarded twice', async () => {
    await creditLP(userId, 20, 'daily_login');

    await openPack(userId, 'BRONZE');
    await openPack(userId, 'BRONZE');

    const userCard = await prisma.userCard.findFirst({ where: { userId } });
    expect(userCard?.quantity).toBe(2);
  });

  it('debits confirmed PP for a PP-priced pack', async () => {
    await creditPendingPP(userId, 5, 'purchase_completed');
    await confirmPP(userId, 5, 'return_window_elapsed');

    await openPack(userId, 'GOLD');

    const balance = await getOrCreateBalance(userId);
    expect(balance.ppConfirmed).toBe(0);
  });

  it('forces the guaranteed rarity and resets the counter when pity triggers', async () => {
    await prisma.player.create({
      data: { name: 'Filler Bronze Player', team: 'Test FC', position: 'GK', rarity: 'BRONZE' },
    });
    await prisma.player.create({
      data: { name: 'Pity Silver Player', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await creditPendingPP(userId, 10, 'purchase_completed');
    await confirmPP(userId, 10, 'return_window_elapsed');

    await openPack(userId, 'GOLD'); // pity count -> 1, draws BRONZE (100% table)
    const secondResult = await openPack(userId, 'GOLD'); // pity threshold is 2 -> forced to SILVER

    expect(secondResult.pityTriggered).toBe(true);
    expect(secondResult.player.rarity).toBe('SILVER');
  });
});
