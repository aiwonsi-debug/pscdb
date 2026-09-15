# Consult Brief: แตก bot.js / webhook_server.js เป็นโมดูลย่อย

## บริบทโปรเจกต์

- ระบบชื่อ AGY — จัดการ operations ห่วงโซ่อุปทานกะหล่ำปลี/ผัก (stock, yield, ราคา) ผ่าน Telegram bot
- รันบน Windows ที่ `E:\agy\` ด้วย Node.js (CommonJS, ไม่มี framework เช่น Express — ใช้ `http` module ดิบ)
- มี deploy copy แยกที่ `render-dashboard/` (Render.com) ซิงก์จาก root ด้วย `sync_render_dashboard.sh` / `.ps1`
- ภาษาโค้ด/คอมเมนต์ผสมไทย-อังกฤษ ข้อความที่ส่งกลับผู้ใช้เป็นภาษาไทย

## สถานะปัจจุบัน (แก้ไปแล้ว ไม่ต้องแตะ)

- ไม่มี logic ซ้ำซ้อนข้ามไฟล์แล้ว (ตรวจด้วย script `scripts/audit-duplicate-logic.js`)
- secrets ทั้งหมดอยู่ใน `secrets/` ถูก `.gitignore` แล้ว, git history ผ่าน filter-repo แล้ว
- `line_handler.js` แก้ hardcoded path เป็น `process.env.AGY_BASE_DIR`/`AGY_EXE_PATH` แล้ว
- มี `ImageProcessingQueue` + cache สำหรับ LINE image analysis แล้ว (จำกัด concurrency = 1)
- เริ่มแยกโมดูลไปบ้างแล้ว: `services/stock_parser.js`, `services/order_finder.js`
- `package.json` dependencies ถูกหมวดแล้ว

## ปัญหาที่เหลือ — เป้าหมายของการปรึกษาครั้งนี้

`bot.js` (2,036 บรรทัด) และ `webhook_server.js` (1,202 บรรทัด) ยังเป็นไฟล์เดียวรวมทุกหน้าที่ ทำให้:
- แก้ 1 จุดต้อง parse/โหลดทั้งไฟล์ (token cost สูงเวลาใช้ AI ช่วยแก้โค้ด)
- ทดสอบแยกส่วนยาก ไม่มี unit boundary ชัดเจน
- **มี circular require ระหว่างสองไฟล์นี้อยู่แล้ว**: `bot.js` require `./webhook_server.js` และ `webhook_server.js` require `./bot.js` กลับ — ต้องคลี่ก่อนแตกไฟล์ ไม่งั้นแตกแล้วจะยิ่งพันกันเป็น web ของ circular import

## โครงสร้าง bot.js ปัจจุบัน (top-level functions ตามลำดับ)

```
execSilent()                    — wrapper รัน shell command แบบเงียบ
autoCheckGmail()                — cron: เช็ค PO ใหม่จาก Gmail
autoCheckAdvanceGT()            — cron: เช็ค advance ground-truth
autoCheckTNSPreparation()       — cron: เช็ค TNS preparation
handleCallbackQuery()           — จัดการ Telegram inline-button callback
pollUpdates()                   — long-poll loop ดึง Telegram updates
sendChatAction()                — ส่ง "typing..." indicator
getOkmdApiKey() / runOkmdEngine()   — เรียก OKMD AI engine
getGroqApiKey() / runGroqFallback() — fallback ไป Groq เมื่อ AGY CLI โควตาเต็ม
handleCabbagePriceSurvey()      — parse ข้อความสำรวจราคากะหล่ำ (ตรรกะเฉพาะโดเมน)
runAgyCli()                     — spawn agy CLI หลัก
runGlm()                        — เรียก GLM model เป็นอีก fallback
checkAuthorization()            — เช็คสิทธิ์ผู้ใช้ตาม chatId
handleCommand()                 — dispatcher ใหญ่: if/else ไล่ text.includes(...)
                                   ครอบคลุม stock update, price survey, undo,
                                   TNS, ground-truth ฯลฯ (บรรทัด ~1010-2036,
                                   เป็นก้อนใหญ่สุดของไฟล์)
