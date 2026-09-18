# PSCDB Team Handover — LINE รับของ / Intake Routing

**วันที่:** 19 กันยายน 2026  
**Repository:** `aiwonsi-debug/pscdb`  
**Production:** `https://pscdb.onrender.com`  
**Apps Script project:** `PSC WDB`  
**Farm Operations spreadsheet:** `1_Farm_Ops_Transport_and_Intake`  
**Target intake tab:** `Dispatch & Intake Log`  

## 1. เป้าหมายที่ทีมใหม่ต้องทำให้เสร็จ

เมื่อผู้ใช้ส่งข้อความลักษณะนี้จาก LINE:

```text
18/9/26 รับกะหล่ำปลีเฮียหนิง
จำนวน 7,425 กก. (18 เลท 9 ตะกร้า)
ขนาดกลาง-ใหญ่
สภาพโดยรวมสวย
สุ่มปอก 100 กก.
ปอกได้ 74.93 กก.
```

ระบบต้องตอบกลับว่าเป็น **รับของ/รับเข้า** ไม่ใช่ **งานขึ้นของ/Dispatch** และต้องเขียนข้อมูลลงแท็บ `Dispatch & Intake Log` ใน spreadsheet `1_Farm_Ops_Transport_and_Intake` โดยไม่สร้างแถวใหม่ใน `Next Schedule` หรือบันทึกซ้ำเป็นงานขึ้นของ

คำตอบ LINE ที่ถูกต้องควรมีรูปแบบอย่างน้อย:

```text
✅ [บันทึกรับเข้า/รับของ PSC เรียบร้อย]
🥬 สินค้า: กะหล่ำปลี
⚖️ จำนวน: 7,425 กก.
📈 Yield: 74.93%
🏡 ผู้จำหน่าย: เฮียหนิง
```

## 2. สถานะที่ทำแล้ว

### Production routing

ลบเส้นทาง Desktop/tunnel เดิมออกจาก production แล้ว โดย commit สำคัญคือ:

```text
c8fda3e Remove legacy Desktop LINE forwarding routes
```

ปัจจุบัน `render-dashboard/server.js` และ `webhook_server.js` ไม่มีการ forward ไป Desktop bot, tunnel หรือ `bot.handleCommand()` จาก LINE production webhook แล้ว เส้นทางหลักคือ:

```text
LINE Webhook → Render → Google Apps Script Web App → Google Sheets
```

Render health ล่าสุดตอบกลับ `ONLINE` และ `gasSynced: true`

### Render direct reply attempt

มีการเพิ่ม helper `replyReceivingEventDirectly()` ใน `render-dashboard/server.js` และ commit แล้ว:

```text
348ff53 Reply receiving reports directly from Render
```

การตอบตรงนี้จะทำงานได้ก็ต่อเมื่อ Render มี environment variable:

```text
LINE_CHANNEL_ACCESS_TOKEN
```

ต้องตรวจสอบว่า Render มีตัวแปรนี้จริงหรือไม่ หากไม่มี ให้ใช้ LINE reply ที่ Apps Script เป็นหลัก หรือเพิ่ม secret ผ่าน Render อย่างปลอดภัย ห้ามใส่ token ลง repository

### Apps Script classifier

ใน Apps Script มี branch สำคัญ:

```javascript
const parsed = interpretWithGemini(rawText);
const receivingText = /(?:รับกะหล่ำ|รับหอม|รับพริก|สุ่มปอก|ปอกได้)/i.test(rawText);
if (parsed && receivingText) parsed.reportType = 'intake';
```

ปัญหาคือข้อความจริงมีคำต่อท้าย supplier เช่น `รับกะหล่ำปลีเฮียหนิง` และระบบเคยตอบกลับเป็น `[บันทึกงานขึ้นของ PSC เรียบร้อย]` แสดงว่า deployment ที่ LINE ใช้อยู่ยังไม่ได้ใช้ classifier ที่แก้สมบูรณ์ หรือการจำแนก/การเขียน Farm Ops ยังไม่สอดคล้องกัน

