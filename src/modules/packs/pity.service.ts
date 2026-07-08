import { PityCounter, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';

type Client = Prisma.TransactionClient | typeof prisma;

export async function getOrCreatePityCounter(
  userId: string,
  packTypeId: string,
  client: Client = prisma,
): Promise<PityCounter> {
  const existing = await client.pityCounter.findUnique({
    where: { userId_packTypeId: { userId, packTypeId } },
  });
  if (existing) return existing;

  return client.pityCounter.create({ data: { userId, packTypeId, count: 0 } });
}

export async function resolvePityForOpen(
  userId: string,
  packType: { id: string; pityThreshold: number | null; pityGuaranteedRarity: string | null },
  client: Client = prisma,
): Promise<{ forcedRarity: string | null; nextCount: number; willTrigger: boolean }> {
  if (packType.pityThreshold === null || packType.pityGuaranteedRarity === null) {
    return { forcedRarity: null, nextCount: 0, willTrigger: false };
  }

  const counter = await getOrCreatePityCounter(userId, packType.id, client);
  const nextCount = counter.count + 1;
  const willTrigger = nextCount >= packType.pityThreshold;

  return {
    forcedRarity: willTrigger ? packType.pityGuaranteedRarity : null,
    nextCount,
    willTrigger,
  };
}

export async function recordPackOpen(
  userId: string,
  packTypeId: string,
  triggered: boolean,
  client: Client = prisma,
): Promise<PityCounter> {
  await getOrCreatePityCounter(userId, packTypeId, client);

  return client.pityCounter.update({
    where: { userId_packTypeId: { userId, packTypeId } },
    data: triggered ? { count: 0 } : { count: { increment: 1 } },
  });
}
