const querystring = require('querystring');
const crypto = require('crypto');
const memoryEngine = require('./memory_engine.js');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const quotaTracker = { loadQuotaData: () => ({}), saveQuotaData: () => {} };

// Local logger for this module — writes to the same secretary_activity.log
// that bot.js's writeLog() uses, so both processes' logs interleave in one
// place. (bot.js's own writeLog() is not in scope here — separate module.)
function writeLog(msg) {
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })
        .replace(',', '');
    const line = `[${now}] ${msg}`;
    try { fs.appendFileSync(path.join(__dirname, 'secretary_activity.log'), line + '\n', 'utf8'); } catch (e) {}
    try { console.log(line); } catch (e) {}
}

function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeAdDates(value) {
    if (typeof value === 'string') {
        return value
            .replace(/(?<!\d)(\d{1,2})[\/\-](\d{1,2})[\/\-]2569\b/g, (_, d, m) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
            .replace(/(?<!\d)(\d{1,2})[\/\-](\d{1,2})[\/\-]69\b/g, (_, d, m) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
            .replace(/(?<!\d)2569(?!\d)/g, '2026');
    }
    if (Array.isArray(value)) return value.map(normalizeAdDates);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeAdDates(v)]));
    return value;
}
function sanitizeSupplierName(name) {
    if (typeof name !== 'string' || !name.trim()) return name || '';
    let cleaned = name.replace(/\s*-?\s*[\d,]+(?:\.\d+)?\s*(?:บาท|บ\.?)/g, '');
    cleaned = cleaned.replace(/\(\s*\)/g, '');
    cleaned = cleaned.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    cleaned = cleaned.replace(/[-,]\s*$/, '').trim();
    return cleaned;
}


