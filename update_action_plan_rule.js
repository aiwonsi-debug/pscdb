const fs = require('fs');
const path = require('path');
const memEngine = require('./memory_engine.js');

const mem = memEngine.loadMemory();

// Update business rules with correct action plan
const ruleText = "ขั้นตอนการปฏิบัติงานของการแจ้งเตือนล่วงหน้า 4 พืช (หอมแดง, พริกหวาน, ผักชีใหญ่, มะละกอ) คือ 'เตรียมสั่งวัตถุดิบ' (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบจากแหล่งสวน/ซัพพลายเออร์) สำหรับรอบเตือน D-20, D-10, D-5 และ D-3 ก่อนวันส่งมอบ";

if (!mem.business_rules.includes(ruleText)) {
    mem.business_rules.push(ruleText);
}

// Update memory and markdown
memEngine.saveMemory();
console.log('Action plan rule successfully updated!');
