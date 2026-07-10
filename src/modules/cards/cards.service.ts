import { prisma } from '../../db/client';
import { creditDust } from '../currency/currency.service';
import { DISENCHANT_DUST, isValidRarity } from './rarity';
import { InvalidRarityError } from '../../shared/errors';

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
