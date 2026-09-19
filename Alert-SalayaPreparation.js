const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = 'E:\\agy';
const CONFIG_FILE = path.join(BASE_DIR, 'line_config.json');
const NOTIFIED_FILE = path.join(BASE_DIR, 'notified_salaya_alerts.json');

// Notification intervals requested: D-15, D-10, D-5, D-3, D-2, D-1
const ALERT_DAYS = [15, 10, 5, 3, 2, 1];

function loadJson(filePath, defaultVal = {}) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      console.error(`[Error reading ${filePath}]:`, e.message);
    }
  }
  return defaultVal;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Error writing ${filePath}]:`, e.message);
  }
}

function getTodayMidnight() {
  const now = new Date();
  // Using local system time normalized to midnight
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function parseDateToMidnight(dateStr) {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD or DD/MM/YYYY
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
    }
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      let yr = parseInt(parts[2], 10);
      if (yr > 2500) yr -= 543; // BE to CE
      else if (yr < 100) yr += 2000;
      return new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 0, 0, 0, 0);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function calculateDaysRemaining(deliveryDateStr) {
  const deliveryDate = parseDateToMidnight(deliveryDateStr);
  if (!deliveryDate) return null;
  const today = getTodayMidnight();
  const diffMs = deliveryDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function formatDateThai(dateStr) {
  const d = parseDateToMidnight(dateStr);
  if (!d) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yearBE = d.getFullYear() + 543;
  return `${day}/${month}/${yearBE}`;
}

function sendLinePushMessage(token, targetId, text) {
  return new Promise((resolve) => {
    if (!token || !targetId) {
      console.warn('[LINE] Missing token or targetId');
      return resolve({ success: false, reason: 'NO_CONFIG' });
    }

    if (targetId.startsWith('C') && !text.includes('[สรุปงานค้าง & กำหนดส่งมอบประจำวัน]')) {
      console.log(`[LINE Group Policy] Blocked non-summary Salaya alert to group (${targetId}).`);
      return resolve({ success: true, skipped: true });
    }

    const payload = JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text: text }]
    });

    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          console.error(`[LINE Error] HTTP ${res.statusCode}:`, data);
          resolve({ success: false, status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[LINE Network Error]:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

function formatSalayaAlertMessage(op, daysRemaining) {
  const dLabel = `D-${daysRemaining}`;
  const thaiDate = formatDateThai(op.delivery_date);
  const qty = op.qty_kg ? `${Number(op.qty_kg).toLocaleString()} กก.` : 'ตามรอบแผน';

  let urgencyTag = '📢 [แจ้งเตือนเตรียมขนส่งล่วงหน้า]';
  if (daysRemaining === 1) urgencyTag = '🚨 [แจ้งเตือนด่วน พรุ่งนี้ขึ้นของ]';
  else if (daysRemaining <= 3) urgencyTag = '⚠️ [แจ้งเตือนโค้งสุดท้ายส่งมอบ]';

  return `${urgencyTag}
🏢 ปลายทาง: ${op.customer || 'โรงงานศาลายา'} [${dLabel}]
──────────────────
📅 กำหนดส่งมอบ: ${thaiDate} (อีก ${daysRemaining} วัน)
🥬 สินค้า: ${op.product || 'กะหล่ำปลี'} ${qty}
📍 แหล่ง/สวน: ${op.farm || 'เฮียหนิง (โกดังฮอด)'}
🚛 ขนส่ง: ${op.truck || '6 ล้อ'}
📌 สถานะ: ${op.status || 'รอดำเนินการ'}
${op.notes ? `📝 หมายเหตุ: ${op.notes}\n` : ''}──────────────────
🌐 ตรวจสอบสถานะและบันทึกงาน:
https://pscdb.onrender.com/ops`;
}

async function checkAndSendSalayaAlerts(dryRun = false) {
  console.log(`[Salaya Alert] Running check at ${new Date().toISOString()} (dryRun=${dryRun})`);
  const lineConfig = loadJson(CONFIG_FILE, {});
  const token = lineConfig.line_channel_access_token;
  const targetId = lineConfig.line_target_group_id || lineConfig.line_target_user_id;

  // Operational schedules are read from Google Sheets by the deployed API.
  const activeOps = [];
  const notified = loadJson(NOTIFIED_FILE, {});

  // Filter for Salaya operations that are pending/in-progress
  const salayaOps = activeOps.filter(op => {
    const cust = (op.customer || '').toLowerCase();
    const isSalaya = cust.includes('ศาลายา') || cust.includes('salaya');
    const isCompleted = (op.status || '').includes('เรียบร้อย') || (op.status || '').includes('ส่งมอบเรียบร้อย');
    return isSalaya && !isCompleted;
  });

  console.log(`[Salaya Alert] Found ${salayaOps.length} active Salaya operation(s).`);

  let sentCount = 0;

  for (const op of salayaOps) {
    const daysRemaining = calculateDaysRemaining(op.delivery_date);
    if (daysRemaining === null) continue;

    console.log(`[Op ${op.id || op.delivery_date}] Delivery: ${op.delivery_date}, Days remaining: ${daysRemaining}`);

    if (ALERT_DAYS.includes(daysRemaining)) {
      const alertKey = `${op.id || op.product + '_' + op.delivery_date}_D-${daysRemaining}`;
      
      if (notified[alertKey]) {
        console.log(`[Skip] Already notified: ${alertKey} at ${notified[alertKey]}`);
        continue;
      }

      const msgText = formatSalayaAlertMessage(op, daysRemaining);
      console.log(`--- [Sending LINE Alert: ${alertKey}] ---`);
      console.log(msgText);

      if (!dryRun) {
        const result = await sendLinePushMessage(token, targetId, msgText);
        if (result.success) {
          notified[alertKey] = new Date().toISOString();
          saveJson(NOTIFIED_FILE, notified);
          sentCount++;
          console.log(`[Success] Sent alert ${alertKey}`);
        } else {
          console.error(`[Failed] Could not send alert ${alertKey}:`, result);
        }
      } else {
        sentCount++;
        console.log(`[DryRun] Would record ${alertKey}`);
      }
    }
  }

  console.log(`[Salaya Alert] Finished. Sent ${sentCount} alert(s).`);
  return sentCount;
}

function startDaemonScheduler() {
  console.log('[Salaya Alert Daemon] Started. Checking daily at scheduled alert time and every 30 minutes...');
  // Run once on startup
  checkAndSendSalayaAlerts().catch(console.error);

  setInterval(() => {
    checkAndSendSalayaAlerts().catch(console.error);
  }, 30 * 60 * 1000); // every 30 minutes
}

// Support CLI execution
if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  const isDaemon = process.argv.includes('--daemon');

  if (isDaemon) {
    startDaemonScheduler();
  } else {
    checkAndSendSalayaAlerts(isDryRun).then(() => {
      process.exit(0);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}

module.exports = {
  ALERT_DAYS,
  calculateDaysRemaining,
  formatSalayaAlertMessage,
  checkAndSendSalayaAlerts,
  startDaemonScheduler
};
