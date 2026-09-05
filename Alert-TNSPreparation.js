const fs = require('fs');
const path = require('path');
const https = require('https');
const parser = require('./tns_order_parser.js');

const agyBaseDir = 'E:\\agy';
const configPath = path.join(agyBaseDir, 'secretary_config.json');
const logFile = path.join(agyBaseDir, 'secretary_activity.log');
const notifiedFile = path.join(agyBaseDir, 'notified_tns_alerts.json');

// Load configurations
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.error('Error reading config:', e.message);
  }
}

const botToken = config.BotToken || '8259461159:AAEiB3pZpGv1z1aY_r0Z8u-mH2-X4f4P0s';
const chatId = config.ChatId || '1532466397';

let notified = {};
if (fs.existsSync(notifiedFile)) {
  try {
    notified = JSON.parse(fs.readFileSync(notifiedFile, 'utf8'));
  } catch (e) {
    notified = {};
  }
}

function sendTGMessage(token, chat, text) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      chat_id: chat,
      text: text,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(resData);
          resolve(json.ok);
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('TG Send Error:', err.message);
      resolve(false);
    });

    req.write(data, 'utf8');
    req.end();
  });
}

const lineNotifier = require('./line_notifier.js');

async function runTNSAlerts() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayStr = today.toISOString().split('T')[0];
  
  // Alert Stages: D-20, D-10, D-5, D-3, D-2, D-1
  const targetStages = [20, 10, 5, 3, 2, 1];
  const specialCrops = ['หอมแดง', 'พริกหวาน', 'ผักชีใหญ่', 'มะละกอ'];

  console.log('=== TNS SPECIAL CROPS ALERT ENGINE (SEP ORDER PSC PARSER) ===');
  console.log('Current Date:', todayStr);
  console.log('Special Crops (4 ชนิด): หอมแดง, พริกหวาน, ผักชีใหญ่, มะละกอ');
  console.log('Alert Stages: D-20, D-10, D-5, D-3, D-2, D-1 | Action: "เตรียมสั่งวัตถุดิบ"');

  // Load Real Data dynamically from SEP Order PSC.xlsx
  const tnsFile = parser.findLatestTNSFile();
  if (!tnsFile) {
    console.error('TNS Order file not found in workspace.');
    return;
  }
  console.log('Reading Live TNS File:', tnsFile);
  const rawOrders = parser.extractTNSOrders(tnsFile, '2026');
  console.log(`Total live records parsed from Excel (2026): ${rawOrders.length}`);

  // Filter for the 4 Special Crops
  const tnsOrders = rawOrders.filter(o => specialCrops.includes(o.product));
  console.log(`Matching records for 4 special crops: ${tnsOrders.length}`);

  let triggeredCount = 0;

  for (const ord of tnsOrders) {
    const dDate = new Date(ord.date + 'T00:00:00Z');
    const diffTime = dDate.getTime() - today.getTime();
    const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (targetStages.includes(daysLeft)) {
      triggeredCount++;
      const eventKey = `TNS_${ord.product}_${ord.date}_D-${daysLeft}`;

      // Anti-Spam: Check if already notified for this eventKey today
      if (notified[eventKey]) {
        console.log(`[Anti-Spam Blocked] ${eventKey} was ALREADY sent on ${notified[eventKey]}. Skipping.`);
        continue;
      }

      const formattedDelivery = ord.date.split('-').reverse().join('/');
      const isUrgent = daysLeft <= 2;
      const stageHeader = isUrgent ? `🚨 [แจ้งเตือนสั่งวัตถุดิบด่วน - TNS]` : `🔔 [แจ้งเตือนจัดเตรียมวัตถุดิบ - TNS]`;
      const actionText = (ord.product === 'หอมแดง' && isUrgent)
        ? `• <b>สั่งหอมแดงด่วน:</b> ประสานงานสวน/ผู้จัดส่ง สั่งซื้อหอมแดงทันทีเพื่อเตรียมส่งมอบตามกำหนด`
        : `• <b>เตรียมสั่งวัตถุดิบ</b> (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบจากแหล่งสวน/ซัพพลายเออร์)`;

      const opsWebUrl = lineNotifier.getOpsWebUrl ? lineNotifier.getOpsWebUrl() : 'https://pscdb.onrender.com/ops';

      const messageTG = `${stageHeader}
กำหนดแจ้งเตือน: ล่วงหน้า ${daysLeft} วัน (D-${daysLeft})

🏢 <b>ลูกค้า:</b> TNS (Thai Nisshin Seifun)
📦 <b>รายการสินค้า:</b> ${ord.product} <b>${ord.qty.toLocaleString()} ${ord.unit}</b>
📅 <b>กำหนดส่งมอบ:</b> ${formattedDelivery} (อีก ${daysLeft} วัน)
📁 <b>ข้อมูลอ้างอิง:</b> ${ord.sheet || 'SEP Order PSC.xlsx'}

🎯 <b>ขั้นตอนปฏิบัติงาน:</b>
${actionText}
────────────────────
🌐 <b>ระบบสั่งงานและติดตาม:</b>
<a href="${opsWebUrl}">${opsWebUrl}</a>
────────────────────
✨ <i>ระบบแจ้งเตือนอัตโนมัติ บจก.ไพศาลเจริญ (1988)</i>`;

      const plainActionText = (ord.product === 'หอมแดง' && isUrgent)
        ? `• สั่งหอมแดงด่วน: ประสานงานสวน/ผู้จัดส่ง สั่งซื้อหอมแดงทันทีเพื่อเตรียมส่งมอบตามกำหนด`
        : `• เตรียมสั่งวัตถุดิบ (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบจากแหล่งสวน/ซัพพลายเออร์)`;

      const messageLINE = `${stageHeader}
กำหนดแจ้งเตือน: ล่วงหน้า ${daysLeft} วัน (D-${daysLeft})
──────────────────
🏢 ลูกค้า: TNS (Thai Nisshin Seifun)
📦 รายการสินค้า: ${ord.product} ${ord.qty.toLocaleString()} ${ord.unit}
📅 กำหนดส่งมอบ: ${formattedDelivery} (อีก ${daysLeft} วัน)
📁 ข้อมูลอ้างอิง: ${ord.sheet || 'SEP Order PSC.xlsx'}

🎯 ขั้นตอนปฏิบัติงาน:
${plainActionText}
──────────────────
🌐 เข้าใช้งานระบบเว็บ / ติดตามงาน:
${opsWebUrl}
🔑 Team Access Code: 9624 (กรอกครั้งเดียว จำเซสชัน 30 วัน)
──────────────────
✨ ระบบแจ้งเตือนอัตโนมัติ บจก.ไพศาลเจริญ (1988)`;

      console.log('\n----------------------------------------');
      console.log(messageTG);

      // Send to Telegram
      const sentTG = await sendTGMessage(botToken, chatId, messageTG);
      
      // Send to LINE Group
      let sentLINE = false;
      try {
        const lineRes = await lineNotifier.sendLineMessage(messageLINE);
        sentLINE = lineRes && lineRes.success;
      } catch (err) {
        console.error('LINE Send Error:', err.message);
      }

      if (sentTG || sentLINE) {
        notified[eventKey] = todayStr;
        console.log(`✅ Alert sent successfully for ${eventKey} (TG: ${sentTG}, LINE: ${sentLINE})`);
      }
    }
  }

  // Save notified cache
  fs.writeFileSync(notifiedFile, JSON.stringify(notified, null, 2));
  console.log(`\nScan completed. Active live alerts processed: ${triggeredCount}`);
}

runTNSAlerts().catch(console.error);
