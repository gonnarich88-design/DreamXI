import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { getOrCreateBalance } from '../src/modules/currency/currency.service';
import {
  disenchant,
  fuse,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
  AllSpecialsOwnedError,
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

describe('cards.service fuse', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'fuse@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('fuses 10 pooled SILVER duplicates from different players into 1 GOLD card', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Silver A', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    const silverB = await prisma.player.create({
      data: { name: 'Silver B', team: 'Test FC', position: 'MID', rarity: 'SILVER' },
    });
    await prisma.player.create({
      data: { name: 'Gold Target', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });

    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 7 } }); // surplus 6
    await prisma.userCard.create({ data: { userId, playerId: silverB.id, quantity: 5 } }); // surplus 4 -> total 10

    const result = await fuse(userId, 'SILVER');

    expect(result.fromRarity).toBe('SILVER');
    expect(result.toRarity).toBe('GOLD');
    expect(result.obtainedPlayer.rarity).toBe('GOLD');

    // Highest quantity consumed first: A(7) fully to 1, then B(5) to 1
    const cardA = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    const cardB = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverB.id } },
    });
    expect(cardA?.quantity).toBe(1);
    expect(cardB?.quantity).toBe(1);
  });

  it('throws InsufficientDuplicatesError and leaves cards untouched when surplus is below 10', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Silver A', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    // A GOLD player must exist so fuse() reaches the surplus check instead of
    // failing earlier with NoPlayersForRarityError('GOLD') — this test isolates
    // the surplus condition specifically.
    await prisma.player.create({
      data: { name: 'Gold Target', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });
    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 5 } }); // surplus 4 only

    await expect(fuse(userId, 'SILVER')).rejects.toThrow(InsufficientDuplicatesError);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    expect(card?.quantity).toBe(5);
  });

  it('throws InvalidRarityError for an unknown tier', async () => {
    await expect(fuse(userId, 'PLATINUM')).rejects.toThrow(InvalidRarityError);
  });

  it('rerolls a new SPECIAL the user does not already own when fusing SPECIAL duplicates', async () => {
    const ownedSpecial = await prisma.player.create({
      data: { name: 'Owned Special', team: 'Test FC', position: 'FWD', rarity: 'SPECIAL' },
    });
    const newSpecial = await prisma.player.create({
      data: { name: 'New Special', team: 'Test FC', position: 'MID', rarity: 'SPECIAL' },
    });
    await prisma.userCard.create({ data: { userId, playerId: ownedSpecial.id, quantity: 11 } }); // surplus 10

    const result = await fuse(userId, 'SPECIAL');

    expect(result.obtainedPlayer.id).toBe(newSpecial.id);
    expect(result.toRarity).toBe('SPECIAL');
  });

  it('blocks fusion with AllSpecialsOwnedError when every SPECIAL is already owned, without touching cards', async () => {
    const onlySpecial = await prisma.player.create({
      data: { name: 'Only Special', team: 'Test FC', position: 'FWD', rarity: 'SPECIAL' },
    });
    await prisma.userCard.create({ data: { userId, playerId: onlySpecial.id, quantity: 11 } });

    await expect(fuse(userId, 'SPECIAL')).rejects.toThrow(AllSpecialsOwnedError);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: onlySpecial.id } },
    });
    expect(card?.quantity).toBe(11);
  });

  it('never grants two fusions from surplus that can only satisfy one, under concurrent requests', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Race Silver', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await prisma.player.create({
      data: { name: 'Race Gold Target', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });
    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 11 } }); // surplus exactly 10

    const results = await Promise.allSettled([fuse(userId, 'SILVER'), fuse(userId, 'SILVER')]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    expect(card?.quantity).toBe(1);
  });
});
