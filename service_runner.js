const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const baseDir = __dirname;
const nodeExe = process.execPath;

const services = [
    { name: 'telegram-bot', script: path.join(baseDir, 'bot.js') },
    { name: 'ssh-server', script: path.join(baseDir, 'ssh_server.js') }
];

const pids = {};

services.forEach(svc => {
    try {
        const child = spawn(nodeExe, [svc.script], {
            cwd: baseDir,
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        });
        child.unref();
        pids[svc.name] = child.pid;
        console.log(`[ServiceRunner] Started ${svc.name} (PID: ${child.pid})`);
    } catch (e) {
        console.error(`[ServiceRunner] Failed to start ${svc.name}:`, e.message);
    }
});

fs.writeFileSync(path.join(baseDir, 'running_services.json'), JSON.stringify({ started_at: new Date().toISOString(), pids: pids }, null, 2), 'utf8');
