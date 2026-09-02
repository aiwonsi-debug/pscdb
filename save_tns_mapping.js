const memEngine = require('./memory_engine.js');

const rule1 = "การจับคู่ลูกค้า (Customer Domain Mapping): โดเมน @nisshinthai.com คือ TNS (บจก. ไทยนิชชิน เซฟุน / Thai Nisshin Seifun) ทุกอีเมลจาก @nisshinthai.com ให้ถือเป็นออเดอร์ของลูกค้า TNS โดยอัตโนมัติ";
const rule2 = "ไฟล์แนบจาก @nisshinthai.com หรือ @thainisshin.co.th: ให้จัดเก็บและประมวลผลเข้าโฟลเดอร์ E:\\รวมงาน\\งาน 25-26\\TNS\\ โดยอัตโนมัติ";

memEngine.rememberItem(rule1, 'business_rules');
memEngine.rememberItem(rule2, 'business_rules');
console.log('Saved nisshinthai = TNS mapping to memory and GEMINI.md!');
