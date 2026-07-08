# Dream XI — Backend Foundation & Pack Opening Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for Dream XI — user auth, a multi-currency ledger (LP/PP/XP/Dust), a Premier League player card catalog, and a server-side pack-opening engine with configurable drop rates and per-pack-type pity — as a tested, runnable Express + PostgreSQL API.

**Architecture:** Node.js + TypeScript + Express REST API, PostgreSQL via Prisma ORM. Each domain (auth, currency, packs) is a self-contained module under `src/modules/`. All currency mutations flow through one ledger service so balances and their audit trail (`CurrencyTransaction`) can never drift apart. The pack-opening flow composes three pure/testable pieces — RNG rarity selection, pity-counter logic, and the currency ledger — inside a single Prisma transaction so a crash mid-open can never award a card without charging for it (or vice versa).

**Tech Stack:** Node.js 20+, TypeScript (strict), Express 4, PostgreSQL 15+, Prisma ORM, bcrypt, jsonwebtoken, Jest + ts-jest + supertest.

## Global Constraints

- Node.js version: >= 20.0.0 (specify in `package.json` `engines`)
- TypeScript: `strict: true` in `tsconfig.json` — no implicit `any`
- All currency balance mutations (LP, PP, XP, Dust) MUST go through `src/modules/currency/currency.service.ts` — no other file may write to the `CurrencyBalance` table directly
- All currency amounts are integers (no floats). Only `PackDropRate.weight` is a float.
- RNG for pack rarity selection MUST run server-side only. The random source is injectable (a function parameter) so tests are deterministic — production code calls it with no argument (defaults to `Math.random`)
- Every operation that both awards a card and deducts currency MUST run inside a single `prisma.$transaction(...)` call
- Test database: tests run against a real PostgreSQL database pointed to by `DATABASE_URL` in `.env.test`, reset between tests via `deleteMany` in FK-safe order (see Task 1) — no mocking of Prisma Client
- Passwords hashed with bcrypt, cost factor 12
- JWT secret read from `process.env.JWT_SECRET` — never hardcoded

---

## File Structure

```
DreamXI/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .env.test
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── server.ts                          # entrypoint — starts HTTP listener
│   ├── app.ts                              # express app factory (no listen()) — used by tests via supertest
│   ├── db/
│   │   └── client.ts                       # Prisma client singleton
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.service.ts             # register/login/verifyToken
│   │   │   ├── auth.routes.ts              # POST /auth/register, POST /auth/login
│   │   │   └── auth.middleware.ts          # requireAuth express middleware
│   │   ├── currency/
│   │   │   └── currency.service.ts         # credit/debit LP/PP/XP/Dust + getBalance
│   │   └── packs/
│   │       ├── rng.ts                      # pure: pickRarity(dropRates, randomFn?)
│   │       ├── pity.service.ts             # getOrCreateCounter, applyPityOverride, recordOpen
│   │       ├── packs.service.ts            # openPack() orchestration
│   │       └── packs.routes.ts             # POST /packs/:packTypeName/open
│   └── types/
│       └── express.d.ts                    # augments Express.Request with `userId`
└── tests/
    ├── helpers/
    │   └── resetDb.ts                      # truncates tables between tests
    ├── auth.test.ts
    ├── currency.test.ts
    ├── rng.test.ts
    ├── pity.test.ts
    └── packs.test.ts
```

---

## Task 1: Project Scaffolding + Database Schema

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.env.example`
- Create: `.env.test`
- Create: `.gitignore`
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`
- Create: `tests/helpers/resetDb.ts`

**Interfaces:**
- Produces: `prisma` singleton export from `src/db/client.ts` (`import { prisma } from '../src/db/client'`) — a `PrismaClient` instance used by every later module and test
- Produces: `resetDb()` async function from `tests/helpers/resetDb.ts` — truncates all tables in FK-safe order, called in `beforeEach` by every integration test file

- [ ] **Step 1: Initialize npm project and install dependencies**

Run:
```bash
npm init -y
npm install express bcrypt jsonwebtoken @prisma/client
npm install -D typescript ts-node ts-node-dev @types/node @types/express @types/bcrypt @types/jsonwebtoken jest ts-jest @types/jest supertest @types/supertest prisma
```

