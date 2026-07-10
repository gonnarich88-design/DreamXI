import { prisma } from '../../src/db/client';

export async function resetDb(): Promise<void> {
  await prisma.dustShopPurchase.deleteMany();
  await prisma.pityCounter.deleteMany();
  await prisma.userCard.deleteMany();
  await prisma.currencyTransaction.deleteMany();
  await prisma.currencyBalance.deleteMany();
  await prisma.packDropRate.deleteMany();
  await prisma.packType.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();
}
