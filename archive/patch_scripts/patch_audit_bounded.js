const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

const targetOld = `                        // Keep AuditTrail bounded to last 50 entries
                        if (stock.AuditTrail.length > 50) {
                            stock.AuditTrail = stock.AuditTrail.slice(-50);
                        }
                    }

                    if (stockUpdated) {`;

const targetNew = `                    }

                    // Keep AuditTrail bounded to last 50 entries across all ingestion pathways (Yield & Stock)
                    if (stock.AuditTrail && stock.AuditTrail.length > 50) {
                        stock.AuditTrail = stock.AuditTrail.slice(-50);
                    }

                    if (stockUpdated) {`;

if (code.includes(targetOld)) {
    code = code.replace(targetOld, targetNew);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully moved AuditTrail bounded check outside in bot.js');
} else {
    console.log('Target block not matched directly');
}