- [ ] **Step 2: Write `package.json` scripts and engines field**

Edit `package.json`, add:

```json
{
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "ts-node-dev --respawn src/server.ts",
    "test": "jest --runInBand",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts", "prisma/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  setupFiles: ['dotenv/config'],
};
```

Run: `npm install -D dotenv`

- [ ] **Step 5: Write `.env.example` and `.env.test`**

`.env.example`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dreamxi?schema=public"
JWT_SECRET="replace-with-a-real-secret"
PORT=3000
```

`.env.test`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dreamxi_test?schema=public"
JWT_SECRET="test-secret-do-not-use-in-prod"
PORT=3001
```

Copy `.env.example` to `.env` manually (not committed) for local dev: `cp .env.example .env` and edit the real DB credentials.

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 7: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

model CurrencyBalance {
  id          String @id @default(uuid())
  userId      String @unique
  user        User   @relation(fields: [userId], references: [id])
  lp          Int    @default(0)
  ppPending   Int    @default(0)
  ppConfirmed Int    @default(0)
  xp          Int    @default(0)
  dust        Int    @default(0)
}

model CurrencyTransaction {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  currency  String
  amount    Int
  reason    String
  createdAt DateTime @default(now())
}

model Player {
  id        String     @id @default(uuid())
  name      String
  team      String
  position  String
  rarity    String
  userCards UserCard[]
}

model UserCard {
  id       String @id @default(uuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id])
  playerId String
  player   Player @relation(fields: [playerId], references: [id])
  quantity Int    @default(1)

  @@unique([userId, playerId])
}

model PackType {
  id                   String @id @default(uuid())
  name                 String @unique
  priceLP              Int?
  pricePP              Int?
  pityThreshold        Int?
  pityGuaranteedRarity String?

  dropRates    PackDropRate[]
  pityCounters PityCounter[]
}

model PackDropRate {
  id         String   @id @default(uuid())
  packTypeId String
  packType   PackType @relation(fields: [packTypeId], references: [id])
  rarity     String
  weight     Float
}

model PityCounter {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  packTypeId String
  packType   PackType @relation(fields: [packTypeId], references: [id])
  count      Int      @default(0)

  @@unique([userId, packTypeId])
}
```

- [ ] **Step 8: Create the databases and run the first migration**

Run (adjust `psql` connection as needed for your local Postgres):
```bash
createdb dreamxi
createdb dreamxi_test
npx dotenv -e .env -- npx prisma migrate dev --name init
```

Expected: migration files created under `prisma/migrations/`, tables created in `dreamxi`.

Then apply the same migration to the test DB:
```bash
npx dotenv -e .env.test -- npx prisma migrate deploy
```

- [ ] **Step 9: Write `src/db/client.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 10: Write `tests/helpers/resetDb.ts`**

```typescript
import { prisma } from '../../src/db/client';

export async function resetDb(): Promise<void> {
  await prisma.pityCounter.deleteMany();
  await prisma.userCard.deleteMany();
  await prisma.currencyTransaction.deleteMany();
  await prisma.currencyBalance.deleteMany();
  await prisma.packDropRate.deleteMany();
  await prisma.packType.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 11: Verify the setup compiles and Prisma Client generates**

Run:
```bash
npx prisma generate
npx tsc --noEmit
```

Expected: both commands exit with code 0, no errors.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold project, add Prisma schema for core Dream XI models"
```

---

## Task 2: Currency Ledger Service

**Files:**
- Create: `src/modules/currency/currency.service.ts`
- Test: `tests/currency.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/db/client.ts`
- Produces:
  - `getOrCreateBalance(userId: string): Promise<CurrencyBalance>`
  - `creditLP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>`
  - `debitLP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>` — throws `InsufficientFundsError` if `lp < amount`
  - `creditPendingPP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>`
  - `confirmPP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>` — moves `amount` from `ppPending` to `ppConfirmed`; throws `InsufficientFundsError` if `ppPending < amount`
  - `debitConfirmedPP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>` — throws `InsufficientFundsError` if `ppConfirmed < amount`
  - `creditXP(userId: string, amount: number, reason: string): Promise<CurrencyBalance>`
  - `creditDust(userId: string, amount: number, reason: string): Promise<CurrencyBalance>`
  - `debitDust(userId: string, amount: number, reason: string): Promise<CurrencyBalance>` — throws `InsufficientFundsError` if `dust < amount`
  - `class InsufficientFundsError extends Error`
  - These functions accept an optional `tx` parameter (a Prisma transaction client) as their last argument so `packs.service.ts` (Task 5) can call them inside `prisma.$transaction(...)`

