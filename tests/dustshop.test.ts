import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { creditDust, getOrCreateBalance, InsufficientFundsError } from '../src/modules/currency/currency.service';
import { getCatalog, purchaseSilver, InvalidPlayerForItemError } from '../src/modules/dustshop/dustshop.service';

describe('dustshop.service getCatalog', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'shop@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists all SILVER players and reports gold as not yet purchased this month', async () => {
    await prisma.player.create({
      data: { name: 'Shop Silver', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });

    const catalog = await getCatalog(userId);

    expect(catalog.silver.players).toHaveLength(1);
    expect(catalog.silver.price).toBe(300);
    expect(catalog.gold.price).toBe(2000);
    expect(catalog.gold.purchasedThisMonth).toBe(false);
    expect(catalog.special.available).toBe(false);
  });
});

describe('dustshop.service purchaseSilver', () => {
  let userId: string;
  let silverPlayerId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'buysilver@example.com', passwordHash: 'x' } });
    userId = user.id;
    await creditDust(userId, 300, 'test_seed');

    const player = await prisma.player.create({
      data: { name: 'Buyable Silver', team: 'Test FC', position: 'MID', rarity: 'SILVER' },
    });
    silverPlayerId = player.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('debits 300 dust and grants the chosen SILVER card', async () => {
    const result = await purchaseSilver(userId, silverPlayerId);

    expect(result.player.id).toBe(silverPlayerId);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(0);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverPlayerId } },
    });
    expect(card?.quantity).toBe(1);
  });

  it('throws InvalidPlayerForItemError for a non-SILVER player', async () => {
    const goldPlayer = await prisma.player.create({
      data: { name: 'Not Silver', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });

    await expect(purchaseSilver(userId, goldPlayer.id)).rejects.toThrow(InvalidPlayerForItemError);
  });

  it('throws InsufficientFundsError when dust is too low', async () => {
    const poorUser = await prisma.user.create({ data: { email: 'poor@example.com', passwordHash: 'x' } });

    await expect(purchaseSilver(poorUser.id, silverPlayerId)).rejects.toThrow(InsufficientFundsError);
  });
});
