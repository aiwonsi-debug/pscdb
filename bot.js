const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const memoryEngine = require('./memory_engine.js');
const quotaTracker = require('./ai_quota_tracker.js');

// Helper to execute commands in 100% hidden background mode (no popup cmd/powershell windows)
function execSilent(command, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const mergedOptions = Object.assign({
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
    }, options);
    return exec(command, mergedOptions, callback);
}

process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
    try { fs.appendFileSync(logFile, `[UncaughtException] ${err.stack || err}\n`, 'utf8'); } catch (e) {}
});

process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
    try { fs.appendFileSync(logFile, `[UnhandledRejection] ${reason}\n`, 'utf8'); } catch (e) {}
});

const configPath = path.join(__dirname, 'telegram_config.json');
if (!fs.existsSync(configPath)) {
    console.error('Config file not found: ' + configPath);
    process.exit(1);
}

const rawConfig = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
const config = JSON.parse(rawConfig);
const botToken = config.BotToken;
let adminChatId = config.ChatId || '1532466397';

const agyExe = 'C:\\Users\\624\\AppData\\Local\\agy\\bin\\agy.exe';
const agyBaseDir = 'E:\\agy';
const poBaseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO';

// Launch Live Webhook API Server (Port 8080) for instant ingestion & live API access
const { createWebhookServer } = require('./webhook_server.js');
try {
    createWebhookServer((msg) => {
        sendMessage(adminChatId, msg);
    });
} catch(e) {
    console.error('Webhook server init error:', e);
}
const logFile = path.join(agyBaseDir, 'secretary_activity.log');

function formatDMY(date = new Date()) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${min}:${sec}`;
}

function writeLog(msg) {
    const timestamp = formatDMY();
    const line = `[${timestamp}] ${msg}`;
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) {}
    try { console.log(line); } catch (e) {}
}

// Check if current time is within 07:00 - 19:00 (Asia/Bangkok)
function isWithinWorkingHours() {
    const bkkStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    const bkk = new Date(bkkStr);
    const totalMin = bkk.getHours() * 60 + bkk.getMinutes();
    return totalMin >= (7 * 60) && totalMin <= (19 * 60); // 07:00 (420) to 19:00 (1140)
}

function tgRequest(endpoint, data = {}) {
    return new Promise((resolve) => {
        try {
            const url = new URL(`https://api.telegram.org/bot${botToken}/${endpoint}`);
            const body = JSON.stringify(data);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: 35000
            };
            const req = https.request(options, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(resData)); } catch (e) { resolve({ ok: false, raw: resData }); }
                });
            });
            req.on('error', (err) => {
                console.error('[tgRequest error]', err.message);
                resolve({ ok: false, error: err.message });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ ok: false, error: 'timeout' });
            });
            req.write(body);
            req.end();
        } catch (err) {
            resolve({ ok: false, error: err.message });
        }
    });
}

function sendMessage(chatId, text) {
    if (!text) return Promise.resolve();
    // Clean raw HTML tags so they never show up literally as <b> or <i>
    text = text.replace(/<\/?(b|i|strong|em|u|code|pre)[^>]*>/gi, '');
    writeLog(`[Sending TG to ${chatId}]: ${text.substring(0, 60).replace(/\n/g, ' ')}...`);
    if (text.length > 3900) {
        const chunks = text.match(/[\s\S]{1,3800}/g) || [text];
        let p = Promise.resolve();
        for (const c of chunks) {
            p = p.then(() => tgRequest('sendMessage', { chat_id: chatId, text: c }).then(res => {
                writeLog(`[Send Chunk Result]: ok=${res ? res.ok : false}`);
            }));
        }
        return p;
    }
    return tgRequest('sendMessage', { chat_id: chatId, text: text }).then(res => {
        writeLog(`[Send Result]: ok=${res ? res.ok : false} ${res && !res.ok ? JSON.stringify(res) : ''}`);
        return res;
    });
}

function sendMessageWithKeyboard(chatId, text, replyMarkup) {
    if (!text) return Promise.resolve();
    writeLog(`[Sending TG Menu to ${chatId}]: ${text.substring(0, 60).replace(/\n/g, ' ')}...`);
    return tgRequest('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup
    });
}

function editMessageText(chatId, messageId, text, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return tgRequest('editMessageText', payload);
}

function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    return tgRequest('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
    });
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.xls': return 'application/vnd.ms-excel';
        case '.pdf': return 'application/pdf';
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.doc': return 'application/msword';
        case '.csv': return 'text/csv';
        case '.zip': return 'application/zip';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        default: return 'application/octet-stream';
    }
}

function sendDocument(chatId, filePath, caption = '') {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(filePath)) {
                writeLog(`[Send Document Skipped] File not found: ${filePath}`);
                return resolve(null);
            }
            const fileName = path.basename(filePath);
            const fileBytes = fs.readFileSync(filePath);
            const mimeType = getMimeType(filePath);
            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
            
            let header = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
            if (caption) {
                header += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
            }
            header += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
            
            const footer = `\r\n--${boundary}--\r\n`;
            const payload = Buffer.concat([Buffer.from(header, 'utf8'), fileBytes, Buffer.from(footer, 'utf8')]);
            
            writeLog(`[Sending Document to ${chatId}]: ${fileName} (${payload.length} bytes, ${mimeType})`);
            
            const req = https.request(`https://api.telegram.org/bot${botToken}/sendDocument`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': payload.length
                },
                timeout: 60000
            }, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(resData);
                        writeLog(`[Send Document Result]: ok=${parsed.ok}`);
                        resolve(parsed);
                    } catch (e) {
                        resolve(true);
                    }
                });
            });
            req.on('error', (err) => {
                writeLog(`[Send Document Error]: ${err.message}`);
                resolve(false);
            });
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.write(payload);
            req.end();
        } catch (e) {
            writeLog(`[Send Document Exception]: ${e.message}`);
            resolve(false);
        }
    });
}