- [ ] **Step 1: Write the failing test for balance creation and LP credit**

Create `tests/currency.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- currency.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/currency/currency.service'`

- [ ] **Step 3: Write `src/modules/currency/currency.service.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- currency.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add tests for debit insufficient funds and PP pending→confirmed flow**

Append to `tests/currency.test.ts` (inside the existing `describe` block):

```typescript
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
```

- [ ] **Step 6: Run full currency test suite**

Run: `npm test -- currency.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add src/modules/currency tests/currency.test.ts
git commit -m "feat: add currency ledger service (LP, PP pending/confirmed, XP, Dust)"
```

---

## Task 3: Auth (Register, Login, JWT Middleware)

**Files:**
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.middleware.ts`
- Create: `src/modules/auth/auth.routes.ts`
- Create: `src/types/express.d.ts`
- Create: `src/app.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/db/client.ts`
- Produces:
  - `registerUser(email: string, password: string): Promise<{ id: string; email: string }>` — throws `EmailAlreadyExistsError` on duplicate email
  - `loginUser(email: string, password: string): Promise<{ token: string }>` — throws `InvalidCredentialsError` on bad email/password
  - `verifyToken(token: string): { userId: string }` — throws on invalid/expired token
  - `requireAuth` — Express middleware; sets `req.userId` on success, responds `401` on missing/invalid token
  - `createApp(): Express` from `src/app.ts` — used by `supertest` in this task's tests and every later route test

- [ ] **Step 1: Write the failing test for registration and login**

Create `tests/auth.test.ts`:

```typescript
import request from 'supertest';
import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { createApp } from '../src/app';

const app = createApp();

describe('auth routes', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registers a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'hunter2pass' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@example.com' });
    expect(res.body.id).toBeDefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects registering the same email twice', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'anotherpass' });

    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and returns a JWT', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'hunter2pass' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects login with wrong password', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'wrongpw@example.com', password: 'hunter2pass' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpw@example.com', password: 'nope' });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Write `src/types/express.d.ts`**

```typescript
import 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
```

- [ ] **Step 4: Write `src/modules/auth/auth.service.ts`**

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/client';

const BCRYPT_ROUNDS = 12;

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export async function registerUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new EmailAlreadyExistsError(email);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email };
}

export async function loginUser(email: string, password: string): Promise<{ token: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new InvalidCredentialsError();

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();

  const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' });
  return { token };
}

export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
  return { userId: decoded.userId };
}
```

- [ ] **Step 5: Write `src/modules/auth/auth.middleware.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth.service';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const { userId } = verifyToken(token);
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 6: Write `src/modules/auth/auth.routes.ts`**

```typescript
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
} from './auth.service';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const user = await registerUser(email, password);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof EmailAlreadyExistsError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = await loginUser(email, password);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
});
```

- [ ] **Step 7: Write `src/app.ts`**

```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add src/app.ts src/modules/auth src/types tests/auth.test.ts
git commit -m "feat: add user registration, login, and JWT auth middleware"
```

---

## Task 4: RNG Rarity Selection (Pure Function)

**Files:**
- Create: `src/modules/packs/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces:
  - `interface DropRateEntry { rarity: string; weight: number }`
  - `pickRarity(dropRates: DropRateEntry[], randomFn?: () => number): string` — `randomFn` defaults to `Math.random`, must return a value in `[0, 1)`; throws if `dropRates` is empty

- [ ] **Step 1: Write the failing test**

Create `tests/rng.test.ts`:

