const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const memoryEngine = require('./memory_engine.js');
const lineNotifier = require('./line_notifier.js');

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 8080;
const teamOpsFile = path.join(__dirname, 'team_ops_status.json');
const mobileHtmlFile = path.join(__dirname, 'ops_mobile_web.html');

function loadTeamOps() {
    let data = { last_updated: new Date().toISOString(), active_operations: [], history_logs: [], cards_state: {} };
    if (fs.existsSync(teamOpsFile)) {
        try {
            data = Object.assign(data, JSON.parse(fs.readFileSync(teamOpsFile, 'utf8')));
            if (!data.cards_state) data.cards_state = {};
        } catch (e) {}
    }
    return data;
}

function exportMarkdownOpsLog(data) {
    try {
        const logMdFile = path.join(__dirname, 'TEAM_OPS_LOG.md');
        const cards = data.cards_state || {};
        const activeOps = data.active_operations || [];
        
        const cardRows = Object.keys(cards).map(id => {
            const c = cards[id] || {};
            let status = '⏳ รอดำเนินการ';
            if (c.loadedReported) status = '🎉 ส่งของเสร็จสิ้นแล้ว';
            else if (c.orderChecked && c.truckChecked) status = '✅ สั่งของ & สั่งรถแล้ว';
            else if (c.orderChecked) status = '🌿 สั่งของแล้ว (รอยืนยันรถ)';
            else if (c.truckChecked) status = '🚛 จองรถแล้ว (รอยืนยันของ)';
            
            return `| \`${id}\` | ${c.supplier || '-'} | ${c.truck || '-'} | ${c.orderChecked ? '✓' : '-'} | ${c.truckChecked ? '✓' : '-'} | ${c.loadedReported ? '✓' : '-'} | **${status}** |`;
        }).join('\n');

        const mdContent = `# 📋 PSC Field Operations & Procurement Log (บันทึกงานจัดซื้อ & ขนส่งภาคสนาม)
**อัปเดตล่าสุด:** ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (Host File: \`team_ops_status.json\`)

---

## 🚚 1. สถานะการเตรียมงานรายรายการ (Current Card States)
| ID รายการ | สวน / ผู้ขาย | รถขนส่ง | สั่งของ | สั่งรถ | ส่งแล้ว | สถานะปัจจุบัน |
|---|---|---|---|---|---|---|
${cardRows || '| - | - | - | - | - | - | ไม่มีข้อมูล |'}

---

## 📝 2. ประวัติการบันทึกงานล่าสุด (Recent Activity History - ${activeOps.length} รายการ)
${activeOps.slice(-15).reverse().map(op => `* **[${op.timestamp ? op.timestamp.slice(0, 19).replace('T', ' ') : '-'}] ${op.customer} (${op.delivery_date}):** ${op.product} ${op.qty_kg ? op.qty_kg.toLocaleString() + ' kg' : ''} | สวน: ${op.farm || '-'} | รถ: ${op.truck || '-'} | สถานะ: \`${op.status || '-'}\``).join('\n')}

