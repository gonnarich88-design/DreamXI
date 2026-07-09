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
  return client.currencyBalance.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
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

/**
 * Atomically decrements `field` by `amount` only if the row's current value
 * is >= amount, in one SQL statement (`UPDATE ... WHERE userId = ? AND
 * field >= amount`). This closes the check-then-act race that a separate
 * `findUnique` + `update` has under concurrent debits: two simultaneous
 * calls both reading a stale balance can both pass a plain `if (current <
 * amount)` guard and both apply their decrement, driving the balance
 * negative. `updateMany`'s `count` tells us whether the condition held at
 * the moment of the write, not at the moment of an earlier read.
 */
async function decrementIfSufficient(
  client: Client,
  userId: string,
  field: 'lp' | 'ppConfirmed' | 'dust',
  amount: number,
): Promise<boolean> {
  const result = await client.currencyBalance.updateMany({
    where: { userId, [field]: { gte: amount } },
    data: { [field]: { decrement: amount } },
  });
  return result.count > 0;
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
  await getOrCreateBalance(userId, client);
  const succeeded = await decrementIfSufficient(client, userId, 'lp', amount);
  if (!succeeded) {
    const current = await getOrCreateBalance(userId, client);
    throw new InsufficientFundsError('LP', amount, current.lp);
  }
  await recordTransaction(client, userId, 'LP', -amount, reason);
  return getOrCreateBalance(userId, client);
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
  await getOrCreateBalance(userId, client);
  const result = await client.currencyBalance.updateMany({
    where: { userId, ppPending: { gte: amount } },
    data: { ppPending: { decrement: amount }, ppConfirmed: { increment: amount } },
  });
  if (result.count === 0) {
    const current = await getOrCreateBalance(userId, client);
    throw new InsufficientFundsError('PP_PENDING', amount, current.ppPending);
  }
  await recordTransaction(client, userId, 'PP_CONFIRMED', amount, reason);
  return getOrCreateBalance(userId, client);
}

export async function debitConfirmedPP(
  userId: string,
  amount: number,
  reason: string,
  client: Client = prisma,
): Promise<CurrencyBalance> {
  await getOrCreateBalance(userId, client);
  const succeeded = await decrementIfSufficient(client, userId, 'ppConfirmed', amount);
  if (!succeeded) {
    const current = await getOrCreateBalance(userId, client);
    throw new InsufficientFundsError('PP_CONFIRMED', amount, current.ppConfirmed);
  }
  await recordTransaction(client, userId, 'PP_CONFIRMED', -amount, reason);
  return getOrCreateBalance(userId, client);
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
  await getOrCreateBalance(userId, client);
  const succeeded = await decrementIfSufficient(client, userId, 'dust', amount);
  if (!succeeded) {
    const current = await getOrCreateBalance(userId, client);
    throw new InsufficientFundsError('DUST', amount, current.dust);
  }
  await recordTransaction(client, userId, 'DUST', -amount, reason);
  return getOrCreateBalance(userId, client);
}
