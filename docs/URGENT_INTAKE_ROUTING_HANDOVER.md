# PSCDB — Urgent LINE Intake Routing Handover

**วันที่:** 18 กันยายน 2026  
**สถานะ:** ลบเส้นทาง Desktop/tunnel เดิมแล้ว — LINE Webhook ใช้ Apps Script เป็นเส้นทางเดียว

## ปัญหาที่พบ

ข้อความรายงานรับเข้า เช่น `รับกะหล่ำปลี`, `สุ่มปอก`, และ `ปอกได้` ถูกตอบกลับเป็นงานขึ้นของ:

```text
✅ [บันทึกงานขึ้นของ PSC เรียบร้อย]
```

สาเหตุเดิมคือ LINE Webhook บน Render ส่งข้อความบางประเภทไปยัง Desktop bot process รุ่นเก่า ซึ่งยังใช้เส้นทาง loading/dispatch เดิม

## การแก้ไขล่าสุด

ระบบถูกแก้ให้ Render ส่ง LINE event ทุกประเภทเข้า Google Apps Script โดยตรง โดยไม่มี Desktop bot หรือ tunnel เป็นทางเลือกสำรองอีกต่อไป การจำแนกรายงานรับเข้ายังคงใช้คำสำคัญต่อไปนี้:

- `รับกะหล่ำ`
- `รับหอม`
- `รับพริก`
- `สุ่มปอก`
- `ปอกได้`

เมื่อพบข้อความดังกล่าว Apps Script จะตั้ง `reportType` เป็น `intake` และเขียนไปยังแท็บรับเข้า โดย **ไม่มีการ forward ไปยัง Desktop bot** ระบบข้อความประเภทอื่นก็ส่งเข้า Apps Script โดยตรงเช่นกัน

Apps Script เวอร์ชันที่ใช้งานจริงคือ **version 35** โดย routing จะเลือกแท็บตามลำดับดังนี้:

1. `Dispatch & Intake Log`
2. `Dispatch & Intake`
3. `LINE Intake Inbox`

สำหรับข้อความรับเข้า ระบบจะไม่สร้างแถวใน `Next Schedule & Other Tasks`

## Commit ล่าสุด

```text
85c2a4b Handle LINE intake reports directly on Render
```

Commit ก่อนหน้าที่เกี่ยวข้อง:

```text
c2a1c7b Route LINE receiving reports to intake workflow
3f01cc2 Align intake routing with live sheet tab
```

## ข้อความทดสอบ

ส่งข้อความนี้เข้า LINE bot:

```text
18/9/26   รับกะหล่ำปลีเฮียหนิง
จำนวน  7,425 กก. (18 เลท  9 ตะกร้า)

ขนาดกลาง-ใหญ่
สภาพโดยรวมสวย

สุ่มปอก 100  กก.
ปอกได้  74.93  กก.
```

## ผลลัพธ์ที่ถูกต้อง

LINE ต้องตอบกลับในแนวทางนี้:

```text
✅ [บันทึกรับเข้า/รับของ PSC เรียบร้อย]
🥬 สินค้า: กะหล่ำปลี
⚖️ จำนวน: 7,425 กก.
📈 Yield: 74.93%
🏡 ผู้จำหน่าย: เฮียหนิง
```

ใน Google Sheets ต้องตรวจสอบว่า:

| ตรวจสอบ | ผลลัพธ์ที่ถูกต้อง |
|---|---|
| แท็บ `Dispatch & Intake Log` | มีแถวใหม่ของกะหล่ำปลี 7,425 กก. |
| `Next Schedule & Other Tasks` | ไม่มีแถวใหม่จากข้อความนี้ |
| Sample weight | 100 กก. |
| Peeled weight | 74.93 กก. |
| Yield | 74.93% |
| Supplier | เฮียหนิง |
| Report type | `intake` |

## ตรวจสถานะบริการ

```bash
curl -sS https://pscdb.onrender.com/api/health
```

ผลลัพธ์ที่คาดหวัง:

```json
{
  "status": "ONLINE",
  "gasSynced": true
}
```

ตรวจ live WDB:

```bash
curl -sS https://pscdb.onrender.com/api/live-sheets
```

ควรพบ `ok: true` และ `demandSource: "Customer PO daily breakdowns"`

## หากข้อความยังตอบเป็นงานขึ้นของ

1. รอให้ Render deploy commit `c8fda3e` เสร็จสมบูรณ์
2. อย่าส่งข้อความซ้ำหลายครั้งทันที เพราะอาจเกิดรายการซ้ำ
3. ตรวจ Render service health ให้เป็น `ONLINE`
4. ส่งข้อความทดสอบอีกครั้ง
5. ตรวจแท็บ `Dispatch & Intake Log` และ `Next Schedule & Other Tasks`

## ไฟล์สำคัญ

- `render-dashboard/server.js` — เส้นทาง LINE production เดียว ส่งเข้า Apps Script
- `bot.js` — parser เดิมสำหรับงานภายในที่ไม่ถูกเรียกจาก LINE Webhook production แล้ว
- `webhook_server.js` — เส้นทาง webhook หลัก ส่งเข้า Apps Script โดยตรง
- `integrations/google-apps-script/psc_wdb_web_app.gs` — เขียนข้อมูลเข้าแท็บ WDB
- `docs/HANDOVER_DOCUMENTATION.md` — เอกสารระบบฉบับเต็ม

> **ข้อควรระวัง:** ห้ามสร้างข้อมูลทดสอบด้วยการเพิ่มแถวใน Google Sheets โดยตรง เพราะจะทำให้แยกไม่ออกว่า routing จาก LINE ทำงานจริงหรือไม่
