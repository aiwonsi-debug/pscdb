const memoryEngine = require('./memory_engine.js');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const quotaTracker = require('./ai_quota_tracker.js');

const PORT = process.env.PORT || 8080;
const mobileHtmlFile = path.join(__dirname, 'ops_mobile_web.html');
const aiHtmlFile = path.join(__dirname, 'ai_dashboard.html');
const teamOpsFile = path.join(__dirname, 'team_ops_status.json');
const stockFile = path.join(__dirname, 'stock_inventory.json');
const PSC_API_KEY = (process.env.PSC_API_KEY || '').trim();
const GAS_URL = process.env.GAS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzwaao-vW7IdWqltSpFMbN7KGlU2IydbAojKmGLdEJWQ6Q_g1wCXtA1i65n_S7FHk5H/exec';

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
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(err) {}
        console.error('[saveTeamOps Cloud Error]:', e.message);
    }
}

const server = http.createServer(async (req, res) => {
    // CORS Headers: Restrict origin
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
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    const MAX_BODY_SIZE = 1 * 1024 * 1024;
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
                resolve(cleaned ? JSON.parse(cleaned) : {});
            } catch (e) {
                console.error('[getBody JSON Parse Error]:', e.message, 'Raw length:', body ? body.length : 0);
                reject(new Error('Invalid JSON payload: ' + e.message));
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

        // 2. Serve Mobile Operations Web UI (/ or /ops or /team-app or /field)
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

        // Security Guard: Authenticate all POST write endpoints (Fix unauthenticated write APIs)
        if (req.method === 'POST') {
            const reqKey = (req.headers['x-psc-api-key'] || req.headers['x-api-key'] || '').trim();
            const authHeader = (req.headers['authorization'] || '').trim();
            const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
            
            const isAuthorized = PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY));
            if (!isAuthorized) {
                res.writeHead(401);
                return res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Unauthorized: Missing or invalid API key. Provide valid X-PSC-API-KEY header.' 
                }));
            }
        }

        // 2. Real-Time AI Usage & Quota API
        
        // Sync Quota POST (Receive live stats from local machine)
        if (req.method === 'POST' && (pathname === '/api/sync-quota' || pathname === '/api/quota-sync')) {
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
            const isAuthorized = PSC_API_KEY && ((reqKey === PSC_API_KEY) || (bearerToken === PSC_API_KEY));
            if (!isAuthorized) {
                res.writeHead(401);
                return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Missing or invalid API key' }));
            }
            const quotaData = quotaTracker.loadQuotaData();
            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                data: quotaData
            }, null, 2));
        }

        
        // Bot Reboot Request from Cloud Dashboard
        if (req.method === 'POST' && (pathname === '/api/reboot-bot' || pathname === '/api/restart-bot')) {
            const ops = loadTeamOps();
            if (!ops.history_logs) ops.history_logs = [];
            ops.history_logs.unshift({
                timestamp: new Date().toISOString(),
                event: 'REBOOT_REQUEST',
                details: 'คำขอรีบูตบอทจาก Team Dashboard'
            });
            saveTeamOps(ops);
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: true, 
                message: 'บันทึกคำสั่งรีบูตขึ้นระบบคลาวด์แล้ว บอทจะรีสตาร์ตอัตโนมัติ' 
            }));
        }

        // 3. Health Check
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

        // Stock Update POST (Sync from Local Bot)
        if (req.method === 'POST' && pathname === '/api/stock-update') {
            const body = await getBody();
            if (!body || typeof body !== 'object' || !body.Items || typeof body.Items !== 'object') {
                res.writeHead(400);
                return res.end(JSON.stringify({ success: false, error: 'Invalid stock update schema. Must contain Items object.' }));
            }
            for (const key of Object.keys(body.Items)) {
                const itm = body.Items[key];
                if (!itm || typeof itm !== 'object' || typeof itm.StockKg !== 'number' || isNaN(itm.StockKg)) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: `Invalid stock item value for '${key}'. Must contain numeric StockKg.` }));
                }
            }
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

        // 4. Team Status GET
        // Stock Status GET
        if (req.method === 'GET' && (pathname === '/api/stock' || pathname === '/api/inventory')) {
            let data = { AsOfDate: '2026-09-02', Items: {} };
            if (fs.existsSync(stockFile)) {
                try { data = JSON.parse(fs.readFileSync(stockFile, 'utf8')); } catch(e) {}
            }
            res.writeHead(200);
            return res.end(JSON.stringify(data, null, 2));
        }

        if (req.method === 'GET' && pathname === '/api/team-status') {
            const ops = loadTeamOps();
            res.writeHead(200);
            return res.end(JSON.stringify(ops, null, 2));
        }

        // 5. Team Update POST (Syncs to Google Sheets)
        
        // Loading Report POST
        if (req.method === 'POST' && pathname === '/api/loading-report') {
            const body = await getBody();
            recordLoadingReport(body);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, message: 'Loading report saved' }));
        }

        if (req.method === 'POST' && (pathname === '/api/team-update' || pathname === '/api/ops')) {
            const body = await getBody();
            
            // If full ops data payload is provided from local sync
            if (body && (body.cards_state || body.active_operations)) {
                let currentOps = loadTeamOps();
                if (body.cards_state) currentOps.cards_state = Object.assign(currentOps.cards_state || {}, body.cards_state);
                if (body.active_operations) currentOps.active_operations = body.active_operations;
                if (body.history_logs) currentOps.history_logs = body.history_logs;
                if (body.custom_suppliers) currentOps.custom_suppliers = body.custom_suppliers;
                if (body.custom_trucks) currentOps.custom_trucks = body.custom_trucks;
                saveTeamOps(currentOps);
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: 'Full ops state synced' }));
            }

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

                // Auto-add new custom seller/location to database & memory
                if (activeSupplier && activeSupplier !== '__custom__' && activeSupplier.trim() !== '') {
                    const s = activeSupplier.trim();
                    if (!opsData.custom_suppliers.includes(s)) {
                        opsData.custom_suppliers.push(s);
                        try { memoryEngine.rememberItem('แหล่งสวน/ผู้ขายใหม่ที่เพิ่มจาก Dashboard: ' + s, 'learned_facts'); } catch(e) {}
                    }
                }
                // Auto-add new custom transport/truck to database & memory
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

function createWebhookServer(cb) {
    return server;
}

module.exports = { createWebhookServer, WEBHOOK_PORT: PORT, loadTeamOps };