```

จุดสังเกต: `handleCommand()` ใช้ pattern matching ด้วยคำภาษาไทยจำนวนมาก
(`text.includes('สต็อก')`, `text.includes('ขึ้นของ')` ฯลฯ) แทน command
prefix ที่ชัดเจน — ต้องระวังตอนแยก อย่าเปลี่ยน matching logic โดยไม่ตั้งใจ

## โครงสร้าง webhook_server.js ปัจจุบัน (routes ตามลำดับ)

```
GET  /usage /quota /ai-dashboard /dashboard   — หน้า dashboard
GET  /css/* /js/* /favicon.ico                — static file serving
GET|POST /  /ops /team-app /field             — หน้าเว็บหลัก
POST /api/login /auth/session                 — auth
POST /api/sync-quota /quota-sync              — sync ค่าใช้จ่าย AI
GET  /api/usage /quota /ai-usage              — อ่านค่าใช้จ่าย AI
POST /api/stock-update                        — อัปเดต stock ผ่าน API
GET  /api/stock /inventory                    — อ่าน stock
GET  /api/health /status                      — health check
POST /api/reboot-bot /restart-bot             — สั่งรีสตาร์ท bot
POST /api/gmail-webhook /gmail-push           — webhook จาก Gmail
POST /api/line-webhook                        — webhook จาก LINE
GET  /api/team-status                         — สถานะทีมภาคสนาม
POST /api/loading-report                      — บันทึกรายงานขึ้นของ
POST /api/team-update /ops                    — อัปเดตงานทีม
POST /api/add-other-task /delete-other-task   — จัดการ task เสริม
POST /api/team-reset /team-complete           — reset/complete งานทีม
```

require เพิ่มเติมของ webhook_server.js: `./bot.js` (circular), `./memory_engine.js`

## ข้อจำกัดที่ต้องรักษาไว้ตอนแตกไฟล์

1. ห้ามเปลี่ยน public behavior ของ Telegram command matching และ HTTP route path ใด ๆ
2. ต้องยังรันบน Windows ได้ (`E:\agy\`) ไม่ใช้ dependency ที่ compile native แปลก ๆ เพิ่ม
3. ห้ามใส่ framework ใหม่ (Express ฯลฯ) ถ้าไม่จำเป็นจริง ๆ — ของเดิมตั้งใจ zero-dependency สำหรับ `http`
4. deploy copy `render-dashboard/server.js` ต้อง sync ต่อได้ตามกลไกเดิม (`sync_render_dashboard.sh`)
5. ต้องคลี่ circular require (`bot.js` ↔ `webhook_server.js`) เป็นส่วนหนึ่งของแผน ไม่ใช่แค่ย้ายไฟล์

## สิ่งที่ต้องการจากการปรึกษา

1. แผนแตกไฟล์ที่เป็นรูปธรรม (โครงสร้างโฟลเดอร์ใหม่ เช่น `handlers/`, `routes/`, `cron/`) พร้อมระบุว่าฟังก์ชันไหนย้ายไปไฟล์ไหน
2. วิธีคลี่ circular require ระหว่าง bot.js กับ webhook_server.js อย่างปลอดภัย (เช่น dependency injection / event emitter / shared context module)
3. ลำดับขั้นการย้ายแบบทำทีละสเต็ปได้โดยไม่พังระบบที่รันอยู่จริง (live production, downtime ต้องน้อยที่สุด)
4. จุดเสี่ยงที่ควรระวังเป็นพิเศษ เช่น shared mutable state ระหว่างฟังก์ชัน (เช่น cache/queue ที่ประกาศระดับไฟล์)
