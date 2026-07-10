# Duplicate Handling: Disenchant/Dust, Fusion, Dust Shop — Design Doc

**สถานะ:** Approved
**วันที่:** 2026-07-10
**เกี่ยวข้องกับ:** Plan 2 ใน [`progress.md`](../../../progress.md) (roadmap #2)
**อ้างอิงต้นตอ:** [`2026-07-08-football-card-pack-system-design.md`](2026-07-08-football-card-pack-system-design.md) §9 (การจัดการการ์ดซ้ำ)

---

## 1. Scope

ระบบสำหรับจัดการการ์ดซ้ำที่ผู้เล่นได้จากการเปิดซอง (Plan 1) — ไม่มี P2P Marketplace ตามดีไซน์เดิม แทนที่ด้วย 3 กลไกที่ผู้เล่นเลือกใช้เอง:

1. **Disenchant** — แปลงการ์ดซ้ำเป็น Dust
2. **Fusion** — รวมการ์ดซ้ำ 10 ใบในระดับเดียวกัน → การ์ดระดับถัดไป 1 ใบ (สุ่ม)
3. **Dust Shop** — ใช้ Dust ซื้อการ์ดคืน (จำกัดเข้มงวด กันเฟ้อ)

## 2. Decisions ที่ตัดสินใจระหว่าง brainstorming (ต่างจาก/เติมเต็ม design doc เดิม)

เอกสารต้นฉบับ §9 เขียนกว้างๆ ไว้ รายการนี้คือค่าที่ชี้ขาดแล้วสำหรับ Plan 2 โดยเฉพาะ:

| หัวข้อ | ค่าที่ตัดสินใจ | เหตุผล |
|---|---|---|
| Fusion granularity | ใช้การ์ดซ้ำ **คละนักเตะได้** 10 ใบใน tier เดียวกัน (ไม่ต้องเป็นนักเตะเดียวกัน) | ผลลัพธ์ fusion คือ "สุ่มภายในพูลของ tier ถัดไป" อยู่แล้ว ไม่ผูกกับตัวนักเตะที่นำมาหลอม — ถ้าบังคับนักเตะเดียวกัน 10 ใบจะสะสมยากมาก (มีแค่ ~4 นักเตะ/tier) ขัดเป้าหมายเดิมคือระบายการ์ดซ้ำส่วนเกิน |
| Fusion Discount (8 ใบ, Level 21+) | **ตัดออกจาก Plan 2 ทั้งหมด** — ทุกคนใช้ 10 ใบเสมอ | ระบบ User Level (Plan 4) ยังไม่มีในโค้ด ไม่สร้าง stub field เพื่อกัน schema ซ้ำซ้อนกับตอนทำ Plan 4 จริง — เป็น follow-up |
| "Special/Icon" tier | ใช้ `rarity='SPECIAL'` เป็น tier บนสุดเพียง tier เดียว ไม่มี ICON แยก | โค้ด/seed data จริงมีแค่ SPECIAL เท่านั้น อิงตามโค้ดจริงไม่ใช่คำในเอกสาร |
| Disenchant granularity | เลือกเองต่อใบ: ระบุ `playerId` + จำนวน | ให้ผู้เล่นควบคุมได้ ไม่ทำ auto-bulk ที่อาจ disenchant การ์ดที่อยากเก็บ |
| Fusion consume order | หักจากใบที่มี `quantity` สูงสุดก่อน (deterministic) | ผู้เล่นไม่ต้องเลือกเอง ลด friction ของ UI ตอน MVP |
| Dust Shop Silver rotation | Static — เลือกซื้อได้จาก SILVER ทั้งหมดในระบบ ไม่ทำ rotation รายสัปดาห์จริง | Rotation ต้องมี cron/admin tool ซึ่งนอกขอบเขต Plan 2 — เป็น follow-up |
| Gold purchase limit tracking | ตาราง log แยก `DustShopPurchase` + unique constraint (ดู §5) | ต้องการ audit trail และ atomicity ที่ปลอดภัยจาก race condition |
| Gold purchase limit window | Calendar month (รีเซตวันที่ 1 ของเดือน, UTC) | ตรงไปตรงมา คาดเดาได้สำหรับผู้เล่น |
| SPECIAL reroll เมื่อ owned ครบทุกใบ | บล็อกการ fuse ทันที (ไม่หักการ์ด) คืน error แนะนำให้ใช้ disenchant แทน | เป็น edge case ที่เกิดยาก (ตอนนี้มีแค่ 4 ใบ Special ในระบบ) แต่ต้องมี error path ที่ปลอดภัย ไม่ทำให้การ์ดหายเฉยๆ |

## 3. Global Constraints (สืบทอดจาก CLAUDE.md — บังคับใช้กับทุก flow ในเอกสารนี้)

- ทุกการเปลี่ยนแปลงยอด Dust ต้องผ่าน `src/modules/currency/currency.service.ts` (`creditDust`/`debitDust`) เท่านั้น
- การหักการ์ด/หัก Dust/มอบการ์ดใน 1 request ต้องอยู่ใน `prisma.$transaction(...)` เดียวกันเสมอ
- RNG (สุ่มผู้เล่นตอน Fusion หรือ Gold shop) ต้องรันฝั่ง server เท่านั้น
- ทุกยอดเป็น integer เท่านั้น

## 4. Module Layout

โครงสร้างใหม่ ตาม pattern เดิม (`src/modules/currency`, `src/modules/packs`):

```
src/modules/cards/
  cards.service.ts   — disenchant(), fuse()
  cards.routes.ts    — POST /cards/disenchant, POST /cards/fusion
  rarity.ts          — TIER_ORDER, DISENCHANT_DUST, FUSION_COST
src/modules/dustshop/
  dustshop.service.ts — getCatalog(), purchase()
  dustshop.routes.ts  — GET /dustshop/catalog, POST /dustshop/purchase
src/shared/
  errors.ts           — NoPlayersForRarityError (ย้ายจาก packs.service.ts มาใช้ร่วมกัน)
```

`app.ts` เพิ่ม:
```typescript
app.use('/cards', cardsRouter);
app.use('/dustshop', dustshopRouter);
```

**Constants (`src/modules/cards/rarity.ts`):**
```typescript
export const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'SPECIAL'];
export const DISENCHANT_DUST: Record<string, number> = {
  BRONZE: 5, SILVER: 20, GOLD: 100, SPECIAL: 500,
};
export const FUSION_COST = 10;
```

## 5. Data Model

ไม่ต้องแก้ `UserCard`/`CurrencyBalance` — `quantity` และ `dust` ที่มีอยู่แล้วพอ

**Model ใหม่:**

```prisma
model User {
  // ...existing fields
  dustShopPurchases DustShopPurchase[]
}

model Player {
  // ...existing fields
  dustShopPurchases DustShopPurchase[]
}

model DustShopPurchase {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  itemType     String   // "SILVER" | "GOLD"
  playerId     String?  // ระบุเสมอเมื่อ SILVER (เลือกเอง); เมื่อ GOLD คือผลการสุ่ม
  player       Player?  @relation(fields: [playerId], references: [id])
  dustCost     Int
  goldMonthKey String?  // "YYYY-MM" (UTC) — ตั้งเฉพาะ itemType=GOLD, null เสมอสำหรับ SILVER
  createdAt    DateTime @default(now())

  @@unique([userId, goldMonthKey])
}
```

**เหตุผลของ `goldMonthKey` + unique constraint:** Postgres unique constraint ถือว่าแต่ละแถวที่ `NULL` ไม่ชนกัน (SILVER ซื้อได้ไม่จำกัดครั้ง) แต่สอง GOLD purchase ของ user เดียวกันในเดือนเดียวกันจะมี `goldMonthKey` เดียวกัน → ชน constraint ที่ระดับ DB ทันที เป็น atomic guard ที่ปลอดภัยจาก race condition โดยธรรมชาติ (ไม่ใช่ check-then-act แบบ query count ก่อน debit ซึ่งมีช่องโหว่ race แบบเดียวกับที่ `getOrCreateBalance` เคยโดนแก้ในคอมมิต `99a3440` ของ Plan 1)

## 6. Disenchant Flow

**`POST /cards/disenchant`** (auth required)
Request: `{ playerId: string, quantity: number }`

ภายใน `prisma.$transaction`:
1. ตรวจ `quantity >= 1` (integer)
2. Atomic decrement พร้อมบังคับเหลืออย่างน้อย 1 ใบเสมอ:
   ```typescript
   const result = await tx.userCard.updateMany({
     where: { userId, playerId, quantity: { gte: quantity + 1 } },
     data: { quantity: { decrement: quantity } },
   });
   if (result.count === 0) throw new InsufficientDuplicatesError(...);
   ```
3. หา `rarity` ของ player (query แยกหรือ join ตอนเช็คก่อนหน้า)
4. `creditDust(userId, quantity * DISENCHANT_DUST[rarity], 'disenchant_' + rarity, tx)`

**Errors:** `CardNotFoundError` (404 — player ไม่มีอยู่จริง หรือ user ไม่เคยครอบครอง), `InsufficientDuplicatesError` (409 — surplus ไม่พอ), quantity ไม่ถูกต้อง (400)

## 7. Fusion Flow

**`POST /cards/fusion`** (auth required)
Request: `{ rarity: string }` — tier ที่จะ fuse **จาก**

ภายใน `prisma.$transaction`:
1. validate `rarity` อยู่ใน `TIER_ORDER` → `InvalidRarityError` (400) ถ้าไม่ใช่
2. ดึงการ์ดทั้งหมดของ user ใน tier นี้ที่ `quantity > 1`:
   ```typescript
   const candidates = await tx.userCard.findMany({
     where: { userId, quantity: { gt: 1 }, player: { rarity } },
     orderBy: [{ quantity: 'desc' }, { playerId: 'asc' }], // deterministic tie-break
   });
   ```
3. คำนวณ surplus รวม `Σ(quantity - 1)` — ถ้า `< FUSION_COST` → `InsufficientDuplicatesError` (409), **ไม่แตะข้อมูลใดๆ**
4. วางแผนหักแบบ greedy จากใบ `quantity` สูงสุดก่อนจนครบ `FUSION_COST`
5. หักแต่ละใบด้วย atomic conditional update (เหมือน §6):
   ```typescript
   const r = await tx.userCard.updateMany({
     where: { id: card.id, quantity: { gte: planned + 1 } },
     data: { quantity: { decrement: planned } },
   });
   if (r.count === 0) throw new InsufficientDuplicatesError(...); // race แซง → rollback ทั้ง transaction
   ```
6. **ถ้า `rarity !== 'SPECIAL'`:**
   - `nextTier = TIER_ORDER[TIER_ORDER.indexOf(rarity) + 1]`
   - สุ่มผู้เล่นจาก `Player.findMany({ where: { rarity: nextTier } })` (เหมือน `packs.service.ts`) — ไม่มีเงื่อนไข "ยังไม่มี"
   - ถ้าไม่มีผู้เล่นใน `nextTier` เลย → `NoPlayersForRarityError` (500, shared error)
7. **ถ้า `rarity === 'SPECIAL'`:**
   - **ก่อนหักการ์ดใดๆ ในขั้นตอนที่ 4-5** ให้เช็คก่อนว่ามี SPECIAL ที่ user ยังไม่ owned เหลือไหม:
     ```typescript
     const ownedIds = (await tx.userCard.findMany({
       where: { userId, player: { rarity: 'SPECIAL' } }, select: { playerId: true },
     })).map(c => c.playerId);
     const unowned = await tx.player.findMany({
       where: { rarity: 'SPECIAL', id: { notIn: ownedIds } },
     });
     if (unowned.length === 0) throw new AllSpecialsOwnedError(...); // 409, ไม่หักการ์ดเลย
     ```
   - ถ้ามีเหลือ → ดำเนินการหักการ์ด (ขั้นตอน 4-5) แล้วสุ่ม 1 ใบจาก `unowned`
8. `upsert UserCard` เพิ่มการ์ดที่ได้ (increment quantity ถ้ามีอยู่แล้ว, สร้างใหม่ถ้าไม่มี)

**Errors:** `InvalidRarityError` (400), `InsufficientDuplicatesError` (409), `AllSpecialsOwnedError` (409), `NoPlayersForRarityError` (500)

**Response:** `{ obtainedPlayer: Player, fromRarity: string, toRarity: string }`

## 8. Dust Shop Flow

**`GET /dustshop/catalog`** (auth required — เพื่อคำนวณสิทธิ์ Gold ส่วนตัว)

```json
{
  "silver": { "price": 300, "players": [Player, ...] },
  "gold": { "price": 2000, "purchasedThisMonth": false },
  "special": { "available": false }
}
```
- `silver.players` = `Player.findMany({ where: { rarity: 'SILVER' } })` ทั้งหมด (ไม่ทำ rotation)
- `gold.purchasedThisMonth` = มี `DustShopPurchase` ของ user ที่ `itemType='GOLD'` และ `goldMonthKey` ตรงเดือนปัจจุบัน (UTC) หรือไม่ — **ใช้เพื่อแสดงผลเท่านั้น ไม่ใช่กลไกบังคับ** (กลไกบังคับจริงคือ unique constraint ใน §5)

**`POST /dustshop/purchase`** (auth required)
Request: `{ itemType: 'SILVER' | 'GOLD', playerId?: string }` (`playerId` บังคับเมื่อ `SILVER`)

ภายใน `prisma.$transaction`:

**SILVER:**
1. validate `playerId` ระบุมาและ `player.rarity === 'SILVER'` → `InvalidRarityError` (400) ถ้าไม่ตรง
2. `debitDust(userId, 300, 'dustshop_silver', tx)`
3. `upsert UserCard` (increment)
4. `create DustShopPurchase { itemType: 'SILVER', playerId, dustCost: 300, goldMonthKey: null }`

**GOLD:**
1. สุ่มผู้เล่นจาก `Player.findMany({ where: { rarity: 'GOLD' } })`
2. `debitDust(userId, 2000, 'dustshop_gold', tx)`
3. `currentMonthKey = ${year}-${month}` (UTC)
4. `tx.dustShopPurchase.create({ itemType: 'GOLD', playerId: picked, dustCost: 2000, goldMonthKey: currentMonthKey })`
   - ถ้า Prisma throw unique constraint violation (`P2002`) → catch แล้ว throw `MonthlyLimitExceededError` (409) — transaction rollback อัตโนมัติ (dust ที่หักคืนกลับเอง)
5. `upsert UserCard` (increment)

**SPECIAL:** ปฏิเสธเสมอที่ระดับ validation แรกสุด → `ItemNotAvailableError` (400) — ไม่มี code path ใดขาย SPECIAL ได้เลย

**Errors:** `InsufficientFundsError` (402, reuse จาก `currency.service.ts`), `MonthlyLimitExceededError` (409), `ItemNotAvailableError` (400), `InvalidRarityError` (400)

## 9. Error Class Summary

| Class | HTTP | ที่มา |
|---|---|---|
| `InsufficientDuplicatesError` | 409 | ใหม่ — `cards.service.ts` |
| `CardNotFoundError` | 404 | ใหม่ — `cards.service.ts` |
| `InvalidRarityError` | 400 | ใหม่ — `cards.service.ts`, `dustshop.service.ts` |
| `AllSpecialsOwnedError` | 409 | ใหม่ — `cards.service.ts` |
| `MonthlyLimitExceededError` | 409 | ใหม่ — `dustshop.service.ts` |
| `ItemNotAvailableError` | 400 | ใหม่ — `dustshop.service.ts` |
| `InsufficientFundsError` | 402 | reuse จาก `currency.service.ts` |
| `NoPlayersForRarityError` | 500 | ย้ายจาก `packs.service.ts` ไป `src/shared/errors.ts`, reuse ใน fusion + gold shop |

Route handler ทั้ง `cards.routes.ts` และ `dustshop.routes.ts` ใช้ pattern try/catch map error class → status code เหมือน `packs.routes.ts` เดิม

## 10. Testing Plan

Jest + ts-jest + supertest (stack เดิม) — ไฟล์ใหม่: `tests/cards.test.ts`, `tests/dustshop.test.ts`

**Disenchant:**
- ได้ dust ถูกต้องตาม rarity (5/20/100/500) คูณ quantity
- ห้ามหักจนเหลือ 0 (บังคับเหลือ ≥1)
- error เมื่อไม่มีการ์ดนั้น / quantity ไม่พอ

**Fusion:**
- รวม surplus คละนักเตะครบ 10 → ได้ tier ถัดไป 1 ใบ, verify หักจากใบ quantity สูงสุดก่อนถูกต้อง (รวมถึง tie-break)
- surplus ไม่พอ → error, verify DB state ไม่เปลี่ยนแปลงเลย
- SPECIAL reroll: ได้ใบที่ไม่เคยมี, บล็อกเมื่อ owned ครบ (verify quantity ไม่เปลี่ยน — ไม่หักการ์ดเมื่อ blocked)
- **Race test:** ยิง fusion พร้อมกัน 2 request ด้วย surplus พอสำหรับแค่ 1 ครั้ง → สำเร็จแค่ 1 ครั้ง, อีกอันได้ error สะอาด ไม่มีการ์ดหาย/งอก

**Dust Shop:**
- ซื้อ Silver เลือกเอง, หัก dust ถูกต้อง
- ซื้อ Gold ครั้งแรกสำเร็จ, ครั้งที่ 2 ในเดือนเดียวกัน → `MonthlyLimitExceededError`
- ข้าม calendar month boundary (mock วันที่) → ซื้อได้อีกครั้ง
- **Race test:** ยิง gold purchase พร้อมกัน 2 request → สำเร็จแค่ 1 (verify ผ่าน unique constraint จริงในฐานข้อมูล ไม่ใช่ mock)
- ซื้อ Special → ปฏิเสธเสมอ (400)
- dust ไม่พอ → `InsufficientFundsError`

## 11. Follow-up (นอกขอบเขต Plan 2)

- Dust Shop Silver rotation รายสัปดาห์จริง (ต้องมี cron/admin tool)
- Fusion Discount (8 ใบ) ผูกกับ Level 21+ — รอ Plan 4 (User Level system)
- ICON tier แยกจาก SPECIAL — ถ้า design เปลี่ยนทิศทางในอนาคต