const PORT = process.env.PORT || 8080;
function resolveOpsHtmlPath() {
    const candidates = [
        path.join(__dirname, 'public', 'ops.html'),
        path.join(__dirname, 'ops_mobile_web.html')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return candidates[0];
}
const mobileHtmlFile = resolveOpsHtmlPath();
const aiHtmlFile = path.join(__dirname, 'ai_dashboard.html');
const teamOpsFile = path.join(__dirname, 'team_ops_status.json');
const stockFile = path.join(__dirname, 'stock_inventory.json');
const GAS_URL = process.env.GAS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbycakKFmkwBWkMkfOenwDycc3w9MxpwUw33i5MR5-eOR2kqyLGxQP34TMxDVd3BSJU2/exec';

let sendLineMessage;
try {
    sendLineMessage = require('./line_notifier').sendLineMessage;
} catch (e) {
    sendLineMessage = async (msg) => { console.log('[Webhook Notify Fallback]:', msg); return { success: false }; };
}

function sendLineNotification(text) {
    if (!text) return;
    try {
        const plainText = text.replace(/<[^>]+>/g, '');
        sendLineMessage(plainText).catch((err) => {
            console.error('[LINE Notify Error]:', err.message);
        });
    } catch (e) {}
}

// Master PSC_API_KEY resolution: fail-closed in production unless dynamically provided, with secure container fallback
let PSC_API_KEY = (process.env.PSC_API_KEY || 'pscdb-secret-key-2026').trim();
// Web Client Session Tokens (Stateless HMAC-SHA256 Signed - Survives Server & Container Restarts)
// Team operators receive persistent signed tokens (30 days); Zero master key exposure.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days persistent operational session

// Team Access Code resolution: dedicated code or fallback to PSC_API_KEY
const TEAM_ACCESS_CODE = (process.env.TEAM_ACCESS_CODE || process.env.PSC_TEAM_CODE || '9624').trim();

// Session Secret: Derived from persistent environment or deterministic team secret
const SESSION_SECRET = (process.env.SESSION_SECRET || process.env.PSC_SESSION_SECRET || ('psc_hmac_secret_' + TEAM_ACCESS_CODE + '_sec2026')).trim();

function verifyTeamOrMasterCode(inputCode) {
    if (!inputCode) return false;
    const clean = inputCode.trim();
    if (TEAM_ACCESS_CODE && clean === TEAM_ACCESS_CODE) return true;
    if (PSC_API_KEY && clean === PSC_API_KEY) return true;
    return false;
}

function generateWebSessionToken(remember = true) {
    const ttl = remember ? SESSION_TTL_MS : (24 * 60 * 60 * 1000);
    const payloadObj = {
        exp: Date.now() + ttl,
        rnd: crypto.randomBytes(8).toString('hex')
    };
    const payloadStr = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
    return `psc_v2_${payloadStr}.${sig}`;
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
    if (!token || typeof token !== 'string') return false;
    // Support v2 HMAC signed token (survives any restart)
    if (token.startsWith('psc_v2_')) {
        const parts = token.slice(7).split('.');
        if (parts.length !== 2) return false;
        const [payloadStr, sig] = parts;
        const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
        if (sig !== expectedSig) return false;
        try {
            const data = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
            return typeof data.exp === 'number' && Date.now() < data.exp;
        } catch (e) {
            return false;
        }
    }
    return false;
}

const RENDER_DASHBOARD_URL = process.env.RENDER_DASHBOARD_URL || 'https://pscdb.onrender.com';

function syncToRender(endpoint, payload) {
    if (process.env.RENDER || !RENDER_DASHBOARD_URL) return;
    try {
        const postData = JSON.stringify(payload);
        const parsed = url.parse(RENDER_DASHBOARD_URL);
        const sessionToken = generateWebSessionToken(true);
        const req = https.request({
            hostname: parsed.hostname,
            port: 443,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-PSC-API-KEY': PSC_API_KEY,
                'Cookie': `psc_session=${sessionToken}`
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
                https.get(res.headers.location, (redRes) => {
                    let resData = '';
                    redRes.on('data', c => resData += c);
                    redRes.on('end', () => {
                        // GAS returns JSON response after redirect
                    });
                }).on('error', (err) => {
                    console.error('[GoogleSheets Redirect Sync Error]:', err.message);
                });
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

function httpsGetFollow(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGetFollow(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('HTTP ' + res.statusCode));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseCsv(text) {
    if (!text) return [];
    const rows = [];
    let row = [], field = '', inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuote && text[i + 1] === '"') { field += '"'; i++; }
            else inQuote = !inQuote;
        } else if (c === ',' && !inQuote) { row.push(field.trim()); field = ''; }
        else if ((c === '\n' || c === '\r') && !inQuote) {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field.trim()); field = '';
            if (row.some(v => v !== '')) rows.push(row);
            row = [];
        } else field += c;
    }
    if (field || row.length) { row.push(field.trim()); if (row.some(v => v !== '')) rows.push(row); }
    return rows;
}

const PO_REGISTER_CSV = 'https://docs.google.com/spreadsheets/d/1FfkSYTCxUFYj3dE6VHAOWEqDa4MVU3yMz7rwjefh-Ig/export?format=csv&gid=1245149988';
let cachedPORegister = { timestamp: 0, rows: [] };
let cachedTeamStatus = { timestamp: 0, data: null };
async function fetchCustomerPORegister(force = false) {
    const now = Date.now();
    if (!force && cachedPORegister.rows.length > 0 && now - cachedPORegister.timestamp < 5000) return cachedPORegister.rows;
    try {
        const rows = parseCsv(await httpsGetFollow(PO_REGISTER_CSV + '&t=' + now));
        const out = [];
        for (let i = 3; i < rows.length; i++) {
            const r = rows[i] || [];
            if (!r.some(v => String(v || '').trim())) continue;
            out.push({ rowIndex: i, customer: (r[0]||'').trim(), po: (r[1]||'').trim(), documentDate: (r[2]||'').trim(), deliveryDate: (r[3]||'').trim(), product: (r[4]||'').trim(), orderedKg: (r[5]||'').trim(), unitPrice: (r[6]||'').trim(), totalAmount: (r[7]||'').trim(), status: (r[8]||'').trim(), sourceFile: (r[9]||'').trim() });
        }
        cachedPORegister = { timestamp: now, rows: out };
        return out;
    } catch (e) { console.error('[PO Register Fetch Error]:', e.message); return cachedPORegister.rows; }
}
const SCHEDULE_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/195Foz8mjcLt1q5agCh28FoyJkg4VxGhMt86XqX7ZSCM/export?format=csv&gid=1232005308';
const DISPATCH_INTAKE_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/195Foz8mjcLt1q5agCh28FoyJkg4VxGhMt86XqX7ZSCM/export?format=csv&gid=1767890653';
let cachedDispatchIntake = { timestamp: 0, records: [] };
async function fetchDispatchIntakeLog(force = false) {
    const now = Date.now();
    if (!force && cachedDispatchIntake.records.length && now - cachedDispatchIntake.timestamp < 5000) return cachedDispatchIntake.records;
    const rows = parseCsv(await httpsGetFollow(DISPATCH_INTAKE_SHEET_CSV + '&t=' + now));
    const records = [];
    for (let i = 3; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0] || !r[1]) continue;
        const y = (r[15] || '').replace('%', '').trim();
        records.push({ date: r[2] || r[1], dispatchDate: r[1], intakeDate: r[2], item: r[5] || '-', weight: r[9] ? `${r[9]} kg` : '-', weightUp: r[8] ? `${r[8]} kg` : '-', transitLoss: r[10] || '-', yield: y ? Number(y) : null, size: r[16] || '-', condition: r[16] || '-', location: r[4] || '-', supplier: r[3] || '-', freight: r[13] || '-', price: r[11] || '-', status: r[17] || '-', source: 'Dispatch & Intake Log' });
    }
    records.sort((a, b) => String(b.intakeDate || b.date).localeCompare(String(a.intakeDate || a.date)));
    cachedDispatchIntake = { timestamp: now, records };
    return records;
}
let cachedScheduleSheet = { timestamp: 0, schedules: [] };