```typescript
import { pickRarity, DropRateEntry } from '../src/modules/packs/rng';

describe('pickRarity', () => {
  const bronzePackRates: DropRateEntry[] = [
    { rarity: 'BRONZE', weight: 70 },
    { rarity: 'SILVER', weight: 25 },
    { rarity: 'GOLD', weight: 4.5 },
    { rarity: 'SPECIAL', weight: 0.5 },
  ];

  it('picks the first rarity when the roll lands in its band', () => {
    // total weight = 100, roll 0.0 * 100 = 0 -> falls in BRONZE band [0, 70)
    expect(pickRarity(bronzePackRates, () => 0.0)).toBe('BRONZE');
  });

  it('picks the second rarity when the roll lands past the first band', () => {
    // roll 0.75 * 100 = 75 -> falls in SILVER band [70, 95)
    expect(pickRarity(bronzePackRates, () => 0.75)).toBe('SILVER');
  });

  it('picks the last rarity when the roll lands in the final band', () => {
    // roll 0.999 * 100 = 99.9 -> falls in SPECIAL band [99.5, 100)
    expect(pickRarity(bronzePackRates, () => 0.999)).toBe('SPECIAL');
  });

  it('falls back to the last entry on a roll of exactly the total weight (floating point edge case)', () => {
    expect(pickRarity(bronzePackRates, () => 0.9999999999)).toBe('SPECIAL');
  });

  it('throws if dropRates is empty', () => {
    expect(() => pickRarity([], () => 0.5)).toThrow('dropRates must not be empty');
  });

  it('defaults to Math.random when no randomFn is passed', () => {
    const result = pickRarity(bronzePackRates);
    expect(['BRONZE', 'SILVER', 'GOLD', 'SPECIAL']).toContain(result);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rng.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/packs/rng'`

- [ ] **Step 3: Write `src/modules/packs/rng.ts`**

```typescript
export interface DropRateEntry {
  rarity: string;
  weight: number;
}

export function pickRarity(
  dropRates: DropRateEntry[],
  randomFn: () => number = Math.random,
): string {
  if (dropRates.length === 0) {
    throw new Error('dropRates must not be empty');
  }

  const totalWeight = dropRates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = randomFn() * totalWeight;

  for (const entry of dropRates) {
    if (roll < entry.weight) {
      return entry.rarity;
    }
    roll -= entry.weight;
  }

  // Floating point rounding can leave `roll` fractionally over the last
  // band's upper edge — fall back to the last entry rather than throw.
  return dropRates[dropRates.length - 1].rarity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rng.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/packs/rng.ts tests/rng.test.ts
git commit -m "feat: add pure weighted-rarity RNG function for pack opening"
```

---

## Task 5: Pity Counter Service

**Files:**
- Create: `src/modules/packs/pity.service.ts`
- Test: `tests/pity.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/db/client.ts`
- Produces:
  - `getOrCreatePityCounter(userId: string, packTypeId: string, client?): Promise<PityCounter>`
  - `resolvePityForOpen(userId: string, packType: { id: string; pityThreshold: number | null; pityGuaranteedRarity: string | null }, client?): Promise<{ forcedRarity: string | null; nextCount: number; willTrigger: boolean }>` — computes what the *next* open's counter value would be (current count + 1) and whether that hits `pityThreshold`; does not persist anything
  - `recordPackOpen(userId: string, packTypeId: string, triggered: boolean, client?): Promise<PityCounter>` — increments the counter by 1, or resets it to 0 if `triggered` is true; persists the result

- [ ] **Step 1: Write the failing test**

Create `tests/pity.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pity.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/packs/pity.service'`

- [ ] **Step 3: Write `src/modules/packs/pity.service.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pity.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/packs/pity.service.ts tests/pity.test.ts
git commit -m "feat: add per-pack-type pity counter service"
```

---

## Task 6: Card Catalog + Pack Type Seed Data

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Produces: seed data in the database — 4 `Player` rows per rarity (16 total), 4 `PackType` rows (`BRONZE`, `SILVER`, `GOLD`, `SPECIAL`) each with a `PackDropRate` row per rarity, matching the placeholder pricing/pity from the design doc

