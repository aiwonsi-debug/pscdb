const fs = require('fs');
let file = 'E:/agy/webhook_server.js';
let content = fs.readFileSync(file, 'utf8');

const injection = `
        if (req.method === 'POST' && pathname === '/api/stock-update') {
            const body = await getBody();
            try { fs.writeFileSync(stockFile, JSON.stringify(body, null, 2), 'utf8'); } catch(e){}
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true }));
        }
`;

const target = "        // Real-Time Live Stock Inventory Endpoint";
if (!content.includes('/api/stock-update')) {
    content = content.replace(target, injection + "\n" + target);
    fs.writeFileSync(file, content, 'utf8');
    fs.writeFileSync('E:/agy/render-dashboard/webhook_server.js', content, 'utf8');
}
console.log('Patched webhook_server.js');
