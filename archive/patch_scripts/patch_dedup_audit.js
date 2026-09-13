const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

// Target block
const targetOld = `                    if (result.stock_inventory) {
                        const inv = result.stock_inventory;
                        const keyMap = {
                            Cabbage: 'กะหล่ำปลี',
                            Onion_AFT: 'หอม AFT',
                            Onion_Chinese: 'หอมจีน',
                            Carrot: 'แครอท',
                            Purple_Sweet_Potato: 'มันม่วง',
                            Yellow_Sweet_Potato: 'มันเหลืองไข่',
                            Orange_Sweet_Potato: 'มันส้ม'
                        };
                        Object.keys(keyMap).forEach(k => {
                            if (inv[k] !== null && inv[k] !== undefined) {
                                if (!stock.Items[k]) stock.Items[k] = { Name: keyMap[k], StockKg: 0 };
                                stock.Items[k].StockKg = inv[k];
                                stockUpdated = true;
                                updatedKeys.push(\`\${keyMap[k]} = \${inv[k].toLocaleString()} kg\`);
                            }
                        });
                    }

                    if (stockUpdated) {
                        stock.LastUpdated = new Date().toISOString();
                        if (result.date) stock.AsOfDate = result.date;
                        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
                        try { fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'stock_inventory.json'), JSON.stringify(stock, null, 2), 'utf8'); } catch(e){}
                        syncToRender('/api/stock-update', stock);
                    }`;

const targetNew = `                    if (result.stock_inventory) {
                        const inv = result.stock_inventory;
                        const keyMap = {
                            Cabbage: 'กะหล่ำปลี',
                            Onion_AFT: 'หอม AFT',
                            Onion_Chinese: 'หอมจีน',
                            Carrot: 'แครอท',
                            Purple_Sweet_Potato: 'มันม่วง',
                            Yellow_Sweet_Potato: 'มันเหลืองไข่',
                            Orange_Sweet_Potato: 'มันส้ม'
                        };
                        if (!stock.AuditTrail) stock.AuditTrail = [];
                        
                        Object.keys(keyMap).forEach(k => {
                            if (inv[k] !== null && inv[k] !== undefined) {
                                if (!stock.Items[k]) stock.Items[k] = { Name: keyMap[k], StockKg: 0 };
                                const prevVal = stock.Items[k].StockKg;
                                const newVal = inv[k];
                                
                                // Precise Deduplication Check: Only update if value actually changed
                                if (prevVal !== newVal) {
                                    stock.Items[k].StockKg = newVal;
                                    stockUpdated = true;
                                    updatedKeys.push(\`\${keyMap[k]}: \${prevVal ? prevVal.toLocaleString() : 0} -> \${newVal.toLocaleString()} kg\`);
                                    
                                    // Audit Trail Logging
                                    stock.AuditTrail.push({
                                        Timestamp: new Date().toISOString(),
                                        ItemKey: k,
                                        ItemName: keyMap[k],
                                        PreviousKg: prevVal,
                                        NewKg: newVal,
                                        Source: 'Telegram Unified Ingestion',
                                        MessageDate: result.date || null
                                    });
                                }
                            }
                        });
                        
                        // Keep AuditTrail bounded to last 50 entries
                        if (stock.AuditTrail.length > 50) {
                            stock.AuditTrail = stock.AuditTrail.slice(-50);
                        }
                    }

                    if (stockUpdated) {
                        stock.LastUpdated = new Date().toISOString();
                        if (result.date) stock.AsOfDate = result.date;
                        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
                        try { fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'stock_inventory.json'), JSON.stringify(stock, null, 2), 'utf8'); } catch(e){}
                        syncToRender('/api/stock-update', stock);
                    } else if (result.stock_inventory) {
                        writeLog('[Dedup Notice]: Stock values identical to existing database. Skipped redundant write and Render sync.');
                    }`;

if (code.includes(targetOld)) {
    code = code.replace(targetOld, targetNew);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully patched bot.js with Deduplication & Audit Trail logic');
} else {
    console.log('Target block not matched directly, checking index...');
    const startIdx = code.indexOf('if (result.stock_inventory) {');
    const endIdx = code.indexOf('// 2. Process Operations / Intake / Loading Report', startIdx);
    if (startIdx !== -1 && endIdx !== -1) {
        code = code.substring(0, startIdx) + targetNew + '\n\n                    ' + code.substring(endIdx);
        fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
        console.log('Successfully patched bot.js via index range');
    } else {
        console.log('Indices not found in bot.js');
    }
}