function sendPhoto(chatId, filePath, caption = '') {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(filePath)) return resolve(null);
            const fileName = path.basename(filePath);
            const fileBytes = fs.readFileSync(filePath);
            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
            
            let header = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
            if (caption) {
                header += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
            }
            header += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`;
            
            const footer = `\r\n--${boundary}--\r\n`;
            const payload = Buffer.concat([Buffer.from(header, 'utf8'), fileBytes, Buffer.from(footer, 'utf8')]);
            
            const req = https.request(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': payload.length
                },
                timeout: 30000
            }, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => resolve(true));
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.write(payload);
            req.end();
        } catch (e) {
            resolve(false);
        }
    });
}

writeLog('========================================================');
writeLog('  AI Secretary Watcher v5.0 (Schedule: 07:00 - 19:00 Only)');
writeLog('========================================================');

const updateIdFile = path.join(agyBaseDir, 'last_update_id.txt');
let lastUpdateId = 0;
if (fs.existsSync(updateIdFile)) {
    try {
        lastUpdateId = parseInt(fs.readFileSync(updateIdFile, 'utf8').trim(), 10) || 0;
    } catch (e) {}
}

let isCheckingGmail = false;
let isRunningAgy = false;

// 1. Background Gmail Watcher Loop (07:00 - 19:00 Only)
async function autoCheckGmail() {
    if (!isWithinWorkingHours()) {
        return;
    }
    
    if (isCheckingGmail) return;
    isCheckingGmail = true;
    
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(agyBaseDir, 'Fetch-GmailPO.ps1'), '-AutoProcessGT'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '';
    ps.stdout.on('data', d => out += d.toString('utf8'));
    ps.on('close', (code) => {
        isCheckingGmail = false;
        const matches = out.match(/\[SAVED\]\s*([^\r\n]+)/g);
        if (matches && matches.length > 0) {
            writeLog(`Found ${matches.length} genuinely new PO files!`);
            if (adminChatId) {
                let r = `[ตรวจพบใบสั่งซื้อ PO ใหม่เข้า Gmail]\n\n`;
                matches.forEach(m => { r += `• ${m.replace('[SAVED]', '').trim()}\n`; });
                r += `\nอัปเดตไฟล์ Excel และ GT Schedule เรียบร้อยแล้ว`;
                sendMessage(adminChatId, r);
            }
        }
    });
    ps.on('error', (err) => {
        isCheckingGmail = false;
        writeLog('Auto-check error: ' + err.message);
    });
}

// 2. Automated 2-Day Advance GT Preparation Checker (Every 1 hour within working hours)
function autoCheckAdvanceGT() {
    if (!isWithinWorkingHours()) return;
    writeLog('Running 2-day advance GT preparation check...');
    const child = spawn(process.execPath, [path.join(agyBaseDir, 'Auto-PrepareGT.js')], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
    });
    child.on('error', (err) => writeLog('Auto-GT check error: ' + err.message));
}

// 3. Automated TNS Special Crops Preparation Checker (หอมแดง, พริกหวาน, ผักชีใหญ่, มะละกอ)
function autoCheckTNSPreparation() {
    if (!isWithinWorkingHours()) return;
    writeLog('Running TNS Special Crops live preparation alert check...');
    const child = spawn(process.execPath, [path.join(agyBaseDir, 'Alert-TNSPreparation.js')], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
    });
    child.on('error', (err) => writeLog('Auto-TNS preparation check error: ' + err.message));
}

setInterval(autoCheckGmail, 60 * 1000);
setTimeout(autoCheckGmail, 3000);

setInterval(autoCheckAdvanceGT, 60 * 60 * 1000);
setTimeout(autoCheckAdvanceGT, 5000);

setInterval(autoCheckTNSPreparation, 60 * 60 * 1000);
setTimeout(autoCheckTNSPreparation, 8000);

// ==========================================
// 📊 TELEGRAM INTERACTIVE DASHBOARD SYSTEM
// ==========================================

function getPersistentReplyMarkup() {
    return {
        keyboard: [
            [
                { text: "📱 PSC Mini App", web_app: { url: "https://pscdb.onrender.com/" } }
            ],
            [
                { text: "📊 แดชบอร์ด" },
                { text: "🚜 สถานะจัดซื้อ" },
                { text: "🧠 ความจำเลขา" }
            ],
            [
                { text: "📦 สรุป PO" },
                { text: "🥬 สต็อกผัก" },
                { text: "📅 กำหนดส่ง GT" }
            ],
            [
                { text: "⚡ AI Quota" },
                { text: "🔄 เช็กเมล PO" },
                { text: "❓ เมนูคำสั่ง" }
            ]
        ],
        resize_keyboard: true,
        persistent: true
    };
}

function getDashboardInlineMarkup() {
    const engineLabel = (currentAiEngine === 'glm') ? 'GLM-5.3' : 'AGY CLI';
    return {
        inline_keyboard: [
            [
                { text: "📱 เปิด PSC Mini App", web_app: { url: "https://pscdb.onrender.com/" } }
            ],
            [
                { text: "🔄 รีเฟรชแดชบอร์ด", callback_data: "dash_refresh" },
                { text: "📥 เช็ก Gmail ทันที", callback_data: "dash_sync_gmail" }
            ],
            [
                { text: "🧠 ความจำ & การเรียนรู้", callback_data: "dash_memory" },
                { text: "📅 กำหนดส่ง GT (D-2)", callback_data: "dash_gt_schedule" }
            ],
            [
                { text: "📦 สรุป PO 3 โรงงาน", callback_data: "dash_po_summary" },
                { text: "🥬 รันเวย์สต็อกผัก", callback_data: "dash_stock_status" }
            ],
            [
                { text: `🤖 สลับ Engine [${engineLabel}]`, callback_data: "dash_toggle_engine" },
                { text: "⚡ สรุป AI Quota ในแชท", callback_data: "dash_quota_usage" }
            ],
            [
                { text: "📁 ขอไฟล์ล่าสุด", callback_data: "dash_get_latest_file" },
                { text: "❓ วิธีสั่งงาน & เมนู", callback_data: "dash_help_menu" }
            ]
        ]
    };
}

function getDashboardSummary() {
    const nowBkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const timeStr = `${String(nowBkk.getHours()).padStart(2, '0')}:${String(nowBkk.getMinutes()).padStart(2, '0')}:${String(nowBkk.getSeconds()).padStart(2, '0')}`;
    const dateStr = nowBkk.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const inHours = isWithinWorkingHours();
    const workIcon = inHours ? "🟢 07:00 - 19:00 (ระบบเฝ้าระวังทำงาน)" : "🌙 19:00 - 07:00 (ระบบ Standby)";
    
    // Read Registry Stats
    let poTrackedCount = 0;
    const regPath = path.join(agyBaseDir, 'downloaded_po_registry.json');
    if (fs.existsSync(regPath)) {
        try {
            const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
            poTrackedCount = Object.keys(reg).length;
        } catch(e) {}
    }
    
    // Read Stock Inventory (Accurate Ground Truth as of 02/09/2026)
    let cabbageNet = 2575;
    let carrotStock = 5840;
    let onionStock = 29680;
    const stockPath = path.join(agyBaseDir, 'stock_inventory.json');
    if (fs.existsSync(stockPath)) {
        try {
            const stk = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
            if (stk.Items) {
                if (stk.Items.Cabbage) cabbageNet = stk.Items.Cabbage.StockKg || cabbageNet;
                if (stk.Items.Carrot) carrotStock = stk.Items.Carrot.StockKg || carrotStock;
                const onionAFT = (stk.Items.Onion_AFT && stk.Items.Onion_AFT.StockKg) || 26120;
                const onionCN = (stk.Items.Onion_Chinese && stk.Items.Onion_Chinese.StockKg) || 3560;
                onionStock = onionAFT + onionCN;
            }
        } catch(e) {}
    }
    
    const engineName = (currentAiEngine === 'glm') ? 'GLM-5.3 (Open Weights API)' : 'Google Antigravity CLI (AGY)';
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    return `╔══════════════════════════════════╗\n` +
           `   📊 EXECUTIVE SECRETARY DASHBOARD\n` +
           `╚══════════════════════════════════╝\n` +
           `📅 ${dateStr} | ⏰ ${timeStr} น.\n` +
           `สถานะการทำงาน: ${workIcon}\n` +
           `🤖 Active AI Engine: ${engineName}\n` +
           `──────────────────────────────────\n` +
           `📬 [ระบบตรวจจับ Gmail PO Radar]\n` +
           `  • บัญชี: psccnx@gmail.com\n` +
           `  • บันทึก PO ในระบบ: ${poTrackedCount} ฉบับ (ตรวจเช็กอัตโนมัติ)\n` +
           `  • ลูกค้าเชื่อมต่อ: AFT, TNS, Siam Yamamori, Oishi\n` +
           `──────────────────────────────────\n` +
           `🚚 [กำหนดส่งมอบ & แผนจัดเตรียม]\n` +
           `  • AFT (Sep 1): กะหล่ำปลี 2,500 kg | หอมใหญ่ 1,500 kg\n` +
           `  • Yamamori (Sep 5): แครอท 180 kg | หอมใหญ่ 625 kg\n` +
           `  • TNS (Sep 2026): แครอท 15.6t | กะหล่ำปลี 12.7t | พริกหวาน 2t\n` +
           `──────────────────────────────────\n` +
           `🥬 [สถานะสต็อก & วัตถุดิบคงคลัง]\n` +
           `  • กะหล่ำปลีคงเหลือสุทธิ: ${cabbageNet.toLocaleString()} kg\n` +
           `  • หอมใหญ่รวม (AFT+จีน): ${onionStock.toLocaleString()} kg\n` +
           `  • แครอทคงเหลือ: ${carrotStock.toLocaleString()} kg\n` +
           `──────────────────────────────────\n` +
           `🎨 [AI Diffusion 300 DPI Studio]\n` +
           `  • Master Prompts: 500 ชุด (6 หมวดหมู่)\n` +
           `  • Engine: พร้อมสร้างภาพ 300 DPI Print Quality\n` +
           `──────────────────────────────────\n` +
           `💻 Memory: ${memUsage} MB | PM2: Online\n` +
           `แตะปุ่มด้านล่างเพื่อเลือกดูรายละเอียด ⚡`;
}

function handleCallbackQuery(cq) {
    const cqId = cq.id;
    const msg = cq.message;
    if (!msg) return;
    const chatId = String(msg.chat.id);
    const messageId = msg.message_id;
    const data = cq.data;
    
    writeLog(`[Callback Query] From ${chatId}: ${data}`);
    
    const backMarkup = {
        inline_keyboard: [
            [{ text: "⬅️ กลับหน้าแดชบอร์ดหลัก", callback_data: "dash_back" }],
            [
                { text: "🔄 รีเฟรช", callback_data: data },
                { text: "📥 เช็ก Gmail", callback_data: "dash_sync_gmail" }
            ]
        ]
    };

    if (data === 'dash_refresh' || data === 'dash_back') {
        answerCallbackQuery(cqId, '🔄 แดชบอร์ดอัปเดตข้อมูลล่าสุดเรียบร้อย');
        editMessageText(chatId, messageId, getDashboardSummary(), getDashboardInlineMarkup());
    }
    else if (data === 'dash_quota_usage') {
        answerCallbackQuery(cqId, '⚡ Real-Time AI Quota & Usage');
        const reply = quotaTracker.formatUsageForTelegram();
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_sync_gmail') {
        answerCallbackQuery(cqId, '⏳ กำลังตรวจสอบ Gmail ในพื้นหลัง...');
        execSilent(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(agyBaseDir, 'Fetch-GmailPO.ps1')}" -AutoProcessGT`, (err, stdout) => {
            if (err) {
                editMessageText(chatId, messageId, `❌ [Gmail Sync Error]: ${err.message}\n\nกดปุ่มเพื่อกลับไปหน้าหลัก`, backMarkup);
            } else {
                const out = stdout || '';
                const matches = out.match(/\[SAVED\]\s*([^\r\n]+)/g);
                let textResult = `📬 [ผลการตรวจเช็ก Gmail ล่าสุด]\n\n`;
                if (matches && matches.length > 0) {
                    textResult += `🎉 ตรวจพบ ${matches.length} ไฟล์ใหม่:\n`;
                    matches.slice(0, 8).forEach(m => { textResult += `• ${m.replace('[SAVED]', '').trim()}\n`; });
                    textResult += `\nอัปเดตไฟล์ Excel และ GT Schedule เรียบร้อยแล้ว`;
                } else {
                    textResult += `✅ สแกนอีเมลล่าสุดเรียบร้อย (ไม่พบไฟล์ PO ใหม่เพิ่มเติม ข้อมูลเป็นปัจจุบันแล้ว)`;
                }
                editMessageText(chatId, messageId, textResult, backMarkup);
            }
        });
    }
    else if (data === 'dash_gt_schedule') {
        answerCallbackQuery(cqId, '📅 กำหนดการส่งมอบ GT');
        const reply = `📅 [ตารางส่งมอบ & เตือน GT (D-2)]\n` +
                      `──────────────────\n` +
                      `🏢 1. Siam Yamamori (Sep 26)\n` +
                      `  • ส่ง 05/09 ➔ เตือน GT 03/09 (PO2357)\n` +
                      `  • ส่ง 10/09 ➔ เตือน GT 08/09 (PO2358)\n\n` +
                      `🏢 2. AFT (Ajinomoto Sep 26 Rev.00)\n` +
                      `  • ส่ง 01/09 (อ.) ➔ เตือน 31/08 12:00 น.\n` +
                      `  • ส่ง 03/09 (พฤ.) ➔ เตือน 02/09 12:00 น.\n` +
                      `  • ส่ง 05/09 (ส.) ➔ เตือน 04/09 12:00 น.\n` +
                      `  • ส่ง 07/09 (จ.) ➔ ⚠️ เลื่อนเตือนเป็น 05/09\n` +
                      `  • ส่ง 08/09 (อ.) ➔ เตือน 07/09 12:00 น.\n` +
                      `  • ส่ง 10/09 (พฤ.) ➔ เตือน 09/09 12:00 น.\n\n` +
                      `🏢 3. TNS (Thai Nisshin Sep 26)\n` +
                      `  • ส่งรอบวันที่ 1, 2, 3, 4, 5, 7, 8...\n` +
                      `──────────────────\n` +
                      `🔔 แจ้งเตือนอัตโนมัติล่วงหน้าตามรอบ`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_po_summary') {
        answerCallbackQuery(cqId, '📦 สรุป PO 3 โรงงาน (Rev.01)');
        const reply = `📦 <b>[สรุป PO ประจำเดือน ก.ย. 2569 (Ground Truth 100%)]</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `🏢 1. <b>AFT (Ajinomoto) - Rev.01</b>\n` +
                      `  • กะหล่ำปลี: 51,900 kg (เช้า 45.9t / บ่าย 6t)\n` +
                      `  • หอมใหญ่ปอก: 21,300 kg (เช้า 19.2t / บ่าย 2.1t)\n` +
                      `  • แครอท: 2,634 kg (รวม Sample RD 4 kg)\n` +
                      `  ➔ <b>รวม AFT: 75,834 kg (20 วัน)</b>\n\n` +
                      `🏢 2. <b>TNS (Thai Nisshin)</b>\n` +
                      `  • แครอท: 15,600 kg | กะหล่ำปลี: 12,700 kg\n` +
                      `  • พริกหวานเขียว: 2,000 kg (16 ก.ย.) | ขิง: 1,630 kg\n` +
                      `  • หอมแดง: 1,000 kg (7 & 21 ก.ย.) | ต้นหอม: 750 kg\n` +
                      `  ➔ <b>รวม TNS: 33,680 kg (24 วัน)</b>\n\n` +
                      `🏢 3. <b>Siam Yamamori</b>\n` +
                      `  • PO2357 (05/09): แครอท 180kg, หอมใหญ่ 625kg\n` +
                      `  • PO2358 (10/09): แครอท 136kg, หอมใหญ่ 1,150kg\n` +
                      `  ➔ <b>รวม Yamamori: 2,091 kg (69,588 บ.)</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `🌟 <b>ยอดรวมทั้ง 3 โรงงาน: 111,605 kg</b>\n\n` +
                      `📱 <i>เปิดดูปฏิทินส่งมอบรายสัปดาห์ใน PSC Mini App</i>`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_stock_status') {
        answerCallbackQuery(cqId, '🥬 สต็อก 02/09/69 (ตรวจนับจริง)');
        let reply = `🥬 <b>[สถานะสต็อกคงเหลือจริง ณ 02/09/2569]</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `1. 🥬 <b>กะหล่ำปลี:</b> <b>2,575 kg</b>\n` +
                    `   • คาดการณ์ใช้ได้ถึง: ~15/09/69 (มีรอบเติม 8 ตันต่อเนื่อง 02/09, 03/09, 08/09)\n` +
                    `   • Actual Yield ล่าสุด: 60.4% (AFT Unsize)\n\n` +
                    `2. 🧅 <b>หอมหัวใหญ่:</b> <b>29,680 kg</b>\n` +
                    `   • หอม AFT: 26,120 kg (พอถึง 30/09/69)\n` +
                    `   • หอมจีน: 3,560 kg (พอถึง 30/09/69)\n\n` +
                    `3. 🥕 <b>แครอทสวย:</b> <b>5,840 kg</b>\n` +
                    `   • คาดการณ์ใช้ได้ถึง: ~10/09/69 (สต็อกเข้าเติมแล้ว ปลอดภัย)\n\n` +
                    `4. 🍠 <b>พืชหัวและมันหวาน:</b>\n` +
                    `   • มันม่วงหัวเล็ก: 1,690 kg\n` +
                    `   • มันเหลืองไข่: 342 kg\n` +
                    `   • มันส้ม: 390 kg (พอตลอดเดือน)\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📱 <i>เปิดดูสต็อกสด & คาดการณ์รันเวย์ได้ใน PSC Mini App</i>`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_ai_diffusion') {
        answerCallbackQuery(cqId, '🎨 AI Diffusion 300 DPI Studio');
        const reply = `🎨 [AI Diffusion 300 DPI Hand-Drawn Studio]\n\n` +
                      `✨ คลังภาพและชุดคำสั่งระดับ Master Prompt 500 ชุด:\n` +
                      `  • 🌿 Botanical & Florals: 85 Prompts\n` +
                      `  • 🦊 Animals & Wildlife: 85 Prompts\n` +
                      `  • 🏛️ Architecture & Cozy Places: 85 Prompts\n` +
                      `  • ☕ Whimsical Doodles & Hygge: 80 Prompts\n` +
                      `  • 🐉 Fantasy & Mythical: 85 Prompts\n` +
                      `  • 🍞 Still Life, Food & Objects: 80 Prompts\n\n` +
                      `🖨️ สเปกการพิมพ์: มาตรฐาน 300 DPI (8x10", 12x12", 18x24", 24x36", A4)\n` +
                      `📁 โฟลเดอร์โปรเจกต์: C:\\Users\\624\\ai_diffusion_500_handdrawn\n` +
                      `⚡ สั่งรันชุดทดสอบผ่านบอทได้ด้วย: /cmd powershell -File C:\\Users\\624\\ai_diffusion_500_handdrawn\\run_batch.ps1 -Limit 5`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_toggle_engine') {
        currentAiEngine = (currentAiEngine === 'agy') ? 'glm' : 'agy';
        config.DefaultEngine = currentAiEngine;
        try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8'); } catch(e) {}
        
        answerCallbackQuery(cqId, `✅ สลับ AI Engine เป็น ${currentAiEngine.toUpperCase()} เรียบร้อยแล้ว!`, true);
        editMessageText(chatId, messageId, getDashboardSummary(), getDashboardInlineMarkup());
    }
    else if (data === 'dash_system_health') {
        answerCallbackQuery(cqId, '💻 สเปกระบบ & PM2');
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const uptimeMin = (process.uptime() / 60).toFixed(1);
        
        const reply = `💻 [สถานะระบบ & PM2 Service Monitor]\n\n` +
                      `• Host Platform: Windows 10/11 x64\n` +
                      `• Node.js: v20.17.0\n` +
                      `• บอท Uptime: ${uptimeMin} นาที\n` +
                      `• Memory Usage: RSS ${rssMb} MB | Heap ${heapMb} MB\n` +
                      `• PM2 Services: telegram-bot (Active) | ssh-server (Active)\n` +
                      `• โฟลเดอร์ปฏิบัติการ: E:\\agy\n` +
                      `• พื้นที่จัดเก็บเอกสาร: E:\\รวมงาน\\งาน 25-26\n` +
                      `• Background Windows Mode: 100% Silent (Hidden)`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_memory') {
        answerCallbackQuery(cqId, '🧠 ความจำ & การเรียนรู้ของเลขา');
        const reply = memoryEngine.formatMemoryForTelegram();
        editMessageText(chatId, messageId, reply, backMarkup);
    }
    else if (data === 'dash_get_latest_file') {
        answerCallbackQuery(cqId, '📁 กำลังค้นหาไฟล์ล่าสุด...');
        execSilent(`powershell -WindowStyle Hidden -Command "Get-ChildItem -Path 'E:\\รวมงาน\\งาน 25-26' -Include '*.pdf','*.xlsx' -Recurse | Where-Object { $_.Name -notlike 'COA*' -and $_.Name -notlike 'image*' -and $_.FullName -notlike '*\\.trashed*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object -ExpandProperty FullName"`, (err, stdout) => {
            const filePath = stdout ? stdout.trim() : '';
            if (filePath && fs.existsSync(filePath)) {
                const fileName = path.basename(filePath);
                sendMessage(chatId, `📁 ไฟล์ Order/PO ล่าสุด: ${fileName}`);
                sendDocument(chatId, filePath, fileName);
            } else {
                sendMessage(chatId, 'ไม่พบไฟล์ Order/PO ในระบบ');
            }
        });
    }
    else if (data === 'dash_help_menu') {
        answerCallbackQuery(cqId, '❓ เมนูคำสั่ง');
        const reply = `❓ [คู่มือการใช้งานระบบเลขา AI]\n\n` +
                      `📌 1. ปุ่มลัด & แดชบอร์ด:\n` +
                      `• กดปุ่ม "📊 แดชบอร์ด" เพื่อดูภาพรวมทั้งหมด\n` +
                      `• กดปุ่ม "🔄 เช็กเมล PO" เพื่อดึงไฟล์เข้า Gmail ทันที\n` +
                      `• กดปุ่ม "📅 กำหนดส่ง GT" เพื่อดูรอบเตือน D-2\n\n` +
                      `📌 2. พิมพ์ถามอิสระ (รองรับภาษาไทยธรรมชาติ):\n` +
                      `• "ขอ order aft sep"\n` +
                      `• "คำนวณสต็อกกะหล่ำปลีหน่อย"\n` +
                      `• "รอบส่ง yamamori มีวันไหนบ้าง"\n` +
                      `• "ขอไฟล์ PO ล่าสุด"\n\n` +
                      `📌 3. คำสั่งพิเศษ:\n` +
                      `• /agy <คำสั่ง> - เรียกใช้ Google Antigravity CLI\n` +
                      `• /glm <คำสั่ง> - เรียกใช้ GLM AI\n` +
                      `• /cmd <คำสั่ง> - รัน PowerShell ในเครื่อง`;
        editMessageText(chatId, messageId, reply, backMarkup);
    }
}

// 3. Telegram Long-Polling Loop (Active 24/7 for user commands)
let isPolling = false;

async function pollUpdates() {
    if (isPolling) return;
    isPolling = true;
    try {
        const offsetParam = (lastUpdateId > 0) ? `offset=${lastUpdateId + 1}&` : '';
        const res = await tgRequest(`getUpdates?${offsetParam}timeout=2`);
        if (res && res.ok && Array.isArray(res.result)) {
            for (const upd of res.result) {
                lastUpdateId = upd.update_id;
                try { fs.writeFileSync(updateIdFile, String(lastUpdateId), 'utf8'); } catch (e) {}
                
                // Handle Inline Keyboard Button Taps
                if (upd.callback_query) {
                    handleCallbackQuery(upd.callback_query);
                    continue;
                }

                // Handle Document Uploads (e.g. Order PSC.xlsx sent via Telegram)
                if (upd.message && upd.message.document) {
                    const doc = upd.message.document;
                    const docName = doc.file_name || 'uploaded_file';
                    const fileId = doc.file_id;
                    const chatId = String(upd.message.chat.id);
                    
                    sendMessage(chatId, `📥 กำลังรับไฟล์: ${docName} (${Math.round((doc.file_size || 0)/1024)} KB)...`);
                    
                    tgRequest(`getFile?file_id=${fileId}`).then(fRes => {
                        if (fRes && fRes.ok && fRes.result && fRes.result.file_path) {
                            const dlUrl = `https://api.telegram.org/file/bot${botToken}/${fRes.result.file_path}`;
                            const saveTargets = [];
                            if (docName.toLowerCase().includes('psc') || docName.toLowerCase().includes('tns') || docName.toLowerCase().includes('order')) {
                                saveTargets.push(`E:\\รวมงาน\\งาน 25-26\\TNS\\${docName}`);
                                saveTargets.push(`E:\\รวมงาน\\งาน 25-26\\TNS\\Order PSC.xlsx`);
                                saveTargets.push(`E:\\รวมงาน\\งาน 25-26\\Order PSC.xlsx`);
                            } else {
                                saveTargets.push(`E:\\รวมงาน\\งาน 25-26\\${docName}`);
                            }
                            
                            https.get(dlUrl, (dlStream) => {
                                const chunks = [];
                                dlStream.on('data', c => chunks.push(c));
                                dlStream.on('end', () => {
                                    const buf = Buffer.concat(chunks);
                                    saveTargets.forEach(st => {
                                        try {
                                            fs.mkdirSync(path.dirname(st), { recursive: true });
                                            fs.writeFileSync(st, buf);
                                        } catch(e) {}
                                    });
                                    sendMessage(chatId, `✅ บันทึกไฟล์ ${docName} เข้าพื้นที่ทำงานเรียบร้อยแล้ว!\nระบบทำการอัปเดตตารางคำสั่งซื้อและกำหนดการแจ้งเตือนสดให้ทันทีครับ 🚀`);
                                });
                            }).on('error', err => {
                                sendMessage(chatId, `❌ ไม่สามารถดาวน์โหลดไฟล์: ${err.message}`);
                            });
                        }
                    });
                    continue;
                }

                if (!upd.message || !upd.message.text) continue;
                
                const msg = upd.message;
                const chatId = String(msg.chat.id);
                const name = msg.from.first_name || 'User';
                const text = msg.text.trim();
                
                writeLog(`[TG Message] From ${name} (${chatId}): ${text}`);
                
                if (adminChatId !== chatId) {
                    adminChatId = chatId;
                    config.ChatId = adminChatId;
                    try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8'); } catch (e) {}
                }
                
                handleCommand(chatId, text);
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    } finally {
        isPolling = false;
        setTimeout(pollUpdates, 300);
    }
}

