const http = require('http');
const fs = require('fs');
const path = require('path');
const lineNotifier = require('./line_notifier.js');

const PORT = 8080;
const STATUS_FILE = path.join(__dirname, 'team_ops_status.json');
const OPS_HTML_FILE = 'E:/agy/ops_mobile_web.html';
const TEAM_HTML_FILE = path.join(__dirname, 'team_dashboard.html');

// Initialize status file if not exists
if (!fs.existsSync(STATUS_FILE)) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify({
    '0209': { supplier: 'เฮียหนิง โกดังฮอด', truck: 'พี่อั๋น 6 ล้อ (8 ตัน)', orderChecked: true, truckChecked: true, updatedAt: new Date().toISOString() },
    '0509': { supplier: 'เจ้นก (8 ตัน ส่งตรงศาลายา)', truck: 'รถเจ้นกจัดส่งเองถึงโรงงาน', orderChecked: true, truckChecked: true, updatedAt: new Date().toISOString() }
  }, null, 2), 'utf8');
}

// Start daily 08:00 AM LINE notification scheduler
lineNotifier.initDailyLineScheduler();

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // API 1: Get Team Status
  if (urlPath === '/api/team-status' && req.method === 'GET') {
    let data = '{}';
    if (fs.existsSync(STATUS_FILE)) {
      data = fs.readFileSync(STATUS_FILE, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(data);
    return;
  }

  // API 2: Update Team Status (When team ticks on phone)
  if (urlPath === '/api/team-update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let current = {};
        if (fs.existsSync(STATUS_FILE)) {
          current = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        }
        
        current[payload.id] = {
          supplier: payload.supplier || payload.farm || '',
          truck: payload.truck || '',
          orderChecked: payload.orderChecked,
          truckChecked: payload.truckChecked,
          updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(STATUS_FILE, JSON.stringify(current, null, 2), 'utf8');
        console.log(`[Secretary Sync] Received update for item ${payload.id}: Supplier=${payload.supplier}, Truck=${payload.truck}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'น้องเลขารับทราบและบันทึกข้อมูลเรียบร้อยแล้วค่ะ', data: current[payload.id] }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API 3: Get/Save LINE Config
  if (urlPath === '/api/line-config') {
    if (req.method === 'GET') {
      const cfg = lineNotifier.loadLineConfig();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(cfg, null, 2));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const newCfg = JSON.parse(body);
          const currentCfg = lineNotifier.loadLineConfig();
          const merged = Object.assign(currentCfg, newCfg);
          lineNotifier.saveLineConfig(merged);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, message: 'บันทึกการตั้งค่า LINE สำเร็จค่ะ', config: merged }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // API 4: Test Send Message to LINE
  if (urlPath === '/api/line-test' && req.method === 'POST') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const testMsg = lineNotifier.generateD1LineMessage(todayStr);
    lineNotifier.sendLineMessage(testMsg).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, result: result }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    });
    return;
  }

  // API 5: LINE Webhook Endpoint
  if (urlPath === '/api/line-webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log('[LINE WEBHOOK Cloud] Event:', JSON.stringify(payload));
        const events = payload.events || [];
        for (const ev of events) {
          const source = ev.source || {};
          const groupId = source.groupId || source.roomId;
          if (groupId) {
            const cfg = lineNotifier.loadLineConfig();
            cfg.line_target_group_id = groupId;
            lineNotifier.saveLineConfig(cfg);
            console.log('>>> [LINE WEBHOOK Cloud] Captured Group ID:', groupId);

            const replyMsg = `🟢 [น้องเลขา PSC เชื่อมต่อกลุ่มทีมงานสำเร็จแล้วค่ะ] ✨\n──────────────────\n📌 บันทึกกลุ่มนี้สำหรับระบบแจ้งเตือนอัตโนมัติเรียบร้อยแล้วค่ะ\n⏰ ทุกเช้าเวลา 08:00 น. ตรง น้องเลขาจะส่งสรุปตารางขึ้นของ D-1 และสถานะจัดซื้อเข้ากลุ่มนี้นะคะ\n──────────────────\n🌐 ดูแดชบอร์ดงานสด:\nhttps://hours-wagner-pacific-kinda.trycloudflare.com/ops`;
            lineNotifier.sendLineMessage(replyMsg).catch(e => console.error(e));
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve Mobile Ops Web App (/ops, /field, /team-app)
  if (urlPath === '/ops' || urlPath === '/field' || urlPath === '/team-app') {
    const target = fs.existsSync(OPS_HTML_FILE) ? OPS_HTML_FILE : TEAM_HTML_FILE;
    if (fs.existsSync(target)) {
      const html = fs.readFileSync(target, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
  }

  // Serve Dashboard HTML (/, /team, /dashboard)
  if (urlPath === '/' || urlPath === '/team' || urlPath === '/dashboard') {
    const htmlPath = fs.existsSync(TEAM_HTML_FILE) ? TEAM_HTML_FILE : OPS_HTML_FILE;
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
  }

  // Fallback Health
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ONLINE', secretary: 'PSC Cloud Secretary 2.0 (LINE Active)', time: new Date() }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PSC Cloud Secretary Server listening on port ${PORT} (supporting /ops, /api, /api/line-config)`);
});
