# รายงานสรุปผลการแก้ไขช่องโหว่ความปลอดภัยและการปรับปรุงระบบ (PSC AI Operations Remediation Report)

**วันและเวลาจัดทำ:** 5 กันยายน 2569 (2026-09-05)  
**ระบบ:** PSC AI Operations & Secretary Assistant  
**อ้างอิงเอกสารผลการตรวจสอบเดิม:** `PSC_AI_Operations_FULL_AUDIT_2026-09-04.md`  
**สถานะการแก้ไข (Verdict):** ✅ **RESOLVED & PRODUCTION-HARDENED (Zero Master Key Exposure, Live & Static 100% PASS)**

---

## 1. บทสรุปสำหรับผู้บริหาร (Executive Summary)

จากข้อสังเกตเชิงสถาปัตยกรรม (Architectural Finding) ในการตรวจสอบรอบล่าสุด ซึ่งระบุว่าแม้ระบบจะตัดสิทธิ์ Master API Key ออกจากโค้ดถาวรแล้ว แต่การส่ง Master `PSC_API_KEY` เข้าสู่ Browser ผ่าน `/ops` ทำให้ Secret กลายเป็น Client Credential ซึ่งเปิดเผยต่อ DevTools หรือ Network Inspection ได้นั้น

ทีมงานได้ปรับปรุงสถาปัตยกรรมใหม่เป็น **Option 1: Zero Master Key Exposure Architecture (Ephemeral Web Session Tokens / HttpOnly Cookies)**:
1. **Master `PSC_API_KEY` จะถูกกักเก็บอยู่บน Server หลังบ้าน 100%** สำหรับการสื่อสารระหว่างระบบ Backend, Inter-Service, Cron Daemons, และ Cloud Sync เท่านั้น
2. **Web UI Client (`/ops`, `/`) จะไม่ได้รับ Master Key อีกต่อไป**: เซิร์ฟเวอร์จะสร้าง **Ephemeral Web Session Token (`psc_sess_...`)** ที่มีอายุจำกัด พร้อมแนบ `Set-Cookie: HttpOnly; SameSite=Lax` เพื่อใช้สำหรับส่งคำสั่งบันทึกการทำงานของทีมงาน
3. **Defense in Depth Backend**: ฝั่ง Server ตรวจสอบสิทธิ์โดยยอมรับ Master Key สำหรับระบบภายใน หรือ Web Session Token ที่สร้างจาก Server เท่านั้น และยังคง Fail-Closed 100% หากไม่มีการตั้งค่า `PSC_API_KEY` ใน Environment

---

## 2. รายละเอียดการแก้ไขตามระดับความรุนแรง

### 🔴 ระดับวิกฤต (CRITICAL FINDINGS: C-01 ถึง C-07) — แก้ไขครบถ้วน

