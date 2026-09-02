const memEngine = require('./memory_engine.js');

const mem = memEngine.loadMemory();

// Clear any old/obsolete TNS facts
mem.learned_facts = (mem.learned_facts || []).filter(f => !f.includes('19650') && !f.includes('19,650') && !f.includes('31025') && !f.includes('31,025'));

const f1 = "ไฟล์ออเดอร์จริงของ TNS รอบเดือนกันยายน 2569: E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx (ส่งจาก Nattapat Phonsorn <nattapat@nisshinthai.com> หัวข้อ 'Order September 2026')";
const f2 = "ยอดสั่งซื้อรวม TNS เดือน ก.ย. 2569 (Sep-26): หอมแดง 16,900 กก. (24 รอบ), ต้นหอม 9,870 กก. (18 รอบ), ขิง 3,410 กก. (8 รอบ), กะหล่ำปลี 2,300 กก. (3 รอบ: วันที่ 3, 16, 23), ผักชีใหญ่ 1,200 กก. (2 รอบ: วันที่ 7 ส่ง 700 กก., วันที่ 21 ส่ง 500 กก.)";
const f3 = "การแจ้งเตือนเตรียมสั่งวัตถุดิบ TNS (4 พืชพิเศษ): แจ้งเตือน หอมแดง (ทุกรอบ) และ ผักชีใหญ่ (วันที่ 7 ส่ง 700 กก. เตือน D-5 วันที่ 02/09, วันที่ 21 ส่ง 500 กก. เตือน D-5 วันที่ 16/09) ตามขั้นตอน 'เตรียมสั่งวัตถุดิบ'";

memEngine.rememberItem(f1, 'learned_facts');
memEngine.rememberItem(f2, 'learned_facts');
memEngine.rememberItem(f3, 'business_rules');
console.log('Saved verified Sep-26 TNS facts to memory and GEMINI.md!');
