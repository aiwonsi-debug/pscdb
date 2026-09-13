const fs = require('fs');
let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

const target = "menu_button: { type: 'default' }";
const injection = "menu_button: { type: 'web_app', text: '📊 Dashboard', web_app: { url: 'https://pscdb.onrender.com' } }";

if (content.includes(target)) {
    content = content.replace(target, injection);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Patched mini app button in bot.js');
} else {
    console.log('Target not found or already patched.');
}
