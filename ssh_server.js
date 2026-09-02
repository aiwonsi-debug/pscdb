const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('ssh2');
const { spawn } = require('child_process');

const hostKeyFile = path.join(__dirname, 'ssh_host_key.pem');
if (fs.existsSync(hostKeyFile)) {
    fs.unlinkSync(hostKeyFile);
}

console.log('[SSH Server] Generating RSA host key in PKCS1 format...');
const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});
fs.writeFileSync(hostKeyFile, privateKey, 'utf8');

const hostKey = fs.readFileSync(hostKeyFile);

// Config
const SSH_PORT = 22;
const SSH_PORT_ALT = 2222;
const VALID_USER = '624';

function createSshServer(port) {
    const server = new Server({
        hostKeys: [hostKey]
    }, (client) => {
        let authUser = '';
        console.log(`[SSH] Connection from ${client._sock ? client._sock.remoteAddress : 'unknown'}`);

        client.on('authentication', (ctx) => {
            authUser = ctx.username;
            // Allow password authentication
            if (ctx.method === 'password') {
                console.log(`[SSH Auth] User '${ctx.username}' login accepted.`);
                return ctx.accept();
            } else if (ctx.method === 'none') {
                return ctx.reject(['password']);
            } else {
                return ctx.accept();
            }
        });

        client.on('ready', () => {
            console.log(`[SSH] Client '${authUser}' session ready.`);

            client.on('session', (accept, reject) => {
                const session = accept();
                let ptyInfo = null;

                session.on('pty', (acceptPty, rejectPty, info) => {
                    ptyInfo = info;
                    acceptPty();
                });

                session.on('window-change', (acceptWin, rejectWin, info) => {
                    ptyInfo = info;
                    if (acceptWin) acceptWin();
                });

                session.on('shell', (acceptShell, rejectShell) => {
                    const stream = acceptShell();

                    stream.write(`\r\n========================================================\r\n`);
                    stream.write(`  PSC AGY Terminal Server (User: ${authUser})\r\n`);
                    stream.write(`  Directory: E:\\รวมงาน\\งาน 25-26\r\n`);
                    stream.write(`========================================================\r\n\r\n`);

                    const env = Object.assign({}, process.env, {
                        PATH: `C:\\Users\\624\\AppData\\Local\\agy\\bin;C:\\Users\\624\\tools\\nodejs;${process.env.PATH}`,
                        TERM: ptyInfo ? ptyInfo.term : 'vt100'
                    });

                    const shell = spawn('powershell.exe', ['-NoLogo'], {
                        cwd: 'E:\\รวมงาน\\งาน 25-26',
                        env: env,
                        windowsHide: true
                    });

                    stream.pipe(shell.stdin);
                    shell.stdout.pipe(stream);
                    shell.stderr.pipe(stream);

                    shell.on('close', (code) => {
                        stream.exit(code || 0);
                        stream.end();
                    });

                    stream.on('close', () => {
                        try { shell.kill(); } catch (e) {}
                    });
                });

                session.on('exec', (acceptExec, rejectExec, info) => {
                    const stream = acceptExec();
                    const cmd = info.command;
                    console.log(`[SSH Exec] Running: ${cmd}`);

                    const env = Object.assign({}, process.env, {
                        PATH: `C:\\Users\\624\\AppData\\Local\\agy\\bin;C:\\Users\\624\\tools\\nodejs;${process.env.PATH}`
                    });

                    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], {
                        cwd: 'E:\\รวมงาน\\งาน 25-26',
                        env: env,
                        windowsHide: true
                    });

                    stream.pipe(proc.stdin);
                    proc.stdout.pipe(stream);
                    proc.stderr.pipe(stream);

                    proc.on('close', (code) => {
                        stream.exit(code || 0);
                        stream.end();
                    });
                });
            });
        });

        client.on('error', (err) => {
            console.error('[SSH Client Error]', err.message);
        });

        client.on('end', () => {
            console.log(`[SSH] Client '${authUser}' disconnected`);
        });
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[SSH Server] Listening on 0.0.0.0:${port} (Ready for connections)`);
    });

    server.on('error', (err) => {
        console.error(`[SSH Server Error on Port ${port}]`, err.message);
    });

    return server;
}

createSshServer(SSH_PORT);
createSshServer(SSH_PORT_ALT);
