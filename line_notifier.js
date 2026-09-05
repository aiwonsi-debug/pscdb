const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_FILE = path.join(__dirname, 'line_config.json');
const OPS_STATUS_FILE = path.join(__dirname, 'team_ops_status.json');
const TUNNEL_URL_FILE = path.join(__dirname, 'public_tunnel_url.txt');

function getOpsWebUrl() {
  return 'https://pscdb.onrender.com/ops';
}

function loadLineConfig() {
  const defaultConfig = {
    enabled: true,
    alert_time: "08:00",
    line_channel_access_token: "",
    line_target_group_id: "",
    last_sent_date: ""
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return Object.assign(defaultConfig, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
    } catch (e) {}
  }
  return defaultConfig;
}

function saveLineConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Send message to LINE via LINE Messaging API (Push to Group or User)
 */
function sendLineMessage(messageText) {
  return new Promise((resolve, reject) => {
    const config = loadLineConfig();
    const token = (config.line_channel_access_token || '').trim();
    const targetId = (config.line_target_group_id || config.line_target_user_id || '').trim();

    if (!token || !targetId) {
      console.log('[LINE] Missing token or target ID. Message:', messageText);
      return resolve({ success: false, reason: 'NO_TOKEN_OR_TARGET', message: messageText });
    }

    const payload = JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text: messageText }]
    });

    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log(`[LINE PUSH] Status: ${res.statusCode}`, body);
        resolve({ success: res.statusCode === 200, statusCode: res.statusCode, response: body });
      });
    });

    req.on('error', (err) => {
      console.error('[LINE Network Error]:', err.message);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Generate D-1 Alert message for LINE with Dynamic Dashboard Sync
 */
function generateD1LineMessage(dateStr) {
  // Read Real-time Dashboard Status
  let opsStatus = {};
  if (fs.existsSync(OPS_STATUS_FILE)) {
    try {
      opsStatus = JSON.parse(fs.readFileSync(OPS_STATUS_FILE, 'utf8'));
    } catch(e) {}
  }

  const cardsState = opsStatus.cards_state || {};
  const card0209 = cardsState['salaya_0209'] || cardsState['0209'] || {};
  const isOrderChecked = card0209.orderChecked === true;
  const isTruckChecked = card0209.truckChecked === true;
  const supplierName = card0209.supplier || 'เฮียหนิง (โกดังฮอด - 3.00 บ.)';
  const truckName = card0209.truck || '6 ล้อ เฮียหนิง (ฮอด 12,000 บ.)';

  // Rule: If both are confirmed, omit the pending checklist section completely!
  let opsSection = '';
  if (isOrderChecked && isTruckChecked) {
    opsSection = `\n✅ สถานะเตรียมงาน: สั่งของ & จองรถเรียบร้อยแล้ว\n • สวน: ${supplierName}\n • ขนส่ง: ${truckName}\n──────────────────`;
  } else {
    let pendingItems = [];
    if (!isOrderChecked) pendingItems.push(' • [ ] คอนเฟิร์มการตัดผักกับสวนล่วงหน้า');
    if (!isTruckChecked) pendingItems.push(' • [ ] โทรจองคิวรถ 6 ล้อล่วงหน้า 1 วัน');
    opsSection = `\n📌 สิ่งที่ทีมงานต้องประสานงานวันนี้ (01/09/69):\n${pendingItems.join('\n')}\n──────────────────`;
  }

  const opsUrl = getOpsWebUrl();

  return `🚨 [เลขา PSC] แจ้งเตือนเตรียมขึ้นของล่วงหน้า 1 วัน
──────────────────
📅 รอบขึ้นของที่สวน: 02/09/2569 (พรุ่งนี้)
🏢 โรงงานปลายทาง: โรงงานศาลายา (ส่งมอบ 03/09/69)
🥬 สินค้า: กะหล่ำปลี 8,000 กก. (8 ตัน)${opsSection}
⚠️ [แจ้งเตือนสต็อกวิกฤต - Action Required วันนี้]
🥕 แครอทสวย (ศาลายา): คงเหลือ 1,620 กก.
 • กำหนดส่งมอบ TNS พรุ่งนี้ (02/09): 1,000 กก.
 • สต็อกจะเหลือเพียง 620 กก. (Runway หมด 02/09/69)
 • 🚨 คำแนะนำเลขา: ประสานงานเปิด PO สั่งแครอทสวยเข้าสต็อกด่วนวันนี้ค่ะ
──────────────────
📦 [สรุปออเดอร์จัดส่งลูกค้าวันพรุ่งนี้ (02/09/69)]
*(อ้างอิง: SEP Order PSC.xlsx)*
 • ลูกค้า TNS:
    - แครอท 1,000 กก.
    - กะหล่ำปลี 700 กก.
    - ขิง 150 กก.
──────────────────
🌐 รายละเอียดและระบบสั่งงาน:
${opsUrl}\n🔑 Team Access Code: 9624`;
}

/**
 * Daily 08:00 AM Cron Checker
 */
function initDailyLineScheduler() {
  console.log('[LINE OA SCHEDULER] Initialized. Monitoring for 08:00 AM daily dispatch...');
  setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const todayStr = now.toISOString().slice(0, 10);

    const config = loadLineConfig();
    if (!config.enabled) return;

    const targetHour = parseInt((config.alert_time || '08:00').split(':')[0]) || 8;
    const targetMin = parseInt((config.alert_time || '08:00').split(':')[1]) || 0;

    if (currentHour === targetHour && currentMin === targetMin && config.last_sent_date !== todayStr) {
      console.log(`[LINE OA SCHEDULER] Firing 08:00 AM Alert for ${todayStr}...`);
      const msg = generateD1LineMessage(todayStr);
      sendLineMessage(msg).then(() => {
        config.last_sent_date = todayStr;
        saveLineConfig(config);
      }).catch(err => console.error('[LINE OA SCHEDULER] Failed to send:', err));
    }
  }, 30000);
}

module.exports = {
  loadLineConfig,
  saveLineConfig,
  sendLineMessage,
  generateD1LineMessage,
  initDailyLineScheduler,
  getOpsWebUrl
};
