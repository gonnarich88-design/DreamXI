import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { getOrCreateBalance } from '../src/modules/currency/currency.service';
import {
  disenchant,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
} from '../src/modules/cards/cards.service';
import { InvalidRarityError } from '../src/shared/errors';

describe('cards.service disenchant', () => {
  let userId: string;
  let bronzePlayerId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'cards@example.com', passwordHash: 'x' } });
    userId = user.id;

    const player = await prisma.player.create({
      data: { name: 'Disenchant Bronze', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    bronzePlayerId = player.id;

    await prisma.userCard.create({ data: { userId, playerId: bronzePlayerId, quantity: 3 } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('credits dust based on rarity and quantity, leaving at least 1 copy', async () => {
    const result = await disenchant(userId, bronzePlayerId, 2);

    expect(result.dustAwarded).toBe(10); // BRONZE = 5 dust each, 2 cards
    expect(result.rarity).toBe('BRONZE');

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(10);

    const userCard = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: bronzePlayerId } },
    });
    expect(userCard?.quantity).toBe(1);
  });

  it('throws InsufficientDuplicatesError when disenchanting would leave 0 copies, without touching data', async () => {
    await expect(disenchant(userId, bronzePlayerId, 3)).rejects.toThrow(InsufficientDuplicatesError);

    const userCard = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: bronzePlayerId } },
    });
    expect(userCard?.quantity).toBe(3);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(0);
  });

  it('throws CardNotFoundError for a player the user has never owned', async () => {
    const otherPlayer = await prisma.player.create({
      data: { name: 'Never Owned', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });

    await expect(disenchant(userId, otherPlayer.id, 1)).rejects.toThrow(CardNotFoundError);
  });

  it('throws InvalidQuantityError for zero or negative quantity', async () => {
    await expect(disenchant(userId, bronzePlayerId, 0)).rejects.toThrow(InvalidQuantityError);
    await expect(disenchant(userId, bronzePlayerId, -1)).rejects.toThrow(InvalidQuantityError);
  });

  it('throws InvalidRarityError if the owned card has an unrecognized rarity', async () => {
    const oddPlayer = await prisma.player.create({
      data: { name: 'Odd Rarity', team: 'Test FC', position: 'GK', rarity: 'PLATINUM' },
    });
    await prisma.userCard.create({ data: { userId, playerId: oddPlayer.id, quantity: 2 } });

    await expect(disenchant(userId, oddPlayer.id, 1)).rejects.toThrow(InvalidRarityError);
  });
});
