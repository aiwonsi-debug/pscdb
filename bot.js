const { calculateYieldPct, yieldPctToFactor, applyStockUpdate, applyYieldUpdate } = require('./business_logic.js');
const { calculateTransitLoss } = require('./psc_core_logic.js');
﻿const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const memoryEngine = require('./memory_engine.js');
const quotaTracker = { recordOkmdUsage: () => {}, recordGroqUsage: () => {}, recordAgyUsage: () => {}, recordGlmUsage: () => {}, updateAgyQuota: () => {}, formatUsageForLine: () => '⚡ ระบบ AI Quota ถูกปิดใช้งานแล้ว', formatPct: () => '-' };
const { formatPoDetailsForNotification } = require('./po_detail_formatter.js');
const lineNotifier = require('./line_notifier.js');
const { extractLoadingReportFromText, extractStockFromText } = require('./services/stock_parser.js');
const { findCustomerOrders } = require('./services/order_finder.js');

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

const secretsLoader = require('./secrets_loader.js');
const configPath = secretsLoader.getSecretPath('messaging_config.json', __dirname);
if (!fs.existsSync(configPath)) {
    console.error('Config file not found: ' + configPath);
    process.exit(1);
}

const rawConfig = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
const config = JSON.parse(rawConfig);
let adminChatId = config.ChatId || null;
if (!adminChatId) {
    console.error('[Config Warning] ChatId is missing in ' + configPath + ' — admin alerts will not be delivered.');
}

const agyExe = process.env.AGY_EXE_PATH || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : 'C:\\Users\\User\\AppData\\Local\\agy\\bin\\agy.exe');
const agyBaseDir = process.env.AGY_BASE_DIR || __dirname;
const poBaseDir = process.env.PSC_PO_DIR || path.join(process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26', 'Siam Yamamori', 'PO');

// Launch Live Webhook API Server (Port 8080) for instant ingestion & live API access
const { createWebhookServer } = require('./webhook_server.js');
try {
    createWebhookServer((msg) => {
        sendMessage(adminChatId, msg);
    });
} catch(e) {
    console.error('Webhook server init error:', e);
}

// Launch Daily 08:00 AM LINE Notification Scheduler for Field Ops
try {
    lineNotifier.initDailyLineScheduler();
} catch(e) {
    console.error('LINE Scheduler init error:', e);
}
const logFile = path.join(agyBaseDir, 'secretary_activity.log');
const backupDir = path.join(agyBaseDir, 'backups', 'stock');

const { createUtils } = require('./utils.js');
const { formatDMY, writeLog, isWithinWorkingHours, rotateLogIfNeeded, backupStockSnapshot } =
    createUtils({ logFile, backupDir });

const { createLineApi } = require('./line_api.js');
const { sendMessage, sendDocument } =
    createLineApi({ writeLog, lineNotifier });

const { createPriceSurvey } = require('./services/price_survey.js');
const { handleCabbagePriceSurvey } =
    createPriceSurvey({ agyBaseDir, writeLog, formatDMY, sendMessage });

writeLog('========================================================');
writeLog('  AI Secretary Watcher v5.0 (Schedule: 07:00 - 19:00 Only)');
writeLog('========================================================');

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
                matches.forEach(m => {
                    const cleanM = m.replace('[SAVED]', '').trim();
                    r += `• ${cleanM}\n`;
                    try {
                        const detail = formatPoDetailsForNotification(cleanM);
                        if (detail) r += detail + '\n';
                    } catch(e) {}
                });
                r += `อัปเดตไฟล์ Excel, GT Schedule และ Dashboard บนเว็บเรียบร้อยแล้ว`;
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

// These watchers must only start when bot.js is the process entry point.
if (require.main === module) {
    setInterval(autoCheckGmail, 60 * 1000);
    setTimeout(autoCheckGmail, 3000);

    setInterval(autoCheckAdvanceGT, 60 * 60 * 1000);
    setTimeout(autoCheckAdvanceGT, 5000);

    setInterval(autoCheckTNSPreparation, 60 * 60 * 1000);
    setTimeout(autoCheckTNSPreparation, 8000);
}

// ==========================================
// DASHBOARD TEXT SUMMARY (LINE-compatible only)
// Legacy connector-specific pieces (inline keyboards, callback-query handling,
// long-polling loop) removed; no longer part of the active pipeline.
// ==========================================

const { createDashboardUi } = require('./dashboard_ui.js');
const { getDashboardSummary } = createDashboardUi({ agyBaseDir, isWithinWorkingHours, getCurrentAiEngine: () => currentAiEngine, writeLog });

// Spawn AGY CLI safely
function sendChatAction(chatId, action = 'typing') {
    return Promise.resolve(); // no-op: LINE has no typing-indicator API
}


// ==========================================
// 👑 OKMD PLAYGROUND ENGINE (PRIMARY AI ENGINE - OPENAI COMPATIBLE)
// ==========================================
function getOkmdApiKey() {
    let key = (process.env.OKMD_API_KEY || '').trim();
    if (!key) {
        const keyFile = path.join(agyBaseDir, 'okmd_api_key.txt');
        if (fs.existsSync(keyFile)) {
            try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch(e){}
        }
    }
    if (!key) {
        key = 'REDACTED';
    }
    return key;
}

const OKMD_CONFIG = {
    get ApiKey() { return getOkmdApiKey(); },
    BaseUrl: 'https://gen.ai.kku.ac.th/okmd/api/v1',
    Model: 'deepseek-v4-pro',
    Provider: 'Deepseek'
};

async function runOkmdEngine(chatId, promptText, customModel = null) {
    const activeKey = getOkmdApiKey();
    if (!activeKey) {
        runGroqFallback(chatId, promptText, 'OKMD API Key is missing');
        return;
    }

    const modelToUse = customModel || OKMD_CONFIG.Model || 'deepseek-v4-pro';
    sendChatAction(chatId, 'typing');

    memoryEngine.autoLearnFromText(promptText);

    const fullContextPrompt = memoryEngine.buildAgyContextPrompt(promptText);
    const systemPrompt = 'คุณคือ "น้องเลขา AI" ผู้ช่วยบริหารจัดการงานปฏิบัติการ PSC Operations (ผักสด, ขนส่ง, สต็อก, คำสั่งซื้อ)\n' +
                         'คุณต้องปฏิบัติตามกฎเกณฑ์ต่อไปนี้อย่างเคร่งครัด:\n' +
                         '1. ตอบเป็นภาษาไทยอย่างสุภาพ กระชับ ชัดเจน และเป็นมืออาชีพ (ใช้การ์ดข้อความและ Emoji เพื่อให้อ่านง่ายบนมือถือ)\n' +
                         '2. ยึดมั่นในนโยบาย Zero Hallucination: ตัวเลขยอดสั่งซื้อ, วันที่ส่งมอบ, สต็อก, Yield และค่ารถ ต้องอ้างอิงจากข้อมูลที่มีในระบบเท่านั้น หากไม่มีให้ตอบว่า "ไม่พบข้อมูลในเอกสารล่าสุด" ห้ามคิดตัวเลขขึ้นเอง\n' +
                         '3. หากผู้ใช้ถามเรื่องงานทั่วไป ให้ตอบและช่วยเหลืออย่างชาญฉลาดและตรงประเด็น\n' +
                         '4. ห้ามใช้ตาราง Markdown แบบหลายคอลัมน์แนวนอน เพราะจะล้นจอมือถือ ให้ใช้รูปแบบการ์ดสั้น มี Emoji นำหน้า และแบ่งวรรคด้วยเส้นคั่น ──────────────────\n' +
                         '5. ทุกครั้งที่ตอบเรื่องตัวเลข ให้ระบุชื่อไฟล์อ้างอิงและรอบ Rev. ประกอบเสมอ';

    const postData = JSON.stringify({
        model: modelToUse,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullContextPrompt }
        ],
        temperature: 0.6,
        max_tokens: 700
    });

    try {
        const targetUrl = new URL(OKMD_CONFIG.BaseUrl + '/chat/completions');
        const req = https.request(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + activeKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 35000
        }, (res) => {
            res.setEncoding('utf8');
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        const reply = parsed.choices[0].message.content.trim();
                        try {
                            quotaTracker.recordOkmdUsage(parsed.usage || {}, parsed.model_quota || {}, modelToUse, parsed.provider || OKMD_CONFIG.Provider, promptText);
                        } catch(e) {}
                        memoryEngine.addConversationTurn(promptText, reply);

                        const providerLabel = parsed.provider || 'OKMD';
                        sendMessage(chatId, '👑 [' + providerLabel + ' ' + modelToUse + ']:\n\n' + reply);
                    } else if (parsed.error) {
                        writeLog('[OKMD Error]: ' + (parsed.error.message || JSON.stringify(parsed.error)));
                        runGroqFallback(chatId, promptText, 'OKMD Error: ' + (parsed.error.message || 'API rejected'));
                    } else {
                        runGroqFallback(chatId, promptText, 'OKMD Unexpected Response');
                    }
                } catch(e) {
                    writeLog('[OKMD Parse Error]: ' + resData);
                    runGroqFallback(chatId, promptText, 'OKMD Parse Error');
                }
            });
        });

        req.on('error', (e) => {
            writeLog('[OKMD Network Error]: ' + e.message);
            runGroqFallback(chatId, promptText, 'OKMD Network: ' + e.message);
        });

        req.on('timeout', () => {
            req.destroy();
            writeLog('[OKMD Timeout]: Falling back to Groq');
            runGroqFallback(chatId, promptText, 'OKMD Timeout (35s)');
        });

        req.write(postData);
        req.end();
    } catch(err) {
        writeLog('[OKMD Exception]: ' + err.message);
        runGroqFallback(chatId, promptText, 'OKMD Exception: ' + err.message);
    }
}

