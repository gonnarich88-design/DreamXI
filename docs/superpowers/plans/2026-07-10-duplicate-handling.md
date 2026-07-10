# Duplicate Handling (Disenchant/Dust, Fusion, Dust Shop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players convert duplicate cards into Dust (Disenchant), combine duplicates into a higher-tier card (Fusion), and spend Dust in a tightly-limited shop (Dust Shop) — closing the loop on the duplicate cards produced by Plan 1's pack-opening system.

**Architecture:** Two new Express modules (`src/modules/cards`, `src/modules/dustshop`) follow the exact pattern established by `src/modules/packs` in Plan 1: a `*.service.ts` with pure business logic wrapped in `prisma.$transaction`, a `*.routes.ts` mapping typed errors to HTTP status codes, mounted in `app.ts`. A new `DustShopPurchase` table tracks every shop purchase and enforces the "1 Gold token per calendar month" rule via a database unique constraint (not a check-then-act query), avoiding the same class of race condition Plan 1 fixed for `getOrCreateBalance` in commit `99a3440`.

**Tech Stack:** Node.js 20+ · TypeScript (strict) · Express 4 · PostgreSQL · Prisma ORM · Jest + ts-jest + supertest (all already configured in this repo)

## Global Constraints

Copied verbatim from `CLAUDE.md` and the spec doc — every task below implicitly includes these:

- ทุกการเปลี่ยนแปลงยอดแต้ม (LP/PP/XP/Dust) ต้องผ่าน `src/modules/currency/currency.service.ts` เท่านั้น ห้ามเขียนแตะ `CurrencyBalance` table ตรงๆ จากที่อื่น
- RNG การสุ่ม rarity ต้องรันฝั่ง server เท่านั้น
- การหักแต้ม + มอบการ์ด ต้องอยู่ใน `prisma.$transaction(...)` เดียวกันเสมอ
- แต้มทุกชนิดเป็น integer เท่านั้น
- Fusion ใช้ 10 การ์ดเสมอ ไม่มี Level-based discount ใน Plan นี้ (ตัดออกตาม spec §2)
- Disenchant/Fusion ต้องเหลือการ์ดอย่างน้อย 1 ใบต่อนักเตะเสมอ (ห้ามหักจนเหลือ 0)
- Fusion ดึงการ์ดซ้ำแบบคละนักเตะได้ภายใน tier เดียวกัน (ไม่ต้องเป็นนักเตะเดียวกัน 10 ใบ) — หักจากใบ `quantity` สูงสุดก่อนเสมอ (deterministic, tie-break ด้วย `playerId asc`)
- Gold shop limit คือ 1 ครั้ง/calendar month (UTC), บังคับด้วย DB unique constraint ไม่ใช่ count query
- SPECIAL ห้ามขายใน Dust Shop เด็ดขาด — ไม่มี code path ใดขายได้
- Rarity tiers ที่มีจริงในระบบ: `BRONZE < SILVER < GOLD < SPECIAL` (ไม่มี ICON แยก)

**อ้างอิง spec เต็ม:** [`docs/superpowers/specs/2026-07-10-duplicate-handling-design.md`](../specs/2026-07-10-duplicate-handling-design.md)

---

## File Structure

```
prisma/schema.prisma                    — Modify: add DustShopPurchase model + relations
src/shared/errors.ts                    — Create: NoPlayersForRarityError, InvalidRarityError
src/modules/packs/packs.service.ts      — Modify: import NoPlayersForRarityError from shared instead of defining locally
src/modules/cards/rarity.ts             — Create: TIER_ORDER, DISENCHANT_DUST, FUSION_COST, isValidRarity
src/modules/cards/cards.service.ts      — Create: disenchant(), fuse()
src/modules/cards/cards.routes.ts       — Create: POST /disenchant, POST /fusion
src/modules/dustshop/dustshop.service.ts — Create: getCatalog(), purchaseSilver(), purchaseGold(), purchase()
src/modules/dustshop/dustshop.routes.ts  — Create: GET /catalog, POST /purchase
src/app.ts                              — Modify: mount cardsRouter, dustshopRouter
tests/rarity.test.ts                    — Create
tests/cards.test.ts                     — Create
tests/dustshop.test.ts                  — Create
```

---

### Task 1: Database schema — DustShopPurchase model

**Files:**
- Modify: `prisma/schema.prisma:10-20` (User model), `prisma/schema.prisma:43-50` (Player model), end of file (new model)

**Interfaces:**
- Produces: `DustShopPurchase` Prisma model with fields `id, userId, user, itemType, playerId, player, dustCost, goldMonthKey, createdAt`, unique constraint `@@unique([userId, goldMonthKey])`

- [ ] **Step 1: Add the reverse relation to `User`**

In `prisma/schema.prisma`, change:
```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  currencyBalance CurrencyBalance?
  currencyTxns    CurrencyTransaction[]
  userCards       UserCard[]
  pityCounters    PityCounter[]
}
```
to:
```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  currencyBalance   CurrencyBalance?
  currencyTxns      CurrencyTransaction[]
  userCards         UserCard[]
  pityCounters      PityCounter[]
  dustShopPurchases DustShopPurchase[]
}
```

- [ ] **Step 2: Add the reverse relation to `Player`**

