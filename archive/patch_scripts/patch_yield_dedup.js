const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

const targetOld = `                    if (calcYield && (result.item || '').includes('กะหล่ำ')) {
                        if (!stock.Items.Cabbage) stock.Items.Cabbage = { Name: "กะหล่ำปลี", StockKg: 6075 };
                        if (!stock.Items.Cabbage.Yield) stock.Items.Cabbage.Yield = {};
                        stock.Items.Cabbage.Yield.AFT = calcYield / 100;
                        stockUpdated = true;
                        updatedKeys.push(\`Yield กะหล่ำ AFT = \${calcYield}%\`);
                    }`;

const targetNew = `                    if (calcYield && (result.item || '').includes('กะหล่ำ')) {
                        if (!stock.Items.Cabbage) stock.Items.Cabbage = { Name: "กะหล่ำปลี", StockKg: 6075 };
                        if (!stock.Items.Cabbage.Yield) stock.Items.Cabbage.Yield = {};
                        
                        const prevYield = stock.Items.Cabbage.Yield.AFT || 0.60;
                        const newYield = Number((calcYield / 100).toFixed(4));
                        
                        // Precise Deduplication Check for Yield
                        if (prevYield !== newYield) {
                            stock.Items.Cabbage.Yield.AFT = newYield;
                            stockUpdated = true;
                            updatedKeys.push(\`Yield กะหล่ำ AFT: \${(prevYield * 100).toFixed(1)}% -> \${calcYield}%\`);
                            
                            if (!stock.AuditTrail) stock.AuditTrail = [];
                            stock.AuditTrail.push({
                                Timestamp: new Date().toISOString(),
                                ItemKey: 'Cabbage_Yield_AFT',
                                ItemName: 'Yield กะหล่ำปลี AFT',
                                PreviousKg: prevYield,
                                NewKg: newYield,
                                Source: 'Telegram Sample Test Ingestion',
                                MessageDate: result.date || null
                            });
                        } else {
                            writeLog('[Dedup Notice]: Cabbage Yield value identical (' + calcYield + '%). Skipped redundant write.');
                        }
                    }`;

if (code.includes(targetOld)) {
    code = code.replace(targetOld, targetNew);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully patched Cabbage Yield Deduplication in bot.js');
} else {
    console.log('Target old Yield block not found directly');
}