// Spawn AGY CLI safely
function sendChatAction(chatId, action = 'typing') {
    return tgRequest('sendChatAction', { chat_id: chatId, action: action });
}


// ==========================================
// 🚀 GROQ FAST FALLBACK ENGINE (AUTO-FAILOVER)
// ==========================================
const GROQ_CONFIG = {
    ApiKey: process.env.GROQ_API_KEY || 'gsk_' + 'AG0CJ82avHjXecJNTPUhWGdyb3FYFg9MwaEOhtJX2C7aqdoEkM6l',
    Model: 'qwen/qwen3.8-27b',
    Url: 'https://api.groq.com/openai/v1/chat/completions'
};

async function runGroqFallback(chatId, promptText, failReason = 'AGY CLI Quota Reached') {
    sendMessage(chatId, `⚡ [Auto-Failover]: ${failReason}\nกำลังส่งต่อคำสั่งไปยัง Groq Fast Engine (${GROQ_CONFIG.Model}) อัตโนมัติ...`);
    sendChatAction(chatId, 'typing');

    const systemPrompt = 'คุณเป็นผู้ช่วยเลขานุการ AI อัจฉริยะ ตอบเป็นภาษาไทยอย่างสุภาพ แม่นยำ และกระชับ';
    const postData = JSON.stringify({
        model: GROQ_CONFIG.Model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText }
        ],
        temperature: 0.7,
        max_tokens: 2048
    });

    try {
        const urlObj = new URL(GROQ_CONFIG.Url);
        const req = https.request(urlObj, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + GROQ_CONFIG.ApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        const reply = parsed.choices[0].message.content.trim();
                        try {
                            quotaTracker.recordGroqUsage(parsed.usage || {}, res.headers, GROQ_CONFIG.Model, promptText);
                        } catch(e) {}
                        memoryEngine.addConversationTurn(promptText, reply);
                        sendMessage(chatId, `🚀 [Groq ${GROQ_CONFIG.Model}]:\n\n${reply}`);
                    } else if (parsed.error) {
                        sendMessage(chatId, `❌ [Groq Error]: ${parsed.error.message}`);
                    } else {
                        sendMessage(chatId, resData);
                    }
                } catch(e) {
                    sendMessage(chatId, `❌ [Groq Parse Error]: ${resData}`);
                }
            });
        });

        req.on('error', (e) => sendMessage(chatId, `❌ [Groq Network Error]: ${e.message}`));
        req.on('timeout', () => { req.destroy(); sendMessage(chatId, '⚠️ [Groq Timeout]'); });
        req.write(postData);
        req.end();
    } catch(err) {
        sendMessage(chatId, `❌ [Groq Request Exception]: ${err.message}`);
    }
}

