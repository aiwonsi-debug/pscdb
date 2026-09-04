# 🛡️ PSC AI Operations - System Audit & Architecture Dossier
**Generated Date:** 04/09/2026  
**System Target:** Enterprise Secretary AI, Field Operations & Hybrid Quota Management  
**Audit Scope:** Memory Engine, Automation Daemons, Telegram Bot Pipeline, Security, Data Integrity  

---

## 1. Executive Summary & Purpose
ระบบนี้ถูกออกแบบขึ้นเพื่อทำหน้าที่เป็น **"Autonomous Digital Secretary & Field Operations Manager"** สำหรับธุรกิจจัดซื้อและกระจายสินค้าเกษตร (บริษัท ไพศาลเจริญ (1988) จำกัด) โดยมีเป้าหมายหลัก 3 ประการ:
1. **Zero Data Loss & High Integrity:** สกัดและจัดเก็บข้อมูลจัดซื้อ ขึ้นของ รับเข้า และสต็อกสินค้าแบบ Ground Truth 100% ปราศจาก AI Hallucination
2. **Hybrid Multi-Model Architecture:** ผสานพลัง AI หลายค่ายเพื่อความเร็ว (Groq Llama-3), ความฉลาดและสิทธิ์จัดการเครื่อง (Google Antigravity / Gemini 3.8), และทางเลือก Open-Weights (GLM-4 / GLM-5.3)
3. **Cross-Platform Real-Time Sync:** เชื่อมโยงข้อมูลแบบ 4 ท่อ: Telegram Bot <-> Local Storage <-> Render Cloud WebApp <-> LINE Group Notifications

---

## 2. Component Inventory & Audit Checklist

| Component | File Path | Primary Function | Audit Focus Areas |
| :--- | :--- | :--- | :--- |
| **Central Memory** | `E:\agy\SECRETARY_MEMORY.md` | กฎระเบียบธุรกิจ (Rules 1-29) และองค์ความรู้ | ความครบถ้วนของกฎ, การป้องกันข้อมูลขัดแย้ง, การ Sync ขึ้น GitHub |
| **JSON Memory** | `E:\agy\secretary_memory.json` | ฐานข้อมูล Fact เชิงโครงสร้างที่ระบบอ่านอัตโนมัติ | รูปแบบ Key-Value, ความแม่นยำของยอด PO และราคา |
| **Telegram Bot** | `E:\agy\bot.js` | แกนกลางรับคำสั่ง, Unified AI Parser, จัดการ Event | Input Sanitization, Error Handling, Polling Stability |
| **Webhook API** | `E:\agy\webhook_server.js` | REST API สำหรับ Local/Cloud Sync & Mobile Web | CORS Policy, Rate Limiting, JSON Payload Validation |
| **Mobile Frontend** | `E:\agy\ops_mobile_web.html` | Web App หน้างานภาคสนาม สไตล์ Dark Reader | Responsive UI, Real-time DOM Updates, Security |
| **Stock Ledger** | `E:\agy\stock_inventory.json` | ยอดสต็อกคงเหลือ 7 ชนิดหลัก & ค่า Yield | การคำนวณ Yield อัตโนมัติ, การตัดสต็อก, การระบุ Timestamp |
| **Freight Ledger** | `E:\agy\cabbage_prices_transport.json` | ประวัติการขึ้นของ ค่ารถ และการสูญเสียน้ำหนัก | Transit Loss Analysis, ความถูกต้องของยอดเงิน |
| **Ops State** | `E:\agy\team_ops_status.json` | สถานะการ์ดจัดซื้อและตารางบันทึกการส่งของ | Card Lifecycle (รอดำเนินการ -> สั่งแล้ว -> ส่งแล้ว) |
| **Integrity Engine**| `E:\agy\excel_integrity_engine.js` | ระบบตรวจสอบความถูกต้องของไฟล์ Excel อัตโนมัติ | Reconciliation Math, Column Verification |

---

## 3. Data Flow & Security Architecture

### 3.1 Flow การประมวลผลข้อความ (Message Ingestion Pipeline):
```text
[Telegram User Message]
          │
          ▼
    [bot.js Polling]
          │
          ├─► ตรวจจับ Negation / คำสั่งพิเศษ (/model, /audit, /ops, /miniapp)
          │
          ▼
    [Unified AI Engine (Groq Llama-3 JSON Mode)]
          │
          ├─► สกัด: วันที่, สินค้า, สวน, น้ำหนัก, ค่ารถ, สภาพ, ขนาด, สุ่มปอก
          ├─► คำนวณ: Yield = (Peeled / Sample) * 100
          │
          ▼
    [Multi-Database Distributor]
          ├─► 1. stock_inventory.json (บันทึกตัวเลข + ปรับ Yield AFT)
          ├─► 2. team_ops_status.json (ย้ายเข้าสู่ Completed Delivery Log)
          ├─► 3. cabbage_prices_transport.json (บันทึก Shipment History)
          │
          ▼
    [Cloud Sync & Alert Dispatcher]
          ├─► POST https://pscdb.onrender.com/api/stock-update (HTTP 200)
          ├─► POST https://pscdb.onrender.com/api/team-update (HTTP 200)
          ├─► LINE Messaging API (แจ้งสรุปเข้ากลุ่มงานพร้อมแนบ URL)
          └─► ตอบกลับ Telegram พร้อมปุ่มเปิด Mini App
```

---

## 4. Key Operational Rules Subject to Audit
1. **Zero Hallucination Policy:** ระบบถูกสั่งห้ามแต่งตัวเลข ยอดสั่งซื้อ หรือวันที่โดยเด็ดขาด หากเอกสารไม่มีให้ระบุว่า "ไม่พบข้อมูล"
2. **Special Crops Advance Preparation (D-20, D-10, D-5, D-3):** ตรวจสอบเฉพาะ 4 ชนิดพิเศษ (หอมแดง, พริกหวาน, ผักชีใหญ่, มะละกอ)
3. **Yield Verification:** กะหล่ำปลีเข้าโรงงานต้องมีผลสุ่มปอก 100 kg และคำนวณ Yield แท้จริงทุกเที่ยว
4. **AnyDesk Auto-Scale (175% / 100%):** สคริปต์ปรับหน้าจออัตโนมัติเมื่อเกิด Session
5. **Memory Continuity:** กฎและบริบททั้งหมดต้อง Sync ข้ามเครื่องผ่าน GitHub Repository `agymemory`
