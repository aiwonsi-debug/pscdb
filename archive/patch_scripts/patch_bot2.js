const fs = require('fs');
let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

const target = "stock.LastUpdated = new Date().toISOString();";
const injection = `stock.LastUpdated = new Date().toISOString();
                    const { syncToRender } = require('./webhook_server.js');
                    syncToRender('/api/stock-update', stock);`;

if (!content.includes('/api/stock-update')) {
    content = content.replace(target, injection);
    fs.writeFileSync(file, content, 'utf8');
}
console.log('Patched bot.js');
