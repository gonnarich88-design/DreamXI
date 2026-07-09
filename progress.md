# Dream XI — Progress Tracker

**อัปเดตล่าสุด:** 2026-07-09

## ▶️ Resume Here (สำหรับ chat หน้า)

🎉 **Plan 1 เสร็จสมบูรณ์และ merge เข้า `main` แล้ว** (PR [#1](https://github.com/gonnarich88-design/DreamXI/pull/1), merge commit `efc5e21`) branch `feature/backend-foundation` ยังไม่ลบ (เผื่ออ้างอิงย้อนหลัง)

**สรุปสิ่งที่ได้:** Backend foundation ครบทั้ง 9 tasks — project scaffolding, currency ledger, auth, RNG, pity counter, seed data, pack-opening orchestration (transaction เดียว), HTTP endpoint, server entrypoint ทุก task ผ่าน implement → task review → fix rounds (ถ้าเจอ issue) ตาม subagent-driven-development แล้วปิดท้ายด้วย final whole-branch review (Ready to merge: Yes, ไม่มี Critical, 1 Important แก้แล้ว — `getOrCreateBalance` race) full suite 37/37 ผ่าน, `tsc --noEmit` clean

**Follow-up work ที่ถูก triage ไว้ (ไม่ใช่ merge blocker แต่ควรทำในอนาคต):** seed script ไม่ idempotent, PP ledger ไม่ balance-reconstructable (ต้องตัดสินใจก่อน Plan 3), ไม่มี sign/integer guard ที่ currency-service boundary, Client type alias ซ้ำ, bare Error class ในบาง guard, comment ซ้ำใน rng.ts — รายละเอียดเต็มใน `.superpowers/sdd/progress.md`

**ขั้นตอนต่อไป (สำหรับ chat หน้า):** เริ่ม **Plan 2 (Duplicate Handling: Disenchant/Dust, Fusion, Dust Shop)** — ยังไม่มี plan doc ต้องเริ่มจาก brainstorming/spec ก่อน (ดู superpowers:brainstorming)

**Ledger ของ subagent-driven-development:** `.superpowers/sdd/progress.md` (มีรายละเอียดแต่ละ task ที่เสร็จแล้ว + commit range)

โปรเจกต์: ระบบเปิดการ์ดนักเตะ Premier League แบบ gacha/pack-opening ผูกกับระบบร้านค้าเดิม (แต้มฟรีทั้งหมด ไม่มีการขายซองด้วยเงินจริงตรงๆ)

- 📄 Design Doc: [`docs/superpowers/specs/2026-07-08-football-card-pack-system-design.md`](docs/superpowers/specs/2026-07-08-football-card-pack-system-design.md)
- 📄 Plan 1: [`docs/superpowers/plans/2026-07-08-backend-foundation-pack-opening.md`](docs/superpowers/plans/2026-07-08-backend-foundation-pack-opening.md)
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
| 2 | Duplicate Handling (Disenchant/Dust, Fusion, Dust Shop) | ⚪ Not started |
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