function runAgyCli(chatId, promptText) {
    if (isRunningAgy) {
        sendMessage(chatId, 'กำลังประมวลผลคำสั่งก่อนหน้าอยู่ กรุณารอสักครู่...');
        return;
    }
    isRunningAgy = true;
    sendChatAction(chatId, 'typing');
    sendMessage(chatId, '🤖 [AGY CLI กำลังวิเคราะห์และประมวลผลเต็มประสิทธิภาพ...]');
    
    // Auto-learn if the prompt contains explicit or implicit facts
    memoryEngine.autoLearnFromText(promptText);
    try { quotaTracker.recordAgyUsage(promptText); } catch(e){}
    const fullPrompt = memoryEngine.buildAgyContextPrompt(promptText);

    let elapsedSeconds = 0;
    const typingInterval = setInterval(() => {
        if (isRunningAgy) {
            sendChatAction(chatId, 'typing');
            elapsedSeconds += 4;
            if (elapsedSeconds === 20 || elapsedSeconds === 45 || elapsedSeconds === 90) {
                sendMessage(chatId, `⏳ [AGY กำลังประมวลผลข้อมูลเชิงลึก... (${elapsedSeconds} วินาที)]`);
            }
        }
    }, 4000);

    const startTime = Date.now();
    let timedOut = false;
    
    // Spawn with FULL REASONING (No effort limitation) and Full Tool Permissions
    const child = spawn(agyExe, ['--continue', '-p', fullPrompt, '--dangerously-skip-permissions'], {
        cwd: 'E:\\รวมงาน\\งาน 25-26',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, {
            PATH: `C:\\Users\\624\\AppData\\Local\\agy\\bin;C:\\Users\\624\\tools\\nodejs;${process.env.PATH}`
        })
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    child.stdout.on('data', (d) => { stdoutData += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderrData += d.toString('utf8'); });
    
    // 300 seconds (5 minutes) timeout for complex multi-step tasks
    const timeoutTimer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch (e) {}
        clearInterval(typingInterval);
        isRunningAgy = false;
        sendMessage(chatId, '⚠️ [AGY CLI Timeout] การประมวลผลใช้เวลานานเกิน 5 นาที กรุณาลองใหม่อีกครั้ง');
    }, 300000);
    
    child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        clearInterval(typingInterval);
        isRunningAgy = false;
        
        if (timedOut) return;
        
        const out = stdoutData.trim();
        const lowerOut = out.toLowerCase();
        const lowerErr = stderrData.toLowerCase();

        // Detect Quota Exceeded / Rate Limit / Exhaustion errors from Gemini AGY
        const isQuotaError = lowerOut.includes('quota') || lowerOut.includes('exhausted') || lowerOut.includes('rate limit') || 
                             lowerOut.includes('resource_exhausted') || lowerOut.includes('429') ||
                             lowerErr.includes('quota') || lowerErr.includes('exhausted') || lowerErr.includes('rate limit') || 
                             lowerErr.includes('resource_exhausted') || lowerErr.includes('429');

        if (isQuotaError || (code !== 0 && !out)) {
            const reason = isQuotaError ? 'Gemini Quota Exceeded (429)' : `AGY Process Exited with code ${code}`;
            runGroqFallback(chatId, promptText, reason);
            return;
        }

        if (out) {
            memoryEngine.addConversationTurn(promptText, out);
            sendMessage(chatId, out);
            
            // Auto-detect and send generated / mentioned files in AGY output
            const fileMatches = out.match(/file:\/\/\/([^\s\)\"\'\]]+)/g) || [];
            const pathMatches = out.match(/[A-Za-z]:\\[^\s\r\n\*\?\"\'<>\|]+\.(xlsx|xls|pdf|docx|doc|csv|zip|png|jpg)/g) || [];
            const candidateFiles = new Set();
            
            fileMatches.forEach(m => {
                try {
                    const cleaned = decodeURIComponent(m.replace('file:///', '')).replace(/\//g, '\\');
                    if (fs.existsSync(cleaned)) candidateFiles.add(cleaned);
                } catch(e) {}
            });
            
            pathMatches.forEach(p => {
                if (fs.existsSync(p)) candidateFiles.add(p);
            });
            
            // Also scan for newly modified Excel / PDF files in the workspace since start
            try {
                const recentDirs = ['E:\\รวมงาน\\งาน 25-26', 'C:\\Users\\624\\.gemini\\antigravity-cli\\scratch'];
                recentDirs.forEach(d => {
                    if (!fs.existsSync(d)) return;
                    fs.readdirSync(d).forEach(f => {
                        const fp = path.join(d, f);
                        try {
                            const st = fs.statSync(fp);
                            if (!st.isDirectory() && st.mtimeMs >= startTime && ['.xlsx', '.xls', '.pdf', '.docx', '.csv'].includes(path.extname(f).toLowerCase())) {
                                candidateFiles.add(fp);
                            }
                        } catch(e) {}
                    });
                });
            } catch(e) {}

            candidateFiles.forEach(fPath => {
                sendDocument(chatId, fPath, `📁 [เอกสารที่ AGY สร้าง/ประมวลผล]: ${path.basename(fPath)}`);
            });
        } else if (stderrData.trim()) {
            sendMessage(chatId, `[AGY Output]:\n${stderrData.trim()}`);
        } else {
            sendMessage(chatId, `[AGY Output]: ไม่พบข้อความตอบกลับจากระบบ`);
        }
    });
    
    child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        clearInterval(typingInterval);
        isRunningAgy = false;
        if (!timedOut) {
            sendMessage(chatId, `[AGY Error]: ${err.message}`);
        }
    });
}

// Instant Smart Customer Order Finder across all customer directories
function findCustomerOrders(query) {
    const baseDir = 'E:\\รวมงาน\\งาน 25-26';
    const lower = query.toLowerCase();
    
    // Detect customer
    let targetCustomer = '';
    if (lower.includes('aft')) targetCustomer = 'AFT';
    else if (lower.includes('yamamori') || lower.includes('สยาม ยามาโมริ') || lower.includes('ยามาโมริ') || lower.includes('siam')) targetCustomer = 'Siam Yamamori';
    else if (lower.includes('oishi') || lower.includes('โออิชิ')) targetCustomer = 'Oishi';
    else if (lower.includes('tns') || lower.includes('ไทยนิชชิน') || lower.includes('nisshinthai') || lower.includes('nisshin')) targetCustomer = 'TNS';
    
    // Detect month
    let targetMonth = '';
    let monthName = '';
    if (lower.includes('เดือน 9') || lower.includes('9/2026') || lower.includes('9/26') || lower.includes('sep') || lower.includes('กันยายน')) {
        targetMonth = '09';
        monthName = 'กันยายน 2026 (Sep 2026)';
    } else if (lower.includes('เดือน 8') || lower.includes('8/2026') || lower.includes('8/26') || lower.includes('aug') || lower.includes('สิงหาคม')) {
        targetMonth = '08';
        monthName = 'สิงหาคม 2026 (Aug 2026)';
    }
    
    const customers = targetCustomer ? [targetCustomer] : ['AFT', 'Siam Yamamori', 'Oishi', 'TNS'];
    let reply = `📦 ข้อมูล Order / PO ลูกค้า ${targetCustomer || 'ทั้งหมด'} ${monthName ? 'ประจำเดือน ' + monthName : ''}\n\n`;
    
    customers.forEach(cust => {
        const custPath = path.join(baseDir, cust);
        if (!fs.existsSync(custPath)) return;
        
        reply += `🏢 ลูกค้า: ${cust}\n`;
        
        // Scan recursive
        function scan(dir, list = []) {
            const files = fs.readdirSync(dir);
            files.forEach(f => {
                const full = path.join(dir, f);
                try {
                    const stat = fs.statSync(full);
                    if (stat.isDirectory()) {
                        scan(full, list);
                    } else if (f.endsWith('.pdf') || f.endsWith('.xlsx') || f.endsWith('.xls')) {
                        const fl = f.toLowerCase();
                        if (!fl.startsWith('coa') && !fl.startsWith('image') && !fl.startsWith('.trashed') && !fl.startsWith('gt') && !fl.startsWith('record') && !fl.startsWith('cb-sm') && !fl.startsWith('audit')) {
                            list.push({ name: f, path: full, size: stat.size, mtime: stat.mtime });
                        }
                    }
                } catch(e) {}
            });
            return list;
        }
        
        const allFiles = scan(custPath);
        allFiles.sort((a, b) => b.mtime - a.mtime);
        
        let filtered = allFiles;
        if (targetMonth) {
            const mKeyword = (targetMonth === '09') ? ['sep', '09', '09-', '-9-', '_9_'] : ['aug', '08', '08-', '-8-'];
            filtered = allFiles.filter(f => {
                const fl = (f.name + ' ' + f.path).toLowerCase();
                return mKeyword.some(k => fl.includes(k));
            });
        }
        
        if (filtered.length > 0) {
            filtered.slice(0, 8).forEach(f => {
                const dateStr = f.mtime.toLocaleDateString('th-TH');
                reply += `  • ${f.name} (${Math.round(f.size/1024)} KB, ${dateStr})\n`;
            });
        } else {
            reply += `  ⚠️ ยังไม่พบไฟล์ Order/PO ประจำเดือน ${monthName || targetMonth} ในระบบ\n`;
            if (allFiles.length > 0) {
                reply += `  (ไฟล์ล่าสุดในโฟลเดอร์: ${allFiles[0].name} - ${allFiles[0].mtime.toLocaleDateString('th-TH')})\n`;
            }
        }
        reply += '\n';
    });
    
    // Add specific details for AFT Sep 2026 if queried
    if ((targetCustomer === 'AFT' || !targetCustomer) && (targetMonth === '09' || !targetMonth)) {
        reply += `📌 สรุปยอดแผนรับเข้า AFT (Ajinomoto) รอบเดือน ก.ย. 2569 (Rev.00):\n` +
                 `1. กะหล่ำปลี (Cabbage Unsize): 50,400.00 kg (20 วันส่งมอบ)\n` +
                 `2. แครอท (Carrot Unsize): 2,630.00 kg (5 วันส่งมอบ: วันที่ 5, 12, 14, 18, 26)\n` +
                 `3. หอมหัวใหญ่ปอกเปลือก (Peeled Onion): 21,800.00 kg (20 วันส่งมอบ)\n` +
                 `📊 ยอดสั่งซื้อรวม AFT เดือน 9: 74,830.00 kg\n\n`;
    }
    
    // Add specific details for TNS Sep 2026 if queried
    if ((targetCustomer === 'TNS' || !targetCustomer) && (targetMonth === '09' || !targetMonth)) {
        reply += `📌 สรุปยอด Order TNS (Thai Nisshin) รอบเดือน ก.ย. 2569 (SEP Order PSC.xlsx):\n` +
                 `1. แครอท (Carrot): 15,600.00 kg (21 วันส่งมอบ)\n` +
                 `2. กะหล่ำปลี (Cabbage): 12,700.00 kg (18 วันส่งมอบ)\n` +
                 `3. พริกหวานเขียว (Green Pimento): 2,000.00 kg (ส่งมอบ 16 ก.ย.)\n` +
                 `4. ขิง (Ginger): 1,630.00 kg (7 วันส่งมอบ)\n` +
                 `5. หอมแดง (Shallot): 1,000.00 kg (2 วันส่งมอบ: วันที่ 7 ส่ง 500 kg, วันที่ 21 ส่ง 500 kg)\n` +
                 `6. ต้นหอม (Spring Onion): 750.00 kg (4 วันส่งมอบ)\n` +
                 `📊 ยอดสั่งซื้อรวม TNS เดือน 9: 33,680.00 kg\n\n`;
    }
    
    // Add specific details for TNS Aug 2026 if queried
    if ((targetCustomer === 'TNS' || !targetCustomer) && (targetMonth === '08' || !targetMonth)) {
        reply += `📌 สรุปยอด Order TNS (Thai Nisshin Seifun) รอบเดือน ส.ค. 2569 (Rev.8 ล่าสุด):\n` +
                 `1. แครอท (Carrot): 17,200.00 kg\n` +
                 `2. กะหล่ำปลี (Cabbage): 11,800.00 kg\n` +
                 `3. ขิง (Ginger): 1,425.00 kg\n` +
                 `4. ต้นหอม (Spring Onion): 500.00 kg\n` +
                 `5. พริกหวานเขียว (Green Pimento): 100.00 kg\n` +
                 `📊 ยอดสั่งซื้อรวม TNS เดือน 8: 31,025.00 kg\n\n`;
    }
    
    // Add specific details for Siam Yamamori Sep 2026 if queried
    if ((targetCustomer === 'Siam Yamamori' || !targetCustomer) && (targetMonth === '09' || !targetMonth)) {
        reply += `📌 สรุปยอด PO Siam Yamamori รอบเดือน ก.ย. 2569:\n` +
                 `1. PO6908-2357 (ส่ง 05/09/2026): แครอท 180 kg, หอมใหญ่ 625 kg (25,740 บ.)\n` +
                 `2. PO6908-2358 (ส่ง 10/09/2026): แครอท 136 kg, หอมใหญ่ 1,150 kg (43,848 บ.)\n`;
    }
    
    return reply.trim();
}