---
*บันทึกข้อมูลอัตโนมัติลงเครื่อง Host (PSC Secretary Brain Gateway)*
`;
        fs.writeFileSync(logMdFile, mdContent, 'utf8');
    } catch (e) {
        console.error('Error writing TEAM_OPS_LOG.md:', e);
    }
}

function saveTeamOps(data) {
    data.last_updated = new Date().toISOString();
    // 1. Primary host JSON
    fs.writeFileSync(teamOpsFile, JSON.stringify(data, null, 2), 'utf8');

    // 2. Cloud mirror JSON
    const cloudFile = path.join(__dirname, 'cloud_secretary', 'team_ops_status.json');
    if (fs.existsSync(path.dirname(cloudFile))) {
        try { fs.writeFileSync(cloudFile, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {}
    }

    // 3. Human-readable Markdown log on Host
    exportMarkdownOpsLog(data);

    // 4. Daily backup directory on Host
    const backupDir = path.join(__dirname, 'ops_backup');
    if (!fs.existsSync(backupDir)) {
        try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {}
    }
    const dailyBackup = path.join(backupDir, `team_ops_${new Date().toISOString().slice(0, 10)}.json`);
    try { fs.writeFileSync(dailyBackup, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {}
}

function recordLoadingReport(reportObj) {
    const opsData = loadTeamOps();
    if (!opsData.cards_state) opsData.cards_state = {};
    opsData.cards_state[reportObj.cardId] = {
        id: reportObj.cardId,
        loadedReported: true,
        loadedDate: reportObj.date,
        loadedItem: reportObj.item,
        loadedWeight: reportObj.weight,
        loadedFreight: reportObj.freight,
        loadedPayment: reportObj.payment,
        loadedLocation: reportObj.location,
        rawReport: reportObj.rawText,
        reportedAt: new Date().toISOString()
    };

    const opId = `OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`;
    opsData.active_operations.push({
        id: opId,
        timestamp: new Date().toISOString(),
        customer: reportObj.cardId.startsWith('salaya') ? 'โรงงานศาลายา' : 'TNS',
        delivery_date: reportObj.date,
        farm: reportObj.item,
        product: reportObj.item,
        qty_kg: parseInt(reportObj.weight.replace(/\D/g, '')) || 0,
        truck: reportObj.freight + (reportObj.payment ? ' (' + reportObj.payment + ')' : ''),
        status: 'ขึ้นของและส่งรายงานแล้ว',
        recorder: 'รายงานทาง Telegram',
        notes: reportObj.rawText
    });

    saveTeamOps(opsData);
    return opsData.cards_state[reportObj.cardId];
}

/**
 * Live Secretary Brain Webhook API Server
 */
function createWebhookServer(sendTelegramMsgCallback) {
    const server = http.createServer(async (req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Helper to parse JSON body
        const getBody = () => new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (e) {
                    reject(new Error('Invalid JSON payload: ' + e.message));
                }
            });
            req.on('error', reject);
        });

        try {
            // 1. Serve Mobile Web UI (GET /ops or GET /team-app)
            if (req.method === 'GET' && (pathname === '/ops' || pathname === '/team-app' || pathname === '/field')) {
                if (fs.existsSync(mobileHtmlFile)) {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.writeHead(200);
                    return res.end(fs.readFileSync(mobileHtmlFile, 'utf8'));
                }
            }

            // Set JSON Content-Type for all API routes
            res.setHeader('Content-Type', 'application/json; charset=utf-8');

            // 2. Health & Status (GET / or GET /api/status)
            if (req.method === 'GET' && (pathname === '/' || pathname === '/api/health' || pathname === '/api/status')) {
                const mem = memoryEngine.loadMemory();
                const ops = loadTeamOps();
                res.writeHead(200);
                return res.end(JSON.stringify({
                    status: 'ONLINE',
                    service: 'PSC Secretary Brain & Field Ops Gateway',
                    port: WEBHOOK_PORT,
                    timestamp: new Date().toISOString(),
                    mobileWebAppUrl: `http://localhost:${WEBHOOK_PORT}/ops`,
                    memoryStats: {
                        learnedFactsCount: (mem.learned_facts || []).length,
                        businessRulesCount: (mem.business_rules || []).length
                    },
                    activeOpsCount: (ops.active_operations || []).length
                }, null, 2));
            }

            // 3. Team Ops Ingestion & Selection Sync (POST /api/team-update)
            if (req.method === 'POST' && (pathname === '/api/team-update' || pathname === '/api/ops')) {
                const body = await getBody();
                const { id, farm, truck, product, qty_kg, customer, delivery_date, status, recorder, notes, orderChecked, truckChecked } = body;

                const opsData = loadTeamOps();
                if (!opsData.cards_state) opsData.cards_state = {};

                if (id) {
                    if (!opsData.cards_state[id]) opsData.cards_state[id] = { id: id };
                    if (farm !== undefined) opsData.cards_state[id].supplier = farm;
                    if (truck !== undefined) opsData.cards_state[id].truck = truck;
                    if (orderChecked !== undefined) opsData.cards_state[id].orderChecked = orderChecked;
                    if (truckChecked !== undefined) opsData.cards_state[id].truckChecked = truckChecked;
                }

                if (farm && product && qty_kg) {
                    const opId = `OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`;
                    const newOp = {
                        id: opId,
                        timestamp: new Date().toISOString(),
                        customer: customer || 'โรงงานศาลายา / TNS',
                        delivery_date: delivery_date || '2026-09-01',
                        farm: farm,
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
                    message: 'Updated successfully',
                    cards_state: opsData.cards_state
                }, null, 2));
            }

            // 4. Team Card Reset (POST /api/team-reset)
            if (req.method === 'POST' && pathname === '/api/team-reset') {
                const body = await getBody();
                const { id } = body;
                const opsData = loadTeamOps();
                if (opsData.cards_state && opsData.cards_state[id]) {
                    opsData.cards_state[id].loadedReported = false;
                    saveTeamOps(opsData);
                }
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: `Card ${id} reset successfully` }));
            }

            // 5. Get Team Ops Status & Cards State (GET /api/team-status)
            if (req.method === 'GET' && pathname === '/api/team-status') {
                const ops = loadTeamOps();
                res.writeHead(200);
                return res.end(JSON.stringify(ops, null, 2));
            }

            // 5. Ingest Memory / Learn Fact (POST /api/memory/remember)
            if (req.method === 'POST' && (pathname === '/api/memory/remember' || pathname === '/api/memory')) {
                const body = await getBody();
                const text = body.text || body.fact || body.rule;
                const category = body.category || 'learned_facts';
                const notifyTG = body.notify_telegram !== false;

                if (!text) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: 'Missing "text" field in payload' }));
                }

                memoryEngine.rememberItem(text, category);

                if (notifyTG && sendTelegramMsgCallback) {
                    const icon = (category === 'business_rules') ? '📜' : (category === 'custom_directives') ? '⚡' : '💡';
                    const categoryTitle = (category === 'business_rules') ? 'กฎการทำงาน' : (category === 'custom_directives') ? 'คำสั่งเฉพาะ' : 'ข้อมูลธุรกิจใหม่';
                    const tgCard = `📡 [รับข้อมูลเข้าสมองเลขาผ่าน Webhook]\n` +
                                   `──────────────────\n` +
                                   `${icon} ประเภท: ${categoryTitle}\n` +
                                   `📝 เนื้อหาที่บันทึก:\n${text}\n` +
                                   `──────────────────\n` +
                                   `💾 บันทึกลงหน่วยความจำถาวร & GEMINI.md เรียบร้อย ✨`;
                    sendTelegramMsgCallback(tgCard);
                }

                res.writeHead(200);
                return res.end(JSON.stringify({
                    success: true,
                    message: 'Data ingested into Secretary Brain successfully',
                    category: category,
                    savedContent: text
                }, null, 2));
            }

            // 6. Get/Save LINE Config
            if (pathname === '/api/line-config') {
                if (req.method === 'GET') {
                    const cfg = lineNotifier.loadLineConfig();
                    res.writeHead(200);
                    return res.end(JSON.stringify(cfg, null, 2));
                }
                if (req.method === 'POST') {
                    const body = await getBody();
                    const currentCfg = lineNotifier.loadLineConfig();
                    const merged = Object.assign(currentCfg, body);
                    lineNotifier.saveLineConfig(merged);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: true, message: 'บันทึกการตั้งค่า LINE สำเร็จค่ะ', config: merged }, null, 2));
                }
            }

            // 7. Test Send LINE Message
            if (req.method === 'POST' && pathname === '/api/line-test') {
                const todayStr = new Date().toISOString().slice(0, 10);
                const testMsg = lineNotifier.generateD1LineMessage(todayStr);
                const result = await lineNotifier.sendLineMessage(testMsg);
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, result: result }, null, 2));
            }

            // 8. LINE Webhook Endpoint (Auto-captures Group ID and replies)
            if (pathname === '/api/line-webhook' && req.method === 'POST') {
                const body = await getBody();
                console.log('[LINE WEBHOOK] Event Received:', JSON.stringify(body));

                const events = body.events || [];
                for (const ev of events) {
                    const source = ev.source || {};
                    const groupId = source.groupId || source.roomId;
                    const replyToken = ev.replyToken;

                    if (groupId) {
                        const cfg = lineNotifier.loadLineConfig();
                        cfg.line_target_group_id = groupId;
                        lineNotifier.saveLineConfig(cfg);
                        console.log('>>> [LINE WEBHOOK] Successfully captured PSC Group ID:', groupId);

                        // Send confirmation message to the group
                        const replyMsg = `🟢 [น้องเลขา PSC เชื่อมต่อกลุ่มทีมงานสำเร็จแล้วค่ะ] ✨\n──────────────────\n📌 บันทึกกลุ่มนี้สำหรับระบบแจ้งเตือนอัตโนมัติเรียบร้อยแล้วค่ะ\n⏰ ทุกเช้าเวลา 08:00 น. ตรง น้องเลขาจะส่งสรุปตารางขึ้นของ D-1 และสถานะจัดซื้อเข้ากลุ่มนี้นะคะ\n──────────────────\n🌐 ดูแดชบอร์ดงานสด:\nhttps://hours-wagner-pacific-kinda.trycloudflare.com/ops`;
                        lineNotifier.sendLineMessage(replyMsg).catch(e => console.error('Reply err:', e));
                    }
                }

                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: 'Webhook received' }));
            }

            // 404 Not Found
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Endpoint "${pathname}" not found.` }));

        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
    });

    lineNotifier.initDailyLineScheduler();
    server.listen(WEBHOOK_PORT, '0.0.0.0', () => {
        console.log(`📡 [Secretary Webhook API] Server listening on http://0.0.0.0:${WEBHOOK_PORT}`);
    });

    return server;
}

module.exports = { createWebhookServer, WEBHOOK_PORT, loadTeamOps, recordLoadingReport };
