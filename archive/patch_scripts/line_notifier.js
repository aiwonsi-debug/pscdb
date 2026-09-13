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
  let opsStatus = {};
  if (fs.existsSync(OPS_STATUS_FILE)) {
    try {
      opsStatus = JSON.parse(fs.readFileSync(OPS_STATUS_FILE, 'utf8'));
    } catch(e) {}
  }

  const stockFile = path.join(__dirname, 'stock_inventory.json');
  let stock = { Items: {} };
  if (fs.existsSync(stockFile)) {
    try {
      stock = JSON.parse(fs.readFileSync(stockFile, 'utf8'));
    } catch (e) {}
  }

  // Find nearest upcoming cabbage operation
  const activeOps = opsStatus.active_operations || [];
  const cabOp = activeOps.find(o => o.product && o.product.includes('กะหล่ำ') && o.status !== 'ขึ้นของและส่งมอบเรียบร้อย') || activeOps[0] || {
    delivery_date: '2026-09-14',
    product: 'กะหล่ำปลี',
    qty_kg: 8500,
    farm: 'เฮียหนิง (โกดังฮอด - 3.00 บ.)',
    truck: '6 ล้อ 1 คัน',
    notes: 'เตรียมขึ้นของล่วงหน้า เข้าโรงงานศาลายา'
  };

  const cabStock = stock.Items && stock.Items.Cabbage ? Number(stock.Items.Cabbage.StockKg).toLocaleString() : '9,650';
  const carrotStock = stock.Items && stock.Items.Carrot ? Number(stock.Items.Carrot.StockKg).toLocaleString() : '6,560';
  const aftStock = stock.Items && stock.Items.Onion_AFT ? Number(stock.Items.Onion_AFT.StockKg).toLocaleString() : '44,160';
  const cnStock = stock.Items && stock.Items.Onion_Chinese ? Number(stock.Items.Onion_Chinese.StockKg).toLocaleString() : '5,440';

  const opsUrl = getOpsWebUrl();

  return `🚨 [เลขา PSC] แจ้งเตือนเตรียมขึ้นของล่วงหน้า
──────────────────
📅 รอบขึ้นของที่สวน: พรุ่งนี้
🏢 โรงงานปลายทาง: ${cabOp.customer || 'โรงงานศาลายา'} (ส่งมอบ ${cabOp.delivery_date ? cabOp.delivery_date.split('-').reverse().join('/') : '14/09/69'})
🥬 สินค้า: ${cabOp.product || 'กะหล่ำปลี'} ${Number(cabOp.qty_kg || 8500).toLocaleString()} กก.
 • สวน: ${cabOp.farm || 'เฮียหนิง (โกดังฮอด)'}
 • ขนส่ง: ${cabOp.truck || '6 ล้อ 1 คัน'}
 • สถานะ: ${cabOp.status || 'รอดำเนินการ'}
──────────────────
📊 [สต็อกคงเหลือล่าสุด (${stock.AsOfDate || '12/09/69'})]
 • กะหล่ำปลี: ${cabStock} กก.
 • แครอทสวย: ${carrotStock} กก.
 • หอม AFT: ${aftStock} กก.
 • หอมจีน: ${cnStock} กก.
──────────────────
🌐 ตรวจสอบและบันทึกงาน:
${opsUrl}
🔑 Team Access Code: 9624`;
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
