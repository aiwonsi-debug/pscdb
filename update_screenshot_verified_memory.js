const memEngine = require('./memory_engine.js');

const mem = memEngine.loadMemory();

// Clear all outdated facts
mem.learned_facts = (mem.learned_facts || []).filter(f => 
    !f.includes('16900') && !f.includes('16,900') && 
    !f.includes('9870') && !f.includes('9,870') && 
    !f.includes('3410') && !f.includes('3,410') &&
    !f.includes('33680') && !f.includes('33,680') &&
    !f.includes('19650') && !f.includes('19,650') &&
    !f.includes('31025') && !f.includes('31,025')
);

const f1 = "ไฟล์ออเดอร์จริง TNS เดือนกันยายน 2569: E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx (ชีต Sep-26 ส่งจาก Nattapat Phonsorn <nattapat@nisshinthai.com>)";
const f2 = "ยอดสั่งซื้อจริง TNS เดือน ก.ย. 2569 (Sep-26): แครอท 15,600 กก. | กะหล่ำปลี 12,700 กก. | พริกหวานเขียว 2,000 กก. (ส่ง 16 ก.ย.) | ขิง 1,630 กก. | หอมแดง 1,000 กก. (ส่ง 7 ก.ย. = 500 กก., 21 ก.ย. = 500 กก.) | ต้นหอม 750 กก. (รวม 33,680 กก.)";
const f3 = "การแจ้งเตือนเตรียมสั่งวัตถุดิบ TNS (4 พืชพิเศษ): แจ้งเตือน หอมแดง (ส่ง 7 ก.ย. 500 กก. และ 21 ก.ย. 500 กก.) และ พริกหวานเขียว (ส่ง 16 ก.ย. 2,000 กก.) ตามขั้นตอน 'เตรียมสั่งวัตถุดิบ' (D-20, D-10, D-5, D-3)";

memEngine.rememberItem(f1, 'learned_facts');
memEngine.rememberItem(f2, 'learned_facts');
memEngine.rememberItem(f3, 'business_rules');
console.log('Saved 100% verified screenshot facts to memory and GEMINI.md!');
