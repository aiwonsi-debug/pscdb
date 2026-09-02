const memEngine = require('./memory_engine.js');

const r1 = "นโยบายป้องกันข้อมูลเท็จ (Zero Hallucination Policy): ห้ามสมมติหรือประมาณการตัวเลข ยอดสั่งซื้อ หรือวันส่งมอบโดยเด็ดขาด ทุกข้อมูลต้องตรวจสอบตรงจากไฟล์ Excel/PDF ที่โหลดจากอีเมลจริงเท่านั้น";
const r2 = "การตอบคำถามเรื่องออเดอร์และกำหนดส่ง: ต้องระบุชื่อไฟล์อ้างอิงและรอบ Rev. ทุกครั้ง หากวันที่หรือสินค้าใดไม่มีในไฟล์ ให้ตอบว่า 'ไม่พบข้อมูลในเอกสารล่าสุด' ห้ามคิดตัวเลขขึ้นเอง";

memEngine.rememberItem(r1, 'business_rules');
memEngine.rememberItem(r2, 'business_rules');
console.log('Anti-Hallucination rules registered successfully!');