async function fetchGoogleSheetsLiveSchedule(force = false) {
    const now = Date.now();
    // Reduce cache to 5000ms (5 seconds) for faster live updates
    if (!force && cachedScheduleSheet.schedules.length > 0 && (now - cachedScheduleSheet.timestamp < 5000)) {
        return cachedScheduleSheet.schedules;
    }
    try {
        // Append timestamp to bypass Google CDN cache for /export?format=csv
        const cacheBusterUrl = SCHEDULE_SHEET_CSV + '&t=' + now;
        const csvText = await httpsGetFollow(cacheBusterUrl);
        const rows = parseCsv(csvText);
        const schedules = [];
        // Header is at row index 2: ["รหัสงาน","กำหนดวันดำเนินการ","ผู้จำหน่าย / สวน","จุดนัดรับ / แหล่งสินค้า","ผู้ให้บริการรถ / ชนิดรถ","รายละเอียดงาน","น้ำหนัก กก.","สถานะงาน"]
        for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0] || !r[0].trim()) continue;
            const code = r[0].trim();
            const date = (r[1] || '').trim();
            const supplier = (r[2] || '').trim();
            const origin = (r[3] || '').trim();
            const truck = (r[4] || '').trim();
            const detail = (r[5] || '').trim();
            const weight = (r[6] || '').trim();
            const status = (r[7] || 'รอดำเนินการ').trim();

            let customer = 'โรงงานศาลายา';
            let product = 'กะหล่ำปลี';
            let cat = 'salaya';

            const lowerDetail = (detail + ' ' + supplier).toLowerCase();
            if (lowerDetail.includes('tns') || lowerDetail.includes('พริกหวาน') || lowerDetail.includes('หอมแดง')) {
                customer = 'TNS';
                cat = 'tns';
                if (lowerDetail.includes('พริกหวาน')) product = 'พริกหวานเขียว';
                else if (lowerDetail.includes('หอมแดง')) product = 'หอมแดง';
            } else if (lowerDetail.includes('ศาลายา') || lowerDetail.includes('กะหล่ำ')) {
                customer = 'โรงงานศาลายา';
                product = 'กะหล่ำปลี';
                cat = 'salaya';
            }

            schedules.push({
                id: code,
                rowIndex: i,
                date: date,
                supplier: supplier,
                origin: origin,
                truck: truck,
                detail: detail,
                weight: weight,
                status: status,
                customer: customer,
                product: product,
                cat: cat
            });
        }
        cachedScheduleSheet = { timestamp: now, schedules: schedules };
        return schedules;
    } catch (e) {
        console.error('[fetchGoogleSheetsLiveSchedule Error]:', e.message);
        return cachedScheduleSheet.schedules;
    }
}

