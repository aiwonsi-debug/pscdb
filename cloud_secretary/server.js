const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const lineNotifier = require('./line_notifier.js');

const PORT = process.env.PORT || 8080;
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

const PSC_API_KEY = (process.env.PSC_API_KEY || '').trim();
if (!PSC_API_KEY && process.env.NODE_ENV === 'production') {
    console.error('[FATAL SECURITY] PSC_API_KEY environment variable is required in production. Refusing to start.');
    process.exit(1);
}
// Web Client Session Tokens (Option 1: Zero Master Key Exposure)
const WEB_SESSIONS = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (hardened operational TTL)

function generateWebSessionToken() {
    const token = 'psc_sess_' + crypto.randomBytes(24).toString('hex');
    WEB_SESSIONS.set(token, Date.now() + SESSION_TTL_MS);
    if (WEB_SESSIONS.size > 1000) {
        const now = Date.now();
        for (const [t, exp] of WEB_SESSIONS.entries()) {
            if (exp < now) WEB_SESSIONS.delete(t);
        }
    }
    return token;
}


function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length >= 2) {
                list[parts.shift().trim()] = decodeURI(parts.join('='));
            }
        });
    }
    return list;
}

function isValidWebSession(token) {
    if (!token || !WEB_SESSIONS.has(token)) return false;
    const expires = WEB_SESSIONS.get(token);
    if (Date.now() > expires) {
        WEB_SESSIONS.delete(token);
        return false;
    }
    return true;
}


// Start daily 08:00 AM LINE notification scheduler
lineNotifier.initDailyLineScheduler();

const server = http.createServer((req, res) => {
  // CORS Headers: Restrict origins
  const reqOrigin = req.headers.origin || '';
  const allowedOrigins = [
    'https://pscdb.onrender.com',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ];
  if (allowedOrigins.includes(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://pscdb.onrender.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-PSC-API-KEY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // Auth Guard for POST write endpoints
  if (req.method === 'POST') {
    const reqKey = (req.headers['x-psc-api-key'] || req.headers['x-api-key'] || '').trim();
    const authHeader = (req.headers['authorization'] || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
    const cookies = parseCookies(req);
    const cookieSession = cookies['psc_session'] || '';
    const isMasterAuth = !!(PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY)));
            const isSessionAuth = isValidWebSession(cookieSession);
            const isAuthorized = isMasterAuth || isSessionAuth;
    if (!isAuthorized && urlPath !== '/api/line-webhook') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: Missing or invalid API key' }));
    }
  }

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

  // Serve Mobile Ops Web App & Dashboard
  if (urlPath === '/ops' || urlPath === '/field' || urlPath === '/team-app' || urlPath === '/' || urlPath === '/team' || urlPath === '/dashboard') {
    const target = (urlPath === '/ops' || urlPath === '/field' || urlPath === '/team-app')
      ? (fs.existsSync(OPS_HTML_FILE) ? OPS_HTML_FILE : TEAM_HTML_FILE)
      : (fs.existsSync(TEAM_HTML_FILE) ? TEAM_HTML_FILE : OPS_HTML_FILE);

    if (fs.existsSync(target)) {
      const cookies = parseCookies(req);
      const existingSession = cookies['psc_session'] || '';
      const parsedQuery = require('url').parse(req.url, true).query;
      const queryKey = (parsedQuery.auth || '').trim();

      const canMintSession = PSC_API_KEY && (queryKey === PSC_API_KEY);
      const hasValidSession = isValidWebSession(existingSession);

      if (!hasValidSession && !canMintSession) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>PSC Ops - Access Denied</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;} .card{background:#161b22;border:1px solid #30363d;padding:24px;border-radius:8px;max-width:360px;text-align:center;} h2{color:#f85149;margin-top:0;} p{font-size:14px;color:#8b949e;line-height:1.5;} input{width:100%;padding:10px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#fff;box-sizing:border-box;margin:12px 0;} button{width:100%;padding:10px;border-radius:6px;border:none;background:#238636;color:#fff;font-weight:bold;cursor:pointer;}</style></head><body><div class="card"><h2>🔒 Authentication Required</h2><p>PSC Operations Web UI requires operator authentication before issuing an active session.</p><form method="GET" action="' + urlPath + '"><input type="password" name="auth" placeholder="Enter Access Key" required /><button type="submit">Unlock Session</button></form></div></body></html>');
      }

      const sessionToken = hasValidSession ? existingSession : generateWebSessionToken();
      const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.connection && req.connection.encrypted) || process.env.NODE_ENV === 'production';
      res.setHeader('Set-Cookie', 'psc_session=' + sessionToken + '; Path=/; HttpOnly; SameSite=Lax' + (isHttps ? '; Secure' : ''));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const html = fs.readFileSync(target, 'utf8').replace(/__PSC_API_KEY_PLACEHOLDER__/g, '');
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
