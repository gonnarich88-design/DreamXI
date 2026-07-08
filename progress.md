# Dream XI — Progress Tracker

**อัปเดตล่าสุด:** 2026-07-09

## ▶️ Resume Here (สำหรับ chat หน้า)

กำลังทำ **Plan 1** ด้วย Subagent-Driven Development บน branch `feature/backend-foundation` (แยกจาก `main` แล้ว — ยังไม่ merge)

**สถานะตอนหยุด:** 🎉 **Plan 1 ครบทั้ง 9 Task แล้ว** Task 9 (Server Entrypoint) ผ่านรีวิวรอบสุดท้าย — **Approved** หลังเจอปัญหาระหว่างทาง (โค้ดตาม brief เป๊ะๆ รันไม่ผ่านจริงเพราะ `ts-node-dev` ไม่เห็น ambient type augmentation ของ `req.userId` — ต้องเพิ่ม triple-slash reference ใน `server.ts` ถึงจะรันได้ ลองย้ายไปแก้ที่ `tsconfig.json` แล้วแต่ไม่เวิร์กจริงกับ `ts-node-dev` เวอร์ชันนี้ สุดท้ายผู้ใช้ตัดสินใจคงวิธีเดิมไว้พร้อม comment อธิบาย) commit range `6767188..4d4f63e` บันทึกลง ledger แล้ว

**ขั้นตอนต่อไป (ตาม superpowers:subagent-driven-development):**
1. Dispatch final whole-branch code reviewer (ใช้ template จาก `superpowers:requesting-code-review`) ตรวจทั้ง branch `feature/backend-foundation` เทียบกับ `main` (หา merge-base ด้วย `git merge-base main HEAD`) — รวม Minor findings ที่สะสมไว้ระหว่างทางทุก task (ดูรายละเอียดใน `.superpowers/sdd/progress.md`) ให้ reviewer ช่วย triage ด้วยว่าอันไหนควรแก้ก่อน merge
2. ถ้าเจอ findings → แก้แล้ว re-review
3. เมื่อผ่านแล้ว → เข้า superpowers:finishing-a-development-branch เพื่อตัดสินใจ merge/PR/cleanup

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
| 1 | Backend Foundation + Pack Opening Engine | 🟡 In Progress |
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