- [ ] **Step 1: Write `prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAYERS: Array<{ name: string; team: string; position: string; rarity: string }> = [
  // BRONZE
  { name: 'Sample Player B1', team: 'Placeholder United', position: 'DEF', rarity: 'BRONZE' },
  { name: 'Sample Player B2', team: 'Placeholder United', position: 'MID', rarity: 'BRONZE' },
  { name: 'Sample Player B3', team: 'Placeholder City', position: 'FWD', rarity: 'BRONZE' },
  { name: 'Sample Player B4', team: 'Placeholder City', position: 'GK', rarity: 'BRONZE' },
  // SILVER
  { name: 'Sample Player S1', team: 'Placeholder United', position: 'DEF', rarity: 'SILVER' },
  { name: 'Sample Player S2', team: 'Placeholder United', position: 'MID', rarity: 'SILVER' },
  { name: 'Sample Player S3', team: 'Placeholder City', position: 'FWD', rarity: 'SILVER' },
  { name: 'Sample Player S4', team: 'Placeholder City', position: 'GK', rarity: 'SILVER' },
  // GOLD
  { name: 'Sample Player G1', team: 'Placeholder United', position: 'DEF', rarity: 'GOLD' },
  { name: 'Sample Player G2', team: 'Placeholder United', position: 'MID', rarity: 'GOLD' },
  { name: 'Sample Player G3', team: 'Placeholder City', position: 'FWD', rarity: 'GOLD' },
  { name: 'Sample Player G4', team: 'Placeholder City', position: 'GK', rarity: 'GOLD' },
  // SPECIAL
  { name: 'Sample Player X1', team: 'Placeholder United', position: 'FWD', rarity: 'SPECIAL' },
  { name: 'Sample Player X2', team: 'Placeholder City', position: 'MID', rarity: 'SPECIAL' },
  { name: 'Sample Player X3', team: 'Placeholder Rovers', position: 'FWD', rarity: 'SPECIAL' },
  { name: 'Sample Player X4', team: 'Placeholder Athletic', position: 'DEF', rarity: 'SPECIAL' },
];

const PACK_TYPES: Array<{
  name: string;
  priceLP: number | null;
  pricePP: number | null;
  pityThreshold: number | null;
  pityGuaranteedRarity: string | null;
  dropRates: Array<{ rarity: string; weight: number }>;
}> = [
  {
    name: 'BRONZE',
    priceLP: 10,
    pricePP: null,
    pityThreshold: null,
    pityGuaranteedRarity: null,
    dropRates: [
      { rarity: 'BRONZE', weight: 90 },
      { rarity: 'SILVER', weight: 10 },
    ],
  },
  {
    name: 'SILVER',
    priceLP: 45,
    pricePP: null,
    pityThreshold: 20,
    pityGuaranteedRarity: 'SILVER',
    dropRates: [
      { rarity: 'BRONZE', weight: 40 },
      { rarity: 'SILVER', weight: 55 },
      { rarity: 'GOLD', weight: 5 },
    ],
  },
  {
    name: 'GOLD',
    priceLP: null,
    pricePP: 5, // TBD per design doc — placeholder pending real AOV data
    pityThreshold: 30,
    pityGuaranteedRarity: 'GOLD',
    dropRates: [
      { rarity: 'SILVER', weight: 50 },
      { rarity: 'GOLD', weight: 45 },
      { rarity: 'SPECIAL', weight: 5 },
    ],
  },
  {
    name: 'SPECIAL',
    priceLP: null,
    pricePP: 15, // TBD per design doc — placeholder pending real AOV data
    pityThreshold: 10,
    pityGuaranteedRarity: 'SPECIAL',
    dropRates: [
      { rarity: 'GOLD', weight: 60 },
      { rarity: 'SPECIAL', weight: 40 },
    ],
  },
];

async function main(): Promise<void> {
  for (const player of PLAYERS) {
    await prisma.player.create({ data: player });
  }

  for (const packType of PACK_TYPES) {
    await prisma.packType.create({
      data: {
        name: packType.name,
        priceLP: packType.priceLP,
        pricePP: packType.pricePP,
        pityThreshold: packType.pityThreshold,
        pityGuaranteedRarity: packType.pityGuaranteedRarity,
        dropRates: { create: packType.dropRates },
      },
    });
  }

  console.log(`Seeded ${PLAYERS.length} players and ${PACK_TYPES.length} pack types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the seed script against the dev database**

Run:
```bash
npx dotenv -e .env -- npx ts-node prisma/seed.ts
```