## 3. โครงสร้างแท็บปลายทางที่ต้องเติม

จาก live spreadsheet แถว header ของ `Dispatch & Intake Log` คือ:

| ลำดับ | คอลัมน์ |
|---:|---|
| 1 | ลำดับ |
| 2 | วันขึ้นของ (Dispatch) |
| 3 | วันรับเข้า (Intake) |
| 4 | ผู้จำหน่าย (Seller/Supplier) |
| 5 | แหล่งขึ้นสินค้า (Origin) |
| 6 | ชนิดสินค้า (Item) |
| 7 | ผู้ให้บริการขนส่ง (Transporter) |
| 8 | ประเภทรถ / ทะเบียน |
| 9 | นน. ขึ้นต้นทาง (Gross Kg) |
| 10 | นน. รับเข้าจริง (Net Kg) |
| 11 | น้ำหนักหาย (Loss Kg / %) |
| 12 | ราคาซื้อ (บ./กก.) |
| 13 | ยอดค่าสินค้า (บาท) |
| 14 | ค่ารถขนส่ง (บาท) |
| 15 | เงื่อนไขชำระเงิน |
| 16 | ผลสุ่มปอก (Yield %) |
| 17 | คุณภาพ / หมายเหตุ |
| 18 | สถานะงาน |

สำหรับรายงานรับเข้าที่ไม่มีข้อมูลขนส่งหรือราคาซื้อ ให้เว้นช่องที่ไม่มีข้อมูล ไม่ควรเดาตัวเลขหรือใช้ hard-code

ตัวอย่าง mapping จากข้อความรับเข้า:

| คอลัมน์ | ค่า |
|---|---|
| ลำดับ | สร้างจากลำดับถัดไป หรือ ID ที่ระบบรองรับ |
| วันขึ้นของ | เว้นว่างถ้าไม่มีข้อมูลจริง |
| วันรับเข้า | `2026-09-18` |
| ผู้จำหน่าย | `เฮียหนิง` |
| แหล่งขึ้นสินค้า | เว้นว่างถ้าไม่มีในข้อความ |
| ชนิดสินค้า | `กะหล่ำปลี` |
| ผู้ให้บริการขนส่ง | เว้นว่างถ้าไม่มีในข้อความ |
| ประเภทรถ / ทะเบียน | เว้นว่างถ้าไม่มีในข้อความ |
| Gross Kg | เว้นว่างถ้าไม่มีข้อมูลต้นทาง |
| Net Kg | `7425` |
| Loss Kg / % | เว้นว่างถ้าไม่มี Gross |
| ราคาซื้อ | เว้นว่างถ้าไม่มีข้อมูลจริง |
| ยอดค่าสินค้า | เว้นว่างถ้าไม่มีข้อมูลจริง |
| ค่ารถ | เว้นว่างถ้าไม่มีข้อมูลจริง |
| เงื่อนไขชำระเงิน | เว้นว่างถ้าไม่มีข้อมูลจริง |
| Yield | `74.93%` หรือคำนวณจาก `74.93 / 100 × 100` |
| คุณภาพ / หมายเหตุ | `ขนาดกลาง-ใหญ่; สภาพโดยรวมสวย; สุ่มปอก 100 กก.; ปอกได้ 74.93 กก.` |
| สถานะงาน | `รับเข้าเรียบร้อย` |

## 4. จุดที่ต้องตรวจทันที

1. เปิด Apps Script project `PSC WDB` และตรวจบรรทัด `receivingText` ใน editor ให้เป็นบรรทัด JavaScript ที่สมบูรณ์เพียงบรรทัดเดียว ห้ามมีการตัดบรรทัดกลาง expression:

   ```javascript
   const receivingText = /(?:รับ\s*(?:เข้า|ของ|กะหล่ำ|หอม|พริก)|สุ่ม\s*ปอก|ปอก\s*ได้)/i.test(rawText);
   ```

