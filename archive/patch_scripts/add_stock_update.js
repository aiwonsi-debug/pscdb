const fs = require('fs');

function processJs(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    const injectionCode = `
    const isStockPattern = !hasNegation && (
        text.toLowerCase().includes('update stock') ||
        text.includes('อัพเดทสต๊อก') || text.includes('อัปเดตสต๊อก') ||
        text.includes('อัพเดตสต๊อก') || text.includes('อัปเดตสต็อก') ||
        text.toLowerCase().includes('อัพเดทสต็อก') || text.toLowerCase().includes('อัพเดต stock') ||
        (text.includes('สต็อก') && text.includes('=')) ||
        (text.includes('สต๊อก') && text.includes('=')) ||
        (text.toLowerCase().includes('stock') && text.includes('='))
    );

    if (isStockPattern) {
        sendMessage(chatId, '🔄 [AI Extractor]: กำลังสกัดยอดสต็อกเพื่ออัปเดตฐานข้อมูล...');
        sendChatAction(chatId, 'typing');

        const systemPrompt = \`คุณคือ AI สกัดข้อมูลสต็อก จงสกัดตัวเลขสต็อกสินค้าจากข้อความผู้ใช้ แล้วคืนค่าเป็น JSON
รูปแบบ:
{
  "Cabbage": 2575, // ตัวเลขเท่านั้น ถ้าไม่ระบุให้เป็น null
  "Onion_AFT": 26120,
  "Onion_Chinese": 3560,
  "Carrot": 5840,
  "Purple_Sweet_Potato": 1690,
  "Yellow_Sweet_Potato": 342,
  "Orange_Sweet_Potato": 390
}
ห้ามแต่งตัวเลขเอง ถ้าสินค้าไหนไม่ถูกพูดถึงให้ใส่ null. ลบคอมม่า (,) ออกก่อนแปลงเป็นตัวเลข\`;

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
            hostname: urlObj.hostname, path: urlObj.path, method: 'POST',
            headers: { 'Authorization': 'Bearer ' + GROQ_CONFIG.ApiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    let resultJson = JSON.parse(parsed.choices[0].message.content.trim());
                    
                    const stockPath = path.join(__dirname, 'stock_inventory.json');
                    let stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
                    
                    let updatedKeys = [];
                    if (resultJson.Cabbage !== null && resultJson.Cabbage !== undefined) { stock.Items.Cabbage.StockKg = resultJson.Cabbage; updatedKeys.push('กะหล่ำปลี'); }
                    if (resultJson.Onion_AFT !== null && resultJson.Onion_AFT !== undefined) { stock.Items.Onion_AFT.StockKg = resultJson.Onion_AFT; updatedKeys.push('หอม AFT'); }
                    if (resultJson.Onion_Chinese !== null && resultJson.Onion_Chinese !== undefined) { stock.Items.Onion_Chinese.StockKg = resultJson.Onion_Chinese; updatedKeys.push('หอมจีน'); }
                    if (resultJson.Carrot !== null && resultJson.Carrot !== undefined) { stock.Items.Carrot.StockKg = resultJson.Carrot; updatedKeys.push('แครอท'); }
                    if (resultJson.Purple_Sweet_Potato !== null && resultJson.Purple_Sweet_Potato !== undefined) { stock.Items.Purple_Sweet_Potato.StockKg = resultJson.Purple_Sweet_Potato; updatedKeys.push('มันม่วง'); }
                    if (resultJson.Yellow_Sweet_Potato !== null && resultJson.Yellow_Sweet_Potato !== undefined) { stock.Items.Yellow_Sweet_Potato.StockKg = resultJson.Yellow_Sweet_Potato; updatedKeys.push('มันเหลือง'); }
                    if (resultJson.Orange_Sweet_Potato !== null && resultJson.Orange_Sweet_Potato !== undefined) { stock.Items.Orange_Sweet_Potato.StockKg = resultJson.Orange_Sweet_Potato; updatedKeys.push('มันส้ม'); }
                    
                    stock.LastUpdated = new Date().toISOString();
                    fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
                    try { fs.writeFileSync(path.join(__dirname, 'render-dashboard', 'stock_inventory.json'), JSON.stringify(stock, null, 2), 'utf8'); } catch(e){}

                    let reply = \`✅ <b>อัปเดตสต็อกสำเร็จ (\${updatedKeys.length} รายการ)</b>\\n\`;
                    reply += \`──────────────────\\n\`;
                    if (resultJson.Cabbage !== null && resultJson.Cabbage !== undefined) reply += \`🥬 กะหล่ำปลี: \${resultJson.Cabbage.toLocaleString()} kg\\n\`;
                    if (resultJson.Onion_AFT !== null && resultJson.Onion_AFT !== undefined) reply += \`🧅 หอม AFT: \${resultJson.Onion_AFT.toLocaleString()} kg\\n\`;
                    if (resultJson.Onion_Chinese !== null && resultJson.Onion_Chinese !== undefined) reply += \`🧅 หอมจีน: \${resultJson.Onion_Chinese.toLocaleString()} kg\\n\`;
                    if (resultJson.Carrot !== null && resultJson.Carrot !== undefined) reply += \`🥕 แครอท: \${resultJson.Carrot.toLocaleString()} kg\\n\`;
                    if (resultJson.Purple_Sweet_Potato !== null && resultJson.Purple_Sweet_Potato !== undefined) reply += \`🍠 มันม่วง: \${resultJson.Purple_Sweet_Potato.toLocaleString()} kg\\n\`;
                    if (resultJson.Yellow_Sweet_Potato !== null && resultJson.Yellow_Sweet_Potato !== undefined) reply += \`🍠 มันเหลือง: \${resultJson.Yellow_Sweet_Potato.toLocaleString()} kg\\n\`;
                    if (resultJson.Orange_Sweet_Potato !== null && resultJson.Orange_Sweet_Potato !== undefined) reply += \`🍠 มันส้ม: \${resultJson.Orange_Sweet_Potato.toLocaleString()} kg\\n\`;
                    reply += \`──────────────────\\n\`;
                    reply += \`🌐 เช็กบนเว็บ: https://pscdb.onrender.com\\n📱 แจ้งเตือนเข้ากลุ่ม LINE เรียบร้อย\`;

                    sendMessage(chatId, reply);

                    const lineNotifier = require('./line_notifier.js');
                    let lineMsg = \`\\n📦 แจ้งเตือน: มีการอัปเดตสต็อกสินค้า\\n\` + reply.replace(/<[^>]*>?/gm, '').replace('📱 แจ้งเตือนเข้ากลุ่ม LINE เรียบร้อย', '');
                    lineNotifier.sendLineMessage(lineMsg).catch(e => console.error(e));

                } catch(e) {
                    sendMessage(chatId, '❌ [AI Error]: ' + e.message);
                }
            });
        });
        req.on('error', (e) => sendMessage(chatId, '❌ [Network Error]: ' + e.message));
        req.write(postData);
        req.end();
        return;
    }

    const isReportPattern = !hasNegation`;

    const target = "    const isReportPattern = !hasNegation";
    
    if (content.includes("const isStockPattern = !hasNegation")) {
        console.log("Already patched.");
        return;
    }
    
    content = content.replace(target, injectionCode);
    fs.writeFileSync(filePath, content, 'utf8');
}

processJs('E:/agy/bot.js');
console.log('bot.js updated with stock pattern.');