| รหัส | ช่องโหว่เดิมที่ตรวจพบ | แนวทางการแก้ไขที่ดำเนินการจริง | ไฟล์ที่เกี่ยวข้อง | ผลการทดสอบ |
| :--- | :--- | :--- | :--- | :---: |
| **C-01** | **ขาดการตรวจสอบสิทธิ์ Telegram (Auth Bypass):** ใครทักแชทเข้ามา ระบบจะแต่งตั้งเป็น Admin อัตโนมัติ | • ลบระบบ Dynamic Promotion ออกจาก Polling Loop<br>• กำหนด Allowlist ถาวร `ALLOWED_ADMINS = ['1532466397']`<br>• บล็อกทั้งคำสั่งข้อความ (`handleCommand`) และการกดปุ่มเมนู (`handleCallbackQuery`) จากผู้ใช้ที่ไม่ได้รับอนุญาต | `bot.js` | ✅ **PASS** |
| **C-02** | **สั่งรันคำสั่งเครื่องผ่านแชทได้ (Remote Command Execution):** มีคำสั่ง `/cmd`, `/sh`, `/ps` รันโค้ด PowerShell โดยตรง | • ปิดการทำงานของคำสั่งรัน Shell ทั้งหมดอย่างถาวร<br>• ตัดการเชื่อมต่อ `execSilent` ออกจากคำสั่งกลุ่มนี้ | `bot.js` | ✅ **PASS** |
| **C-03** | **AGY CLI รันด้วยสิทธิ์สูงสุด:** มีพารามิเตอร์ `--dangerously-skip-permissions` | • นำพารามิเตอร์ดังกล่าวออกจากการ Spawn ของ AGY CLI<br>• จำกัดให้ AI ทำงานภายใต้โหมดความปลอดภัย (Least-Privilege) | `bot.js` | ✅ **PASS** |
| **C-04** | **รหัสผ่าน/Token ฝังในโค้ด (Hardcoded Secret):** มี Fallback Bot Token เขียนไว้ในซอร์สโค้ด และ Git Track ไฟล์ Credentials | • นำ Hardcoded Token และ API Keys ออกจากซอร์สโค้ดทั้งหมด ห้ามมี fallback secret default เด็ดขาด<br>• ปลดการ Track และลบไฟล์ `.env`, `line_config.json` ออกจาก Git Index ทั้งหมด พร้อมสร้างไฟล์เทมเพลตตัวอย่าง `.example`<br>• บังคับใช้นโยบาย **Fail-Closed** จาก Environment Variables (`process.env.PSC_API_KEY`) เท่านั้น หากไม่ตั้งค่าเซิร์ฟเวอร์จะปฏิเสธการทำงาน (Reject 401) | `webhook_server.js`<br>`bot.js`<br>`cloud_secretary/`<br>`render-dashboard/` | ✅ **PASS** |
| **C-05** | **API สาธารณะขาดการตรวจสอบสิทธิ์ & Credential Exposure:** ปลายทาง HTTP อนุญาตให้เขียนข้อมูลได้โดยไม่มีสิทธิ์ หรือรับคีย์ผ่าน URL Query | • บังคับใช้ระบบความปลอดภัย **Header-Only Authentication (`X-PSC-API-KEY` หรือ `Authorization: Bearer <key>`)** ในทุก Endpoint ที่เป็นคำสั่งเขียน (POST): `/api/stock-update`, `/api/team-update`, `/api/loading-report`, `/api/team-reset`, `/api/reboot-bot`, `/api/sync-quota`<br>• **ยกเลิกการรับคีย์ผ่าน Query String (`?key=`, `?apiKey=`) ทั้งหมด** เพื่อป้องกัน Credential รั่วไหลผ่าน Server Access Logs<br>• หากไม่มี Header หรือ Key/Token ไม่ตรง จะถูกปฏิเสธทันทีด้วยรหัส **HTTP 401 Unauthorized**<br>• ยกระดับการจำกัดสิทธิ์ Origin (Strict CORS): ไม่อนุญาต Origin ภายนอกที่ไม่ได้รับอนุญาต | `webhook_server.js`<br>`render-dashboard/server.js`<br>`cloud_secretary/server.js` | ✅ **PASS** |
| **C-06** | **สต็อกเสี่ยงต่อการเขียนทับพังทั้งระบบ (Wholesale Overwrite & Data Corruption):** `/api/stock-update` ไม่มี Schema Validation | • เพิ่มการตรวจสอบโครงสร้างข้อมูลอย่างเข้มงวด (Strict Schema & Whitelist Validation): ล็อค SKU ที่อนุญาตเฉพาะกลุ่มสินค้าที่กำหนด (`Cabbage`, `Onion_AFT`, `Onion_Chinese`, `Carrot`, `Purple_Sweet_Potato`, `Yellow_Sweet_Potato`, `Orange_Sweet_Potato`)<br>• ป้องกัน Input แฝง: ตรวจสอบ `Number.isFinite(StockKg)` และจำกัดขอบเขต `0 <= StockKg <= 1,000,000` กิโลกรัม (ตัดโอกาสค่า `Infinity`, `NaN`, หรือค่าติดลบ)<br>• ใช้เทคนิค **Atomic Write (temp-file + renameSync)** ป้องกันไฟล์เสียหายระหว่างเขียน | `webhook_server.js`<br>`render-dashboard/server.js` | ✅ **PASS** |
| **C-07** | **Operational Telemetry & Quota Endpoints ขาดการป้องกัน (Unauthenticated Read Exposure):** ข้อมูล Quota และสถานะการใช้งาน AI เปิดเผยต่อสาธารณะ | • เพิ่ม Auth Guard บังคับตรวจ API Key บน Endpoints: `GET /api/usage`, `GET /api/quota`, `GET /api/ai-usage`<br>• ส่งผลให้บุคคลภายนอกไม่สามารถตรวจดูสถานะทรัพยากรหรือโควตาระบบได้ หากไม่มี API Key (ส่งกลับ HTTP 401) | `webhook_server.js` | ✅ **PASS** |

