const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🔒 SECURITY & INTEGRITY REMEDIATION VERIFICATION TEST SUITE');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        passCount++;
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        failCount++;
        console.log(`❌ [FAIL] ${name}: ${err.message}`);
    }
}

// 1. Verify C-01 & C-02 & C-03 & H-12 in bot.js
test('C-01: bot.js enforces fixed TELEGRAM_ADMIN_CHAT_IDS authorization', () => {
    const botCode = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
    assert.ok(botCode.includes("const ALLOWED_ADMINS = ['1532466397'"), 'Must define fixed ALLOWED_ADMINS');
    assert.ok(botCode.includes('Access Denied'), 'Must reject unauthorized users');
    assert.ok(!botCode.includes('adminChatId = chatId;'), 'Must not dynamically promote any user to admin');
});

test('C-02: bot.js disables remote shell execution (/cmd, /sh, /ps)', () => {
    const botCode = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
    assert.ok(botCode.includes('ฟังก์ชันการรันคำสั่ง Shell ถูกปิดใช้งานถาวรเพื่อความปลอดภัย'), 'Shell command must return disabled warning');
    assert.ok(!botCode.includes('cmdToRun.replace(/"/g'), 'Must not execute shell command');
});

test('C-03: bot.js does not spawn AGY with --dangerously-skip-permissions', () => {
    const botCode = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
    assert.ok(!botCode.includes("'--dangerously-skip-permissions'"), 'Must never contain dangerously-skip-permissions');
});

test('H-12: bot.js disables chat-based secret writes', () => {
    const botCode = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
    assert.ok(botCode.includes('กรุณาตั้งค่ารหัสผ่านอีเมลในไฟล์คอนฟิกหรือ Environment Variables'), 'Must block set_hotmail via chat');
    assert.ok(botCode.includes('กรุณาตั้งค่า API Key ในไฟล์คอนฟิกหรือ Environment Variables'), 'Must block set_glm_key via chat');
});

// 2. Verify C-04, C-05, C-06, H-01, M-03 in webhook_server.js
test('C-04: webhook_server.js does not contain hardcoded fallback bot token', () => {
    const whCode = fs.readFileSync(path.join(__dirname, '../webhook_server.js'), 'utf8');
    assert.ok(!whCode.includes("'8714398918:AAHryAFzpRwmtFSkPnJOsP8U8TO2CQ-yecM'"), 'Must not have hardcoded token in source');
});

test('H-01: webhook_server.js restricts CORS origins', () => {
    const whCode = fs.readFileSync(path.join(__dirname, '../webhook_server.js'), 'utf8');
    assert.ok(!whCode.includes("res.setHeader('Access-Control-Allow-Origin', '*');"), 'Must not allow wildcard CORS');
    assert.ok(whCode.includes("allowedOrigins.includes(reqOrigin)"), 'Must check allowed origins');
});

test('M-03: webhook_server.js limits JSON request body size', () => {
    const whCode = fs.readFileSync(path.join(__dirname, '../webhook_server.js'), 'utf8');
    assert.ok(whCode.includes('MAX_BODY_SIZE'), 'Must define MAX_BODY_SIZE');
    assert.ok(whCode.includes('Payload Too Large'), 'Must reject bodies exceeding limit');
});

test('C-06: webhook_server.js validates stock-update schema and writes atomically', () => {
    const whCode = fs.readFileSync(path.join(__dirname, '../webhook_server.js'), 'utf8');
    assert.ok(whCode.includes('Must contain Items object'), 'Must validate schema');
    assert.ok(whCode.includes('renameSync'), 'Must commit file using atomic rename');
});

// 3. Verify H-07, H-08 in excel_integrity_engine.js
test('H-07 & H-08: excel_integrity_engine.js resolves sheet relationships and fails closed', () => {
    const exCode = fs.readFileSync(path.join(__dirname, '../excel_integrity_engine.js'), 'utf8');
    assert.ok(exCode.includes('xl/_rels/workbook.xml.rels'), 'Must parse workbook relationship XML');
    assert.ok(exCode.includes('[Strict Validation Failure]'), 'Must fail closed on missing target sheet');
    assert.ok(!exCode.includes('sheetMap[sheetMap.length - 1]'), 'Must not silently fallback to last sheet');
});

// 4. Verify H-11 in memory_engine.js
test('H-11: memory_engine.js protects immutable business rules from chat injection', () => {
    const memCode = fs.readFileSync(path.join(__dirname, '../memory_engine.js'), 'utf8');
    assert.ok(memCode.includes("rememberItem(fact, 'learned_facts')"), 'Auto-learned facts must never become business_rules');
    assert.ok(memCode.includes('.replace(/["`]/g'), 'Must sanitize stored user strings against injection');
});

console.log('\n================================================================');
console.log(`📊 SECURITY TEST RESULTS: PASS: ${passCount} | FAIL: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) process.exit(1);
