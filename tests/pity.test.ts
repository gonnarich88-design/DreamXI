import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import {
  getOrCreatePityCounter,
  resolvePityForOpen,
  recordPackOpen,
} from '../src/modules/packs/pity.service';

describe('pity.service', () => {
  let userId: string;
  let packTypeId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: { email: 'pity@example.com', passwordHash: 'x' },
    });
    userId = user.id;

    const packType = await prisma.packType.create({
      data: { name: 'GOLD', pityThreshold: 3, pityGuaranteedRarity: 'SPECIAL' },
    });
    packTypeId = packType.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts a new counter at 0', async () => {
    const counter = await getOrCreatePityCounter(userId, packTypeId);
    expect(counter.count).toBe(0);
  });

  it('does not force a rarity before the threshold is reached', async () => {
    // count is 0, next open would make it 1 -- threshold is 3, not reached
    const result = await resolvePityForOpen(userId, {
      id: packTypeId,
      pityThreshold: 3,
      pityGuaranteedRarity: 'SPECIAL',
    });
    expect(result.forcedRarity).toBeNull();
    expect(result.willTrigger).toBe(false);
    expect(result.nextCount).toBe(1);
  });

  it('forces the guaranteed rarity when the next open reaches the threshold', async () => {
    await recordPackOpen(userId, packTypeId, false); // count -> 1
    await recordPackOpen(userId, packTypeId, false); // count -> 2

    const result = await resolvePityForOpen(userId, {
      id: packTypeId,
      pityThreshold: 3,
      pityGuaranteedRarity: 'SPECIAL',
    });
    expect(result.forcedRarity).toBe('SPECIAL');
    expect(result.willTrigger).toBe(true);
  });

  it('resets the counter to 0 when a triggered open is recorded', async () => {
    await recordPackOpen(userId, packTypeId, false);
    await recordPackOpen(userId, packTypeId, false);
    const afterTrigger = await recordPackOpen(userId, packTypeId, true);
    expect(afterTrigger.count).toBe(0);
  });

  it('never forces a rarity when the pack type has no pity configured', async () => {
    const noPityPackType = await prisma.packType.create({
      data: { name: 'BRONZE', pityThreshold: null, pityGuaranteedRarity: null },
    });

    const result = await resolvePityForOpen(userId, {
      id: noPityPackType.id,
      pityThreshold: null,
      pityGuaranteedRarity: null,
    });
    expect(result.forcedRarity).toBeNull();
    expect(result.willTrigger).toBe(false);
  });
});
