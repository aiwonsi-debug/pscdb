const fs = require('fs');
const path = require('path');
const groundTruth = require('./groundTruthData');
const { sendMessage } = require('./telegramService');

const lockFilePath = path.join(__dirname, '../data_locks.json');

function getLocks() {
  if (fs.existsSync(lockFilePath)) {
    try { return JSON.parse(fs.readFileSync(lockFilePath, 'utf8')); } catch (e) {}
  }
  return {};
}

function saveLocks(locks) {
  fs.writeFileSync(lockFilePath, JSON.stringify(locks, null, 2), 'utf8');
}

async function runScheduledAlerts(currentDateStr = '2026-08-31') {
  const today = new Date(currentDateStr + 'T00:00:00Z');
  const locks = getLocks();
  let sentCount = 0;

  console.log(`[Alert-Engine] Running check for date: ${currentDateStr}`);

  // --- 1. TNS 4 Special Crops Alert (D-20, D-10, D-5, D-3) ---
  const specialCrops = ['หอมแดง', 'พริกหวานเขียว', 'พริกหวาน', 'ผักชีใหญ่', 'มะละกอ'];
  const tnsStages = [20, 10, 5, 3];

  for (const ord of groundTruth.TNS.orders) {
    const dDate = new Date(ord.date + 'T00:00:00Z');
    const daysLeft = Math.round((dDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let isTarget = tnsStages.includes(daysLeft);
    let isShallotSpecial = (daysLeft === 2); // 1 day before loading (D-2 before delivery)

    if (isTarget || isShallotSpecial) {
      for (const item of ord.items) {
        if (specialCrops.includes(item.name)) {
          // Rule: Shallots alert ONLY at D-2
          if (item.name === 'หอมแดง' && daysLeft !== 2) continue;
          if (item.name !== 'หอมแดง' && daysLeft === 2) continue;
          const lockKey = `TNS_${item.name}_${ord.date}_D-${daysLeft}_${currentDateStr}`;
          if (!locks[lockKey]) {
            const formattedDate = ord.date.split('-').reverse().join('/');
            const msg = `🔔 [แจ้งเตือนจัดเตรียมสินค้า - TNS]
กำหนดแจ้งเตือน: ล่วงหน้า ${daysLeft} วัน (D-${daysLeft})

🏢 ลูกค้า: TNS (Thai Nisshin)
📦 รายการสินค้า: ${item.name} ${item.qty.toLocaleString()} ${item.unit}
📅 กำหนดส่งมอบ: ${formattedDate} (อีก ${daysLeft} วัน)
📄 ไฟล์อ้างอิง: ${groundTruth.TNS.fileRef}

🎯 ขั้นตอนปฏิบัติงาน:
• ${item.name === 'หอมแดง' ? '🚨 แจ้งเตือนสั่งหอมแดง (สั่งของก่อนวันขึ้นของ 1 วัน)' : 'เตรียมสั่งวัตถุดิบ (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบ)'}
────────────────────
✨ ระบบคลาวด์เลขาอัตโนมัติ PSC`;

            console.log(`[Trigger-TNS] ${lockKey}`);
            const sent = await sendMessage(msg);
            if (sent) {
              locks[lockKey] = new Date().toISOString();
              sentCount++;
            }
          } else {
            console.log(`[Lock-Active] ${lockKey} already sent today.`);
          }
        }
      }
    }
  }

  // --- 2. AFT GT Alert (D-1 at 12:00 PM with Sunday->Saturday Shift) ---
  for (const ord of groundTruth.AFT.orders) {
    const dDate = new Date(ord.date + 'T00:00:00Z');
    const daysLeft = Math.round((dDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // D-1 trigger
    if (daysLeft === 1) {
      const lockKey = `AFT_GT_${ord.date}_D-1_${currentDateStr}`;
      if (!locks[lockKey]) {
        const formattedDate = ord.date.split('-').reverse().join('/');
        const sampleDate = new Date(dDate.getTime() - (2 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0].split('-').reverse().join('/');
        const itemsList = ord.items.map(it => `${it.name} ${it.qty.toLocaleString()} ${it.unit}`).join(', ');

        const msg = `[แจ้งเตือนจัดทำ GT และส่งเอกสาร - AFT]
กำหนดแจ้งเตือน: ล่วงหน้า 1 วัน เวลา 12:00 น. (เที่ยงวัน)

🏢 ลูกค้า: AFT (Ajinomoto)
📅 วันที่ส่งมอบสินค้า: ${formattedDate} (อีก 1 วัน)
🧪 วันที่สุ่มตัวอย่าง/ตรวจ GT: ${sampleDate}
📄 ไฟล์อ้างอิง: ${groundTruth.AFT.fileRef}

📦 รายการสินค้า:
• ${itemsList}

กรุณาตรวจสอบเอกสาร GT และเตรียมความพร้อมส่งมอบ
────────────────────
✨ ระบบคลาวด์เลขาอัตโนมัติ PSC`;

        console.log(`[Trigger-AFT] ${lockKey}`);
        const sent = await sendMessage(msg);
        if (sent) {
          locks[lockKey] = new Date().toISOString();
          sentCount++;
        }
      } else {
        console.log(`[Lock-Active] ${lockKey} already sent today.`);
      }
    }
  }

  saveLocks(locks);
  return sentCount;
}

module.exports = { runScheduledAlerts };
