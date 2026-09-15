// Only channel supported here is LINE.
//
// sendDocument used to attach real files via the old connector. LINE's Messaging API
// has no generic "send arbitrary file" push type (only text/image/video/
// audio), and this bot runs locally on the same machine that produces the
// files — so instead of attaching anything, it just tells the user where
// the file landed on disk. Nothing to serve, nothing to upload.
function createLineApi({ writeLog, lineNotifier }) {

    function sendMessage(chatId, text) {
        if (!text) return Promise.resolve();
        text = text.replace(/<\/?(b|i|strong|em|u|code|pre)[^>]*>/gi, '');

        if (!String(chatId).startsWith('LINE:')) {
            writeLog(`[sendMessage] Skipped - not a LINE chatId: ${chatId}`);
            return Promise.resolve({ ok: false, error: 'not a LINE chatId' });
        }
        const lineTarget = String(chatId).slice(5);
        writeLog(`[Sending LINE to ${lineTarget}]: ${text.substring(0, 60).replace(/\n/g, ' ')}...`);
        return lineNotifier.sendLineMessage(text, lineTarget);
    }

    function sendDocument(chatId, filePath, caption = '') {
        const fileName = require('path').basename(filePath);
        const note = caption
            ? `${caption}\n📂 ไฟล์อยู่ที่เครื่อง: ${filePath}`
            : `📂 สร้างไฟล์แล้ว: ${fileName}\nอยู่ที่: ${filePath}`;
        return sendMessage(chatId, note);
    }

    return { sendMessage, sendDocument };
}

module.exports = { createLineApi };
