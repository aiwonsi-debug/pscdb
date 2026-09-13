const fs = require('fs');
const file = 'E:/agy/SECRETARY_MEMORY.md';
let content = fs.readFileSync(file, 'utf8');

const regex = /7\. \*\*Special Crops Advance Preparation \(D-20, D-10, D-5, D-3\):\*\* แจ้งเตือนการจัดเตรียมสินค้าล่วงหน้าเฉพาะ 4 ชนิดพิเศษเท่านั้น: หอมแดง, พริกหวานเขียว, ผักชีใหญ่, และ มะละกอ ขั้นตอนคือ 'เตรียมสั่งวัตถุดิบ' \(จัดหา ประสานงาน และสั่งซื้อจากสวน\/ซัพพลายเออร์\)/;

const replacementStr = "7. **Special Crops Advance Preparation (D-20, D-10, D-5, D-3):** แจ้งเตือนการจัดเตรียมสินค้าล่วงหน้าเฉพาะชนิดพิเศษ: พริกหวานเขียว, ผักชีใหญ่, และ มะละกอ ขั้นตอนคือ 'เตรียมสั่งวัตถุดิบ' \n7.1 **หอมแดง (พิเศษ):** ให้แจ้งเตือนสั่งของก่อนขึ้นของ 1 วัน (เทียบเท่า D-2 ก่อนวันส่งมอบ) แทนกำหนดการปกติ";

content = content.replace(regex, replacementStr);
fs.writeFileSync(file, content, 'utf8');
console.log('Replaced MD');
