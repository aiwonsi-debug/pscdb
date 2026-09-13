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
 * @param {string} messageText
 * @param {string} [targetOverride] optional userId/groupId to send to instead of the configured default
 */
function sendLineMessage(messageText, targetOverride) {
  return new Promise((resolve, reject) => {
    const config = loadLineConfig();
    const token = (config.line_channel_access_token || '').trim();
    const targetId = (targetOverride || config.line_target_group_id || config.line_target_user_id || '').trim();

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

    req.write(payload);
    req.end();
  });
}

/**
 * Generate Pending Tasks Summary message for LINE (Daily 08:00 AM)
 */
function generateD1LineMessage(dateStr) {
  let opsStatus = {};
  if (fs.existsSync(OPS_STATUS_FILE)) {
    try {
      opsStatus = JSON.parse(fs.readFileSync(OPS_STATUS_FILE, 'utf8'));
    } catch(e) {}
  }

  const activeOps = opsStatus.active_operations || [];
  const pendingOps = activeOps.filter(o => !String(o.status || '').includes('ขึ้นของและส่งมอบเรียบร้อย') && !o.skip_line_alert);

  // Sort by delivery date ascending
  pendingOps.sort((a, b) => {
    const da = a.delivery_date || '9999-99-99';
    const db = b.delivery_date || '9999-99-99';
    return da.localeCompare(db);
  });

  const otherTasks = opsStatus.other_tasks || [];
  const pendingOther = otherTasks.filter(t => !String(t.status || '').includes('เสร็จ') && !String(t.status || '').includes('เรียบร้อย'));

  const opsUrl = getOpsWebUrl();

  let msg = `📋 [สรุปงานค้าง & กำหนดส่งมอบประจำวัน]\n`;
  msg += `⏰ อัปเดต: 08:00 น. (${dateStr || new Date().toISOString().slice(0, 10)})\n`;
  msg += `──────────────────\n`;

  if (pendingOps.length === 0) {
    msg += `✅ ไม่มีรายการส่งมอบค้างในระบบ\n`;
  } else {
    msg += `🚚 [รายการส่งมอบที่รอดำเนินการ (${pendingOps.length} รายการ)]:\n`;
    pendingOps.forEach((op, idx) => {
      let dStr = '-';
      if (op.delivery_date) {
        const parts = op.delivery_date.split('-');
        dStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(2)}` : op.delivery_date;
      }
      const qtyStr = Number(op.qty_kg || 0).toLocaleString();
      msg += `\n${idx + 1}. 📅 ส่ง: ${dStr} | ${op.customer || '-'}\n`;
      msg += `   🥬 สินค้า: ${op.product || '-'} ${qtyStr} กก.\n`;
      msg += `   🏡 สวน: ${op.farm || '-'}\n`;
      msg += `   🚛 ขนส่ง: ${op.truck || '-'}\n`;
      msg += `   📌 สถานะ: ${op.status || 'รอดำเนินการ'}\n`;
    });
  }

  if (pendingOther.length > 0) {
    msg += `──────────────────\n`;
    msg += `🌱 [งานแปลงปลูก/งานติดตาม (${pendingOther.length} รายการ)]:\n`;
    pendingOther.forEach((ot, idx) => {
      msg += ` • ${ot.crop || ot.task_type || 'งาน'}: ลูกค้า ${ot.target_customer || '-'} (ส่ง ${ot.target_delivery || '-'}) [${ot.status || '-'}]\n`;
    });
  }

  msg += `──────────────────\n`;
  msg += `🌐 ตรวจสอบสถานะ & บันทึกงาน:\n`;
  msg += `${opsUrl}\n`;
  msg += `🔑 Team Code: 9624`;

  return msg;
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
