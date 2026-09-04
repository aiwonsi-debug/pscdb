const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const cloudflaredExe = 'C:\\Users\\624\\tools\\cloudflared.exe';
const agyBaseDir = 'E:\\agy';
const urlFile = path.join(agyBaseDir, 'public_tunnel_url.txt');
const tgConfigPath = path.join(agyBaseDir, 'telegram_config.json');

function getTelegramConfig() {
    if (fs.existsSync(tgConfigPath)) {
        try {
            return JSON.parse(fs.readFileSync(tgConfigPath, 'utf8'));
        } catch (e) {}
    }
    return { BotToken: process.env.TELEGRAM_BOT_TOKEN || '', ChatId: process.env.TELEGRAM_CHAT_ID || '1532466397' };
}

function sendTGNotification(url) {
    const { BotToken, ChatId } = getTelegramConfig();
    const msg = `🌐 <b>[เปิดระบบ Public Webhook & Mobile Ops Gateway สำเร็จ]</b>\n` +
                `──────────────────\n` +
                `📱 <b>ลิงก์เว็บสำหรับทีมงานนอกพื้นที่ (เน็ต 4G/5G):</b>\n` +
                `👉 <a href="${url}/ops">${url}/ops</a>\n\n` +
                `💡 <b>คำแนะนำสำหรับทีมงาน:</b>\n` +
                `• แตะเปิดลิงก์บน Safari/Chrome บนมือถือ\n` +
                `• กดปุ่มแชร์ ➔ <b>"Add to Home Screen" (เพิ่มไปยังหน้าจอโฮม)</b>\n` +
                `• หน้าเว็บจะกลายเป็นแอปบนหน้าจอมือถือ แตะเปิดเลือกสวน/รถ/ผัก ส่งงานได้ทันทีจากทุกที่ทั่วไทยครับ! ✨\n` +
                `──────────────────\n` +
                `🔒 <i>Cloudflare Encrypted Tunnel (HTTPS ปลอดภัย 100%)</i>`;

    const payload = JSON.stringify({
        chat_id: ChatId,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: false
    });

    const opt = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BotToken}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(payload, 'utf8')
        }
    };

    const req = https.request(opt, (res) => {
        console.log('[Telegram Tunnel Notify] Status:', res.statusCode);
    });
    req.on('error', (err) => console.error('[Telegram Notify Error]:', err.message));
    req.write(payload, 'utf8');
    req.end();
}

console.log('🚀 Starting Cloudflare Tunnel for http://127.0.0.1:8080...');

const proc = spawn(cloudflaredExe, ['tunnel', '--url', 'http://127.0.0.1:8080', '--no-autoupdate'], {
    windowsHide: true
});

let urlFound = false;

function handleOutput(data) {
    const str = data.toString();
    console.log('[cloudflared]', str);

    const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
        urlFound = true;
        const publicUrl = match[0];
        console.log('\n======================================================');
        console.log(`🎉 LIVE PUBLIC TUNNEL URL: ${publicUrl}`);
        console.log(`📱 Field Ops Mobile App:  ${publicUrl}/ops`);
        console.log('======================================================\n');

        fs.writeFileSync(urlFile, publicUrl, 'utf8');
        sendTGNotification(publicUrl);
    }
}

proc.stdout.on('data', handleOutput);
proc.stderr.on('data', handleOutput);

proc.on('close', (code) => {
    console.log(`Cloudflare tunnel exited with code ${code}`);
});

process.on('SIGINT', () => { proc.kill(); process.exit(); });
process.on('SIGTERM', () => { proc.kill(); process.exit(); });
