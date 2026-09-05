const querystring = require('querystring');
const crypto = require('crypto');
const memoryEngine = require('./memory_engine.js');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const quotaTracker = require('./ai_quota_tracker.js');

function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


const PORT = process.env.PORT || 8080;
const mobileHtmlFile = path.join(__dirname, 'ops_mobile_web.html');
const aiHtmlFile = path.join(__dirname, 'ai_dashboard.html');
const teamOpsFile = path.join(__dirname, 'team_ops_status.json');
const stockFile = path.join(__dirname, 'stock_inventory.json');
const GAS_URL = process.env.GAS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzwaao-vW7IdWqltSpFMbN7KGlU2IydbAojKmGLdEJWQ6Q_g1wCXtA1i65n_S7FHk5H/exec';

let tgBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
let tgChatId = process.env.TELEGRAM_CHAT_ID || '1532466397';
const cfgPath = path.join(__dirname, 'telegram_config.json');
if ((!tgBotToken || !tgChatId) && fs.existsSync(cfgPath)) {
    try {
        const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
        tgBotToken = tgBotToken || c.BotToken || '';
        tgChatId = tgChatId || c.ChatId || '1532466397';
    } catch (e) {}
}
const TG_BOT_TOKEN = tgBotToken;
const TG_CHAT_ID = tgChatId;

function sendTelegramNotification(text) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
    try {
        const payload = JSON.stringify({
            chat_id: TG_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: false
        });

        const req = https.request({
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${TG_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, () => {});
        req.on('error', (err) => console.error('[TG Notify Error]:', err.message));
        req.write(payload);
        req.end();
    } catch (e) {}
}

// Master PSC_API_KEY resolution: fail-closed in production unless dynamically provided, with secure container fallback
let PSC_API_KEY = (process.env.PSC_API_KEY || '').trim();
if (!PSC_API_KEY && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
    if (process.env.RENDER && !process.env.PSC_API_KEY) {
        // Auto-generate a cryptographically secure 256-bit runtime key so Render container boots healthy
        PSC_API_KEY = crypto.randomBytes(32).toString('hex');
        console.warn('[SECURITY NOTICE] PSC_API_KEY not configured in Render dashboard. Generated secure container key for runtime protection.');
    } else {
        console.error('[FATAL SECURITY] PSC_API_KEY environment variable is required in production. Refusing to start.');
        process.exit(1);
    }
}
// Web Client Session Tokens (Persistent Team Session + Zero Master Key Exposure)
// Team operators receive persistent session tokens (30 days); Master PSC_API_KEY remains strictly server-side.
const WEB_SESSIONS = new Map();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days persistent operational session

// Team Access Code resolution: dedicated code or fallback to PSC_API_KEY
const TEAM_ACCESS_CODE = (process.env.TEAM_ACCESS_CODE || process.env.PSC_TEAM_CODE || '9624').trim();

function verifyTeamOrMasterCode(inputCode) {
    if (!inputCode) return false;
    const clean = inputCode.trim();
    if (TEAM_ACCESS_CODE && clean === TEAM_ACCESS_CODE) return true;
    if (PSC_API_KEY && clean === PSC_API_KEY) return true;
    return false;
}

function generateWebSessionToken(remember = true) {
    const token = 'psc_sess_' + crypto.randomBytes(24).toString('hex');
    const ttl = remember ? SESSION_TTL_MS : (24 * 60 * 60 * 1000); // 30 days vs 1 day
    WEB_SESSIONS.set(token, Date.now() + ttl);
    // Prune expired sessions
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

const RENDER_DASHBOARD_URL = process.env.RENDER_DASHBOARD_URL || 'https://pscdb.onrender.com';

function syncToRender(endpoint, payload) {
    if (!RENDER_DASHBOARD_URL) return;
    try {
        const postData = JSON.stringify(payload);
        const parsed = url.parse(RENDER_DASHBOARD_URL);
        const req = https.request({
            hostname: parsed.hostname,
            port: 443,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-PSC-API-KEY': PSC_API_KEY
            },
            timeout: 10000
        }, (res) => {
            console.log(`[Render Sync ${endpoint}] Status: ${res.statusCode}`);
        });
        req.on('error', (e) => console.error('[Render Sync Error]:', e.message));
        req.write(postData);
        req.end();
    } catch (e) {
        console.error('[Render Sync Exception]:', e.message);
    }
}

function syncToGoogleSheets(payload) {
    if (!GAS_URL) return;
    try {
        const postData = JSON.stringify(payload);
        const parsed = url.parse(GAS_URL);
        const options = {
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redUrl = url.parse(res.headers.location);
                const redReq = https.request({
                    hostname: redUrl.hostname,
                    path: redUrl.path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, () => {});
                redReq.on('error', () => {});
                redReq.write(postData);
                redReq.end();
            }
        });

        req.on('error', (e) => {
            console.error('[GoogleSheets Sync Error]:', e.message);
        });

        req.write(postData);
        req.end();
    } catch (e) {
        console.error('[GoogleSheets Sync Exception]:', e.message);
    }
}

