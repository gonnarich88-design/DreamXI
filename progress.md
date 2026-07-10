# Dream XI — Progress Tracker

**อัปเดตล่าสุด:** 2026-07-10

## ▶️ Resume Here (สำหรับ chat หน้า)

🎉 **Plan 2 (Duplicate Handling) เสร็จสมบูรณ์ — เปิด PR แล้ว, รอ merge** (PR [#2](https://github.com/gonnarich88-design/DreamXI/pull/2), branch `feature/duplicate-handling`)

**สรุปสิ่งที่ได้:** Disenchant (`POST /cards/disenchant`), Fusion (`POST /cards/fusion` — pool การ์ดซ้ำคละนักเตะ 10 ใบ/tier, SPECIAL reroll), Dust Shop (`GET /dustshop/catalog`, `POST /dustshop/purchase` — Silver เลือกเองไม่จำกัด, Gold สุ่ม 1 ครั้ง/เดือน บังคับด้วย DB unique constraint ไม่ใช่ check-then-act) ครบทั้ง 8 task ผ่าน implement → task review (spec+quality) ตาม subagent-driven-development ทุก task Approved ไม่มี fix round ที่จำเป็น (มีแค่ implementer self-fix 1 จุดที่ Task 5 จาก plan gap เล็กๆ ซึ่ง reviewer ยืนยันว่าถูกต้องแล้ว) ปิดท้ายด้วย final whole-branch review (Ready to merge: Yes, ไม่มี Critical/Important) full suite 71/71 ผ่าน, `tsc --noEmit` clean

**Follow-up work ที่ถูก triage ไว้จาก Plan 2 (ไม่ใช่ merge blocker):** race window เล็กๆ ระหว่าง `fuse()` กับ `purchaseGold()` บน `UserCard.upsert` เมื่อสุ่มได้นักเตะเดียวกันพร้อมกัน (rare, self-healing, ไม่มีเงิน/การ์ดหาย), `InsufficientDuplicatesError` ใช้ error class เดียวกันทั้งกรณี permanent และ retryable, `purchaseGold` เช็ค insufficient-funds ก่อน monthly-limit (ให้ผลลัพธ์ error code ที่ informative น้อยกว่าถ้าเจอทั้งสองเงื่อนไข), 500 response โชว์ error message ตรงๆ, `cards.service.ts` เริ่มยาว (~158 บรรทัด) — รายละเอียดเต็มใน `.superpowers/sdd/progress.md`

**ขั้นตอนต่อไป (สำหรับ chat หน้า):** merge PR #2 เมื่อพร้อม แล้วเริ่ม **Plan 3 (Purchase Points Lifecycle)** — ยังไม่มี plan doc ต้องเริ่มจาก brainstorming/spec ก่อน — **หมายเหตุ:** Plan 1's follow-up "PP ledger ไม่ balance-reconstructable" ต้องตัดสินใจก่อนเริ่ม Plan 3

**Ledger ของ subagent-driven-development:** `.superpowers/sdd/progress.md` (มีรายละเอียดแต่ละ task ที่เสร็จแล้ว + commit range) — หมายเหตุ: ledger นี้อยู่ใน worktree `feature/duplicate-handling` (`.worktrees/duplicate-handling/.superpowers/sdd/progress.md`), ไฟล์นี้เป็น local scratch ไม่ sync กับ main โดยอัตโนมัติ

โปรเจกต์: ระบบเปิดการ์ดนักเตะ Premier League แบบ gacha/pack-opening ผูกกับระบบร้านค้าเดิม (แต้มฟรีทั้งหมด ไม่มีการขายซองด้วยเงินจริงตรงๆ)

- 📄 Design Doc: [`docs/superpowers/specs/2026-07-08-football-card-pack-system-design.md`](docs/superpowers/specs/2026-07-08-football-card-pack-system-design.md)
- 📄 Plan 1: [`docs/superpowers/plans/2026-07-08-backend-foundation-pack-opening.md`](docs/superpowers/plans/2026-07-08-backend-foundation-pack-opening.md)
- 📄 Design Doc Plan 2: [`docs/superpowers/specs/2026-07-10-duplicate-handling-design.md`](docs/superpowers/specs/2026-07-10-duplicate-handling-design.md)
- 📄 Plan 2: [`docs/superpowers/plans/2026-07-10-duplicate-handling.md`](docs/superpowers/plans/2026-07-10-duplicate-handling.md)
- 🔗 Repo: https://github.com/gonnarich88-design/DreamXI

---

## 🔴 Critical — ต้องดำเนินการคู่ขนาน (ไม่ผูกกับ dev progress)

- [ ] ปรึกษาทนายเรื่องใบอนุญาตการพนัน/รางวัลเสี่ยงโชค (กรมการปกครอง) — ระบบ "ซื้อของจริง → แต้ม → สุ่มรางวัล" เข้าข่าย พ.ร.บ. การพนัน
- [ ] ปรึกษาทนายเรื่อง right of publicity ของนักเตะ Premier League (ใช้ชื่อจริงเพื่อการค้า)

---

## Roadmap ภาพรวม

| # | แผน | สถานะ |
|---|---|---|
| 1 | Backend Foundation + Pack Opening Engine | 🟢 Done — merged via [#1](https://github.com/gonnarich88-design/DreamXI/pull/1) |
| 2 | Duplicate Handling (Disenchant/Dust, Fusion, Dust Shop) | 🟡 Done — PR [#2](https://github.com/gonnarich88-design/DreamXI/pull/2) open, awaiting merge |
| 3 | Purchase Points Lifecycle (Webhook, Pending→Confirmed, Clawback) | ⚪ Not started |
| 4 | Level / XP System | ⚪ Not started |
| 5 | Frontend (Web/PWA/Telegram Mini App) | ⚪ Not started |
| 6 | Match Simulation Engine | ⚪ Blocked — ยังไม่ได้ออกแบบ (Open Item ใน spec) |

---

## Plan 1: Backend Foundation + Pack Opening Engine — Task Checklist

Stack: Node.js + TypeScript + Express + PostgreSQL + Prisma

- [x] Task 1: Project Scaffolding + Database Schema
- [x] Task 2: Currency Ledger Service (LP / PP pending-confirmed / XP / Dust)
- [x] Task 3: Auth (Register, Login, JWT Middleware)
- [x] Task 4: RNG Rarity Selection (Pure Function)
- [x] Task 5: Pity Counter Service
- [x] Task 6: Card Catalog + Pack Type Seed Data
- [x] Task 7: Pack Opening Orchestration Service
- [x] Task 8: Pack Opening HTTP Endpoint
- [x] Task 9: Server Entrypoint

---

## Plan 2: Duplicate Handling (Disenchant/Dust, Fusion, Dust Shop) — Task Checklist

- [x] Task 1: DustShopPurchase schema (race-safe monthly Gold limit via unique constraint)
- [x] Task 2: Shared errors + rarity constants
- [x] Task 3: Disenchant service
- [x] Task 4: Fusion service (pooled duplicates + SPECIAL reroll)
- [x] Task 5: Cards HTTP routes
- [x] Task 6: Dust Shop catalog + Silver purchase
- [x] Task 7: Dust Shop Gold purchase (race-safe)
- [x] Task 8: Dust Shop HTTP routes

---

## Open Items (จาก Design Doc §14 — ยังไม่ตัดสินใจ)

- [ ] แหล่งข้อมูลสถิตินักเตะจริง (API-Football / Sportmonks / อื่นๆ) + ความถี่อัปเดต
- [ ] ราคาซอง Gold/Special (PP) ที่แท้จริง — รอข้อมูลยอดซื้อเฉลี่ยต่อออเดอร์จริงจากร้านค้า (ตอนนี้ใช้ placeholder ในโค้ด)
- [ ] Match Simulation Engine (สูตรคำนวณผลแข่ง)
- [ ] ระบบยืนยันอายุผู้เล่น (ถ้ากลุ่มเป้าหมายมีเยาวชน)
- [ ] Prestige system (future enhancement หลัง Level 30)
- [ ] Soft Pity (พิจารณาเพิ่มทีหลังถ้าพบผู้เล่นหงุดหงิดใกล้ hard pity threshold)

---

## Legend

🟡 In Progress · ⚪ Not started · 🟢 Done · 🔴 Blocked/Critical
