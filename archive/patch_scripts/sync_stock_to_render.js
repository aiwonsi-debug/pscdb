/**
 * sync_stock_to_render.js
 * Push stock_inventory.json → pscdb.onrender.com/api/stock-update
 * Usage: node sync_stock_to_render.js [PSC_API_KEY]
 */
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const RENDER_URL = 'https://pscdb.onrender.com';
const STOCK_FILE = path.join(__dirname, 'agymemory', 'stock_inventory.json');
const KEY_FILE   = path.join(__dirname, 'psc_api_key.txt');

// Resolve API key: CLI arg > key file > env var
let PSC_API_KEY = (process.argv[2] || process.env.PSC_API_KEY || '').trim();
if (!PSC_API_KEY && fs.existsSync(KEY_FILE)) {
  PSC_API_KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
}

if (!PSC_API_KEY) {
  console.error('[sync] ERROR: ไม่พบ PSC_API_KEY');
  console.error('  วิธี 1: node sync_stock_to_render.js YOUR_KEY');
  console.error('  วิธี 2: บันทึก key ไว้ใน E:/agy/psc_api_key.txt');
  process.exit(1);
}

// Save key for next runs (no need to type again)
try { fs.writeFileSync(KEY_FILE, PSC_API_KEY, 'utf8'); } catch(e) {}

// Load stock file
let stock;
try {
  stock = JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8'));
} catch (e) {
  console.error('[sync] ERROR: อ่าน stock_inventory.json ไม่ได้:', e.message);
  process.exit(1);
}

console.log('[sync] Stock ' + stock.AsOfDate + ' -> ' + RENDER_URL);
console.log('[sync] Items:', Object.values(stock.Items).map(v => v.Name + ' ' + v.StockKg.toLocaleString() + ' kg').join(' | '));

const postData = JSON.stringify(stock);
const req = https.request({
  hostname: 'pscdb.onrender.com',
  port: 443,
  path: '/api/stock-update',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'X-PSC-API-KEY': PSC_API_KEY
  },
  timeout: 30000
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('[sync] SUCCESS! Stock อัปเดตบน pscdb.onrender.com แล้ว');
    } else {
      console.error('[sync] FAILED (' + res.statusCode + '):', body.substring(0, 200));
      if (res.statusCode === 401)
        console.error('[sync] -> PSC_API_KEY ไม่ถูกต้อง ตรวจสอบใน Render Dashboard > Environment');
    }
  });
});
req.on('error', e => console.error('[sync] Network error:', e.message));
req.on('timeout', () => { req.destroy(); console.error('[sync] Timeout - Render อาจหลับอยู่ ลองใหม่อีกครั้ง'); });
req.write(postData);
req.end();
