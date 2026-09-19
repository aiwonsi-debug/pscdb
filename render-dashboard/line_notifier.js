const fs = require('fs');
const path = require('path');
const https = require('https');
const secretsLoader = require('./secrets_loader');

const CONFIG_FILE = secretsLoader.getSecretPath('line_config.json', __dirname);
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
  return Object.assign(defaultConfig, secretsLoader.readSecretJson('line_config.json', __dirname));
}

function saveLineConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Send message to LINE via LINE Messaging API (Push to Group or User)
 * @param {string} messageText
 * @param {string} [targetOverride] optional userId/groupId to send to instead of the configured default
 */
function sendLineMessage(messageText, targetOverride) {
  return new Promise((resolve, reject) => {
    const config = loadLineConfig();
    const token = (config.line_channel_access_token || '').trim();
    let targetId = (targetOverride || config.line_target_group_id || config.line_target_user_id || '').trim();

    if (!token || !targetId) {
      console.log('[LINE] Missing token or target ID. Message:', messageText);
      return resolve({ success: false, reason: 'NO_TOKEN_OR_TARGET', message: messageText });
    }

    // STRICT POLICY: Group notifications must ONLY be:
    // 1. "📋 [สรุปงานค้าง & กำหนดส่งมอบประจำวัน]" at 08:00 AM daily
    // 2. Short acknowledgements to user reports ("รับทราบรายการ...")
    // All other spontaneous alerts/details are blocked from group and sent privately to admin user.
    const isGroupTarget = targetId.startsWith('C') || targetId === config.line_target_group_id;
    const isDailySummary = typeof messageText === 'string' && (messageText.includes('[สรุปงาน PSC') || messageText.includes('[สรุปงานค้าง & กำหนดส่งมอบประจำวัน]'));
    const isShortAck = typeof messageText === 'string' && messageText.startsWith('รับทราบรายการวันที่');

    if (isGroupTarget && !isDailySummary && !isShortAck) {
      console.log(`[LINE Group Policy] Blocked non-summary notification to group (${targetId}). Message: ${messageText.slice(0, 50).replace(/\n/g, ' ')}...`);
      if (config.line_target_user_id && targetId !== config.line_target_user_id) {
        console.log(`[LINE Group Policy] Redirected notification to private user (${config.line_target_user_id}).`);
        targetId = config.line_target_user_id;
      } else {
        return resolve({ success: true, skipped: true, reason: 'GROUP_ONLY_ACCEPTS_DAILY_SUMMARY' });
      }
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
        if (res.statusCode !== 200 && !targetOverride && config.line_target_user_id && targetId !== config.line_target_user_id) {
          console.log('[LINE PUSH] Retrying push to target user fallback...');
          sendLineMessage(messageText, config.line_target_user_id).then(resolve).catch(reject);
          return;
        }
        resolve({ success: res.statusCode === 200, statusCode: res.statusCode, response: body });
      });
    });

    req.on('error', (err) => {
      console.error('[LINE Network Error]:', err.message);
      reject(err);
    });

    req.write(payload, 'utf8');
    req.end();
  });
}

/**
 * Generate a compact, deduplicated pending-work summary for LINE at 08:00.
 * Invalid rows (blank product/date or quantity <= 0) are excluded.
 */
function generateD1LineMessage(dateStr) {
  let opsStatus = {};
  if (fs.existsSync(OPS_STATUS_FILE)) {
    try { opsStatus = JSON.parse(fs.readFileSync(OPS_STATUS_FILE, 'utf8')); } catch (e) {}
  }

  const asText = (v) => String(v == null ? '' : v).trim();
  const asQty = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = Number(asText(v).replace(/,/g, '').replace(/kg/i, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const dateKey = (v) => {
    const raw = asText(v);
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(d);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const displayDate = (v) => {
    const k = dateKey(v);
    if (!k) return '';
    const [y, m, d] = k.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`;
  };
  const clean = (v, fallback = '') => asText(v) || fallback;
  const isDone = (v) => /ขึ้นของและส่งมอบเรียบร้อย|จัดส่งแล้ว|เสร็จ|เรียบร้อย/.test(asText(v));

  const rawOps = Array.isArray(opsStatus.active_operations) ? opsStatus.active_operations : [];
  const seen = new Set();
  const pendingOps = [];
  for (const op of rawOps) {
    if (!op || op.skip_line_alert || isDone(op.status)) continue;
    const product = clean(op.product);
    const qty = asQty(op.qty_kg);
    const delivery = dateKey(op.delivery_date || op.loading_date);
    if (!product || qty <= 0 || !delivery) continue;
    const customer = clean(op.customer);
    const farm = clean(op.farm);
    const key = [delivery, product, qty, customer, farm].map(x => String(x).toLowerCase()).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pendingOps.push({
      delivery, product, qty, customer, farm,
      status: clean(op.status, 'รอดำเนินการ')
    });
  }
  pendingOps.sort((a, b) => a.delivery.localeCompare(b.delivery) || a.product.localeCompare(b.product));

  const rawOther = Array.isArray(opsStatus.other_tasks) ? opsStatus.other_tasks : [];
  const pendingOther = rawOther.filter(t => t && !isDone(t.status) && (clean(t.crop) || clean(t.task_type)));

  const today = dateKey(dateStr) || dateKey(new Date());
  let msg = `📋 [สรุปงาน PSC วันที่ ${displayDate(today)}]\n\n`;
  if (pendingOps.length === 0) {
    msg += 'งานรอขึ้นของ 0 รายการ\n';
  } else {
    msg += `งานรอขึ้นของ ${pendingOps.length} รายการ\n`;
    const limit = 12;
    pendingOps.slice(0, limit).forEach(op => {
      const customer = op.customer ? `เข้า ${op.customer}` : '';
      const farm = op.farm ? ` → ${op.farm}` : '';
      msg += `- ${displayDate(op.delivery)} ขึ้น${op.product} ${customer}${farm} ${op.qty.toLocaleString('en-US')} กก.\n`;
    });
    if (pendingOps.length > limit) msg += `- … และอีก ${pendingOps.length - limit} รายการ\n`;
  }
  if (pendingOther.length > 0) {
    msg += `\nงานติดตาม ${pendingOther.length} รายการ\n`;
    pendingOther.slice(0, 5).forEach(t => {
      msg += `- ${clean(t.crop || t.task_type, 'งาน')}${t.target_customer ? ` → ${clean(t.target_customer)}` : ''}\n`;
    });
    if (pendingOther.length > 5) msg += `- … และอีก ${pendingOther.length - 5} รายการ\n`;
  }
  msg += `\nตรวจสอบรายละเอียด: ${getOpsWebUrl()}`;
  return msg.slice(0, 4500);
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