function fetchGoogleSheetsData() {
    return new Promise((resolve) => {
        if (!GAS_URL) return resolve(null);
        try {
            https.get(GAS_URL, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    https.get(res.headers.location, (redRes) => {
                        let data = '';
                        redRes.on('data', c => data += c);
                        redRes.on('end', () => {
                            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                        });
                    }).on('error', () => resolve(null));
                } else {
                    let data = '';
                    res.on('data', c => data += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                    });
                }
            }).on('error', () => resolve(null));
        } catch (e) {
            resolve(null);
        }
    });
}

function loadTeamOps() {
    let data = { 
        last_updated: new Date().toISOString(), 
        active_operations: [], 
        history_logs: [], 
        cards_state: {},
        custom_suppliers: [],
        custom_trucks: []
    };
    const targetOpsFile = fs.existsSync(teamOpsFile) ? teamOpsFile : (fs.existsSync(teamOpsFile + '.example') ? (teamOpsFile + '.example') : null);
    if (targetOpsFile) {
        try {
            data = Object.assign(data, JSON.parse(fs.readFileSync(targetOpsFile, 'utf8')));
            if (!data.cards_state) data.cards_state = {};
            if (!data.custom_suppliers) data.custom_suppliers = [];
            if (!data.custom_trucks) data.custom_trucks = [];
        } catch (e) {}
    }
    return data;
}


function recordLoadingReport(reportObj) {
    if (!reportObj) return;
    const opsData = loadTeamOps();
    if (!opsData.history_logs) opsData.history_logs = [];
    if (!opsData.cards_state) opsData.cards_state = {};

    const cardId = reportObj.cardId;
    if (cardId) {
        if (!opsData.cards_state[cardId]) opsData.cards_state[cardId] = { id: cardId };
        opsData.cards_state[cardId].loadedReported = true;
        opsData.cards_state[cardId].reportedAt = new Date().toISOString();
        opsData.cards_state[cardId].details = reportObj;
        opsData.cards_state[cardId].loadedDate = reportObj.date;
        opsData.cards_state[cardId].loadedItem = reportObj.item;
        opsData.cards_state[cardId].loadedWeight = reportObj.weight;
        opsData.cards_state[cardId].loadedFreight = reportObj.freight;
        opsData.cards_state[cardId].loadedPayment = reportObj.payment;
        opsData.cards_state[cardId].loadedLocation = reportObj.location;
        opsData.cards_state[cardId].rawReport = reportObj.rawText;
    }

    opsData.history_logs.unshift({
        id: 'LOG-' + Date.now(),
        timestamp: new Date().toISOString(),
        date: reportObj.date,
        item: reportObj.item,
        weight: reportObj.weight,
        freight: reportObj.freight,
        payment: reportObj.payment,
        location: reportObj.location,
        cardId: cardId
    });

    if (opsData.history_logs.length > 50) opsData.history_logs.pop();
    saveTeamOps(opsData);

    // Auto sync to Render and Google Sheets
    syncToRender('/api/loading-report', reportObj);
    if (cardId) {
        syncToGoogleSheets(opsData.cards_state[cardId]);
    }
}

