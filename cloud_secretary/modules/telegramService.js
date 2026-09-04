const https = require('https');

const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '1532466397';

function sendMessage(text) {
  return new Promise((resolve) => {
    if (!botToken || !chatId) {
      console.log('[Telegram-Skip] Token or ChatId missing.');
      return resolve(false);
    }
    const data = JSON.stringify({ chat_id: chatId, text: text });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data, 'utf8')
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[Telegram-Sent] Successfully delivered alert.');
          resolve(true);
        } else {
          console.error('[Telegram-Error]', body);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram-Req-Error]', err.message);
      resolve(false);
    });

    req.write(data, 'utf8');
    req.end();
  });
}

module.exports = { sendMessage };
