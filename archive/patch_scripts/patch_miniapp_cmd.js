const fs = require('fs');
let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

const target = "if (lower === '/agy-customizations' || lower === '/customization') {";
const injection = `
      if (lower === '/miniapp' || lower === '/app' || lower === 'miniapp' || lower === '/dashboard') {
          const replyMarkup = {
              inline_keyboard: [[
                  { text: '📊 เปิด AGY Dashboard (Mini App)', web_app: { url: 'https://pscdb.onrender.com' } }
              ]]
          };
          sendMessage(chatId, 'คลิกปุ่มด้านล่างเพื่อเปิดหน้าต่าง Mini App ของระบบฐานข้อมูล:', replyMarkup);
          return;
      }
`;

if (!content.includes('/miniapp')) {
    content = content.replace(target, injection + "\n      " + target);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Added /miniapp command.');
} else {
    console.log('Command already exists.');
}
