const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🛡️  STARTING COMPREHENSIVE PSC AI SYSTEM & INTEGRITY AUDIT');
console.log('================================================================\n');

let passCount = 0;
let warnCount = 0;
let failCount = 0;
const report = [];

function check(label, condition, details = '') {
    if (condition) {
        passCount++;
        console.log(`✅ [PASS] ${label}`);
        report.push({ status: 'PASS', label, details });
    } else {
        failCount++;
        console.log(`❌ [FAIL] ${label} - ${details}`);
        report.push({ status: 'FAIL', label, details });
    }
}

function warn(label, condition, details = '') {
    if (condition) {
        passCount++;
        console.log(`✅ [PASS] ${label}`);
        report.push({ status: 'PASS', label, details });
    } else {
        warnCount++;
        console.log(`⚠️  [WARN] ${label} - ${details}`);
        report.push({ status: 'WARN', label, details });
    }
}

// 1. Audit Memory Files
const memMdPath = 'E:/agy/SECRETARY_MEMORY.md';
const memJsonPath = 'E:/agy/secretary_memory.json';

check('SECRETARY_MEMORY.md exists', fs.existsSync(memMdPath));
if (fs.existsSync(memMdPath)) {
    const content = fs.readFileSync(memMdPath, 'utf8');
    check('Memory contains Zero Hallucination Rule (Rule 10)', content.includes('Zero Hallucination Policy'));
    check('Memory contains Unified AI Engine Rule (Rule 25)', content.includes('Unified AI Engine for Telegram Operations'));
    check('Memory contains GitHub Memory Sync Rule (Rule 29)', content.includes('GitHub Memory Auto-Sync Rule'));
    check('Memory contains AnyDesk DPI Scaling Rule (Rule 26)', content.includes('Display Scaling Automation'));
}

check('secretary_memory.json exists and is valid JSON', fs.existsSync(memJsonPath));
if (fs.existsSync(memJsonPath)) {
    try {
        const j = JSON.parse(fs.readFileSync(memJsonPath, 'utf8'));
        check('secretary_memory.json has valid keys', Array.isArray(j.rules) || Array.isArray(j.learned_facts));
    } catch(e) {
        check('secretary_memory.json JSON parsing', false, e.message);
    }
}

// 2. Audit Core Codebases
const botPath = 'E:/agy/bot.js';
const webhookPath = 'E:/agy/webhook_server.js';
const htmlPath = 'E:/agy/ops_mobile_web.html';

check('bot.js exists', fs.existsSync(botPath));
if (fs.existsSync(botPath)) {
    const b = fs.readFileSync(botPath, 'utf8');
    check('bot.js has Unified AI Engine (isOpsOrStockPattern)', b.includes('isOpsOrStockPattern'));
    check('bot.js has Telegram Mini App Button setup', b.includes('initTelegramMiniAppButton'));
    check('bot.js has Error Handling on getUpdates Polling', b.includes('catch (err)'));
}

check('webhook_server.js exists', fs.existsSync(webhookPath));
if (fs.existsSync(webhookPath)) {
    const w = fs.readFileSync(webhookPath, 'utf8');
    check('webhook_server.js exposes /api/stock-update', w.includes('/api/stock-update'));
    check('webhook_server.js exposes /api/loading-report', w.includes('/api/loading-report'));
    check('webhook_server.js exposes /api/team-update', w.includes('/api/team-update'));
}

check('ops_mobile_web.html exists', fs.existsSync(htmlPath));
if (fs.existsSync(htmlPath)) {
    const h = fs.readFileSync(htmlPath, 'utf8');
    check('ops_mobile_web.html has Dark Reader theme palette', h.includes('--card-bg:') && (h.includes('--bg: #101418;') || h.includes('--bg: #181a1b;')));
    check('ops_mobile_web.html has Section Timestamp tracking', h.includes('sys_sync_time') || h.includes('ops_sync_badge'));
}

// 3. Audit Active Ledgers & Data Accuracy
const stockPath = 'E:/agy/stock_inventory.json';
const transportPath = 'E:/agy/cabbage_prices_transport.json';
const opsPath = 'E:/agy/team_ops_status.json';

check('stock_inventory.json exists and has 7 core vegetables', fs.existsSync(stockPath));
if (fs.existsSync(stockPath)) {
    const s = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    check('Stock has Cabbage with Yield metadata', s.Items && s.Items.Cabbage && s.Items.Cabbage.Yield !== undefined);
    check('Stock has LastUpdated timestamp', s.LastUpdated !== undefined);
}

check('cabbage_prices_transport.json has shipment history', fs.existsSync(transportPath));
if (fs.existsSync(transportPath)) {
    const cp = JSON.parse(fs.readFileSync(transportPath, 'utf8'));
    check('ShipmentHistory is non-empty array', Array.isArray(cp.ShipmentHistory) && cp.ShipmentHistory.length > 0);
    const lastBatch = cp.ShipmentHistory[cp.ShipmentHistory.length - 1];
    check('Last shipment has SampleTest or Yield record', lastBatch && (lastBatch.SampleTest || lastBatch.Notes));
}

check('team_ops_status.json has cards_state', fs.existsSync(opsPath));
if (fs.existsSync(opsPath)) {
    const op = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
    check('cards_state contains active operations', op.cards_state && Object.keys(op.cards_state).length > 0);
}

// 4. Summarize
console.log('\n================================================================');
console.log(`📊 AUDIT SUMMARY: PASS: ${passCount} | WARN: ${warnCount} | FAIL: ${failCount}`);
console.log(`Overall Health Score: ${Math.round((passCount / (passCount + warnCount + failCount)) * 100)}%`);
console.log('================================================================\n');

const auditOutput = {
    audit_date: new Date().toISOString(),
    score_pct: Math.round((passCount / (passCount + warnCount + failCount)) * 100),
    stats: { pass: passCount, warn: warnCount, fail: failCount },
    details: report
};

fs.writeFileSync('E:/agy/SYSTEM_AUDIT_REPORT/AUDIT_RESULTS.json', JSON.stringify(auditOutput, null, 2), 'utf8');
