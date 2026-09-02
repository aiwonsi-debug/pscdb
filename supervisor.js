const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

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
    teamDash: { cmd: process.execPath, args: ['C:\\Users\\624\\team-dashboard\\server.js'], name: 'PSCDB Team Dashboard', child: null, restarting: false },
    daemon: { cmd: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'Secretary-Daemon.ps1')], name: 'Secretary Daemon', child: null, restarting: false }
};

function launchProcess(key) {
    const item = processes[key];
    if (item.child && !item.child.killed && item.child.exitCode === null) {
        return; // Already running
    }
    
    item.restarting = false;
    log(`[Supervisor] Spawning ${item.name}...`);
    
    const child = spawn(item.cmd, item.args, {
        cwd: key === 'teamDash' ? 'C:\\Users\\624\\team-dashboard' : __dirname,
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
launchProcess('teamDash');
launchProcess('daemon');

// Watchdog 1: Fast Dead Check (Checks every 10 seconds if process crashed)
setInterval(() => {
    Object.keys(processes).forEach(key => {
        const item = processes[key];
        if (!item.child && !item.restarting) {
            log(`[Watchdog] ${item.name} is down. Triggering launch...`);
            launchProcess(key);
        }
    });
}, 10000);

// Watchdog 2: Deep Health Probe (Checks every 15 minutes by probing localhost:8080)
function performDeepHealthCheck() {
    log('[HealthProbe] Running scheduled 15-minute deep health check for Telegram Bot & Webhook...');
    
    const req = http.get('http://127.0.0.1:8080/api/health', { timeout: 8000 }, (res) => {
        if (res.statusCode === 200) {
            log('🟢 [HealthProbe] Bot & Webhook are healthy and responsive (Status: 200 OK).');
        } else {
            log(`⚠️ [HealthProbe] Bot returned unexpected HTTP ${res.statusCode}. Restarting bot...`);
            restartBotProcess();
        }
    });

    req.on('timeout', () => {
        req.destroy();
        log('🔴 [HealthProbe] Bot health check timed out (Frozen/Stuck). Force-restarting bot...');
        restartBotProcess();
    });

    req.on('error', (err) => {
        log(`🔴 [HealthProbe] Bot health check connection failed (${err.message}). Force-restarting bot...`);
        restartBotProcess();
    });
}

function restartBotProcess() {
    const item = processes.bot;
    if (item.child) {
        try {
            item.child.kill('SIGKILL');
        } catch (e) {}
    }
    item.child = null;
    launchProcess('bot');
}

// Run 15-minute Health Check
setInterval(performDeepHealthCheck, 15 * 60 * 1000);

log('[Supervisor] 24/7 Watchdog, PSCDB Dashboard, and Deep Health Probe initialized.');