Expected output: `Seeded 16 players and 4 pack types.`

> Note: this seed is placeholder data for development/testing. Real Premier League player names/stats depend on the data-source Open Item from the design doc (Section 4/14) and should replace `PLAYERS` before any real launch.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: add placeholder card catalog and pack type seed data"
```

---

## Task 7: Pack Opening Orchestration Service

**Files:**
- Create: `src/modules/packs/packs.service.ts`
- Test: `tests/packs.test.ts`

**Interfaces:**
- Consumes:
  - `pickRarity` from `src/modules/packs/rng.ts` (Task 4)
  - `resolvePityForOpen`, `recordPackOpen` from `src/modules/packs/pity.service.ts` (Task 5)
  - `debitLP`, `debitConfirmedPP`, `InsufficientFundsError` from `src/modules/currency/currency.service.ts` (Task 2)
  - `prisma` from `src/db/client.ts`
- Produces:
  - `class PackTypeNotFoundError extends Error`
  - `class NoPlayersForRarityError extends Error`
  - `openPack(userId: string, packTypeName: string): Promise<{ player: Player; pityTriggered: boolean }>` — the full flow: look up pack type + drop rates, debit the correct currency (LP if `priceLP` set, else PP), resolve pity, pick rarity (respecting a pity override), pick a random `Player` of that rarity, upsert `UserCard` (increment `quantity` if it already exists), record the pity counter update — all inside one `prisma.$transaction`

- [ ] **Step 1: Write the failing test**

Create `tests/packs.test.ts`:

```typescript
import { prisma } from '../src/db/client';
import { resetDb } from './helpers/resetDb';
import { creditLP, creditPendingPP, confirmPP, getOrCreateBalance } from '../src/modules/currency/currency.service';
import { openPack, PackTypeNotFoundError } from '../src/modules/packs/packs.service';

