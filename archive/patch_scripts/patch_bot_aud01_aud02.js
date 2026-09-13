const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

// 1. Add require at top
if (!code.includes("const { calculateYieldPct, calculateTransitLoss } = require('./psc_core_logic.js');")) {
    code = "const { calculateYieldPct, calculateTransitLoss } = require('./psc_core_logic.js');\n" + code;
}

// 2. Replace manual yield calculation with calculateYieldPct
const oldYieldCalc = `                    // Auto-calculate yield if sample given
                    let calcYield = result.yield_pct;
                    if (!calcYield && result.sample_kg && result.peeled_kg && result.sample_kg > 0) {
                        calcYield = Number(((result.peeled_kg / result.sample_kg) * 100).toFixed(2));
                    }`;

const newYieldCalc = `                    // Auto-calculate yield if sample given using strict production module
                    let calcYield = result.yield_pct;
                    if (!calcYield && result.sample_kg !== null && result.peeled_kg !== null) {
                        try {
                            calcYield = calculateYieldPct(result.sample_kg, result.peeled_kg);
                        } catch (err) {
                            writeLog('[Yield Calc Warning]: ' + err.message);
                        }
                    }`;

if (code.includes(oldYieldCalc)) {
    code = code.replace(oldYieldCalc, newYieldCalc);
    console.log('Successfully replaced yield calc in bot.js');
} else {
    console.log('Old yield calc block not found directly, checking regex...');
    const regex = /\/\/\s*Auto-calculate yield[\s\S]*?calcYield\s*=\s*Number\(\(\(result\.peeled_kg\s*\/\s*result\.sample_kg\)\s*\*\s*100\)\.toFixed\(2\)\);\s*\}/;
    code = code.replace(regex, newYieldCalc);
}

// 3. Atomic File Write for stock_inventory.json
const oldStockWrite = `                    if (stockUpdated) {
                        stock.LastUpdated = new Date().toISOString();
                        if (result.date) stock.AsOfDate = result.date;
                        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
                        try { fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'stock_inventory.json'), JSON.stringify(stock, null, 2), 'utf8'); } catch(e){}
                        syncToRender('/api/stock-update', stock);
                    }`;

const newStockWrite = `                    if (stockUpdated) {
                        stock.LastUpdated = new Date().toISOString();
                        if (result.date) stock.AsOfDate = result.date;
                        
                        // Atomic Write with tmp file and renameSync (AUD-02)
                        const tmpStockPath = \`\${stockPath}.\${process.pid}.\${Date.now()}.tmp\`;
                        fs.writeFileSync(tmpStockPath, JSON.stringify(stock, null, 2), 'utf8');
                        fs.renameSync(tmpStockPath, stockPath);
                        
                        try {
                            const renderStockPath = path.join(agyBaseDir, 'render-dashboard', 'stock_inventory.json');
                            const tmpRenderPath = \`\${renderStockPath}.\${process.pid}.\${Date.now()}.tmp\`;
                            fs.writeFileSync(tmpRenderPath, JSON.stringify(stock, null, 2), 'utf8');
                            fs.renameSync(tmpRenderPath, renderStockPath);
                        } catch(e){}
                        
                        syncToRender('/api/stock-update', stock);
                    }`;

if (code.includes(oldStockWrite)) {
    code = code.replace(oldStockWrite, newStockWrite);
    console.log('Successfully replaced atomic stock write in bot.js');
}

fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
fs.writeFileSync('E:/agy_audit_export/bot.js', code, 'utf8');
console.log('Updated bot.js in both locations.');
