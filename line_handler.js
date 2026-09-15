const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function downloadLineContent(messageId, destPath, token) {
    return new Promise((resolve, reject) => {
        const req = https.get(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close(() => resolve(destPath));
            });
            fileStream.on('error', reject);
        });
        req.on('error', reject);
    });
}

function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// In-memory analysis cache (key: sha256, val: { output, timestamp })
const imageAnalysisCache = new Map();
const MAX_CACHE_SIZE = 100;

// Concurrency queue to ensure only 1 agy CLI vision task runs at a time
class ImageProcessingQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processNext();
        });
    }

    getQueueLength() {
        return this.queue.length;
    }

    async processNext() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        const { task, resolve, reject } = this.queue.shift();
        try {
            const result = await task();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.processing = false;
            this.processNext();
        }
    }
}

const analysisQueue = new ImageProcessingQueue();

function createLineHandler(options = {}) {
    const {
        agyBaseDir = process.env.AGY_BASE_DIR || path.resolve(__dirname),
        agyExe = process.env.AGY_EXE_PATH || path.join(process.env.LOCALAPPDATA || 'C:\\Users\\User\\AppData\\Local', 'agy', 'bin', 'agy.exe'),
        sendMessage = console.log,
        writeLog = console.log,
        checkAuthorization = () => ({ authorized: true })
    } = options;

    function getLineConfig() {
        const secretCfgPath = path.join(agyBaseDir, 'secrets', 'line_config.json');
        const rootCfgPath = path.join(agyBaseDir, 'line_config.json');
        const targetPath = fs.existsSync(secretCfgPath) ? secretCfgPath : rootCfgPath;
        let lineCfg = {};
        if (fs.existsSync(targetPath)) {
            try {
                lineCfg = JSON.parse(fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, ''));
            } catch (e) {}
        }
        return lineCfg;
    }

    async function handleLineImage(chatId, messageId) {
        const auth = checkAuthorization(chatId);
        if (!auth.authorized) {
            sendMessage(chatId, auth.reason || '⛔ Access Denied');
            return;
        }

        const lineCfg = getLineConfig();
        const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || lineCfg.line_channel_access_token || '').trim();
        if (!token) {
            sendMessage(chatId, '❌ ไม่พบคีย์ LINE Channel Access Token');
            return;
        }

        const imagesDir = path.join(agyBaseDir, 'received_images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const localImagePath = path.join(imagesDir, `line_${messageId}.jpg`);

        try {
            await downloadLineContent(messageId, localImagePath, token);
            writeLog(`[LINE Image Downloaded]: saved to ${localImagePath}`);

            // Compute hash for deduplication/caching
            const fileHash = await computeFileHash(localImagePath);
            if (imageAnalysisCache.has(fileHash)) {
                writeLog(`[LINE Image Cache Hit]: hash ${fileHash}`);
                const cachedOutput = imageAnalysisCache.get(fileHash).output;
                sendMessage(chatId, `🔍 <b>[ผลการวิเคราะห์รูปภาพจากเลขา AI (แคช)]</b>\n──────────────────\n${cachedOutput}`);
                return;
            }

            const queuePos = analysisQueue.getQueueLength();
            if (queuePos > 0) {
                sendMessage(chatId, `⏳ [เลขา AI]: ได้รับรูปภาพแล้ว กำลังรอคิววิเคราะห์ภาพ (ลำดับที่ ${queuePos + 1})...`);
            } else {
                sendMessage(chatId, '📸 [เลขา AI]: ได้รับรูปภาพแล้ว กำลังวิเคราะห์ข้อมูล...');
            }

            // Enqueue image analysis to avoid concurrent AI spawns
            const cleanOutput = await analysisQueue.enqueue(() => {
                return new Promise((resolve, reject) => {
                    const visionPrompt = `มีรูปภาพใหม่จากทีมงาน: ${localImagePath}\n` +
                        `ให้ใช้ tool view_file เปิดดูรูปภาพนี้ แล้ววิเคราะห์ว่าเป็นเอกสารอะไร (เช่น ตั๋วชั่งน้ำหนัก, ใบเสร็จ, รายงานราคากะหล่ำ, เอกสารขนส่ง)\n` +
                        `ให้สกัดข้อมูลตัวเลขที่สำคัญ เช่น วันที่, ชื่อสวน/ผู้ส่ง, ชนิดผัก, น้ำหนักสุทธิ (กก.), ค่ารถ (บาท), สถานที่ ออกมาเป็นข้อความสรุปภาษาไทยแบบสั้นกระชับ`;

                    const agyBinDir = path.dirname(agyExe);
                    const systemPath = [
                        agyBinDir,
                        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'agy', 'bin') : '',
                        process.env.PATH
                    ].filter(Boolean).join(';');

                    const child = spawn(agyExe, ['-p', visionPrompt], {
                        cwd: agyBaseDir,
                        windowsHide: true,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        env: Object.assign({}, process.env, {
                            PATH: systemPath
                        })
                    });

                    let stdoutData = '';
                    let stderrData = '';
                    child.stdout.on('data', d => stdoutData += d.toString('utf8'));
                    child.stderr.on('data', d => stderrData += d.toString('utf8'));

                    // Timeout after 90 seconds
                    const timer = setTimeout(() => {
                        try { child.kill(); } catch (e) {}
                        reject(new Error('การวิเคราะห์ภาพหมดเวลา (Timeout 90s)'));
                    }, 90000);

                    child.on('close', code => {
                        clearTimeout(timer);
                        resolve(stdoutData.trim());
                    });
                    child.on('error', err => {
                        clearTimeout(timer);
                        reject(err);
                    });
                });
            });

            if (cleanOutput) {
                // Save to cache
                if (imageAnalysisCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = imageAnalysisCache.keys().next().value;
                    imageAnalysisCache.delete(firstKey);
                }
                imageAnalysisCache.set(fileHash, { output: cleanOutput, timestamp: Date.now() });

                sendMessage(chatId, `🔍 <b>[ผลการวิเคราะห์รูปภาพจากเลขา AI]</b>\n──────────────────\n${cleanOutput}`);
            } else {
                sendMessage(chatId, '⚠️ ไม่สามารถอ่านข้อมูลตัวเลขจากภาพได้ชัดเจน กรุณาส่งภาพที่คมชัดขึ้นหรือพิมพ์เป็นข้อความครับ');
            }
        } catch (err) {
            writeLog('[LINE Image Error]: ' + err.message);
            sendMessage(chatId, `❌ เกิดข้อผิดพลาดในการโหลดหรือวิเคราะห์รูปภาพ: ${err.message}`);
        }
    }

    return { handleLineImage };
}

module.exports = { createLineHandler, downloadLineContent };