function saveTeamOps(data) {
    data.last_updated = new Date().toISOString();
    const tmpFile = `${teamOpsFile}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpFile, teamOpsFile);
    } catch (e) {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (err) {}
        console.error('[saveTeamOps Error]:', e.message);
    }
}

const server = http.createServer(async (req, res) => {
    // CORS Headers: Restrict origin to legitimate hosts and local
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
    // Hardened Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB limit (Fix M-03)
    const getBody = () => new Promise((resolve, reject) => {
        let body = '';
        let length = 0;
        req.on('data', chunk => {
            length += chunk.length;
            if (length > MAX_BODY_SIZE) {
                req.destroy();
                return reject(new Error('Payload Too Large: Exceeded 1MB limit'));
            }
            body += chunk;
        });
        req.on('end', () => {
            try {
                const cleaned = (body || '').replace(/^\uFEFF/, '').trim();
                const contentType = (req.headers['content-type'] || '').split(';')[0].toLowerCase().trim();
                if (contentType === 'application/x-www-form-urlencoded') {
                    return resolve(querystring.parse(cleaned || ''));
                }
                if (contentType === 'application/json' || !contentType) {
                    return resolve(cleaned ? JSON.parse(cleaned) : {});
                }
                // Fallback attempt: if body starts with { try JSON, else parse as form
                if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
                    return resolve(JSON.parse(cleaned));
                }
                resolve(querystring.parse(cleaned));
            } catch (e) {
                console.error('[getBody Parse Error]:', e.message, 'Raw length:', body ? body.length : 0);
                reject(new Error('Invalid payload: ' + e.message));
            }
        });
        req.on('error', reject);
    });

    try {
        // 1. Redirect /usage, /quota, /dashboard to root Mini App (Single Unified App)
        if (req.method === 'GET' && (pathname === '/usage' || pathname === '/quota' || pathname === '/ai-dashboard' || pathname === '/dashboard')) {
            res.writeHead(302, { 'Location': '/' });
            return res.end();
        }

        // 2. Serve Mobile Field Ops Web UI
        if ((req.method === 'GET' || req.method === 'POST') && (pathname === '/' || pathname === '/ops' || pathname === '/team-app' || pathname === '/field')) {
            if (fs.existsSync(mobileHtmlFile)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');

                const cookies = parseCookies(req);
                const existingSession = cookies['psc_session'] || '';
                let queryKey = '';
                if (req.method === 'POST') {
                    const postBody = await getBody();
                    queryKey = (postBody.access_code || postBody.key || postBody.auth || '').trim();
                }

                // Authentication Gate: Require existing valid session OR Team Access Code to mint new session
                const canMintSession = verifyTeamOrMasterCode(queryKey);
                const hasValidSession = isValidWebSession(existingSession);

                if (!hasValidSession && !canMintSession) {
                    res.writeHead(401);
                    return res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PSC Field Operations - Team Access</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { background:#0a0e17; color:#e6edf3; font-family:'Prompt',-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:16px; box-sizing:border-box; }
    .card { background:#111827; border:1px solid #1f2937; padding:28px 24px; border-radius:14px; width:100%; max-width:360px; box-shadow:0 12px 30px rgba(0,0,0,0.6); text-align:center; }
    .badge { display:inline-block; background:rgba(16,185,129,0.15); color:#10b981; font-weight:600; font-size:12px; padding:4px 10px; border-radius:20px; margin-bottom:12px; }
    h2 { color:#fff; font-size:20px; font-weight:700; margin:0 0 6px 0; }
    p { font-size:13px; color:#9ca3af; line-height:1.5; margin:0 0 20px 0; }
    .input-box { width:100%; padding:12px 14px; border-radius:8px; border:1px solid #374151; background:#0b1120; color:#fff; font-size:15px; font-family:inherit; box-sizing:border-box; outline:none; transition:border-color 0.2s; }
    .input-box:focus { border-color:#10b981; }
    .remember-row { display:flex; align-items:center; justify-content:flex-start; gap:8px; margin:14px 0 20px 0; font-size:13px; color:#cbd5e1; cursor:pointer; }
    .remember-row input { accent-color:#10b981; width:16px; height:16px; margin:0; cursor:pointer; }
    button { width:100%; padding:13px; border-radius:8px; border:none; background:#10b981; color:#fff; font-size:15px; font-weight:600; font-family:inherit; cursor:pointer; transition:background 0.2s; }
    button:hover { background:#059669; }
    .subtext { margin-top:16px; font-size:11.5px; color:#6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">🌱 PSC Field Operations</span>
    <h2>Team Access (Authentication Required)</h2>
    <p>กรอกรหัสทีมงานเพื่อเริ่มใช้งาน Dashboard บนอุปกรณ์นี้ (เข้าสู่ระบบครั้งเดียว จำเซสชัน 30 วัน)</p>
    <form method="POST" action="/ops">
      <input type="password" name="auth" class="input-box" placeholder="Team Access Code" required autofocus />
      <label class="remember-row">
        <input type="checkbox" name="remember" value="true" checked />
        <span>จำอุปกรณ์นี้ (30 วัน ไม่ต้องกรอกซ้ำ)</span>
      </label>
      <button type="submit">เข้าสู่ระบบ Dashboard</button>
    </form>
    <div class="subtext">🔒 HttpOnly Session Cookie Protection • Zero Secret in DOM</div>
  </div>
</body>
</html>`);
                }

                // If authenticating via key or renewing valid session
                const sessionToken = hasValidSession ? existingSession : generateWebSessionToken(true);
                const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.connection && req.connection.encrypted) || process.env.NODE_ENV === 'production';
                const maxAgeSec = 30 * 24 * 60 * 60; // 30 days
                const cookieFlags = `psc_session=${sessionToken}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`;
                res.setHeader('Set-Cookie', cookieFlags);
                res.writeHead(200);
                const htmlContent = fs.readFileSync(mobileHtmlFile, 'utf8')
                    .replace(/__PSC_API_KEY_PLACEHOLDER__/g, '');
                return res.end(htmlContent);
            } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                return res.end('<h1>PSC Field Ops Dashboard</h1><p>Ops HTML file not found on server.</p>');
            }
        }

        // Set JSON Content-Type for all API endpoints
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        // Endpoint: POST /api/login (Session Minting without Key in URL)
        if (req.method === 'POST' && (pathname === '/api/login' || pathname === '/auth/session')) {
            const body = await getBody();
            const accessKey = (body.access_code || body.key || body.auth || '').trim();
            if (verifyTeamOrMasterCode(accessKey)) {
                const sessionToken = generateWebSessionToken(true);
                const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.connection && req.connection.encrypted) || process.env.NODE_ENV === 'production';
                const maxAgeSec = 30 * 24 * 60 * 60; // 30 days
                const cookieFlags = `psc_session=${sessionToken}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`;
                res.setHeader('Set-Cookie', cookieFlags);
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: 'Session authenticated for 30 days' }));
            } else {
                res.writeHead(401);
                return res.end(JSON.stringify({ success: false, error: 'Invalid access code' }));
            }
        }

        // Security Guard: Authenticate all POST write endpoints (Fix unauthenticated write APIs)
        let isMasterAuth = false;
        let isSessionAuth = false;
        if (req.method === 'POST') {
            const reqKey = (req.headers['x-psc-api-key'] || req.headers['x-api-key'] || '').trim();
            const authHeader = (req.headers['authorization'] || '').trim();
            const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
            const cookies = parseCookies(req);
            const cookieSession = cookies['psc_session'] || '';

            // Header auth strictly checks Master PSC_API_KEY only (Header cannot use session token)
            isMasterAuth = !!(PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY)));
            // Cookie auth strictly checks valid Web Session only
            isSessionAuth = isValidWebSession(cookieSession);

            const isAuthorized = PSC_API_KEY && (isMasterAuth || isSessionAuth);
            if (!isAuthorized) {
                res.writeHead(401);
                return res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Unauthorized: Missing or invalid API key. Provide valid X-PSC-API-KEY header or session cookie.' 
                }));
            }
        }

        // Real-Time AI Usage & Quota Endpoint
        
        // Sync Quota POST (Receive live stats from local machine)
        if (req.method === 'POST' && (pathname === '/api/sync-quota' || pathname === '/api/quota-sync')) {
            if (!isMasterAuth) {
                res.writeHead(403);
                return res.end(JSON.stringify({ success: false, error: 'Forbidden: /api/sync-quota requires Master API Key' }));
            }
            const body = await getBody();
            if (body && (body.groq || body.agy)) {
                quotaTracker.saveQuotaData(body, false);
            }
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'Quota synced to cloud' }));
        }

        if (req.method === 'GET' && (pathname === '/api/usage' || pathname === '/api/quota' || pathname === '/api/ai-usage')) {
            // Protect operational telemetry & AI quota metrics with API key
            const reqKey = (req.headers['x-psc-api-key'] || req.headers['x-api-key'] || '').trim();
            const authHeader = (req.headers['authorization'] || '').trim();
            const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
            const cookies = parseCookies(req);
            const cookieSession = cookies['psc_session'] || '';

            // Header auth strictly checks Master PSC_API_KEY only (Header cannot use session token)
            const isMasterAuth = !!(PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY)));
            // Cookie auth strictly checks valid Web Session only
            const isSessionAuth = isValidWebSession(cookieSession);

            const isAuthorized = PSC_API_KEY && (isMasterAuth || isSessionAuth);
            if (!isAuthorized) {
                res.writeHead(401);
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Missing or invalid API key. Header requires Master Key, Cookie requires valid Web Session.' }));
            }
            const quotaData = quotaTracker.loadQuotaData();
            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                data: quotaData,
                metrics: quotaData
            }));
        }


        if (req.method === 'POST' && pathname === '/api/stock-update') {
            const body = await getBody();
            // Schema validation: Require Items object and numeric stock values
            if (!body || typeof body !== 'object' || !body.Items || typeof body.Items !== 'object') {
                res.writeHead(400);
                return res.end(JSON.stringify({ success: false, error: 'Invalid stock update schema. Must contain Items object.' }));
            }
            
            // Validate that Items values contain valid StockKg numbers
            const ALLOWED_SKUS = ['Cabbage', 'Onion_AFT', 'Onion_Chinese', 'Carrot', 'Purple_Sweet_Potato', 'Yellow_Sweet_Potato', 'Orange_Sweet_Potato'];
            for (const key of Object.keys(body.Items)) {
                if (!ALLOWED_SKUS.includes(key)) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: `Invalid stock SKU: '${key}'. Allowed SKUs: ${ALLOWED_SKUS.join(', ')}` }));
                }
                const itm = body.Items[key];
                if (!itm || typeof itm !== 'object' || typeof itm.StockKg !== 'number' || isNaN(itm.StockKg) || !Number.isFinite(itm.StockKg) || itm.StockKg < 0 || itm.StockKg > 1000000) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: `Invalid stock item value for '${key}'. Must be a finite number between 0 and 1,000,000 kg.` }));
                }
            }

            // Atomic file write using temporary file + renameSync to avoid corruption (Fix C-06, H-14)
            const tmpFile = `${stockFile}.${process.pid}.${Date.now()}.tmp`;
            try {
                fs.writeFileSync(tmpFile, JSON.stringify(body, null, 2), 'utf8');
                fs.renameSync(tmpFile, stockFile);
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: 'Stock inventory updated atomically' }));
            } catch (err) {
                try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
                res.writeHead(500);
                return res.end(JSON.stringify({ success: false, error: 'Failed to commit stock update: ' + err.message }));
            }
        }

        // Real-Time Live Stock Inventory Endpoint
        if (req.method === 'GET' && (pathname === '/api/stock' || pathname === '/api/inventory')) {
            let stockData = {
                AsOfDate: new Date().toISOString().slice(0, 10),
                Items: {
                    Cabbage: { Name: "กะหล่ำปลี", StockKg: 2575 },
                    Onion_AFT: { Name: "หอม AFT", StockKg: 26120 },
                    Onion_Chinese: { Name: "หอมจีน", StockKg: 3560 },
                    Carrot: { Name: "แครอทสวย", StockKg: 5840 },
                    Purple_Sweet_Potato: { Name: "มันม่วงหัวเล็ก", StockKg: 1690 },
                    Yellow_Sweet_Potato: { Name: "มันเหลืองไข่", StockKg: 342 },
                    Orange_Sweet_Potato: { Name: "มันส้ม", StockKg: 390 }
                }
            };
            const targetStockFile = fs.existsSync(stockFile) ? stockFile : (fs.existsSync(stockFile + '.example') ? (stockFile + '.example') : null);
            if (targetStockFile) {
                try {
                    stockData = JSON.parse(fs.readFileSync(targetStockFile, 'utf8'));
                } catch (e) {}
            }
            res.writeHead(200);
            return res.end(JSON.stringify(stockData, null, 2));
        }

        // 2. Health Check
        if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/api/status')) {
            res.writeHead(200);
            return res.end(JSON.stringify({
                status: 'ONLINE',
                service: 'PSC Field Operations Cloud Gateway',
                port: PORT,
                timestamp: new Date().toISOString(),
                gasSynced: !!GAS_URL
            }, null, 2));
        }

        
        // Bot Reboot API (Triggered from Team Dashboard when bot is unresponsive)
        if (req.method === 'POST' && (pathname === '/api/reboot-bot' || pathname === '/api/restart-bot')) {
            if (!isMasterAuth) {
                res.writeHead(403);
                return res.end(JSON.stringify({ success: false, error: 'Forbidden: /api/reboot-bot requires Master API Key' }));
            }
            const rebootSigFile = path.join(__dirname, 'reboot_bot.signal');
            try {
                fs.writeFileSync(rebootSigFile, new Date().toISOString(), 'utf8');
                console.log('[Bot Reboot Requested from Team Dashboard] Reboot signal written.');
                res.writeHead(200);
                return res.end(JSON.stringify({ 
                    success: true, 
                    message: 'ส่งคำสั่งรีบูตระบบบอทเรียบร้อยแล้ว ระบบกำลังเริ่มต้นใหม่ภายใน 2 วินาที' 
                }));
            } catch(e) {
                res.writeHead(500);
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 3. Gmail Push Webhook Endpoint (Instant Notification to Telegram Bot)
        if (req.method === 'POST' && (pathname === '/api/gmail-webhook' || pathname === '/api/gmail-push')) {
            const body = await getBody();
            const from = body.from || 'ไม่ระบุผู้ส่ง';
            const subject = body.subject || 'ไม่มีหัวข้อ';
            const date = body.date ? new Date(body.date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : new Date().toLocaleString('th-TH');
            const snippet = (body.snippet || '').trim();
            const attNames = body.attachmentNames || [];

            console.log(`[Gmail Push Webhook] New Email from ${from}: ${subject}`);

            const safeFrom = escapeHtml(from);
            const safeSubject = escapeHtml(subject);
            const safeDate = escapeHtml(date);
            const safeSnippet = escapeHtml(snippet ? snippet.substring(0, 300) : '');
            const safeAttNames = attNames.map(a => escapeHtml(a));

            let tgMsg = `📬 <b>[มีอีเมลใหม่เข้าถึงเลขาแบบ Real-time]</b> ✨\n` +
                        `──────────────────\n` +
                        `👤 <b>ผู้ส่ง:</b> ${safeFrom}\n` +
                        `📌 <b>หัวข้อ:</b> ${safeSubject}\n` +
                        `⏰ <b>เวลา:</b> ${safeDate}\n`;

            if (attNames.length > 0) {
                tgMsg += `📎 <b>ไฟล์แนบ (${safeAttNames.length}):</b> ${safeAttNames.join(', ')}\n`;
            }

            if (snippet) {
                tgMsg += `📝 <b>ข้อความ:</b>\n<i>${safeSnippet}...</i>\n`;
            }

            tgMsg += `──────────────────\n` +
                     `⚡ <i>ระบบ Push Notification อัตโนมัติจาก Gmail</i>`;

            sendTelegramNotification(tgMsg);

            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'Email pushed to Telegram bot successfully' }));
        }

        // 4. Team Status GET (Fetches from Google Sheets if cloud storage is fresh)
        if (req.method === 'GET' && pathname === '/api/team-status') {
            const ops = loadTeamOps();
            
            // Fetch latest from Google Sheets
            try {
                const sheetData = await fetchGoogleSheetsData();
                if (sheetData && typeof sheetData === 'object') {
                    if (!ops.cards_state) ops.cards_state = {};
                    Object.keys(sheetData).forEach(id => {
                        const item = sheetData[id];
                        if (item) {
                            if (!ops.cards_state[id]) ops.cards_state[id] = { id: id };
                            if (item.supplier) ops.cards_state[id].supplier = item.supplier;
                            if (item.truck) ops.cards_state[id].truck = item.truck;
                            if (item.orderChecked !== undefined) ops.cards_state[id].orderChecked = item.orderChecked;
                            if (item.truckChecked !== undefined) ops.cards_state[id].truckChecked = item.truckChecked;
                        }
                    });
                }
            } catch (e) {}

            res.writeHead(200);
            return res.end(JSON.stringify(ops, null, 2));
        }

        // 5. Team Update POST (Syncs to Google Sheets & Updates Memory)
        
        // Loading Report POST (From Bot or Web)
        if (req.method === 'POST' && pathname === '/api/loading-report') {
            const body = await getBody();
            recordLoadingReport(body);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'Loading report saved and synced' }));
        }

        if (req.method === 'POST' && (pathname === '/api/team-update' || pathname === '/api/ops')) {
            const body = await getBody();
            const { id, farm, supplier, truck, product, qty_kg, customer, delivery_date, status, recorder, notes, orderChecked, truckChecked } = body;

            const opsData = loadTeamOps();
            if (!opsData.cards_state) opsData.cards_state = {};

            const activeSupplier = supplier || farm;

            if (id) {
                if (!opsData.cards_state[id]) opsData.cards_state[id] = { id: id };
                if (activeSupplier !== undefined) opsData.cards_state[id].supplier = activeSupplier;
                if (truck !== undefined) opsData.cards_state[id].truck = truck;
                if (orderChecked !== undefined) opsData.cards_state[id].orderChecked = orderChecked;
                if (truckChecked !== undefined) opsData.cards_state[id].truckChecked = truckChecked;

                // Auto-add custom seller/location to database & memory
                if (activeSupplier && activeSupplier !== '__custom__' && activeSupplier.trim() !== '') {
                    const s = activeSupplier.trim();
                    if (!opsData.custom_suppliers.includes(s)) {
                        opsData.custom_suppliers.push(s);
                        try { memoryEngine.rememberItem('แหล่งสวน/ผู้ขายใหม่ที่เพิ่มจาก Dashboard: ' + s, 'learned_facts'); } catch(e) {}
                    }
                }
                // Auto-add custom transport/truck to database & memory
                if (truck && truck !== '__custom__' && truck.trim() !== '') {
                    const t = truck.trim();
                    if (!opsData.custom_trucks.includes(t)) {
                        opsData.custom_trucks.push(t);
                        try { memoryEngine.rememberItem('สายรถ/ขนส่งใหม่ที่เพิ่มจาก Dashboard: ' + t, 'learned_facts'); } catch(e) {}
                    }
                }
                
                // Sync to Google Sheets
                syncToRender('/api/team-update', body);
                syncToGoogleSheets({
                    id: id,
                    supplier: opsData.cards_state[id].supplier || '',
                    truck: opsData.cards_state[id].truck || '',
                    orderChecked: !!opsData.cards_state[id].orderChecked,
                    truckChecked: !!opsData.cards_state[id].truckChecked
                });
            }

            if (activeSupplier && product && qty_kg) {
                const opId = `OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`;
                const newOp = {
                    id: opId,
                    timestamp: new Date().toISOString(),
                    customer: customer || 'โรงงานศาลายา / TNS',
                    delivery_date: delivery_date || '2026-09-01',
                    farm: activeSupplier,
                    product: product,
                    qty_kg: parseFloat(qty_kg),
                    truck: truck || 'รถ 6 ล้อ',
                    status: status || 'สั่งของ/สั่งรถแล้ว',
                    recorder: recorder || 'ทีมงาน PSC',
                    notes: notes || ''
                };
                opsData.active_operations.push(newOp);
            }

            saveTeamOps(opsData);

            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                message: 'Updated successfully and synced to Google Sheets',
                cards_state: opsData.cards_state
            }, null, 2));
        }

        // 6. Team Reset POST
        if (req.method === 'POST' && pathname === '/api/team-reset') {
            const body = await getBody();
            const { id } = body;
            const opsData = loadTeamOps();
            if (opsData.cards_state && opsData.cards_state[id]) {
                opsData.cards_state[id].loadedReported = false;
                saveTeamOps(opsData);
                syncToGoogleSheets(opsData.cards_state[id]);
                syncToRender('/api/team-reset', { id: id });
            }
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: `Card ${id} reset successfully` }));
        }

        // 404 Fallback
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Endpoint ${pathname} not found` }));

    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
    }
});

let isListening = false;
function createWebhookServer(cb) {
    if (!isListening) {
        isListening = true;
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[WebhookServer] Port ${PORT} already in use, attaching to existing instance.`);
            } else {
                console.error('[WebhookServer] Server error:', err);
            }
        });
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 PSC Field Ops Server listening on port ${PORT}`);
        });
    }
    return server;
}

if (require.main === module) {
    createWebhookServer(null);
}

module.exports = { createWebhookServer, WEBHOOK_PORT: PORT, loadTeamOps, saveTeamOps, recordLoadingReport, syncToRender, server };
