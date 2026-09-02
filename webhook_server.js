const memoryEngine = require('./memory_engine.js');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const quotaTracker = require('./ai_quota_tracker.js');

const PORT = process.env.PORT || 8080;
const mobileHtmlFile = path.join(__dirname, 'ops_mobile_web.html');
const teamOpsFile = path.join(__dirname, 'team_ops_status.json');
const stockFile = path.join(__dirname, 'stock_inventory.json');
const GAS_URL = process.env.GAS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzwaao-vW7IdWqltSpFMbN7KGlU2IydbAojKmGLdEJWQ6Q_g1wCXtA1i65n_S7FHk5H/exec';

const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8714398918:AAHryAFzpRwmtFSkPnJOsP8U8TO2CQ-yecM';
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1532466397';

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
    if (fs.existsSync(teamOpsFile)) {
        try {
            data = Object.assign(data, JSON.parse(fs.readFileSync(teamOpsFile, 'utf8')));
            if (!data.cards_state) data.cards_state = {};
            if (!data.custom_suppliers) data.custom_suppliers = [];
            if (!data.custom_trucks) data.custom_trucks = [];
        } catch (e) {}
    }
    return data;
}

function saveTeamOps(data) {
    data.last_updated = new Date().toISOString();
    try { fs.writeFileSync(teamOpsFile, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {}
}

const server = http.createServer(async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    const getBody = () => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', reject);
    });

    try {
        // 1. Serve Mobile Web UI for root or /ops
        if (req.method === 'GET' && (pathname === '/' || pathname === '/ops' || pathname === '/team-app' || pathname === '/field')) {
            if (fs.existsSync(mobileHtmlFile)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                return res.end(fs.readFileSync(mobileHtmlFile, 'utf8'));
            } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                return res.end('<h1>PSC Field Ops Dashboard</h1><p>Ops HTML file not found on server.</p>');
            }
        }

        // Set JSON Content-Type for all API endpoints
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        // Real-Time AI Usage & Quota Endpoint
        if (req.method === 'GET' && (pathname === '/api/usage' || pathname === '/api/quota' || pathname === '/api/ai-usage')) {
            const quotaData = quotaTracker.loadQuotaData();
            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                data: quotaData
            }, null, 2));
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
            if (fs.existsSync(stockFile)) {
                try {
                    stockData = JSON.parse(fs.readFileSync(stockFile, 'utf8'));
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

        // 3. Gmail Push Webhook Endpoint (Instant Notification to Telegram Bot)
        if (req.method === 'POST' && (pathname === '/api/gmail-webhook' || pathname === '/api/gmail-push')) {
            const body = await getBody();
            const from = body.from || 'ไม่ระบุผู้ส่ง';
            const subject = body.subject || 'ไม่มีหัวข้อ';
            const date = body.date ? new Date(body.date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : new Date().toLocaleString('th-TH');
            const snippet = (body.snippet || '').trim();
            const attNames = body.attachmentNames || [];

            console.log(`[Gmail Push Webhook] New Email from ${from}: ${subject}`);

            let tgMsg = `📬 <b>[มีอีเมลใหม่เข้าถึงเลขาแบบ Real-time]</b> ✨\n` +
                        `──────────────────\n` +
                        `👤 <b>ผู้ส่ง:</b> ${from}\n` +
                        `📌 <b>หัวข้อ:</b> ${subject}\n` +
                        `⏰ <b>เวลา:</b> ${date}\n`;

            if (attNames.length > 0) {
                tgMsg += `📎 <b>ไฟล์แนบ (${attNames.length}):</b> ${attNames.join(', ')}\n`;
            }

            if (snippet) {
                tgMsg += `📝 <b>ข้อความ:</b>\n<i>${snippet.substring(0, 300)}...</i>\n`;
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
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 PSC Field Ops Server listening on port ${PORT}`);
        });
    }
    return server;
}

if (require.main === module) {
    createWebhookServer(null);
}

module.exports = { createWebhookServer, WEBHOOK_PORT: PORT, loadTeamOps, server };
