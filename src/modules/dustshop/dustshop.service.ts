import { Player } from '@prisma/client';
import { prisma } from '../../db/client';
import { debitDust } from '../currency/currency.service';

const SILVER_PRICE = 300;
const GOLD_PRICE = 2000;

export class ItemNotAvailableError extends Error {
  constructor(itemType: string) {
    super(`Item not available for purchase: ${itemType}`);
    this.name = 'ItemNotAvailableError';
  }
}

export class InvalidPlayerForItemError extends Error {
  constructor(playerId: string, expectedRarity: string) {
    super(`Player ${playerId} is not rarity ${expectedRarity}`);
    this.name = 'InvalidPlayerForItemError';
  }
}

export function currentMonthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getCatalog(userId: string): Promise<{
  silver: { price: number; players: Player[] };
  gold: { price: number; purchasedThisMonth: boolean };
  special: { available: false };
}> {
  const silverPlayers = await prisma.player.findMany({ where: { rarity: 'SILVER' } });
  const purchasedThisMonth = await prisma.dustShopPurchase.findFirst({
    where: { userId, itemType: 'GOLD', goldMonthKey: currentMonthKey() },
  });

  return {
    silver: { price: SILVER_PRICE, players: silverPlayers },
    gold: { price: GOLD_PRICE, purchasedThisMonth: purchasedThisMonth !== null },
    special: { available: false },
  };
}

export async function purchaseSilver(userId: string, playerId: string): Promise<{ player: Player }> {
  return prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({ where: { id: playerId } });
    if (!player || player.rarity !== 'SILVER') {
      throw new InvalidPlayerForItemError(playerId, 'SILVER');
    }

    await debitDust(userId, SILVER_PRICE, 'dustshop_silver', tx);

    await tx.userCard.upsert({
      where: { userId_playerId: { userId, playerId } },
      create: { userId, playerId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    await tx.dustShopPurchase.create({
      data: { userId, itemType: 'SILVER', playerId, dustCost: SILVER_PRICE, goldMonthKey: null },
    });

    return { player };
  });
}
