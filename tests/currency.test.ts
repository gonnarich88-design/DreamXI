import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import {
  getOrCreateBalance,
  creditLP,
  debitLP,
  creditPendingPP,
  confirmPP,
  debitConfirmedPP,
  creditXP,
  creditDust,
  debitDust,
  InsufficientFundsError,
} from '../src/modules/currency/currency.service';

describe('currency.service', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: { email: 'player@example.com', passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a zeroed balance the first time it is requested', async () => {
    const balance = await getOrCreateBalance(userId);
    expect(balance.lp).toBe(0);
    expect(balance.ppPending).toBe(0);
    expect(balance.ppConfirmed).toBe(0);
    expect(balance.xp).toBe(0);
    expect(balance.dust).toBe(0);
  });

  it('credits LP and records a transaction', async () => {
    const balance = await creditLP(userId, 10, 'daily_login');
    expect(balance.lp).toBe(10);

    const txns = await prisma.currencyTransaction.findMany({ where: { userId } });
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ currency: 'LP', amount: 10, reason: 'daily_login' });
  });

  it('throws InsufficientFundsError when debiting more LP than available', async () => {
    await creditLP(userId, 5, 'daily_login');
    await expect(debitLP(userId, 10, 'open_pack')).rejects.toThrow(InsufficientFundsError);
  });

  it('moves PP from pending to confirmed via confirmPP', async () => {
    await creditPendingPP(userId, 20, 'purchase_completed');
    let balance = await getOrCreateBalance(userId);
    expect(balance.ppPending).toBe(20);
    expect(balance.ppConfirmed).toBe(0);

    balance = await confirmPP(userId, 20, 'return_window_elapsed');
    expect(balance.ppPending).toBe(0);
    expect(balance.ppConfirmed).toBe(20);
  });

  it('records a PP_PENDING debit so the ledger can reconstruct ppPending after confirmPP', async () => {
    await creditPendingPP(userId, 20, 'purchase_completed');
    await confirmPP(userId, 20, 'return_window_elapsed');

    const pendingTxns = await prisma.currencyTransaction.findMany({
      where: { userId, currency: 'PP_PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    const reconstructedPending = pendingTxns.reduce((sum, t) => sum + t.amount, 0);

    const balance = await getOrCreateBalance(userId);
    expect(reconstructedPending).toBe(balance.ppPending);
    expect(pendingTxns).toHaveLength(2);
    expect(pendingTxns[1]).toMatchObject({
      currency: 'PP_PENDING',
      amount: -20,
      reason: 'return_window_elapsed',
    });
  });

  it('keeps every currency ledger reconstructable to its balance after a mixed sequence of operations', async () => {
    await creditLP(userId, 100, 'daily_login');
    await debitLP(userId, 30, 'open_pack');
    await creditPendingPP(userId, 50, 'purchase_completed');
    await confirmPP(userId, 20, 'return_window_elapsed');
    await debitConfirmedPP(userId, 5, 'open_gold_pack');
    await creditXP(userId, 15, 'daily_login');
    await creditDust(userId, 40, 'disenchant_bronze');
    await debitDust(userId, 10, 'dustshop_silver');

    const balance = await getOrCreateBalance(userId);
    const currencies: Array<[string, number]> = [
      ['LP', balance.lp],
      ['PP_PENDING', balance.ppPending],
      ['PP_CONFIRMED', balance.ppConfirmed],
      ['XP', balance.xp],
      ['DUST', balance.dust],
    ];

    for (const [currency, actual] of currencies) {
      const txns = await prisma.currencyTransaction.findMany({ where: { userId, currency } });
      const reconstructed = txns.reduce((sum, t) => sum + t.amount, 0);
      expect(reconstructed).toBe(actual);
    }
  });

  it('throws InsufficientFundsError confirming more PP than pending', async () => {
    await creditPendingPP(userId, 5, 'purchase_completed');
    await expect(confirmPP(userId, 10, 'return_window_elapsed')).rejects.toThrow(
      InsufficientFundsError,
    );
  });

  it('debits confirmed PP for a pack open', async () => {
    await creditPendingPP(userId, 50, 'purchase_completed');
    await confirmPP(userId, 50, 'return_window_elapsed');
    const balance = await debitConfirmedPP(userId, 50, 'open_gold_pack');
    expect(balance.ppConfirmed).toBe(0);
  });

  it('credits XP and Dust independently of LP/PP', async () => {
    const balance = await creditXP(userId, 15, 'daily_login');
    expect(balance.xp).toBe(15);

    const withDust = await creditDust(userId, 5, 'disenchant_bronze');
    expect(withDust.dust).toBe(5);
  });

  it('throws InsufficientFundsError debiting more Dust than available', async () => {
    await creditDust(userId, 5, 'disenchant_bronze');
    await expect(debitDust(userId, 10, 'dust_shop_purchase')).rejects.toThrow(
      InsufficientFundsError,
    );
  });

  it('never drives LP negative under concurrent debits for the same user', async () => {
    // Balance can afford exactly ONE of these two concurrent debits, never both.
    await creditLP(userId, 10, 'daily_login');

    const results = await Promise.allSettled([
      debitLP(userId, 8, 'open_pack_a'),
      debitLP(userId, 8, 'open_pack_b'),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsError);

    const balance = await getOrCreateBalance(userId);
    expect(balance.lp).toBe(2); // 10 - 8, never negative
  });
});
