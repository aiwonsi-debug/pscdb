const memEngine = require('./memory_engine.js');

const mem = memEngine.loadMemory();

// Remove any outdated mock facts
mem.learned_facts = (mem.learned_facts || []).filter(f => !f.includes('15/09') && !f.includes('20/09') && !f.includes('1200') && !f.includes('1500 กก.'));

// Add explicit verification rule
const strictRule = "ในเอกสาร Order PSC.xlsx (2026) ล่าสุด: ยังไม่มีคำสั่งซื้อของ พริกหวาน และ มะละกอ ในเดือนกันยายน 2569 (ยอด 15/09 และ 20/09 เป็นตัวเลขจำลองเดิมที่ถูกยกเลิกแล้ว ห้ามนำมาแสดง) มีเฉพาะ หอมแดง 500 กก. (ส่งมอบ 07/09/2569) เท่านั้นที่ยืนยันจริง";

if (!mem.business_rules.includes(strictRule)) {
    mem.business_rules.push(strictRule);
}

memEngine.saveMemory();
console.log('Purged mock records and locked strict ground truth into memory!');
