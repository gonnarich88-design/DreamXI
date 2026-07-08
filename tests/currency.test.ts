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
});