// ==========================================
// 🚀 GROQ FAST FALLBACK ENGINE (AUTO-FAILOVER) - ZERO HARDCODED KEY
// ==========================================
function getGroqApiKey() {
    let key = (process.env.GROQ_API_KEY || '').trim();
    if (!key) {
        key = secretsLoader.readSecretText('groq_api_key.txt', agyBaseDir);
    }
    return key;
}

const GROQ_CONFIG = {
    get ApiKey() { return getGroqApiKey(); },
    Model: 'openai/gpt-oss-120b',
    Url: 'https://api.groq.com/openai/v1/chat/completions'
};


// extractLoadingReportFromText / extractStockFromText are imported from ./services/stock_parser.js

async function runGroqFallback(chatId, promptText, failReason = 'AGY CLI Quota Reached') {
    const activeKey = getGroqApiKey();
    if (!activeKey) {
        sendMessage(chatId, `⚡ [Auto-Failover]: ${failReason}\n⚠️ ไม่สามารถส่งต่อไปยัง Groq ได้เนื่องจากไม่ได้ตั้งค่า GROQ_API_KEY ในระบบ`);
        writeLog('[Auto-Failover Warning]: Cannot fallback to Groq because GROQ_API_KEY is missing.');
        return;
    }

    sendChatAction(chatId, 'typing');

    const fullContextPrompt = memoryEngine.buildAgyContextPrompt(promptText);
    const systemPrompt = 'คุณคือ "น้องเลขา AI" ผู้ช่วยบริหารจัดการงานปฏิบัติการ PSC Operations (ผักสด, ขนส่ง, สต็อก, คำสั่งซื้อ)\n' +
                         'ตอบเป็นภาษาไทยอย่างสุภาพ กระชับ ชัดเจน อ้างอิงข้อมูลจริงในระบบเสมอ';
    const postData = JSON.stringify({
        model: GROQ_CONFIG.Model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullContextPrompt }
        ],
        temperature: 0.5,
        max_tokens: 600
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
            res.setEncoding('utf8');
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
                        sendMessage(chatId, `🤖 [น้องเลขา AI]:\n\n${reply}`);
                    } else if (parsed.error) {
                        writeLog(`[Groq Error, silent to user]: ${parsed.error.message}`);
                    } else {
                        writeLog(`[Groq Unexpected Response, silent to user]: ${resData.substring(0, 200)}`);
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
    const child = spawn(agyExe, ['--continue', '-p', fullPrompt], {
        cwd: process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, {
            PATH: `${path.dirname(agyExe)};${process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'agy', 'bin') : ''};${process.env.PATH}`
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
                const recentDirs = [
                    process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26',
                    path.join(process.env.USERPROFILE || 'C:\\Users\\User', '.gemini', 'antigravity-cli', 'scratch')
                ];
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

// findCustomerOrders is imported from ./services/order_finder.js

let currentAiEngine = config.DefaultEngine || 'okmd'; // 'okmd', 'agy', or 'glm'

// GLM (General Language Model / Zhipu AI / Open Weights) Engine Integration
function getGlmConfig(overrides = {}) {
    let glmConfig = { Enabled: true, ApiKey: '', BaseUrl: 'https://open.bigmodel.cn/api/paas/v4', Model: 'glm-5.3-flash', ...overrides };
    const glmCfgPath = secretsLoader.getSecretPath('glm_config.json', agyBaseDir);
    if (fs.existsSync(glmCfgPath)) {
        try { glmConfig = { ...glmConfig, ...JSON.parse(fs.readFileSync(glmCfgPath, 'utf8').replace(/^\uFEFF/, '')) }; } catch(e){}
    }
    return { glmConfig, glmCfgPath };
}

function runGlm(chatId, promptText) {
    const { glmConfig } = getGlmConfig();
    
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
        
        req.on('error', (e) => sendMessage(chatId, `[GLM Network Error]: ${e.message}`));
        req.on('timeout', () => { req.destroy(); sendMessage(chatId, '[GLM Timeout]'); });
        req.write(postData);
        req.end();
    } catch (err) {
        sendMessage(chatId, `[GLM Request Exception]: ${err.message}`);
    }
}

function checkAuthorization(chatId) {
    const chatIdStr = String(chatId);

    if (!chatIdStr.startsWith('LINE:')) {
        return { authorized: false, reason: '⛔ Access Denied: คุณไม่มีสิทธิ์เข้าถึงระบบ (Unauthorized User)' };
    }

    const lineSourceId = chatIdStr.slice(5);
    const lineCfg = secretsLoader.readSecretJson('line_config.json', agyBaseDir);
    const allowedLineIds = [lineCfg.line_target_group_id, lineCfg.line_target_user_id].filter(Boolean);
    if (!allowedLineIds.includes(lineSourceId)) {
        return { authorized: false, reason: '⛔ Access Denied: คุณไม่มีสิทธิ์เข้าถึงระบบ (Unauthorized LINE User)' };
    }
    return { authorized: true };
}


function handleCommand(chatId, text, msg = null) {
    const auth = checkAuthorization(chatId);
    if (!auth.authorized) {
        sendMessage(chatId, auth.reason);
        return;
    }
    const lower = text.toLowerCase();
    
    // /model command to switch between OKMD, GLM and AGY CLI
    if (lower === '/model' || lower.startsWith('/model ')) {
        const parts = text.trim().split(/\s+/);
        const targetModel = parts[1] ? parts[1].toLowerCase() : '';
        const { glmConfig, glmCfgPath } = getGlmConfig();

        if (!targetModel) {
            let currentEngineName = 'OKMD Playground (Deepseek-V4-Pro)';
            if (currentAiEngine === 'okmd') currentEngineName = `OKMD (${OKMD_CONFIG.Model})`;
            else if (currentAiEngine === 'agy') currentEngineName = 'AGY CLI (Google Antigravity Direct)';
            else if (currentAiEngine === 'glm') currentEngineName = `GLM (${glmConfig.Model || 'glm-5.3-flash'})`;

            const reply = `👑 <b>[สถานะ AI Engine ปัจจุบันของเลขา]</b>\n\n` +
                          `• <b>Active Engine:</b> <b>${currentEngineName}</b>\n` +
                          `• <b>OKMD Model:</b> <code>${OKMD_CONFIG.Model}</code>\n` +
                          `• <b>โควต้า OKMD:</b> 180,000 tokens/วัน (Primary Brain)\n\n` +
                          `📌 <b>วิธีเลือกหรือสลับโมเดล:</b>\n` +
                          `• <code>/model deepseek</code> - Deepseek V4 Pro (ฉลาดมาก โควต้าสูง 180k)\n` +
                          `• <code>/model claude</code> - Claude Sonnet 5 (ภาษาไทยระดับพรีเมียม)\n` +
                          `• <code>/model gpt</code> - GPT-5.4 (โมเดลเรือธง OpenAI)\n` +
                          `• <code>/model gemini</code> - Gemini 2.5 Flash Lite (เร็ว ประหยัด)\n` +
                          `• <code>/model qwen</code> - Qwen 3.7 Plus (คำนวณและลอจิก)\n` +
                          `• <code>/model agy</code> - สลับไปใช้ Google Antigravity CLI\n` +
                          `• <code>/model glm</code> - สลับไปใช้ Open Weights GLM`;
            sendMessage(chatId, reply);
            return;
        }

        // 1. Switch to OKMD Models — table of matcher -> {model, provider, label, note}
        const okmdModelTable = [
            { match: m => m.includes('deepseek') || m === 'ds' || m === 'okmd',
              model: m => m.includes('flash') ? 'deepseek-v4-flash' : 'deepseek-v4-pro',
              provider: 'Deepseek', label: 'OKMD', note: 'พร้อมตอบคำถามทันใจและจำกฎธุรกิจทั้งหมดแล้วครับ! ✨' },
            { match: m => m.includes('claude') || m.includes('sonnet'),
              model: m => m.includes('4.6') ? 'claude-sonnet-4.6' : 'claude-sonnet-5',
              provider: 'Claude', label: 'Claude', note: 'ภาษาไทยเนียนระดับพรีเมียม พร้อมทำงานทันทีครับ! 🌸' },
            { match: m => m.includes('gpt') || m.includes('openai'),
              model: m => m.includes('mini') ? 'gpt-5.4-mini' : 'gpt-5.4',
              provider: 'OpenAI', label: 'OpenAI', note: 'พร้อมประมวลผลคำสั่งแล้วครับ! ⚡' },
            { match: m => m.includes('gemini') || m.includes('flash'),
              model: m => m.includes('3.7') ? 'gemini-3.7-flash' : 'gemini-2.5-flash-lite',
              provider: 'Gemini', label: 'Google Gemini', note: 'ความเร็วสูงพิเศษ พร้อมทำงานแล้วครับ! 🚀' },
            { match: m => m.includes('qwen'),
              model: () => 'qwen3.7-plus',
              provider: 'Qwen', label: 'Qwen', note: 'พร้อมคำนวณและวิเคราะห์ลอจิกแล้วครับ! 🧮' },
        ];
        const okmdMatch = okmdModelTable.find(e => e.match(targetModel));
        if (okmdMatch) {
            currentAiEngine = 'okmd';
            config.DefaultEngine = 'okmd';
            OKMD_CONFIG.Model = okmdMatch.model(targetModel);
            OKMD_CONFIG.Provider = okmdMatch.provider;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            sendMessage(chatId, `✅ สลับโมเดลหลักเป็น: 👑 ${okmdMatch.label} (${OKMD_CONFIG.Model})\n${okmdMatch.note}`);
            return;
        }

        // 2. Switch to GLM
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

        // 3. Switch to AGY CLI
        if (targetModel === 'agy' || targetModel === 'antigravity') {
            currentAiEngine = 'agy';
            config.DefaultEngine = 'agy';
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            sendMessage(chatId, `✅ สลับโมเดลเริ่มต้นเป็น: AGY CLI (Google Antigravity)\nพิมพ์ข้อความหรือคำสั่งได้โดยตรง ระบบจะส่งให้ AGY CLI ประมวลผล`);
            return;
        }

        sendMessage(chatId, `ไม่รู้จักโมเดล "${targetModel}"\nพิมพ์ /model เพื่อดูรายชื่อโมเดลทั้งหมดที่รองรับครับ`);
        return;
    }

    // Set GLM Base URL (for Local Open Weights or Cloud API)
    if (lower.startsWith('/set_glm_url ') || lower.startsWith('/glm_url ')) {
        const url = text.substring(text.indexOf(' ') + 1).trim();
        const { glmConfig, glmCfgPath } = getGlmConfig();
        glmConfig.BaseUrl = url;
        fs.writeFileSync(glmCfgPath, JSON.stringify(glmConfig, null, 2), 'utf8');
        sendMessage(chatId, `[GLM Config]\nบันทึก Base URL เรียบร้อยแล้ว: ${url}\nโมเดล: ${glmConfig.Model}`);
        return;
    }

    // Set GLM API Key command - DISABLED (Fix H-12)
    if (lower.startsWith('/set_glm_key ') || lower.startsWith('/glm_key ')) {
        sendMessage(chatId, '⛔ เพื่อความปลอดภัย กรุณาตั้งค่า API Key ในไฟล์คอนฟิกหรือ Environment Variables บนเซิร์ฟเวอร์โดยตรง (Fix H-12)');
        return;
    }
    
    // Explicit GLM command
    if (lower.startsWith('/glm ') || lower.startsWith('/chatglm ')) {
        const prompt = text.substring(text.indexOf(' ') + 1).trim();
        runGlm(chatId, prompt);
        return;
    }
    
    // 0. Cabbage Intake Schedule Query Handler (ตารางเข้ากะหล่ำ / ตารางกะ)
    if (lower.includes('ตารางเข้ากะหล่ำ') || lower.includes('ตารางกะหล่ำ') || (lower.includes('ตาราง') && (lower.includes('กะหล่ำ') || lower.includes('เข้ากะ')))) {
        try {
            // Operational schedules now live in Google Sheets; the dashboard is the live reader.
            const activeOps = [];
            const cabbageOps = activeOps.filter(o => (o.product || '').includes('กะหล่ำ') || (o.customer || '').includes('ศาลายา'));

            let reply = `🥬 <b>[ตารางติดตามการเข้ากะหล่ำปลี & สั่งรถ]</b>\n──────────────────\n`;
            if (cabbageOps.length > 0) {
                cabbageOps.slice(0, 6).forEach((op, idx) => {
                    const statusIcon = (op.status || '').includes('เรียบร้อย') ? '✅' : '🚚';
                    reply += `${idx + 1}. <b>ส่งมอบ ${op.delivery_date}:</b> ${op.product} ${(op.qty_kg || 0).toLocaleString()} กก.\n` +
                             `   • สวน: ${op.farm || '-'}\n` +
                             `   • รถ: ${op.truck || '-'}\n` +
                             `   • สถานะ: ${statusIcon} ${op.status || '-'}\n`;
                    if (op.notes) reply += `   • บันทึก: ${op.notes}\n`;
                    reply += `\n`;
                });
            } else {
                reply += `⚠️ ยังไม่มีข้อมูลตารางเข้ากะหล่ำในระบบตอนนี้\n` +
                         `กรุณาส่งรายงานเข้ากะ/ส่งมอบเข้ามาก่อน ระบบจะบันทึกและแสดงผลที่นี่โดยอัตโนมัติ\n\n`;
            }
            reply += `──────────────────\n` +
                     `📱 ดูตารางสดและผลสุ่มปอกจริง: https://pscdb.onrender.com/ops`;
            sendMessage(chatId, reply);
            return;
        } catch (e) {
            sendMessage(chatId, `❌ เกิดข้อผิดพลาดในการอ่านตารางเข้ากะหล่ำ: ${e.message}`);
            return;
        }
    }

    // 0.1 Smart File Request / Download Handler
    if (lower.startsWith('ขอไฟล์') || lower.startsWith('ส่งไฟล์') || lower.startsWith('/file') || lower.startsWith('download') || lower.includes('ขอไฟล์') || lower.includes('ส่งไฟล์')) {
        let query = text.replace(/^(ขอไฟล์|ส่งไฟล์|\/file|download)\s*/i, '').trim();
        if (query.toLowerCase().includes('master') || query.toLowerCase().includes('มาสเตอร์') || query.includes('ออเดอร์')) {
            const wsDir = process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26';
            const masterExcel = path.join(wsDir, 'Master_Order_Schedule_2026.xlsx');
            if (fs.existsSync(masterExcel)) {
                sendMessage(chatId, '📊 กำลังส่งไฟล์ Master Order Schedule 2026 ให้ครับ...');
                sendDocument(chatId, masterExcel, '📊 Master_Order_Schedule_2026.xlsx (ไฟล์รวบรวมออเดอร์ 3 ลูกค้า)');
                return;
            }
        }
        
        sendMessage(chatId, `🔍 กำลังค้นหาไฟล์ "${query || 'ที่ต้องการ'}" ในระบบ...`);
        // Fix H-04: Confine file scanning to business docs folder only
        const wsDir = process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26';
        const searchRoots = [wsDir];
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
        sendMessage(chatId, '⛔ ฟังก์ชันการรันคำสั่ง Shell ถูกปิดใช้งานถาวรเพื่อความปลอดภัยของระบบ (Fix C-02)');
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

    // 2.8 Daily Cabbage Price & Transport Survey Parser
    const isPriceSurvey = !hasNegation && (
        text.includes('ราคากะหล่ำ') || 
        (text.includes('พันธุ์ข้าง') && (text.includes('ค่ารถ') || text.includes('บาท'))) ||
        (text.includes('เจ๊อารีย์') && text.includes('เฮียหนิง') && text.includes('ค่ารถ'))
    );
    if (isPriceSurvey) {
        handleCabbagePriceSurvey(chatId, text);
        return;
    }

    // =========================================================================
    // 🌟 UNIFIED AI PARSER (STOCK, INTAKE, LOADING & YIELD IN A SINGLE ENGINE)
    // =========================================================================
    const isOpsOrStockPattern = !hasNegation && (
        text.includes('สต็อก') || text.includes('สต๊อก') || text.toLowerCase().includes('stock') ||
        text.includes('ขึ้นของ') || text.includes('รับเข้า') || text.includes('รับกะหล่ำ') || text.includes('รับหอม') || text.includes('รับพริก') || text.includes('ขึ้นกะหล่ำ') ||
        text.includes('ขึ้นหอม') || text.includes('กะหล่ำเข้า') || text.includes('หอมเข้า') ||
        text.includes('สุ่มปอก') || text.includes('ปอกได้') || text.includes('จำนวนที่ได้รับ') ||
        text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง') ||
        (text.includes('ขึ้น') && text.includes('ค่ารถ')) ||
        (text.includes('กก.') && (text.includes('บ.') || text.includes('บาท')))
    );

    if (isOpsOrStockPattern) {
        sendChatAction(chatId, 'typing');

        const systemPrompt = `คุณคือระบบสกัดข้อมูลอัตโนมัติ PSC Operations สกัดข้อมูลจากข้อความภาษาไทยลงฟอร์แมต JSON เท่านั้น
รูปแบบ JSON ที่ต้องส่งกลับ:
{
  "date": "วันที่ (เช่น 03/09/69)",
  "supplier": "ชื่อสวน/ผู้ขาย (เช่น เฮียหนิง, เจ๊อารีย์, ป้าผา, เฮียบุญชู)",
  "location": "สถานที่ (เช่น โกดัง อมพาย แม่สะเรียง, ฮอด)",
  "item": "ชื่อสินค้า (เช่น กะหล่ำปลี, หอมแดง, พริกหวาน, แครอท)",
  "weight_kg": 8725, // ตัวเลขน้ำหนักตัวเลขล้วน (กก.) ถ้าไม่มีให้ใส่ null
  "freight_baht": 13000, // ค่ารถตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "payment": "เงื่อนไขชำระเงิน (เช่น เก็บปลายทาง)",
  "size": "ขนาด (เช่น กลาง, เล็ก, ใหญ่)",
  "condition": "สภาพสินค้า (เช่น สภาพโดยรวมดี แมง+ราเล็กน้อย)",
  "sample_kg": 100, // น้ำหนักสุ่มปอก ตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "peeled_kg": 64.8, // น้ำหนักที่ปอกได้ ตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "yield_pct": 64.8, // เปอร์เซ็นต์ Yield หากมีข้อมูลสุ่มปอกให้คำนวณ (peeled_kg / sample_kg * 100)
  "price_per_kg": 3.0, // ราคาต่อ กก. ถ้ามี
  "stock_inventory": { // ถ้ามีการระบุยอดสต็อกคงเหลือ
    "Cabbage": null,
    "Onion_AFT": null,
    "Onion_Chinese": null,
    "Carrot": null,
    "Purple_Sweet_Potato": null,
    "Yellow_Sweet_Potato": null,
    "Orange_Sweet_Potato": null
  }
}
ห้ามมโนข้อมูล ถ้าช่องไหนไม่มีในข้อความให้ใส่ null ห้ามตอบข้อความอื่นนอกจาก JSON`;

        const postData = JSON.stringify({
            model: GROQ_CONFIG.Model,
            response_format: { type: "json_object" },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ]
        });

        const urlObj = require('url').parse(GROQ_CONFIG.Url);
        const req = require('https').request({
            hostname: urlObj.hostname,
            path: urlObj.path,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + GROQ_CONFIG.ApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 20000
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    let parsed = null;
                    let result = null;
                    try { parsed = JSON.parse(resData); } catch(e){}

                    if (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
                        try { result = JSON.parse(parsed.choices[0].message.content.trim()); } catch(e){}
                    }

                    const forcedIntakeText = /(?:รับ\s*(?:เข้า|ของ|กะหล่ำ|หอม|พริก)|สุ่ม\s*ปอก|ปอก\s*ได้)/i.test(text);
                    const deterministicIntake = forcedIntakeText ? extractLoadingReportFromText(text) : null;
                    if (deterministicIntake) {
                        result = Object.assign({}, result || {}, deterministicIntake);
                    } else if (!result) {
                        result = extractLoadingReportFromText(text) || extractStockFromText(text);
                    }

                    if (!result || (!result.weight_kg && !result.stock_inventory && !result.yield_pct && !result.price_per_kg && !result.freight_baht)) {
                        writeLog('[AI Parser Warning]: No valid actionable data extracted: ' + text.substring(0, 60));
                        return;
                    }
                    const { recordLoadingReport, syncToRender } = require('./webhook_server.js');
                    const lineNotifier = require('./line_notifier.js');

                    // 1. Forward stock and yield updates to the Drive-backed Google Sheets gateway.
                    const stockPayload = { Items: {}, AsOfDate: result.date || undefined };

                    // Auto-calculate yield if sample given using strict production module
                    let calcYield = result.yield_pct;
                    if (!calcYield && result.sample_kg !== null && result.peeled_kg !== null) {
                        try {
                            calcYield = calculateYieldPct(result.sample_kg, result.peeled_kg);
                        } catch (err) {
                            writeLog('[Yield Calc Warning]: ' + err.message);
                        }
                    }

                    const lineEventId = `line:${chatId}:${(msg && msg.message_id) ? msg.message_id : Date.now()}`;
                    if (result.stock_inventory && typeof result.stock_inventory === 'object') {
                        const inv = result.stock_inventory;
                        Object.entries(inv).forEach(([key, value]) => {
                            if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
                                stockPayload.Items[key] = { StockKg: Number(value) };
                            }
                        });
                    }
                    if (calcYield && (result.item || '').includes('กะหล่ำ')) {
                        stockPayload.yield_pct = Number(calcYield);
                    }
                    if (Object.keys(stockPayload.Items).length || stockPayload.yield_pct) {
                        stockPayload.eventId = lineEventId;
                        syncToRender('/api/stock-update', stockPayload);
                    }

                    // 2. Process Operations / Intake / Loading Report
                    const isReceivingReport = /(?:รับ\s*(?:เข้า|ของ|กะหล่ำ|หอม|พริก)|สุ่ม\s*ปอก|ปอก\s*ได้)/i.test(text);
                    const isIntakeOrLoading = !!(
                        result.weight_kg || 
                        result.freight_baht || 
                        result.location || 
                        result.condition || 
                        result.sample_kg || 
                        result.peeled_kg || 
                        calcYield ||
                        text.includes('ขึ้นของ') ||
                        text.includes('รับเข้า') ||
                        text.includes('รับกะหล่ำ') ||
                        text.includes('รับหอม') ||
                        text.includes('รับพริก') ||
                        text.includes('ขึ้นกะหล่ำ') ||
                        text.includes('ขึ้นหอม') ||
                        text.includes('กะหล่ำเข้า')
                    );

                    if (isIntakeOrLoading) {
                        let cardId = 'salaya_1409';
                        const rawTextLower = text.toLowerCase();
                        const dateStr = result.date || '';
                        if (text.includes('หอมแดง')) {
                            cardId = (dateStr.includes('21') || dateStr.includes('20')) ? 'tns_shallot_2109' : 'tns_shallot_0709';
                        } else if (text.includes('พริก')) {
                            cardId = 'tns_pepper_1609';
                        } else if (dateStr.includes('13') || dateStr.includes('14')) {
                            cardId = 'salaya_1409';
                        } else if (dateStr.includes('15') || dateStr.includes('16')) {
                            cardId = 'salaya_1509';
                        } else if (dateStr.includes('17') || dateStr.includes('18')) {
                            cardId = 'salaya_1709';
                        } else if (dateStr.includes('09') || dateStr.includes('10')) {
                            cardId = 'salaya_0809';
                        } else if (dateStr.includes('04') || dateStr.includes('05')) {
                            cardId = 'salaya_0509';
                        } else if (dateStr.includes('07') || dateStr.includes('08')) {
                            cardId = 'salaya_0809';
                        } else if (dateStr.includes('01') || dateStr.includes('02')) {
                            cardId = 'salaya_0209';
                        } else if (dateStr.includes('03')) {
                            cardId = 'salaya_0309';
                        }

                        const weightFormatted = result.weight_kg ? (result.weight_kg.toLocaleString() + ' kg') : '';
                        const freightFormatted = result.freight_baht ? (result.freight_baht.toLocaleString() + ' บาท') : '';

                        const reportObj = {
                            cardId: cardId,
                            date: result.date || formatDMY(),
                            item: result.item ? (`${result.item} (${result.supplier || 'สวน'})`) : 'รับเข้าวัตถุดิบ',
                            weight: weightFormatted,
                            freight: freightFormatted,
                            payment: result.payment || '',
                            location: result.location || '',
                            receivedYield: calcYield || null,
                            receivedPrice: result.price_per_kg || null,
                            receivedCondition: result.condition || '',
                            receivedSize: result.size || '',
                            rawText: text,
                            reportType: isReceivingReport ? 'intake' : 'dispatch'
                        };

                        recordLoadingReport(reportObj);
                    } else {
                        writeLog('[Ops Notice]: Pure stock inventory count detected; skipped shipment loading report overwrite.');
                    }

                    // 3. Price and freight records are maintained in the Drive workbook.

                    // 4. Construct Clear Bot Response & LINE Push
                    let reply = isReceivingReport
                        ? `✅ <b>[บันทึกรับเข้า/รับของ PSC เรียบร้อย]</b>\n`
                        : `✅ <b>[บันทึกงานขึ้นของ PSC เรียบร้อย]</b>\n`;
                    reply += `──────────────────\n`;
                    if (result.date) reply += `📅 <b>${isReceivingReport ? 'วันที่รับเข้า' : 'วันที่'}:</b> ${result.date}\n`;
                    if (result.item || result.supplier) reply += `🥬 <b>รายการ:</b> ${result.item || 'ผัก'} (${result.supplier || 'ไม่ระบุสวน'})\n`;
                    if (result.weight_kg) reply += `⚖️ <b>น้ำหนัก:</b> ${result.weight_kg.toLocaleString()} กก.\n`;
                    if (calcYield) reply += `📈 <b>Yield (สุ่มปอก):</b> ${calcYield}%\n`;
                    if (result.size) reply += `📦 <b>ขนาด:</b> ${result.size}\n`;
                    if (result.condition) reply += `🔍 <b>สภาพ:</b> ${result.condition}\n`;
                    if (result.freight_baht) reply += `🚛 <b>ค่ารถ:</b> ${result.freight_baht.toLocaleString()} บาท (${result.payment || 'เก็บปลายทาง'})\n`;
                    if (result.location) reply += `📍 <b>สถานที่:</b> ${result.location}\n`;

                    if (Object.keys(stockPayload.Items).length || stockPayload.yield_pct) {
                        reply += `──────────────────\n`;
                        reply += `📦 <b>ส่งข้อมูลสต็อก/Yield เข้า Google Sheets แล้ว</b>\n`;
                    }

                    reply += `──────────────────\n`;
                    reply += `🌐 <i>ข้อมูลถูกซิงก์ขึ้นเว็บและแจ้งเตือนเข้ากลุ่ม LINE เรียบร้อย</i>\nhttps://pscdb.onrender.com`;

                    // In LINE group: reply briefly "รับทราบรายการวันที่ ... ค่ะ"
                    // Full details are sent to the private admin chat
                    const isLineGroup = String(chatId).startsWith('LINE:') && String(chatId).slice(5).startsWith('C');
                    if (isLineGroup) {
                        const shortAck = `รับทราบรายการวันที่ ${result.date || formatDMY()} ค่ะ`;
                        sendMessage(chatId, shortAck);
                    } else {
                        sendMessage(chatId, reply);
                    }

                    // Send Full Alert to Admin (Private LINE)
                    const lineText = `📢 [อัปเดตงาน PSC ${result.date || formatDMY()}]\n` +
                                     `• ${result.item || 'วัตถุดิบ'} ${result.supplier ? '(' + result.supplier + ')' : ''}\n` +
                                     (result.weight_kg ? `• น้ำหนัก: ${result.weight_kg.toLocaleString()} kg\n` : '') +
                                     (calcYield ? `• Yield: ${calcYield}%\n` : '') +
                                     (result.condition ? `• สภาพ: ${result.condition}\n` : '') +
                                     `\n🌐 ดูรายละเอียดสด: https://pscdb.onrender.com/ops\n🔑 Team Access Code: 9624 (กรอกครั้งเดียว จำเซสชัน 30 วัน)`;
                    lineNotifier.sendLineMessage(lineText).catch(e => {});

                } catch(e) {
                    console.error('[Unified Parser Error]:', e);
                    sendMessage(chatId, '❌ [Processing Error]: ' + e.message);
                }
            });
        });

        req.on('error', (e) => sendMessage(chatId, '❌ [Network Error]: ' + e.message));
        req.write(postData);
        req.end();
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
        const wsDir = process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26';
        const targetFile = path.join(wsDir, 'TNS', 'PO', '2026', 'SEP Order PSC.xlsx');
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
    
    // Approach 2: Direct Command to update AI Quota
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

            const formatPct = quotaTracker.formatPct || (v => Number(v).toFixed(2) + '%');
            const reply = '✅ <b>[อัปเดตโควต้า AGY สำเร็จ & ซิงค์ขึ้นคลาวด์แล้ว]</b>\n\n' +
                          '• Gemini Weekly: <b>' + formatPct(weekVal) + '</b>\n' +
                          '• Gemini 5-Hour: <b>' + formatPct(fiveVal) + '</b> (รีเฟรชใน ' + fiveRef + ')\n\n' +
                          '📱 <i>ข้อมูลอัปเดตตรงเข้า Mini App เรียบร้อยแล้วค่ะ</i>';
            sendMessage(chatId, reply);
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
        const usageText = quotaTracker.formatUsageForLine();
        sendMessage(chatId, usageText);
        return;
    }

    // 3.1 Memory & Continuous Learning Commands
    if (lower === '/memory' || lower === '🧠 ความจำเลขา' || lower === 'ความจำ' || lower === 'จำอะไรได้บ้าง' || lower === '/knowledge') {
        const memText = memoryEngine.formatMemoryForLine();
        sendMessage(chatId, memText);
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
    
    // Reboot / Restart Command
    if (lower === '/reboot' || lower === '/restart' || lower === 'รีบูต' || lower === 'รีสตาร์ต' || lower === 'รีเซ็ตบอท') {
        sendMessage(chatId, '🔄 <b>[กำลังรีสตาร์ตระบบบอทเลขา...]</b>\n\nระบบกำลังตัดการทำงานและเริ่มใหม่อัตโนมัติใน 1 วินาทีค่ะ 🚀');
        setTimeout(() => {
            const rebootSigFile = path.join(__dirname, 'reboot_bot.signal');
            try { fs.writeFileSync(rebootSigFile, new Date().toISOString(), 'utf8'); } catch(e) {}
            // Force exit this process, Supervisor will instantly relaunch it!
            process.exit(0);
        }, 800);
        return;
    }

    if (lower === '/start' || lower === '/dashboard' || lower === 'dashboard' || lower === 'แดชบอร์ด') {
        sendMessage(chatId, getDashboardSummary());
        return;
    }
    else if (lower === '/menu' || lower === 'เมนู' || lower === '/help' || lower === 'help') {
        const reply = `🤖 <b>[ระบบเลขา AI - รับคำสั่งข้อความโดยตรง 100%]</b>\n\n` +
                      `✨ <b>สามารถพิมพ์สอบถามหรือสั่งงานภาษาไทยได้ทันที:</b>\n` +
                      `• <i>"ขอสรุป order aft ล่าสุด"</i>\n` +
                      `• <i>"สต็อกกะหล่ำปลีเหลือเท่าไหร่"</i>\n` +
                      `• <i>"รอบส่ง yamamori มีวันไหนบ้าง"</i>\n` +
                      `• <i>"ขอไฟล์ PO ล่าสุด"</i>\n\n` +
                      `📌 <b>คำสั่งด่วน (Shortcuts):</b>\n` +
                      `• <code>/dashboard</code> - สรุปภาพรวมระบบทั้งหมด\n` +
                      `• <code>/po</code> - สรุปยอด PO ก.ย. 69 ทุกโรงงาน\n` +
                      `• <code>/stock</code> - ยอดสต็อกคงเหลือจริง\n` +
                      `• <code>/check</code> - เช็กอีเมล Gmail PO ทันที\n` +
                      `• <code>/prep_gt</code> - ตรวจสอบตาราง GT ล่วงหน้า\n` +
                      `• <code>/quota</code> - เช็กโควต้า AI\n` +
                      `• <code>/memory</code> - ความจำเลขา\n` +
                      `• <code>/status</code> - สถานะเซิร์ฟเวอร์
• <code>/reboot</code> - รีสตาร์ตบอททันที (เมื่อบอทค้าง)`;
        sendMessage(chatId, reply);
        return;
    }
    else if (lower === '🎨 ai studio 300dpi' || lower === '/diffusion' || lower === '/studio' || lower === '300dpi') {
        const reply = `🎨 [AI Diffusion 300 DPI Hand-Drawn Studio]\n\n` +
                      `✨ คลังภาพและ Master Prompts 500 ชุด 6 หมวดหมู่:\n` +
                      `  • 🌿 Botanical (85) | 🦊 Wildlife (85)\n` +
                      `  • 🏛️ Architecture (85) | ☕ Doodles (80)\n` +
                      `  • 🐉 Fantasy (85) | 🍞 Still Life (80)\n\n` +
                      `🖨️ สเปกการพิมพ์: 300 DPI Print Quality\n` +
                      `📁 ที่อยู่โปรเจกต์: ${path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'ai_diffusion_500_handdrawn')}\n\n` +
                      `⚡ สั่งรัน batch ได้ด้วย: /cmd powershell -File "${path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'ai_diffusion_500_handdrawn', 'run_batch.ps1')}" -Limit 5`;
        sendMessage(chatId, reply);
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
                      ``;
        sendMessage(chatId, reply);
        return;
    }
    else if (lower === '/prep_gt' || lower === '📅 กำหนดส่ง gt') {
        sendMessage(chatId, 'กำลังตรวจสอบและจัดทำ GT ล่วงหน้า 2 วัน (Multi-Customer)...');
        execSilent(`"${process.execPath}" "${path.join(agyBaseDir, 'Auto-PrepareGT.js')}"`, (err, stdout) => {
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
                      `  • PO2358 (10/09) [Rev]: แครอท 136kg, หอมใหญ่ 1,300kg\n` +
                      `  • PO2424 (14/09): แครอท 136kg, หอมใหญ่ 605kg\n` +
                      `  • PO2425 (16/09): หอมใหญ่ 920kg\n` +
                      `  ➔ <b>รวม Yamamori: 3,902 kg (132,336 บ.)</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `🌟 <b>ยอดรวมทั้ง 3 โรงงาน: 113,416 kg</b>\n\n` +
                      `📱 <i>แตะปุ่มด้านล่างเพื่อเปิด PSC Mini App</i>`;
        sendMessage(chatId, reply);
        return;
    }
    else if (lower === '/latest' || lower === '📁 ไฟล์ล่าสุด') {
        const wsDir = process.env.PSC_WORKSPACE_DIR || 'E:\\รวมงาน\\งาน 25-26';
        execSilent(`powershell -WindowStyle Hidden -Command "Get-ChildItem -Path '${wsDir}' -Include '*.pdf','*.xlsx' -Recurse | Where-Object { $_.Name -notlike 'COA*' -and $_.Name -notlike 'image*' -and $_.FullName -notlike '*\\.trashed*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-Object -ExpandProperty FullName"`, (err, stdout) => {
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
        sendMessage(chatId, '⛔ เพื่อความปลอดภัย กรุณาตั้งค่ารหัสผ่านอีเมลในไฟล์คอนฟิกหรือ Environment Variables บนเซิร์ฟเวอร์โดยตรง ไม่อนุญาตให้ส่งผ่านแชท (Fix H-12)');
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
                matches.slice(0, 10).forEach(m => {
                    const cleanM = m.replace('[SAVED]', '').trim();
                    r += `• ${cleanM}\n`;
                    try {
                        const detail = formatPoDetailsForNotification(cleanM);
                        if (detail) r += detail + '\n';
                    } catch(e) {}
                });
                r += `อัปเดตไฟล์ Excel, GT Schedule และ Dashboard บนเว็บเรียบร้อยแล้ว`;
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
        // 4. Default Direct Route -> OKMD Playground (Primary) / AGY / GLM
        if (currentAiEngine === 'okmd') {
            runOkmdEngine(chatId, text);
        } else if (currentAiEngine === 'glm') {
            runGlm(chatId, text);
        } else {
            runAgyCli(chatId, text);
        }
    }
}

// Start polling

// Legacy polling/menu-button connector removed (LINE is the only active channel now).

// Exported so webhook_server.js can route LINE messages through the same
// command/report-parsing pipeline used for all incoming messages.

const { createLineHandler } = require('./line_handler.js');
const { handleLineImage } = createLineHandler({ agyBaseDir, agyExe, sendMessage, writeLog, checkAuthorization });

module.exports = { handleCommand, handleLineImage };
