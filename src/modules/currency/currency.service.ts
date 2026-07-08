import { CurrencyBalance, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';

type Client = Prisma.TransactionClient | typeof prisma;

export class InsufficientFundsError extends Error {
  constructor(currency: string, needed: number, have: number) {
    super(`Insufficient ${currency}: needed ${needed}, have ${have}`);
    this.name = 'InsufficientFundsError';
  }
}

export async function getOrCreateBalance(
  userId: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  const existing = await client.currencyBalance.findUnique({ where: { userId } });
  if (existing) return existing;
  return client.currencyBalance.create({ data: { userId } });
}

async function recordTransaction(
  client: Client,
  userId: string,
  currency: string,
  amount: number,
  reason: string,
): Promise<void> {
  await client.currencyTransaction.create({
    data: { userId, currency, amount, reason },
  });
}

export async function creditLP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  await getOrCreateBalance(userId, client);
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { lp: { increment: amount } },
  });
  await recordTransaction(client, userId, 'LP', amount, reason);
  return balance;
}

export async function debitLP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  const current = await getOrCreateBalance(userId, client);
  if (current.lp < amount) {
    throw new InsufficientFundsError('LP', amount, current.lp);
  }
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { lp: { decrement: amount } },
  });
  await recordTransaction(client, userId, 'LP', -amount, reason);
  return balance;
}

export async function creditPendingPP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  await getOrCreateBalance(userId, client);
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { ppPending: { increment: amount } },
  });
  await recordTransaction(client, userId, 'PP_PENDING', amount, reason);
  return balance;
}

export async function confirmPP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  const current = await getOrCreateBalance(userId, client);
  if (current.ppPending < amount) {
    throw new InsufficientFundsError('PP_PENDING', amount, current.ppPending);
  }
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { ppPending: { decrement: amount }, ppConfirmed: { increment: amount } },
  });
  await recordTransaction(client, userId, 'PP_CONFIRMED', amount, reason);
  return balance;
}

export async function debitConfirmedPP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  const current = await getOrCreateBalance(userId, client);
  if (current.ppConfirmed < amount) {
    throw new InsufficientFundsError('PP_CONFIRMED', amount, current.ppConfirmed);
  }
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { ppConfirmed: { decrement: amount } },
  });
  await recordTransaction(client, userId, 'PP_CONFIRMED', -amount, reason);
  return balance;
}

export async function creditXP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  await getOrCreateBalance(userId, client);
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { xp: { increment: amount } },
  });
  await recordTransaction(client, userId, 'XP', amount, reason);
  return balance;
}

export async function creditDust(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  await getOrCreateBalance(userId, client);
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { dust: { increment: amount } },
  });
  await recordTransaction(client, userId, 'DUST', amount, reason);
  return balance;
}

export async function debitDust(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  const current = await getOrCreateBalance(userId, client);
  if (current.dust < amount) {
    throw new InsufficientFundsError('DUST', amount, current.dust);
  }
  const balance = await client.currencyBalance.update({
    where: { userId },
    data: { dust: { decrement: amount } },
  });
  await recordTransaction(client, userId, 'DUST', -amount, reason);
  return balance;
}