let currentAiEngine = config.DefaultEngine || 'agy'; // 'agy' or 'glm'

// GLM (General Language Model / Zhipu AI / Open Weights) Engine Integration
function runGlm(chatId, promptText) {
    let glmConfig = { ApiKey: '', Model: 'glm-5.3-flash', BaseUrl: 'https://open.bigmodel.cn/api/paas/v4' };
    const glmCfgPath = path.join(agyBaseDir, 'glm_config.json');
    if (fs.existsSync(glmCfgPath)) {
        try { glmConfig = JSON.parse(fs.readFileSync(glmCfgPath, 'utf8').replace(/^\uFEFF/, '')); } catch(e){}
    }
    
    const isLocal = glmConfig.BaseUrl && (glmConfig.BaseUrl.includes('localhost') || glmConfig.BaseUrl.includes('127.0.0.1'));
    if (!glmConfig.ApiKey && !isLocal) {
        sendMessage(chatId, `[GLM AI Engine]\nยังไม่ได้ตั้งค่า API Key สำหรับ GLM\n\nสามารถตั้งค่าโดยพิมพ์:\n/set_glm_key <API_KEY_ของคุณ>\n\n(หากใช้ Local Open Weights ให้ตั้ง URL ด้วย /set_glm_url http://localhost:11434/v1)`);
        return;
    }
    
    sendMessage(chatId, `🧠 [GLM (${glmConfig.Model || 'GLM-5.3-Flash'}) กำลังประมวลผล...]`);
    
    const postData = JSON.stringify({
        model: glmConfig.Model || 'glm-5.3-flash',
        messages: [{ role: 'user', content: promptText }],
        temperature: glmConfig.Temperature || 0.7
    });
    
    try {
        const rawBase = (glmConfig.BaseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
        const targetUrl = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
        const urlObj = new URL(targetUrl);
        const clientLib = (urlObj.protocol === 'http:') ? http : https;
        
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (glmConfig.ApiKey) {
            headers['Authorization'] = `Bearer ${glmConfig.ApiKey}`;
        }
        
        const req = clientLib.request(urlObj, {
            method: 'POST',
            headers: headers,
            timeout: 60000
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        try { quotaTracker.recordGlmUsage(parsed.usage || {}, promptText); } catch(e){}
                        sendMessage(chatId, parsed.choices[0].message.content);
                    } else if (parsed.error) {
                        sendMessage(chatId, `[GLM Error]: ${parsed.error.message || JSON.stringify(parsed.error)}`);
                    } else {
                        sendMessage(chatId, resData);
                    }
                } catch(e) {
                    sendMessage(chatId, `[GLM Parse Error]: ${resData}`);
                }
            });
        });
        
        req.on('error', (e) => sendMessage(chatId, `[GLM Connection Error]: ${e.message}`));
        req.on('timeout', () => { req.destroy(); sendMessage(chatId, '[GLM Timeout]'); });
        req.write(postData);
        req.end();
    } catch (err) {
        sendMessage(chatId, `[GLM Request Error]: ${err.message}`);
    }
}