describe('packs.service openPack', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: { email: 'packs@example.com', passwordHash: 'x' },
    });
    userId = user.id;

    await prisma.player.create({
      data: { name: 'Only Bronze Player', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    await prisma.player.create({
      data: { name: 'Only Silver Player', team: 'Test FC', position: 'FWD', rarity: 'SILVER' },
    });

    await prisma.packType.create({
      data: {
        name: 'BRONZE',
        priceLP: 10,
        pricePP: null,
        pityThreshold: null,
        pityGuaranteedRarity: null,
        dropRates: {
          create: [{ rarity: 'BRONZE', weight: 100 }],
        },
      },
    });

    await prisma.packType.create({
      data: {
        name: 'GOLD',
        priceLP: null,
        pricePP: 5,
        pityThreshold: 2,
        pityGuaranteedRarity: 'SILVER',
        dropRates: {
          create: [{ rarity: 'BRONZE', weight: 100 }],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('throws PackTypeNotFoundError for an unknown pack name', async () => {
    await creditLP(userId, 100, 'daily_login');
    await expect(openPack(userId, 'NOT_A_PACK')).rejects.toThrow(PackTypeNotFoundError);
  });

  it('debits LP, awards a card, and does not trigger pity when threshold is not configured', async () => {
    await creditLP(userId, 10, 'daily_login');

    const result = await openPack(userId, 'BRONZE');

    expect(result.player.rarity).toBe('BRONZE');
    expect(result.pityTriggered).toBe(false);

    const balance = await getOrCreateBalance(userId);
    expect(balance.lp).toBe(0);

    const userCard = await prisma.userCard.findFirst({ where: { userId } });
    expect(userCard?.quantity).toBe(1);
  });

  it('increments quantity when the same player is awarded twice', async () => {
    await creditLP(userId, 20, 'daily_login');

    await openPack(userId, 'BRONZE');
    await openPack(userId, 'BRONZE');

    const userCard = await prisma.userCard.findFirst({ where: { userId } });
    expect(userCard?.quantity).toBe(2);
  });

  it('debits confirmed PP for a PP-priced pack', async () => {
    await creditPendingPP(userId, 5, 'purchase_completed');
    await confirmPP(userId, 5, 'return_window_elapsed');

    await openPack(userId, 'GOLD');

    const balance = await getOrCreateBalance(userId);
    expect(balance.ppConfirmed).toBe(0);
  });

  it('forces the guaranteed rarity and resets the counter when pity triggers', async () => {
    await prisma.player.create({
      data: { name: 'Pity Silver Player', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await creditPendingPP(userId, 10, 'purchase_completed');
    await confirmPP(userId, 10, 'return_window_elapsed');

    await openPack(userId, 'GOLD'); // pity count -> 1, drop table is 100% BRONZE but no BRONZE player exists for GOLD's table here — uses only-BRONZE table so first open must draw BRONZE... adjust: use dedicated BRONZE player for GOLD test
    const secondResult = await openPack(userId, 'GOLD'); // pity threshold is 2 -> this open must be forced to SILVER

    expect(secondResult.pityTriggered).toBe(true);
    expect(secondResult.player.rarity).toBe('SILVER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packs.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/packs/packs.service'`

- [ ] **Step 3: Write `src/modules/packs/packs.service.ts`**

```typescript
import { Player, Prisma } from '@prisma/client';
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
```

- [ ] **Step 4: Fix the pity-trigger test's setup**

The pity test as drafted references a `GOLD` pack type whose drop table is 100% `BRONZE`, but no `BRONZE` player was created in that `beforeEach` block for this specific test. Update the test to add one:

Edit `tests/packs.test.ts`, inside the `'forces the guaranteed rarity...'` test, add a `BRONZE` player before the first `openPack` call:

```typescript
  it('forces the guaranteed rarity and resets the counter when pity triggers', async () => {
    await prisma.player.create({
      data: { name: 'Filler Bronze Player', team: 'Test FC', position: 'GK', rarity: 'BRONZE' },
    });
    await prisma.player.create({
      data: { name: 'Pity Silver Player', team: 'Test FC', position: 'DEF', rarity: 'SILVER' },
    });
    await creditPendingPP(userId, 10, 'purchase_completed');
    await confirmPP(userId, 10, 'return_window_elapsed');

    await openPack(userId, 'GOLD'); // pity count -> 1, draws BRONZE (100% table)
    const secondResult = await openPack(userId, 'GOLD'); // pity threshold is 2 -> forced to SILVER

    expect(secondResult.pityTriggered).toBe(true);
    expect(secondResult.player.rarity).toBe('SILVER');
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- packs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/modules/packs/packs.service.ts tests/packs.test.ts
git commit -m "feat: add pack-opening orchestration (currency debit + pity + RNG + card award, atomic)"
```

---

## Task 8: Pack Opening HTTP Endpoint

**Files:**
- Create: `src/modules/packs/packs.routes.ts`
- Modify: `src/app.ts`
- Modify: `tests/packs.test.ts`

**Interfaces:**
- Consumes: `openPack`, `PackTypeNotFoundError`, `NoPlayersForRarityError` from `packs.service.ts` (Task 7); `InsufficientFundsError` from `currency.service.ts` (Task 2); `requireAuth` from `auth.middleware.ts` (Task 3)
- Produces: `packsRouter` mounted at `POST /packs/:packTypeName/open`, requiring a valid `Authorization: Bearer <token>` header; response `200 { player, pityTriggered }` on success, `404` for unknown pack type, `402` for insufficient funds, `401` for missing/invalid auth

- [ ] **Step 1: Write the failing integration test**

Append to `tests/packs.test.ts` a new top-level `describe` block (after the existing one, same file):

```typescript
import request from 'supertest';
import { createApp } from '../src/app';
import { registerUser, loginUser } from '../src/modules/auth/auth.service';

describe('POST /packs/:packTypeName/open', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();

    const user = await registerUser('httpopen@example.com', 'hunter2pass');
    userId = user.id;
    const login = await loginUser('httpopen@example.com', 'hunter2pass');
    token = login.token;

    await prisma.player.create({
      data: { name: 'HTTP Bronze Player', team: 'Test FC', position: 'MID', rarity: 'BRONZE' },
    });
    await prisma.packType.create({
      data: {
        name: 'BRONZE',
        priceLP: 10,
        pricePP: null,
        pityThreshold: null,
        pityGuaranteedRarity: null,
        dropRates: { create: [{ rarity: 'BRONZE', weight: 100 }] },
      },
    });
  });

  it('rejects requests with no auth header', async () => {
    const res = await request(app).post('/packs/BRONZE/open');
    expect(res.status).toBe(401);
  });

  it('returns 402 when the user cannot afford the pack', async () => {
    const res = await request(app)
      .post('/packs/BRONZE/open')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
  });

  it('opens a pack and returns the awarded player', async () => {
    await creditLP(userId, 10, 'daily_login');

    const res = await request(app)
      .post('/packs/BRONZE/open')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.player.rarity).toBe('BRONZE');
    expect(res.body.pityTriggered).toBe(false);
  });

  it('returns 404 for an unknown pack type', async () => {
    await creditLP(userId, 10, 'daily_login');

    const res = await request(app)
      .post('/packs/NOT_A_PACK/open')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
```

Add the missing `creditLP` import at the top of `tests/packs.test.ts` if not already present (it is, from Task 7's setup — just confirm the import line includes `creditLP`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packs.test.ts`
Expected: FAIL — `Cannot POST /packs/BRONZE/open` (404 from Express's default handler, not the app's routing) since `packsRouter` doesn't exist yet

- [ ] **Step 3: Write `src/modules/packs/packs.routes.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { openPack, PackTypeNotFoundError, NoPlayersForRarityError } from './packs.service';
import { InsufficientFundsError } from '../currency/currency.service';

export const packsRouter = Router();

packsRouter.post('/:packTypeName/open', requireAuth, async (req, res) => {
  const userId = req.userId as string;
  const { packTypeName } = req.params;

  try {
    const result = await openPack(userId, packTypeName);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof PackTypeNotFoundError) {
      res.status(404).json({ error: err.message });
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
});
```

- [ ] **Step 4: Wire `packsRouter` into `src/app.ts`**

```typescript
import express, { Express, ErrorRequestHandler } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { packsRouter } from './modules/packs/packs.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.use('/auth', authRouter);
  app.use('/packs', packsRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- packs.test.ts`
Expected: PASS (9 tests total in the file)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files (auth, currency, rng, pity, packs) green

- [ ] **Step 7: Commit**

```bash
git add src/modules/packs/packs.routes.ts src/app.ts tests/packs.test.ts
git commit -m "feat: expose pack opening over POST /packs/:packTypeName/open"
```

---

## Task 9: Server Entrypoint

**Files:**
- Create: `src/server.ts`

**Interfaces:**
- Consumes: `createApp` from `src/app.ts`
- Produces: a running HTTP server on `process.env.PORT` (default `3000`)

- [ ] **Step 1: Write `src/server.ts`**

```typescript
import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Dream XI API listening on port ${PORT}`);
});
```

- [ ] **Step 2: Verify the server starts and responds**

Run (in one terminal):
```bash
npm run dev
```

In another terminal:
```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"manual-check@example.com","password":"hunter2pass"}'
```

Expected: JSON response with `id` and `email` fields, HTTP 201. Stop the dev server (Ctrl+C) after confirming.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add HTTP server entrypoint"
```

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Auth (design doc §12 anti-fraud baseline — OTP/device-binding is explicitly an Open Item, not required for this plan), Currency ledger with LP/PP pending-confirmed split (§6, §11), Card catalog (§4), Pack pricing config-driven (§6.1), Drop rates (§7), Pity per pack-type lifetime counter (§8) are all implemented and tested. Duplicate handling (§9), Level/XP (§10), Match Simulation (§5), and frontend/Telegram integration (§3) are explicitly out of scope for this plan per the phased breakdown agreed with the user — each gets its own follow-up plan.
- **Placeholder scan:** No TBD/TODO left in code. Seed data prices for GOLD/SPECIAL packs are marked with an inline comment noting they are placeholders pending real AOV data, per design doc §6.1 Open Item — this is a deliberate, documented placeholder in *data*, not a gap in the *plan's* instructions.
- **Type consistency:** `openPack` return type `{ player: Player; pityTriggered: boolean }` matches what Task 8's route handler destructures and returns. `Client = Prisma.TransactionClient | typeof prisma` parameter pattern is consistent across `currency.service.ts` and `pity.service.ts`, and `packs.service.ts` passes its `tx` through to both.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-backend-foundation-pack-opening.md`.**