Change:
```prisma
model Player {
  id        String     @id @default(uuid())
  name      String
  team      String
  position  String
  rarity    String
  userCards UserCard[]
}
```
to:
```prisma
model Player {
  id                String             @id @default(uuid())
  name              String
  team              String
  position          String
  rarity            String
  userCards         UserCard[]
  dustShopPurchases DustShopPurchase[]
}
```

- [ ] **Step 3: Append the new `DustShopPurchase` model**

Add at the end of `prisma/schema.prisma`:
```prisma
model DustShopPurchase {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  itemType     String // "SILVER" | "GOLD"
  playerId     String?
  player       Player?  @relation(fields: [playerId], references: [id])
  dustCost     Int
  goldMonthKey String? // "YYYY-MM" (UTC), set only when itemType="GOLD", null for SILVER
  createdAt    DateTime @default(now())

  @@unique([userId, goldMonthKey])
}
```

- [ ] **Step 4: Run the migration**

Run: `npx dotenv -e .env -- npx prisma migrate dev --name add_dust_shop_purchase`
Expected: `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` containing the generated SQL. This also regenerates the Prisma Client, so `prisma.dustShopPurchase` becomes available in TypeScript.

- [ ] **Step 5: Verify the client compiles**

Run: `npx tsc --noEmit`
Expected: no errors (the schema change alone doesn't touch any `.ts` files yet, this just confirms the generated client is valid)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add DustShopPurchase model with race-safe monthly Gold limit"
```

---

### Task 2: Shared errors + rarity constants

**Files:**
- Create: `src/shared/errors.ts`
- Create: `src/modules/cards/rarity.ts`
- Modify: `src/modules/packs/packs.service.ts:1-19`
- Test: `tests/rarity.test.ts`

**Interfaces:**
- Produces: `NoPlayersForRarityError`, `InvalidRarityError` (from `src/shared/errors.ts`); `TIER_ORDER: readonly string[]`, `Rarity` type, `isValidRarity(value: string): value is Rarity`, `DISENCHANT_DUST: Record<Rarity, number>`, `FUSION_COST: number` (from `src/modules/cards/rarity.ts`)
- Consumes: nothing new (moves an existing class out of `packs.service.ts`)

- [ ] **Step 1: Write the failing test for rarity constants**

Create `tests/rarity.test.ts`:
```typescript
import { TIER_ORDER, DISENCHANT_DUST, FUSION_COST, isValidRarity } from '../src/modules/cards/rarity';

describe('rarity constants', () => {
  it('orders tiers from lowest to highest', () => {
    expect(TIER_ORDER).toEqual(['BRONZE', 'SILVER', 'GOLD', 'SPECIAL']);
  });

  it('maps each tier to its disenchant dust value', () => {
    expect(DISENCHANT_DUST.BRONZE).toBe(5);
    expect(DISENCHANT_DUST.SILVER).toBe(20);
    expect(DISENCHANT_DUST.GOLD).toBe(100);
    expect(DISENCHANT_DUST.SPECIAL).toBe(500);
  });

  it('fusion always costs 10 cards (no Level-based discount in this plan)', () => {
    expect(FUSION_COST).toBe(10);
  });

  it('validates rarity strings', () => {
    expect(isValidRarity('GOLD')).toBe(true);
    expect(isValidRarity('PLATINUM')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rarity.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/cards/rarity'`

- [ ] **Step 3: Create `src/shared/errors.ts`**

```typescript
export class NoPlayersForRarityError extends Error {
  constructor(rarity: string) {
    super(`No players exist for rarity: ${rarity}`);
    this.name = 'NoPlayersForRarityError';
  }
}

export class InvalidRarityError extends Error {
  constructor(rarity: string) {
    super(`Invalid rarity: ${rarity}`);
    this.name = 'InvalidRarityError';
  }
}
```

- [ ] **Step 4: Create `src/modules/cards/rarity.ts`**

```typescript
export const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'SPECIAL'] as const;
export type Rarity = (typeof TIER_ORDER)[number];

export function isValidRarity(value: string): value is Rarity {
  return (TIER_ORDER as readonly string[]).includes(value);
}

export const DISENCHANT_DUST: Record<Rarity, number> = {
  BRONZE: 5,
  SILVER: 20,
  GOLD: 100,
  SPECIAL: 500,
};

export const FUSION_COST = 10;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- rarity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Move `NoPlayersForRarityError` out of `packs.service.ts` to the shared location**

In `src/modules/packs/packs.service.ts`, change:
```typescript
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
```
to:
```typescript
import { Player } from '@prisma/client';
import { prisma } from '../../db/client';
import { pickRarity, DropRateEntry } from './rng';
import { resolvePityForOpen, recordPackOpen } from './pity.service';
import { debitLP, debitConfirmedPP } from '../currency/currency.service';
import { NoPlayersForRarityError } from '../../shared/errors';

export { NoPlayersForRarityError };

export class PackTypeNotFoundError extends Error {
  constructor(name: string) {
    super(`Pack type not found: ${name}`);
    this.name = 'PackTypeNotFoundError';
  }
}
```

This keeps `import { NoPlayersForRarityError } from '../src/modules/packs/packs.service'` working unchanged in `tests/packs.test.ts` while making the class available for the new modules via `src/shared/errors.ts`.

- [ ] **Step 7: Confirm the refactor didn't break Plan 1's tests**

Run: `npm test -- packs.test.ts`
Expected: PASS (all existing tests, unchanged)

- [ ] **Step 8: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/shared/errors.ts src/modules/cards/rarity.ts src/modules/packs/packs.service.ts tests/rarity.test.ts
git commit -m "refactor: extract NoPlayersForRarityError to shared errors, add rarity constants"
```

---

### Task 3: Disenchant service

**Files:**
- Create: `src/modules/cards/cards.service.ts`
- Test: `tests/cards.test.ts`

**Interfaces:**
- Consumes: `creditDust(userId: string, amount: number, reason: string, client?: Client): Promise<CurrencyBalance>` from `src/modules/currency/currency.service.ts`; `DISENCHANT_DUST`, `isValidRarity` from `./rarity`; `InvalidRarityError` from `../../shared/errors`
- Produces: `disenchant(userId: string, playerId: string, quantity: number): Promise<{ dustAwarded: number; rarity: string }>`; error classes `CardNotFoundError`, `InsufficientDuplicatesError`, `InvalidQuantityError`

- [ ] **Step 1: Write the failing tests**

Create `tests/cards.test.ts`:
```typescript
import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { getOrCreateBalance } from '../src/modules/currency/currency.service';
import {
  disenchant,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
} from '../src/modules/cards/cards.service';
import { InvalidRarityError } from '../src/shared/errors';

describe('cards.service disenchant', () => {
  let userId: string;
  let bronzePlayerId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'cards@example.com', passwordHash: 'x' } });
    userId = user.id;

    const player = await prisma.player.create({
      data: { name: 'Disenchant Bronze', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    bronzePlayerId = player.id;

    await prisma.userCard.create({ data: { userId, playerId: bronzePlayerId, quantity: 3 } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('credits dust based on rarity and quantity, leaving at least 1 copy', async () => {
    const result = await disenchant(userId, bronzePlayerId, 2);

    expect(result.dustAwarded).toBe(10); // BRONZE = 5 dust each, 2 cards
    expect(result.rarity).toBe('BRONZE');

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(10);

    const userCard = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: bronzePlayerId } },
    });
    expect(userCard?.quantity).toBe(1);
  });

  it('throws InsufficientDuplicatesError when disenchanting would leave 0 copies, without touching data', async () => {
    await expect(disenchant(userId, bronzePlayerId, 3)).rejects.toThrow(InsufficientDuplicatesError);

    const userCard = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: bronzePlayerId } },
    });
    expect(userCard?.quantity).toBe(3);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(0);
  });

  it('throws CardNotFoundError for a player the user has never owned', async () => {
    const otherPlayer = await prisma.player.create({
      data: { name: 'Never Owned', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });

    await expect(disenchant(userId, otherPlayer.id, 1)).rejects.toThrow(CardNotFoundError);
  });

  it('throws InvalidQuantityError for zero or negative quantity', async () => {
    await expect(disenchant(userId, bronzePlayerId, 0)).rejects.toThrow(InvalidQuantityError);
    await expect(disenchant(userId, bronzePlayerId, -1)).rejects.toThrow(InvalidQuantityError);
  });

  it('throws InvalidRarityError if the owned card has an unrecognized rarity', async () => {
    const oddPlayer = await prisma.player.create({
      data: { name: 'Odd Rarity', team: 'Test FC', position: 'GK', rarity: 'PLATINUM' },
    });
    await prisma.userCard.create({ data: { userId, playerId: oddPlayer.id, quantity: 2 } });

    await expect(disenchant(userId, oddPlayer.id, 1)).rejects.toThrow(InvalidRarityError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cards.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/cards/cards.service'`

- [ ] **Step 3: Create `src/modules/cards/cards.service.ts` with `disenchant()`**

```typescript
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
    const player = await tx.player.findUnique({ where: { id: playerId } });
    if (!player) throw new CardNotFoundError(playerId);
    if (!isValidRarity(player.rarity)) throw new InvalidRarityError(player.rarity);

    const result = await tx.userCard.updateMany({
      where: { userId, playerId, quantity: { gte: quantity + 1 } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new InsufficientDuplicatesError(
        `Not enough duplicate ${player.name} cards to disenchant ${quantity}`,
      );
    }

    const dustAwarded = DISENCHANT_DUST[player.rarity] * quantity;
    await creditDust(userId, dustAwarded, `disenchant_${player.rarity}`, tx);

    return { dustAwarded, rarity: player.rarity };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cards.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/cards/cards.service.ts tests/cards.test.ts
git commit -m "feat: add disenchant() — convert duplicate cards into Dust"
```

---

### Task 4: Fusion service

**Files:**
- Modify: `src/modules/cards/cards.service.ts` (append `fuse()` and its helper)
- Modify: `tests/cards.test.ts` (append `describe('cards.service fuse', ...)`)

**Interfaces:**
- Consumes: `TIER_ORDER`, `FUSION_COST`, `isValidRarity` from `./rarity`; `InvalidRarityError`, `NoPlayersForRarityError` from `../../shared/errors`
- Produces: `fuse(userId: string, rarity: string): Promise<{ obtainedPlayer: Player; fromRarity: string; toRarity: string }>`; error class `AllSpecialsOwnedError`

- [ ] **Step 1: Append the failing tests to `tests/cards.test.ts`**

In `tests/cards.test.ts`, change the existing `cards.service` import to add `fuse` and `AllSpecialsOwnedError`:
```typescript
import {
  disenchant,
  fuse,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
  AllSpecialsOwnedError,
} from '../src/modules/cards/cards.service';
```

Append this new `describe` block at the end of `tests/cards.test.ts`:
```typescript
describe('cards.service fuse', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'fuse@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('fuses 10 pooled SILVER duplicates from different players into 1 GOLD card', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Silver A', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    const silverB = await prisma.player.create({
      data: { name: 'Silver B', team: 'Test FC', position: 'MID', rarity: 'SILVER' },
    });
    await prisma.player.create({
      data: { name: 'Gold Target', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });

    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 7 } }); // surplus 6
    await prisma.userCard.create({ data: { userId, playerId: silverB.id, quantity: 5 } }); // surplus 4 -> total 10

    const result = await fuse(userId, 'SILVER');

    expect(result.fromRarity).toBe('SILVER');
    expect(result.toRarity).toBe('GOLD');
    expect(result.obtainedPlayer.rarity).toBe('GOLD');

    // Highest quantity consumed first: A(7) fully to 1, then B(5) to 1
    const cardA = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    const cardB = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverB.id } },
    });
    expect(cardA?.quantity).toBe(1);
    expect(cardB?.quantity).toBe(1);
  });

  it('throws InsufficientDuplicatesError and leaves cards untouched when surplus is below 10', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Silver A', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 5 } }); // surplus 4 only

    await expect(fuse(userId, 'SILVER')).rejects.toThrow(InsufficientDuplicatesError);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    expect(card?.quantity).toBe(5);
  });

  it('throws InvalidRarityError for an unknown tier', async () => {
    await expect(fuse(userId, 'PLATINUM')).rejects.toThrow(InvalidRarityError);
  });

  it('rerolls a new SPECIAL the user does not already own when fusing SPECIAL duplicates', async () => {
    const ownedSpecial = await prisma.player.create({
      data: { name: 'Owned Special', team: 'Test FC', position: 'FWD', rarity: 'SPECIAL' },
    });
    const newSpecial = await prisma.player.create({
      data: { name: 'New Special', team: 'Test FC', position: 'MID', rarity: 'SPECIAL' },
    });
    await prisma.userCard.create({ data: { userId, playerId: ownedSpecial.id, quantity: 11 } }); // surplus 10

    const result = await fuse(userId, 'SPECIAL');

    expect(result.obtainedPlayer.id).toBe(newSpecial.id);
    expect(result.toRarity).toBe('SPECIAL');
  });

  it('blocks fusion with AllSpecialsOwnedError when every SPECIAL is already owned, without touching cards', async () => {
    const onlySpecial = await prisma.player.create({
      data: { name: 'Only Special', team: 'Test FC', position: 'FWD', rarity: 'SPECIAL' },
    });
    await prisma.userCard.create({ data: { userId, playerId: onlySpecial.id, quantity: 11 } });

    await expect(fuse(userId, 'SPECIAL')).rejects.toThrow(AllSpecialsOwnedError);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: onlySpecial.id } },
    });
    expect(card?.quantity).toBe(11);
  });

  it('never grants two fusions from surplus that can only satisfy one, under concurrent requests', async () => {
    const silverA = await prisma.player.create({
      data: { name: 'Race Silver', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await prisma.player.create({
      data: { name: 'Race Gold Target', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });
    await prisma.userCard.create({ data: { userId, playerId: silverA.id, quantity: 11 } }); // surplus exactly 10

    const results = await Promise.allSettled([fuse(userId, 'SILVER'), fuse(userId, 'SILVER')]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverA.id } },
    });
    expect(card?.quantity).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cards.test.ts`
Expected: FAIL — `fuse is not a function` / `AllSpecialsOwnedError is not exported`

- [ ] **Step 3: Append `fuse()` and its helper to `src/modules/cards/cards.service.ts`**

Change the import block at the top from:
```typescript
import { prisma } from '../../db/client';
import { creditDust } from '../currency/currency.service';
import { DISENCHANT_DUST, isValidRarity } from './rarity';
import { InvalidRarityError } from '../../shared/errors';
```
to:
```typescript
import { Player, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { creditDust } from '../currency/currency.service';
import { DISENCHANT_DUST, FUSION_COST, TIER_ORDER, isValidRarity } from './rarity';
import { InvalidRarityError, NoPlayersForRarityError } from '../../shared/errors';
```

Append to the end of the file:
```typescript
export class AllSpecialsOwnedError extends Error {
  constructor() {
    super('All SPECIAL cards are already owned — disenchant duplicates instead of fusing');
    this.name = 'AllSpecialsOwnedError';
  }
}

async function consumeSurplus(
  tx: Prisma.TransactionClient,
  userId: string,
  rarity: string,
): Promise<void> {
  const candidates = await tx.userCard.findMany({
    where: { userId, quantity: { gt: 1 }, player: { rarity } },
    orderBy: [{ quantity: 'desc' }, { playerId: 'asc' }],
  });

  const totalSurplus = candidates.reduce((sum, c) => sum + (c.quantity - 1), 0);
  if (totalSurplus < FUSION_COST) {
    throw new InsufficientDuplicatesError(
      `Not enough duplicate ${rarity} cards to fuse (need ${FUSION_COST}, have ${totalSurplus})`,
    );
  }

  let remaining = FUSION_COST;
  for (const card of candidates) {
    if (remaining === 0) break;
    const available = card.quantity - 1;
    const take = Math.min(available, remaining);

    const result = await tx.userCard.updateMany({
      where: { id: card.id, quantity: { gte: take + 1 } },
      data: { quantity: { decrement: take } },
    });
    if (result.count === 0) {
      throw new InsufficientDuplicatesError(
        `Duplicate ${rarity} cards changed concurrently — please retry`,
      );
    }

    remaining -= take;
  }
}

export async function fuse(
  userId: string,
  rarity: string,
): Promise<{ obtainedPlayer: Player; fromRarity: string; toRarity: string }> {
  if (!isValidRarity(rarity)) {
    throw new InvalidRarityError(rarity);
  }

  return prisma.$transaction(async (tx) => {
    const isTopTier = rarity === TIER_ORDER[TIER_ORDER.length - 1];
    let resultPlayer: Player;
    let toRarity: string;

    if (isTopTier) {
      const owned = await tx.userCard.findMany({
        where: { userId, player: { rarity } },
        select: { playerId: true },
      });
      const ownedIds = owned.map((c) => c.playerId);
      const unowned = await tx.player.findMany({
        where: { rarity, id: { notIn: ownedIds } },
      });
      if (unowned.length === 0) {
        throw new AllSpecialsOwnedError();
      }
      resultPlayer = unowned[Math.floor(Math.random() * unowned.length)];
      toRarity = rarity;
    } else {
      toRarity = TIER_ORDER[TIER_ORDER.indexOf(rarity) + 1];
      const playersOfNextTier = await tx.player.findMany({ where: { rarity: toRarity } });
      if (playersOfNextTier.length === 0) {
        throw new NoPlayersForRarityError(toRarity);
      }
      resultPlayer = playersOfNextTier[Math.floor(Math.random() * playersOfNextTier.length)];
    }

    await consumeSurplus(tx, userId, rarity);

    await tx.userCard.upsert({
      where: { userId_playerId: { userId, playerId: resultPlayer.id } },
      create: { userId, playerId: resultPlayer.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    return { obtainedPlayer: resultPlayer, fromRarity: rarity, toRarity };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cards.test.ts`
Expected: PASS (11 tests total — 5 from disenchant, 6 from fuse)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/cards/cards.service.ts tests/cards.test.ts
git commit -m "feat: add fuse() — combine 10 pooled duplicates into the next tier, with SPECIAL reroll"
```

---

### Task 5: Cards HTTP routes

**Files:**
- Create: `src/modules/cards/cards.routes.ts`
- Modify: `src/app.ts`
- Modify: `tests/cards.test.ts` (append HTTP-level tests)

**Interfaces:**
- Consumes: `disenchant`, `fuse`, `CardNotFoundError`, `InsufficientDuplicatesError`, `InvalidQuantityError`, `AllSpecialsOwnedError` from `./cards.service`; `InvalidRarityError`, `NoPlayersForRarityError` from `../../shared/errors`; `requireAuth` from `../auth/auth.middleware`; `asyncHandler` from `../../middleware/asyncHandler`
- Produces: `cardsRouter` (Express `Router`) mounted at `/cards`

- [ ] **Step 1: Write the failing HTTP tests**

Add to the top of `tests/cards.test.ts` (merge into existing imports):
```typescript
import request from 'supertest';
import { createApp } from '../src/app';
import { registerUser, loginUser } from '../src/modules/auth/auth.service';
```

Append to the end of `tests/cards.test.ts`:
```typescript
describe('POST /cards/disenchant and /cards/fusion', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await registerUser('cardshttp@example.com', 'hunter2pass');
    userId = user.id;
    const login = await loginUser('cardshttp@example.com', 'hunter2pass');
    token = login.token;
  });

  it('rejects disenchant with no auth header', async () => {
    const res = await request(app).post('/cards/disenchant').send({ playerId: 'x', quantity: 1 });
    expect(res.status).toBe(401);
  });

  it('disenchants a duplicate card over HTTP', async () => {
    const player = await prisma.player.create({
      data: { name: 'HTTP Bronze', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    await prisma.userCard.create({ data: { userId, playerId: player.id, quantity: 2 } });

    const res = await request(app)
      .post('/cards/disenchant')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: player.id, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.dustAwarded).toBe(5);
  });

  it('returns 400 when disenchant is missing required fields', async () => {
    const res = await request(app)
      .post('/cards/disenchant')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 409 when fusion surplus is insufficient over HTTP', async () => {
    const res = await request(app)
      .post('/cards/fusion')
      .set('Authorization', `Bearer ${token}`)
      .send({ rarity: 'SILVER' });

    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid fusion rarity over HTTP', async () => {
    const res = await request(app)
      .post('/cards/fusion')
      .set('Authorization', `Bearer ${token}`)
      .send({ rarity: 'PLATINUM' });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cards.test.ts`
Expected: FAIL — `Cannot GET/POST /cards/disenchant` (404, router not mounted) or import error for `cards.routes`

- [ ] **Step 3: Create `src/modules/cards/cards.routes.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import {
  disenchant,
  fuse,
  CardNotFoundError,
  InsufficientDuplicatesError,
  InvalidQuantityError,
  AllSpecialsOwnedError,
} from './cards.service';
import { InvalidRarityError, NoPlayersForRarityError } from '../../shared/errors';
import { asyncHandler } from '../../middleware/asyncHandler';

export const cardsRouter = Router();

cardsRouter.post(
  '/disenchant',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { playerId, quantity } = req.body as { playerId?: string; quantity?: number };
    if (!playerId || typeof quantity !== 'number') {
      res.status(400).json({ error: 'playerId and quantity are required' });
      return;
    }

    try {
      const result = await disenchant(userId, playerId, quantity);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof CardNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidQuantityError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientDuplicatesError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidRarityError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

cardsRouter.post(
  '/fusion',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { rarity } = req.body as { rarity?: string };
    if (!rarity) {
      res.status(400).json({ error: 'rarity is required' });
      return;
    }

    try {
      const result = await fuse(userId, rarity);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof InvalidRarityError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientDuplicatesError || err instanceof AllSpecialsOwnedError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof NoPlayersForRarityError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);
```

Note: for `/disenchant`, `InvalidRarityError` maps to 500 (not 400) because it can only be thrown when an *already-owned* card has a rarity outside the known tiers — a data integrity problem, not a bad request from the client.

- [ ] **Step 4: Mount `cardsRouter` in `src/app.ts`**

Change:
```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);
```
to:
```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';
import { cardsRouter } from './modules/cards/cards.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);
  app.use('/cards', cardsRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- cards.test.ts`
Expected: PASS (16 tests total)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass (including Plan 1's `packs.test.ts`, `currency.test.ts`, etc. — confirms nothing regressed)

- [ ] **Step 7: Commit**

```bash
git add src/modules/cards/cards.routes.ts src/app.ts tests/cards.test.ts
git commit -m "feat: expose POST /cards/disenchant and POST /cards/fusion over HTTP"
```

---

### Task 6: Dust Shop service — catalog + Silver purchase

**Files:**
- Create: `src/modules/dustshop/dustshop.service.ts`
- Test: `tests/dustshop.test.ts`

**Interfaces:**
- Consumes: `debitDust`, `InsufficientFundsError` from `../currency/currency.service`
- Produces: `getCatalog(userId: string): Promise<{ silver: { price: number; players: Player[] }; gold: { price: number; purchasedThisMonth: boolean }; special: { available: false } }>`; `purchaseSilver(userId: string, playerId: string): Promise<{ player: Player }>`; `currentMonthKey(date?: Date): string`; error class `InvalidPlayerForItemError`

- [ ] **Step 1: Write the failing tests**

Create `tests/dustshop.test.ts`:
```typescript
import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { creditDust, getOrCreateBalance, InsufficientFundsError } from '../src/modules/currency/currency.service';
import { getCatalog, purchaseSilver, InvalidPlayerForItemError } from '../src/modules/dustshop/dustshop.service';

describe('dustshop.service getCatalog', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'shop@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists all SILVER players and reports gold as not yet purchased this month', async () => {
    await prisma.player.create({
      data: { name: 'Shop Silver', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });

    const catalog = await getCatalog(userId);

    expect(catalog.silver.players).toHaveLength(1);
    expect(catalog.silver.price).toBe(300);
    expect(catalog.gold.price).toBe(2000);
    expect(catalog.gold.purchasedThisMonth).toBe(false);
    expect(catalog.special.available).toBe(false);
  });
});

describe('dustshop.service purchaseSilver', () => {
  let userId: string;
  let silverPlayerId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'buysilver@example.com', passwordHash: 'x' } });
    userId = user.id;
    await creditDust(userId, 300, 'test_seed');

    const player = await prisma.player.create({
      data: { name: 'Buyable Silver', team: 'Test FC', position: 'MID', rarity: 'SILVER' },
    });
    silverPlayerId = player.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('debits 300 dust and grants the chosen SILVER card', async () => {
    const result = await purchaseSilver(userId, silverPlayerId);

    expect(result.player.id).toBe(silverPlayerId);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(0);

    const card = await prisma.userCard.findUnique({
      where: { userId_playerId: { userId, playerId: silverPlayerId } },
    });
    expect(card?.quantity).toBe(1);
  });

  it('throws InvalidPlayerForItemError for a non-SILVER player', async () => {
    const goldPlayer = await prisma.player.create({
      data: { name: 'Not Silver', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });

    await expect(purchaseSilver(userId, goldPlayer.id)).rejects.toThrow(InvalidPlayerForItemError);
  });

  it('throws InsufficientFundsError when dust is too low', async () => {
    const poorUser = await prisma.user.create({ data: { email: 'poor@example.com', passwordHash: 'x' } });

    await expect(purchaseSilver(poorUser.id, silverPlayerId)).rejects.toThrow(InsufficientFundsError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dustshop.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/dustshop/dustshop.service'`

- [ ] **Step 3: Create `src/modules/dustshop/dustshop.service.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dustshop.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/dustshop/dustshop.service.ts tests/dustshop.test.ts
git commit -m "feat: add Dust Shop catalog and Silver purchase"
```

---

### Task 7: Dust Shop service — Gold purchase (race-safe monthly limit)

**Files:**
- Modify: `src/modules/dustshop/dustshop.service.ts` (append `purchaseGold()`, `purchase()`)
- Modify: `tests/dustshop.test.ts` (append `describe('dustshop.service purchaseGold', ...)`)

**Interfaces:**
- Consumes: `NoPlayersForRarityError` from `../../shared/errors`; `Prisma.PrismaClientKnownRequestError` from `@prisma/client`
- Produces: `purchaseGold(userId: string): Promise<{ player: Player }>`; `purchase(userId: string, itemType: string, playerId?: string): Promise<{ player: Player }>`; error class `MonthlyLimitExceededError`

- [ ] **Step 1: Append the failing tests to `tests/dustshop.test.ts`**

Add to the imports at the top of `tests/dustshop.test.ts` (merge into the existing `dustshop.service` import):
```typescript
import {
  getCatalog,
  purchaseSilver,
  purchaseGold,
  purchase,
  InvalidPlayerForItemError,
  MonthlyLimitExceededError,
  ItemNotAvailableError,
} from '../src/modules/dustshop/dustshop.service';
```

Append to the end of `tests/dustshop.test.ts`:
```typescript
describe('dustshop.service purchaseGold', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'buygold@example.com', passwordHash: 'x' } });
    userId = user.id;
    await creditDust(userId, 4000, 'test_seed');
    await prisma.player.create({
      data: { name: 'Shop Gold', team: 'Test FC', position: 'FWD', rarity: 'GOLD' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('debits 2000 dust and grants a random GOLD card', async () => {
    const result = await purchaseGold(userId);
    expect(result.player.rarity).toBe('GOLD');

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(2000);
  });

  it('throws MonthlyLimitExceededError on a second purchase in the same calendar month, refunding the debit', async () => {
    await purchaseGold(userId);
    await expect(purchaseGold(userId)).rejects.toThrow(MonthlyLimitExceededError);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(2000); // second attempt's debit was rolled back
  });

  it('never allows two Gold purchases from concurrent requests in the same month', async () => {
    const results = await Promise.allSettled([purchaseGold(userId), purchaseGold(userId)]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(MonthlyLimitExceededError);

    const balance = await getOrCreateBalance(userId);
    expect(balance.dust).toBe(2000);
  });
});

describe('dustshop.service purchase (dispatch)', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'dispatch@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('always rejects SPECIAL with ItemNotAvailableError', async () => {
    await expect(purchase(userId, 'SPECIAL')).rejects.toThrow(ItemNotAvailableError);
  });

  it('rejects an unknown itemType with ItemNotAvailableError', async () => {
    await expect(purchase(userId, 'PLATINUM')).rejects.toThrow(ItemNotAvailableError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dustshop.test.ts`
Expected: FAIL — `purchaseGold is not a function` / `purchase is not a function` / `MonthlyLimitExceededError is not exported`

- [ ] **Step 3: Append `purchaseGold()` and `purchase()` to `src/modules/dustshop/dustshop.service.ts`**

Change the import block at the top from:
```typescript
import { Player } from '@prisma/client';
import { prisma } from '../../db/client';
import { debitDust } from '../currency/currency.service';
```
to:
```typescript
import { Player, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { debitDust } from '../currency/currency.service';
import { NoPlayersForRarityError } from '../../shared/errors';
```

Append to the end of the file:
```typescript
export class MonthlyLimitExceededError extends Error {
  constructor() {
    super('Gold token can only be purchased once per calendar month');
    this.name = 'MonthlyLimitExceededError';
  }
}

export async function purchaseGold(userId: string): Promise<{ player: Player }> {
  return prisma.$transaction(async (tx) => {
    const goldPlayers = await tx.player.findMany({ where: { rarity: 'GOLD' } });
    if (goldPlayers.length === 0) {
      throw new NoPlayersForRarityError('GOLD');
    }
    const picked = goldPlayers[Math.floor(Math.random() * goldPlayers.length)];

    await debitDust(userId, GOLD_PRICE, 'dustshop_gold', tx);

    try {
      await tx.dustShopPurchase.create({
        data: {
          userId,
          itemType: 'GOLD',
          playerId: picked.id,
          dustCost: GOLD_PRICE,
          goldMonthKey: currentMonthKey(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new MonthlyLimitExceededError();
      }
      throw err;
    }

    await tx.userCard.upsert({
      where: { userId_playerId: { userId, playerId: picked.id } },
      create: { userId, playerId: picked.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });

    return { player: picked };
  });
}

export async function purchase(
  userId: string,
  itemType: string,
  playerId?: string,
): Promise<{ player: Player }> {
  if (itemType === 'SPECIAL') {
    throw new ItemNotAvailableError('SPECIAL');
  }
  if (itemType === 'SILVER') {
    if (!playerId) throw new InvalidPlayerForItemError('(missing)', 'SILVER');
    return purchaseSilver(userId, playerId);
  }
  if (itemType === 'GOLD') {
    return purchaseGold(userId);
  }
  throw new ItemNotAvailableError(itemType);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dustshop.test.ts`
Expected: PASS (9 tests total — 4 from Task 6, 3 from purchaseGold, 2 from dispatch)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/dustshop/dustshop.service.ts tests/dustshop.test.ts
git commit -m "feat: add Gold purchase with race-safe monthly limit via DB unique constraint"
```

---

### Task 8: Dust Shop HTTP routes

**Files:**
- Create: `src/modules/dustshop/dustshop.routes.ts`
- Modify: `src/app.ts`
- Modify: `tests/dustshop.test.ts` (append HTTP-level tests)

**Interfaces:**
- Consumes: `getCatalog`, `purchase`, `ItemNotAvailableError`, `InvalidPlayerForItemError`, `MonthlyLimitExceededError` from `./dustshop.service`; `InsufficientFundsError` from `../currency/currency.service`; `NoPlayersForRarityError` from `../../shared/errors`; `requireAuth` from `../auth/auth.middleware`; `asyncHandler` from `../../middleware/asyncHandler`
- Produces: `dustshopRouter` (Express `Router`) mounted at `/dustshop`

- [ ] **Step 1: Write the failing HTTP tests**

Add to the top of `tests/dustshop.test.ts` (merge into existing imports):
```typescript
import request from 'supertest';
import { createApp } from '../src/app';
import { registerUser, loginUser } from '../src/modules/auth/auth.service';
```

Append to the end of `tests/dustshop.test.ts`:
```typescript
describe('GET /dustshop/catalog and POST /dustshop/purchase', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await registerUser('dustshophttp@example.com', 'hunter2pass');
    userId = user.id;
    const login = await loginUser('dustshophttp@example.com', 'hunter2pass');
    token = login.token;
  });

  it('rejects catalog requests with no auth header', async () => {
    const res = await request(app).get('/dustshop/catalog');
    expect(res.status).toBe(401);
  });

  it('returns the catalog over HTTP', async () => {
    await prisma.player.create({
      data: { name: 'HTTP Silver', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });

    const res = await request(app).get('/dustshop/catalog').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.silver.players).toHaveLength(1);
    expect(res.body.special.available).toBe(false);
  });

  it('purchases a SILVER card over HTTP', async () => {
    await creditDust(userId, 300, 'test_seed');
    const player = await prisma.player.create({
      data: { name: 'HTTP Buyable Silver', team: 'Test FC', position: 'MID', rarity: 'SILVER' },
    });

    const res = await request(app)
      .post('/dustshop/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'SILVER', playerId: player.id });

    expect(res.status).toBe(200);
    expect(res.body.player.id).toBe(player.id);
  });

  it('returns 400 when purchasing SPECIAL over HTTP', async () => {
    const res = await request(app)
      .post('/dustshop/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'SPECIAL' });

    expect(res.status).toBe(400);
  });

  it('returns 402 when dust is insufficient over HTTP', async () => {
    const player = await prisma.player.create({
      data: { name: 'HTTP Poor Silver', team: 'Test FC', position: 'GK', rarity: 'SILVER' },
    });

    const res = await request(app)
      .post('/dustshop/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'SILVER', playerId: player.id });

    expect(res.status).toBe(402);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dustshop.test.ts`
Expected: FAIL — router not mounted / module not found for `dustshop.routes`

- [ ] **Step 3: Create `src/modules/dustshop/dustshop.routes.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import {
  getCatalog,
  purchase,
  ItemNotAvailableError,
  InvalidPlayerForItemError,
  MonthlyLimitExceededError,
} from './dustshop.service';
import { InsufficientFundsError } from '../currency/currency.service';
import { NoPlayersForRarityError } from '../../shared/errors';
import { asyncHandler } from '../../middleware/asyncHandler';

export const dustshopRouter = Router();

dustshopRouter.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const catalog = await getCatalog(userId);
    res.status(200).json(catalog);
  }),
);

dustshopRouter.post(
  '/purchase',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const { itemType, playerId } = req.body as { itemType?: string; playerId?: string };
    if (!itemType) {
      res.status(400).json({ error: 'itemType is required' });
      return;
    }

    try {
      const result = await purchase(userId, itemType, playerId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ItemNotAvailableError || err instanceof InvalidPlayerForItemError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof MonthlyLimitExceededError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof InsufficientFundsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      if (err instanceof NoPlayersForRarityError) {
        res.status(500).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);
```

- [ ] **Step 4: Mount `dustshopRouter` in `src/app.ts`**

Change:
```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';
import { cardsRouter } from './modules/cards/cards.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);
  app.use('/cards', cardsRouter);
```
to:
```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';
import { cardsRouter } from './modules/cards/cards.routes';
import { dustshopRouter } from './modules/dustshop/dustshop.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);
  app.use('/cards', cardsRouter);
  app.use('/dustshop', dustshopRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- dustshop.test.ts`
Expected: PASS (14 tests total)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; every test file passes (`asyncHandler`, `auth`, `currency`, `packs`, `pity`, `rng`, `rarity`, `cards`, `dustshop`)

- [ ] **Step 7: Commit**

```bash
git add src/modules/dustshop/dustshop.routes.ts src/app.ts tests/dustshop.test.ts
git commit -m "feat: expose GET /dustshop/catalog and POST /dustshop/purchase over HTTP"
```

---

## Plan Self-Review Notes

**Spec coverage:** §6 Disenchant → Task 3, 5. §7 Fusion (both paths + race safety) → Task 4, 5. §8 Dust Shop (catalog, Silver, Gold, monthly-limit race safety, Special block) → Task 6, 7, 8. §5 Data model → Task 1. §9 Error class table → distributed across Tasks 3-8 exactly as tabulated. §10 Testing plan (including both race tests) → present verbatim in Tasks 4 and 7.

**Not in scope for this plan** (per spec §11, follow-up items): Dust Shop Silver weekly rotation, Fusion Discount / Level gating, ICON tier.