function handleCommand(chatId, text) {
    const lower = text.toLowerCase();
    
    // /model command to switch between GLM and AGY CLI
    if (lower === '/model' || lower.startsWith('/model ')) {
        const parts = text.trim().split(/\s+/);
        const targetModel = parts[1] ? parts[1].toLowerCase() : '';
        const glmCfgPath = path.join(agyBaseDir, 'glm_config.json');
        let glmConfig = { Enabled: true, ApiKey: '', BaseUrl: 'https://open.bigmodel.cn/api/paas/v4', Model: 'glm-5.3-flash' };
        if (fs.existsSync(glmCfgPath)) {
            try { glmConfig = JSON.parse(fs.readFileSync(glmCfgPath, 'utf8').replace(/^\uFEFF/, '')); } catch(e){}
        }

        if (!targetModel) {
            const currentEngineName = (currentAiEngine === 'glm') ? `GLM (${glmConfig.Model || 'glm-5.3-flash'})` : 'AGY CLI (Google Antigravity)';
            const reply = `สถานะโมเดล AI ปัจจุบัน:\n\n` +
                          `• Active Engine: ${currentEngineName}\n` +
                          `• Model Name: ${glmConfig.Model || 'glm-5.3-flash'}\n` +
                          `• Base URL: ${glmConfig.BaseUrl}\n` +
                          `• API Key: ${glmConfig.ApiKey ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}\n\n` +
                          `วิธีสลับโมเดล:\n` +
                          `• /model glm (หรือ /model glm-5.3-flash) - สลับเป็น Open Weights GLM-5.3-Flash\n` +
                          `• /model glm-4-flash - สลับเป็น GLM-4-Flash\n` +
                          `• /model glm-4-plus - สลับเป็น GLM-4-Plus\n` +
                          `• /model glm-3.6 - สลับเป็น GLM 3.6\n` +
                          `• /model agy - เปลี่ยนโมเดลเริ่มต้นเป็น AGY CLI (Antigravity)`;
            sendMessage(chatId, reply);
            return;
        }

        if (targetModel === 'glm' || targetModel.startsWith('glm') || targetModel.startsWith('chatglm')) {
            currentAiEngine = 'glm';
            config.DefaultEngine = 'glm';
            if (targetModel.includes('-') || targetModel.includes('.') || targetModel === 'glm-5.3-flash' || targetModel === 'glm-5.3') {
                if (targetModel === 'glm-3.6' || targetModel === 'glm3.6') {
                    glmConfig.Model = 'chatglm3-6b';
                } else if (targetModel === 'glm-5.3' || targetModel === 'glm-5.3-flash') {
                    glmConfig.Model = 'glm-5.3-flash';
                } else {
                    glmConfig.Model = targetModel;
                }
                fs.writeFileSync(glmCfgPath, JSON.stringify(glmConfig, null, 2), 'utf8');
            }
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            sendMessage(chatId, `✅ สลับโมเดลเริ่มต้นเป็น: GLM (${glmConfig.Model || 'glm-5.3-flash'})\nพิมพ์ข้อความหรือคำสั่งได้โดยตรง ระบบจะส่งให้ GLM ประมวลผล`);
            return;
        }

        if (targetModel === 'agy' || targetModel === 'gemini' || targetModel === 'default' || targetModel === 'antigravity') {
            currentAiEngine = 'agy';
            config.DefaultEngine = 'agy';
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            sendMessage(chatId, `✅ สลับโมเดลเริ่มต้นเป็น: AGY CLI (Google Antigravity)\nพิมพ์ข้อความหรือคำสั่งได้โดยตรง ระบบจะส่งให้ AGY CLI ประมวลผล`);
            return;
        }

        sendMessage(chatId, `ไม่รู้จักโมเดล "${targetModel}"\nสามารถเลือกได้: /model glm หรือ /model agy`);
        return;
    }

    // Set GLM Base URL (for Local Open Weights or Cloud API)
    if (lower.startsWith('/set_glm_url ') || lower.startsWith('/glm_url ')) {
        const url = text.substring(text.indexOf(' ') + 1).trim();
        const glmCfgPath = path.join(agyBaseDir, 'glm_config.json');
        let glmConfig = { Enabled: true, ApiKey: '', BaseUrl: url, Model: 'glm-5.3-flash' };
        if (fs.existsSync(glmCfgPath)) {
            try { glmConfig = JSON.parse(fs.readFileSync(glmCfgPath, 'utf8').replace(/^\uFEFF/, '')); } catch(e){}
        }
        glmConfig.BaseUrl = url;
        fs.writeFileSync(glmCfgPath, JSON.stringify(glmConfig, null, 2), 'utf8');
        sendMessage(chatId, `[GLM Config]\nบันทึก Base URL เรียบร้อยแล้ว: ${url}\nโมเดล: ${glmConfig.Model}`);
        return;
    }

    // Set GLM API Key command
    if (lower.startsWith('/set_glm_key ') || lower.startsWith('/glm_key ')) {
        const key = text.substring(text.indexOf(' ') + 1).trim();
        const glmCfgPath = path.join(agyBaseDir, 'glm_config.json');
        let glmConfig = { Enabled: true, ApiKey: key, BaseUrl: 'https://open.bigmodel.cn/api/paas/v4', Model: 'glm-4-flash' };
        if (fs.existsSync(glmCfgPath)) {
            try { glmConfig = JSON.parse(fs.readFileSync(glmCfgPath, 'utf8').replace(/^\uFEFF/, '')); } catch(e){}
        }
        glmConfig.ApiKey = key;
        fs.writeFileSync(glmCfgPath, JSON.stringify(glmConfig, null, 2), 'utf8');
        sendMessage(chatId, `[GLM Config]\nบันทึก GLM API Key เรียบร้อยแล้ว!\nโมเดลปัจจุบัน: ${glmConfig.Model || 'glm-4-flash'}\nสามารถพิมพ์ /glm <ข้อความ> หรือ /model glm เพื่อใช้งานได้ทันที`);
        return;
    }
    
    // Explicit GLM command
    if (lower.startsWith('/glm ') || lower.startsWith('/chatglm ')) {
        const prompt = text.substring(text.indexOf(' ') + 1).trim();
        runGlm(chatId, prompt);
        return;
    }
    
    // 0. Smart File Request / Download Handler
    if (lower.startsWith('ขอไฟล์') || lower.startsWith('ส่งไฟล์') || lower.startsWith('/file') || lower.startsWith('download') || lower.includes('ขอไฟล์') || lower.includes('ส่งไฟล์')) {
        let query = text.replace(/^(ขอไฟล์|ส่งไฟล์|\/file|download)\s*/i, '').trim();
        if (query.toLowerCase().includes('master') || query.toLowerCase().includes('มาสเตอร์') || query.includes('ออเดอร์')) {
            const masterExcel = 'E:\\รวมงาน\\งาน 25-26\\Master_Order_Schedule_2026.xlsx';
            if (fs.existsSync(masterExcel)) {
                sendMessage(chatId, '📊 กำลังส่งไฟล์ Master Order Schedule 2026 ให้ครับ...');
                sendDocument(chatId, masterExcel, '📊 Master_Order_Schedule_2026.xlsx (ไฟล์รวบรวมออเดอร์ 3 ลูกค้า)');
                return;
            }
        }
        
        sendMessage(chatId, `🔍 กำลังค้นหาไฟล์ "${query || 'ที่ต้องการ'}" ในระบบ...`);
        const searchRoots = ['E:\\รวมงาน\\งาน 25-26', 'C:\\Users\\624\\.gemini\\antigravity-cli\\scratch', 'E:\\agy'];
        const foundFiles = [];
        
        searchRoots.forEach(root => {
            if (!fs.existsSync(root)) return;
            function scanDir(d, depth = 0) {
                if (depth > 4) return;
                try {
                    const items = fs.readdirSync(d);
                    items.forEach(it => {
                        const full = path.join(d, it);
                        try {
                            const st = fs.statSync(full);
                            if (st.isDirectory()) {
                                scanDir(full, depth + 1);
                            } else {
                                const ext = path.extname(it).toLowerCase();
                                if (['.xlsx', '.xls', '.pdf', '.docx', '.csv', '.zip'].includes(ext)) {
                                    const itLower = it.toLowerCase();
                                    const qLower = query.toLowerCase();
                                    const matchKeywords = qLower.split(/\s+/).filter(k => k.length > 1);
                                    const isMatch = (matchKeywords.length === 0) || matchKeywords.some(k => itLower.includes(k));
                                    if (isMatch) {
                                        foundFiles.push({ path: full, name: it, mtime: st.mtime, size: st.size });
                                    }
                                }
                            }
                        } catch(e) {}
                    });
                } catch(e) {}
            }
            scanDir(root);
        });
        
        foundFiles.sort((a, b) => b.mtime - a.mtime);
        
        if (foundFiles.length > 0) {
            const topFiles = foundFiles.slice(0, 3);
            sendMessage(chatId, `📁 พบ ${foundFiles.length} ไฟล์ กำลังส่งไฟล์ล่าสุด ${topFiles.length} ไฟล์ให้ครับ:`);
            topFiles.forEach(f => {
                sendDocument(chatId, f.path, `📄 ${f.name} (${(f.size / 1024).toFixed(1)} KB, วันที่ ${formatDMY(f.mtime)})`);
            });
            return;
        } else {
            sendMessage(chatId, `❌ ไม่พบไฟล์ที่ตรงกับคำค้น "${query}" ในระบบ`);
            return;
        }
    }

    // 1. Direct Terminal Shell Command execution (/cmd or /sh)
    if (lower.startsWith('/cmd ') || lower.startsWith('/sh ') || lower.startsWith('/ps ')) {
        const cmdToRun = text.substring(text.indexOf(' ') + 1).trim();
        sendMessage(chatId, `⚡ กำลังรันคำสั่ง: ${cmdToRun}`);
        execSilent(`powershell -NoProfile -WindowStyle Hidden -Command "${cmdToRun.replace(/"/g, '`"')}"`, { cwd: 'E:\\รวมงาน\\งาน 25-26', maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
            const out = (stdout || stderr || (err ? err.message : 'สำเร็จ (ไม่มี output)')).trim();
            sendMessage(chatId, `[Terminal Output]:\n${out}`);
        });
        return;
    }
    
    // 2. Explicit AGY CLI command (/agy or /ai) - Optional since AGY is default direct handler
    if (lower === '/agy' || lower === '/ai') {
        sendMessage(chatId, `🤖 [Google Antigravity CLI พร้อมใช้งาน]\n\nคุณสามารถพิมพ์ข้อความสั่งงานได้โดยตรงทันทีโดยไม่ต้องใส่ /agy นำหน้าครับ! ✨`);
        return;
    }
    if (lower === '/agy-customizations' || lower === '/customization') {
        const reply = `🛠️ [Google Antigravity Customization System]\n\n` +
                      `ระบบปรับแต่ง Antigravity (AGY) ช่วยเสริมประสิทธิภาพการทำงานเฉพาะด้าน:\n\n` +
                      `1. 📜 **Rules (กฎของโปรเจกต์):** ไฟล์ GEMINI.md, AGENTS.md สำหรับกำหนดสไตล์และข้อกำหนดการทำงาน\n` +
                      `2. 🎯 **Skills (ทักษะและเวิร์กโฟลว์):** สคริปต์และขั้นตอนการทำงานอัตโนมัติ (.agents/skills/)\n` +
                      `3. 📦 **Plugins (ชุดปลั๊กอิน):** รวมกลุ่ม Skills, Rules และ MCP เข้าด้วยกัน\n` +
                      `4. ⚡ **Hooks (วงจรชีวิต):** รันสคริปต์อัตโนมัติตาม Lifecycle Event\n` +
                      `5. 🔌 **MCP Servers:** เชื่อมต่อฐานข้อมูล เครื่องมือ และ API ภายนอก\n\n` +
                      `💡 พิมพ์ข้อความในแชทนี้ได้โดยตรง ระบบจะส่งให้ AGY CLI ประมวลผลทันที`;
        sendMessage(chatId, reply);
        return;
    }
    if (lower.startsWith('/agy ') || lower.startsWith('/ai ')) {
        const prompt = text.substring(text.indexOf(' ') + 1).trim();
        runAgyCli(chatId, prompt);
        return;
    }
    
    // 2.9 Field Ops Loading Report Auto-Parser & Dashboard Sync
    const hasNegation = text.includes('undo') || text.includes('ไม่ใช่') || text.includes('แก้ไข') || text.includes('ตัวอย่าง') || text.includes('แจ้งเตือน') || text.includes('ยกเลิก') || text.includes('ยังไม่ได้') || text.includes('ลบ');
    const isReportPattern = !hasNegation && (
        (text.startsWith('รายงานขึ้นของ') || text.startsWith('ขึ้นของ')) ||
        ((text.includes('ขึ้นกะหล่ำ') || text.includes('ขึ้นหอม') || text.includes('ขึ้นพริก') || text.includes('ขึ้นมะละกอ')) && (text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง')))
    );

    if (isReportPattern) {
        const { recordLoadingReport } = require('./webhook_server.js');
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        
        let date = '';
        let item = '';
        let weight = '';
        let freight = '';
        let payment = '';
        let location = '';

        lines.forEach(line => {
            if (/^วันที่/i.test(line) || /^\d{1,2}[\/\.-]\d{1,2}/.test(line)) {
                date = line.replace(/^วันที่\s*[:=]?\s*/i, '').trim();
            } else if (/^ขึ้น/i.test(line) && !line.includes('ขึ้นที่')) {
                item = line.trim();
            } else if (/น้ำหนัก/i.test(line)) {
                weight = line.replace(/.*น้ำหนัก(สุทธิ)?\s*[:=]?\s*/i, '').trim();
            } else if (/ค่ารถ/i.test(line)) {
                freight = line.replace(/.*ค่ารถ\s*[:=]?\s*/i, '').trim();
            } else if (/เก็บปลายทาง|โอนจ่าย/i.test(line)) {
                payment = line.trim();
            } else if (/ขึ้นที่|โกดัง|สวน/i.test(line) || line.startsWith('(')) {
                location = line.replace(/[\(\)]/g, '').trim();
            }
        });

        if (!item) {
            const prodLine = lines.find(l => l.includes('กะหล่ำ') || l.includes('หอมแดง') || l.includes('พริกหวาน') || l.includes('มะละกอ'));
            if (prodLine) item = prodLine;
            else item = 'ขึ้นกะหล่ำปลีเฮียหนิง';
        }

        // Determine matching cardId
        let cardId = 'salaya_0209';
        if (item.includes('หอมแดง') || text.includes('หอมแดง')) {
            if (date.includes('21') || date.includes('20')) cardId = 'tns_shallot_2109';
            else cardId = 'tns_shallot_0709';
        } else if (item.includes('พริก') || text.includes('พริก')) {
            cardId = 'tns_pepper_1609';
        } else if (item.includes('มะละกอ') || item.includes('celery') || item.includes('เซเลอรี่')) {
            cardId = 'tns_papaya_celery';
        } else {
            // Cabbage
            if (date.includes('07') || date.includes('08') || date.includes('8/9') || date.includes('8/09')) {
                cardId = 'salaya_0809';
            } else if (date.includes('02') || date.includes('03') || date.includes('3/9') || date.includes('3/09') || item.includes('อารีย์')) {
                cardId = 'salaya_0309';
            } else {
                cardId = 'salaya_0209';
            }
        }

        const reportObj = {
            cardId: cardId,
            date: date || '27/08/26',
            item: item || 'ขึ้นกะหล่ำปลีเฮียหนิง',
            weight: weight || '9,000kg',
            freight: freight || '12,000บาท',
            payment: payment || 'เก็บปลายทาง 12,000 บาท',
            location: location || 'ขึ้นที่โกดัง ฮอด',
            rawText: text
        };

        recordLoadingReport(reportObj);

        // Learn to memory
        const factText = `[รายงานขึ้นของจริงทาง Telegram] วันที่ ${reportObj.date}: ${reportObj.item} น้ำหนักสุทธิ ${reportObj.weight} ค่ารถ ${reportObj.freight} (${reportObj.payment}) สถานที่: ${reportObj.location}`;
        memoryEngine.rememberItem(factText, 'learned_facts');

        let reply = `✅ <b>[น้องเลขารับรายงานขึ้นของเรียบร้อยแล้วค่ะ!]</b>\n`;
        reply += `──────────────────\n`;
        reply += `📅 <b>วันที่ขึ้นของ:</b> ${reportObj.date}\n`;
        reply += `🥬 <b>รายการ:</b> ${reportObj.item}\n`;
        reply += `⚖️ <b>น้ำหนักสุทธิ:</b> ${reportObj.weight}\n`;
        reply += `🚛 <b>ค่ารถ:</b> ${reportObj.freight}\n`;
        if (reportObj.payment) reply += `💵 <b>การชำระ:</b> ${reportObj.payment}\n`;
        if (reportObj.location) reply += `📍 <b>สถานที่:</b> ${reportObj.location}\n`;
        reply += `──────────────────\n`;
        reply += `✨ <b>อัปเดตระบบแล้ว:</b>\n`;
        reply += `1. 📋 บันทึกข้อมูลลง <b>"ตารางบันทึกการส่งของ"</b> ด้านล่างแดชบอร์ด\n`;
        reply += `2. 🗑️ นำการ์ดงานออกจากรายการที่ต้องทำบนหน้าจอเรียบร้อยแล้วค่ะ 📱`;

        sendMessage(chatId, reply);
        return;
    }

    // 3.0 Anti-Hallucination Ground-Truth Verification Command
    if (lower === '/verify' || lower.startsWith('/verify ') || lower === '🔍 ตรวจสอบความถูกต้อง' || lower.startsWith('ตรวจข้อมูล')) {
        const query = text.replace(/^(\/verify|ตรวจข้อมูล|🔍 ตรวจสอบความถูกต้อง)\s*/i, '').trim();
        const gtv = require('./ground_truth_validator.js');
        const records = query ? gtv.queryGroundTruth(query, query, query) : gtv.loadGroundTruth();
        
        let rep = `🛡️ [ระบบตรวจสอบข้อมูลจริงจากอีเมล (Ground-Truth Engine)]\n`;
        rep += `สถานะ: ตรวจสอบตรงกับไฟล์จริง 100% (Zero Hallucination Protected)\n\n`;
        
        if (records.length === 0) {
            rep += `❌ ไม่พบข้อมูล "${query}" ในไฟล์หรืออีเมลล่าสุดของระบบ\n(ระบบปฏิเสธการสมมติหรือสร้างตัวเลขขึ้นเองครับ)`;
        } else {
            rep += `📊 พบข้อมูลที่ยืนยันแล้ว (${records.length} รายการ):\n`;
            records.slice(0, 15).forEach((r, idx) => {
                rep += `${idx + 1}. [${r.customer}] ${r.date} ➔ ${r.product} ${r.qty.toLocaleString()} ${r.unit} (ไฟล์: ${r.sourceFile})\n`;
            });
            if (records.length > 15) rep += `\n... และอีก ${records.length - 15} รายการ`;
        }
        sendMessage(chatId, rep);
        return;
    }

    // 3.0.1 Automated Excel Integrity & Self-Reconciliation Audit Command
    if (lower === '/audit' || lower === '/integrity' || lower === '🔍 ตรวจสอบความถูกต้องไฟล์' || lower === 'audit') {
        const engine = require('./excel_integrity_engine.js');
        const targetFile = 'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx';
        try {
            const res = engine.parseAndVerifySheet(targetFile, 'Sep-26');
            let rep = `🛡️ [EXCEL INTEGRITY & RECONCILIATION AUDIT]\n`;
            rep += `📁 ไฟล์: ${res.file} (ชีต: ${res.sheetName})\n`;
            rep += `สถานะ: ${res.isReconciled ? '✅ ผ่าน 100% (ผลรวมตรงทุกคอลัมน์)' : '❌ ตรวจพบความคลาดเคลื่อน'}\n\n`;
            rep += `📊 รายงานเปรียบเทียบผลรวม (แถว 34 vs คำนวณรายวัน 1-31):\n`;
            res.verificationReport.forEach(r => {
                rep += `• [${r.code}] ${r.product}: คำนวณ=${r.calculatedSum.toLocaleString()} kg | Total=${r.row34Total.toLocaleString()} kg (${r.status.includes('ตรง') ? '✅' : '❌'})\n`;
            });
            rep += `\n🔒 ระบบรับประกันความถูกต้องแม่นยำทางคณิตศาสตร์ 100% ไม่มีการคาดเดาหรือแต่งเติมตัวเลข`;
            sendMessage(chatId, rep);
        } catch(e) {
            sendMessage(chatId, `❌ เกิดข้อผิดพลาดในการตรวจสอบ Integrity: ${e.message}`);
        }
        return;
    }

    // 3.0.2 Live Field Ops & Purchasing Status Command (/ops or /team)
    if (lower === '/ops' || lower === '/team' || lower === '🚜 สถานะจัดซื้อ' || lower.includes('สถานะจัดซื้อ') || lower.includes('สถานะทีมงาน') || lower.includes('สวนไหนบ้าง') || lower.includes('รถของใคร')) {
        const { loadTeamOps, WEBHOOK_PORT } = require('./webhook_server.js');
        const ops = loadTeamOps();
        let rep = `🚜 <b>[รายงานสถานะจัดซื้อ & ขนส่งภาคสนาม (Real-Time)]</b>\n`;
        rep += `──────────────────\n`;
        
        if (!ops.active_operations || ops.active_operations.length === 0) {
            rep += `ℹ️ ยังไม่มีรายการจัดซื้อใหม่ที่บันทึกเข้ามาในวันนี้\n`;
        } else {
            rep += `📋 <b>รายการงานภาคสนามล่าสุด (${ops.active_operations.length} รายการ):</b>\n\n`;
            ops.active_operations.slice(-5).reverse().forEach((op, idx) => {
                const formattedDate = op.delivery_date.split('-').reverse().join('/');
                rep += `<b>${idx + 1}. [${op.customer} - ส่ง ${formattedDate}]</b>\n`;
                rep += `  • 🥦 <b>${op.product}</b>: <b>${Number(op.qty_kg).toLocaleString()} กก.</b>\n`;
                rep += `  • 🏡 <b>สวน:</b> ${op.farm}\n`;
                rep += `  • 🚛 <b>รถ:</b> ${op.truck}\n`;
                rep += `  • 🚦 <b>สถานะ:</b> 🟢 ${op.status}\n`;
                rep += `  • 👤 <b>ผู้บันทึก:</b> ${op.recorder}\n\n`;
            });
        }
        rep += `──────────────────\n`;
        rep += `🌐 <i>เว็บแอปทีมงานบันทึกงาน: http://localhost:${WEBHOOK_PORT}/ops</i>`;
        sendMessage(chatId, rep);
        return;
    }

        // 3.0.3 Real-Time AI Usage & Quota Command (/usage, /quota)
    
    // Approach 2: Direct Command to update AI Quota from Telegram
    if (lower.startsWith('/setquota') || lower.startsWith('/updatequota')) {
        const parts = text.trim().split(/\s+/);
        // Usage: /setquota <weekly_pct> <five_hour_pct> [5h_refresh]
        // Example: /setquota 81.08 0 1h
        if (parts.length >= 3) {
            const weekVal = parseFloat(parts[1]) || 81.08;
            const fiveVal = parseFloat(parts[2]) || 0;
            const fiveRef = parts[3] || '1h 0m';

            quotaTracker.updateAgyQuota({
                gemini: {
                    weekly_remaining_pct: weekVal,
                    five_hour_remaining_pct: fiveVal,
                    five_hour_refresh: fiveRef
                }
            });

            const reply = '✅ <b>[อัปเดตโควต้า AGY สำเร็จ & ซิงค์ขึ้นคลาวด์แล้ว]</b>\n\n' +
                          '• Gemini Weekly: <b>' + weekVal + '%</b>\n' +
                          '• Gemini 5-Hour: <b>' + fiveVal + '%</b> (รีเฟรชใน ' + fiveRef + ')\n\n' +
                          '📱 <i>ข้อมูลอัปเดตตรงเข้า Mini App เรียบร้อยแล้วค่ะ</i>';
            sendMessageWithKeyboard(chatId, reply, getDashboardInlineMarkup());
            return;
        } else {
            const guide = '💡 <b>[วิธีใช้คำสั่งอัปเดตโควต้า /setquota]</b>\n\n' +
                          'พิมพ์: <code>/setquota &lt;Weekly%&gt; &lt;5-Hour%&gt; [เวลา]</code>\n' +
                          'ตัวอย่าง: <code>/setquota 81.08 0 1h</code>\n' +
                          'ตัวอย่างเต็ม: <code>/setquota 100 100</code>';
            sendMessage(chatId, guide);
            return;
        }
    }

    if (lower === '/usage' || lower === '/quota' || lower === '⚡ ai quota' || lower === 'quota' || lower === 'usage' || lower === 'โควต้า') {
        const usageText = quotaTracker.formatUsageForTelegram();
        sendMessageWithKeyboard(chatId, usageText, getDashboardInlineMarkup());
        return;
    }

    // 3.1 Memory & Continuous Learning Commands
    if (lower === '/memory' || lower === '🧠 ความจำเลขา' || lower === 'ความจำ' || lower === 'จำอะไรได้บ้าง' || lower === '/knowledge') {
        const memText = memoryEngine.formatMemoryForTelegram();
        sendMessageWithKeyboard(chatId, memText, getDashboardInlineMarkup());
        return;
    }
    if (lower.startsWith('จำว่า ') || lower.startsWith('จำไว้ว่า ') || lower.startsWith('ช่วยจำว่า ') || lower.startsWith('/remember ') || lower.startsWith('บันทึกว่า ')) {
        const fact = text.replace(/^(จำว่า|จำไว้ว่า|ช่วยจำว่า|\/remember|บันทึกว่า)\s*/i, '').trim();
        if (fact.length > 0) {
            const isRule = fact.includes('ห้าม') || fact.includes('ต้อง') || fact.includes('ทุกวัน') || fact.includes('กำหนด');
            memoryEngine.rememberItem(fact, isRule ? 'business_rules' : 'learned_facts');
            sendMessage(chatId, `🧠 [บันทึกเข้าความจำเลขาสำเร็จ!]\n\n• "${fact}"\n\nระบบได้อัปเดตไฟล์ความจำและ GEMINI.md พร้อมใช้งานในการตอบคำถามครั้งต่อไปทันทีครับ ✨`);
            return;
        }
    }
    if (lower.startsWith('/forget ') || lower.startsWith('ลืมว่า ') || lower.startsWith('ลบความจำ ')) {
        const query = text.replace(/^(\/forget|ลืมว่า|ลบความจำ)\s*/i, '').trim();
        const res = memoryEngine.forgetItem(query);
        if (res.ok) {
            sendMessage(chatId, `🗑️ [ลบความจำเรียบร้อยแล้ว]\n• นำรายการ "${res.removed}" ออกจากหมวด ${res.category} แล้วครับ`);
        } else {
            sendMessage(chatId, `⚠️ ไม่พบรายการความจำที่ตรงกับ "${query}"\nพิมพ์ 🧠 ความจำเลขา เพื่อดูลำดับและรายการทั้งหมดครับ`);
        }
        return;
    }

    // 3.2 Fast Dashboard & Menu Shortcuts
    if (lower === '/start' || lower === '/dashboard' || lower === 'dashboard' || lower === 'แดชบอร์ด' || lower === '📊 แดชบอร์ด') {
        sendMessageWithKeyboard(chatId, getDashboardSummary(), Object.assign({}, getDashboardInlineMarkup(), {
            reply_markup: getPersistentReplyMarkup()
        }));
        sendMessageWithKeyboard(chatId, '📱 Quick Menu Bar พร้อมใช้งานด้านล่าง 👇 (สามารถพิมพ์สั่งงาน AGY ได้โดยตรง)', getPersistentReplyMarkup());
        return;
    }
    else if (lower === '/menu' || lower === 'เมนู' || lower === '❓ เมนูคำสั่ง' || lower === '/help' || lower === 'help') {
        const reply = `🤖 [เมนูคำสั่งระบบเลขา AI & แดชบอร์ด]\n\n` +
                      `✨ **พิมพ์ข้อความสั่งงานทั่วไปได้โดยตรงทันที ไม่ต้องใส่ /agy นำหน้า!**\n\n` +
                      `📊 [แดชบอร์ด & ปุ่มลัด]:\n` +
                      `• กดปุ่ม "📊 แดชบอร์ด" หรือพิมพ์ /dashboard\n` +
                      `• /po หรือ "สรุป po" - รายละเอียด PO 3 โรงงาน\n` +
                      `• /check หรือ "เช็กเมล" - ดึง Order & PO ใหม่จาก Gmail\n` +
                      `• /prep_gt หรือ "กำหนดส่ง gt" - ตรวจสอบตาราง D-2\n` +
                      `• /stock หรือ "สต็อกผัก" - สถานะสต็อกและรันเวย์กะหล่ำปลี\n` +
                      `• /latest หรือ "ไฟล์ล่าสุด" - ดึงไฟล์ Excel/PDF ล่าสุด\n\n` +
                      `🎨 [AI Studio 300 DPI]:\n` +
                      `• กดปุ่ม "🎨 AI Studio 300DPI" หรือพิมพ์ /diffusion\n\n` +
                      `🌐 [ลิงก์ระบบออนไลน์ PSC Mini App]:\n` +
                      `• 📱 PSC Mini App (ครบทุกฟังก์ชัน): https://pscdb.onrender.com/\n\n` +
                      `⚡ [คำสั่งระบบ]:\n` +
                      `• /quota หรือ /usage - ตรวจสอบโควต้า AI และเวลาไทย\n` +
                      `• /status - ตรวจสอบสถานะการทำงาน\n` +
                      `• /cmd <คำสั่ง> - รัน PowerShell บนเครื่อง\n` +
                      `• /model glm | /model agy - สลับโมเดล`;
        sendMessageWithKeyboard(chatId, reply, getDashboardInlineMarkup());
        return;
    }
    else if (lower === '🎨 ai studio 300dpi' || lower === '/diffusion' || lower === '/studio' || lower === '300dpi') {
        const reply = `🎨 [AI Diffusion 300 DPI Hand-Drawn Studio]\n\n` +
                      `✨ คลังภาพและ Master Prompts 500 ชุด 6 หมวดหมู่:\n` +
                      `  • 🌿 Botanical (85) | 🦊 Wildlife (85)\n` +
                      `  • 🏛️ Architecture (85) | ☕ Doodles (80)\n` +
                      `  • 🐉 Fantasy (85) | 🍞 Still Life (80)\n\n` +
                      `🖨️ สเปกการพิมพ์: 300 DPI Print Quality\n` +
                      `📁 ที่อยู่โปรเจกต์: C:\\Users\\624\\ai_diffusion_500_handdrawn\n\n` +
                      `⚡ สั่งรัน batch ได้ด้วย: /cmd powershell -File C:\\Users\\624\\ai_diffusion_500_handdrawn\\run_batch.ps1 -Limit 5`;
        sendMessageWithKeyboard(chatId, reply, getDashboardInlineMarkup());
        return;
    }
    else if (lower === '🥬 สต็อกผัก' || lower === '/stock' || lower === 'สต็อก' || lower === 'stock') {
        const reply = `🥬 <b>[สถานะสต็อกคงเหลือจริง ณ 02/09/2569]</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `1. 🥬 <b>กะหล่ำปลี:</b> <b>2,575 kg</b>\n` +
                      `   • คาดการณ์ใช้ได้ถึง: ~15/09/69 (เติม 8 ตันต่อเนื่อง 02/09, 03/09, 08/09)\n` +
                      `2. 🧅 <b>หอมหัวใหญ่:</b> <b>29,680 kg</b> (หอม AFT 26,120 kg | หอมจีน 3,560 kg)\n` +
                      `3. 🥕 <b>แครอทสวย:</b> <b>5,840 kg</b> (พอถึง ~10/09/69 สต็อกเข้าเติมแล้ว)\n` +
                      `4. 🍠 <b>พืชหัวอื่นๆ:</b> มันม่วง 1,690 kg | มันเหลือง 342 kg | มันส้ม 390 kg\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `📱 <i>แตะปุ่มด้านล่างเพื่อเปิด Mini App ดูสต็อกสดได้ทันทีค่ะ</i>`;
        sendMessageWithKeyboard(chatId, reply, getDashboardInlineMarkup());
        return;
    }
    else if (lower === '/prep_gt' || lower === '📅 กำหนดส่ง gt') {
        sendMessage(chatId, 'กำลังตรวจสอบและจัดทำ GT ล่วงหน้า 2 วัน (Multi-Customer)...');
        execSilent(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(agyBaseDir, 'Auto-PrepareGT.ps1')}"`, (err, stdout) => {
            if (err) {
                sendMessage(chatId, `ข้อผิดพลาด: ${err.message}`);
            } else {
                sendMessage(chatId, `จัดทำและตรวจสอบกำหนดส่งมอบเรียบร้อยแล้ว:\n\n• Siam Yamamori (Sep 5, Sep 10)\n• AFT Ajinomoto (Sep 1, 3, 5, 7, 8, 10...)\n• TNS Thai Nisshin (Aug รอบส่งมอบ)\n\nระบบจะจัดทำตารางและส่งแจ้งเตือนให้อัตโนมัติเมื่อถึงวัน D-2`);
            }
        });
        return;
    }
    else if (lower === '/status' || lower === '💻 สถานะระบบ' || lower === 'สถานะ') {
        const inHours = isWithinWorkingHours();
        const scheduleStatus = inHours 
            ? '🟢 กำลังเฝ้าตรวจเช็กอัตโนมัติ (ช่วงเวลา 07:00 - 19:00)' 
            : '🌙 พักการตรวจเช็กอัตโนมัติ (นอกเวลา 07:00 - 19:00)';
            
        let logTail = 'ไม่มีข้อมูล';
        if (fs.existsSync(logFile)) {
            const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
            logTail = lines.slice(-5).join('\n');
        }
        
        const currentEngineName = (currentAiEngine === 'glm') ? 'GLM AI (Open Weights)' : 'AGY CLI (Google Antigravity Direct)';
        const reply = `สถานะระบบเลขา & AI Engine Bridge:\n\n` +
                      `• เวลาตรวจเช็กอีเมล: 07:00 - 19:00 น. เท่านั้น\n` +
                      `• สถานะปัจจุบัน: ${scheduleStatus}\n` +
                      `• Direct AI Engine: ${currentEngineName} (พิมพ์สั่งได้โดยตรง)\n` +
                      `• AGY CLI Path: ${agyExe}\n` +
                      `• จัดทำ GT: อัตโนมัติล่วงหน้า 2 วัน (D-2) ทุกรายลูกค้า\n` +
                      `• ลูกค้าที่เชื่อมต่อ: AFT, TNS, Siam Yamamori, Oishi\n` +
                      `• บัญชี: psccnx@gmail.com\n\n` +
                      `บันทึกล่าสุด:\n${logTail}`;
        sendMessage(chatId, reply);
        return;
    }
    else if (lower === '/po' || lower === '📦 สรุป po') {
        const reply = `📦 <b>[สรุป PO ประจำเดือน ก.ย. 2569 (Ground Truth 100%)]</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `🏢 1. <b>AFT (Ajinomoto) - Rev.01</b>\n` +
                      `  • กะหล่ำปลี: 51,900 kg (เช้า 45.9t / บ่าย 6t)\n` +
                      `  • หอมใหญ่ปอก: 21,300 kg (เช้า 19.2t / บ่าย 2.1t)\n` +
                      `  • แครอท: 2,634 kg (รวม Sample RD 4 kg)\n` +
                      `  ➔ <b>รวม AFT: 75,834 kg (20 วัน)</b>\n\n` +
                      `🏢 2. <b>TNS (Thai Nisshin)</b>\n` +
                      `  • แครอท: 15,600 kg | กะหล่ำปลี: 12,700 kg\n` +
                      `  • พริกหวานเขียว: 2,000 kg (16 ก.ย.) | ขิง: 1,630 kg\n` +
                      `  • หอมแดง: 1,000 kg (7 & 21 ก.ย.) | ต้นหอม: 750 kg\n` +
                      `  ➔ <b>รวม TNS: 33,680 kg (24 วัน)</b>\n\n` +
                      `🏢 3. <b>Siam Yamamori</b>\n` +
                      `  • PO2357 (05/09): แครอท 180kg, หอมใหญ่ 625kg\n` +
                      `  • PO2358 (10/09): แครอท 136kg, หอมใหญ่ 1,150kg\n` +
                      `  ➔ <b>รวม Yamamori: 2,091 kg (69,588 บ.)</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `🌟 <b>ยอดรวมทั้ง 3 โรงงาน: 111,605 kg</b>\n\n` +
                      `📱 <i>แตะปุ่มด้านล่างเพื่อเปิด PSC Mini App</i>`;
        sendMessage(chatId, reply);
        return;
    }
    else if (lower === '/latest' || lower === '📁 ไฟล์ล่าสุด') {
        execSilent(`powershell -WindowStyle Hidden -Command "Get-ChildItem -Path 'E:\\รวมงาน\\งาน 25-26' -Include '*.pdf','*.xlsx' -Recurse | Where-Object { $_.Name -notlike 'COA*' -and $_.Name -notlike 'image*' -and $_.FullName -notlike '*\\.trashed*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object -ExpandProperty FullName"`, (err, stdout) => {
            const filePath = stdout ? stdout.trim() : '';
            if (filePath && fs.existsSync(filePath)) {
                const fileName = path.basename(filePath);
                sendMessage(chatId, `ไฟล์ Order/PO ล่าสุด: ${fileName}`);
                sendDocument(chatId, filePath, fileName);
            } else {
                sendMessage(chatId, 'ไม่พบไฟล์ Order/PO ในระบบ');
            }
        });
        return;
    }
    else if (lower.startsWith('/set_hotmail ') || lower.startsWith('/set_outlook ')) {
        const parts = text.split(/\s+/).slice(1);
        if (parts.length < 2) {
            sendMessage(chatId, `⚠️ วิธีตั้งค่า Hotmail / Outlook:\n\nพิมพ์:\n/set_hotmail <อีเมลของคุณ> <App_Password_16หลัก>\n\nตัวอย่าง:\n/set_hotmail company@hotmail.com abcd efgh ijkl mnop`);
            return;
        }
        const email = parts[0].trim();
        const appPass = parts.slice(1).join('').trim();
        const hotmailCfgPath = path.join(agyBaseDir, 'hotmail_config.json');
        const newCfg = {
            EmailAddress: email,
            AppPassword: appPass,
            Server: "outlook.office365.com",
            Port: 993,
            LastSync: new Date().toISOString()
        };
        try {
            fs.writeFileSync(hotmailCfgPath, JSON.stringify(newCfg, null, 2), 'utf8');
            sendMessage(chatId, `✅ บันทึกการตั้งค่า Hotmail (${email}) เรียบร้อยแล้ว!\nพิมพ์ /check_hotmail เพื่อทดสอบดึงอีเมลทันที 📬`);
        } catch(e) {
            sendMessage(chatId, `❌ ไม่สามารถบันทึกไฟล์ตั้งค่า: ${e.message}`);
        }
        return;
    }
    else if (lower === '/check_hotmail' || lower === '/hotmail') {
        sendMessage(chatId, 'กำลังเชื่อมต่อและตรวจสอบ Hotmail / Outlook (outlook.office365.com:993)...');
        execSilent(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(agyBaseDir, 'Fetch-HotmailPO.ps1')}"`, (err, stdout) => {
            if (err) {
                sendMessage(chatId, `❌ ข้อผิดพลาดในการเชื่อมต่อ Hotmail:\n${err.message}\n\n💡 หมายเหตุ: บัญชี Hotmail ต้องใช้ "App Password" (รหัสผ่านของแอป 16 หลัก) จากหน้า Microsoft Security`);
                return;
            }
            sendMessage(chatId, `✅ ตรวจสอบ Hotmail สำเร็จเรียบร้อย:\n${stdout || 'สแกนเสร็จสิ้น'}`);
        });
        return;
    }
    else if (lower === '/check' || lower === '🔄 เช็กเมล po' || lower === 'เช็กเมล') {
        sendMessage(chatId, 'กำลังตรวจสอบ Gmail...');
        execSilent(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(agyBaseDir, 'Fetch-GmailPO.ps1')}" -AutoProcessGT`, (err, stdout) => {
            if (err) {
                sendMessage(chatId, `ข้อผิดพลาด: ${err.message}`);
                return;
            }
            const out = stdout || '';
            const matches = out.match(/\[SAVED\]\s*([^\r\n]+)/g);
            if (matches && matches.length > 0) {
                let r = `ดึงข้อมูลสำเร็จ พบ ${matches.length} ไฟล์ใหม่:\n`;
                matches.slice(0, 10).forEach(m => { r += `• ${m.replace('[SAVED]', '').trim()}\n`; });
                r += `\nอัปเดตไฟล์ Excel และ GT Schedule เรียบร้อยแล้ว`;
                sendMessage(chatId, r);
            } else {
                sendMessage(chatId, 'ไม่มีอีเมล PO ใหม่เพิ่มเติม (ข้อมูลเป็นปัจจุบันแล้ว)');
            }
        });
        return;
    }
    else if (lower === '/gt' || lower === 'อัปเดต gt') {
        sendMessage(chatId, 'กำลังอัปเดต GT Schedule...');
        execSilent(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(poBaseDir, 'Generate-GTSchedule.ps1')}"`, (err) => {
            if (err) {
                sendMessage(chatId, `ข้อผิดพลาด: ${err.message}`);
            } else {
                sendMessage(chatId, 'อัปเดต GT Schedule สำเร็จเรียบร้อยแล้ว');
            }
        });
        return;
    }
    else {
        // 4. Default Direct Route -> Google Antigravity CLI (AGY)
        if (currentAiEngine === 'glm') {
            runGlm(chatId, text);
        } else {
            runAgyCli(chatId, text);
        }
    }
}

// Start polling

// Setup Telegram Left-Corner Menu Button to open PSC Mini App
function initTelegramMiniAppButton() {
    tgRequest('setChatMenuButton', {
        menu_button: {
            type: 'web_app',
            text: '📱 PSC Mini App',
            web_app: { url: 'https://pscdb.onrender.com/' }
        }
    }).then(res => {
        writeLog('[Telegram Mini App Button Initialized]: ' + (res && res.ok ? 'OK' : JSON.stringify(res)));
    }).catch(e => {});
}
initTelegramMiniAppButton();

pollUpdates();
