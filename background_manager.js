const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const baseDir = __dirname;
const nodeExe = process.execPath;

const services = [
    { name: 'telegram-bot', script: path.join(baseDir, 'bot.js') },
    { name: 'ssh-server', script: path.join(baseDir, 'ssh_server.js') },
    { name: 'cloudflare-tunnel', script: path.join(baseDir, 'start_tunnel.js') }
];

const children = {};

function startChild(svc) {
    console.log(`[Manager] Launching ${svc.name}...`);
    const child = spawn(nodeExe, [svc.script], {
        cwd: baseDir,
        windowsHide: true,
        stdio: 'inherit'
    });

    children[svc.name] = child;

    child.on('exit', (code, signal) => {
        console.log(`[Manager] ${svc.name} exited (code: ${code}, signal: ${signal}). Restarting in 3s...`);
        setTimeout(() => startChild(svc), 3000);
    });

    child.on('error', (err) => {
        console.error(`[Manager] ${svc.name} error:`, err.message);
    });
}

services.forEach(startChild);

process.on('SIGINT', () => {
    Object.values(children).forEach(c => c.kill());
    process.exit();
});

process.on('SIGTERM', () => {
    Object.values(children).forEach(c => c.kill());
    process.exit();
});
