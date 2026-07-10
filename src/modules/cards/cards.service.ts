import { Player, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { creditDust } from '../currency/currency.service';
import { DISENCHANT_DUST, FUSION_COST, TIER_ORDER, isValidRarity } from './rarity';
import { InvalidRarityError, NoPlayersForRarityError } from '../../shared/errors';

export class CardNotFoundError extends Error {
  constructor(playerId: string) {
    super(`No card owned for player: ${playerId}`);
    this.name = 'CardNotFoundError';
  }
}

export class InsufficientDuplicatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientDuplicatesError';
  }
}

export class InvalidQuantityError extends Error {
  constructor(quantity: number) {
    super(`Quantity must be a positive integer, got: ${quantity}`);
    this.name = 'InvalidQuantityError';
  }
}

export async function disenchant(
  userId: string,
  playerId: string,
  quantity: number,
): Promise<{ dustAwarded: number; rarity: string }> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidQuantityError(quantity);
  }

  return prisma.$transaction(async (tx) => {
    // Look up the UserCard (not the Player) first: a Player can exist in the
    // catalog without this user ever having owned it, and that "never owned"
    // case must surface as CardNotFoundError, not a false InsufficientDuplicatesError
    // from the updateMany below matching zero rows for an unrelated reason.
    const userCard = await tx.userCard.findUnique({
      where: { userId_playerId: { userId, playerId } },
      include: { player: true },
    });
    if (!userCard) throw new CardNotFoundError(playerId);
    if (!isValidRarity(userCard.player.rarity)) {
      throw new InvalidRarityError(userCard.player.rarity);
    }

    const result = await tx.userCard.updateMany({
      where: { userId, playerId, quantity: { gte: quantity + 1 } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new InsufficientDuplicatesError(
        `Not enough duplicate ${userCard.player.name} cards to disenchant ${quantity}`,
      );
    }

    const dustAwarded = DISENCHANT_DUST[userCard.player.rarity] * quantity;
    await creditDust(userId, dustAwarded, `disenchant_${userCard.player.rarity}`, tx);

    return { dustAwarded, rarity: userCard.player.rarity };
  });
}

export class AllSpecialsOwnedError extends Error {
  constructor() {
    super('All SPECIAL cards are already owned — disenchant duplicates instead of fusing');
    this.name = 'AllSpecialsOwnedError';
  }
}

async function consumeSurplus(
  tx: Prisma.TransactionClient,
  userId: string,
  rarity: string,
): Promise<void> {
  const candidates = await tx.userCard.findMany({
    where: { userId, quantity: { gt: 1 }, player: { rarity } },
    orderBy: [{ quantity: 'desc' }, { playerId: 'asc' }],
  });

  const totalSurplus = candidates.reduce((sum, c) => sum + (c.quantity - 1), 0);
  if (totalSurplus < FUSION_COST) {
    throw new InsufficientDuplicatesError(
      `Not enough duplicate ${rarity} cards to fuse (need ${FUSION_COST}, have ${totalSurplus})`,
    );
  }

  let remaining = FUSION_COST;
  for (const card of candidates) {
    if (remaining === 0) break;
    const available = card.quantity - 1;
    const take = Math.min(available, remaining);

    const result = await tx.userCard.updateMany({
      where: { id: card.id, quantity: { gte: take + 1 } },
      data: { quantity: { decrement: take } },
    });
    if (result.count === 0) {
      throw new InsufficientDuplicatesError(
        `Duplicate ${rarity} cards changed concurrently — please retry`,
      );
    }

    remaining -= take;
  }
}

export async function fuse(
  userId: string,
  rarity: string,
): Promise<{ obtainedPlayer: Player; fromRarity: string; toRarity: string }> {
  if (!isValidRarity(rarity)) {
    throw new InvalidRarityError(rarity);
  }

  return prisma.$transaction(async (tx) => {
    const isTopTier = rarity === TIER_ORDER[TIER_ORDER.length - 1];
    let resultPlayer: Player;
    let toRarity: string;

    if (isTopTier) {
      const owned = await tx.userCard.findMany({
        where: { userId, player: { rarity } },
        select: { playerId: true },
      });
      const ownedIds = owned.map((c) => c.playerId);
      const unowned = await tx.player.findMany({
        where: { rarity, id: { notIn: ownedIds } },
      });
      if (unowned.length === 0) {
        throw new AllSpecialsOwnedError();
      }
      resultPlayer = unowned[Math.floor(Math.random() * unowned.length)];
      toRarity = rarity;
    } else {
      toRarity = TIER_ORDER[TIER_ORDER.indexOf(rarity) + 1];
      const playersOfNextTier = await tx.player.findMany({ where: { rarity: toRarity } });
      if (playersOfNextTier.length === 0) {
        throw new NoPlayersForRarityError(toRarity);
      }
      resultPlayer = playersOfNextTier[Math.floor(Math.random() * playersOfNextTier.length)];
    }

    await consumeSurplus(tx, userId, rarity);

    await tx.userCard.upsert({
      where: { userId_playerId: { userId, playerId: resultPlayer.id } },
      create: { userId, playerId: resultPlayer.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    return { obtainedPlayer: resultPlayer, fromRarity: rarity, toRarity };
  });
}