2. กด Save แล้วตรวจ syntax ใน Apps Script ก่อน Deploy หาก editor แสดง error ให้แก้ก่อน ห้าม Deploy source ที่มี expression ขาดหรือมี `test(rawText);` แยกเป็น statement ผิดตำแหน่ง

3. เปิด **Deploy → Manage deployments** และ update deployment ที่ LINE ใช้อยู่ให้ชี้ไปยัง version ล่าสุด ไม่ใช่เพียง Save project

4. ตรวจว่า `appendFarmOpsTask_()` ไม่ได้รับ row แบบ schedule 9 คอลัมน์สำหรับ intake หากแท็บปลายทางเป็น 18 คอลัมน์ ต้องส่ง intake row ให้ครบ 18 ช่องตาม schema ด้านบน

5. ตรวจ branch intake ใน `handleLineDirectEvent_()` ต้องทำทั้งสองอย่าง:
   - `appendReportRow_()` สำหรับ `LINE Reports`
   - `appendFarmOpsTask_()` หรือ writer ที่เทียบเท่า โดยส่งข้อมูลไป `Dispatch & Intake Log`

6. ข้อความตอบกลับของ intake ต้องเริ่มด้วย:

   ```text
   ✅ [บันทึกรับเข้า/รับของ PSC เรียบร้อย]
   ```

   และห้ามเริ่มด้วย:

   ```text
   ✅ [บันทึกงานขึ้นของ PSC เรียบร้อย]
   ```

## 5. การทดสอบหลัง Deploy

ใช้ข้อความทดสอบใหม่ที่มี `message.id` ใหม่เสมอ เพื่อไม่ให้ duplicate guard ข้ามรายการ:

```text
19/9/26 รับกะหล่ำปลีเฮียหนิง
จำนวน 7,425 กก. (18 เลท 9 ตะกร้า)
ขนาดกลาง-ใหญ่
สภาพโดยรวมสวย
สุ่มปอก 100 กก.
ปอกได้ 74.93 กก.
```

ตรวจครบ 4 จุด:

1. LINE ตอบเป็น `รับเข้า/รับของ`
2. ไม่มีข้อความตอบเป็น `บันทึกงานขึ้นของ`
3. spreadsheet มีแถวใหม่ใน `Dispatch & Intake Log`
4. ไม่มีแถวใหม่จากข้อความเดียวกันใน `Next Schedule & Other Tasks`

จากนั้นตรวจ dashboard endpoint:

```bash
curl -sS -L https://pscdb.onrender.com/api/live-sheets
curl -sS -L https://pscdb.onrender.com/api/team-status?force=1
```

## 6. Commit ล่าสุดใน repository

```text
348ff53 Reply receiving reports directly from Render
c8342c6 Document single direct LINE Apps Script route
c8fda3e Remove legacy Desktop LINE forwarding routes
5b610a3 Broaden Thai receiving report detection
571c488 fix: route intake messages directly to GAS, bypass Desktop bot forward
```

ไฟล์หลัก:

- `render-dashboard/server.js`
- `webhook_server.js`
- `bot.js`
- `integrations/google-apps-script/psc_wdb_web_app.gs`
- `docs/URGENT_INTAKE_ROUTING_HANDOVER.md`
- `docs/HANDOVER_DOCUMENTATION.md`

## 7. ข้อควรระวัง

ห้ามลบข้อมูลเดิมใน `Dispatch & Intake Log` หรือ `Next Schedule` เพื่อแก้ปัญหานี้ และห้ามส่งข้อความทดสอบซ้ำด้วย `message.id` เดิม เพราะ Apps Script มี duplicate protection

ห้ามใส่ LINE token, Gemini key, cookie หรือ secret ลง GitHub

ก่อนจบงาน ทีมใหม่ต้องยืนยัน version ของ Apps Script deployment ที่ใช้งานจริง พร้อมแนบผลทดสอบ LINE และแถวจริงใน `Dispatch & Intake Log`