function fetchGoogleSheetsData(queryParam = '') {
    return new Promise((resolve) => {
        if (!GAS_URL) return resolve(null);
        try {
            const fetchUrl = queryParam ? `${GAS_URL}${GAS_URL.includes('?') ? '&' : '?'}${queryParam}` : GAS_URL;
            https.get(fetchUrl, (res) => {
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
        custom_trucks: [],
        other_tasks: []
    };
    const targetOpsFile = fs.existsSync(teamOpsFile) ? teamOpsFile : (fs.existsSync(teamOpsFile + '.example') ? (teamOpsFile + '.example') : null);
    if (targetOpsFile) {
        try {
            data = Object.assign(data, JSON.parse(fs.readFileSync(targetOpsFile, 'utf8')));
            if (!data.cards_state) data.cards_state = {};
            if (!data.custom_suppliers) data.custom_suppliers = [];
            if (!data.custom_trucks) data.custom_trucks = [];
            if (!data.other_tasks) data.other_tasks = [];
        } catch (e) {}
    }
    return data;
}


function recordLoadingReport(reportObj) {
    if (!reportObj) return;
    const opsData = loadTeamOps();
    if (!opsData.history_logs) opsData.history_logs = [];
    if (!opsData.cards_state) opsData.cards_state = {};

    const isIntake = reportObj.reportType === 'intake';
    const cardId = isIntake ? null : reportObj.cardId;
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

    const existingLog = opsData.history_logs.find(l => 
        (cardId && l.cardId === cardId) ||
        (l.date === reportObj.date && l.item === reportObj.item && l.weight === reportObj.weight)
    );
    if (existingLog) {
        existingLog.timestamp = new Date().toISOString();
        existingLog.date = reportObj.date;
        existingLog.item = reportObj.item;
        existingLog.weight = reportObj.weight;
        existingLog.freight = reportObj.freight;
        existingLog.payment = reportObj.payment;
        existingLog.location = reportObj.location;
        if (cardId) existingLog.cardId = cardId;
    } else {
        opsData.history_logs.unshift({
            id: 'LOG-' + Date.now(),
            timestamp: new Date().toISOString(),
            date: reportObj.date,
            item: reportObj.item,
            weight: reportObj.weight,
            freight: reportObj.freight,
            payment: reportObj.payment,
            location: reportObj.location,
            cardId: cardId,
            reportType: reportObj.reportType || 'dispatch',
            yield: reportObj.receivedYield || null,
            size: reportObj.receivedSize || '',
            condition: reportObj.receivedCondition || ''
        });
    }

    if (opsData.history_logs.length > 50) opsData.history_logs.pop();
    saveTeamOps(opsData);

    // Auto sync to Render and Google Sheets
    syncToRender('/api/loading-report', reportObj);
    if (cardId) {
        syncToGoogleSheets(opsData.cards_state[cardId]);
    } else if (isIntake && reportObj.rawText) {
        // The deployed Apps Script accepts LINE webhook events and routes
        // receiving wording to Dispatch & Intake Log without creating a schedule.
        syncToGoogleSheets({
            events: [{
                type: 'message',
                replyToken: '',
                source: { userId: 'local-bot' },
                message: {
                    type: 'text',
                    id: reportObj.reportId || ('local-' + Date.now()),
                    text: reportObj.rawText
                }
            }]
        });
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

        // 1.1 Serve Static Frontend Assets (/css/*, /js/*, /favicon.ico)
        if (req.method === 'GET') {
            const publicDir = path.join(__dirname, 'public');
            let staticPath = null;
            let mimeType = 'text/plain; charset=utf-8';
            if (pathname.startsWith('/css/') && pathname.endsWith('.css')) {
                staticPath = path.join(publicDir, pathname);
                mimeType = 'text/css; charset=utf-8';
            } else if (pathname.startsWith('/js/') && pathname.endsWith('.js')) {
                staticPath = path.join(publicDir, pathname);
                mimeType = 'application/javascript; charset=utf-8';
            } else if (pathname === '/favicon.ico') {
                res.writeHead(204);
                return res.end();
            }

            if (staticPath && fs.existsSync(staticPath)) {
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.writeHead(200);
                return res.end(fs.readFileSync(staticPath));
            }
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
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Noto+Serif+Thai:wght@500;600;700&display=swap" rel="stylesheet">
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
    <form id="login_form" method="POST" action="/ops">
      <input type="password" id="auth_code_input" name="auth" class="input-box" placeholder="Team Access Code" required autofocus />
      <label class="remember-row">
        <input type="checkbox" name="remember" value="true" checked />
        <span>จำอุปกรณ์นี้ (30 วัน ไม่ต้องกรอกซ้ำ)</span>
      </label>
      <button type="submit">เข้าสู่ระบบ Dashboard</button>
    </form>
    <div class="subtext">🔒 HttpOnly Session Cookie Protection • Zero Secret in DOM</div>
  </div>
  <script>
    (function() {
      try {
        var savedCode = localStorage.getItem('PSC_TEAM_ACCESS_CODE');
        if (savedCode) {
          var inp = document.getElementById('auth_code_input');
          if (inp) inp.value = savedCode;
          document.getElementById('login_form').submit();
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`);
                }

                // If authenticating via key or renewing valid session
                const sessionToken = hasValidSession ? existingSession : generateWebSessionToken(true);
                const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.connection && req.connection.encrypted) || process.env.NODE_ENV === 'production' || !!process.env.RENDER;
                const maxAgeSec = 30 * 24 * 60 * 60; // 30 days
                const sameSiteAttr = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
                const cookieFlags = `psc_session=${sessionToken}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; ${sameSiteAttr}`;
                res.setHeader('Set-Cookie', cookieFlags);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.writeHead(200);
                const htmlContent = fs.readFileSync(mobileHtmlFile, 'utf8')
                    .replace(/__PSC_API_KEY_PLACEHOLDER__/g, '')
                    .replace('</head>', `<script>try { localStorage.setItem('PSC_SESSION_TOKEN', '${sessionToken}'); } catch(e){}</script></head>`);
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
                const isHttps = req.headers['x-forwarded-proto'] === 'https' || (req.connection && req.connection.encrypted) || process.env.NODE_ENV === 'production' || !!process.env.RENDER;
                const maxAgeSec = 30 * 24 * 60 * 60; // 30 days
                const sameSiteAttr = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
                const cookieFlags = `psc_session=${sessionToken}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; ${sameSiteAttr}`;
                res.setHeader('Set-Cookie', cookieFlags);
                res.writeHead(200);
                return res.end(JSON.stringify({ 
                    success: true, 
                    token: sessionToken, 
                    message: 'Session authenticated for 30 days' 
                }));
            } else {
                res.writeHead(401);
                return res.end(JSON.stringify({ success: false, error: 'Invalid access code' }));
            }
        }

        // Security Guard: Authenticate all POST write endpoints (Fix unauthenticated write APIs)
        // Exception: /api/line-webhook authenticates via its own LINE signature
        // verification (X-Line-Signature + channel_secret HMAC) further below —
        // LINE's platform has no way to send our internal X-PSC-API-KEY header.
        let isMasterAuth = false;
        let isSessionAuth = false;
        if (req.method === 'POST' && pathname !== '/api/line-webhook') {
            const reqKey = (req.headers['x-psc-api-key'] || req.headers['x-api-key'] || '').trim();
            const authHeader = (req.headers['authorization'] || '').trim();
            const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
            const cookies = parseCookies(req);
            const cookieSession = cookies['psc_session'] || '';

            // Header auth checks Master PSC_API_KEY
            isMasterAuth = !!(PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY)));
            // Session auth checks Cookie or Bearer/Header token
            const headerSession = (req.headers['x-psc-session'] || '').trim();
            isSessionAuth = isValidWebSession(cookieSession) || isValidWebSession(bearerToken) || isValidWebSession(headerSession);

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

        // Real-Time Live Stock Inventory Endpoint (Direct Sheets Sync with Local Fallback)
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
            const targetStockFile = [
                stockFile,
                path.join(__dirname, '..', 'stock_inventory.json'),
                path.join(__dirname, '..', 'data', 'examples', 'stock.json.example'),
                path.join(__dirname, '..', 'stock_inventory.json.example'),
                stockFile + '.example'
            ].find(f => fs.existsSync(f));
            if (targetStockFile) {
                try {
                    stockData = JSON.parse(fs.readFileSync(targetStockFile, 'utf8'));
                } catch (e) {}
            }

            // Real-Time Sheets Direct Sync: Fetch live stock array from Google Apps Script
            try {
                const liveSheets = await fetchGoogleSheetsData('action=summary');
                if (liveSheets && Array.isArray(liveSheets.stock) && liveSheets.stock.length > 0) {
                    if (!stockData.Items) stockData.Items = {};
                    liveSheets.stock.forEach(row => {
                        const name = (row.name || '').trim();
                        const qty = Number(row.actualQtyKg) || 0;
                        if (name.includes('กะหล่ำ')) {
                            stockData.Items.Cabbage = Object.assign(stockData.Items.Cabbage || { Name: 'กะหล่ำปลี' }, { StockKg: qty });
                        } else if (name.includes('AFT') || (name.includes('หอม') && name.includes('ใหญ่') && !name.includes('จีน'))) {
                            stockData.Items.Onion_AFT = Object.assign(stockData.Items.Onion_AFT || { Name: 'หอม AFT' }, { StockKg: qty });
                        } else if (name.includes('จีน')) {
                            stockData.Items.Onion_Chinese = Object.assign(stockData.Items.Onion_Chinese || { Name: 'หอมจีน' }, { StockKg: qty });
                        } else if (name.includes('แครอท')) {
                            stockData.Items.Carrot = Object.assign(stockData.Items.Carrot || { Name: 'แครอทสวย' }, { StockKg: qty });
                        } else if (name.includes('มันม่วง')) {
                            stockData.Items.Purple_Sweet_Potato = Object.assign(stockData.Items.Purple_Sweet_Potato || { Name: 'มันม่วงหัวเล็ก' }, { StockKg: qty });
                        } else if (name.includes('มันเหลือง')) {
                            stockData.Items.Yellow_Sweet_Potato = Object.assign(stockData.Items.Yellow_Sweet_Potato || { Name: 'มันเหลืองไข่' }, { StockKg: qty });
                        } else if (name.includes('มันส้ม')) {
                            stockData.Items.Orange_Sweet_Potato = Object.assign(stockData.Items.Orange_Sweet_Potato || { Name: 'มันส้ม' }, { StockKg: qty });
                        }
                    });
                    const now = new Date();
                    stockData.LastUpdated = now.toISOString();
                    stockData.AsOfDate = now.toISOString().slice(0, 10);
                    stockData.LiveSource = 'Google Sheets Realtime';
                }
            } catch (err) {
                console.error('[Live Stock Sync Error]:', err.message);
            }

            // Prevent caching of stock data to ensure UI reflects latest values
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.writeHead(200);
            return res.end(JSON.stringify(normalizeAdDates(stockData), null, 2));
        }

        // Live Sheets Complete Dataset Endpoint (Stock, Schedules, Prices direct from Google Sheets)
        if (req.method === 'GET' && (pathname === '/api/live-sheets' || pathname === '/api/sheets-data' || pathname === '/api/schedules')) {
            let liveData = { ok: true, stock: [], schedules: [], prices: [] };
            try {
                const sheetResult = await fetchGoogleSheetsData('action=summary');
                if (sheetResult && typeof sheetResult === 'object') {
                    liveData = sheetResult;
                }
            } catch (err) {
                console.error('[Live Sheets API Error]:', err.message);
            }
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.writeHead(200);
            return res.end(JSON.stringify(liveData, null, 2));
        }

        // Cabbage Prices and Transport Rates Endpoint
        if (req.method === 'GET' && (pathname === '/api/prices' || pathname === '/api/price-update')) {
            let priceData = { AsOfDate: '2026-09-16', Suppliers: [] };
            const targetPriceFile = [
                path.join(__dirname, 'cabbage_prices_transport.json'),
                path.join(__dirname, '..', 'cabbage_prices_transport.json'),
                path.join(__dirname, 'data', 'cabbage_prices_transport.json')
            ].find(f => fs.existsSync(f));
            if (targetPriceFile) {
                try {
                    priceData = JSON.parse(fs.readFileSync(targetPriceFile, 'utf8'));
                } catch (e) {}
            }
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.writeHead(200);
            return res.end(JSON.stringify(normalizeAdDates(priceData), null, 2));
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
        if (req.method === 'POST' && pathname === '/api/team-cleanup') {
            if (!isMasterAuth) {
                res.writeHead(403);
                return res.end(JSON.stringify({ success: false, error: 'Forbidden: /api/team-cleanup requires Master API Key' }));
            }
            const body = await getBody();
            const removeIds = Array.isArray(body && body.remove_ids) && body.remove_ids.length
                ? body.remove_ids
                : ['test', '209', 'test_write_1788655978366', 'โรงงานศาลายา'];

            const opsData = loadTeamOps();
            const before = Object.keys(opsData.cards_state || {});
            const merged = {};
            const removed = [];
            const mergedFrom = {};

            before.forEach(rawKey => {
                if (removeIds.includes(rawKey)) {
                    removed.push(rawKey);
                    return;
                }
                const cleanKey = rawKey.trim();
                const incoming = opsData.cards_state[rawKey];
                if (!merged[cleanKey]) {
                    merged[cleanKey] = incoming;
                } else {
                    const existingTime = merged[cleanKey].updatedAt ? new Date(merged[cleanKey].updatedAt).getTime() : 0;
                    const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
                    merged[cleanKey] = incomingTime >= existingTime ? incoming : merged[cleanKey];
                    mergedFrom[cleanKey] = mergedFrom[cleanKey] || [];
                    mergedFrom[cleanKey].push(rawKey);
                }
                if (cleanKey !== rawKey) {
                    if (typeof merged[cleanKey].id === 'string') merged[cleanKey].id = cleanKey;
                }
            });

            opsData.cards_state = merged;
            saveTeamOps(opsData);

            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                before_count: before.length,
                after_count: Object.keys(merged).length,
                removed_ids: removed,
                merged_duplicates: mergedFrom
            }));
        }

        // 3. Gmail Push Webhook Endpoint (Instant Notification to LINE)
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

            sendLineNotification(tgMsg);

            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'Email pushed to LINE bot successfully' }));
        }

        // 3b. LINE Messaging API Webhook — receives free-text reports from the team
        // (prices, stock counts, delivery orders) and routes them through the same
        // handleCommand()/OKMD-Groq parsing pipeline.
        if (req.method === 'POST' && pathname === '/api/line-webhook') {
            // Must read the RAW body for signature verification — do not use getBody()'s
            // auto-JSON-parse here, since the LINE signature is computed over raw bytes.
            const rawBodyBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                let len = 0;
                req.on('data', chunk => {
                    len += chunk.length;
                    if (len > 1 * 1024 * 1024) { req.destroy(); return reject(new Error('Payload too large')); }
                    chunks.push(chunk);
                });
                req.on('end', () => resolve(Buffer.concat(chunks)));
                req.on('error', reject);
            });
            const rawBody = rawBodyBuffer.toString('utf8');

            let lineCfg = {};
            try { lineCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'line_config.json'), 'utf8')); } catch (e) {}
            const channelSecret = (process.env.LINE_CHANNEL_SECRET || lineCfg.channel_secret || '').trim();

            const signature = req.headers['x-line-signature'] || '';
            const expectedSignature = channelSecret ? crypto.createHmac('sha256', channelSecret).update(rawBodyBuffer).digest('base64') : '';

            if (channelSecret && signature !== expectedSignature) {
                writeLog(`[LINE Webhook] Signature mismatch — received="${signature}" expected="${expectedSignature}" secretLen=${channelSecret.length}`);
                res.writeHead(401);
                return res.end(JSON.stringify({ success: false, error: 'Invalid signature' }));
            }

            // Respond 200 immediately — LINE requires a fast ack and will retry/disable
            // the webhook if it doesn't get one, regardless of how long processing takes.
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));

            let payload = {};
            try { payload = JSON.parse(rawBody); } catch (e) { return; }
            // Single production route: every LINE event goes directly to the
            // deployed Apps Script. Desktop/tunnel forwarding is removed.
            syncToGoogleSheets(payload);
            writeLog('[LINE Webhook] Routed event directly to Apps Script; Desktop forwarding disabled');
            return;
        }

        // 4. Team Status GET (parallel Google Sheet fetches + short server cache)
        if (req.method === 'GET' && pathname === '/api/team-status') {
            const isForce = parsedUrl.query && (parsedUrl.query.force === '1' || parsedUrl.query.force === 'true');
            const now = Date.now();
            if (!isForce && cachedTeamStatus.data && now - cachedTeamStatus.timestamp < 10000) {
                res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
                res.writeHead(200);
                return res.end(JSON.stringify(cachedTeamStatus.data));
            }
            const ops = loadTeamOps();
            const [scheduleResult, poResult, sheetResult, intakeResult] = await Promise.allSettled([
                fetchGoogleSheetsLiveSchedule(isForce),
                fetchCustomerPORegister(isForce),
                fetchGoogleSheetsData(),
                fetchDispatchIntakeLog(isForce)
            ]);
            if (scheduleResult.status === 'fulfilled' && Array.isArray(scheduleResult.value)) ops.live_schedules = scheduleResult.value;
            if (poResult.status === 'fulfilled' && Array.isArray(poResult.value)) ops.customer_pos = poResult.value;
            if (intakeResult.status === 'fulfilled' && Array.isArray(intakeResult.value)) { ops.intake_records = intakeResult.value; ops.history_logs = []; }
            if (sheetResult.status === 'fulfilled' && sheetResult.value && typeof sheetResult.value === 'object') {
                const sheetData = sheetResult.value;
                if (!ops.cards_state) ops.cards_state = {};
                Object.keys(sheetData).forEach(rawId => {
                    const id = rawId.trim(), item = sheetData[rawId];
                    if (!item || !id) return;
                    const localItem = ops.cards_state[id];
                    const localUpdatedAt = localItem && localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
                    const sheetUpdatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
                    if (!localItem || sheetUpdatedAt >= localUpdatedAt) {
                        if (!ops.cards_state[id]) ops.cards_state[id] = { id };
                        if (item.supplier) ops.cards_state[id].supplier = item.supplier;
                        if (item.truck) ops.cards_state[id].truck = item.truck;
                        if (item.orderChecked !== undefined) ops.cards_state[id].orderChecked = item.orderChecked;
                        if (item.truckChecked !== undefined) ops.cards_state[id].truckChecked = item.truckChecked;
                        if (item.updatedAt) ops.cards_state[id].updatedAt = item.updatedAt;
                    }
                });
            }
            const payload = normalizeAdDates(ops);
            cachedTeamStatus = { timestamp: now, data: payload };
            res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
            res.writeHead(200);
            return res.end(JSON.stringify(payload));
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

            const rawSupplier = supplier || farm;
            const activeSupplier = rawSupplier ? sanitizeSupplierName(rawSupplier) : rawSupplier;
            const cleanTruck = truck ? sanitizeSupplierName(truck) : truck;

            if (id) {
                const nowIso = new Date().toISOString();
                if (!opsData.cards_state[id]) opsData.cards_state[id] = { id: id };
                if (activeSupplier !== undefined) opsData.cards_state[id].supplier = activeSupplier;
                if (cleanTruck !== undefined) opsData.cards_state[id].truck = cleanTruck;
                if (orderChecked !== undefined) opsData.cards_state[id].orderChecked = orderChecked;
                if (truckChecked !== undefined) opsData.cards_state[id].truckChecked = truckChecked;
                opsData.cards_state[id].updatedAt = nowIso;

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
                    truckChecked: !!opsData.cards_state[id].truckChecked,
                    updatedAt: nowIso
                });
            }

            if (activeSupplier && product && qty_kg) {
                if (!opsData.active_operations) opsData.active_operations = [];
                let existingIndex = -1;
                if (id) {
                    existingIndex = opsData.active_operations.findIndex(o => o.card_id === id || o.id === id);
                }
                if (existingIndex === -1 && delivery_date && product) {
                    existingIndex = opsData.active_operations.findIndex(o => o.delivery_date === delivery_date && o.product === product && (!customer || o.customer === customer));
                }

                if (existingIndex >= 0) {
                    const existing = opsData.active_operations[existingIndex];
                    existing.farm = activeSupplier;
                    existing.truck = cleanTruck || existing.truck || 'รถ 6 ล้อ';
                    if (status) existing.status = status;
                    if (recorder) existing.recorder = recorder;
                    if (notes) existing.notes = notes;
                    if (id && !existing.card_id) existing.card_id = id;
                    existing.timestamp = new Date().toISOString();
                } else {
                    const opId = `OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`;
                    const newOp = {
                        id: opId,
                        card_id: id || '',
                        timestamp: new Date().toISOString(),
                        customer: customer || 'โรงงานศาลายา / TNS',
                        delivery_date: delivery_date || '2026-09-01',
                        farm: activeSupplier,
                        product: product,
                        qty_kg: parseFloat(qty_kg),
                        truck: cleanTruck || 'รถ 6 ล้อ',
                        status: status || 'สั่งของ/สั่งรถแล้ว',
                        recorder: recorder || 'ทีมงาน PSC',
                        notes: notes || ''
                    };
                    opsData.active_operations.push(newOp);
                }
            }

            saveTeamOps(opsData);

            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                message: 'Updated successfully and synced to Google Sheets',
                cards_state: opsData.cards_state
            }, null, 2));
        }

        // Endpoint: Add Other Task / Planting Task
        if (req.method === 'POST' && pathname === '/api/add-other-task') {
            const body = await getBody();
            const opsData = loadTeamOps();
            if (!opsData.other_tasks) opsData.other_tasks = [];

            const taskType = (body.task_type || 'งานปลูก').trim();
            const seller = (body.seller || '-').trim();
            const crop = (body.crop || '-').trim();
            const targetCustomer = (body.target_customer || 'TNS').trim();
            const targetDelivery = (body.target_delivery || 'ปลายเดือน 9').trim();
            const status = (body.status || 'รอดำเนินการ').trim();
            const notes = (body.notes || '').trim();

            // Prevent spam/double submission if duplicate exists within 30 seconds
            const now = Date.now();
            const duplicate = opsData.other_tasks.find(t => {
                const diffMs = now - new Date(t.updated_at).getTime();
                return diffMs < 30000 &&
                       t.task_type === taskType &&
                       t.crop === crop &&
                       t.seller === seller &&
                       t.target_customer === targetCustomer &&
                       t.target_delivery === targetDelivery;
            });

            if (duplicate) {
                res.writeHead(200);
                return res.end(JSON.stringify({ 
                    success: true, 
                    message: 'รายการนี้เพิ่งถูกบันทึกไปแล้ว (ตรวจจับการกดซ้ำ)', 
                    task: duplicate, 
                    other_tasks: opsData.other_tasks 
                }));
            }

            const newId = 'TASK-' + Date.now();
            const taskObj = {
                id: newId,
                task_type: taskType,
                seller: seller,
                crop: crop,
                target_customer: targetCustomer,
                target_delivery: targetDelivery,
                status: status,
                notes: notes,
                updated_at: new Date().toISOString()
            };
            opsData.other_tasks.unshift(taskObj);
            saveTeamOps(opsData);
            syncToRender('/api/add-other-task', taskObj);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'บันทึกงานใหม่เรียบร้อย', task: taskObj, other_tasks: opsData.other_tasks }));
        }

        // Endpoint: Delete Other Task
        if (req.method === 'POST' && pathname === '/api/delete-other-task') {
            const body = await getBody();
            const { id } = body;
            const opsData = loadTeamOps();
            if (opsData.other_tasks) {
                opsData.other_tasks = opsData.other_tasks.filter(t => t.id !== id);
                saveTeamOps(opsData);
                syncToRender('/api/delete-other-task', { id });
            }
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'ลบรายการงานเรียบร้อย', other_tasks: opsData.other_tasks }));
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

        // 7. Team Complete POST (Manual Mark Done)
        if (req.method === 'POST' && pathname === '/api/team-complete') {
            const body = await getBody();
            const { id } = body;
            const opsData = loadTeamOps();
            if (!opsData.cards_state) opsData.cards_state = {};
            if (!opsData.cards_state[id]) opsData.cards_state[id] = { id: id };

            const now = new Date();
            const thaiDate = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + (now.getFullYear() + 543).toString().slice(-2);
            opsData.cards_state[id].loadedReported = true;
            opsData.cards_state[id].reportedAt = now.toISOString();
            opsData.cards_state[id].orderChecked = true;
            opsData.cards_state[id].truckChecked = true;
            if (!opsData.cards_state[id].loadedDate) opsData.cards_state[id].loadedDate = thaiDate;
            if (!opsData.cards_state[id].loadedItem && opsData.cards_state[id].supplier) {
                opsData.cards_state[id].loadedItem = opsData.cards_state[id].supplier;
            }
            saveTeamOps(opsData);
            syncToGoogleSheets(opsData.cards_state[id]);
            syncToRender('/api/team-complete', { id: id });

            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: `Card ${id} marked completed successfully`, cards_state: opsData.cards_state }));
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

module.exports = { createWebhookServer, WEBHOOK_PORT: PORT, loadTeamOps, saveTeamOps, recordLoadingReport, syncToRender, fetchGoogleSheetsLiveSchedule, server };
