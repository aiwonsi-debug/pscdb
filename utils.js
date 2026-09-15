const fs = require('fs');
const path = require('path');

// Factory: pass in the paths that were previously module-level consts in bot.js
function createUtils({ logFile, backupDir }) {

    function formatDMY(date = new Date()) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const sec = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${min}:${sec}`;
    }

    function writeLog(msg) {
        const timestamp = formatDMY();
        const line = `[${timestamp}] ${msg}`;
        try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) {}
        try { console.log(line); } catch (e) {}
    }

    // Check if current time is within 07:00 - 19:00 (Asia/Bangkok)
    function isWithinWorkingHours() {
        const bkkStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
        const bkk = new Date(bkkStr);
        const totalMin = bkk.getHours() * 60 + bkk.getMinutes();
        return totalMin >= (7 * 60) && totalMin <= (19 * 60); // 07:00 (420) to 19:00 (1140)
    }

    function rotateLogIfNeeded(targetLogPath, maxSizeBytes = 5 * 1024 * 1024) {
        try {
            if (fs.existsSync(targetLogPath)) {
                const stats = fs.statSync(targetLogPath);
                if (stats.size >= maxSizeBytes) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const rotatedPath = `${targetLogPath}.${timestamp}.old`;
                    fs.renameSync(targetLogPath, rotatedPath);

                    const dir = path.dirname(targetLogPath);
                    const base = path.basename(targetLogPath);
                    const oldLogs = fs.readdirSync(dir)
                        .filter(f => f.startsWith(base) && f.endsWith('.old'))
                        .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
                        .sort((a, b) => b.time - a.time);

                    if (oldLogs.length > 5) {
                        oldLogs.slice(5).forEach(f => {
                            try { fs.unlinkSync(path.join(dir, f.name)); } catch (e) {}
                        });
                    }
                }
            }
        } catch (e) {}
    }

    function backupStockSnapshot(stockObj) {
        try {
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const todayStr = new Date().toISOString().slice(0, 10);
            const dailyBackupFile = path.join(backupDir, `stock_inventory_${todayStr}.json`);

            const tmpDaily = `${dailyBackupFile}.${process.pid}.${Date.now()}.tmp`;
            fs.writeFileSync(tmpDaily, JSON.stringify(stockObj, null, 2), 'utf8');
            fs.renameSync(tmpDaily, dailyBackupFile);

            const backups = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('stock_inventory_') && f.endsWith('.json'))
                .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);

            if (backups.length > 30) {
                backups.slice(30).forEach(f => {
                    try { fs.unlinkSync(path.join(backupDir, f.name)); } catch (e) {}
                });
            }
        } catch (e) {
            console.error('[Backup Error]:', e.message);
        }
    }

    function getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            case '.xls': return 'application/vnd.ms-excel';
            case '.pdf': return 'application/pdf';
            case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            case '.doc': return 'application/msword';
            case '.csv': return 'text/csv';
            case '.zip': return 'application/zip';
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            default: return 'application/octet-stream';
        }
    }

    return {
        formatDMY,
        writeLog,
        isWithinWorkingHours,
        rotateLogIfNeeded,
        backupStockSnapshot,
        getMimeType
    };
}

module.exports = { createUtils };
