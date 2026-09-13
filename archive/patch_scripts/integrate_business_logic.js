const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

// Replace psc_core_logic require with business_logic
code = code.replace(
    "const { calculateYieldPct, calculateTransitLoss } = require('./psc_core_logic.js');",
    "const { calculateYieldPct, yieldPctToFactor, applyStockUpdate } = require('./business_logic.js');\nconst { calculateTransitLoss } = require('./psc_core_logic.js');"
);

// Replace stock update loop with applyStockUpdate
const oldStockBlockStart = "                    if (result.stock_inventory) {";
const oldStockBlockEnd = "                    if (stockUpdated) {";

const newStockBlock = `                    if (result.stock_inventory) {
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
                        
                        const telegramEventId = \`telegram:\${chatId}:\${upd.message ? upd.message.message_id : Date.now()}\`;
                        
                        Object.keys(keyMap).forEach(k => {
                            if (inv[k] !== null && inv[k] !== undefined) {
                                try {
                                    const updateResult = applyStockUpdate(stock, {
                                        itemKey: k,
                                        newKg: inv[k],
                                        source: 'Telegram Unified Ingestion',
                                        timestamp: new Date().toISOString(),
                                        eventId: \`\${telegramEventId}:\${k}\`
                                    });
                                    
                                    stock = updateResult.data;
                                    if (updateResult.stockChanged) {
                                        stockUpdated = true;
                                        updatedKeys.push(\`\${keyMap[k]} = \${Number(inv[k]).toLocaleString()} kg\`);
                                    } else if (updateResult.reason === 'duplicate_event') {
                                        writeLog(\`[Idempotency Notice]: Event \${telegramEventId}:\${k} already processed. Skipped.\`);
                                    } else if (updateResult.reason === 'same_value') {
                                        writeLog(\`[Dedup Notice]: \${keyMap[k]} value unchanged (\${inv[k]}).\`);
                                    }
                                } catch(err) {
                                    writeLog(\`[Stock Update Error] \${k}: \` + err.message);
                                }
                            }
                        });
                    }

                    `;

const startIdx = code.indexOf(oldStockBlockStart);
const endIdx = code.indexOf(oldStockBlockEnd, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    code = code.substring(0, startIdx) + newStockBlock + code.substring(endIdx);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    fs.writeFileSync('E:/agy_audit_export/bot.js', code, 'utf8');
    console.log('Successfully integrated business_logic.js into bot.js in both locations');
} else {
    console.log('Indices not found for stock block replacement');
}
