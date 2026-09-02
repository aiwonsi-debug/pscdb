const https = require('https');
const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\624\\tools';
const targetFile = path.join(targetDir, 'cloudflared.exe');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

console.log('Downloading cloudflared-windows-amd64.exe from GitHub...');

function download(url, dest, cb) {
    https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
            console.log('Redirecting to:', res.headers.location);
            return download(res.headers.location, dest, cb);
        }
        if (res.statusCode !== 200) {
            return cb(new Error(`Download failed with status code ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                console.log(`Downloaded cloudflared.exe to ${dest} (${fs.statSync(dest).size} bytes)`);
                cb(null);
            });
        });
    }).on('error', cb);
}

const downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

download(downloadUrl, targetFile, (err) => {
    if (err) {
        console.error('Error downloading:', err.message);
        process.exit(1);
    } else {
        console.log('Download complete!');
    }
});
