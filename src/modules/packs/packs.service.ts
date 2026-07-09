import { Player } from '@prisma/client';
import { prisma } from '../../db/client';
import { pickRarity, DropRateEntry } from './rng';
import { resolvePityForOpen, recordPackOpen } from './pity.service';
import { debitLP, debitConfirmedPP } from '../currency/currency.service';

export class PackTypeNotFoundError extends Error {
  constructor(name: string) {
    super(`Pack type not found: ${name}`);
    this.name = 'PackTypeNotFoundError';
  }
}

export class NoPlayersForRarityError extends Error {
  constructor(rarity: string) {
    super(`No players exist for rarity: ${rarity}`);
    this.name = 'NoPlayersForRarityError';
  }
}

export async function openPack(
  userId: string,
  packTypeName: string,
): Promise<{ player: Player; pityTriggered: boolean }> {
  return prisma.$transaction(async (tx) => {
    const packType = await tx.packType.findUnique({
      where: { name: packTypeName },
      include: { dropRates: true },
    });
    if (!packType) throw new PackTypeNotFoundError(packTypeName);

    if (packType.priceLP !== null) {
      await debitLP(userId, packType.priceLP, `open_pack_${packType.name}`, tx);
    } else if (packType.pricePP !== null) {
      await debitConfirmedPP(userId, packType.pricePP, `open_pack_${packType.name}`, tx);
    } else {
      throw new Error(
        `PackType ${packType.name} has no price configured (priceLP and pricePP both null)`,
      );
    }

    const pity = await resolvePityForOpen(
      userId,
      {
        id: packType.id,
        pityThreshold: packType.pityThreshold,
        pityGuaranteedRarity: packType.pityGuaranteedRarity,
      },
      tx,
    );

    const dropRateEntries: DropRateEntry[] = packType.dropRates.map((d) => ({
      rarity: d.rarity,
      weight: d.weight,
    }));

    const rarity = pity.forcedRarity ?? pickRarity(dropRateEntries);

    const playersOfRarity = await tx.player.findMany({ where: { rarity } });
    if (playersOfRarity.length === 0) {
      throw new NoPlayersForRarityError(rarity);
    }
    const player = playersOfRarity[Math.floor(Math.random() * playersOfRarity.length)];

    await tx.userCard.upsert({
      where: { userId_playerId: { userId, playerId: player.id } },
      create: { userId, playerId: player.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    await recordPackOpen(userId, packType.id, pity.willTrigger, tx);

    return { player, pityTriggered: pity.willTrigger };
  });
}
