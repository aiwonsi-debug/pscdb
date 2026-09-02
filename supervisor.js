const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, 'supervisor.log');
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

function log(msg) {
    const time = formatDMY();
    const line = `[${time}] ${msg}`;
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) {}
}

const processes = {
    bot: { cmd: process.execPath, args: [path.join(__dirname, 'bot.js')], name: 'Telegram Secretary Bot', child: null, restarting: false },
    ssh: { cmd: process.execPath, args: [path.join(__dirname, 'ssh_server.js')], name: 'SSH Server', child: null, restarting: false },
    daemon: { cmd: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'Secretary-Daemon.ps1')], name: 'Secretary Daemon', child: null, restarting: false }
};

function launchProcess(key) {
    const item = processes[key];
    if (item.child && !item.child.killed && item.child.exitCode === null) {
        return; // Already running, do not duplicate
    }
    
    item.restarting = false;
    log(`[Supervisor] Spawning ${item.name}...`);
    
    const child = spawn(item.cmd, item.args, {
        cwd: __dirname,
        stdio: 'ignore',
        windowsHide: true
    });

    item.child = child;

    child.on('exit', (code, signal) => {
        log(`[Supervisor] ${item.name} exited with code ${code} / signal ${signal}.`);
        item.child = null;
        if (!item.restarting) {
            item.restarting = true;
            setTimeout(() => launchProcess(key), 3000);
        }
    });

    child.on('error', (err) => {
        log(`[Supervisor] ${item.name} spawn error: ${err.message}`);
        item.child = null;
        if (!item.restarting) {
            item.restarting = true;
            setTimeout(() => launchProcess(key), 3000);
        }
    });
}

// Start all services once
launchProcess('bot');
launchProcess('ssh');
launchProcess('daemon');

// Heartbeat watchdog to keep Node.js event loop alive 24/7 (checks only if dead)
setInterval(() => {
    Object.keys(processes).forEach(key => {
        const item = processes[key];
        if (!item.child && !item.restarting) {
            log(`[Watchdog] ${item.name} is down. Triggering launch...`);
            launchProcess(key);
        }
    });
}, 10000);

log('[Supervisor] Watchdog heartbeat initialized and active.');
