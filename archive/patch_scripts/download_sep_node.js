const fs = require('fs');
const tls = require('tls');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync('E:\\agy\\gmail_config.json', 'utf8'));
const email = cfg.EmailAddress;
const pass = cfg.AppPassword.replace(/\s+/g, '');
const targetDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\Sep';

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const socket = tls.connect({ host: 'imap.gmail.com', port: 993, rejectUnauthorized: false }, () => {
    console.log('Connected to IMAP!');
});

let tagIdx = 0;
let buffer = Buffer.alloc(0);
let currentCallback = null;

socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    if (currentCallback) {
        currentCallback();
    }
});

function sendCmd(cmd) {
    return new Promise((resolve) => {
        tagIdx++;
        const tag = 'A' + String(tagIdx).padStart(4, '0');
        const fullCmd = tag + ' ' + cmd + '\r\n';
        socket.write(fullCmd);

        currentCallback = () => {
            const str = buffer.toString('latin1');
            if (str.includes(tag + ' OK') || str.includes(tag + ' NO') || str.includes(tag + ' BAD')) {
                currentCallback = null;
                const res = buffer;
                buffer = Buffer.alloc(0);
                resolve(res);
            }
        };
    });
}

async function run() {
    await new Promise(r => setTimeout(r, 1000));
    buffer = Buffer.alloc(0);

    console.log('Logging in...');
    await sendCmd('LOGIN ' + email + ' ' + pass);
    console.log('Selecting INBOX...');
    await sendCmd('SELECT INBOX');

    console.log('Searching recent messages...');
    const searchRes = (await sendCmd('SEARCH SINCE 20-Aug-2026')).toString('latin1');
    const match = searchRes.match(/\* SEARCH ([\d ]+)/);
    if (!match) {
        console.log('No messages found');
        socket.end();
        return;
    }

    const mids = match[1].trim().split(/\s+/).map(Number);
    console.log('Found ' + mids.length + ' messages. Fetching attachments...');

    for (const mid of mids) {
        const fetchRes = (await sendCmd('FETCH ' + mid + ' BODY.PEEK[]')).toString('latin1');
        if (fetchRes.includes('Yamamori') || fetchRes.includes('6908-') || fetchRes.includes('6909-') || fetchRes.includes('2357') || fetchRes.includes('2358')) {
            const boundaryMatch = fetchRes.match(/boundary="?([^"\r\n;]+)"?/i);
            if (boundaryMatch) {
                const boundary = boundaryMatch[1].trim();
                const parts = fetchRes.split('--' + boundary);
                for (const p of parts) {
                    const fnMatch = p.match(/filename="?([^"\r\n;]+)"?/i);
                    if (fnMatch) {
                        let filename = fnMatch[1].trim().replace(/^"|"$/g, '');
                        if (filename.includes('=?utf-8?B?')) {
                            const b64Part = filename.match(/=\?utf-8\?B\?([^?]+)\?=/)[1];
                            filename = Buffer.from(b64Part, 'base64').toString('utf8');
                        }
                        if (filename.endsWith('.pdf') && /^\d+/.test(filename)) {
                            const bodyIdx = p.indexOf('\r\n\r\n');
                            if (bodyIdx >= 0) {
                                const b64 = p.substring(bodyIdx + 4).replace(/[\r\n\s]+/g, '');
                                const fileBuf = Buffer.from(b64, 'base64');
                                if (fileBuf.length > 1000) {
                                    const outPath = path.join(targetDir, filename);
                                    fs.writeFileSync(outPath, fileBuf);
                                    console.log('>>> [SAVED] ' + filename + ' -> Sep/ (' + fileBuf.length + ' bytes)');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    console.log('Done!');
    socket.end();
}

run().catch(console.error);
