# Dream XI — Progress Tracker

**อัปเดตล่าสุด:** 2026-07-08

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
| 1 | Backend Foundation + Pack Opening Engine | 🟡 In Progress |
| 2 | Duplicate Handling (Disenchant/Dust, Fusion, Dust Shop) | ⚪ Not started |
| 3 | Purchase Points Lifecycle (Webhook, Pending→Confirmed, Clawback) | ⚪ Not started |
| 4 | Level / XP System | ⚪ Not started |
| 5 | Frontend (Web/PWA/Telegram Mini App) | ⚪ Not started |
| 6 | Match Simulation Engine | ⚪ Blocked — ยังไม่ได้ออกแบบ (Open Item ใน spec) |

---

## Plan 1: Backend Foundation + Pack Opening Engine — Task Checklist

Stack: Node.js + TypeScript + Express + PostgreSQL + Prisma

- [ ] Task 1: Project Scaffolding + Database Schema
- [ ] Task 2: Currency Ledger Service (LP / PP pending-confirmed / XP / Dust)
- [ ] Task 3: Auth (Register, Login, JWT Middleware)
- [ ] Task 4: RNG Rarity Selection (Pure Function)
- [ ] Task 5: Pity Counter Service
- [ ] Task 6: Card Catalog + Pack Type Seed Data
- [ ] Task 7: Pack Opening Orchestration Service
- [ ] Task 8: Pack Opening HTTP Endpoint
- [ ] Task 9: Server Entrypoint

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
