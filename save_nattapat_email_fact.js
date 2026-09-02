const memEngine = require('./memory_engine.js');

const fact = "อีเมลออเดอร์ล่าสุดของ TNS: ผู้ส่ง Nattapat Phonsorn <nattapat@nisshinthai.com> ส่งถึง คุณสุธาสินี (pscfood@hotmail.com) หัวข้อ 'Order September 2026' พร้อมไฟล์แนบออเดอร์รอบกันยายน 2569";
const rule = "เมื่อตรวจสอบออเดอร์ TNS รอบเดือนกันยายน 2569 ให้อ้างอิงจากอีเมลฉบับ 'Order September 2026' ของคุณ Nattapat Phonsorn (nattapat@nisshinthai.com)";

memEngine.rememberItem(fact, 'learned_facts');
memEngine.rememberItem(rule, 'business_rules');
console.log('Successfully recorded Nattapat email info to memory and GEMINI.md!');