---

### 🟠 ระดับสูงและปานกลาง (HIGH & MEDIUM FINDINGS) — ปรับปรุงสำคัญ

| รหัส | รายการที่แก้ไข | รายละเอียดทางเทคนิค | ไฟล์ที่เกี่ยวข้อง |
| :--- | :--- | :--- | :--- |
| **H-01** | Strict CORS Restriction | ตรวจสอบ Origin อย่างเข้มงวด โดยไม่อนุญาตให้สะท้อน (Reflect) Untrusted Origins | `webhook_server.js`<br>`render-dashboard/server.js` |
| **H-02** | **Zero Master Key Exposure (Web Session Tokens)** | สถาปัตยกรรมแยก Secret: Master API Key ไม่ส่งออกไปยัง Client โดย Web App `/ops` ได้รับเฉพาะ Short-lived Ephemeral Web Session Token (`psc_sess_...`) พร้อม HttpOnly Cookie เท่านั้น | `ops_mobile_web.html`<br>`cloud_secretary/team_dashboard.html`<br>`webhook_server.js`<br>`render-dashboard/server.js`<br>`cloud_secretary/server.js` |
| **H-03** | HTML Injection Defense in Push Notifications | ทำ HTML Sanitization / Escaping (`escapeHtml`) กับข้อมูลอีเมล Gmail (`from`, `subject`, `snippet`, `attachmentNames`) ก่อนจัดรูปแบบส่ง Telegram ด้วยโหมด `parse_mode: 'HTML'` ป้องกันการโจมตี Injection ทางแชท | `webhook_server.js`<br>`render-dashboard/webhook_server.js` |
| **H-04** | File Exfiltration Prevention | จำกัดการค้นหาไฟล์ (`ขอไฟล์`, `/file`) ให้อยู่เฉพาะในโฟลเดอร์เอกสารงาน `E:\รวมงาน\งาน 25-26` พร้อมบล็อกไฟล์ที่มีคำว่า `config`, `token`, `key`, `password`, `.env` | `bot.js` |
| **H-06** | Data Provenance Tracking | เพิ่ม Metadata ระบุแหล่งที่มา (`provenance`, `extractionMethod`) ในทุกรายการ Ground Truth ให้ตรวจสอบย้อนกลับได้ | `ground_truth_validator.js` |
| **H-07 / H-08** | Excel Relationship Map & Fail-Closed | ปรับการอ่าน Workbook ให้ Resolve รหัส `r:id` ผ่านไฟล์ `workbook.xml.rels` และเปลี่ยนเป็น **Fail-Closed (Throw Error ทันทีถ้าไม่พบชีตเป้าหมาย)** ห้าม Fallback เองเด็ดขาด | `excel_integrity_engine.js` |
| **H-11** | Prompt Injection / Memory Protection | กั้นไม่ให้ข้อความแชททั่วไปถูกเลื่อนขั้นเป็น `business_rules` และทำ Sanitization กรองอักขระพิเศษก่อนบันทึก | `memory_engine.js` |
| **H-12** | Secret Leak Prevention | ปิดคำสั่ง `/set_hotmail` และ `/set_glm_key` ทางหน้าแชท Telegram เพื่อป้องกันการส่งรหัสผ่านแบบ Plaintext | `bot.js` |
| **H-14** | Atomic Concurrent Writes | ปรับปรุงฟังก์ชัน `saveTeamOps` ทั้งในเครื่องและบน Render Cloud ให้เขียนไฟล์แบบ Atomic ป้องกันข้อมูลทับซ้อน | `webhook_server.js`<br>`render-dashboard/server.js` |
| **M-03** | Request Body Size Limit | จำกัดขนาด Body ขาเข้าของ Webhook ไว้ที่ **1 MB** หากเกินจะตัดการเชื่อมต่อทันที เพื่อป้องกันหน่วยความจำล้น | `webhook_server.js`<br>`render-dashboard/server.js` |
| **M-08** | Automated Test Suite | จัดทำทั้ง Static Assertion Suite (`test_security_remediation.js`) และ Live Runtime HTTP Test Suite (`test_live_http_audit.js`) สำหรับทำ Continuous Security Testing | `SYSTEM_AUDIT_REPORT/` |

---

## 3. ผลการทดสอบและประเมินผลระบบ (Verification Results)

### 1. Static Security & Integrity Test Suite (`test_security_remediation.js`)
- ตรวจสอบ C-01 (Admin Auth Allowlist): ✅ **PASS**
- ตรวจสอบ C-02 (Shell Execution Disabled): ✅ **PASS**
- ตรวจสอบ C-03 (No Dangerous Skip Permissions): ✅ **PASS**
- ตรวจสอบ H-12 (No Secrets via Chat): ✅ **PASS**
- ตรวจสอบ C-04 (No Hardcoded Token or Fallback Key): ✅ **PASS**
- ตรวจสอบ H-01 (CORS Restricted): ✅ **PASS**
- ตรวจสอบ M-03 (Max Body Size Guard): ✅ **PASS**
- ตรวจสอบ C-06 (Atomic Stock Write & Schema): ✅ **PASS**
- ตรวจสอบ H-07/H-08 (Excel Rel Mapping & Fail-Closed): ✅ **PASS**
- ตรวจสอบ H-11 (Immutable Rules Protection): ✅ **PASS**
- ตรวจสอบ C-05 (Webhook POST Enforces Header Auth): ✅ **PASS**
- ตรวจสอบ C-05 (Render Server POST Enforces Header Auth): ✅ **PASS**
- ตรวจสอบ C-05 (Mobile Ops Client Passes Dynamic Auth): ✅ **PASS**
- ตรวจสอบ SEC-01 (.gitignore Excludes Secrets & State Signals): ✅ **PASS**
- ตรวจสอบ C-05 (No Secret Key Fallback in Webhook Server): ✅ **PASS**
👉 **ผลรวม Static Test: ผ่าน 15 / 15 ข้อ (100%)**

### 2. Live HTTP Negative & Runtime Test Suite (`test_live_http_audit.js`)
ทดสอบยิง Request จริงบน Local Server Port 8999:
1. Rejects unauthenticated POST /api/stock-update (401): ✅ **PASS**
2. Rejects URL query parameter `?key=` (401): ✅ **PASS**
3. Rejects URL query parameter `?apiKey=` (401): ✅ **PASS**
4. Rejects unauthenticated GET /api/usage (401): ✅ **PASS**
5. Rejects unauthenticated GET /api/quota (401): ✅ **PASS**
6. Accepts authenticated GET /api/usage via `X-PSC-API-KEY` (200): ✅ **PASS**
7. Accepts authenticated POST via `Authorization: Bearer <key>` (200): ✅ **PASS**
8. Rejects malformed payload (400): ✅ **PASS**
9. Rejects `Infinity` in `StockKg` (400): ✅ **PASS**
10. Rejects negative numbers in `StockKg` (400): ✅ **PASS**
11. Rejects unknown SKU not in whitelist (400): ✅ **PASS**
12. Strict CORS blocks reflection of untrusted origins: ✅ **PASS**
13. **Option 1 Zero Master Key Exposure:** Master `PSC_API_KEY` is NEVER leaked to HTML/Browser; Ephemeral session token (`psc_sess_...`) and HttpOnly Cookie are issued correctly: ✅ **PASS**
👉 **ผลรวม Live HTTP Test: ผ่าน 13 / 13 ข้อ (100%)**

### 3. Core Functional Logic Suite (`test_functional_logic.js`)
- ทดสอบการคำนวณ Yield, Transit Loss, Deduplication, และ FIFO Audit Trail:
👉 **ผลรวม: ผ่าน 15 / 15 ข้อ (100%)**

---

## 4. สถานะการให้บริการปัจจุบัน (Service Status)

- **Telegram Secretary Bot:** 🟢 **ONLINE** (PID: Active, พอร์ต 8080 พร้อมรับคำสั่ง)
- **สิทธิ์การสั่งการ:** ล็อคเฉพาะผู้ใช้ Telegram ID `1532466397`
- **ระบบ Web Security:** **Zero Master Key Exposure (Ephemeral Web Session Tokens + HttpOnly Cookies)**
- **ระดับความปลอดภัยโดยรวม:** **HARDENED & PRODUCTION-READY**
